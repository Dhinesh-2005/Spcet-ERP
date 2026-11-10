import re
import openpyxl
from io import BytesIO
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from app.database import db, clean_doc, clean_docs
from app.models.schemas import (
    SaveFacultyMarksPayload,
    MarkHistoryModel,
    ExcelUploadValidationError,
    ExcelValidationPreviewResponse,
    ConfirmMarksUploadPayload,
    AcademicRuleConfigModel
)
from app.services.calculation_engine import calculation_engine
from app.services.audit_service import audit_service
from app.services.security_service import security_service

router = APIRouter()

def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()

async def verify_faculty_access(faculty_id: str, subject_code: str) -> bool:
    """
    Strict authorization check: Faculty must be assigned to subjectCode in db.faculty_subject_access.
    Admin / HOD bypass is permitted if faculty_id is 'ADMIN' or 'HOD'.
    """
    fid = (faculty_id or "").strip()
    sub = (subject_code or "").strip().upper()
    if not fid or not sub:
        return False
    if fid.upper() in {"ADMIN", "HOD"}:
        return True

    access_doc = await db.faculty_subject_access.find_one({"facultyId": fid})
    if not access_doc:
        return False

    assigned_codes = [c.upper() for c in access_doc.get("subjectCodes", [])]
    return sub in assigned_codes

async def get_subject_type_and_config(subject_code: str, semester: int) -> tuple[str, AcademicRuleConfigModel]:
    """
    Returns (subject_type, AcademicRuleConfigModel) for a given subject and semester.
    """
    sub_code = (subject_code or "").strip().upper()
    ss_doc = await db.student_subjects.find_one({
        "subjectCode": sub_code,
        "$or": [{"subjectSemester": semester}, {"semester": semester}, {"subjectSemester": str(semester)}, {"semester": str(semester)}]
    })
    sub_doc = await db.subjects.find_one({"subjectCode": sub_code})
    dept = (sub_doc.get("department") if sub_doc else None) or (ss_doc.get("department") if ss_doc else "ALL")

    raw_type = (
        (sub_doc.get("subjectType") if sub_doc else None)
        or (sub_doc.get("paperType") if sub_doc else None)
        or (ss_doc.get("paperType") if ss_doc else None)
        or (ss_doc.get("subjectType") if ss_doc else None)
        or "THEORY"
    )
    raw_type = str(raw_type).upper()
    if "PRAC" in raw_type or "LAB" in raw_type:
        st = "PRACTICAL"
    elif "INTEG" in raw_type:
        st = "INTEGRATED"
    else:
        st = "THEORY"

    config_doc = await db.academic_configs.find_one({"department": dept, "semester": semester})
    if not config_doc and dept != "ALL":
        config_doc = await db.academic_configs.find_one({"department": "ALL", "semester": semester})
    if not config_doc:
        config_doc = await db.academic_configs.find_one({"isDefault": True})

    cfg = AcademicRuleConfigModel(**config_doc) if config_doc else calculation_engine.get_default_config()
    return st, cfg

# ─────────────────────────────────────────────────────────────────────────────
# 1. FACULTY ASSIGNED SUBJECTS (Strict Permission Enforcement)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-subjects")
async def get_faculty_assigned_subjects(facultyId: str = Query(...)):
    fac_id = facultyId.strip()
    if not fac_id:
        raise HTTPException(status_code=400, detail="Faculty ID is required.")

    # Admin / HOD sees all or departmental
    is_admin = fac_id.upper() in {"ADMIN", "HOD"}
    fac = await db.faculties.find_one({"registerNumber": fac_id})
    dept = fac.get("department", "").strip().upper() if fac else ""

    result = []
    seen_keys = set()

    if not is_admin:
        access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
        if not access_doc:
            return []  # Strict: Unassigned faculty sees NOTHING

        assignments = access_doc.get("assignments") or []
        if assignments:
            for a in assignments:
                sub_code = str(a.get("subjectCode", "")).strip().upper()
                if not sub_code:
                    continue
                sem = int(a.get("semester") or 1)
                sub_dept = str(a.get("studentDepartment") or access_doc.get("department") or dept).strip().upper()
                reg = str(a.get("regulation") or "2021").strip().upper()
                ay = str(a.get("academicYear") or "2025-2026").strip()

                dedup_key = (sub_code, sem, sub_dept)
                if dedup_key in seen_keys:
                    continue
                seen_keys.add(dedup_key)

                # Look up subject metadata from student_subjects or subjects master
                ss_sample = await db.student_subjects.find_one({
                    "subjectCode": sub_code,
                    "$or": [{"subjectSemester": sem}, {"semester": sem}, {"subjectSemester": str(sem)}, {"semester": str(sem)}]
                })
                sub_master = await db.subjects.find_one({"subjectCode": sub_code})

                sub_name = a.get("subjectName") or (ss_sample.get("subjectName") if ss_sample else None) or (sub_master.get("subjectName") if sub_master else sub_code)
                credits_val = float(a.get("credits") or (ss_sample.get("credits") if ss_sample else None) or (sub_master.get("credits") if sub_master else 3.0))

                raw_type = (
                    (sub_master.get("subjectType") if sub_master else None)
                    or (sub_master.get("paperType") if sub_master else None)
                    or (ss_sample.get("paperType") if ss_sample else None)
                    or (ss_sample.get("subjectType") if ss_sample else None)
                    or "THEORY"
                )
                raw_type = str(raw_type).upper()
                if "PRAC" in raw_type or "LAB" in raw_type:
                    st_val = "PRACTICAL"
                elif "INTEG" in raw_type:
                    st_val = "INTEGRATED"
                else:
                    st_val = "THEORY"

                # Count enrolled students
                specific_count = await db.student_subjects.count_documents({
                    "subjectCode": sub_code,
                    "$or": [{"subjectSemester": sem}, {"semester": sem}, {"subjectSemester": str(sem)}, {"semester": str(sem)}]
                })
                regular_count = await db.students.count_documents({
                    "department": sub_dept,
                    "$or": [{"semester": sem}, {"semester": str(sem)}]
                }) if sub_dept and sub_dept != "ALL" else 0
                total_students = max(specific_count, regular_count)

                status_doc = await db.internal_marks.find_one({
                    "subjectCode": sub_code,
                    "$or": [{"semester": sem}, {"semester": str(sem)}]
                })
                status = status_doc.get("status", "NOT_STARTED") if status_doc else "NOT_STARTED"

                result.append({
                    "subjectCode": sub_code,
                    "subjectName": sub_name,
                    "department": sub_dept,
                    "semester": sem,
                    "regulation": reg,
                    "academicYear": ay,
                    "credits": credits_val,
                    "subjectType": st_val,
                    "paperType": st_val,
                    "totalStudents": total_students,
                    "status": status,
                    "isAssigned": True
                })
            return result

        assigned_codes = access_doc.get("subjectCodes", [])
        if not assigned_codes:
            return []  # Strict: Unassigned faculty sees NOTHING

        cursor = db.subjects.find({"subjectCode": {"$in": assigned_codes}}).sort("subjectCode", 1)
        subjects = [clean_doc(s) async for s in cursor]
    else:
        cursor = db.subjects.find({}).sort("subjectCode", 1)
        subjects = [clean_doc(s) async for s in cursor]

    for s in subjects:
        sub_code = s.get("subjectCode")
        sem = int(s.get("semester") or 1)
        sub_dept = s.get("department", dept)

        dedup_key = (sub_code, sem, sub_dept)
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        st_val = (s.get("subjectType") or s.get("paperType") or "THEORY").strip().upper()
        if "PRAC" in st_val or "LAB" in st_val:
            st_val = "PRACTICAL"
        elif "INTEG" in st_val:
            st_val = "INTEGRATED"
        else:
            st_val = "THEORY"

        regular_count = await db.students.count_documents({
            "department": sub_dept,
            "$or": [{"semester": sem}, {"semester": str(sem)}]
        }) if sub_dept and sub_dept != "ALL" else 0
        specific_count = await db.student_subjects.count_documents({
            "subjectCode": sub_code,
            "$or": [{"subjectSemester": sem}, {"semester": sem}, {"subjectSemester": str(sem)}, {"semester": str(sem)}]
        })
        total_students = max(regular_count, specific_count)

        status_doc = await db.internal_marks.find_one({
            "subjectCode": sub_code,
            "$or": [{"semester": sem}, {"semester": str(sem)}]
        })
        status = status_doc.get("status", "NOT_STARTED") if status_doc else "NOT_STARTED"

        result.append({
            "subjectCode": sub_code,
            "subjectName": s.get("subjectName", ""),
            "department": sub_dept,
            "semester": sem,
            "credits": s.get("credits", 3),
            "subjectType": st_val,
            "paperType": st_val,
            "totalStudents": total_students,
            "status": status,
            "isAssigned": True
        })

    return result

