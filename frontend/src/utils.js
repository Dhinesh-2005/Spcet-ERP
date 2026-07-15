import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, PageNumber } from "docx";
import { saveAs } from "file-saver";

export const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://localhost:8000");

export function normalizeRowKeys(row) {
  const out = {};
  for (let key in row) {
    let val = row[key];
    const lowerKey = key.toLowerCase().trim().replace(/[^a-z0-9]/g, ""); 
    if (lowerKey.includes("roll") || lowerKey.includes("reg") || lowerKey === "id") {
      val = typeof val === "number" ? String(Math.trunc(val)) : String(val).trim();
      out["registerNumber"] = val; 
      continue;
    }
    out[lowerKey] = val ?? "";
  }
  return out;
}

export function readFirstSheet(file, onJSON) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "dd-mm-yyyy" });
    onJSON(Array.isArray(json) ? json : []);
  };
  reader.readAsArrayBuffer(file);
}

export function mergeResults(rows) {
  const map = {};
  rows.forEach((r) => {
    const key = `${r.registerNumber}-${r.subjectCode || r.subject}`;
    map[key] = map[key] ? { ...map[key], grade: r.grade || map[key].grade, result: r.result || map[key].result } : r;
  });
  return Object.values(map);
}

// --- NEW: OFFICIAL CLAIM FORM EXPORTER ---
export const exportClaimFormDocx = async (claim) => {
  try {
    const createRow = (label, value) => new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ text: label, bold: true })], width: { size: 40, type: WidthType.PERCENTAGE }, shading: { fill: "f3f4f6" } }),
        new TableCell({ children: [new Paragraph({ text: value || "-" })], width: { size: 60, type: WidthType.PERCENTAGE } })
    ]});

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: "CLAIM FORM FOR QUESTION PAPER SETTING", bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: "End Semester Examinations (UG/PG)", size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
          
          new Paragraph({ children: [new TextRun({ text: "Faculty & Assignment Details", bold: true, size: 24 })], spacing: { after: 100 } }),
          new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                  createRow("Appointment Letter No.", claim.appointmentLetterNo),
                  createRow("Name of the QP Setter", claim.facultyName),
                  createRow("Designation", claim.designation),
                  createRow("College Name & Code", claim.collegeNameCode),
                  createRow("QP Department", claim.qpDept),
                  createRow("Department of Examiner", claim.examinerDept),
                  createRow("Mobile Number", claim.mobile),
                  createRow("Email ID", claim.email),
                  createRow("Subject Code & Name", `${claim.subjectCode} - ${claim.subjectName || ""}`),
                  createRow("Semester & Regulation", claim.semesterAndReg),
                  createRow("AICTE / Anna Univ ID", claim.aicteId),
                  createRow("PAN", claim.pan),
                  createRow("Official Address", claim.address),
              ]
          }),
          
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: "Remuneration Details", bold: true, size: 24 })], spacing: { after: 100 } }),
          new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                  createRow("Question Paper Type", claim.qpType),
                  createRow("Amount Claimed (Manual)", "Rs. " + (claim.amountClaimed || "0")),
                  createRow("Total Calculated Amount", "Rs. " + (claim.totalAmount || "0")),
                  createRow("Mailed to COE Confirmation", claim.mailedConfirmation ? "YES" : "NO"),
              ]
          }),
          
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: "Bank Details", bold: true, size: 24 })], spacing: { after: 100 } }),
          new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                  createRow("Bank Account No (Savings)", claim.accountNo),
                  createRow("Bank Name", claim.bankName),
                  createRow("Branch Name", claim.branchName),
                  createRow("IFSC Code", claim.ifsc),
              ]
          }),
        ],
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `ClaimForm_${(claim.facultyName || "Faculty").replace(/\s+/g, '_')}.docx`);
  } catch (err) {
    alert("Error exporting Claim Form: " + err.message);
  }
};

