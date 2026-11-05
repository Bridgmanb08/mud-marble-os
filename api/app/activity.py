"""Who did what to a task, project schedule field, or calendar event.

Humans are the signed-in user. Bots are named credentials on the write API.
A row with no actor stays legacy — nothing here guesses that a blank actor
was a bot. Writing the trail is best-effort: a missing column (migration not
applied yet) or a logging failure never rolls back the save it describes.
"""
import hashlib
import hmac
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from fastapi import HTTPException

from . import change_log
from .config import settings
from .supabase_client import db_get, db_patch, db_patch_query

logger = logging.getLogger(__name__)

SCHEDULE_TRACKED = frozenset(
    {
        "title",
        "assigned_to",
        "assignees",
        "phase",
        "construction_phase",
        "status",
        "priority",
        "scheduled_start",
        "scheduled_end",
        "notes",
        "is_milestone",
        "is_punch_list",
        "clarify_from",
        "subcontractor_id",
        "project_id",
        "completed_at",
    }
)

CALENDAR_TRACKED = frozenset({"title", "notes", "event_date", "project_id"})

PROJECT_SCHEDULE_FIELDS = frozenset({"start_date", "estimated_completion", "current_phase"})

# Exact names, plus fragments that mean money. "estimate" is intentionally
# not a fragment — it would block the schedule field estimated_completion.
_MONEY_EXACT = frozenset(
    {
        "contract_value",
        "checking_balance",
        "credit_card_balance",
        "pending_invoices_manual",
        "amount",
        "amount_due",
        "amount_paid",
        "balance",
        "payment",
        "payments",
        "paid",
        "paid_amount",
        "price",
        "owner_price",
        "builder_cost",
        "grand_total",
        "grand_total_owner_price",
        "draw",
        "draws",
        "deposit",
        "markup",
        "cost",
        "invoice_id",
        "estimate_id",
        "change_order_id",
        "retention",
        "retainage",
    }
)
_MONEY_FRAGMENTS = (
    "invoice",
    "payment",
    "balance",
    "draw",
    "contract_value",
    "owner_price",
    "builder_cost",
    "amount_paid",
    "amount_due",
)

MONEY_DETAIL = (
    "Bots can't change money — invoices, estimates, change orders, draws, "
    "contract values, balances, or payments — without Brent's approval."
)


class Actor:
    """A person or a bot. `.id` is the app user id for humans and None for bots
    (notification code skips "don't notify yourself" only when it matches)."""

    def __init__(self, name: str, actor_type: str, user_id: Optional[str] = None, source: Optional[str] = None):
        self.name = name or "Unknown"
        self.actor_type = actor_type
        self.id = user_id
        self.user_id = user_id
        self.source = source

    @classmethod
    def human(cls, user: Any) -> "Actor":
        name = getattr(user, "name", None) or getattr(user, "email", None) or "Unknown"
        return cls(name=name, actor_type="human", user_id=getattr(user, "id", None))

    def with_source(self, source: Optional[str]) -> "Actor":
        return Actor(self.name, self.actor_type, self.user_id, source or self.source)


def classify_actor(row: dict) -> tuple[str, Optional[str]]:
    """(actor_type, name) for display. actor_type is human, bot, or legacy.

    An explicit bot/human stamp wins. Older field_changes rows that stored an
    app user id but no actor_type are humans. Anything else — no type and no
    user id — is legacy, even if a name string happens to be present.
    """
    raw = row.get("actor_type")
    name = row.get("changed_by_name") or row.get("actor_name")
    if isinstance(name, str):
        name = name.strip() or None
    if raw == "bot":
        return "bot", name
    if raw == "human":
        return "human", name
    if row.get("changed_by"):
        return "human", name
    return "legacy", name


def money_fields(keys: Iterable[str]) -> list[str]:
    found = []
    for key in keys:
        lowered = key.lower()
        if lowered in _MONEY_EXACT or any(fragment in lowered for fragment in _MONEY_FRAGMENTS):
            found.append(key)
    return found


def reject_money_keys(keys: Iterable[str]) -> None:
    bad = money_fields(keys)
    if bad:
        raise HTTPException(status_code=403, detail=f"{MONEY_DETAIL} Blocked fields: {', '.join(bad)}.")