# ─────────────────────────────────────────────────────────────────────────────
# 2. STUDENTS FOR ASSIGNED SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/subject-students")
async def get_students_for_subject(
    facultyId: str = Query(...),
    subjectCode: str = Query(...),
    semester: int = Query(...),
    studentDepartment: Optional[str] = Query(None)
):
    fac_id = facultyId.strip()
    sub_code = subjectCode.strip().upper()

    if not await verify_faculty_access(fac_id, sub_code):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Faculty '{fac_id}' is not authorized to access subject '{sub_code}'."
        )

    # Resolve target department from query, assignment, or subject master
    target_dept = (studentDepartment.strip().upper()) if (isinstance(studentDepartment, str) and studentDepartment.strip()) else ""
    if not target_dept or target_dept == "ALL":
        access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
        if access_doc and access_doc.get("assignments"):
            for a in access_doc.get("assignments"):
                if a.get("subjectCode", "").upper() == sub_code and int(a.get("semester") or 1) == int(semester):
                    target_dept = (a.get("studentDepartment") or "").strip().upper()
                    break

    subject = await db.subjects.find_one({"subjectCode": sub_code})
    dept = target_dept or (subject.get("department", "") if subject else "")
    st_val, cfg = await get_subject_type_and_config(sub_code, semester)

    # 1. Look for enrolled students in student_subjects first
    # Query supports both subjectSemester and semester as int and string
    sem_filter = [
        {"subjectSemester": semester},
        {"semester": semester},
        {"subjectSemester": str(semester)},
        {"semester": str(semester)}
    ]
    query_ss = {"subjectCode": sub_code, "$or": sem_filter}
    if target_dept and target_dept != "ALL":
        dept_match_cnt = await db.student_subjects.count_documents({**query_ss, "department": target_dept})
        if dept_match_cnt > 0:
            query_ss["department"] = target_dept

    enrolled_cur = db.student_subjects.find(query_ss)
    enrolled_docs = [clean_doc(d) async for d in enrolled_cur]
    enrolled_regs = [d["registerNumber"] for d in enrolled_docs if d.get("registerNumber")]

    students = []
    if enrolled_regs:
        st_cursor = db.students.find({"registerNumber": {"$in": enrolled_regs}}).sort("registerNumber", 1)
        db_students = {st["registerNumber"]: clean_doc(st) async for st in st_cursor}
        seen_r = set()
        for d in enrolled_docs:
            reg = d.get("registerNumber")
            if not reg or reg in seen_r:
                continue
            seen_r.add(reg)
            matched_st = db_students.get(reg)
            students.append({
                "registerNumber": reg,
                "name": (matched_st.get("name") if matched_st else None) or d.get("studentName") or f"Student {reg}",
                "department": (matched_st.get("department") if matched_st else None) or d.get("department", dept),
                "semester": (matched_st.get("semester") if matched_st else None) or semester
            })

    # 2. If no student_subjects mapped yet, query students by department and semester
    if not students and dept and dept != "ALL":
        students = [clean_doc(st) async for st in db.students.find({
            "department": dept,
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        }).sort("registerNumber", 1)]

    # 3. Fallback to any students enrolled in that semester
    if not students:
        students = [clean_doc(st) async for st in db.students.find({
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        }).sort("registerNumber", 1)]

    existing_marks = [clean_doc(m) async for m in db.internal_marks.find({
        "subjectCode": sub_code,
        "$or": [{"semester": semester}, {"semester": str(semester)}]
    })]
    marks_by_reg = {m["registerNumber"]: m for m in existing_marks}

    sample_mark = existing_marks[0] if existing_marks else None
    overall_status = sample_mark.get("status", "DRAFT") if sample_mark else "DRAFT"

    student_list = []
    seen_regs = set()
    for st in students:
        reg_no = st.get("registerNumber")
        if not reg_no or reg_no in seen_regs:
            continue
        seen_regs.add(reg_no)

        saved = marks_by_reg.get(reg_no, {})
        comp_marks = saved.get("componentMarks", {})

        student_list.append({
            "registerNumber": reg_no,
            "name": st.get("name", ""),
            "department": st.get("department", dept),
            "componentMarks": comp_marks,
            "finalInternal": saved.get("finalInternal", 0.0),
            "status": saved.get("status", "DRAFT")
        })

    configured_exercises = None
    if st_val in ("PRACTICAL", "INTEGRATED"):
        p_cfg = await db.practical_configs.find_one({
            "subjectCode": sub_code,
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        })
        if not p_cfg:
            p_cfg = await db.practical_configs.find_one({"subjectCode": sub_code})
        if p_cfg and p_cfg.get("exercises"):
            configured_exercises = [e.strip().upper() for e in p_cfg["exercises"] if e.strip()]
        else:
            found_ex = set()
            for m in existing_marks:
                for k in (m.get("componentMarks") or {}).keys():
                    if re.match(r"^EX\d+$", str(k).strip().upper()):
                        found_ex.add(str(k).strip().upper())
            if found_ex:
                max_n = max([int(re.sub(r"\D", "", x) or 0) for x in found_ex] + [10])
                configured_exercises = [f"EX{i}" for i in range(1, max_n + 1)]
            else:
                configured_exercises = [f"EX{i}" for i in range(1, 11)]

    return {
        "subjectCode": sub_code,
        "subjectName": (subject.get("subjectName", "") if subject else None) or sub_code,
        "semester": semester,
        "department": dept,
        "subjectType": st_val,
        "status": overall_status,
        "configuredExercises": configured_exercises,
        "students": student_list
    }

