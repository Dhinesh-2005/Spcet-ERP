import re
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Dict, Any
from io import BytesIO
from bson import ObjectId
from app.database import db, clean_doc
from app.models.schemas import SubjectModel, ExternalMarksModel, QuestionPaperModel
from app.services.result_service import result_service

router = APIRouter()


def _clean_string(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def _get_cell_value(cell: Any) -> str:
    if cell is None:
        return ""
    if isinstance(cell, str):
        return cell.strip()
    if isinstance(cell, (int, float)):
        return str(cell)
    return ""


def _find_column_index(row: List[Any], targets: List[str]) -> int:
    if not row:
        return -1
    for index, cell in enumerate(row):
        value = _clean_string(_get_cell_value(cell))
        if not value:
            continue
        for target in targets:
            if target in value:
                return index
    return -1


def _scan_for_prefix(row: List[Any], prefix: str, indexes: List[int]) -> None:
    if not row:
        return
    for index, cell in enumerate(row):
        value = _clean_string(_get_cell_value(cell))
        if value.startswith(prefix) and index not in indexes:
            indexes.append(index)


def _scan_for_ut(row: List[Any], indexes: List[int]) -> None:
    if not row:
        return
    for index, cell in enumerate(row):
        value = _clean_string(_get_cell_value(cell))
        if value.startswith("ut") and "60" not in value and "avg" not in value and "total" not in value and index not in indexes:
            indexes.append(index)


def _get_numeric_value(cell: Any) -> float:
    if cell is None:
        return 0.0
    if isinstance(cell, (int, float)):
        return float(cell)
    if isinstance(cell, str):
        value = cell.strip()
        if value in {"", "-", "Ab", "AB", "NA", "N/A"}:
            return 0.0
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0

@router.post("/subjects")
async def upload_subjects(subjects: List[SubjectModel]):
    for subject in subjects:
        existing = await db.subjects.find_one({"subjectCode": subject.subjectCode, "department": subject.department})
        if existing:
            subject.id = str(existing.get("_id"))
        await db.subjects.update_one(
            {"subjectCode": subject.subjectCode, "department": subject.department},
            {"$set": subject.dict(exclude_none=True, exclude={"id"})},
            upsert=True,
        )
    return {"message": "Subjects uploaded successfully", "count": len(subjects)}

@router.post("/logins")
async def upload_logins(users: List[Dict[str, Any]]):
    for user in users:
        role = str(user.get("role", "")).lower()
        if role == "student":
            await db.students.update_one(
                {"registerNumber": user.get("registerNumber")},
                {"$set": {"registerNumber": user.get("registerNumber"), "name": user.get("name"), "password": user.get("password"), "department": user.get("department"), "semester": user.get("semester"), "year": user.get("year") or (int(user.get("semester")/2) if user.get("semester") else None), "role": "student"}},
                upsert=True,
            )
        elif role == "faculty":
            await db.faculties.update_one(
                {"registerNumber": user.get("registerNumber")},
                {"$set": {"registerNumber": user.get("registerNumber"), "name": user.get("name"), "password": user.get("password"), "department": user.get("department"), "role": "faculty"}},
                upsert=True,
            )
        elif role == "hod":
            await db.hods.update_one(
                {"registerNumber": user.get("registerNumber")},
                {"$set": {"registerNumber": user.get("registerNumber"), "name": user.get("name"), "password": user.get("password"), "department": user.get("department"), "role": "hod"}},
                upsert=True,
            )
    return {"message": "Logins sorted and uploaded successfully", "count": len(users)}

@router.get("/logins")
async def get_logins():
    users = []
    async for doc in db.students.find({}):
        if doc.get("registerNumber") == "admin":
            continue
        users.append(clean_doc(doc))
    async for doc in db.faculties.find({}):
        if "role" not in doc:
            doc["role"] = "faculty"
        users.append(clean_doc(doc))
    async for doc in db.hods.find({}):
        if "role" not in doc:
            doc["role"] = "hod"
        users.append(clean_doc(doc))
    return users

@router.post("/promote-students")
async def promote_students(department: str, currentSemester: int):
    students = [s async for s in db.students.find({"department": department, "semester": currentSemester})]
    if not students:
        raise HTTPException(status_code=400, detail={"error": f"No students found in {department} Semester {currentSemester}"})
    promoted_count = 0
    graduated_count = 0
    for student in students:
        if student.get("semester", 0) < 8:
            new_sem = student.get("semester", 0) + 1
            await db.students.update_one({"registerNumber": student["registerNumber"]}, {"$set": {"semester": new_sem, "year": int((new_sem + 1) / 2)}})
            promoted_count += 1
        elif student.get("semester") == 8:
            await db.students.update_one({"registerNumber": student["registerNumber"]}, {"$set": {"semester": 99, "year": 5}})
            graduated_count += 1
    return {"message": f"✅ Promoted {promoted_count} students. 🎓 Graduated {graduated_count} students!"}

@router.post("/internal-upload")
async def upload_internal_file(file: UploadFile = File(...), subjectCode: str = Form(...), department: str = Form(...)):
    subject = await db.subjects.find_one({"subjectCode": subjectCode, "department": department})
    if not subject:
        raise HTTPException(status_code=400, detail={"error": f"Subject not found: {subjectCode} for department {department}"})

    content = await file.read()
    import openpyxl

    workbook = openpyxl.load_workbook(filename=BytesIO(content), data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))

    anchor_row_idx = -1
    for idx, row in enumerate(rows[:50]):
        if not row:
            continue
        for cell in row:
            if _clean_string(cell).find("registernumber") != -1 or _clean_string(cell).find("regno") != -1:
                anchor_row_idx = idx
                break
        if anchor_row_idx != -1:
            break

    if anchor_row_idx == -1:
        raise HTTPException(status_code=400, detail={"error": "Register Number header not found"})

    main_header = list(rows[anchor_row_idx] or [])
    sub_header = list(rows[anchor_row_idx + 1] or []) if anchor_row_idx + 1 < len(rows) else []

    reg_no_idx = _find_column_index(main_header, ["registernumber", "regno"])
    if reg_no_idx == -1:
        raise HTTPException(status_code=400, detail={"error": "Register Number column not found"})

    ut_indexes: List[int] = []
    _scan_for_ut(sub_header, ut_indexes)
    _scan_for_ut(main_header, ut_indexes)

    exp_indexes: List[int] = []
    _scan_for_prefix(sub_header, "ex", exp_indexes)
    _scan_for_prefix(main_header, "ex", exp_indexes)

    marks40_idx = _find_column_index(sub_header, ["marks40", "theoryseminarscore", "rubrics", "seminar"])
    if marks40_idx == -1:
        marks40_idx = _find_column_index(main_header, ["marks40", "theoryseminarscore", "rubrics", "seminar"])

    model_idx = _find_column_index(sub_header, ["025", "25", "model"])
    if model_idx == -1:
        model_idx = _find_column_index(main_header, ["025", "25", "model"])

    processed_count = 0
    start_data_row = anchor_row_idx + 2
    for row_idx in range(start_data_row, len(rows)):
        row = rows[row_idx]
        if not row or reg_no_idx >= len(row):
            continue

        reg_no = str(_get_cell_value(row[reg_no_idx])).strip()
        if len(reg_no) < 5 or "sample" in reg_no.lower():
            continue

        theory_part = 0.0
        practical_part = 0.0
        theory_ut_score = 0.0
        theory_seminar_score = 0.0
        practical_exp_score = 0.0
        practical_model_score = 0.0

        paper_type = (subject.get("paperType") or "THEORY").upper()
        if paper_type != "PRACTICAL":
            ut_sum = 0.0
            for idx in ut_indexes:
                if idx < len(row):
                    ut_sum += _get_numeric_value(row[idx])
            divisor = len(ut_indexes) if ut_indexes else 1.0
            ut_avg = ut_sum / divisor
            theory_ut_score = ut_avg * 0.6
            if marks40_idx != -1 and marks40_idx < len(row):
                theory_seminar_score = _get_numeric_value(row[marks40_idx])
            theory_part = theory_ut_score + theory_seminar_score

        if paper_type != "THEORY":
            exp_sum = 0.0
            for idx in exp_indexes:
                if idx < len(row):
                    exp_sum += _get_numeric_value(row[idx])
            exp_avg = exp_sum / len(exp_indexes) if exp_indexes else 0.0
            if exp_avg > 0 and exp_avg <= 20:
                exp_avg = exp_avg * 10
            practical_exp_score = exp_avg * 0.75
            practical_model_score = _get_numeric_value(row[model_idx]) if model_idx != -1 and model_idx < len(row) else 0.0
            practical_part = practical_exp_score + practical_model_score

        if paper_type == "THEORY":
            final_internal = theory_part
        elif paper_type == "PRACTICAL":
            final_internal = practical_part
        else:
            final_internal = (theory_part + practical_part) / 2.0

        payload = {
            "registerNumber": reg_no,
            "subjectCode": subjectCode,
            "theoryUtScore": theory_ut_score,
            "theorySeminarScore": theory_seminar_score,
            "practicalExpScore": practical_exp_score,
            "practicalModelScore": practical_model_score,
            "finalInternal": final_internal,
        }
        await db.internals.update_one(
            {"registerNumber": reg_no, "subjectCode": subjectCode},
            {"$set": payload},
            upsert=True,
        )
        processed_count += 1

    return {"message": f"Internal marks processed for {subjectCode}", "count": processed_count}

