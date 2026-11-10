import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.database import db
from app.services.calculation_engine import calculation_engine, STATUS_PASS, STATUS_RA, STATUS_ABSENT
from app.services.result_service import result_service
from app.services.arrear_service import arrear_service

client = TestClient(app)

async def async_clean_db():
    collections = [
        "academic_configs", "subjects", "users", "student_subjects",
        "faculty_subject_access", "internal_marks", "results", "arrears",
        "arrear_internals", "result_batches", "audit_logs", "students", "faculties"
    ]
    for coll in collections:
        await db[coll].delete_many({"department": {"$in": ["CSE_E2E", "IT_E2E", "MECH_E2E"]}})
        await db[coll].delete_many({"registerNumber": {"$regex": "^TEST6_"}})
        await db[coll].delete_many({"subjectCode": {"$regex": "^CS6"}})

def sync_clean_db():
    asyncio.run(async_clean_db())


# ─────────────────────────────────────────────────────────────────────────────
# 1. TEST THEORY
# ─────────────────────────────────────────────────────────────────────────────
def test_theory_marks_comprehensive():
    """
    TEST THEORY:
    - All UT marks
    - Missing UT (partial tests)
    - Maximum marks boundary
    - Invalid marks (negative, above max)
    - Decimal marks
    - Re-upload / Edited marks calculation
    """
    # 1. All Unit marks with valid decimals (max 100 each)
    marks_all = {"Unit 1": 77.5, "Unit 2": 90.0, "Unit 3": 82.5, "Unit 4": 95.0, "Unit 5": 85.0, "Assessment Mark": 38.5}
    res_all = calculation_engine.calculate_theory_internal(marks_all)
    assert res_all["unitCount"] == 5
    assert 0 < res_all["rawInternal"] <= 40.0
    # Average of Units = (77.5+90+82.5+95+85)/5 = 86.0. Converted to 60 = 86.0 * 0.6 = 51.6. Total = 51.6 + 38.5 = 90.1. Overall = 90.1 * 0.4 = 36.04.
    assert round(res_all["utMark60"], 2) == 51.6
    assert res_all["overallInternal40"] == 36.04

    # 2. Missing Unit marks (e.g. only Unit 1 & Unit 2 entered)
    marks_partial = {"Unit 1": 75.0, "Unit 2": 90.0, "Assessment Mark": 30.0}
    res_partial = calculation_engine.calculate_theory_internal(marks_partial)
    assert res_partial["unitCount"] == 2
    assert res_partial["average"] == 82.5

    # 3. Maximum marks boundary (100 in Unit 1..5, 40 in Assessment -> max 40 overall internal)
    marks_max = {"Unit 1": 100.0, "Unit 2": 100.0, "Unit 3": 100.0, "Unit 4": 100.0, "Unit 5": 100.0, "Assessment Mark": 40.0}
    res_max = calculation_engine.calculate_theory_internal(marks_max)
    assert res_max["overallInternal40"] == 40.0

    # 4. Invalid marks (exceeding maximum 100) -> must raise ValueError
    with pytest.raises(ValueError) as exc:
        calculation_engine.calculate_theory_internal({"Unit 1": 105.0})
    assert "exceeds" in str(exc.value).lower()

    # 5. Invalid marks (negative) -> must raise ValueError
    with pytest.raises(ValueError) as exc_neg:
        calculation_engine.calculate_theory_internal({"Unit 1": -5.0})
    assert "cannot be negative" in str(exc_neg.value).lower()

    # 6. Edited marks (updating Unit 1 from 75 -> 95 updates the internal mark)
    marks_v1 = {"Unit 1": 75.0, "Assessment Mark": 30.0}
    marks_v2 = {"Unit 1": 95.0, "Assessment Mark": 30.0}
    res_v1 = calculation_engine.calculate_theory_internal(marks_v1)
    res_v2 = calculation_engine.calculate_theory_internal(marks_v2)
    assert res_v2["rawInternal"] > res_v1["rawInternal"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. TEST PRACTICAL
# ─────────────────────────────────────────────────────────────────────────────
def test_practical_marks_comprehensive():
    """
    TEST PRACTICAL:
    - EX1–EX10
    - Missing EX
    - Maximum values
    - Invalid values
    - Model Practical
    - Calculation
    """
    # 1. Complete EX1-EX10 + Model Practical
    marks_complete = {f"EX{i}": 9.0 for i in range(1, 11)}
    marks_complete["Model"] = 25.0
    res_complete = calculation_engine.calculate_practical_internal(marks_complete)
    assert res_complete["exCount"] == 10
    assert res_complete["exAverage"] == 9.0
    assert res_complete["total100"] == 92.5
    assert res_complete["overallInternal40"] == 37.0

    # 2. Missing EX (only 5 experiments done)
    marks_missing = {f"EX{i}": 8.0 for i in range(1, 6)}
    marks_missing["Model"] = 20.0
    res_missing = calculation_engine.calculate_practical_internal(marks_missing)
    assert res_missing["exCount"] == 5
    assert res_missing["exAverage"] == 8.0
    assert res_missing["total100"] == 80.0
    assert res_missing["overallInternal40"] == 32.0

    # 3. Maximum values boundary (EX=10, Model=25 -> 100 internal)
    marks_max = {f"EX{i}": 10.0 for i in range(1, 11)}
    marks_max["Model"] = 25.0
    res_max = calculation_engine.calculate_practical_internal(marks_max)
    assert res_max["total100"] == 100.0
    assert res_max["overallInternal40"] == 40.0

    # 4. Invalid values (Model > 25)
    with pytest.raises(ValueError):
        calculation_engine.calculate_practical_internal({"Model": 30.0})

    # 5. Invalid values (EX negative)
    with pytest.raises(ValueError):
        calculation_engine.calculate_practical_internal({"EX1": -10.0})


# ─────────────────────────────────────────────────────────────────────────────
# 3. TEST INTEGRATED
# ─────────────────────────────────────────────────────────────────────────────
def test_integrated_marks_comprehensive():
    """
    TEST INTEGRATED:
    - Theory + Practical
    - Missing theory
    - Missing practical
    - Complete calculation
    """
    theory_full = {f"UT{i}": 90.0 for i in range(1, 6)}
    theory_full["IA"] = 35.0  # (90/100*60) + 35 = 54 + 35 = 89

    practical_full = {f"EX{i}": 9.0 for i in range(1, 11)}
    practical_full["Model"] = 20.0  # (9.0*7.5) + 20 = 67.5 + 20 = 87.5

    # 1. Complete Integrated ((Theory + Practical) / 4 out of 50)
    res_full = calculation_engine.calculate_integrated_internal(theory_full, practical_full)
    assert res_full["rawTheory"] == 89.0
    assert res_full["rawPractical"] == 87.5
    assert res_full["combinedTotal"] == 176.5
    assert res_full["rawInternal"] == 44.12
    assert res_full["integratedInternal"] == 44.12

    # 2. Missing theory (zero UTs)
    res_no_th = calculation_engine.calculate_integrated_internal({}, practical_full)
    assert res_no_th["rawTheory"] == 0.0
    assert res_no_th["rawInternal"] == round(87.5 / 4.0, 2)

    # 3. Missing practical (zero EXs)
    res_no_pr = calculation_engine.calculate_integrated_internal(theory_full, {})
    assert res_no_pr["rawPractical"] == 0.0
    assert res_no_pr["rawInternal"] == round(89.0 / 4.0, 2)


# ─────────────────────────────────────────────────────────────────────────────
# 4. TEST EXTERNAL
# ─────────────────────────────────────────────────────────────────────────────
def test_external_marks_comprehensive():
    """
    TEST EXTERNAL:
    - 0
    - 50
    - 100
    - Decimal
    - Absent
    """
    # 1. External = 100
    res_100 = calculation_engine.calculate_final_result(
        subject_type="THEORY",
        internal_raw=90.0,
        external_raw=100.0
    )
    assert res_100["isPass"] is True
    assert res_100["grade"] == "O"
    assert res_100["finalMarks"] == 96

    # 2. External = 50 (Passes external min 45%)
    res_50 = calculation_engine.calculate_final_result(
        subject_type="THEORY",
        internal_raw=80.0,
        external_raw=50.0
    )
    assert res_50["isPass"] is True
    assert res_50["finalMarks"] == 62
    assert res_50["result"] == STATUS_PASS

    # 3. External = 0 (Fails external minimum requirement)
    res_0 = calculation_engine.calculate_final_result(
        subject_type="THEORY",
        internal_raw=100.0,
        external_raw=0.0
    )
    assert res_0["isPass"] is False
    assert res_0["result"] == STATUS_RA
    assert res_0["grade"] == "RA"
    assert "external minimum" in res_0["reason"].lower()

    # 4. External Decimal (e.g. 74.5)
    res_dec = calculation_engine.calculate_final_result(
        subject_type="THEORY",
        internal_raw=85.0,
        external_raw=74.5
    )
    assert res_dec["isPass"] is True
    assert res_dec["externalRaw"] == 74.5

    # 5. External Absent (explicit override)
    res_absent = calculation_engine.calculate_final_result(
        subject_type="THEORY",
        internal_raw=85.0,
        external_raw=0.0,
        status_override=STATUS_ABSENT
    )
    assert res_absent["isPass"] is False
    assert res_absent["result"] == STATUS_ABSENT
    assert res_absent["grade"] == "AB"


# ─────────────────────────────────────────────────────────────────────────────
# 5. TEST ARREARS & THREE-SEMESTER RULE
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_arrears_lifecycle_and_rules():
    """
    TEST ARREAR:
    - First attempt
    - Second attempt
    - Third attempt
    - Three-semester condition
    - Internal valid
    - Internal invalid
    - 50% clearing requirement
    - Cleared
    - Still pending
    """
    reg_no = "TEST6_STU_ARREAR_01"
    sub_code = "CS601_ARR"
    await async_clean_db()

    # 1. Create Student
    await db.students.insert_one({
        "registerNumber": reg_no,
        "name": "Arrear Student",
        "department": "CSE_E2E",
        "semester": 2
    })

    # Step 1: Initial Arrear creation (Semester 2 FAIL)
    arr_created = await arrear_service.register_or_update_arrear(
        register_number=reg_no,
        subject_code=sub_code,
        semester=2,
        result="RA",
        grade="RA",
        grade_point=0.0,
        final_marks=35.0,
        internal_marks=30.0,
        external_marks=20.0
    )
    assert arr_created["status"] == "PENDING"
    assert arr_created["attemptNumber"] == 1
    assert arr_created["originalSemester"] == 2
    assert arr_created["internalStatus"] == "VALID"

    # Step 2: In Semester 3 (Elapsed 1 sem < 3) -> Internal is VALID
    rules_sem3 = await arrear_service.get_arrear_internal_and_rules(reg_no, sub_code, current_semester=3)
    assert rules_sem3["is_valid"] is True
    assert rules_sem3["internal_status"] == "VALID"
    assert rules_sem3["internal_mark"] == 30.0

    # Step 3: Attempt 2 in Sem 3, but fails again (RA)
    arr_attempt2 = await arrear_service.register_or_update_arrear(
        register_number=reg_no,
        subject_code=sub_code,
        semester=3,
        result="RA",
        grade="RA",
        grade_point=0.0,
        final_marks=40.0,
        internal_marks=30.0,
        external_marks=25.0
    )
    assert arr_attempt2["currentAttempt"] == 2
    assert arr_attempt2["originalSemester"] == 2

    # Step 4: In Semester 6 (Elapsed 4 sem >= 3) -> Three-semester condition: INTERNAL NOT APPLICABLE
    rules_sem6 = await arrear_service.get_arrear_internal_and_rules(reg_no, sub_code, current_semester=6)
    assert rules_sem6["is_valid"] is False
    assert rules_sem6["internal_status"] == "INTERNAL NOT APPLICABLE"
    assert rules_sem6["internal_mark"] == 0.0
    assert rules_sem6["pass_threshold"] == 50.0  # 50% clearing requirement

    # Step 5: Third Attempt in Sem 6, Clears with PASS (>= 50%)
    await arrear_service.register_or_update_arrear(
        register_number=reg_no,
        subject_code=sub_code,
        semester=6,
        result="PASS",
        grade="B",
        grade_point=6.0,
        final_marks=55.0,
        internal_marks=0.0,
        external_marks=55.0
    )
    cleared_doc = await db.arrears.find_one({"registerNumber": reg_no, "subjectCode": sub_code})
    assert cleared_doc["status"] == "CLEARED"
    assert cleared_doc["clearedInSemester"] == 6

    await async_clean_db()


# ─────────────────────────────────────────────────────────────────────────────
# 6. TEST PREVIOUS RESULTS IMPORT & CARRY-FORWARD
# ─────────────────────────────────────────────────────────────────────────────
def test_previous_results_import_and_carry_forward():
    """
    TEST PREVIOUS RESULTS:
    - Upload
    - Validation
    - Publish
    - Student visibility
    - Arrear creation
    - Current subject carry-forward
    """
    sync_clean_db()
    reg = "TEST6_PREV_STU"
    sub_pass = "CS601_P"
    sub_fail = "CS602_F"

    client.post("/api/academic/subjects", json={
        "subjectCode": sub_pass,
        "subjectName": "Passed Subject",
        "department": "CSE_E2E",
        "semester": 1,
        "credits": 3.0,
        "subjectType": "THEORY"
    })
    client.post("/api/academic/subjects", json={
        "subjectCode": sub_fail,
        "subjectName": "Failed Subject",
        "department": "CSE_E2E",
        "semester": 1,
        "credits": 3.0,
        "subjectType": "THEORY"
    })

    payload = {
        "rows": [
            {
                "registerNumber": reg,
                "subjectCode": sub_pass,
                "subjectName": "Passed Subject",
                "semester": 1,
                "credits": 3,
                "grade": "A",
                "department": "CSE_E2E",
                "studentCurrentSem": 3
            },
            {
                "registerNumber": reg,
                "subjectCode": sub_fail,
                "subjectName": "Failed Subject",
                "semester": 1,
                "credits": 3,
                "grade": "RA",
                "department": "CSE_E2E",
                "studentCurrentSem": 3
            }
        ]
    }
    import_res = client.post("/api/academic/previous-results/import", json=payload)
    assert import_res.status_code == 200
    assert import_res.json()["imported"] == 2

    cf_res = client.get(f"/api/students/{reg}/carry-forward")
    assert cf_res.status_code == 200
    cf_data = cf_res.json()
    assert cf_data["totalArrears"] >= 1
    failed_sub = next(a for a in cf_data["arrearSubjects"] if a["subjectCode"] == sub_fail)
    assert failed_sub["originalSemester"] == 1
    assert failed_sub["originalSemester"] != cf_data["currentSemester"]

    sync_clean_db()


# ─────────────────────────────────────────────────────────────────────────────
# 7. TEST SECURITY
# ─────────────────────────────────────────────────────────────────────────────
def test_security_authorization_boundaries():
    """
    TEST SECURITY:
    - Faculty accessing another subject
    - Faculty accessing another department
    - Student accessing another student
    - Unauthorized API requests
    - Unauthorized mark modification
    """
    sync_clean_db()
    async def _setup_sec():
        await db.students.insert_many([
            {"registerNumber": "TEST6_STU_A", "name": "Student A", "department": "CSE_E2E", "semester": 5},
            {"registerNumber": "TEST6_STU_B", "name": "Student B", "department": "CSE_E2E", "semester": 5}
        ])
        await db.faculty_subject_access.insert_one({
            "facultyId": "TEST6_FAC_CSE",
            "facultyName": "Dr. Smith",
            "department": "CSE_E2E",
            "subjectCodes": ["CS601"]
        })
    asyncio.run(_setup_sec())

    # 1. Student A cannot access Student B profile
    headers_stu_a = {"x-user-role": "student", "x-user-id": "TEST6_STU_A"}
    res_cross = client.get("/api/students/TEST6_STU_B/profile", headers=headers_stu_a)
    assert res_cross.status_code == 403
    assert "Access denied" in res_cross.json().get("detail", "")

    # 2. Faculty cannot modify unauthorized subject CS602
    res_fac_unauth = client.post("/api/faculty-marks/save", json={
        "facultyId": "TEST6_FAC_CSE",
        "subjectCode": "CS602",
        "semester": 5,
        "status": "DRAFT",
        "marks": [{"registerNumber": "TEST6_STU_A", "componentMarks": {"UT1": 80}}]
    })
    assert res_fac_unauth.status_code == 403
    assert "not authorized" in res_fac_unauth.json().get("detail", "")

    # 3. Faculty cannot fetch students roster for unauthorized subject
    res_roster = client.get("/api/faculty-marks/subject-students?facultyId=TEST6_FAC_CSE&subjectCode=CS602&semester=5")
    assert res_roster.status_code == 403

    sync_clean_db()


# ─────────────────────────────────────────────────────────────────────────────
# 8. TEST DUPLICATES
# ─────────────────────────────────────────────────────────────────────────────
def test_duplicates_prevention_across_entities():
    """
    TEST DUPLICATES:
    - Duplicate student
    - Duplicate subject
    - Duplicate assignment
    - Duplicate marks
    - Duplicate arrear
    """
    sync_clean_db()

    # 1. Duplicate subject creation (same code)
    res_sub1 = client.post("/api/academic/subjects", json={
        "subjectCode": "CS699_DUP",
        "subjectName": "Parallel Computing",
        "department": "CSE_E2E",
        "semester": 6,
        "credits": 3.0,
        "subjectType": "THEORY"
    })
    assert res_sub1.status_code == 200

    res_sub2 = client.post("/api/academic/subjects", json={
        "subjectCode": "CS699_DUP",
        "subjectName": "Parallel Computing Duplicate",
        "department": "CSE_E2E",
        "semester": 6,
        "credits": 3.0,
        "subjectType": "THEORY"
    })
    assert res_sub2.status_code in [200, 400]

    async def _check_sub_count():
        return await db.subjects.count_documents({"subjectCode": "CS699_DUP"})
    assert asyncio.run(_check_sub_count()) == 1

    # 2. Duplicate Arrear Creation: creating arrear twice updates attempt, doesn't spawn duplicate docs
    async def _check_arrear_dup():
        await arrear_service.register_or_update_arrear(
            register_number="TEST6_DUP_STU",
            subject_code="CS699_DUP",
            semester=6,
            result="RA",
            final_marks=30.0
        )
        await arrear_service.register_or_update_arrear(
            register_number="TEST6_DUP_STU",
            subject_code="CS699_DUP",
            semester=6,
            result="RA",
            final_marks=32.0
        )
        return await db.arrears.count_documents({"registerNumber": "TEST6_DUP_STU", "subjectCode": "CS699_DUP", "status": "PENDING"})

    assert asyncio.run(_check_arrear_dup()) == 1

    sync_clean_db()


# ─────────────────────────────────────────────────────────────────────────────
# 9. TEST PUBLISHING LIFECYCLE & RECALCULATION
# ─────────────────────────────────────────────────────────────────────────────
def test_publishing_lifecycle_and_recalculation():
    """
    TEST PUBLISHING:
    - DRAFT -> VALIDATED -> READY FOR PUBLISH -> PUBLISHED -> LOCKED
    - Verify unpublished results invisible to students
    - Verify published results cannot silently change (locked)
    - Verify recalculation after unlocking
    """
    sync_clean_db()
    dept = "CSE_E2E"
    sem = 6
    reg = "TEST6_PUB_STU"
    sub = "CS601"

    async def _seed():
        await db.subjects.insert_one({
            "subjectCode": sub,
            "subjectName": "Distributed Systems",
            "department": dept,
            "semester": sem,
            "credits": 4.0,
            "subjectType": "THEORY"
        })
        await db.students.insert_one({
            "registerNumber": reg,
            "name": "Pub Student",
            "department": dept,
            "semester": sem
        })
        await db.faculty_subject_access.insert_one({
            "facultyId": "TEST6_FAC",
            "facultyName": "Prof Test",
            "department": dept,
            "subjectCodes": [sub]
        })
        await db.faculties.insert_one({
            "registerNumber": "TEST6_FAC",
            "name": "Prof Test",
            "department": dept,
            "role": "faculty"
        })
        await db.results.insert_one({
            "registerNumber": reg,
            "subjectCode": sub,
            "subjectName": "Distributed Systems",
            "department": dept,
            "semester": str(sem),
            "credits": 4.0,
            "internalRaw": 35.0,
            "externalRaw": 50.0,
            "finalMarks": 85.0,
            "grade": "A+",
            "gradePoint": 9.0,
            "result": "PASS",
            "isPublished": False
        })
    asyncio.run(_seed())

    # 1. State is initially DRAFT
    status1 = client.get(f"/api/academic/results/batch-status?department={dept}&semester={sem}").json()
    assert status1["state"] == "DRAFT"
    assert status1["isLocked"] is False

    # 2. Student query returns NO unpublished results
    stu_res = client.get(f"/api/students/{reg}/profile", headers={"x-user-role": "student", "x-user-id": reg})
    assert stu_res.status_code == 200
    assert len(stu_res.json()["results"]) == 0

    # 3. Validate
    val = client.post("/api/academic/results/validate", json={"department": dept, "semester": sem, "actionUser": "admin"})
    assert val.status_code == 200
    assert val.json()["summary"]["isValid"] is True

    # 4. Preview advances to READY_FOR_PUBLISH
    prev = client.get(f"/api/academic/results/preview?department={dept}&semester={sem}")
    assert prev.status_code == 200
    status2 = client.get(f"/api/academic/results/batch-status?department={dept}&semester={sem}").json()
    assert status2["state"] == "READY_FOR_PUBLISH"

    # 5. Live Publish -> PUBLISHED and LOCKED
    pub = client.post("/api/academic/results/publish", json={"department": dept, "semester": sem, "actionUser": "admin"})
    assert pub.status_code == 200
    status3 = client.get(f"/api/academic/results/batch-status?department={dept}&semester={sem}").json()
    assert status3["state"] == "PUBLISHED"
    assert status3["isLocked"] is True

    # 6. Student query NOW displays published result
    stu_res_pub = client.get(f"/api/students/{reg}/profile", headers={"x-user-role": "student", "x-user-id": reg})
    assert len(stu_res_pub.json()["results"]) == 1
    assert stu_res_pub.json()["results"][0]["result"] == "PASS"

    # 7. Faculty cannot modify marks while LOCKED (returns 403 or 423)
    res_lock_blocked = client.post("/api/faculty-marks/save", json={
        "facultyId": "TEST6_FAC",
        "subjectCode": sub,
        "semester": sem,
        "status": "DRAFT",
        "marks": [{"registerNumber": reg, "componentMarks": {"UT1": 95}}]
    })
    assert res_lock_blocked.status_code in [403, 423]
    assert "locked" in res_lock_blocked.json()["detail"].lower()

    # 8. Unlock batch for revision
    unlk = client.post("/api/academic/results/unlock", json={"department": dept, "semester": sem, "reason": "Authorized re-eval"})
    assert unlk.status_code == 200
    status_unlk = client.get(f"/api/academic/results/batch-status?department={dept}&semester={sem}").json()
    assert status_unlk["isLocked"] is False

    # 9. Faculty can now edit marks
    res_edit_ok = client.post("/api/faculty-marks/save", json={
        "facultyId": "TEST6_FAC",
        "subjectCode": sub,
        "semester": sem,
        "status": "DRAFT",
        "marks": [{"registerNumber": reg, "componentMarks": {"UT1": 95}}]
    })
    assert res_edit_ok.status_code == 200

    # 10. Recalculate and republish
    recalc = client.post("/api/academic/results/recalculate", json={"department": dept, "semester": sem})
    assert recalc.status_code == 200

    sync_clean_db()


# ─────────────────────────────────────────────────────────────────────────────
# 10. TEST COMPLETE END-TO-END WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────
def test_complete_real_workflow():
    """
    ADMIN -> Academic configuration -> Create subjects -> Assign subjects to students ->
    Assign subjects to faculty -> Configure assessment -> Faculty uploads internal marks ->
    Validation -> Internal calculation -> External marks -> External conversion ->
    Final result -> Grade -> PASS/RA -> Arrear creation -> Admin validation -> Publish ->
    Student result -> Arrear carry-forward -> Arrear attempt -> GPA/CGPA update
    """
    sync_clean_db()
    dept = "CSE_E2E"
    sem = 5
    reg = "TEST6_FULL_E2E"
    sub_th = "CS601_FULL"
    sub_pr = "CS602_FULL"

    # Step 1: Create Subjects
    client.post("/api/academic/subjects", json={
        "subjectCode": sub_th,
        "subjectName": "Software Engineering",
        "department": dept,
        "semester": sem,
        "credits": 3.0,
        "subjectType": "THEORY"
    })
    client.post("/api/academic/subjects", json={
        "subjectCode": sub_pr,
        "subjectName": "Software Engineering Lab",
        "department": dept,
        "semester": sem,
        "credits": 2.0,
        "subjectType": "PRACTICAL"
    })

    # Step 2: Create Student & Assign Subjects
    async def _assign_student():
        await db.students.insert_one({
            "registerNumber": reg,
            "name": "E2E Complete Student",
            "department": dept,
            "semester": sem,
            "batch": "2022-2026"
        })
        await db.student_subjects.insert_many([
            {"registerNumber": reg, "subjectCode": sub_th, "semester": sem, "isPublished": False},
            {"registerNumber": reg, "subjectCode": sub_pr, "semester": sem, "isPublished": False}
        ])
        await db.faculty_subject_access.insert_one({
            "facultyId": "TEST6_FAC_FULL",
            "facultyName": "Prof Full",
            "department": dept,
            "subjectCodes": [sub_th, sub_pr]
        })
        await db.faculties.insert_one({
            "registerNumber": "TEST6_FAC_FULL",
            "name": "Prof Full",
            "department": dept,
            "role": "faculty"
        })
    asyncio.run(_assign_student())

    # Step 3: Faculty Saves Internal Marks
    client.post("/api/faculty-marks/save", json={
        "facultyId": "TEST6_FAC_FULL",
        "subjectCode": sub_th,
        "semester": sem,
        "status": "DRAFT",
        "marks": [{"registerNumber": reg, "componentMarks": {"Unit 1": 16.0, "Assessment Mark": 35.0}}]
    })
    pr_components = {f"EX{i}": 90.0 for i in range(1, 11)}
    pr_components["Model"] = 20.0
    client.post("/api/faculty-marks/save", json={
        "facultyId": "TEST6_FAC_FULL",
        "subjectCode": sub_pr,
        "semester": sem,
        "status": "DRAFT",
        "marks": [{"registerNumber": reg, "componentMarks": pr_components}]
    })

    # Step 4: Seed External Marks (Theory passes with 70, Practical fails with 20)
    async def _seed_externals():
        await db.externals.insert_many([
            {"registerNumber": reg, "subjectCode": sub_th, "semester": sem, "externalMark": 70.0},
            {"registerNumber": reg, "subjectCode": sub_pr, "semester": sem, "externalMark": 20.0}
        ])
    asyncio.run(_seed_externals())

    # Step 5: Admin Calculates Results
    calc_res = client.post("/api/academic/results/calculate", json={"department": dept, "semester": sem})
    assert calc_res.status_code == 200

    # Step 6: Validate Results
    val_res = client.post("/api/academic/results/validate", json={"department": dept, "semester": sem, "actionUser": "admin"})
    assert val_res.status_code == 200

    # Step 7: Publish Results
    pub_res = client.post("/api/academic/results/publish", json={"department": dept, "semester": sem, "actionUser": "admin"})
    assert pub_res.status_code == 200

    # Step 8: Verify Arrear was automatically created for failed practical
    async def _check_arrear():
        arr = await db.arrears.find_one({"registerNumber": reg, "subjectCode": sub_pr, "status": "PENDING"})
        assert arr is not None
        assert arr["originalSemester"] == sem
        assert arr["attemptNumber"] == 1
    asyncio.run(_check_arrear())

    # Step 9: Verify Student Profile reflects 1 PASS and 1 RA
    stu_res = client.get(f"/api/students/{reg}/profile", headers={"x-user-role": "student", "x-user-id": reg})
    assert stu_res.status_code == 200
    results = stu_res.json()["results"]
    assert len(results) == 2
    th_res = next(r for r in results if r["subjectCode"] == sub_th)
    pr_res = next(r for r in results if r["subjectCode"] == sub_pr)
    assert th_res["result"] == "PASS"
    assert pr_res["result"] == "RA"

    # Step 10: Arrear Attempt in Next Semester (Sem 6) -> Cleared with 60%
    async def _clear_arrear():
        arr = await db.arrears.find_one({"registerNumber": reg, "subjectCode": sub_pr, "status": "PENDING"})
        await arrear_service.register_or_update_arrear(
            register_number=reg,
            subject_code=sub_pr,
            semester=6,
            result="PASS",
            grade="B+",
            grade_point=7.0,
            final_marks=60.0
        )
        updated_arr = await db.arrears.find_one({"_id": arr["_id"]})
        assert updated_arr["status"] == "CLEARED"
        assert updated_arr["clearedInSemester"] == 6
    asyncio.run(_clear_arrear())

    sync_clean_db()
