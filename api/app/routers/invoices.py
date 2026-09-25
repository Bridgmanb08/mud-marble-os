import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

from .. import line_items
from ..deps import CurrentUser, get_current_user
from ..pdf_export import (
    STATUS_COLORS,
    NumberedCanvas,
    SIDE_MARGIN,
    breadcrumb_for,
    build_info_card,
    build_line_items_table,
    build_letterhead,
    build_styles,
    money,
    build_totals_band,
    fmt_pdf_date,
    xml_escape,
)
from ..schemas.invoices import (
    InvoiceCreate,
    InvoiceLineItemBulkCreate,
    InvoiceLineItemCreate,
    InvoiceLineItemOut,
    InvoiceLineItemUpdate,
    InvoiceOut,
    InvoiceUpdate,
)
from ..supabase_client import db_delete, db_delete_query, db_get, db_patch, db_post, db_post_many

# "Counts toward invoiced_to_date" -- the exact same status set financial-
# summary already uses (projects.py) so this guard and that number never
# disagree about what "invoiced" means.
_COUNTED_STATUSES = ("sent", "paid", "overdue")

router = APIRouter(prefix="/invoices", tags=["invoices"])

ITEM_SELECT = "*,cost_codes(code,name)"


async def _validate_invoice_amounts(
    items: list[tuple[Optional[str], float]], exclude_item_id: Optional[str] = None
) -> None:
    """Guards against invoicing more of a source line item (from an estimate
    OR a change order -- both live in the same line-item table) than it's
    actually worth, across every invoice on the project, not just the one
    being edited right now. The "Add line items" picker already clamps this
    in the UI, but that clamp used a snapshot fetched once on mount; two
    invoices open in two tabs (or two sessions without a reload between
    them) could each independently commit up to the full remaining amount,
    double-invoicing the same scope. This is the actual, authoritative
    check -- the client-side clamp is just a nicer first line of defense.
    exclude_item_id lets an update recompute the already-invoiced sum
    without double-counting the very row being changed."""
    source_ids = {sid for sid, _ in items if sid}
    if not source_ids:
        return
    id_filter = ",".join(source_ids)

    sources = await db_get("estimate_line_items", f"?id=in.({id_filter})&select=id,owner_price")
    owner_price_by_id = {s["id"]: s.get("owner_price") or 0 for s in sources}

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
    # bulk call tries to invoice the same source line item more than once.
    requested: dict[str, float] = {}
    for sid, amount in items:
        if sid:
            requested[sid] = requested.get(sid, 0) + amount

    for sid, new_amount in requested.items():
        cap = owner_price_by_id.get(sid)
        if cap is None:
            continue  # source line item not found -- a data-integrity edge case, not this check's job to police
        already = already_invoiced.get(sid, 0)
        # Both sides rounded to the cent before comparing -- that alone
        # absorbs ordinary float noise (e.g. 100.00000000001) without
        # needing a manual epsilon on top, which would just as easily mask
        # a genuine one-cent overage as it would a rounding artifact.
        # The running invoiced total has to stay between 0 and the item's
        # price, whichever sign that price has -- a credit line (negative
        # price) can be invoiced down to its full negative amount, but no
        # further, and a positive line can't be pushed below zero either.
        total = round(already + new_amount, 2)
        low, high = min(0.0, round(cap, 2)), max(0.0, round(cap, 2))
        if total > high or total < low:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"That would invoice more than this line item's total ({money(cap)}) -- "
                    f"{money(already)} of it is already invoiced elsewhere on this project."
                ),
            )


