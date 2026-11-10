import re
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.database import db, clean_doc, clean_docs
from app.models.schemas import AcademicRuleConfigModel, ArrearModel
from app.services.calculation_engine import calculation_engine, STATUS_PASS, STATUS_RA
from app.services.audit_service import audit_service

class ArrearService:
    """
    Centralized Arrear Lifecycle & Carry-Forward Service.
    Handles arrear registration upon RA result detection, dynamic 3-semester validity tracking,
    attempt incrementing, carry-forward views, and arrear clearance.
    """

    async def get_academic_config(self, department: str = "ALL", semester: Optional[int] = None) -> AcademicRuleConfigModel:
        query = {}
        if department and department != "ALL":
            query["department"] = department.strip().upper()
        if semester:
            query["semester"] = int(semester)

        doc = await db.academic_configs.find_one(query)
        if not doc and query:
            doc = await db.academic_configs.find_one({"isDefault": True})
        if not doc:
            return calculation_engine.get_default_config()

        return AcademicRuleConfigModel(**doc)

    async def get_arrear_internal_and_rules(
        self,
        register_number: str,
        subject_code: str,
        current_semester: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Determines the internal mark and passing rules for a student's arrear subject
        according to configured 3-semester internal validity rules.
        """
        reg_clean = str(register_number).strip().upper()
        sub_clean = str(subject_code).strip().upper()

        arrear = await db.arrears.find_one({
            "registerNumber": reg_clean,
            "subjectCode": sub_clean,
            "status": "PENDING"
        })

        if not arrear:
            # Fallback check in legacy arrear_internals collection
            arrear = await db.arrear_internals.find_one({
                "registerNumber": reg_clean,
                "subjectCode": sub_clean
            })
            if not arrear:
                return {
                    "has_arrear_record": False,
                    "internal_mark": 0.0,
                    "pass_threshold": 50.0,
                    "is_valid": False,
                    "use_stored_internal": False,
                    "internal_status": "INTERNAL NOT APPLICABLE",
                    "attempt_number": 1,
                    "original_semester": 1
                }

        # Resolve student's current semester
        student = await db.students.find_one({"registerNumber": reg_clean})
        curr_sem = int(current_semester or (student.get("semester") if student else 1) or 1)
        orig_sem = int(arrear.get("originalSemester") or 1)
        dept = arrear.get("department") or (student.get("department") if student else "ALL")

        cfg = await self.get_academic_config(department=dept, semester=curr_sem)
        validity_limit = getattr(cfg, "arrearValiditySemesters", 3)
        expired_pass_pct = getattr(cfg, "expiredArrearPassPercentage", 50.0)

        semesters_elapsed = max(0, curr_sem - orig_sem)
        is_valid = semesters_elapsed < validity_limit

        # Explicit override handling if present
        override = arrear.get("override")
        if override and override.get("status"):
            is_valid = (override.get("status").upper() == "VALID")

        original_internal = float(arrear.get("originalInternalMarks") or arrear.get("internalMarks") or arrear.get("internalMark") or 0.0)

        if is_valid:
            internal_mark = original_internal
            pass_threshold = cfg.overallPassPercentage
            use_stored_internal = True
            internal_status = "VALID"
        else:
            internal_mark = 0.0
            pass_threshold = expired_pass_pct
            use_stored_internal = False
            internal_status = "INTERNAL NOT APPLICABLE"

        return {
            "has_arrear_record": True,
            "internal_mark": internal_mark,
            "original_internal": original_internal,
            "pass_threshold": pass_threshold,
            "is_valid": is_valid,
            "use_stored_internal": use_stored_internal,
            "internal_status": internal_status,
            "semesters_elapsed": semesters_elapsed,
            "attempt_number": int(arrear.get("currentAttempt") or arrear.get("attemptNumber") or 1),
            "original_semester": orig_sem,
            "arrear_doc": clean_doc(arrear)
        }

    async def register_or_update_arrear(
        self,
        register_number: str,
        subject_code: str,
        semester: int,
        result: str,
        grade: str = "RA",
        grade_point: float = 0.0,
        final_marks: float = 0.0,
        internal_marks: float = 0.0,
        external_marks: float = 0.0,
        academic_year: str = "2025-2026",
        subject_name: Optional[str] = None,
        credits: Optional[float] = None,
        subject_type: Optional[str] = "THEORY"
    ) -> Optional[Dict[str, Any]]:
        """
        Creates or updates an arrear record when a result is calculated or published.
        - If result is FAIL/RA: Enrolls or increments attempt in db.arrears.
        - If result is PASS: Marks the arrear as CLEARED with clearedDate.
        """
        reg_clean = str(register_number).strip().upper()
        sub_clean = str(subject_code).strip().upper()
        res_clean = str(result or "").strip().upper()

        student = await db.students.find_one({"registerNumber": reg_clean})
        curr_sem = int(semester if semester is not None and int(semester) > 0 else (student.get("semester") if student else 1))
        now_iso = datetime.utcnow().isoformat()

        # Fetch subject info if not passed
        if not subject_name or credits is None:
            sub_doc = await db.subjects.find_one({"subjectCode": sub_clean})
            if sub_doc:
                subject_name = subject_name or sub_doc.get("subjectName", sub_clean)
                credits = credits if credits is not None else float(sub_doc.get("credits", 3.0))
                subject_type = subject_type or sub_doc.get("subjectType", "THEORY")
            else:
                subject_name = subject_name or sub_clean
                credits = credits if credits is not None else 3.0

        existing_arrear = await db.arrears.find_one({
            "registerNumber": reg_clean,
            "subjectCode": sub_clean,
            "status": "PENDING"
        })

        if res_clean == STATUS_PASS:
            # Student cleared the subject
            if existing_arrear:
                await db.arrears.update_one(
                    {"_id": existing_arrear["_id"]},
                    {
                        "$set": {
                            "status": "CLEARED",
                            "clearedDate": now_iso,
                            "finalMarks": final_marks,
                            "grade": grade,
                            "gradePoint": grade_point,
                            "clearedInSemester": curr_sem,
                            "updatedAt": now_iso
                        }
                    }
                )
                await audit_service.log_event(
                    user="system",
                    role="system",
                    action="ARREAR_CLEAR",
                    entity=f"Arrear:{reg_clean}:{sub_clean}",
                    old_value={"status": "PENDING", "attempt": existing_arrear.get("currentAttempt", 1)},
                    new_value={"status": "CLEARED", "clearedInSemester": curr_sem, "grade": grade, "finalMarks": final_marks}
                )
            return None

        # Result is FAIL / RA -> create or update arrear
        orig_sem = int(existing_arrear.get("originalSemester") or semester) if existing_arrear else semester
        orig_ay = existing_arrear.get("originalAcademicYear") or academic_year if existing_arrear else academic_year
        orig_int = float(existing_arrear.get("originalInternalMarks") or internal_marks) if existing_arrear else internal_marks

        prev_attempt = int(existing_arrear.get("currentAttempt", 1)) if existing_arrear else 0
        new_attempt = prev_attempt + 1 if existing_arrear else 1

        cfg = await self.get_academic_config(department=student.get("department") if student else "ALL", semester=curr_sem)
        validity_limit = getattr(cfg, "arrearValiditySemesters", 3)
        semesters_elapsed = max(0, curr_sem - orig_sem)
        is_valid = semesters_elapsed < validity_limit
        internal_status = "VALID" if is_valid else "INTERNAL_NOT_APPLICABLE"

        arrear_doc = {
            "registerNumber": reg_clean,
            "subjectCode": sub_clean,
            "subjectName": subject_name,
            "originalSemester": orig_sem,
            "originalAcademicYear": orig_ay,
            "credits": float(credits or 3.0),
            "subjectType": subject_type,
            "originalResult": STATUS_RA,
            "attemptNumber": new_attempt,
            "currentAttempt": new_attempt,
            "internalMarks": orig_int if is_valid else 0.0,
            "originalInternalMarks": orig_int,
            "externalMarks": external_marks,
            "finalMarks": final_marks,
            "grade": grade,
            "gradePoint": grade_point,
            "status": "PENDING",
            "internalStatus": internal_status,
            "semestersElapsed": semesters_elapsed,
            "currentSemester": curr_sem,
            "updatedAt": now_iso
        }

        await db.arrears.update_one(
            {"registerNumber": reg_clean, "subjectCode": sub_clean, "status": "PENDING"},
            {"$set": arrear_doc},
            upsert=True
        )

        await audit_service.log_event(
            user="system",
            role="system",
            action="ARREAR_CREATE",
            entity=f"Arrear:{reg_clean}:{sub_clean}",
            old_value={"status": existing_arrear.get("status") if existing_arrear else None, "attempt": prev_attempt},
            new_value={"status": "PENDING", "attempt": new_attempt, "originalSemester": orig_sem, "finalMarks": final_marks}
        )

        # Maintain backward compatibility with legacy arrear_internals collection
        await db.arrear_internals.update_one(
            {"registerNumber": reg_clean, "subjectCode": sub_clean},
            {
                "$set": {
                    "registerNumber": reg_clean,
                    "subjectCode": sub_clean,
                    "originalSemester": orig_sem,
                    "internalMark": orig_int,
                    "status": "PENDING",
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        return arrear_doc

    async def get_student_carry_forward_view(self, register_number: str) -> Dict[str, Any]:
        """
        Returns segregated current semester subjects and active carry-forward arrear subjects.
        Guarantees original semester of arrears is preserved (never altered to current semester).
        """
        reg_clean = str(register_number).strip().upper()
        student = await db.students.find_one({"registerNumber": reg_clean})

        curr_sem = int(student.get("semester") or 1) if student else 1
        dept = student.get("department", "CSE") if student else "CSE"

        # 1. Fetch current semester regular subjects
        curr_cur = db.student_subjects.find({
            "registerNumber": reg_clean,
            "semester": curr_sem
        })
        current_subjects = [clean_doc(d) async for d in curr_cur]

        if not current_subjects:
            # Fallback to department curriculum subjects for this semester
            sub_cur = db.subjects.find({"department": dept, "semester": curr_sem})
            current_subjects = [clean_doc(s) async for s in sub_cur]

        # 2. Fetch active pending arrears
        arrears_cur = db.arrears.find({
            "registerNumber": reg_clean,
            "status": "PENDING"
        }).sort("originalSemester", 1)

        arrear_subjects = []
        async for arr in arrears_cur:
            orig_sem = int(arr.get("originalSemester", 1))
            rules = await self.get_arrear_internal_and_rules(reg_clean, arr["subjectCode"], current_semester=curr_sem)

            arrear_subjects.append({
                "subjectCode": arr.get("subjectCode"),
                "subjectName": arr.get("subjectName"),
                "originalSemester": orig_sem,
                "currentSemester": curr_sem,
                "credits": arr.get("credits", 3.0),
                "subjectType": arr.get("subjectType", "THEORY"),
                "attemptNumber": rules["attempt_number"],
                "internalStatus": rules["internal_status"],
                "semestersElapsed": rules["semesters_elapsed"],
                "internalMark": rules["internal_mark"],
                "originalInternalMark": rules["original_internal"],
                "passThreshold": rules["pass_threshold"],
                "category": "ARREAR"
            })

        return {
            "registerNumber": reg_clean,
            "studentName": student.get("name", "") if student else "",
            "department": dept,
            "currentSemester": curr_sem,
            "currentSubjects": current_subjects,
            "arrearSubjects": arrear_subjects,
            "totalCurrent": len(current_subjects),
            "totalArrears": len(arrear_subjects)
        }

arrear_service = ArrearService()
