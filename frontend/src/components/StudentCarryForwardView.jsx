import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

export default function StudentCarryForwardView({ registerNumber: propRegNo, user }) {
  const registerNumber = propRegNo || user?.registerNumber;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!registerNumber) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/students/${registerNumber}/carry-forward`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load subject & arrear records");
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error loading carry-forward arrears");
        setLoading(false);
      });
  }, [registerNumber]);

  if (loading) {
    return (
      <div className="p-8 text-center bg-white rounded-xl shadow border border-gray-100">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-amber-600 border-t-transparent mb-3"></div>
        <p className="text-gray-600 font-medium">Loading Academic Subjects & Arrears…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200">
        <p className="font-bold">Record Unavailable</p>
        <p className="text-sm mt-1">{error || "No student carry-forward record found."}</p>
      </div>
    );
  }

  const currentSubjects = data.currentSubjects || [];
  const arrearSubjects = data.arrearSubjects || [];

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-amber-900 via-slate-900 to-amber-950 text-white rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-full text-xs font-bold uppercase tracking-wider">
            Academic Status
          </span>
          <h2 className="text-2xl font-black mt-2">{data.studentName || registerNumber}</h2>
          <p className="text-slate-300 text-xs mt-1">
            Department: <strong>{data.department}</strong> · Current Semester: <strong>Semester {data.currentSemester}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-xl text-center border border-white/10 min-w-[100px]">
            <div className="text-2xl font-black text-emerald-400">{data.totalCurrent}</div>
            <div className="text-[10px] uppercase font-bold text-slate-300">Current Regular</div>
          </div>
          <div className={`p-3 rounded-xl text-center border min-w-[100px] ${data.totalArrears > 0 ? "bg-red-500/20 border-red-400/40 text-red-300" : "bg-white/10 border-white/10 text-slate-300"}`}>
            <div className={`text-2xl font-black ${data.totalArrears > 0 ? "text-amber-400" : "text-emerald-400"}`}>{data.totalArrears}</div>
            <div className="text-[10px] uppercase font-bold">Active Arrears</div>
          </div>
        </div>
      </div>

      {/* ── 1. CURRENT SEMESTER SUBJECTS ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="text-emerald-600">📘</span> CURRENT SEMESTER SUBJECTS (Semester {data.currentSemester})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Regular subjects enrolled for this academic term</p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">
            {currentSubjects.length} Registered
          </span>
        </div>

        {currentSubjects.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center italic">No regular subjects found for this semester.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-gray-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Subject Code</th>
                  <th className="py-2.5 px-3">Subject Title</th>
                  <th className="py-2.5 px-3 text-center">Semester</th>
                  <th className="py-2.5 px-3 text-center">Credits</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                  <th className="py-2.5 px-3 text-center">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentSubjects.map((sub, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{sub.subjectCode}</td>
                    <td className="py-2.5 px-3 font-semibold text-gray-900">{sub.subjectName || sub.subjectCode}</td>
                    <td className="py-2.5 px-3 text-center text-gray-600 font-bold">Sem {sub.semester || sub.subjectSemester || data.currentSemester}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-gray-700">{sub.credits ?? 3}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-600">{sub.paperType || sub.subjectType || "THEORY"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        REGULAR
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 2. CARRY-FORWARD ARREAR SUBJECTS ──────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <span>⚠️</span> ARREAR SUBJECTS (Carry-Forward)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Failed subjects carried forward from earlier semesters. Original semester is strictly preserved.
            </p>
          </div>
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${arrearSubjects.length > 0 ? "bg-amber-50 text-amber-800 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {arrearSubjects.length} Active Arrears
          </span>
        </div>

        {arrearSubjects.length === 0 ? (
          <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-3xl">🎉</span>
            <p className="text-emerald-800 font-bold text-sm mt-2">All Clear! No Pending Arrears</p>
            <p className="text-emerald-600 text-xs mt-0.5">Student has successfully cleared all registered subjects.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-amber-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-50 text-amber-900 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Subject Code</th>
                  <th className="py-2.5 px-3">Subject Title</th>
                  <th className="py-2.5 px-3 text-center">Original Sem</th>
                  <th className="py-2.5 px-3 text-center">Current Sem</th>
                  <th className="py-2.5 px-3 text-center">Credits</th>
                  <th className="py-2.5 px-3 text-center">Attempt</th>
                  <th className="py-2.5 px-3 text-center">Original Internal</th>
                  <th className="py-2.5 px-3 text-center">Internal Validity (3-Sem Rule)</th>
                  <th className="py-2.5 px-3 text-center">Pass Threshold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {arrearSubjects.map((arr, i) => {
                  const isValid = arr.internalStatus === "VALID";
                  return (
                    <tr key={i} className="hover:bg-amber-50/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-red-700">{arr.subjectCode}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{arr.subjectName}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-purple-700 bg-purple-50/50">
                        Semester {arr.originalSemester}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-gray-500">
                        Sem {arr.currentSemester}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-gray-700">{arr.credits}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                        Attempt #{arr.attemptNumber}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-gray-700">
                        {arr.originalInternalMark}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          isValid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {isValid ? "VALID (Stored Internal Applied)" : "INTERNAL NOT APPLICABLE (>3 Sems)"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-gray-800">
                        {arr.passThreshold}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
