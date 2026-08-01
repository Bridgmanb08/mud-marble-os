import asyncio
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..ai_provider import (
    ProviderError,
    SmartNudgeContext,
    SmartNudgeJobToday,
    SmartNudgeOpenTask,
    generate_smart_nudge,
)
from ..config import settings
from ..deps import CurrentUser, get_current_user
from ..notification_settings_store import get_or_create_notification_settings
from ..supabase_client import db_get
from .dashboard import _build_team_workload, _parse_dt

router = APIRouter(prefix="/smart-nudges", tags=["smart-nudges"])


class SmartNudgeRequest(BaseModel):
    kind: Literal["morning_briefing", "job_context", "closeout_briefing"]
    project_id: Optional[str] = None


class SmartNudgeResponse(BaseModel):
    message: Optional[str] = None


def _jobs_for_user_today(schedule_items: list[dict], user_name: str, today: str) -> list[dict]:
    """Groups this person's own open, in-range schedule_items by project_id to
    answer "which job(s) is this person at/scheduled at today". A task counts
    as "today" if today falls within [scheduled_start, scheduled_end] inclusive;
    single-day tasks (only one of the two set) count if that one date is today."""
    first = user_name.strip().split()[0].lower() if user_name else ""
    by_project: dict[str, dict] = {}
    for t in schedule_items:
        if t.get("status") == "complete":
            continue
        names = t.get("assignees") or ([t["assigned_to"]] if t.get("assigned_to") else [])
        if not any((n or "").strip().split()[0].lower() == first for n in names if n):
            continue
        start = (t.get("scheduled_start") or t.get("scheduled_end") or "")[:10]
        end = (t.get("scheduled_end") or t.get("scheduled_start") or "")[:10]
        if not (start and end and start <= today <= end):
            continue
        pid = t.get("project_id")
        if not pid:
            continue
        proj_name = (t.get("projects") or {}).get("name") or "a job"
        entry = by_project.setdefault(pid, {"project_id": pid, "project_name": proj_name, "open_task_titles": []})
        entry["open_task_titles"].append(t["title"])
    return list(by_project.values())


@router.post("/generate", response_model=SmartNudgeResponse)
async def generate(body: SmartNudgeRequest, current_user: CurrentUser = Depends(get_current_user)):
    settings_row = await get_or_create_notification_settings()
    if not settings_row["smart_learning_enabled"] or not settings.anthropic_api_key:
        return SmartNudgeResponse(message=None)
    if body.kind == "job_context" and not body.project_id:
        raise HTTPException(status_code=400, detail="project_id is required for job_context nudges")

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    schedule_items, users = await asyncio.gather(
        db_get("schedule_items", "?order=scheduled_end.asc&select=*,projects(name)"),
        db_get("app_users", "?select=id,name&order=name.asc"),
    )

    all_jobs = _jobs_for_user_today(schedule_items, current_user.name, today)
    jobs_for_prompt = [j for j in all_jobs if body.kind != "job_context" or j["project_id"] == body.project_id]
    if body.kind == "job_context" and not jobs_for_prompt:
        return SmartNudgeResponse(message=None)

    entries = _build_team_workload(schedule_items, users, now)
    first_name = current_user.name.split()[0].lower() if current_user.name else ""
    mine = next((e for e in entries if e.name.lower() == first_name), None)

    ctx = SmartNudgeContext(
        name=current_user.name.split()[0] if current_user.name else "there",
        kind=body.kind,
        jobs_today=[SmartNudgeJobToday(**j) for j in jobs_for_prompt],
        open_tasks=[
            SmartNudgeOpenTask(
                title=t.title,
                project_name=t.project_name,
                due_date=t.due_date,
                overdue=bool(t.due_date and (_parse_dt(t.due_date) or now) < now),
            )
            for t in (mine.top_tasks if mine else [])
        ],
        overdue_count=mine.overdue_count if mine else 0,
        completed_this_week=mine.completed_this_week if mine else 0,
    )
    focus_name = jobs_for_prompt[0]["project_name"] if jobs_for_prompt else None
    try:
        result = await generate_smart_nudge(ctx, focus_job=focus_name)
    except ProviderError:
        return SmartNudgeResponse(message=None)
    return SmartNudgeResponse(message=result.message)
