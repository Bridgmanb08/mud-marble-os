"""
Tool catalog + handlers for the Estimating Copilot's conversational chat --
the estimate-scoped counterpart to ai_tools.py's general-assistant tools.
Mirrors that file's shape exactly (a TOOLS list + handler functions + a
run_*_tool dispatcher) but every handler is bound to one specific estimate_id,
since this assistant only ever acts on the estimate the user has open.

Handlers call the real router functions directly (same reuse convention as
ai_tools.py's create_task/create_client) rather than duplicating insert
logic -- add_line_item goes through the exact same create_line_item that
powers the worksheet's own "Add line item" button, so builder_cost/
owner_price/estimate totals stay correct with zero duplicated math.
"""
import asyncio
import statistics
from typing import Any, Optional

from pydantic import ValidationError

from . import ai_tools
from .supabase_client import db_get, db_patch

# A short, hand-maintained set of common complementary-scope pairs -- the
# domain knowledge the old Socratic gap-checker used, carried over verbatim
# so the conversational assistant doesn't lose what the button-based version
# already knew, just applies it in conversation instead of a canned tree.
DEPENDENCY_EXAMPLES = """Common complementary-scope pairs to watch for (not exhaustive -- use your own
construction knowledge too, but calibrate to examples like these):
- Drywall installed -> paint/finishes usually follow
- Tile -> waterproofing membrane and backer board are usually separate line items
- Framing -> insulation before drywall
- Electrical rough-in -> electrical trim-out/fixtures later
- Plumbing rough-in -> plumbing trim-out/fixtures later
- Exterior siding -> trim and flashing
- Roofing -> gutters
- Demo -> dumpster/debris haul-off"""


async def _approved_change_orders_with_items(project_id: str) -> list[dict]:
    """Every APPROVED change order on this project, with its line items --
    change order items live in the same estimate_line_items table as the
    estimate's own (change_order_id set instead of estimate_id), so this is
    one more query against a table the assistant already reads. Unapproved
    change orders aren't included -- they aren't agreed scope yet, and
    surfacing them here could read as though they already are."""
    cos = await db_get(
        "change_orders", f"?project_id=eq.{project_id}&status=eq.approved&order=co_number.asc&select=id,co_number,title"
    )
    if not cos:
        return []
    co_by_id = {c["id"]: {**c, "items": []} for c in cos}
    items = await db_get(
        "estimate_line_items",
        f"?change_order_id=in.({','.join(co_by_id)})&order=sort_order.asc&select=id,change_order_id,title,owner_price,cost_codes(code,name)",
    )
    for i in items:
        co_by_id[i["change_order_id"]]["items"].append(i)
    return list(co_by_id.values())


async def current_estimate_context(estimate_id: str) -> dict:
    """Everything the system prompt needs to ground this specific
    conversation: the estimate's own line items (so the assistant can
    reference existing groups/items by id without a search round-trip), the
    active cost-code catalog, and the project's approved change orders (so
    the assistant doesn't propose scope that's already been added as a
    change order, or contradict what's already been agreed to beyond the
    base estimate). Fetched fresh every chat turn, not cached -- the whole
    point is this reflects what's actually there right now, including edits
    made earlier in the same conversation."""
    estimates = await db_get("estimates", f"?id=eq.{estimate_id}&select=project_id")
    project_id = estimates[0]["project_id"] if estimates else None

    items, cost_codes, change_orders = await asyncio.gather(
        db_get(
            "estimate_line_items",
            f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=id,title,group_name,bucket,quantity,unit,unit_cost,unit_cost_labor,unit_cost_material,builder_cost,markup_type,markup_value,owner_price,cost_codes(id,code,name)",
        ),
        db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200&select=id,code,name"),
        _approved_change_orders_with_items(project_id) if project_id else _noop_list(),
    )
    return {"items": items, "cost_codes": cost_codes, "change_orders": change_orders}


async def _noop_list() -> list[dict]:
    return []


def _money(n) -> str:
    return f"${(n or 0):,.2f}"


