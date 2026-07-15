import os
from fastapi import APIRouter, HTTPException
from app.database import db
from app.models.schemas import StudentModel, FacultyModel, HodModel
from typing import Dict, Any

router = APIRouter()

@router.post("/login")
async def login(payload: Dict[str, Any]):
    register_number = (payload.get("registerNumber") or "").strip()
    password = (payload.get("password") or "").strip()
    role = (payload.get("role") or "").strip().lower()
    if not register_number or not password or not role:
        raise HTTPException(status_code=400, detail={"error": "Missing credentials"})

    if role == "admin":
        settings = await db.admin_settings.find_one({"key": "admin_password"})
        admin_password = "admin"
        if settings:
            admin_password = settings.get("value", "admin")
        if register_number == "admin" and password == admin_password:
            return {"registerNumber": "admin", "name": "Administrator", "department": "All", "role": "admin"}
        raise HTTPException(status_code=401, detail={"error": "Invalid admin credentials"})

    if role == "student":
        user = await db.students.find_one({"registerNumber": register_number})
        if not user or str(user.get("password", "")).strip() != password:
            raise HTTPException(status_code=401, detail={"error": "Invalid credentials"})
        return {"registerNumber": register_number, "name": user.get("name", ""), "department": user.get("department", ""), "role": "student"}

    if role == "faculty":
        user = await db.faculties.find_one({"registerNumber": register_number})
        if not user or str(user.get("password", "")).strip() != password:
            raise HTTPException(status_code=401, detail={"error": "Invalid credentials"})
        return {"registerNumber": register_number, "name": user.get("name", ""), "department": user.get("department", ""), "role": "faculty"}

    if role == "hod":
        user = await db.hods.find_one({"registerNumber": register_number})
        if not user or str(user.get("password", "")).strip() != password:
            raise HTTPException(status_code=401, detail={"error": "Invalid credentials"})
        return {"registerNumber": register_number, "name": user.get("name", ""), "department": user.get("department", ""), "role": "hod"}

    raise HTTPException(status_code=400, detail={"error": "Invalid role selected"})



@router.get("/results")
async def get_all_results():
    results = [doc async for doc in db.results.find({})]
    return {"results": results}


@router.post("/change-admin-password")
async def change_admin_password(payload: Dict[str, Any]):
    current_password = (payload.get("currentPassword") or "").strip()
    new_password = (payload.get("newPassword") or "").strip()
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail={"error": "Missing current or new password"})
    
    settings = await db.admin_settings.find_one({"key": "admin_password"})
    admin_password = "admin"
    if settings:
        admin_password = settings.get("value", "admin")
        
    if current_password != admin_password:
        raise HTTPException(status_code=400, detail={"error": "Current password is incorrect"})
        
    await db.admin_settings.update_one(
        {"key": "admin_password"},
        {"$set": {"value": new_password}},
        upsert=True
    )
    return {"message": "Password changed successfully"}
