import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function GPACalculator() {
  const [mode, setMode] = useState("GPA"); // Toggle between GPA and CGPA
  const gradePoints = { "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "U": 0, "RA": 0, "AB": 0, "SA": 0, "W": 0 };

  const [gpaRows, setGpaRows] = useState([{ id: 1, subject: "", grade: "O", credits: 3 }]);
  const [gpaResult, setGpaResult] = useState(null);

  const [semesters, setSemesters] = useState([
    { id: 1, name: "Semester 1", rows: [{ id: 101, subject: "", grade: "O", credits: 3 }] }
  ]);
  const [cgpaResult, setCgpaResult] = useState(null);
  const [openSem, setOpenSem] = useState(1);

  const addGpaRow = () => setGpaRows([...gpaRows, { id: Date.now(), subject: "", grade: "O", credits: 3 }]);
  const removeGpaRow = (id) => setGpaRows(gpaRows.filter(r => r.id !== id));
  const updateGpaRow = (id, field, val) => setGpaRows(gpaRows.map(r => r.id === id ? { ...r, [field]: val } : r));

  const calculateGPA = () => {
    let totalPoints = 0; let totalCredits = 0;
    gpaRows.forEach(r => {
      const cr = Number(r.credits) || 0;
      const pts = gradePoints[r.grade.toUpperCase()] || 0;
      totalPoints += (pts * cr); totalCredits += cr;
    });
    setGpaResult(totalCredits > 0 ? (totalPoints / totalCredits).toFixed(3) : "0.000");
  };

  const addSemester = () => {
    const newId = Date.now();
    setSemesters([...semesters, { id: newId, name: `Semester ${semesters.length + 1}`, rows: [{ id: Date.now() + 1, subject: "", grade: "O", credits: 3 }] }]);
    setOpenSem(newId);
  };
  const removeSemester = (id) => setSemesters(semesters.filter(s => s.id !== id));
  const addCgpaRow = (semId) => setSemesters(semesters.map(s => s.id === semId ? { ...s, rows: [...s.rows, { id: Date.now(), subject: "", grade: "O", credits: 3 }] } : s));
  const removeCgpaRow = (semId, rowId) => setSemesters(semesters.map(s => s.id === semId ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } : s));
  const updateCgpaRow = (semId, rowId, field, val) => setSemesters(semesters.map(s => s.id === semId ? { ...s, rows: s.rows.map(r => r.id === rowId ? { ...r, [field]: val } : r) } : s));

  const calculateCGPA = () => {
    let totalPoints = 0; let totalCredits = 0;
    semesters.forEach(sem => {
      sem.rows.forEach(r => {
        const cr = Number(r.credits) || 0;
        const pts = gradePoints[r.grade.toUpperCase()] || 0;
        totalPoints += (pts * cr); totalCredits += cr;
      });
    });
    setCgpaResult(totalCredits > 0 ? (totalPoints / totalCredits).toFixed(3) : "0.000");
  };

  const renderRow = (row, onUpdate, onRemove) => (
    <motion.div key={row.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="grid grid-cols-12 gap-3 items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm mb-2">
      <div className="col-span-5"><input type="text" placeholder="Subject..." value={row.subject} onChange={(e) => onUpdate(row.id, "subject", e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-gray-700" /></div>
      <div className="col-span-3"><select value={row.grade} onChange={(e) => onUpdate(row.id, "grade", e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-indigo-700 bg-white">{Object.keys(gradePoints).map(g => <option key={g} value={g}>{g} ({gradePoints[g]} pts)</option>)}</select></div>
      <div className="col-span-3"><input type="number" min="1" max="10" value={row.credits} onChange={(e) => onUpdate(row.id, "credits", e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-center" /></div>
      <div className="col-span-1 text-center"><button onClick={() => onRemove(row.id)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded transition-colors" title="Remove">✖</button></div>
    </motion.div>
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b pb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-indigo-800">🎓 Academic Calculator</h2>
          <div className="flex gap-2 mt-2 bg-indigo-50 p-1 rounded-lg w-fit">
            <button onClick={() => setMode("GPA")} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${mode === "GPA" ? "bg-white text-indigo-700 shadow-sm" : "text-indigo-400 hover:text-indigo-600"}`}>GPA (1 Semester)</button>
            <button onClick={() => setMode("CGPA")} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${mode === "CGPA" ? "bg-white text-indigo-700 shadow-sm" : "text-indigo-400 hover:text-indigo-600"}`}>CGPA (All Semesters)</button>
          </div>
        </div>
        {(mode === "GPA" ? gpaResult : cgpaResult) !== null && (
          <div className="bg-indigo-600 text-white px-6 py-2 rounded-lg shadow-md text-center min-w-[120px]">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80">Calculated {mode}</div>
            <div className="text-2xl font-black">{mode === "GPA" ? gpaResult : cgpaResult}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-3 px-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
        <div className="col-span-5">Subject</div><div className="col-span-3">Grade</div><div className="col-span-3">Credits</div><div className="col-span-1 text-center">Del</div>
      </div>

      {mode === "GPA" && (
        <div className="space-y-2 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <AnimatePresence>{gpaRows.map(row => renderRow(row, updateGpaRow, removeGpaRow))}</AnimatePresence>
          <button onClick={addGpaRow} className="w-full py-2 border-2 border-dashed border-indigo-200 text-indigo-600 font-bold rounded-lg hover:bg-indigo-50 transition-colors">+ Add Subject</button>
        </div>
      )}

      {mode === "CGPA" && (
        <div className="space-y-4 mb-6">
          {semesters.map((sem, index) => (
             <div key={sem.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div onClick={() => setOpenSem(openSem === sem.id ? null : sem.id)} className="bg-indigo-50 px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-indigo-100 transition-colors">
                   <div className="flex items-center gap-3">
                      <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</span>
                      <h3 className="font-bold text-indigo-900">{sem.name}</h3>
                   </div>
                   <div className="flex items-center gap-4">
                     {semesters.length > 1 && <button onClick={(e) => { e.stopPropagation(); removeSemester(sem.id); }} className="text-red-500 hover:underline text-xs font-bold px-2 py-1 bg-red-50 rounded">Delete Sem</button>}
                     <span className="text-indigo-400 font-bold">{openSem === sem.id ? "▲" : "▼"}</span>
                   </div>
                </div>
                <AnimatePresence>
                   {openSem === sem.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-gray-50 p-4">
                         {sem.rows.map(row => renderRow(row, (rId, f, v) => updateCgpaRow(sem.id, rId, f, v), (rId) => removeCgpaRow(sem.id, rId)))}
                         <button onClick={() => addCgpaRow(sem.id)} className="w-full mt-2 py-2 border-2 border-dashed border-indigo-200 text-indigo-600 font-bold rounded-lg hover:bg-indigo-50 transition-colors">+ Add Subject to {sem.name}</button>
                      </motion.div>
                   )}
                </AnimatePresence>
             </div>
          ))}
          <button onClick={addSemester} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors">+ Add New Semester</button>
        </div>
      )}

      <button onClick={mode === "GPA" ? calculateGPA : calculateCGPA} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-lg shadow-md transition-transform active:scale-95 text-lg flex justify-center items-center gap-2">
        🧮 Calculate Final {mode}
      </button>
    </div>
  );
}