def _margin_pct(builder, price) -> str:
    if not price:
        return "n/a"
    return f"{(price - (builder or 0)) / price * 100:.0f}%"


MARKUP_LABEL = {"percent": "% markup", "flat": "flat $ profit (once)", "per_unit": "$ profit per unit"}


def format_line_items(items: list[dict]) -> str:
    if not items:
        return "(no line items yet -- this estimate is empty)"
    lines = []
    for i in items:
        cc = i.get("cost_codes") or {}
        cc_label = f"{cc['code']} - {cc['name']}" if cc else "no cost code"
        split = ""
        if i.get("unit_cost_labor") is not None or i.get("unit_cost_material") is not None:
            split = f" (labor {_money(i.get('unit_cost_labor'))} + material {_money(i.get('unit_cost_material'))})"
        unit = f" {i['unit']}" if i.get("unit") else ""
        markup_type = i.get("markup_type") or "percent"
        lines.append(
            f"- id={i['id']} | \"{i['title']}\" | group: {i.get('group_name') or '—'} | bucket: {i['bucket']} | "
            f"qty {i['quantity']}{unit} @ {_money(i['unit_cost'])} cost{split} = {_money(i.get('builder_cost'))} builder cost | "
            f"markup: {i.get('markup_value') or 0} ({MARKUP_LABEL.get(markup_type, markup_type)}) | "
            f"{_money(i['owner_price'])} client price, {_margin_pct(i.get('builder_cost'), i['owner_price'])} margin | {cc_label}"
        )
    return "\n".join(lines)


def format_cost_codes(cost_codes: list[dict]) -> str:
    if not cost_codes:
        return "(no active cost codes yet)"
    return "\n".join(f"- {c['id']}: {c['code']} - {c['name']}" for c in cost_codes)


def format_change_orders(change_orders: list[dict]) -> str:
    if not change_orders:
        return "(no approved change orders on this project)"
    lines = []
    for co in change_orders:
        label = f"CO-{str(co.get('co_number') or '?').zfill(3)}: {co['title']}"
        if not co["items"]:
            lines.append(f"- {label} (flat price, no line-item breakdown)")
            continue
        lines.append(f"- {label}:")
        for i in co["items"]:
            cc = i.get("cost_codes") or {}
            cc_label = f"{cc['code']} - {cc['name']}" if cc else "no cost code"
            lines.append(f"    - \"{i['title']}\" | \${i['owner_price']} client price | {cc_label}")
    return "\n".join(lines)


async def _tool_add_line_item(estimate_id: str, **kwargs) -> dict:
    from .routers.estimates import create_line_item
    from .schemas.estimates import LineItemCreate

    try:
        body = LineItemCreate(**kwargs)
    except ValidationError as e:
        return {"error": f"invalid line item: {e}"}
    # create_line_item returns a plain dict when called directly (it's
    # built from db_get/db_post rows, not constructed as a LineItemOut
    # instance in its own body) -- response_model coercion only happens at
    # the HTTP layer, which this direct call bypasses.
    created = await create_line_item(estimate_id, body, None)
    return {"added": True, "item": created}


async def _tool_update_line_item(estimate_id: str, item_id: str, **kwargs) -> dict:
    from fastapi import HTTPException

    from .routers.estimates import update_line_item
    from .schemas.estimates import LineItemUpdate

    try:
        body = LineItemUpdate(**kwargs)
    except ValidationError as e:
        return {"error": f"invalid update: {e}"}
    try:
        updated = await update_line_item(estimate_id, item_id, body, None)
    except HTTPException as e:
        return {"error": e.detail}
    # Same plain-dict reasoning as add_line_item above.
    return {"updated": True, "item": updated}


async def _tool_remove_line_item(estimate_id: str, item_id: str) -> dict:
    from .routers.estimates import delete_line_item

    await delete_line_item(estimate_id, item_id, None)
    return {"removed": True, "item_id": item_id}


async def _tool_search_reference_line_items(estimate_id: str, query: str) -> dict:
    from .routers.estimates import search_line_items

    results = await search_line_items(cost_code_id=None, q=query, exclude_estimate_id=estimate_id, _=None)
    return {"results": [r.model_dump() for r in results[:10]]}


