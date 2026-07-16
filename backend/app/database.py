import os
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Resolve the backend directory (parent of app directory) and load .env from it
backend_dir = Path(__file__).resolve().parent.parent
env_path = backend_dir / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI environment variable is not set")
MONGO_DB = os.getenv("MONGO_DB", "uniscore")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB]

async def get_db():
    return db

def clean_doc(doc):
    if doc is None:
        return None
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    if "photo" in doc:
        del doc["photo"]
    return doc

def clean_docs(docs):
    return [clean_doc(d) for d in docs]

