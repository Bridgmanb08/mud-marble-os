from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..mentions import create_mention_notifications
from ..schemas.tasks import (
    BoardViewCreate,
    BoardViewOut,
    BoardViewUpdate,
    BulkDeleteRequest,
    BulkUpdateRequest,
    CommentCreate,
    CommentOut,
    DependencyCreate,
    DependencyOut,
    ReorderRequest,
    SubtaskCreate,
    SubtaskOut,
    SubtaskUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post

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

    today = datetime.now(timezone.utc).date().isoformat()

    out = []
    for r in rows:
        overdue = bool(r.get("scheduled_end")) and r["scheduled_end"] < today and r.get("status") != "complete"
        out.append(
            TaskOut(
                **r,
                subtask_total=subtask_totals.get(r["id"], 0),
                subtask_complete=subtask_done.get(r["id"], 0),
                comment_count=comment_counts.get(r["id"], 0),
                blocked=r["id"] in blocked_ids,
                overdue=overdue,
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
    query = "?order=position.asc&select=*,projects(name),subcontractors(company_name,trade)"
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
    data = body.model_dump(exclude_none=True)
    siblings = await db_get(
        "schedule_items", f"?status=eq.{body.status}&order=position.desc&limit=1&select=position"
    )
    data["position"] = (siblings[0]["position"] + 1) if siblings else 0
    rows = await db_post("schedule_items", data)
    full = await db_get("schedule_items", f"?id=eq.{rows[0]['id']}&select=*,projects(name),subcontractors(company_name,trade)")
    enriched = await _enrich(full)
    return enriched[0]


@router.patch("/reorder")
async def reorder_tasks(body: ReorderRequest, _: CurrentUser = Depends(get_current_user)):
    """Bulk status/position update for drag-and-drop, with optimistic concurrency.

    Each item may carry the `version` the client last saw for that task. If any
    task moved on since (someone else edited/reordered it), we reject the whole
    batch with 409 rather than silently clobbering their change — the frontend
    reloads to show the current board instead.
    """
    ids = [item.id for item in body.items]
    if not ids:
        return {"ok": True}

    id_filter = ",".join(ids)
    current_rows = await db_get("schedule_items", f"?id=in.({id_filter})&select=id,version")
    current_versions = {r["id"]: r["version"] for r in current_rows}

    conflicts = [
        item.id
        for item in body.items
        if item.expected_version is not None and current_versions.get(item.id) != item.expected_version
    ]
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail="The board changed elsewhere before your drag finished — reloading to show the latest order.",
        )

    for item in body.items:
        updates: dict = {"status": item.status, "position": item.position}
        if item.id in current_versions:
            updates["version"] = current_versions[item.id] + 1
        await db_patch("schedule_items", item.id, updates)
    return {"ok": True}


@router.patch("/bulk")
async def bulk_update_tasks(body: BulkUpdateRequest, _: CurrentUser = Depends(get_current_user)):
    updates: dict = {}
    if body.status is not None:
        updates["status"] = body.status
    if body.assigned_to is not None:
        updates["assigned_to"] = body.assigned_to
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for task_id in body.ids:
        await db_patch("schedule_items", task_id, updates)
    return {"ok": True, "updated": len(body.ids)}


@router.post("/bulk-delete")
async def bulk_delete_tasks(body: BulkDeleteRequest, _: CurrentUser = Depends(get_current_user)):
    for task_id in body.ids:
        await db_delete("schedule_items", task_id)
    return {"ok": True, "deleted": len(body.ids)}


@router.get("/views", response_model=list[BoardViewOut])
async def list_views(current_user: CurrentUser = Depends(get_current_user)):
    return await db_get("board_views", f"?user_id=eq.{current_user.id}&order=position.asc")


@router.post("/views", response_model=BoardViewOut)
async def create_view(body: BoardViewCreate, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_post("board_views", {**body.model_dump(), "user_id": current_user.id})
    return rows[0]


@router.patch("/views/{view_id}", response_model=BoardViewOut)
async def update_view(view_id: str, body: BoardViewUpdate, current_user: CurrentUser = Depends(get_current_user)):
    await _require_owned("board_views", view_id, current_user)
    rows = await db_patch("board_views", view_id, body.model_dump(exclude_none=True))
    return rows[0]


@router.delete("/views/{view_id}")
async def delete_view(view_id: str, current_user: CurrentUser = Depends(get_current_user)):
    await _require_owned("board_views", view_id, current_user)
    await db_delete("board_views", view_id)
    return {"ok": True}


async def _require_owned(table: str, record_id: str, current_user: CurrentUser) -> None:
    rows = await db_get(table, f"?id=eq.{record_id}&select=user_id")
    if not rows or rows[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/{task_id}/subtasks", response_model=list[SubtaskOut])
async def list_subtasks(task_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("task_subtasks", f"?task_id=eq.{task_id}&order=position.asc")


@router.post("/{task_id}/subtasks", response_model=SubtaskOut)
async def create_subtask(task_id: str, body: SubtaskCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("task_subtasks", {**body.model_dump(), "task_id": task_id})
    return rows[0]


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=SubtaskOut)
async def update_subtask(task_id: str, subtask_id: str, body: SubtaskUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("task_subtasks", subtask_id, body.model_dump(exclude_none=True))
    return rows[0]


@router.delete("/{task_id}/subtasks/{subtask_id}")
async def delete_subtask(task_id: str, subtask_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("task_subtasks", subtask_id)
    return {"ok": True}


@router.get("/{task_id}/dependencies", response_model=list[DependencyOut])
async def list_dependencies(task_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("task_dependencies", f"?task_id=eq.{task_id}")


async def _would_create_cycle(task_id: str, depends_on_id: str) -> bool:
    """Would adding "task_id depends on depends_on_id" create a circular chain?

    True if depends_on_id can already (transitively) reach task_id via existing
    dependency edges -- meaning task_id is already an upstream prerequisite of
    depends_on_id, so the new edge would close a loop.
    """
    all_deps = await db_get("task_dependencies", "?select=task_id,depends_on_id")
    graph: dict[str, list[str]] = defaultdict(list)
    for d in all_deps:
        graph[d["task_id"]].append(d["depends_on_id"])
    visited: set[str] = set()
    stack = [depends_on_id]
    while stack:
        current = stack.pop()
        if current == task_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        stack.extend(graph.get(current, []))
    return False


@router.post("/{task_id}/dependencies", response_model=DependencyOut)
async def create_dependency(task_id: str, body: DependencyCreate, _: CurrentUser = Depends(get_current_user)):
    if body.depends_on_id == task_id:
        raise HTTPException(status_code=400, detail="A task cannot depend on itself")
    if await _would_create_cycle(task_id, body.depends_on_id):
        raise HTTPException(status_code=400, detail="This would create a circular dependency")
    rows = await db_post("task_dependencies", {"task_id": task_id, "depends_on_id": body.depends_on_id})
    return rows[0]


@router.delete("/{task_id}/dependencies/{dependency_id}")
async def delete_dependency(task_id: str, dependency_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("task_dependencies", dependency_id)
    return {"ok": True}


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def list_comments(task_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("task_comments", f"?task_id=eq.{task_id}&order=created_at.desc")


@router.post("/{task_id}/comments", response_model=CommentOut)
async def create_comment(task_id: str, body: CommentCreate, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_post(
        "task_comments", {"task_id": task_id, "author": current_user.name or current_user.email, "content": body.content}
    )
    comment = rows[0]

    task_rows = await db_get("schedule_items", f"?id=eq.{task_id}&select=title,project_id")
    task_title = task_rows[0]["title"] if task_rows else "a task"
    project_id = task_rows[0].get("project_id") if task_rows else None
    await create_mention_notifications(
        content=body.content,
        project_id=project_id,
        source_type="task_comment",
        source_id=comment["id"],
        message=f'{current_user.name or current_user.email} mentioned you on task "{task_title}"',
        exclude_user_id=current_user.id,
    )
    return comment


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, body: TaskUpdate, _: CurrentUser = Depends(get_current_user)):
    current = await db_get("schedule_items", f"?id=eq.{task_id}&select=version,status")
    if not current:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.expected_version is not None and body.expected_version != current[0]["version"]:
        raise HTTPException(
            status_code=409, detail="This task was updated by someone else. Reload to see the latest changes."
        )

    target_status = body.status if body.status is not None else current[0]["status"]
    if target_status == "complete" and current[0]["status"] != "complete":
        deps = await db_get("task_dependencies", f"?task_id=eq.{task_id}&select=depends_on_id")
        if deps:
            blocker_ids = ",".join(d["depends_on_id"] for d in deps)
            blockers = await db_get("schedule_items", f"?id=in.({blocker_ids})&select=id,status,title")
            incomplete = [b for b in blockers if b["status"] != "complete"]
            if incomplete:
                names = ", ".join(b["title"] for b in incomplete[:3])
                raise HTTPException(
                    status_code=400,
                    detail=f"Can't mark this task complete — it's blocked by an incomplete dependency: {names}",
                )

    updates = body.model_dump(exclude_none=True, exclude={"expected_version"})
    updates["version"] = current[0]["version"] + 1
    await db_patch("schedule_items", task_id, updates)
    full = await db_get("schedule_items", f"?id=eq.{task_id}&select=*,projects(name),subcontractors(company_name,trade)")
    enriched = await _enrich(full)
    return enriched[0]


@router.delete("/{task_id}")
async def delete_task(task_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("schedule_items", task_id)
    return {"ok": True}