export const exportSemesterPaperDocx = async (config, templateType) => {
  const { header, partA, partB, partC, customContent } = config;
  try {
    if (!header) { alert("⚠️ This document is corrupted. Please delete it."); return; }

    const noBorders = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } };
    const createCell = (text, width = 10, bold = false, align = AlignmentType.CENTER) => new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: (text || "").toString(), bold })], alignment: align, spacing: { before: 150, after: 150 } })] });
    const createLeftCell = (text, width = 70, bold = false) => new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: (text || "").toString(), bold })], spacing: { before: 150, after: 150 } })] });
    const regBoxCells = Array.from({ length: 12 }).map(() => new TableCell({ width: { size: 3, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: "", spacing: { before: 150, after: 150 } })] }));
    
    const childrenNodes = [
      new Table({ width: { size: 60, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT, rows: [new TableRow({ children: [new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Register Number  ", bold: true })], alignment: AlignmentType.RIGHT, spacing: { before: 150, after: 150 } })], borders: noBorders }), ...regBoxCells] })] }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "Question Paper Code: __________________", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "St. Peter’s College of Engineering and Technology", bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "(An Autonomous Institution)", size: 24 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.examSession || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.semesters || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.department || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.subject || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.regulations || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "Common to CSE & IT", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ text: "(Any requirements like Graphs, Charts, Tables, Data books, etc.) if applicable", alignment: AlignmentType.CENTER }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Duration: Three Hours", bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Maximum Marks: 100", bold: true })], alignment: AlignmentType.RIGHT })] })] })] }),
      new Paragraph({ children: [new TextRun({ text: "Answer ALL Questions", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }),
    ];

    if (templateType === 3) {
       const lines = (customContent || "No content provided.").split("\n");
       lines.forEach(line => { childrenNodes.push(new Paragraph({ text: line, spacing: { before: 100, after: 100 } })); });
    } else {
      const partARows = (partA || []).map(q => new TableRow({ children: [createCell(q.qNo + ".", 10, false, AlignmentType.LEFT), createLeftCell(q.question, 70, false), createCell(q.btl, 10, false, AlignmentType.CENTER), createCell(q.co, 10, false, AlignmentType.CENTER)] }));
      const createOrRow = () => new TableRow({ children: [new TableCell({ columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: "(Or)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })] })] });
      const partBRows = (partB || []).flatMap(q => [new TableRow({ children: [createCell(q.qNo + ".", 10, false, AlignmentType.LEFT), createLeftCell(`(a) ${q.a?.question || ""}`, 50, false), createCell(`(${q.a?.marks || ""})`, 10, false, AlignmentType.CENTER), createCell(q.a?.btl || "", 10, false, AlignmentType.CENTER), createCell(q.a?.co || "", 10, false, AlignmentType.CENTER)] }), createOrRow(), new TableRow({ children: [createCell("", 10), createLeftCell(`(b) ${q.b?.question || ""}`, 50, false), createCell(`(${q.b?.marks || ""})`, 10, false, AlignmentType.CENTER), createCell(q.b?.btl || "", 10, false, AlignmentType.CENTER), createCell(q.b?.co || "", 10, false, AlignmentType.CENTER)] })]);

      childrenNodes.push(
        new Paragraph({ children: [new TextRun({ text: "Part A – (10 X 2 = 20 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 10, true, AlignmentType.LEFT), createCell("Question", 70, true, AlignmentType.CENTER), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partARows] }),
        new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `PART B (5 × ${templateType === 1 ? "13 = 65" : "16 = 80"} Marks)`, bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 8, true, AlignmentType.LEFT), createCell("Answer All Questions", 62, true, AlignmentType.CENTER), createCell("Marks", 10, true), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partBRows] })
      );

      if (templateType === 1 && partC) {
        const partCRows = [new TableRow({ children: [createCell(partC.qNo + ".", 10, false, AlignmentType.LEFT), createLeftCell(`(a) ${partC.a?.question || ""}`, 50, false), createCell(`(${partC.a?.marks || ""})`, 10, false, AlignmentType.CENTER), createCell(partC.a?.btl || "", 10, false, AlignmentType.CENTER), createCell(partC.a?.co || "", 10, false, AlignmentType.CENTER)] }), createOrRow(), new TableRow({ children: [createCell("", 10), createLeftCell(`(b) ${partC.b?.question || ""}`, 50, false), createCell(`(${partC.b?.marks || ""})`, 10, false, AlignmentType.CENTER), createCell(partC.b?.btl || "", 10, false, AlignmentType.CENTER), createCell(partC.b?.co || "", 10, false, AlignmentType.CENTER)] })];
        childrenNodes.push(
          new Paragraph({ children: [new TextRun({ text: "PART C (1 × 15 = 15 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 8, true, AlignmentType.LEFT), createCell("Question", 62, true, AlignmentType.CENTER), createCell("Marks", 10, true), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partCRows] })
        );
      }
    }

    childrenNodes.push(
      new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: "Note:", bold: true })] }),
      new Paragraph({ text: "#\tA maximum of two questions can have two subdivisions.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\tQuestions from same unit and same blooms taxonomy Knowledge level to be maintained in either / or questions with same mark weightage even if the questions have sub divisions.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\tCompulsory Question can be derived from any of the Unit.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\t{Maximum two sub divisions in (Part B & Part C) question if necessary.}", spacing: { before: 100 } }),
      new Paragraph({ text: "" }),
      new Paragraph({ children: [new TextRun({ text: "*****", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400 } })
    );

    const doc = new Document({
      sections: [{
        properties: {},
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Knowledge Level: K1 – Remember; K2 – Understand; K3 – Apply; K4 – Analyze; K5 – Evaluate; K6 – Create", size: 16, color: "555555" })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Page ", size: 16, color: "555555", bold: true }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "555555", bold: true }), new TextRun({ text: " of ", size: 16, color: "555555", bold: true }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "555555", bold: true })] })] }) },
        children: childrenNodes,
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${(header.subject || "Paper").substring(0,6)}_SemesterPaper.docx`);
  } catch(err) { alert("❌ Error creating document: " + err.message); }
};

export const exportUnitTestPaperDocx = async (config) => {
  try {
    const { unitHeader, unitPartA, unitPartB, unitPartC, coDistribution } = config;
    if (!unitHeader) { alert("⚠️ This document is corrupted or from an older version. Please delete it."); return; }

    const marksArray = (coDistribution && coDistribution.marks && coDistribution.marks.length > 0) ? coDistribution.marks : ['-','63','-','-','-','-'];
    const percArray = (coDistribution && (coDistribution.perc || coDistribution.percentage) && (coDistribution.perc || coDistribution.percentage).length > 0) ? (coDistribution.perc || coDistribution.percentage) : ['-','100','-','-','-','-'];

    const standardBorders = { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } };
    const createCell = (text, width = 10, bold = false, align = AlignmentType.CENTER) => new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: (text || "").toString(), bold })], alignment: align, spacing: { before: 150, after: 150 } })] });
    const regBoxCells = Array.from({ length: 12 }).map(() => new TableCell({ width: { size: 3, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: "", spacing: { before: 150, after: 150 } })] }));
    
    const partARows = (unitPartA || []).map(q => new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 75, false, AlignmentType.LEFT), createCell(q.kLevel, 10), createCell(q.co, 10)] }));
    const partBRows = (unitPartB || []).map(q => new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 67, false, AlignmentType.LEFT), createCell(q.marks, 8), createCell(q.kLevel, 10), createCell(q.co, 10)] }));
    const partCRows = (unitPartC || []).map(q => new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 67, false, AlignmentType.LEFT), createCell(q.marks, 8), createCell(q.kLevel, 10), createCell(q.co, 10)] }));

    const doc = new Document({
      sections: [{
        properties: {},
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Knowledge Level: K1 – Remember; K2 – Understand; K3 – Apply; K4 – Analyze; K5 – Evaluate; K6 – Create", size: 16, color: "555555" })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Page ", size: 16, color: "555555" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "555555" }), new TextRun({ text: " of ", size: 16, color: "555555" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "555555" })] })] }) },
        children: [
          new Table({ width: { size: 50, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT, rows: [new TableRow({ children: [new TableCell({ width: { size: 64, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Reg. No.  ", bold: true })], alignment: AlignmentType.RIGHT, spacing: { before: 150, after: 150 } })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }), ...regBoxCells] })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Question Paper Code: __________________", bold: true })], alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "ST. PETER’S COLLEGE OF ENGINEERING AND TECHNOLOGY", bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: "AVADI, CHENNAI 600 054", bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: unitHeader.examSession || "", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: unitHeader.semesterWord || "" })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: unitHeader.department || "", bold: true })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: unitHeader.subject || "", bold: true })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: unitHeader.regulations || "", bold: true })], alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "", spacing: { after: 100 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Duration: " + (unitHeader.duration || ""), bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Max. Marks " + (unitHeader.maxMarks || ""), bold: true })], alignment: AlignmentType.RIGHT })] })] })] }),
          new Paragraph({ children: [new TextRun({ text: "Answer ALL Questions", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: standardBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART-A (5 x 2 = 10 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("K-Level", 10, true), createCell("CO", 10, true)] }), ...partARows]}),
          new Paragraph({ text: "", spacing: { after: 150 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: standardBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART - B (2 x 13 = 26 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("Marks", 8, true), createCell("K-Level", 10, true), createCell("CO", 10, true)] }), ...partBRows]}),
          new Paragraph({ text: "", spacing: { after: 150 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: standardBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART - C (1 x 14 = 14 marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("Marks", 8, true), createCell("K-Level", 10, true), createCell("CO", 10, true)] }), ...partCRows]}),
          new Paragraph({ text: "", spacing: { after: 150 } }),
          new Table({ 
            width: { size: 100, type: WidthType.PERCENTAGE }, 
            borders: standardBorders, 
            rows: [
              new TableRow({ children: [new TableCell({ columnSpan: 7, children: [new Paragraph({ children: [new TextRun({ text: "Distribution of COs (Percentage wise)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] })] }),
              new TableRow({ children: [createCell("Evaluation", 16, true), createCell("CO1", 14, true), createCell("CO2", 14, true), createCell("CO3", 14, true), createCell("CO4", 14, true), createCell("CO5", 14, true), createCell("CO6", 14, true)] }),
              new TableRow({ children: [createCell("Marks", 16, true), createCell(marksArray[0], 14), createCell(marksArray[1], 14), createCell(marksArray[2], 14), createCell(marksArray[3], 14), createCell(marksArray[4], 14), createCell(marksArray[5], 14)] }),
              new TableRow({ children: [createCell("%", 16, true), createCell(percArray[0], 14), createCell(percArray[1], 14), createCell(percArray[2], 14), createCell(percArray[3], 14), createCell(percArray[4], 14), createCell(percArray[5], 14)] })
            ]
          })
        ],
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${(unitHeader.subject || "UnitTest").substring(0,6)}_UnitTest.docx`);
  } catch(err) { alert("❌ Error creating Unit Test document: " + err.message); }
};

// --- NEW: HALL TICKET DOCX EXPORTER ---
export const exportHallTicketsDocx = async (tickets, settings, deptCode) => {
  try {
    const sections = tickets.map((ticket, index) => {
      
      const allSubjects = [
          ...ticket.currentSubjects.map(sub => ({ sem: settings.sem, code: sub.subjectCode, title: sub.subjectName })),
          ...ticket.arrears.map(arr => ({ sem: arr.semester, code: arr.subjectCode || arr.subject, title: "ARREAR SUBJECT" }))
      ];

      return {
        properties: { page: { margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
        children: [
          new Paragraph({ children: [new TextRun({ text: "ANNA UNIVERSITY", bold: true, size: 36 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: "CHENNAI - 600 025", bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: `UNIVERSITY EXAMINATIONS - ${settings.session}`, size: 24 })], alignment: AlignmentType.CENTER, spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: "HALL TICKET", bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 300 } }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Register Number", bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: ticket.student.registerNumber, bold: true })], width: { size: 50, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Current Semester", bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: String(settings.sem), bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } })
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Name", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: ticket.student.name, bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "D.O.B", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: ticket.student.password || "-" })] })
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Degree & Branch", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: deptCode, bold: true })], columnSpan: 3 })
              ]}),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Exam Centre", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: settings.centre, bold: true })], columnSpan: 3 })
              ]})
            ]
          }),

          new Paragraph({ text: "Registered Subjects:", bold: true, spacing: { before: 300, after: 100 } }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Sem", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Sub Code", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Subject Title", bold: true })] })
              ]}),
              ...allSubjects.map(sub => new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: String(sub.sem).padStart(2,'0') })] }),
                new TableCell({ children: [new Paragraph({ text: sub.code })] }),
                new TableCell({ children: [new Paragraph({ text: sub.title })] })
              ]}))
            ]
          }),

          new Paragraph({ text: `Total Subjects Registered: ${allSubjects.length}`, bold: true, spacing: { before: 200, after: 400 } }),
          
          new Paragraph({ text: "NOTE:", bold: true }),
          ...settings.notes.split('\n').map(line => new Paragraph({ text: line, size: 18 })),

          new Paragraph({ text: "", spacing: { before: 600 } }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
            rows: [
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ text: "Signature of the Candidate", alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: "Signature of Principal with seal", alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: "Controller of Examinations", alignment: AlignmentType.CENTER })] })
              ]})
            ]
          })
        ]
      };
    });

    const doc = new Document({ sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `HallTickets_${deptCode}_Sem${settings.sem}.docx`);
  } catch (err) {
    alert("Error exporting Docx: " + err.message);
  }
};