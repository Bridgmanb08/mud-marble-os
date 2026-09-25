"""Builds the morning brief and end-of-day wrap-up emails from open tasks.

Kept free of any HTTP or database calls except load_open_tasks(), so the
content rules (what counts as overdue, when a digest is empty and skipped)
can be tested directly against plain dicts."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional

from jose import JWTError, jwt

from .config import settings
from .supabase_client import db_get
from .team_roster import normalize_assignee_name

ACTION_TOKEN_DAYS = 3


@dataclass
class Item:
    task_id: str
    title: str
    project: str
    meta: str


@dataclass
class Section:
    heading: str
    tone: str  # "bad" | "warn" | "info"
    items: list
    # Only sections of things that are due or late get the complete/snooze
    # buttons; "Move to tomorrow" on something due next week would pull it in.
    actions: bool = False


@dataclass
class Digest:
    subject: str
    html: str
    text: str


def _base_url() -> str:
    return (settings.public_base_url or settings.frontend_origin).rstrip("/")


def _action_secret() -> str:
    # Suffixed so an action token can never be replayed as a login session
    # cookie (or the reverse), even though both are signed JWTs.
    return settings.jwt_secret_key + ":task-action"


def make_action_token(user_id: str, task_id: str, action: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=ACTION_TOKEN_DAYS)
    return jwt.encode(
        {"sub": user_id, "task": task_id, "act": action, "exp": exp}, _action_secret(), algorithm=settings.jwt_algorithm
    )


def read_action_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, _action_secret(), algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("act") not in ("complete", "snooze") or not payload.get("task") or not payload.get("sub"):
        return None
    return payload


def _action_link(user_id: str, task_id: str, action: str) -> str:
    return f"{_base_url()}/task-action?token={make_action_token(user_id, task_id, action)}"


async def load_open_tasks() -> list[dict]:
    return await db_get(
        "schedule_items",
        "?status=neq.complete&select=id,title,assigned_to,assignees,scheduled_start,scheduled_end,priority,projects(name)",
    )


def _names(task: dict) -> set[str]:
    raw = list(task.get("assignees") or [])
    if task.get("assigned_to"):
        raw.append(task["assigned_to"])
    return {normalize_assignee_name(n) for n in raw if n}


def tasks_for(tasks: list[dict], user_name: str) -> list[dict]:
    target = normalize_assignee_name(user_name)
    return [t for t in tasks if target in _names(t)]


def _day(value) -> str:
    return (value or "")[:10]


def _item(task: dict, meta: str) -> Item:
    project = (task.get("projects") or {}).get("name") or ""
    return Item(task_id=task["id"], title=task.get("title") or "Untitled task", project=project, meta=meta)


def _pretty(day: str) -> str:
    try:
        return datetime.strptime(day, "%Y-%m-%d").strftime("%b %-d")
    except ValueError:
        return day


def morning_sections(tasks: list[dict], today) -> list[Section]:
    t0 = today.isoformat()
    soon = (today + timedelta(days=3)).isoformat()
    overdue, due_today, starting, coming = [], [], [], []
    for t in tasks:
        start, end = _day(t.get("scheduled_start")), _day(t.get("scheduled_end"))
        if end and end < t0:
            overdue.append(_item(t, f"Was due {_pretty(end)}"))
        elif end == t0:
            due_today.append(_item(t, "Due today"))
        elif start == t0:
            starting.append(_item(t, "Starts today"))
        elif end and t0 < end <= soon:
            coming.append(_item(t, f"Due {_pretty(end)}"))
    sections = [
        Section("Overdue", "bad", overdue, True),
        Section("Due today", "warn", due_today, True),
        Section("Starting today", "info", starting),
        Section("Coming up in the next 3 days", "info", coming),
    ]
    return [s for s in sections if s.items]


def wrapup_sections(tasks: list[dict], today) -> list[Section]:
    t0 = today.isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()
    open_today, overdue, next_up = [], [], []
    for t in tasks:
        start, end = _day(t.get("scheduled_start")), _day(t.get("scheduled_end"))
        if end and end < t0:
            overdue.append(_item(t, f"Was due {_pretty(end)}"))
        elif end == t0:
            open_today.append(_item(t, "Due today"))
        elif end == tomorrow or start == tomorrow:
            next_up.append(_item(t, "Due tomorrow" if end == tomorrow else "Starts tomorrow"))
    # Tomorrow's preview only rides along when there is something to close
    # out today -- a wrap-up that says "all clear, here is tomorrow" is just
    # more email, and empty digests are skipped by design.
    if not open_today and not overdue:
        return []
    sections = [
        Section("Still open from today", "warn", open_today, True),
        Section("Overdue", "bad", overdue, True),
        Section("Tomorrow", "info", next_up),
    ]
    return [s for s in sections if s.items]


_TONE = {"bad": "#a3332a", "warn": "#93560f", "info": "#2a5a86"}


def _render(user_id: str, first_name: str, intro: str, sections: list[Section], with_actions: bool) -> tuple[str, str]:
    html_parts = [
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2a2622">',
        '<div style="background:#7a4e38;color:#fff;padding:14px 20px;border-radius:10px 10px 0 0;font-weight:600">Mud &amp; Marble OS</div>',
        '<div style="border:1px solid #e3ded6;border-top:0;border-radius:0 0 10px 10px;padding:20px">',
        f'<p style="margin:0 0 16px;font-size:15px">{escape(intro)}</p>',
    ]
    text_parts = [intro, ""]
    for s in sections:
        html_parts.append(
            f'<div style="margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{_TONE[s.tone]}">'
            f"{escape(s.heading)} ({len(s.items)})</div>"
        )
        text_parts.append(f"{s.heading.upper()} ({len(s.items)})")
        for it in s.items:
            where = f" · {escape(it.project)}" if it.project else ""
            actions = ""
            if with_actions and s.actions:
                done = _action_link(user_id, it.task_id, "complete")
                snooze = _action_link(user_id, it.task_id, "snooze")
                actions = (
                    f'<div style="margin-top:8px"><a href="{done}" style="background:#7a4e38;color:#fff;text-decoration:none;'
                    f'padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-right:8px">Mark complete</a>'
                    f'<a href="{snooze}" style="color:#7a4e38;text-decoration:none;border:1px solid #d9cfc4;padding:4px 12px;'
                    f'border-radius:6px;font-size:12px;font-weight:600">Move to tomorrow</a></div>'
                )
            html_parts.append(
                '<div style="border:1px solid #e3ded6;border-radius:8px;padding:10px 12px;margin-bottom:8px">'
                f'<div style="font-weight:600">{escape(it.title)}</div>'
                f'<div style="font-size:13px;color:#6b635a">{escape(it.meta)}{where}</div>{actions}</div>'
            )
            text_parts.append(f"- {it.title} ({it.meta}{' - ' + it.project if it.project else ''})")
        text_parts.append("")
    html_parts.append(
        f'<p style="margin:18px 0 0;font-size:13px"><a href="{_base_url()}/tasks" style="color:#7a4e38">Open the task board</a></p>'
        '<p style="margin:14px 0 0;font-size:12px;color:#8a8177">You can change when these arrive under Settings, Notification settings.</p>'
        "</div></div>"
    )
    text_parts.append(f"Open the task board: {_base_url()}/tasks")
    return "".join(html_parts), "\n".join(text_parts)


def popup_payload(user_name: str, tasks: list[dict], today) -> Optional[dict]:
    """The morning brief as structured data for the in-app popup (same content
    rules as the email). None when there is nothing to show."""
    sections = morning_sections(tasks_for(tasks, user_name), today)
    if not sections:
        return None
    first = (user_name or "there").split()[0]
    return {
        "title": f"Good morning, {first}",
        "sections": [
            {
                "heading": s.heading,
                "tone": s.tone,
                "actions": s.actions,
                "items": [{"task_id": i.task_id, "title": i.title, "project": i.project, "meta": i.meta} for i in s.items],
            }
            for s in sections
        ],
    }


def build_digest(kind: str, user_id: str, user_name: str, tasks: list[dict], today, with_actions: bool = True) -> Optional[Digest]:
    """Returns None when there is nothing to say -- the caller skips the send."""
    mine = tasks_for(tasks, user_name)
    first = (user_name or "there").split()[0]
    if kind == "morning":
        sections = morning_sections(mine, today)
        if not sections:
            return None
        counts = {s.heading: len(s.items) for s in sections}
        bits = []
        if counts.get("Overdue"):
            bits.append(f"{counts['Overdue']} overdue")
        if counts.get("Due today"):
            bits.append(f"{counts['Due today']} due today")
        if counts.get("Starting today"):
            bits.append(f"{counts['Starting today']} starting")
        subject = "Your day: " + ", ".join(bits) if bits else "Your day: a few things coming up"
        intro = f"Good morning, {first}. Here is where things stand for today."
    elif kind == "wrapup":
        sections = wrapup_sections(mine, today)
        if not sections:
            return None
        still_open = sum(len(s.items) for s in sections if s.heading in ("Still open from today", "Overdue"))
        subject = f"{still_open} thing{'s' if still_open != 1 else ''} still open from today"
        intro = f"{first}, here is what is still open. Mark things done, or push them to tomorrow, right from this email."
    else:
        raise ValueError(f"unknown digest kind: {kind}")
    html, text = _render(user_id, first, intro, sections, with_actions)
    return Digest(subject=subject, html=html, text=text)