_UPDATABLE_FIELDS = (
    "title",
    "group_name",
    "bucket",
    "quantity",
    "unit",
    "unit_cost",
    "unit_cost_labor",
    "unit_cost_material",
    "cost_type",
    "markup_type",
    "markup_value",
    "cost_code_id",
    "estimated_days",
    "notes_external",
    "notes_internal",
)
_MAX_BULK_ITEMS = 60


def _brief(item: dict) -> dict:
    return {"id": item.get("id"), "title": item.get("title"), "client_price": item.get("owner_price")}


async def _tool_add_line_items(estimate_id: str, items: Optional[list] = None, **_ignored) -> dict:
    """Adds many line items in one tool call -- a pasted transcript or scope
    list can mean dozens, and one call per item runs out of tool rounds."""
    from fastapi import HTTPException

    from .routers.estimates import create_line_item
    from .schemas.estimates import LineItemCreate

    if not items:
        return {"error": "items is empty"}
    added, errors = [], []
    for raw in items[:_MAX_BULK_ITEMS]:
        try:
            body = LineItemCreate(**raw)
        except (ValidationError, TypeError) as e:
            errors.append({"title": (raw or {}).get("title") if isinstance(raw, dict) else None, "error": str(e)[:200]})
            continue
        try:
            created = await create_line_item(estimate_id, body, None)
            added.append(_brief(created))
        except HTTPException as e:
            errors.append({"title": body.title, "error": e.detail})
    result: dict = {"added": added, "added_count": len(added)}
    if errors:
        result["errors"] = errors
    if len(items) > _MAX_BULK_ITEMS:
        result["note"] = f"Only the first {_MAX_BULK_ITEMS} items were added -- send the rest in another call."
    return result


async def _tool_update_line_items(
    estimate_id: str,
    changes: Optional[dict] = None,
    item_ids: Optional[list] = None,
    group_name: Optional[str] = None,
    bucket: Optional[str] = None,
    **_ignored,
) -> dict:
    """Applies the same edit to many line items -- every item in a group or
    bucket, or an explicit list -- e.g. "set every construction item to 25%
    markup" or "move these into the Exterior group"."""
    from fastapi import HTTPException

    from .routers.estimates import update_line_item
    from .schemas.estimates import LineItemUpdate

    changes = {k: v for k, v in (changes or {}).items() if k in _UPDATABLE_FIELDS}
    if not changes:
        return {"error": "changes is empty -- say which fields to set"}
    try:
        body = LineItemUpdate(**changes)
    except ValidationError as e:
        return {"error": f"invalid changes: {str(e)[:300]}"}

    targets = list(item_ids or [])
    if not targets:
        if not group_name and not bucket:
            return {"error": "give item_ids, or a group_name / bucket to select by"}
        query = f"?estimate_id=eq.{estimate_id}&select=id"
        if group_name:
            query += f"&group_name=eq.{group_name}"
        if bucket:
            query += f"&bucket=eq.{bucket}"
        targets = [r["id"] for r in await db_get("estimate_line_items", query)]
    if not targets:
        return {"error": "no line items matched"}

    updated, errors = [], []
    for item_id in targets[:200]:
        try:
            updated.append(_brief(await update_line_item(estimate_id, item_id, body, None)))
        except HTTPException as e:
            errors.append({"id": item_id, "error": e.detail})
    result: dict = {"updated_count": len(updated), "updated": updated[:25]}
    if errors:
        result["errors"] = errors
    return result


