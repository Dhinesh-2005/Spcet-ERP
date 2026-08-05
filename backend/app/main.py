from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, import_routes, requisitions, students, question_bank
from app.database import db

app = FastAPI(title="UniScore FastAPI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    await db.QuestionBank.create_index([("subjectCode", 1)])
    await db.QuestionBank.create_index([("unit", 1)])
    await db.QuestionBank.create_index([("co", 1)])
    await db.QuestionBank.create_index([("part", 1)])
    await db.QuestionBank.create_index([("subjectCode", 1), ("unit", 1), ("part", 1)])

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(import_routes.router, prefix="/api/import", tags=["import"])
app.include_router(requisitions.router, prefix="/api/requisitions", tags=["requisitions"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(question_bank.router, prefix="/api/question-bank", tags=["question-bank"])
app.include_router(question_bank.router, prefix="/api/question-paper", tags=["question-paper"])

@app.get("/health")
def health():
    return {"status": "ok"}

