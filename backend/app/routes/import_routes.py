import re
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from typing import List, Dict, Any, Optional
from io import BytesIO
from bson import ObjectId
from app.database import db, clean_doc
from app.models.schemas import SubjectModel, ExternalMarksModel, QuestionPaperModel, StudentSubjectModel, OtherSubjectUploadRow
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
    imported = 0
    skipped = []

    for subject in subjects:
        # Normalise & validate mandatory fields
        subject.subjectCode = subject.subjectCode.strip().upper()
        subject.department  = (subject.department or "").strip().upper()

        if not subject.subjectCode:
            skipped.append("row: missing Subject Code"); continue
        if not subject.department:
            skipped.append(f"{subject.subjectCode}: missing Department"); continue
        if not subject.semester or subject.semester < 1:
            skipped.append(f"{subject.subjectCode}: invalid Semester ({subject.semester})"); continue

        # 1. Fetch Subject details from Subject Master (db.subjects) using subjectCode
        master_subject = await db.subjects.find_one({"subjectCode": subject.subjectCode, "department": subject.department})
        if not master_subject:
            master_subject = await db.subjects.find_one({"subjectCode": subject.subjectCode})
        if not master_subject:
            all_subs = [s async for s in db.subjects.find({})]
            clean_code = _clean_string(subject.subjectCode)
            master_subject = next((s for s in all_subs if _clean_string(s.get("subjectCode")) == clean_code), None)

        if not master_subject:
            skipped.append(f"{subject.subjectCode}: Not found in Subject Master. Please register it in Academic Management / Subject Master first.")
            continue

        subject_name = master_subject.get("subjectName") or subject.subjectName or subject.subjectCode
        credits_val  = float(master_subject.get("credits") if master_subject.get("credits") is not None else (subject.credits or 3.0))
        paper_type   = master_subject.get("paperType", "THEORY")
        regulation   = master_subject.get("regulation", "2021")

        imported += 1

        # 2. Assign regular subjects to all students in that dept & semester in db.student_subjects
        students_cursor = db.students.find({
            "department": subject.department,
            "semester": int(subject.semester)
        })
        async for student in students_cursor:
            reg_no = str(student.get("registerNumber", "")).strip().upper()
            if reg_no:
                await db.student_subjects.update_one(
                    {"registerNumber": reg_no, "subjectCode": subject.subjectCode},
                    {
                        "$set": {
                            "registerNumber": reg_no,
                            "subjectCode": subject.subjectCode,
                            "subjectName": subject_name,
                            "subjectSemester": int(subject.semester),
                            "credits": credits_val,
                            "paperType": paper_type,
                            "regulation": regulation,
                            "category": "REGULAR",
                            "department": subject.department
                        }
                    },
                    upsert=True
                )

    return {
        "message": f"Subjects uploaded & assigned: {imported} processed, {len(skipped)} skipped.",
        "imported": imported,
        "skipped": len(skipped),
        "skippedDetails": skipped
    }


