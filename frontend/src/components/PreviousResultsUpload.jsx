import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";

export default function PreviousResultsUpload() {
  const [file, setFile] = useState(null);
  const [regulation, setRegulation] = useState("2021");
  const [department, setDepartment] = useState("CSE");
  const [studentCurrentSem, setStudentCurrentSem] = useState(6);
  const [resultSem, setResultSem] = useState(5);

  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [message, setMessage] = useState(null);

  const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "AIDS", "MECH", "CIVIL", "CSBS", "BIOTECH", "AERO"];
  const REGULATIONS = ["2021", "2024", "2017"];
  const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    setFile(selected || null);
    setValidationResult(null);
    setMessage(null);
  };

  const handleValidate = async () => {
    if (!file) return alert("Please select an Excel file.");
    setValidating(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("regulation", regulation);
    formData.append("department", department);
    formData.append("studentCurrentSem", studentCurrentSem);
    formData.append("resultSem", resultSem);

    try {
      const res = await fetch(`${API_BASE}/api/academic/previous-results/validate`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setValidationResult(data);
      } else {
        alert(data.detail || "Validation failed");
      }
    } catch (err) {
      alert("Error validating file");
    }
    setValidating(false);
  };

  const handleConfirmImport = async () => {
    if (!validationResult || !validationResult.preview || validationResult.preview.length === 0) {
      return alert("No valid rows to import.");
    }

    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/academic/previous-results/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validationResult.preview }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message || "Results imported successfully!" });
        setValidationResult(null);
        setFile(null);
      } else {
        alert(data.detail || "Import failed");
      }
    } catch (err) {
      alert("Error executing import.");
    }
    setImporting(false);
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteDept, setDeleteDept] = useState("CSE");
  const [deleteSem, setDeleteSem] = useState(5);
  const [deleteReg, setDeleteReg] = useState("ALL");
  const [matchingCount, setMatchingCount] = useState(null);
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchMatchingCount = async () => {
      setLoadingCount(true);
      try {
        const queryParams = new URLSearchParams({
          department: deleteDept || "ALL",
          resultSem: deleteSem || 5,
        });
        if (deleteReg && deleteReg !== "ALL") {
          queryParams.append("regulation", deleteReg);
        }

        const res = await fetch(`${API_BASE}/api/academic/previous-results/count?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setMatchingCount(data?.count ?? 0);
        } else {
          if (isMounted) setMatchingCount(0);
        }
      } catch (err) {
        if (isMounted) setMatchingCount(0);
      } finally {
        if (isMounted) setLoadingCount(false);
      }
    };

    fetchMatchingCount();
    return () => { isMounted = false; };
  }, [deleteDept, deleteSem, deleteReg]);

  const handleDeletePreviousResults = async () => {
    if (matchingCount === 0) {
      alert("No matching uploaded results found to delete for the selected criteria.");
      return;
    }

    const confirmMsg = `⚠️ Are you sure you want to DELETE ${matchingCount !== null ? matchingCount : ""} uploaded result record(s) for:\n\nDepartment: ${deleteDept}\nResult Semester: Semester ${deleteSem}\nRegulation: ${deleteReg}?\n\nThis operation cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setMessage(null);

    try {
      const queryParams = new URLSearchParams({
        department: deleteDept,
        resultSem: deleteSem,
      });
      if (deleteReg && deleteReg !== "ALL") {
        queryParams.append("regulation", deleteReg);
      }

      const res = await fetch(`${API_BASE}/api/academic/previous-results?${queryParams.toString()}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: "success",
          text: data.message || `Deleted previous results for ${deleteDept} Sem ${deleteSem}.`,
        });
        setValidationResult(null);
        // Refresh count
        setMatchingCount(0);
      } else {
        alert(data.detail || "Failed to delete results");
      }
    } catch (err) {
      alert("Error deleting results.");
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-6">
      {/* Upload Section Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Upload Previous Semester Results</h2>
            <p className="text-xs text-gray-500 mt-1">
              Upload past academic records via Excel. Supports both Matrix format (Register Number in Col A, Subject Codes as headers) and tabular layout. Subject credits are automatically fetched from Subject Master.
            </p>
          </div>
          <button
            onClick={() => {
              alert(
                "Excel Format Options:\n\n" +
                "1. Matrix Format (Recommended):\n" +
                "   Col A: Register Number (e.g. 112723205001)\n" +
                "   Col B..N Headers: Subject Codes (e.g. CS3501, CS3591, CS3551...)\n" +
                "   Cells: Numerical Marks (e.g. 85, 78) OR Grade letters (O, A+, A, B+, B, U)\n\n" +
                "2. Standard Tabular Format:\n" +
                "   Columns: Register Number | Subject Code | Grade\n\n" +
                "Note: Subject Credits, Names & Grade Points are automatically fetched from the Subject Master database!"
              );
            }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200"
          >
            📋 View Matrix & Excel Format Spec
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl mb-4 font-bold text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Regulation</label>
            <select
              value={regulation}
              onChange={(e) => setRegulation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:ring-2 focus:ring-indigo-500"
            >
              {REGULATIONS.map((r) => (
                <option key={r} value={r}>Regulation {r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:ring-2 focus:ring-indigo-500"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Student Current Sem</label>
            <select
              value={studentCurrentSem}
              onChange={(e) => setStudentCurrentSem(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:ring-2 focus:ring-indigo-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Result Semester (Being Uploaded)</label>
            <select
              value={resultSem}
              onChange={(e) => setResultSem(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white text-indigo-700 focus:ring-2 focus:ring-indigo-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Upload Box */}
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors">
          <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} id="prev-results-file" className="hidden" />
          <label htmlFor="prev-results-file" className="cursor-pointer flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold">
              📊
            </div>
            <span className="font-bold text-gray-800">{file ? file.name : "Click to select Excel result file"}</span>
            <span className="text-xs text-gray-500">Supports .xlsx files with semester-wise grades</span>
          </label>
        </div>

        {file && !validationResult && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {validating ? "Validating File..." : "🔍 Validate & Preview Excel"}
            </button>
          </div>
        )}
      </div>

      {/* Delete Previous Results Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100/80">
        <div className="flex flex-wrap items-center justify-between pb-4 mb-4 border-b border-gray-100 gap-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="text-red-600">🗑️</span> Delete Uploaded Results
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Select Department, Result Semester, and Regulation to delete uploaded previous semester result records.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5 shadow-sm">
              <span>📊 Total Records Available:</span>
              <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-xs font-extrabold">
                {loadingCount ? "..." : (matchingCount ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Department</label>
            <select
              value={deleteDept}
              onChange={(e) => setDeleteDept(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:ring-2 focus:ring-red-500"
            >
              <option value="ALL">ALL Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Result Semester</label>
            <select
              value={deleteSem}
              onChange={(e) => setDeleteSem(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white text-indigo-700 focus:ring-2 focus:ring-red-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Regulation</label>
            <select
              value={deleteReg}
              onChange={(e) => setDeleteReg(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:ring-2 focus:ring-red-500"
            >
              <option value="ALL">ALL Regulations</option>
              {REGULATIONS.map((r) => (
                <option key={r} value={r}>Regulation {r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleDeletePreviousResults}
            disabled={deleting || loadingCount || matchingCount === 0}
            className={`px-6 py-2.5 font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 ${
              matchingCount === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {deleting ? "Deleting Results..." : "🗑️ Delete Matching Results"}
          </button>
        </div>
      </div>

      {/* Validation Result & Duplicate Warnings */}
      {validationResult && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Validation Summary & Import Preview</h3>
              <p className="text-xs text-gray-500">Review rows before confirming insertion into student academic history</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-slate-100 text-gray-800 rounded-lg text-xs font-bold">
                Total Rows: <strong>{validationResult.totalRows}</strong>
              </span>
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">
                Valid: <strong>{validationResult.validRows}</strong>
              </span>
              {validationResult.duplicateCount > 0 && (
                <span className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">
                  Duplicates: <strong>{validationResult.duplicateCount}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Warnings & Errors List */}
          {validationResult.duplicates && validationResult.duplicates.length > 0 && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1 text-amber-800">⚠️ Duplicate Warning</p>
              <ul className="list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">
                {validationResult.duplicates.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-gray-700 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Register No</th>
                  <th className="py-2.5 px-3">Subject Code</th>
                  <th className="py-2.5 px-3">Subject Name</th>
                  <th className="py-2.5 px-3 text-center">Semester</th>
                  <th className="py-2.5 px-3 text-center">Academic Year</th>
                  <th className="py-2.5 px-3 text-center">Credits</th>
                  <th className="py-2.5 px-3 text-center">Grade</th>
                  <th className="py-2.5 px-3 text-center">Grade Point</th>
                  <th className="py-2.5 px-3 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {validationResult.preview.map((row, idx) => (
                  <tr key={idx} className={row.isExistingInDb ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                    <td className="py-2.5 px-3 font-mono font-bold text-gray-900">{row.registerNumber}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-indigo-700">{row.subjectCode}</td>
                    <td className="py-2.5 px-3 text-gray-700 font-medium">{row.subjectName}</td>
                    <td className="py-2.5 px-3 text-center font-bold">{row.semester}</td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{row.academicYear}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-gray-800">{row.credits}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded font-black bg-indigo-50 text-indigo-700">{row.grade}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">{row.gradePoint}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.result === "PASS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {row.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              onClick={() => setValidationResult(null)}
              className="px-4 py-2 bg-gray-100 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-200"
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg transition-all"
            >
              {importing ? "Importing Results..." : "✅ Confirm & Import Records"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
