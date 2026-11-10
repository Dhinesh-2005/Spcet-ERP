import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.database import db

client = TestClient(app)

def setup_entities():
    async def _setup():
        await db.audit_logs.delete_many({})
        await db.result_batches.delete_many({})
        await db.results.delete_many({})
        await db.arrears.delete_many({})
        await db.internal_marks.delete_many({})
        await db.student_subjects.delete_many({})
        await db.students.delete_many({"registerNumber": {"$in": ["SEC_STUDENT_01", "SEC_STUDENT_02", "SEC_STUDENT_03"]}})
        await db.faculties.delete_many({"registerNumber": {"$in": ["SEC_FAC_01", "SEC_FAC_02"]}})
        await db.faculty_subject_access.delete_many({"facultyId": {"$in": ["SEC_FAC_01", "SEC_FAC_02"]}})
        await db.subjects.delete_many({"subjectCode": {"$in": ["SEC301", "SEC302"]}})

        # Seed test entities
        await db.students.insert_many([
            {"registerNumber": "SEC_STUDENT_01", "name": "Alice Security", "department": "CSE", "semester": 5, "batch": "2022-2026", "section": "A", "role": "student"},
            {"registerNumber": "SEC_STUDENT_02", "name": "Bob Security", "department": "CSE", "semester": 5, "batch": "2022-2026", "section": "A", "role": "student"},
            {"registerNumber": "SEC_STUDENT_03", "name": "Charlie External", "department": "ECE", "semester": 5, "batch": "2022-2026", "section": "B", "role": "student"}
        ])

        await db.subjects.insert_many([
            {"subjectCode": "SEC301", "subjectName": "Computer Security", "department": "CSE", "semester": 5, "credits": 4.0, "subjectType": "THEORY"},
            {"subjectCode": "SEC302", "subjectName": "VLSI Design", "department": "ECE", "semester": 5, "credits": 3.0, "subjectType": "THEORY"}
        ])

        await db.faculties.insert_many([
            {"registerNumber": "SEC_FAC_01", "name": "Prof Alice Mentor", "department": "CSE", "role": "faculty"},
            {"registerNumber": "SEC_FAC_02", "name": "Prof Bob ECE", "department": "ECE", "role": "faculty"}
        ])

        await db.faculty_subject_access.insert_many([
            {"facultyId": "SEC_FAC_01", "facultyName": "Prof Alice Mentor", "department": "CSE", "subjectCodes": ["SEC301"]},
            {"facultyId": "SEC_FAC_02", "facultyName": "Prof Bob ECE", "department": "ECE", "subjectCodes": ["SEC302"]}
        ])

    asyncio.run(_setup())

def teardown_entities():
    async def _clean():
        await db.audit_logs.delete_many({})
        await db.result_batches.delete_many({})
        await db.results.delete_many({})
        await db.arrears.delete_many({})
        await db.internal_marks.delete_many({})
        await db.student_subjects.delete_many({})
        await db.students.delete_many({"registerNumber": {"$in": ["SEC_STUDENT_01", "SEC_STUDENT_02", "SEC_STUDENT_03"]}})
        await db.faculties.delete_many({"registerNumber": {"$in": ["SEC_FAC_01", "SEC_FAC_02"]}})
        await db.faculty_subject_access.delete_many({"facultyId": {"$in": ["SEC_FAC_01", "SEC_FAC_02"]}})
        await db.subjects.delete_many({"subjectCode": {"$in": ["SEC301", "SEC302"]}})
    asyncio.run(_clean())


# ─────────────────────────────────────────────────────────────────────────────
# 1. ROLE SECURITY TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_student_cannot_access_other_student_profile():
    setup_entities()
    try:
        # Student 01 trying to access Student 02's profile
        headers = {
            "x-user-role": "student",
            "x-user-id": "SEC_STUDENT_01"
        }
        res = client.get("/api/students/SEC_STUDENT_02/profile", headers=headers)
        assert res.status_code == 403
        assert "Access denied" in res.json().get("detail", "")

        # Student 01 accessing own profile succeeds
        res_own = client.get("/api/students/SEC_STUDENT_01/profile", headers=headers)
        assert res_own.status_code == 200
        assert res_own.json()["student"]["registerNumber"] == "SEC_STUDENT_01"
    finally:
        teardown_entities()


