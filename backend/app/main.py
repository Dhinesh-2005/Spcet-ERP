from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, import_routes, requisitions, students

app = FastAPI(title="UniScore FastAPI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(import_routes.router, prefix="/api/import", tags=["import"])
app.include_router(requisitions.router, prefix="/api/requisitions", tags=["requisitions"])
app.include_router(students.router, prefix="/api/students", tags=["students"])

@app.get("/health")
def health():
    return {"status": "ok"}