async def _validate_invoice_total(project_id: str, invoice_id: str, amount_due: float) -> None:
    """Whole-invoice guard, complementary to _validate_invoice_amounts above
    -- that one caps each ITEM against its own estimate line item, but says
    nothing about the invoice's total against the overall contract. This is
    what actually closes the gap: the flat "just type an amount" path (the
    DEFAULT way to create an invoice -- no line items required) had zero
    protection at all before this, so nothing stopped creating any number of
    invoices whose flat amounts summed past the contract value. Only runs
    when the invoice's resulting status is one that counts toward
    invoiced_to_date -- a draft can be edited freely; the check fires the
    moment it's marked sent (or edited further while already sent/paid/
    overdue)."""
    from .projects import _get_invoicing_estimate  # local import -- avoids a circular import at module load time

    estimate = await _get_invoicing_estimate(project_id, select="grand_total_owner_price")
    owner_price = (estimate.get("grand_total_owner_price") or 0) if estimate else 0
    approved_cos = await db_get("change_orders", f"?project_id=eq.{project_id}&status=eq.approved&select=owner_price")
    owner_price += sum(c.get("owner_price") or 0 for c in approved_cos)

    other_invoices = await db_get(
        "invoices",
        f"?project_id=eq.{project_id}&status=in.({','.join(_COUNTED_STATUSES)})&select=id,amount_due",
    )
    already = sum(i.get("amount_due") or 0 for i in other_invoices if i["id"] != invoice_id)

    if round(already + amount_due, 2) > round(owner_price, 2):
        raise HTTPException(
            status_code=400,
            detail=(
                f"That would invoice more than the contract total ({money(owner_price)}) -- "
                f"{money(already)} is already invoiced elsewhere on this project."
            ),
        )


async def _export_rows_for_items(items: list[dict]) -> list[tuple]:
    """Enriches invoice line items for the PDF/Excel exports with the
    description/quantity/unit/unit-price detail that invoice_line_items
    itself doesn't store -- an invoice line is fundamentally just "bill this
    amount", not a quantity x unit-price computation. When a line was pulled
    from an estimate or change-order item (source_line_item_id set), this
    falls back to that source's own client-facing text when the invoice
    line's own description is blank (a real gap: the "Add line items"
    picker's own description copy is opt-in, and older rows predate it
    entirely), and derives a Qty/Unit Price pair from the source's client
    unit price so the row is internally consistent (qty * unit_price =
    price) even though the invoice may only be billing a fraction of the
    source item's own quantity. A freehand line with no source has no
    quantity concept at all and renders with blank Qty/Unit Price, same as
    build_line_items_table already handles.

    Never surfaces unit_cost -- that's the builder's internal cost per unit,
    not something a client-facing document shows; the derived unit price is
    always built from owner_price (what the client owes)."""
    source_ids = {i["source_line_item_id"] for i in items if i.get("source_line_item_id")}
    sources_by_id: dict[str, dict] = {}
    if source_ids:
        source_rows = await db_get(
            "estimate_line_items", f"?id=in.({','.join(source_ids)})&select=id,quantity,unit,owner_price,description,notes_external"
        )
        sources_by_id = {s["id"]: s for s in source_rows}

    rows = []
    for i in items:
        source = sources_by_id.get(i.get("source_line_item_id"))
        description = i.get("description") or (line_items.client_text(source) if source else None)
        amount = i.get("amount") or 0
        qty: Optional[float] = None
        unit: Optional[str] = None
        unit_price: Optional[float] = None
        if source:
            source_qty = source.get("quantity") or 0
            source_owner_price = source.get("owner_price") or 0
            client_unit_price = (source_owner_price / source_qty) if source_qty else source_owner_price
            if client_unit_price:
                unit = source.get("unit")
                unit_price = client_unit_price
                qty = amount / client_unit_price
        rows.append((i.get("title"), description, qty, unit, unit_price, amount))
    return rows


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
    query = "?order=created_at.desc&select=*,projects(name,address)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("invoices", query)


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name,address)")
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return rows[0]


async def _next_invoice_number(project_id: str) -> str:
    """Highest existing plain-integer invoice_number for this project, plus
    one -- not a count, so a deleted invoice never opens a gap that gets
    silently reused (e.g. 01-04 existing, #02 deleted: count-based would
    hand out "04" again; this hands out "05"). A non-numeric or missing
    number (a renamed one, or an older invoice created before this existed)
    is simply ignored rather than breaking the sequence."""
    existing = await db_get("invoices", f"?project_id=eq.{project_id}&select=invoice_number")
    highest = 0
    for row in existing:
        raw = row.get("invoice_number")
        if raw and raw.strip().isdigit():
            highest = max(highest, int(raw))
    return str(highest + 1).zfill(2)


