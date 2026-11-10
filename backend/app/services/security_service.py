from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Request
from app.database import db

ROLE_ADMIN = "admin"
ROLE_ACADEMIC = "academic"
ROLE_FACULTY = "faculty"
ROLE_STUDENT = "student"
ROLE_HOD = "hod"

class SecurityService:
    """
    Handles backend authorization, role security enforcement, and result locking verification.
    """

    def parse_auth_headers(
        self,
        x_user_role: Optional[str] = None,
        x_user_id: Optional[str] = None,
        x_user_department: Optional[str] = None
    ) -> Dict[str, str]:
        role = (x_user_role or "").strip().lower()
        user_id = (x_user_id or "").strip()
        dept = (x_user_department or "").strip().upper()
        return {
            "role": role,
            "userId": user_id,
            "department": dept
        }

    async def verify_student_access(
        self,
        target_reg_no: str,
        x_user_role: Optional[str] = None,
        x_user_id: Optional[str] = None
    ) -> None:
        """
        Enforce: Students must NOT access another student's results or profile.
        Admin / Academic / Faculty / HOD can access.
        """
        user_role = (x_user_role or "").strip().lower()
        user_id = (x_user_id or "").strip().upper()
        target = (target_reg_no or "").strip().upper()

        if user_role == ROLE_STUDENT:
            if not user_id or user_id != target:
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: Student '{user_id or 'unknown'}' is not authorized to access records of student '{target}'."
                )

    async def verify_faculty_access(
        self,
        faculty_id: str,
        subject_code: str,
        department: Optional[str] = None
    ) -> None:
        """
        Enforce: Faculty must NOT access another faculty's subjects or unauthorized departments.
        """
        fid = (faculty_id or "").strip().upper()
        sub = (subject_code or "").strip().upper()

        if fid in {"ADMIN", "HOD"}:
            return

        # Check faculty existence
        fac_doc = await db.faculties.find_one({"registerNumber": fid})
        if not fac_doc:
            fac_doc = await db.faculties.find_one({"registerNumber": {"$regex": f"^{fid}$", "$options": "i"}})

        if not fac_doc:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Faculty ID '{fid}' not found in faculty master directory."
            )

        fac_dept = (fac_doc.get("department") or "").strip().upper()

        # Subject assignment check
        access_doc = await db.faculty_subject_access.find_one({"facultyId": fid})
        assigned_codes = [c.upper() for c in (access_doc.get("subjectCodes", []) if access_doc else [])]
        assignments = access_doc.get("assignments", []) if access_doc else []

        if sub not in assigned_codes:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Subject '{sub}' is not assigned to faculty '{fid}'."
            )

        # Department check: authorized if own dept, "ALL", or assigned student department
        assigned_depts = {fac_dept, "ALL"}
        for a in assignments:
            if a.get("subjectCode", "").upper() == sub:
                assigned_depts.add((a.get("studentDepartment") or "").upper())

        dept_clean = (department or "").strip().upper()
        if dept_clean and dept_clean not in assigned_depts:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Faculty '{fid}' (Dept: {fac_dept}) is not authorized to access department '{department}'."
            )

    async def check_batch_locked(self, department: str, semester: int) -> bool:
        """
        Returns True if the result batch is locked in db.result_batches.
        """
        dept = (department or "").strip().upper()
        sem = int(semester)

        # Check db.result_batches
        batch = await db.result_batches.find_one({"department": dept, "semester": sem})
        if not batch and dept != "ALL":
            batch = await db.result_batches.find_one({"department": "ALL", "semester": sem})

        if batch:
            return bool(batch.get("isLocked", False))

        return False

    async def enforce_batch_unlocked(self, department: str, semester: int, action_name: str = "modify marks") -> None:
        """
        Raises HTTP 403 if batch is locked.
        """
        is_locked = await self.check_batch_locked(department, semester)
        if is_locked:
            raise HTTPException(
                status_code=403,
                detail=f"Operation rejected: Results for department '{department}', semester {semester} are LOCKED / PUBLISHED. Administrator must UNLOCK the batch before you can {action_name}."
            )

security_service = SecurityService()
