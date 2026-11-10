import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

export default function AcademicManagement() {
  const [subTab, setSubTab] = useState("subjects"); // "subjects", "faculty_access"

  // ─────────────────────────────────────────────────────────────────────────
  // SUBJECT MASTER STATES
  // ─────────────────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([]);
  const [subjectFilterDept, setSubjectFilterDept] = useState("ALL");
  const [subjectFilterType, setSubjectFilterType] = useState("ALL");
  const [subjectFilterRegulation, setSubjectFilterRegulation] = useState("ALL");
  const [subjectSearchQuery, setSubjectSearchQuery] = useState("");
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({
    subjectCode: "",
    subjectName: "",
    department: "CSE",
    credits: 3,
    paperType: "THEORY",
    regulation: "2021",
  });

  // EXCEL UPLOAD STATES
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadRegulation, setUploadRegulation] = useState("2021");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // BULK DELETE STATES
  const [selectedSubjectKeys, setSelectedSubjectKeys] = useState([]);
  const [deletingSubjects, setDeletingSubjects] = useState(false);

  const getSubKey = (sub) => sub.id || `${sub.subjectCode}_${sub.department}_${sub.regulation || "2021"}`;

  // Filter subjects by search query (subject code and subject name/title)
  const filteredSubjects = subjects.filter((sub) => {
    if (!subjectSearchQuery.trim()) return true;
    const q = subjectSearchQuery.trim().toLowerCase();
    const code = (sub.subjectCode || "").toLowerCase();
    const name = (sub.subjectName || sub.subjectTitle || sub.name || "").toLowerCase();
    const rawCode = code.replace(/\s+/g, "");
    const rawQ = q.replace(/\s+/g, "");

    // 1. Direct substring match on code or name
    if (code.includes(q) || name.includes(q)) return true;

    // 2. Space-insensitive code match (e.g. "AI 3021" matches "AI3021")
    if (rawCode && rawCode.includes(rawQ)) return true;

    // 3. Combined match
    const combined = `${code} ${name}`;
    if (combined.includes(q)) return true;

    // 4. Multi-token match (all words match in code or name)
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      return tokens.every((token) => code.includes(token) || name.includes(token));
    }

    return false;
  });

  const toggleSelectSubject = (sub) => {
    const key = getSubKey(sub);
    setSelectedSubjectKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    const visibleKeys = filteredSubjects.map(getSubKey);
    if (visibleKeys.length === 0) return;
    const allVisibleSelected = visibleKeys.every((k) => selectedSubjectKeys.includes(k));
    if (allVisibleSelected) {
      setSelectedSubjectKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedSubjectKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSubjectKeys.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedSubjectKeys.length} selected subject(s)? This action cannot be undone.`)) {
      return;
    }

    setDeletingSubjects(true);
    try {
      const ids = selectedSubjectKeys.filter((k) => k.length === 24);
      const keys = selectedSubjectKeys
        .filter((k) => k.length !== 24)
        .map((k) => {
          const parts = k.split("_");
          return { subjectCode: parts[0], department: parts[1], regulation: parts[2] };
        });

      const res = await fetch(`${API_BASE}/api/academic/subjects/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectIds: ids, subjectKeys: keys }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Subjects deleted successfully.");
        setSelectedSubjectKeys([]);
        fetchSubjects();
      } else {
        alert(data.detail || "Failed to delete subjects.");
      }
    } catch (err) {
      alert("Error deleting subjects.");
    } finally {
      setDeletingSubjects(false);
    }
  };

  const handleDeleteSingleSubject = async (sub) => {
    if (!window.confirm(`Are you sure you want to delete subject ${sub.subjectCode} - ${sub.subjectName}?`)) return;
    try {
      const params = new URLSearchParams();
      if (sub.department) params.append("department", sub.department);
      if (sub.regulation) params.append("regulation", sub.regulation);

      const res = await fetch(`${API_BASE}/api/academic/subjects/${sub.subjectCode}?${params.toString()}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedSubjectKeys((prev) => prev.filter((k) => k !== getSubKey(sub)));
        fetchSubjects();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to delete subject.");
      }
    } catch (err) {
      alert("Error deleting subject.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FACULTY ACCESS STATES & FILTERS
  // ─────────────────────────────────────────────────────────────────────────
  const [faculties, setFaculties] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [assignedAssignments, setAssignedAssignments] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [selectedToAssignKeys, setSelectedToAssignKeys] = useState([]);

  // Option 1 Filter: Faculty Members List
  const [facultyFilterDept, setFacultyFilterDept] = useState("ALL");
  const [facultySearchInput, setFacultySearchInput] = useState("");
  const [facultySearchQuery, setFacultySearchQuery] = useState("");

  // Filters: Available Student Subjects
  const [availSubjectDept, setAvailSubjectDept] = useState("ALL");
  const [availSubjectReg, setAvailSubjectReg] = useState("ALL");
  const [availSubjectSem, setAvailSubjectSem] = useState("ALL");
  const [availSubjectYear, setAvailSubjectYear] = useState("ALL");
  const [availSubjectSearch, setAvailSubjectSearch] = useState("");
  const [availableSubjectsList, setAvailableSubjectsList] = useState([]);
  const [loadingAvailableSubjects, setLoadingAvailableSubjects] = useState(false);
  const [regulationsList, setRegulationsList] = useState(["2021", "2024"]);
  const [academicYearsList, setAcademicYearsList] = useState(["2023-2024", "2024-2025", "2025-2026", "2026-2027"]);

  // Faculty filter derived value
  const filteredFaculties = faculties.filter((fac) => {
    const facDept = (fac.department || "").toUpperCase();
    const matchesDept = facultyFilterDept === "ALL" || facDept === facultyFilterDept.toUpperCase();
    const query = facultySearchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      (fac.name || "").toLowerCase().includes(query) ||
      (fac.registerNumber || "").toLowerCase().includes(query);
    return matchesDept && matchesSearch;
  });

  const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "AIDS", "MECH", "CIVIL", "CSBS", "BIOTECH", "AERO"];

  // Fetch subjects (respects Subject Master tab filters)
  const fetchSubjects = async () => {
    try {
      const params = new URLSearchParams();
      if (subjectFilterDept !== "ALL") params.append("department", subjectFilterDept);
      if (subjectFilterType !== "ALL") params.append("paperType", subjectFilterType);
      if (subjectFilterRegulation !== "ALL") params.append("regulation", subjectFilterRegulation);
      const res = await fetch(`${API_BASE}/api/academic/subjects?${params.toString()}`);
      if (res.ok) setSubjects(await res.json());
    } catch (err) {
      console.error("Failed to fetch subjects", err);
    }
  };

  // Fetch available student subjects offered in curriculum/enrollment
  const fetchAvailableSubjects = async () => {
    setLoadingAvailableSubjects(true);
    try {
      const params = new URLSearchParams();
      if (availSubjectDept && availSubjectDept !== "ALL") params.append("department", availSubjectDept);
      if (availSubjectReg && availSubjectReg !== "ALL") params.append("regulation", availSubjectReg);
      if (availSubjectSem && availSubjectSem !== "ALL") params.append("semester", availSubjectSem);
      if (availSubjectYear && availSubjectYear !== "ALL") params.append("academicYear", availSubjectYear);
      if (availSubjectSearch.trim()) params.append("search", availSubjectSearch.trim());

      const res = await fetch(`${API_BASE}/api/academic/faculty-access/available-subjects?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableSubjectsList(Array.isArray(data) ? data : []);
      } else {
        setAvailableSubjectsList([]);
      }
    } catch (err) {
      console.error("Failed to fetch available student subjects", err);
      setAvailableSubjectsList([]);
    } finally {
      setLoadingAvailableSubjects(false);
    }
  };

  // Fetch regulations and academic years for filter options
  const fetchFilterOptions = async () => {
    try {
      const [regRes, ayRes] = await Promise.all([
        fetch(`${API_BASE}/api/academic/regulations`),
        fetch(`${API_BASE}/api/academic/academic-years`),
      ]);
      if (regRes.ok) {
        const regs = await regRes.json();
        if (Array.isArray(regs) && regs.length > 0) {
          setRegulationsList(regs.map((r) => r.code || r));
        }
      }
      if (ayRes.ok) {
        const ays = await ayRes.json();
        if (Array.isArray(ays) && ays.length > 0) {
          setAcademicYearsList(ays.map((y) => y.year || y));
        }
      }
    } catch (e) {
      console.error("Error fetching filter options", e);
    }
  };

  // Fetch faculties
  const fetchFaculties = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/import/logins`);
      if (res.ok) {
        const data = await res.json();
        setFaculties(data.filter((u) => u.role === "faculty"));
      }
    } catch (err) {
      console.error("Failed to fetch faculties", err);
    }
  };

  // On tab switch: init assignment panel
  useEffect(() => {
    if (subTab === "subjects") fetchSubjects();
    if (subTab === "faculty_access") {
      fetchFaculties();
      fetchFilterOptions();
      fetchAvailableSubjects();
    }
  }, [subTab, subjectFilterDept, subjectFilterType, subjectFilterRegulation]);

  // Re-fetch available subjects whenever filters change
  useEffect(() => {
    if (subTab !== "faculty_access") return;
    fetchAvailableSubjects();
  }, [subTab, availSubjectDept, availSubjectReg, availSubjectSem, availSubjectYear, availSubjectSearch]);

  const handleSaveSubject = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/academic/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subjectForm),
      });
      if (res.ok) {
        setShowSubjectModal(false);
        fetchSubjects();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to save subject");
      }
    } catch (err) {
      alert("Error saving subject");
    }
  };

  const handleExcelUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      alert("Please select an Excel file to upload.");
      return;
    }
    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("regulation", uploadRegulation);
    formData.append("defaultSemester", 1);

    try {
      const res = await fetch(`${API_BASE}/api/academic/subjects/upload-excel`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadResult(data);
        fetchSubjects();
      } else {
        alert(data.detail || "Failed to upload Excel file.");
      }
    } catch (err) {
      alert("Error uploading Excel file.");
    } finally {
      setUploading(false);
    }
  };

  // Helper to generate a unique key for duplicate prevention
  const getAssignmentKey = (a) =>
    `${(a.subjectCode || "").toUpperCase()}_${(a.studentDepartment || a.department || "ALL").toUpperCase()}_${a.semester || 1}_${(a.regulation || "2021").toUpperCase()}_${(a.academicYear || "2025-2026").toUpperCase()}`;

  // Select Faculty Access
  const handleSelectFaculty = async (fac) => {
    setSelectedFaculty(fac);
    setSelectedToAssignKeys([]);
    try {
      const res = await fetch(`${API_BASE}/api/academic/faculty-access/${fac.registerNumber}`);
      if (res.ok) {
        const data = await res.json();
        setAssignedAssignments(data.assignments || []);
      }
    } catch (err) {
      setAssignedAssignments([]);
    }
  };

  const toggleSelectToAssign = (sub) => {
    const key = getAssignmentKey(sub);
    setSelectedToAssignKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAssignSelected = async () => {
    if (!selectedFaculty) return;
    if (selectedToAssignKeys.length === 0) {
      alert("Please select at least one subject from the available list to assign.");
      return;
    }

    setSavingAccess(true);
    try {
      const newAssignmentsToAdd = availableSubjectsList
        .filter((sub) => selectedToAssignKeys.includes(getAssignmentKey(sub)))
        .map((sub) => ({
          facultyId: selectedFaculty.registerNumber,
          subjectId: sub.subjectId || sub.id,
          subjectCode: sub.subjectCode,
          subjectName: sub.subjectName,
          studentDepartment: sub.studentDepartment || sub.department || "ALL",
          regulation: sub.regulation || "2021",
          semester: sub.semester || 1,
          academicYear: sub.academicYear || "2025-2026",
          status: "ACTIVE",
        }));

      // Merge and prevent duplicates
      const seenKeys = new Set(assignedAssignments.map(getAssignmentKey));
      const combined = [...assignedAssignments];
      for (const item of newAssignmentsToAdd) {
        const k = getAssignmentKey(item);
        if (!seenKeys.has(k)) {
          seenKeys.add(k);
          combined.push(item);
        }
      }

      const res = await fetch(`${API_BASE}/api/academic/faculty-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: selectedFaculty.registerNumber,
          facultyName: selectedFaculty.name,
          department: selectedFaculty.department || "CSE",
          subjectCodes: Array.from(new Set(combined.map((c) => c.subjectCode))),
          assignments: combined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAssignedAssignments(data.facultyAccess?.assignments || combined);
        setSelectedToAssignKeys([]);
        alert(`Subject assignments saved for ${selectedFaculty.name}!`);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to save faculty access.");
      }
    } catch (err) {
      alert("Error saving faculty access.");
    }
    setSavingAccess(false);
  };

  const handleRemoveAssignment = async (assignment) => {
    if (!selectedFaculty) return;
    const confirmMsg = `Remove assignment of ${assignment.subjectCode} (${assignment.studentDepartment}, Sem ${assignment.semester}) from ${selectedFaculty.name}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const params = new URLSearchParams({
        subjectCode: assignment.subjectCode,
        studentDepartment: assignment.studentDepartment || "ALL",
        semester: assignment.semester || 1,
        academicYear: assignment.academicYear || "2025-2026",
        regulation: assignment.regulation || "2021",
      });

      const res = await fetch(
        `${API_BASE}/api/academic/faculty-access/${selectedFaculty.registerNumber}/assignment?${params.toString()}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        const data = await res.json();
        setAssignedAssignments(data.assignments || []);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to remove assignment.");
      }
    } catch (err) {
      alert("Error removing assignment.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setSubTab("subjects")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            subTab === "subjects" ? "bg-indigo-600 text-white shadow" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          📚 Subject Master & Credits
        </button>

        <button
          onClick={() => setSubTab("faculty_access")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            subTab === "faculty_access" ? "bg-indigo-600 text-white shadow" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          🔑 Faculty Subject Access
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 1: SUBJECT MASTER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === "subjects" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">Subject Master Database</h2>
                {subjectSearchQuery.trim() && (
                  <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[11px] font-bold">
                    {filteredSubjects.length} of {subjects.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">Manage subject codes, titles, credits, and paper types for GPA/CGPA calculations.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar for Subject Code and Name */}
              <div className="relative min-w-[210px] sm:min-w-[250px]">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search code or name..."
                  value={subjectSearchQuery}
                  onChange={(e) => setSubjectSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                />
                {subjectSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSubjectSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 text-xs font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={subjectFilterDept}
                onChange={(e) => setSubjectFilterDept(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold"
              >
                <option value="ALL">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={subjectFilterType}
                onChange={(e) => setSubjectFilterType(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="ALL">All Subject Types</option>
                <option value="THEORY">Theory</option>
                <option value="PRACTICAL">Practical</option>
                <option value="INTEGRATED">Integrated</option>
              </select>


              <select
                value={subjectFilterRegulation}
                onChange={(e) => setSubjectFilterRegulation(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50/50 border-indigo-200"
              >
                <option value="ALL">All Regulations</option>
                <option value="2021">Regulation 2021</option>
                <option value="2024">Regulation 2024</option>
              </select>

              {selectedSubjectKeys.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={deletingSubjects}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 animate-pulse"
                >
                  🗑️ Delete Selected ({selectedSubjectKeys.length})
                </button>
              )}

              <button
                onClick={() => {
                  setUploadResult(null);
                  setUploadFile(null);
                  setShowUploadModal(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
              >
                📊 Upload Excel (Multi-Sheet)
              </button>

              <button
                onClick={() => setShowSubjectModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all"
              >
                + Add New Subject
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-gray-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={filteredSubjects.length > 0 && filteredSubjects.every((sub) => selectedSubjectKeys.includes(getSubKey(sub)))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      title="Select / Deselect All Visible"
                    />
                  </th>
                  <th className="py-3 px-4">Subject Code</th>
                  <th className="py-3 px-4">Subject Title</th>
                  <th className="py-3 px-4 text-center">Department</th>
                  <th className="py-3 px-4 text-center">Credits</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Regulation</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-gray-500 text-xs">
                      {subjectSearchQuery.trim() ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 py-2">
                          <span className="text-2xl">🔍</span>
                          <span className="font-bold text-gray-700 text-sm">No subjects matching "{subjectSearchQuery}"</span>
                          <span className="text-gray-400 text-xs">
                            Check the subject code or name, or adjust your department/regulation filters.
                          </span>
                          <button
                            type="button"
                            onClick={() => setSubjectSearchQuery("")}
                            className="mt-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs transition-colors"
                          >
                            Clear Search
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1 py-4 text-gray-400 text-xs">
                          <span>No subjects found for the selected filters.</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map((sub, idx) => {
                    const key = getSubKey(sub);
                    const isChecked = selectedSubjectKeys.includes(key);
                    return (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isChecked ? "bg-indigo-50/40" : ""}`}>
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectSubject(sub)}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{sub.subjectCode}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">{sub.subjectName}</td>
                        <td className="py-3 px-4 text-center font-semibold text-gray-700">{sub.department || sub.dept || "ALL"}</td>
                        <td className="py-3 px-4 text-center font-black text-amber-600 bg-amber-50/50 rounded">{sub.credits}</td>
                        <td className="py-3 px-4 text-center font-bold text-slate-600">{sub.paperType || "THEORY"}</td>
                        <td className="py-3 px-4 text-center font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{sub.regulation || "2021"}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteSingleSubject(sub)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title={`Delete ${sub.subjectCode}`}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Add New Subject</h3>
            <form onSubmit={handleSaveSubject} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700">Subject Code</label>
                <input
                  type="text"
                  required
                  value={subjectForm.subjectCode}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subjectCode: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl font-mono mt-1"
                  placeholder="e.g. CS3452"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700">Subject Title</label>
                <input
                  type="text"
                  required
                  value={subjectForm.subjectName}
                  onChange={(e) => setSubjectForm({ ...subjectForm, subjectName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl mt-1"
                  placeholder="e.g. Theory of Computation"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700">Department</label>
                <select
                  value={subjectForm.department}
                  onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl mt-1"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-gray-700">Credits</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    max="10"
                    required
                    value={subjectForm.credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, credits: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl font-bold mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700">Paper Type</label>
                  <select
                    value={subjectForm.paperType}
                    onChange={(e) => setSubjectForm({ ...subjectForm, paperType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl mt-1"
                  >
                    <option value="THEORY">THEORY</option>
                    <option value="PRACTICAL">PRACTICAL</option>
                    <option value="INTEGRATED">INTEGRATED</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-700">Regulation</label>
                  <select
                    value={subjectForm.regulation}
                    onChange={(e) => setSubjectForm({ ...subjectForm, regulation: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl mt-1 font-bold text-indigo-700"
                  >
                    <option value="2021">2021</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 bg-gray-100 font-bold rounded-xl text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Sheet Excel Subject Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  📊 Upload Multi-Sheet Subject Excel
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Excel file should contain multiple sheets where each <b>Sheet Name = Department Name</b> (e.g. CSE, ECE, IT, AIDS).
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleExcelUpload} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Target Regulation *</label>
                <select
                  value={uploadRegulation}
                  onChange={(e) => setUploadRegulation(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-bold text-indigo-700 text-sm"
                >
                  <option value="2021">Regulation 2021</option>
                  <option value="2024">Regulation 2024</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-gray-700">Select Excel File (.xlsx) *</label>
                  <a
                    href={`${API_BASE}/api/academic/subjects/sample-template`}
                    download="subject_upload_template.xlsx"
                    className="text-indigo-600 hover:text-indigo-800 font-bold text-xs underline flex items-center gap-1"
                  >
                    📥 Download Sample Format
                  </a>
                </div>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  required
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  className="w-full p-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                />
              </div>

              {/* Format Hints Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-gray-600 space-y-1">
                <p className="font-bold text-gray-800">📋 Format Requirements:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>Sheet names represent Departments: <code className="bg-white px-1 border rounded text-indigo-700">CSE</code>, <code className="bg-white px-1 border rounded text-indigo-700">ECE</code>, <code className="bg-white px-1 border rounded text-indigo-700">IT</code>, etc.</li>
                  <li>Columns required: <code className="font-bold">Subject Code</code>, <code className="font-bold">Subject Name</code>, <code className="font-bold">Credits</code>, <code className="font-bold">Paper Type</code></li>
                  <li>Paper types supported: <span className="font-mono font-bold text-slate-800">THEORY, PRACTICAL, INTEGRATED</span></li>
                </ul>
              </div>

              {/* Upload Summary Result Banner */}
              {uploadResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <span>✅ Upload Complete!</span>
                  </div>
                  <p className="text-emerald-700 text-xs font-medium">{uploadResult.message}</p>
                  
                  {uploadResult.departmentSummary && (
                    <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(uploadResult.departmentSummary).map(([dept, count]) => (
                        <div key={dept} className="flex justify-between bg-white px-2.5 py-1.5 rounded-lg border border-emerald-100 font-medium text-gray-700">
                          <span className="font-bold text-indigo-700">{dept}</span>
                          <span className="font-bold text-emerald-600">{count} subjects</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {uploadResult.skippedDetails && uploadResult.skippedDetails.length > 0 && (
                    <div className="mt-2 text-amber-700 text-[11px]">
                      <p className="font-bold">Warnings / Skipped:</p>
                      {uploadResult.skippedDetails.map((detail, idx) => (
                        <p key={idx}>• {detail}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-gray-100 font-bold rounded-xl text-gray-700 hover:bg-gray-200"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow"
                >
                  {uploading ? (
                    <>
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                      Uploading...
                    </>
                  ) : (
                    "Upload & Save Subjects"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 2: FACULTY SUBJECT ACCESS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === "faculty_access" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Faculty List */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
            <div className="border-b border-gray-100 pb-3 space-y-2">
              <h3 className="text-base font-bold text-gray-900">Select Faculty Member</h3>
              
              {/* Option 1: Faculty Members Filter (Dept, Name/ID input, Search Button) */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={facultyFilterDept}
                    onChange={(e) => setFacultyFilterDept(e.target.value)}
                    className="w-1/2 px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
                  >
                    <option value="ALL">All Depts</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Name / ID..."
                    value={facultySearchInput}
                    onChange={(e) => {
                      setFacultySearchInput(e.target.value);
                      setFacultySearchQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setFacultySearchQuery(facultySearchInput);
                    }}
                    className="w-1/2 px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setFacultySearchQuery(facultySearchInput)}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                >
                  🔍 Search Faculty
                </button>
              </div>
            </div>

            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {filteredFaculties.map((fac) => (
                <button
                  key={fac.registerNumber}
                  onClick={() => handleSelectFaculty(fac)}
                  className={`w-full text-left p-3 rounded-xl transition-all border text-xs font-bold flex flex-col gap-0.5 ${
                    selectedFaculty?.registerNumber === fac.registerNumber
                      ? "bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>{fac.name}</span>
                  <span className="font-mono text-[10px] text-gray-500">{fac.registerNumber} • {fac.department || "CSE"}</span>
                </button>
              ))}

              {filteredFaculties.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-xs font-medium">
                  No faculty matching criteria.
                </div>
              )}
            </div>
          </div>

          {/* Subject Permissions Grid */}
          <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-4">
            {selectedFaculty ? (
              <>
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Assign Subjects to {selectedFaculty.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">
                      Faculty ID: <span className="font-bold text-gray-700">{selectedFaculty.registerNumber}</span> • Faculty Dept: <span className="font-bold text-indigo-700">{selectedFaculty.department || "N/A"}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAssignSelected}
                      disabled={savingAccess || selectedToAssignKeys.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
                    >
                      {savingAccess ? (
                        "Saving..."
                      ) : (
                        <>➕ Assign Selected ({selectedToAssignKeys.length})</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Filters for Available Student Subjects */}
                <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-200/80 space-y-2">
                  <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Filter Available Student Subjects</span>
                    {(availSubjectDept !== "ALL" || availSubjectReg !== "ALL" || availSubjectSem !== "ALL" || availSubjectYear !== "ALL" || availSubjectSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvailSubjectDept("ALL");
                          setAvailSubjectReg("ALL");
                          setAvailSubjectSem("ALL");
                          setAvailSubjectYear("ALL");
                          setAvailSubjectSearch("");
                        }}
                        className="text-[10px] text-indigo-600 hover:underline font-semibold"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                    {/* Student Department Filter */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Student Dept</label>
                      <select
                        value={availSubjectDept}
                        onChange={(e) => setAvailSubjectDept(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700"
                      >
                        <option value="ALL">All Depts</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* Regulation Filter */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Regulation</label>
                      <select
                        value={availSubjectReg}
                        onChange={(e) => setAvailSubjectReg(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700"
                      >
                        <option value="ALL">All Regulations</option>
                        {regulationsList.map((r) => (
                          <option key={r} value={r}>Reg {r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Semester Filter */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Semester</label>
                      <select
                        value={availSubjectSem}
                        onChange={(e) => setAvailSubjectSem(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700"
                      >
                        <option value="ALL">All Semesters</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={s}>Sem {s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Academic Year Filter */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Academic Year</label>
                      <select
                        value={availSubjectYear}
                        onChange={(e) => setAvailSubjectYear(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700"
                      >
                        <option value="ALL">All AYs</option>
                        {academicYearsList.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    {/* Search Code / Name */}
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Search</label>
                      <input
                        type="text"
                        placeholder="Code or Name..."
                        value={availSubjectSearch}
                        onChange={(e) => setAvailSubjectSearch(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section A: Already Assigned Subjects */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Assigned Subjects</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold">
                        {assignedAssignments.length}
                      </span>
                    </h4>
                  </div>

                  {assignedAssignments.length === 0 ? (
                    <div className="p-3 bg-gray-50 rounded-xl text-gray-400 text-xs italic border border-dashed border-gray-200 text-center">
                      No subjects currently assigned to this faculty member.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-0.5">
                      {assignedAssignments.map((a, idx) => (
                        <div
                          key={`${a.subjectCode}_${a.studentDepartment}_${a.semester}_${a.academicYear}_${idx}`}
                          className="p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl flex items-center justify-between gap-2 text-xs shadow-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-indigo-700">{a.subjectCode}</span>
                              <span className="text-gray-800 font-semibold truncate text-[11px]">
                                {a.subjectName || a.subjectCode}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">
                                Dept: {a.studentDepartment || "ALL"}
                              </span>
                              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[9px] font-medium">
                                Sem {a.semester || 1} • Reg {a.regulation || "2021"}
                              </span>
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-[9px] font-medium">
                                {a.academicYear || "2025-2026"}
                              </span>
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                                {a.status || "ACTIVE"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignment(a)}
                            title="Unassign this subject"
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-bold transition flex items-center gap-0.5 shrink-0 border border-rose-200"
                          >
                            🗑️ Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section B: Available Student Subjects List */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Available Student Subjects</span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[10px] font-bold">
                          {availableSubjectsList.length}
                        </span>
                      </h4>
                      <p className="text-[10px] text-gray-500">
                        Select eligible subjects offered to students to assign to {selectedFaculty.name}.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const unassignedKeys = availableSubjectsList
                            .filter((sub) => !assignedAssignments.some((a) => getAssignmentKey(a) === getAssignmentKey(sub)))
                            .map(getAssignmentKey);
                          setSelectedToAssignKeys((prev) => Array.from(new Set([...prev, ...unassignedKeys])));
                        }}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedToAssignKeys([])}
                        className="text-[11px] text-gray-500 hover:text-gray-700 font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {loadingAvailableSubjects ? (
                    <div className="p-8 text-center text-gray-400 text-xs font-medium">
                      Loading student-available subjects...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto p-1">
                      {availableSubjectsList.map((sub) => {
                        const subKey = getAssignmentKey(sub);
                        const isAlreadyAssigned = assignedAssignments.some((a) => getAssignmentKey(a) === subKey);
                        const isChecked = isAlreadyAssigned || selectedToAssignKeys.includes(subKey);

                        return (
                          <label
                            key={subKey}
                            className={`p-3 rounded-xl border transition-all flex items-start gap-3 text-xs ${
                              isAlreadyAssigned
                                ? "bg-emerald-50/60 border-emerald-300/80 text-emerald-950 opacity-90 cursor-default"
                                : isChecked
                                ? "bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold cursor-pointer"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isAlreadyAssigned}
                              onChange={() => toggleSelectToAssign(sub)}
                              className="w-4 h-4 text-indigo-600 rounded mt-0.5 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-indigo-700">{sub.subjectCode}</span>
                                {isAlreadyAssigned ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[9px]">
                                    ✓ Assigned
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[9px]">
                                    {sub.studentDepartment}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-medium text-gray-800 line-clamp-1 mt-0.5">
                                {sub.subjectName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 mt-1">
                                <span>Dept: <strong className="text-gray-600">{sub.studentDepartment}</strong></span>
                                <span>•</span>
                                <span>Sem {sub.semester}</span>
                                <span>•</span>
                                <span>Reg {sub.regulation}</span>
                                <span>•</span>
                                <span>{sub.academicYear}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      {availableSubjectsList.length === 0 && (
                        <div className="col-span-2 p-8 text-center text-gray-400 text-xs font-medium">
                          No student-available subjects found matching filter criteria.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-gray-400 font-medium text-sm">
                👈 Select a faculty member from the left list to configure subject permissions.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
