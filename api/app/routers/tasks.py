import asyncio
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
    PriorityReorderRequest,
    ReactionToggle,
    ReorderRequest,
    SubtaskCreate,
    SubtaskOut,
    SubtaskUpdate,
    TaskClarifyUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from ..supabase_client import db_delete, db_delete_query, db_get, db_patch, db_patch_query, db_post
from ..team_roster import normalize_assignee_name

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
    last_comment_author: dict[str, str] = {}
    last_comment_at: dict[str, str] = {}
    for c in comments:
        comment_counts[c["task_id"]] += 1
        # created_at sorts correctly as a plain string (ISO 8601) -- no
        # datetime parsing needed to find the latest per task.
        if c["task_id"] not in last_comment_at or c["created_at"] > last_comment_at[c["task_id"]]:
            last_comment_at[c["task_id"]] = c["created_at"]
            last_comment_author[c["task_id"]] = c["author"]

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
                last_comment_author=last_comment_author.get(r["id"]),
                last_comment_at=last_comment_at.get(r["id"]),
                blocked=r["id"] in blocked_ids,
                overdue=overdue,
            )
        )
    return out


async def _gather_related(id_filter: str):
    subtasks = await db_get("task_subtasks", f"?task_id=in.({id_filter})&select=task_id,is_complete")
    comments = await db_get("task_comments", f"?task_id=in.({id_filter})&select=task_id,author,created_at")
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
    if data.get("assignees"):
        data["assignees"] = [normalize_assignee_name(a) for a in data["assignees"]]
        data["assigned_to"] = data["assignees"][0]
    elif data.get("assigned_to"):
        data["assigned_to"] = normalize_assignee_name(data["assigned_to"])
    # A freshly-created task should land at the top of its column, not the
    # bottom -- it's the thing that just came up, so it should be visible
    # without scrolling. Lower position sorts first (list_tasks orders
    # position.asc), so go one below the current minimum.
    siblings = await db_get(
        "schedule_items", f"?status=eq.{body.status}&order=position.asc&limit=1&select=position"
    )
    data["position"] = (siblings[0]["position"] - 1) if siblings else 0
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

    async def _apply(item):
        position = item.position
        if position is None:
            # Cross-column drop while a filter hid some of the destination
            # column's siblings from the frontend (see ReorderItem) -- ask
            # the database for the real end-of-column position instead of
            # trusting a client-side guess. Higher position sorts last (see
            # create_task's mirror-image "go one below the minimum" logic).
            siblings = await db_get(
                "schedule_items", f"?status=eq.{item.status}&order=position.desc&limit=1&select=position"
            )
            position = (siblings[0]["position"] + 1) if siblings else 0
        updates: dict = {"status": item.status, "position": position}
        if item.id in current_versions:
            updates["version"] = current_versions[item.id] + 1
        await db_patch("schedule_items", item.id, updates)

    await asyncio.gather(*[_apply(item) for item in body.items])
    return {"ok": True}


@router.patch("/reorder-priority")
async def reorder_priority(body: PriorityReorderRequest, _: CurrentUser = Depends(get_current_user)):
    """Bulk manual_position update for drag-to-reorder priority lists (Dashboard's

    Upcoming Tasks widget, the Task Board's Priority-sorted table view). Deliberately
    separate from /reorder: that endpoint always writes status alongside kanban-column
    position, but manual_position is a soft priority hint independent of both the
    kanban column and the scheduled dates, so it needs its own lightweight bulk patch
    with no status coupling and no version-conflict check (low-stakes ordering, not
    board structure).
    """
    await asyncio.gather(
        *[db_patch("schedule_items", item.id, {"manual_position": item.manual_position}) for item in body.items]
    )
    return {"ok": True}


