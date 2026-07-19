import asyncio
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..config import settings
from ..custom_widget_spec import (
    NUMERIC_FIELDS,
    SOURCE_FIELDS,
    CustomWidgetSpec,
    SpecValidationError,
    validate_spec,
)
from ..deps import CurrentUser, get_current_user
from ..schemas.custom_widget import CreateCustomWidgetRequest, CustomWidgetOut
from ..schemas.dashboard import (
    ActivityItem,
    ActiveProject,
    AlexCostTracker,
    ARAgingBucket,
    ARAgingDetail,
    CashPosition,
    ChangeOrderAction,
    ClientCommunicationEntry,
    ContractorMilestone,
    DashboardSummary,
    DesignProjectCard,
    ProjectProfitability,
    QBOSyncStatus,
    UpcomingTask,
)
from ..schemas.layout import LayoutOut, LayoutUpdate, WidgetItem
from ..supabase_client import db_delete, db_get, db_patch, db_post
from ..widget_catalog import default_widgets_for_role

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CUSTOM_WIDGET_PROMPT = """You turn a plain-English dashboard request into a strict JSON spec for a \
construction-company project management dashboard.

Available data sources and their fields (you MUST only use these — nothing else exists):
{sources}

Numeric fields (only these may be used for "sum" or "avg" aggregation):
{numeric}

Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape:
{{
  "title": "short widget title",
  "spec": {{
    "source": "<one of the sources above>",
    "filters": [{{"field": "<field name>", "op": "eq|neq|gt|gte|lt|lte|contains", "value": <string, number, or boolean>}}],
    "aggregation": "count|sum|avg|list",
    "aggregation_field": "<numeric field name, only if aggregation is sum or avg, else omit>"
  }}
}}

If the request doesn't clearly map to one of the available sources, pick the closest reasonable match \
rather than refusing — "aggregation":"list" with no filters is a safe fallback.

User's request: {prompt}"""

ALEX_MONTHLY_TARGET = 7600.0


