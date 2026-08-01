import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..ai_provider import ProviderError, TeamMemberBrief, summarize_team_workload
from ..change_order_utils import compute_sop_breach
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
    ChangeOrderStats,
    ClientCommunicationEntry,
    ContractorMilestone,
    DashboardSummary,
    DesignProjectCard,
    EstimateWinRate,
    JobsOverdueToClose,
    LeadPipeline,
    LeadPipelineStage,
    OverdueJobEntry,
    ProjectProfitability,
    QBOSyncStatus,
    SubcontractorRisk,
    TeamWorkloadEntry,
    TeamWorkloadInsightsResponse,
    UpcomingTask,
    WorkloadTaskBrief,
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
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


_PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}


def _match_user(raw_name: Optional[str], users: list[dict]) -> Optional[dict]:
    """Match a task's free-text assignee to a real app_users row by first name
    (case-insensitive). Tasks created via the UI use short first names
    ("shannon") while AI-imported tasks sometimes carry a full name as it
    appeared in a transcript ("Shannon Ingram") -- without this, the same
    real person shows up as two separate people in team-workload views."""
    if not raw_name or not raw_name.strip():
        return None
    first = raw_name.strip().split()[0].lower()
    for u in users:
        u_name = u.get("name") or ""
        if u_name.strip() and u_name.strip().split()[0].lower() == first:
            return u
    return None


