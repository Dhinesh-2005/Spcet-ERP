from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from app.database import db, clean_doc, clean_docs
from typing import Dict, Any
from app.services.academic_service import academic_service

router = APIRouter()

@router.get("/{reg_no}/profile")
async def get_profile(reg_no: str):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    results = [doc async for doc in db.results.find({"registerNumber": reg_no, "isPublished": True})]
    return {"student": clean_doc(student), "results": clean_docs(results)}


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
# NEW ENDPOINT (additive only – does NOT modify any existing routes above)
# GET /api/students/{reg_no}/subjects
# Returns a merged list of:
#   • Regular subjects (from db.subjects filtered by student's dept + semester)
#   • Student-specific subjects (from db.student_subjects for this roll number)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{reg_no}/subjects")
async def get_student_subjects(reg_no: str):
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
async def get_academic_history(reg_no: str):
    data = await academic_service.get_student_academic_history(reg_no)
    if not data:
        raise HTTPException(status_code=404, detail=f"Academic history for student {reg_no} not found.")
    return data


