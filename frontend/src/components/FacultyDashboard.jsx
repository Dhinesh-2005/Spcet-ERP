import React, { useState, useEffect } from "react";
import mammoth from "mammoth";
import { API_BASE, exportSemesterPaperDocx, exportUnitTestPaperDocx } from "../utils";

const DEPARTMENT_OPTIONS = [
  "DEPARTMENT OF CSE",
  "DEPARTMENT OF IT",
  "DEPARTMENT OF ECE",
  "DEPARTMENT OF EEE",
  "DEPARTMENT OF AIDS",
  "DEPARTMENT OF AIML",
  "DEPARTMENT OF MECH",
  "DEPARTMENT OF CIVIL",
  "DEPARTMENT OF BME",
  "DEPARTMENT OF CSBS",
  "DEPARTMENT OF BIOTECH",
  "DEPARTMENT OF AERO"
];

const formatDept = (d) => {
  if (!d) return "DEPARTMENT OF CSE";
  if (d.startsWith("DEPARTMENT OF")) return d;
  return "DEPARTMENT OF " + d;
};

// Helper: reads a File and returns { base64, aspectRatio }
const readImageAsData = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    const img = new Image();
    img.onload = () => resolve({ base64, aspectRatio: img.naturalWidth / img.naturalHeight });
    img.onerror = () => resolve({ base64, aspectRatio: 1 });
    img.src = base64;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Per-question image upload button with thumbnail preview
