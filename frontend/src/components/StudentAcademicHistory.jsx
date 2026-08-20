import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

export default function StudentAcademicHistory({ registerNumber: propRegNo, user, onClose }) {
  const registerNumber = propRegNo || user?.registerNumber;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSem, setActiveSem] = useState(null);

  useEffect(() => {
    if (!registerNumber) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/students/${registerNumber}/academic-history`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load academic history");
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        if (resData.semesters && resData.semesters.length > 0) {
          setActiveSem(resData.semesters[resData.semesters.length - 1].semester);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error loading academic history");
        setLoading(false);
      });
  }, [registerNumber]);

  if (loading) {
    return (
      <div className="p-8 text-center bg-white rounded-xl shadow border border-gray-100">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3"></div>
        <p className="text-gray-600 font-medium">Loading Academic Profile & Marks...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200">
        <p className="font-bold">Academic Record Unavailable</p>
        <p className="text-sm mt-1">{error || "No student record found."}</p>
        {onClose && (
          <button onClick={onClose} className="mt-4 px-4 py-1.5 bg-red-600 text-white font-bold rounded-lg text-sm hover:bg-red-700">
            Close
          </button>
        )}
      </div>
    );
  }

  const currentSemData = data.semesters.find((s) => s.semester === activeSem) || data.semesters[0];

  return (
    <div className="space-y-6">
      {/* Student Overview Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4">
          <svg className="w-64 h-64 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-block px-3 py-1 bg-indigo-500/30 backdrop-blur-md rounded-full text-xs font-semibold text-indigo-200 border border-indigo-400/30 mb-2">
              Academic Record Profile
            </div>
            <h2 className="text-2xl font-black tracking-tight">{data.name}</h2>
            <div className="text-slate-300 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span><strong className="text-white">Reg No:</strong> {data.registerNumber}</span>
              <span><strong className="text-white">Dept:</strong> {data.department}</span>
              <span><strong className="text-white">Current Sem:</strong> Semester {data.currentSemester}</span>
              {data.batch && <span><strong className="text-white">Batch:</strong> {data.batch}</span>}
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
            <div className="text-center px-3 border-r border-white/20">
              <div className="text-xs uppercase tracking-wider text-indigo-200 font-semibold">Overall CGPA</div>
              <div className="text-3xl font-black text-amber-400 mt-0.5">{data.overallCgpa.toFixed(2)}</div>
            </div>
            <div className="text-center px-3">
              <div className="text-xs uppercase tracking-wider text-indigo-200 font-semibold">Total Credits</div>
              <div className="text-3xl font-black text-emerald-400 mt-0.5">{data.totalEarnedCredits}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Semester Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200">
        {data.semesters.map((s) => (
          <button
            key={s.semester}
            onClick={() => setActiveSem(s.semester)}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${
              activeSem === s.semester
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <span>Semester {s.semester}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeSem === s.semester ? "bg-indigo-700 text-white" : "bg-gray-100 text-gray-700"}`}>
              GPA {s.gpa.toFixed(2)}
            </span>
          </button>
        ))}
      </div>

      {/* Selected Semester Details */}
      {currentSemData && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Semester {currentSemData.semester} Subject Breakdown</h3>
              <p className="text-xs text-gray-500 mt-0.5">Showing individual academic scores and credits</p>
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                Semester GPA: <strong>{currentSemData.gpa.toFixed(2)}</strong>
              </span>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                Earned Credits: <strong>{currentSemData.earnedCredits} / {currentSemData.totalCredits}</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-gray-600 font-bold uppercase text-[11px] tracking-wider border-y border-gray-200">
                <tr>
                  <th className="py-3 px-4">Subject Code</th>
                  <th className="py-3 px-4">Subject Title</th>
                  <th className="py-3 px-4 text-center">Credits</th>
                  <th className="py-3 px-4 text-center">Internal</th>
                  <th className="py-3 px-4 text-center">External</th>
                  <th className="py-3 px-4 text-center">Total</th>
                  <th className="py-3 px-4 text-center">Grade</th>
                  <th className="py-3 px-4 text-center">Grade Point</th>
                  <th className="py-3 px-4 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentSemData.subjects.map((sub, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">{sub.subjectCode}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{sub.subjectName}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700">{sub.credits}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-gray-600">{sub.internalMark ?? "-"}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-gray-600">{sub.externalMark ?? "-"}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-900">{sub.totalMark ?? "-"}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                        sub.grade === "O" ? "bg-purple-100 text-purple-800 border border-purple-200" :
                        sub.grade === "A+" || sub.grade === "A" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                        sub.grade === "B+" || sub.grade === "B" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                        "bg-red-100 text-red-800 border border-red-200"
                      }`}>
                        {sub.grade || "RA"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700">{sub.gradePoint ?? 0}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        sub.result === "PASS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {sub.result || "FAIL"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onClose && (
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-6 py-2 bg-gray-800 text-white font-bold rounded-xl text-sm hover:bg-gray-900 shadow">
            Close Academic Profile
          </button>
        </div>
      )}
    </div>
  );
}
