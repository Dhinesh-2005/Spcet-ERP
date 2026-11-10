import pytest
from io import BytesIO
import openpyxl
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Setup initial subject and student fixtures for tests
@pytest.fixture(autouse=True)
def setup_master_data():
    # Register subject CS8501
    client.post("/api/academic/subjects", json={
        "subjectCode": "CS8501",
        "subjectName": "Theory of Computation",
        "department": "CSE",
        "semester": 5,
        "credits": 4.0,
        "subjectType": "THEORY"
    })
    # Register student
    client.post("/api/academic/previous-results/import", json={
        "rows": [
            {
                "registerNumber": "953621104001",
                "subjectCode": "CS8501",
                "subjectName": "Theory of Computation",
                "semester": 5,
                "credits": 4,
                "grade": "B",
                "department": "CSE",
                "studentCurrentSem": 5
            },
            {
                "registerNumber": "953621104099",
                "subjectCode": "CS8501",
                "subjectName": "Theory of Computation",
                "semester": 5,
                "credits": 4,
                "grade": "B",
                "department": "CSE",
                "studentCurrentSem": 5
            }
        ]
    })

# ─────────────────────────────────────────────────────────────────────────────
# 1. FACULTY ACCESS & AUTHORIZATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_faculty_access_strict_unassigned():
    """Unassigned faculty must see empty list and be rejected from subject data."""
    res = client.get("/api/faculty-marks/my-subjects?facultyId=UNASSIGNED_FACULTY_001")
    assert res.status_code == 200
    assert res.json() == []

    # Attempting to access students roster for unauthorized subject must return 403 Forbidden
    res2 = client.get("/api/faculty-marks/subject-students?facultyId=UNASSIGNED_FACULTY_001&subjectCode=CS8501&semester=5")
    assert res2.status_code == 403
    assert "Access denied" in res2.json()["detail"]


def test_faculty_access_assigned():
    """Assign faculty to CS8501 and verify access."""
    # 1. Assign CS8501 to FAC_TEST_01 via academic endpoint
    assign_payload = {
        "facultyId": "FAC_TEST_01",
        "facultyName": "Dr. Test Professor",
        "department": "CSE",
        "semester": 5,
        "subjectCodes": ["CS8501"]
    }
    assign_res = client.post("/api/academic/faculty-access", json=assign_payload)
    assert assign_res.status_code == 200

    # 2. Verify my-subjects returns CS8501
    my_sub_res = client.get("/api/faculty-marks/my-subjects?facultyId=FAC_TEST_01")
    assert my_sub_res.status_code == 200
    subs = my_sub_res.json()
    codes = [s["subjectCode"] for s in subs]
    assert "CS8501" in codes

    # 3. Access students for CS8501 should now succeed
    students_res = client.get("/api/faculty-marks/subject-students?facultyId=FAC_TEST_01&subjectCode=CS8501&semester=5")
    assert students_res.status_code == 200
    data = students_res.json()
    assert data["subjectCode"] == "CS8501"


# ─────────────────────────────────────────────────────────────────────────────
# 2. MARK VALIDATION TESTS (Negative, > Max, Silent Capping Rejection)
# ─────────────────────────────────────────────────────────────────────────────

def test_save_marks_reject_negative():
    payload = {
        "facultyId": "FAC_TEST_01",
        "subjectCode": "CS8501",
        "semester": 5,
        "marks": [
            {
                "registerNumber": "953621104001",
                "componentMarks": {"UT1": -10}
            }
        ]
    }
    res = client.post("/api/faculty-marks/save", json=payload)
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]


def test_save_marks_reject_above_max():
    payload = {
        "facultyId": "FAC_TEST_01",
        "subjectCode": "CS8501",
        "semester": 5,
        "marks": [
            {
                "registerNumber": "953621104001",
                "componentMarks": {"Unit 1": 105}  # Max allowed is 100
            }
        ]
    }
    res = client.post("/api/faculty-marks/save", json=payload)
    assert res.status_code == 400
    assert "exceeds maximum allowed" in res.json()["detail"]


