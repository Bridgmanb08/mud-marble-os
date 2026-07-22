import urllib.parse
from datetime import datetime, timezone
from typing import Any, Optional

from .supabase_client import db_get, db_patch

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


async def create_task(
    current_user,
    title: str,
    project_name: Optional[str] = None,
    assigned_to: Optional[str] = None,
    scheduled_start: Optional[str] = None,
    scheduled_end: Optional[str] = None,
    priority: str = "normal",
    notes: Optional[str] = None,
    is_milestone: bool = False,
) -> dict:
    from .routers.tasks import create_task as _create_task
    from .schemas.tasks import TaskCreate

    project_id = None
    if project_name:
        ids = await _resolve_project_ids(project_name)
        if not ids:
            return {
                "error": f"No project matching '{project_name}' found. Use search_projects to confirm the "
                "exact name before retrying, or ask the user which job they mean."
            }
        project_id = ids[0]

    body = TaskCreate(
        title=title,
        project_id=project_id,
        assigned_to=assigned_to,
        assignees=[assigned_to] if assigned_to else [],
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        priority=priority,
        notes=notes,
        is_milestone=is_milestone,
    )
    created = await _create_task(body, current_user)
    return {"created": True, "task": created.model_dump()}


async def create_client(
    current_user,
    first_name: str,
    last_name: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    referral_name: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    from .routers.clients import create_client as _create_client
    from .schemas.clients import ClientCreate

    body = ClientCreate(
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        email=email,
        referral_name=referral_name,
        notes=notes,
    )
    created = await _create_client(body, current_user)
    return {"created": True, "client": created}


async def add_client_note(client_name: str, note: str) -> dict:
    needle = _q(client_name)
    rows = await db_get(
        "clients",
        f"?or=(first_name.ilike.*{needle}*,last_name.ilike.*{needle}*)&select=id,first_name,last_name,notes&limit=5",
    )
    if not rows:
        return {
            "error": f"No client matching '{client_name}' found. Use search_clients to confirm the exact "
            "name, or offer to create them as a new client first."
        }
    if len(rows) > 1:
        names = ", ".join(f"{r['first_name']} {r.get('last_name') or ''}".strip() for r in rows)
        return {"error": f"Multiple clients match '{client_name}': {names}. Ask which one before retrying."}

    client = rows[0]
    today = datetime.now(timezone.utc).date().isoformat()
    existing = (client.get("notes") or "").strip()
    combined = f"{existing}\n\n[{today}] {note}".strip() if existing else f"[{today}] {note}"
    updated = await db_patch("clients", client["id"], {"notes": combined})
    return {"updated": True, "client": updated[0]}


TOOLS: list[dict] = [
    {
        "name": "search_projects",
        "description": "Search construction projects by status, health status, or name/address substring. Returns name, status, contract value, location, and dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Exact status, e.g. lead, estimating, proposed, pre_construction, active, complete"},
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
    {
        "name": "create_task",
        "description": "Create a new task on the Task Board. This is ALSO how you create a calendar/schedule event -- "
        "the Schedule page is just tasks with scheduled_start/scheduled_end set, there is no separate calendar "
        "entity. Use search_projects first if you're not certain of the exact project name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short task title, e.g. 'Siding work' or 'Follow up with Carlos on permit'"},
                "project_name": {"type": "string", "description": "Substring of the project name to attach this to, if any"},
                "assigned_to": {"type": "string", "description": "Name of the person responsible, e.g. Shannon, Otto, Brent"},
                "scheduled_start": {"type": "string", "description": "ISO date (YYYY-MM-DD) this starts on"},
                "scheduled_end": {"type": "string", "description": "ISO date (YYYY-MM-DD) this is due/ends on"},
                "priority": {"type": "string", "description": "low, normal, high, or urgent (default normal)"},
                "notes": {"type": "string", "description": "Any additional detail"},
                "is_milestone": {"type": "boolean", "description": "Mark as a milestone on the schedule"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "create_client",
        "description": "Add a new person to the Client Directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "phone": {"type": "string"},
                "email": {"type": "string"},
                "referral_name": {"type": "string", "description": "Who referred them, if mentioned"},
                "notes": {"type": "string"},
            },
            "required": ["first_name"],
        },
    },
    {
        "name": "add_client_note",
        "description": "Append a dated note to an existing client's record in the Client Directory. Fails with an "
        "explanation if the name matches zero or more than one client -- use search_clients first if unsure.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_name": {"type": "string", "description": "First and/or last name of the existing client"},
                "note": {"type": "string", "description": "The note text to add"},
            },
            "required": ["client_name", "note"],
        },
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
    "add_client_note": add_client_note,
}

# Tools that need the caller's identity (they go through a real router
# endpoint, which expects a CurrentUser) -- everything else in _HANDLERS is a
# read-only search that doesn't care who's asking.
_USER_SCOPED_HANDLERS = {
    "get_dashboard_summary": get_dashboard_summary,
    "create_task": create_task,
    "create_client": create_client,
}


async def run_tool(name: str, tool_input: dict, current_user) -> Any:
    user_scoped = _USER_SCOPED_HANDLERS.get(name)
    if user_scoped:
        try:
            return await user_scoped(current_user, **tool_input)
        except TypeError as e:
            return {"error": f"invalid arguments: {e}"}
    handler = _HANDLERS.get(name)
    if not handler:
        return {"error": f"unknown tool '{name}'"}
    try:
        return await handler(**tool_input)
    except TypeError as e:
        return {"error": f"invalid arguments: {e}"}
