"""The scheduler's brain. Called every few minutes; decides, per person, which
digest (if any) is due right now in THEIR local time and sends it once.

There are no per-person cron jobs. One frequent tick checks the clock for
everybody, which is what lets daylight saving time and per-person send times
work without any extra machinery."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from . import email_client
from .notification_digests import build_digest, load_open_tasks
from .supabase_client import db_get, db_patch_query, db_post

DEFAULT_PREFS = {
    "email_enabled": True,
    "morning_enabled": True,
    "morning_time": "07:00",
    "wrapup_enabled": True,
    "wrapup_time": "16:30",
    "timezone": "America/Indianapolis",
}
# A digest goes out if the tick lands within this many minutes after the
# person's chosen time. Wide enough to survive a late or skipped tick, narrow
# enough that a 7:00 brief never arrives at noon.
WINDOW_MINUTES = 90


def effective_prefs(row: Optional[dict]) -> dict:
    return {**DEFAULT_PREFS, **{k: v for k, v in (row or {}).items() if k in DEFAULT_PREFS and v is not None}}


def due_kinds(prefs: dict, now_utc: datetime) -> list[tuple[str, "datetime.date"]]:
    """Which digests are due for this person right now, as (kind, local_date)."""
    if not prefs["email_enabled"]:
        return []
    try:
        local = now_utc.astimezone(ZoneInfo(prefs["timezone"]))
    except Exception:
        local = now_utc.astimezone(ZoneInfo(DEFAULT_PREFS["timezone"]))
    if local.weekday() >= 5:  # Saturday, Sunday
        return []
    due = []
    for kind in ("morning", "wrapup"):
        if not prefs[f"{kind}_enabled"]:
            continue
        hh, mm = prefs[f"{kind}_time"].split(":")
        scheduled = local.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        if scheduled <= local < scheduled + timedelta(minutes=WINDOW_MINUTES):
            due.append((kind, local.date()))
    return due


def _is_duplicate(exc: HTTPException) -> bool:
    return "23505" in str(exc.detail) or "duplicate key" in str(exc.detail).lower()


async def _claim(user_id: str, kind: str, local_date) -> Optional[str]:
    """Inserts the send-log row BEFORE sending. The table's unique key makes a
    second claim for the same person, digest and day fail, so two overlapping
    ticks can never both send. Returns the row id, or None if already claimed."""
    try:
        rows = await db_post(
            "notification_send_log",
            {"user_id": user_id, "kind": kind, "channel": "email", "local_date": local_date.isoformat()},
        )
    except HTTPException as exc:
        if _is_duplicate(exc):
            return None
        raise
    return rows[0]["id"]


async def _finish(log_id: str, status: str, detail: Optional[str] = None) -> None:
    body = {"status": status, "detail": detail}
    if status == "sent":
        body["sent_at"] = datetime.now(timezone.utc).isoformat()
    await db_patch_query("notification_send_log", f"?id=eq.{log_id}", body)


async def run_tick(now_utc: Optional[datetime] = None) -> dict:
    now_utc = now_utc or datetime.now(timezone.utc)
    users = await db_get("app_users", "?select=id,name,email")
    prefs_rows = {r["user_id"]: r for r in await db_get("notification_prefs", "")}

    due = []
    for u in users:
        if not u.get("email"):
            continue
        for kind, local_date in due_kinds(effective_prefs(prefs_rows.get(u["id"])), now_utc):
            due.append((u, kind, local_date))

    report = {"due": len(due), "sent": 0, "skipped_empty": 0, "already_sent": 0, "failed": 0, "provider": email_client.is_configured()}
    if not due:
        return report
    # Without an email provider nothing is claimed, so switching one on later
    # the same day still sends today's digest instead of finding it used up.
    if not email_client.is_configured():
        return report

    tasks = await load_open_tasks()
    for u, kind, local_date in due:
        log_id = await _claim(u["id"], kind, local_date)
        if log_id is None:
            report["already_sent"] += 1
            continue
        digest = build_digest(kind, u["id"], u["name"], tasks, local_date)
        if digest is None:
            await _finish(log_id, "skipped_empty")
            report["skipped_empty"] += 1
            continue
        error = await email_client.send_email(u["email"], digest.subject, digest.html, digest.text)
        if error:
            await _finish(log_id, "failed", error)
            report["failed"] += 1
        else:
            await _finish(log_id, "sent")
            report["sent"] += 1
    return report
