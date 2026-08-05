from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from app.database import db, clean_doc, clean_docs
from typing import Dict, Any

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

    # 1.5. Find all subject codes that are designated as student-specific (Other Subjects)
    student_specific_codes = set(await db.student_subjects.distinct("subjectCode"))

    # 2. Fetch regular subjects for this student's dept & semester
    if dept and semester:
        async for sub in db.subjects.find({"department": dept, "semester": int(semester)}):
            code = str(sub.get("subjectCode", "")).strip().upper()
            # Do NOT include subjects that are registered as student-specific unless mapped to this student specifically
            if code and code not in student_specific_codes:
                subjects_map[code] = {
                    "subjectCode": code,
                    "subjectName": sub.get("subjectName", ""),
                    "department": sub.get("department", dept),
                    "semester": sub.get("semester", semester),
                    "credits": sub.get("credits", 0),
                    "paperType": sub.get("paperType", "THEORY"),
                    "category": "REGULAR",
                    "source": "regular"
                }

    # 3. Fetch student-specific subject mappings (arrear, honours, minor, etc.)
    async for mapping in db.student_subjects.find({"registerNumber": reg_no}):
        code = str(mapping.get("subjectCode", "")).strip().upper()
        if not code:
            continue

        # Try to enrich with full subject details from db.subjects
        subject_detail = await db.subjects.find_one({"subjectCode": code})

        category = str(mapping.get("category", "OTHER")).strip().upper()
        subjects_map[code] = {
            "subjectCode": code,
            "subjectName": mapping.get("subjectName") or (subject_detail.get("subjectName") if subject_detail else "") or code,
            "department": mapping.get("department") or (subject_detail.get("department") if subject_detail else dept),
            "semester": mapping.get("subjectSemester") or (subject_detail.get("semester") if subject_detail else semester),
            "credits": mapping.get("credits") or (subject_detail.get("credits") if subject_detail else 0),
            "paperType": (subject_detail.get("paperType") if subject_detail else "THEORY"),
            "category": category,
            "source": "specific"
        }

    return {
        "registerNumber": reg_no,
        "studentName": student.get("name", ""),
        "department": dept,
        "semester": semester,
        "subjects": list(subjects_map.values()),
        "totalSubjects": len(subjects_map)
    }

