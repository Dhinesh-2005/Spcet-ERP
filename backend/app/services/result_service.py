from app.database import db
from app.models.schemas import ResultModel
from typing import List

class ResultService:
    async def calculate_results(self):
        subjects = [s async for s in db.subjects.find({})]
        students = [st async for st in db.students.find({})]
        student_dept_map = {s["registerNumber"]: s.get("department", "") for s in students}

        subject_map = {}
        for s in subjects:
            subject_map[(s["subjectCode"], s.get("department", ""))] = s
            subject_map[s["subjectCode"]] = s

        internals = [i async for i in db.internals.find({})]
        internal_map = {}
        for item in internals:
            internal_map.setdefault(item["registerNumber"], {})[item["subjectCode"]] = item
        externals = [e async for e in db.externals.find({})]
        results = []
        for em in externals:
            reg_no = em.get("registerNumber", "")
            dept = student_dept_map.get(reg_no, "")
            sub = subject_map.get((em["subjectCode"], dept)) or subject_map.get(em["subjectCode"])
            if not sub:
                continue
            from app.services.arrear_service import arrear_service
            arrear_info = await arrear_service.get_arrear_internal_and_rules(reg_no, em["subjectCode"])
            external_score = em.get("externalMarks", 0)

            if arrear_info["has_arrear_record"]:
                pass_threshold = arrear_info["pass_threshold"]
                if arrear_info["is_valid"]:
                    internal_score = arrear_info["internal_mark"]
                    l = sub.get("l") or 0
                    t = sub.get("t") or 0
                    p = sub.get("p") or 0
                    if p > (l + t):
                        final_score = (internal_score * 0.5) + (external_score * 0.5)
                    else:
                        final_score = (internal_score * 0.4) + (external_score * 0.6)
                    rounded = int(round(final_score))
                    if rounded >= 45 and external_score >= pass_threshold:
                        status = "PASS"
                    else:
                        status = "FAIL"
                else:
                    final_score = float(external_score)
                    rounded = int(round(final_score))
                    if rounded >= pass_threshold and external_score >= pass_threshold:
                        status = "PASS"
                    else:
                        status = "FAIL"
            else:
                internal_score = 0.0
                im = internal_map.get(reg_no, {}).get(em["subjectCode"])
                if im:
                    internal_score = im.get("finalInternal", 0.0)
                l = sub.get("l") or 0
                t = sub.get("t") or 0
                p = sub.get("p") or 0
                if p > (l + t):
                    final_score = (internal_score * 0.5) + (external_score * 0.5)
                else:
                    final_score = (internal_score * 0.4) + (external_score * 0.6)
                rounded = int(round(final_score))
                if rounded >= 45 and external_score >= 45:
                    status = "PASS"
                else:
                    status = "FAIL"

            if status == "PASS":
                if rounded >= 91:
                    grade = "O"
                elif rounded >= 81:
                    grade = "A+"
                elif rounded >= 71:
                    grade = "A"
                elif rounded >= 61:
                    grade = "B+"
                elif rounded >= 51:
                    grade = "B"
                else:
                    grade = "C"
            else:
                grade = "RA"
                status = "FAIL"
            results.append({
                "registerNumber": reg_no,
                "subjectCode": sub["subjectCode"],
                "semester": str(sub["semester"]),
                "department": sub.get("department", dept),
                "grade": grade,
                "result": status,
                "finalMarks": rounded,
                "isPublished": False,
            })
        await db.results.delete_many({})
        if results:
            await db.results.insert_many(results)

    async def get_results_by_sem_and_dept(self, semester: str, department: str):
        from app.database import clean_doc
        return [clean_doc(doc) async for doc in db.results.find({"semester": str(semester), "department": department})]


    async def publish_results(self, semester: str, department: str):
        await db.results.update_many({"semester": semester, "department": department}, {"$set": {"isPublished": True}})

result_service = ResultService()
