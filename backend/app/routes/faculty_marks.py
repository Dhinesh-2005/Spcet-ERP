import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from app.database import db, clean_doc, clean_docs
from app.models.schemas import SaveFacultyMarksPayload, MarkHistoryModel

router = APIRouter()

def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()

# ─────────────────────────────────────────────────────────────────────────────
# 1. FACULTY ASSIGNED SUBJECTS (With Permission Enforcement)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-subjects")
async def get_faculty_assigned_subjects(facultyId: str = Query(...)):
    fac_id = facultyId.strip()
    if not fac_id:
        raise HTTPException(status_code=400, detail="Faculty ID is required.")

    # 1. Check direct access permission from db.faculty_subject_access
    access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
    assigned_codes = access_doc.get("subjectCodes", []) if access_doc else []

    # 2. Check if faculty belongs to a department
    fac = await db.faculties.find_one({"registerNumber": fac_id})
    dept = fac.get("department", "").strip().upper() if fac else ""

    query = {}
    if assigned_codes:
        query = {"subjectCode": {"$in": assigned_codes}}
    elif dept and dept != "ALL":
        query = {"department": dept}

    cursor = db.subjects.find(query).sort("subjectCode", 1)
    subjects = [clean_doc(s) async for s in cursor]

    # Enrich each subject with student count & mark entry status
    result = []
    for s in subjects:
        sub_code = s.get("subjectCode")
        sem = s.get("semester", 1)
        sub_dept = s.get("department", dept)

        # Count enrolled students for this subject
        regular_count = await db.students.count_documents({"department": sub_dept, "semester": sem})
        specific_count = await db.student_subjects.count_documents({"subjectCode": sub_code, "semester": sem})
        total_students = max(regular_count, specific_count)

        # Check existing internal mark status
        status_doc = await db.internal_marks.find_one({"subjectCode": sub_code, "semester": sem})
        status = status_doc.get("status", "NOT_STARTED") if status_doc else "NOT_STARTED"

        result.append({
            "subjectCode": sub_code,
            "subjectName": s.get("subjectName", ""),
            "department": sub_dept,
            "semester": sem,
            "credits": s.get("credits", 3),
            "totalStudents": total_students,
            "status": status,
            "isAssigned": True if (not assigned_codes or sub_code in assigned_codes) else False
        })

    return result

# ─────────────────────────────────────────────────────────────────────────────
# 2. STUDENTS FOR ASSIGNED SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/subject-students")
async def get_students_for_subject(
    facultyId: str = Query(...),
    subjectCode: str = Query(...),
    semester: int = Query(...)
):
    fac_id = facultyId.strip()
    sub_code = subjectCode.strip().upper()
    
    # Verify permission
    access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
    if access_doc and access_doc.get("subjectCodes"):
        if sub_code not in access_doc.get("subjectCodes"):
            raise HTTPException(status_code=403, detail=f"Access denied: Faculty '{fac_id}' is not assigned to subject '{sub_code}'.")

    # Fetch subject detail
    subject = await db.subjects.find_one({"subjectCode": sub_code})
    dept = subject.get("department", "") if subject else ""

    # Fetch assessment config
    config_doc = await db.assessment_configs.find_one({"department": dept, "semester": semester, "subjectCode": sub_code})
    if not config_doc:
        config_doc = await db.assessment_configs.find_one({"department": dept, "semester": semester, "subjectCode": None})

    components = config_doc.get("components", []) if config_doc else [
        {"name": "UT1", "maxMarks": 20.0},
        {"name": "UT2", "maxMarks": 20.0},
        {"name": "Unit 1", "maxMarks": 20.0},
        {"name": "Unit 2", "maxMarks": 20.0},
        {"name": "Unit 3", "maxMarks": 20.0},
        {"name": "Unit 4", "maxMarks": 20.0},
        {"name": "Unit 5", "maxMarks": 20.0},
    ]

    # Fetch enrolled students
    students = [clean_doc(st) async for st in db.students.find({"department": dept, "semester": semester}).sort("registerNumber", 1)]
    if not students:
        # Fallback to all students if dept match was empty
        students = [clean_doc(st) async for st in db.students.find({"semester": semester}).sort("registerNumber", 1)]

    # Fetch saved internal marks
    existing_marks = [clean_doc(m) async for m in db.internal_marks.find({"subjectCode": sub_code, "semester": semester})]
    marks_by_reg = {m["registerNumber"]: m for m in existing_marks}

    # Fetch overall status for this subject
    sample_mark = existing_marks[0] if existing_marks else None
    overall_status = sample_mark.get("status", "DRAFT") if sample_mark else "DRAFT"

    student_list = []
    for st in students:
        reg_no = st.get("registerNumber")
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

    return {
        "subjectCode": sub_code,
        "subjectName": subject.get("subjectName", "") if subject else sub_code,
        "semester": semester,
        "department": dept,
        "components": components,
        "status": overall_status,
        "students": student_list
    }

