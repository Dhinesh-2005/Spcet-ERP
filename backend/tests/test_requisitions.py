from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_requisition_invalid_faculty():
    # Send a requisition with a non-existent staff ID
    response = client.post('/api/requisitions', json={
        'department': 'CSE',
        'semester': '3',
        'subjectCode': 'CS3301',
        'courseTitle': 'Data Structures',
        'examType': 'SEMESTER',
        'facultyId': 'non_existent_staff_id_123',
        'deadline': '2026-07-20',
        'appointmentLetterNo': 'SPCET/QP/001',
        'status': 'PENDING'
    })
    assert response.status_code == 400
    body = response.json()
    assert 'detail' in body
    assert 'not registered in the system' in body['detail']

def test_create_requisition_unit_test_rejected():
    # Attempt to send a requisition with examType 'UNIT_TEST'
    response = client.post('/api/requisitions', json={
        'department': 'CSE',
        'semester': '3',
        'subjectCode': 'CS3301',
        'courseTitle': 'Data Structures',
        'examType': 'UNIT_TEST',
        'facultyId': 'some_faculty_id',
        'deadline': '2026-07-20',
        'appointmentLetterNo': 'SPCET/QP/001',
        'status': 'PENDING'
    })
    assert response.status_code == 400
    body = response.json()
    assert 'detail' in body
    assert 'Unit Test requisitions are not supported' in body['detail']