def _build_team_workload(schedule_items: list[dict], users: list[dict], now: datetime) -> list[TeamWorkloadEntry]:
    week_start = now - timedelta(days=7)
    buckets: dict[str, dict] = {}

    def bucket_for(raw_name: str) -> dict:
        matched = _match_user(raw_name, users)
        key = matched["id"] if matched else raw_name
        if key not in buckets:
            buckets[key] = {
                "name": matched["name"].split()[0] if matched else raw_name,
                "user_id": matched["id"] if matched else None,
                "incomplete": 0,
                "completed_week": 0,
                "overdue": 0,
                "tasks": [],
            }
        return buckets[key]

    for t in schedule_items:
        names = t.get("assignees") or ([t["assigned_to"]] if t.get("assigned_to") else [])
        if not names:
            names = ["Unassigned"]
        status = t.get("status")
        end = _parse_dt(t.get("scheduled_end"))
        is_overdue = status != "complete" and end is not None and end < now
        completed_at = _parse_dt(t.get("completed_at"))
        completed_this_week = status == "complete" and completed_at is not None and completed_at >= week_start
        for name in names:
            b = bucket_for(name)
            if status != "complete":
                b["incomplete"] += 1
                if is_overdue:
                    b["overdue"] += 1
                b["tasks"].append(
                    {
                        "id": t["id"],
                        "title": t["title"],
                        "priority": t.get("priority") or "normal",
                        "project_name": (t.get("projects") or {}).get("name"),
                        "due_date": t.get("scheduled_end"),
                    }
                )
            if completed_this_week:
                b["completed_week"] += 1

    entries: list[TeamWorkloadEntry] = []
    for v in buckets.values():
        if not (v["incomplete"] or v["completed_week"]):
            continue
        top = sorted(
            v["tasks"],
            key=lambda x: (_PRIORITY_RANK.get(x["priority"], 2), x["due_date"] or "9999-99-99"),
        )[:4]
        entries.append(
            TeamWorkloadEntry(
                user_id=v["user_id"],
                name=v["name"],
                incomplete_count=v["incomplete"],
                completed_this_week=v["completed_week"],
                overdue_count=v["overdue"],
                top_tasks=[WorkloadTaskBrief(**tk) for tk in top],
            )
        )
    entries.sort(key=lambda e: e.incomplete_count, reverse=True)
    return entries


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
        leads,
        subcontractors,
        users,
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
        db_get(
            "estimates",
            "?select=project_id,version,status,grand_total_owner_price,construction_total_owner_price,"
            "allowance_total,pm_fee_total&order=version.desc",
        ),
        db_get("leads", "?select=status,estimated_revenue_min,estimated_revenue_max"),
        db_get("subcontractors", "?select=is_active,insurance_expiry,w9_on_file"),
        db_get("app_users", "?select=id,name&order=name.asc"),
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
    # Manually-prioritized tasks (dragged to the top in the widget itself) win first,
    # in the order the user put them in; everything else falls back to due-date order.
    incomplete_tasks.sort(
        key=lambda t: (
            t["manual_position"] if t.get("manual_position") is not None else float("inf"),
            t.get("scheduled_end") or "",
        )
    )

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
                sop_breach=compute_sop_breach(co.get("status"), co.get("sent_at"), now),
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
    latest_estimate_full_by_project: dict[str, dict] = {}
    for e in estimates:
        pid = e.get("project_id")
        if pid and pid not in latest_estimate_by_project:
            latest_estimate_by_project[pid] = e.get("grand_total_owner_price") or 0
            latest_estimate_full_by_project[pid] = e

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

    # -- team workload: incomplete/completed-this-week/overdue + top tasks per
    # real team member (see _build_team_workload for the name-matching that
    # merges "shannon" and "Shannon Ingram" into one person) --
    team_workload = _build_team_workload(schedule_items, users, now)

    # -- jobs overdue to close: active/punch_list projects past their estimated
    # completion date, with the potential revenue still tied up in them --
    overdue_jobs = []
    jobs_total_revenue = 0.0
    jobs_construction_total = 0.0
    jobs_allowance_total = 0.0
    jobs_pm_fee_total = 0.0
    for p in projects:
        if p.get("status") not in ("active", "punch_list"):
            continue
        end = _parse_dt(p.get("estimated_completion"))
        if not end or end >= now:
            continue
        est = latest_estimate_full_by_project.get(p["id"]) or {}
        revenue = est.get("grand_total_owner_price") or 0
        overdue_jobs.append(
            OverdueJobEntry(
                project_id=p["id"],
                project_name=p["name"],
                status=p["status"],
                estimated_completion=p.get("estimated_completion"),
                days_overdue=(now - end).days,
                potential_revenue=revenue,
            )
        )
        jobs_total_revenue += revenue
        jobs_construction_total += est.get("construction_total_owner_price") or 0
        jobs_allowance_total += est.get("allowance_total") or 0
        jobs_pm_fee_total += est.get("pm_fee_total") or 0
    overdue_jobs.sort(key=lambda j: j.days_overdue, reverse=True)
    jobs_overdue_to_close = JobsOverdueToClose(
        jobs=overdue_jobs,
        total_potential_revenue=jobs_total_revenue,
        construction_total=jobs_construction_total,
        allowance_total=jobs_allowance_total,
        pm_fee_total=jobs_pm_fee_total,
    )

    # -- lead pipeline: open leads by stage + revenue potential --
    OPEN_LEAD_STATUSES = ("new", "contacted", "qualified")
    lead_stage_totals: dict[str, list] = defaultdict(lambda: [0, 0.0, 0.0])
    for lead in leads:
        status = lead.get("status") or "new"
        lead_stage_totals[status][0] += 1
        lead_stage_totals[status][1] += lead.get("estimated_revenue_min") or 0
        lead_stage_totals[status][2] += lead.get("estimated_revenue_max") or 0
    lead_stages = [
        LeadPipelineStage(status=s, count=v[0], potential_revenue_min=v[1], potential_revenue_max=v[2])
        for s, v in lead_stage_totals.items()
    ]
    lead_stages.sort(key=lambda s: s.count, reverse=True)
    lead_pipeline = LeadPipeline(
        stages=lead_stages,
        total_open_count=sum(v[0] for s, v in lead_stage_totals.items() if s in OPEN_LEAD_STATUSES),
        total_potential_revenue_min=sum(v[1] for s, v in lead_stage_totals.items() if s in OPEN_LEAD_STATUSES),
        total_potential_revenue_max=sum(v[2] for s, v in lead_stage_totals.items() if s in OPEN_LEAD_STATUSES),
    )

    # -- subcontractor risk: compliance gaps across the active roster --
    active_subs = [s for s in subcontractors if s.get("is_active", True)]
    thirty_days = now + timedelta(days=30)
    subcontractor_risk = SubcontractorRisk(
        total_active=len(active_subs),
        missing_w9=len([s for s in active_subs if not s.get("w9_on_file")]),
        insurance_expired=len(
            [s for s in active_subs if (d := _parse_dt(s.get("insurance_expiry"))) and d < now]
        ),
        insurance_expiring_soon=len(
            [s for s in active_subs if (d := _parse_dt(s.get("insurance_expiry"))) and now <= d < thirty_days]
        ),
    )

    # -- change order win rate + revenue impact --
    co_approved = [c for c in change_orders if c.get("status") == "approved"]
    co_rejected = [c for c in change_orders if c.get("status") == "rejected"]
    co_pending = [c for c in change_orders if c.get("status") in ("pending", "sent")]
    co_decided = len(co_approved) + len(co_rejected)
    change_order_stats = ChangeOrderStats(
        approved_count=len(co_approved),
        rejected_count=len(co_rejected),
        pending_count=len(co_pending),
        win_rate_pct=round(len(co_approved) / co_decided * 100) if co_decided else 0,
        approved_revenue_total=sum(c.get("owner_price") or 0 for c in co_approved),
    )

    # -- estimate win rate + open pipeline value --
    # Use only the latest version per project: duplicate_estimate() never changes
    # an old version's status, so a rejected v1 followed by an approved v2 (the
    # normal "client rejected, we revised, they approved" flow) would otherwise
    # count as both a loss and a win for the same project.
    latest_estimates = list(latest_estimate_full_by_project.values())
    est_approved = [e for e in latest_estimates if e.get("status") == "approved"]
    est_rejected = [e for e in latest_estimates if e.get("status") == "rejected"]
    est_sent = [e for e in latest_estimates if e.get("status") != "draft"]
    est_decided = len(est_approved) + len(est_rejected)
    estimate_win_rate = EstimateWinRate(
        sent_count=len(est_sent),
        approved_count=len(est_approved),
        rejected_count=len(est_rejected),
        win_rate_pct=round(len(est_approved) / est_decided * 100) if est_decided else 0,
        pipeline_value=sum(
            e.get("grand_total_owner_price") or 0 for e in latest_estimates if e.get("status") == "sent_to_client"
        ),
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
        team_workload=team_workload,
        jobs_overdue_to_close=jobs_overdue_to_close,
        lead_pipeline=lead_pipeline,
        subcontractor_risk=subcontractor_risk,
        change_order_stats=change_order_stats,
        estimate_win_rate=estimate_win_rate,
    )


