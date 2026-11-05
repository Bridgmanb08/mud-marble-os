"""A record of what changed on a project / estimate / client — and, via
activity.py, a task or calendar event — each time it is saved (see migrations
0081_field_changes.sql and 0084_bot_activity_trail.sql): one row per field
whose value really changed, with the old and new value and who did it.

This is a safety net, never a gate: if writing the log fails for any reason the
save it describes has already happened and still succeeds. Columns added in
0084 are omitted and the insert retried when that migration hasn't been run
yet, so older history rows keep getting written."""
import logging
from typing import Any, Iterable, Optional

from .supabase_client import db_get, db_post_many

logger = logging.getLogger(__name__)

TABLE = "field_changes"

# Present only after 0084. Dropped on retry when PostgREST doesn't know them.
EXTENDED_COLUMNS = frozenset({"actor_type", "source", "action", "project_id"})


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


def _jsonish(value: Any) -> Any:
    if isinstance(value, str) and len(value) > 4000:
        return value[:4000] + "…"
    return value


def _actor_type(user: Optional[Any], explicit: Optional[str]) -> Optional[str]:
    if explicit in ("human", "bot"):
        return explicit
    typed = getattr(user, "actor_type", None)
    if typed in ("human", "bot"):
        return typed
    if user is not None and getattr(user, "id", None):
        return "human"
    return None


def build_change_rows(
    table: str,
    record_id: str,
    before: dict,
    updates: dict,
    user: Optional[Any],
    *,
    actor_type: Optional[str] = None,
    source: Optional[str] = None,
    action: str = "update",
    project_id: Optional[str] = None,
) -> list[dict]:
    changes = diff_fields(before, updates)
    if not changes:
        return []
    resolved_type = _actor_type(user, actor_type)
    resolved_source = source if source is not None else getattr(user, "source", None)
    name = getattr(user, "name", None) or getattr(user, "email", None)
    user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    pid = project_id or (record_id if table == "projects" else None)
    rows = []
    for field, old, new in changes:
        row: dict = {
            "table_name": table,
            "record_id": record_id,
            "field": field,
            "old_value": _jsonish(old),
            "new_value": _jsonish(new),
            "changed_by_name": name,
            "action": action,
        }
        if user_id:
            row["changed_by"] = user_id
        if resolved_type:
            row["actor_type"] = resolved_type
        if resolved_source:
            row["source"] = resolved_source
        if pid:
            row["project_id"] = pid
        rows.append(row)
    return rows


def _missing_column(exc: Exception) -> bool:
    text = str(exc).lower()
    return "pgrst204" in text or "schema cache" in text or "could not find the" in text


async def write_change_rows(rows: list[dict]) -> None:
    if not rows:
        return
    try:
        await db_post_many(TABLE, rows)
        return
    except Exception as exc:  # noqa: BLE001 -- the log must never block a save
        if not _missing_column(exc):
            logger.exception("change_log: could not record %d change(s)", len(rows))
            return
    slim = [{k: v for k, v in row.items() if k not in EXTENDED_COLUMNS} for row in rows]
    try:
        await db_post_many(TABLE, slim)
    except Exception:  # noqa: BLE001
        logger.exception("change_log: could not record %d change(s) without extended columns", len(rows))


async def log_changes(
    table: str,
    record_id: str,
    before: Optional[dict],
    updates: dict,
    user: Optional[Any],
    *,
    actor_type: Optional[str] = None,
    source: Optional[str] = None,
    action: str = "update",
    project_id: Optional[str] = None,
) -> None:
    if before is None:
        return
    rows = build_change_rows(
        table,
        record_id,
        before,
        updates,
        user,
        actor_type=actor_type,
        source=source,
        action=action,
        project_id=project_id,
    )
    await write_change_rows(rows)
