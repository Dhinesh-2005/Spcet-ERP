from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_batches():
    res = client.get("/api/academic/batches")
    assert res.status_code == 200
    batches = res.json()
    assert isinstance(batches, list)
    assert len(batches) > 0
    assert "batchName" in batches[0]

def test_create_batch():
    payload = {
        "batchName": "2025-2029",
        "department": "CSE",
        "startYear": 2025,
        "endYear": 2029,
        "currentSemester": 1,
        "regulation": "2024",
        "status": "ACTIVE"
    }
    res = client.post("/api/academic/batches", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "Batch '2025-2029' saved successfully" in data["message"]

def test_get_academic_config_default():
    res = client.get("/api/academic/config")
    assert res.status_code == 200
    cfg = res.json()
    assert "utCount" in cfg
    assert cfg["utCount"] == 5
    assert cfg["utWeightageMax"] == 60.0
    assert cfg["iaMax"] == 40.0
    assert cfg["practicalExConvertedMax"] == 75.0
    assert cfg["modelPracticalMax"] == 25.0
    assert cfg["theoryExternalWeightage"] == 60.0
    assert cfg["theoryInternalWeightage"] == 40.0
    assert cfg["overallPassPercentage"] == 50.0
    assert cfg["externalMinPercentage"] == 45.0
    assert len(cfg["gradeBoundaries"]) >= 7

def test_save_academic_config():
    payload = {
        "name": "Custom Test Configuration",
        "regulation": "2024",
        "department": "ECE",
        "utCount": 5,
        "utMax": 100.0,
        "utWeightageMax": 60.0,
        "iaMax": 40.0,
        "internalMax": 100.0,
        "practicalExCount": 10,
        "practicalExMax": 100.0,
        "practicalExConvertedMax": 75.0,
        "modelPracticalMax": 25.0,
        "theoryInternalWeightage": 40.0,
        "theoryExternalWeightage": 60.0,
        "practicalInternalWeightage": 50.0,
        "practicalExternalWeightage": 50.0,
        "integratedTheoryRatio": 0.5,
        "integratedPracticalRatio": 0.5,
        "integratedInternalWeightage": 50.0,
        "integratedExternalWeightage": 50.0,
        "externalRawMax": 100.0,
        "overallPassPercentage": 50.0,
        "externalMinPercentage": 45.0,
        "internalMinPercentage": 0.0,
        "arrearValiditySemesters": 3,
        "expiredArrearPassPercentage": 50.0,
        "attendanceMinPercentage": 75.0,
        "gradeBoundaries": [
            {"grade": "O", "gradePoint": 10.0, "minMarks": 90.0, "maxMarks": 100.0, "resultStatus": "PASS"},
            {"grade": "A+", "gradePoint": 9.0, "minMarks": 80.0, "maxMarks": 89.999, "resultStatus": "PASS"},
            {"grade": "A", "gradePoint": 8.0, "minMarks": 70.0, "maxMarks": 79.999, "resultStatus": "PASS"},
            {"grade": "B+", "gradePoint": 7.0, "minMarks": 60.0, "maxMarks": 69.999, "resultStatus": "PASS"},
            {"grade": "B", "gradePoint": 6.0, "minMarks": 50.0, "maxMarks": 59.999, "resultStatus": "PASS"},
            {"grade": "C", "gradePoint": 5.0, "minMarks": 45.0, "maxMarks": 49.999, "resultStatus": "PASS"},
            {"grade": "RA", "gradePoint": 0.0, "minMarks": 0.0, "maxMarks": 44.999, "resultStatus": "FAIL"}
        ],
        "roundAtFinalStageOnly": True,
        "decimalPrecision": 2,
        "roundToInteger": True
    }
    res = client.post("/api/academic/config", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "saved successfully" in data["message"]

def test_subject_crud_with_subject_type():
    sub = {
        "subjectCode": "CS9999",
        "subjectName": "Advanced Test Subject",
        "department": "CSE",
        "semester": 6,
        "credits": 4.0,
        "subjectType": "INTEGRATED",
        "regulation": "2021",
        "status": "ACTIVE"
    }
    res = client.post("/api/academic/subjects", json=sub)
    assert res.status_code == 200

    # Query with subjectType
    get_res = client.get("/api/academic/subjects?department=CSE&subjectType=INTEGRATED")
    assert get_res.status_code == 200
    subs = get_res.json()
    matched = [s for s in subs if s.get("subjectCode") == "CS9999"]
    assert len(matched) == 1
    assert matched[0]["subjectType"] == "INTEGRATED"
    assert matched[0]["status"] == "ACTIVE"
    assert matched[0]["isActive"] is True