@router.post("", response_model=InvoiceOut)
async def create_invoice(body: InvoiceCreate, _: CurrentUser = Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    data["status"] = "draft"
    data["issued_at"] = date.today().isoformat()
    if not data.get("invoice_number"):
        data["invoice_number"] = await _next_invoice_number(body.project_id)
    rows = await db_post("invoices", data)
    full = await db_get("invoices", f"?id=eq.{rows[0]['id']}&select=*,projects(name,address)")
    return full[0]


@router.patch("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(invoice_id: str, body: InvoiceUpdate, _: CurrentUser = Depends(get_current_user)):
    current = await db_get("invoices", f"?id=eq.{invoice_id}&select=project_id,status,amount_due,paid_date")
    if not current:
        raise HTTPException(status_code=404, detail="Invoice not found")
    existing = current[0]

    # exclude_unset (not exclude_none) -- a caller may need to explicitly clear
    # a field (e.g. an import correction clearing notes_external), and that
    # null has to reach the database instead of being silently dropped.
    updates = body.model_dump(exclude_unset=True)

    resulting_status = updates.get("status", existing["status"])
    if resulting_status in _COUNTED_STATUSES:
        resulting_amount = updates.get("amount_due", existing["amount_due"]) or 0
        await _validate_invoice_total(existing["project_id"], invoice_id, resulting_amount)

    # Newly marked paid and nobody already set a paid_date in this same
    # request (or a prior one) -- default it to today rather than leaving
    # the "when did the money actually come in" record blank. Still fully
    # editable afterward if the real date was different.
    if resulting_status == "paid" and existing["status"] != "paid" and "paid_date" not in updates and not existing.get("paid_date"):
        updates["paid_date"] = date.today().isoformat()

    await db_patch("invoices", invoice_id, updates)
    full = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name,address)")
    return full[0]


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get("invoices", f"?id=eq.{invoice_id}&select=status,amount_paid")
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # A paid invoice (or one with any payment recorded against it) is real
    # financial history, not draft clutter -- block the hard delete the same
    # way estimates.py blocks deleting an already-invoiced estimate version.
    if existing[0]["status"] == "paid" or (existing[0].get("amount_paid") or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Can't delete an invoice that's been paid -- change its status first if it was recorded in error.",
        )
    await db_delete_query("invoice_line_items", f"?invoice_id=eq.{invoice_id}")
    await db_delete("invoices", invoice_id)
    return {"ok": True}


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
        # which source line item to re-validate the new amount against.
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


@router.get("/{invoice_id}/export/pdf")
async def export_invoice_pdf(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name,address,clients(first_name,last_name))")
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = rows[0]
    items = await db_get(
        "invoice_line_items", f"?invoice_id=eq.{invoice_id}&order=sort_order.asc&select=*,cost_codes(code,name)"
    )
    project = invoice.get("projects") or {}
    breadcrumb = breadcrumb_for(project)
    project_name = (project.get("name") or "").split("|")[0].strip()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch, leftMargin=SIDE_MARGIN, rightMargin=SIDE_MARGIN
    )
    PAGE_WIDTH = letter[0] - 2 * SIDE_MARGIN
    s = build_styles()

    elements = build_letterhead(s, PAGE_WIDTH, breadcrumb)
    # A custom title (e.g. "Window Allowance Invoice") reads as more useful
    # to a client than a bare number -- shown alongside the number rather
    # than replacing it, so the number stays available for reference.
    if invoice.get("title"):
        elements.append(Paragraph(f"{xml_escape(invoice['title'])} ({xml_escape(invoice.get('invoice_number') or 'Draft')})", s["title"]))
    else:
        elements.append(Paragraph(f"Invoice {xml_escape(invoice.get('invoice_number') or 'Draft')}", s["title"]))
    address = (project.get("address") or "").strip() or project_name
    if address:
        elements.append(Paragraph(xml_escape(address), s["address"]))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.lightgrey, spaceAfter=12))

    # A bordered info card -- type/status/issued/due at a glance, the same
    # visual weight the estimate PDF's group bands and this document's own
    # totals band carry, instead of a bare row of unstyled text. Status is
    # colored to match its on-screen badge (STATUS_BADGE in Invoices.tsx)
    # so "paid" reads as unmistakably good news and "overdue" as a flag.
    status_color_key = {"paid": "green", "overdue": "red", "sent": "amber", "draft": "gray", "void": "gray"}.get(invoice.get("status"))
    info_fields = [
        ("Type", xml_escape((invoice.get("invoice_type") or "").title()), None),
        ("Status", xml_escape((invoice.get("status") or "").title()), STATUS_COLORS.get(status_color_key)),
        ("Issued", fmt_pdf_date(invoice.get("issued_at")), None),
        ("Due", fmt_pdf_date(invoice.get("due_date")), None),
    ]
    elements.append(build_info_card(s, PAGE_WIDTH, info_fields, columns=4))
    elements.append(Spacer(1, 14))

    if invoice.get("notes_external"):
        elements.append(Paragraph(xml_escape(invoice["notes_external"]), s["body"]))
        elements.append(Spacer(1, 10))

    if items:
        elements.append(build_line_items_table(s, PAGE_WIDTH, await _export_rows_for_items(items)))
        elements.append(Spacer(1, 12))

    amount_due = invoice.get("amount_due") or 0
    amount_paid = invoice.get("amount_paid") or 0
    balance = amount_due - amount_paid
    if amount_paid:
        paid_line = f"Paid{' on ' + fmt_pdf_date(invoice['paid_date']) if invoice.get('paid_date') else ''}"
        totals_rows = [
            ("Amount due", money(amount_due), False),
            (paid_line, money(-amount_paid), False),
            ("Balance", money(balance), True),
        ]
    else:
        totals_rows = [("Amount due", money(amount_due), True)]
    elements.append(build_totals_band(s, PAGE_WIDTH, totals_rows))

    # A short closing line -- without it the document just stops right after
    # the number, the same abrupt-ending gap the estimate PDF already avoids
    # with its own closing_text. Only makes sense while a balance is still
    # owed; a paid-in-full invoice doesn't need a payment reminder.
    if balance > 0:
        elements.append(Spacer(1, 14))
        elements.append(Paragraph("Thank you for your business. Please remit payment by the due date above.", s["body"]))

    doc.build(elements, canvasmaker=NumberedCanvas)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"invoice-{invoice.get('invoice_number') or 'draft'}-{project_name or 'job'}.pdf".replace(" ", "-")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{invoice_id}/export/excel")