@router.post("/other-subjects")
async def upload_other_subjects(rows: List[Dict[str, Any]]):
    total_processed = 0
    successful_assignments = 0
    duplicate_skipped = 0
    invalid_roll_numbers = []
    invalid_subject_codes = []
    validation_errors = []

    VALID_CATEGORIES = {"ARREAR", "HONOURS", "MINOR", "ELECTIVE", "VALUE ADDED", "OTHER"}

    for row_idx, row in enumerate(rows, start=1):
        total_processed += 1
        
        subject_code = str(row.get("subjectCode") or row.get("Subject Code") or "").strip().upper()
        subject_name = str(row.get("subjectName") or row.get("Subject Name") or "").strip()
        subject_sem_raw = row.get("subjectSemester") or row.get("Subject Semester") or row.get("semester") or 0
        try:
            subject_sem = int(subject_sem_raw)
        except (ValueError, TypeError):
            subject_sem = 0

        credits_raw = row.get("credits") or row.get("Credits") or row.get("credit") or row.get("Credit") or 0
        try:
            subject_credits = max(0.0, float(str(credits_raw)))
        except (ValueError, TypeError):
            subject_credits = 0.0
            
        category = str(row.get("category") or row.get("Category") or "OTHER").strip().upper()
        if category not in VALID_CATEGORIES:
            category = "OTHER"
            
        roll_numbers_raw = str(
            row.get("rollNumbers") or 
            row.get("Roll Numbers") or 
            row.get("rollNumber") or 
            row.get("Roll Number") or 
            row.get("registerNumber") or 
            row.get("Register Number") or ""
        ).strip()

        if not subject_code:
            validation_errors.append(f"Row {row_idx}: Missing Subject Code")
            continue

        if not roll_numbers_raw:
            validation_errors.append(f"Row {row_idx} ({subject_code}): No Roll Numbers provided")
            continue

        # 1. Verify/Look up Subject Code in db.subjects (with flexible matching & auto-registration)
        clean_sub_code = _clean_string(subject_code)
        existing_subject = await db.subjects.find_one({"subjectCode": subject_code})
        if not existing_subject:
            existing_subject = await db.subjects.find_one({"subjectCode": {"$regex": f"^{re.escape(subject_code)}$", "$options": "i"}})
        if not existing_subject:
            all_subs = [s async for s in db.subjects.find({})]
            existing_subject = next((s for s in all_subs if _clean_string(s.get("subjectCode")) == clean_sub_code), None)

        if existing_subject:
            # 2. Validate Subject Name matches Subject Code if provided
            db_sub_name = str(existing_subject.get("subjectName") or "").strip()
            if subject_name and db_sub_name:
                if _clean_string(subject_name) != _clean_string(db_sub_name):
                    validation_errors.append(
                        f"Row {row_idx}: Subject Name '{subject_name}' does not match registered Subject Master name '{db_sub_name}' for code {subject_code}"
                    )
                    continue
            # Update credits in db.subjects if a valid value is provided and differs
            existing_credits = float(existing_subject.get("credits") or 0)
            if subject_credits > 0 and subject_credits != existing_credits:
                await db.subjects.update_one(
                    {"subjectCode": subject_code},
                    {"$set": {"credits": subject_credits}}
                )
                existing_subject["credits"] = subject_credits
        else:
            # Subject MUST be available in Subject Master before assigning to students
            invalid_subject_codes.append(f"{subject_code} (Row {row_idx}: Not found in Subject Master)")
            validation_errors.append(
                f"Row {row_idx}: Subject Code '{subject_code}' does not exist in Subject Master. Please add it to Academic Management / Subject Master first."
            )
            continue


        # 3. Split Roll Numbers using commas, newlines, spaces, or semicolons
        rolls = [r.strip().upper() for r in re.split(r'[,;\s\n\r]+', roll_numbers_raw) if r.strip()]

        for roll in rolls:
            # 4. Verify student exists
            student = await db.students.find_one({"registerNumber": roll})
            if not student:
                student = await db.students.find_one({"registerNumber": {"$regex": f"^{re.escape(roll)}$", "$options": "i"}})

            if not student:
                invalid_roll_numbers.append(f"{roll} (for {subject_code})")
                continue

            target_reg = student.get("registerNumber", roll)

            # 5. Prevent duplicate subject assignments for the same student
            existing_mapping = await db.student_subjects.find_one({
                "registerNumber": target_reg,
                "subjectCode": subject_code
            })

            if existing_mapping:
                duplicate_skipped += 1
                continue

            # 6. Create student-subject mapping
            mapping_doc = {
                "registerNumber": target_reg,
                "subjectCode": subject_code,
                "subjectName": db_sub_name or subject_name,
                "subjectSemester": subject_sem or existing_subject.get("semester", 1),
                "category": category,
                "department": student.get("department", "")
            }
            await db.student_subjects.insert_one(mapping_doc)
            successful_assignments += 1

    return {
        "message": f"Processed {total_processed} record(s): {successful_assignments} successful assignments.",
        "totalProcessed": total_processed,
        "successfulAssignments": successful_assignments,
        "duplicateSkipped": duplicate_skipped,
        "invalidRollNumbers": list(set(invalid_roll_numbers)),
        "invalidSubjectCodes": list(set(invalid_subject_codes)),
        "validationErrors": validation_errors
    }


@router.get("/student-subjects")
async def get_student_subjects(registerNumber: str = None, subjectCode: str = None):
    query = {}
    if registerNumber:
        query["registerNumber"] = registerNumber.strip().upper()
    if subjectCode:
        query["subjectCode"] = subjectCode.strip().upper()
    docs = [clean_doc(doc) async for doc in db.student_subjects.find(query)]
    return docs


