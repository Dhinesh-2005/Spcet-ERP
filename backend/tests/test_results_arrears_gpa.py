import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.academic_service import academic_service
from app.services.arrear_service import arrear_service

client = TestClient(app)

# ─────────────────────────────────────────────────────────────────────────────
# 1. GPA & CGPA AUDIT & CALCULATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_calculate_gpa_formula():
    """
    Formula: GPA = Σ(Grade Point × Credit) / Σ(Credits)
    Sub 1: 4 credits, Grade O (10.0 GP) -> 40
    Sub 2: 3 credits, Grade A (8.0 GP) -> 24
    Sub 3: 3 credits, Grade B (6.0 GP) -> 18
    Total Points = 82, Total Credits = 10 -> GPA = 8.20
    """
    subs = [
        {"subjectCode": "CS101", "credits": 4, "grade": "O", "gradePoint": 10.0, "result": "PASS"},
        {"subjectCode": "CS102", "credits": 3, "grade": "A", "gradePoint": 8.0, "result": "PASS"},
        {"subjectCode": "CS103", "credits": 3, "grade": "B", "gradePoint": 6.0, "result": "PASS"},
    ]
    gpa = academic_service.calculate_gpa(subs)
    assert gpa == 8.20


def test_calculate_cgpa_no_double_counting():
    """
    Arrear deduplication:
    Student failed CS101 in Sem 1 (attempt 1, GP 0.0), then passed in Sem 2 (attempt 2, GP 8.0).
    CGPA must count CS101 only ONCE (using the passing attempt 2).
    """
    records = [
        {"subjectCode": "CS101", "credits": 4, "grade": "RA", "gradePoint": 0.0, "result": "FAIL", "attemptNumber": 1},
        {"subjectCode": "CS102", "credits": 4, "grade": "A", "gradePoint": 8.0, "result": "PASS", "attemptNumber": 1},
        {"subjectCode": "CS101", "credits": 4, "grade": "A", "gradePoint": 8.0, "result": "PASS", "attemptNumber": 2},
    ]
    cgpa = academic_service.calculate_cgpa(records)
    # Total unique credits: CS101 (4) + CS102 (4) = 8.
    # Total points: (4 * 8.0) + (4 * 8.0) = 64. CGPA = 64 / 8 = 8.00.
    assert cgpa == 8.00


# ─────────────────────────────────────────────────────────────────────────────
# 2. PREVIOUS RESULTS UPLOAD & AUTOMATIC ARREAR CREATION
# ─────────────────────────────────────────────────────────────────────────────

def test_import_previous_results_creates_arrear():
    """Importing previous result with FAIL/RA must create arrear record."""
    payload = {
        "rows": [
            {
                "registerNumber": "953621104500",
                "subjectCode": "CS8201",
                "subjectName": "Data Structures",
                "semester": 2,
                "credits": 4,
                "grade": "RA",
                "result": "FAIL",
                "department": "CSE",
                "studentCurrentSem": 4
            },
            {
                "registerNumber": "953621104500",
                "subjectCode": "CS8202",
                "subjectName": "Digital Principles",
                "semester": 2,
                "credits": 3,
                "grade": "B+",
                "result": "PASS",
                "department": "CSE",
                "studentCurrentSem": 4
            }
        ]
    }
    res = client.post("/api/academic/previous-results/import", json=payload)
    assert res.status_code == 200

    # Verify student carry-forward view has arrear CS8201 with original semester 2
    cf_res = client.get("/api/students/953621104500/carry-forward")
    assert cf_res.status_code == 200
    cf_data = cf_res.json()
    assert cf_data["totalArrears"] >= 1
    arrear_item = next(a for a in cf_data["arrearSubjects"] if a["subjectCode"] == "CS8201")
    assert arrear_item["originalSemester"] == 2
    # Verify original semester was NEVER overwritten to current semester
    assert arrear_item["originalSemester"] != cf_data["currentSemester"]


# ─────────────────────────────────────────────────────────────────────────────
# 3. THREE-SEMESTER ARREAR INTERNAL VALIDITY CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_three_semester_rule_valid_vs_expired():
    """
    Within 3 semesters: Internal marks are VALID and used in calculation.
    After 3 semesters: Internal status becomes INTERNAL NOT APPLICABLE / 0.0,
    and configured expired passing requirement (50%) applies.
    """
    # Student in Semester 4 with arrear from Semester 2 (difference = 2 < 3) -> VALID
    valid_rules = await arrear_service.get_arrear_internal_and_rules("953621104500", "CS8201", current_semester=4)
    assert valid_rules["is_valid"] is True
    assert valid_rules["internal_status"] == "VALID"
    assert valid_rules["semesters_elapsed"] == 2

    # Student in Semester 6 with arrear from Semester 2 (difference = 4 >= 3) -> EXPIRED
    expired_rules = await arrear_service.get_arrear_internal_and_rules("953621104500", "CS8201", current_semester=6)
    assert expired_rules["is_valid"] is False
    assert expired_rules["internal_status"] == "INTERNAL NOT APPLICABLE"
    assert expired_rules["internal_mark"] == 0.0
    assert expired_rules["pass_threshold"] == 50.0  # Configured expired passing requirement


# ─────────────────────────────────────────────────────────────────────────────
# 4. RESULT HISTORY & NEVER SHOW UNPUBLISHED
# ─────────────────────────────────────────────────────────────────────────────

def test_result_history_never_shows_unpublished():
    """Academic history & student profile must only return published results."""
    # Ensure profile only loads isPublished: True
    res = client.get("/api/students/953621104500/profile")
    assert res.status_code == 200
    profile_data = res.json()
    for r in profile_data.get("results", []):
        assert r.get("isPublished", True) is True


# ─────────────────────────────────────────────────────────────────────────────
# 5. ARREAR CLEARANCE ON PASS RESULT
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_arrear_clearance_lifecycle():
    """When a student clears an arrear with PASS, status updates to CLEARED."""
    # 1. Register arrear
    await arrear_service.register_or_update_arrear(
        register_number="953621104555",
        subject_code="CS8301",
        semester=3,
        result="FAIL",
        grade="RA",
        internal_marks=20.0
    )
    # Check pending
    cf = await arrear_service.get_student_carry_forward_view("953621104555")
    assert any(a["subjectCode"] == "CS8301" for a in cf["arrearSubjects"])

    # 2. Clear arrear with PASS
    await arrear_service.register_or_update_arrear(
        register_number="953621104555",
        subject_code="CS8301",
        semester=3,
        result="PASS",
        grade="B+",
        grade_point=7.0,
        final_marks=65.0
    )
    # Check cleared
    cf_cleared = await arrear_service.get_student_carry_forward_view("953621104555")
    assert not any(a["subjectCode"] == "CS8301" for a in cf_cleared["arrearSubjects"])