def parse_bot_api_keys(raw: str) -> list[tuple[str, str]]:
    """BOT_API_KEYS → [(display name, token), ...].

    JSON object: {"Mike Ross":"<token>","Louis Litt":"<token>"}
    Or one pair per line / separated by `;;`: Mike Ross=<token>
    """
    text = (raw or "").strip()
    if not text:
        return []
    if text.startswith("{"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("BOT_API_KEYS is not valid JSON; ignoring it")
            return []
        if not isinstance(data, dict):
            return []
        pairs = []
        for name, token in data.items():
            name_s = str(name).strip()
            token_s = str(token).strip()
            if name_s and token_s:
                pairs.append((name_s, token_s))
        return pairs
    pairs = []
    for chunk in re.split(r"\s*;;\s*|\n+", text):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        name, token = chunk.split("=", 1)
        name_s, token_s = name.strip(), token.strip()
        if name_s and token_s:
            pairs.append((name_s, token_s))
    return pairs


def bot_name_for_token(presented: str, pairs: list[tuple[str, str]]) -> Optional[str]:
    """Constant-time scan of every configured token. Returns the bot's name."""
    found = None
    for name, token in pairs:
        if len(token) == len(presented) and hmac.compare_digest(token, presented):
            found = name
    return found


def fields_for_create(data: dict) -> dict:
    """Initial values worth a history row. Skips blanks and default-off flags."""
    out: dict = {}
    for key, value in data.items():
        if key not in SCHEDULE_TRACKED:
            continue
        if value is None or value == "" or value == []:
            continue
        if key in ("is_milestone", "is_punch_list") and value is False:
            continue
        out[key] = value
    if data.get("title"):
        out["title"] = data["title"]
    if data.get("status"):
        out["status"] = data["status"]
    return out


def require_uuid(value: str, label: str = "id") -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from None


def pop_source(payload: dict) -> Optional[str]:
    if "source" not in payload:
        return None
    raw = payload.pop("source")
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="source must be a string (meeting name and date).")
    text = raw.strip()
    if len(text) > 300:
        raise HTTPException(status_code=400, detail="source must be 300 characters or less.")
    return text


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _best_effort_patch(table: str, record_id: str, fields: dict) -> None:
    try:
        await db_patch(table, record_id, fields)
    except Exception:
        logger.exception("activity: could not stamp actor on %s %s", table, record_id)


async def _best_effort_patch_many(table: str, ids: list[str], fields: dict) -> None:
    if not ids:
        return
    try:
        await db_patch_query(table, f"?id=in.({','.join(ids)})", fields)
    except Exception:
        logger.exception("activity: could not stamp actor on %d %s row(s)", len(ids), table)


def _stamp_fields(actor: Actor, *, created: bool) -> dict:
    fields = {
        "updated_by_name": actor.name,
        "updated_by_type": actor.actor_type,
        "updated_at": _now(),
    }
    if created:
        fields["created_by_name"] = actor.name
        fields["created_by_type"] = actor.actor_type
    return fields


async def stamp_schedule(record_id: str, actor: Actor, *, created: bool = False) -> None:
    await _best_effort_patch("schedule_items", record_id, _stamp_fields(actor, created=created))


async def stamp_schedule_many(ids: list[str], actor: Actor) -> None:
    # updated_at is identical for the batch; close enough for a bulk edit.
    await _best_effort_patch_many("schedule_items", ids, _stamp_fields(actor, created=False))


async def stamp_calendar(record_id: str, actor: Actor, *, created: bool = False) -> None:
    fields = _stamp_fields(actor, created=created)
    fields.pop("updated_at", None)  # calendar_events has no updated_at column
    await _best_effort_patch("calendar_events", record_id, fields)


async def record_schedule_create(record_id: str, data: dict, actor: Actor, project_id: Optional[str]) -> None:
    tracked = fields_for_create(data)
    await change_log.log_changes(
        "schedule_items",
        record_id,
        {},
        tracked,
        actor,
        action="create",
        project_id=project_id,
    )
    await stamp_schedule(record_id, actor, created=True)


async def record_schedule_update(
    record_id: str,
    before: Optional[dict],
    updates: dict,
    actor: Actor,
    project_id: Optional[str],
) -> bool:
    """Log tracked diffs and stamp the last editor. Returns True if anything
    tracked actually changed (or the before-image couldn't be read)."""
    tracked = {k: v for k, v in updates.items() if k in SCHEDULE_TRACKED}
    if not tracked:
        return False
    if before is None:
        await stamp_schedule(record_id, actor)
        return True
    if not change_log.diff_fields(before, tracked):
        return False
    await change_log.log_changes(
        "schedule_items",
        record_id,
        before,
        tracked,
        actor,
        action="update",
        project_id=project_id or before.get("project_id"),
    )
    await stamp_schedule(record_id, actor)
    return True


async def audit_schedule_rows(before_rows: list[dict], updates: dict, actor: Actor) -> None:
    """One history batch + one actor stamp for a bulk edit. Rows whose tracked
    fields didn't change are left alone, so a position-only reorder doesn't
    take the bot badge off a task."""
    tracked = {k: v for k, v in updates.items() if k in SCHEDULE_TRACKED}
    if not tracked or not before_rows:
        return
    all_rows: list[dict] = []
    changed_ids: list[str] = []
    for row in before_rows:
        if not change_log.diff_fields(row, tracked):
            continue
        changed_ids.append(row["id"])
        all_rows.extend(
            change_log.build_change_rows(
                "schedule_items",
                row["id"],
                row,
                tracked,
                actor,
                action="update",
                project_id=row.get("project_id"),
            )
        )
    await change_log.write_change_rows(all_rows)
    await stamp_schedule_many(changed_ids, actor)


async def record_comment(task_id: str, content: str, actor: Actor, project_id: Optional[str]) -> None:
    snippet = content if len(content) <= 2000 else content[:2000] + "…"
    await change_log.log_changes(
        "schedule_items",
        task_id,
        {},
        {"comment": snippet},
        actor,
        action="comment",
        project_id=project_id,
    )


