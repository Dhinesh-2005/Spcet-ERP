import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.calculation_engine import calculation_engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_integrated_test_data():
    import asyncio
    from app.database import db
    async def _clean():
        await db.practical_configs.delete_many({"subjectCode": {"$in": ["IT8501", "CS8401", "CS8411"]}})
        await db.internal_marks.delete_many({"subjectCode": {"$in": ["IT8501", "CS8401", "CS8411"]}})
        await db.subjects.delete_many({"subjectCode": {"$in": ["IT8501", "CS8401", "CS8411"]}})
    asyncio.run(_clean())

    # 1. Register an Integrated subject: IT8501 (Web Technology with Lab)
    client.post("/api/academic/subjects", json={
        "subjectCode": "IT8501",
        "subjectName": "Web Technology",
        "department": "IT",
        "semester": 5,
        "credits": 4.0,
        "subjectType": "INTEGRATED"
    })
    # 2. Register a Standalone Theory subject: CS8401
    client.post("/api/academic/subjects", json={
        "subjectCode": "CS8401",
        "subjectName": "Database Management Systems",
        "department": "CSE",
        "semester": 4,
        "credits": 3.0,
        "subjectType": "THEORY"
    })
    # 3. Register a Standalone Practical subject: CS8411
    client.post("/api/academic/subjects", json={
        "subjectCode": "CS8411",
        "subjectName": "DBMS Laboratory",
        "department": "CSE",
        "semester": 4,
        "credits": 2.0,
        "subjectType": "PRACTICAL"
    })
    # 4. Assign faculty
    client.post("/api/academic/faculty-access", json={
        "facultyId": "FAC_INT_001",
        "facultyName": "Dr. Grace Hopper",
        "department": "IT",
        "subjectCodes": ["IT8501", "CS8401", "CS8411"]
    })
    # 5. Import students for the subjects
    client.post("/api/academic/previous-results/import", json={
        "rows": [
            {
                "registerNumber": "953621105001",
                "subjectCode": "IT8501",
                "subjectName": "Web Technology",
                "semester": 5,
                "credits": 4,
                "grade": "RA",
                "department": "IT",
                "studentCurrentSem": 5
            },
            {
                "registerNumber": "953621105002",
                "subjectCode": "IT8501",
                "subjectName": "Web Technology",
                "semester": 5,
                "credits": 4,
                "grade": "RA",
                "department": "IT",
                "studentCurrentSem": 5
            },
            {
                "registerNumber": "953621105001",
                "subjectCode": "CS8401",
                "subjectName": "Database Management Systems",
                "semester": 4,
                "credits": 3,
                "grade": "RA",
                "department": "CSE",
                "studentCurrentSem": 4
            },
            {
                "registerNumber": "953621105001",
                "subjectCode": "CS8411",
                "subjectName": "DBMS Laboratory",
                "semester": 4,
                "credits": 2,
                "grade": "RA",
                "department": "CSE",
                "studentCurrentSem": 4
            }
        ]
    })


# ─── 1. INTEGRATED CALCULATION ENGINE UNIT TESTS ─────────────────────────────