@router.post("/logins")
async def upload_logins(users: List[Dict[str, Any]]):
    students_in = 0
    faculty_in  = 0
    hods_in     = 0
    skipped     = []

    for user in users:
        role  = str(user.get("role", "")).lower().strip()
        reg   = str(user.get("registerNumber", "")).strip()
        name  = str(user.get("name", "")).strip()
        pwd   = str(user.get("password", "")).strip()
        dept  = str(user.get("department", "")).strip().upper()
        sem   = user.get("semester")
        yr    = user.get("year")

        if not reg:
            skipped.append("row: missing registerNumber"); continue

        if role == "student":
            if not dept:
                skipped.append(f"{reg}: missing department"); continue
            sem_int = int(sem) if sem else 0
            yr_int  = int(yr)  if yr  else (int(sem_int / 2) if sem_int else None)
            reg_val = str(user.get("regulation", "2021")).strip()
            await db.students.update_one(
                {"registerNumber": reg},
                {"$set": {
                    "registerNumber": reg,
                    "name":           name,
                    "password":       pwd,
                    "department":     dept,
                    "semester":       sem_int,
                    "year":           yr_int,
                    "regulation":     reg_val,
                    "role":           "student"
                }},
                upsert=True,
            )

            # Assign existing regular subjects for this dept & sem if available
            if dept and sem_int > 0:
                async for reg_sub in db.subjects.find({"department": dept, "semester": sem_int}):
                    sub_code = str(reg_sub.get("subjectCode", "")).strip().upper()
                    if sub_code:
                        await db.student_subjects.update_one(
                            {"registerNumber": reg, "subjectCode": sub_code},
                            {
                                "$set": {
                                    "registerNumber": reg,
                                    "subjectCode": sub_code,
                                    "subjectName": reg_sub.get("subjectName", ""),
                                    "subjectSemester": sem_int,
                                    "category": "REGULAR",
                                    "department": dept
                                }
                            },
                            upsert=True
                        )

            students_in += 1

        elif role == "faculty":
            await db.faculties.update_one(
                {"registerNumber": reg},
                {"$set": {
                    "registerNumber": reg,
                    "name":           name,
                    "password":       pwd,
                    "department":     dept,
                    "role":           "faculty"
                }},
                upsert=True,
            )
            faculty_in += 1

        elif role == "hod":
            await db.hods.update_one(
                {"registerNumber": reg},
                {"$set": {
                    "registerNumber": reg,
                    "name":           name,
                    "password":       pwd,
                    "department":     dept,
                    "role":           "hod"
                }},
                upsert=True,
            )
            hods_in += 1

        else:
            skipped.append(f"{reg}: unknown role '{role}'")

    parts = []
    if students_in: parts.append(f"{students_in} student(s)")
    if faculty_in:  parts.append(f"{faculty_in} faculty")
    if hods_in:     parts.append(f"{hods_in} HOD(s)")
    msg = f"Uploaded: {', '.join(parts) or 'none'}"
    if skipped: msg += f" | {len(skipped)} skipped"

    return {
        "message": msg,
        "students": students_in,
        "faculty":  faculty_in,
        "hods":     hods_in,
        "skipped":  len(skipped),
        "skippedDetails": skipped
    }

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
async def upload_internal_file(file: UploadFile = File(...), subjectCode: str = Form(...), department: str = Form("CSE")):
    query = {"subjectCode": subjectCode.strip().upper()}
    if department and department.upper() != "ALL":
        query["department"] = department.strip().upper()
    subject = await db.subjects.find_one(query)
    if not subject:
        subject = await db.subjects.find_one({"subjectCode": subjectCode.strip().upper()})
    if not subject:
        subject = {"paperType": "THEORY"}

    content = await file.read()
    import openpyxl

    workbook = openpyxl.load_workbook(filename=BytesIO(content), data_only=True)
    processed_count = 0

    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue

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
            continue

        main_header = list(rows[anchor_row_idx] or [])
        sub_header = list(rows[anchor_row_idx + 1] or []) if anchor_row_idx + 1 < len(rows) else []

        reg_no_idx = _find_column_index(main_header, ["registernumber", "regno"])
        if reg_no_idx == -1:
            continue

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

    if processed_count == 0:
        raise HTTPException(status_code=400, detail={"error": "No valid student register numbers found in the Excel sheets"})

    return {"message": f"Internal marks processed for {subjectCode}", "count": processed_count}

@router.get("/fetch-subjects")
async def fetch_subjects(department: str = None, semester: Any = None, paperType: str = None, regulation: str = None):
    query = {}
    if department and department.upper() != "ALL":
        query["department"] = {"$regex": f"^{department.strip()}$", "$options": "i"}
    if semester is not None and str(semester).upper() != "ALL" and int(semester) != 0:
        query["semester"] = int(semester)
    if paperType and paperType.upper() != "ALL":
        query["paperType"] = paperType
    if regulation and regulation.upper() != "ALL":
        query["regulation"] = {"$regex": f"^{regulation.strip()}$", "$options": "i"}
    return [clean_doc(doc) async for doc in db.subjects.find(query)]