function QuestionImageUpload({ image, onChange }) {
  const id = React.useId();
  return (
    <div className="flex items-start gap-2 mt-1">
      {image ? (
        <div className="relative group">
          <img src={image.base64} alt="diagram" className="h-16 w-auto max-w-[120px] rounded border border-gray-300 object-contain bg-gray-50" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center leading-none shadow hover:bg-red-600"
            title="Remove image"
          >×</button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="cursor-pointer flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold px-2 py-1 rounded transition-colors whitespace-nowrap"
          title="Attach diagram/image to this question"
        >
          🖼 Add Image
          <input
            id={id}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = await readImageAsData(file);
              onChange(data);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

export default function FacultyDashboard({ user, onLogout }) {
  const [view, setView] = useState("tasks"); 
  const [templateType, setTemplateType] = useState(1);
  const [myReqs, setMyReqs] = useState([]);
  const [activeTask, setActiveTask] = useState(null); 

  const [header, setHeader] = useState({ examSession: "B.E / B.Tech Degree Examinations", semesters: "", department: formatDept(user?.department), subject: "", regulations: "(Regulations 2021)", requirements: "Nil" });
  const [partA, setPartA] = useState(Array.from({ length: 10 }, (_, i) => ({ qNo: i + 1, question: "", btl: "K1", co: "CO1" })));
  const [partB, setPartB] = useState(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 11, a: { question: "", btl: "K2", co: `CO${i+1}`, marks: "13" }, b: { question: "", btl: "K2", co: `CO${i+1}`, marks: "13" } })));
  const [partC, setPartC] = useState({ qNo: 16, a: { question: "", btl: "K4", co: "CO5", marks: "15" }, b: { question: "", btl: "K4", co: "CO5", marks: "15" } });
  const [customContent, setCustomContent] = useState("");
  // Unit test generator states
  const [unitHeader, setUnitHeader] = useState({
    qpCode: "24AD4R011",
    examSessionType: "CONTINUOUS INTERNAL ASSESSMENT",
    examMonth: "JULY",
    examYear: "2026",
    examSession: "CONTINUOUS INTERNAL ASSESSMENT July 2026",
    semesterWord: "FIFTH SEMESTER",
    ciaOption: "CIA - 1",
    department: "Department of Information Technology",
    commonBranches: "",
    subject: "24AD4R011 - Data Communication and Computer Networks",
    regulations: "(Regulations 2024)",
    duration: "2:00 hours",
    maxMarks: "50"
  });

  // State structures for Reg 2021
  const [unitPartA2021, setUnitPartA2021] = useState([
    { qNo: 1, question: "List the functions of Management.", marks: "2", kLevel: "K1", co: "CO1" },
    { qNo: 2, question: "How does effectiveness differ from efficiency?", marks: "2", kLevel: "K1", co: "CO1" },
    { qNo: 3, question: "Distinguish between public and private limited companies.", marks: "2", kLevel: "K1", co: "CO1" },
    { qNo: 4, question: "What is Espirit-de-corps?", marks: "2", kLevel: "K1", co: "CO1" },
    { qNo: 5, question: "What is scientific management?", marks: "2", kLevel: "K1", co: "CO1" }
  ]);
  const [unitPartB2021, setUnitPartB2021] = useState([
    {
      qNo: 6,
      a: { question: "Trace the historical development of management thought and evaluate its significance in modern organizations.", marks: "13", kLevel: "K3", co: "CO1" },
      b: { question: "Discuss the role of organizational culture and external environment in influencing managerial decisions.", marks: "13", kLevel: "K3", co: "CO1" }
    },
    {
      qNo: 7,
      a: { question: "Analyze the functions of management and discuss how they collectively contribute to organizational performance with suitable examples.", marks: "13", kLevel: "K4", co: "CO1" },
      b: { question: "Compare public sector and private sector enterprises with respect to ownership, objectives, and management practices.", marks: "13", kLevel: "K4", co: "CO1" }
    }
  ]);
  const [unitPartC2021, setUnitPartC2021] = useState([
    {
      qNo: 8,
      a: { question: "\"Management is the art of getting work done through people\". Comment on the statement and explain the various functions of management.", marks: "14", kLevel: "K4", co: "CO1" },
      b: { question: "ABC Technologies Ltd. adopted digital transformation, remote working, and AI-based performance monitoring to remain competitive in the global market. While productivity initially improved, employees reported stress, work-life imbalance, and fear of job insecurity. Middle-level managers struggled with virtual leadership and coordination. Ethical concerns related to data privacy and constant monitoring also emerged. High employee turnover forced top management to rethink its management practices. Analyse the current management trends and issues highlighted in the case and suggest suitable managerial measures.", marks: "14", kLevel: "K4", co: "CO1" }
    }
  ]);

  // State structures for Reg 2024 (PART A: 5x2=10, PART B: Q6(16m), Q7(16m), Q8(8m) OR choices)
  const [unitPartA2024, setUnitPartA2024] = useState([
    { qNo: 1, question: "What are the layers in OSI reference model?", marks: "2", kLevel: "K2", co: "CO1" },
    { qNo: 2, question: "Define Full Duplex and Half Duplex transmission system.", marks: "2", kLevel: "K1", co: "CO1" },
    { qNo: 3, question: "What are the four fundamental characteristics that the data communication system depends on?", marks: "2", kLevel: "K2", co: "CO1" },
    { qNo: 4, question: "What is guided transmission media? Give one example.", marks: "2", kLevel: "K2", co: "CO1" },
    { qNo: 5, question: "What is circuit switching network?", marks: "2", kLevel: "K1", co: "CO1" }
  ]);
  const [unitPartB2024, setUnitPartB2024] = useState([
    {
      qNo: 6,
      a: { question: "Apply the concepts of LAN, MAN, WAN, Internet, and Intranet to design a suitable network setup for an educational institution or organization. Justify the selection of each network type.", marks: "16", kLevel: "K3", co: "CO1" },
      b: { question: "Illustrate the working of the TCP/IP protocol suite by applying it to a real-time data communication scenario. Explain the role of each layer with a neat diagram.", marks: "16", kLevel: "K3", co: "CO1" }
    },
    {
      qNo: 7,
      a: { question: "Analyze different network topologies (bus, star, ring, mesh, and hybrid) and determine their suitability for various real-world networking scenarios. Justify your choice with advantages and disadvantages.", marks: "16", kLevel: "K3", co: "CO1" },
      b: { question: "Critically compare the OSI and TCP/IP models in terms of their structure, layering, and protocol functionality. Justify the necessity of layer five in the OSI model, particularly in the context of modern networking protocols like HTTP and FTP.", marks: "16", kLevel: "K4", co: "CO1" }
    },
    {
      qNo: 8,
      a: { question: "Analyze a data communication process and demonstrate how data flows through the 8 different layers of the OSI model. Explain the function of each layer in this context.", marks: "8", kLevel: "K3", co: "CO1" },
      b: { question: "Compare twisted pair, coaxial cable and optical fiber.", marks: "8", kLevel: "K4", co: "CO1" }
    }
  ]);

  const [coDist, setCoDist] = useState({
    marks: ["90", "-", "-", "-", "-", "-"],
    perc: ["100", "-", "-", "-", "-", "-"]
  });

  const [qbUnit, setQbUnit] = useState("Unit 1");
  const [qbSubject, setQbSubject] = useState("");
  const [qbUploadFile, setQbUploadFile] = useState(null);
  const [uploadingQb, setUploadingQb] = useState(false);



  // CLAIM FORM STATE matching Google Form
  const [claimForm, setClaimForm] = useState({
     facultyName: user?.name || "", 
     designation: "", 
     collegeNameCode: "", 
     qpDept: "", 
     examinerDept: user?.department || "", 
     mobile: "", 
     email: "",
     subjectCode: "", 
     subjectName: "", 
     qpType: "1 with key", 
     semesterAndReg: "", 
     amountClaimed: "", 
     mailedConfirmation: false,
     accountNo: "", 
     bankName: "", 
     branchName: "", 
     ifsc: "",
     aicteId: "",
     pan: "",
     address: ""
  });
  const [passbookFiles, setPassbookFiles] = useState(null); 
  const [scannedClaimFile, setScannedClaimFile] = useState(null); 
  const [answerKeyFile, setAnswerKeyFile] = useState(null);
  const [submittingDetails, setSubmittingDetails] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/requisitions/faculty/${user.registerNumber}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setMyReqs(Array.isArray(data) ? data : []))
      .catch(() => setMyReqs([]));
  }, [user.registerNumber]);

  useEffect(() => {
      if(activeTask) {
          setClaimForm(prev => ({
              ...prev,
              subjectCode: activeTask.subjectCode,
              subjectName: activeTask.courseTitle
          }));
      }
  }, [activeTask]);

  const handleUpdateReqStatus = async (id, newStatus) => {
    try {
      await fetch(`${API_BASE}/api/requisitions/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
      setMyReqs(myReqs.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch(err) { alert("Failed to update status"); }
  };

  const handleSubmitClaimForm = async () => {
    if(!claimForm.accountNo || !claimForm.ifsc || !claimForm.pan) return alert("Please fill all mandatory fields (PAN, Account No, IFSC).");
    if(!claimForm.mailedConfirmation) return alert("You must check the box confirming you mailed the documents to coeqp@spcet.ac.in");
    
    setSubmittingDetails(true);
    let autoCalcTotal = 0;
    if (claimForm.qpType === "1 with key") autoCalcTotal = 750 + 500;
    if (claimForm.qpType === "2 with key") autoCalcTotal = (750 * 2) + (500 * 2);
    
    const payload = { 
        ...claimForm, 
        totalAmount: autoCalcTotal.toString() 
    };

    try {
      await fetch(`${API_BASE}/api/requisitions/${activeTask.id}/details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      await handleUpdateReqStatus(activeTask.id, "READY");
    } catch(err) { alert("Failed to save claim details"); }
    setSubmittingDetails(false);
  };

  const startGenerating = (task) => {
    setActiveTask(task);
    if(task.examType === "UNIT_TEST") {
       setUnitHeader({...unitHeader, subject: task.subjectCode, department: task.department});
       setQbSubject(task.subjectCode || "");
       setView("unit");
    } else {
       setHeader({...header, subject: task.subjectCode, department: task.department});
       setView("semester");
    }
  };

  // Computes CO marks distribution from all parts and updates coDist state
  const computeCoDist = (newPartA, newPartB, newPartC) => {
    const coMarks = { CO1: 0, CO2: 0, CO3: 0, CO4: 0, CO5: 0, CO6: 0 };
    const is2024 = unitHeader.regulations.includes("2024");

    // Part A: 2 marks each question
    (newPartA || []).forEach(q => {
      const co = (q.co || "").toUpperCase().trim();
      if (co in coMarks) coMarks[co] += 2;
    });

    // Part B:
    (newPartB || []).forEach(q => {
      const m = parseInt(q.a?.marks || (is2024 ? "16" : "13"), 10);
      const co = (q.a?.co || "").toUpperCase().trim();
      if (co in coMarks) coMarks[co] += isNaN(m) ? (is2024 ? 16 : 13) : m;
    });

    // Part C (for 2021 regulation)
    if (!is2024 && newPartC) {
      newPartC.forEach(q => {
        const co = (q.a?.co || "").toUpperCase().trim();
        if (co in coMarks) coMarks[co] += 14;
      });
    }

    const total = Object.values(coMarks).reduce((s, v) => s + v, 0);
    const coKeys = ["CO1", "CO2", "CO3", "CO4", "CO5", "CO6"];
    const marks = coKeys.map(k => coMarks[k] > 0 ? String(coMarks[k]) : "-");
    const perc  = coKeys.map(k => {
      if (coMarks[k] === 0 || total === 0) return "-";
      return String(Math.round((coMarks[k] / total) * 100));
    });

    setCoDist({ marks, perc });
  };

  const handleUnitChange = (selectedUnit) => {
    setQbUnit(selectedUnit);
    const uMatch = selectedUnit.match(/\d+/);
    const targetCo = uMatch ? `CO${uMatch[0]}` : "CO1";

    const is2024 = unitHeader.regulations.includes("2024");
    if (is2024) {
      const newA = unitPartA2024.map(q => ({ ...q, co: targetCo }));
      const newB = unitPartB2024.map(q => ({ ...q, a: { ...q.a, co: targetCo }, b: { ...q.b, co: targetCo } }));
      setUnitPartA2024(newA);
      setUnitPartB2024(newB);
      computeCoDist(newA, newB, null);
    } else {
      const newA = unitPartA2021.map(q => ({ ...q, co: targetCo }));
      const newB = unitPartB2021.map(q => ({ ...q, a: { ...q.a, co: targetCo }, b: { ...q.b, co: targetCo } }));
      const newC = unitPartC2021.map(q => ({ ...q, a: { ...q.a, co: targetCo }, b: { ...q.b, co: targetCo } }));
      setUnitPartA2021(newA);
      setUnitPartB2021(newB);
      setUnitPartC2021(newC);
      computeCoDist(newA, newB, newC);
    }
  };

  const applyGeneratedData = (data) => {
    if (data.warning) alert(data.warning);

    const unitMatch = (data.unit || qbUnit || "").match(/\d+/);
    const defaultCo = unitMatch ? `CO${unitMatch[0]}` : "CO1";
    const is2024 = unitHeader.regulations.includes("2024");

    if (is2024) {
      let newPartA = unitPartA2024;
      let newPartB = unitPartB2024;

      if (data.partA && data.partA.length > 0) {
        newPartA = unitPartA2024.map((item, i) => ({
          ...item,
          question: data.partA[i]?.question || item.question,
          kLevel:   data.partA[i]?.kLevel   || item.kLevel,
          co:       data.partA[i]?.co        || defaultCo,
        }));
        setUnitPartA2024(newPartA);
      }

      if (data.partB && data.partB.length > 0) {
        // Data contains questions for part B (Q6a/b, Q7a/b, Q8a/b)
        newPartB = unitPartB2024.map((item, i) => ({
          ...item,
          a: {
            ...item.a,
            question: data.partB[i*2]?.question   || item.a.question,
            kLevel:   data.partB[i*2]?.kLevel   || item.a.kLevel,
            co:       data.partB[i*2]?.co       || defaultCo,
            marks:    data.partB[i*2]?.marks    ? String(data.partB[i*2].marks) : item.a.marks
          },
          b: {
            ...item.b,
            question: data.partB[i*2+1]?.question || item.b.question,
            kLevel:   data.partB[i*2+1]?.kLevel || item.b.kLevel,
            co:       data.partB[i*2+1]?.co     || defaultCo,
            marks:    data.partB[i*2+1]?.marks  ? String(data.partB[i*2+1].marks) : item.b.marks
          },
        }));
        setUnitPartB2024(newPartB);
      }
      computeCoDist(newPartA, newPartB, null);
    } else {
      let newPartA = unitPartA2021;
      let newPartB = unitPartB2021;
      let newPartC = unitPartC2021;

      if (data.partA && data.partA.length > 0) {
        newPartA = unitPartA2021.map((item, i) => ({
          ...item,
          question: data.partA[i]?.question || item.question,
          kLevel:   data.partA[i]?.kLevel   || item.kLevel,
          co:       data.partA[i]?.co        || defaultCo,
        }));
        setUnitPartA2021(newPartA);
      }

      if (data.partB && data.partB.length > 0) {
        newPartB = unitPartB2021.map((item, i) => ({
          ...item,
          a: { ...item.a, question: data.partB[i*2]?.question   || item.a.question, kLevel: data.partB[i*2]?.kLevel   || item.a.kLevel, co: data.partB[i*2]?.co   || defaultCo },
          b: { ...item.b, question: data.partB[i*2+1]?.question || item.b.question, kLevel: data.partB[i*2+1]?.kLevel || item.b.kLevel, co: data.partB[i*2+1]?.co || defaultCo },
        }));
        setUnitPartB2021(newPartB);
      }

      if (data.partC && data.partC.length > 0) {
        newPartC = unitPartC2021.map((item, i) => ({
          ...item,
          a: { ...item.a, question: data.partC[i*2]?.question   || item.a.question, kLevel: data.partC[i*2]?.kLevel   || item.a.kLevel, co: data.partC[i*2]?.co   || defaultCo },
          b: { ...item.b, question: data.partC[i*2+1]?.question || item.b.question, kLevel: data.partC[i*2+1]?.kLevel || item.b.kLevel, co: data.partC[i*2+1]?.co || defaultCo },
        }));
        setUnitPartC2021(newPartC);
      }
      computeCoDist(newPartA, newPartB, newPartC);
    }
  };

  const handleGenerateUnitWord = async () => {
    if (!unitHeader.subject || !unitHeader.department) {
      alert("Please fill Subject and Department fields.");
      return;
    }
    try {
      const is2024 = unitHeader.regulations.includes("2024");
      const config = {
        unitHeader,
        unitPartA: is2024 ? unitPartA2024 : unitPartA2021,
        unitPartB: is2024 ? unitPartB2024 : unitPartB2021,
        unitPartC: is2024 ? null : unitPartC2021,
        coDistribution: { marks: coDist.marks, percentage: coDist.perc }
      };
      await exportUnitTestPaperDocx(config);
      try {
        await fetch(`${API_BASE}/api/import/save-question-paper`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectCode: unitHeader.subject, department: unitHeader.department, examSession: unitHeader.examSession, hasPartC: !is2024, examType: "UNIT_TEST", facultyName: user.name, semester: unitHeader.semesterWord, unit: qbUnit, paperData: JSON.stringify(config) }) });
        if(activeTask) await handleUpdateReqStatus(activeTask.id, "SUBMITTED");
      } catch (saveErr) {
        console.warn("Could not save to portal DB:", saveErr);
      }
      alert("✅ Unit Test Document downloaded successfully!");
      if (activeTask) setView("tasks");
    } catch (err) {
      console.error("Error generating unit test paper:", err);
      alert("❌ Failed to generate Unit Test Paper: " + err.message);
    }
  };


  const handleGenerateWord = async () => {
    const config = { header, partA, partB, partC, customContent };
    await exportSemesterPaperDocx(config, templateType);
    try { 
      await fetch(`${API_BASE}/api/import/save-question-paper`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectCode: header.subject, department: header.department, examSession: header.examSession, hasPartC: templateType === 1, examType: "SEMESTER", facultyName: user.name, semester: header.semesters, unit: null, paperData: JSON.stringify(config) }) }); 
      if(activeTask) await handleUpdateReqStatus(activeTask.id, "SUBMITTED");
      alert("✅ Document downloaded and sent to Admin Portal!");
      setView("tasks");
    } catch(err) { console.warn(err); }
  };

  const handleDocxUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const arrayBuffer = await file.arrayBuffer(); const result = await mammoth.extractRawText({ arrayBuffer }); setCustomContent(result.value); alert("✅ Document text successfully extracted!"); } 
    catch (err) { alert("❌ Failed to read DOCX file. Make sure it is a valid Word Document."); }
  };

  if (view === "tasks") {
    const pendingTasks = myReqs.filter(r => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "READY");
    
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
        <header className="bg-white shadow px-6 py-4 flex justify-between items-center z-10 sticky top-0"><h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">👨‍🏫 Faculty Portal</h1><div className="flex items-center gap-4"><button onClick={onLogout} className="text-sm text-red-500 font-medium hover:underline">Logout</button></div></header>
        <main className="flex-1 max-w-5xl mx-auto w-full p-6">
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-2xl font-bold text-slate-800">My Official Tasks</h2>
             <button
               onClick={() => {
                 setActiveTask(null);
                 setUnitHeader({
                   qpCode: "",
                   examSessionType: "CONTINUOUS INTERNAL ASSESSMENT",
                   examMonth: "JULY",
                   examYear: "2026",
                   examSession: "CONTINUOUS INTERNAL ASSESSMENT July 2026",
                   semesterWord: "",
                   ciaOption: "CIA - 1",
                   department: "DEPARTMENT OF " + (user?.department || "CSE"),
                   commonBranches: "",
                   subject: "",
                   regulations: "(Regulations 2024)",
                   duration: "2:00 hours",
                   maxMarks: "50"
                 });
                 setUnitPartA2021(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 1, question: "", marks: "2", kLevel: "K1", co: "CO1" })));
                 setUnitPartB2021([
                   { qNo: 6, a: { question: "", marks: "13", kLevel: "K2", co: "CO2" }, b: { question: "", marks: "13", kLevel: "K2", co: "CO2" } },
                   { qNo: 7, a: { question: "", marks: "13", kLevel: "K3", co: "CO3" }, b: { question: "", marks: "13", kLevel: "K3", co: "CO3" } }
                 ]);
                 setUnitPartC2021([
                   { qNo: 8, a: { question: "", marks: "14", kLevel: "K4", co: "CO4" }, b: { question: "", marks: "14", kLevel: "K4", co: "CO4" } }
                 ]);
                 setUnitPartA2024(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 1, question: "", marks: "2", kLevel: "K1", co: "CO1" })));
                 setUnitPartB2024([
                   { qNo: 6, a: { question: "", marks: "16", kLevel: "K3", co: "CO1" }, b: { question: "", marks: "16", kLevel: "K3", co: "CO1" } },
                   { qNo: 7, a: { question: "", marks: "16", kLevel: "K3", co: "CO1" }, b: { question: "", marks: "16", kLevel: "K3", co: "CO1" } },
                   { qNo: 8, a: { question: "", marks: "8", kLevel: "K3", co: "CO1" }, b: { question: "", marks: "8", kLevel: "K4", co: "CO1" } }
                 ]);
                 setCoDist({ marks: ['-','-','-','-','-','-'], perc: ['-','-','-','-','-','-'] });
                 setView("unit");
               }}
               className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-all active:scale-95 text-sm"
               title="Upload Unit Test Question Paper"
             >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
               </svg>
               <span>Upload Unit Test</span>
             </button>
           </div>
           
           {pendingTasks.length === 0 ? (
              <div className="bg-white p-10 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500">You have no pending question paper requests from the Admin.</div>
           ) : (
              <div className="space-y-6">
                 {pendingTasks.map(task => {
                    const isUrgent = new Date(task.deadline).getTime() - new Date().getTime() < (3 * 24 * 60 * 60 * 1000); 
                    
                    return (
                      <div key={task.id} className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${isUrgent ? 'border-l-red-500' : 'border-l-indigo-500'} border border-gray-200`}>
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <div className="flex items-center gap-2 mb-1">
                                  <span className="bg-gray-100 text-gray-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">{task.examType.replace('_', ' ')}</span>
                                  {isUrgent && <span className="bg-red-100 text-red-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1">⚠️ Urgent</span>}
                               </div>
                               <h3 className="text-xl font-bold text-gray-800">{task.subjectCode} - {task.courseTitle}</h3>
                               <p className="text-sm text-gray-500">{task.department} - Semester {task.semester} (Appt: {task.appointmentLetterNo})</p>
                            </div>
                            <div className="text-right">
                               <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Deadline</p>
                               <p className={`font-bold ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>{task.deadline}</p>
                            </div>
                         </div>
                         
                         {task.status === "PENDING" && (
                            <div className="flex gap-3 mt-4 border-t pt-4">
                               <button onClick={() => { setActiveTask(task); handleUpdateReqStatus(task.id, "ACCEPTED"); }} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm transition-transform active:scale-95">Accept Request</button>
                               <button onClick={() => handleUpdateReqStatus(task.id, "REJECTED")} className="bg-white border border-red-200 text-red-500 hover:bg-red-50 font-bold py-2 px-6 rounded-lg transition-colors">Decline</button>
                            </div>
                         )}

                         {task.status === "ACCEPTED" && activeTask?.id === task.id && (
                            <div className="mt-4 border-t pt-4 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-xl border-t-gray-200">
                               <h4 className="font-bold text-indigo-800 mb-4 text-lg">Official Claim Form & Details</h4>
                               <p className="text-xs text-gray-600 mb-6">Please complete this form to process your remuneration. This must be filled before the generator unlocks.</p>
                               
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name (As per Bank A/c) *</label><input type="text" value={claimForm.facultyName} onChange={e=>setClaimForm({...claimForm, facultyName: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Designation *</label><input type="text" value={claimForm.designation} onChange={e=>setClaimForm({...claimForm, designation: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">College Name & Code *</label><input type="text" value={claimForm.collegeNameCode} onChange={e=>setClaimForm({...claimForm, collegeNameCode: e.target.value})} placeholder="e.g. SPCET (1127)" className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Dept for QP Setting *</label><input type="text" value={claimForm.qpDept} onChange={e=>setClaimForm({...claimForm, qpDept: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Department of Examiner *</label><input type="text" value={claimForm.examinerDept} onChange={e=>setClaimForm({...claimForm, examinerDept: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mobile Number *</label><input type="text" value={claimForm.mobile} onChange={e=>setClaimForm({...claimForm, mobile: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email ID *</label><input type="email" value={claimForm.email} onChange={e=>setClaimForm({...claimForm, email: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Subject Code *</label><input type="text" value={claimForm.subjectCode} readOnly className="w-full p-2 border rounded bg-gray-100 outline-none text-sm font-bold text-gray-600" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name of the Subject *</label><input type="text" value={claimForm.subjectName} readOnly className="w-full p-2 border rounded bg-gray-100 outline-none text-sm font-bold text-gray-600" /></div>
                                  
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Semester and Regulation *</label><input type="text" value={claimForm.semesterAndReg} onChange={e=>setClaimForm({...claimForm, semesterAndReg: e.target.value})} placeholder="e.g. Sem 3 (Reg 2021)" className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">AICTE / Anna Univ ID</label><input type="text" value={claimForm.aicteId} onChange={e=>setClaimForm({...claimForm, aicteId: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">PAN Number *</label><input type="text" value={claimForm.pan} onChange={e=>setClaimForm({...claimForm, pan: e.target.value})} className="w-full p-2 border rounded outline-none text-sm font-mono uppercase" /></div>
                                  <div className="col-span-1 md:col-span-3"><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Official College Address *</label><input type="text" value={claimForm.address} onChange={e=>setClaimForm({...claimForm, address: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                               </div>

                               <h5 className="font-bold text-gray-700 mb-3 border-b pb-1">Bank Details (As per Passbook)</h5>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bank Account No (Only Savings A/C) *</label><input type="text" value={claimForm.accountNo} onChange={e=>setClaimForm({...claimForm, accountNo: e.target.value})} className="w-full p-2 border rounded outline-none font-mono text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bank Name *</label><input type="text" value={claimForm.bankName} onChange={e=>setClaimForm({...claimForm, bankName: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Branch *</label><input type="text" value={claimForm.branchName} onChange={e=>setClaimForm({...claimForm, branchName: e.target.value})} className="w-full p-2 border rounded outline-none text-sm" /></div>
                                  <div><label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">IFSC Code *</label><input type="text" value={claimForm.ifsc} onChange={e=>setClaimForm({...claimForm, ifsc: e.target.value})} className="w-full p-2 border rounded outline-none font-mono uppercase text-sm" /></div>
                               </div>

                               <h5 className="font-bold text-gray-700 mb-3 border-b pb-1">Remuneration & Confirmation</h5>
                               <div className="bg-white p-4 rounded border border-gray-200 mb-6">
                                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                                     <div className="flex-1 w-full">
                                         <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">No of Question Paper *</label>
                                         <select value={claimForm.qpType} onChange={e=>setClaimForm({...claimForm, qpType: e.target.value})} className="w-full p-2 border rounded outline-none text-sm font-bold text-indigo-700">
                                            <option value="1 with key">1 with key</option>
                                            <option value="2 with key">2 with key</option>
                                            <option value="Others (QP Scrutiny)">Others (QP Scrutiny)</option>
                                         </select>
                                     </div>
                                     <div className="flex-1 w-full">
                                         <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Amount Claimed *</label>
                                         <input type="number" value={claimForm.amountClaimed} onChange={e=>setClaimForm({...claimForm, amountClaimed: e.target.value})} placeholder="Rs." className="w-full p-2 border rounded outline-none text-sm font-bold text-green-700" />
                                     </div>
                                  </div>
                                  
                                  <div className="flex items-start gap-3 mt-4 p-3 bg-red-50 border border-red-200 rounded">
                                      <input type="checkbox" checked={claimForm.mailedConfirmation} onChange={e=>setClaimForm({...claimForm, mailedConfirmation: e.target.checked})} className="mt-1 w-5 h-5 accent-red-600" id="mailCheck" />
                                      <label htmlFor="mailCheck" className="text-xs text-red-800 font-medium">Question Paper with Answer Key, Claim Form, Front page of Bank pass book is Mailed to <span className="font-bold">coeqp@spcet.ac.in</span> (Mandatory for Claim upload readable bank pass book) * Yes</label>
                                  </div>
                               </div>

                               <div className="grid grid-cols-1 gap-4 mb-6">
                                  <div className="border border-dashed border-gray-300 p-4 rounded-lg bg-white">
                                     <label className="block text-xs font-bold text-gray-700 mb-1">First Page of Bank Pass book with account details *</label>
                                     <p className="text-[10px] text-gray-500 mb-2">Pls Make sure the readability of uploaded documents. Upload up to 5 supported files: PDF. Max 100 MB per file.</p>
                                     <input type="file" multiple accept=".pdf" onChange={e => setPassbookFiles(e.target.files)} className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700" />
                                  </div>
                                  
                                  <div className="border border-dashed border-gray-300 p-4 rounded-lg bg-white">
                                     <label className="block text-xs font-bold text-gray-700 mb-1">Scanned Copy of Claim Form (Mandatory) *</label>
                                     <p className="text-[10px] text-gray-500 mb-2">Upload 1 supported file: PDF. Max 10 MB.</p>
                                     <input type="file" accept=".pdf" onChange={e => setScannedClaimFile(e.target.files[0])} className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700" />
                                  </div>
                               </div>

                               <button onClick={handleSubmitClaimForm} disabled={submittingDetails} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded shadow-md transition-transform active:scale-95 text-lg">Submit Official Claim & Unlock Generator</button>
                            </div>
                         )}

                         {task.status === "READY" && (
                            <div className="mt-4 border-t pt-4">
                               <div className="bg-green-50 text-green-700 text-sm font-medium p-3 rounded mb-4 flex items-center gap-2">✅ Claim Form Submitted. Generator Unlocked.</div>
                               <button onClick={() => startGenerating(task)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-transform active:scale-95 w-full flex justify-center items-center gap-2">
                                  <span>⚙️</span> Open Question Paper Generator
                               </button>
                            </div>
                         )}
                      </div>
                    );
                 })}
              </div>
           )}
        </main>
      </div>
    );
  }

  if (view === "unit") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
        <header className="bg-white shadow px-6 py-4 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setView("tasks")} className="text-gray-500 hover:text-indigo-600 font-bold transition-colors">← Back</button>
            <h1 className="text-xl font-bold text-teal-600 flex items-center gap-2">📋 Unit Test Generator</h1>
            {activeTask && <span className="bg-teal-100 text-teal-800 text-xs font-bold px-2 py-1 rounded">Task Mode</span>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onLogout} className="text-sm text-red-500 font-medium hover:underline">Logout</button>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-6">

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-teal-800">Unit Exam Header Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Question Paper Code *</label>
                <input value={unitHeader.qpCode} onChange={e => setUnitHeader({...unitHeader, qpCode: e.target.value})} className="w-full p-2 border rounded font-mono font-bold text-teal-900" placeholder="Question Paper Code (e.g. CIA1GE3751)" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">CIA Exam *</label>
                <select value={unitHeader.ciaOption} onChange={e => setUnitHeader({...unitHeader, ciaOption: e.target.value})} className="w-full p-2 border rounded bg-white text-sm font-bold text-teal-800">
                  <option value="CIA - 1">CIA - 1</option>
                  <option value="CIA - 2">CIA - 2</option>
                  <option value="CIA - 3">CIA - 3</option>
                  <option value="CIA - 4">CIA - 4</option>
                  <option value="CIA - 5">CIA - 5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Regulation *</label>
                <select value={unitHeader.regulations} onChange={e => setUnitHeader({...unitHeader, regulations: e.target.value})} className="w-full p-2 border rounded bg-white text-sm font-bold text-teal-800">
                  <option value="(Regulations 2021)">(Regulations 2021)</option>
                  <option value="(Regulations 2024)">(Regulations 2024)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Assessment Type Header</label>
                <div className="p-2 border rounded bg-gray-100 text-sm font-bold text-teal-900 flex items-center gap-2">
                  <span>📝</span> CONTINUOUS INTERNAL ASSESSMENT
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Month *</label>
                  <select value={unitHeader.examMonth} onChange={e => {
                    const newMonth = e.target.value;
                    const newSession = `CONTINUOUS INTERNAL ASSESSMENT ${newMonth} - ${unitHeader.examYear}`;
                    setUnitHeader({...unitHeader, examMonth: newMonth, examSession: newSession});
                  }} className="w-full p-2 border rounded bg-white text-sm font-bold">
                    {["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Year *</label>
                  <input value={unitHeader.examYear} onChange={e => {
                    const newYear = e.target.value;
                    const newSession = `CONTINUOUS INTERNAL ASSESSMENT ${unitHeader.examMonth} - ${newYear}`;
                    setUnitHeader({...unitHeader, examYear: newYear, examSession: newSession});
                  }} className="w-full p-2 border rounded text-sm font-bold" placeholder="2026" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Semester *</label>
                <select value={unitHeader.semesterWord} onChange={e => setUnitHeader({...unitHeader, semesterWord: e.target.value})} className="w-full p-2 border rounded bg-white text-sm font-bold">
                  <option value="">Select Semester</option>
                  <option value="FIRST SEMESTER">FIRST SEMESTER</option>
                  <option value="SECOND SEMESTER">SECOND SEMESTER</option>
                  <option value="THIRD SEMESTER">THIRD SEMESTER</option>
                  <option value="FOURTH SEMESTER">FOURTH SEMESTER</option>
                  <option value="FIFTH SEMESTER">FIFTH SEMESTER</option>
                  <option value="SIXTH SEMESTER">SIXTH SEMESTER</option>
                  <option value="SEVENTH SEMESTER">SEVENTH SEMESTER</option>
                  <option value="EIGHTH SEMESTER">EIGHTH SEMESTER</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Department *</label>
                <select value={unitHeader.department} onChange={e => setUnitHeader({...unitHeader, department: e.target.value})} className="w-full p-2 border rounded bg-white text-sm font-bold text-teal-800">
                  <option value="">Select Department</option>
                  {DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Common to Branches (Optional)</label>
                <div className="flex items-center border rounded bg-white overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
                  <span className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 border-r select-none whitespace-nowrap">Common to Branches</span>
                  <input value={unitHeader.commonBranches} onChange={e => setUnitHeader({...unitHeader, commonBranches: e.target.value})} className="flex-1 p-2 text-sm outline-none font-medium" placeholder="IT, CSE, AIDS (Leave empty if not common)" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Subject Code &amp; Title *</label>
                <input value={unitHeader.subject} onChange={e => setUnitHeader({...unitHeader, subject: e.target.value})} className="w-full p-2 border rounded font-bold text-teal-700" placeholder="e.g. GE3751 PRINCIPLES OF MANAGEMENT" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Duration *</label>
                <input value={unitHeader.duration} onChange={e => setUnitHeader({...unitHeader, duration: e.target.value})} className="w-full p-2 border rounded" placeholder="e.g. 2:00 hours" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Max. Marks *</label>
                <input value={unitHeader.maxMarks} onChange={e => setUnitHeader({...unitHeader, maxMarks: e.target.value})} className="w-full p-2 border rounded" placeholder="e.g. 50" />
              </div>
            </div>
          </div>
          
          {/* ✅ QUESTION BANK: UPLOAD EXCEL → AUTO GENERATE (no DB storage) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-teal-100 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-teal-900 flex items-center gap-2">
                <span>📥</span> Upload Question Bank &amp; Auto-Generate Paper
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Select the unit and upload an Excel file — the question paper will be filled automatically. Questions are <span className="font-semibold text-teal-700">not stored</span> in the database.
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!qbUploadFile) return alert("Please select an Excel file.");

              setUploadingQb(true);
              const body = new FormData();
              body.append("file", qbUploadFile);
              body.append("unit", qbUnit);

              try {
                const res = await fetch(`${API_BASE}/api/question-bank/parse-and-generate`, {
                  method: "POST",
                  body: body,
                });
                const data = await res.json();
                if (res.ok) {
                  applyGeneratedData(data);
                  setQbUploadFile(null);
                  // reset file input
                  e.target.reset();
                } else {
                  alert(data.detail || "Failed to generate from Excel.");
                }
              } catch (err) {
                alert("Error uploading file.");
              }
              setUploadingQb(false);
            }} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-48">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Unit *</label>
                <select
                  value={qbUnit}
                  onChange={e => handleUnitChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Unit 1">Unit 1</option>
                  <option value="Unit 2">Unit 2</option>
                  <option value="Unit 3">Unit 3</option>
                  <option value="Unit 4">Unit 4</option>
                  <option value="Unit 5">Unit 5</option>
                </select>
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Excel File (.xlsx) *</label>
                <input
                  type="file"
                  required
                  accept=".xlsx, .xls"
                  onChange={e => setQbUploadFile(e.target.files[0])}
                  className="w-full text-sm text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </div>
              <button
                type="submit"
                disabled={uploadingQb}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-bold py-2 px-6 rounded shadow transition-all text-sm w-full md:w-auto h-10 flex items-center justify-center gap-2"
              >
                {uploadingQb ? (
                  <><span className="animate-spin">⚙️</span> Generating...</>
                ) : (
                  <><span>🚀</span> Upload &amp; Generate</>
                )}
              </button>
            </form>

            <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 space-y-0.5">
              <p className="font-bold">✨ Auto-Generation Rules ({unitHeader.regulations}):</p>
              {unitHeader.regulations.includes("2024") ? (
                <ul className="list-disc list-inside space-y-0.5">
                  <li>PART-A: 5 questions (Q1 to Q5) - 5 × 2 = 10 Marks.</li>
                  <li>PART-B: Q6 (16 Marks choice), Q7 (16 Marks choice), Q8 (8 Marks choice) = 40 Marks.</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-0.5">
                  <li>PART-A: 5 questions (Q1 to Q5) - 5 × 2 = 10 Marks.</li>
                  <li>PART-B: Q6 (13 Marks choice), Q7 (13 Marks choice) = 26 Marks.</li>
                  <li>PART-C: Q8 (14 Marks choice) = 14 Marks.</li>
                </ul>
              )}
            </div>
          </div>

          {/* PART A SECTION */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4">PART-A (5 × 2 = 10 Marks)</h2>
            {(unitHeader.regulations.includes("2024") ? unitPartA2024 : unitPartA2021).map((q, index) => (
              <div key={index} className="flex gap-4 mb-3 items-start border-b pb-3">
                <span className="font-bold text-gray-500 w-8 pt-2">{q.qNo}.</span>
                <div className="flex-1 flex flex-col gap-1">
                  <textarea
                    value={q.question}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newA = [...unitPartA2024]; newA[index].question = e.target.value; setUnitPartA2024(newA);
                      } else {
                        const newA = [...unitPartA2021]; newA[index].question = e.target.value; setUnitPartA2021(newA);
                      }
                    }}
                    className="w-full p-2 border border-gray-300 rounded resize-none"
                    rows="2"
                    placeholder="Question..."
                  />
                  <QuestionImageUpload
                    image={q.image}
                    onChange={img => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newA = [...unitPartA2024]; newA[index].image = img; setUnitPartA2024(newA);
                      } else {
                        const newA = [...unitPartA2021]; newA[index].image = img; setUnitPartA2021(newA);
                      }
                    }}
                  />
                </div>
                <input
                  value={q.kLevel}
                  onChange={e => {
                    if (unitHeader.regulations.includes("2024")) {
                      const newA = [...unitPartA2024]; newA[index].kLevel = e.target.value; setUnitPartA2024(newA);
                    } else {
                      const newA = [...unitPartA2021]; newA[index].kLevel = e.target.value; setUnitPartA2021(newA);
                    }
                  }}
                  className="w-16 p-2 border rounded text-center"
                  placeholder="K-Level"
                />
                <input
                  value={q.co}
                  onChange={e => {
                    if (unitHeader.regulations.includes("2024")) {
                      const newA = [...unitPartA2024]; newA[index].co = e.target.value; setUnitPartA2024(newA);
                    } else {
                      const newA = [...unitPartA2021]; newA[index].co = e.target.value; setUnitPartA2021(newA);
                    }
                  }}
                  className="w-16 p-2 border rounded text-center"
                  placeholder="CO"
                />
              </div>
            ))}
          </div>

          {/* PART B SECTION */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-teal-800">
              {unitHeader.regulations.includes("2024") ? "PART-B (2 × 16 + 1 × 08 = 40 Marks)" : "PART-B (2 × 13 = 26 Marks)"}
            </h2>
            {(unitHeader.regulations.includes("2024") ? unitPartB2024 : unitPartB2021).map((q, index) => (
              <div key={index} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <div className="font-bold text-lg text-slate-800">Question {q.qNo}</div>
                <div className="flex gap-4 items-start">
                  <span className="font-bold text-slate-700 pt-2 font-mono whitespace-nowrap">{q.qNo}. (a)</span>
                  <div className="flex-1 flex flex-col gap-1">
                    <textarea
                      value={q.a.question}
                      onChange={e => {
                        if (unitHeader.regulations.includes("2024")) {
                          const newB = [...unitPartB2024]; newB[index].a.question = e.target.value; setUnitPartB2024(newB);
                        } else {
                          const newB = [...unitPartB2021]; newB[index].a.question = e.target.value; setUnitPartB2021(newB);
                        }
                      }}
                      className="w-full p-2 border border-gray-300 rounded resize-none"
                      rows="2"
                      placeholder="Option A question..."
                    />
                    <QuestionImageUpload
                      image={q.a.image}
                      onChange={img => {
                        if (unitHeader.regulations.includes("2024")) {
                          const newB = [...unitPartB2024]; newB[index].a.image = img; setUnitPartB2024(newB);
                        } else {
                          const newB = [...unitPartB2021]; newB[index].a.image = img; setUnitPartB2021(newB);
                        }
                      }}
                    />
                  </div>
                  <input
                    value={q.a.marks}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].a.marks = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].a.marks = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="Marks"
                  />
                  <input
                    value={q.a.kLevel}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].a.kLevel = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].a.kLevel = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="K-Level"
                  />
                  <input
                    value={q.a.co}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].a.co = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].a.co = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="CO"
                  />
                </div>
                <div className="text-center font-bold text-gray-400 text-sm italic my-1">(OR)</div>
                <div className="flex gap-4 items-start">
                  <span className="font-bold text-slate-700 pt-2 font-mono whitespace-nowrap">{q.qNo}. (b)</span>
                  <div className="flex-1 flex flex-col gap-1">
                    <textarea
                      value={q.b.question}
                      onChange={e => {
                        if (unitHeader.regulations.includes("2024")) {
                          const newB = [...unitPartB2024]; newB[index].b.question = e.target.value; setUnitPartB2024(newB);
                        } else {
                          const newB = [...unitPartB2021]; newB[index].b.question = e.target.value; setUnitPartB2021(newB);
                        }
                      }}
                      className="w-full p-2 border border-gray-300 rounded resize-none"
                      rows="2"
                      placeholder="Option B question..."
                    />
                    <QuestionImageUpload
                      image={q.b.image}
                      onChange={img => {
                        if (unitHeader.regulations.includes("2024")) {
                          const newB = [...unitPartB2024]; newB[index].b.image = img; setUnitPartB2024(newB);
                        } else {
                          const newB = [...unitPartB2021]; newB[index].b.image = img; setUnitPartB2021(newB);
                        }
                      }}
                    />
                  </div>
                  <input
                    value={q.b.marks}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].b.marks = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].b.marks = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="Marks"
                  />
                  <input
                    value={q.b.kLevel}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].b.kLevel = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].b.kLevel = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="K-Level"
                  />
                  <input
                    value={q.b.co}
                    onChange={e => {
                      if (unitHeader.regulations.includes("2024")) {
                        const newB = [...unitPartB2024]; newB[index].b.co = e.target.value; setUnitPartB2024(newB);
                      } else {
                        const newB = [...unitPartB2021]; newB[index].b.co = e.target.value; setUnitPartB2021(newB);
                      }
                    }}
                    className="w-16 p-2 border rounded text-center"
                    placeholder="CO"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* PART C SECTION (Only for Reg 2021) */}
          {!unitHeader.regulations.includes("2024") && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-4 text-purple-800">PART-C (1 × 14 = 14 Marks) - (Q8a or Q8b)</h2>
              {unitPartC2021.map((q, index) => (
                <div key={index} className="p-4 bg-purple-50/50 rounded-lg border border-purple-200 space-y-3">
                  <div className="font-bold text-lg text-purple-900">Question {q.qNo}</div>
                  <div className="flex gap-4 items-start">
                    <span className="font-bold text-slate-700 pt-2 font-mono whitespace-nowrap">{q.qNo}. (a)</span>
                    <div className="flex-1 flex flex-col gap-1">
                      <textarea value={q.a.question} onChange={e => { const newC = [...unitPartC2021]; newC[index].a.question = e.target.value; setUnitPartC2021(newC); }} className="w-full p-2 border border-gray-300 rounded resize-none" rows="2" placeholder="Option A question..." />
                      <QuestionImageUpload image={q.a.image} onChange={img => { const newC = [...unitPartC2021]; newC[index].a.image = img; setUnitPartC2021(newC); }} />
                    </div>
                    <input value={q.a.marks} onChange={e => { const newC = [...unitPartC2021]; newC[index].a.marks = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="Marks" />
                    <input value={q.a.kLevel} onChange={e => { const newC = [...unitPartC2021]; newC[index].a.kLevel = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="K-Level" />
                    <input value={q.a.co} onChange={e => { const newC = [...unitPartC2021]; newC[index].a.co = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="CO" />
                  </div>
                  <div className="text-center font-bold text-gray-400 text-sm italic my-1">(OR)</div>
                  <div className="flex gap-4 items-start">
                    <span className="font-bold text-slate-700 pt-2 font-mono whitespace-nowrap">{q.qNo}. (b)</span>
                    <div className="flex-1 flex flex-col gap-1">
                      <textarea value={q.b.question} onChange={e => { const newC = [...unitPartC2021]; newC[index].b.question = e.target.value; setUnitPartC2021(newC); }} className="w-full p-2 border border-gray-300 rounded resize-none" rows="2" placeholder="Option B question..." />
                      <QuestionImageUpload image={q.b.image} onChange={img => { const newC = [...unitPartC2021]; newC[index].b.image = img; setUnitPartC2021(newC); }} />
                    </div>
                    <input value={q.b.marks} onChange={e => { const newC = [...unitPartC2021]; newC[index].b.marks = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="Marks" />
                    <input value={q.b.kLevel} onChange={e => { const newC = [...unitPartC2021]; newC[index].b.kLevel = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="K-Level" />
                    <input value={q.b.co} onChange={e => { const newC = [...unitPartC2021]; newC[index].b.co = e.target.value; setUnitPartC2021(newC); }} className="w-16 p-2 border rounded text-center" placeholder="CO" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Distribution of COs</h2><div className="grid grid-cols-7 gap-2 text-center font-bold text-sm bg-gray-100 p-2 rounded"><div>Evaluation</div><div>CO1</div><div>CO2</div><div>CO3</div><div>CO4</div><div>CO5</div><div>CO6</div></div><div className="grid grid-cols-7 gap-2 mt-2"><div className="font-bold pt-2 text-center">Marks</div>{coDist.marks.map((m, i) => <input key={`m${i}`} value={m} onChange={e => { const nm = [...coDist.marks]; nm[i] = e.target.value; setCoDist({...coDist, marks: nm}) }} className="border p-2 text-center rounded" />)}</div><div className="grid grid-cols-7 gap-2 mt-2"><div className="font-bold pt-2 text-center">%</div>{coDist.perc.map((p, i) => <input key={`p${i}`} value={p} onChange={e => { const np = [...coDist.perc]; np[i] = e.target.value; setCoDist({...coDist, perc: np}) }} className="border p-2 text-center rounded" />)}</div></div>
          <div className="flex justify-end pt-4 pb-10"><button onClick={handleGenerateUnitWord} className="bg-teal-600 text-white font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-teal-700 active:scale-95 transition-all text-lg flex items-center gap-2">📄 Submit & Download Unit Test</button></div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
      <header className="bg-white shadow px-6 py-4 flex justify-between items-center z-10 sticky top-0"><div className="flex items-center gap-4"><button onClick={() => setView("tasks")} className="text-gray-500 hover:text-indigo-600 font-bold transition-colors">← Back</button><h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">📝 Semester Question Paper Generator</h1>{activeTask && <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">Task Mode</span>}</div><button onClick={onLogout} className="text-sm text-red-500 font-medium hover:underline">Logout</button></header>
      <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-6">
        
        {/* ✅ TEMPLATE FORMAT TOGGLE */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-indigo-900">Template Format</h2>
            <p className="text-sm text-gray-500">Select the template format for this question paper.</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setTemplateType(1)} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${templateType === 1 ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Template 1</button>
            <button onClick={() => setTemplateType(2)} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${templateType === 2 ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Template 2</button>
            <button onClick={() => setTemplateType(3)} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${templateType === 3 ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Template 3 (Custom)</button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Exam Header Details</h2><div className="grid grid-cols-2 gap-4"><input value={header.examSession} onChange={e => setHeader({...header, examSession: e.target.value})} className="p-2 border rounded" placeholder="Exam Session" /><input value={header.semesters} onChange={e => setHeader({...header, semesters: e.target.value})} className="p-2 border rounded" placeholder="Semester(s)" /><select value={header.department} onChange={e => setHeader({...header, department: e.target.value})} className="p-2 border rounded bg-white text-sm font-bold text-indigo-800"><option value="">Select Department</option>{DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select><input value={header.subject} onChange={e => setHeader({...header, subject: e.target.value})} className="p-2 border rounded font-bold text-indigo-700" placeholder="Subject Code & Name" /></div></div>
        
        {templateType === 3 ? (
           <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-bold text-orange-800">Custom Paper Content</h2>
                 <label className="bg-orange-100 text-orange-800 border border-orange-300 font-bold py-2 px-4 rounded-lg cursor-pointer hover:bg-orange-200 transition-colors shadow-sm text-sm">
                    📄 Import from .docx
                    <input type="file" accept=".docx" onChange={handleDocxUpload} className="hidden" />
                 </label>
             </div>
             <p className="text-sm text-gray-500 mb-4">Type or paste your custom question paper here, OR click the button above to upload an existing `.docx` file to automatically extract the text!</p>
             <textarea value={customContent} onChange={e => setCustomContent(e.target.value)} className="w-full h-96 p-4 border border-gray-300 rounded font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="PART A\n1. Explain XYZ...\n2. What is ABC?\n\nPART B\n3. Calculate..." />
           </div>
        ) : (
           <>
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4 text-blue-800">Part A (10 x 2 = 20 Marks)</h2>{partA.map((q, index) => (<div key={index} className="flex gap-4 mb-3 items-start border-b pb-3"><span className="font-bold text-gray-500 w-8 pt-2">Q{q.qNo}.</span><textarea value={q.question} onChange={e => { const newA = [...partA]; newA[index].question = e.target.value; setPartA(newA); }} className="flex-1 p-2 border border-gray-300 rounded resize-none" rows="2" placeholder="Type question here..." /><input value={q.btl} onChange={e => { const newA = [...partA]; newA[index].btl = e.target.value; setPartA(newA); }} className="w-16 p-2 border rounded text-center" placeholder="BTL" /><input value={q.co} onChange={e => { const newA = [...partA]; newA[index].co = e.target.value; setPartA(newA); }} className="w-16 p-2 border rounded text-center" placeholder="CO" /></div>))}</div>
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4 text-green-800">Part B (5 x {templateType === 1 ? "13 = 65" : "16 = 80"} Marks)</h2>{partB.map((q, index) => (<div key={index} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200"><div className="font-bold text-lg mb-2 text-gray-700">Question {q.qNo}</div><div className="flex gap-4 mb-2"><span className="font-bold text-gray-500 pt-2">(a)</span><textarea value={q.a.question} onChange={e => { const newB = [...partB]; newB[index].a.question = e.target.value; setPartB(newB); }} className="flex-1 p-2 border rounded" rows="2" placeholder="Option A question..." /><input value={q.a.btl} onChange={e => { const newB = [...partB]; newB[index].a.btl = e.target.value; setPartB(newB); }} className="w-16 p-2 border rounded text-center" /><input value={q.a.co} onChange={e => { const newB = [...partB]; newB[index].a.co = e.target.value; setPartB(newB); }} className="w-16 p-2 border rounded text-center" /></div><div className="text-center font-bold text-gray-400 text-sm italic my-1">(OR)</div><div className="flex gap-4"><span className="font-bold text-gray-500 pt-2">(b)</span><textarea value={q.b.question} onChange={e => { const newB = [...partB]; newB[index].b.question = e.target.value; setPartB(newB); }} className="flex-1 p-2 border rounded" rows="2" placeholder="Option B question..." /><input value={q.b.btl} onChange={e => { const newB = [...partB]; newB[index].b.btl = e.target.value; setPartB(newB); }} className="w-16 p-2 border rounded text-center" /><input value={q.b.co} onChange={e => { const newB = [...partB]; newB[index].b.co = e.target.value; setPartB(newB); }} className="w-16 p-2 border rounded text-center" /></div></div>))}</div>
              
              {templateType === 1 && (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4 text-purple-800">Part C (1 x 15 = 15 Marks)</h2><div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200"><div className="font-bold text-lg mb-2 text-gray-700">Question {partC.qNo}</div><div className="flex gap-4 mb-2"><span className="font-bold text-gray-500 pt-2">(a)</span><textarea value={partC.a.question} onChange={e => setPartC({ ...partC, a: { ...partC.a, question: e.target.value } })} className="flex-1 p-2 border rounded" rows="2" placeholder="Option A question..." /><input value={partC.a.btl} onChange={e => setPartC({ ...partC, a: { ...partC.a, btl: e.target.value } })} className="w-16 p-2 border rounded text-center" /><input value={partC.a.co} onChange={e => setPartC({ ...partC, a: { ...partC.a, co: e.target.value } })} className="w-16 p-2 border rounded text-center" /></div><div className="text-center font-bold text-gray-400 text-sm italic my-1">(OR)</div><div className="flex gap-4"><span className="font-bold text-gray-500 pt-2">(b)</span><textarea value={partC.b.question} onChange={e => setPartC({ ...partC, b: { ...partC.b, question: e.target.value } })} className="flex-1 p-2 border rounded" rows="2" placeholder="Option B question..." /><input value={partC.b.btl} onChange={e => setPartC({ ...partC, b: { ...partC.b, btl: e.target.value } })} className="w-16 p-2 border rounded text-center" /><input value={partC.b.co} onChange={e => setPartC({ ...partC, b: { ...partC.b, co: e.target.value } })} className="w-16 p-2 border rounded text-center" /></div></div></div>
              )}
           </>
        )}

        <div className="flex justify-end pt-4 pb-10"><button onClick={handleGenerateWord} className="bg-indigo-600 text-white font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-indigo-700 active:scale-95 transition-all text-lg flex items-center gap-2">📄 {activeTask ? "Submit Task & Download" : "Submit & Download Word Template"}</button></div>
      </main>
    </div>
  );
}