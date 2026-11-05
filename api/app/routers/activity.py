from fastapi import APIRouter, Depends, HTTPException

from ..activity import attach_record_titles, classify_actor, load_activity, require_uuid
from ..deps import CurrentUser, get_current_user
from ..schemas.activity import ActivityEntry
from ..supabase_client import db_get

router = APIRouter(prefix="/activity", tags=["activity"])

_PLAIN = "id,table_name,record_id,field,old_value,new_value,changed_by,changed_by_name,created_at"
_RICH = _PLAIN + ",actor_type,source,action,project_id"


def _entries(rows: list[dict], titles: dict) -> list[ActivityEntry]:
    out = []
    for row in rows:
        actor_type, name = classify_actor(row)
        out.append(
            ActivityEntry(
                id=row["id"],
                table_name=row["table_name"],
                record_id=row["record_id"],
                field=row["field"],
                old_value=row.get("old_value"),
                new_value=row.get("new_value"),
                actor_name=name,
                actor_type=actor_type,
                source=row.get("source"),
                action=row.get("action") or "update",
                project_id=row.get("project_id"),
                created_at=row["created_at"],
                record_title=titles.get((row.get("table_name"), row.get("record_id"))),
            )
        )
    return out


@router.get("/tasks/{task_id}", response_model=list[ActivityEntry])
async def task_activity(task_id: str, _: CurrentUser = Depends(get_current_user)):
    task_id = require_uuid(task_id, "task id")
    found = await db_get("schedule_items", f"?id=eq.{task_id}&select=id&limit=1")
    if not found:
        raise HTTPException(status_code=404, detail="Task not found")
    base = f"?table_name=eq.schedule_items&record_id=eq.{task_id}&order=created_at.desc&limit=200&select="
    rows = await load_activity(base + _RICH, base + _PLAIN)
    titles = await attach_record_titles(rows)
    return _entries(rows, titles)


@router.get("/projects/{project_id}", response_model=list[ActivityEntry])
async def project_activity(project_id: str, _: CurrentUser = Depends(get_current_user)):
    project_id = require_uuid(project_id, "project id")
    found = await db_get("projects", f"?id=eq.{project_id}&select=id&limit=1")
    if not found:
        raise HTTPException(status_code=404, detail="Project not found")
    # project_id on the log row covers tasks and calendar events. The second
    # clause still finds project-field edits written before that column existed.
    rich = (
        f"?or=(project_id.eq.{project_id},and(table_name.eq.projects,record_id.eq.{project_id}))"
        f"&order=created_at.desc&limit=200&select={_RICH}"
    )
    plain = (
        f"?table_name=eq.projects&record_id=eq.{project_id}&order=created_at.desc&limit=200&select={_PLAIN}"
    )
    rows = await load_activity(rich, plain)
    titles = await attach_record_titles(rows)
    return _entries(rows, titles)
