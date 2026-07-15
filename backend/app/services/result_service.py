from app.database import db
from app.models.schemas import ResultModel
from typing import List

class ResultService:
    async def calculate_results(self):
        subjects = [s async for s in db.subjects.find({})]
        subject_map = {s["subjectCode"]: s for s in subjects}
        internals = [i async for i in db.internals.find({})]
        internal_map = {}
        for item in internals:
            internal_map.setdefault(item["registerNumber"], {})[item["subjectCode"]] = item
        externals = [e async for e in db.externals.find({})]
        results = []
        for em in externals:
            sub = subject_map.get(em["subjectCode"])
            if not sub:
                continue
            internal_score = 0.0
            im = internal_map.get(em.get("registerNumber", ""), {}).get(em["subjectCode"])
            if im:
                internal_score = im.get("finalInternal", 0.0)
            external_score = em.get("externalMarks", 0)
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
                "registerNumber": em["registerNumber"],
                "subjectCode": sub["subjectCode"],
                "semester": str(sub["semester"]),
                "department": sub["department"],
                "grade": grade,
                "result": status,
                "finalMarks": rounded,
                "isPublished": False,
            })
        await db.results.delete_many({})
        if results:
            await db.results.insert_many(results)

    async def get_results_by_sem_and_dept(self, semester: str, department: str):
        return [doc async for doc in db.results.find({"semester": semester, "department": department})]

    async def publish_results(self, semester: str, department: str):
        await db.results.update_many({"semester": semester, "department": department}, {"$set": {"isPublished": True}})

result_service = ResultService()
