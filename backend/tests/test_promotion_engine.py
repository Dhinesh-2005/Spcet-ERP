import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.database import db

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_promotion_data():
    async def _clean():
        await db.students.delete_many({"registerNumber": {"$regex": "^TEST_PROMO_"}})
        await db.admin_settings.update_one(
            {"key": "admin_password"},
            {"$set": {"value": "admin123"}},
            upsert=True
        )
    asyncio.run(_clean())
    yield
    asyncio.run(_clean())

def test_promote_requires_admin_password():
    # Attempt without password
    res = client.post("/api/import/promote-students", json={
        "department": "CSE",
        "currentSemester": 3
    })
    assert res.status_code == 401
    assert "password" in res.json()["detail"]["error"].lower()

    # Attempt with wrong password
    res = client.post("/api/import/promote-students", json={
        "department": "CSE",
        "currentSemester": 3,
        "adminPassword": "wrongpassword"
    })
    assert res.status_code == 401
    assert "Invalid admin password" in res.json()["detail"]["error"]

def test_promote_specific_dept_and_semester():
    async def _seed():
        await db.students.insert_many([
            {"registerNumber": "TEST_PROMO_001", "name": "Student 1", "department": "CSE", "semester": 3, "year": 2},
            {"registerNumber": "TEST_PROMO_002", "name": "Student 2", "department": "CSE", "semester": 3, "year": 2},
            {"registerNumber": "TEST_PROMO_003", "name": "Student 3", "department": "ECE", "semester": 3, "year": 2},
        ])
    asyncio.run(_seed())

    res = client.post("/api/import/promote-students", json={
        "department": "CSE",
        "currentSemester": 3,
        "adminPassword": "admin123"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["promotedCount"] == 2
    assert data["graduatedCount"] == 0

    async def _verify():
        s1 = await db.students.find_one({"registerNumber": "TEST_PROMO_001"})
        s2 = await db.students.find_one({"registerNumber": "TEST_PROMO_002"})
        s3 = await db.students.find_one({"registerNumber": "TEST_PROMO_003"})
        assert s1["semester"] == 4 and s1["year"] == 2
        assert s2["semester"] == 4 and s2["year"] == 2
        # ECE student should NOT be touched
        assert s3["semester"] == 3
    asyncio.run(_verify())

def test_promote_all_dept_and_all_sem():
    async def _seed():
        await db.students.insert_many([
            {"registerNumber": "TEST_PROMO_S1", "department": "CSE", "semester": 1, "year": 1},
            {"registerNumber": "TEST_PROMO_S2", "department": "ECE", "semester": 2, "year": 1},
            {"registerNumber": "TEST_PROMO_S7", "department": "MECH", "semester": 7, "year": 4},
            {"registerNumber": "TEST_PROMO_S8", "department": "CIVIL", "semester": 8, "year": 4},
        ])
    asyncio.run(_seed())

    res = client.post("/api/import/promote-students", json={
        "department": "ALL",
        "currentSemester": "ALL",
        "adminPassword": "admin123"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["promotedCount"] >= 3
    assert data["graduatedCount"] >= 1

    async def _verify():
        s1 = await db.students.find_one({"registerNumber": "TEST_PROMO_S1"})
        s2 = await db.students.find_one({"registerNumber": "TEST_PROMO_S2"})
        s7 = await db.students.find_one({"registerNumber": "TEST_PROMO_S7"})
        s8 = await db.students.find_one({"registerNumber": "TEST_PROMO_S8"})

        # S1: sem 1 -> 2 (NOT cascaded to 3, 4, 5, etc.)
        assert s1["semester"] == 2 and s1["year"] == 1
        # S2: sem 2 -> 3
        assert s2["semester"] == 3 and s2["year"] == 2
        # S7: sem 7 -> 8
        assert s7["semester"] == 8 and s7["year"] == 4
        # S8: sem 8 -> 99 (graduated), year 5
        assert s8["semester"] == 99 and s8["year"] == 5
    asyncio.run(_verify())

def test_promote_via_query_params():
    async def _seed():
        await db.students.insert_one(
            {"registerNumber": "TEST_PROMO_QP", "department": "AIDS", "semester": 5, "year": 3}
        )
    asyncio.run(_seed())

    res = client.post("/api/import/promote-students?department=AIDS&currentSemester=5&adminPassword=admin123")
    assert res.status_code == 200
    data = res.json()
    assert data["promotedCount"] == 1

    async def _verify():
        s = await db.students.find_one({"registerNumber": "TEST_PROMO_QP"})
        assert s["semester"] == 6 and s["year"] == 3
    asyncio.run(_verify())
