from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException
from app.database import db, clean_doc, clean_docs
from app.models.schemas import ResultModel, AcademicRuleConfigModel, ResultBatchStatusModel
from app.services.calculation_engine import calculation_engine, STATUS_PASS, STATUS_RA
from app.services.arrear_service import arrear_service
from app.services.audit_service import audit_service

class ResultService:
    async def get_academic_config(self, department: str = "ALL", semester: Optional[int] = None) -> AcademicRuleConfigModel:
        """Fetches the active academic configuration from DB or returns defaults."""
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

    async def get_batch_status(self, department: str, semester: int) -> Dict[str, Any]:
        """Fetches publishing and locking status of a result batch."""
        dept = (department or "ALL").strip().upper()
        sem = int(semester)
        doc = await db.result_batches.find_one({"department": dept, "semester": sem})
        if not doc:
            # Check if any published results exist
            pub_count = await db.results.count_documents({
                "department": dept if dept != "ALL" else {"$exists": True},
                "semester": str(sem),
                "isPublished": True
            })
            return {
                "department": dept,
                "semester": sem,
                "state": "PUBLISHED" if pub_count > 0 else "DRAFT",
                "isLocked": pub_count > 0,
                "validationSummary": None,
                "lastValidatedAt": None,
                "lastPublishedAt": None,
                "lastRecalculatedAt": None
            }
        return clean_doc(doc)

    async def calculate_results(self, semester: Optional[str] = None, department: Optional[str] = None, user: str = "admin"):
        """
        Authoritative Result Calculation using centralized calculation engine.
        Updates state to DRAFT and records an audit log.
        """
        # 1. Fetch all subjects to build a global catalog lookup
        all_subjects = [s async for s in db.subjects.find({})]
        subject_map: Dict[Any, Dict[str, Any]] = {}
        for s in all_subjects:
            code = (s.get("subjectCode") or "").strip().upper()
            s_dept = (s.get("department") or "").strip().upper()
            if code:
                subject_map[(code, s_dept)] = s
                if code not in subject_map:
                    subject_map[code] = s

        # 2. Fetch students for fast department & semester lookup
        students = [st async for st in db.students.find({})]
        student_map = {s["registerNumber"]: s for s in students}

        # 3. Fetch canonical internal_marks
        internal_marks_cursor = db.internal_marks.find({})
        canonical_internals: Dict[str, Dict[str, float]] = {}
        im_docs: Dict[Tuple[str, str], Dict[str, Any]] = {}
        async for item in internal_marks_cursor:
            reg = (item.get("registerNumber") or "").strip()
            code = (item.get("subjectCode") or "").strip().upper()
            if reg and code:
                canonical_internals.setdefault(reg, {})[code] = float(item.get("finalInternal", 0.0))
                im_docs[(reg, code)] = item

        # 4. Fetch student_subjects
        st_sub_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
        async for item in db.student_subjects.find({}):
            reg = (item.get("registerNumber") or "").strip()
            code = (item.get("subjectCode") or "").strip().upper()
            if reg and code:
                st_sub_map[(reg, code)] = item

        # 5. Fetch legacy internals for backward compatibility fallback
        legacy_internals_cursor = db.internals.find({})
        legacy_internals: Dict[str, Dict[str, float]] = {}
        async for item in legacy_internals_cursor:
            reg = (item.get("registerNumber") or "").strip()
            code = (item.get("subjectCode") or "").strip().upper()
            if reg and code:
                legacy_internals.setdefault(reg, {})[code] = float(item.get("finalInternal", 0.0))

        # 6. Gather all candidate (registerNumber, subjectCode) entries from externals, student_subjects, and internal_marks
        candidates: Dict[Tuple[str, str], Dict[str, Any]] = {}
        async for em in db.externals.find({}):
            reg = (em.get("registerNumber") or "").strip()
            code = (em.get("subjectCode") or "").strip().upper()
            if reg and code:
                candidates[(reg, code)] = {"external_doc": em}

        for (reg, code), ss in st_sub_map.items():
            if (reg, code) not in candidates:
                candidates[(reg, code)] = {}
            candidates[(reg, code)]["student_subject_doc"] = ss

        for (reg, code), im in im_docs.items():
            if (reg, code) not in candidates:
                candidates[(reg, code)] = {}
            candidates[(reg, code)]["internal_mark_doc"] = im

        target_dept = department.strip().upper() if department and department.upper() != "ALL" else None
        target_sem_str = str(semester) if semester and str(semester).upper() != "ALL" and int(semester) != 0 else None

        results = []
        for (reg_no, subj_code), data in candidates.items():
            em = data.get("external_doc") or {}
            ss = data.get("student_subject_doc") or {}
            im = data.get("internal_mark_doc") or {}
            student = student_map.get(reg_no) or {}

            dept = (student.get("department") or em.get("department") or ss.get("department") or "").strip().upper()
            if target_dept and dept != target_dept:
                continue

            entry_sem = str(
                target_sem_str or
                em.get("semester") or
                ss.get("semester") or
                im.get("semester") or
                student.get("semester") or
                "1"
            )
            if target_sem_str and entry_sem != target_sem_str:
                continue

            sub_sem_int = int(entry_sem) if entry_sem.isdigit() else 1
            config = await self.get_academic_config(department=dept, semester=sub_sem_int)

            # Retrieve subject metadata with intelligent fallback
            sub = subject_map.get((subj_code, dept)) or subject_map.get(subj_code) or {}
            sub_name = sub.get("subjectName") or ss.get("subjectName") or subj_code
            credits_val = float(sub.get("credits") or ss.get("credits") or 3.0)

            # Determine subject type
            st_raw = (ss.get("subjectType") or im.get("subjectType") or em.get("subjectType") or sub.get("subjectType") or sub.get("paperType") or "THEORY").strip().upper()
            if "PRAC" in st_raw or "LAB" in st_raw:
                subject_type = "PRACTICAL"
            elif "INTEG" in st_raw:
                subject_type = "INTEGRATED"
            else:
                l = sub.get("l") or 0
                t = sub.get("t") or 0
                p = sub.get("p") or 0
                if p > (l + t):
                    subject_type = "PRACTICAL"
                else:
                    subject_type = "THEORY"

            # Check Arrear Rules & 3-Semester Internal Validity
            arrear_info = await arrear_service.get_arrear_internal_and_rules(
                register_number=reg_no,
                subject_code=subj_code,
                current_semester=sub_sem_int
            )

            # External Score
            raw_ext_val = em.get("externalMarks") if em.get("externalMarks") is not None else (
                em.get("externalMark") if em.get("externalMark") is not None else (
                    ss.get("externalMark") if ss.get("externalMark") is not None else em.get("mark", 0.0)
                )
            )
            external_score = float(raw_ext_val or 0.0)

            # Internal Score
            if arrear_info["has_arrear_record"]:
                if arrear_info["is_valid"]:
                    internal_score = arrear_info["internal_mark"]
                else:
                    internal_score = 0.0
            else:
                internal_score = canonical_internals.get(reg_no, {}).get(subj_code)
                if internal_score is None:
                    internal_score = ss.get("internalMark")
                if internal_score is None:
                    internal_score = legacy_internals.get(reg_no, {}).get(subj_code, 0.0)
                internal_score = float(internal_score or 0.0)

            # Authoritative calculation via CalculationEngine
            calc_res = calculation_engine.calculate_final_result(
                subject_type=subject_type,
                internal_raw=internal_score,
                external_raw=external_score,
                config=config
            )

            # Verify if arrear expired rule applies higher pass threshold
            res_status = calc_res["result"]
            grade_assigned = calc_res["grade"]
            gp_assigned = calc_res["gradePoint"]

            if arrear_info["has_arrear_record"] and not arrear_info["is_valid"]:
                if calc_res["finalMarksDecimal"] < arrear_info["pass_threshold"]:
                    res_status = STATUS_RA
                    grade_assigned = "RA"
                    gp_assigned = 0.0

            result_doc = {
                "registerNumber": reg_no,
                "subjectCode": subj_code,
                "subjectName": sub_name,
                "semester": str(entry_sem),
                "department": dept,
                "credits": credits_val,
                "subjectType": subject_type,
                "grade": grade_assigned,
                "gradePoint": gp_assigned,
                "result": res_status,
                "finalMarks": calc_res["finalMarks"],
                "finalMarksDecimal": calc_res["finalMarksDecimal"],
                "internalRaw": calc_res["internalRaw"],
                "internalConverted": calc_res["internalConverted"],
                "externalRaw": calc_res["externalRaw"],
                "externalConverted": calc_res["externalConverted"],
                "isArrear": arrear_info["has_arrear_record"],
                "arrearStatus": "ARREAR" if (arrear_info["has_arrear_record"] or res_status == STATUS_RA) else "REGULAR",
                "internalValidity": arrear_info["internal_status"] if arrear_info["has_arrear_record"] else "VALID",
                "isPublished": False,
                "updatedAt": datetime.utcnow().isoformat()
            }
            results.append(result_doc)

        # Scoped update: DO NOT run global delete_many({})
        if semester and department and department.upper() != "ALL":
            await db.results.delete_many({
                "semester": str(semester),
                "department": department.strip().upper(),
                "isPublished": False
            })

        for r in results:
            await db.results.update_one(
                {
                    "registerNumber": r["registerNumber"],
                    "subjectCode": r["subjectCode"],
                    "semester": r["semester"]
                },
                {"$set": r},
                upsert=True
            )

        now_iso = datetime.utcnow().isoformat()
        dept_str = (department or "ALL").strip().upper()
        sem_int = int(semester) if semester and str(semester).isdigit() else 1

        # Update batch state machine to DRAFT
        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "state": "DRAFT",
                    "isLocked": False,
                    "lastRecalculatedAt": now_iso,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        # Audit log calculation
        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_CALCULATE",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            new_value={"processedCount": len(results), "state": "DRAFT"},
            details=f"Calculated results for {len(results)} student subject entries."
        )

        return len(results)

    async def validate_results(self, semester: str, department: str, user: str = "admin") -> Dict[str, Any]:
        """
        Validates computed results against configured regulations:
        - Attendance eligibility (>= attendanceMinPercentage)
        - Internal eligibility (>= internalMinPercentage)
        - External minimum requirement (>= externalMinPercentage)
        - Overall minimum pass requirement (>= overallPassPercentage)
        Transitions batch state to VALIDATED.
        """
        sem_str = str(semester)
        dept_str = department.strip().upper()
        sem_int = int(semester) if sem_str.isdigit() else 1

        cfg = await self.get_academic_config(department=dept_str, semester=sem_int)
        query = {"semester": sem_str}
        if dept_str != "ALL":
            query["department"] = dept_str

        cursor = db.results.find(query)
        results = [r async for r in cursor]
        if not results:
            raise HTTPException(
                status_code=400,
                detail=f"No results found for department '{dept_str}' semester {sem_str}. Please calculate results first."
            )

        total_entries = len(results)
        unique_students = set()
        passed_count = 0
        failed_count = 0
        eligible_count = 0
        not_eligible_count = 0
        warnings = []
        errors = []

        for r in results:
            reg_no = r.get("registerNumber")
            unique_students.add(reg_no)
            res_val = r.get("result", STATUS_RA)
            ext_score = float(r.get("externalRaw", 0.0))
            final_m = float(r.get("finalMarks", 0.0))

            # External minimum check
            if ext_score < cfg.externalMinPercentage:
                if res_val == STATUS_PASS:
                    errors.append(f"Student {reg_no} in {r.get('subjectCode')} has PASS result but external mark {ext_score} is below minimum {cfg.externalMinPercentage}%.")

            # Overall minimum check
            if final_m < cfg.overallPassPercentage:
                if res_val == STATUS_PASS:
                    errors.append(f"Student {reg_no} in {r.get('subjectCode')} has PASS result but final mark {final_m} is below overall minimum {cfg.overallPassPercentage}%.")

            if res_val == STATUS_PASS:
                passed_count += 1
                eligible_count += 1
            else:
                failed_count += 1
                not_eligible_count += 1

        summary = {
            "totalStudents": len(unique_students),
            "totalEntries": total_entries,
            "passed": passed_count,
            "failed": failed_count,
            "eligible": eligible_count,
            "notEligible": not_eligible_count,
            "passPercentage": round((passed_count / total_entries * 100.0), 2) if total_entries > 0 else 0.0,
            "errors": errors,
            "warnings": warnings,
            "isValid": len(errors) == 0
        }

        now_iso = datetime.utcnow().isoformat()
        new_state = "VALIDATED" if summary["isValid"] else "DRAFT"

        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "state": new_state,
                    "validationSummary": summary,
                    "lastValidatedAt": now_iso,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_VALIDATE",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            new_value={"state": new_state, "summary": summary}
        )

        return summary

    async def get_results_by_sem_and_dept(self, semester: str, department: str):
        sem_str = str(semester)
        dept_str = department.strip().upper()
        sem_int = int(semester) if sem_str.isdigit() else 1

        # Advance state to READY_FOR_PUBLISH if currently VALIDATED
        batch = await db.result_batches.find_one({"department": dept_str, "semester": sem_int})
        if batch and batch.get("state") == "VALIDATED":
            await db.result_batches.update_one(
                {"department": dept_str, "semester": sem_int},
                {"$set": {"state": "READY_FOR_PUBLISH", "updatedAt": datetime.utcnow().isoformat()}}
            )

        query = {"semester": sem_str}
        if dept_str != "ALL":
            query["department"] = dept_str
        return [clean_doc(doc) async for doc in db.results.find(query)]

    async def publish_results(self, semester: str, department: str, user: str = "admin"):
        """
        Publishes results, transitions batch state to PUBLISHED, locks marks,
        and registers/clears arrear lifecycles in db.arrears.
        """
        sem_str = str(semester)
        dept_str = department.strip().upper()
        sem_int = int(semester) if sem_str.isdigit() else 1
        now_iso = datetime.utcnow().isoformat()

        # 1. Mark as published in db.results
        query = {"semester": sem_str}
        if dept_str != "ALL":
            query["department"] = dept_str

        res_update = await db.results.update_many(
            query,
            {"$set": {"isPublished": True}}
        )

        # 2. Iterate published results to register or clear arrears
        cursor = db.results.find(dict(query, isPublished=True))
        async for r in cursor:
            reg_no = r.get("registerNumber")
            sub_code = r.get("subjectCode")
            res_status = r.get("result")
            grade = r.get("grade", "RA")
            gp = float(r.get("gradePoint", 0.0))
            final_m = float(r.get("finalMarks", 0.0))
            int_raw = float(r.get("internalRaw", 0.0))
            ext_raw = float(r.get("externalRaw", 0.0))
            credits_val = float(r.get("credits", 3.0))
            st = r.get("subjectType", "THEORY")
            sub_name = r.get("subjectName", sub_code)

            await arrear_service.register_or_update_arrear(
                register_number=reg_no,
                subject_code=sub_code,
                semester=sem_int,
                result=res_status,
                grade=grade,
                grade_point=gp,
                final_marks=final_m,
                internal_marks=int_raw,
                external_marks=ext_raw,
                subject_name=sub_name,
                credits=credits_val,
                subject_type=st
            )

            # Sync to student_subjects
            await db.student_subjects.update_one(
                {"registerNumber": reg_no, "subjectCode": sub_code, "semester": sem_int},
                {
                    "$set": {
                        "internalMark": int_raw,
                        "externalMark": ext_raw,
                        "totalMark": final_m,
                        "grade": grade,
                        "gradePoint": gp,
                        "result": res_status,
                        "isPublished": True
                    }
                },
                upsert=False
            )

        # 3. Transition batch to PUBLISHED and LOCKED
        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "state": "PUBLISHED",
                    "isLocked": True,
                    "lastPublishedAt": now_iso,
                    "lockedAt": now_iso,
                    "lockedBy": user,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        # 4. Record audit log
        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_PUBLISH",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            old_value={"state": "READY_FOR_PUBLISH", "isPublished": False},
            new_value={"state": "PUBLISHED", "isLocked": True, "publishedEntries": res_update.modified_count},
            details=f"Live published results for {dept_str} Semester {sem_str} ({res_update.modified_count} records locked)."
        )

    async def unpublish_results(self, semester: str, department: str, user: str = "admin"):
        """
        Unpublishes live results (sets isPublished: False without destructive deletion).
        Resets batch state to DRAFT and unlocks marks.
        """
        sem_str = str(semester)
        dept_str = department.strip().upper()
        sem_int = int(semester) if sem_str.isdigit() else 1
        now_iso = datetime.utcnow().isoformat()

        query = {"semester": sem_str}
        if dept_str != "ALL":
            query["department"] = dept_str

        res = await db.results.update_many(
            query,
            {"$set": {"isPublished": False}}
        )

        # Reset batch state to DRAFT
        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "state": "DRAFT",
                    "isLocked": False,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_UNPUBLISH",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            old_value={"state": "PUBLISHED", "isPublished": True},
            new_value={"state": "DRAFT", "isLocked": False, "unpublishedCount": res.modified_count},
            details=f"Unpublished results for {dept_str} Semester {sem_str}."
        )

    async def lock_batch(self, department: str, semester: int, user: str = "admin", reason: Optional[str] = None):
        """Explicitly locks marks to prevent edits."""
        dept_str = department.strip().upper()
        sem_int = int(semester)
        now_iso = datetime.utcnow().isoformat()

        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "isLocked": True,
                    "lockedAt": now_iso,
                    "lockedBy": user,
                    "lockReason": reason,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_LOCK",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            old_value={"isLocked": False},
            new_value={"isLocked": True, "reason": reason}
        )

    async def unlock_batch(self, department: str, semester: int, user: str = "admin", reason: Optional[str] = None):
        """Unlocks marks to enable edits/recalculation."""
        dept_str = department.strip().upper()
        sem_int = int(semester)
        now_iso = datetime.utcnow().isoformat()

        await db.result_batches.update_one(
            {"department": dept_str, "semester": sem_int},
            {
                "$set": {
                    "department": dept_str,
                    "semester": sem_int,
                    "isLocked": False,
                    "unlockedAt": now_iso,
                    "unlockedBy": user,
                    "unlockReason": reason,
                    "updatedAt": now_iso
                }
            },
            upsert=True
        )

        await audit_service.log_event(
            user=user,
            role="admin",
            action="RESULT_UNLOCK",
            entity=f"ResultBatch:{dept_str}:Sem{sem_int}",
            old_value={"isLocked": True},
            new_value={"isLocked": False, "reason": reason}
        )

result_service = ResultService()

