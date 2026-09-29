"""Calendar events: a Schedule-calendar entry that is NOT a task, and never
defaults to being linked to one. Shared by the calendar_events router (manual
create/edit/delete) and by anything that keeps an auto-generated marker in
sync -- today that's a project's Start/Estimated Completion date and a
phase's manual date on the Phase Tracker."""
from typing import Optional

from .supabase_client import db_delete, db_get, db_patch, db_post

TABLE = "calendar_events"
SELECT = "*,projects(name)"


async def sync_auto_event(project_id: str, auto_kind: str, title: str, date_value: Optional[str]) -> None:
    """Keeps exactly one event per (project_id, auto_kind) in step with
    whatever's driving it. date_value=None removes it -- a cleared date means
    the marker no longer means anything, so it comes off the calendar too
    instead of being left stranded on a stale date."""
    existing = await db_get(TABLE, f"?project_id=eq.{project_id}&auto_kind=eq.{auto_kind}&select=id")
    if not date_value:
        if existing:
            await db_delete(TABLE, existing[0]["id"])
        return
    day = date_value[:10]
    if existing:
        await db_patch(TABLE, existing[0]["id"], {"event_date": day, "title": title})
    else:
        await db_post(TABLE, {"project_id": project_id, "title": title, "event_date": day, "auto_kind": auto_kind})


async def auto_dates_by_kind(project_id: str) -> dict[str, str]:
    """{auto_kind: event_date} for every auto-generated event on a project --
    how the phase-progress endpoint reads back each phase's manual date
    without a second table."""
    rows = await db_get(TABLE, f"?project_id=eq.{project_id}&auto_kind=not.is.null&select=auto_kind,event_date")
    return {r["auto_kind"]: r["event_date"] for r in rows}
