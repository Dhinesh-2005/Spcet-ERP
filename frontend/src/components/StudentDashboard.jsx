import React, { useState, useEffect } from "react";
import { API_BASE, mergeResults } from "../utils";
import GPACalculator from "../components/GPACalculator";
import StudentAcademicHistory from "./StudentAcademicHistory";
import StudentCarryForwardView from "./StudentCarryForwardView";

// Grade → grade-point mapping (Anna University scale)
const GRADE_POINTS = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0, RA: 0, AB: 0, SA: 0, W: 0 };

function computeGPA(results, creditMap) {
  let totalPoints = 0;
  let totalCredits = 0;
  results.forEach((r) => {
    const gp = r.gradePoint !== undefined ? Number(r.gradePoint) : (GRADE_POINTS[r.grade] ?? 0);
    const cr = Number(r.credits ?? creditMap[r.subjectCode] ?? creditMap[r.subject] ?? 3);
    if (cr > 0) {
      totalPoints += gp * cr;
      totalCredits += cr;
    }
  });
  if (totalCredits === 0) return "0.00";
  return (totalPoints / totalCredits).toFixed(2);
}

function computeCGPA(allResults, creditMap) {
  // Deduplicate by subjectCode: prefer PASS record or latest attempt
  const subjectBestMap = {};
  allResults.forEach((r) => {
    const code = String(r.subjectCode || r.subject || "").trim().toUpperCase();
    if (!code) return;
    const existing = subjectBestMap[code];
    if (!existing) {
      subjectBestMap[code] = r;
    } else {
      if (existing.result !== "PASS" && r.result === "PASS") {
        subjectBestMap[code] = r;
      } else if (existing.result === r.result) {
        if (Number(r.semester || 1) >= Number(existing.semester || 1)) {
          subjectBestMap[code] = r;
        }
      }
    }
  });

  let totalPoints = 0;
  let totalCredits = 0;
  Object.values(subjectBestMap).forEach((r) => {
    const gp = r.gradePoint !== undefined ? Number(r.gradePoint) : (GRADE_POINTS[r.grade] ?? 0);
    const cr = Number(r.credits ?? creditMap[r.subjectCode] ?? creditMap[r.subject] ?? 3);
    if (cr > 0) {
      totalPoints += gp * cr;
      totalCredits += cr;
    }
  });
  if (totalCredits === 0) return "0.00";
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
  const [activeTab, setActiveTab] = useState("results"); // "results" | "academic"

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

  // Credits calculation for current semester
  const semTotalCredits = displayedResults.reduce((acc, r) => acc + Number(r.credits ?? creditMap[r.subjectCode] ?? creditMap[r.subject] ?? 3), 0);
  const semEarnedCredits = displayedResults.filter(r => r.result === "PASS").reduce((acc, r) => acc + Number(r.credits ?? creditMap[r.subjectCode] ?? creditMap[r.subject] ?? 3), 0);
  const hasFail = displayedResults.some((r) => r.result !== "PASS");

  // GPA calculation for current semester (with fallback to academic history)
  const semAcademicData = (profile?.academicSemesters || []).find(s => String(s.semester) === String(currentSem));
  const calculatedGPA = displayedResults.length > 0 ? computeGPA(displayedResults, creditMap) : null;
  const currentSemGPA = semAcademicData?.gpa !== undefined && semAcademicData.gpa > 0 ? Number(semAcademicData.gpa).toFixed(2) : calculatedGPA;

  // Cumulative CGPA calculation across all completed subjects
  const calculatedCGPA = resultsList.length > 0 ? computeCGPA(resultsList, creditMap) : null;
  const studentCGPA = profile?.overallCgpa !== undefined && profile?.overallCgpa > 0 ? Number(profile.overallCgpa).toFixed(2) : calculatedCGPA;



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
          <div className="flex items-center gap-3 print:hidden">
            <button onClick={() => setShowCalculator(!showCalculator)} className="hidden md:flex px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-100 transition-colors">
              {showCalculator ? "Hide Calculator" : "🧮 Open GPA Calculator"}
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 mb-6 gap-2 print:hidden flex-wrap">
          <button
            onClick={() => setActiveTab("results")}
            className={`pb-2.5 px-5 font-bold text-sm transition-all border-b-2 ${
              activeTab === "results" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            📋 Published Results
          </button>
          <button
            onClick={() => setActiveTab("academic")}
            className={`pb-2.5 px-5 font-bold text-sm transition-all border-b-2 ${
              activeTab === "academic" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            🎓 Academic History & CGPA
          </button>
          <button
            onClick={() => setActiveTab("carry-forward")}
            className={`pb-2.5 px-5 font-bold text-sm transition-all border-b-2 ${
              activeTab === "carry-forward" ? "border-amber-600 text-amber-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            🔄 Current & Arrear Subjects
          </button>
        </div>

        {activeTab === "academic" && <StudentAcademicHistory registerNumber={user?.registerNumber} />}

        {activeTab === "carry-forward" && <StudentCarryForwardView registerNumber={user?.registerNumber} />}

        {activeTab === "results" && (
          <>
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

              {/* GPA & CGPA Quick Cards in Profile */}
              <div className="flex flex-wrap gap-2.5 mt-2 pt-3 border-t border-teal-200">
                {currentSemGPA && Number(currentSem) !== 99 && (
                  <div className="bg-white/95 px-3 py-1.5 rounded-lg border border-teal-300 shadow-sm flex items-center gap-2">
                    <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Sem {currentSem} GPA:</span>
                    <span className="text-base font-black text-teal-900">{currentSemGPA}</span>
                  </div>
                )}
                {studentCGPA && (
                  <div className="bg-white/95 px-3 py-1.5 rounded-lg border border-indigo-300 shadow-sm flex items-center gap-2">
                    <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide">Overall CGPA:</span>
                    <span className="text-base font-black text-indigo-900">{studentCGPA}</span>
                  </div>
                )}
                {semTotalCredits > 0 && (
                  <div className="bg-white/95 px-3 py-1.5 rounded-lg border border-teal-300 shadow-sm flex items-center gap-2">
                    <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide">Credits Earned:</span>
                    <span className="text-base font-black text-teal-900">{semEarnedCredits} / {semTotalCredits}</span>
                  </div>
                )}
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
          <div className="overflow-x-auto rounded-xl border border-green-200 shadow-sm">
            <table className="w-full text-sm text-left" style={{ minWidth: 900 }}>
              <thead className="bg-[#483d8b] text-white uppercase text-[11px] tracking-wider font-semibold print:bg-gray-200 print:text-black">
                <tr>
                  <th className="px-4 py-3.5">Semester</th>
                  <th className="px-4 py-3.5">Subject Code</th>
                  <th className="px-4 py-3.5">Subject Name</th>
                  <th className="px-3 py-3.5 text-center">Credits</th>
                  <th className="px-3 py-3.5 text-center">Internal</th>
                  <th className="px-3 py-3.5 text-center">External</th>
                  <th className="px-3 py-3.5 text-center">Total</th>
                  <th className="px-3 py-3.5 text-center">Grade</th>
                  <th className="px-3 py-3.5 text-center">GP</th>
                  <th className="px-3 py-3.5 text-center">Result</th>
                  <th className="px-3 py-3.5 text-center">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedResults.map((r, i) => (
                  <tr key={i} className="hover:bg-green-50 transition-colors print:hover:bg-white">
                    <td className="px-4 py-3 text-gray-700">{Number(r.semester) === 99 ? "Graduated" : r.semester}</td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-900">{r.subjectCode || r.subject}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">
                      {r.subjectName || subjectNameMap[r.subjectCode] || subjectNameMap[r.subject] || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-gray-700">{r.credits ?? (creditMap[r.subjectCode] || 3)}</td>
                    <td className="px-3 py-3 text-center text-gray-600 font-semibold">{r.internalRaw !== undefined ? r.internalRaw : r.internalMark ?? "—"}</td>
                    <td className="px-3 py-3 text-center text-gray-600 font-semibold">{r.externalRaw !== undefined ? r.externalRaw : r.externalMark ?? "—"}</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{r.finalMarks !== undefined ? r.finalMarks : r.totalMark ?? "—"}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#483d8b] print:text-black">{r.grade}</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-700">{r.gradePoint !== undefined ? r.gradePoint : (GRADE_POINTS[r.grade] ?? 0)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${r.result === "PASS" ? "bg-[#e0f5e9] text-[#228b22]" : "bg-red-100 text-red-800"} print:bg-transparent print:border print:border-gray-500 print:shadow-none`}>
                        {r.result}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.isArrear || r.arrearStatus === "ARREAR" || r.result !== "PASS" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                        {r.isArrear || r.arrearStatus === "ARREAR" || r.result !== "PASS" ? "ARREAR" : "REGULAR"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* GPA & CGPA Summary Bar below table */}
            {displayedResults.length > 0 && Number(currentSem) !== 99 && (
              <div className="border-t border-green-200 px-6 py-4 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-indigo-50/70 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div>
                    <span className="text-gray-500 font-medium">Credits Registered / Earned: </span>
                    <span className="font-bold text-gray-900">{semTotalCredits} / {semEarnedCredits}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Semester Status: </span>
                    <span className={`font-bold px-2.5 py-0.5 rounded text-xs ${hasFail ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-green-100 text-green-800 border border-green-300"}`}>
                      {hasFail ? "⚠️ With Arrear" : "✅ All Clear (PASS)"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {currentSemGPA && (
                    <div className="bg-white px-5 py-2.5 rounded-xl border border-green-300 shadow-sm text-center">
                      <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Semester {currentSem} GPA</div>
                      <div className="text-xl font-black text-green-700">{currentSemGPA}</div>
                    </div>
                  )}
                  {studentCGPA && (
                    <div className="bg-white px-5 py-2.5 rounded-xl border border-indigo-300 shadow-sm text-center">
                      <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Overall CGPA</div>
                      <div className="text-xl font-black text-indigo-700">{studentCGPA}</div>
                    </div>
                  )}
                </div>
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
          </>
        )}
      </div>
    </div>
  );
}