async def _tool_get_estimate_summary(estimate_id: str, **_ignored) -> dict:
    """Totals the assistant would otherwise have to add up in its head:
    builder cost, client price, profit and margin overall, by bucket, and by
    group."""
    rows = await db_get(
        "estimate_line_items", f"?estimate_id=eq.{estimate_id}&select=title,group_name,bucket,builder_cost,owner_price"
    )

    def roll(subset: list[dict]) -> dict:
        builder = round(sum(r.get("builder_cost") or 0 for r in subset), 2)
        price = round(sum(r.get("owner_price") or 0 for r in subset), 2)
        return {
            "items": len(subset),
            "builder_cost": builder,
            "client_price": price,
            "profit": round(price - builder, 2),
            "margin_pct": round((price - builder) / price * 100, 1) if price else None,
        }

    by_bucket: dict[str, list[dict]] = {}
    by_group: dict[str, list[dict]] = {}
    for r in rows:
        by_bucket.setdefault(r.get("bucket") or "construction", []).append(r)
        by_group.setdefault(r.get("group_name") or "(no group)", []).append(r)
    thin = sorted(
        (r for r in rows if r.get("owner_price")),
        key=lambda r: (r["owner_price"] - (r.get("builder_cost") or 0)) / r["owner_price"],
    )[:5]
    return {
        "overall": roll(rows),
        "by_bucket": {k: roll(v) for k, v in by_bucket.items()},
        "by_group": {k: roll(v) for k, v in by_group.items()},
        "thinnest_margin_items": [
            {"title": r["title"], "margin_pct": round((r["owner_price"] - (r.get("builder_cost") or 0)) / r["owner_price"] * 100, 1)}
            for r in thin
        ],
    }


async def _tool_get_project_context(estimate_id: str, **_ignored) -> dict:
    """What the estimate is FOR: the project's details and the other versions
    of this estimate, so pricing and scope get judged against the actual job."""
    estimates = await db_get("estimates", f"?id=eq.{estimate_id}&select=project_id,version,status,title,notes_internal")
    if not estimates:
        return {"error": "estimate not found"}
    est = estimates[0]
    projects, versions, cos = await asyncio.gather(
        db_get("projects", f"?id=eq.{est['project_id']}&select=*"),
        db_get(
            "estimates",
            f"?project_id=eq.{est['project_id']}&is_archived=eq.false&order=version.asc&select=version,status,grand_total_owner_price",
        ),
        db_get("change_orders", f"?project_id=eq.{est['project_id']}&select=co_number,title,status,owner_price"),
    )
    project = projects[0] if projects else {}
    keep = ("name", "address", "status", "start_date", "estimated_completion", "contract_value", "description", "notes")
    return {
        "project": {k: project.get(k) for k in keep if project.get(k) is not None},
        "this_estimate": {k: est.get(k) for k in ("version", "status", "title", "notes_internal") if est.get(k) is not None},
        "all_versions": versions,
        "change_orders": cos,
    }


async def _tool_get_cost_code_pricing(
    estimate_id: str, cost_code_id: Optional[str] = None, query: Optional[str] = None, **_ignored
) -> dict:
    """What a cost code (or keyword) has actually cost and been marked up to
    across every other estimate -- min / median / max by unit, typical
    margin, and the most recent examples. Includes closed jobs: those are the
    best evidence of real pricing."""
    if not cost_code_id and not query:
        return {"error": "give a cost_code_id or a query"}
    q = (
        "?estimate_id=not.is.null&select=title,quantity,unit,unit_cost,builder_cost,owner_price,markup_type,markup_value,"
        "estimate_id,estimates(created_at,version,is_archived,projects(name,status))"
    )
    if cost_code_id:
        q += f"&cost_code_id=eq.{cost_code_id}"
    if query:
        esc = query.replace(",", "").replace("(", "").replace(")", "")
        q += f"&or=(title.ilike.*{esc}*,description.ilike.*{esc}*)"
    rows = await db_get("estimate_line_items", q)
    usable = []
    for r in rows:
        est = r.get("estimates") or {}
        if r["estimate_id"] == estimate_id or est.get("is_archived"):
            continue
        if not r.get("unit_cost") or not r.get("quantity"):
            continue  # placeholder rows with no real cost tell nothing
        usable.append({**r, "_est": est})
    if not usable:
        return {"samples": 0, "note": "No comparable priced line items on other estimates."}
    usable.sort(key=lambda r: r["_est"].get("created_at") or "", reverse=True)

    by_unit: dict[str, list[dict]] = {}
    for r in usable:
        by_unit.setdefault((r.get("unit") or "unit").strip().lower(), []).append(r)
    stats = {}
    for unit, group in sorted(by_unit.items(), key=lambda kv: -len(kv[1]))[:3]:
        costs = [g["unit_cost"] for g in group]
        client = [g["owner_price"] / g["quantity"] for g in group if g["owner_price"]]
        margins = [(g["owner_price"] - g["builder_cost"]) / g["owner_price"] * 100 for g in group if g["owner_price"]]
        stats[unit] = {
            "samples": len(group),
            "builder_unit_cost": {"min": min(costs), "median": round(statistics.median(costs), 2), "max": max(costs)},
            "client_unit_price_median": round(statistics.median(client), 2) if client else None,
            "median_margin_pct": round(statistics.median(margins), 1) if margins else None,
        }
    return {
        "samples": len(usable),
        "by_unit": stats,
        "recent_examples": [
            {
                "project": ((r["_est"].get("projects") or {}).get("name") or "").split("|")[0].strip(),
                "project_status": (r["_est"].get("projects") or {}).get("status"),
                "title": r["title"],
                "qty": r["quantity"],
                "unit": r.get("unit"),
                "builder_unit_cost": r["unit_cost"],
                "client_price": r["owner_price"],
                "markup": f"{r.get('markup_value')} {r.get('markup_type')}",
            }
            for r in usable[:6]
        ],
    }


