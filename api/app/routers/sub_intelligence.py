import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.sub_intelligence import (
    ChangeOrderTypeBreakdown,
    ProjectPerformance,
    ScorecardItem,
    SpendCategory,
    SubcontractorCompliance,
    SubIntelligenceSummary,
)
from ..supabase_client import db_get

router = APIRouter(prefix="/sub-intelligence", tags=["sub-intelligence"])

CO_TYPES = [
    ("oversight", "Oversight (your misses)"),
    ("client_addition", "Client additions"),
    ("unforeseen", "Unforeseen conditions"),
]

PROJECT_PERFORMANCE_STATUSES = {"active", "complete", "punch_list"}


@router.get("", response_model=SubIntelligenceSummary)
async def get_sub_intelligence(_: CurrentUser = Depends(get_current_user)):
    subs, transactions, change_orders, projects = await asyncio.gather(
        db_get("subcontractors", "?order=company_name.asc"),
        db_get("transactions", "?select=amount,transaction_type,cost_codes(code)"),
        db_get("change_orders", "?select=id,co_type,owner_price,status,project_id"),
        db_get("projects", "?is_archived=eq.false&select=id,name,contract_value,status"),
    )

    total_contract_value = sum(p.get("contract_value") or 0 for p in projects)
    total_expense = sum(abs(t.get("amount") or 0) for t in transactions if t.get("transaction_type") == "expense")
    total_income = sum(abs(t.get("amount") or 0) for t in transactions if t.get("transaction_type") == "income")
    avg_project_value = total_contract_value / len(projects) if projects else 0
    overall_margin = round((total_income - total_expense) / total_income * 100) if total_income > 0 else 0

    co_total_value = sum(c.get("owner_price") or 0 for c in change_orders)
    approved_cos = [c for c in change_orders if c.get("status") == "approved"]
    co_approval_rate = round(len(approved_cos) / len(change_orders) * 100) if change_orders else 0

    co_breakdown = []
    oversight_count = 0
    for key, label in CO_TYPES:
        items = [c for c in change_orders if c.get("co_type") == key]
        if key == "oversight":
            oversight_count = len(items)
        total = sum(c.get("owner_price") or 0 for c in items)
        pct = round(len(items) / len(change_orders) * 100) if change_orders else 0
        co_breakdown.append(ChangeOrderTypeBreakdown(key=key, label=label, count=len(items), total=total, pct=pct))

    by_category: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for t in transactions:
        if t.get("transaction_type") != "expense":
            continue
        code_info = t.get("cost_codes")
        if not code_info or not code_info.get("code"):
            continue
        category = code_info["code"].split(".")[0]
        by_category[category]["total"] += abs(t.get("amount") or 0)
        by_category[category]["count"] += 1
    spend_by_category = sorted(
        (SpendCategory(code=code, total=v["total"], count=v["count"]) for code, v in by_category.items()),
        key=lambda c: c.total,
        reverse=True,
    )[:8]

    co_by_project: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for c in change_orders:
        pid = c.get("project_id")
        if not pid:
            continue
        co_by_project[pid]["total"] += c.get("owner_price") or 0
        co_by_project[pid]["count"] += 1

    project_performance = [
        ProjectPerformance(
            project_id=p["id"],
            project_name=(p.get("name") or "").split("|")[0].strip(),
            contract_value=p.get("contract_value") or 0,
            co_total=co_by_project[p["id"]]["total"],
            co_count=co_by_project[p["id"]]["count"],
            status=p.get("status") or "",
        )
        for p in projects
        if p.get("status") in PROJECT_PERFORMANCE_STATUSES
    ][:8]

    oversight_rate = oversight_count / len(change_orders) if change_orders else 0
    scorecard = [
        ScorecardItem(
            key="margin",
            label="Gross margin",
            value=f"{overall_margin}%",
            target="20–35%",
            status="good" if overall_margin >= 20 else "warn" if overall_margin >= 10 else "bad",
        ),
        ScorecardItem(
            key="project_size",
            label="Avg project size",
            value=f"${avg_project_value:,.0f}",
            target=">$100K",
            status="good" if avg_project_value >= 100000 else "warn" if avg_project_value >= 50000 else "bad",
        ),
        ScorecardItem(
            key="co_approval",
            label="CO approval rate",
            value=f"{co_approval_rate}%",
            target=">80%",
            status="good" if co_approval_rate >= 80 else "warn" if co_approval_rate >= 60 else "bad",
        ),
        ScorecardItem(
            key="oversight_rate",
            label="Oversight CO rate",
            value=f"{round(oversight_rate * 100)}%",
            target="<20%",
            status="good" if oversight_rate < 0.2 else "warn" if oversight_rate < 0.35 else "bad",
        ),
    ]

    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=30)
    subcontractors = []
    for s in subs:
        exp = s.get("insurance_expiry")
        insurance_status = "none"
        if exp:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00")) if "T" in exp else datetime.fromisoformat(exp + "T00:00:00+00:00")
            if exp_dt < now:
                insurance_status = "expired"
            elif exp_dt < soon:
                insurance_status = "expiring"
            else:
                insurance_status = "ok"
        subcontractors.append(
            SubcontractorCompliance(
                id=s["id"],
                company_name=s["company_name"],
                trade=s.get("trade"),
                contact_name=s.get("contact_name"),
                phone=s.get("phone"),
                w9_on_file=s.get("w9_on_file") or False,
                insurance_expiry=exp,
                insurance_status=insurance_status,
                rating=s.get("rating"),
                preferred=s.get("preferred") or False,
            )
        )

    return SubIntelligenceSummary(
        avg_project_value=avg_project_value,
        project_count=len(projects),
        overall_margin=overall_margin,
        co_approval_rate=co_approval_rate,
        co_approved_count=len(approved_cos),
        co_total_count=len(change_orders),
        co_total_value=co_total_value,
        co_breakdown=co_breakdown,
        spend_by_category=spend_by_category,
        project_performance=project_performance,
        scorecard=scorecard,
        subcontractors=subcontractors,
    )
