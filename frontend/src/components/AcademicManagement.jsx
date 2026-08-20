import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

export default function AcademicManagement() {
  const [subTab, setSubTab] = useState("subjects"); // "subjects", "faculty_access", "assessment_config", "departments"

  // ─────────────────────────────────────────────────────────────────────────
  // SUBJECT MASTER STATES
  // ─────────────────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([]);
  const [subjectFilterDept, setSubjectFilterDept] = useState("ALL");
  const [subjectFilterType, setSubjectFilterType] = useState("ALL");
  const [subjectFilterRegulation, setSubjectFilterRegulation] = useState("ALL");
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

  const toggleSelectSubject = (sub) => {
    const key = getSubKey(sub);
    setSelectedSubjectKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    if (selectedSubjectKeys.length === subjects.length && subjects.length > 0) {
      setSelectedSubjectKeys([]);
    } else {
      setSelectedSubjectKeys(subjects.map(getSubKey));
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
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);

  // Option 1 Filter: Faculty Members
  const [facultyFilterDept, setFacultyFilterDept] = useState("ALL");
  const [facultySearchInput, setFacultySearchInput] = useState("");
  const [facultySearchQuery, setFacultySearchQuery] = useState("");

  // Option 2 Filter: Assigning Subjects (uses assignSubjectsList state fetched from API)
  const [assignSubjectFilterDept, setAssignSubjectFilterDept] = useState("ALL");
  const [assignSubjectSearchText, setAssignSubjectSearchText] = useState("");
  const [assignSubjectsList, setAssignSubjectsList] = useState([]);

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

  // Assign subjects list is always fresh from API (see fetchSubjectsForAssignment)
  // Local text search on top of the already dept-filtered API results
  const filteredAssignSubjects = assignSubjectsList.filter((sub) => {
    const search = assignSubjectSearchText.trim().toLowerCase();
    if (!search) return true;
    return (
      (sub.subjectCode || "").toLowerCase().includes(search) ||
      (sub.subjectName || "").toLowerCase().includes(search)
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ASSESSMENT CONFIG STATES
  // ─────────────────────────────────────────────────────────────────────────
  const [configDept, setConfigDept] = useState("CSE");
  const [configSem, setConfigSem] = useState(1);
  const [configComponents, setConfigComponents] = useState([
    { name: "UT1", maxMarks: 20 },
    { name: "UT2", maxMarks: 20 },
    { name: "Unit 1", maxMarks: 20 },
    { name: "Unit 2", maxMarks: 20 },
    { name: "Unit 3", maxMarks: 20 },
    { name: "Unit 4", maxMarks: 20 },
    { name: "Unit 5", maxMarks: 20 },
  ]);
  const [savingConfig, setSavingConfig] = useState(false);

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

  // Fetch subjects for assignment panel — calls backend with dept filter for accuracy
  const fetchSubjectsForAssignment = async (dept = "ALL") => {
    try {
      const params = new URLSearchParams();
      if (dept && dept !== "ALL") params.append("department", dept);
      const url = `${API_BASE}/api/academic/subjects?${params.toString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAssignSubjectsList(data);
      }
    } catch (err) {
      console.error("Failed to fetch subjects for assignment", err);
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
      fetchSubjectsForAssignment("ALL"); // load all initially
      fetchFaculties();
      setAssignSubjectFilterDept("ALL");  // reset filter on tab switch
      setAssignSubjectSearchText("");
    }
    if (subTab === "assessment_config") fetchAssessmentConfig();
  }, [subTab, subjectFilterDept, subjectFilterType, subjectFilterRegulation]);

  // Re-fetch from backend whenever dept filter changes in Assign Subjects panel
  useEffect(() => {
    if (subTab !== "faculty_access") return;
    const dept = assignSubjectFilterDept;
    const params = new URLSearchParams();
    if (dept && dept !== "ALL") params.append("department", dept);
    fetch(`${API_BASE}/api/academic/subjects?${params.toString()}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAssignSubjectsList(Array.isArray(data) ? data : []))
      .catch(() => setAssignSubjectsList([]));
    setAssignSubjectSearchText(""); // clear search when dept changes
  }, [subTab, assignSubjectFilterDept]);

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

  // Select Faculty Access
  const handleSelectFaculty = async (fac) => {
    setSelectedFaculty(fac);
    try {
      const res = await fetch(`${API_BASE}/api/academic/faculty-access/${fac.registerNumber}`);
      if (res.ok) {
        const data = await res.json();
        setAssignedSubjects(data.subjectCodes || []);
      }
    } catch (err) {
      setAssignedSubjects([]);
    }
  };

  const toggleSubjectAssignment = (code) => {
    setAssignedSubjects((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSaveFacultyAccess = async () => {
    if (!selectedFaculty) return;
    setSavingAccess(true);
    try {
      const res = await fetch(`${API_BASE}/api/academic/faculty-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: selectedFaculty.registerNumber,
          facultyName: selectedFaculty.name,
          department: selectedFaculty.department || "CSE",
          subjectCodes: assignedSubjects,
        }),
      });
      if (res.ok) {
        alert(`Subject access saved for ${selectedFaculty.name}!`);
      } else {
        alert("Failed to save faculty access");
      }
    } catch (err) {
      alert("Error saving access");
    }
    setSavingAccess(false);
  };

  // Assessment Config
  const fetchAssessmentConfig = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/academic/assessment-config?department=${configDept}&semester=${configSem}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.components) setConfigComponents(data.components);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (subTab === "assessment_config") fetchAssessmentConfig();
  }, [configDept, configSem]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/api/academic/assessment-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: configDept,
          semester: configSem,
          components: configComponents,
        }),
      });
      if (res.ok) alert("Assessment scheme saved successfully!");
    } catch (err) {
      alert("Error saving assessment scheme");
    }
    setSavingConfig(false);
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

        <button
          onClick={() => setSubTab("assessment_config")}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            subTab === "assessment_config" ? "bg-indigo-600 text-white shadow" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          ⚙️ Assessment & Unit Config
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 1: SUBJECT MASTER */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === "subjects" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Subject Master Database</h2>
              <p className="text-xs text-gray-500">Manage subject codes, titles, credits, and paper types for GPA/CGPA calculations.</p>
            </div>

            <div className="flex items-center gap-3">
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
                      checked={subjects.length > 0 && selectedSubjectKeys.length === subjects.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      title="Select / Deselect All"
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
                {subjects.map((sub, idx) => {
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
                      <td className="py-3 px-4 text-center font-semibold text-gray-700">{sub.department}</td>
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
                })}
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
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Assign Subjects to {selectedFaculty.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">ID: {selectedFaculty.registerNumber} • Dept: {selectedFaculty.department}</p>
                  </div>

                  {/* Option 2: Assigning Subjects Filter (Dept, Sub Code/Name input) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={assignSubjectFilterDept}
                      onChange={(e) => setAssignSubjectFilterDept(e.target.value)}
                      className="px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
                    >
                      <option value="ALL">All Depts</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Sub Code / Name..."
                      value={assignSubjectSearchText}
                      onChange={(e) => setAssignSubjectSearchText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setAssignSubjectSearchText(""); }}
                      className="px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium w-40 focus:outline-none focus:border-indigo-500"
                    />

                    <button
                      type="button"
                      onClick={() => setAssignSubjectSearchText(assignSubjectSearchText.trim())}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1"
                    >
                      🔍 Search
                    </button>

                    <button
                      onClick={handleSaveFacultyAccess}
                      disabled={savingAccess}
                      className="px-4 py-1.5 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow hover:bg-indigo-700 transition-all"
                    >
                      {savingAccess ? "Saving..." : "Save Access"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-1">
                  {filteredAssignSubjects.map((sub) => {
                    const isChecked = assignedSubjects.includes(sub.subjectCode);
                    return (
                      <label
                        key={sub.subjectCode}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 text-xs ${
                          isChecked ? "bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSubjectAssignment(sub.subjectCode)}
                          className="w-4 h-4 text-indigo-600 rounded"
                        />
                        <div>
                          <div className="font-mono font-bold text-indigo-700">{sub.subjectCode}</div>
                          <div className="text-[11px] font-medium text-gray-800 line-clamp-1">{sub.subjectName}</div>
                          <div className="text-[10px] text-gray-400">{sub.department}</div>
                        </div>
                      </label>
                    );
                  })}

                  {filteredAssignSubjects.length === 0 && (
                    <div className="col-span-2 p-8 text-center text-gray-400 text-xs font-medium">
                      No subjects found matching filter criteria.
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

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SUBTAB 3: ASSESSMENT CONFIG */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === "assessment_config" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-6 max-w-3xl">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Configure Assessment Scheme & Max Marks</h2>
              <p className="text-xs text-gray-500 mt-0.5">Define unit tests, assignments, and practical components per department and semester.</p>
            </div>
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="px-6 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow hover:bg-emerald-700"
            >
              {savingConfig ? "Saving..." : "Save Config"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-gray-700">Department</label>
              <select
                value={configDept}
                onChange={(e) => setConfigDept(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl mt-1 font-bold"
              >
                <option value="ALL">ALL DEPARTMENTS</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700">Semester</label>
              <select
                value={configSem}
                onChange={(e) => setConfigSem(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-xl mt-1 font-bold"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-sm text-gray-800">Components List</h4>
            {configComponents.map((comp, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <input
                  type="text"
                  value={comp.name}
                  onChange={(e) => {
                    const copy = [...configComponents];
                    copy[idx].name = e.target.value;
                    setConfigComponents(copy);
                  }}
                  className="flex-1 px-3 py-1.5 border rounded-lg text-xs font-bold"
                  placeholder="Component Name (e.g. UT1)"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">Max Mark:</span>
                  <input
                    type="number"
                    value={comp.maxMarks}
                    onChange={(e) => {
                      const copy = [...configComponents];
                      copy[idx].maxMarks = Number(e.target.value);
                      setConfigComponents(copy);
                    }}
                    className="w-20 px-2 py-1.5 border rounded-lg text-xs font-bold text-center"
                  />
                </div>
                <button
                  onClick={() => setConfigComponents(configComponents.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-700 text-sm font-bold px-2"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={() => setConfigComponents([...configComponents, { name: "New Component", maxMarks: 20 }])}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100"
            >
              + Add Component
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