@router.get("/all-subjects")
async def get_all_subjects(
    department: str = None,
    semester: int = None,
    subjectCode: str = None,
    subjectName: str = None,
    regulation: str = None,
):
    """
    Return subjects that are currently assigned to students (from db.student_subjects)
    enriched with metadata from Subject Master (db.subjects) for the Setup module subject browser.
    """
    st_query = {}
    if department and department.upper() != "ALL":
        st_query["department"] = {"$regex": f"^{department.strip()}$", "$options": "i"}
    if semester and int(semester) != 0:
        st_query["$or"] = [{"subjectSemester": int(semester)}, {"semester": int(semester)}]
    if subjectCode:
        st_query["subjectCode"] = {"$regex": subjectCode.strip(), "$options": "i"}

    # Group distinct assigned subjects by (subjectCode, department, semester)
    distinct_assigned = {}
    async for doc in db.student_subjects.find(st_query):
        code = str(doc.get("subjectCode", "")).strip().upper()
        if not code:
            continue
        dept = str(doc.get("department", "")).strip().upper()
        sem = int(doc.get("subjectSemester") or doc.get("semester") or 1)
        key = (code, dept, sem)
        if key not in distinct_assigned:
            distinct_assigned[key] = {
                "subjectCode": code,
                "department": dept,
                "semester": sem,
                "subjectName": doc.get("subjectName") or code,
                "category": doc.get("category", "REGULAR")
            }

    # Pre-fetch all Master subjects for fast, flexible lookup
    master_subjects_list = [clean_doc(s) async for s in db.subjects.find({})]

    results = []
    for (code, dept, sem), info in distinct_assigned.items():
        clean_code = _clean_string(code)
        
        # 1. Exact match by code & dept with non-empty subjectName
        master_doc = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("department") == dept and s.get("subjectName")), None)
        # 2. Match by code only with non-empty subjectName across any department
        if not master_doc:
            master_doc = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("subjectName")), None)
        # 3. Clean string match by code with non-empty subjectName
        if not master_doc:
            master_doc = next((s for s in master_subjects_list if _clean_string(s.get("subjectCode")) == clean_code and s.get("subjectName")), None)
        # 4. Fallback to any matching doc if no doc has non-empty subjectName
        if not master_doc:
            master_doc = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("department") == dept), None)
        if not master_doc:
            master_doc = next((s for s in master_subjects_list if s.get("subjectCode") == code), None)

        reg = str(master_doc.get("regulation") or "2021").strip() if (master_doc and master_doc.get("regulation")) else "2021"
        s_name = str(master_doc.get("subjectName") or info.get("subjectName") or "").strip() if master_doc else str(info.get("subjectName") or "").strip()
        credits_val = float(master_doc.get("credits") or 0) if master_doc else 0.0
        paper_type = str(master_doc.get("paperType") or "THEORY").strip().upper() if master_doc else "THEORY"

        # Apply name & regulation filters if provided
        if subjectName and not re.search(re.escape(subjectName.strip()), s_name, re.IGNORECASE):
            continue
        if regulation and regulation.upper() != "ALL" and reg and not re.search(f"^{re.escape(regulation.strip())}$", reg, re.IGNORECASE):
            continue

        results.append({
            "_id": f"{code}_{dept}_{sem}",
            "subjectCode": code,
            "subjectName": s_name,
            "department": dept,
            "semester": sem,
            "credits": credits_val,
            "paperType": paper_type,
            "regulation": reg,
            "category": info["category"]
        })

    # Sort results by department, semester, subjectCode
    results.sort(key=lambda x: (x["department"], x["semester"], x["subjectCode"]))
    return results

@router.delete("/subjects/{subjectCode}")
async def delete_subject(subjectCode: str, department: Optional[str] = Query(None), semester: Optional[int] = Query(None)):
    """Unassign subject from particular department & semester (Setup Module). Preserves db.subjects."""
    code = subjectCode.strip().upper()
    q = {"subjectCode": code}
    if department and department.strip().upper() != "ALL":
        q["department"] = department.strip().upper()
    if semester and int(semester) != 0:
        q["subjectSemester"] = int(semester)

    result = await db.student_subjects.delete_many(q)
    return {"message": f"Unassigned subject {code} for selected department/semester ({result.deleted_count} assignment(s) removed). Master record preserved."}