async def _tool_update_estimate_details(estimate_id: str, **fields) -> dict:
    """The proposal's own text and notes -- not its status (approving an
    estimate has side effects on the project's contract value, so that stays
    a deliberate click in the app)."""
    allowed = ("title", "introductory_text", "closing_text", "notes_internal", "approval_deadline")
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return {"error": f"nothing to update -- allowed fields: {', '.join(allowed)}"}
    await db_patch("estimates", estimate_id, updates)
    return {"updated": True, "fields": list(updates)}


# Read-only tools from the company-wide assistant, so the copilot can answer
# questions about ANY job, client, invoice, task or lead without leaving the
# estimate. Edits still only ever touch THIS estimate.
PORTFOLIO_TOOL_NAMES = (
    "search_projects",
    "search_estimates",
    "search_change_orders",
    "search_invoices",
    "search_transactions",
    "search_tasks",
    "search_clients",
    "search_subcontractors",
    "search_leads",
    "get_dashboard_summary",
)


async def _tool_get_estimate_line_items(estimate_id: str, target_estimate_id: Optional[str] = None, **_ignored) -> dict:
    """The full line items of ANY estimate (ids come from search_estimates),
    for comparing this one against another job or answering what was in it."""
    target = target_estimate_id or estimate_id
    header = await db_get(
        "estimates",
        f"?id=eq.{target}&select=id,version,status,title,grand_total_owner_price,created_at,projects(name,status)",
    )
    if not header:
        return {"error": "estimate not found -- get ids from search_estimates"}
    items = await db_get(
        "estimate_line_items",
        f"?estimate_id=eq.{target}&order=sort_order.asc&select=title,group_name,bucket,quantity,unit,unit_cost,"
        "unit_cost_labor,unit_cost_material,builder_cost,markup_type,markup_value,owner_price,cost_codes(code,name)",
    )
    h = header[0]
    return {
        "estimate": {
            "id": h["id"],
            "project": ((h.get("projects") or {}).get("name") or "").split("|")[0].strip(),
            "project_status": (h.get("projects") or {}).get("status"),
            "version": h["version"],
            "status": h["status"],
            "client_total": h.get("grand_total_owner_price"),
        },
        "item_count": len(items),
        "items": [
            {
                "title": i["title"],
                "group": i.get("group_name"),
                "bucket": i.get("bucket"),
                "qty": i["quantity"],
                "unit": i.get("unit"),
                "unit_cost": i["unit_cost"],
                "labor": i.get("unit_cost_labor"),
                "material": i.get("unit_cost_material"),
                "builder_cost": i.get("builder_cost"),
                "markup": f"{i.get('markup_value')} {i.get('markup_type')}",
                "client_price": i["owner_price"],
                "cost_code": (i.get("cost_codes") or {}).get("code"),
            }
            for i in items[:150]
        ],
    }


