import React, { useState, useEffect } from "react";
import { API_BASE, mergeResults } from "../utils";
import GPACalculator from "../components/GPACalculator";

// Grade → grade-point mapping (Anna University scale)
const GRADE_POINTS = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0, RA: 0, AB: 0, SA: 0, W: 0 };

function computeGPA(results, creditMap) {
  let totalPoints = 0;
  let totalCredits = 0;
  results.forEach((r) => {
    const gp = GRADE_POINTS[r.grade] ?? 0;
    const cr = creditMap[r.subjectCode] ?? creditMap[r.subject] ?? 3; // fallback 3
    totalPoints += gp * cr;
    totalCredits += cr;
  });
  if (totalCredits === 0) return null;
  return (totalPoints / totalCredits).toFixed(2);
}

export default function StudentDashboard({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [selectedSem, setSelectedSem] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [creditMap, setCreditMap] = useState({}); // subjectCode → credits
  const [subjectNameMap, setSubjectNameMap] = useState({}); // subjectCode → name
  const [regularCodes, setRegularCodes] = useState(new Set()); // regular subject codes only
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/students/${user.registerNumber}/profile`);
        if (res.ok) {
          const data = await res.json();
          setProfile({ ...data, results: mergeResults(data.results || []) });
        }
      } catch (e) { console.warn(e); }
    }
    load();
  }, [user.registerNumber]);

  // Fetch subjects to build creditMap
  useEffect(() => {
    async function loadSubjects() {
      try {
        const res = await fetch(`${API_BASE}/api/students/${user.registerNumber}/subjects`);
        if (res.ok) {
          const data = await res.json();
          const cMap = {};
          const nMap = {};
          const rCodes = new Set();
          (data.subjects || []).forEach((s) => {
            cMap[s.subjectCode] = s.credits || 3;
            if (s.subjectName) nMap[s.subjectCode] = s.subjectName;
            if (s.source === "regular") rCodes.add(s.subjectCode);
          });
          setCreditMap(cMap);
          setSubjectNameMap(nMap);
          setRegularCodes(rCodes);
        }
      } catch (e) { console.warn(e); }
    }
    loadSubjects();
  }, [user.registerNumber]);

  // Build photo URL
  useEffect(() => {
    setPhotoUrl(`${API_BASE}/api/students/${user.registerNumber}/photo`);
    setPhotoError(false);
  }, [user.registerNumber]);

  const resultsList = profile?.results || [];
  const availableSems = [...new Set(resultsList.map((r) => r.semester))].sort((a, b) => Number(b) - Number(a));
  const currentSem = selectedSem || (availableSems.length > 0 ? availableSems[0] : null);
  const displayedResults = resultsList.filter((r) => String(r.semester) === String(currentSem));

  // GPA logic:
  // 1. If ANY subject in the semester (regular or special) is FAIL → show "—"
  // 2. Otherwise compute GPA using ONLY regular subjects
  const hasFail = displayedResults.some((r) => r.result !== "PASS");
  const regularResults = displayedResults.filter(
    (r) => regularCodes.has(r.subjectCode) || regularCodes.has(r.subject)
  );
  const currentSemGPA = displayedResults.length === 0
    ? null
    : hasFail
      ? "—"
      : regularResults.length > 0
        ? computeGPA(regularResults, creditMap)
        : null;



  return (
    <div className="min-h-screen p-6 bg-slate-50 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg p-8 border border-gray-100 print:shadow-none print:border-none print:m-0 print:max-w-full">

        {/* Header Section */}
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div className="flex items-center">
            <img src="/college-logo.jpg" alt="Logo" className="w-16 h-16 object-contain mr-4 rounded-full border print:border-none" />
            <div>
              <h1 className="text-2xl font-bold text-green-800">St. Peters College of Engineering and Technology</h1>
              <p className="text-green-600 font-medium text-sm">Student Result Portal</p>
            </div>
          </div>
          <button onClick={() => setShowCalculator(!showCalculator)} className="hidden md:flex px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-100 transition-colors print:hidden">
            {showCalculator ? "Hide Calculator" : "🧮 Open GPA Calculator"}
          </button>
        </div>

        {showCalculator && (
          <div className="mb-8 print:hidden">
            <GPACalculator />
          </div>
        )}

        {/* Profile Details Box */}
        <div className="bg-[#b3e6e6] border border-teal-200 rounded-lg p-6 mb-8 print:bg-white print:border-none print:p-0 print:mb-4">
          <h2 className="text-[#3b9c9c] text-center text-2xl font-semibold mb-6">Student Profile</h2>

          {/* Photo + GPA column alongside profile fields */}
          <div className="flex flex-col md:flex-row gap-8 items-start justify-center">

            {/* Left: Photo only */}
            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              {/* Student Photo */}
              <div className="relative">
                {!photoError && photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Student"
                    onError={() => setPhotoError(true)}
                    className="w-32 h-36 object-cover rounded-xl border-4 border-teal-400 shadow-md"
                    style={{ background: "#e0f7fa" }}
                  />
                ) : (
                  <div className="w-32 h-36 rounded-xl border-4 border-teal-300 shadow-md bg-gradient-to-br from-teal-100 to-cyan-200 flex flex-col items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-16 h-16 text-teal-400" fill="currentColor">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                    <span className="text-xs text-teal-500 font-medium mt-1">No Photo</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Profile fields */}
            <div className="flex flex-col gap-4 flex-1 text-gray-700 max-w-xl">
              <div className="flex items-center">
                <span className="w-48 font-bold">Register Number</span>
                <span className="font-mono text-[15px]">{profile?.student?.registerNumber ?? user.registerNumber}</span>
              </div>
              <div className="flex items-center">
                <span className="w-48 font-bold">Name</span>
                <span className="uppercase text-[15px]">{profile?.student?.name ?? user.name}</span>
              </div>
              <div className="flex items-start">
                <span className="w-48 font-bold flex-shrink-0 pt-0.5">Institution</span>
                <span className="uppercase text-[15px]">1127 - ST.PETER'S COLLEGE OF ENGINEERING AND TECHNOLOGY</span>
              </div>
              <div className="flex items-start">
                <span className="w-48 font-bold">Branch</span>
                <span className="uppercase text-[15px]">
                  { profile?.student?.department === "CSE" ? "104-B.E. Computer Science and Engineering" :
                    profile?.student?.department === "ECE" ? "106-B.E. Electronics and Communication Engineering" :
                    profile?.student?.department === "EEE" ? "105-B.E. Electrical and Electronics Engineering" :
                    profile?.student?.department === "BIO TECH" ? "214-B.Tech. Biotechnology" :
                    profile?.student?.department === "MECH" ? "114-B.E. Mechanical Engineering" :
                    profile?.student?.department === "AIDS" ? "149-B.Tech. Artificial Intelligence and Data Science" :
                    profile?.student?.department === "AERO" ? "101-B.E. Aeronautical Engineering" :
                    profile?.student?.department === "CIVIL" ? "103-B.E. Civil Engineering" :
                    profile?.student?.department === "CHEM" ? "203-B.Tech. Chemical Engineering" :
                    profile?.student?.department === "CSBS" ? "148-B.E. Computer Science and Business Systems" :
                    profile?.student?.department === "BIO MEDICINE" ? "121-B.E. Biomedical Engineering" :
                    profile?.student?.department === "IT" ? "205-B.Tech. Information Technology" :
                    user.department}
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* SEMESTER TABS */}
        {availableSems.length > 0 && (
          <div className="mb-6">
            <div className="flex gap-3 overflow-x-auto pb-2 print:hidden">
              {availableSems.map(sem => (
                <button
                  key={sem}
                  onClick={() => setSelectedSem(sem)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap shadow-sm active:scale-95 ${String(currentSem) === String(sem) ? "bg-green-600 text-white ring-2 ring-green-300 ring-offset-1" : "bg-white text-green-700 border border-green-200 hover:bg-green-50"}`}
                >
                  {Number(sem) === 99 ? "Graduated 🎓" : `Semester ${sem} ${sem === availableSems[0] && " (Latest)"}`}
                </button>
              ))}
            </div>
            <h2 className="hidden print:block text-xl font-bold text-green-800 mb-4 border-b pb-2">
              {Number(currentSem) === 99 ? "Graduation Profile" : `Semester ${currentSem} Results`}
            </h2>
          </div>
        )}

        {/* Results Table */}
        {displayedResults.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-green-200 shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#483d8b] text-white uppercase text-[11px] tracking-wider font-semibold print:bg-gray-200 print:text-black">
                <tr>
                  <th className="px-6 py-4">Semester</th>
                  <th className="px-6 py-4">Subject Code</th>
                  <th className="px-6 py-4">Subject Name</th>
                  <th className="px-6 py-4 text-center">Grade</th>
                  <th className="px-6 py-4 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedResults.map((r, i) => (
                  <tr key={i} className="hover:bg-green-50 transition-colors print:hover:bg-white">
                    <td className="px-6 py-4 text-gray-700">{Number(r.semester) === 99 ? "Graduated" : r.semester}</td>
                    <td className="px-6 py-4 font-bold text-gray-800">{r.subjectCode || r.subject}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {subjectNameMap[r.subjectCode] || subjectNameMap[r.subject] || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-[#483d8b] print:text-black">{r.grade}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-4 py-1.5 rounded-sm text-xs font-bold shadow-sm ${r.result === "PASS" ? "bg-[#e0f5e9] text-[#228b22]" : "bg-red-100 text-red-800"} print:bg-transparent print:border print:border-gray-500 print:shadow-none`}>
                        {r.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* GPA line below table */}
            {currentSemGPA && Number(currentSem) !== 99 && (
              <div className="border-t border-green-200 px-6 py-3 text-right">
                <span className="text-base font-bold text-gray-800">GPA : {currentSemGPA}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-green-300 text-green-600 font-medium">
            {availableSems.length === 0 ? "No results published yet. Check back later!" : `No results found for Semester ${currentSem}.`}
          </div>
        )}

        <div className="mt-8 flex justify-end gap-4 print:hidden">
          <button onClick={() => window.print()} className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition-all shadow-md active:scale-95 flex items-center gap-2">
            <span>📄</span> Download PDF
          </button>
          <button onClick={onLogout} className="px-6 py-2.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold transition-all shadow-sm active:scale-95">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}