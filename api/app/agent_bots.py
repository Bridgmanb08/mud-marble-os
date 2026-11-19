"""AI bots Brent can @-mention from a comment box.

Comment authors are a free-text name, not a login. An existing task comment
whose author is "Mike Ross (AI bot)" already draws an MR avatar because the
comment bubble takes the first two words of that string. That row is not a
user account, and these five bots are not either: they are not inserted into
app_users, they do not get a password, and they are left out of the assignee
directory so a task cannot be assigned to one.

The mention box reads them from GET /users/mention-directory. Saving a
comment scans for the same full-name token the human notifier uses. Each
matched bot gets one agent_mentions row. Delivery is a separate POST from
this API process (never the browser) and a failed POST does not un-save the
comment.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Protocol

import httpx

from .config import settings
from .mentions import name_is_mentioned
from .supabase_client import db_get, db_patch_query, db_post_many
from .team_roster import CANONICAL_NAMES

logger = logging.getLogger("agent_mentions")

WEBHOOK_ATTEMPTS = 3
# Short pauses so a down webhook doesn't hold the function open for long.
# The comment row is already saved before any of this runs.
_RETRY_PAUSES = (0.25, 0.5)


@dataclass(frozen=True)
class AgentBot:
    name: str
    role: str

    @property
    def id(self) -> str:
        slug = "-".join(part for part in self.name.lower().split() if part)
        return f"bot:{slug}"


# Names are the mention token ("@Mike Ross"). The role is only a label in
# the autocomplete. Keep this list in sync with the check constraint in
# supabase/migrations/0091_agent_mentions.sql.
AGENT_BOTS = (
    AgentBot("Donna Paulsen", "personal assistant / router"),
    AgentBot("Mike Ross", "tasks / schedule"),
    AgentBot("Rachel Zane", "estimating / finance"),
    AgentBot("Jessica Pearson", "rentals / property"),
    AgentBot("Louis Litt", "SOPs / ops"),
)


class _TaskQueue(Protocol):
    def add_task(self, func, *args, **kwargs) -> None: ...


@dataclass
class AgentMentionContext:
    comment_id: str
    source_type: str
    author: str
    text: str
    link_path: str
    created_at: str = ""
    author_id: Optional[str] = None
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None


def mentioned_bot_names(content: str) -> list[str]:
    return [bot.name for bot in AGENT_BOTS if name_is_mentioned(content, bot.name)]


def build_mention_directory(real_users: list[dict]) -> list[dict]:
    """Login accounts, roster names without a login, and the five bots.

    A bot is always added, even when a person happens to share the name, so
    the badge can tell them apart. The mention token is still the full name.
    """
    entries = [
        {"id": user["id"], "name": user["name"], "is_bot": False, "bot_role": None}
        for user in real_users
        if user.get("id") and user.get("name")
    ]
    real_names = {entry["name"] for entry in entries}
    for name in CANONICAL_NAMES:
        if name not in real_names:
            entries.append({"id": f"roster:{name}", "name": name, "is_bot": False, "bot_role": None})
    for bot in AGENT_BOTS:
        entries.append({"id": bot.id, "name": bot.name, "is_bot": True, "bot_role": bot.role})
    entries.sort(key=lambda entry: entry["name"].lower())
    return entries


def _short_project_name(raw: Optional[str]) -> Optional[str]:
    # Project names are stored as "Job name | Client". Comments and the task
    # board show the job name in front of the pipe.
    if not raw:
        return None
    short = raw.split("|")[0].strip()
    return short or raw


def absolute_link(path: str) -> str:
    base = (settings.public_base_url or settings.frontend_origin).rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}"


def _named(record_id: Optional[str], name: Optional[str]) -> Optional[dict]:
    if not record_id and not name:
        return None
    return {"id": record_id, "name": name}


def build_webhook_payload(ctx: AgentMentionContext, names: list[str], link: str, created_at: str) -> dict:
    # A job and a project are the same projects-table row. Both keys are set
    # so a receiver can read whichever name it was given.
    project = _named(ctx.project_id, ctx.project_name)
    return {
        "comment_id": ctx.comment_id,
        "mentioned_bots": list(names),
        "author": ctx.author,
        "text": ctx.text,
        "task": _named(ctx.task_id, ctx.task_name),
        "job": dict(project) if project else None,
        "project": dict(project) if project else None,
        "link": link,
        "created_at": created_at,
    }


async def _hydrate(ctx: AgentMentionContext) -> None:
    if ctx.task_id and (not ctx.task_name or ctx.project_id is None):
        rows = await db_get("schedule_items", f"?id=eq.{ctx.task_id}&select=title,project_id")
        if rows:
            if not ctx.task_name:
                ctx.task_name = rows[0].get("title")
            if ctx.project_id is None:
                ctx.project_id = rows[0].get("project_id")
    if ctx.project_id and not ctx.project_name:
        rows = await db_get("projects", f"?id=eq.{ctx.project_id}&select=name")
        if rows:
            ctx.project_name = _short_project_name(rows[0].get("name"))
    elif ctx.project_name:
        ctx.project_name = _short_project_name(ctx.project_name)


def _mention_row(ctx: AgentMentionContext, bot_name: str, link: str) -> dict:
    row = {
        "comment_id": ctx.comment_id,
        "source_type": ctx.source_type,
        "bot": bot_name,
        "author": ctx.author,
        "author_id": ctx.author_id,
        "comment_text": ctx.text,
        "task_id": ctx.task_id,
        "task_name": ctx.task_name,
        "project_id": ctx.project_id,
        "project_name": ctx.project_name,
        "job_id": ctx.project_id,
        "job_name": ctx.project_name,
        "link": link,
    }
    if ctx.created_at:
        row["created_at"] = ctx.created_at
    return row


async def _pause(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


async def _post_webhook(url: str, auth: str, payload: dict) -> tuple[bool, str]:
    """POST JSON. `auth` is the Authorization header, unchanged.

    Returns (ok, error). The error is a status or exception name, never the
    header value and never the response body.
    """
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": auth, "Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        return False, f"{type(exc).__name__}"
    if response.is_success:
        return True, ""
    return False, f"HTTP {response.status_code}"


async def _mark_delivery(row_ids: list[str], data: dict) -> None:
    if not row_ids:
        return
    try:
        await db_patch_query("agent_mentions", f"?id=in.({','.join(row_ids)})", data)
    except Exception:
        logger.exception("agent mention delivery status was not saved comment_ids=%s", ",".join(row_ids))


async def deliver_webhook(payload: dict, row_ids: list[str]) -> None:
    """POST the mention, then record delivered or the last error.

    Unset URL or auth skips the call. The rows from record_agent_mentions
    stay, with delivered left false. Failures are retried and logged. This
    never raises: the comment the person just saved must still succeed.
    """
    try:
        await _deliver_webhook(payload, row_ids)
    except Exception:
        logger.exception("agent mention webhook crashed comment_id=%s", payload.get("comment_id"))


async def _deliver_webhook(payload: dict, row_ids: list[str]) -> None:
    url = (settings.mmos_agent_webhook_url or "").strip()
    auth = settings.mmos_agent_webhook_auth or ""
    comment_id = payload.get("comment_id")
    if not url or not auth:
        logger.info(
            "agent mention webhook skipped comment_id=%s url_set=%s auth_set=%s",
            comment_id,
            bool(url),
            bool(auth),
        )
        return

    last_error = "failed"
    for attempt in range(1, WEBHOOK_ATTEMPTS + 1):
        ok, last_error = await _post_webhook(url, auth, payload)
        if ok:
            await _mark_delivery(
                row_ids,
                {
                    "delivered": True,
                    "delivered_at": datetime.now(timezone.utc).isoformat(),
                    "delivery_attempts": attempt,
                    "last_delivery_error": None,
                },
            )
            return
        logger.warning(
            "agent mention webhook failed comment_id=%s attempt=%s error=%s",
            comment_id,
            attempt,
            last_error,
        )
        if attempt < WEBHOOK_ATTEMPTS:
            await _pause(_RETRY_PAUSES[attempt - 1])

    await _mark_delivery(
        row_ids,
        {
            "delivered": False,
            "delivery_attempts": WEBHOOK_ATTEMPTS,
            "last_delivery_error": (last_error or "failed")[:500],
        },
    )


async def record_agent_mentions(ctx: AgentMentionContext, background_tasks: Optional[_TaskQueue] = None) -> None:
    """Insert one agent_mentions row per mentioned bot, then queue delivery.

    No bot token means no write. A database error (the migration is not
    applied yet, a transient blip) is logged and swallowed so the comment,
    note, or work order the caller already saved is still returned.
    """
    names = mentioned_bot_names(ctx.text)
    if not names:
        return
    try:
        await _hydrate(ctx)
        link = absolute_link(ctx.link_path)
        saved = await db_post_many("agent_mentions", [_mention_row(ctx, name, link) for name in names])
        ids = [row["id"] for row in saved if row.get("id")]
        created_at = ctx.created_at or (saved[0].get("created_at") if saved else "")
        payload = build_webhook_payload(ctx, names, link, created_at)
        if background_tasks is not None:
            background_tasks.add_task(deliver_webhook, payload, ids)
        else:
            await deliver_webhook(payload, ids)
    except Exception:
        logger.exception("agent mention recording failed comment_id=%s", ctx.comment_id)
