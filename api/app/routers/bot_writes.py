"""The write path Brent's bots use instead of inserting into Supabase directly.

Same task, schedule, and comment behavior as the app (including assignment
notifications and @mentions), logged as the named bot. Money fields and money
tables are not on this router. See docs/bot-write-api.md.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ConfigDict, ValidationError

from .. import change_log
from ..activity import (
    PROJECT_SCHEDULE_FIELDS,
    Actor,
    pop_source,
    record_calendar_create,
    record_calendar_update,
    reject_money_keys,
    require_uuid,
    resolve_bot_name,
)
from ..calendar_events import SELECT as CALENDAR_SELECT
from ..calendar_events import TABLE as CALENDAR_TABLE
from ..date_validation import check_date_order
from ..routers.projects import _sync_project_dates
from ..routers.tasks import create_comment_for_actor, create_task_for_actor, update_task_for_actor
from ..schemas.calendar_events import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate
from ..schemas.projects import ProjectOut
from ..schemas.tasks import CommentOut, TaskCreate, TaskOut, TaskUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/bot", tags=["bot"])

_PROJECT_SELECT = (
    "*,clients(id,first_name,last_name,preferred_contact_method,is_advocate,is_repeat_client,notes),"
    "sms_contacts(id,phone_number,name)"
)


class _BotTaskCreate(TaskCreate):
    model_config = ConfigDict(extra="forbid")


class _BotTaskUpdate(TaskUpdate):
    model_config = ConfigDict(extra="forbid")


class _BotEventCreate(CalendarEventCreate):
    model_config = ConfigDict(extra="forbid")


class _BotEventUpdate(CalendarEventUpdate):
    model_config = ConfigDict(extra="forbid")


def _validation_detail(exc: ValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Invalid request"
    err = errors[0]
    loc = ".".join(str(part) for part in err.get("loc", ()) if part != "body")
    msg = err.get("msg", "Invalid request")
    return f"{loc}: {msg}" if loc else msg


async def require_bot(request: Request) -> Actor:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.startswith("Bearer ") else ""
    name = await resolve_bot_name(token)
    return Actor(name=name, actor_type="bot")


async def _json_object(request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON object required") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON object required")
    reject_money_keys(payload.keys())
    return payload


def _parse(model, payload: dict):
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_validation_detail(exc)) from exc


@router.post("/tasks", response_model=TaskOut)
async def bot_create_task(request: Request, bot: Actor = Depends(require_bot)):
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    body = _parse(_BotTaskCreate, payload)
    return await create_task_for_actor(body, bot)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def bot_update_task(task_id: str, request: Request, bot: Actor = Depends(require_bot)):
    task_id = require_uuid(task_id, "task id")
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    body = _parse(_BotTaskUpdate, payload)
    if not body.model_dump(exclude_unset=True):
        raise HTTPException(status_code=400, detail="No fields to update")
    return await update_task_for_actor(task_id, body, bot)


@router.post("/tasks/{task_id}/comments", response_model=CommentOut)
async def bot_comment(task_id: str, request: Request, bot: Actor = Depends(require_bot)):
    task_id = require_uuid(task_id, "task id")
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    content = payload.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=400, detail="content is required")
    extra = set(payload) - {"content"}
    if extra:
        raise HTTPException(
            status_code=400,
            detail=f"A comment only accepts content and source. Refused: {', '.join(sorted(extra))}.",
        )
    return await create_comment_for_actor(task_id, content, bot)


def _day(value) -> Optional[str]:
    if not value:
        return None
    return str(value)[:10]


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def bot_update_project(project_id: str, request: Request, bot: Actor = Depends(require_bot)):
    """Schedule fields only: start_date, estimated_completion, current_phase.
    Saving a start or completion date also moves the matching calendar marker,
    same as an edit in the app."""
    project_id = require_uuid(project_id, "project id")
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    unknown = set(payload) - PROJECT_SCHEDULE_FIELDS
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(
                "Bots can only set start_date, estimated_completion, and current_phase on a project. "
                f"Refused: {', '.join(sorted(unknown))}."
            ),
        )
    updates = {key: payload[key] for key in PROJECT_SCHEDULE_FIELDS if key in payload}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key in ("start_date", "estimated_completion"):
        if key in updates and isinstance(updates[key], str) and updates[key]:
            updates[key] = updates[key][:10]
    current = await db_get("projects", f"?id=eq.{project_id}&select=id,start_date,estimated_completion")
    if not current:
        raise HTTPException(status_code=404, detail="Project not found")
    start = _day(updates["start_date"]) if "start_date" in updates else _day(current[0].get("start_date"))
    end = (
        _day(updates["estimated_completion"])
        if "estimated_completion" in updates
        else _day(current[0].get("estimated_completion"))
    )
    try:
        check_date_order(start, end, "Estimated completion date")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    before = await change_log.fetch_before("projects", project_id, updates.keys())
    await db_patch("projects", project_id, updates)
    await change_log.log_changes("projects", project_id, before, updates, bot)
    await _sync_project_dates(project_id, updates, bot)
    full = await db_get("projects", f"?id=eq.{project_id}&select={_PROJECT_SELECT}")
    return full[0]


@router.post("/calendar-events", response_model=CalendarEventOut)
async def bot_create_event(request: Request, bot: Actor = Depends(require_bot)):
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    body = _parse(_BotEventCreate, payload)
    data = body.model_dump(exclude_none=True)
    rows = await db_post(CALENDAR_TABLE, data)
    await record_calendar_create(rows[0]["id"], data, bot, data.get("project_id"))
    full = await db_get(CALENDAR_TABLE, f"?id=eq.{rows[0]['id']}&select={CALENDAR_SELECT}")
    return full[0]


@router.patch("/calendar-events/{event_id}", response_model=CalendarEventOut)
async def bot_update_event(event_id: str, request: Request, bot: Actor = Depends(require_bot)):
    event_id = require_uuid(event_id, "event id")
    payload = await _json_object(request)
    bot = bot.with_source(pop_source(payload))
    body = _parse(_BotEventUpdate, payload)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    existing = await db_get(CALENDAR_TABLE, f"?id=eq.{event_id}&select=id,project_id")
    if not existing:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    before = await change_log.fetch_before(CALENDAR_TABLE, event_id, list(updates.keys()) + ["project_id"])
    await db_patch(CALENDAR_TABLE, event_id, updates)
    project_id = (before or {}).get("project_id") or existing[0].get("project_id")
    await record_calendar_update(event_id, before, updates, bot, project_id)
    full = await db_get(CALENDAR_TABLE, f"?id=eq.{event_id}&select={CALENDAR_SELECT}")
    if not full:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return full[0]