async def _tool_get_project_overview(estimate_id: str, project_id: str, **_ignored) -> dict:
    """One job at a glance: details, every estimate version, change orders,
    invoices and what's been collected, the financial position, budget vs
    actual by cost code, and where the schedule stands. Ids from
    search_projects."""
    from fastapi import HTTPException

    from .routers.projects import get_cost_code_variance, get_financial_summary

    async def safe(coro):
        try:
            return await coro
        except HTTPException:
            return None

    projects, estimates, cos, invoices, tasks, summary, variance = await asyncio.gather(
        db_get("projects", f"?id=eq.{project_id}&select=*"),
        db_get(
            "estimates",
            f"?project_id=eq.{project_id}&is_archived=eq.false&order=version.asc&select=id,version,status,grand_total_owner_price",
        ),
        db_get("change_orders", f"?project_id=eq.{project_id}&order=co_number.asc&select=co_number,title,status,owner_price"),
        db_get(
            "invoices",
            f"?project_id=eq.{project_id}&order=created_at.asc&select=invoice_number,title,status,amount_due,amount_paid,due_date",
        ),
        db_get("schedule_items", f"?project_id=eq.{project_id}&select=status,scheduled_end"),
        safe(get_financial_summary(project_id, None)),
        safe(get_cost_code_variance(project_id, None)),
    )
    if not projects:
        return {"error": "project not found -- get ids from search_projects"}
    project = projects[0]
    keep = (
        "id", "name", "address", "city", "state", "status", "health_status", "start_date",
        "estimated_completion", "current_phase", "contract_value", "description", "notes",
    )
    from datetime import date

    today = date.today().isoformat()
    open_tasks = [t for t in tasks if t.get("status") != "complete"]
    result: dict = {
        "project": {k: project.get(k) for k in keep if project.get(k) is not None},
        "estimates": estimates,
        "change_orders": cos,
        "invoices": invoices,
        "schedule": {
            "tasks_total": len(tasks),
            "tasks_open": len(open_tasks),
            "tasks_overdue": sum(1 for t in open_tasks if t.get("scheduled_end") and t["scheduled_end"][:10] < today),
        },
    }
    if summary is not None:
        result["financial_summary"] = summary.model_dump() if hasattr(summary, "model_dump") else summary
    if variance is not None:
        v = variance.model_dump() if hasattr(variance, "model_dump") else variance
        rows = sorted(v.get("rows", []), key=lambda r: abs(r.get("variance") or 0), reverse=True)[:8]
        result["budget_vs_actual"] = {
            "total_budgeted": v.get("total_budgeted"),
            "total_actual": v.get("total_actual"),
            "total_variance": v.get("total_variance"),
            "biggest_variances": [
                {k: r.get(k) for k in ("code", "name", "budgeted", "actual", "variance", "variance_pct")} for r in rows
            ],
        }
    return result


