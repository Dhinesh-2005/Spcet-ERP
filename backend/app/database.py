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

import asyncio

_clients = {}

def get_current_db():
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop not in _clients or _clients[loop] is None:
        _clients[loop] = AsyncIOMotorClient(MONGO_URI)
    return _clients[loop][MONGO_DB]

class DatabaseProxy:
    def __getattr__(self, name):
        return getattr(get_current_db(), name)
    def __getitem__(self, name):
        return get_current_db()[name]

client = AsyncIOMotorClient(MONGO_URI)
db = DatabaseProxy()

async def get_db():
    return get_current_db()

def clean_doc(doc):
    if doc is None:
        return None
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d["_id"])
        del d["_id"]
    if "photo" in d:
        del d["photo"]
    return d

def clean_docs(docs):
    return [clean_doc(d) for d in docs]

