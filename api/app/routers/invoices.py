import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import branding
from ..deps import CurrentUser, get_current_user
from ..pdf_export import NumberedCanvas, SIDE_MARGIN, breadcrumb_for, build_letterhead, build_styles, fmt_pdf_date, xml_escape
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
                f"That would invoice more than the contract total (${owner_price:,.2f}) -- "
                f"${already:,.2f} is already invoiced elsewhere on this project."
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
    elements.append(Paragraph(f"Invoice {xml_escape(invoice.get('invoice_number') or 'Draft')}", s["title"]))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.lightgrey, spaceAfter=10))

    # A 2x2 label/value grid -- type/status left, issued/due right -- same
    # "quick facts up top" shape as the estimate PDF's breadcrumb row, just
    # more of them since an invoice has more state worth showing at a glance.
    info_table = Table(
        [
            [
                Paragraph("TYPE", s["label"]), Paragraph("STATUS", s["label"]),
                Paragraph("ISSUED", s["label"]), Paragraph("DUE", s["label"]),
            ],
            [
                Paragraph(xml_escape((invoice.get("invoice_type") or "").title()), s["value"]),
                Paragraph(xml_escape((invoice.get("status") or "").title()), s["value"]),
                Paragraph(fmt_pdf_date(invoice.get("issued_at")), s["value"]),
                Paragraph(fmt_pdf_date(invoice.get("due_date")), s["value"]),
            ],
        ],
        colWidths=[PAGE_WIDTH * 0.25] * 4,
    )
    info_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (0, 0), 2),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 6))

    if invoice.get("notes_external"):
        elements.append(Paragraph(xml_escape(invoice["notes_external"]), s["body"]))
        elements.append(Spacer(1, 10))

    if items:
        # Cost codes are internal categorization, same call as the estimate
        # export -- not shown on a client-facing invoice.
        item_col = PAGE_WIDTH * 0.30
        desc_col = PAGE_WIDTH * 0.50
        amount_col = PAGE_WIDTH - item_col - desc_col
        table_data = [[Paragraph("Item", s["th"]), Paragraph("Description", s["th"]), Paragraph("Amount", s["th_right"])]]
        for it in items:
            table_data.append([
                Paragraph(xml_escape(it.get("title") or ""), s["cell"]),
                Paragraph(xml_escape(it.get("description") or ""), s["cell"]),
                Paragraph(f"${(it.get('amount') or 0):,.2f}", s["cell_right"]),
            ])
        t = Table(table_data, colWidths=[item_col, desc_col, amount_col], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), branding.BRAND_CREAM),
            ("LINEBELOW", (0, 0), (-1, 0), 0.75, branding.BRAND_BROWN),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F3")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (0, -1), 6), ("RIGHTPADDING", (-1, 0), (-1, -1), 6),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 12))

    amount_due = invoice.get("amount_due") or 0
    amount_paid = invoice.get("amount_paid") or 0
    balance = amount_due - amount_paid
    totals_rows = [["Amount due", f"${amount_due:,.2f}"]]
    if amount_paid:
        paid_line = f"Paid{' on ' + fmt_pdf_date(invoice['paid_date']) if invoice.get('paid_date') else ''}"
        totals_rows.append([paid_line, f"-${amount_paid:,.2f}"])
        totals_rows.append(["Balance", f"${balance:,.2f}"])
    totals_table = Table(
        [[Paragraph(xml_escape(label), s["body"]), Paragraph(value, s["cell_right"])] for label, value in totals_rows],
        colWidths=[PAGE_WIDTH * 0.8, PAGE_WIDTH * 0.2],
    )
    totals_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, branding.BRAND_BROWN),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
    ]))
    elements.append(totals_table)

    doc.build(elements, canvasmaker=NumberedCanvas)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"invoice-{invoice.get('invoice_number') or 'draft'}-{project_name or 'job'}.pdf".replace(" ", "-")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