@router.get("/fetch-subjects")
async def fetch_subjects(department: str, semester: int, paperType: str = None):
    query = {"department": department, "semester": semester}
    if paperType:
        query["paperType"] = paperType
    return [clean_doc(doc) async for doc in db.subjects.find(query)]

@router.post("/external")
async def upload_external_marks(marks: List[ExternalMarksModel]):
    for mark in marks:
        await db.externals.update_one({"registerNumber": mark.registerNumber, "subjectCode": mark.subjectCode}, {"$set": mark.dict()}, upsert=True)
    return {"message": "External marks uploaded", "count": len(marks)}

@router.post("/calculate-results")
async def calculate_results():
    await result_service.calculate_results()
    return {"message": "Results calculated! Check Preview."}

@router.get("/preview")
async def preview_results(semester: str, department: str):
    return await result_service.get_results_by_sem_and_dept(semester, department)

@router.post("/publish")
async def publish_results(semester: str, department: str):
    await result_service.publish_results(semester, department)
    return {"message": "Results are LIVE!"}

@router.delete("/drop-drafts")
async def drop_drafts(semester: str, department: str):
    deleted = await db.results.delete_many({"semester": semester, "department": department, "isPublished": False})
    return {"message": f"Deleted {deleted.deleted_count} drafts."}

