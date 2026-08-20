import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

// ─── Fixed component definitions ─────────────────────────────────────────────
const THEORY_UNITS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5"];
const THEORY_UNIT_MAX = 100;

const PRACTICAL_EXPS = ["Ex 1","Ex 2","Ex 3","Ex 4","Ex 5","Ex 6","Ex 7","Ex 8","Ex 9","Ex 10"];
const PRACTICAL_EXP_MAX = 10;
const PRACTICAL_MODEL_MAX = 25;

// ─── Auto-calculation helpers ─────────────────────────────────────────────────
function calcTheory(marks) {
  const vals = THEORY_UNITS.map(u => marks[u]).filter(v => v !== "" && v !== null && v !== undefined && !isNaN(v));
  if (vals.length === 0) return { avg: "", internal: "" };
  const avg = vals.reduce((s, v) => s + Number(v), 0) / vals.length;
  const internal = Math.round((avg / THEORY_UNIT_MAX) * 40 * 100) / 100;
  return { avg: Math.round(avg * 100) / 100, internal };
}

function calcPractical(marks) {
  const expVals = PRACTICAL_EXPS.map(e => marks[e]).filter(v => v !== "" && v !== null && v !== undefined && !isNaN(v));
  const modelRaw = marks["Model"];
  const modelVal = (modelRaw !== "" && modelRaw !== null && modelRaw !== undefined && !isNaN(modelRaw)) ? Number(modelRaw) : null;
  if (expVals.length === 0 && modelVal === null) return { expAvg: "", internal: "" };
  const expAvg = expVals.length > 0 ? expVals.reduce((s, v) => s + Number(v), 0) / expVals.length : 0;
  // Exp component → scaled to 15, Model → max 25, Total → /40
  const expComponent = Math.round((expAvg / PRACTICAL_EXP_MAX) * 15 * 100) / 100;
  const modelComponent = modelVal !== null ? modelVal : 0;
  const internal = Math.round((expComponent + modelComponent) * 100) / 100;
  return { expAvg: expVals.length > 0 ? Math.round(expAvg * 100) / 100 : "", internal };
}

function initMarks(type) {
  if (type === "PRACTICAL") {
    const m = {};
    PRACTICAL_EXPS.forEach(e => { m[e] = ""; });
    m["Model"] = "";
    return m;
  }
  const m = {};
  THEORY_UNITS.forEach(u => { m[u] = ""; });
  return m;
}

