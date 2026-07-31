import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user, require_admin
from ..schemas.pulse import (
    PulseCheckinCreate,
    PulseCheckinOut,
    PulseMemberSummary,
    PulsePushResponse,
    PulseTeamSummary,
    PulseWinEntry,
)
from ..supabase_client import db_get, db_post

router = APIRouter(prefix="/pulse", tags=["pulse"])


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.post("/checkins", response_model=PulseCheckinOut)
async def create_checkin(body: PulseCheckinCreate, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_post("pulse_checkins", {"user_id": current_user.id, **body.model_dump()})
    return rows[0]


@router.get("/checkins/me", response_model=list[PulseCheckinOut])
async def my_checkins(limit: int = 5, current_user: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "pulse_checkins", f"?user_id=eq.{current_user.id}&order=created_at.desc&limit={limit}"
    )


@router.get("/team-summary", response_model=PulseTeamSummary)
async def team_summary(_: CurrentUser = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    users, checkins = await asyncio.gather(
        db_get("app_users", "?select=id,name&order=name.asc"),
        db_get("pulse_checkins", "?order=created_at.desc&limit=500"),
    )

    by_user: dict[str, list[dict]] = defaultdict(list)
    for c in checkins:
        by_user[c["user_id"]].append(c)

    members: list[PulseMemberSummary] = []
    latest_ratings: list[int] = []
    stuck_count = 0
    for u in users:
        rows = by_user.get(u["id"], [])
        latest = PulseCheckinOut(**rows[0]) if rows else None
        days_since = None
        if latest:
            days_since = (now - _parse_dt(latest.created_at)).days
            latest_ratings.append(latest.workload_rating)
            if latest.feeling_stuck:
                stuck_count += 1
        trend = [r["workload_rating"] for r in reversed(rows[:5])]
        members.append(
            PulseMemberSummary(
                user_id=u["id"],
                name=(u.get("name") or "").split()[0] if u.get("name") else u["id"],
                latest=latest,
                days_since_checkin=days_since,
                trend=trend,
            )
        )

    responses_this_week = sum(1 for c in checkins if _parse_dt(c["created_at"]) >= week_ago)

    name_by_id = {u["id"]: (u.get("name") or "").split()[0] if u.get("name") else u["id"] for u in users}
    recent_wins = [
        PulseWinEntry(
            user_id=c["user_id"],
            name=name_by_id.get(c["user_id"], "Someone"),
            grateful_for=c.get("grateful_for"),
            win=c.get("win"),
            created_at=c["created_at"],
        )
        for c in checkins
        if c.get("grateful_for") or c.get("win")
    ][:8]

    return PulseTeamSummary(
        members=members,
        avg_workload=round(sum(latest_ratings) / len(latest_ratings), 1) if latest_ratings else None,
        stuck_count=stuck_count,
        responses_this_week=responses_this_week,
        recent_wins=recent_wins,
    )


@router.post("/push-request", response_model=PulsePushResponse)
async def push_checkin_request(current_user: CurrentUser = Depends(require_admin)):
    users = await db_get("app_users", "?select=id,name")
    first_name = (current_user.name or "").split()[0] if current_user.name else "Your manager"
    sent = 0
    for u in users:
        if u["id"] == current_user.id:
            continue
        await db_post(
            "notifications",
            {
                "user_id": u["id"],
                "type": "pulse_checkin_request",
                "source_type": "pulse",
                "source_id": None,
                "project_id": None,
                "message": f"{first_name} would love a quick pulse check-in from you -- how's the week going?",
            },
        )
        sent += 1
    return PulsePushResponse(sent=sent)
