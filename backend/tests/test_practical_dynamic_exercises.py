import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.calculation_engine import calculation_engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_practical_test_data():
    import asyncio
    from app.database import db
    async def _clean():
        await db.practical_configs.delete_many({"subjectCode": {"$in": ["CS8511", "EC8511", "CS8501"]}})
        await db.internal_marks.delete_many({"subjectCode": {"$in": ["CS8511", "EC8511", "CS8501"]}})
    asyncio.run(_clean())

    # 1. Register a Practical subject: CS8511 (Python Lab)
    client.post("/api/academic/subjects", json={
        "subjectCode": "CS8511",
        "subjectName": "Python Laboratory",
        "department": "CSE",
        "semester": 5,
        "credits": 2.0,
        "subjectType": "PRACTICAL"
    })
    # 2. Register another Practical subject: EC8511 (Circuits Lab)
    client.post("/api/academic/subjects", json={
        "subjectCode": "EC8511",
        "subjectName": "Circuits Laboratory",
        "department": "ECE",
        "semester": 5,
        "credits": 2.0,
        "subjectType": "PRACTICAL"
    })
    # 3. Register a Theory subject: CS8501
    client.post("/api/academic/subjects", json={
        "subjectCode": "CS8501",
        "subjectName": "Theory of Computation",
        "department": "CSE",
        "semester": 5,
        "credits": 4.0,
        "subjectType": "THEORY"
    })
    # 4. Assign faculty across departments
    # CSE faculty assigned to EC8511 (ECE practical)
    client.post("/api/academic/faculty-access", json={
        "facultyId": "FAC_PRAC_001",
        "facultyName": "Dr. Alan Turing",
        "department": "CSE",
        "subjectCodes": ["CS8511", "EC8511", "CS8501"]
    })
    # 5. Import students for both subjects
    client.post("/api/academic/previous-results/import", json={
        "rows": [
            {
                "registerNumber": "953621104101",
                "subjectCode": "CS8511",
                "subjectName": "Python Laboratory",
                "semester": 5,
                "credits": 2,
                "grade": "RA",
                "department": "CSE",
                "studentCurrentSem": 5
            },
            {
                "registerNumber": "953621104102",
                "subjectCode": "CS8511",
                "subjectName": "Python Laboratory",
                "semester": 5,
                "credits": 2,
                "grade": "RA",
                "department": "CSE",
                "studentCurrentSem": 5
            },
            {
                "registerNumber": "953621104101",
                "subjectCode": "EC8511",
                "subjectName": "Circuits Laboratory",
                "semester": 5,
                "credits": 2,
                "grade": "RA",
                "department": "ECE",
                "studentCurrentSem": 5
            }
        ]
    })


def test_default_practical_exercises_is_ex1_to_ex10():
    """Practical subjects default to EX1 to EX10."""
    res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_PRAC_001&subjectCode=CS8511&semester=5")
    assert res.status_code == 200
    data = res.json()
    assert data["subjectType"] == "PRACTICAL"
    assert data["configuredExercises"] == [f"EX{i}" for i in range(1, 11)]


def test_theory_subject_returns_theory_type():
    """Theory subjects retain subjectType THEORY and default unit flow."""
    res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_PRAC_001&subjectCode=CS8501&semester=5")
    assert res.status_code == 200
    data = res.json()
    assert data["subjectType"] == "THEORY"


def test_save_and_retrieve_subject_specific_exercises():
    """Different practical subjects maintain independent exercise configurations."""
    # Configure CS8511 with EX1..EX12
    cfg_12 = [f"EX{i}" for i in range(1, 13)]
    res1 = client.post("/api/faculty-marks/practical-config", json={
        "subjectCode": "CS8511",
        "semester": 5,
        "exercises": cfg_12
    })
    assert res1.status_code == 200
    assert res1.json()["configuredExercises"] == cfg_12

    # Configure EC8511 with EX1..EX15
    cfg_15 = [f"EX{i}" for i in range(1, 16)]
    res2 = client.post("/api/faculty-marks/practical-config", json={
        "subjectCode": "EC8511",
        "semester": 5,
        "exercises": cfg_15
    })
    assert res2.status_code == 200
    assert res2.json()["configuredExercises"] == cfg_15

    # Verify CS8511 still has 12
    get_cs = client.get("/api/faculty-marks/subject-students?facultyId=FAC_PRAC_001&subjectCode=CS8511&semester=5")
    assert get_cs.json()["configuredExercises"] == cfg_12

    # Verify EC8511 has 15
    get_ec = client.get("/api/faculty-marks/subject-students?facultyId=FAC_PRAC_001&subjectCode=EC8511&semester=5")
    assert get_ec.json()["configuredExercises"] == cfg_15


