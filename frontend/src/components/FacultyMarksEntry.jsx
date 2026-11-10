import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

// ─── Fixed component definitions ─────────────────────────────────────────────
const THEORY_UNITS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5"];
const THEORY_UNIT_MAX = 100;
const THEORY_ASSESSMENT_MAX = 40;

const DEFAULT_PRACTICAL_EXPS = ["EX1","EX2","EX3","EX4","EX5","EX6","EX7","EX8","EX9","EX10"];
const PRACTICAL_EXP_MAX = 10;
const PRACTICAL_MODEL_MAX = 25;

// ─── Auto-calculation helpers ─────────────────────────────────────────────────
function calcTheory(marks) {
  // 1. Gather valid Unit marks (Unit 1..5). Blank is excluded from denominator. Explicit 0 is included.
  const enteredUnits = [];
  THEORY_UNITS.forEach(u => {
    const raw = marks[u];
    if (raw !== "" && raw !== null && raw !== undefined && !isNaN(raw)) {
      enteredUnits.push(Number(raw));
    }
  });

  const iaRaw = marks["Assessment Mark"] !== undefined && marks["Assessment Mark"] !== ""
    ? marks["Assessment Mark"]
    : (marks["IA"] !== undefined && marks["IA"] !== "" ? marks["IA"] : marks["Internal Assessment"]);

  const hasAssessment = iaRaw !== "" && iaRaw !== null && iaRaw !== undefined && !isNaN(iaRaw);
  const assessmentVal = hasAssessment ? Number(iaRaw) : 0;

  if (enteredUnits.length === 0 && !hasAssessment) {
    return { avg: "", utMark60: "", total100: "", internal: "", internal40: "" };
  }

  // 2. Average = Sum of entered Unit marks / Number of entered Unit marks (out of 100)
  const avg = enteredUnits.length > 0 ? enteredUnits.reduce((s, v) => s + v, 0) / enteredUnits.length : 0;
  const avgFormatted = enteredUnits.length > 0 ? Math.round(avg * 100) / 100 : "";

  // 3. UT Converted Mark = (Average / 100) * 60 (out of 60)
  const utMark60 = enteredUnits.length > 0 ? Math.min(60, Math.round(((avg / THEORY_UNIT_MAX) * 60) * 100) / 100) : "";

  // 4. Total Internal Before Conversion = (UT Mark / 60) + (Assessment Mark / 40) (out of 100)
  const utForTotal = typeof utMark60 === "number" ? utMark60 : 0;
  const total100 = (enteredUnits.length > 0 || hasAssessment)
    ? Math.min(100, Math.round((utForTotal + assessmentVal) * 100) / 100)
    : "";

  // 5. Overall Internal / 40 = Total * 0.4 (or Total * 40 / 100) (out of 40)
  const internal40 = typeof total100 === "number"
    ? Math.min(40, Math.round((total100 * 0.4) * 100) / 100)
    : "";

  return {
    avg: avgFormatted,
    utMark60: utMark60,
    total100: total100,
    internal: internal40,
    internal40: internal40,
  };
}

function calcPractical(marks, activeExercises = DEFAULT_PRACTICAL_EXPS) {
  const exList = activeExercises && activeExercises.length > 0 ? activeExercises : DEFAULT_PRACTICAL_EXPS;
  const enteredExMarks = [];
  exList.forEach(e => {
    const raw = marks[e];
    if (raw !== "" && raw !== null && raw !== undefined && !isNaN(raw)) {
      enteredExMarks.push(Number(raw));
    }
  });

  const modelRaw = marks["Model"] !== undefined && marks["Model"] !== ""
    ? marks["Model"]
    : (marks["Model Practical"] !== undefined && marks["Model Practical"] !== "" ? marks["Model Practical"] : "");

  const hasModel = modelRaw !== "" && modelRaw !== null && modelRaw !== undefined && !isNaN(modelRaw);
  const modelVal = hasModel ? Number(modelRaw) : 0;

  if (enteredExMarks.length === 0 && !hasModel) {
    return { expAvg: "", practicalMark75: "", total100: "", internal: "", internal60: "", internal40: "" };
  }

  // 1. Practical Average /10 (blanks excluded from denominator, explicit 0 included)
  const avg = enteredExMarks.length > 0 ? enteredExMarks.reduce((s, v) => s + v, 0) / enteredExMarks.length : 0;
  const avgFormatted = enteredExMarks.length > 0 ? Math.round(avg * 100) / 100 : "";

  // 2. Practical Mark /75 = Average * 7.5
  const practicalMark75 = enteredExMarks.length > 0 ? Math.min(75, Math.round((avg * 7.5) * 100) / 100) : "";

  // 3. Total /100 = Practical Mark /75 + Model Practical /25
  const prForTotal = typeof practicalMark75 === "number" ? practicalMark75 : 0;
  const total100 = (enteredExMarks.length > 0 || hasModel)
    ? Math.min(100, Math.round((prForTotal + modelVal) * 100) / 100)
    : "";

  // 4. Overall Internal /60 = Total * 0.6
  const internal60 = typeof total100 === "number"
    ? Math.min(60, Math.round((total100 * 0.6) * 100) / 100)
    : "";

  return {
    expAvg: avgFormatted,
    practicalMark75: practicalMark75,
    total100: total100,
    internal: internal60,
    internal60: internal60,
    internal40: internal60,
  };
}