async def record_schedule_delete(record_id: str, title: Optional[str], actor: Actor, project_id: Optional[str]) -> None:
    await change_log.log_changes(
        "schedule_items",
        record_id,
        {"title": title},
        {"title": None},
        actor,
        action="delete",
        project_id=project_id,
    )


async def record_calendar_create(record_id: str, data: dict, actor: Actor, project_id: Optional[str]) -> None:
    tracked = {k: v for k, v in data.items() if k in CALENDAR_TRACKED and v not in (None, "")}
    await change_log.log_changes(
        "calendar_events",
        record_id,
        {},
        tracked,
        actor,
        action="create",
        project_id=project_id,
    )
    await stamp_calendar(record_id, actor, created=True)


async def record_calendar_update(
    record_id: str,
    before: Optional[dict],
    updates: dict,
    actor: Actor,
    project_id: Optional[str],
) -> None:
    tracked = {k: v for k, v in updates.items() if k in CALENDAR_TRACKED}
    if not tracked:
        return
    pid = project_id or (before or {}).get("project_id")
    if before is not None and not change_log.diff_fields(before, tracked):
        return
    if before is not None:
        await change_log.log_changes(
            "calendar_events",
            record_id,
            before,
            tracked,
            actor,
            action="update",
            project_id=pid,
        )
    await stamp_calendar(record_id, actor)


async def record_calendar_delete(record_id: str, title: Optional[str], actor: Actor, project_id: Optional[str]) -> None:
    await change_log.log_changes(
        "calendar_events",
        record_id,
        {"title": title},
        {"title": None},
        actor,
        action="delete",
        project_id=project_id,
    )


def _env_pairs() -> list[tuple[str, str]]:
    return parse_bot_api_keys(settings.bot_api_keys)


async def resolve_bot_name(token: str) -> str:
    """The bot's display name, or an HTTP error. Never echoes the token."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing bot token")
    env_pairs = _env_pairs()
    matched = bot_name_for_token(token, env_pairs)
    if matched:
        return matched
    digest = hashlib.sha256(token.encode()).hexdigest()
    try:
        rows = await db_get(
            "bot_credentials",
            f"?token_sha256=eq.{digest}&revoked_at=is.null&select=name&limit=1",
        )
    except Exception:
        logger.exception("activity: bot credential lookup failed")
        if env_pairs:
            raise HTTPException(status_code=401, detail="Unauthorized") from None
        raise HTTPException(
            status_code=503,
            detail=(
                "Bot write API is not configured. Run supabase/migrations/0084_bot_activity_trail.sql "
                "and insert a bot_credentials row, or set BOT_API_KEYS. See docs/bot-write-api.md."
            ),
        ) from None
    if rows:
        return rows[0]["name"]
    if not env_pairs:
        # Table exists and the token isn't in it. Could also be that nobody
        # has provisioned a credential yet — same response either way, so a
        # caller can't tell a wrong token from an empty table.
        any_rows = True
        try:
            any_rows = bool(await db_get("bot_credentials", "?select=id&limit=1"))
        except Exception:
            any_rows = True
        if not any_rows:
            raise HTTPException(
                status_code=503,
                detail=(
                    "No bot credentials yet. Insert a bot_credentials row or set BOT_API_KEYS. "
                    "See docs/bot-write-api.md."
                ),
            )
    raise HTTPException(status_code=401, detail="Unauthorized")


async def load_activity(query_rich: str, query_plain: str) -> list[dict]:
    """Prefer the extended columns. If the migration hasn't been applied, the
    original field_changes columns still answer project/estimate/client history."""
    try:
        return await db_get("field_changes", query_rich)
    except Exception:
        logger.info("activity: extended field_changes columns unavailable, using the original shape")
    try:
        return await db_get("field_changes", query_plain)
    except Exception:
        logger.exception("activity: could not read field_changes")
        return []


async def attach_record_titles(rows: list[dict]) -> dict[tuple[str, str], str]:
    titles: dict[tuple[str, str], str] = {}
    task_ids = list({r["record_id"] for r in rows if r.get("table_name") == "schedule_items"})
    event_ids = list({r["record_id"] for r in rows if r.get("table_name") == "calendar_events"})
    project_ids = list({r["record_id"] for r in rows if r.get("table_name") == "projects"})
    try:
        if task_ids:
            found = await db_get("schedule_items", f"?id=in.({','.join(task_ids)})&select=id,title")
            for row in found:
                titles[("schedule_items", row["id"])] = row.get("title") or "Task"
        if event_ids:
            found = await db_get("calendar_events", f"?id=in.({','.join(event_ids)})&select=id,title")
            for row in found:
                titles[("calendar_events", row["id"])] = row.get("title") or "Event"
        if project_ids:
            found = await db_get("projects", f"?id=in.({','.join(project_ids)})&select=id,name")
            for row in found:
                titles[("projects", row["id"])] = row.get("name") or "Project"
    except Exception:
        logger.exception("activity: could not look up record titles")
    return titles