ESTIMATE_TOOLS: list[dict] = [
    {
        "name": "add_line_item",
        "description": "Add a new line item to this estimate. builder_cost/owner_price are computed "
        "automatically from quantity/unit_cost/markup -- never compute or pass them yourself.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "group_name": {
                    "type": "string",
                    "description": "Which group/section this belongs under, e.g. 'Kitchen', 'Site Work'. Reuse an existing group name exactly if this belongs with items already there.",
                },
                "bucket": {"type": "string", "description": "construction, pm_fee, or allowance (default construction)"},
                "quantity": {"type": "number", "description": "default 1"},
                "unit": {"type": "string", "description": "e.g. sq ft, linear ft, each"},
                "unit_cost": {"type": "number", "description": "builder's cost per unit, default 0. Ignored when unit_cost_labor/unit_cost_material are given (their sum is used)."},
                "unit_cost_labor": {"type": "number", "description": "labor part of the per-unit cost; use with unit_cost_material to split labor from material"},
                "unit_cost_material": {"type": "number", "description": "material part of the per-unit cost"},
                "cost_type": {"type": "string", "description": "labor, material, sub, or none (default none)"},
                "markup_type": {"type": "string", "description": "percent, flat (one dollar amount for the whole line), or per_unit (dollars of profit per unit of quantity). Default percent."},
                "markup_value": {
                    "type": "number",
                    "description": "markup percent (e.g. 20 for 20%), a flat dollar amount, or dollars of profit per unit, depending on markup_type",
                },
                "cost_code_id": {
                    "type": "string",
                    "description": "Exact id from the cost code catalog in your system prompt, only if you're confident it matches -- leave unset rather than guessing.",
                },
                "estimated_days": {"type": "number"},
                "notes_external": {"type": "string", "description": "Client-facing description shown on the proposal"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_line_item",
        "description": "Edit an existing line item on this estimate. Only include the fields you're actually changing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_id": {"type": "string", "description": "The id of the line item to update, from the current line items in your system prompt"},
                "title": {"type": "string"},
                "group_name": {"type": "string"},
                "bucket": {"type": "string"},
                "quantity": {"type": "number"},
                "unit": {"type": "string"},
                "unit_cost": {"type": "number"},
                "unit_cost_labor": {"type": "number"},
                "unit_cost_material": {"type": "number"},
                "cost_type": {"type": "string"},
                "markup_type": {"type": "string", "description": "percent, flat, or per_unit (profit per unit of quantity)"},
                "markup_value": {"type": "number"},
                "cost_code_id": {"type": "string"},
                "estimated_days": {"type": "number"},
                "notes_external": {"type": "string"},
            },
            "required": ["item_id"],
        },
    },
    {
        "name": "remove_line_item",
        "description": "Delete a line item from this estimate. Only use this when the user has clearly asked for something to be removed -- always confirm what you removed in your reply so it's easy to catch a mistake.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": {"type": "string"}},
            "required": ["item_id"],
        },
    },
    {
        "name": "search_reference_line_items",
        "description": "Search line items from OTHER estimates (past and current jobs) by keyword, to ground pricing in what similar scope has actually cost on real jobs instead of guessing. Use this before proposing a unit_cost you're not confident about.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword to search titles/descriptions for, e.g. 'cabinet hardware' or 'tile'"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "add_line_items",
        "description": "Add MANY line items in one call -- use this whenever there is more than one to add (a pasted scope, a transcript, a list). Each entry takes the same fields as add_line_item. Up to 60 per call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "group_name": {"type": "string"},
                            "bucket": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit": {"type": "string"},
                            "unit_cost": {"type": "number"},
                            "unit_cost_labor": {"type": "number"},
                            "unit_cost_material": {"type": "number"},
                            "cost_type": {"type": "string"},
                            "markup_type": {"type": "string"},
                            "markup_value": {"type": "number"},
                            "cost_code_id": {"type": "string"},
                            "estimated_days": {"type": "number"},
                            "notes_external": {"type": "string"},
                        },
                        "required": ["title"],
                    },
                }
            },
            "required": ["items"],
        },
    },
    {
        "name": "update_line_items",
        "description": "Apply the SAME change to many existing line items at once -- e.g. set every item in a group to a 25% markup, move several items into another group, or switch a bucket to per-unit profit. Select by item_ids, or by group_name and/or bucket (all matching items).",
        "input_schema": {
            "type": "object",
            "properties": {
                "changes": {
                    "type": "object",
                    "description": "Fields to set on every selected item: title, group_name, bucket, quantity, unit, unit_cost, unit_cost_labor, unit_cost_material, cost_type, markup_type, markup_value, cost_code_id, estimated_days, notes_external, notes_internal.",
                },
                "item_ids": {"type": "array", "items": {"type": "string"}},
                "group_name": {"type": "string", "description": "Select every item currently in this group (exact name)"},
                "bucket": {"type": "string", "description": "Select every item in this bucket: construction, pm_fee, or allowance"},
            },
            "required": ["changes"],
        },
    },
    {
        "name": "get_estimate_summary",
        "description": "Totals for this estimate: builder cost, client price, profit and margin overall, by bucket, and by group, plus the five thinnest-margin items. Use it instead of adding numbers up yourself, and before answering anything about profit or margin.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_project_context",
        "description": "Details of the project this estimate is for (address, status, dates, contract value, notes), the other versions of this estimate, and the project's change orders. Use it to judge scope and pricing against the actual job.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_cost_code_pricing",
        "description": "What a cost code or keyword has actually cost and been marked up to on OTHER estimates, closed jobs included: min / median / max builder cost per unit, median client price per unit, median margin, and the most recent examples. Use it to price a line item and to check whether existing lines are priced in line with past jobs. Give a cost_code_id from your catalog, a keyword query, or both.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cost_code_id": {"type": "string"},
                "query": {"type": "string", "description": "e.g. 'drywall', 'LVP flooring'"},
            },
        },
    },
    {
        "name": "get_estimate_line_items",
        "description": "The full line items (qty, unit cost, labor/material, markup, client price, cost code) of ANY estimate on any job -- use it to compare this estimate with another, or to answer what was in another job's estimate. Get ids from search_estimates.",
        "input_schema": {
            "type": "object",
            "properties": {"target_estimate_id": {"type": "string", "description": "The estimate to read (from search_estimates)"}},
            "required": ["target_estimate_id"],
        },
    },
    {
        "name": "get_project_overview",
        "description": "One job at a glance, any job: its details, every estimate version, change orders, invoices and amounts collected, financial position (contract, builder cost, profit, billed, left to bill), budget vs actual by cost code with the biggest variances, and schedule status (open/overdue tasks). Get ids from search_projects. Use it for any question about how a specific job is doing.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "update_estimate_details",
        "description": "Edit the proposal's own fields: title, introductory_text, closing_text, notes_internal, approval_deadline (YYYY-MM-DD). Cannot change the estimate's status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "introductory_text": {"type": "string"},
                "closing_text": {"type": "string"},
                "notes_internal": {"type": "string"},
                "approval_deadline": {"type": "string"},
            },
        },
    },
]