async def export_invoice_excel(invoice_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name,address)")
    if not rows:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = rows[0]
    items = await db_get(
        "invoice_line_items", f"?invoice_id=eq.{invoice_id}&order=sort_order.asc&select=*,cost_codes(code,name)"
    )
    project = invoice.get("projects") or {}
    project_name = (project.get("name") or "").split("|")[0].strip()

    wb = Workbook()
    ws = wb.active
    ws.title = "Invoice"
    header_font = Font(bold=True)

    heading = invoice.get("title") or f"Invoice {invoice.get('invoice_number') or 'Draft'}"
    ws.append([heading])
    ws["A1"].font = Font(bold=True, size=14)
    address = (project.get("address") or "").strip() or project_name
    if address:
        ws.append([address])
    ws.append([])

    if invoice.get("notes_external"):
        ws.append([invoice["notes_external"]])
        ws.append([])

    # Same Item/Description/Qty/Unit/Unit Price/Price columns as the
    # estimate and change order Excel exports, so a line item's scope reads
    # identically across every export instead of this one alone staying at
    # Item/Description/Amount.
    if items:
        ws.append(["Item", "Description", "Qty", "Unit", "Unit Price", "Price"])
        for cell in ws[ws.max_row]:
            cell.font = header_font
        for title, description, qty, unit, unit_price, price in await _export_rows_for_items(items):
            ws.append([title, description, qty, unit, unit_price, price])
        ws.append([])

    amount_due = invoice.get("amount_due") or 0
    amount_paid = invoice.get("amount_paid") or 0
    ws.append(["", "", "", "", "Amount due", amount_due])
    ws.cell(row=ws.max_row, column=5).font = header_font
    ws.cell(row=ws.max_row, column=6).font = header_font
    if amount_paid:
        ws.append(["", "", "", "", "Paid", -amount_paid])
        ws.append(["", "", "", "", "Balance", amount_due - amount_paid])
        ws.cell(row=ws.max_row, column=5).font = header_font
        ws.cell(row=ws.max_row, column=6).font = header_font

    for col, width in zip("ABCDEF", [28, 40, 8, 8, 12, 12]):
        ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()
    buf.close()

    filename = f"invoice-{invoice.get('invoice_number') or 'draft'}-{project_name or 'job'}.xlsx".replace(" ", "-")
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