@router.post("/team-workload-insights", response_model=TeamWorkloadInsightsResponse)
async def get_team_workload_insights(_: CurrentUser = Depends(get_current_user)):
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")

    now = datetime.now(timezone.utc)
    schedule_items, users, pulse_checkins = await asyncio.gather(
        db_get("schedule_items", "?order=scheduled_end.asc&select=*,projects(name)"),
        db_get("app_users", "?select=id,name&order=name.asc"),
        db_get(
            "pulse_checkins",
            "?order=created_at.desc&limit=200&select=user_id,workload_rating,feeling_stuck",
        ),
    )
    entries = _build_team_workload(schedule_items, users, now)
    if not entries:
        return TeamWorkloadInsightsResponse(summaries={})

    # Most recent check-in per user -- pulse_checkins is already sorted
    # newest-first, so the first one seen per user_id wins.
    latest_pulse_by_user: dict = {}
    for c in pulse_checkins:
        uid = c.get("user_id")
        if uid and uid not in latest_pulse_by_user:
            latest_pulse_by_user[uid] = c

    members = [
        TeamMemberBrief(
            name=e.name,
            incomplete_count=e.incomplete_count,
            completed_this_week=e.completed_this_week,
            overdue_count=e.overdue_count,
            top_task_titles=[t.title for t in e.top_tasks],
            pulse_workload_rating=(latest_pulse_by_user.get(e.user_id) or {}).get("workload_rating") if e.user_id else None,
            pulse_feeling_stuck=bool((latest_pulse_by_user.get(e.user_id) or {}).get("feeling_stuck")) if e.user_id else False,
        )
        for e in entries
    ]
    try:
        summaries = await summarize_team_workload(members)
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return TeamWorkloadInsightsResponse(summaries=summaries)


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
