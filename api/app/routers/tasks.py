from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.tasks import ReorderRequest, TaskCreate, TaskOut, TaskUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _enrich(rows: list[dict]) -> list[TaskOut]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    id_filter = ",".join(ids)

    subtasks, comments, deps = await _gather_related(id_filter)

    subtask_totals: dict[str, int] = defaultdict(int)
    subtask_done: dict[str, int] = defaultdict(int)
    for s in subtasks:
        subtask_totals[s["task_id"]] += 1
        if s.get("is_complete"):
            subtask_done[s["task_id"]] += 1

    comment_counts: dict[str, int] = defaultdict(int)
    for c in comments:
        comment_counts[c["task_id"]] += 1

    status_by_id = {r["id"]: r["status"] for r in rows}
    blocked_ids: set[str] = set()
    for d in deps:
        blocker_status = status_by_id.get(d["depends_on_id"])
        if blocker_status is not None and blocker_status != "complete":
            blocked_ids.add(d["task_id"])

    out = []
    for r in rows:
        out.append(
            TaskOut(
                **r,
                subtask_total=subtask_totals.get(r["id"], 0),
                subtask_complete=subtask_done.get(r["id"], 0),
                comment_count=comment_counts.get(r["id"], 0),
                blocked=r["id"] in blocked_ids,
            )
        )
    return out


async def _gather_related(id_filter: str):
    subtasks = await db_get("task_subtasks", f"?task_id=in.({id_filter})&select=task_id,is_complete")
    comments = await db_get("task_comments", f"?task_id=in.({id_filter})&select=task_id")
    deps = await db_get("task_dependencies", f"?task_id=in.({id_filter})&select=task_id,depends_on_id")
    return subtasks, comments, deps


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    query = "?order=position.asc&select=*,projects(name)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    if status:
        query += f"&status=eq.{status}"
    if assigned_to:
        query += f"&assigned_to=eq.{assigned_to}"
    rows = await db_get("schedule_items", query)
    return await _enrich(rows)


@router.post("", response_model=TaskOut)
async def create_task(body: TaskCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("schedule_items", body.model_dump(exclude_none=True))
    full = await db_get("schedule_items", f"?id=eq.{rows[0]['id']}&select=*,projects(name)")
    enriched = await _enrich(full)
    return enriched[0]


@router.patch("/reorder")
async def reorder_tasks(body: ReorderRequest, _: CurrentUser = Depends(get_current_user)):
    for item in body.items:
        await db_patch("schedule_items", item.id, {"status": item.status, "position": item.position})
    return {"ok": True}


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, body: TaskUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("schedule_items", task_id, body.model_dump(exclude_none=True))
    full = await db_get("schedule_items", f"?id=eq.{task_id}&select=*,projects(name)")
    enriched = await _enrich(full)
    return enriched[0]
