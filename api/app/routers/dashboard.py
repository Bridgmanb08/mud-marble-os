import asyncio

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.dashboard import ActivityItem, ActiveProject, DashboardSummary, UpcomingTask
from ..supabase_client import db_get

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
async def get_dashboard(_: CurrentUser = Depends(get_current_user)):
    projects, invoices, change_orders, tasks, notes = await asyncio.gather(
        db_get("projects", "?is_archived=eq.false&select=*,clients(first_name,last_name)"),
        db_get("invoices", "?select=amount_due,amount_paid,status"),
        db_get("change_orders", "?select=status"),
        db_get(
            "schedule_items",
            "?status=neq.complete&order=scheduled_end.asc&limit=6&select=*,projects(name)",
        ),
        db_get("project_notes", "?order=created_at.desc&limit=6&select=*,projects(name)"),
    )

    active = [p for p in projects if p.get("status") == "active"]
    total_contract_value = sum(p.get("contract_value") or 0 for p in projects)
    total_invoiced = sum(i.get("amount_due") or 0 for i in invoices)
    total_collected = sum(i.get("amount_paid") or 0 for i in invoices)
    total_outstanding = max(0.0, total_invoiced - total_collected)
    pct_collected = round(total_collected / total_invoiced * 100) if total_invoiced > 0 else 0
    open_cos = len([c for c in change_orders if c.get("status") in ("pending", "sent")])
    overdue_invoices = len([i for i in invoices if i.get("status") == "overdue"])

    return DashboardSummary(
        active_project_count=len(active),
        total_contract_value=total_contract_value,
        total_collected=total_collected,
        total_outstanding=total_outstanding,
        pct_collected=pct_collected,
        open_change_orders=open_cos,
        overdue_invoices=overdue_invoices,
        active_projects=[
            ActiveProject(
                id=p["id"],
                name=p["name"],
                client_name=(
                    f"{p['clients']['first_name']} {p['clients']['last_name']}"
                    if p.get("clients")
                    else None
                ),
                health_status=p.get("health_status"),
            )
            for p in active
        ],
        upcoming_tasks=[
            UpcomingTask(
                id=t["id"],
                title=t["title"],
                project_name=(t.get("projects") or {}).get("name"),
                assigned_to=t.get("assigned_to"),
                scheduled_end=t.get("scheduled_end"),
            )
            for t in tasks
        ],
        recent_activity=[
            ActivityItem(
                id=n["id"],
                author=n.get("author"),
                note_type=n.get("note_type"),
                project_name=(n.get("projects") or {}).get("name"),
                content=n["content"],
                created_at=n["created_at"],
            )
            for n in notes
        ],
    )
