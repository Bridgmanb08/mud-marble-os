"""The one line-item implementation shared by estimates and change orders.

Both parents store their items in estimate_line_items (a row has exactly one
of estimate_id / change_order_id) and go through the same create/update/
delete code below, so pricing math, validation, and the "can't price an item
below what's already been invoiced" guard behave identically. Each router
only adds what's parent-specific -- recalculating its own totals afterward."""
from fastapi import HTTPException

from .schemas.estimates import LineItemCreate, LineItemUpdate
from .supabase_client import db_delete, db_get, db_patch, db_post

TABLE = "estimate_line_items"
SELECT = "*,cost_codes(code,name)"


def client_text(item: dict) -> str:
    """The client-facing wording for a line item. The add/edit form saves it
    as notes_external; description is what imports (and older rows) filled
    in -- so every export prints whichever is set instead of each one
    picking a different field."""
    return item.get("notes_external") or item.get("description") or ""


def compute_costs(quantity: float, unit_cost: float, markup_type: str, markup_value: float) -> tuple[float, float]:
    builder_cost = round((quantity or 0) * (unit_cost or 0), 2)
    if markup_type == "flat":
        owner_price = round(builder_cost + (markup_value or 0), 2)
    else:
        owner_price = round(builder_cost * (1 + (markup_value or 0) / 100), 2)
    return builder_cost, owner_price


async def check_not_below_invoiced(item_id: str, new_owner_price: float) -> None:
    """Reducing a line item's price below what's already been invoiced
    against it (a real workflow -- price corrections happen after partial
    invoicing) would silently push the invoice picker's remaining_amount
    negative. Mirrors invoices.py's validate_source_amounts, checked from
    the line-item side of the same relationship."""
    invoiced_rows = await db_get("invoice_line_items", f"?source_line_item_id=eq.{item_id}&select=amount")
    already_invoiced = sum(r.get("amount") or 0 for r in invoiced_rows)
    new_price = round(new_owner_price, 2)
    invoiced = round(already_invoiced, 2)
    # A credit (negative price) has its invoiced amount negative too, so
    # "below what's invoiced" means a smaller-magnitude credit there -- the
    # item's price has to stay at or beyond what's been invoiced on its own side of zero.
    if invoiced > 0 and new_price < invoiced:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Can't lower this line item's price below ${invoiced:,.2f} -- "
                f"that much of it has already been invoiced."
            ),
        )
    if invoiced < 0 and new_price > invoiced:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Can't shrink this credit below -${abs(invoiced):,.2f} -- "
                f"that much of it has already been invoiced."
            ),
        )


async def list_items(parent_column: str, parent_id: str) -> list[dict]:
    return await db_get(TABLE, f"?{parent_column}=eq.{parent_id}&order=sort_order.asc&select={SELECT}")


async def create_item(parent_column: str, parent_id: str, body: LineItemCreate) -> dict:
    builder_cost, owner_price = compute_costs(body.quantity, body.unit_cost, body.markup_type, body.markup_value)
    data = {
        **body.model_dump(exclude_none=True),
        parent_column: parent_id,
        "builder_cost": builder_cost,
        "owner_price": owner_price,
    }
    rows = await db_post(TABLE, data)
    full = await db_get(TABLE, f"?id=eq.{rows[0]['id']}&select={SELECT}")
    return full[0]


async def update_item(item_id: str, body: LineItemUpdate) -> dict:
    existing_rows = await db_get(TABLE, f"?id=eq.{item_id}")
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Line item not found")
    existing = existing_rows[0]
    # exclude_unset (not exclude_none) -- a caller may need to explicitly
    # clear a field (e.g. removing a cost_code_id or notes_external), and
    # that null has to reach the database instead of being silently dropped.
    updates = body.model_dump(exclude_unset=True)
    merged = {**existing, **updates}
    builder_cost, owner_price = compute_costs(
        merged.get("quantity") or 0,
        merged.get("unit_cost") or 0,
        merged.get("markup_type") or "percent",
        merged.get("markup_value") or 0,
    )
    await check_not_below_invoiced(item_id, owner_price)
    updates["builder_cost"] = builder_cost
    updates["owner_price"] = owner_price
    await db_patch(TABLE, item_id, updates)
    full = await db_get(TABLE, f"?id=eq.{item_id}&select={SELECT}")
    return full[0]


async def delete_item(item_id: str) -> None:
    await db_delete(TABLE, item_id)