export default function FacultyMarksEntry({ user }) {
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState("");
  const [subjectType, setSubjectType] = useState("THEORY");
  const [students, setStudents] = useState([]);
  const [status, setStatus] = useState("DRAFT");
  const [semester, setSemester] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);

  // ── Fetch assigned subjects ───────────────────────────────────────────────
  useEffect(() => {
    if (!user?.registerNumber) return;
    fetch(`${API_BASE}/api/faculty-marks/my-subjects?facultyId=${user.registerNumber}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setAssignedSubjects(data);
        if (data.length > 0) setSelectedSubjectCode(data[0].subjectCode);
      })
      .catch(console.error);
  }, [user]);

  // ── Fetch students roster ─────────────────────────────────────────────────
  const fetchStudents = () => {
    if (!selectedSubjectCode || !user) return;
    const subObj = assignedSubjects.find(s => s.subjectCode === selectedSubjectCode);
    const sem = subObj?.semester || 1;
    const pType = (subObj?.paperType || "THEORY").toUpperCase() === "PRACTICAL" ? "PRACTICAL" : "THEORY";
    setLoading(true);
    fetch(`${API_BASE}/api/faculty-marks/subject-students?facultyId=${user.registerNumber}&subjectCode=${selectedSubjectCode}&semester=${sem}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStatus(data.status || "DRAFT");
          setSemester(data.semester || sem);
          setSubjectType(pType);
          const rows = (data.students || []).map(st => {
            const base = initMarks(pType);
            const marks = st.componentMarks && Object.keys(st.componentMarks).length > 0
              ? { ...base, ...st.componentMarks } : base;
            const calc = pType === "PRACTICAL" ? calcPractical(marks) : calcTheory(marks);
            return { registerNumber: st.registerNumber, name: st.name || "", marks, ...calc };
          });
          setStudents(rows);
        }
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  };

  useEffect(() => { fetchStudents(); }, [selectedSubjectCode, user]);

  // ── Mark change ───────────────────────────────────────────────────────────
  const handleMarkChange = (regNo, field, val) => {
    setStudents(prev => prev.map(st => {
      if (st.registerNumber !== regNo) return st;
      const marks = { ...st.marks, [field]: val === "" ? "" : Number(val) };
      const calc = subjectType === "PRACTICAL" ? calcPractical(marks) : calcTheory(marks);
      return { ...st, marks, ...calc };
    }));
  };

  // ── Save / Submit ─────────────────────────────────────────────────────────
  const handleSave = async (statusAction = "DRAFT") => {
    if (!selectedSubjectCode) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: user.registerNumber,
          facultyName: user.name,
          subjectCode: selectedSubjectCode,
          semester,
          status: statusAction,
          marks: students.map(st => ({
            registerNumber: st.registerNumber,
            name: st.name,
            componentMarks: st.marks,
            finalInternal: st.internal,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) { alert(data.message || `Marks saved as ${statusAction}`); fetchStudents(); }
      else alert(data.detail || "Failed to save marks");
    } catch { alert("Error saving marks"); }
    setSaving(false);
  };

  // ── History ───────────────────────────────────────────────────────────────
  const handleViewHistory = async () => {
    if (!selectedSubjectCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/history?subjectCode=${selectedSubjectCode}`);
      if (res.ok) { setAuditHistory(await res.json()); setShowHistoryModal(true); }
    } catch { console.error("History load failed"); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (assignedSubjects.length === 0) {
    return (
      <div className="p-10 text-center bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="text-5xl mb-3">🔒</div>
        <h3 className="text-lg font-bold text-gray-900">No Assigned Subjects</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
          Contact Admin/HOD to assign subject access to your faculty profile.
        </p>
      </div>
    );
  }

  const currentSub = assignedSubjects.find(s => s.subjectCode === selectedSubjectCode) || assignedSubjects[0];
  const isLocked = status === "SUBMITTED" || status === "APPROVED" || status === "PUBLISHED";
  const isPractical = subjectType === "PRACTICAL";
  const filtered = students.filter(st =>
    st.registerNumber.toLowerCase().includes(search.toLowerCase()) ||
    (st.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* ── Subject selector ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Subject</label>
            <select
              value={selectedSubjectCode}
              onChange={e => setSelectedSubjectCode(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-bold text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-500 max-w-xs"
            >
              {assignedSubjects.map(s => (
                <option key={s.subjectCode} value={s.subjectCode}>
                  {s.subjectCode} – {s.subjectName} (Sem {s.semester})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${isPractical ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
              {isPractical ? "🧪 Practical" : "📘 Theory"}
            </span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
              status === "SUBMITTED" ? "bg-amber-50 text-amber-700 border-amber-200"
              : status === "APPROVED" || status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-blue-50 text-blue-700 border-blue-200"}`}>
              {status || "DRAFT"}
            </span>
          </div>
        </div>
        <button onClick={handleViewHistory} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200">
          📜 Mark History
        </button>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-2" />
          <p className="text-xs font-bold text-gray-500 mt-2">Loading student roster…</p>
        </div>
      ) : students.length > 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h2 className="font-bold text-gray-900">
                {isPractical ? "Practical" : "Theory"} Internal Marks — {selectedSubjectCode}
                {currentSub?.subjectName ? ` · ${currentSub.subjectName}` : ""}
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isPractical
                  ? "Experiment marks (max 10 each) + Model (max 25). Internal /40 auto-calculated."
                  : "Unit test marks (max 100 each). Average + Internal /40 auto-calculated."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search register / name…"
                className="px-3 py-1.5 border border-gray-300 rounded-xl text-xs w-52 focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              <button onClick={() => handleSave("DRAFT")} disabled={saving || isLocked}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 disabled:opacity-40">
                💾 Save Draft
              </button>
              <button onClick={() => handleSave("SUBMITTED")} disabled={saving || isLocked}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow disabled:opacity-40">
                🚀 Submit Final
              </button>
            </div>
          </div>

          {/* ─── THEORY TABLE ─────────────────────────────────────────────── */}
          {!isPractical && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="py-3 px-3 font-bold rounded-tl-xl" rowSpan={2}>#</th>
                    <th className="py-3 px-3 font-bold" rowSpan={2}>Register No</th>
                    <th className="py-3 px-3 font-bold" rowSpan={2}>Name</th>
                    <th colSpan={5} className="py-2 px-3 text-center font-bold bg-indigo-700">
                      Unit Test Marks <span className="font-normal text-indigo-200">(Max 100 each)</span>
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-violet-700" rowSpan={2}>
                      Avg<br /><span className="text-[9px] font-normal opacity-80">/100</span>
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-emerald-700 rounded-tr-xl" rowSpan={2}>
                      Internal<br /><span className="text-[9px] font-normal opacity-80">/40</span>
                    </th>
                  </tr>
                  <tr className="bg-indigo-800 text-indigo-100">
                    {THEORY_UNITS.map(u => (
                      <th key={u} className="py-2 px-3 text-center font-semibold">{u}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((st, idx) => (
                    <tr key={st.registerNumber} className={idx % 2 === 0 ? "bg-white hover:bg-indigo-50/30" : "bg-slate-50 hover:bg-indigo-50/30"}>
                      <td className="py-2 px-3 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-bold text-gray-900">{st.registerNumber}</td>
                      <td className="py-2 px-3 font-medium text-gray-700 whitespace-nowrap">{st.name}</td>
                      {THEORY_UNITS.map(u => (
                        <td key={u} className="py-1.5 px-2 text-center">
                          <input
                            type="number" min="0" max={THEORY_UNIT_MAX}
                            value={st.marks[u] ?? ""}
                            disabled={isLocked}
                            onChange={e => handleMarkChange(st.registerNumber, u, e.target.value)}
                            className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 outline-none"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 text-center font-bold text-violet-700 bg-violet-50/60">
                        {st.avg !== "" && st.avg !== undefined ? st.avg : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/60 text-sm">
                        {st.internal !== "" && st.internal !== undefined ? st.internal : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── PRACTICAL TABLE ──────────────────────────────────────────── */}
          {isPractical && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left" style={{ minWidth: 1400 }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="py-3 px-3 font-bold rounded-tl-xl" rowSpan={2}>#</th>
                    <th className="py-3 px-3 font-bold" rowSpan={2}>Register No</th>
                    <th className="py-3 px-3 font-bold" rowSpan={2}>Name</th>
                    <th colSpan={10} className="py-2 px-3 text-center font-bold bg-teal-700">
                      Experiment Marks <span className="font-normal text-teal-200">(Max 10 each)</span>
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-orange-700" rowSpan={2}>
                      Exp Avg<br /><span className="text-[9px] font-normal opacity-80">/10</span>
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-amber-700" rowSpan={2}>
                      Model<br /><span className="text-[9px] font-normal opacity-80">/25</span>
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-emerald-700 rounded-tr-xl" rowSpan={2}>
                      Internal<br /><span className="text-[9px] font-normal opacity-80">/40</span>
                    </th>
                  </tr>
                  <tr className="bg-teal-800 text-teal-100">
                    {PRACTICAL_EXPS.map(e => (
                      <th key={e} className="py-2 px-2 text-center font-semibold">{e}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((st, idx) => (
                    <tr key={st.registerNumber} className={idx % 2 === 0 ? "bg-white hover:bg-teal-50/30" : "bg-slate-50 hover:bg-teal-50/30"}>
                      <td className="py-2 px-3 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-bold text-gray-900">{st.registerNumber}</td>
                      <td className="py-2 px-3 font-medium text-gray-700 whitespace-nowrap">{st.name}</td>
                      {PRACTICAL_EXPS.map(e => (
                        <td key={e} className="py-1.5 px-1 text-center">
                          <input
                            type="number" min="0" max={PRACTICAL_EXP_MAX}
                            value={st.marks[e] ?? ""}
                            disabled={isLocked}
                            onChange={ev => handleMarkChange(st.registerNumber, e, ev.target.value)}
                            className="w-14 px-1 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 outline-none"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-bold text-orange-700 bg-orange-50/60">
                        {st.expAvg !== "" && st.expAvg !== undefined ? st.expAvg : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center bg-amber-50/40">
                        <input
                          type="number" min="0" max={PRACTICAL_MODEL_MAX}
                          value={st.marks["Model"] ?? ""}
                          disabled={isLocked}
                          onChange={e => handleMarkChange(st.registerNumber, "Model", e.target.value)}
                          className="w-16 px-2 py-1 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/60 text-sm">
                        {st.internal !== "" && st.internal !== undefined ? st.internal : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2 flex flex-wrap gap-4">
            {!isPractical ? (
              <>
                <span>📘 <strong>Unit Test</strong>: max 100 per unit (5 units)</span>
                <span>📊 <strong>Avg</strong> = Sum of entered units ÷ count</span>
                <span>✅ <strong>Internal /40</strong> = Avg × 40 / 100</span>
              </>
            ) : (
              <>
                <span>🧪 <strong>Experiments</strong>: max 10 each × 10 exps</span>
                <span>📊 <strong>Exp Avg</strong> = Average of experiments (→ scaled to /15)</span>
                <span>📝 <strong>Model</strong>: max 25</span>
                <span>✅ <strong>Internal /40</strong> = Exp component (/15) + Model (/25)</span>
              </>
            )}
          </div>
        </div>
      ) : !loading ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 font-medium text-sm">
          No student records found for this subject.
        </div>
      ) : null}

      {/* ── History Modal ─────────────────────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900">Mark Audit Log — {selectedSubjectCode}</h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none">✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {auditHistory.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No mark modification entries recorded yet.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-gray-700 font-bold">
                    <tr>
                      <th className="py-2 px-3">Student</th>
                      <th className="py-2 px-3">Component</th>
                      <th className="py-2 px-3 text-center">Old → New</th>
                      <th className="py-2 px-3">Faculty</th>
                      <th className="py-2 px-3">Date / Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditHistory.map((h, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold">{h.registerNumber}</td>
                        <td className="py-2 px-3 font-semibold text-indigo-700">{h.component}</td>
                        <td className="py-2 px-3 text-center font-bold">
                          <span className="text-red-500 line-through mr-1">{h.oldMark ?? "none"}</span>
                          <span className="text-emerald-600">{h.newMark}</span>
                        </td>
                        <td className="py-2 px-3 text-gray-600">{h.facultyName || h.facultyId}</td>
                        <td className="py-2 px-3 text-gray-400 text-[10px]">{new Date(h.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
