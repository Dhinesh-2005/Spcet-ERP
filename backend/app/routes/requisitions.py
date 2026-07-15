from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from bson import ObjectId
from app.database import db, clean_doc

router = APIRouter()

@router.get("")
async def get_all():
    return [clean_doc(doc) async for doc in db.requisitions.find({})]

@router.get("/faculty/{faculty_id}")
async def get_for_faculty(faculty_id: str):
    return [clean_doc(doc) async for doc in db.requisitions.find({"facultyId": faculty_id})]


@router.post("")
async def create(req: Dict[str, Any]):
    faculty_id = (req.get("facultyId") or "").strip()
    if not faculty_id:
        raise HTTPException(status_code=400, detail="Faculty ID cannot be empty.")
    
    exam_type = req.get("examType")
    if exam_type == "UNIT_TEST":
        raise HTTPException(status_code=400, detail="Unit Test requisitions are not supported. Faculty must upload them directly.")
    
    # Check if this faculty exists in the faculties or hods collection
    faculty = await db.faculties.find_one({"registerNumber": faculty_id})
    if not faculty:
        faculty = await db.hods.find_one({"registerNumber": faculty_id})
    
    if not faculty:
        raise HTTPException(status_code=400, detail=f"Staff with ID '{faculty_id}' is not registered in the system.")
        
    await db.requisitions.insert_one(req)
    return {"message": "Requisition sent successfully"}

@router.put("/{requisition_id}/status")
async def update_status(requisition_id: str, body: Dict[str, Any]):
    await db.requisitions.update_one({"_id": ObjectId(requisition_id)}, {"$set": {"status": body.get("status")}})
    return {}

@router.post("/{requisition_id}/details")
async def save_details(requisition_id: str, body: Dict[str, Any]):
    await db.requisitions.update_one({"_id": ObjectId(requisition_id)}, {"$set": body})
    return {}