ESTIMATE_TOOLS.extend(t for t in ai_tools.TOOLS if t["name"] in PORTFOLIO_TOOL_NAMES)

_HANDLERS = {
    "add_line_item": _tool_add_line_item,
    "update_line_item": _tool_update_line_item,
    "remove_line_item": _tool_remove_line_item,
    "search_reference_line_items": _tool_search_reference_line_items,
    "add_line_items": _tool_add_line_items,
    "update_line_items": _tool_update_line_items,
    "get_estimate_summary": _tool_get_estimate_summary,
    "get_project_context": _tool_get_project_context,
    "get_cost_code_pricing": _tool_get_cost_code_pricing,
    "update_estimate_details": _tool_update_estimate_details,
    "get_estimate_line_items": _tool_get_estimate_line_items,
    "get_project_overview": _tool_get_project_overview,
}

# Tools whose result should trigger the frontend to refetch the worksheet's
# line items -- everything that actually mutates the estimate.
WRITE_TOOLS = {
    "add_line_item",
    "update_line_item",
    "remove_line_item",
    "add_line_items",
    "update_line_items",
    "update_estimate_details",
}


async def run_estimate_tool(name: str, tool_input: dict, estimate_id: str, current_user: Any = None) -> Any:
    if name in PORTFOLIO_TOOL_NAMES:
        if name == "get_dashboard_summary" and current_user is None:
            return {"error": "the dashboard summary needs a signed-in user"}
        try:
            return await ai_tools.run_tool(name, tool_input, current_user)
        except Exception as e:  # a lookup failing shouldn't end the conversation
            return {"error": f"lookup failed: {str(e)[:200]}"}
    handler = _HANDLERS.get(name)
    if not handler:
        return {"error": f"unknown tool '{name}'"}
    try:
        return await handler(estimate_id, **tool_input)
    except TypeError as e:
        return {"error": f"invalid arguments: {e}"}
