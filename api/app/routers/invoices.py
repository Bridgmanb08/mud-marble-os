from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.invoices import (
    InvoiceCreate,
    InvoiceLineItemBulkCreate,
    InvoiceLineItemCreate,
    InvoiceLineItemOut,
    InvoiceLineItemUpdate,
    InvoiceOut,
    InvoiceUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post, db_post_many

router = APIRouter(prefix="/invoices", tags=["invoices"])

ITEM_SELECT = "*,cost_codes(code,name)"


async def _validate_invoice_amounts(
    items: list[tuple[Optional[str], float]], exclude_item_id: Optional[str] = None
) -> None:
    """Guards against invoicing more of an estimate line item than it's
    actually worth, across every invoice on the project -- not just the one
    being edited right now. The "Add from Estimate" picker already clamps
    this in the UI, but that clamp used a snapshot fetched once on mount;
    two invoices open in two tabs (or two sessions without a reload between
    them) could each independently commit up to the full remaining amount,
    double-invoicing the same scope. This is the actual, authoritative
    check -- the client-side clamp is just a nicer first line of defense.
    exclude_item_id lets an update recompute the already-invoiced sum
    without double-counting the very row being changed."""
    source_ids = {sid for sid, _ in items if sid}
    if not source_ids:
        return
    id_filter = ",".join(source_ids)

    est_items = await db_get("estimate_line_items", f"?id=in.({id_filter})&select=id,owner_price")
    owner_price_by_id = {e["id"]: e.get("owner_price") or 0 for e in est_items}

    existing = await db_get(
        "invoice_line_items", f"?source_line_item_id=in.({id_filter})&select=id,source_line_item_id,amount"
    )
    already_invoiced: dict[str, float] = {}
    for row in existing:
        if exclude_item_id and row["id"] == exclude_item_id:
            continue
        sid = row.get("source_line_item_id")
        if sid:
            already_invoiced[sid] = already_invoiced.get(sid, 0) + (row.get("amount") or 0)

    # Sum the newly-requested amounts per source id too, in case a single
    # bulk call tries to invoice the same estimate line item more than once.
    requested: dict[str, float] = {}
    for sid, amount in items:
        if sid:
            requested[sid] = requested.get(sid, 0) + amount

    for sid, new_amount in requested.items():
        cap = owner_price_by_id.get(sid)
        if cap is None:
            continue  # estimate line item not found -- a data-integrity edge case, not this check's job to police
        already = already_invoiced.get(sid, 0)
        # Both sides rounded to the cent before comparing -- that alone
        # absorbs ordinary float noise (e.g. 100.00000000001) without
        # needing a manual epsilon on top, which would just as easily mask
        # a genuine one-cent overage as it would a rounding artifact.
        if round(already + new_amount, 2) > round(cap, 2):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"That would invoice more than this line item's estimate total (${cap:,.2f}) -- "
                    f"${already:,.2f} of it is already invoiced elsewhere on this project."
                ),
            )


async def _recalc_invoice_total(invoice_id: str) -> None:
    """Keeps invoices.amount_due in sync with the sum of its line items --
    same pattern as _recalc_estimate_totals for estimates. Only ever called
    right after a create/update/delete on this invoice's line items, so an
    empty result here specifically means "the last line item was just
    removed" and amount_due should reset to 0, not be left stale -- a
    flat-amount invoice that has never had a line item never calls this at
    all, since nothing in that flow touches invoice_line_items."""
    items = await db_get("invoice_line_items", f"?invoice_id=eq.{invoice_id}&select=amount")
    total = round(sum(i.get("amount") or 0 for i in items), 2)
    await db_patch("invoices", invoice_id, {"amount_due": total})


@router.get("", response_model=list[InvoiceOut])
async def list_invoices(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc&select=*,projects(name)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("invoices", query)


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name)")
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return rows[0]


