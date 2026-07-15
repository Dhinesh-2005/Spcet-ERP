from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from app.database import db, clean_doc, clean_docs
from typing import Dict, Any

router = APIRouter()

@router.get("/{reg_no}/profile")
async def get_profile(reg_no: str):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    results = [doc async for doc in db.results.find({"registerNumber": reg_no, "isPublished": True})]
    return {"student": clean_doc(student), "results": clean_docs(results)}


@router.post("/{reg_no}/photo")
async def upload_photo(reg_no: str, photo: UploadFile = File(...)):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student:
        raise HTTPException(status_code=400, detail={"error": "Student not found"})
    await db.students.update_one({"registerNumber": reg_no}, {"$set": {"photo": await photo.read()}})
    return {"message": "Photo uploaded successfully"}

@router.get("/{reg_no}/photo")
async def get_photo(reg_no: str):
    student = await db.students.find_one({"registerNumber": reg_no})
    if not student or not student.get("photo"):
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=student["photo"], media_type="image/jpeg")