def test_save_marks_calculation_and_submitted_lock():
    # Save draft marks (Unit 1..5 max 20, Assessment Mark max 40)
    save_draft = {
        "facultyId": "FAC_TEST_01",
        "subjectCode": "CS8501",
        "semester": 5,
        "status": "DRAFT",
        "marks": [
            {
                "registerNumber": "953621104001",
                "componentMarks": {"Unit 1": 15, "Unit 2": 18, "Unit 3": 12, "Unit 4": 16, "Unit 5": 14, "Assessment Mark": 32}
            }
        ]
    }
    res_draft = client.post("/api/faculty-marks/save", json=save_draft)
    assert res_draft.status_code == 200

    # Submit final to lock
    save_final = {
        "facultyId": "FAC_TEST_01",
        "subjectCode": "CS8501",
        "semester": 5,
        "status": "SUBMITTED",
        "marks": [
            {
                "registerNumber": "953621104001",
                "componentMarks": {"Unit 1": 15, "Unit 2": 18, "Unit 3": 12, "Unit 4": 16, "Unit 5": 14, "Assessment Mark": 32}
            }
        ]
    }
    res_final = client.post("/api/faculty-marks/save", json=save_final)
    assert res_final.status_code == 200

    # Attempt to modify submitted marks by regular faculty must be rejected
    res_locked = client.post("/api/faculty-marks/save", json=save_draft)
    assert res_locked.status_code == 400
    assert "already SUBMITTED and locked" in res_locked.json()["detail"]

    # Unlock via HOD/Admin
    unlock_res = client.post("/api/faculty-marks/unlock", json={"subjectCode": "CS8501", "semester": 5})
    assert unlock_res.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# 3. EXCEL TEMPLATE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def test_download_excel_template_theory():
    res = client.get("/api/faculty-marks/template?facultyId=FAC_TEST_01&subjectCode=CS8501&semester=5")
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers["content-type"]

    # Verify template contains correct headers
    wb = openpyxl.load_workbook(BytesIO(res.content))
    ws = wb.active
    headers = [cell.value for cell in ws[1]]
    assert "Roll Number" in headers
    assert "Student Name" in headers
    assert "Subject Code" in headers
    assert "Unit 1" in headers
    assert "Assessment Mark" in headers


# ─────────────────────────────────────────────────────────────────────────────
# 4. TWO-STAGE EXCEL UPLOAD PIPELINE (Validate -> Error Diagnostics -> Confirm)
# ─────────────────────────────────────────────────────────────────────────────

def test_excel_upload_validation_errors():
    """Verify detailed error diagnostics on invalid Excel upload."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Roll Number", "Student Name", "Subject Code", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Assessment Mark"])
    # Row 2: Invalid mark > 100
    ws.append(["953621104001", "Student 1", "CS8501", 125, 18, 18, 18, 18, 30])
    # Row 3: Negative mark
    ws.append(["953621104002", "Student 2", "CS8501", 15, -15, 18, 18, 18, 30])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    files = {"file": ("marks.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"facultyId": "FAC_TEST_01", "subjectCode": "CS8501", "semester": "5"}

    res = client.post("/api/faculty-marks/upload-validate", files=files, data=data)
    assert res.status_code == 200
    result = res.json()
    assert result["isValid"] is False
    assert result["errorRows"] >= 2

    # Check diagnostic fields
    fields_in_error = [e["field"] for e in result["errors"]]
    assert "Unit 1" in fields_in_error
    assert "Unit 2" in fields_in_error
    errors_text = " ".join([e["error"] for e in result["errors"]])
    assert "exceeds maximum allowed" in errors_text
    assert "cannot be negative" in errors_text


def test_excel_upload_validate_and_confirm_success():
    """Verify valid Excel file passes validation and confirms successfully."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Roll Number", "Student Name", "Subject Code", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Assessment Mark"])
    ws.append(["953621104099", "Student Test", "CS8501", 15, 18, 16, 17, 18, 32])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    files = {"file": ("marks_valid.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"facultyId": "FAC_TEST_01", "subjectCode": "CS8501", "semester": "5"}

    res_val = client.post("/api/faculty-marks/upload-validate", files=files, data=data)
    assert res_val.status_code == 200
    val_json = res_val.json()
    assert val_json["isValid"] is True
    assert val_json["validRows"] == 1
    assert len(val_json["preview"]) == 1

    # Confirm upload
    confirm_payload = {
        "facultyId": "FAC_TEST_01",
        "facultyName": "Dr. Test Professor",
        "subjectCode": "CS8501",
        "semester": 5,
        "status": "DRAFT",
        "marks": val_json["preview"]
    }
    res_conf = client.post("/api/faculty-marks/upload-confirm", json=confirm_payload)
    assert res_conf.status_code == 200
    assert res_conf.json()["committedRows"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# 5. EXTERNAL MARKS UPLOAD & CALCULATION ENGINE CONVERSION (/100 -> /60)
# ─────────────────────────────────────────────────────────────────────────────

def test_external_marks_conversion():
    """External mark out of 100 is converted to /60 via calculation engine."""
    payload = [
        {
            "registerNumber": "953621104099",
            "subjectCode": "CS8501",
            "externalMarks": 80.0
        }
    ]
    res = client.post("/api/import/external", json=payload)
    assert res.status_code == 200
    assert res.json()["uploaded"] == 1


def test_external_marks_reject_out_of_range():
    """External mark > 100 or < 0 must be rejected."""
    payload_high = [{"registerNumber": "953621104099", "subjectCode": "CS8501", "externalMarks": 105.0}]
    res_high = client.post("/api/import/external", json=payload_high)
    assert res_high.status_code == 400
    assert "must be between 0 and 100" in res_high.json()["detail"]

    payload_neg = [{"registerNumber": "953621104099", "subjectCode": "CS8501", "externalMarks": -5.0}]
    res_neg = client.post("/api/import/external", json=payload_neg)
    assert res_neg.status_code == 400
    assert "must be between 0 and 100" in res_neg.json()["detail"]