@router.post("/subjects/setup-bulk-delete")
async def setup_bulk_delete_subjects(payload: Dict[str, Any]):
    """Bulk unassign subjects from db.student_subjects for Setup Module."""
    items = payload.get("items", [])
    total_deleted = 0

    for item in items:
        code = str(item.get("subjectCode") or "").strip().upper()
        dept = str(item.get("department") or "").strip().upper()
        sem = item.get("semester")

        if not code:
            continue

        q = {"subjectCode": code}
        if dept and dept != "ALL":
            q["department"] = dept
        if sem and int(sem) != 0:
            q["subjectSemester"] = int(sem)

        res = await db.student_subjects.delete_many(q)
        total_deleted += res.deleted_count

    return {"message": f"Successfully unassigned {total_deleted} subject record(s). Master subjects preserved.", "deletedCount": total_deleted}

@router.post("/external")
async def upload_external_marks(marks: List[ExternalMarksModel]):
    if not marks:
        raise HTTPException(status_code=400, detail={"error": "No marks data provided"})

    uploaded = 0
    skipped_students = []
    skipped_subjects = []

    # Cache validated register numbers to avoid repeated DB calls
    validated_regs: Dict[str, bool] = {}

    for mark in marks:
        reg = (mark.registerNumber or "").strip()
        subj = (mark.subjectCode or "").strip().upper()

        if not reg or not subj:
            continue

        # Validate student exists in DB
        if reg not in validated_regs:
            student = await db.students.find_one({"registerNumber": reg})
            if not student:
                # Try case-insensitive fallback
                student = await db.students.find_one({"registerNumber": {"$regex": f"^{re.escape(reg)}$", "$options": "i"}})
            validated_regs[reg] = student is not None

        if not validated_regs[reg]:
            if reg not in skipped_students:
                skipped_students.append(reg)
            continue

        # Validate subject exists in DB
        subject = await db.subjects.find_one({"subjectCode": subj})
        if not subject:
            subject = await db.subjects.find_one({"subjectCode": {"$regex": f"^{re.escape(subj)}$", "$options": "i"}})
        if not subject:
            if subj not in skipped_subjects:
                skipped_subjects.append(subj)
            continue

        await db.externals.update_one(
            {"registerNumber": reg, "subjectCode": subj},
            {"$set": {"registerNumber": reg, "subjectCode": subj, "externalMarks": mark.externalMarks}},
            upsert=True,
        )
        uploaded += 1

    msg = f"✅ External marks uploaded: {uploaded} entries."
    if skipped_students:
        msg += f" ⚠️ {len(skipped_students)} unknown register number(s) skipped."
    if skipped_subjects:
        msg += f" ⚠️ {len(skipped_subjects)} unknown subject code(s) skipped."

    return {
        "message": msg,
        "uploaded": uploaded,
        "skippedStudents": skipped_students,
        "skippedSubjects": skipped_subjects,
    }

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
    paper_dict = paper.dict(exclude_none=True, exclude={"id"})

    sub_code = re.sub(r"[^A-Z0-9]", "", (paper.subjectCode or "").upper())
    cia_num = "1"
    if paper.unit:
        m = re.search(r"\d+", paper.unit)
        if m:
            cia_num = m.group(0)

    raw_qp = paper.qpCode or (f"CIA{cia_num}{sub_code}" if sub_code else "QP")
    base_qp = re.sub(r"-\d+$", "", raw_qp.strip())

    existing_count = await db.questionpapers.count_documents({
        "subjectCode": paper.subjectCode,
        "unit": paper.unit
    })
    seq = existing_count + 1
    paper_dict["qpCode"] = f"{base_qp}-{seq:02d}"

    await db.questionpapers.insert_one(paper_dict)
    return {"message": "Question Paper Saved to Admin Portal!", "qpCode": paper_dict["qpCode"]}

@router.get("/question-papers")
async def get_question_papers():
    docs = [clean_doc(doc) async for doc in db.questionpapers.find({}).sort("_id", 1)]
    base_counts = {}
    for doc in docs:
        if doc.get("qpCode") and re.search(r"-\d+$", doc["qpCode"]):
            continue
        sub_code = re.sub(r"[^A-Z0-9]", "", (doc.get("subjectCode") or doc.get("subject") or "").upper())
        unit_val = doc.get("unit") or ""
        cia_num = "1"
        if unit_val:
            m = re.search(r"\d+", unit_val)
            if m:
                cia_num = m.group(0)
        base_qp = f"CIA{cia_num}{sub_code}" if sub_code else "QP"
        base_counts[base_qp] = base_counts.get(base_qp, 0) + 1
        doc["qpCode"] = f"{base_qp}-{base_counts[base_qp]:02d}"
    return docs

@router.delete("/question-paper/{paper_id}")
async def delete_question_paper(paper_id: str):
    await db.questionpapers.delete_one({"_id": ObjectId(paper_id)})
    return {"message": "Question Paper successfully deleted."}
