import re
from datetime import datetime
from typing import Dict, Any, Tuple
from app.database import db

class ArrearService:
    async def get_arrear_settings(self) -> Dict[str, Any]:
        settings = await db.arrear_settings.find_one({})
        if not settings:
            settings = {
                "internalValiditySemesters": 3,
                "expiredInternalTheoryPassPercentage": 50.0
            }
        return settings

    async def get_arrear_internal_and_rules(self, register_number: str, subject_code: str) -> Dict[str, Any]:
        """
        Determines the internal mark and passing rules for a student's arrear subject.
        Returns:
            Dict containing:
                - has_arrear_record: bool
                - internal_mark: float (0.0 if expired)
                - pass_threshold: float (standard 45.0 or configured expired percentage)
                - is_valid: bool
                - use_stored_internal: bool
        """
        reg_clean = str(register_number).strip().upper()
        sub_clean = str(subject_code).strip().upper()

        # Find the arrear record
        record = await db.arrear_internals.find_one({"registerNumber": reg_clean, "subjectCode": sub_clean})
        if not record:
            return {
                "has_arrear_record": False,
                "internal_mark": 0.0,
                "pass_threshold": 45.0,
                "is_valid": False,
                "use_stored_internal": False
            }

        # Get settings
        settings = await self.get_arrear_settings()
        validity_limit = settings.get("internalValiditySemesters", 3)
        expired_pass_pct = float(settings.get("expiredInternalTheoryPassPercentage", 50.0))

        # Get student current semester
        student = await db.students.find_one({"registerNumber": reg_clean})
        current_sem = int(student.get("semester") or 1) if student else 1
        orig_sem = int(record.get("originalSemester") or 1)

        # Check dynamic validity status
        is_valid = (current_sem - orig_sem) < validity_limit

        # Handle override if present
        override = record.get("override")
        if override:
            is_valid = (override.get("status") == "VALID")

        if is_valid:
            internal_mark = float(record.get("internalMark") or 0.0)
            pass_threshold = 45.0
            use_stored_internal = True
        else:
            internal_mark = 0.0
            pass_threshold = expired_pass_pct
            use_stored_internal = False

        return {
            "has_arrear_record": True,
            "internal_mark": internal_mark,
            "pass_threshold": pass_threshold,
            "is_valid": is_valid,
            "use_stored_internal": use_stored_internal
        }

arrear_service = ArrearService()