# ─────────────────────────────────────────────────────────────────────────────
# 3. SAVE / SUBMIT MARKS WITH AUTO-CALCULATION & AUDIT HISTORY
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

    # Check permission
    if fac_id:
        access_doc = await db.faculty_subject_access.find_one({"facultyId": fac_id})
        if access_doc and access_doc.get("subjectCodes"):
            if sub_code not in access_doc.get("subjectCodes"):
                raise HTTPException(status_code=403, detail=f"Access denied: Faculty '{fac_id}' is not permitted to edit subject '{sub_code}'.")

    # Fetch assessment config to validate max marks & auto calculate total
    subject = await db.subjects.find_one({"subjectCode": sub_code})
    dept = subject.get("department", "") if subject else ""
    config_doc = await db.assessment_configs.find_one({"department": dept, "semester": semester, "subjectCode": sub_code})
    if not config_doc:
        config_doc = await db.assessment_configs.find_one({"department": dept, "semester": semester, "subjectCode": None})

    components = config_doc.get("components", []) if config_doc else []
    max_mark_map = {c["name"]: float(c.get("maxMarks", 100.0)) for c in components}

    now_iso = datetime.utcnow().isoformat()
    audit_history_entries = []

    for item in marks_list:
        reg_no = _clean_str(item.get("registerNumber")).upper()
        if not reg_no:
            continue

        comp_marks = item.get("componentMarks", {})

        # Validate max mark limits
        for c_name, val in comp_marks.items():
            if val is not None and str(val).strip() != "":
                f_val = float(val)
                max_allowed = max_mark_map.get(c_name, 100.0)
                if f_val < 0 or f_val > max_allowed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid mark {f_val} for {c_name} on student {reg_no}. Maximum allowed mark is {max_allowed}."
                    )

        # Auto calculate final internal score
        # Sum of components scaled to max 40 (or 20)
        total_comp_score = 0.0
        total_max_possible = 0.0

        for c_name, val in comp_marks.items():
            if val is not None and str(val).strip() != "":
                total_comp_score += float(val)
                total_max_possible += max_mark_map.get(c_name, 20.0)

        final_internal = float(item.get("finalInternal", 0.0))
        if total_max_possible > 0:
            # Auto compute scaled internal (out of 40)
            calculated_internal = round((total_comp_score / total_max_possible) * 40.0, 2)
            if not item.get("overrideInternal"):
                final_internal = calculated_internal

        # Fetch existing record for audit history tracking
        existing = await db.internal_marks.find_one({"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester})
        old_comp_marks = existing.get("componentMarks", {}) if existing else {}

        # Record changes in audit history
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
            "componentMarks": comp_marks,
            "finalInternal": final_internal,
            "status": status_action,
            "updatedAt": now_iso,
            "updatedBy": fac_id or "FACULTY"
        }

        await db.internal_marks.update_one(
            {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
            {"$set": doc},
            upsert=True
        )

        # Sync with db.student_subjects
        await db.student_subjects.update_one(
            {"registerNumber": reg_no, "subjectCode": sub_code, "semester": semester},
            {"$set": {"internalMark": final_internal, "status": status_action}},
            upsert=True
        )

    if audit_history_entries:
        await db.mark_history.insert_many(audit_history_entries)

    return {
        "message": f"Marks saved with status {status_action} for {len(marks_list)} students.",
        "status": status_action,
        "auditEntriesCount": len(audit_history_entries)
    }

# ─────────────────────────────────────────────────────────────────────────────
# 4. MARK AUDIT HISTORY
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
# 5. UNLOCK MARKS (Admin / HOD Only)
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