def test_integrated_theory_blank_and_explicit_zero():
    """
    Theory average excludes blank values.
    Explicit zero is included in denominator.
    Formula: Average = Sum / Count; UT Mark = Average * 0.6; Theory Internal = UT + IA.
    """
    # Unit 1 = 80, Unit 2 = 90, Unit 3 = blank, Unit 4 = 70, Unit 5 = 60
    # Average = (80 + 90 + 70 + 60) / 4 = 75
    # UT Mark = 75 * 0.6 = 45 / 60
    # IA = 32
    # Theory Internal = 45 + 32 = 77 / 100
    theory_marks = {
        "Unit 1": 80,
        "Unit 2": 90,
        "Unit 3": "",
        "Unit 4": 70,
        "Unit 5": 60,
        "Assessment Mark": 32
    }
    pr_marks = {f"EX{i}": 8 for i in range(1, 11)}
    pr_marks["Model"] = 20

    res = calculation_engine.calculate_integrated_internal(theory_marks, pr_marks)
    th = res["theoryDetails"]
    assert th["unitCount"] == 4
    assert th["average"] == 75.0
    assert th["utMark60"] == 45.0
    assert th["assessmentMark"] == 32.0
    assert res["theoryInternal"] == 77.0

    # With explicit zero:
    theory_zero = {
        "Unit 1": 0,
        "Unit 2": 100,
        "Assessment Mark": 20
    }
    res_zero = calculation_engine.calculate_integrated_internal(theory_zero, pr_marks)
    th_z = res_zero["theoryDetails"]
    assert th_z["unitCount"] == 2
    assert th_z["average"] == 50.0
    assert th_z["utMark60"] == 30.0
    assert res_zero["theoryInternal"] == 50.0


def test_integrated_practical_blank_and_explicit_zero():
    """
    Practical average excludes blank exercises.
    Explicit zero is included.
    Formula: Pr Avg = Sum / Count; Pr Mark = Avg * 7.5; Pr Internal = Pr Mark + Model.
    """
    # Practical Average = 8
    # Practical Mark = 8 * 7.5 = 60 / 75
    # Model Practical = 20 / 25
    # Practical Internal = 60 + 20 = 80 / 100
    pr_marks = {
        "EX1": 8, "EX2": 8, "EX3": "", "EX4": 8, "EX5": 8,
        "Model": 20
    }
    th_marks = {"Unit 1": 100, "Assessment Mark": 40}
    res = calculation_engine.calculate_integrated_internal(th_marks, pr_marks)
    pr = res["practicalDetails"]
    assert pr["exCount"] == 4
    assert pr["average"] == 8.0
    assert pr["practicalMark75"] == 60.0
    assert pr["modelPracticalMark"] == 20.0
    assert res["practicalInternal"] == 80.0

    # With explicit 0 in exercise:
    pr_zero = {"EX1": 0, "EX2": 10, "Model": 10}
    res_zero = calculation_engine.calculate_integrated_internal(th_marks, pr_zero)
    pr_z = res_zero["practicalDetails"]
    assert pr_z["exCount"] == 2
    assert pr_z["average"] == 5.0
    assert pr_z["practicalMark75"] == 37.5
    assert res_zero["practicalInternal"] == 47.5


def test_integrated_final_formula():
    """
    Combined Total / 200 = Theory Internal / 100 + Practical Internal / 100
    Integrated Internal / 50 = (Theory Internal + Practical Internal) / 4
    Example from prompt:
    Theory Internal = 77 / 100
    Practical Internal = 80 / 100
    Combined Total = 157 / 200
    Integrated Internal = 157 / 4 = 39.25 / 50
    """
    theory_marks = {
        "Unit 1": 80, "Unit 2": 90, "Unit 3": "", "Unit 4": 70, "Unit 5": 60,
        "Assessment Mark": 32
    }
    practical_marks = {
        "EX1": 8, "EX2": 8, "EX3": 8, "EX4": 8, "EX5": 8,
        "EX6": 8, "EX7": 8, "EX8": 8, "EX9": 8, "EX10": 8,
        "Model": 20
    }
    res = calculation_engine.calculate_integrated_internal(theory_marks, practical_marks)
    assert res["theoryInternal"] == 77.0
    assert res["practicalInternal"] == 80.0
    assert res["combinedTotal"] == 157.0
    assert res["integratedInternal"] == 39.25
    assert res["rawInternal"] == 39.25


def test_integrated_internal_capping():
    """Theory Internal caps at 100, Practical Internal caps at 100, Integrated caps at 50."""
    theory_marks = {"Unit 1": 100, "Assessment Mark": 40}  # UT 60 + IA 40 = 100
    practical_marks = {f"EX{i}": 10 for i in range(1, 11)}
    practical_marks["Model"] = 25  # Pr 75 + Model 25 = 100
    res = calculation_engine.calculate_integrated_internal(theory_marks, practical_marks)
    assert res["theoryInternal"] == 100.0
    assert res["practicalInternal"] == 100.0
    assert res["combinedTotal"] == 200.0
    assert res["integratedInternal"] == 50.0


