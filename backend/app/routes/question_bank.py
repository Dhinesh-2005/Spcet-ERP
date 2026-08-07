import re
import random
from datetime import datetime
from io import BytesIO
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from bson import ObjectId
from app.database import db, clean_doc, clean_docs
from app.models.schemas import QuestionBankModel, GenerateQuestionPaperRequest

router = APIRouter()

def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()

def _find_col_idx(header: List[Any], keywords: List[str]) -> int:
    for idx, cell in enumerate(header):
        val = re.sub(r"[^a-z0-9]", "", _clean_str(cell).lower())
        for kw in keywords:
            if kw in val:
                return idx
    return -1

def _normalize_unit(unit_str: str, co_str: str = "") -> str:
    unit_str = _clean_str(unit_str)
    if unit_str:
        num_match = re.search(r"\d+", unit_str)
        if num_match:
            return f"Unit {num_match.group(0)}"
        return unit_str
    
    co_str = _clean_str(co_str).upper()
    co_match = re.search(r"CO(\d+)", co_str)
    if co_match:
        return f"Unit {co_match.group(1)}"
    
    return "Unit 1"

def _normalize_co(co_str: str) -> str:
    co_str = _clean_str(co_str).upper()
    match = re.search(r"CO\d+", co_str)
    if match:
        return match.group(0)
    num_match = re.search(r"\d+", co_str)
    if num_match:
        return f"CO{num_match.group(0)}"
    return co_str if co_str else "CO1"

def _normalize_part(part_str: str, marks_val: float) -> str:
    part_str = _clean_str(part_str).upper()
    if "A" in part_str:
        return "A"
    if "B" in part_str:
        return "B"
    if "C" in part_str:
        return "C"
    
    if marks_val <= 2:
        return "A"
    elif marks_val >= 5:
        return "B"
    return "A"