def _parse_dt(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@router.get("", response_model=DashboardSummary)
async def get_dashboard(_: CurrentUser = Depends(get_current_user)):
    now = datetime.now(timezone.utc)

    (
        projects,
        invoices,
        change_orders,
        schedule_items,
        recent_notes,
        client_comm_notes,
        transactions,
        estimates,
    ) = await asyncio.gather(
        db_get("projects", "?is_archived=eq.false&select=*,clients(first_name,last_name)"),
        db_get(
            "invoices",
            "?select=amount_due,amount_paid,status,due_date,project_id,projects(name,clients(first_name,last_name))",
        ),
        db_get(
            "change_orders",
            "?select=id,co_number,title,status,sent_at,owner_price,project_id,projects(name)",
        ),
        db_get(
            "schedule_items",
            "?order=scheduled_end.asc&select=*,projects(name)",
        ),
        db_get("project_notes", "?order=created_at.desc&limit=6&select=*,projects(name)"),
        db_get(
            "project_notes",
            "?note_type=eq.client_communication&order=created_at.desc&select=project_id,created_at",
        ),
        db_get(
            "transactions",
            "?select=amount,transaction_type,vendor,quickbooks_synced,transaction_date,project_id",
        ),
        db_get("estimates", "?select=project_id,version,grand_total_owner_price,status&order=version.desc"),
    )

    active = [p for p in projects if p.get("status") == "active"]
    total_contract_value = sum(p.get("contract_value") or 0 for p in projects)
    total_invoiced = sum(i.get("amount_due") or 0 for i in invoices)
    total_collected = sum(i.get("amount_paid") or 0 for i in invoices)
    total_outstanding = max(0.0, total_invoiced - total_collected)
    pct_collected = round(total_collected / total_invoiced * 100) if total_invoiced > 0 else 0
    open_cos = len([c for c in change_orders if c.get("status") in ("pending", "sent")])
    overdue_invoices = len([i for i in invoices if i.get("status") == "overdue"])

    incomplete_tasks = [t for t in schedule_items if t.get("status") != "complete"]

    # -- contractor milestones --
    contractor_milestones = []
    for t in incomplete_tasks[:20]:
        end = _parse_dt(t.get("scheduled_end"))
        days_until_due = (end - now).days if end else None
        contractor_milestones.append(
            ContractorMilestone(
                id=t["id"],
                title=t["title"],
                project_name=(t.get("projects") or {}).get("name"),
                assigned_to=t.get("assigned_to"),
                scheduled_end=t.get("scheduled_end"),
                days_until_due=days_until_due,
                overdue=bool(days_until_due is not None and days_until_due < 0),
            )
        )

    # -- client communication log (per active project, most recent contact) --
    last_contact_by_project: dict[str, str] = {}
    for note in client_comm_notes:
        pid = note.get("project_id")
        if pid and pid not in last_contact_by_project:
            last_contact_by_project[pid] = note["created_at"]

    client_communications = []
    for p in active:
        last_at = last_contact_by_project.get(p["id"])
        last_dt = _parse_dt(last_at)
        days_since = (now - last_dt).days if last_dt else None
        client_communications.append(
            ClientCommunicationEntry(
                project_id=p["id"],
                project_name=p["name"],
                last_contact_at=last_at,
                days_since_contact=days_since,
                overdue=(days_since is None or days_since >= 2),
            )
        )

    # -- change orders needing action --
    change_orders_action = []
    for co in change_orders:
        if co.get("status") not in ("pending", "sent"):
            continue
        sent_at = _parse_dt(co.get("sent_at"))
        hours_since_sent = int((now - sent_at).total_seconds() // 3600) if sent_at else None
        change_orders_action.append(
            ChangeOrderAction(
                id=co["id"],
                co_number=co.get("co_number"),
                title=co["title"],
                project_name=(co.get("projects") or {}).get("name"),
                status=co["status"],
                hours_since_sent=hours_since_sent,
                sop_breach=bool(co.get("status") == "sent" and hours_since_sent and hours_since_sent > 24),
            )
        )

    # -- AR aging --
    bucket_totals: dict[str, list] = {"current": [0.0, 0], "1-30": [0.0, 0], "31-60": [0.0, 0], "61-90": [0.0, 0], "90+": [0.0, 0]}
    ar_aging_detail = []
    for inv in invoices:
        outstanding = (inv.get("amount_due") or 0) - (inv.get("amount_paid") or 0)
        if outstanding <= 0 or inv.get("status") in ("paid", "void"):
            continue
        due = _parse_dt(inv.get("due_date"))
        days_overdue = (now - due).days if due else 0
        if days_overdue <= 0:
            bucket = "current"
        elif days_overdue <= 30:
            bucket = "1-30"
        elif days_overdue <= 60:
            bucket = "31-60"
        elif days_overdue <= 90:
            bucket = "61-90"
        else:
            bucket = "90+"
        bucket_totals[bucket][0] += outstanding
        bucket_totals[bucket][1] += 1
        proj = inv.get("projects") or {}
        clients = proj.get("clients") or {}
        client_name = (
            f"{clients.get('first_name', '')} {clients.get('last_name', '')}".strip() if clients else None
        )
        ar_aging_detail.append(
            ARAgingDetail(
                project_name=proj.get("name") or "—",
                client_name=client_name or None,
                amount_outstanding=outstanding,
                days_overdue=max(0, days_overdue),
            )
        )
    ar_aging = [ARAgingBucket(bucket=b, total=v[0], count=v[1]) for b, v in bucket_totals.items()]
    ar_aging_detail.sort(key=lambda d: d.days_overdue, reverse=True)

    # -- project profitability (latest estimate per project vs actual spend) --
    latest_estimate_by_project: dict[str, float] = {}
    for e in estimates:
        pid = e.get("project_id")
        if pid and pid not in latest_estimate_by_project:
            latest_estimate_by_project[pid] = e.get("grand_total_owner_price") or 0

    spend_by_project: dict[str, float] = defaultdict(float)
    for t in transactions:
        if t.get("transaction_type") == "expense":
            spend_by_project[t.get("project_id")] += abs(t.get("amount") or 0)

    project_profitability = []
    for p in projects:
        estimated = latest_estimate_by_project.get(p["id"])
        actual = spend_by_project.get(p["id"], 0.0)
        if estimated is None and actual == 0:
            continue
        estimated = estimated or 0.0
        project_profitability.append(
            ProjectProfitability(
                project_id=p["id"],
                project_name=p["name"],
                estimated=estimated,
                actual_spend=actual,
                variance=estimated - actual,
            )
        )

    # -- QuickBooks sync status --
    unsynced = [t for t in transactions if not t.get("quickbooks_synced")]
    tx_dates = [d for t in transactions if (d := t.get("transaction_date"))]
    qbo_sync = QBOSyncStatus(
        unsynced_count=len(unsynced),
        total_count=len(transactions),
        most_recent_transaction_date=max(tx_dates) if tx_dates else None,
    )

    # -- cash position --
    total_income = sum(abs(t.get("amount") or 0) for t in transactions if t.get("transaction_type") == "income")
    total_expense = sum(abs(t.get("amount") or 0) for t in transactions if t.get("transaction_type") == "expense")
    cash_position = CashPosition(total_income=total_income, total_expense=total_expense, net=total_income - total_expense)

    # -- Alex's cost tracker (matched by vendor name; no dedicated crew-member field in the schema yet) --
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    alex_spend = 0.0
    for t in transactions:
        if t.get("transaction_type") != "expense":
            continue
        vendor = (t.get("vendor") or "").lower()
        if "alex" not in vendor:
            continue
        tdate = _parse_dt(t.get("transaction_date"))
        if tdate and tdate >= month_start:
            alex_spend += abs(t.get("amount") or 0)
    alex_cost = AlexCostTracker(
        month_to_date_spend=alex_spend,
        monthly_target=ALEX_MONTHLY_TARGET,
        pct_of_target=round(alex_spend / ALEX_MONTHLY_TARGET * 100) if ALEX_MONTHLY_TARGET else 0,
    )

    # -- design project cards (timeline % + task completion %) --
    tasks_by_project: dict[str, list] = defaultdict(list)
    for t in schedule_items:
        pid = t.get("project_id")
        if pid:
            tasks_by_project[pid].append(t)

    design_projects = []
    for p in active:
        start = _parse_dt(p.get("start_date"))
        end = _parse_dt(p.get("estimated_completion"))
        timeline_pct = None
        if start and end and end > start:
            timeline_pct = max(0, min(100, round((now - start).total_seconds() / (end - start).total_seconds() * 100)))
        proj_tasks = tasks_by_project.get(p["id"], [])
        done = len([t for t in proj_tasks if t.get("status") == "complete"])
        task_completion_pct = round(done / len(proj_tasks) * 100) if proj_tasks else None
        at_risk = p.get("health_status") == "red" or (
            timeline_pct is not None and task_completion_pct is not None and timeline_pct > task_completion_pct + 15
        )
        design_projects.append(
            DesignProjectCard(
                project_id=p["id"],
                project_name=p["name"],
                timeline_pct=timeline_pct,
                task_completion_pct=task_completion_pct,
                at_risk=at_risk,
            )
        )

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
                    f"{p['clients']['first_name']} {p['clients']['last_name']}" if p.get("clients") else None
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
            for t in incomplete_tasks[:6]
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
            for n in recent_notes
        ],
        contractor_milestones=contractor_milestones,
        client_communications=client_communications,
        change_orders_action=change_orders_action,
        ar_aging=ar_aging,
        ar_aging_detail=ar_aging_detail[:10],
        project_profitability=project_profitability,
        qbo_sync=qbo_sync,
        cash_position=cash_position,
        alex_cost=alex_cost,
        design_projects=design_projects,
    )


