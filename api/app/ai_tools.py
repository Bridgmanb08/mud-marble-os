import urllib.parse
from datetime import datetime, timezone
from typing import Any, Optional

from .supabase_client import db_get

MAX_LIMIT = 50


def _q(value: Any) -> str:
    return urllib.parse.quote(str(value), safe="")


def _limit(n: Optional[int]) -> int:
    return max(1, min(int(n or 20), MAX_LIMIT))


async def _resolve_project_ids(name_contains: str) -> list[str]:
    rows = await db_get(
        "projects", f"?is_archived=eq.false&name=ilike.*{_q(name_contains)}*&select=id"
    )
    return [r["id"] for r in rows]


async def search_projects(
    status: Optional[str] = None,
    health_status: Optional[str] = None,
    name_contains: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    parts = ["is_archived=eq.false"]
    if status:
        parts.append(f"status=eq.{_q(status)}")
    if health_status:
        parts.append(f"health_status=eq.{_q(health_status)}")
    if name_contains:
        parts.append(f"name=ilike.*{_q(name_contains)}*")
    parts.append(f"limit={_limit(limit)}")
    parts.append(
        "select=id,name,status,health_status,contract_value,city,state,start_date,estimated_completion"
    )
    return await db_get("projects", "?" + "&".join(parts))


async def search_clients(
    name_contains: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = 20,
) -> list[dict]:
    parts = []
    if is_active is not None:
        parts.append(f"is_active=eq.{'true' if is_active else 'false'}")
    if name_contains:
        needle = _q(name_contains)
        parts.append(f"or=(first_name.ilike.*{needle}*,last_name.ilike.*{needle}*)")
    parts.append(f"limit={_limit(limit)}")
    parts.append(
        "select=id,first_name,last_name,email,phone,is_active,is_advocate,is_repeat_client,lifetime_value"
    )
    return await db_get("clients", "?" + "&".join(parts))


async def search_subcontractors(
    trade: Optional[str] = None,
    name_contains: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    parts = ["is_active=eq.true"]
    if trade:
        parts.append(f"trade=ilike.*{_q(trade)}*")
    if name_contains:
        parts.append(f"company_name=ilike.*{_q(name_contains)}*")
    parts.append(f"limit={_limit(limit)}")
    parts.append(
        "select=id,company_name,trade,contact_name,phone,email,rating,preferred,insurance_expiry"
    )
    return await db_get("subcontractors", "?" + "&".join(parts))


async def search_tasks(
    project_name: Optional[str] = None,
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = 20,
) -> list[dict]:
    parts = []
    if project_name:
        project_ids = await _resolve_project_ids(project_name)
        if not project_ids:
            return []
        parts.append(f"project_id=in.({','.join(project_ids)})")
    if assigned_to:
        parts.append(f"assigned_to=eq.{_q(assigned_to)}")
    if status:
        parts.append(f"status=eq.{_q(status)}")
    if overdue_only:
        today = datetime.now(timezone.utc).date().isoformat()
        parts.append(f"scheduled_end=lt.{today}")
        parts.append("status=neq.complete")
    parts.append("order=scheduled_end.asc")
    parts.append(f"limit={_limit(limit)}")
    parts.append("select=id,title,status,assigned_to,priority,scheduled_start,scheduled_end,projects(name)")
    return await db_get("schedule_items", "?" + "&".join(parts))


async def search_transactions(
    project_name: Optional[str] = None,
    vendor: Optional[str] = None,
    transaction_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    parts = []
    if project_name:
        project_ids = await _resolve_project_ids(project_name)
        if not project_ids:
            return []
        parts.append(f"project_id=in.({','.join(project_ids)})")
    if vendor:
        parts.append(f"vendor=ilike.*{_q(vendor)}*")
    if transaction_type:
        parts.append(f"transaction_type=eq.{_q(transaction_type)}")
    if date_from:
        parts.append(f"transaction_date=gte.{_q(date_from)}")
    if date_to:
        parts.append(f"transaction_date=lte.{_q(date_to)}")
    parts.append("order=transaction_date.desc")
    parts.append(f"limit={_limit(limit)}")
    parts.append("select=id,amount,vendor,transaction_type,transaction_date,payment_source,projects(name)")
    return await db_get("transactions", "?" + "&".join(parts))


async def search_invoices(
    project_name: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    parts = []
    if project_name:
        project_ids = await _resolve_project_ids(project_name)
        if not project_ids:
            return []
        parts.append(f"project_id=in.({','.join(project_ids)})")
    if status:
        parts.append(f"status=eq.{_q(status)}")
    parts.append("order=due_date.asc")
    parts.append(f"limit={_limit(limit)}")
    parts.append("select=id,invoice_number,invoice_type,amount_due,amount_paid,due_date,status,projects(name)")
    return await db_get("invoices", "?" + "&".join(parts))


async def search_change_orders(
    project_name: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    parts = []
    if project_name:
        project_ids = await _resolve_project_ids(project_name)
        if not project_ids:
            return []
        parts.append(f"project_id=in.({','.join(project_ids)})")
    if status:
        parts.append(f"status=eq.{_q(status)}")
    parts.append("order=created_at.desc")
    parts.append(f"limit={_limit(limit)}")
    parts.append("select=id,co_number,title,co_type,owner_price,builder_cost,status,created_at,projects(name)")
    return await db_get("change_orders", "?" + "&".join(parts))


async def get_dashboard_summary(current_user) -> dict:
    from .routers.dashboard import get_dashboard

    summary = await get_dashboard(current_user)
    return summary.model_dump()


TOOLS: list[dict] = [
    {
        "name": "search_projects",
        "description": "Search construction projects by status, health status, or name/address substring. Returns name, status, contract value, location, and dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Exact status, e.g. lead, estimating, proposed, active, complete"},
                "health_status": {"type": "string", "description": "green, yellow, or red"},
                "name_contains": {"type": "string", "description": "Case-insensitive substring of project name or address"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_clients",
        "description": "Search the client roster by name substring or active status. Returns contact info, advocate/repeat flags, lifetime value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name_contains": {"type": "string", "description": "Substring of first or last name"},
                "is_active": {"type": "boolean"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_subcontractors",
        "description": "Search active subcontractors by trade or company name substring. Returns contact info, rating, insurance expiry.",
        "input_schema": {
            "type": "object",
            "properties": {
                "trade": {"type": "string", "description": "Substring of trade, e.g. electrical, plumbing"},
                "name_contains": {"type": "string", "description": "Substring of company name"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_tasks",
        "description": "Search the task board (schedule items) by project, assignee, status, or overdue-only. Returns title, status, assignee, priority, and dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string", "description": "Substring of the project name to scope tasks to"},
                "assigned_to": {"type": "string"},
                "status": {"type": "string", "description": "e.g. upcoming, in_progress, complete"},
                "overdue_only": {"type": "boolean", "description": "Only tasks past scheduled_end and not complete"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_transactions",
        "description": "Search the in-house transaction ledger by project, vendor, type, or date range. Returns amount, vendor, type, date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string", "description": "Substring of the project name to scope to"},
                "vendor": {"type": "string", "description": "Substring of vendor name"},
                "transaction_type": {"type": "string", "description": "e.g. income, expense"},
                "date_from": {"type": "string", "description": "ISO date, inclusive lower bound on transaction_date"},
                "date_to": {"type": "string", "description": "ISO date, inclusive upper bound on transaction_date"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_invoices",
        "description": "Search client invoices by project or status. Returns invoice number, amount due/paid, due date, status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string", "description": "Substring of the project name to scope to"},
                "status": {"type": "string", "description": "e.g. draft, sent, paid, overdue, void"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "search_change_orders",
        "description": "Search change orders by project or status. Returns CO number, title, owner price, builder cost, status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string", "description": "Substring of the project name to scope to"},
                "status": {"type": "string", "description": "e.g. pending, sent, approved, rejected"},
                "limit": {"type": "integer", "description": "Max rows (default 20, max 50)"},
            },
        },
    },
    {
        "name": "get_dashboard_summary",
        "description": "Get the company-wide CFO/owner dashboard snapshot: active project count, total contract value, collected/outstanding AR, open change orders, AR aging buckets, project profitability, cash position. Takes no arguments -- use this for high-level 'how are we doing' questions before drilling into individual searches.",
        "input_schema": {"type": "object", "properties": {}},
    },
]

_HANDLERS = {
    "search_projects": search_projects,
    "search_clients": search_clients,
    "search_subcontractors": search_subcontractors,
    "search_tasks": search_tasks,
    "search_transactions": search_transactions,
    "search_invoices": search_invoices,
    "search_change_orders": search_change_orders,
}


async def run_tool(name: str, tool_input: dict, current_user) -> Any:
    if name == "get_dashboard_summary":
        return await get_dashboard_summary(current_user)
    handler = _HANDLERS.get(name)
    if not handler:
        return {"error": f"unknown tool '{name}'"}
    try:
        return await handler(**tool_input)
    except TypeError as e:
        return {"error": f"invalid arguments: {e}"}