@router.patch("/bulk")
async def bulk_update_tasks(body: BulkUpdateRequest, _: CurrentUser = Depends(get_current_user)):
    updates: dict = {}
    if body.status is not None:
        updates["status"] = body.status
    if body.assigned_to is not None:
        normalized = normalize_assignee_name(body.assigned_to)
        updates["assigned_to"] = normalized
        updates["assignees"] = [normalized] if normalized else []
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    id_filter = ",".join(body.ids)
    if body.status is None:
        await db_patch_query("schedule_items", f"?id=in.({id_filter})", updates)
        return {"ok": True, "updated": len(body.ids)}

    # completed_at should only change for tasks actually transitioning into/out
    # of "complete" -- a bulk selection can mix already-complete tasks with
    # incomplete ones, and re-stamping the already-complete ones would silently
    # reset when they "completed" for reporting purposes.
    current = await db_get("schedule_items", f"?id=in.({id_filter})&select=id,status")
    current_status = {r["id"]: r["status"] for r in current}
    now_iso = datetime.now(timezone.utc).isoformat()
    if body.status == "complete":
        to_stamp = [tid for tid in body.ids if current_status.get(tid) != "complete"]
        untouched = [tid for tid in body.ids if tid not in to_stamp]
        if to_stamp:
            await db_patch_query("schedule_items", f"?id=in.({','.join(to_stamp)})", {**updates, "completed_at": now_iso})
        if untouched:
            await db_patch_query("schedule_items", f"?id=in.({','.join(untouched)})", updates)
    else:
        to_clear = [tid for tid in body.ids if current_status.get(tid) == "complete"]
        untouched = [tid for tid in body.ids if tid not in to_clear]
        if to_clear:
            await db_patch_query("schedule_items", f"?id=in.({','.join(to_clear)})", {**updates, "completed_at": None})
        if untouched:
            await db_patch_query("schedule_items", f"?id=in.({','.join(untouched)})", updates)
    return {"ok": True, "updated": len(body.ids)}


@router.post("/bulk-delete")
async def bulk_delete_tasks(body: BulkDeleteRequest, _: CurrentUser = Depends(get_current_user)):
    # One DELETE ...?id=in.(...) instead of one request per task -- same
    # batching already used for bulk status/assignee updates just above.
    if body.ids:
        await db_delete_query("schedule_items", f"?id=in.({','.join(body.ids)})")
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
    rows = await db_patch("board_views", view_id, body.model_dump(exclude_unset=True))
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
    rows = await db_patch("task_subtasks", subtask_id, body.model_dump(exclude_unset=True))
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


async def _attach_reactions(comments: list[dict], current_user_name: str) -> list[dict]:
    if not comments:
        return comments
    ids = [c["id"] for c in comments]
    id_filter = ",".join(ids)
    reactions = await db_get(
        "task_comment_reactions", f"?comment_id=in.({id_filter})&select=comment_id,author,emoji"
    )
    by_comment: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for r in reactions:
        by_comment[r["comment_id"]][r["emoji"]].append(r["author"])
    for c in comments:
        c["reactions"] = [
            {"emoji": emoji, "count": len(people), "reacted_by_me": current_user_name in people, "people": people}
            for emoji, people in by_comment.get(c["id"], {}).items()
        ]
    return comments


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def list_comments(task_id: str, current_user: CurrentUser = Depends(get_current_user)):
    comments = await db_get("task_comments", f"?task_id=eq.{task_id}&order=created_at.desc")
    return await _attach_reactions(comments, current_user.name or current_user.email)