@router.get("/layout", response_model=LayoutOut)
async def get_layout(user_id: Optional[str] = None, current_user: CurrentUser = Depends(get_current_user)):
    target_id = user_id or current_user.id
    if target_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required to view another user's dashboard")

    rows = await db_get("dashboard_layouts", f"?user_id=eq.{target_id}&select=widgets")
    if rows:
        return LayoutOut(widgets=[WidgetItem(**w) for w in rows[0]["widgets"]])

    if target_id == current_user.id:
        role = current_user.role
    else:
        user_rows = await db_get("app_users", f"?id=eq.{target_id}&select=role")
        role = user_rows[0]["role"] if user_rows else "member"

    widgets = default_widgets_for_role(role)
    await db_post("dashboard_layouts", {"user_id": target_id, "widgets": widgets})
    return LayoutOut(widgets=[WidgetItem(**w) for w in widgets])


@router.put("/layout", response_model=LayoutOut)
async def update_layout(body: LayoutUpdate, current_user: CurrentUser = Depends(get_current_user)):
    target_id = body.user_id or current_user.id
    if target_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required to edit another user's dashboard")

    widgets = [w.model_dump() for w in body.widgets]
    existing = await db_get("dashboard_layouts", f"?user_id=eq.{target_id}&select=id")
    if existing:
        await db_patch("dashboard_layouts", existing[0]["id"], {"widgets": widgets})
    else:
        await db_post("dashboard_layouts", {"user_id": target_id, "widgets": widgets})
    return LayoutOut(widgets=body.widgets)


