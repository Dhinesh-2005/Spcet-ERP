import re
from typing import List, Dict, Any, Tuple
from app.database import db, clean_doc

# Standard Grade to Grade Point Mapping (configurable fallback)
GRADE_MAP = {
    "O": {"gp": 10.0, "result": "PASS"},
    "A+": {"gp": 9.0, "result": "PASS"},
    "A": {"gp": 8.0, "result": "PASS"},
    "B+": {"gp": 7.0, "result": "PASS"},
    "B": {"gp": 6.0, "result": "PASS"},
    "C": {"gp": 5.0, "result": "PASS"},
    "RA": {"gp": 0.0, "result": "FAIL"},
    "SA": {"gp": 0.0, "result": "FAIL"},  # Shortage of Attendance
    "W": {"gp": 0.0, "result": "FAIL"},   # Withdrawal
    "AB": {"gp": 0.0, "result": "FAIL"},  # Absent
}

class AcademicService:

    @staticmethod
    def get_grade_info(grade_str: str) -> Dict[str, Any]:
        g = str(grade_str or "").strip().upper()
        if g in GRADE_MAP:
            return GRADE_MAP[g]
        # Fallback numeric logic if grade is given as letter or score
        return {"gp": 0.0, "result": "FAIL"}

    @staticmethod
    def calculate_grade_from_total(total_marks: float, external_marks: float = 0.0, pass_mark: float = 45.0) -> Tuple[str, float, str]:
        """Calculates Grade, Grade Point, and Result status."""
        rounded = int(round(total_marks))
        # If external mark is provided, student must get min 45/100 in external to pass
        if rounded >= 50 and (external_marks == 0.0 or external_marks >= 45.0):
            if rounded >= 90:
                return "O", 10.0, "PASS"
            elif rounded >= 80:
                return "A+", 9.0, "PASS"
            elif rounded >= 70:
                return "A", 8.0, "PASS"
            elif rounded >= 60:
                return "B+", 7.0, "PASS"
            elif rounded >= 50:
                return "B", 6.0, "PASS"
            else:
                return "C", 5.0, "PASS"
        return "RA", 0.0, "FAIL"

    @staticmethod
    def calculate_gpa(subject_records: List[Dict[str, Any]]) -> float:
        """
        GPA = Σ(Credit × Grade Point) / Σ(Credits)
        Only considers records for that semester.
        """
        total_credit_points = 0.0
        total_credits = 0.0

        for rec in subject_records:
            credits = float(rec.get("credits") or 0)
            gp = float(rec.get("gradePoint") if rec.get("gradePoint") is not None else GRADE_MAP.get(str(rec.get("grade")).strip().upper(), {}).get("gp", 0.0))
            if credits > 0:
                total_credit_points += (credits * gp)
                total_credits += credits

        if total_credits == 0:
            return 0.0
        return round(total_credit_points / total_credits, 2)

    @staticmethod
    def calculate_cgpa(all_subject_records: List[Dict[str, Any]]) -> float:
        """
        CGPA = Σ(Credit × Grade Point) / Σ(Credits) across all completed subjects.
        If a subject has arrear attempts, the latest attempt (or passed attempt) is considered.
        """
        # Deduplicate by subjectCode: prefer PASS record or latest attempt
        subject_best_map: Dict[str, Dict[str, Any]] = {}

        for rec in all_subject_records:
            sub_code = str(rec.get("subjectCode", "")).strip().upper()
            if not sub_code:
                continue

            existing = subject_best_map.get(sub_code)
            if not existing:
                subject_best_map[sub_code] = rec
            else:
                # If existing is FAIL and new is PASS, replace
                if existing.get("result") != "PASS" and rec.get("result") == "PASS":
                    subject_best_map[sub_code] = rec
                elif existing.get("result") == rec.get("result"):
                    # Compare attemptNumber or date
                    if int(rec.get("attemptNumber", 1)) > int(existing.get("attemptNumber", 1)):
                        subject_best_map[sub_code] = rec

        total_credit_points = 0.0
        total_credits = 0.0

        for rec in subject_best_map.values():
            credits = float(rec.get("credits") or 0)
            gp = float(rec.get("gradePoint") if rec.get("gradePoint") is not None else GRADE_MAP.get(str(rec.get("grade")).strip().upper(), {}).get("gp", 0.0))
            if credits > 0:
                total_credit_points += (credits * gp)
                total_credits += credits

        if total_credits == 0:
            return 0.0
        return round(total_credit_points / total_credits, 2)

    async def get_student_academic_history(self, register_number: str) -> Dict[str, Any]:
        """
        Returns full student academic profile including semester wise subject details,
        credits, internal, external, GPA per semester, and overall CGPA.
        """
        reg_no = register_number.strip().upper()
        student = await db.students.find_one({"registerNumber": reg_no})
        if not student:
            return {}

        # Fetch all student subject records from student_subjects and results collections
        records_cursor = db.student_subjects.find({"registerNumber": reg_no})
        raw_records = [clean_doc(doc) async for doc in records_cursor]

        # Also merge with db.results if any historical records exist there
        results_cursor = db.results.find({"registerNumber": reg_no})
        raw_results = [clean_doc(doc) async for doc in results_cursor]

        # Group records by semester
        semesters_map: Dict[int, List[Dict[str, Any]]] = {}
        all_completed_records = []

        # Process student_subjects records with Subject Master enrichment
        master_subjects_list = [clean_doc(s) async for s in db.subjects.find({})]

        for rec in raw_records:
            code = str(rec.get("subjectCode", "")).strip().upper()
            clean_code = code.replace(" ", "")
            master_doc = next((s for s in master_subjects_list if s.get("subjectCode") == code and s.get("subjectName")), None)
            if not master_doc:
                master_doc = next((s for s in master_subjects_list if str(s.get("subjectCode", "")).replace(" ", "").upper() == clean_code and s.get("subjectName")), None)

            if master_doc:
                if master_doc.get("subjectName"):
                    rec["subjectName"] = master_doc["subjectName"]
                if master_doc.get("credits") is not None:
                    rec["credits"] = float(master_doc["credits"])

            sem = int(rec.get("semester") or rec.get("subjectSemester") or 1)
            semesters_map.setdefault(sem, []).append(rec)
            all_completed_records.append(rec)

        # Ensure fallback for subjects in db.results that may not be in student_subjects
        for res in raw_results:
            sub_code = str(res.get("subjectCode", "")).strip().upper()
            sem = int(res.get("semester") or 1)
            # check if already added
            existing_sem_list = semesters_map.get(sem, [])
            if not any(r.get("subjectCode") == sub_code for r in existing_sem_list):
                # Enrich with subject credits
                sub_info = await db.subjects.find_one({"subjectCode": sub_code})
                credits = float(sub_info.get("credits", 3.0)) if sub_info else 3.0
                sub_name = sub_info.get("subjectName", sub_code) if sub_info else sub_code
                
                grade = str(res.get("grade", "RA")).strip().upper()
                grade_info = self.get_grade_info(grade)
                rec = {
                    "registerNumber": reg_no,
                    "subjectCode": sub_code,
                    "subjectName": sub_name,
                    "semester": sem,
                    "credits": credits,
                    "internalMark": 0.0,
                    "externalMark": float(res.get("finalMarks", 0)),
                    "totalMark": float(res.get("finalMarks", 0)),
                    "grade": grade,
                    "gradePoint": grade_info["gp"],
                    "result": res.get("result", grade_info["result"]),
                    "attemptNumber": 1
                }
                semesters_map.setdefault(sem, []).append(rec)
                all_completed_records.append(rec)

        # Build semester summary list
        semester_summaries = []
        total_accumulated_credits = 0

        for sem in sorted(semesters_map.keys()):
            subs = semesters_map[sem]
            sem_gpa = self.calculate_gpa(subs)
            sem_credits = round(sum(float(s.get("credits") or 0) for s in subs), 2)
            passed_credits = round(sum(float(s.get("credits") or 0) for s in subs if s.get("result") == "PASS"), 2)
            total_accumulated_credits += passed_credits

            semester_summaries.append({
                "semester": sem,
                "gpa": sem_gpa,
                "totalCredits": sem_credits,
                "earnedCredits": passed_credits,
                "subjects": subs
            })

        overall_cgpa = self.calculate_cgpa(all_completed_records)

        return {
            "student": clean_doc(student),
            "registerNumber": reg_no,
            "name": student.get("name", ""),
            "department": student.get("department", ""),
            "batch": student.get("year") or student.get("batch", ""),
            "currentSemester": student.get("semester", 1),
            "overallCgpa": overall_cgpa,
            "totalEarnedCredits": total_accumulated_credits,
            "semesters": semester_summaries
        }

academic_service = AcademicService()
