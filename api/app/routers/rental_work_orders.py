import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import RentalWorkOrderCreate, RentalWorkOrderOut, RentalWorkOrderUpdate
from ..schemas.tasks import TaskCreate, TaskUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post
from .tasks import create_task, update_task

router = APIRouter(prefix="/rental-work-orders", tags=["rentals"])

# Work-order status -> linked Task Board column. One-directional: changing a
# work order's status here updates its linked task, but completing the task
# directly on the Task Board does NOT sync back to the work order (a real,
# accepted MVP simplification, flagged in the plan as a follow-up).
_STATUS_TO_TASK_STATUS = {"open": "upcoming", "in_progress": "in_progress", "resolved": "complete"}


async def _enrich(rows: list[dict]) -> list[RentalWorkOrderOut]:
    if not rows:
        return []
    property_ids = list({r["property_id"] for r in rows})
    unit_ids = list({r["unit_id"] for r in rows if r.get("unit_id")})
    properties, units = await asyncio.gather(
        db_get("rental_properties", f"?id=in.({','.join(property_ids)})&select=id,address"),
        db_get("rental_units", f"?id=in.({','.join(unit_ids)})&select=id,unit_label") if unit_ids else asyncio.sleep(0, result=[]),
    )
    address_by_id = {p["id"]: p["address"] for p in properties}
    label_by_id = {u["id"]: u["unit_label"] for u in units}
    return [
        RentalWorkOrderOut(
            **r,
            property_address=address_by_id.get(r["property_id"]),
            unit_label=label_by_id.get(r["unit_id"]) if r.get("unit_id") else None,
        )
        for r in rows
    ]


@router.get("", response_model=list[RentalWorkOrderOut])
async def list_work_orders(
    property_id: Optional[str] = None, status: Optional[str] = None, _: CurrentUser = Depends(get_current_user)
):
    query = "?order=created_at.desc"
    if property_id:
        query += f"&property_id=eq.{property_id}"
    if status:
        query += f"&status=eq.{status}"
    rows = await db_get("rental_work_orders", query)
    return await _enrich(rows)


@router.post("", response_model=RentalWorkOrderOut)
async def create_work_order(body: RentalWorkOrderCreate, current_user: CurrentUser = Depends(get_current_user)):
    property_rows = await db_get("rental_properties", f"?id=eq.{body.property_id}&select=address")
    if not property_rows:
        raise HTTPException(status_code=404, detail="Property not found")
    address = property_rows[0]["address"]

    # Creates a linked Task Board card (project_id: null, title prefixed with
    # the property address) via the real tasks.create_task endpoint function
    # -- reuses its position-assignment/assignee-normalization logic instead
    # of duplicating it, matching this codebase's established
    # import-and-reuse convention (e.g. estimate_templates.py reusing
    # estimates.py's _compute_costs).
    task = await create_task(
        TaskCreate(
            project_id=None,
            title=f"[{address}] {body.title}",
            assigned_to=body.assigned_to,
            priority=body.priority,
            notes=f"Rental work order for {address}." + (f"\n\n{body.description}" if body.description else ""),
        ),
        _=current_user,
    )

    rows = await db_post(
        "rental_work_orders",
        {
            "property_id": body.property_id,
            "unit_id": body.unit_id,
            "title": body.title,
            "description": body.description,
            "priority": body.priority,
            "assigned_to": body.assigned_to,
            "task_id": task.id,
        },
    )
    enriched = await _enrich(rows)
    return enriched[0]


@router.patch("/{work_order_id}", response_model=RentalWorkOrderOut)
async def update_work_order(
    work_order_id: str, body: RentalWorkOrderUpdate, current_user: CurrentUser = Depends(get_current_user)
):
    existing = await db_get("rental_work_orders", f"?id=eq.{work_order_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Work order not found")
    current = existing[0]

    updates = body.model_dump(exclude_unset=True)
    if body.status and body.status != current["status"]:
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat() if body.status == "resolved" else None
        if current.get("task_id") and body.status in _STATUS_TO_TASK_STATUS:
            try:
                await update_task(current["task_id"], TaskUpdate(status=_STATUS_TO_TASK_STATUS[body.status]), _=current_user)
            except HTTPException:
                # The linked task may have been deleted independently on the
                # Task Board -- don't let that block the work order's own
                # status update.
                pass

    await db_patch("rental_work_orders", work_order_id, updates)
    rows = await db_get("rental_work_orders", f"?id=eq.{work_order_id}")
    enriched = await _enrich(rows)
    return enriched[0]


@router.delete("/{work_order_id}")
async def delete_work_order(work_order_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_work_orders", work_order_id)
    return {"ok": True}
