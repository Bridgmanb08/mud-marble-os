from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..calendar_events import SELECT, TABLE
from ..deps import CurrentUser, get_current_user
from ..schemas.calendar_events import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/calendar-events", tags=["calendar-events"])


@router.get("", response_model=list[CalendarEventOut])
async def list_calendar_events(
    project_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    query = f"?order=event_date.asc&select={SELECT}"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    if start:
        query += f"&event_date=gte.{start}"
    if end:
        query += f"&event_date=lte.{end}"
    return await db_get(TABLE, query)


@router.post("", response_model=CalendarEventOut)
async def create_calendar_event(body: CalendarEventCreate, _: CurrentUser = Depends(get_current_user)):
    # auto_kind is never accepted from a client (not on CalendarEventCreate at
    # all) -- every manually-created event is a real free-standing event, on
    # purpose, so it can never collide with or masquerade as an auto-synced
    # project/phase marker.
    rows = await db_post(TABLE, body.model_dump(exclude_none=True))
    full = await db_get(TABLE, f"?id=eq.{rows[0]['id']}&select={SELECT}")
    return full[0]


@router.patch("/{event_id}", response_model=CalendarEventOut)
async def update_calendar_event(event_id: str, body: CalendarEventUpdate, _: CurrentUser = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if updates:
        await db_patch(TABLE, event_id, updates)
    full = await db_get(TABLE, f"?id=eq.{event_id}&select={SELECT}")
    if not full:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return full[0]


@router.delete("/{event_id}")
async def delete_calendar_event(event_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete(TABLE, event_id)
    return {"ok": True}
