import logging
import traceback
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, import_routes, requisitions, students, question_bank, academic, faculty_marks
from app.database import db

logger = logging.getLogger("auras")

app = FastAPI(title="UniScore FastAPI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log full traceback server side
    logger.error(f"Unhandled exception at {request.method} {request.url}: {exc}\n{traceback.format_exc()}")
    # Return user-friendly response without exposing raw Python tracebacks
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred while processing your request. Please verify inputs or contact the academic administrator.",
            "path": str(request.url.path)
        }
    )

@app.on_event("startup")
async def startup_db_client():
    async def _safe_index(collection, keys, **kwargs):
        try:
            await collection.create_index(keys, **kwargs)
        except Exception:
            pass

    await _safe_index(db.QuestionBank, [("subjectCode", 1)])
    await _safe_index(db.QuestionBank, [("unit", 1)])
    await _safe_index(db.QuestionBank, [("co", 1)])
    await _safe_index(db.QuestionBank, [("part", 1)])
    await _safe_index(db.QuestionBank, [("subjectCode", 1), ("unit", 1), ("part", 1)])

    # Academic, Marks, Arrear, and Phase 5 Indexes
    await _safe_index(db.student_subjects, [("registerNumber", 1), ("subjectCode", 1), ("semester", 1)])
    await _safe_index(db.faculty_subject_access, [("facultyId", 1)])
    await _safe_index(db.internal_marks, [("registerNumber", 1), ("subjectCode", 1), ("semester", 1)])
    await _safe_index(db.internal_marks, [("subjectCode", 1), ("semester", 1)])
    await _safe_index(db.externals, [("registerNumber", 1), ("subjectCode", 1)])
    await _safe_index(db.results, [("registerNumber", 1), ("subjectCode", 1), ("semester", 1)])
    await _safe_index(db.results, [("semester", 1), ("department", 1), ("isPublished", 1)])
    await _safe_index(db.arrears, [("registerNumber", 1), ("subjectCode", 1), ("status", 1)])
    await _safe_index(db.arrears, [("registerNumber", 1), ("status", 1)])
    await _safe_index(db.mark_history, [("subjectCode", 1), ("registerNumber", 1)])
    await _safe_index(db.mark_history, [("timestamp", -1)])
    await _safe_index(db.audit_logs, [("timestamp", -1)])
    await _safe_index(db.audit_logs, [("action", 1), ("timestamp", -1)])
    await _safe_index(db.audit_logs, [("user", 1), ("timestamp", -1)])
    await _safe_index(db.result_batches, [("department", 1), ("semester", 1)])

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(import_routes.router, prefix="/api/import", tags=["import"])
app.include_router(requisitions.router, prefix="/api/requisitions", tags=["requisitions"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(question_bank.router, prefix="/api/question-bank", tags=["question-bank"])
app.include_router(question_bank.router, prefix="/api/question-paper", tags=["question-paper"])
app.include_router(academic.router, prefix="/api/academic", tags=["academic"])
app.include_router(faculty_marks.router, prefix="/api/faculty-marks", tags=["faculty-marks"])


@app.get("/health")
def health():
    return {"status": "ok"}