function calcIntegrated(marks, activeExercises = DEFAULT_PRACTICAL_EXPS) {
  // 1. THEORY INTERNAL SECTION
  const enteredUnits = [];
  THEORY_UNITS.forEach(u => {
    const raw = marks[u];
    if (raw !== "" && raw !== null && raw !== undefined && !isNaN(raw)) {
      enteredUnits.push(Number(raw));
    }
  });

  const iaRaw = marks["Assessment Mark"] !== undefined && marks["Assessment Mark"] !== ""
    ? marks["Assessment Mark"]
    : (marks["IA"] !== undefined && marks["IA"] !== ""
        ? marks["IA"]
        : (marks["Internal Assessment"] !== undefined && marks["Internal Assessment"] !== ""
            ? marks["Internal Assessment"]
            : ""));

  const hasIa = iaRaw !== "" && iaRaw !== null && iaRaw !== undefined && !isNaN(iaRaw);
  const iaVal = hasIa ? Number(iaRaw) : 0;

  let thAvg = "";
  let thUt60 = "";
  let thInternal = "";

  if (enteredUnits.length > 0) {
    const rawThAvg = enteredUnits.reduce((s, v) => s + v, 0) / enteredUnits.length;
    thAvg = Math.round(rawThAvg * 100) / 100;
    thUt60 = Math.min(60, Math.round(thAvg * 0.6 * 100) / 100);
  }

  if (enteredUnits.length > 0 || hasIa) {
    const utForTotal = typeof thUt60 === "number" ? thUt60 : 0;
    thInternal = Math.min(100, Math.round((utForTotal + iaVal) * 100) / 100);
  }

  // 2. PRACTICAL INTERNAL SECTION
  const exList = activeExercises && activeExercises.length > 0 ? activeExercises : DEFAULT_PRACTICAL_EXPS;
  const enteredEx = [];
  exList.forEach(e => {
    const raw = marks[e];
    if (raw !== "" && raw !== null && raw !== undefined && !isNaN(raw)) {
      enteredEx.push(Number(raw));
    }
  });

  const modelRaw = marks["Model"] !== undefined && marks["Model"] !== ""
    ? marks["Model"]
    : (marks["Model Practical"] !== undefined && marks["Model Practical"] !== ""
        ? marks["Model Practical"]
        : "");

  const hasModel = modelRaw !== "" && modelRaw !== null && modelRaw !== undefined && !isNaN(modelRaw);
  const modelVal = hasModel ? Number(modelRaw) : 0;

  let prAvg = "";
  let prMark75 = "";
  let prInternal = "";

  if (enteredEx.length > 0) {
    const rawPrAvg = enteredEx.reduce((s, v) => s + v, 0) / enteredEx.length;
    prAvg = Math.round(rawPrAvg * 100) / 100;
    prMark75 = Math.min(75, Math.round(prAvg * 7.5 * 100) / 100);
  }

  if (enteredEx.length > 0 || hasModel) {
    const prForTotal = typeof prMark75 === "number" ? prMark75 : 0;
    prInternal = Math.min(100, Math.round((prForTotal + modelVal) * 100) / 100);
  }

  // 3. FINAL INTEGRATED SECTION /50
  if (thInternal === "" && prInternal === "") {
    return {
      thAvg: "",
      thUt60: "",
      thInternal: "",
      prAvg: "",
      prMark75: "",
      prInternal: "",
      combinedTotal: "",
      integratedInternal50: "",
      internal: "",
      internal40: "",
      total100: ""
    };
  }

  const thNum = typeof thInternal === "number" ? thInternal : 0;
  const prNum = typeof prInternal === "number" ? prInternal : 0;
  const combinedTotal = Math.min(200, Math.round((thNum + prNum) * 100) / 100);
  const integratedInternal50 = Math.min(50, Math.round((combinedTotal / 4.0) * 100) / 100);

  return {
    thAvg,
    thUt60,
    thInternal,
    prAvg,
    prMark75,
    prInternal,
    combinedTotal,
    integratedInternal50,
    internal: integratedInternal50,
    internal40: integratedInternal50,
    total100: combinedTotal
  };
}

function initMarks(type, exList = DEFAULT_PRACTICAL_EXPS) {
  const m = {};
  if (type === "PRACTICAL") {
    (exList || DEFAULT_PRACTICAL_EXPS).forEach(e => { m[e] = ""; });
    m["Model"] = "";
  }
  if (type === "INTEGRATED") {
    THEORY_UNITS.forEach(u => { m[u] = ""; });
    m["Assessment Mark"] = "";
    (exList || DEFAULT_PRACTICAL_EXPS).forEach(e => { m[e] = ""; });
    m["Model"] = "";
  }
  if (type === "THEORY") {
    THEORY_UNITS.forEach(u => { m[u] = ""; });
    m["Assessment Mark"] = "";
  }
  return m;
}