# ─── 2. API ENDPOINTS & LIFECYCLE TESTS ──────────────────────────────────────

def test_integrated_subject_students_fetch():
    """Integrated subject returns subjectType INTEGRATED and default EX1 to EX10."""
    res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=IT8501&semester=5")
    assert res.status_code == 200
    data = res.json()
    assert data["subjectType"] == "INTEGRATED"
    assert data["configuredExercises"] == [f"EX{i}" for i in range(1, 11)]
    assert len(data["students"]) == 2


def test_integrated_dynamic_exercises_add_and_remove():
    """Faculty can add EX11, EX12 to Integrated subject and configuration persists."""
    # Add exercises up to EX12
    cfg_payload = {
        "subjectCode": "IT8501",
        "semester": 5,
        "exercises": [f"EX{i}" for i in range(1, 13)]
    }
    res = client.post("/api/faculty-marks/practical-config", json=cfg_payload)
    assert res.status_code == 200
    assert res.json()["configuredExercises"] == [f"EX{i}" for i in range(1, 13)]

    # Fetch students roster and verify configuredExercises is EX1..EX12
    res2 = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=IT8501&semester=5")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["configuredExercises"] == [f"EX{i}" for i in range(1, 13)]

    # Dynamic exercise configuration for IT8501 does NOT affect CS8411
    res_other = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=CS8411&semester=4")
    assert res_other.status_code == 200
    assert res_other.json()["configuredExercises"] == [f"EX{i}" for i in range(1, 11)]


def test_integrated_save_and_recalculation():
    """Manual mark entry saves and calculates Theory, Practical, Combined, and Integrated correctly."""
    save_payload = {
        "facultyId": "FAC_INT_001",
        "facultyName": "Dr. Grace Hopper",
        "subjectCode": "IT8501",
        "semester": 5,
        "status": "DRAFT",
        "exercises": [f"EX{i}" for i in range(1, 11)],
        "marks": [
            {
                "registerNumber": "953621105001",
                "name": "Student 1",
                "componentMarks": {
                    "Unit 1": 80,
                    "Unit 2": 90,
                    "Unit 4": 70,
                    "Unit 5": 60,
                    "Assessment Mark": 32,
                    "EX1": 8, "EX2": 8, "EX3": 8, "EX4": 8, "EX5": 8,
                    "EX6": 8, "EX7": 8, "EX8": 8, "EX9": 8, "EX10": 8,
                    "Model": 20
                }
            }
        ]
    }
    res = client.post("/api/faculty-marks/save", json=save_payload)
    assert res.status_code == 200

    # Fetch and verify saved marks
    res_get = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=IT8501&semester=5")
    assert res_get.status_code == 200
    st1 = next(s for s in res_get.json()["students"] if s["registerNumber"] == "953621105001")
    assert st1["componentMarks"]["Unit 1"] == 80
    assert st1["componentMarks"]["Assessment Mark"] == 32
    assert st1["componentMarks"]["Model"] == 20
    assert st1["finalInternal"] == 39.25

    # Also verify database persistence directly
    import asyncio
    from app.database import db
    async def _check_db():
        doc = await db.internal_marks.find_one({"registerNumber": "953621105001", "subjectCode": "IT8501"})
        assert doc is not None
        assert doc["theoryInternal"] == 77.0
        assert doc["practicalInternal"] == 80.0
        assert doc["combinedTotal"] == 157.0
        assert doc["integratedInternal"] == 39.25
        assert doc["finalInternal"] == 39.25
    asyncio.run(_check_db())


