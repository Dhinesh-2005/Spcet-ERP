import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
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