def test_student_cannot_see_unpublished_results():
    setup_entities()
    async def _seed_results():
        await db.results.insert_many([
            {
                "registerNumber": "SEC_STUDENT_01",
                "subjectCode": "SEC301",
                "semester": "5",
                "department": "CSE",
                "finalMarks": 85.0,
                "grade": "A",
                "result": "PASS",
                "isPublished": True
            },
            {
                "registerNumber": "SEC_STUDENT_01",
                "subjectCode": "SEC302",
                "semester": "5",
                "department": "CSE",
                "finalMarks": 92.0,
                "grade": "O",
                "result": "PASS",
                "isPublished": False  # Unpublished draft
            }
        ])
    asyncio.run(_seed_results())

    try:
        headers = {"x-user-role": "student", "x-user-id": "SEC_STUDENT_01"}
        res = client.get("/api/students/SEC_STUDENT_01/profile", headers=headers)
        assert res.status_code == 200
        results = res.json()["results"]
        assert len(results) == 1
        assert results[0]["subjectCode"] == "SEC301"
        assert all(r.get("isPublished") is True for r in results)
    finally:
        teardown_entities()


def test_faculty_cannot_modify_unauthorized_subjects():
    setup_entities()
    try:
        # SEC_FAC_01 is assigned to SEC301 (CSE), NOT SEC302 (ECE)
        payload = {
            "facultyId": "SEC_FAC_01",
            "subjectCode": "SEC302",
            "semester": 5,
            "status": "DRAFT",
            "marks": [{"registerNumber": "SEC_STUDENT_03", "componentMarks": {"UT1": 80}}]
        }
        res = client.post("/api/faculty-marks/save", json=payload)
        assert res.status_code == 403
        assert "not authorized" in res.json().get("detail", "")
    finally:
        teardown_entities()


# ─────────────────────────────────────────────────────────────────────────────
# 2. RESULT PUBLISHING STATE MACHINE & LOCKING TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_result_publishing_state_machine_and_locking():
    setup_entities()
    async def _seed():
        await db.results.insert_many([
            {
                "registerNumber": "SEC_STUDENT_01",
                "subjectCode": "SEC301",
                "subjectName": "Computer Security",
                "semester": "5",
                "department": "CSE",
                "credits": 4.0,
                "internalRaw": 35.0,
                "externalRaw": 55.0,
                "finalMarks": 90.0,
                "grade": "O",
                "gradePoint": 10.0,
                "result": "PASS",
                "isArrear": False,
                "isPublished": False
            },
            {
                "registerNumber": "SEC_STUDENT_02",
                "subjectCode": "SEC301",
                "subjectName": "Computer Security",
                "semester": "5",
                "department": "CSE",
                "credits": 4.0,
                "internalRaw": 10.0,
                "externalRaw": 20.0,
                "finalMarks": 30.0,
                "grade": "RA",
                "gradePoint": 0.0,
                "result": "RA",
                "isArrear": False,
                "isPublished": False
            }
        ])
    asyncio.run(_seed())

    try:
        # 1. Check Initial State (DRAFT)
        status_res = client.get("/api/academic/results/batch-status?department=CSE&semester=5")
        assert status_res.status_code == 200
        assert status_res.json()["state"] == "DRAFT"
        assert status_res.json()["isLocked"] is False

        # 2. Validate Results
        val_res = client.post("/api/academic/results/validate", json={"department": "CSE", "semester": 5, "actionUser": "admin"})
        assert val_res.status_code == 200
        summary = val_res.json()["summary"]
        assert summary["totalStudents"] == 2
        assert summary["passed"] == 1
        assert summary["failed"] == 1

        # Check state advanced to VALIDATED
        status_res = client.get("/api/academic/results/batch-status?department=CSE&semester=5")
        assert status_res.json()["state"] == "VALIDATED"

        # 3. Preview advances state to READY_FOR_PUBLISH
        prev_res = client.get("/api/academic/results/preview?department=CSE&semester=5")
        assert prev_res.status_code == 200
        assert len(prev_res.json()) == 2

        status_res = client.get("/api/academic/results/batch-status?department=CSE&semester=5")
        assert status_res.json()["state"] == "READY_FOR_PUBLISH"

        # 4. Live Publish -> State becomes PUBLISHED & LOCKED
        pub_res = client.post("/api/academic/results/publish", json={"department": "CSE", "semester": 5, "actionUser": "admin"})
        assert pub_res.status_code == 200

        status_res = client.get("/api/academic/results/batch-status?department=CSE&semester=5")
        assert status_res.json()["state"] == "PUBLISHED"
        assert status_res.json()["isLocked"] is True

        # Check arrears registered for SEC_STUDENT_02
        async def _check_arrear():
            return await db.arrears.find_one({"registerNumber": "SEC_STUDENT_02", "subjectCode": "SEC301"})
        arrear_doc = asyncio.run(_check_arrear())
        assert arrear_doc is not None
        assert arrear_doc["status"] == "PENDING"
        assert arrear_doc["originalSemester"] == 5

        # 5. Enforce Lock: Faculty marks entry must be REJECTED with 403
        save_res = client.post("/api/faculty-marks/save", json={
            "facultyId": "SEC_FAC_01",
            "subjectCode": "SEC301",
            "semester": 5,
            "status": "DRAFT",
            "marks": [{"registerNumber": "SEC_STUDENT_01", "componentMarks": {"UT1": 95}}]
        })
        assert save_res.status_code == 403
        assert "LOCKED" in save_res.json().get("detail", "")

        # 6. Admin Unlock Workflow: Unlock -> Edit is permitted
        unlock_res = client.post("/api/academic/results/unlock", json={"department": "CSE", "semester": 5, "isLocked": False, "actionUser": "admin"})
        assert unlock_res.status_code == 200

        status_res = client.get("/api/academic/results/batch-status?department=CSE&semester=5")
        assert status_res.json()["isLocked"] is False

        # Faculty can now save marks
        save_res = client.post("/api/faculty-marks/save", json={
            "facultyId": "SEC_FAC_01",
            "subjectCode": "SEC301",
            "semester": 5,
            "status": "DRAFT",
            "marks": [{"registerNumber": "SEC_STUDENT_01", "componentMarks": {"UT1": 95}}]
        })
        assert save_res.status_code == 200

        # 7. Unpublish resets batch to DRAFT and isPublished: False
        unpub_res = client.post("/api/academic/results/unpublish", json={"department": "CSE", "semester": 5, "actionUser": "admin"})
        assert unpub_res.status_code == 200

        async def _count_pub():
            return await db.results.count_documents({"department": "CSE", "semester": "5", "isPublished": True})
        pub_count = asyncio.run(_count_pub())
        assert pub_count == 0
    finally:
        teardown_entities()


