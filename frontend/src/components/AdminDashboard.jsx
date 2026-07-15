import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import mammoth from "mammoth"; // ✅ Added Mammoth for Docx reading

import { API_BASE, normalizeRowKeys, readFirstSheet, exportSemesterPaperDocx, exportUnitTestPaperDocx, exportClaimFormDocx, mergeResults, exportHallTicketsDocx } from "../utils.js";
import GPACalculator from "./GPACalculator"; 

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState("halltickets"); 
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "AIDS", "MECH", "CIVIL", "AERO","CSBS","BIOTECH"];
  
  // Standard States
  const [dept, setDept] = useState("CSE"); 
  const [sem, setSem] = useState(3); 
  const [uploadRole, setUploadRole] = useState("student");
  const [calcDept, setCalcDept] = useState("CSE"); 
  const [calcSem, setCalcSem] = useState("3");
  const [manualDept, setManualDept] = useState("CSE"); 
  const [manualSem, setManualSem] = useState("3");

  const [gridType, setGridType] = useState("internal"); 
  const [gridPaperType, setGridPaperType] = useState("THEORY");
  const [templateMode, setTemplateMode] = useState("STANDARD"); 
  
  const [uploadFormat, setUploadFormat] = useState("EXCEL");
  const [ocrText, setOcrText] = useState("");
  const [showOcrModal, setShowOcrModal] = useState(false);

  const [manualUploadFormat, setManualUploadFormat] = useState("EXCEL");
  const [manualOcrText, setManualOcrText] = useState("");
  const [showManualOcrModal, setShowManualOcrModal] = useState(false);
  const [manualOcrSubject, setManualOcrSubject] = useState("");

  const [gridSubjectList, setGridSubjectList] = useState([]);
  const [gridSubject, setGridSubject] = useState("");
  const [gridData, setGridData] = useState([]);
  
  const [customCols, setCustomCols] = useState([]);
  const [savedPapers, setSavedPapers] = useState([]);

  // REQUISITION STATE
  const [reqDept, setReqDept] = useState("CSE");
  const [reqSem, setReqSem] = useState("3");
  const [reqSubject, setReqSubject] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqApptNo, setReqApptNo] = useState("");
  const [reqType, setReqType] = useState("SEMESTER");
  const [reqFaculty, setReqFaculty] = useState("");
  const [reqDeadline, setReqDeadline] = useState("");
  const [requisitions, setRequisitions] = useState([]);
  const [qPaperSubTab, setQPaperSubTab] = useState("bank");
  const [viewingClaim, setViewingClaim] = useState(null);

  // --- HALL TICKET STATE ---
  const [htDept, setHtDept] = useState("CSE");
  const [htSem, setHtSem] = useState("3");
  const [htSession, setHtSession] = useState("November / December 2026");
  const [htCentre, setHtCentre] = useState("1127 : ST. PETER'S COLLEGE OF ENGINEERING AND TECHNOLOGY");
  const [htNotes, setHtNotes] = useState("1. This Hall Ticket is valid only if the candidate's admission is approved.\n2. Correction in Name/DOB/Photo should be reported immediately.\n3. Instructions printed overleaf must be strictly followed.");
  const [generatedTickets, setGeneratedTickets] = useState([]);
  const [isGeneratingHT, setIsGeneratingHT] = useState(false);
  const [printSingleId, setPrintSingleId] = useState(null); 
  
  // ✅ NEW: CUSTOM DOCX TEMPLATE STATE
  const [htTemplateMode, setHtTemplateMode] = useState("STANDARD");
  const [customHtContent, setCustomHtContent] = useState("");

  // PROFILES STATE
  const [profileStudents, setProfileStudents] = useState([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [profileDeptFilter, setProfileDeptFilter] = useState("All");
  const [profileSemFilter, setProfileSemFilter] = useState("All");
  const [profileRoleFilter, setProfileRoleFilter] = useState("student");

  // PASSWORD CHANGE STATE
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const deptRef = useRef(dept); 
  const manualDeptRef = useRef(manualDept); 
  const manualSemRef = useRef(manualSem);   

  useEffect(() => { 
    deptRef.current = dept; manualDeptRef.current = manualDept; manualSemRef.current = manualSem; 
    setPreviewData([]); setMessage(""); 
  }, [dept, sem, activeTab, calcDept, calcSem, manualDept, manualSem]);

  useEffect(() => {
    if (activeTab === "grid" && gridType === "internal") {
      fetch(`${API_BASE}/api/import/fetch-subjects?department=${dept}&semester=${sem}&paperType=${gridPaperType}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
            const arr = Array.isArray(data) ? data : [];
            setGridSubjectList(arr); 
            if(arr.length > 0) setGridSubject(arr[0].subjectCode); else setGridSubject(""); 
        }).catch(() => { setGridSubjectList([]); setGridSubject(""); });
    }
  }, [dept, sem, gridPaperType, activeTab, gridType]);

  useEffect(() => {
    if (activeTab === "qpapers") {
      fetch(`${API_BASE}/api/import/question-papers`).then(res => res.ok ? res.json() : []).then(data => setSavedPapers(Array.isArray(data) ? data : [])).catch(() => setSavedPapers([]));
      fetch(`${API_BASE}/api/requisitions`).then(res => res.ok ? res.json() : []).then(data => setRequisitions(Array.isArray(data) ? data : [])).catch(() => setRequisitions([]));
    }
    if (activeTab === "profiles") fetchProfiles();
  }, [activeTab, qPaperSubTab]);

  const fetchProfiles = async () => {
     try {
          const res = await fetch(`${API_BASE}/api/import/logins`);
          if(res.ok) {
              const data = await res.json();
              setProfileStudents(data);
          }
     } catch(e) { console.warn(e); }
  };

  const [paperType, setPaperType] = useState(null); const [subjectList, setSubjectList] = useState([]); const [selectedSubject, setSelectedSubject] = useState(""); const [internalFile, setInternalFile] = useState(null);
  const [previewData, setPreviewData] = useState([]); const [loadingPreview, setLoadingPreview] = useState(false);

  const apiPost = async (endpoint, body, isFile = false) => {
    setLoading(true); setMessage("");
    try {
      const options = {
        method: "POST",
        body: isFile ? body : JSON.stringify(body)
      };
      if (!isFile) {
        options.headers = { "Content-Type": "application/json" };
      }
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      const text = await response.text();
      try { const json = JSON.parse(text); if (json.message) setMessage(`✅ Success: ${json.message}`); else if (!response.ok) throw new Error(json.message || text); else setMessage(`✅ Success: Action Completed`); } 
      catch { if (!response.ok) throw new Error(text); setMessage(`✅ Success: ${text}`); } return true; 
    } catch (err) { setMessage(`❌ Error: ${err.message}`); return false; } finally { setLoading(false); }
  };

  const handlePhotoUpload = async (regNo, e) => {
     const file = e.target.files[0];
     if (!file) return;
     if (file.size > 2 * 1024 * 1024) return alert("Image is too large. Please upload an image under 2MB.");

     const formData = new FormData();
     formData.append("photo", file);
     
     setLoading(true);
     setMessage(`⏳ Uploading photo for ${regNo}...`);
     try {
         const response = await fetch(`${API_BASE}/api/students/${regNo}/photo`, { method: "POST", body: formData });
         if (response.ok) {
             setMessage(`✅ Successfully updated photo for ${regNo}`);
             setProfileStudents(prev => prev.map(s => s.registerNumber === regNo ? {...s, photoUpdateTs: Date.now()} : s));
         } else {
             setMessage(`❌ Failed to upload photo for ${regNo}`);
         }
     } catch (err) { setMessage(`❌ Network error while uploading photo.`); }
     setLoading(false);
  };



  const handleCreateRequisition = async () => {
    if(!reqSubject || !reqFaculty || !reqDeadline || !reqApptNo || !reqTitle) return alert("Please fill all fields to send request.");
    const payload = { department: reqDept, semester: reqSem, subjectCode: reqSubject.toUpperCase(), courseTitle: reqTitle, examType: reqType, facultyId: reqFaculty, deadline: reqDeadline, appointmentLetterNo: reqApptNo, status: "PENDING" };
    const success = await apiPost("/api/requisitions", payload);
    if(success) {
      setReqSubject(""); setReqTitle(""); setReqApptNo(""); setReqFaculty(""); setReqDeadline("");
      fetch(`${API_BASE}/api/requisitions`).then(res => res.ok ? res.json() : []).then(data => setRequisitions(Array.isArray(data) ? data : []));
    }
  };

  const handleSubjectUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const currentDept = deptRef.current;
    readFirstSheet(file, (rows) => {
      const mapped = rows.map((r) => {
        const n = normalizeRowKeys(r);
        let paperType = "THEORY";
        const pt = String(n.papertype || n.type || "").toUpperCase().trim();
        if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(pt)) {
          paperType = pt;
        } else {
          const lVal = parseInt(n.l) || 0;
          const tVal = parseInt(n.t) || 0;
          const pVal = parseInt(n.p) || 0;
          if (pVal > 0 && lVal > 0) {
            paperType = "INTEGRATED";
          } else if (pVal > 0 && lVal === 0) {
            paperType = "PRACTICAL";
          } else {
            paperType = "THEORY";
          }
        }
        return {
          subjectCode: String(n.subjectcode || n.code || "").toUpperCase().trim(),
          subjectName: n.subjectname || n.name || "",
          department: currentDept,
          semester: parseInt(sem),
          l: parseInt(n.l) || 0,
          t: parseInt(n.t) || 0,
          p: parseInt(n.p) || 0,
          credits: parseInt(n.credits || n.c) || 0,
          paperType: paperType
        };
      }).filter(item => item.subjectCode);
      apiPost("/api/import/subjects", mapped);
    });
  };
  const handleLoginUpload = (e) => { const file = e.target.files[0]; if (!file) return; readFirstSheet(file, (rows) => { const mapped = rows.map((r) => { const n = normalizeRowKeys(r); let rawPassword = ""; for (let k in n) { if (k.includes("dob") || k.includes("birth") || k.includes("pass")) { rawPassword = String(n[k]).trim(); break; } } let formattedPassword = rawPassword; if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(rawPassword)) { const parts = rawPassword.split(/[\/\-]/); formattedPassword = `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`; } else if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(rawPassword)) { const parts = rawPassword.split(/[\/\-]/); formattedPassword = `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`; } else if (!isNaN(rawPassword) && Number(rawPassword) > 20000) { const dateObj = new Date((Number(rawPassword) - 25569) * 86400 * 1000); const y = dateObj.getFullYear(); const m = String(dateObj.getMonth() + 1).padStart(2, '0'); const d = String(dateObj.getDate()).padStart(2, '0'); formattedPassword = `${d}-${m}-${y}`; } return { registerNumber: n.registerNumber, name: n.name, password: formattedPassword, department: n.department || "", semester: n.semester ? parseInt(n.semester) : parseInt(sem), role: uploadRole }; }); const validRows = mapped.filter(m => m.registerNumber); if(validRows.length === 0) { setMessage("⚠️ No valid Register Numbers found."); return; } apiPost("/api/import/logins", validRows); }); };
  const fetchSubjects = async (type) => { setPaperType(type); setSubjectList([]); setSelectedSubject(""); setMessage(`Fetching ${type} subjects...`); try { const res = await fetch(`${API_BASE}/api/import/fetch-subjects?department=${dept}&semester=${sem}&paperType=${type}`); if (!res.ok) throw new Error("Failed to fetch subjects"); const data = await res.json(); setSubjectList(data); if (data.length === 0) { setMessage(`⚠️ No ${type} subjects found.`); } else { setMessage(""); setSelectedSubject(data[0].subjectCode); } } catch (err) { setMessage(`❌ Error: ${err.message}`); } };
  const handleInternalUpload = () => { if (!internalFile || !selectedSubject) { setMessage("⚠️ Select a subject and file first."); return; } const formData = new FormData(); formData.append("file", internalFile); formData.append("subjectCode", selectedSubject); formData.append("department", dept); apiPost("/api/import/internal-upload", formData, true); };
  const handleExternalUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFirstSheet(file, (rows) => {
      if (rows.length === 0) return;
      const firstRow = normalizeRowKeys(rows[0]);
      const isVertical = !!(firstRow.subjectcode || firstRow.subject || firstRow.code);
      let payload = [];
      if (isVertical) {
        payload = rows.map((r) => {
          const n = normalizeRowKeys(r);
          return {
            registerNumber: n.registerNumber || "",
            subjectCode: String(n.subjectcode || n.subject || n.code).toUpperCase().trim(),
            externalMarks: parseInt(n.externalmarks || n.mark || n.external) || 0
          };
        }).filter(item => item.registerNumber && item.subjectCode);
      } else {
        payload = rows.flatMap((r) => {
          const n = normalizeRowKeys(r);
          const regNo = n.registerNumber;
          if (!regNo) return [];
          const ignoreKeys = ["registernumber", "rollno", "name", "sno", "serialno", "department", "semester", "dob", "password"];
          return Object.keys(r).map(k => {
            const lowerKey = k.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
            if (ignoreKeys.includes(lowerKey)) return null;
            const markVal = parseInt(r[k]);
            if (isNaN(markVal)) return null;
            return {
              registerNumber: regNo,
              subjectCode: k.toUpperCase().trim(),
              externalMarks: markVal
            };
          }).filter(item => item !== null);
        });
      }
      if (payload.length === 0) {
        setMessage("⚠️ No valid external marks found in the file.");
        return;
      }
      apiPost("/api/import/external", payload);
    });
  };
  const handleCalculate = () => { apiPost("/api/import/calculate-results", {}); };
  const handlePreview = async (targetSem, targetDept) => { setLoadingPreview(true); setPreviewData([]); try { const res = await fetch(`${API_BASE}/api/import/preview?semester=${targetSem}&department=${targetDept}&_t=${Date.now()}`); if(res.ok) { const data = await res.json(); setPreviewData(data); if(data.length > 0) setMessage(`✅ Loaded ${data.length} results.`); else setMessage(`⚠️ No results found for ${targetDept} Sem ${targetSem}.`); } } catch(err) { setMessage("❌ Error fetching preview"); } setLoadingPreview(false); };
  const handlePublish = async (targetSem, targetDept) => { if(!confirm(`Are you sure you want to PUBLISH results for ${targetDept} Sem ${targetSem}?`)) return; try { const res = await fetch(`${API_BASE}/api/import/publish?semester=${targetSem}&department=${targetDept}`, { method: "POST" }); const text = await res.text(); setMessage(res.ok ? "🎉 " + text : "❌ Publish failed"); handlePreview(targetSem, targetDept); } catch(err) { setMessage("❌ Error publishing"); } };
  const handleDropDrafts = async (targetSem, targetDept) => { if(!confirm(`⚠️ DELETE all unpublished drafts for ${targetDept} Sem ${targetSem}?`)) return; try { const res = await fetch(`${API_BASE}/api/import/drop-drafts?semester=${targetSem}&department=${targetDept}`, { method: "DELETE" }); if(res.ok) { setMessage("✅ Drafts Deleted."); setPreviewData([]); } } catch(err) { setMessage("❌ Error dropping drafts"); } };
  const handleDownload = () => { const ws = XLSX.utils.json_to_sheet(previewData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Draft Results"); XLSX.writeFile(wb, `Results_Draft.xlsx`); };
  const handleUnpublishLive = async (targetSem, targetDept) => { if(!confirm(`🚨 DANGER: Are you sure you want to DROP/UNPUBLISH the LIVE results for ${targetDept} Sem ${targetSem}?`)) return; try { const res = await fetch(`${API_BASE}/api/import/unpublish?semester=${targetSem}&department=${targetDept}`, { method: "DELETE" }); if(res.ok) { setMessage(`✅ Successfully dropped live results for ${targetDept} Semester ${targetSem}.`); } else { const text = await res.text(); setMessage(`❌ Error unpublishing: ${text}`); } } catch(err) { setMessage("❌ Network error dropping live results."); } };
  const handlePromote = async (targetDept, targetSem) => { if(!confirm(`⚠️ PROMOTION: Are you sure you want to promote all ${targetDept} Semester ${targetSem} students to the next stage?`)) return; setLoading(true); try { const res = await fetch(`${API_BASE}/api/import/promote-students?department=${targetDept}&currentSemester=${targetSem}`, { method: "POST" }); const data = await res.json(); if(res.ok) setMessage(`🎉 Success: ${data.message}`); else setMessage(`❌ Error: ${data.error || "Promotion failed"}`); } catch (err) { setMessage("❌ Network error during promotion."); } setLoading(false); };
  const handleDeletePaper = async (id) => { if (!confirm("⚠️ Are you sure you want to permanently delete this question paper?")) return; setLoading(true); try { const res = await fetch(`${API_BASE}/api/import/question-paper/${id}`, { method: "DELETE" }); const data = await res.json(); if (res.ok) { setMessage(`✅ Success: ${data.message}`); setSavedPapers(prev => prev.filter(paper => paper.id !== id)); } else { setMessage(`❌ Error: ${data.error}`); } } catch (err) { setMessage("❌ Network error during deletion."); } setLoading(false); };
  const handleSmartScanUpload = async (e) => { const file = e.target.files[0]; if (!file) return; if (file.type === "application/pdf") { alert("⚠️ The AI Scanner requires an Image file (PNG/JPG). Please take a screenshot of your PDF and upload the image!"); return; } setLoading(true); setMessage("🔍 Document AI is scanning your image... This may take a moment."); setShowOcrModal(true); try { const result = await Tesseract.recognize(file, 'eng', { logger: m => console.log(m) }); setOcrText(result.data.text); setMessage("✅ Smart Scan complete. Please verify the extracted text below."); } catch (err) { setMessage("❌ OCR Failed. Make sure the image is clear, or try a different file."); setShowOcrModal(false); } setLoading(false); };
  const parseOcrDataToDB = () => { const currentDept = deptRef.current; const currentSem = String(sem); const lines = ocrText.split('\n'); const finalPayload = []; const regex = /(1127\d{8}|[A-Z0-9]{10,14}).*?(\d{1,3})/i; lines.forEach(line => { const match = line.match(regex); if (match) { const regNo = match[1].toUpperCase(); const mark = parseInt(match[2]); if (mark <= 100) { finalPayload.push({ registerNumber: regNo, subjectCode: selectedSubject || "SCANNED", semester: currentSem, grade: mark >= 50 ? "PASS" : "FAIL", result: mark >= 50 ? "PASS" : "FAIL", mark: String(mark), department: currentDept }); } } }); if (finalPayload.length === 0) { alert("⚠️ Could not find valid Register Numbers and Marks in the text."); return; } if(!confirm(`📢 SCANNED UPLOAD:\nFound ${finalPayload.length} valid students.\nClick OK to upload directly to Drafts.`)) return; apiPost("/api/import/results", finalPayload).then((success) => { if(success) { setShowOcrModal(false); setTimeout(() => handlePreview(currentSem, currentDept), 1500); } }); };
  const handleManualSmartScanUpload = async (e) => { const file = e.target.files[0]; if (!file) return; if (file.type === "application/pdf") { alert("⚠️ You uploaded a PDF. Please change the Dropdown above to 'Native PDF' instead of 'AI Smart Scan'!"); return; } setLoading(true); setMessage("🔍 Document AI is scanning your image... This may take a moment."); setShowManualOcrModal(true); try { const result = await Tesseract.recognize(file, 'eng', { logger: m => console.log(m) }); setManualOcrText(result.data.text); setMessage("✅ Smart Scan complete. Please verify the extracted grades below."); } catch (err) { setMessage("❌ OCR Failed. Make sure the image is clear."); setShowManualOcrModal(false); } setLoading(false); };
  const parseManualOcrDataToDB = () => { const currentDept = manualDeptRef.current; const currentSem = String(manualSemRef.current); const lines = manualOcrText.split('\n'); const finalPayload = []; let globalRegNo = null; lines.forEach(line => { const rMatch = line.match(/\b(1127\d{8}|[A-Z0-9]{10,14})\b/i); if (rMatch && !globalRegNo) globalRegNo = rMatch[1].toUpperCase(); }); lines.forEach(line => { const regMatch = line.match(/\b(1127\d{8}|[A-Z0-9]{10,14})\b/i); const subjMatch = line.match(/\b([A-Z]{2,3}\d{4,5})\b/i); const gradesRegex = /\b(O|0|Ο|A\+|A|B\+|B|C|U|RA|AB|SA|W|FAIL|PASS)\b/ig; let grades = []; let match; while ((match = gradesRegex.exec(line)) !== null) { grades.push(match[1].toUpperCase().replace(/0|Ο/g, 'O')); } if (grades.length > 0) { const gradeVal = grades[grades.length - 1]; const isFail = ["U", "RA", "AB", "FAIL", "F", "ABSENT", "WH", "W", "SA"].includes(gradeVal); if (subjMatch && globalRegNo) { const subjCode = subjMatch[1].toUpperCase(); if (!finalPayload.some(p => p.registerNumber === globalRegNo && p.subjectCode === subjCode)) { finalPayload.push({ registerNumber: globalRegNo, subjectCode: subjCode, semester: currentSem, grade: gradeVal, result: isFail ? "FAIL" : "PASS", mark: "0", department: currentDept }); } } else if (regMatch && manualOcrSubject) { const regNo = regMatch[1].toUpperCase(); if (!finalPayload.some(p => p.registerNumber === regNo && p.subjectCode === manualOcrSubject)) { finalPayload.push({ registerNumber: regNo, subjectCode: manualOcrSubject.trim().toUpperCase(), semester: currentSem, grade: gradeVal, result: isFail ? "FAIL" : "PASS", mark: "0", department: currentDept }); } } } }); if (finalPayload.length === 0) { alert("⚠️ Could not find valid grades in the text."); return; } if(!confirm(`📢 SCANNED MANUAL UPLOAD:\nTarget Dept: ${currentDept}\nTarget Sem: ${currentSem}\nFound ${finalPayload.length} valid grades.\nClick OK to upload to Drafts.`)) return; apiPost("/api/import/results", finalPayload).then((success) => { if(success) { setShowManualOcrModal(false); setTimeout(() => handlePreview(currentSem, currentDept), 1500); } }); };
  const handleManualPDFUpload = async (e) => { const file = e.target.files[0]; if (!file) return; setLoading(true); setMessage("📄 Extracting text and mapping grades from PDF... Please wait."); try { const arrayBuffer = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise; let allLines = []; for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); const itemsByY = {}; content.items.forEach(item => { const y = Math.round(item.transform[5]); let targetY = y; for (let existingY in itemsByY) { if (Math.abs(existingY - y) < 5) { targetY = existingY; break; } } if (!itemsByY[targetY]) itemsByY[targetY] = []; itemsByY[targetY].push(item); }); const yCoords = Object.keys(itemsByY).sort((a, b) => b - a); yCoords.forEach(y => { const lineItems = itemsByY[y].sort((a, b) => a.transform[4] - b.transform[4]); const lineText = lineItems.map(item => item.str.trim()).filter(str => str.length > 0).join(" "); if (lineText) allLines.push(lineText); }); } const currentDept = manualDeptRef.current; const currentSem = String(manualSemRef.current); const finalPayload = []; let currentSubjects = []; allLines.forEach(line => { const subjectMatches = line.match(/\b[A-Z]{2,3}\d{4,5}\b/g); if (subjectMatches && subjectMatches.length >= 2) { currentSubjects = subjectMatches; } const regMatch = line.match(/\b(1127\d{8}|[A-Z0-9]{10,14})\b/); if (regMatch && currentSubjects.length > 0) { const regNo = regMatch[1].toUpperCase(); const afterRegNo = line.substring(line.indexOf(regNo) + regNo.length); const gradeRegex = /\b(O|0|Ο|A\+|A|B\+|B|C|U|RA|AB|SA|W|WH\d*)\b/g; const grades = []; let gMatch; while ((gMatch = gradeRegex.exec(afterRegNo)) !== null) { grades.push(gMatch[1].toUpperCase().replace(/0|Ο/g, 'O')); } const validGrades = grades.slice(-currentSubjects.length); for(let i = 0; i < Math.min(validGrades.length, currentSubjects.length); i++) { const gradeVal = validGrades[i]; const isFail = ["U", "RA", "AB", "FAIL", "F", "ABSENT", "WH", "WH1", "W", "SA"].includes(gradeVal); finalPayload.push({ registerNumber: regNo, subjectCode: currentSubjects[i], semester: currentSem, grade: gradeVal, result: isFail ? "FAIL" : "PASS", mark: "0", department: currentDept }); } } }); if (finalPayload.length === 0) { alert("⚠️ Could not find valid Students and Subjects in this PDF."); setLoading(false); return; } if(!confirm(`📢 PDF PROCESSED:\nTarget Dept: ${currentDept}\nTarget Sem: ${currentSem}\nMapped ${finalPayload.length} total grades from the PDF.\nClick OK to upload to Drafts.`)) { setLoading(false); return; } apiPost("/api/import/results", finalPayload).then((success) => { if(success) { setTimeout(() => handlePreview(currentSem, currentDept), 1500); } }); } catch (err) { console.error(err); setMessage("❌ Failed to process PDF. Is it password protected?"); } setLoading(false); };
  const handleCustomTemplateUpload = (e) => { const file = e.target.files[0]; if(!file) return; readFirstSheet(file, (rows) => { if(rows.length > 0) { const originalHeaders = Object.keys(rows[0]).filter(k => k.toLowerCase() !== "registernumber" && k.toLowerCase() !== "name"); setCustomCols(originalHeaders); const resetData = gridData.map(s => { const newStudent = { registerNumber: s.registerNumber, name: s.name }; originalHeaders.forEach(h => newStudent[h] = ""); return newStudent; }); setGridData(resetData); setMessage("✅ Custom Grid Template Loaded! You can now start entering data."); } }); };  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setSettingsError("");
    setSettingsSuccess("");
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setSettingsError("All fields are required.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setSettingsError("New password and confirm password do not match.");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-admin-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.detail?.error || data.error || "Failed to update password.");
      } else {
        setSettingsSuccess("✅ Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setSettingsError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentsForGrid = async () => {
    if(!gridSubject.trim() && gridType === "external") { alert("Please enter the Subject Code."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/import/logins`);
      if (!res.ok) throw new Error("Server returned an error");
      const data = await res.json();
      const validData = Array.isArray(data) ? data : [];
      
      const targetYear = Math.ceil(Number(sem) / 2);
      const filtered = validData.filter(u => {
        const dbDept = String(u.department || "").trim().toUpperCase();
        const uiDept = String(dept).trim().toUpperCase();
        if (dbDept !== uiDept) return false;
        if (Number(sem) === 99) return Number(u.semester) === 99;
        const studentYear = Number(u.year) || Math.ceil(Number(u.semester) / 2);
        return studentYear === targetYear;
      });
      
      setGridData(filtered.map(s => {
        const base = { registerNumber: s.registerNumber, name: s.name, extMarks: "" };
        if(templateMode === "CUSTOM") { customCols.forEach(c => base[c] = ""); return base; }
        return { ...base, ut1: "", ut2: "", ut3: "", ut4: "", ut5: "", utAvg: "", utScaled: "", title: "", dress: "", pres: "", disc: "", semMarks: "", int1: "", ex1: "", ex2: "", ex3: "", ex4: "", ex5: "", ex6: "", ex7: "", ex8: "", ex9: "", ex10: "", pAvg: "", p75: "", p25: "", pInt: "", iUt1: "", iUt2: "", iUt3: "", iUtT: "", iUtEq: "", iUt: "", iTitle: "", iDress: "", iPres: "", iDisc: "", iSemMarks: "", iInt75: "", iEx1: "", iEx2: "", iEx3: "", iEx4: "", iEx5: "", iExAvg: "", iEx75: "", iModel: "", iIntFinal: "" };
      }));
      if(filtered.length === 0) setMessage(`⚠️ No students found in ${dept} Semester ${sem}.`);
      else setMessage(`✅ Loaded ${filtered.length} students. Ready for data entry.`);
    } catch (e) { setMessage("❌ Error fetching students. Ensure database has data."); setGridData([]); }
    setLoading(false);
  };

  const handleGridChange = (index, field, value) => {
    const newData = [...gridData];
    newData[index][field] = value;
    setGridData(newData);
  };

  const saveGridData = async () => {
    if (gridType === "external") {
      const validData = gridData.filter(s => s.extMarks.trim() !== "");
      if(validData.length === 0) { alert("No external marks entered!"); return; }
      const payload = validData.map(s => ({ registerNumber: s.registerNumber, subjectCode: gridSubject.toUpperCase().trim(), externalMarks: parseInt(s.extMarks) || 0 }));
      apiPost("/api/import/external", payload).then(success => { if(success) alert(`✅ External Marks saved! You can now run the Calculation Engine.`); });
      return;
    }
    let aoa = []; let merges = [];
    if (templateMode === "CUSTOM") { aoa = [ ["Register Number", "Name", ...customCols] ]; gridData.forEach((s) => { const hasData = customCols.some(c => s[c]); if (hasData) { aoa.push([s.registerNumber, s.name, ...customCols.map(c => s[c])]); } }); merges = []; }
    else if (gridPaperType === "THEORY") {
        aoa = [ ["S.No", "Register Number", "Name of the Student", "Unit Test", "", "", "", "", "", "", "Seminar/ Case Study - Rubrics for Evaluation", "", "", "", "", "Internal I"], ["", "", "", "UT-1", "UT-2", "UT-3", "UT-4", "UT-5", "Avg", "UT", "Title", "Dress Code &", "Presenta", "Discus", "Marks", "Marks"] ];
        gridData.forEach((s, idx) => { if(s.ut1 || s.int1 || s.title) { aoa.push([ idx + 1, String(s.registerNumber), String(s.name), s.ut1, s.ut2, s.ut3, s.ut4, s.ut5, s.utAvg, s.utScaled, s.title, s.dress, s.pres, s.disc, s.semMarks, s.int1 ]); } });
        merges = [{ s: {r:0, c:3}, e: {r:0, c:9} }, { s: {r:0, c:10}, e: {r:0, c:14} }];
    } 
    else if (gridPaperType === "PRACTICAL") {
        aoa = [ ["S.No", "Register Number", "Name of the Student", "Marks for Each Experiemont (10)", "", "", "", "", "", "", "", "", "", "Average", "75%", "25%", "Internal Mark"], ["", "", "", "Ex-1", "Ex-2", "Ex-3", "Ex-4", "Ex-5", "Ex-6", "Ex-7", "Ex-8", "Ex-9", "Ex-10", "", "", "", ""] ];
        gridData.forEach((s, idx) => { if(s.ex1 || s.pInt) { aoa.push([ idx + 1, String(s.registerNumber), String(s.name), s.ex1, s.ex2, s.ex3, s.ex4, s.ex5, s.ex6, s.ex7, s.ex8, s.ex9, s.ex10, s.pAvg, s.p75, s.p25, s.pInt ]); } });
        merges = [{ s: {r:0, c:3}, e: {r:0, c:12} }];
    } 
    else if (gridPaperType === "INTEGRATED") {
        aoa = [ ["S.No", "Register Number", "Name of the Student", "Unit Test", "", "", "", "", "", "Seminar/ Case Study - Rubrics for Evaluation", "", "", "", "", "Internal Mar", "Marks for Each Experiemont (10)", "", "", "", "", "Average", "75%", "Model", "Internal"], ["", "", "", "UT-1", "UT-2", "UT-3", "UT-T", "UT-eq", "UT", "Title", "Dress Code &", "Presenta", "Discus", "Marks", "75%", "Ex-1", "Ex-2", "Ex-3", "Ex-4", "Ex-5", "", "", "", ""] ];
        gridData.forEach((s, idx) => { if(s.iUt1 || s.iIntFinal) { aoa.push([ idx + 1, String(s.registerNumber), String(s.name), s.iUt1, s.iUt2, s.iUt3, s.iUtT, s.iUtEq, s.iUt, s.iTitle, s.iDress, s.iPres, s.iDisc, s.iSemMarks, s.iInt75, s.iEx1, s.iEx2, s.iEx3, s.iEx4, s.iEx5, s.iExAvg, s.iEx75, s.iModel, s.iIntFinal ]); } });
        merges = [{ s: {r:0, c:3}, e: {r:0, c:8} }, { s: {r:0, c:9}, e: {r:0, c:13} }, { s: {r:0, c:15}, e: {r:0, c:19} }];
    }

    if(aoa.length === 1 || aoa.length === 2 && templateMode !== "CUSTOM") { alert("No marks entered!"); return; }
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!merges'] = merges; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Internals");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const file = new File([new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })], "live_grid_internals.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const formData = new FormData(); formData.append("file", file); formData.append("subjectCode", gridSubject); formData.append("department", dept);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/import/internal-upload`, { method: "POST", body: formData });
      const text = await response.text();
      if(response.ok) { setMessage(`✅ Success: ${text}`); alert(`✅ Internal Marks saved successfully via ${templateMode === "CUSTOM" ? "Custom" : gridPaperType} template!`); } 
      else { setMessage(`❌ Error: ${text}`); }
    } catch (err) { setMessage(`❌ Network Error submitting marks.`); }
    setLoading(false);
  };

  const handleGenerateHallTickets = async () => {
     if(!htDept || !htSem) return alert("Select Dept and Semester");
     setIsGeneratingHT(true);
     setGeneratedTickets([]);
     setMessage("🔍 Fetching subjects and student records...");

     try {
         const types = ["THEORY", "PRACTICAL", "INTEGRATED"];
         let currentSemSubjects = [];
         for(let t of types) {
             const r = await fetch(`${API_BASE}/api/import/fetch-subjects?department=${htDept}&semester=${htSem}&paperType=${t}`);
             if(r.ok) {
                 const data = await r.json();
                 currentSemSubjects = [...currentSemSubjects, ...data];
             }
         }

         const stdRes = await fetch(`${API_BASE}/api/import/logins`);
         if(!stdRes.ok) throw new Error("Could not fetch students");
         const allStudents = await stdRes.json();
         const targetYear = Math.ceil(Number(htSem) / 2);
         const targetStudents = allStudents.filter(u => u.department === htDept && (Number(u.year) || Math.ceil(Number(u.semester) / 2)) === targetYear && u.role === 'student');

         if(targetStudents.length === 0) {
             setIsGeneratingHT(false);
             return setMessage(`⚠️ No students found in ${htDept} Semester ${htSem}.`);
         }

         setMessage(`⚙️ Analyzing past arrears for ${targetStudents.length} students...`);

         const tickets = [];
         for(let s of targetStudents) {
             let arrears = [];
             try {
                 const profRes = await fetch(`${API_BASE}/api/students/${s.registerNumber}/profile`);
                 if(profRes.ok) {
                     const profData = await profRes.json();
                     const mergedResults = mergeResults(profData.results || []);
                     arrears = mergedResults.filter(r => 
                         ["U", "RA", "AB", "FAIL", "F", "ABSENT", "WH", "SA"].includes(r.grade?.toUpperCase()) 
                         && Number(r.semester) !== Number(htSem)
                     );
                 }
             } catch(e) { console.warn(`Could not fetch profile for ${s.registerNumber}`); }

             tickets.push({ student: s, currentSubjects: currentSemSubjects, arrears: arrears });
         }

         setGeneratedTickets(tickets);
         setMessage(`✅ Successfully generated ${tickets.length} Hall Tickets.`);
     } catch(err) {
         setMessage(`❌ Error generating Hall Tickets: ${err.message}`);
     }
     setIsGeneratingHT(false);
  };

  // ✅ NEW: Read the custom docx template for hall tickets
  const handleHtDocxUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { 
        const arrayBuffer = await file.arrayBuffer(); 
        const result = await mammoth.extractRawText({ arrayBuffer }); 
        setCustomHtContent(result.value); 
        alert("✅ Custom Document layout successfully extracted!"); 
    } catch (err) { alert("❌ Failed to read DOCX file. Make sure it is a valid Word Document."); }
  };

  const getBranchName = (deptCode) => {
     if (deptCode === "CSE") return "B.E. Computer Science and Engineering";
     if (deptCode === "ECE") return "B.E. Electronics and Communication Engineering";
     if (deptCode === "EEE") return "B.E. Electrical and Electronics Engineering";
     if (deptCode === "BIO TECH") return "B.Tech. Biotechnology";
     if (deptCode === "MECH") return "B.E. Mechanical Engineering";
     if (deptCode === "AIDS") return "B.Tech. Artificial Intelligence and Data Science";
     if (deptCode === "AERO") return "B.E. Aeronautical Engineering";
     if (deptCode === "CIVIL") return "B.E. Civil Engineering";
     if (deptCode === "CHEM") return "B.Tech. Chemical Engineering";
     if (deptCode === "CSBS") return "B.E. Computer Science and Business Systems";
     if (deptCode === "BIO MEDICINE") return "B.E. Biomedical Engineering";
     if (deptCode === "IT") return "B.Tech. Information Technology";
     return `B.E. ${deptCode}`;
  };

  const printIndividualTicket = (regNo) => {
      setPrintSingleId(regNo);
      setTimeout(() => {
          window.print();
          setPrintSingleId(null);
      }, 500);
  };

  const ticketsToRender = printSingleId 
        ? generatedTickets.filter(t => t.student.registerNumber === printSingleId)
        : generatedTickets;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
      
      <style>{`
        @media print {
          @page { size: A4; margin: 5mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* 🖨️ THE HIDDEN PRINTABLE A4 HALL TICKET AREA */}
      {ticketsToRender.length > 0 && (
         <div className="hidden print:block print:absolute print:inset-0 print:bg-white print:z-[9999] text-black bg-white w-full">
            {ticketsToRender.map((ticket) => {
               const allDisplaySubjects = [
                  ...ticket.currentSubjects.map(sub => ({ sem: htSem, code: sub.subjectCode, title: sub.subjectName })),
                  ...ticket.arrears.map(arr => ({ sem: arr.semester, code: arr.subjectCode || arr.subject, title: "ARREAR SUBJECT" }))
               ];
               
               const midpoint = Math.ceil(allDisplaySubjects.length / 2);
               const leftCol = allDisplaySubjects.slice(0, midpoint);
               const rightCol = allDisplaySubjects.slice(midpoint);

               return (
                 <div key={ticket.student.registerNumber} className="print:w-[195mm] print:h-[285mm] p-2 mx-auto box-border" style={{ pageBreakAfter: "always" }}>
                    
                    {/* IF STANDARD TEMPLATE */}
                    {htTemplateMode === "STANDARD" ? (
                      <div className="border-[3px] border-black p-1 h-full flex flex-col relative overflow-hidden">
                         <div className="flex border-b-[3px] border-black h-28 shrink-0">
                            <div className="w-32 flex justify-center items-center p-2 border-r-[3px] border-black">
                               <div className="w-20 h-20 rounded-full border-2 border-black flex items-center justify-center text-[10px] font-bold text-center leading-tight">ANNA<br/>UNIV<br/>LOGO</div>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-2">
                               <h1 className="text-2xl font-bold uppercase tracking-widest">Anna University</h1>
                               <p className="text-sm font-bold uppercase tracking-wider">Chennai - 600 025</p>
                               <p className="text-sm font-medium mt-1">UNIVERSITY EXAMINATIONS - {htSession}</p>
                               <p className="text-lg font-bold mt-1 tracking-widest">HALL TICKET</p>
                            </div>
                            <div className="w-32 border-l-[3px] border-black flex flex-col items-center justify-center p-2 bg-white">
                               <div className="w-20 h-24 border border-gray-400 flex items-center justify-center overflow-hidden bg-gray-50 relative">
                                  <img 
                                    src={`${API_BASE}/api/students/${ticket.student.registerNumber}/photo?t=${ticket.student.photoUpdateTs || ''}`} 
                                    alt={ticket.student.registerNumber}
                                    className="w-full h-full object-cover absolute inset-0 z-10"
                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                                  />
                                  <span className="text-[10px] text-gray-400 text-center px-1">Photo Missing</span>
                               </div>
                            </div>
                         </div>

                         <div className="flex border-b-[3px] border-black text-sm shrink-0">
                            <div className="w-[180px] p-2 font-bold border-r border-black flex items-center">Register Number</div>
                            <div className="flex-1 p-2 font-bold border-r-[3px] border-black flex items-center tracking-widest">{ticket.student.registerNumber}</div>
                            <div className="w-[150px] p-2 font-bold border-r border-black flex items-center">Current Semester</div>
                            <div className="w-16 p-2 font-bold flex items-center justify-center">{String(htSem).padStart(2, '0')}</div>
                         </div>

                         <div className="flex border-b-[3px] border-black text-sm shrink-0">
                            <div className="w-[180px] p-2 font-bold border-r border-black flex items-center">Name</div>
                            <div className="flex-1 p-2 font-bold uppercase border-r-[3px] border-black flex items-center">{ticket.student.name}</div>
                            <div className="w-[150px] p-2 font-bold border-r border-black flex items-center">D.O.B</div>
                            <div className="w-32 p-2 font-bold flex items-center whitespace-nowrap">{ticket.student.password && ticket.student.password.includes("-") ? ticket.student.password : "-"}</div>
                         </div>

                         <div className="flex border-b-[3px] border-black text-sm shrink-0">
                            <div className="w-[180px] p-2 font-bold border-r border-black flex items-center">Degree & Branch</div>
                            <div className="flex-1 p-2 font-bold uppercase flex items-center">{getBranchName(htDept)}</div>
                         </div>

                         <div className="flex border-b-[3px] border-black text-sm shrink-0">
                            <div className="w-[180px] p-2 font-bold border-r border-black flex items-center">Examination Centre</div>
                            <div className="flex-1 p-2 font-bold uppercase flex items-center">{htCentre}</div>
                         </div>

                         <div className="flex flex-1 border-b-[3px] border-black overflow-hidden">
                            <div className="flex-1 border-r-[3px] border-black flex flex-col h-full">
                               <div className="flex border-b border-black bg-gray-100 text-xs font-bold font-serif p-1 shrink-0">
                                  <div className="w-10 text-center">Sem</div>
                                  <div className="w-20 text-center">Sub Code</div>
                                  <div className="flex-1 pl-2">Subject Title</div>
                               </div>
                               <div className="p-2 space-y-2 overflow-hidden">
                                  {leftCol.map((sub, i) => (
                                     <div key={i} className="flex text-[11px] font-mono font-bold uppercase">
                                        <div className="w-10 text-center">{String(sub.sem).padStart(2, '0')}</div>
                                        <div className="w-20 text-center">{sub.code}</div>
                                        <div className="flex-1 pl-2 truncate">{sub.title}</div>
                                     </div>
                                  ))}
                               </div>
                               <div className="mt-auto p-4 font-bold text-sm bg-white shrink-0">
                                  No of Subjects Registered: {allDisplaySubjects.length}
                               </div>
                            </div>
                            
                            <div className="flex-1 flex flex-col h-full">
                               <div className="flex border-b border-black bg-gray-100 text-xs font-bold font-serif p-1 shrink-0">
                                  <div className="w-10 text-center">Sem</div>
                                  <div className="w-20 text-center">Sub Code</div>
                                  <div className="flex-1 pl-2">Subject Title</div>
                               </div>
                               <div className="p-2 space-y-2 overflow-hidden">
                                  {rightCol.map((sub, i) => (
                                     <div key={i} className="flex text-[11px] font-mono font-bold uppercase">
                                        <div className="w-10 text-center">{String(sub.sem).padStart(2, '0')}</div>
                                        <div className="w-20 text-center">{sub.code}</div>
                                        <div className="flex-1 pl-2 truncate">{sub.title}</div>
                                     </div>
                                  ))}
                               </div>
                            </div>
                         </div>

                         <div className="p-2 text-[10px] h-20 shrink-0 bg-white">
                            <p className="font-bold mb-1">NOTE :</p>
                            <div className="whitespace-pre-line leading-tight ml-4 pl-4" style={{textIndent: "-1rem"}}>{htNotes}</div>
                         </div>

                         <div className="flex border-t-[3px] border-black h-20 shrink-0 relative bg-white">
                            <div className="absolute top-2 left-2 text-[10px] font-bold">Generated on: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            <div className="flex-1 border-r-[3px] border-black flex items-end justify-center pb-2 text-xs text-gray-500">Signature of the Candidate</div>
                            <div className="flex-1 border-r-[3px] border-black flex items-end justify-center pb-2 text-xs text-gray-500 relative">
                               <div className="absolute top-1 right-2 w-12 h-12 rounded-full border border-gray-400 flex items-center justify-center text-[6px] text-center text-gray-400 opacity-50 transform -rotate-12">SEAL</div>
                               Signature of the Principal with seal
                            </div>
                            <div className="flex-1 flex items-end justify-center pb-2 text-xs text-gray-500 relative">
                               <div className="absolute bottom-6 right-10 text-black font-serif text-2xl opacity-80 transform -rotate-6">Controller</div>
                               Controller of Examinations
                            </div>
                         </div>
                      </div>
                    ) : (
                      
                      // IF CUSTOM DOCX TEMPLATE MODE
                      <div className="border border-black p-6 h-full flex flex-col whitespace-pre-wrap font-mono text-xs">
                         {/* Replace placeholders with actual data */}
                         {customHtContent
                            .replace(/\[NAME\]/g, ticket.student.name)
                            .replace(/\[REG_?NO\]/g, ticket.student.registerNumber)
                            .replace(/\[DEPT\]/g, getBranchName(htDept))
                            .replace(/\[SEM\]/g, htSem)
                            .replace(/\[DOB\]/g, ticket.student.password)
                            .replace(/\[SUBJECTS\]/g, allDisplaySubjects.map(s => `${s.code} - ${s.title}`).join('\n'))
                         }
                      </div>

                    )}
                 </div>
               );
            })}
         </div>
      )}

      <header className="bg-white shadow px-6 py-4 flex justify-between items-center z-10 sticky top-0 print:hidden">
        <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">🎓 SPCET Admin</h1>
        <button onClick={onLogout} className="text-sm text-red-500 font-medium hover:underline">Logout</button>
      </header>
      
      <main className="flex-1 max-w-[1500px] mx-auto w-full p-6 print:hidden">
        
        {/* TAB NAVIGATION */}
        <div className="flex gap-4 border-b border-gray-200 mb-6 overflow-x-auto print:hidden">
          <button onClick={() => setActiveTab("qpapers")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "qpapers" ? "border-b-2 border-purple-600 text-purple-700" : "text-gray-500 hover:text-purple-700"}`}>1. Question Papers</button>
          <button onClick={() => setActiveTab("setup")} className={`pb-2 px-4 font-medium transition-colors ${activeTab === "setup" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500"}`}>2. Setup</button>
          <button onClick={() => setActiveTab("excel")} className={`pb-2 px-4 font-medium transition-colors ${activeTab === "excel" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500"}`}>3. Excel Uploads</button>
          <button onClick={() => setActiveTab("grid")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "grid" ? "border-b-2 border-green-600 text-green-700" : "text-gray-500 hover:text-green-700"}`}>4. Live Grid Entry</button>
          <button onClick={() => setActiveTab("process")} className={`pb-2 px-4 font-medium transition-colors ${activeTab === "process" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500"}`}>5. Calculate</button>
          <button onClick={() => setActiveTab("manual")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "manual" ? "border-b-2 border-orange-500 text-orange-600" : "text-gray-500 hover:text-orange-600"}`}>6. Final Override</button>
          <button onClick={() => setActiveTab("manage")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "manage" ? "border-b-2 border-red-600 text-red-600" : "text-gray-500 hover:text-red-600"}`}>7. Manage Live</button>
          <button onClick={() => setActiveTab("halltickets")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "halltickets" ? "border-b-2 border-pink-600 text-pink-700" : "text-gray-500 hover:text-pink-700"}`}>8. Hall Tickets</button>
          <button onClick={() => setActiveTab("gpa")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "gpa" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-500 hover:text-indigo-700"}`}>9. GPA Calc</button>
          <button onClick={() => setActiveTab("profiles")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "profiles" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500 hover:text-blue-700"}`}>10. Profiles</button>
          <button onClick={() => setActiveTab("settings")} className={`pb-2 px-4 font-bold transition-colors ${activeTab === "settings" ? "border-b-2 border-slate-600 text-slate-700" : "text-gray-500 hover:text-slate-700"}`}>11. Settings</button>
        </div>

        <AnimatePresence>{message && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`p-4 rounded-md mb-6 text-sm font-medium shadow-sm ${message.startsWith("✅") || message.startsWith("🎉") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{message}</motion.div>}</AnimatePresence>
        
        {["profiles", "subjects", "halltickets", "gpa", "excel", "grid", "process", "manual", "manage"].includes(activeTab) ? (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto text-center py-16 space-y-6">
              <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center">
                 <span className="text-6xl mb-6">🚧</span>
                 <h2 className="text-2xl font-bold text-gray-800 mb-2">Module Under Construction</h2>
                 <p className="text-gray-500 max-w-md">
                    This module is temporarily undergoing maintenance or upgrades. Please check back later.
                 </p>
              </div>
           </motion.div>
        ) : (
           <>
        {/* PROFILES VIEW */}
        {activeTab === "profiles" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                       <h2 className="text-xl font-bold text-gray-800">User Profiles & Logins</h2>
                       <p className="text-sm text-gray-500">View student, faculty, and HOD logins. Upload profile pictures for students.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                       <select value={profileRoleFilter} onChange={e => { setProfileRoleFilter(e.target.value); setProfileSemFilter("All"); }} className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-600 bg-white">
                          <option value="student">Role: Student</option>
                          <option value="faculty">Role: Faculty</option>
                          <option value="hod">Role: HOD</option>
                       </select>
                       <select value={profileDeptFilter} onChange={e => setProfileDeptFilter(e.target.value)} className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-600 bg-white">
                          <option value="All">All Depts</option>
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                       </select>
                       {profileRoleFilter === "student" && (
                         <select value={profileSemFilter} onChange={e => setProfileSemFilter(e.target.value)} className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-600 bg-white">
                            <option value="All">All Sems</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? 'Graduated' : `Sem ${n}`}</option>)}
                         </select>
                       )}
                       <input 
                         type="text" 
                         placeholder="Search Reg No or Name..." 
                         value={profileSearch}
                         onChange={e => setProfileSearch(e.target.value)}
                         className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 flex-1 md:w-48 text-sm"
                       />
                    </div>
                 </div>

                 <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm text-left">
                       <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                          <tr>
                             <th className="px-4 py-3 w-20 text-center">Photo</th>
                             <th className="px-4 py-3">{profileRoleFilter === "student" ? "Register No" : "ID / Register No"}</th>
                             <th className="px-4 py-3">Name</th>
                             <th className="px-4 py-3">Dept</th>
                             {profileRoleFilter === "student" && <th className="px-4 py-3">Sem</th>}
                             <th className="px-4 py-3">Password / DOB</th>
                             <th className="px-4 py-3 w-48">Action</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-100">
                          {(() => {
                             const filtered = profileStudents
                                .filter(s => s.role === profileRoleFilter)
                                .filter(s => profileDeptFilter === "All" || s.department === profileDeptFilter)
                                .filter(s => {
                                   if (profileRoleFilter !== 'student') return true;
                                   return profileSemFilter === "All" || String(s.semester) === String(profileSemFilter);
                                })
                                .filter(s => s.registerNumber.toUpperCase().includes(profileSearch.toUpperCase()) || (s.name && s.name.toUpperCase().includes(profileSearch.toUpperCase())));

                             if (filtered.length === 0) return <tr><td colSpan="7" className="p-8 text-center text-gray-500 font-semibold">No records found matching your filters.</td></tr>;

                             if (profileRoleFilter === "student") {
                                 // Group by Semester
                                 const grouped = filtered.reduce((acc, s) => {
                                    const sm = s.semester || "Unknown";
                                    if(!acc[sm]) acc[sm] = [];
                                    acc[sm].push(s);
                                    return acc;
                                 }, {});

                                 const sortedSems = Object.keys(grouped).sort((a,b) => Number(b) - Number(a));

                                 return sortedSems.map(sem => (
                                    <React.Fragment key={`sem-${sem}`}>
                                       <tr className="bg-blue-50/80 border-y border-blue-100">
                                          <td colSpan="7" className="px-6 py-2 font-bold text-blue-800 text-sm uppercase tracking-wider">
                                             Semester {sem === 99 || sem === "99" ? "Graduated" : sem}
                                          </td>
                                       </tr>
                                       {grouped[sem].map(student => (
                                         <tr key={student.registerNumber} className="hover:bg-gray-50 items-center">
                                            <td className="px-4 py-2 flex justify-center">
                                               <div className="w-12 h-14 bg-gray-200 border border-gray-300 rounded overflow-hidden relative flex items-center justify-center">
                                                  <img 
                                                    src={`${API_BASE}/api/students/${student.registerNumber}/photo?t=${student.photoUpdateTs || ''}`} 
                                                    alt="profile"
                                                    className="w-full h-full object-cover absolute inset-0 z-10"
                                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                                                  />
                                                  <span className="text-[8px] text-gray-400">None</span>
                                               </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono font-bold text-gray-800">{student.registerNumber}</td>
                                            <td className="px-4 py-3 text-gray-700">{student.name}</td>
                                            <td className="px-4 py-3 text-gray-600">{student.department}</td>
                                            <td className="px-4 py-3 text-gray-600">{student.semester}</td>
                                            <td className="px-4 py-3 font-mono font-bold text-gray-700">{student.password}</td>
                                            <td className="px-4 py-3">
                                               <label className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold py-1.5 px-3 rounded text-xs cursor-pointer inline-block transition-colors">
                                                  Upload Photo
                                                  <input 
                                                     type="file" 
                                                     accept="image/*" 
                                                     className="hidden" 
                                                     onChange={(e) => handlePhotoUpload(student.registerNumber, e)}
                                                  />
                                               </label>
                                            </td>
                                         </tr>
                                       ))}
                                    </React.Fragment>
                                 ));
                             } else {
                                 // Render Faculty/HOD directly
                                 return filtered.map(user => (
                                   <tr key={user.registerNumber} className="hover:bg-gray-50 items-center">
                                      <td className="px-4 py-2 flex justify-center">
                                         <span className="text-xs text-gray-400">N/A</span>
                                      </td>
                                      <td className="px-4 py-3 font-mono font-bold text-gray-800">{user.registerNumber}</td>
                                      <td className="px-4 py-3 text-gray-700">{user.name}</td>
                                      <td className="px-4 py-3 text-gray-600">{user.department}</td>
                                      <td className="px-4 py-3 font-mono font-bold text-gray-700">{user.password}</td>
                                      <td className="px-4 py-3">
                                         <span className="text-xs text-gray-400">No Action Required</span>
                                      </td>
                                   </tr>
                                 ));
                             }
                          })()}
                       </tbody>
                    </table>
                 </div>
              </div>
           </motion.div>
        )}

        {/* SUBJECTS VIEW */}
        {activeTab === "subjects" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                       <h2 className="text-xl font-bold text-gray-800">Curriculum & Subjects</h2>
                       <p className="text-sm text-gray-500">View and search course subjects uploaded for each department and semester.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                       <select value={subjectDeptFilter} onChange={e => setSubjectDeptFilter(e.target.value)} className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-600 bg-white">
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                       </select>
                       <select value={subjectSemFilter} onChange={e => setSubjectSemFilter(e.target.value)} className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-600 bg-white">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{`Semester ${n}`}</option>)}
                       </select>
                       <input 
                         type="text" 
                         placeholder="Search Code or Name..." 
                         value={subjectSearch}
                         onChange={e => setSubjectSearch(e.target.value)}
                         className="p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500 flex-1 md:w-48 text-sm"
                       />
                    </div>
                 </div>

                 <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm text-left">
                       <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold border-b border-gray-200">
                          <tr>
                             <th className="px-6 py-3 w-40">Subject Code</th>
                             <th className="px-6 py-3">Subject Name</th>
                             <th className="px-4 py-3 text-center w-20">L</th>
                             <th className="px-4 py-3 text-center w-20">T</th>
                             <th className="px-4 py-3 text-center w-20">P</th>
                             <th className="px-4 py-3 text-center w-24">Credits</th>
                             <th className="px-6 py-3 text-center w-36">Paper Type</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-100">
                          {(() => {
                             const filtered = viewSubjects
                                .filter(s => s.subjectCode.toUpperCase().includes(subjectSearch.toUpperCase()) || (s.subjectName && s.subjectName.toUpperCase().includes(subjectSearch.toUpperCase())));

                             if (filtered.length === 0) return <tr><td colSpan="7" className="p-8 text-center text-gray-500 font-semibold">No subjects found matching your filters.</td></tr>;

                             return filtered.map(sub => (
                               <tr key={sub.id || sub.subjectCode} className="hover:bg-gray-50/80 items-center">
                                  <td className="px-6 py-4 font-mono font-bold text-indigo-600 tracking-wide">{sub.subjectCode}</td>
                                  <td className="px-6 py-4 text-gray-800 font-semibold">{sub.subjectName}</td>
                                  <td className="px-4 py-4 text-center text-gray-600 font-medium">{sub.l}</td>
                                  <td className="px-4 py-4 text-center text-gray-600 font-medium">{sub.t}</td>
                                  <td className="px-4 py-4 text-center text-gray-600 font-medium">{sub.p}</td>
                                  <td className="px-4 py-4 text-center font-extrabold text-slate-800">{sub.credits}</td>
                                  <td className="px-6 py-4 text-center">
                                     <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm border ${
                                        sub.paperType === "THEORY" 
                                           ? "bg-blue-50 text-blue-700 border-blue-200" 
                                           : sub.paperType === "PRACTICAL" 
                                           ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                           : "bg-purple-50 text-purple-700 border-purple-200"
                                     }`}>
                                        {sub.paperType}
                                     </span>
                                  </td>
                               </tr>
                             ));
                          })()}
                       </tbody>
                    </table>
                 </div>
              </div>
           </motion.div>
        )}

        {/* HALL TICKETS VIEW */}
        {activeTab === "halltickets" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="bg-pink-50 p-6 rounded-xl shadow-sm border border-pink-200">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-pink-800">Automated Hall Ticket Generator</h2>
                    <span className="bg-pink-200 text-pink-800 text-xs font-bold px-3 py-1 rounded shadow-sm">With Arrear Support</span>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div><label className="block text-xs font-bold text-pink-700 uppercase mb-2">Target Dept</label><select value={htDept} onChange={(e) => setHtDept(e.target.value)} className="w-full p-2.5 border border-pink-300 rounded-lg font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-pink-500">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-pink-700 uppercase mb-2">Semester</label><select value={htSem} onChange={(e) => setHtSem(e.target.value)} className="w-full p-2.5 border border-pink-300 rounded-lg font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-pink-500">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{`Semester ${n}`}</option>)}</select></div>
                 </div>
                 <button onClick={handleGenerateHallTickets} disabled={isGeneratingHT} className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors active:scale-95 flex justify-center items-center gap-2 disabled:bg-gray-400">
                    <span>{isGeneratingHT ? "⚙️" : "🖨️"}</span> {isGeneratingHT ? "Generating Tickets..." : "Generate Preview Data"}
                 </button>
              </div>

              {/* ✅ NEW: TOGGLEABLE TEMPLATE BUILDER */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                 <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h3 className="font-bold text-gray-700">Template Builder Settings</h3>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                       <button onClick={() => setHtTemplateMode("STANDARD")} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${htTemplateMode === "STANDARD" ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Standard Template</button>
                       <button onClick={() => setHtTemplateMode("CUSTOM")} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${htTemplateMode === "CUSTOM" ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Custom (.docx)</button>
                    </div>
                 </div>

                 {htTemplateMode === "STANDARD" ? (
                     <div className="space-y-4">
                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Exam Session Header</label><input type="text" value={htSession} onChange={e=>setHtSession(e.target.value)} className="w-full p-2 border border-gray-300 rounded outline-none text-sm font-bold text-gray-700" /></div>
                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Examination Centre Name</label><input type="text" value={htCentre} onChange={e=>setHtCentre(e.target.value)} className="w-full p-2 border border-gray-300 rounded outline-none text-sm font-bold text-gray-700 uppercase" /></div>
                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Instructions / Notes (Bottom Left)</label><textarea value={htNotes} onChange={e=>setHtNotes(e.target.value)} className="w-full p-2 border border-gray-300 rounded outline-none text-sm font-mono h-24" /></div>
                     </div>
                 ) : (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                           <p className="text-sm text-gray-500">Import a custom `.docx` file layout. Use tags like <b>[NAME]</b>, <b>[REGNO]</b>, <b>[SUBJECTS]</b> to auto-fill.</p>
                           <label className="bg-pink-100 text-pink-800 border border-pink-300 font-bold py-2 px-4 rounded-lg cursor-pointer hover:bg-pink-200 transition-colors shadow-sm text-sm">
                              📄 Import .docx
                              <input type="file" accept=".docx" onChange={handleHtDocxUpload} className="hidden" />
                           </label>
                        </div>
                        <textarea value={customHtContent} onChange={e=>setCustomHtContent(e.target.value)} className="w-full p-4 border border-gray-300 rounded outline-none text-sm font-mono h-48 focus:ring-2 focus:ring-pink-500" placeholder="HALL TICKET\n\nName: [NAME]\nRegister No: [REGNO]\n\nSubjects:\n[SUBJECTS]" />
                     </div>
                 )}
              </div>

              {/* Preview Table */}
              {generatedTickets.length > 0 && (
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                       <h3 className="font-bold text-gray-700">Preview: {generatedTickets.length} Students</h3>
                       <div className="flex gap-2">
                          <button onClick={() => exportHallTicketsDocx(generatedTickets, { session: htSession, centre: htCentre, notes: htNotes, sem: htSem }, htDept)} className="bg-blue-600 text-white font-bold py-2 px-4 rounded shadow-sm hover:bg-blue-700 transition-colors">
                             📄 Download All (DOCX)
                          </button>
                          <button onClick={() => window.print()} className="bg-gray-800 text-white font-bold py-2 px-4 rounded shadow-sm hover:bg-gray-900 transition-colors">
                             🖨️ Print All to PDF
                          </button>
                       </div>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                       <table className="w-full text-sm text-left">
                          <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold sticky top-0 z-10">
                             <tr>
                                <th className="px-4 py-3">Register No</th>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3 text-center">Subjects</th>
                                <th className="px-4 py-3 text-center">Arrears</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                             {generatedTickets.map((t, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                   <td className="px-4 py-3 font-mono font-bold text-gray-800">{t.student.registerNumber}</td>
                                   <td className="px-4 py-3 text-gray-600 font-medium">{t.student.name}</td>
                                   <td className="px-4 py-3 text-center font-bold text-blue-600">{t.currentSubjects.length}</td>
                                   <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${t.arrears.length > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{t.arrears.length}</span>
                                   </td>
                                   <td className="px-4 py-3 flex justify-center gap-2">
                                      <button 
                                         onClick={() => printIndividualTicket(t.student.registerNumber)}
                                         className="bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 font-bold py-1 px-3 rounded text-xs transition-colors"
                                      >Print</button>
                                      <button 
                                         onClick={() => exportHallTicketsDocx([t], { session: htSession, centre: htCentre, notes: htNotes, sem: htSem }, htDept)}
                                         className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold py-1 px-3 rounded text-xs transition-colors"
                                      >Docx</button>
                                   </td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>
              )}
           </motion.div>
        )}



        {/* GPA VIEW */}
        {activeTab === "gpa" && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="max-w-4xl mx-auto"><GPACalculator /></div></motion.div>)}
        
        {/* Other Tabs (Setup, Excel, Grid, Process, Manual, Manage) */}
        {activeTab === "setup" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6"> 
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex gap-4 items-end">
              <div className="flex-1"><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Target Department</label><select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md outline-none">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
              <div className="flex-1"><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Target Semester</label><select value={sem} onChange={(e) => setSem(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md outline-none">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map((n) => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><h3 className="font-bold text-lg mb-2 text-gray-700">1. Upload Subjects</h3><input type="file" onChange={handleSubjectUpload} accept=".xlsx, .csv" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-indigo-50 file:text-indigo-700" /></div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><h3 className="font-bold text-lg text-gray-700">2. Upload Logins</h3><div className="mb-2"><select value={uploadRole} onChange={(e) => setUploadRole(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1"><option value="student">Role: STUDENT</option><option value="hod">Role: HOD</option><option value="faculty">Role: FACULTY</option></select></div><input type="file" onChange={handleLoginUpload} accept=".xlsx, .csv" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-indigo-50 file:text-indigo-700" /></div>
              <div className="bg-indigo-50 p-6 rounded-xl shadow-sm border border-indigo-100 col-span-1 md:col-span-2"><h3 className="font-bold text-lg mb-2 text-indigo-800">🎓 Semester Promotion Engine</h3><p className="text-sm text-indigo-600 mb-4">Automatically move all students up one semester. Semester 8 students will be marked as <b>Graduated</b>.</p><button onClick={() => handlePromote(dept, sem)} disabled={loading || Number(sem) === 99} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:bg-gray-400"><span>📈</span> Run Promotion for {dept} Sem {sem}</button></div>
            </div>
          </motion.div>
        )}
        
        {activeTab === "excel" && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex justify-between mb-6"><h2 className="text-lg font-bold text-gray-800">Upload Internal Marks</h2><select value={uploadFormat} onChange={e => setUploadFormat(e.target.value)} className="p-2 border border-blue-300 rounded-lg font-bold text-blue-700 bg-blue-50 outline-none"><option value="EXCEL">📄 Excel / CSV Document</option><option value="SCAN">📸 AI Smart Scan (Image OCR)</option></select></div>
                <div className="grid grid-cols-2 gap-6 mb-6"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Department</label><select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Semester</label><select value={sem} onChange={(e) => setSem(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map((n) => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div></div>
                {uploadFormat === "EXCEL" ? (
                    <><div className="mb-6"><label className="block text-xs font-bold text-gray-500 uppercase mb-3">Select Paper Type</label><div className="flex gap-4"><button onClick={() => fetchSubjects("THEORY")} className="flex-1 py-2 rounded-lg border font-medium text-sm">📘 Theory</button><button onClick={() => fetchSubjects("PRACTICAL")} className="flex-1 py-2 rounded-lg border font-medium text-sm">🧪 Practical</button><button onClick={() => fetchSubjects("INTEGRATED")} className="flex-1 py-2 rounded-lg border font-medium text-sm">🔀 Integrated</button></div></div>
                        {paperType && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Subject</label><select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm">{subjectList.map((s) => <option key={s.subjectCode} value={s.subjectCode}>{s.subjectCode} - {s.subjectName}</option>)}</select></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Internal Excel</label><input type="file" onChange={(e) => setInternalFile(e.target.files[0])} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-indigo-600 file:text-white" accept=".xlsx, .xls, .csv" /></div><button onClick={handleInternalUpload} disabled={loading} className="w-full py-2 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700">🚀 Upload Internals</button></motion.div>)}
                    </>
                ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-blue-50 p-6 rounded-xl border border-blue-200"><h3 className="font-bold text-blue-900 mb-2">📸 Document AI (OCR)</h3><p className="text-sm text-blue-700 mb-4">Upload a clear photo (PNG/JPG) of a physical marksheet. The system will use Optical Character Recognition to extract Register Numbers and Marks automatically.</p><input type="file" onChange={handleSmartScanUpload} accept="image/*" className="block w-full text-sm text-blue-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-600 file:text-white file:font-bold hover:file:bg-blue-700 cursor-pointer" />
                        {showOcrModal && (<div className="mt-6 p-4 bg-white rounded-lg border border-blue-100 shadow-sm"><h4 className="font-bold text-gray-700 mb-2">Raw Scanned Data</h4><textarea value={ocrText} onChange={e => setOcrText(e.target.value)} className="w-full h-40 p-3 border border-gray-300 rounded text-sm font-mono text-gray-600 outline-none focus:border-blue-500" placeholder="Extracted text will appear here. You can manually edit it before saving..." /><div className="mt-4 flex gap-4"><input type="text" placeholder="Subject Code (e.g. CS3452)" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="border p-2 rounded flex-1 outline-none font-bold" /><button onClick={parseOcrDataToDB} className="bg-green-600 text-white font-bold py-2 px-6 rounded shadow-md hover:bg-green-700">Send to Drafts</button></div></div>)}
                    </motion.div>
                )}
            </div>
            {uploadFormat === "EXCEL" && (<div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"><h2 className="text-lg font-bold mb-4 text-gray-800">Upload External Marks (Excel)</h2><p className="text-sm text-gray-500 mb-4">Upload the final university external marks sheet.</p><input type="file" onChange={handleExternalUpload} accept=".xlsx, .csv" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-teal-50 file:text-teal-700" /></div>)}
        </motion.div>)}
        
        {activeTab === "grid" && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-green-50 p-8 rounded-xl shadow-sm border border-green-200">
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-green-800">Live Grid Data Entry</h2><span className="bg-green-200 text-green-800 text-xs font-bold px-3 py-1 rounded shadow-sm">Excel Generator Backend</span></div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div><label className="block text-xs font-bold text-green-700 uppercase mb-2">Target Dept</label><select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-green-500">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-green-700 uppercase mb-2">Semester</label><select value={sem} onChange={(e) => setSem(e.target.value)} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-green-500">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-green-700 uppercase mb-2">Mark Type</label><select value={gridType} onChange={(e) => { setGridType(e.target.value); setGridData([]); }} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-indigo-700 bg-white outline-none focus:ring-2 focus:ring-green-500"><option value="internal">Internal Marks</option><option value="external">External Marks</option></select></div>
                {gridType === "internal" ? (<>
                    <div><label className="block text-xs font-bold text-green-700 uppercase mb-2">Paper Type</label><select value={gridPaperType} onChange={(e) => { setGridPaperType(e.target.value); setGridData([]); }} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-indigo-700 bg-white outline-none focus:ring-2 focus:ring-green-500"><option value="THEORY">📘 Theory</option><option value="PRACTICAL">🧪 Practical</option><option value="INTEGRATED">🔀 Integrated</option></select></div>
                    <div><label className="block text-xs font-bold text-green-700 uppercase mb-2">Template Mode</label><select value={templateMode} onChange={(e) => { setTemplateMode(e.target.value); setGridData([]); setCustomCols([]); }} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-orange-700 bg-white outline-none focus:ring-2 focus:ring-green-500"><option value="STANDARD">📐 Standard Grid</option><option value="CUSTOM">⚙️ Custom Excel</option></select></div>
                  </>) : (<div className="col-span-2"><label className="block text-xs font-bold text-green-700 uppercase mb-2">Subject Code</label><input type="text" placeholder="e.g. CS3452" value={gridSubject} onChange={(e) => setGridSubject(e.target.value.toUpperCase())} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-gray-700 bg-white shadow-sm focus:ring-2 focus:ring-green-500 outline-none" /></div>)}
              </div>
              {gridType === "internal" && (<div className="mb-6"><label className="block text-xs font-bold text-green-700 uppercase mb-2">Select Subject from Database</label><select value={gridSubject} onChange={(e) => setGridSubject(e.target.value)} className="w-full p-2.5 border border-green-300 rounded-lg font-bold text-gray-700 bg-white outline-none focus:ring-2 focus:ring-green-500">{gridSubjectList.length === 0 ? <option value="">No subjects found for this Dept/Sem/Type</option> : gridSubjectList.map(s => <option key={s.subjectCode} value={s.subjectCode}>{s.subjectCode} - {s.subjectName}</option>)}</select></div>)}
              {gridType === "internal" && templateMode === "CUSTOM" && (<div className="mb-6"><label className="block text-xs font-bold text-green-700 uppercase mb-2">Upload Custom Template (Excel)</label><input type="file" onChange={handleCustomTemplateUpload} accept=".xlsx, .xls, .csv" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-green-100 file:text-green-800 font-bold" /><p className="text-xs text-gray-500 mt-2">Upload any Excel sheet. The grid will automatically rebuild itself using your exact headers! (Saved as {gridPaperType} type)</p></div>)}
              <button onClick={fetchStudentsForGrid} disabled={gridType === "internal" && templateMode === "CUSTOM" && customCols.length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors active:scale-95 flex justify-center items-center gap-2 disabled:bg-gray-400"><span>🔄</span> Fetch Roster for Entry</button>
            </div>
            {gridData.length > 0 && (<div className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-lg"><div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center"><h3 className="font-bold text-lg tracking-wide">Entering {gridType === 'internal' ? gridPaperType + ' Internals' : 'Externals'} for {templateMode === "CUSTOM" ? "Custom Document" : gridSubject}</h3><span className="text-sm font-bold bg-indigo-500 px-4 py-1.5 rounded-full">{gridData.length} Students</span></div><div className="max-h-[650px] overflow-auto"><table className="w-full text-sm text-left border-collapse"><thead className="bg-slate-100 text-slate-700 uppercase text-xs font-bold sticky top-0 shadow-sm z-40 whitespace-nowrap">
                      {gridType === "internal" && templateMode === "CUSTOM" && (<tr><th className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[160px] min-w-[160px] sticky left-0 z-50">Register No</th><th className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[250px] min-w-[250px] sticky left-[160px] z-50">Name</th>{customCols.map(c => (<th key={c} className="px-4 py-4 text-center border-b-2 border-r border-slate-300 bg-blue-50 text-blue-900 tracking-wider">{c}</th>))}</tr>)}
                      {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "THEORY" && (<><tr><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[160px] min-w-[160px] sticky left-0 z-50">Register No</th><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[250px] min-w-[250px] sticky left-[160px] z-50">Name</th><th colSpan={7} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-blue-100 text-blue-900 tracking-wider">Unit Test</th><th colSpan={5} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-amber-100 text-amber-900 tracking-wider">Seminar / Case Study</th><th rowSpan={2} className="px-4 py-4 text-center border-b-2 border-slate-300 bg-teal-100 text-teal-900 tracking-wider">Internal I</th></tr><tr><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-1</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-2</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-3</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-4</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-5</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Avg</th><th className="px-2 py-2 text-center border-r border-b-2 border-slate-300 bg-blue-100">UT</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Title</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Dress</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Presenta</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Discus</th><th className="px-2 py-2 text-center border-r border-b-2 border-slate-300 bg-amber-100">Marks</th></tr></>)}
                      {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "PRACTICAL" && (<><tr><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[160px] min-w-[160px] sticky left-0 z-50">Register No</th><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[250px] min-w-[250px] sticky left-[160px] z-50">Name</th><th colSpan={10} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-blue-100 text-blue-900 tracking-wider">Marks for Each Experiment (10)</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">Avg</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">75%</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">25%</th><th rowSpan={2} className="px-4 py-4 text-center border-b-2 border-slate-300 bg-teal-100 text-teal-900 tracking-wider">Int Mark</th></tr><tr><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-1</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-2</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-3</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-4</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-5</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-6</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-7</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-8</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">Ex-9</th><th className="px-2 py-2 text-center border-r border-b-2 border-slate-300 bg-blue-100">Ex-10</th></tr></>)}
                      {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "INTEGRATED" && (<><tr><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[160px] min-w-[160px] sticky left-0 z-50">Register No</th><th rowSpan={2} className="px-6 py-4 border-r border-b-2 border-slate-300 bg-slate-200 w-[250px] min-w-[250px] sticky left-[160px] z-50">Name</th><th colSpan={6} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-blue-100 text-blue-900 tracking-wider">Unit Test</th><th colSpan={5} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-amber-100 text-amber-900 tracking-wider">Seminar / Case Study</th><th rowSpan={2} className="px-4 py-4 text-center border-r border-b-2 border-slate-300 bg-teal-50 text-teal-900 tracking-wider">Int Mar</th><th colSpan={5} className="px-4 py-2 text-center border-b border-r border-slate-300 bg-purple-100 text-purple-900 tracking-wider">Experiments</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">Avg</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">75%</th><th rowSpan={2} className="px-3 py-4 text-center border-r border-b-2 border-slate-300 bg-slate-100">Model</th><th rowSpan={2} className="px-4 py-4 text-center border-b-2 border-slate-300 bg-teal-100 text-teal-900 tracking-wider">Internal</th></tr><tr><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-1</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-2</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-3</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-T</th><th className="px-2 py-2 text-center bg-blue-50 border-r border-b-2 border-slate-300">UT-eq</th><th className="px-2 py-2 text-center border-r border-b-2 border-slate-300 bg-blue-100">UT</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Title</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Dress</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Presenta</th><th className="px-2 py-2 text-center bg-amber-50 border-r border-b-2 border-slate-300">Discus</th><th className="px-2 py-2 text-center border-r border-b-2 border-slate-300 bg-amber-100">Marks</th><th className="px-2 py-2 text-center bg-purple-50 border-r border-b-2 border-slate-300">Ex-1</th><th className="px-2 py-2 text-center bg-purple-50 border-r border-b-2 border-slate-300">Ex-2</th><th className="px-2 py-2 text-center bg-purple-50 border-r border-b-2 border-slate-300">Ex-3</th><th className="px-2 py-2 text-center bg-purple-50 border-r border-b-2 border-slate-300">Ex-4</th><th className="px-2 py-2 text-center bg-purple-50 border-r border-b-2 border-slate-300">Ex-5</th></tr></>)}
                      {gridType === "external" && (<tr><th className="px-6 py-4 border-b-2 border-slate-300 bg-slate-200">Register No</th><th className="px-6 py-4 border-b-2 border-slate-300 bg-slate-200">Name</th><th className="px-6 py-4 text-center border-b-2 border-slate-300 bg-teal-100 text-teal-900 text-base">External Marks (Out of 100)</th></tr>)}
                    </thead><tbody className="divide-y divide-gray-200 whitespace-nowrap">
                      {gridData.map((s, idx) => (
                        <tr key={s.registerNumber} className="hover:bg-indigo-50/50 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-gray-700 border-r sticky left-0 bg-white z-20 w-[160px] min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{s.registerNumber}</td>
                          <td className="px-4 py-3 font-semibold text-gray-800 border-r sticky left-[160px] bg-white z-20 w-[250px] min-w-[250px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-normal leading-tight">{s.name}</td>
                          {gridType === "internal" && templateMode === "CUSTOM" && customCols.map(c => (<td key={c} className="px-2 py-2 text-center border-r"><input type="text" value={s[c] || ""} onChange={(e) => handleGridChange(idx, c, e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td>))}
                          {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "THEORY" && (<><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ut1} onChange={(e) => handleGridChange(idx, "ut1", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ut2} onChange={(e) => handleGridChange(idx, "ut2", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ut3} onChange={(e) => handleGridChange(idx, "ut3", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ut4} onChange={(e) => handleGridChange(idx, "ut4", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ut5} onChange={(e) => handleGridChange(idx, "ut5", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.utAvg} onChange={(e) => handleGridChange(idx, "utAvg", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.utScaled} onChange={(e) => handleGridChange(idx, "utScaled", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="text" value={s.title} onChange={(e) => handleGridChange(idx, "title", e.target.value)} className="w-48 p-2 text-sm border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" placeholder="Seminar Topic..." /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.dress} onChange={(e) => handleGridChange(idx, "dress", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.pres} onChange={(e) => handleGridChange(idx, "pres", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.disc} onChange={(e) => handleGridChange(idx, "disc", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.semMarks} onChange={(e) => handleGridChange(idx, "semMarks", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-3 py-2 text-center"><input type="number" value={s.int1} onChange={(e) => handleGridChange(idx, "int1", e.target.value)} className="w-20 text-center p-2 text-base font-bold border border-teal-400 bg-teal-50 text-teal-900 rounded focus:border-teal-600 focus:ring-2 focus:ring-teal-200 outline-none shadow-inner" /></td></>)}
                          {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "PRACTICAL" && (<><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex1} onChange={(e) => handleGridChange(idx, "ex1", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex2} onChange={(e) => handleGridChange(idx, "ex2", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex3} onChange={(e) => handleGridChange(idx, "ex3", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex4} onChange={(e) => handleGridChange(idx, "ex4", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex5} onChange={(e) => handleGridChange(idx, "ex5", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex6} onChange={(e) => handleGridChange(idx, "ex6", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex7} onChange={(e) => handleGridChange(idx, "ex7", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex8} onChange={(e) => handleGridChange(idx, "ex8", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex9} onChange={(e) => handleGridChange(idx, "ex9", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.ex10} onChange={(e) => handleGridChange(idx, "ex10", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.pAvg} onChange={(e) => handleGridChange(idx, "pAvg", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.p75} onChange={(e) => handleGridChange(idx, "p75", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.p25} onChange={(e) => handleGridChange(idx, "p25", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-3 py-2 text-center"><input type="number" value={s.pInt} onChange={(e) => handleGridChange(idx, "pInt", e.target.value)} className="w-20 text-center p-2 text-base font-bold border border-teal-400 bg-teal-50 text-teal-900 rounded focus:border-teal-600 focus:ring-2 focus:ring-teal-200 outline-none shadow-inner" /></td></>)}
                          {gridType === "internal" && templateMode === "STANDARD" && gridPaperType === "INTEGRATED" && (<><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUt1} onChange={(e) => handleGridChange(idx, "iUt1", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUt2} onChange={(e) => handleGridChange(idx, "iUt2", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUt3} onChange={(e) => handleGridChange(idx, "iUt3", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUtT} onChange={(e) => handleGridChange(idx, "iUtT", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUtEq} onChange={(e) => handleGridChange(idx, "iUtEq", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iUt} onChange={(e) => handleGridChange(idx, "iUt", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="text" value={s.iTitle} onChange={(e) => handleGridChange(idx, "iTitle", e.target.value)} className="w-48 p-2 text-sm border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" placeholder="Topic..." /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iDress} onChange={(e) => handleGridChange(idx, "iDress", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iPres} onChange={(e) => handleGridChange(idx, "iPres", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iDisc} onChange={(e) => handleGridChange(idx, "iDisc", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iSemMarks} onChange={(e) => handleGridChange(idx, "iSemMarks", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iInt75} onChange={(e) => handleGridChange(idx, "iInt75", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded outline-none bg-teal-50 text-teal-800 shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx1} onChange={(e) => handleGridChange(idx, "iEx1", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx2} onChange={(e) => handleGridChange(idx, "iEx2", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx3} onChange={(e) => handleGridChange(idx, "iEx3", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx4} onChange={(e) => handleGridChange(idx, "iEx4", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx5} onChange={(e) => handleGridChange(idx, "iEx5", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iExAvg} onChange={(e) => handleGridChange(idx, "iExAvg", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iEx75} onChange={(e) => handleGridChange(idx, "iEx75", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-2 py-2 text-center border-r"><input type="number" value={s.iModel} onChange={(e) => handleGridChange(idx, "iModel", e.target.value)} className="w-16 text-center p-2 text-sm font-bold border border-gray-300 rounded focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none shadow-inner" /></td><td className="px-3 py-2 text-center"><input type="number" value={s.iIntFinal} onChange={(e) => handleGridChange(idx, "iIntFinal", e.target.value)} className="w-20 text-center p-2 text-base font-bold border border-teal-400 bg-teal-100 text-teal-900 rounded focus:border-teal-600 focus:ring-2 focus:ring-teal-300 outline-none shadow-inner" /></td></>)}
                          {gridType === "external" && (<td className="px-4 py-2 text-center"><input type="number" value={s.extMarks} onChange={(e) => handleGridChange(idx, "extMarks", e.target.value)} className="w-32 text-center p-2 text-base border border-teal-400 bg-teal-50 font-bold rounded focus:border-teal-600 focus:ring-2 focus:ring-teal-200 outline-none shadow-inner" placeholder="0-100" /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-slate-100 border-t border-slate-300 flex justify-end"><button onClick={saveGridData} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-10 rounded-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2 text-lg tracking-wide"><span>{loading ? "Saving..." : "💾 Upload to Server Engine"}</span></button></div>
              </div>
            )}
          </motion.div>
        )}

        {/* 4. PROCESS TAB */}
        {activeTab === "process" && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6"><div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"><div><h3 className="font-bold text-xl text-indigo-800">Run Calculation Engine</h3><p className="text-sm text-gray-500 mt-1">Merges Internal + External marks from the database into final Grades.</p></div><button onClick={handleCalculate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-lg font-bold shadow-lg transition-transform active:scale-95">⚙️ Calculate Results</button></div><div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><h4 className="font-bold text-gray-700 mb-3 text-sm uppercase">Preview & Publish</h4><div className="flex flex-wrap gap-4 items-center mb-4"><div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-500">Dept:</span><select value={calcDept} onChange={(e) => setCalcDept(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm font-bold w-24 outline-none">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-500">Sem:</span><select value={calcSem} onChange={(e) => setCalcSem(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm font-bold w-24 outline-none">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div><button onClick={() => handlePreview(calcSem, calcDept)} disabled={loadingPreview} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded border border-gray-300 text-sm font-medium transition-colors">{loadingPreview ? "Loading..." : "Check Drafts"}</button>{previewData.length > 0 && (<div className="flex gap-2 ml-auto"><button onClick={handleDownload} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-bold shadow-md flex items-center gap-2"><span>📥</span> Download Draft</button><button onClick={() => handlePublish(calcSem, calcDept)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold shadow-md flex items-center gap-2"><span>🚀</span> Publish Live</button></div>)}</div>{previewData.length > 0 && (<div className="overflow-hidden border border-gray-200 rounded-lg"><div className="max-h-[500px] overflow-y-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold sticky top-0 shadow-sm z-10"><tr><th className="px-4 py-3 bg-gray-50">Register No</th><th className="px-4 py-3 bg-gray-50">Subject</th><th className="px-4 py-3 text-center bg-gray-50">Marks</th><th className="px-4 py-3 text-center bg-gray-50">Grade</th><th className="px-4 py-3 text-center bg-gray-50">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{previewData.map((r, i) => (<tr key={i} className="hover:bg-gray-50"><td className="px-4 py-2 font-mono text-gray-600">{r.registerNumber}</td><td className="px-4 py-2">{r.subjectCode}</td><td className="px-4 py-2 text-center">{r.finalMarks}</td><td className="px-4 py-2 text-center font-bold text-blue-600">{r.grade}</td><td className="px-4 py-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${r.result === "PASS" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{r.result}</span></td></tr>))}</tbody></table></div></div>)}</div></motion.div>)}
        
        {/* 5. MANUAL OVERRIDE */}
        {activeTab === "manual" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
             <div className="bg-orange-50 p-8 rounded-xl shadow-sm border border-orange-200">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold text-orange-800">Manual Result Override</h2>
                 <select value={manualUploadFormat} onChange={e => setManualUploadFormat(e.target.value)} className="p-2 border border-orange-300 rounded-lg font-bold text-orange-700 bg-white outline-none">
                     <option value="EXCEL">📄 Excel / CSV Document</option>
                     <option value="PDF">📑 Native PDF (Whole Semester)</option>
                     <option value="SCAN">📸 AI Smart Scan (Image OCR)</option>
                 </select>
               </div>
               
               <div className="grid grid-cols-2 gap-6 mb-6">
                 <div><label className="block text-xs font-bold text-orange-700 uppercase mb-2">Target Department</label><select value={manualDept} onChange={(e) => setManualDept(e.target.value)} className="w-full p-3 border border-orange-300 rounded-lg font-bold text-gray-700 bg-white">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                 <div><label className="block text-xs font-bold text-orange-700 uppercase mb-2">Target Semester</label><select value={manualSem} onChange={(e) => setManualSem(e.target.value)} className="w-full p-3 border border-orange-300 rounded-lg font-bold text-gray-700 bg-white">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div>
               </div>
               
               {manualUploadFormat === "EXCEL" && (
                   <div className="bg-white p-6 rounded-lg border border-orange-100 mb-6"><label className="block text-sm font-bold text-gray-600 mb-3">Upload Final Grade Sheet (Excel/CSV)</label><input type="file" onChange={(e) => {
                      const file = e.target.files[0]; if (!file) return; const currentDept = manualDeptRef.current; const currentSem = String(manualSemRef.current);
                      readFirstSheet(file, (rows) => {
                        if (rows.length === 0) return; const firstRow = normalizeRowKeys(rows[0]); const isVertical = !!(firstRow.subject || firstRow.subjectcode || firstRow.code); let finalPayload = [];
                        if (isVertical) { finalPayload = rows.map((r) => { const n = normalizeRowKeys(r); return { registerNumber: n.registerNumber || n.rollno || "", subjectCode: n.subjectcode || n.subject || "", semester: currentSem, grade: n.grade || "", result: n.result || "", mark: "0", department: currentDept }; }); } else { finalPayload = rows.flatMap((r) => { const n = normalizeRowKeys(r); const regNo = n.registerNumber || n.rollno; if (!regNo) return []; const ignoreKeys = ["registernumber", "rollno", "name", "sno", "serialno", "department", "semester", "dob", "password"]; return Object.keys(r).map(k => { const lowerKey = k.toLowerCase().trim().replace(/[^a-z0-9]/g, ""); if (ignoreKeys.includes(lowerKey)) return null; const gradeVal = String(r[k]).trim(); if (!gradeVal) return null; return { registerNumber: regNo, subjectCode: k.trim(), semester: currentSem, grade: gradeVal, result: ["U", "RA", "AB", "FAIL", "F", "ABSENT", "WH", "SA"].includes(gradeVal.toUpperCase()) ? "FAIL" : "PASS", mark: "0", department: currentDept }; }).filter(item => item !== null); }); }
                        const validData = finalPayload.filter(x => x.registerNumber && x.subjectCode); if (validData.length === 0) { setMessage("⚠️ No valid data found."); return; } if(!confirm(`📢 MANUAL UPLOAD:\nTarget Dept: ${currentDept}\nTarget Sem: ${currentSem}\nRows Found: ${validData.length}\nClick OK to Upload.`)) return; apiPost("/api/import/results", validData).then((success) => { if(success) setTimeout(() => handlePreview(currentSem, currentDept), 1500); });
                      });
                   }} accept=".xlsx, .csv" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:font-bold file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer" /></div>
               )}

               {manualUploadFormat === "PDF" && (
                   <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-purple-50 p-6 rounded-xl border border-purple-200 mb-6">
                        <h3 className="font-bold text-purple-900 mb-2">📑 Native PDF Extractor</h3>
                        <p className="text-sm text-purple-700 mb-4">Upload the official whole-semester PDF from the University. The system will automatically map every student's row to the correct subject columns at the top of the page!</p>
                        <input type="file" onChange={handleManualPDFUpload} accept="application/pdf" className="block w-full text-sm text-purple-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-purple-600 file:text-white file:font-bold hover:file:bg-purple-700 cursor-pointer" />
                   </motion.div>
               )}

               {manualUploadFormat === "SCAN" && (
                   <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-orange-100/50 p-6 rounded-xl border border-orange-200 mb-6">
                        <h3 className="font-bold text-orange-900 mb-2">📸 Document AI (OCR) for Final Grades</h3>
                        <p className="text-sm text-orange-700 mb-4">Upload a scanned image (PNG/JPG) of the final result sheet (e.g. mobile screenshot). The AI will extract Register Numbers and Letter Grades (O, A+, B, U, etc.) automatically.</p>
                        <input type="file" onChange={handleManualSmartScanUpload} accept="image/*" className="block w-full text-sm text-orange-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-orange-600 file:text-white file:font-bold hover:file:bg-orange-700 cursor-pointer" />
                        
                        {showManualOcrModal && (
                            <div className="mt-6 p-4 bg-white rounded-lg border border-orange-200 shadow-sm">
                                <h4 className="font-bold text-gray-700 mb-2">Raw Scanned Data</h4>
                                <textarea value={manualOcrText} onChange={e => setManualOcrText(e.target.value)} className="w-full h-40 p-3 border border-gray-300 rounded text-sm font-mono text-gray-600 outline-none focus:border-orange-500" placeholder="Extracted text will appear here. You can manually edit it before saving..." />
                                <div className="mt-4 flex gap-4">
                                    <input type="text" placeholder="Subject Code (For Horizontal rows only)" value={manualOcrSubject} onChange={e => setManualOcrSubject(e.target.value)} className="border p-2 rounded flex-1 outline-none font-bold" />
                                    <button onClick={parseManualOcrDataToDB} className="bg-green-600 text-white font-bold py-2 px-6 rounded shadow-md hover:bg-green-700">Send to Drafts</button>
                                </div>
                            </div>
                        )}
                   </motion.div>
               )}
               
               <div className="flex gap-4">
                 <button onClick={() => handlePreview(manualSem, manualDept)} className="flex-1 bg-white border border-orange-300 text-orange-700 font-bold py-3 rounded-lg hover:bg-orange-50 transition-colors shadow-sm">2. Check Drafts</button>
                 <button onClick={() => handleDropDrafts(manualSem, manualDept)} className="flex-1 bg-red-100 border border-red-300 text-red-700 font-bold py-3 rounded-lg hover:bg-red-200 transition-colors shadow-sm">3. Drop Results</button>
                 <button onClick={() => handlePublish(manualSem, manualDept)} className="flex-1 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 shadow-md transition-colors">4. Publish Live 🚀</button>
               </div>
             </div>
             {previewData.length > 0 && (<div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h3 className="font-bold text-gray-700">Draft Results Preview</h3><button onClick={handleDownload} className="text-indigo-600 text-sm font-bold hover:underline">Download Excel</button></div><div className="max-h-[500px] overflow-y-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold sticky top-0"><tr><th className="px-4 py-3">Register No</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3 text-center">Grade</th><th className="px-4 py-3 text-center">Result</th></tr></thead><tbody className="divide-y divide-gray-100">{previewData.map((r, i) => (<tr key={i} className="hover:bg-gray-50"><td className="px-4 py-2 font-mono">{r.registerNumber}</td><td className="px-4 py-2">{r.subjectCode}</td><td className="px-4 py-2 text-center font-bold text-blue-600">{r.grade}</td><td className="px-4 py-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${r.result === "PASS" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{r.result}</span></td></tr>))}</tbody></table></div></div>)}
          </motion.div>
        )}

        {/* 6. MANAGE LIVE */}
        {activeTab === "manage" && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6"><div className="bg-red-50 p-8 rounded-xl shadow-sm border border-red-200"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-red-800">Manage Published Results</h2><span className="bg-red-200 text-red-800 text-xs font-bold px-3 py-1 rounded-full shadow-sm">Live Mode</span></div><p className="text-red-700 text-sm mb-6 font-medium">Use this section to completely remove results that are currently visible to Students and HODs.</p><div className="grid grid-cols-2 gap-6 mb-8"><div><label className="block text-xs font-bold text-red-700 uppercase mb-2">Target Department</label><select value={calcDept} onChange={(e) => setCalcDept(e.target.value)} className="w-full p-3 border border-red-300 rounded-lg font-bold text-gray-700 bg-white outline-none">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div><label className="block text-xs font-bold text-red-700 uppercase mb-2">Target Semester</label><select value={calcSem} onChange={(e) => setCalcSem(e.target.value)} className="w-full p-3 border border-red-300 rounded-lg font-bold text-gray-700 bg-white outline-none">{[1, 2, 3, 4, 5, 6, 7, 8, 99].map(n => <option key={n} value={n}>{n === 99 ? "Graduated 🎓" : `Semester ${n}`}</option>)}</select></div></div><button onClick={() => handleUnpublishLive(calcSem, calcDept)} className="w-full bg-red-600 text-white font-bold py-4 rounded-lg hover:bg-red-700 shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 text-lg"><span>🚨</span> Unpublish & Drop Live Results</button></div></motion.div>)}
        
        {/* 7. ADMIN QUESTION PAPERS BANK & REQUISITIONS */}
        {activeTab === "qpapers" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            
            {/* SUB-TABS FOR ADMIN */}
            <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
              <button onClick={() => setQPaperSubTab("bank")} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${qPaperSubTab === "bank" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Paper Bank</button>
              <button onClick={() => setQPaperSubTab("reqs")} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${qPaperSubTab === "reqs" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Requisitions</button>
            </div>

            {qPaperSubTab === "bank" && (
              <div className="bg-purple-50 p-8 rounded-xl shadow-sm border border-purple-200">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-purple-800">Completed Question Papers</h2>
                  <button onClick={() => setActiveTab("setup")} className="bg-purple-200 text-purple-800 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-purple-300">🔄 Refresh</button>
                </div>
                
                {savedPapers.length === 0 ? (
                   <div className="text-center p-10 bg-white rounded-xl border border-dashed border-purple-300 text-purple-500 font-medium">No question papers have been generated by faculty yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-purple-100 text-purple-800 uppercase text-xs font-bold">
                        <tr>
                          <th className="px-4 py-3">Subject</th>
                          <th className="px-4 py-3">Dept</th>
                          <th className="px-4 py-3">Session</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Faculty Name</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50 bg-white">
                        {savedPapers.map(paper => (
                          <tr key={paper.id} className="hover:bg-purple-50/50">
                            <td className="px-4 py-3 font-bold text-gray-800">{paper.subjectCode}</td>
                            <td className="px-4 py-3 text-gray-600">{paper.department}</td>
                            <td className="px-4 py-3 text-gray-600">{paper.examSession}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${paper.examType === 'UNIT_TEST' ? 'bg-teal-100 text-teal-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                {paper.examType === 'UNIT_TEST' ? "UNIT TEST" : "SEMESTER"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-800 font-medium">{paper.facultyName || "Unknown"}</td>
                            <td className="px-4 py-3 flex justify-center gap-2">
                               <button onClick={() => {
                                  if (paper.examType === "UNIT_TEST") exportUnitTestPaperDocx(JSON.parse(paper.paperData));
                                  else exportSemesterPaperDocx(JSON.parse(paper.paperData), paper.hasPartC);
                               }} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors">Download</button>
                               <button onClick={() => handleDeletePaper(paper.id)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold py-1.5 px-3 rounded text-xs transition-colors" title="Delete Paper">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* REQUISITIONS TAB */}
            {qPaperSubTab === "reqs" && (
              <div className="space-y-6">
                 {/* Create Request Form */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-100">
                    <h3 className="text-lg font-bold text-purple-800 mb-4">Send New Requisition</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Dept</label><select value={reqDept} onChange={e=>setReqDept(e.target.value)} className="w-full p-2 border rounded outline-none">{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sem</label><select value={reqSem} onChange={e=>setReqSem(e.target.value)} className="w-full p-2 border rounded outline-none">{[1,2,3,4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></div>
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label><select value={reqType} onChange={e=>setReqType(e.target.value)} className="w-full p-2 border rounded outline-none"><option value="SEMESTER">Semester</option></select></div>
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subject Code</label><input type="text" value={reqSubject} onChange={e=>setReqSubject(e.target.value)} placeholder="e.g. CS3452" className="w-full p-2 border rounded outline-none font-bold text-purple-700" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Course Title</label><input type="text" value={reqTitle} onChange={e=>setReqTitle(e.target.value)} placeholder="e.g. Theory of Computation" className="w-full p-2 border rounded outline-none" /></div>
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Appt Letter No.</label><input type="text" value={reqApptNo} onChange={e=>setReqApptNo(e.target.value)} placeholder="e.g. SPCET/COE/AM26/11" className="w-full p-2 border rounded outline-none" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Target Faculty ID</label><input type="text" value={reqFaculty} onChange={e=>setReqFaculty(e.target.value)} placeholder="e.g. 1127001" className="w-full p-2 border rounded outline-none" /></div>
                       <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Deadline</label><input type="date" value={reqDeadline} onChange={e=>setReqDeadline(e.target.value)} className="w-full p-2 border rounded outline-none" /></div>
                    </div>
                    <button onClick={handleCreateRequisition} className="bg-purple-600 text-white font-bold py-2 px-6 rounded shadow-md hover:bg-purple-700">Send Request</button>
                 </div>

                 {/* Tracking Table */}
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50"><h3 className="font-bold text-gray-700">Requisition Tracking</h3></div>
                    <div className="overflow-x-auto">
                       <table className="w-full text-sm text-left">
                          <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                             <tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Dept/Sem</th><th className="px-4 py-3">Faculty ID</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Action</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                             {requisitions.length === 0 ? <tr><td colSpan="5" className="text-center py-4 text-gray-400 font-medium">No requisitions sent yet.</td></tr> : 
                                requisitions.map((r, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                     <td className="px-4 py-3 font-bold text-gray-800">{r.subjectCode} <span className="text-[10px] bg-gray-200 px-1 rounded font-normal">{r.examType}</span></td>
                                     <td className="px-4 py-3 text-gray-600">{r.department} - Sem {r.semester}</td>
                                     <td className="px-4 py-3 font-mono text-gray-600">{r.facultyId}</td>
                                     <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider 
                                          ${r.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 
                                            r.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 
                                            r.status === 'SUBMITTED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                          {r.status}
                                        </span>
                                     </td>
                                     <td className="px-4 py-3 flex justify-center gap-2">
                                        {r.status === 'SUBMITTED' && (
                                           <>
                                             <button onClick={() => setViewingClaim(r)} className="text-xs bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded hover:bg-indigo-200">View Claim</button>
                                             <button onClick={() => exportClaimFormDocx(r)} className="text-xs bg-green-100 text-green-700 font-bold px-3 py-1.5 rounded hover:bg-green-200">Download Docx</button>
                                           </>
                                        )}
                                     </td>
                                  </tr>
                                ))
                             }
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
            )}

            {/* View Claim Modal for Admin */}
            {viewingClaim && (
               <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 relative">
                     <button onClick={() => setViewingClaim(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 font-bold text-xl">✕</button>
                     <h2 className="text-xl font-bold text-indigo-800 mb-2 border-b pb-2">Official Claim Form Details</h2>
                     
                     <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Appt. Letter No.</p><p className="font-medium text-gray-800">{viewingClaim.appointmentLetterNo}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">College Name & Code</p><p className="font-medium text-gray-800">{viewingClaim.collegeNameCode || "-"}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Faculty Name</p><p className="font-medium text-gray-800">{viewingClaim.facultyName}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Designation</p><p className="font-medium text-gray-800">{viewingClaim.designation}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">AICTE / Anna Univ ID</p><p className="font-medium text-gray-800">{viewingClaim.aicteId}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">PAN Number</p><p className="font-medium text-gray-800">{viewingClaim.pan}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">QP Dept</p><p className="font-medium text-gray-800">{viewingClaim.qpDept || "-"}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Examiner Dept</p><p className="font-medium text-gray-800">{viewingClaim.examinerDept || "-"}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Mobile Number</p><p className="font-medium text-gray-800">{viewingClaim.mobile || "-"}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Email ID</p><p className="font-medium text-gray-800">{viewingClaim.email || "-"}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Semester & Regulation</p><p className="font-medium text-gray-800">{viewingClaim.semesterAndReg || "-"}</p></div>
                        <div className="col-span-2"><p className="text-xs font-bold text-gray-500 uppercase">College Address</p><p className="font-medium text-gray-800">{viewingClaim.address}</p></div>
                     </div>
                     
                     <h3 className="text-md font-bold text-indigo-800 mt-6 mb-2 border-b pb-2">Remuneration</h3>
                     <div className="bg-gray-50 p-4 rounded border text-sm">
                        <div className="flex justify-between mb-2"><span>Question Paper Type</span><span className="font-bold text-indigo-700">{viewingClaim.qpType || "-"}</span></div>
                        <div className="flex justify-between mb-2"><span>Amount Claimed (Manually Entered)</span><span className="font-bold">Rs. {viewingClaim.amountClaimed || "0"}</span></div>
                        <div className="flex justify-between border-t pt-2 mt-2 font-bold text-lg text-green-700"><span>Calculated Total Amount</span><span>Rs. {viewingClaim.totalAmount}</span></div>
                        <div className="mt-3 text-xs text-green-700 font-bold bg-green-100 inline-block px-2 py-1 rounded">
                           {viewingClaim.mailedConfirmation ? "✅ Confirmed: Mailed to coeqp@spcet.ac.in" : "❌ Not Mailed"}
                        </div>
                     </div>
                     
                     <h3 className="text-md font-bold text-indigo-800 mt-6 mb-2 border-b pb-2">Bank Details</h3>
                     <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Account Number</p><p className="font-mono text-lg font-bold text-gray-800">{viewingClaim.accountNo}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">IFSC Code</p><p className="font-mono font-bold text-gray-800">{viewingClaim.ifsc}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Bank Name</p><p className="font-medium text-gray-800">{viewingClaim.bankName}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Branch</p><p className="font-medium text-gray-800">{viewingClaim.branchName}</p></div>
                     </div>
                  </div>
               </div>
            )}

          </motion.div>
        )}

        {activeTab === "settings" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-6">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                 <h2 className="text-xl font-bold text-gray-800 mb-2">Change Admin Password</h2>
                 <p className="text-sm text-gray-500 mb-6">Modify the password used to access the administrator dashboard.</p>
                 
                 {settingsError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 mb-4">
                       ⚠️ {settingsError}
                    </div>
                 )}
                 {settingsSuccess && (
                    <div className="p-3 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-200 mb-4">
                       {settingsSuccess}
                    </div>
                 )}
                 
                 <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Password *</label>
                       <input 
                          type="password" 
                          value={currentPassword} 
                          onChange={e => setCurrentPassword(e.target.value)} 
                          className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm" 
                          placeholder="••••••••"
                          required
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password *</label>
                       <input 
                          type="password" 
                          value={newPassword} 
                          onChange={e => setNewPassword(e.target.value)} 
                          className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm" 
                          placeholder="••••••••"
                          required
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm New Password *</label>
                       <input 
                          type="password" 
                          value={confirmPassword} 
                          onChange={e => setConfirmPassword(e.target.value)} 
                          className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-sm" 
                          placeholder="••••••••"
                          required
                       />
                    </div>
                    <button 
                       type="submit" 
                       disabled={loading} 
                       className="w-full py-3 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors shadow-md mt-2 flex justify-center items-center"
                    >
                       {loading ? "Updating..." : "Update Password"}
                    </button>
                 </form>
              </div>
           </motion.div>
         )}

           </>
        )}

      </main>
    </div>
  );
}