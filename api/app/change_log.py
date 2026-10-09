"""A record of what changed on a project / estimate / client each time it is
saved (see migration 0081_field_changes.sql): one row per field whose value
really changed, with the old and new value and who did it.

This is a safety net, never a gate: if writing the log fails for any reason the
save it describes has already happened and still succeeds."""
import logging
from typing import Any, Iterable, Optional

from .supabase_client import db_get, db_post_many

logger = logging.getLogger(__name__)

TABLE = "field_changes"


def diff_fields(before: dict, updates: dict) -> list[tuple[str, Any, Any]]:
    """(field, old, new) for every key in `updates` whose value differs from
    what the row held before. A key sent with the value it already had is not a
    change."""
    return [(k, before.get(k), v) for k, v in updates.items() if before.get(k) != v]


async def fetch_before(table: str, record_id: str, fields: Iterable[str]) -> Optional[dict]:
    """The current values of `fields` on one row, read right before a save so
    the log can say what they were. Returns None if the row can't be read, in
    which case nothing is logged (guessing the old values would record changes
    that never happened)."""
    cols = ",".join(sorted(set(fields)))
    if not cols:
        return {}
    try:
        rows = await db_get(table, f"?id=eq.{record_id}&select={cols}&limit=1")
        return rows[0] if rows else {}
    except Exception:  # noqa: BLE001 -- the log must never block a save
        logger.exception("change_log: could not read current values of %s %s", table, record_id)
        return None


async def log_changes(table: str, record_id: str, before: Optional[dict], updates: dict, user: Optional[Any]) -> None:
    if before is None:
        return
    changes = diff_fields(before, updates)
    if not changes:
        return
    rows = [
        {
            "table_name": table,
            "record_id": record_id,
            "field": field,
            "old_value": old,
            "new_value": new,
            "changed_by": getattr(user, "id", None),
            "changed_by_name": getattr(user, "name", None) or getattr(user, "email", None),
        }
        for field, old, new in changes
    ]
    try:
        await db_post_many(TABLE, rows)
    except Exception:  # noqa: BLE001 -- the log must never block a save
        logger.exception("change_log: could not record %d change(s) to %s %s", len(rows), table, record_id)
