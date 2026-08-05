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
    await db_patch("invoice_line_items", item_id, body.model_dump(exclude_unset=True))
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
