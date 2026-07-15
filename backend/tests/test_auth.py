from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_admin_login_success():
    response = client.post('/api/auth/login', json={
        'registerNumber': 'admin',
        'password': 'admin',
        'role': 'admin'
    })
    assert response.status_code == 200
    body = response.json()
    assert body['role'] == 'admin'
