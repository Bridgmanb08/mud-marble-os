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
from typing import Any

from pydantic import ValidationError

from .supabase_client import db_get

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


async def current_estimate_context(estimate_id: str) -> dict:
    """Everything the system prompt needs to ground this specific
    conversation: the estimate's own line items (so the assistant can
    reference existing groups/items by id without a search round-trip) and
    the active cost-code catalog. Fetched fresh every chat turn, not cached --
    the whole point is this reflects what's actually on the estimate right
    now, including edits made earlier in the same conversation."""
    items, cost_codes = await asyncio.gather(
        db_get(
            "estimate_line_items",
            f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=id,title,group_name,bucket,quantity,unit_cost,owner_price,cost_codes(id,code,name)",
        ),
        db_get("cost_codes", "?is_active=eq.true&order=code.asc&limit=200&select=id,code,name"),
    )
    return {"items": items, "cost_codes": cost_codes}


def format_line_items(items: list[dict]) -> str:
    if not items:
        return "(no line items yet -- this estimate is empty)"
    lines = []
    for i in items:
        cc = i.get("cost_codes") or {}
        cc_label = f"{cc['code']} - {cc['name']}" if cc else "no cost code"
        lines.append(
            f"- id={i['id']} | \"{i['title']}\" | group: {i.get('group_name') or '—'} | bucket: {i['bucket']} | "
            f"qty {i['quantity']} @ ${i['unit_cost']} = ${i['owner_price']} client price | {cc_label}"
        )
    return "\n".join(lines)


def format_cost_codes(cost_codes: list[dict]) -> str:
    if not cost_codes:
        return "(no active cost codes yet)"
    return "\n".join(f"- {c['id']}: {c['code']} - {c['name']}" for c in cost_codes)


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
                "unit_cost": {"type": "number", "description": "builder's cost per unit, default 0"},
                "cost_type": {"type": "string", "description": "labor, material, sub, or none (default none)"},
                "markup_type": {"type": "string", "description": "percent or flat (default percent)"},
                "markup_value": {
                    "type": "number",
                    "description": "markup percent (e.g. 20 for 20%) or flat dollar amount, depending on markup_type",
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
                "cost_type": {"type": "string"},
                "markup_type": {"type": "string"},
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
]

_HANDLERS = {
    "add_line_item": _tool_add_line_item,
    "update_line_item": _tool_update_line_item,
    "remove_line_item": _tool_remove_line_item,
    "search_reference_line_items": _tool_search_reference_line_items,
}

# Tools whose result should trigger the frontend to refetch the worksheet's
# line items -- everything that actually mutates the estimate.
WRITE_TOOLS = {"add_line_item", "update_line_item", "remove_line_item"}


async def run_estimate_tool(name: str, tool_input: dict, estimate_id: str) -> Any:
    handler = _HANDLERS.get(name)
    if not handler:
        return {"error": f"unknown tool '{name}'"}
    try:
        return await handler(estimate_id, **tool_input)
    except TypeError as e:
        return {"error": f"invalid arguments: {e}"}