@router.post("", response_model=InvoiceOut)
async def create_invoice(body: InvoiceCreate, _: CurrentUser = Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    data["status"] = "draft"
    data["issued_at"] = date.today().isoformat()
    rows = await db_post("invoices", data)
    full = await db_get("invoices", f"?id=eq.{rows[0]['id']}&select=*,projects(name)")
    return full[0]


@router.patch("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(invoice_id: str, body: InvoiceUpdate, _: CurrentUser = Depends(get_current_user)):
    # exclude_unset (not exclude_none) -- a caller may need to explicitly clear
    # a field (e.g. an import correction clearing notes_external), and that
    # null has to reach the database instead of being silently dropped.
    await db_patch("invoices", invoice_id, body.model_dump(exclude_unset=True))
    full = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name)")
    return full[0]


@router.get("/{invoice_id}/items", response_model=list[InvoiceLineItemOut])
async def list_invoice_items(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "invoice_line_items", f"?invoice_id=eq.{invoice_id}&order=sort_order.asc&select={ITEM_SELECT}"
    )


@router.post("/{invoice_id}/items", response_model=InvoiceLineItemOut)
async def create_invoice_item(
    invoice_id: str, body: InvoiceLineItemCreate, _: CurrentUser = Depends(get_current_user)
):
    await _validate_invoice_amounts([(body.source_line_item_id, body.amount)])
    rows = await db_post("invoice_line_items", {**body.model_dump(), "invoice_id": invoice_id})
    await _recalc_invoice_total(invoice_id)
    full = await db_get("invoice_line_items", f"?id=eq.{rows[0]['id']}&select={ITEM_SELECT}")
    return full[0]


@router.post("/{invoice_id}/items/bulk", response_model=list[InvoiceLineItemOut])
async def bulk_create_invoice_items(
    invoice_id: str, body: InvoiceLineItemBulkCreate, _: CurrentUser = Depends(get_current_user)
):
    """The "Add line items to invoice" picker commits every checked row in
    one call instead of one POST per row."""
    if not body.items:
        return []
    await _validate_invoice_amounts([(item.source_line_item_id, item.amount) for item in body.items])
    rows = await db_post_many(
        "invoice_line_items", [{**item.model_dump(), "invoice_id": invoice_id} for item in body.items]
    )
    await _recalc_invoice_total(invoice_id)
    ids = ",".join(r["id"] for r in rows)
    return await db_get("invoice_line_items", f"?id=in.({ids})&order=sort_order.asc&select={ITEM_SELECT}")


@router.patch("/{invoice_id}/items/{item_id}", response_model=InvoiceLineItemOut)
async def update_invoice_item(
    invoice_id: str, item_id: str, body: InvoiceLineItemUpdate, _: CurrentUser = Depends(get_current_user)
):
    # exclude_unset -- same reasoning as update_invoice above.
    updates = body.model_dump(exclude_unset=True)
    if updates.get("amount") is not None:
        # source_line_item_id isn't part of InvoiceLineItemUpdate (it's
        # immutable after creation), so it has to be looked up here to know
        # which estimate line item to re-validate the new amount against.
        current = await db_get("invoice_line_items", f"?id=eq.{item_id}&select=source_line_item_id")
        source_line_item_id = current[0].get("source_line_item_id") if current else None
        await _validate_invoice_amounts([(source_line_item_id, updates["amount"])], exclude_item_id=item_id)
    await db_patch("invoice_line_items", item_id, updates)
    await _recalc_invoice_total(invoice_id)
    full = await db_get("invoice_line_items", f"?id=eq.{item_id}&select={ITEM_SELECT}")
    if not full:
        raise HTTPException(status_code=404, detail="Line item not found")
    return full[0]


@router.delete("/{invoice_id}/items/{item_id}")
async def delete_invoice_item(invoice_id: str, item_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("invoice_line_items", item_id)
    await _recalc_invoice_total(invoice_id)
    return {"ok": True}