def test_integrated_rejects_invalid_marks():
    """Backend strictly rejects Unit > 100, IA > 40, EX > 10, Model > 25, and negative marks."""
    # 1. Unit > 100
    p1 = {
        "facultyId": "FAC_INT_001",
        "subjectCode": "IT8501",
        "semester": 5,
        "marks": [{"registerNumber": "953621105001", "componentMarks": {"Unit 1": 105}}]
    }
    r1 = client.post("/api/faculty-marks/save", json=p1)
    assert r1.status_code == 400
    assert "exceeds maximum allowed" in r1.json()["detail"]

    # 2. IA > 40
    p2 = {
        "facultyId": "FAC_INT_001",
        "subjectCode": "IT8501",
        "semester": 5,
        "marks": [{"registerNumber": "953621105001", "componentMarks": {"Assessment Mark": 45}}]
    }
    r2 = client.post("/api/faculty-marks/save", json=p2)
    assert r2.status_code == 400
    assert "exceeds maximum allowed" in r2.json()["detail"]

    # 3. EX > 10
    p3 = {
        "facultyId": "FAC_INT_001",
        "subjectCode": "IT8501",
        "semester": 5,
        "marks": [{"registerNumber": "953621105001", "componentMarks": {"EX1": 12}}]
    }
    r3 = client.post("/api/faculty-marks/save", json=p3)
    assert r3.status_code == 400
    assert "exceeds maximum allowed" in r3.json()["detail"]

    # 4. Model > 25
    p4 = {
        "facultyId": "FAC_INT_001",
        "subjectCode": "IT8501",
        "semester": 5,
        "marks": [{"registerNumber": "953621105001", "componentMarks": {"Model": 30}}]
    }
    r4 = client.post("/api/faculty-marks/save", json=p4)
    assert r4.status_code == 400
    assert "exceeds maximum allowed" in r4.json()["detail"]

    # 5. Negative marks
    p5 = {
        "facultyId": "FAC_INT_001",
        "subjectCode": "IT8501",
        "semester": 5,
        "marks": [{"registerNumber": "953621105001", "componentMarks": {"Unit 2": -5}}]
    }
    r5 = client.post("/api/faculty-marks/save", json=p5)
    assert r5.status_code == 400
    assert "cannot be negative" in r5.json()["detail"]


def test_faculty_authorization_enforced():
    """Faculty not assigned to IT8501 cannot access or modify it."""
    res = client.get("/api/faculty-marks/subject-students?facultyId=UNAUTHORIZED_FAC&subjectCode=IT8501&semester=5")
    assert res.status_code == 403


def test_standalone_theory_and_practical_preserved():
    """
    Standalone THEORY formulas (UT/60 + IA/40 = Total/100 -> Overall/40)
    and Standalone PRACTICAL formulas (Avg/10 * 7.5 = 75 + Model/25 = Total/100 -> Overall/40)
    remain completely unchanged.
    """
    # Standalone Theory: CS8401
    th_res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=CS8401&semester=4")
    assert th_res.status_code == 200
    assert th_res.json()["subjectType"] == "THEORY"

    th_calc = calculation_engine.calculate_theory_internal({"Unit 1": 100, "IA": 40})
    assert th_calc["utMark60"] == 60.0
    assert th_calc["assessmentMark"] == 40.0
    assert th_calc["total100"] == 100.0
    assert th_calc["overallInternal40"] == 40.0

    # Standalone Practical: CS8411
    pr_res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_INT_001&subjectCode=CS8411&semester=4")
    assert pr_res.status_code == 200
    assert pr_res.json()["subjectType"] == "PRACTICAL"

    pr_calc = calculation_engine.calculate_practical_internal({f"EX{i}": 10 for i in range(1, 11)} | {"Model": 25})
    assert pr_calc["exAverage"] == 10.0
    assert pr_calc["practicalMark75"] == 75.0
    assert pr_calc["modelPracticalMark"] == 25.0
    assert pr_calc["total100"] == 100.0
    assert pr_calc["overallInternal40"] == 40.0
