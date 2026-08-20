from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database import db, clean_doc
from app.services.arrear_service import arrear_service
import re

router = APIRouter()

@router.get("/settings")
async def get_settings():
    settings = await db.arrear_settings.find_one({})
    if not settings:
        settings = {
            "internalValiditySemesters": 3,
            "expiredInternalTheoryPassPercentage": 50.0
        }
    return clean_doc(settings)

@router.post("/settings")
async def update_settings(data: Dict[str, Any]):
    validity = int(data.get("internalValiditySemesters", 3))
    theory_pct = float(data.get("expiredInternalTheoryPassPercentage", 50.0))
    await db.arrear_settings.update_one(
        {},
        {"$set": {
            "internalValiditySemesters": validity,
            "expiredInternalTheoryPassPercentage": theory_pct,
            "updatedAt": datetime.utcnow()
        }},
        upsert=True
    )
    return {"message": "Settings updated successfully"}

@router.post("/validate")
async def validate_records(rows: List[Dict[str, Any]]):
    preview = []
    errors = []
    warnings = []
    seen_pairs = set()

    for idx, row in enumerate(rows, start=1):
        roll_no = str(row.get("rollNo") or row.get("Roll No") or "").strip().upper()
        subj_code = str(row.get("subjectCode") or row.get("Subject Code") or "").strip().upper()
        orig_sem_raw = row.get("originalSemester") or row.get("Original Semester")
        internal_mark_raw = row.get("internalMark") or row.get("Internal Mark")

        row_id = f"Row {idx}"

        # 1. Basic Fields checks
        if not roll_no:
            errors.append(f"{row_id}: Missing Roll No / Register Number.")
            continue
        if not subj_code:
            errors.append(f"{row_id}: Missing Subject Code.")
            continue
        
        # Check local duplication
        pair = (roll_no, subj_code)
        if pair in seen_pairs:
            warnings.append(f"{row_id}: Duplicate in upload file for {roll_no} - {subj_code}.")
        seen_pairs.add(pair)

        # Validate Original Semester
        try:
            orig_sem = int(float(str(orig_sem_raw)))
            if orig_sem < 1 or orig_sem > 10:
                raise ValueError()
        except (TypeError, ValueError):
            errors.append(f"{row_id}: Invalid original semester value ({orig_sem_raw}).")
            continue

        # Validate Internal Mark
        try:
            internal_mark = float(str(internal_mark_raw))
            if internal_mark < 0.0 or internal_mark > 100.0:
                raise ValueError()
        except (TypeError, ValueError):
            errors.append(f"{row_id}: Invalid internal mark ({internal_mark_raw}). Must be 0 to 100.")
            continue

        # 2. Look up Student
        student = await db.students.find_one({"registerNumber": roll_no})
        if not student:
            # Try case-insensitive fallback
            student = await db.students.find_one({"registerNumber": {"$regex": f"^{re.escape(roll_no)}$", "$options": "i"}})
        if not student:
            errors.append(f"{row_id}: Student '{roll_no}' does not exist in student records.")
            continue

        # 3. Look up Subject in Subject Master
        subject = await db.subjects.find_one({"subjectCode": subj_code})
        if not subject:
            subject = await db.subjects.find_one({"subjectCode": {"$regex": f"^{re.escape(subj_code)}$", "$options": "i"}})
        if not subject:
            errors.append(f"{row_id}: Subject Code '{subj_code}' not found in Subject Master.")
            continue

        # Check DB duplicates/exists already
        existing = await db.arrear_internals.find_one({"registerNumber": student["registerNumber"], "subjectCode": subject["subjectCode"]})
        if existing:
            warnings.append(f"{row_id}: Record already exists in DB for {roll_no} - {subj_code}. Saving will overwrite.")

        preview.append({
            "rollNo": student["registerNumber"],
            "studentName": student.get("name") or "Unknown",
            "department": student.get("department") or subject.get("department") or "",
            "currentSemester": student.get("semester") or 1,
            "subjectCode": subject["subjectCode"],
            "subjectName": subject.get("subjectName") or "Unknown",
            "originalSemester": orig_sem,
            "internalMark": internal_mark,
            "credits": subject.get("credits") or 3.0,
            "paperType": subject.get("paperType") or "THEORY",
            "regulation": subject.get("regulation") or "2021"
        })

    return {
        "preview": preview,
        "errors": errors,
        "warnings": warnings,
        "valid": len(errors) == 0
    }