@router.post("/upload")
async def upload_question_bank(
    file: UploadFile = File(...),
    subjectCode: str = Form(...),
    subjectName: Optional[str] = Form(None),
    regulation: Optional[str] = Form(None),
    semester: Optional[str] = Form(None),
):
    import openpyxl

    content = await file.read()
    try:
        workbook = openpyxl.load_workbook(filename=BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Excel file is empty")

    header_idx = -1
    for idx, row in enumerate(rows[:20]):
        if not row:
            continue
        row_str = " ".join([_clean_str(c).lower() for c in row if c])
        if "question" in row_str or "co" in row_str or "part" in row_str:
            header_idx = idx
            break

    if header_idx == -1:
        header_idx = 0

    header = [ _clean_str(c) for c in (rows[header_idx] or []) ]
    q_idx = _find_col_idx(header, ["question", "qtext", "questions"])
    co_idx = _find_col_idx(header, ["co", "courseoutcome"])
    k_idx = _find_col_idx(header, ["klevel", "k-level", "btl", "bloom"])
    marks_idx = _find_col_idx(header, ["mark", "marks", "weightage"])
    part_idx = _find_col_idx(header, ["part", "section"])
    unit_idx = _find_col_idx(header, ["unit", "unitno"])

    if q_idx == -1:
        raise HTTPException(status_code=400, detail="Missing mandatory 'Question' column in Excel file")

    total_rows = 0
    imported = 0
    skipped = 0
    duplicates = 0
    failed = 0

    now_iso = datetime.utcnow().isoformat()

    existing_docs = [doc async for doc in db.QuestionBank.find({"subjectCode": subjectCode})]
    existing_map = set(re.sub(r"\s+", "", doc.get("question", "").lower()) for doc in existing_docs if doc.get("question"))

    new_docs = []

    for row_num in range(header_idx + 1, len(rows)):
        row = rows[row_num]
        if not row:
            continue

        total_rows += 1

        question_text = _clean_str(row[q_idx]) if q_idx < len(row) else ""
        if not question_text:
            skipped += 1
            continue

        raw_co = _clean_str(row[co_idx]) if co_idx != -1 and co_idx < len(row) else "CO1"
        co_val = _normalize_co(raw_co)

        k_level = _clean_str(row[k_idx]) if k_idx != -1 and k_idx < len(row) else "K1"
        if not k_level:
            k_level = "K1"

        raw_marks = row[marks_idx] if marks_idx != -1 and marks_idx < len(row) else None
        try:
            marks_val = float(raw_marks) if raw_marks is not None and str(raw_marks).strip() != "" else 2.0
        except (ValueError, TypeError):
            marks_val = 2.0

        raw_part = _clean_str(row[part_idx]) if part_idx != -1 and part_idx < len(row) else ""
        part_val = _normalize_part(raw_part, marks_val)

        raw_unit = _clean_str(row[unit_idx]) if unit_idx != -1 and unit_idx < len(row) else ""
        unit_val = _normalize_unit(raw_unit, co_val)

        norm_q = re.sub(r"\s+", "", question_text.lower())
        if norm_q in existing_map:
            duplicates += 1
            continue

        existing_map.add(norm_q)

        doc = {
            "subjectCode": subjectCode,
            "subjectName": subjectName,
            "regulation": regulation,
            "semester": semester,
            "unit": unit_val,
            "question": question_text,
            "part": part_val,
            "marks": marks_val,
            "co": co_val,
            "kLevel": k_level,
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        new_docs.append(doc)
        imported += 1

    if new_docs:
        await db.QuestionBank.insert_many(new_docs)

    return {
        "message": f"Question Bank upload completed for {subjectCode}",
        "summary": {
            "totalRows": total_rows,
            "imported": imported,
            "skipped": skipped,
            "duplicates": duplicates,
            "failed": failed,
        }
    }

@router.post("/parse-and-generate")
async def parse_and_generate_paper(
    file: UploadFile = File(...),
    unit: str = Form("Unit 1"),
):
    import openpyxl

    content = await file.read()
    try:
        workbook = openpyxl.load_workbook(filename=BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Excel file is empty")

    header_idx = -1
    for idx, row in enumerate(rows[:20]):
        if not row:
            continue
        row_str = " ".join([_clean_str(c).lower() for c in row if c])
        if "question" in row_str or "co" in row_str or "part" in row_str:
            header_idx = idx
            break

    if header_idx == -1:
        header_idx = 0

    header = [ _clean_str(c) for c in (rows[header_idx] or []) ]
    q_idx = _find_col_idx(header, ["question", "qtext", "questions"])
    co_idx = _find_col_idx(header, ["co", "courseoutcome"])
    k_idx = _find_col_idx(header, ["klevel", "k-level", "btl", "bloom"])
    marks_idx = _find_col_idx(header, ["mark", "marks", "weightage"])
    part_idx = _find_col_idx(header, ["part", "section"])
    unit_idx = _find_col_idx(header, ["unit", "unitno"])

    if q_idx == -1:
        raise HTTPException(status_code=400, detail="Missing mandatory 'Question' column in Excel file")

    unit_num_match = re.search(r"\d+", unit)
    target_unit_num = unit_num_match.group(0) if unit_num_match else None

    all_questions = []
    seen_q = set()

    for row_num in range(header_idx + 1, len(rows)):
        row = rows[row_num]
        if not row:
            continue

        question_text = _clean_str(row[q_idx]) if q_idx < len(row) else ""
        if not question_text:
            continue

        norm_q = re.sub(r"\s+", "", question_text.lower())
        if norm_q in seen_q:
            continue
        seen_q.add(norm_q)

        raw_co = _clean_str(row[co_idx]) if co_idx != -1 and co_idx < len(row) else ""
        if raw_co:
            co_val = _normalize_co(raw_co)
        else:
            co_val = f"CO{target_unit_num}" if target_unit_num else "CO1"

        k_level = _clean_str(row[k_idx]) if k_idx != -1 and k_idx < len(row) else "K1"
        if not k_level:
            k_level = "K1"

        raw_marks = row[marks_idx] if marks_idx != -1 and marks_idx < len(row) else None
        try:
            marks_val = float(raw_marks) if raw_marks is not None and str(raw_marks).strip() != "" else 2.0
        except (ValueError, TypeError):
            marks_val = 2.0

        raw_part = _clean_str(row[part_idx]) if part_idx != -1 and part_idx < len(row) else ""
        part_val = _normalize_part(raw_part, marks_val)

        raw_unit = _clean_str(row[unit_idx]) if unit_idx != -1 and unit_idx < len(row) else ""
        unit_val = _normalize_unit(raw_unit, co_val)

        # Filter by unit if specified
        if target_unit_num:
            u_match = re.search(r"\d+", unit_val)
            if u_match and u_match.group(0) != target_unit_num:
                continue

        doc = {
            "unit": unit_val,
            "question": question_text,
            "part": part_val,
            "marks": marks_val,
            "co": co_val,
            "kLevel": k_level,
        }
        all_questions.append(doc)

    part_a = [q for q in all_questions if q["part"] == "A" or q["marks"] <= 2]
    part_b_all = [q for q in all_questions if q["part"] == "B" or q["marks"] > 2]
    part_c_all = [q for q in all_questions if q["part"] == "C"]

    b_16 = [q for q in part_b_all if q["marks"] >= 12]
    b_8 = [q for q in part_b_all if 5 <= q["marks"] < 12]

    random.shuffle(part_a)
    random.shuffle(part_b_all)
    random.shuffle(b_16)
    random.shuffle(b_8)
    random.shuffle(part_c_all)

    # For Regulation 2024:
    # Q6 (16m): 2 questions (Q6a, Q6b)
    # Q7 (16m): 2 questions (Q7a, Q7b)
    # Q8 (8m):  2 questions (Q8a, Q8b)
    selected_16 = b_16[:4]
    if len(selected_16) < 4:
        used = {id(q) for q in selected_16}
        rem = [q for q in part_b_all if id(q) not in used]
        selected_16.extend(rem[: 4 - len(selected_16)])

    used_16 = {id(q) for q in selected_16}
    selected_8 = [q for q in b_8 if id(q) not in used_16][:2]
    if len(selected_8) < 2:
        rem = [q for q in part_b_all if id(q) not in used_16]
        selected_8.extend(rem[: 2 - len(selected_8)])

    selected_part_b = selected_16 + selected_8
    selected_part_a = part_a[:5]

    if len(part_c_all) >= 2:
        selected_part_c = part_c_all[:2]
    else:
        used_b = {id(q) for q in selected_part_b}
        leftover_b = [q for q in part_b_all if id(q) not in used_b]
        selected_part_c = (part_c_all + leftover_b)[:2]

    warning = None
    if len(part_a) < 5 or len(part_b_all) < 6:
        warning = f"Notice: Excel provided {len(part_a)} Part A and {len(part_b_all)} Part B questions for {unit}."

    return {
        "unit": unit,
        "warning": warning,
        "partA": selected_part_a,
        "partB": selected_part_b,
        "partC": selected_part_c,
    }

@router.get("")
async def get_questions(
    subjectCode: Optional[str] = Query(None),
    unit: Optional[str] = Query(None),
    co: Optional[str] = Query(None),
    part: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    query: Dict[str, Any] = {}
    if subjectCode:
        query["subjectCode"] = subjectCode
    if unit:
        num = re.search(r"\d+", unit)
        if num:
            query["unit"] = {"$regex": f"Unit\\s*{num.group(0)}|\\b{num.group(0)}\\b", "$options": "i"}
        else:
            query["unit"] = unit
    if co:
        query["co"] = co
    if part:
        query["part"] = part.upper()
    if search:
        query["question"] = {"$regex": search, "$options": "i"}

    total = await db.QuestionBank.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.QuestionBank.find(query).skip(skip).limit(limit).sort("createdAt", -1)
    items = [clean_doc(d) async for d in cursor]

    pages = (total + limit - 1) // limit if total > 0 else 1

    return {
        "questions": items,
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit,
    }

@router.post("/manual")
async def add_question(question: QuestionBankModel):
    now_iso = datetime.utcnow().isoformat()
    doc = question.dict(exclude_none=True, exclude={"id"})
    doc["createdAt"] = now_iso
    doc["updatedAt"] = now_iso
    doc["unit"] = _normalize_unit(doc.get("unit", ""), doc.get("co", ""))
    doc["co"] = _normalize_co(doc.get("co", ""))
    doc["part"] = _normalize_part(doc.get("part", ""), doc.get("marks", 2.0))

    res = await db.QuestionBank.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    return {"message": "Question created successfully", "question": doc}

@router.put("/{question_id}")
async def update_question(question_id: str, question: QuestionBankModel):
    now_iso = datetime.utcnow().isoformat()
    update_data = question.dict(exclude_none=True, exclude={"id"})
    update_data["updatedAt"] = now_iso
    if "unit" in update_data:
        update_data["unit"] = _normalize_unit(update_data["unit"], update_data.get("co", ""))
    if "co" in update_data:
        update_data["co"] = _normalize_co(update_data["co"])
    if "part" in update_data:
        update_data["part"] = _normalize_part(update_data["part"], update_data.get("marks", 2.0))

    result = await db.QuestionBank.update_one({"_id": ObjectId(question_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question updated successfully"}

@router.delete("/{question_id}")
async def delete_question(question_id: str):
    result = await db.QuestionBank.delete_one({"_id": ObjectId(question_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted successfully"}

@router.post("/generate-paper")
async def generate_question_paper(req: GenerateQuestionPaperRequest):
    unit_num_match = re.search(r"\d+", req.unit)
    unit_regex = f"Unit\\s*{unit_num_match.group(0)}|\\b{unit_num_match.group(0)}\\b" if unit_num_match else req.unit

    base_query = {
        "subjectCode": req.subjectCode,
        "unit": {"$regex": unit_regex, "$options": "i"},
    }

    part_a_query = {**base_query, "part": "A"}
    part_b_query = {**base_query, "part": "B"}
    part_c_query = {**base_query, "part": "C"}

    part_a_all = [clean_doc(d) async for d in db.QuestionBank.find(part_a_query)]
    part_b_all = [clean_doc(d) async for d in db.QuestionBank.find(part_b_query)]
    part_c_all = [clean_doc(d) async for d in db.QuestionBank.find(part_c_query)]

    random.shuffle(part_a_all)
    random.shuffle(part_b_all)
    random.shuffle(part_c_all)

    selected_part_a = part_a_all[:req.partACount]
    selected_part_b = part_b_all[:req.partBCount]

    # If Part C doesn't have dedicated Part C questions, fallback to leftover Part B questions
    if len(part_c_all) >= req.partCCount:
        selected_part_c = part_c_all[:req.partCCount]
    else:
        leftover_b = part_b_all[req.partBCount:]
        selected_part_c = (part_c_all + leftover_b)[:req.partCCount]

    warning = None
    if len(part_a_all) < req.partACount or len(part_b_all) < req.partBCount or (len(part_c_all) < req.partCCount and len(part_b_all) < req.partBCount + req.partCCount):
        warning = f"Warning: Found {len(part_a_all)} Part A, {len(part_b_all)} Part B, and {len(part_c_all)} Part C questions for {req.subjectCode} {req.unit}."

    now_iso = datetime.utcnow().isoformat()
    history_entry = {
        "subjectCode": req.subjectCode,
        "unit": req.unit,
        "generatedAt": now_iso,
        "partACount": len(selected_part_a),
        "partBCount": len(selected_part_b),
        "partCCount": len(selected_part_c),
        "warning": warning,
    }
    await db.question_paper_history.insert_one(history_entry)

    return {
        "subjectCode": req.subjectCode,
        "unit": req.unit,
        "warning": warning,
        "partA": selected_part_a,
        "partB": selected_part_b,
        "partC": selected_part_c,
    }


@router.get("/paper-history")
async def get_paper_history():
    cursor = db.question_paper_history.find({}).sort("generatedAt", -1).limit(50)
    return [clean_doc(d) async for d in cursor]