class PracticalConfigRequest(BaseModel):
    subjectCode: str
    semester: Optional[int] = 1
    exercises: List[str]

@router.post("/practical-config")
async def save_practical_config(payload: PracticalConfigRequest):
    sub_code = payload.subjectCode.strip().upper()
    semester = int(payload.semester or 1)
    clean_ex = []
    seen = set()
    for e in payload.exercises:
        item = str(e).strip().upper()
        if item and item not in seen:
            seen.add(item)
            clean_ex.append(item)
    if not clean_ex:
        clean_ex = [f"EX{i}" for i in range(1, 11)]

    await db.practical_configs.update_one(
        {"subjectCode": sub_code, "$or": [{"semester": semester}, {"semester": str(semester)}]},
        {"$set": {
            "subjectCode": sub_code,
            "semester": semester,
            "exercises": clean_ex,
            "updatedAt": datetime.utcnow().isoformat()
        }},
        upsert=True
    )
    return {"message": "Practical exercise configuration saved successfully.", "exercises": clean_ex, "configuredExercises": clean_ex}

# ─────────────────────────────────────────────────────────────────────────────
# 3. EXCEL TEMPLATE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/template")
async def download_faculty_marks_template(
    facultyId: str = Query(...),
    subjectCode: str = Query(...),
    semester: int = Query(...),
    studentDepartment: Optional[str] = Query(None)
):
    fac_id = facultyId.strip()
    sub_code = subjectCode.strip().upper()

    if not await verify_faculty_access(fac_id, sub_code):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Faculty '{fac_id}' is not authorized to generate template for subject '{sub_code}'."
        )

    target_dept = (studentDepartment.strip().upper()) if (isinstance(studentDepartment, str) and studentDepartment.strip()) else ""
    if not target_dept or target_dept == "ALL":
        access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
        if access_doc and access_doc.get("assignments"):
            for a in access_doc.get("assignments"):
                if a.get("subjectCode", "").upper() == sub_code and int(a.get("semester") or 1) == int(semester):
                    target_dept = (a.get("studentDepartment") or "").strip().upper()
                    break

    sub_doc = await db.subjects.find_one({"subjectCode": sub_code})
    dept = target_dept or (sub_doc.get("department", "") if sub_doc else "")
    st_val, cfg = await get_subject_type_and_config(sub_code, semester)

    # Fetch students assigned
    sem_filter = [
        {"subjectSemester": semester},
        {"semester": semester},
        {"subjectSemester": str(semester)},
        {"semester": str(semester)}
    ]
    query_ss = {"subjectCode": sub_code, "$or": sem_filter}
    if target_dept and target_dept != "ALL":
        dept_match_cnt = await db.student_subjects.count_documents({**query_ss, "department": target_dept})
        if dept_match_cnt > 0:
            query_ss["department"] = target_dept

    enrolled_cur = db.student_subjects.find(query_ss)
    enrolled_docs = [clean_doc(d) async for d in enrolled_cur]
    enrolled_regs = [d["registerNumber"] for d in enrolled_docs if d.get("registerNumber")]

    students = []
    if enrolled_regs:
        st_cursor = db.students.find({"registerNumber": {"$in": enrolled_regs}}).sort("registerNumber", 1)
        db_students = {st["registerNumber"]: clean_doc(st) async for st in st_cursor}
        seen_r = set()
        for d in enrolled_docs:
            reg = d.get("registerNumber")
            if not reg or reg in seen_r:
                continue
            seen_r.add(reg)
            matched_st = db_students.get(reg)
            students.append({
                "registerNumber": reg,
                "name": (matched_st.get("name") if matched_st else None) or d.get("studentName") or f"Student {reg}"
            })

    if not students and dept and dept != "ALL":
        students = [clean_doc(st) async for st in db.students.find({
            "department": dept,
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        }).sort("registerNumber", 1)]
    if not students:
        students = [clean_doc(st) async for st in db.students.find({
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        }).sort("registerNumber", 1)]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{sub_code} Marks"

    # Define headers based on subject type
    if st_val == "THEORY":
        headers = ["Roll Number", "Student Name", "Subject Code", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Assessment Mark"]
    elif st_val == "PRACTICAL":
        p_cfg = await db.practical_configs.find_one({"subjectCode": sub_code})
        ex_headers = p_cfg.get("exercises") if p_cfg and p_cfg.get("exercises") else [f"EX{i}" for i in range(1, 11)]
        headers = ["Roll Number", "Student Name", "Subject Code"] + ex_headers + ["Model Practical"]
    else:  # INTEGRATED
        p_cfg = await db.practical_configs.find_one({
            "subjectCode": sub_code,
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        })
        if not p_cfg:
            p_cfg = await db.practical_configs.find_one({"subjectCode": sub_code})
        ex_headers = p_cfg.get("exercises") if p_cfg and p_cfg.get("exercises") else [f"EX{i}" for i in range(1, 11)]
        headers = ["Roll Number", "Student Name", "Subject Code", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Internal Assessment"] + ex_headers + ["Model Practical"]

    ws.append(headers)

    # Style header row
    header_font = openpyxl.styles.Font(bold=True, color="FFFFFF")
    header_fill = openpyxl.styles.PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = openpyxl.styles.Alignment(horizontal="center")

    # Populate student rows
    for st in students:
        row_data = [st.get("registerNumber", ""), st.get("name", ""), sub_code]
        # Leave mark cells blank for faculty entry
        row_data.extend([""] * (len(headers) - 3))
        ws.append(row_data)

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"{sub_code}_Sem{semester}_{st_val}_template.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ─────────────────────────────────────────────────────────────────────────────
# 4. EXCEL UPLOAD: VALIDATE & PREVIEW (Stage 1)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-validate", response_model=ExcelValidationPreviewResponse)
async def upload_validate_faculty_marks(
    facultyId: str = Form(...),
    subjectCode: str = Form(...),
    semester: int = Form(...),
    file: UploadFile = File(...)
):
    fac_id = facultyId.strip()
    sub_code = subjectCode.strip().upper()

    if not await verify_faculty_access(fac_id, sub_code):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Faculty '{fac_id}' is not authorized for subject '{sub_code}'."
        )

    # Check batch lock (if results are published/locked, reject)
    sub_doc = await db.subjects.find_one({"subjectCode": sub_code})
    dept = sub_doc.get("department", "ALL") if sub_doc else "ALL"
    await security_service.enforce_batch_unlocked(dept, semester, action_name="upload new marks")

    # Check if subject is already locked
    existing_status_doc = await db.internal_marks.find_one({"subjectCode": sub_code, "semester": semester})
    if existing_status_doc and existing_status_doc.get("status") == "SUBMITTED" and fac_id.upper() not in {"ADMIN", "HOD"}:
        raise HTTPException(
            status_code=400,
            detail=f"Subject '{sub_code}' marks are already SUBMITTED and locked. Request HOD/Admin unlock to modify."
        )

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(filename=BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file format: {str(e)}")

    sheet = wb.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="Excel file is empty or missing data rows.")

    st_val, cfg = await get_subject_type_and_config(sub_code, semester)

    # Identify header row
    header_idx = -1
    for idx, row in enumerate(rows[:10]):
        if not row:
            continue
        row_str = " ".join([_clean_str(c).lower() for c in row if c])
        if "roll" in row_str or "reg" in row_str or "subject" in row_str or "ut1" in row_str or "ex1" in row_str:
            header_idx = idx
            break
    if header_idx == -1:
        header_idx = 0

    header_cells = [_clean_str(c) for c in (rows[header_idx] or [])]
    header_clean = [re.sub(r"[^a-z0-9]", "", c.lower()) for c in header_cells]

    def _col_idx(targets: List[str]) -> int:
        for i, h in enumerate(header_clean):
            for t in targets:
                if t in h:
                    return i
        return -1

    reg_idx = _col_idx(["rollnumber", "rollno", "registernumber", "regno", "register", "roll"])
    sub_idx = _col_idx(["subjectcode", "subcode", "subject"])
    name_idx = _col_idx(["studentname", "name"])

    if reg_idx == -1:
        raise HTTPException(status_code=400, detail="Could not find 'Roll Number' or 'Register Number' column.")

    # Map component column indices
    ut_indices = {f"Unit {i}": _col_idx([f"unit{i}", f"ut{i}"]) for i in range(1, 6)}
    ia_idx = _col_idx(["assessmentmark", "assessment", "internalassessment", "ia"])
    ex_indices = {f"EX{i}": _col_idx([f"ex{i}", f"exp{i}", f"experiment{i}"]) for i in range(1, 31)}
    ex_indices = {k: v for k, v in ex_indices.items() if v != -1}
    model_idx = _col_idx(["modelpractical", "model"])

    # Pre-fetch valid students for validation
    all_students_cur = db.students.find({})
    db_students = {s["registerNumber"].strip().upper(): s async for s in all_students_cur}

    # Pre-fetch valid student-subject assignments
    assigned_records_cur = db.student_subjects.find({"subjectCode": sub_code, "semester": semester})
    assigned_regs = {r["registerNumber"].strip().upper() async for r in assigned_records_cur}

    errors: List[ExcelUploadValidationError] = []
    preview: List[Dict[str, Any]] = []
    seen_rolls = set()
    row_count = 0

    for r_idx, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        if not row or not any(row):
            continue

        row_count += 1
        roll_raw = _clean_str(row[reg_idx] if reg_idx < len(row) else "").upper()
        if not roll_raw:
            errors.append(ExcelUploadValidationError(
                row=r_idx,
                rollNumber="EMPTY",
                subject=sub_code,
                field="Roll Number",
                error="Roll number is missing or empty.",
                expectedValue="Valid Student Register Number"
            ))
            continue

        row_subj = _clean_str(row[sub_idx] if sub_idx != -1 and sub_idx < len(row) else "").upper() or sub_code
        if row_subj != sub_code:
            errors.append(ExcelUploadValidationError(
                row=r_idx,
                rollNumber=roll_raw,
                subject=row_subj,
                field="Subject Code",
                error=f"Row subject '{row_subj}' does not match expected subject '{sub_code}'.",
                expectedValue=sub_code
            ))

        # Check duplicate in file
        if roll_raw in seen_rolls:
            errors.append(ExcelUploadValidationError(
                row=r_idx,
                rollNumber=roll_raw,
                subject=sub_code,
                field="Roll Number",
                error=f"Duplicate record for roll number '{roll_raw}' in upload file.",
                expectedValue="Unique Roll Number per file"
            ))
        seen_rolls.add(roll_raw)

        # Check valid student exists in DB
        student_doc = db_students.get(roll_raw)
        if not student_doc:
            errors.append(ExcelUploadValidationError(
                row=r_idx,
                rollNumber=roll_raw,
                subject=sub_code,
                field="Roll Number",
                error=f"Student '{roll_raw}' does not exist in student master database.",
                expectedValue="Registered Student"
            ))

        # Check student assigned to subject (if student_subjects has records for this subject)
        if assigned_regs and roll_raw not in assigned_regs:
            # Also check if student's dept/sem matches
            if not student_doc or student_doc.get("semester") != semester:
                errors.append(ExcelUploadValidationError(
                    row=r_idx,
                    rollNumber=roll_raw,
                    subject=sub_code,
                    field="Student Assignment",
                    error=f"Student '{roll_raw}' is not enrolled in subject '{sub_code}' for semester {semester}.",
                    expectedValue="Enrolled Student"
                ))

        student_name = _clean_str(row[name_idx] if name_idx != -1 and name_idx < len(row) else "")
        if not student_name and student_doc:
            student_name = student_doc.get("name", "")

        component_marks: Dict[str, Any] = {}

        # Validate Theory components if Theory or Integrated
        if st_val in {"THEORY", "INTEGRATED"}:
            th_ut_max = 100.0 if st_val in {"THEORY", "INTEGRATED"} else cfg.utMax
            th_ia_max = 40.0 if st_val in {"THEORY", "INTEGRATED"} else cfg.iaMax
            for ut_key, c_idx in ut_indices.items():
                if c_idx != -1 and c_idx < len(row):
                    cell_val = row[c_idx]
                    if cell_val is not None and str(cell_val).strip() != "":
                        try:
                            f_val = float(cell_val)
                            if f_val < 0:
                                errors.append(ExcelUploadValidationError(
                                    row=r_idx,
                                    rollNumber=roll_raw,
                                    subject=sub_code,
                                    field=ut_key,
                                    error=f"Mark cannot be negative ({f_val}).",
                                    expectedValue=f"0.0 to {th_ut_max}"
                                ))
                            elif f_val > th_ut_max:
                                errors.append(ExcelUploadValidationError(
                                    row=r_idx,
                                    rollNumber=roll_raw,
                                    subject=sub_code,
                                    field=ut_key,
                                    error=f"Mark ({f_val}) exceeds maximum allowed ({th_ut_max}).",
                                    expectedValue=f"0.0 to {th_ut_max}"
                                ))
                            else:
                                component_marks[ut_key] = f_val
                        except (ValueError, TypeError):
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field=ut_key,
                                error=f"Non-numeric value '{cell_val}' entered.",
                                expectedValue="Numeric Mark"
                            ))

            if ia_idx != -1 and ia_idx < len(row):
                cell_val = row[ia_idx]
                if cell_val is not None and str(cell_val).strip() != "":
                    try:
                        f_val = float(cell_val)
                        field_name = "Assessment Mark" if st_val == "THEORY" else "Internal Assessment"
                        if f_val < 0:
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field=field_name,
                                error=f"{field_name} mark cannot be negative ({f_val}).",
                                expectedValue=f"0.0 to {th_ia_max}"
                            ))
                        elif f_val > th_ia_max:
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field=field_name,
                                error=f"{field_name} mark ({f_val}) exceeds maximum allowed ({th_ia_max}).",
                                expectedValue=f"0.0 to {th_ia_max}"
                            ))
                        else:
                            component_marks["Assessment Mark" if st_val == "THEORY" else "IA"] = f_val
                    except (ValueError, TypeError):
                        errors.append(ExcelUploadValidationError(
                            row=r_idx,
                            rollNumber=roll_raw,
                            subject=sub_code,
                            field="Assessment Mark" if st_val == "THEORY" else "Internal Assessment",
                            error=f"Non-numeric value '{cell_val}' entered.",
                            expectedValue="Numeric Mark"
                        ))

        # Validate Practical components if Practical or Integrated
        if st_val in {"PRACTICAL", "INTEGRATED"}:
            pr_ex_max = 10.0 if st_val in {"PRACTICAL", "INTEGRATED"} else cfg.practicalExMax
            for ex_key, c_idx in ex_indices.items():
                if c_idx != -1 and c_idx < len(row):
                    cell_val = row[c_idx]
                    if cell_val is not None and str(cell_val).strip() != "":
                        try:
                            f_val = float(cell_val)
                            if f_val < 0:
                                errors.append(ExcelUploadValidationError(
                                    row=r_idx,
                                    rollNumber=roll_raw,
                                    subject=sub_code,
                                    field=ex_key,
                                    error=f"Experiment mark cannot be negative ({f_val}).",
                                    expectedValue=f"0.0 to {pr_ex_max}"
                                ))
                            elif f_val > pr_ex_max:
                                errors.append(ExcelUploadValidationError(
                                    row=r_idx,
                                    rollNumber=roll_raw,
                                    subject=sub_code,
                                    field=ex_key,
                                    error=f"Experiment mark ({f_val}) exceeds maximum allowed ({pr_ex_max}).",
                                    expectedValue=f"0.0 to {pr_ex_max}"
                                ))
                            else:
                                component_marks[ex_key] = f_val
                        except (ValueError, TypeError):
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field=ex_key,
                                error=f"Non-numeric value '{cell_val}' entered.",
                                expectedValue="Numeric Mark"
                            ))

            if model_idx != -1 and model_idx < len(row):
                cell_val = row[model_idx]
                if cell_val is not None and str(cell_val).strip() != "":
                    try:
                        f_val = float(cell_val)
                        if f_val < 0:
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field="Model Practical",
                                error=f"Model Practical mark cannot be negative ({f_val}).",
                                expectedValue=f"0.0 to {cfg.modelPracticalMax}"
                            ))
                        elif f_val > cfg.modelPracticalMax:
                            errors.append(ExcelUploadValidationError(
                                row=r_idx,
                                rollNumber=roll_raw,
                                subject=sub_code,
                                field="Model Practical",
                                error=f"Model Practical mark ({f_val}) exceeds maximum allowed ({cfg.modelPracticalMax}).",
                                expectedValue=f"0.0 to {cfg.modelPracticalMax}"
                            ))
                        else:
                            component_marks["Model"] = f_val
                    except (ValueError, TypeError):
                        errors.append(ExcelUploadValidationError(
                            row=r_idx,
                            rollNumber=roll_raw,
                            subject=sub_code,
                            field="Model Practical",
                            error=f"Non-numeric value '{cell_val}' entered.",
                            expectedValue="Numeric Mark"
                        ))

        # Compute internal using CalculationEngine
        calc_res = {}
        final_internal = 0.0
        try:
            if st_val == "THEORY":
                calc_res = calculation_engine.calculate_theory_internal(component_marks, cfg)
            elif st_val == "PRACTICAL":
                calc_res = calculation_engine.calculate_practical_internal(component_marks, cfg)
            else:  # INTEGRATED
                calc_res = calculation_engine.calculate_integrated_internal(component_marks, component_marks, cfg)
            final_internal = round(calc_res.get("rawInternal", 0.0), 2)
        except Exception as ce:
            errors.append(ExcelUploadValidationError(
                row=r_idx,
                rollNumber=roll_raw,
                subject=sub_code,
                field="Calculation Engine",
                error=str(ce),
                expectedValue="Valid input parameters"
            ))

        preview.append({
            "registerNumber": roll_raw,
            "name": student_name,
            "subjectCode": sub_code,
            "componentMarks": component_marks,
            "finalInternal": final_internal,
            "details": calc_res
        })

    is_valid = len(errors) == 0
    return ExcelValidationPreviewResponse(
        totalRows=row_count,
        validRows=row_count - len({e.row for e in errors}),
        errorRows=len({e.row for e in errors}),
        errors=errors,
        preview=preview,
        isValid=is_valid
    )