@router.post("/{task_id}/comments", response_model=CommentOut)
async def create_comment(task_id: str, body: CommentCreate, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_post(
        "task_comments", {"task_id": task_id, "author": current_user.name or current_user.email, "content": body.content}
    )
    comment = rows[0]

    # The comment is already saved at this point -- everything below is a
    # best-effort side effect (notifying anyone @mentioned). If it throws for
    # any reason (a malformed mention, a transient DB hiccup scanning
    # app_users), the whole request must not come back as a failure: from the
    # caller's side that looks exactly like "I posted a comment and it
    # disappeared" -- the comment is really sitting in the DB the whole time,
    # but the client never sees the success response and never refreshes to
    # show it. Isolate it the same way every other non-critical-path AI/side
    # effect in this codebase degrades gracefully instead of sinking the
    # primary action.
    try:
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
    except Exception:
        pass
    return comment


@router.post("/{task_id}/comments/{comment_id}/react", response_model=CommentOut)
async def toggle_comment_reaction(
    task_id: str, comment_id: str, body: ReactionToggle, current_user: CurrentUser = Depends(get_current_user)
):
    """Tapback-style toggle: reacting with an emoji you've already used on this
    comment removes it instead of stacking a duplicate -- the (comment_id,
    author, emoji) unique constraint is what makes this a plain add-or-remove
    rather than needing separate add/remove endpoints."""
    author = current_user.name or current_user.email
    existing = await db_get(
        "task_comment_reactions", f"?comment_id=eq.{comment_id}&author=eq.{author}&emoji=eq.{body.emoji}"
    )
    if existing:
        await db_delete("task_comment_reactions", existing[0]["id"])
    else:
        await db_post("task_comment_reactions", {"comment_id": comment_id, "author": author, "emoji": body.emoji})

    comment_rows = await db_get("task_comments", f"?id=eq.{comment_id}&task_id=eq.{task_id}")
    if not comment_rows:
        raise HTTPException(status_code=404, detail="Comment not found")
    attached = await _attach_reactions(comment_rows, author)
    return attached[0]


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

    # exclude_unset (not exclude_none) -- a caller may need to explicitly
    # clear a nullable field (e.g. unassigning a subcontractor, removing a
    # scheduled date), and that null has to reach the database instead of
    # being silently dropped. This is the same fix already made for
    # clients/projects/invoices/change_orders; TaskClarifyUpdate above only
    # ever existed as a narrow workaround for this exact bug on one field.
    updates = body.model_dump(exclude_unset=True, exclude={"expected_version"})
    if "assignees" in updates:
        # Now that an explicit null is no longer dropped (see above), a
        # caller clearing every assignee could send `assignees: null`
        # instead of `[]` -- guard against iterating None the same way the
        # empty-list case already falls through to "unassigned".
        updates["assignees"] = [normalize_assignee_name(a) for a in (updates["assignees"] or [])]
        updates["assigned_to"] = updates["assignees"][0] if updates["assignees"] else None
    elif "assigned_to" in updates:
        updates["assigned_to"] = normalize_assignee_name(updates["assigned_to"])
    if target_status == "complete" and current[0]["status"] != "complete":
        updates["completed_at"] = datetime.now(timezone.utc).isoformat()
    elif target_status != "complete" and current[0]["status"] == "complete":
        updates["completed_at"] = None
    updates["version"] = current[0]["version"] + 1
    await db_patch("schedule_items", task_id, updates)
    full = await db_get("schedule_items", f"?id=eq.{task_id}&select=*,projects(name),subcontractors(company_name,trade)")
    enriched = await _enrich(full)
    return enriched[0]


@router.patch("/{task_id}/clarify", response_model=TaskOut)
async def update_clarify(task_id: str, body: TaskClarifyUpdate, _: CurrentUser = Depends(get_current_user)):
    """Dedicated endpoint so clearing the flag (clarify_from: null) actually
    reaches the database -- the generic update_task path uses
    exclude_none=True, which would silently drop an explicit null."""
    rows = await db_patch("schedule_items", task_id, {"clarify_from": body.clarify_from})
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    full = await db_get("schedule_items", f"?id=eq.{task_id}&select=*,projects(name),subcontractors(company_name,trade)")
    enriched = await _enrich(full)
    return enriched[0]


@router.delete("/{task_id}")
async def delete_task(task_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("schedule_items", task_id)
    return {"ok": True}