export default function FacultyMarksEntry({ user }) {
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("");
  const [selectedSubjectCode, setSelectedSubjectCode] = useState("");
  const [subjectType, setSubjectType] = useState("THEORY");
  const [practicalExercises, setPracticalExercises] = useState(DEFAULT_PRACTICAL_EXPS);
  const [students, setStudents] = useState([]);
  const [status, setStatus] = useState("DRAFT");
  const [semester, setSemester] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);

  const getSubKey = (s) => s ? `${s.subjectCode}__${s.semester}__${s.department || ""}` : "";

  // ── Excel Upload Modal State ───────────────────────────────────────────────
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [uploadStatusAction, setUploadStatusAction] = useState("DRAFT");

  // ── Fetch assigned subjects ───────────────────────────────────────────────
  useEffect(() => {
    if (!user?.registerNumber) return;
    fetch(`${API_BASE}/api/faculty-marks/my-subjects?facultyId=${user.registerNumber}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setAssignedSubjects(data);
        if (data.length > 0) {
          const first = data[0];
          setSelectedSubjectKey(getSubKey(first));
          setSelectedSubjectCode(first.subjectCode);
        }
      })
      .catch(console.error);
  }, [user]);

  const currentSub = assignedSubjects.find(s => getSubKey(s) === selectedSubjectKey)
    || assignedSubjects.find(s => s.subjectCode === selectedSubjectCode)
    || assignedSubjects[0];
  const activeSubjectCode = currentSub?.subjectCode || selectedSubjectCode;
  const activeSemester = currentSub?.semester || semester || 1;
  const activeDept = currentSub?.department || "";

  // ── Fetch students roster ─────────────────────────────────────────────────
  const fetchStudents = () => {
    if (!activeSubjectCode || !user) return;
    const sem = activeSemester;
    const rawType = (currentSub?.subjectType || currentSub?.paperType || "THEORY").toUpperCase();
    const pType = rawType.includes("PRAC") ? "PRACTICAL" : rawType.includes("INTEG") ? "INTEGRATED" : "THEORY";

    setLoading(true);
    const deptParam = activeDept ? `&studentDepartment=${encodeURIComponent(activeDept)}` : "";
    fetch(`${API_BASE}/api/faculty-marks/subject-students?facultyId=${user.registerNumber}&subjectCode=${activeSubjectCode}&semester=${sem}${deptParam}`)
      .then(r => {
        if (!r.ok) {
          if (r.status === 403) throw new Error("Access denied: You are not authorized for this subject.");
          throw new Error("Failed to load roster.");
        }
        return r.json();
      })
      .then(data => {
        if (data) {
          setStatus(data.status || "DRAFT");
          setSemester(data.semester || sem);
          setSubjectType(data.subjectType || pType);
          const currentType = data.subjectType || pType;

          const configuredEx = data.configuredExercises && data.configuredExercises.length > 0
            ? data.configuredExercises
            : DEFAULT_PRACTICAL_EXPS;

          if (currentType === "PRACTICAL" || currentType === "INTEGRATED") {
            setPracticalExercises(configuredEx);
          }

          const rows = (data.students || []).map(st => {
            const base = initMarks(currentType, configuredEx);
            const savedComp = st.componentMarks || {};
            // Map any legacy or alternative names into standard keys
            const marks = { ...base };
            Object.entries(savedComp).forEach(([k, v]) => {
              if (k.startsWith("Unit") || k.startsWith("unit")) {
                const num = k.replace(/\D/g, "");
                marks[`Unit ${num}`] = v;
              } else if (k.startsWith("UT") || k.startsWith("ut")) {
                const num = k.replace(/\D/g, "");
                marks[`Unit ${num}`] = v;
              } else if (k === "Assessment Mark" || k === "AssessmentMark" || k === "IA" || k === "Internal Assessment") {
                marks["Assessment Mark"] = v;
              } else if (k === "Model Practical") {
                marks["Model"] = v;
              } else {
                marks[k] = v;
              }
            });

            let calc = { avg: "", utMark60: "", total100: "", internal40: "", expAvg: "", practicalMark75: "", internal: "" };
            if (currentType === "PRACTICAL") calc = calcPractical(marks, configuredEx);
            else if (currentType === "INTEGRATED") calc = calcIntegrated(marks, configuredEx);
            else calc = calcTheory(marks);

            return { registerNumber: st.registerNumber, name: st.name || "", marks, ...calc };
          });
          setStudents(rows);
        }
        setLoading(false);
      })
      .catch(err => {
        alert(err.message);
        setStudents([]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchStudents(); }, [selectedSubjectKey, activeSubjectCode, activeSemester, user]);

  // ── Dynamic Add / Remove Exercise ──────────────────────────────────────────
  const handleAddExercise = async () => {
    if (isLocked) return;
    const numbers = practicalExercises.map(e => {
      const m = e.match(/^EX(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    });
    let nextNum = numbers.length > 0 ? Math.max(...numbers, 0) + 1 : 1;
    while (practicalExercises.includes(`EX${nextNum}`)) {
      nextNum++;
    }
    const nextEx = `EX${nextNum}`;
    const updated = [...practicalExercises, nextEx];
    setPracticalExercises(updated);

    setStudents(prev => prev.map(st => {
      const calc = subjectType === "INTEGRATED"
        ? calcIntegrated(st.marks, updated)
        : calcPractical(st.marks, updated);
      return { ...st, ...calc };
    }));

    if (activeSubjectCode) {
      try {
        await fetch(`${API_BASE}/api/faculty-marks/practical-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectCode: activeSubjectCode,
            semester: activeSemester,
            exercises: updated,
          }),
        });
      } catch (err) {
        console.error("Failed to persist practical config:", err);
      }
    }
  };

  const handleRemoveExercise = async (exName) => {
    if (isLocked) return;
    if (practicalExercises.length <= 1) {
      alert("At least one exercise must be configured.");
      return;
    }

    const hasMarks = students.some(st => {
      const v = st.marks[exName];
      return v !== "" && v !== null && v !== undefined && !isNaN(v);
    });

    if (hasMarks) {
      const confirmed = window.confirm(
        `Exercise ${exName} contains entered marks. Are you sure you want to remove this exercise?`
      );
      if (!confirmed) return;
    }

    const updated = practicalExercises.filter(e => e !== exName);
    setPracticalExercises(updated);

    setStudents(prev => prev.map(st => {
      const calc = subjectType === "INTEGRATED"
        ? calcIntegrated(st.marks, updated)
        : calcPractical(st.marks, updated);
      return { ...st, ...calc };
    }));

    if (activeSubjectCode) {
      try {
        await fetch(`${API_BASE}/api/faculty-marks/practical-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectCode: activeSubjectCode,
            semester: activeSemester,
            exercises: updated,
          }),
        });
      } catch (err) {
        console.error("Failed to persist practical config:", err);
      }
    }
  };

  // ── Mark change ───────────────────────────────────────────────────────────
  const handleMarkChange = (regNo, field, val) => {
    // If blank/empty string, allow clearing and recalculate
    if (val === "" || val === null || val === undefined) {
      setStudents(prev => prev.map(st => {
        if (st.registerNumber !== regNo) return st;
        const marks = { ...st.marks, [field]: "" };

        let calc = { avg: "", utMark60: "", total100: "", internal40: "", expAvg: "", practicalMark75: "", internal: "" };
        if (subjectType === "PRACTICAL") calc = calcPractical(marks, practicalExercises);
        else if (subjectType === "INTEGRATED") calc = calcIntegrated(marks, practicalExercises);
        else calc = calcTheory(marks);

        return { ...st, marks, ...calc };
      }));
      return;
    }

    const numVal = Number(val);
    if (isNaN(numVal) || numVal < 0) return; // Reject invalid/non-numeric and negative values

    // Validate bounds
    if (subjectType === "THEORY") {
      if (THEORY_UNITS.includes(field) && numVal > THEORY_UNIT_MAX) return; // Unit max 100
      if (field === "Assessment Mark" && numVal > THEORY_ASSESSMENT_MAX) return; // Assessment max 40
    }
    if (subjectType === "PRACTICAL") {
      if (practicalExercises.includes(field) && numVal > PRACTICAL_EXP_MAX) return; // Exercise max 10
      if (field === "Model" && numVal > PRACTICAL_MODEL_MAX) return; // Model Practical max 25
    }
    if (subjectType === "INTEGRATED") {
      if (THEORY_UNITS.includes(field) && numVal > THEORY_UNIT_MAX) return; // Unit max 100
      if (field === "Assessment Mark" && numVal > THEORY_ASSESSMENT_MAX) return; // Assessment max 40
      if (practicalExercises.includes(field) && numVal > PRACTICAL_EXP_MAX) return; // Exercise max 10
      if (field === "Model" && numVal > PRACTICAL_MODEL_MAX) return; // Model Practical max 25
    }

    setStudents(prev => prev.map(st => {
      if (st.registerNumber !== regNo) return st;
      const marks = { ...st.marks, [field]: numVal };

      let calc = { avg: "", utMark60: "", total100: "", internal40: "", expAvg: "", practicalMark75: "", internal: "" };
      if (subjectType === "PRACTICAL") calc = calcPractical(marks, practicalExercises);
      else if (subjectType === "INTEGRATED") calc = calcIntegrated(marks, practicalExercises);
      else calc = calcTheory(marks);

      return { ...st, marks, ...calc };
    }));
  };

  // ── Grid Keyboard Navigation ──────────────────────────────────────────────
  const handleGridKeyDown = (e, rowIndex, colIndex, maxRows, maxCols, gridId = "marks-grid") => {
    let nextRow = rowIndex;
    let nextCol = colIndex;

    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        nextRow = Math.max(0, rowIndex - 1);
      } else {
        nextRow = Math.min(maxRows - 1, rowIndex + 1);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = Math.min(maxRows - 1, rowIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = Math.max(0, rowIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCol = Math.min(maxCols - 1, colIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextCol = Math.max(0, colIndex - 1);
    } else {
      return;
    }

    if (nextRow !== rowIndex || nextCol !== colIndex) {
      const selector = `input[data-grid="${gridId}"][data-row="${nextRow}"][data-col="${nextCol}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        try {
          target.select();
        } catch (_) {}
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  };

  // ── Save / Submit ─────────────────────────────────────────────────────────
  const handleSave = async (statusAction = "DRAFT") => {
    if (!activeSubjectCode) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: user.registerNumber,
          facultyName: user.name,
          subjectCode: activeSubjectCode,
          semester: activeSemester,
          status: statusAction,
          exercises: (subjectType === "PRACTICAL" || subjectType === "INTEGRATED") ? practicalExercises : undefined,
          marks: students.map(st => ({
            registerNumber: st.registerNumber,
            name: st.name,
            componentMarks: st.marks,
            finalInternal: (st.integratedInternal50 !== "" && st.integratedInternal50 !== undefined)
              ? st.integratedInternal50
              : ((st.internal60 !== "" && st.internal60 !== undefined)
                  ? st.internal60
                  : ((st.internal !== "" && st.internal !== undefined)
                      ? st.internal
                      : ((st.internal40 !== "" && st.internal40 !== undefined) ? st.internal40 : 0.0))),
            overrideInternal: true,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Marks saved as ${statusAction}`);
        fetchStudents();
      } else {
        alert(data.detail || "Failed to save marks");
      }
    } catch {
      alert("Error saving marks");
    }
    setSaving(false);
  };

  // ── Download Excel Template ───────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    if (!activeSubjectCode || !user) return;
    const deptParam = activeDept ? `&studentDepartment=${encodeURIComponent(activeDept)}` : "";
    const url = `${API_BASE}/api/faculty-marks/template?facultyId=${user.registerNumber}&subjectCode=${activeSubjectCode}&semester=${activeSemester}${deptParam}`;
    window.open(url, "_blank");
  };

  // ── Validate Excel Upload (Stage 1) ───────────────────────────────────────
  const handleUploadValidate = async () => {
    if (!uploadFile || !activeSubjectCode || !user) {
      alert("Please select an Excel file (.xlsx) first.");
      return;
    }
    setUploading(true);
    setValidationResult(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("facultyId", user.registerNumber);
    formData.append("subjectCode", activeSubjectCode);
    formData.append("semester", String(activeSemester));
    if (activeDept) formData.append("studentDepartment", activeDept);

    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/upload-validate`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Validation failed.");
      } else {
        setValidationResult(data);
      }
    } catch (e) {
      alert("Error validating Excel file.");
    }
    setUploading(false);
  };

  // ── Confirm Excel Upload (Stage 2) ────────────────────────────────────────
  const handleConfirmUpload = async () => {
    if (!validationResult || !validationResult.isValid) {
      alert("Cannot confirm: Excel file contains validation errors.");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/upload-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: user.registerNumber,
          facultyName: user.name,
          subjectCode: activeSubjectCode,
          semester: activeSemester,
          status: uploadStatusAction,
          marks: validationResult.preview
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Marks successfully uploaded and saved!");
        setShowUploadModal(false);
        setUploadFile(null);
        setValidationResult(null);
        fetchStudents();
      } else {
        alert(data.detail || "Upload confirmation failed.");
      }
    } catch {
      alert("Error confirming marks upload.");
    }
    setUploading(false);
  };

  // ── History ───────────────────────────────────────────────────────────────
  const handleViewHistory = async () => {
    if (!activeSubjectCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/faculty-marks/history?subjectCode=${activeSubjectCode}&semester=${activeSemester}`);
      if (res.ok) {
        setAuditHistory(await res.json());
        setShowHistoryModal(true);
      }
    } catch {
      console.error("History load failed");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (assignedSubjects.length === 0) {
    return (
      <div className="p-10 text-center bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="text-5xl mb-3">🔒</div>
        <h3 className="text-lg font-bold text-gray-900">No Assigned Subjects</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
          You are not currently assigned to any subjects. Contact Admin or your HOD to grant subject access.
        </p>
      </div>
    );
  }

  const isLocked = status === "SUBMITTED" || status === "APPROVED" || status === "PUBLISHED";
  const isPractical = subjectType === "PRACTICAL";
  const isIntegrated = subjectType === "INTEGRATED";
  const filtered = students.filter(st =>
    st.registerNumber.toLowerCase().includes(search.toLowerCase()) ||
    (st.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* ── Subject selector & Toolbar ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Subject</label>
            <select
              value={selectedSubjectKey || (currentSub ? getSubKey(currentSub) : "")}
              onChange={e => {
                const k = e.target.value;
                setSelectedSubjectKey(k);
                const found = assignedSubjects.find(s => getSubKey(s) === k);
                if (found) {
                  setSelectedSubjectCode(found.subjectCode);
                }
              }}
              className="px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-bold text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-500 max-w-xs"
            >
              {assignedSubjects.map(s => {
                const k = getSubKey(s);
                return (
                  <option key={k} value={k}>
                    {s.subjectCode} – {s.subjectName} (Sem {s.semester}{s.department ? ` · ${s.department}` : ""})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
              isPractical ? "bg-teal-50 text-teal-700 border-teal-200"
              : isIntegrated ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
              {isPractical ? "🧪 Practical" : isIntegrated ? "⚙️ Integrated" : "📘 Theory"}
            </span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
              status === "SUBMITTED" ? "bg-amber-50 text-amber-700 border-amber-200"
              : status === "APPROVED" || status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-blue-50 text-blue-700 border-blue-200"}`}>
              {status || "DRAFT"}
            </span>
            {isLocked && (
              <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                🔒 Locked
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 shadow-sm"
          >
            📥 Download Template (.xlsx)
          </button>
          <button
            onClick={() => { setShowUploadModal(true); setValidationResult(null); setUploadFile(null); }}
            disabled={isLocked}
            className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-xs rounded-xl border border-sky-200 flex items-center gap-1.5 shadow-sm disabled:opacity-40"
          >
            📤 Upload Marks Excel
          </button>
          <button onClick={handleViewHistory} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 shadow-sm">
            📜 Mark History
          </button>
        </div>
      </div>

      {/* ── Grid / Table ─────────────────────────────────────────────────── */}
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
                {subjectType} Internal Marks — {selectedSubjectCode}
                {currentSub?.subjectName ? ` · ${currentSub.subjectName}` : ""}
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isPractical
                  ? "Practical Exercises (EX1–EX10+, max 10 each) average converted to /75 + Model Practical (max 25). Total /100 converted to Overall Internal /60."
                  : isIntegrated
                  ? "Theory Internal /100 & Practical Internal /100 combined: Integrated Internal = (Theory + Practical) / 4 (Max 50)."
                  : "Unit tests (Unit 1–5, max 100 each) average converted to /60 + Assessment Mark (max 40). Total /100 converted to Overall Internal /40."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search register / name…"
                className="px-3 py-1.5 border border-gray-300 rounded-xl text-xs w-52 focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              {(isPractical || isIntegrated) && (
                <button
                  type="button"
                  onClick={handleAddExercise}
                  disabled={isLocked}
                  className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1 disabled:opacity-40"
                  title="Add next sequential exercise"
                >
                  + Add Exercise
                </button>
              )}
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
          {subjectType === "THEORY" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left border-separate border-spacing-0" style={{ minWidth: 980 }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th
                      style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                      className="py-3 px-3 font-bold rounded-tl-xl sticky left-0 z-30 bg-slate-800 text-white border-b border-slate-700"
                    >
                      #
                    </th>
                    <th
                      style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                      className="py-3 px-3 font-bold sticky left-[48px] z-30 bg-slate-800 text-white border-b border-slate-700 border-r border-slate-700 shadow-[3px_0_5px_rgba(0,0,0,0.25)]"
                    >
                      Student / Roll Number
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-indigo-700 border-b border-slate-700">
                      Unit 1 /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-indigo-700 border-b border-slate-700">
                      Unit 2 /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-indigo-700 border-b border-slate-700">
                      Unit 3 /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-indigo-700 border-b border-slate-700">
                      Unit 4 /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-indigo-700 border-b border-slate-700">
                      Unit 5 /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-violet-700 border-b border-slate-700">
                      Average /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-purple-700 border-b border-slate-700">
                      UT Mark /60
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-amber-700 border-b border-slate-700">
                      Assessment Mark /40
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-blue-700 border-b border-slate-700">
                      Total /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-emerald-700 rounded-tr-xl border-b border-slate-700">
                      Overall Internal /40
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((st, idx) => (
                    <tr key={st.registerNumber} className={`group ${idx % 2 === 0 ? "bg-white hover:bg-indigo-50/30" : "bg-slate-50 hover:bg-indigo-50/30"}`}>
                      <td
                        style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                        className={`py-2 px-3 text-gray-400 font-medium sticky left-0 z-20 border-b border-gray-100 ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } group-hover:bg-slate-100`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                        className={`py-2 px-3 sticky left-[48px] z-20 border-b border-gray-100 border-r border-gray-200 shadow-[3px_0_5px_rgba(0,0,0,0.08)] ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } group-hover:bg-slate-100`}
                      >
                        <div className="font-mono font-bold text-gray-900">{st.registerNumber}</div>
                        <div className="text-[11px] text-gray-500 font-medium truncate max-w-[170px]" title={st.name}>{st.name}</div>
                      </td>
                      {THEORY_UNITS.map((u, uIdx) => (
                        <td key={u} className="py-1.5 px-2 text-center border-b border-gray-100">
                          <input
                            type="number"
                            min="0"
                            max={THEORY_UNIT_MAX}
                            value={st.marks[u] ?? ""}
                            disabled={isLocked}
                            onChange={e => handleMarkChange(st.registerNumber, u, e.target.value)}
                            data-grid="theory-marks"
                            data-row={idx}
                            data-col={uIdx}
                            onKeyDown={e => handleGridKeyDown(e, idx, uIdx, filtered.length, 6, "theory-marks")}
                            onFocus={e => { try { e.target.select(); } catch (_) {} }}
                            className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 outline-none"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 text-center font-bold text-violet-700 bg-violet-50/60 border-b border-gray-100">
                        {st.avg !== "" && st.avg !== undefined ? st.avg : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-purple-700 bg-purple-50/60 border-b border-gray-100">
                        {st.utMark60 !== "" && st.utMark60 !== undefined ? st.utMark60 : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center bg-amber-50/40 border-b border-gray-100">
                        <input
                          type="number"
                          min="0"
                          max={THEORY_ASSESSMENT_MAX}
                          value={st.marks["Assessment Mark"] ?? ""}
                          disabled={isLocked}
                          onChange={e => handleMarkChange(st.registerNumber, "Assessment Mark", e.target.value)}
                          data-grid="theory-marks"
                          data-row={idx}
                          data-col={5}
                          onKeyDown={e => handleGridKeyDown(e, idx, 5, filtered.length, 6, "theory-marks")}
                          onFocus={e => { try { e.target.select(); } catch (_) {} }}
                          className="w-16 px-2 py-1 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 outline-none"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-blue-700 bg-blue-50/60 border-b border-gray-100">
                        {st.total100 !== "" && st.total100 !== undefined ? st.total100 : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/60 text-sm border-b border-gray-100">
                        {st.internal40 !== "" && st.internal40 !== undefined ? st.internal40 : (st.internal !== "" && st.internal !== undefined ? st.internal : <span className="text-gray-300">—</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── PRACTICAL TABLE ──────────────────────────────────────────── */}
          {subjectType === "PRACTICAL" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left border-separate border-spacing-0" style={{ minWidth: 900 + (practicalExercises.length * 68) }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th
                      style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                      className="py-3 px-3 font-bold rounded-tl-xl sticky left-0 z-30 bg-slate-800 text-white border-b border-slate-700"
                    >
                      #
                    </th>
                    <th
                      style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                      className="py-3 px-3 font-bold sticky left-[48px] z-30 bg-slate-800 text-white border-b border-slate-700 border-r border-slate-700 shadow-[3px_0_5px_rgba(0,0,0,0.25)]"
                    >
                      Student / Roll Number
                    </th>
                    {practicalExercises.map(e => (
                      <th key={e} className="py-2 px-2 text-center font-bold bg-teal-700 whitespace-nowrap border-b border-slate-700">
                        <div className="flex items-center justify-center gap-1">
                          <span>{e} /10</span>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(e)}
                              className="text-teal-200 hover:text-red-300 ml-0.5 p-0.5 rounded transition text-[11px]"
                              title={`Remove ${e}`}
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-2 text-center font-bold bg-orange-700 whitespace-nowrap border-b border-slate-700">
                      Average /10
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-purple-700 whitespace-nowrap border-b border-slate-700">
                      Practical Mark /75
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-amber-700 whitespace-nowrap border-b border-slate-700">
                      Model Practical /25
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-blue-700 whitespace-nowrap border-b border-slate-700">
                      Total /100
                    </th>
                    <th className="py-3 px-2 text-center font-bold bg-emerald-700 rounded-tr-xl whitespace-nowrap border-b border-slate-700">
                      Overall Internal /60
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((st, idx) => (
                    <tr key={st.registerNumber} className={`group ${idx % 2 === 0 ? "bg-white hover:bg-teal-50/30" : "bg-slate-50 hover:bg-teal-50/30"}`}>
                      <td
                        style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                        className={`py-2 px-3 text-gray-400 font-medium sticky left-0 z-20 border-b border-gray-100 ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } group-hover:bg-slate-100`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                        className={`py-2 px-3 sticky left-[48px] z-20 border-b border-gray-100 border-r border-gray-200 shadow-[3px_0_5px_rgba(0,0,0,0.08)] ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } group-hover:bg-slate-100`}
                      >
                        <div className="font-mono font-bold text-gray-900">{st.registerNumber}</div>
                        <div className="text-[11px] text-gray-500 font-medium truncate max-w-[170px]" title={st.name}>{st.name}</div>
                      </td>
                      {practicalExercises.map((e, eIdx) => (
                        <td key={e} className="py-1.5 px-1 text-center border-b border-gray-100">
                          <input
                            type="number"
                            min="0"
                            max={PRACTICAL_EXP_MAX}
                            step="any"
                            value={st.marks[e] ?? ""}
                            disabled={isLocked}
                            onChange={ev => handleMarkChange(st.registerNumber, e, ev.target.value)}
                            data-grid="practical-marks"
                            data-row={idx}
                            data-col={eIdx}
                            onKeyDown={ev => handleGridKeyDown(ev, idx, eIdx, filtered.length, practicalExercises.length + 1, "practical-marks")}
                            onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                            className="w-14 px-1 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 outline-none"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-bold text-orange-700 bg-orange-50/60 border-b border-gray-100">
                        {st.expAvg !== "" && st.expAvg !== undefined ? st.expAvg : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-purple-700 bg-purple-50/60 border-b border-gray-100">
                        {st.practicalMark75 !== "" && st.practicalMark75 !== undefined ? st.practicalMark75 : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center bg-amber-50/40 border-b border-gray-100">
                        <input
                          type="number"
                          min="0"
                          max={PRACTICAL_MODEL_MAX}
                          step="any"
                          value={st.marks["Model"] ?? ""}
                          disabled={isLocked}
                          onChange={e => handleMarkChange(st.registerNumber, "Model", e.target.value)}
                          data-grid="practical-marks"
                          data-row={idx}
                          data-col={practicalExercises.length}
                          onKeyDown={ev => handleGridKeyDown(ev, idx, practicalExercises.length, filtered.length, practicalExercises.length + 1, "practical-marks")}
                          onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                          className="w-16 px-2 py-1 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 outline-none"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-blue-700 bg-blue-50/60 border-b border-gray-100">
                        {st.total100 !== "" && st.total100 !== undefined ? st.total100 : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/60 text-sm border-b border-gray-100">
                        {st.internal60 !== "" && st.internal60 !== undefined ? st.internal60 : (st.internal !== "" && st.internal !== undefined ? st.internal : (st.internal40 !== "" && st.internal40 !== undefined ? st.internal40 : <span className="text-gray-300">—</span>))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── INTEGRATED TABLE ─────────────────────────────────────────── */}
          {subjectType === "INTEGRATED" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left border-separate border-spacing-0" style={{ minWidth: 1050 + (practicalExercises.length * 60) }}>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th
                      rowSpan={2}
                      style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                      className="py-3 px-3 font-bold rounded-tl-xl sticky left-0 z-30 bg-slate-800 text-white border-b border-slate-700 align-middle"
                    >
                      #
                    </th>
                    <th
                      rowSpan={2}
                      style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                      className="py-3 px-3 font-bold sticky left-[48px] z-30 bg-slate-800 text-white border-b border-slate-700 border-r border-slate-700 shadow-[3px_0_5px_rgba(0,0,0,0.25)] align-middle"
                    >
                      Student / Roll Number
                    </th>
                    <th colSpan={8} className="py-2 px-3 text-center font-bold bg-indigo-800 border-r border-slate-700 border-b border-slate-700">
                      Theory Internal Section (Max 100)
                    </th>
                    <th colSpan={practicalExercises.length + 3} className="py-2 px-3 text-center font-bold bg-teal-800 border-r border-slate-700 border-b border-slate-700">
                      Practical Internal Section (Max 100)
                    </th>
                    <th className="py-2 px-3 text-center font-bold bg-emerald-800 rounded-tr-xl border-b border-slate-700">
                      Final Integrated Internal (Max 50)
                    </th>
                  </tr>
                  <tr className="bg-slate-900 text-slate-200">
                    {/* Theory headers */}
                    {THEORY_UNITS.map(u => (
                      <th key={u} className="py-2 px-2 text-center font-bold bg-indigo-700 whitespace-nowrap border-b border-slate-700">
                        {u} /100
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center font-bold bg-purple-700 whitespace-nowrap border-b border-slate-700">
                      Theory UT Mark /60
                    </th>
                    <th className="py-2 px-2 text-center font-bold bg-amber-700 whitespace-nowrap border-b border-slate-700">
                      Internal Assessment Mark /40
                    </th>
                    <th className="py-2 px-2 text-center font-bold bg-blue-700 border-r border-slate-700 whitespace-nowrap border-b border-slate-700">
                      Theory Internal /100
                    </th>

                    {/* Practical headers */}
                    {practicalExercises.map(e => (
                      <th key={e} className="py-2 px-2 text-center font-bold bg-teal-700 whitespace-nowrap border-b border-slate-700">
                        <div className="flex items-center justify-center gap-1">
                          <span>{e} /10</span>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(e)}
                              className="text-teal-200 hover:text-red-300 ml-0.5 p-0.5 rounded transition text-[11px]"
                              title={`Remove ${e}`}
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center font-bold bg-purple-700 whitespace-nowrap border-b border-slate-700">
                      Practical Mark /75
                    </th>
                    <th className="py-2 px-2 text-center font-bold bg-amber-700 whitespace-nowrap border-b border-slate-700">
                      Model Practical /25
                    </th>
                    <th className="py-2 px-2 text-center font-bold bg-blue-700 border-r border-slate-700 whitespace-nowrap border-b border-slate-700">
                      Practical Internal /100
                    </th>

                    {/* Final Integrated header */}
                    <th className="py-2 px-2 text-center font-bold bg-emerald-700 whitespace-nowrap border-b border-slate-700">
                      Integrated Internal /50
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((st, idx) => {
                    const totalGridCols = 7 + practicalExercises.length;
                    return (
                      <tr key={st.registerNumber} className={`group ${idx % 2 === 0 ? "bg-white hover:bg-purple-50/20" : "bg-slate-50 hover:bg-purple-50/20"}`}>
                        <td
                          style={{ width: 48, minWidth: 48, maxWidth: 48, left: 0 }}
                          className={`py-2 px-3 text-gray-400 font-medium sticky left-0 z-20 border-b border-gray-100 ${
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                          } group-hover:bg-slate-100`}
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{ width: 200, minWidth: 200, maxWidth: 200, left: 48 }}
                          className={`py-2 px-3 sticky left-[48px] z-20 border-b border-gray-100 border-r border-gray-200 shadow-[3px_0_5px_rgba(0,0,0,0.08)] ${
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                          } group-hover:bg-slate-100`}
                        >
                          <div className="font-mono font-bold text-gray-900">{st.registerNumber}</div>
                          <div className="text-[11px] text-gray-500 font-medium truncate max-w-[170px]" title={st.name}>{st.name}</div>
                        </td>

                        {/* Theory inputs */}
                        {THEORY_UNITS.map((u, uIdx) => (
                          <td key={u} className="py-1.5 px-1 text-center border-b border-gray-100">
                            <input
                              type="number"
                              min="0"
                              max={THEORY_UNIT_MAX}
                              step="any"
                              value={st.marks[u] ?? ""}
                              disabled={isLocked}
                              onChange={e => handleMarkChange(st.registerNumber, u, e.target.value)}
                              data-grid="integrated-marks"
                              data-row={idx}
                              data-col={uIdx}
                              onKeyDown={ev => handleGridKeyDown(ev, idx, uIdx, filtered.length, totalGridCols, "integrated-marks")}
                              onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                              className="w-14 px-1 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 outline-none"
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center font-bold text-purple-700 bg-purple-50/60 border-b border-gray-100">
                          {st.thUt60 !== "" && st.thUt60 !== undefined ? st.thUt60 : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1.5 px-1 text-center bg-amber-50/40 border-b border-gray-100">
                          <input
                            type="number"
                            min="0"
                            max={THEORY_ASSESSMENT_MAX}
                            step="any"
                            value={st.marks["Assessment Mark"] ?? ""}
                            disabled={isLocked}
                            onChange={e => handleMarkChange(st.registerNumber, "Assessment Mark", e.target.value)}
                            data-grid="integrated-marks"
                            data-row={idx}
                            data-col={5}
                            onKeyDown={ev => handleGridKeyDown(ev, idx, 5, filtered.length, totalGridCols, "integrated-marks")}
                            onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                            className="w-16 px-1 py-1 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 outline-none"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-blue-700 bg-blue-50/60 border-r border-gray-200 border-b border-gray-100">
                          {st.thInternal !== "" && st.thInternal !== undefined ? st.thInternal : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Practical inputs */}
                        {practicalExercises.map((e, eIdx) => (
                          <td key={e} className="py-1.5 px-1 text-center border-b border-gray-100">
                            <input
                              type="number"
                              min="0"
                              max={PRACTICAL_EXP_MAX}
                              step="any"
                              value={st.marks[e] ?? ""}
                              disabled={isLocked}
                              onChange={ev => handleMarkChange(st.registerNumber, e, ev.target.value)}
                              data-grid="integrated-marks"
                              data-row={idx}
                              data-col={6 + eIdx}
                              onKeyDown={ev => handleGridKeyDown(ev, idx, 6 + eIdx, filtered.length, totalGridCols, "integrated-marks")}
                              onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                              className="w-14 px-1 py-1 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 outline-none"
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center font-bold text-purple-700 bg-purple-50/60 border-b border-gray-100">
                          {st.prMark75 !== "" && st.prMark75 !== undefined ? st.prMark75 : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1.5 px-1 text-center bg-amber-50/40 border-b border-gray-100">
                          <input
                            type="number"
                            min="0"
                            max={PRACTICAL_MODEL_MAX}
                            step="any"
                            value={st.marks["Model"] ?? ""}
                            disabled={isLocked}
                            onChange={e => handleMarkChange(st.registerNumber, "Model", e.target.value)}
                            data-grid="integrated-marks"
                            data-row={idx}
                            data-col={6 + practicalExercises.length}
                            onKeyDown={ev => handleGridKeyDown(ev, idx, 6 + practicalExercises.length, filtered.length, totalGridCols, "integrated-marks")}
                            onFocus={ev => { try { ev.target.select(); } catch (_) {} }}
                            className="w-16 px-1 py-1 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 outline-none"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-blue-700 bg-blue-50/60 border-r border-gray-200 border-b border-gray-100">
                          {st.prInternal !== "" && st.prInternal !== undefined ? st.prInternal : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Final Integrated */}
                        <td className="py-2 px-3 text-center font-black text-emerald-700 bg-emerald-50/60 text-sm border-b border-gray-100">
                          {st.integratedInternal50 !== "" && st.integratedInternal50 !== undefined ? st.integratedInternal50 : (st.internal !== "" && st.internal !== undefined ? st.internal : <span className="text-gray-300">—</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2 flex flex-wrap gap-4 items-center">
            <span className="text-indigo-600 font-semibold bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100">
              ⌨️ <strong>Keyboard Navigation</strong>: Press <strong>Enter</strong> or <strong>↓ / ↑</strong> to move across student rows · Press <strong>← / →</strong> to move across unit tests
            </span>
            {subjectType === "THEORY" && (
              <>
                <span>📘 <strong>Unit Tests</strong>: UT1–UT5 (Max 100 each) → Scaled to /60</span>
                <span>📝 <strong>IA</strong>: Internal Assessment raw score (Max 40)</span>
                <span>✅ <strong>Final Internal</strong> = UT Component (/60) + IA (/40) = 100 max</span>
              </>
            )}
            {subjectType === "PRACTICAL" && (
              <>
                <span>🧪 <strong>Experiments</strong>: EX1–EX10 (Max 100 each) → Scaled to /75</span>
                <span>📝 <strong>Model Practical</strong>: Max 25</span>
                <span>✅ <strong>Final Internal</strong> = Exp Component (/75) + Model (/25) scaled to /60</span>
              </>
            )}
            {subjectType === "INTEGRATED" && (
              <>
                <span>📘 <strong>Theory Internal</strong>: Units (Max 100) avg → UT /60 + IA /40 = Theory /100</span>
                <span>🧪 <strong>Practical Internal</strong>: EX1–EX10+ (Max 10) avg → Pr /75 + Model /25 = Practical /100</span>
                <span>⚖️ <strong>Final Integrated</strong> = (Theory Internal + Practical Internal) / 4 (Max 50)</span>
              </>
            )}
          </div>
        </div>
      ) : !loading ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 font-medium text-sm">
          No student records found for this subject.
        </div>
      ) : null}

      {/* ── Excel Upload Modal (Two-Stage: Validate & Preview -> Confirm) ──── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upload Marks via Excel (.xlsx)</h3>
                <p className="text-xs text-gray-500">
                  Subject: <span className="font-mono font-bold text-indigo-700">{selectedSubjectCode}</span> (Sem {semester}) · Type: <span className="font-bold">{subjectType}</span>
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none"
              >✕</button>
            </div>

            {/* Stage 1: Select File & Validate */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[280px]">
                  <label className="text-xs font-bold text-gray-700 block mb-1">Select Excel (.xlsx) File</label>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={e => {
                      setUploadFile(e.target.files[0]);
                      setValidationResult(null);
                    }}
                    className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadTemplate}
                    type="button"
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200"
                  >
                    📥 Get Template
                  </button>
                  <button
                    onClick={handleUploadValidate}
                    disabled={!uploadFile || uploading}
                    type="button"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-40"
                  >
                    {uploading ? "Validating…" : "🔍 Validate & Preview"}
                  </button>
                </div>
              </div>
            </div>

            {/* Validation Diagnostic Results */}
            <div className="flex-1 overflow-y-auto space-y-4">
              {validationResult && (
                <div className="space-y-3">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-100 rounded-xl text-center">
                      <div className="text-xl font-black text-slate-800">{validationResult.totalRows}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Total Rows</div>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-200">
                      <div className="text-xl font-black text-emerald-700">{validationResult.validRows}</div>
                      <div className="text-[10px] font-bold text-emerald-600 uppercase">Valid Rows</div>
                    </div>
                    <div className={`p-3 rounded-xl text-center border ${validationResult.errorRows > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className={`text-xl font-black ${validationResult.errorRows > 0 ? "text-red-700" : "text-slate-400"}`}>
                        {validationResult.errorRows}
                      </div>
                      <div className="text-[10px] font-bold text-red-600 uppercase">Error Rows</div>
                    </div>
                  </div>

                  {/* Errors Table */}
                  {validationResult.errors && validationResult.errors.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                        ⚠️ Validation Errors ({validationResult.errors.length}) — Must be fixed before saving
                      </h4>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-red-100 text-red-900 font-bold sticky top-0">
                            <tr>
                              <th className="py-1.5 px-2">Row</th>
                              <th className="py-1.5 px-2">Roll No</th>
                              <th className="py-1.5 px-2">Field</th>
                              <th className="py-1.5 px-2">Error Diagnostic</th>
                              <th className="py-1.5 px-2">Expected Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100">
                            {validationResult.errors.map((err, idx) => (
                              <tr key={idx} className="hover:bg-red-50/50">
                                <td className="py-1 px-2 font-mono font-bold text-red-700">{err.row}</td>
                                <td className="py-1 px-2 font-mono font-bold">{err.rollNumber}</td>
                                <td className="py-1 px-2 font-semibold text-gray-700">{err.field}</td>
                                <td className="py-1 px-2 text-red-700 font-medium">{err.error}</td>
                                <td className="py-1 px-2 text-gray-500 font-mono text-[11px]">{err.expectedValue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Preview Table */}
                  {validationResult.preview && validationResult.preview.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-gray-700">Preview Data ({validationResult.preview.length} Students)</h4>
                      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-gray-700 font-bold sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Roll No</th>
                              <th className="py-2 px-3">Student Name</th>
                              <th className="py-2 px-3">Parsed Component Marks</th>
                              <th className="py-2 px-3 text-right">Calculated Internal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {validationResult.preview.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-1.5 px-3 font-mono font-bold text-gray-900">{p.registerNumber}</td>
                                <td className="py-1.5 px-3 text-gray-700">{p.name || "—"}</td>
                                <td className="py-1.5 px-3 font-mono text-[11px] text-indigo-700">
                                  {Object.entries(p.componentMarks || {}).map(([k, v]) => `${k}:${v}`).join(", ") || "—"}
                                </td>
                                <td className="py-1.5 px-3 text-right font-black text-emerald-700">
                                  {p.finalInternal}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stage 2: Confirm & Insert */}
            <div className="border-t pt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-600">Save as:</label>
                <select
                  value={uploadStatusAction}
                  onChange={e => setUploadStatusAction(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800"
                >
                  <option value="DRAFT">DRAFT (Editable)</option>
                  <option value="SUBMITTED">SUBMITTED (Locked)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={!validationResult || !validationResult.isValid || uploading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow disabled:opacity-40"
                >
                  {uploading ? "Committing…" : "✅ Confirm & Commit Marks"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <thead className="bg-slate-100 text-gray-700 font-bold sticky top-0">
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
