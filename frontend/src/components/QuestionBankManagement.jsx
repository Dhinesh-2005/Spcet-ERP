import React, { useState, useEffect } from "react";
import { API_BASE } from "../utils";
import FormattedQuestion from "./FormattedQuestion";

export default function QuestionBankManagement({ user }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const limit = 20;

  // Filters
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [coFilter, setCoFilter] = useState("");
  const [partFilter, setPartFilter] = useState("");

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadSubjectCode, setUploadSubjectCode] = useState("");
  const [uploadSubjectName, setUploadSubjectName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);

  // Edit / Add modal state
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    subjectCode: "",
    subjectName: "",
    unit: "Unit 1",
    question: "",
    part: "A",
    marks: "2",
    co: "CO1",
    kLevel: "K1",
  });

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", limit);
      if (search) params.append("search", search);
      if (subjectFilter) params.append("subjectCode", subjectFilter);
      if (unitFilter) params.append("unit", unitFilter);
      if (coFilter) params.append("co", coFilter);
      if (partFilter) params.append("part", partFilter);

      const res = await fetch(`${API_BASE}/api/question-bank?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch questions", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, [page, search, subjectFilter, unitFilter, coFilter, partFilter]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return alert("Please select an Excel file.");
    if (!uploadSubjectCode) return alert("Please enter Subject Code.");

    setUploading(true);
    setUploadSummary(null);

    const body = new FormData();
    body.append("file", uploadFile);
    body.append("subjectCode", uploadSubjectCode);
    if (uploadSubjectName) body.append("subjectName", uploadSubjectName);

    try {
      const res = await fetch(`${API_BASE}/api/question-bank/upload`, {
        method: "POST",
        body: body,
      });

      const data = await res.json();
      if (res.ok) {
        setUploadSummary(data.summary);
        setUploadFile(null);
        fetchQuestions();
      } else {
        alert(data.detail || "Upload failed");
      }
    } catch (err) {
      alert("Error uploading file");
    }
    setUploading(false);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!formData.subjectCode || !formData.question) {
      return alert("Subject Code and Question Text are required.");
    }

    try {
      const payload = {
        ...formData,
        marks: parseFloat(formData.marks) || 2,
      };

      let url = `${API_BASE}/api/question-bank/manual`;
      let method = "POST";

      if (editItem) {
        url = `${API_BASE}/api/question-bank/${editItem.id || editItem._id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditItem(null);
        fetchQuestions();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to save question");
      }
    } catch (err) {
      alert("Error saving question");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this question?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/question-bank/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchQuestions();
      } else {
        alert("Failed to delete question");
      }
    } catch (err) {
      alert("Error deleting question");
    }
  };

  const openAddModal = () => {
    setEditItem(null);
    setFormData({
      subjectCode: subjectFilter || "",
      subjectName: "",
      unit: "Unit 1",
      question: "",
      part: "A",
      marks: "2",
      co: "CO1",
      kLevel: "K1",
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setFormData({
      subjectCode: item.subjectCode || "",
      subjectName: item.subjectName || "",
      unit: item.unit || "Unit 1",
      question: item.question || "",
      part: item.part || "A",
      marks: String(item.marks || 2),
      co: item.co || "CO1",
      kLevel: item.kLevel || "K1",
    });
    setShowModal(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            📚 Question Bank Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload Excel question banks, organize questions by Subject/Unit/CO, and manage paper repositories.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-lg shadow transition-all flex items-center gap-2 text-sm"
        >
          <span>➕</span> Add Manual Question
        </button>
      </div>

      {/* UPLOAD SECTION */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          📤 Upload Question Bank Excel (.xlsx, .xls)
        </h2>
        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Subject Code *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. CS8591"
              value={uploadSubjectCode}
              onChange={(e) => setUploadSubjectCode(e.target.value.toUpperCase())}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Subject Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Computer Networks"
              value={uploadSubjectName}
              onChange={(e) => setUploadSubjectName(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Excel File *
            </label>
            <input
              type="file"
              required
              accept=".xlsx, .xls"
              onChange={(e) => setUploadFile(e.target.files[0])}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-all text-sm flex justify-center items-center gap-2"
            >
              {uploading ? "Uploading..." : "🚀 Upload Question Bank"}
            </button>
          </div>
        </form>

        {/* UPLOAD SUMMARY CARD */}
        {uploadSummary && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-slate-800">
            <h3 className="font-bold text-emerald-800 text-sm mb-2">✅ Excel Upload Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-xs font-semibold">
              <div className="bg-white p-2 rounded border border-emerald-100">
                <div className="text-slate-400">Total Rows</div>
                <div className="text-lg text-slate-800">{uploadSummary.totalRows}</div>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <div className="text-emerald-600">Imported</div>
                <div className="text-lg text-emerald-700">{uploadSummary.imported}</div>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <div className="text-amber-600">Duplicates Skipped</div>
                <div className="text-lg text-amber-700">{uploadSummary.duplicates}</div>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <div className="text-slate-400">Empty Skipped</div>
                <div className="text-lg text-slate-700">{uploadSummary.skipped}</div>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <div className="text-rose-600">Failed</div>
                <div className="text-lg text-rose-700">{uploadSummary.failed}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <input
            type="text"
            placeholder="Filter Subject (e.g. CS8591)"
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value.toUpperCase());
              setPage(1);
            }}
            className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
          />

          <select
            value={unitFilter}
            onChange={(e) => {
              setUnitFilter(e.target.value);
              setPage(1);
            }}
            className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Units</option>
            <option value="Unit 1">Unit 1</option>
            <option value="Unit 2">Unit 2</option>
            <option value="Unit 3">Unit 3</option>
            <option value="Unit 4">Unit 4</option>
            <option value="Unit 5">Unit 5</option>
          </select>

          <select
            value={coFilter}
            onChange={(e) => {
              setCoFilter(e.target.value);
              setPage(1);
            }}
            className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All COs</option>
            <option value="CO1">CO1</option>
            <option value="CO2">CO2</option>
            <option value="CO3">CO3</option>
            <option value="CO4">CO4</option>
            <option value="CO5">CO5</option>
          </select>

          <select
            value={partFilter}
            onChange={(e) => {
              setPartFilter(e.target.value);
              setPage(1);
            }}
            className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Parts</option>
            <option value="A">Part A (2 Marks)</option>
            <option value="B">Part B (13 Marks)</option>
            <option value="C">Part C (14 Marks)</option>
          </select>
        </div>

        {/* QUESTIONS TABLE */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b">
                <th className="p-3 w-12 text-center">#</th>
                <th className="p-3 w-28">Subject</th>
                <th className="p-3 w-24">Unit</th>
                <th className="p-3">Question</th>
                <th className="p-3 w-16 text-center">Part</th>
                <th className="p-3 w-16 text-center">Marks</th>
                <th className="p-3 w-16 text-center">CO</th>
                <th className="p-3 w-20 text-center">K-Level</th>
                <th className="p-3 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-slate-500">
                    Loading questions...
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-slate-500">
                    No questions found matching criteria.
                  </td>
                </tr>
              ) : (
                questions.map((q, idx) => (
                  <tr key={q.id || q._id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-center text-slate-500 font-medium">
                      {(page - 1) * limit + idx + 1}
                    </td>
                    <td className="p-3 font-bold text-indigo-700">{q.subjectCode}</td>
                    <td className="p-3 font-semibold text-slate-700">{q.unit}</td>
                    <td className="p-3 text-slate-800">
                      <div><FormattedQuestion question={q.question} equation={q.equation} /></div>
                      {q.image && (
                        <div className="mt-2">
                          <img
                            src={typeof q.image === "string" ? q.image : q.image.base64}
                            alt="Question Diagram"
                            className="h-16 w-auto max-w-[140px] rounded border border-slate-200 object-contain bg-slate-50 p-1 shadow-sm"
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700">{q.part}</td>
                    <td className="p-3 text-center font-bold text-teal-700">{q.marks}</td>
                    <td className="p-3 text-center bg-indigo-50 font-bold text-indigo-800 rounded">
                      {q.co}
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-600">{q.kLevel}</td>
                    <td className="p-3 text-center space-x-2">
                      <button
                        onClick={() => openEditModal(q)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(q.id || q._id)}
                        className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex justify-between items-center text-xs font-semibold text-slate-500 pt-2">
          <div>
            Showing {questions.length} of {total} questions
          </div>
          <div className="flex gap-2 items-center">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 border rounded bg-white hover:bg-slate-100 disabled:opacity-50"
            >
              ◀ Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 border rounded bg-white hover:bg-slate-100 disabled:opacity-50"
            >
              Next ▶
            </button>
          </div>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-800">
              {editItem ? "✏️ Edit Question" : "➕ Add Question"}
            </h2>
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Subject Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subjectCode}
                    onChange={(e) =>
                      setFormData({ ...formData, subjectCode: e.target.value.toUpperCase() })
                    }
                    className="w-full p-2 border rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Unit *
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full p-2 border rounded bg-white"
                  >
                    <option value="Unit 1">Unit 1</option>
                    <option value="Unit 2">Unit 2</option>
                    <option value="Unit 3">Unit 3</option>
                    <option value="Unit 4">Unit 4</option>
                    <option value="Unit 5">Unit 5</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Question Text *
                </label>
                <textarea
                  required
                  rows="4"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="w-full p-2 border rounded text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter the question description..."
                ></textarea>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Part *
                  </label>
                  <select
                    value={formData.part}
                    onChange={(e) => setFormData({ ...formData, part: e.target.value })}
                    className="w-full p-2 border rounded bg-white"
                  >
                    <option value="A">Part A</option>
                    <option value="B">Part B</option>
                    <option value="C">Part C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Marks *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.marks}
                    onChange={(e) => setFormData({ ...formData, marks: e.target.value })}
                    className="w-full p-2 border rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    CO *
                  </label>
                  <select
                    value={formData.co}
                    onChange={(e) => setFormData({ ...formData, co: e.target.value })}
                    className="w-full p-2 border rounded bg-white"
                  >
                    <option value="CO1">CO1</option>
                    <option value="CO2">CO2</option>
                    <option value="CO3">CO3</option>
                    <option value="CO4">CO4</option>
                    <option value="CO5">CO5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    K-Level
                  </label>
                  <input
                    type="text"
                    value={formData.kLevel}
                    onChange={(e) => setFormData({ ...formData, kLevel: e.target.value })}
                    className="w-full p-2 border rounded font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 shadow"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