def test_save_practical_marks_with_validation_and_calculations():
    """
    Test practical marks save endpoint:
    - Max 10 per exercise enforced
    - Max 25 for Model Practical enforced
    - Correct Average /10, Practical /75, Total /100, and Overall Internal /40 computed
    """
    # Reject exercise > 10
    res_invalid_ex = client.post("/api/faculty-marks/save", json={
        "facultyId": "FAC_PRAC_001",
        "subjectCode": "CS8511",
        "semester": 5,
        "status": "DRAFT",
        "marks": [
            {
                "registerNumber": "953621104101",
                "componentMarks": {"EX1": 11.0, "Model": 20.0}
            }
        ]
    })
    assert res_invalid_ex.status_code == 400
    assert "exceeds maximum allowed (10.0)" in res_invalid_ex.json()["detail"]

    # Reject Model > 25
    res_invalid_model = client.post("/api/faculty-marks/save", json={
        "facultyId": "FAC_PRAC_001",
        "subjectCode": "CS8511",
        "semester": 5,
        "status": "DRAFT",
        "marks": [
            {
                "registerNumber": "953621104101",
                "componentMarks": {"EX1": 8.0, "Model": 26.0}
            }
        ]
    })
    assert res_invalid_model.status_code == 400
    assert "exceeds maximum allowed (25.0)" in res_invalid_model.json()["detail"]

    # Valid save matching Section 18:
    # EX1=8, EX2=9, EX3=7, EX4=8, EX5=10, EX6=9, EX7=8, EX8=7, EX9=9, EX10=8, EX11=10, EX12=9, Model=20
    # Average = 8.5, Practical /75 = 63.75, Total /100 = 83.75, Overall Internal /40 = 33.5
    marks_payload = {
        "EX1": 8, "EX2": 9, "EX3": 7, "EX4": 8, "EX5": 10, "EX6": 9,
        "EX7": 8, "EX8": 7, "EX9": 9, "EX10": 8, "EX11": 10, "EX12": 9,
        "Model": 20
    }
    cfg_12 = [f"EX{i}" for i in range(1, 13)]
    res_valid = client.post("/api/faculty-marks/save", json={
        "facultyId": "FAC_PRAC_001",
        "subjectCode": "CS8511",
        "semester": 5,
        "status": "DRAFT",
        "exercises": cfg_12,
        "marks": [
            {
                "registerNumber": "953621104101",
                "componentMarks": marks_payload
            }
        ]
    })
    assert res_valid.status_code == 200

    # Retrieve and verify calculation
    res_get = client.get("/api/faculty-marks/subject-students?facultyId=FAC_PRAC_001&subjectCode=CS8511&semester=5")
    assert res_get.status_code == 200
    student = next(s for s in res_get.json()["students"] if s["registerNumber"] == "953621104101")
    assert student["componentMarks"]["EX1"] == 8.0
    assert student["componentMarks"]["EX12"] == 9.0
    assert student["componentMarks"]["Model"] == 20.0
    assert student["finalInternal"] == 33.5

    # Test calculation_engine directly on retrieved componentMarks
    calc = calculation_engine.calculate_practical_internal(student["componentMarks"], active_exercises=cfg_12)
    assert calc["average"] == 8.5
    assert calc["practicalMark75"] == 63.75
    assert calc["modelPracticalMark"] == 20.0
    assert calc["total100"] == 83.75
    assert calc["overallInternal40"] == 33.5


def test_excel_template_practical_dynamic_columns():
    """Excel template for practical subject reflects configured exercises."""
    res = client.get("/api/faculty-marks/template?facultyId=FAC_PRAC_001&subjectCode=CS8511&semester=5")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