@router.post("/results")
async def upload_manual_results(rawResults: List[Dict[str, Any]]):
    results = []
    for row in rawResults:
        result = {
            "registerNumber": row.get("registerNumber") or row.get("rollNo"),
            "subjectCode": row.get("subjectCode", ""),
            "semester": row.get("semester", ""),
            "department": row.get("department", ""),
            "grade": row.get("grade", ""),
            "result": row.get("result", ""),
            "finalMarks": int(float(str(row.get("mark", 0)))) if str(row.get("mark", 0)).replace('.', '', 1).isdigit() else 0,
            "isPublished": False,
        }
        results.append(result)
    if results:
        await db.results.insert_many(results)
    return {"message": f"✅ Successfully uploaded {len(results)} drafts."}

@router.delete("/unpublish")
async def unpublish_live_results(semester: str, department: str):
    deleted = await db.results.delete_many({"semester": semester, "department": department, "isPublished": True})
    return {"message": f"Successfully dropped {deleted.deleted_count} live results."}

@router.post("/save-question-paper")
async def save_question_paper(paper: QuestionPaperModel):
    await db.questionpapers.insert_one(paper.dict(exclude_none=True, exclude={"id"}))
    return {"message": "Question Paper Saved to Admin Portal!"}

@router.get("/question-papers")
async def get_question_papers():
    return [clean_doc(doc) async for doc in db.questionpapers.find({})]

@router.delete("/question-paper/{paper_id}")
async def delete_question_paper(paper_id: str):
    await db.questionpapers.delete_one({"_id": ObjectId(paper_id)})
    return {"message": "Question Paper successfully deleted."}
