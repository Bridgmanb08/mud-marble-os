from datetime import datetime, timezone

from .estimate_defaults import DEFAULT_CLOSING_TEXT, DEFAULT_INTRODUCTORY_TEXT
from .supabase_client import db_get, db_patch, db_post

TABLE = "estimate_text_defaults"


async def get_or_create_estimate_text_defaults() -> dict:
    """The proposal opening/closing text is a single, shared row that any logged-in
    user can edit (Settings -> Default Text) -- not admin-gated like cost codes."""
    rows = await db_get(TABLE, "?order=updated_at.desc&limit=1")
    if rows:
        return rows[0]
    created = await db_post(
        TABLE,
        {"introductory_text": DEFAULT_INTRODUCTORY_TEXT, "closing_text": DEFAULT_CLOSING_TEXT},
    )
    return created[0]


async def update_estimate_text_defaults(fields: dict) -> dict:
    existing = await get_or_create_estimate_text_defaults()
    updated = await db_patch(TABLE, existing["id"], {**fields, "updated_at": datetime.now(timezone.utc).isoformat()})
    return updated[0]
