from fastapi import APIRouter, HTTPException, UploadFile, File, Header
from fastapi.responses import Response
from app.database import db, clean_doc, clean_docs
from typing import Dict, Any, Optional
from app.services.academic_service import academic_service
from app.services.arrear_service import arrear_service
from app.services.security_service import security_service

router = APIRouter()

@router.get("/{reg_no}/profile")
async def get_profile(
    reg_no: str,
    x_user_role: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    await security_service.verify_student_access(reg_no, x_user_role, x_user_id)
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    results = [doc async for doc in db.results.find({"registerNumber": reg_no, "isPublished": True})]

    # Enrich missing credits / subjectNames from db.subjects
    sub_docs = {s["subjectCode"]: s async for s in db.subjects.find({})}
    for r in results:
        code = r.get("subjectCode")
        if code in sub_docs:
            if not r.get("credits") and sub_docs[code].get("credits"):
                r["credits"] = float(sub_docs[code]["credits"])
            if not r.get("subjectName") and sub_docs[code].get("subjectName"):
                r["subjectName"] = sub_docs[code]["subjectName"]

    # Also calculate academic history (CGPA & GPA per semester)
    academic_data = {}
    try:
        academic_data = await academic_service.get_student_academic_history(reg_no)
    except Exception:
        pass

    return {
        "student": clean_doc(student),
        "results": clean_docs(results),
        "overallCgpa": academic_data.get("overallCgpa", 0.0),
        "totalEarnedCredits": academic_data.get("totalEarnedCredits", 0.0),
        "academicSemesters": academic_data.get("semesters", [])
    }


@router.post("/{reg_no}/photo")
async def upload_photo(reg_no: str, photo: UploadFile = File(...)):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=400, detail={"error": "Student not found"})
    await db.students.update_one({"registerNumber": reg_no}, {"$set": {"photo": await photo.read()}})
    return {"message": "Photo uploaded successfully"}

@router.get("/{reg_no}/photo")
async def get_photo(reg_no: str):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student or not student.get("photo"):
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=student["photo"], media_type="image/jpeg")


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/students/{reg_no}/subjects
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{reg_no}/subjects")
async def get_student_subjects(
    reg_no: str,
    x_user_role: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    await security_service.verify_student_access(reg_no, x_user_role, x_user_id)
    reg_no = reg_no.strip().upper()

    # 1. Fetch student record to get dept + semester
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    dept = str(student.get("department", "")).strip().upper()
    semester = student.get("semester")

    subjects_map: Dict[str, Dict] = {}

    # Pre-fetch all Master subjects for fast, flexible lookup
    master_subjects_list = [clean_doc(s) async for s in db.subjects.find({})]

    # Fetch ONLY subject mappings explicitly uploaded/assigned to this student in db.student_subjects
    async for mapping in db.student_subjects.find({"registerNumber": reg_no}):
        code = str(mapping.get("subjectCode", "")).strip().upper()
        if not code:
            continue

        clean_code = str(code).replace(" ", "").upper()

        # Find best matching Subject Master doc with non-empty subjectName
        subject_detail = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("department") == dept and s.get("subjectName")), None)
        if not subject_detail:
            subject_detail = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("subjectName")), None)
        if not subject_detail:
            subject_detail = next((s for s in master_subjects_list if str(s.get("subjectCode", "")).replace(" ", "").upper() == clean_code and s.get("subjectName")), None)
        if not subject_detail:
            subject_detail = await db.subjects.find_one({"subjectCode": code})

        s_name = (subject_detail.get("subjectName") if subject_detail and subject_detail.get("subjectName") else None) or mapping.get("subjectName") or code
        credits_val = float(subject_detail.get("credits") if subject_detail and subject_detail.get("credits") is not None else (mapping.get("credits") or 0))
        paper_type = str((subject_detail.get("paperType") if subject_detail else None) or mapping.get("paperType") or "THEORY").strip().upper()
        regulation = str((subject_detail.get("regulation") if subject_detail else None) or mapping.get("regulation") or "2021").strip()

        category = str(mapping.get("category", "REGULAR")).strip().upper()
        subjects_map[code] = {
            "subjectCode": code,
            "subjectName": s_name,
            "department": mapping.get("department") or (subject_detail.get("department") if subject_detail else dept),
            "semester": mapping.get("subjectSemester") or (subject_detail.get("semester") if subject_detail else semester),
            "credits": credits_val,
            "paperType": paper_type,
            "regulation": regulation,
            "category": category,
            "source": "assigned"
        }

    return {
        "registerNumber": reg_no,
        "studentName": student.get("name", ""),
        "department": dept,
        "semester": semester,
        "subjects": list(subjects_map.values()),
        "totalSubjects": len(subjects_map)
    }


@router.get("/{reg_no}/academic-history")
async def get_academic_history(
    reg_no: str,
    x_user_role: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    await security_service.verify_student_access(reg_no, x_user_role, x_user_id)
    data = await academic_service.get_student_academic_history(reg_no)
    if not data:
        raise HTTPException(status_code=404, detail=f"Academic history for student {reg_no} not found.")
    return data

@router.get("/{reg_no}/carry-forward")
async def get_carry_forward_arrears(
    reg_no: str,
    x_user_role: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    """
    Returns segregated view of:
    - CURRENT SUBJECTS (for current semester)
    - ARREAR SUBJECTS (carry forward failed subjects with preserved original semester and dynamic 3-semester validity)
    """
    await security_service.verify_student_access(reg_no, x_user_role, x_user_id)
    data = await arrear_service.get_student_carry_forward_view(reg_no)
    return data




