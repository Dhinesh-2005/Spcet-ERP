import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { API_BASE } from "../utils";

export default function HodDashboard({ user, onLogout }) {
  const [semester, setSemester] = useState("3");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/api/import/logins`)
      .then(res => res.json())
      .catch(() => []) 
      .then(data => {
        if(Array.isArray(data)) {
            const map = {};
            data.forEach(s => map[s.registerNumber] = s.name);
            setStudents(map);
        }
      });
  }, []);

  useEffect(() => {
    async function fetchResults() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/import/preview?semester=${semester}&department=${user.department}&_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        } else {
          setResults([]);
        }
      } catch (e) {
        setResults([]);
      }
      setLoading(false);
    }
    if (user.department) fetchResults();
  }, [semester, user.department]);

  const processData = () => {
    const grouped = {};
    const allSubjects = new Set();
    results.forEach((r) => {
      if (!grouped[r.registerNumber]) {
        grouped[r.registerNumber] = {
          registerNumber: r.registerNumber,
          name: students[r.registerNumber] || "Unknown",
          grades: {}
        };
      }
      grouped[r.registerNumber].grades[r.subjectCode] = r.grade;
      allSubjects.add(r.subjectCode);
    });
    const sortedSubjects = Array.from(allSubjects).sort();
    const rows = Object.values(grouped).sort((a, b) => a.registerNumber.localeCompare(b.registerNumber));
    return { rows, subjects: sortedSubjects };
  };

  const { rows, subjects } = processData();

  const handleDownload = () => {
    const excelData = rows.map(row => {
      const flatRow = { "Register Number": row.registerNumber, "Name": row.name };
      subjects.forEach(sub => flatRow[sub] = row.grades[sub] || "-");
      return flatRow;
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Results_${user.department}_Sem${semester}`);
    XLSX.writeFile(wb, `${user.department}_Sem_${semester}_Results.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            👨‍🏫 HOD Portal <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">{user.department}</span>
          </h2>
        </div>
        <button onClick={onLogout} className="text-red-500 hover:text-red-700 text-sm font-medium">Logout</button>
      </div>

      <div className="max-w-6xl mx-auto w-full p-8">
        <div className="flex flex-wrap items-end gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Semester</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="w-32 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              {[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}
            </select>
          </div>
          {rows.length > 0 && (
            <button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md">
              Download Report
            </button>
          )}
        </div>
        
        {rows.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-4 text-left">Reg No</th>
                        <th className="p-4 text-left">Name</th>
                        {subjects.map(sub => <th key={sub} className="p-4 text-center">{sub}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <tr key={row.registerNumber} className="hover:bg-indigo-50">
                          <td className="p-3 font-mono">{row.registerNumber}</td>
                          <td className="p-3">{row.name}</td>
                          {subjects.map(sub => (
                            <td key={sub} className="p-3 text-center font-bold text-gray-700">
                              {row.grades[sub] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
        ) : (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
                No published results found for {user.department} {Number(semester) === 99 ? "Graduates" : `Semester ${semester}`}.
            </div>
        )}
      </div>
    </div>
  );
}