# ─────────────────────────────────────────────────────────────────────────────
# 3. AUDIT LOGGING TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_audit_logs_recorded_across_lifecycle():
    setup_entities()
    try:
        # Create Subject -> should trigger SUBJECT_CREATE audit log
        sub_payload = {
            "subjectCode": "SEC301",
            "subjectName": "Computer Security",
            "department": "CSE",
            "semester": 5,
            "credits": 4.0,
            "subjectType": "THEORY"
        }
        client.post("/api/academic/subjects", json=sub_payload)

        # Assign Faculty -> should trigger FACULTY_ASSIGN audit log
        fac_payload = {
            "facultyId": "SEC_FAC_01",
            "facultyName": "Prof Alice",
            "department": "CSE",
            "subjectCodes": ["SEC301"]
        }
        client.post("/api/academic/faculty-access", json=fac_payload)

        # Query Audit Logs endpoint
        audit_res = client.get("/api/academic/audit-logs?page=1&limit=50")
        assert audit_res.status_code == 200
        logs = audit_res.json()["logs"]
        assert len(logs) > 0
    finally:
        teardown_entities()


# ─────────────────────────────────────────────────────────────────────────────
# 4. ADMIN RESULT DASHBOARD MULTI-FILTER & STATISTICS TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_admin_result_dashboard_filtering_and_statistics():
    setup_entities()
    async def _seed():
        await db.results.insert_many([
            {"registerNumber": "SEC_STUDENT_01", "subjectCode": "SEC301", "semester": "5", "department": "CSE", "credits": 4.0, "finalMarks": 95.0, "grade": "O", "result": "PASS", "isArrear": False, "isPublished": True},
            {"registerNumber": "SEC_STUDENT_02", "subjectCode": "SEC301", "semester": "5", "department": "CSE", "credits": 4.0, "finalMarks": 35.0, "grade": "RA", "result": "RA", "isArrear": True, "isPublished": True},
            {"registerNumber": "SEC_STUDENT_03", "subjectCode": "SEC302", "semester": "5", "department": "ECE", "credits": 3.0, "finalMarks": 0.0, "grade": "AB", "result": "RA", "isArrear": False, "isPublished": True}
        ])
    asyncio.run(_seed())

    try:
        # Query CSE Semester 5
        res = client.get("/api/academic/results/dashboard?department=CSE&semester=5")
        assert res.status_code == 200
        data = res.json()
        stats = data["statistics"]
        assert stats["totalStudents"] == 2
        assert stats["passed"] == 1
        assert stats["failed"] == 1
        assert stats["ra"] == 1
        assert stats["passPercentage"] == 50.0

        # Filter by Arrear Only
        res_arrear = client.get("/api/academic/results/dashboard?department=CSE&semester=5&arrearFilter=ARREAR")
        assert res_arrear.status_code == 200
        assert len(res_arrear.json()["results"]) == 1
        assert res_arrear.json()["results"][0]["registerNumber"] == "SEC_STUDENT_02"

        # Filter by Student search
        res_search = client.get("/api/academic/results/dashboard?student=Alice")
        assert res_search.status_code == 200
        assert len(res_search.json()["results"]) == 1
        assert res_search.json()["results"][0]["registerNumber"] == "SEC_STUDENT_01"
    finally:
        teardown_entities()
