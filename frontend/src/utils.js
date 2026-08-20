import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, Footer, PageNumber, ImageRun,
  Math as DocxMath, MathRun, MathFraction, MathIntegral, MathSum,
  MathRadical, MathSubScript, MathSuperScript, MathSubSuperScript,
  MathLimitLower, MathLimitUpper, MathFunction, BuilderElement, XmlComponent, createMathBase, createMathAccentCharacter,
  createMathNAryProperties, createMathSubScriptElement, createMathSuperScriptElement
} from "docx";
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

export function readAllSheets(file, onJSON) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    let allRows = [];
    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "dd-mm-yyyy" });
      if (Array.isArray(json)) {
        allRows = allRows.concat(json);
      }
    });
    onJSON(allRows);
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
  const { header, partA, partB, partC, customContent } = config || {};
  try {
    if (!header) { alert("⚠️ This document is corrupted. Please delete it."); return; }

    // Normalize templateType parameter (handles boolean hasPartC, number, or string)
    let type = templateType;
    if (type === true) type = 1;
    if (type === false) type = 2;
    if (typeof type === "string") type = parseInt(type, 10) || 1;
    if (!type) type = 1;

    // Sanitize subject code for a safe filename
    const safeSubject = (header.subject || "Paper").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").substring(0, 15);

    const noBorders = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } };
    const createCell = (text, width = 10, bold = false, align = AlignmentType.CENTER) => {
      const lines = splitQuestionSubdivisions(text);
      const paragraphs = lines.map(line => new Paragraph({ children: parseQuestionTextRuns(line, bold), alignment: align, spacing: { before: 100, after: 100 } }));
      return new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: paragraphs });
    };
    const createLeftCell = (text, width = 70, bold = false) => {
      const lines = splitQuestionSubdivisions(text);
      const paragraphs = lines.map(line => new Paragraph({ children: parseQuestionTextRuns(line, bold), spacing: { before: 100, after: 100 } }));
      return new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: paragraphs });
    };
    
    // Register box: 40% label + 12 * 5% cells = 100% total
    const regBoxCells = Array.from({ length: 12 }).map(() => new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: " ", spacing: { before: 150, after: 150 } })] }));
    
    const childrenNodes = [
      new Table({ width: { size: 60, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT, rows: [new TableRow({ children: [new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Register Number  ", bold: true })], alignment: AlignmentType.RIGHT, spacing: { before: 150, after: 150 } })], borders: noBorders }), ...regBoxCells] })] }),
      new Paragraph({ text: " " }),
      new Paragraph({ children: [new TextRun({ text: "Question Paper Code: __________________", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ text: " " }),
      new Paragraph({ children: [new TextRun({ text: "St. Peter’s College of Engineering and Technology", bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "(An Autonomous Institution)", size: 24 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.examSession || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.semesters || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.department || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.subject || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: header.regulations || "", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "Common to CSE & IT", bold: true })], alignment: AlignmentType.CENTER }),
      new Paragraph({ text: "(Any requirements like Graphs, Charts, Tables, Data books, etc.) if applicable", alignment: AlignmentType.CENTER }),
      new Paragraph({ text: " ", spacing: { after: 200 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Duration: Three Hours", bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Maximum Marks: 100", bold: true })], alignment: AlignmentType.RIGHT })] })] })] }),
      new Paragraph({ children: [new TextRun({ text: "Answer ALL Questions", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }),
    ];

    if (type === 3) {
       const lines = (customContent || "No content provided.").split("\n");
       lines.forEach(line => { childrenNodes.push(new Paragraph({ text: line, spacing: { before: 100, after: 100 } })); });
    } else {
      const partARows = (partA || []).map(q => new TableRow({ children: [createCell(q.qNo + ".", 10, false, AlignmentType.LEFT), createLeftCell(q.question, 70, false), createCell(q.btl, 10, false, AlignmentType.CENTER), createCell(q.co, 10, false, AlignmentType.CENTER)] }));
      const createOrRow = () => new TableRow({ children: [new TableCell({ columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: "(Or)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })] })] });
      
      // Column percentages for Part B: 8% + 62% + 10% + 10% + 10% = 100%
      const partBRows = (partB || []).flatMap(q => [
        new TableRow({ children: [createCell(q.qNo + ".", 8, false, AlignmentType.LEFT), createLeftCell(`(a) ${q.a?.question || ""}`, 62, false), createCell(`(${q.a?.marks || "13"})`, 10, false, AlignmentType.CENTER), createCell(q.a?.btl || "", 10, false, AlignmentType.CENTER), createCell(q.a?.co || "", 10, false, AlignmentType.CENTER)] }), 
        createOrRow(), 
        new TableRow({ children: [createCell("", 8), createLeftCell(`(b) ${q.b?.question || ""}`, 62, false), createCell(`(${q.b?.marks || "13"})`, 10, false, AlignmentType.CENTER), createCell(q.b?.btl || "", 10, false, AlignmentType.CENTER), createCell(q.b?.co || "", 10, false, AlignmentType.CENTER)] })
      ]);

      childrenNodes.push(
        new Paragraph({ children: [new TextRun({ text: "Part A – (10 X 2 = 20 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 10, true, AlignmentType.LEFT), createCell("Question", 70, true, AlignmentType.CENTER), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partARows] }),
        new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `PART B (5 × ${type === 1 ? "13 = 65" : "16 = 80"} Marks)`, bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 8, true, AlignmentType.LEFT), createCell("Answer All Questions", 62, true, AlignmentType.CENTER), createCell("Marks", 10, true), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partBRows] })
      );

      if (type === 1 && partC) {
        const pC = Array.isArray(partC) ? partC[0] : partC;
        if (pC) {
          const partCRows = [
            new TableRow({ children: [createCell((pC.qNo || 16) + ".", 8, false, AlignmentType.LEFT), createLeftCell(`(a) ${pC.a?.question || ""}`, 62, false), createCell(`(${pC.a?.marks || "15"})`, 10, false, AlignmentType.CENTER), createCell(pC.a?.btl || "", 10, false, AlignmentType.CENTER), createCell(pC.a?.co || "", 10, false, AlignmentType.CENTER)] }), 
            createOrRow(), 
            new TableRow({ children: [createCell("", 8), createLeftCell(`(b) ${pC.b?.question || ""}`, 62, false), createCell(`(${pC.b?.marks || "15"})`, 10, false, AlignmentType.CENTER), createCell(pC.b?.btl || "", 10, false, AlignmentType.CENTER), createCell(pC.b?.co || "", 10, false, AlignmentType.CENTER)] })
          ];
          childrenNodes.push(
            new Paragraph({ children: [new TextRun({ text: "PART C (1 × 15 = 15 Marks)", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 } }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [createCell("Q. No.", 8, true, AlignmentType.LEFT), createCell("Question", 62, true, AlignmentType.CENTER), createCell("Marks", 10, true), createCell("BTL", 10, true), createCell("CO", 10, true)] }), ...partCRows] })
          );
        }
      }
    }

    childrenNodes.push(
      new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: "Note:", bold: true })] }),
      new Paragraph({ text: "#\tA maximum of two questions can have two subdivisions.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\tQuestions from same unit and same blooms taxonomy Knowledge level to be maintained in either / or questions with same mark weightage even if the questions have sub divisions.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\tCompulsory Question can be derived from any of the Unit.", spacing: { before: 100 } }),
      new Paragraph({ text: "#\t{Maximum two sub divisions in (Part B & Part C) question if necessary.}", spacing: { before: 100 } }),
      new Paragraph({ text: " " }),
      new Paragraph({ children: [new TextRun({ text: "*****", bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 400 } })
    );

    const doc = new Document({
      sections: [{
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Knowledge Level: K1 – Remember; K2 – Understand; K3 – Apply; K4 – Analyze; K5 – Evaluate; K6 – Create", size: 16, color: "555555" })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Page ", size: 16, color: "555555", bold: true }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "555555", bold: true }), new TextRun({ text: " of ", size: 16, color: "555555", bold: true }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "555555", bold: true })] })] }) },
        children: childrenNodes,
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${safeSubject}_SemesterPaper.docx`);
  } catch(err) { alert("❌ Error creating document: " + err.message); }
};

export const splitQuestionSubdivisions = (rawText) => {
  if (!rawText) return [""];
  let text = String(rawText).trim();

  // 1. If text already has newlines (\n), split by \n
  if (text.includes("\n")) {
    return text.split("\n").map(s => s.trim()).filter(Boolean);
  }

  // 2. Detect sub-divisions like a), b), c) or (a), (b), (c) or a., b., c. or i), ii), iii)
  const hasA = /\b[aA][\)\.]|\([aA]\)|\b[iI][\)\.]|\([iI]\)/.test(text);
  const hasB = /\b[bB][\)\.]|\([bB]\)|\b(?:ii|II)[\)\.]|\((?:ii|II)\)/.test(text);

  if (hasA && hasB) {
    let formatted = text;
    // Add newline before a) or (a) or i) if main question text precedes it
    formatted = formatted.replace(/\s*(\b[aA][\)\.]|\([aA]\)|\b[iI][\)\.]|\([iI]\))\s*/g, "\n$1 ");
    // Add newline before b), c), d), e) / (b), (c) / ii), iii), iv)
    const subDivRegex = /(?:\s*|(?<=\S))(\b[b-eB-E][\)\.]|\([b-eB-E]\)|\b(?:ii|iii|iv|v|II|III|IV|V)[\)\.]|\((?:ii|iii|iv|v|II|III|IV|V)\))\s*/g;
    formatted = formatted.replace(subDivRegex, "\n$1 ");

    return formatted.split("\n").map(s => s.trim()).filter(Boolean);
  }

  return [text];
};

class MathUprightRun extends BuilderElement {
  constructor(text) {
    super({
      name: "m:r",
      children: [
        new BuilderElement({
          name: "m:t",
          children: [text]
        })
      ]
    });
  }
}

class MathAccent extends XmlComponent {
  constructor(options) {
    super("m:acc");
    const accPr = new XmlComponent("m:accPr");
    accPr.root.push(createMathAccentCharacter({ accent: options.accent || "⃗" }));
    this.root.push(accPr);
    this.root.push(createMathBase({ children: options.children }));
  }
}

class MathIntegralCustom extends XmlComponent {
  constructor(options) {
    super("m:nary");
    const isSum = options.accent === "∑" || options.accent === "∏";
    this.root.push(
      createMathNAryProperties({
        accent: options.accent || "∫",
        hasSuperScript: !!options.superScript,
        hasSubScript: !!options.subScript,
        limitLocationVal: isSum ? "undOvr" : "subSup"
      })
    );
    if (!!options.subScript) {
      this.root.push(createMathSubScriptElement({ children: options.subScript }));
    }
    if (!!options.superScript) {
      this.root.push(createMathSuperScriptElement({ children: options.superScript }));
    }
    this.root.push(createMathBase({ children: options.children && options.children.length > 0 ? options.children : [new MathRun("")] }));
  }
}

class MathMatrix extends BuilderElement {
  constructor({ open = "[", close = "]", rows }) {
    const rowElements = rows.map(row => new BuilderElement({
      name: "m:mr",
      children: row.map(cell => new BuilderElement({
        name: "m:e",
        children: Array.isArray(cell) ? cell : [cell]
      }))
    }));

    const matrixElem = new BuilderElement({
      name: "m:m",
      children: rowElements
    });

    super({
      name: "m:d",
      children: [
        new BuilderElement({
          name: "m:dPr",
          children: [
            new BuilderElement({ name: "m:begChr", attributes: { val: { key: "m:val", value: open } } }),
            new BuilderElement({ name: "m:endChr", attributes: { val: { key: "m:val", value: close } } })
          ]
        }),
        new BuilderElement({
          name: "m:e",
          children: [matrixElem]
        })
      ]
    });
  }
}

class MathCases extends BuilderElement {
  constructor({ rows }) {
    const rowElements = rows.map(rowNodes => new BuilderElement({
      name: "m:e",
      children: rowNodes
    }));

    const eqArrElem = new BuilderElement({
      name: "m:eqArr",
      children: rowElements
    });

    super({
      name: "m:d",
      children: [
        new BuilderElement({
          name: "m:dPr",
          children: [
            new BuilderElement({ name: "m:begChr", attributes: { val: { key: "m:val", value: "{" } } }),
            new BuilderElement({ name: "m:endChr", attributes: { val: { key: "m:val", value: "" } } })
          ]
        }),
        new BuilderElement({
          name: "m:e",
          children: [eqArrElem]
        })
      ]
    });
  }
}

const LATEX_SYMBOLS = {
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\epsilon": "ε",
  "\\theta": "θ", "\\lambda": "λ", "\\mu": "μ", "\\pi": "π", "\\rho": "ρ",
  "\\sigma": "σ", "\\phi": "φ", "\\psi": "ψ", "\\omega": "ω", "\\Delta": "Δ",
  "\\nu": "ν", "\\eta": "η", "\\xi": "ξ", "\\zeta": "ζ", "\\kappa": "κ",
  "\\partial": "∂", "\\times": "×", "\\cdot": "·", "\\to": "→", "\\infty": "∞",
  "\\pm": "±", "\\approx": "≈", "\\ne": "≠", "\\le": "≤", "\\ge": "≥",
  "\\leq": "≤", "\\geq": "≥",
  "\\rightarrow": "→", "\\leftarrow": "←", "\\rightleftharpoons": "⇌",
  "\\longrightarrow": "⟶", "\\longleftarrow": "⟵", "\\longleftrightarrow": "⟷",
  "\\leftrightarrow": "↔", "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
  "\\div": "÷", "\\mp": "∓", "\\cap": "∩", "\\cup": "∪", "\\in": "∈",
  "\\notin": "∉", "\\subset": "⊂", "\\subseteq": "⊆", "\\forall": "∀",
  "\\exists": "∃", "\\nabla": "∇", "\\angle": "∠", "\\circ": "°",
  "\\equiv": "≡", "\\sim": "∼", "\\propto": "∝", "\\perp": "⊥", "\\parallel": "∥",
  "\\,": " ", "\\;": " ", "\\quad": " ", "\\qquad": " ", "\\ ": " ",
  "\\left": "", "\\right": ""
};

const KNOWN_FUNCTIONS = [
  "cosh", "sinh", "tanh", "coth", "sech", "csch",
  "sin", "cos", "tan", "cot", "sec", "csc",
  "log", "lg", "ln", "exp", "det", "gcd", "max", "min", "sup", "inf"
];

function readBracedGroup(str, pos) {
  if (pos >= str.length) return { content: "", nextPos: pos };
  if (str[pos] === "{") {
    let depth = 1;
    let i = pos + 1;
    while (i < str.length && depth > 0) {
      if (str[i] === "{") depth++;
      else if (str[i] === "}") depth--;
      i++;
    }
    return { content: str.substring(pos + 1, depth === 0 ? i - 1 : i), nextPos: i };
  } else if (str[pos] === "[") {
    let depth = 1;
    let i = pos + 1;
    while (i < str.length && depth > 0) {
      if (str[i] === "[") depth++;
      else if (str[i] === "]") depth--;
      i++;
    }
    return { content: str.substring(pos + 1, depth === 0 ? i - 1 : i), nextPos: i };
  } else if (str[pos] === "(") {
    let depth = 1;
    let i = pos + 1;
    while (i < str.length && depth > 0) {
      if (str[i] === "(") depth++;
      else if (str[i] === ")") depth--;
      i++;
    }
    return { content: str.substring(pos, i), nextPos: i };
  } else {
    if (str[pos] === "\\") {
      const match = str.substring(pos).match(/^\\[a-zA-Z]+/);
      if (match) return { content: match[0], nextPos: pos + match[0].length };
    }
    return { content: str[pos], nextPos: pos + 1 };
  }
}

function parseLaTeXToMathNodes(latex) {
  if (!latex) return [];
  const nodes = [];
  let i = 0;

  while (i < latex.length) {
    if (latex[i] === " " || latex[i] === "\t") {
      i++;
      continue;
    }

    // A. \begin{cases} ... \end{cases}
    if (latex.startsWith("\\begin{cases}", i)) {
      const endIdx = latex.indexOf("\\end{cases}", i);
      const content = endIdx !== -1 ? latex.substring(i + 13, endIdx) : latex.substring(i + 13);
      const rawRows = content.split("\\\\");
      const casesRows = rawRows.map(row => {
        const parts = row.split("&");
        const rowNodes = [];
        parts.forEach((p, pIdx) => {
          if (pIdx > 0) rowNodes.push(new MathRun("  "));
          rowNodes.push(...parseLaTeXToMathNodes(p.trim()));
        });
        return rowNodes;
      }).filter(r => r.length > 0);

      nodes.push(new MathCases({ rows: casesRows }));
      i = endIdx !== -1 ? endIdx + 11 : latex.length;
      continue;
    }

    // B. \begin{pmatrix}, \begin{bmatrix}, \begin{vmatrix}, \begin{matrix}
    const envMatch = latex.substring(i).match(/^\\begin\{(pmatrix|bmatrix|vmatrix|matrix)\}/);
    if (envMatch) {
      const envType = envMatch[1];
      const endTag = `\\end{${envType}}`;
      const startLen = envMatch[0].length;
      const endIdx = latex.indexOf(endTag, i);
      const content = endIdx !== -1 ? latex.substring(i + startLen, endIdx) : latex.substring(i + startLen);

      const rawRows = content.split("\\\\");
      const matrixRows = rawRows.map(row => {
        const cells = row.split("&");
        return cells.map(c => parseLaTeXToMathNodes(c.trim()));
      }).filter(r => r.length > 0 && r[0].length > 0);

      let openChar = "[";
      let closeChar = "]";
      if (envType === "pmatrix") { openChar = "("; closeChar = ")"; }
      else if (envType === "vmatrix") { openChar = "|"; closeChar = "|"; }
      else if (envType === "matrix") { openChar = ""; closeChar = ""; }

      nodes.push(new MathMatrix({ open: openChar, close: closeChar, rows: matrixRows }));
      i = endIdx !== -1 ? endIdx + endTag.length : latex.length;
      continue;
    }

    // C. \xrightarrow{condition} — arrow with condition above
    if (latex.startsWith("\\xrightarrow", i)) {
      let pos = i + 12;
      while (pos < latex.length && latex[pos] === " ") pos++;
      let condNodes = [];
      if (latex[pos] === "{") {
        const condGrp = readBracedGroup(latex, pos);
        condNodes = parseLaTeXToMathNodes(condGrp.content);
        pos = condGrp.nextPos;
      }
      nodes.push(new MathLimitUpper({
        children: [new MathRun("→")],
        limit: condNodes.length > 0 ? condNodes : [new MathRun("")]
      }));
      i = pos;
      continue;
    }

    // 1. \frac{num}{den}
    if (latex.startsWith("\\frac", i)) {
      let pos = i + 5;
      while (pos < latex.length && latex[pos] === " ") pos++;
      const numGrp = readBracedGroup(latex, pos);
      pos = numGrp.nextPos;
      while (pos < latex.length && latex[pos] === " ") pos++;
      const denGrp = readBracedGroup(latex, pos);
      pos = denGrp.nextPos;

      nodes.push(new MathFraction({
        numerator: parseLaTeXToMathNodes(numGrp.content),
        denominator: parseLaTeXToMathNodes(denGrp.content)
      }));
      i = pos;
      continue;
    }

    // 2. \sqrt[opt]{arg} or \sqrt{arg}
    if (latex.startsWith("\\sqrt", i)) {
      let pos = i + 5;
      while (pos < latex.length && latex[pos] === " ") pos++;
      let degreeNodes = null;
      if (latex[pos] === "[") {
        const degGrp = readBracedGroup(latex, pos);
        degreeNodes = parseLaTeXToMathNodes(degGrp.content);
        pos = degGrp.nextPos;
        while (pos < latex.length && latex[pos] === " ") pos++;
      }
      const argGrp = readBracedGroup(latex, pos);
      pos = argGrp.nextPos;

      nodes.push(new MathRadical({
        degree: degreeNodes,
        children: parseLaTeXToMathNodes(argGrp.content)
      }));
      i = pos;
      continue;
    }

    // 3. \vec{arg}
    if (latex.startsWith("\\vec", i)) {
      let pos = i + 4;
      while (pos < latex.length && latex[pos] === " ") pos++;
      const argGrp = readBracedGroup(latex, pos);
      nodes.push(new MathAccent({
        accent: "⃗",
        children: parseLaTeXToMathNodes(argGrp.content)
      }));
      i = argGrp.nextPos;
      continue;
    }

    // 4. \lim_{sub}
    if (latex.startsWith("\\lim", i)) {
      let pos = i + 4;
      while (pos < latex.length && latex[pos] === " ") pos++;
      let subNodes = null;
      if (latex[pos] === "_") {
        pos++;
        while (pos < latex.length && latex[pos] === " ") pos++;
        const subGrp = readBracedGroup(latex, pos);
        subNodes = parseLaTeXToMathNodes(subGrp.content);
        pos = subGrp.nextPos;
      }
      if (subNodes) {
        nodes.push(new MathLimitLower({
          children: [new MathUprightRun("lim")],
          limit: subNodes
        }));
      } else {
        nodes.push(new MathUprightRun("lim"));
      }
      i = pos;
      continue;
    }

    // 5. Integral & Summation operators: \int, \oint, \iint, \iiint, \idotsint, \sum, \prod
    const opMatches = [
      { cmd: "\\idotsint", accent: "∫⋯∫" },
      { cmd: "\\iiint", accent: "∭" },
      { cmd: "\\iint", accent: "∬" },
      { cmd: "\\oint", accent: "∮" },
      { cmd: "\\int", accent: "∫" },
      { cmd: "\\sum", accent: "∑" },
      { cmd: "\\prod", accent: "∏" }
    ];
    const matchedOp = opMatches.find(op => latex.startsWith(op.cmd, i));
    if (matchedOp) {
      let pos = i + matchedOp.cmd.length;
      let subNodes = null;
      let supNodes = null;

      while (pos < latex.length) {
        if (latex[pos] === " ") { pos++; continue; }
        if (latex[pos] === "_") {
          pos++;
          while (pos < latex.length && latex[pos] === " ") pos++;
          const grp = readBracedGroup(latex, pos);
          subNodes = parseLaTeXToMathNodes(grp.content);
          pos = grp.nextPos;
        } else if (latex[pos] === "^") {
          pos++;
          while (pos < latex.length && latex[pos] === " ") pos++;
          const grp = readBracedGroup(latex, pos);
          supNodes = parseLaTeXToMathNodes(grp.content);
          pos = grp.nextPos;
        } else {
          break;
        }
      }

      let bodyNodes = [];
      let endPos = pos;
      while (endPos < latex.length && latex[endPos] === " ") endPos++;

      if (endPos < latex.length) {
        if (latex[endPos] === "{") {
          const termGrp = readBracedGroup(latex, endPos);
          bodyNodes = parseLaTeXToMathNodes(termGrp.content);
          endPos = termGrp.nextPos;
        } else {
          bodyNodes = parseLaTeXToMathNodes(latex.substring(endPos));
          endPos = latex.length;
        }
      }

      nodes.push(new MathIntegralCustom({
        accent: matchedOp.accent,
        subScript: subNodes,
        superScript: supNodes,
        children: bodyNodes
      }));

      i = endPos;
      continue;
    }

    // 6. Standard Mathematical Functions: \sin, \cos, \tan, \cot, \sec, \csc, \sinh, \cosh, \tanh, \coth, \sech, \csch, \log, \lg, \ln, \exp, \det, \gcd, \max, \min, \sup, \inf
    const matchedFunc = KNOWN_FUNCTIONS.find(fn => latex.startsWith("\\" + fn, i));
    if (matchedFunc) {
      let pos = i + matchedFunc.length + 1;
      let supNodes = null;
      while (pos < latex.length && latex[pos] === " ") pos++;

      // Check for power e.g. \sin^2 x
      if (latex[pos] === "^") {
        pos++;
        while (pos < latex.length && latex[pos] === " ") pos++;
        const supGrp = readBracedGroup(latex, pos);
        supNodes = parseLaTeXToMathNodes(supGrp.content);
        pos = supGrp.nextPos;
        while (pos < latex.length && latex[pos] === " ") pos++;
      }

      const fNameNodes = supNodes
        ? [new MathSuperScript({ children: [new MathUprightRun(matchedFunc)], superScript: supNodes })]
        : [new MathUprightRun(matchedFunc)];

      // Read argument for function
      let argNodes = [];
      if (pos < latex.length) {
        const argGrp = readBracedGroup(latex, pos);
        argNodes = parseLaTeXToMathNodes(argGrp.content);
        pos = argGrp.nextPos;
      }

      nodes.push(new MathFunction({
        name: fNameNodes,
        children: argNodes.length > 0 ? argNodes : [new MathRun("")]
      }));

      i = pos;
      continue;
    }

    // 7. Subscript / Superscript attached to previous token or character
    let tokenStr = "";
    let isSymbolUpright = false;
    let nextI = i;

    if (latex[i] === "\\") {
      const match = latex.substring(i).match(/^\\[a-zA-Z]+|^\\./);
      if (match) {
        if (LATEX_SYMBOLS[match[0]] !== undefined) {
          tokenStr = LATEX_SYMBOLS[match[0]];
        } else {
          // Strip leading backslash and render as upright operator
          tokenStr = match[0].startsWith("\\") ? match[0].substring(1) : match[0];
          isSymbolUpright = true;
        }
        nextI = i + match[0].length;
      } else {
        tokenStr = "";
        nextI = i + 1;
      }
    } else {
      tokenStr = latex[i];
      nextI = i + 1;
    }

    // Check if followed by _ or ^
    let pos = nextI;
    let subNodes = null;
    let supNodes = null;

    while (pos < latex.length) {
      if (latex[pos] === " ") {
        let peek = pos;
        while (peek < latex.length && latex[peek] === " ") peek++;
        if (latex[peek] === "_" || latex[peek] === "^") {
          pos = peek;
        } else {
          break;
        }
      }
      if (latex[pos] === "_") {
        pos++;
        while (pos < latex.length && latex[pos] === " ") pos++;
        const grp = readBracedGroup(latex, pos);
        subNodes = parseLaTeXToMathNodes(grp.content);
        pos = grp.nextPos;
      } else if (latex[pos] === "^") {
        pos++;
        while (pos < latex.length && latex[pos] === " ") pos++;
        const grp = readBracedGroup(latex, pos);
        supNodes = parseLaTeXToMathNodes(grp.content);
        pos = grp.nextPos;
      } else {
        break;
      }
    }

    const createTokenRun = (s) => isSymbolUpright ? new MathUprightRun(s) : new MathRun(s);

    if (subNodes || supNodes) {
      const baseNodes = tokenStr ? [createTokenRun(tokenStr)] : [];
      if (subNodes && supNodes) {
        nodes.push(new MathSubSuperScript({ children: baseNodes, subScript: subNodes, superScript: supNodes }));
      } else if (subNodes) {
        nodes.push(new MathSubScript({ children: baseNodes, subScript: subNodes }));
      } else {
        nodes.push(new MathSuperScript({ children: baseNodes, superScript: supNodes }));
      }
      i = pos;
    } else {
      if (tokenStr) nodes.push(createTokenRun(tokenStr));
      i = nextI;
    }
  }

  return nodes;
}

function parsePlainTextRuns(text, baseBold = false) {
  if (!text) return [];

  // Protect course outcome & bloom level metadata tokens (CO1-CO6, K1-K6)
  // so they are NEVER treated as chemical elements (Cobalt/Potassium) or subscript equations
  const metadataPlaceholders = {};
  let protectedText = String(text).replace(/\b(?:CO[1-6]|K[1-6])\b/gi, (m) => {
    const ph = `__META_TOKEN_${Object.keys(metadataPlaceholders).length}__`;
    metadataPlaceholders[ph] = m;
    return ph;
  });

  const chemElements = "(?:H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|U)";

  // Format chemical formulas in plain text like H_2O, H_2SO_4, Fe_2O_3, NH_3, CH_4
  let formattedText = protectedText;
  formattedText = formattedText.replace(new RegExp(`(${chemElements})_(\\d+)`, "g"), (m, el, n) => {
    const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
    return el + String(n).split('').map(c => subMap[c] || c).join('');
  });
  // Reaction arrows and conditions in plain text
  formattedText = formattedText.replace(/\\xrightarrow\{([^}]*)\}/g, (m, cond) => {
    const condClean = cond
      .replace(/\\Delta/g, 'Δ').replace(/\\nu/g, 'ν').replace(/\\,/g, ' ')
      .replace(/\\[a-zA-Z]+/g, '').trim();
    return condClean ? `→(${condClean})` : '→';
  });
  formattedText = formattedText.replace(/\\longrightarrow/g, "⟶");
  formattedText = formattedText.replace(/\\longleftrightarrow/g, "⟷");
  formattedText = formattedText.replace(/\\rightarrow|\\to(?=[^a-z]|$)/g, "→");
  formattedText = formattedText.replace(/\\leftarrow/g, "←");
  formattedText = formattedText.replace(/\\rightleftharpoons/g, "⇌");
  formattedText = formattedText.replace(/\\Delta/g, 'Δ');
  formattedText = formattedText.replace(/\\nu/g, 'ν');
  formattedText = formattedText.replace(/\\[,;]/g, ' ');

  const masterRegex = new RegExp(
    `_(?:\\{([^{}]+)\\}|([a-zA-Z0-9=+\\-]+))|\\^(?:\\{([^{}]+)\\}|([a-zA-Z0-9=+\\-]+))|(${chemElements}+)(\\d{1,2})|([²³])|(?:([a-z])(\\d+))`,
    "g"
  );

  const runs = [];
  let lastIndex = 0;
  let match;

  while ((match = masterRegex.exec(formattedText)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      runs.push({ text: formattedText.substring(lastIndex, matchIndex) });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      runs.push({ text: match[1] || match[2], subScript: true });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      runs.push({ text: match[3] || match[4], superScript: true });
    } else if (match[5] !== undefined && match[6] !== undefined) {
      runs.push({ text: match[5] });
      runs.push({ text: match[6], subScript: true });
    } else if (match[7] !== undefined) {
      const val = match[7] === "²" ? "2" : match[7] === "³" ? "3" : match[7];
      runs.push({ text: val, superScript: true });
    } else if (match[8] !== undefined && match[9] !== undefined) {
      runs.push({ text: match[8] });
      runs.push({ text: match[9], superScript: true });
    }

    lastIndex = masterRegex.lastIndex;
  }

  if (lastIndex < formattedText.length) {
    runs.push({ text: formattedText.substring(lastIndex) });
  }

  return runs.map(r => {
    let t = r.text;
    for (const [ph, orig] of Object.entries(metadataPlaceholders)) {
      t = t.replace(ph, orig);
    }
    return new TextRun({
      text: t,
      bold: baseBold,
      font: "Times New Roman",
      size: 21,
      subScript: r.subScript || false,
      superScript: r.superScript || false
    });
  });
}

export const parseQuestionTextRuns = (rawText, baseBold = false) => {
  if (!rawText) return [new TextRun({ text: "", bold: baseBold })];
  const text = String(rawText).trim();

  if (/^(?:CO[1-6]|K[1-6])$/i.test(text)) {
    return [new TextRun({ text, bold: baseBold })];
  }

  if (text.includes('$')) {
    const parts = text.split('$');
    const result = [];
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      if (idx % 2 === 0) {
        if (part) result.push(...parsePlainTextRuns(part, baseBold));
      } else {
        if (part && part.trim()) {
          const mathNodes = parseLaTeXToMathNodes(part.trim());
          if (mathNodes.length > 0) result.push(new DocxMath({ children: mathNodes }));
        }
      }
    }
    return result.length > 0 ? result : [new TextRun({ text: "", bold: baseBold })];
  }

  const mathRegex = /(\\begin\{(?:matrix|bmatrix|pmatrix|vmatrix|cases)\}[\s\S]*?\\end\{(?:matrix|bmatrix|pmatrix|vmatrix|cases)\}|\\frac\{[^{}]*\}\{[^{}]*\}|\\sqrt(?:\[[^{}]*\])?\{[^{}]*\}|\\(?:int|iint|iiint|oint|idotsint|sum|prod|lim|max|min|sup|inf)(?:_\{[^{}]*\}|_[a-zA-Z0-9=+\-]+)?(?:\^\{[^{}]*\}|\^[a-zA-Z0-9=+\-]+)?|\\vec\{[^{}]*\}|\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|psi|omega|Delta|Theta|Lambda|Pi|Sigma|Omega|partial|nabla|infty|times|cdot)\b)/g;

  const segments = [];
  let lastIdx = 0;
  let m;

  while ((m = mathRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ isMath: false, content: text.substring(lastIdx, m.index) });
    }
    segments.push({ isMath: true, content: m[0] });
    lastIdx = mathRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    segments.push({ isMath: false, content: text.substring(lastIdx) });
  }

  if (segments.length === 0) {
    return parsePlainTextRuns(text, baseBold);
  }

  const result = [];
  for (const seg of segments) {
    if (!seg.isMath) {
      if (seg.content) {
        result.push(...parsePlainTextRuns(seg.content, baseBold));
      }
    } else {
      if (seg.content && seg.content.trim()) {
        const mathNodes = parseLaTeXToMathNodes(seg.content.trim());
        if (mathNodes.length > 0) {
          result.push(new DocxMath({ children: mathNodes }));
        }
      }
    }
  }

  return result.length > 0 ? result : [new TextRun({ text: "", bold: baseBold })];
};

export const exportUnitTestPaperDocx = async (config) => {
  try {
    const { unitHeader, unitPartA, unitPartB, unitPartC, coDistribution } = config || {};
    if (!unitHeader) { alert("⚠️ This document is corrupted or from an older version. Please delete it."); return; }

    const safeSubject = (unitHeader.subject || "UnitTest").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").substring(0, 15);

    const is2024 = (unitHeader.regulations || "").includes("2024");

    // Calculate total marks of ALL questions per CO (including choice options A & B)
    const coMarks = { CO1: 0, CO2: 0, CO3: 0, CO4: 0, CO5: 0, CO6: 0 };
    (unitPartA || []).forEach(q => {
      const co = (q.co || "").toUpperCase().trim();
      const m = parseInt(q.marks || "2", 10);
      if (co in coMarks) coMarks[co] += isNaN(m) ? 2 : m;
    });

    (unitPartB || []).forEach((q, idx) => {
      const defaultBMark = is2024 ? (q.qNo === 8 || idx === 2 ? 8 : 16) : 13;
      if (q.a && q.b) {
        const ma = parseInt(q.a.marks || defaultBMark, 10);
        const coa = (q.a.co || "").toUpperCase().trim();
        if (coa in coMarks) coMarks[coa] += isNaN(ma) ? defaultBMark : ma;

        const mb = parseInt(q.b.marks || defaultBMark, 10);
        const cob = (q.b.co || "").toUpperCase().trim();
        if (cob in coMarks) coMarks[cob] += isNaN(mb) ? defaultBMark : mb;
      } else {
        const m = parseInt(q.marks || defaultBMark, 10);
        const co = (q.co || "").toUpperCase().trim();
        if (co in coMarks) coMarks[co] += isNaN(m) ? defaultBMark : m;
      }
    });

    if (!is2024 && unitPartC) {
      (unitPartC || []).forEach(q => {
        if (q.a && q.b) {
          const ma = parseInt(q.a.marks || 14, 10);
          const coa = (q.a.co || "").toUpperCase().trim();
          if (coa in coMarks) coMarks[coa] += isNaN(ma) ? 14 : ma;

          const mb = parseInt(q.b.marks || 14, 10);
          const cob = (q.b.co || "").toUpperCase().trim();
          if (cob in coMarks) coMarks[cob] += isNaN(mb) ? 14 : mb;
        } else {
          const m = parseInt(q.marks || 14, 10);
          const co = (q.co || "").toUpperCase().trim();
          if (co in coMarks) coMarks[co] += isNaN(m) ? 14 : m;
        }
      });
    }

    const totalCoMarks = Object.values(coMarks).reduce((s, v) => s + v, 0);
    const coKeys = ["CO1", "CO2", "CO3", "CO4", "CO5", "CO6"];
    const marksArray = coKeys.map(k => coMarks[k] > 0 ? String(coMarks[k]) : "-");
    const percArray  = coKeys.map(k => (coMarks[k] === 0 || totalCoMarks === 0) ? "-" : String(Math.round((coMarks[k] / totalCoMarks) * 100)));

    const noBorders = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } };
    const createCell = (text, width = 10, bold = false, align = AlignmentType.CENTER) => {
      const lines = String(text != null ? text : "").split("\n");
      const paragraphs = lines.map(line => new Paragraph({ children: parseQuestionTextRuns(line, bold), alignment: align, spacing: { before: 100, after: 100 } }));
      return new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children: paragraphs });
    };
    
    // Register box: 40% label + 12 * 5% cells = 100% total
    const regBoxCells = Array.from({ length: 12 }).map(() => new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: " ", spacing: { before: 150, after: 150 } })] }));

    // Helper: build an image row spanning the full table width (centered)
    const makeImageRow = async (imageData, width = 210, height = 176) => {
      if (!imageData) return null;
      const b64DataUrl = typeof imageData === "string" ? imageData : (imageData.base64 || imageData.url || "");
      if (!b64DataUrl) return null;
      try {
        // Strip data URL prefix to get raw base64
        const b64 = b64DataUrl.includes(',') ? b64DataUrl.split(',')[1] : b64DataUrl;
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const buffer = bytes.buffer;
        // Determine image type from data URL
        const mimeMatch = b64DataUrl.match(/data:(image\/[^;]+)/);
        const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
        const typeMap = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', bmp: 'bmp', webp: 'webp' };
        const imgType = typeMap[ext] || 'png';
        // Fixed size per section: width x height
        const imgRun = new ImageRun({ data: buffer, transformation: { width, height }, type: imgType });
        return new TableRow({ children: [new TableCell({ columnSpan: 5, children: [new Paragraph({ children: [imgRun], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })] })] });
      } catch (e) { return null; }
    };

    const partARows = [];
    for (const q of (unitPartA || [])) {
      partARows.push(new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 67, false, AlignmentType.LEFT), createCell(q.marks || "2", 8), createCell(q.co, 10), createCell(q.kLevel, 10)] }));
      if (q.image) { const imgRow = await makeImageRow(q.image, 108, 88); if (imgRow) partARows.push(imgRow); }
    }
    
    const partBRows = [];
    for (const q of (unitPartB || [])) {
      const defaultMark = is2024 ? (q.qNo === 8 ? "8" : "16") : "13";
      if (q.a && q.b) {
        partBRows.push(new TableRow({ children: [createCell(`${q.qNo}.a.`, 8), createCell(q.a.question, 64, false, AlignmentType.LEFT), createCell(q.a.marks || defaultMark, 8), createCell(q.a.co || "CO1", 10), createCell(q.a.kLevel || "K3", 10)] }));
        if (q.a.image) { const imgRow = await makeImageRow(q.a.image, 210, 176); if (imgRow) partBRows.push(imgRow); }
        partBRows.push(new TableRow({ children: [createCell("", 8), createCell("OR", 64, true, AlignmentType.CENTER), createCell("", 8), createCell("", 10), createCell("", 10)] }));
        partBRows.push(new TableRow({ children: [createCell(`${q.qNo}.b.`, 8), createCell(q.b.question, 64, false, AlignmentType.LEFT), createCell(q.b.marks || defaultMark, 8), createCell(q.b.co || "CO1", 10), createCell(q.b.kLevel || "K3", 10)] }));
        if (q.b.image) { const imgRow = await makeImageRow(q.b.image, 210, 176); if (imgRow) partBRows.push(imgRow); }
      } else {
        partBRows.push(new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 67, false, AlignmentType.LEFT), createCell(q.marks || defaultMark, 8), createCell(q.co, 10), createCell(q.kLevel, 10)] }));
        if (q.image) { const imgRow = await makeImageRow(q.image, 210, 176); if (imgRow) partBRows.push(imgRow); }
      }
    }

    const partCRows = [];
    if (!is2024 && unitPartC) {
      for (const q of (unitPartC || [])) {
        if (q.a && q.b) {
          partCRows.push(new TableRow({ children: [createCell(`${q.qNo}.a.`, 8), createCell(q.a.question, 64, false, AlignmentType.LEFT), createCell(q.a.marks || "14", 8), createCell(q.a.co || "CO1", 10), createCell(q.a.kLevel || "K4", 10)] }));
          if (q.a.image) { const imgRow = await makeImageRow(q.a.image, 210, 176); if (imgRow) partCRows.push(imgRow); }
          partCRows.push(new TableRow({ children: [createCell("", 8), createCell("OR", 64, true, AlignmentType.CENTER), createCell("", 8), createCell("", 10), createCell("", 10)] }));
          partCRows.push(new TableRow({ children: [createCell(`${q.qNo}.b.`, 8), createCell(q.b.question, 64, false, AlignmentType.LEFT), createCell(q.b.marks || "14", 8), createCell(q.b.co || "CO1", 10), createCell(q.b.kLevel || "K4", 10)] }));
          if (q.b.image) { const imgRow = await makeImageRow(q.b.image, 210, 176); if (imgRow) partCRows.push(imgRow); }
        } else {
          partCRows.push(new TableRow({ children: [createCell(q.qNo, 5), createCell(q.question, 67, false, AlignmentType.LEFT), createCell(q.marks, 8), createCell(q.co, 10), createCell(q.kLevel, 10)] }));
          if (q.image) { const imgRow = await makeImageRow(q.image, 210, 176); if (imgRow) partCRows.push(imgRow); }
        }
      }
    }

    const docChildren = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Question Paper Code   ", bold: true, size: 18 }),
                      new TextRun({ text: unitHeader.qpCode || "___________", underline: {}, size: 18 })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: "Register No  ", bold: true, size: 18 }),
                      new TextRun({ text: "  | | | | | | | | | | | |  ", underline: {}, size: 18 })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }),
      new Paragraph({ text: " ", spacing: { after: 100 } }),
      new Paragraph({ children: [new TextRun({ text: "St. PETER’S COLLEGE OF ENGINEERING AND TECHNOLOGY", bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "(An Autonomous Institution)", size: 18 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: "AVADI, CHENNAI 600 054", size: 18 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: unitHeader.examSession || "CONTINUOUS INTERNAL ASSESSMENT July 2026", bold: true, size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 50 } }),
      new Paragraph({ children: [new TextRun({ text: unitHeader.semesterWord || "FIFTH SEMESTER", bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: unitHeader.ciaOption || "CIA - 1", bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: unitHeader.department || "", size: 20 })], alignment: AlignmentType.CENTER }),
      ...(unitHeader.commonBranches && unitHeader.commonBranches.trim() ? [
        new Paragraph({ children: [new TextRun({ text: `(Common to: ${unitHeader.commonBranches.trim()})`, size: 18 })], alignment: AlignmentType.CENTER })
      ] : []),
      new Paragraph({ children: [new TextRun({ text: unitHeader.subject || "", bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: unitHeader.regulations || "(Regulations 2021)", size: 18 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ text: " ", spacing: { after: 100 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Duration: " + (unitHeader.duration || "2:00 hours"), bold: true, size: 18 })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Max. Marks: " + (unitHeader.maxMarks || "50"), bold: true, size: 18 })], alignment: AlignmentType.RIGHT })] })] })] }),
      new Paragraph({ children: [new TextRun({ text: "Answer ALL Questions", bold: true, size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART-A (5 × 2 = 10 Marks)", bold: true, size: 19 })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("Marks", 8, true), createCell("CO", 10, true), createCell("K-Level", 10, true)] }), ...partARows]}),
      new Paragraph({ text: " ", spacing: { after: 150 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART-B " + (is2024 ? "(2 × 16 + 1 × 08 = 40 Marks)" : "(2 × 13 = 26 Marks)"), bold: true, size: 19 })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("Marks", 8, true), createCell("CO", 10, true), createCell("K-Level", 10, true)] }), ...partBRows]}),
    ];

    if (!is2024 && partCRows.length > 0) {
      docChildren.push(
        new Paragraph({ text: " ", spacing: { after: 150 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "PART-C (1 × 14 = 14 Marks)", bold: true, size: 19 })], alignment: AlignmentType.CENTER, spacing: { before: 150, after: 150 } })] }), createCell("Marks", 8, true), createCell("CO", 10, true), createCell("K-Level", 10, true)] }), ...partCRows]})
      );
    }

    docChildren.push(
      new Paragraph({ text: " ", spacing: { after: 150 } }),
      new Paragraph({ children: [new TextRun({ text: "Distribution of CO's (Percentage wise)", bold: true, size: 18 })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 } }),
      new Table({ 
        width: { size: 100, type: WidthType.PERCENTAGE }, 
        borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } }, 
        rows: [
          new TableRow({ children: [createCell("Evaluation", 16, true), createCell("CO1", 14, true), createCell("CO2", 14, true), createCell("CO3", 14, true), createCell("CO4", 14, true), createCell("CO5", 14, true), createCell("CO6", 14, true)] }),
          new TableRow({ children: [createCell("Marks", 16, true), createCell(marksArray[0], 14), createCell(marksArray[1], 14), createCell(marksArray[2], 14), createCell(marksArray[3], 14), createCell(marksArray[4], 14), createCell(marksArray[5], 14)] }),
          new TableRow({ children: [createCell("%", 16, true), createCell(percArray[0], 14), createCell(percArray[1], 14), createCell(percArray[2], 14), createCell(percArray[3], 14), createCell(percArray[4], 14), createCell(percArray[5], 14)] })
        ]
      })
    );

    const doc = new Document({
      sections: [{
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Knowledge Level: K1 – Remember; K2 – Understand; K3 – Apply; K4 – Analyze; K5 – Evaluate; K6 – Create", size: 16, color: "555555" })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Page ", size: 16, color: "555555" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "555555" }), new TextRun({ text: " of ", size: 16, color: "555555" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "555555" })] })] }) },
        children: docChildren
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${safeSubject}_UnitTest.docx`);
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