@router.post("/save")
async def save_records(rows: List[Dict[str, Any]]):
    saved_count = 0
    for row in rows:
        roll_no = str(row.get("rollNo") or row.get("Roll No") or "").strip().upper()
        subj_code = str(row.get("subjectCode") or row.get("Subject Code") or "").strip().upper()
        orig_sem = int(float(str(row.get("originalSemester") or row.get("Original Semester"))))
        internal_mark = float(str(row.get("internalMark") or row.get("Internal Mark")))

        # Re-verify student & subject details for database consistency
        student = await db.students.find_one({"registerNumber": roll_no})
        subject = await db.subjects.find_one({"subjectCode": subj_code})
        
        if not student or not subject:
            continue

        doc = {
            "registerNumber": student["registerNumber"],
            "studentName": student.get("name") or "Unknown",
            "department": student.get("department") or subject.get("department") or "",
            "subjectCode": subject["subjectCode"],
            "subjectName": subject.get("subjectName") or "Unknown",
            "credits": float(subject.get("credits") or 0.0),
            "paperType": subject.get("paperType") or "THEORY",
            "regulation": subject.get("regulation") or "2021",
            "originalSemester": orig_sem,
            "internalMark": internal_mark,
            "updatedAt": datetime.utcnow()
        }

        await db.arrear_internals.update_one(
            {"registerNumber": student["registerNumber"], "subjectCode": subject["subjectCode"]},
            {
                "$set": doc,
                "$setOnInsert": {"createdAt": datetime.utcnow()}
            },
            upsert=True
        )
        saved_count += 1

    return {"message": f"Successfully saved {saved_count} arrear internal records."}

@router.get("/records")
async def get_records(
    rollNo: Optional[str] = Query(None),
    subjectCode: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    # Fetch settings for dynamic calculation
    settings = await arrear_service.get_arrear_settings()
    validity_limit = settings.get("internalValiditySemesters", 3)

    query = {}
    if rollNo:
        query["registerNumber"] = {"$regex": re.escape(rollNo.strip()), "$options": "i"}
    if subjectCode:
        query["subjectCode"] = {"$regex": re.escape(subjectCode.strip()), "$options": "i"}
    if department and department != "ALL":
        query["department"] = department.strip().upper()

    cursor = db.arrear_internals.find(query)
    records = []
    async for doc in cursor:
        rec = clean_doc(doc)
        student = await db.students.find_one({"registerNumber": rec["registerNumber"]})
        current_sem = int(student.get("semester") or 1) if student else 1
        orig_sem = int(rec.get("originalSemester") or 1)
        elapsed = current_sem - orig_sem

        rec["currentSemester"] = current_sem
        rec["studentName"] = student.get("name") if student else rec.get("studentName", "Unknown")
        rec["batch"] = student.get("batch") if student else ""

        # Dynamic status
        is_valid = elapsed < validity_limit
        status_str = "VALID" if is_valid else "EXPIRED"

        # Override check
        override = rec.get("override")
        if override:
            status_str = "VALID" if override.get("status") == "VALID" else "EXPIRED"
            rec["isOverridden"] = True
            rec["overrideDetails"] = override
        else:
            rec["isOverridden"] = False

        rec["calculatedStatus"] = status_str
        rec["elapsedSemesters"] = elapsed

        # Filter by status if requested
        if status:
            if status == "VALID" and status_str != "VALID":
                continue
            if status == "EXPIRED" and status_str != "EXPIRED":
                continue
            if status == "OVERRIDDEN" and not rec["isOverridden"]:
                continue

        records.append(rec)

    return records

@router.post("/override")
async def set_override(data: Dict[str, Any]):
    reg_no = str(data.get("registerNumber", "")).strip().upper()
    subj_code = str(data.get("subjectCode", "")).strip().upper()
    status = str(data.get("status", "")).strip().upper()
    reason = str(data.get("reason", "")).strip()
    override_expiry = data.get("overrideExpirySem")

    if not reg_no or not subj_code or not status or not reason:
        raise HTTPException(status_code=400, detail="Missing required parameters for override.")

    record = await db.arrear_internals.find_one({"registerNumber": reg_no, "subjectCode": subj_code})
    if not record:
        raise HTTPException(status_code=404, detail="Arrear internal record not found.")

    override_doc = {
        "status": status,
        "reason": reason,
        "changedBy": "Admin",
        "changedAt": datetime.utcnow().isoformat(),
        "overrideExpirySem": int(override_expiry) if override_expiry else None
    }

    await db.arrear_internals.update_one(
        {"registerNumber": reg_no, "subjectCode": subj_code},
        {"$set": {
            "override": override_doc,
            "updatedAt": datetime.utcnow()
        }}
    )
    return {"message": f"Successfully overrode status to {status} for {reg_no} ({subj_code})."}

@router.post("/remove-override")
async def remove_override(data: Dict[str, Any]):
    reg_no = str(data.get("registerNumber", "")).strip().upper()
    subj_code = str(data.get("subjectCode", "")).strip().upper()
    await db.arrear_internals.update_one(
        {"registerNumber": reg_no, "subjectCode": subj_code},
        {"$unset": {"override": ""}}
    )
    return {"message": "Override removed successfully"}