# ─────────────────────────────────────────────────────────────────────────────
# 5. EXCEL UPLOAD: CONFIRM & INSERT/UPDATE (Stage 2)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-confirm")
async def upload_confirm_faculty_marks(payload: ConfirmMarksUploadPayload):
    fac_id = payload.facultyId.strip()
    sub_code = payload.subjectCode.strip().upper()
    semester = payload.semester
    status_action = (payload.status or "DRAFT").strip().upper()
    marks_list = payload.marks

    if not await verify_faculty_access(fac_id, sub_code):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Faculty '{fac_id}' is not authorized to submit marks for '{sub_code}'."
        )

    # Check batch lock (if results are published/locked, reject)
    sub_doc = await db.subjects.find_one({"subjectCode": sub_code})
    dept = sub_doc.get("department", "ALL") if sub_doc else "ALL"
    await security_service.enforce_batch_unlocked(dept, semester, action_name="commit uploaded marks")

    # Verify existing lock status
    existing_status_doc = await db.internal_marks.find_one({"subjectCode": sub_code, "semester": semester})
    if existing_status_doc and existing_status_doc.get("status") == "SUBMITTED" and fac_id.upper() not in {"ADMIN", "HOD"}:
        raise HTTPException(
            status_code=400,
            detail=f"Subject '{sub_code}' marks are already SUBMITTED and locked."
        )

    if not marks_list:
        raise HTTPException(status_code=400, detail="No marks records provided for confirmation.")

    st_val, cfg = await get_subject_type_and_config(sub_code, semester)
    now_iso = datetime.utcnow().isoformat()
    audit_history_entries = []
    committed_count = 0

    active_exercises = None
    if st_val in ("PRACTICAL", "INTEGRATED"):
        p_cfg = await db.practical_configs.find_one({
            "subjectCode": sub_code,
            "$or": [{"semester": semester}, {"semester": str(semester)}]
        })
        if not p_cfg:
            p_cfg = await db.practical_configs.find_one({"subjectCode": sub_code})
        if p_cfg and p_cfg.get("exercises"):
            active_exercises = p_cfg["exercises"]

    for item in marks_list:
        reg_no = _clean_str(item.get("registerNumber")).upper()
        if not reg_no:
            continue

        comp_marks = item.get("componentMarks", {})

        # Strict validation: never silently cap marks
        for k, v in comp_marks.items():
            if v is not None and str(v).strip() != "":
                f_val = float(v)
                if f_val < 0:
                    raise HTTPException(status_code=400, detail=f"Invalid negative mark {f_val} for student {reg_no}, field {k}.")
                if st_val == "THEORY":
                    if ("UNIT" in k.upper() or "UT" in k.upper()) and f_val > 100.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Unit maximum 100 for {reg_no}, field {k}.")
                    if (k.upper() in {"ASSESSMENT MARK", "ASSESSMENT", "IA", "INTERNAL ASSESSMENT"}) and f_val > 40.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Assessment maximum 40 for {reg_no}, field {k}.")
                elif st_val == "INTEGRATED":
                    if ("UNIT" in k.upper() or "UT" in k.upper()) and f_val > 100.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Unit maximum 100 for {reg_no}, field {k}.")
                    if (k.upper() in {"ASSESSMENT MARK", "ASSESSMENT", "IA", "INTERNAL ASSESSMENT"}) and f_val > 40.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Assessment maximum 40 for {reg_no}, field {k}.")
                    if "EX" in k.upper() and f_val > 10.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Practical maximum 10 for {reg_no}, field {k}.")
                    if "MODEL" in k.upper() and f_val > 25.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Model maximum 25 for {reg_no}, field {k}.")
                elif st_val == "PRACTICAL":
                    if "EX" in k.upper() and f_val > 10.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Practical maximum 10 for {reg_no}, field {k}.")
                    if "MODEL" in k.upper() and f_val > 25.0:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Model maximum 25 for {reg_no}, field {k}.")
                else:
                    if "UT" in k.upper() and f_val > cfg.utMax:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds UT maximum {cfg.utMax} for {reg_no}, field {k}.")
                    if k.upper() == "IA" and f_val > cfg.iaMax:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds IA maximum {cfg.iaMax} for {reg_no}, field {k}.")
                    if "EX" in k.upper():
                        pr_max = 10.0 if st_val == "PRACTICAL" else cfg.practicalExMax
                        if f_val > pr_max:
                            raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Practical maximum {pr_max} for {reg_no}, field {k}.")
                    if "MODEL" in k.upper() and f_val > cfg.modelPracticalMax:
                        raise HTTPException(status_code=400, detail=f"Mark {f_val} exceeds Model maximum {cfg.modelPracticalMax} for {reg_no}, field {k}.")

        # Compute internal using CalculationEngine
        if st_val == "THEORY":
            calc_res = calculation_engine.calculate_theory_internal(comp_marks, cfg)
        elif st_val == "PRACTICAL":
            calc_res = calculation_engine.calculate_practical_internal(comp_marks, cfg, active_exercises=active_exercises)
        else:
            calc_res = calculation_engine.calculate_integrated_internal(comp_marks, comp_marks, cfg, active_exercises=active_exercises)
        final_internal = round(calc_res.get("rawInternal", 0.0), 2)

        # Audit history tracking
        existing = await db.internal_marks.find_one({"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester})
        old_comp = existing.get("componentMarks", {}) if existing else {}

        for c_name, new_val in comp_marks.items():
            old_val = old_comp.get(c_name)
            if str(old_val) != str(new_val):
                audit_history_entries.append({
                    "registerNumber": reg_no,
                    "subjectCode": sub_code,
                    "component": c_name,
                    "oldMark": old_val,
                    "newMark": new_val,
                    "facultyId": fac_id,
                    "facultyName": payload.facultyName or "Faculty",
                    "timestamp": now_iso
                })

        doc = {
            "registerNumber": reg_no,
            "subjectCode": sub_code,
            "semester": semester,
            "subjectType": st_val,
            "componentMarks": comp_marks,
            "totalInternal": round(calc_res.get("total100", 0.0), 2),
            "finalInternal": final_internal,
            "overallInternal": final_internal,
            "status": status_action,
            "updatedAt": now_iso,
            "updatedBy": fac_id
        }
        if st_val == "INTEGRATED":
            doc["theoryInternal"] = round(calc_res.get("theoryInternal", 0.0), 2)
            doc["practicalInternal"] = round(calc_res.get("practicalInternal", 0.0), 2)
            doc["combinedTotal"] = round(calc_res.get("combinedTotal", 0.0), 2)
            doc["integratedInternal"] = final_internal

        await db.internal_marks.update_one(
            {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
            {"$set": doc},
            upsert=True
        )

        existing_ss = await db.student_subjects.find_one({
            "registerNumber": reg_no,
            "subjectCode": sub_code,
            "$or": [{"semester": semester}, {"subjectSemester": semester}, {"semester": str(semester)}, {"subjectSemester": str(semester)}]
        })
        if existing_ss:
            await db.student_subjects.update_one(
                {"_id": existing_ss["_id"]},
                {"$set": {"internalMark": final_internal, "status": status_action, "subjectType": st_val}}
            )
        else:
            await db.student_subjects.update_one(
                {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
                {"$set": {"internalMark": final_internal, "status": status_action, "subjectType": st_val, "subjectSemester": semester}},
                upsert=True
            )
        committed_count += 1

    if audit_history_entries:
        await db.mark_history.insert_many(audit_history_entries)

    await audit_service.log_event(
        user=fac_id,
        role="faculty",
        action="MARK_UPLOAD",
        entity=f"SubjectMarks:{sub_code}:Sem{semester}",
        new_value={"committedRows": committed_count, "status": status_action},
        details=f"Faculty {payload.facultyName or 'Faculty'} committed {committed_count} marks via upload."
    )

    return {
        "message": f"Successfully committed {committed_count} student marks with status {status_action}.",
        "committedRows": committed_count,
        "status": status_action,
        "auditEntriesCount": len(audit_history_entries)
    }

# ─────────────────────────────────────────────────────────────────────────────
# 6. SAVE / SUBMIT MANUAL MARKS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/save")
async def save_faculty_marks(payload: Dict[str, Any]):
    fac_id = _clean_str(payload.get("facultyId"))
    fac_name = _clean_str(payload.get("facultyName", "Faculty"))
    sub_code = _clean_str(payload.get("subjectCode")).upper()
    semester = int(payload.get("semester", 1))
    status_action = _clean_str(payload.get("status", "DRAFT")).upper()
    marks_list = payload.get("marks", [])

    if not sub_code:
        raise HTTPException(status_code=400, detail="Subject code is required.")

    if not await verify_faculty_access(fac_id, sub_code):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Faculty '{fac_id}' is not authorized to edit subject '{sub_code}'."
        )

    # Check batch lock (if results are published/locked, reject)
    sub_doc = await db.subjects.find_one({"subjectCode": sub_code})
    dept = sub_doc.get("department", "ALL") if sub_doc else "ALL"
    await security_service.enforce_batch_unlocked(dept, semester, action_name="save marks")

    # Check lock
    existing_status_doc = await db.internal_marks.find_one({"subjectCode": sub_code, "semester": semester})
    if existing_status_doc and existing_status_doc.get("status") == "SUBMITTED" and fac_id.upper() not in {"ADMIN", "HOD"}:
        raise HTTPException(
            status_code=400,
            detail=f"Subject '{sub_code}' marks are already SUBMITTED and locked."
        )

    st_val, cfg = await get_subject_type_and_config(sub_code, semester)
    now_iso = datetime.utcnow().isoformat()
    audit_history_entries = []

    active_exercises = None
    if st_val in ("PRACTICAL", "INTEGRATED"):
        passed_ex = payload.get("exercises")
        if passed_ex and isinstance(passed_ex, list):
            clean_ex = [str(e).strip().upper() for e in passed_ex if str(e).strip()]
            active_exercises = clean_ex
            await db.practical_configs.update_one(
                {"subjectCode": sub_code, "$or": [{"semester": semester}, {"semester": str(semester)}]},
                {"$set": {
                    "subjectCode": sub_code,
                    "semester": semester,
                    "exercises": clean_ex,
                    "updatedAt": now_iso
                }},
                upsert=True
            )
        else:
            p_cfg = await db.practical_configs.find_one({
                "subjectCode": sub_code,
                "$or": [{"semester": semester}, {"semester": str(semester)}]
            })
            if not p_cfg:
                p_cfg = await db.practical_configs.find_one({"subjectCode": sub_code})
            if p_cfg and p_cfg.get("exercises"):
                active_exercises = p_cfg["exercises"]

    for item in marks_list:
        reg_no = _clean_str(item.get("registerNumber")).upper()
        if not reg_no:
            continue

        comp_marks = item.get("componentMarks", {})

        # Strict validation: reject negative marks and marks exceeding maximums
        for c_name, val in comp_marks.items():
            if val is not None and str(val).strip() != "":
                f_val = float(val)
                if f_val < 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Mark for {c_name} on student {reg_no} cannot be negative ({f_val})."
                    )
                if st_val == "THEORY":
                    if "UNIT" in c_name.upper() or "UT" in c_name.upper():
                        if f_val > 100.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (100)."
                            )
                    elif c_name.upper() in {"ASSESSMENT MARK", "ASSESSMENT", "IA", "INTERNAL ASSESSMENT"}:
                        if f_val > 40.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (40)."
                            )
                elif st_val == "INTEGRATED":
                    if "UNIT" in c_name.upper() or "UT" in c_name.upper():
                        if f_val > 100.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (100)."
                            )
                    elif c_name.upper() in {"ASSESSMENT MARK", "ASSESSMENT", "IA", "INTERNAL ASSESSMENT"}:
                        if f_val > 40.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (40)."
                            )
                    elif "EX" in c_name.upper():
                        if f_val > 10.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (10.0)."
                            )
                    elif "MODEL" in c_name.upper():
                        if f_val > 25.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (25.0)."
                            )
                elif st_val == "PRACTICAL":
                    if "EX" in c_name.upper():
                        if f_val > 10.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed (10.0)."
                            )
                    elif "MODEL" in c_name.upper():
                        if f_val > 25.0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed ({cfg.modelPracticalMax})."
                            )
                else:
                    if "UT" in c_name.upper() or "UNIT" in c_name.upper():
                        if f_val > cfg.utMax:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed ({cfg.utMax})."
                            )
                    elif c_name.upper() in {"IA", "INTERNAL ASSESSMENT"}:
                        if f_val > cfg.iaMax:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Mark {f_val} for {c_name} on student {reg_no} exceeds maximum allowed ({cfg.iaMax})."
                            )

        # Auto calculate final internal using centralized CalculationEngine
        if st_val == "THEORY":
            calc_res = calculation_engine.calculate_theory_internal(comp_marks, cfg)
        elif st_val == "PRACTICAL":
            calc_res = calculation_engine.calculate_practical_internal(comp_marks, cfg, active_exercises=active_exercises)
        else:
            calc_res = calculation_engine.calculate_integrated_internal(comp_marks, comp_marks, cfg, active_exercises=active_exercises)

        final_internal = round(calc_res.get("rawInternal", 0.0), 2)
        if item.get("overrideInternal"):
            final_internal = float(item.get("finalInternal", final_internal))

        existing = await db.internal_marks.find_one({"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester})
        old_comp_marks = existing.get("componentMarks", {}) if existing else {}

        for c_name, new_val in comp_marks.items():
            old_val = old_comp_marks.get(c_name)
            if str(old_val) != str(new_val):
                audit_history_entries.append({
                    "registerNumber": reg_no,
                    "subjectCode": sub_code,
                    "component": c_name,
                    "oldMark": old_val,
                    "newMark": new_val,
                    "facultyId": fac_id or "FACULTY",
                    "facultyName": fac_name,
                    "timestamp": now_iso
                })

        doc = {
            "registerNumber": reg_no,
            "subjectCode": sub_code,
            "semester": semester,
            "subjectType": st_val,
            "componentMarks": comp_marks,
            "totalInternal": round(calc_res.get("total100", 0.0), 2),
            "finalInternal": final_internal,
            "overallInternal": final_internal,
            "status": status_action,
            "updatedAt": now_iso,
            "updatedBy": fac_id or "FACULTY"
        }
        if st_val == "INTEGRATED":
            doc["theoryInternal"] = round(calc_res.get("theoryInternal", 0.0), 2)
            doc["practicalInternal"] = round(calc_res.get("practicalInternal", 0.0), 2)
            doc["combinedTotal"] = round(calc_res.get("combinedTotal", 0.0), 2)
            doc["integratedInternal"] = final_internal

        await db.internal_marks.update_one(
            {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
            {"$set": doc},
            upsert=True
        )

        existing_ss = await db.student_subjects.find_one({
            "registerNumber": reg_no,
            "subjectCode": sub_code,
            "$or": [{"semester": semester}, {"subjectSemester": semester}, {"semester": str(semester)}, {"subjectSemester": str(semester)}]
        })
        if existing_ss:
            await db.student_subjects.update_one(
                {"_id": existing_ss["_id"]},
                {"$set": {"internalMark": final_internal, "status": status_action, "subjectType": st_val}}
            )
        else:
            await db.student_subjects.update_one(
                {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
                {"$set": {"internalMark": final_internal, "status": status_action, "subjectType": st_val, "subjectSemester": semester}},
                upsert=True
            )

    if audit_history_entries:
        await db.mark_history.insert_many(audit_history_entries)

    await audit_service.log_event(
        user=fac_id or "faculty",
        role="faculty",
        action="MARK_UPDATE",
        entity=f"SubjectMarks:{sub_code}:Sem{semester}",
        new_value={"updatedCount": len(marks_list), "status": status_action},
        details=f"Faculty {fac_name} saved marks for {len(marks_list)} students."
    )

    return {
        "message": f"Marks saved with status {status_action} for {len(marks_list)} students.",
        "status": status_action,
        "auditEntriesCount": len(audit_history_entries)
    }

# ─────────────────────────────────────────────────────────────────────────────
# 7. MARK AUDIT HISTORY
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/history")
async def get_mark_history(
    subjectCode: str = Query(...),
    registerNumber: Optional[str] = Query(None)
):
    query = {"subjectCode": subjectCode.strip().upper()}
    if registerNumber:
        query["registerNumber"] = registerNumber.strip().upper()

    cursor = db.mark_history.find(query).sort("timestamp", -1).limit(100)
    return [clean_doc(d) async for d in cursor]

# ─────────────────────────────────────────────────────────────────────────────
# 8. UNLOCK MARKS (Admin / HOD Only)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/unlock")
async def unlock_subject_marks(payload: Dict[str, Any]):
    sub_code = _clean_str(payload.get("subjectCode")).upper()
    semester = int(payload.get("semester", 1))

    if not sub_code:
        raise HTTPException(status_code=400, detail="Subject code is required.")

    await db.internal_marks.update_many(
        {"subjectCode": sub_code, "semester": semester},
        {"$set": {"status": "DRAFT"}}
    )
    await db.student_subjects.update_many(
        {"subjectCode": sub_code, "semester": semester},
        {"$set": {"status": "DRAFT"}}
    )

    return {"message": f"Marks for {sub_code} (Semester {semester}) unlocked and reset to DRAFT."}
