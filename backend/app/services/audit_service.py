from datetime import datetime
from typing import Dict, Any, List, Optional
from app.database import db, clean_doc, clean_docs

class AuditService:
    """
    Centralized service for recording and retrieving immutable audit logs
    across student, subject, marks, result, and arrear operations.
    """

    async def log_event(
        self,
        user: str,
        role: str,
        action: str,
        entity: str,
        old_value: Optional[Any] = None,
        new_value: Optional[Any] = None,
        details: Optional[Any] = None
    ) -> Dict[str, Any]:
        doc = {
            "user": (user or "system").strip(),
            "role": (role or "admin").strip().lower(),
            "action": action.strip().upper(),
            "entity": entity.strip(),
            "oldValue": old_value,
            "newValue": new_value,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        }
        res = await db.audit_logs.insert_one(doc)
        doc["id"] = str(res.inserted_id)
        return doc

    async def get_audit_logs(
        self,
        user: Optional[str] = None,
        action: Optional[str] = None,
        entity: Optional[str] = None,
        page: int = 1,
        limit: int = 50
    ) -> Dict[str, Any]:
        query = {}
        if user and user.strip():
            query["user"] = {"$regex": user.strip(), "$options": "i"}
        if action and action.strip() and action.strip().upper() != "ALL":
            query["action"] = action.strip().upper()
        if entity and entity.strip():
            query["entity"] = {"$regex": entity.strip(), "$options": "i"}

        skip_count = max(0, (page - 1) * limit)
        total = await db.audit_logs.count_documents(query)
        cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip_count).limit(limit)
        items = [clean_doc(d) async for d in cursor]

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": max(1, (total + limit - 1) // limit) if total > 0 else 1,
            "logs": items
        }

audit_service = AuditService()
