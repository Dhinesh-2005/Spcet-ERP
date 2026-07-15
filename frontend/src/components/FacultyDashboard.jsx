import React, { useState, useEffect } from "react";
import mammoth from "mammoth";
import { API_BASE, exportSemesterPaperDocx, exportUnitTestPaperDocx } from "../utils";

// ✅ FIXED: Added "export default" right here!
export default function FacultyDashboard({ user, onLogout }) {
  const [view, setView] = useState("tasks"); 
  const [templateType, setTemplateType] = useState(1);
  const [myReqs, setMyReqs] = useState([]);
  const [activeTask, setActiveTask] = useState(null); 

  const [header, setHeader] = useState({ examSession: "B.E / B.Tech Degree Examinations", semesters: "", department: user?.department || "CSE", subject: "", regulations: "(Regulations 2021)", requirements: "Nil" });
  const [partA, setPartA] = useState(Array.from({ length: 10 }, (_, i) => ({ qNo: i + 1, question: "", btl: "K1", co: "CO1" })));
  const [partB, setPartB] = useState(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 11, a: { question: "", btl: "K2", co: `CO${i+1}`, marks: "13" }, b: { question: "", btl: "K2", co: `CO${i+1}`, marks: "13" } })));
  const [partC, setPartC] = useState({ qNo: 16, a: { question: "", btl: "K4", co: "CO5", marks: "15" }, b: { question: "", btl: "K4", co: "CO5", marks: "15" } });
  const [customContent, setCustomContent] = useState("");

  const [unitHeader, setUnitHeader] = useState({ examSession: "BE - DEGREE EXAMINATIONS", semesterWord: "", department: "DEPARTMENT OF " + (user?.department || "CSE"), subject: "", regulations: "(Regulations 2021)", duration: "2 Hours", maxMarks: "50" });
  const [unitPartA, setUnitPartA] = useState(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 1, question: "", kLevel: "K1", co: "CO1" })));
  const [unitPartB, setUnitPartB] = useState(Array.from({ length: 2 }, (_, i) => ({ qNo: i + 6, question: "", marks: "13", kLevel: "K2", co: "CO2" })));
  const [unitPartC, setUnitPartC] = useState([{ qNo: 8, question: "", marks: "14", kLevel: "K4", co: "CO3" }]);
  const [coDist, setCoDist] = useState({ marks: ['-','63','-','-','-','-'], perc: ['-','100','-','-','-','-'] });

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
       setView("unit");
    } else {
       setHeader({...header, subject: task.subjectCode, department: task.department});
       setView("semester");
    }
  };

  const handleGenerateWord = async () => {
    const config = { header, partA, partB, partC, customContent };
    await exportSemesterPaperDocx(config, templateType);
    try { 
      await fetch(`${API_BASE}/api/import/save-question-paper`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectCode: header.subject, department: header.department, examSession: header.examSession, hasPartC: templateType === 1, examType: "SEMESTER", facultyName: user.name, paperData: JSON.stringify(config) }) }); 
      if(activeTask) await handleUpdateReqStatus(activeTask.id, "SUBMITTED");
      alert("✅ Document downloaded and sent to Admin Portal!");
      setView("tasks");
    } catch(err) { console.warn(err); }
  };

  const handleGenerateUnitWord = async () => {
    if (!unitHeader.subject || !unitHeader.department) {
      alert("Please fill Subject and Department fields.");
      return;
    }
    const config = { unitHeader, unitPartA, unitPartB, unitPartC, coDistribution: { marks: coDist.marks, percentage: coDist.perc } };
    await exportUnitTestPaperDocx(config);
    try {
      await fetch(`${API_BASE}/api/import/save-question-paper`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectCode: unitHeader.subject, department: unitHeader.department, examSession: unitHeader.examSession, hasPartC: false, examType: "UNIT_TEST", facultyName: user.name, paperData: JSON.stringify(config) }) });
      if(activeTask) await handleUpdateReqStatus(activeTask.id, "SUBMITTED");
      alert("✅ Unit Test Document downloaded and sent to Admin Portal!");
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
                   examSession: "BE - DEGREE EXAMINATIONS", 
                   semesterWord: "", 
                   department: "DEPARTMENT OF " + (user?.department || "CSE"), 
                   subject: "", 
                   regulations: "(Regulations 2021)", 
                   duration: "2 Hours", 
                   maxMarks: "50" 
                 });
                 setUnitPartA(Array.from({ length: 5 }, (_, i) => ({ qNo: i + 1, question: "", kLevel: "K1", co: "CO1" })));
                 setUnitPartB(Array.from({ length: 2 }, (_, i) => ({ qNo: i + 6, question: "", marks: "13", kLevel: "K2", co: "CO2" })));
                 setUnitPartC([{ qNo: 8, question: "", marks: "14", kLevel: "K4", co: "CO3" }]);
                 setCoDist({ marks: ['-','63','-','-','-','-'], perc: ['-','100','-','-','-','-'] });
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
        <header className="bg-white shadow px-6 py-4 flex justify-between items-center z-10 sticky top-0"><div className="flex items-center gap-4"><button onClick={() => setView("tasks")} className="text-gray-500 hover:text-indigo-600 font-bold transition-colors">← Back</button><h1 className="text-xl font-bold text-teal-600 flex items-center gap-2">📋 Unit Test Generator</h1>{activeTask && <span className="bg-teal-100 text-teal-800 text-xs font-bold px-2 py-1 rounded">Task Mode</span>}</div><button onClick={onLogout} className="text-sm text-red-500 font-medium hover:underline">Logout</button></header>
        <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-6">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 text-teal-800">Unit Exam Header</h2>
            <div className="grid grid-cols-2 gap-4">
              <input value={unitHeader.examSession} onChange={e => setUnitHeader({...unitHeader, examSession: e.target.value})} className="p-2 border rounded" placeholder="Exam Session" />
              <select value={unitHeader.semesterWord} onChange={e => setUnitHeader({...unitHeader, semesterWord: e.target.value})} className="p-2 border rounded bg-white text-sm">
                <option value="">Select Semester</option>
                <option value="First Semester">First Semester</option>
                <option value="Second Semester">Second Semester</option>
                <option value="Third Semester">Third Semester</option>
                <option value="Fourth Semester">Fourth Semester</option>
                <option value="Fifth Semester">Fifth Semester</option>
                <option value="Sixth Semester">Sixth Semester</option>
                <option value="Seventh Semester">Seventh Semester</option>
                <option value="Eighth Semester">Eighth Semester</option>
              </select>
              <input value={unitHeader.department} onChange={e => setUnitHeader({...unitHeader, department: e.target.value})} className="p-2 border rounded" placeholder="Department" />
              <input value={unitHeader.subject} onChange={e => setUnitHeader({...unitHeader, subject: e.target.value})} className="p-2 border rounded font-bold text-teal-700" placeholder="Subject" />
              <input value={unitHeader.duration} onChange={e => setUnitHeader({...unitHeader, duration: e.target.value})} className="p-2 border rounded" placeholder="Duration" />
              <input value={unitHeader.maxMarks} onChange={e => setUnitHeader({...unitHeader, maxMarks: e.target.value})} className="p-2 border rounded" placeholder="Max Marks" />
            </div>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Part A (5 x 2 = 10 Marks)</h2>{unitPartA.map((q, index) => (<div key={index} className="flex gap-4 mb-3 items-start border-b pb-3"><span className="font-bold text-gray-500 w-8 pt-2">{q.qNo}.</span><textarea value={q.question} onChange={e => { const newA = [...unitPartA]; newA[index].question = e.target.value; setUnitPartA(newA); }} className="flex-1 p-2 border border-gray-300 rounded resize-none" rows="2" placeholder="Question..." /><input value={q.kLevel} onChange={e => { const newA = [...unitPartA]; newA[index].kLevel = e.target.value; setUnitPartA(newA); }} className="w-16 p-2 border rounded text-center" placeholder="K-Level" /><input value={q.co} onChange={e => { const newA = [...unitPartA]; newA[index].co = e.target.value; setUnitPartA(newA); }} className="w-16 p-2 border rounded text-center" placeholder="CO" /></div>))}</div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Part B (2 x 13 = 26 Marks)</h2>{unitPartB.map((q, index) => (<div key={index} className="flex gap-4 mb-3 items-start border-b pb-3"><span className="font-bold text-gray-500 w-8 pt-2">{q.qNo}.</span><textarea value={q.question} onChange={e => { const newB = [...unitPartB]; newB[index].question = e.target.value; setUnitPartB(newB); }} className="flex-1 p-2 border border-gray-300 rounded resize-none" rows="3" placeholder="Question..." /><input value={q.marks} onChange={e => { const newB = [...unitPartB]; newB[index].marks = e.target.value; setUnitPartB(newB); }} className="w-16 p-2 border rounded text-center" placeholder="Marks" /><input value={q.kLevel} onChange={e => { const newB = [...unitPartB]; newB[index].kLevel = e.target.value; setUnitPartB(newB); }} className="w-16 p-2 border rounded text-center" placeholder="K-Level" /><input value={q.co} onChange={e => { const newB = [...unitPartB]; newB[index].co = e.target.value; setUnitPartB(newB); }} className="w-16 p-2 border rounded text-center" placeholder="CO" /></div>))}</div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Part C (1 x 14 = 14 Marks)</h2><div className="flex gap-4 mb-3 items-start"><span className="font-bold text-gray-500 w-8 pt-2">{unitPartC[0].qNo}.</span><textarea value={unitPartC[0].question} onChange={e => setUnitPartC([{...unitPartC[0], question: e.target.value}])} className="flex-1 p-2 border border-gray-300 rounded resize-none" rows="3" placeholder="Question..." /><input value={unitPartC[0].marks} onChange={e => setUnitPartC([{...unitPartC[0], marks: e.target.value}])} className="w-16 p-2 border rounded text-center" /><input value={unitPartC[0].kLevel} onChange={e => setUnitPartC([{...unitPartC[0], kLevel: e.target.value}])} className="w-16 p-2 border rounded text-center" /><input value={unitPartC[0].co} onChange={e => setUnitPartC([{...unitPartC[0], co: e.target.value}])} className="w-16 p-2 border rounded text-center" /></div></div>
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

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-xl font-bold mb-4">Exam Header Details</h2><div className="grid grid-cols-2 gap-4"><input value={header.examSession} onChange={e => setHeader({...header, examSession: e.target.value})} className="p-2 border rounded" placeholder="Exam Session" /><input value={header.semesters} onChange={e => setHeader({...header, semesters: e.target.value})} className="p-2 border rounded" placeholder="Semester(s)" /><input value={header.department} onChange={e => setHeader({...header, department: e.target.value})} className="p-2 border rounded" placeholder="Department" /><input value={header.subject} onChange={e => setHeader({...header, subject: e.target.value})} className="p-2 border rounded font-bold text-indigo-700" placeholder="Subject Code & Name" /></div></div>
        
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