@router.get("/custom-widgets", response_model=list[CustomWidgetOut])
async def list_custom_widgets(current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_get(
        "custom_widgets", f"?user_id=eq.{current_user.id}&select=id,title,spec&order=created_at.desc"
    )
    return [CustomWidgetOut(id=r["id"], title=r["title"], spec=CustomWidgetSpec(**r["spec"])) for r in rows]


@router.post("/custom-widgets", response_model=CustomWidgetOut)
async def create_custom_widget(
    body: CreateCustomWidgetRequest, current_user: CurrentUser = Depends(get_current_user)
):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    sources_desc = "\n".join(f"- {s}: {', '.join(sorted(fields))}" for s, fields in SOURCE_FIELDS.items())
    numeric_desc = "\n".join(
        f"- {s}: {', '.join(sorted(fields)) or '(none)'}" for s, fields in NUMERIC_FIELDS.items()
    )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[
            {
                "role": "user",
                "content": CUSTOM_WIDGET_PROMPT.format(
                    sources=sources_desc, numeric=numeric_desc, prompt=body.prompt[:500]
                ),
            }
        ],
    )
    raw = message.content[0].text if message.content else "{}"
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        parsed = json.loads(raw)
        spec = CustomWidgetSpec(**parsed["spec"])
        title = (parsed.get("title") or body.prompt[:60]).strip()
        validate_spec(spec)
    except (json.JSONDecodeError, KeyError, ValidationError, SpecValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Couldn't turn that into a widget: {e}")

    rows = await db_post(
        "custom_widgets", {"user_id": current_user.id, "title": title, "spec": spec.model_dump()}
    )
    return CustomWidgetOut(id=rows[0]["id"], title=title, spec=spec)


@router.delete("/custom-widgets/{widget_id}")
async def delete_custom_widget(widget_id: str, current_user: CurrentUser = Depends(get_current_user)):
    existing = await db_get("custom_widgets", f"?id=eq.{widget_id}&user_id=eq.{current_user.id}&select=id")
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    await db_delete("custom_widgets", widget_id)
    return {"ok": True}
