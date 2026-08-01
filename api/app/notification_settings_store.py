from datetime import datetime, timezone

from .supabase_client import db_get, db_patch, db_post

TABLE = "notification_settings"


async def get_or_create_notification_settings() -> dict:
    """The smart-learning toggle is a single, shared row -- a company-wide switch,
    not per-user -- gated admin-write via require_admin in the router."""
    rows = await db_get(TABLE, "?order=updated_at.desc&limit=1")
    if rows:
        return rows[0]
    created = await db_post(TABLE, {"smart_learning_enabled": False})
    return created[0]


async def update_notification_settings(fields: dict) -> dict:
    existing = await get_or_create_notification_settings()
    updated = await db_patch(TABLE, existing["id"], {**fields, "updated_at": datetime.now(timezone.utc).isoformat()})
    return updated[0]
