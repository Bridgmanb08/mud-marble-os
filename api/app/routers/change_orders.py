import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import branding
from ..change_order_utils import compute_sop_breach
from ..deps import CurrentUser, get_current_user
from ..pdf_export import NumberedCanvas, SIDE_MARGIN, breadcrumb_for, build_letterhead, build_styles, xml_escape
from ..schemas.change_orders import ChangeOrderCreate, ChangeOrderOut, ChangeOrderUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/change-orders", tags=["change_orders"])


def _attach_breach(co: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {**co, "sop_breach": compute_sop_breach(co.get("status"), co.get("sent_at"), now)}


@router.get("", response_model=list[ChangeOrderOut])
async def list_change_orders(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc&select=*,projects(name,address)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    rows = await db_get("change_orders", query)
    return [_attach_breach(r) for r in rows]


@router.post("", response_model=ChangeOrderOut)
async def create_change_order(body: ChangeOrderCreate, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get(
        "change_orders", f"?project_id=eq.{body.project_id}&select=co_number&order=co_number.desc&limit=1"
    )
    next_number = (existing[0]["co_number"] + 1) if existing and existing[0].get("co_number") else 1
    data = body.model_dump(exclude_none=True)
    data["co_number"] = next_number
    data["status"] = "pending"
    data["sent_at"] = datetime.now(timezone.utc).isoformat()
    rows = await db_post("change_orders", data)
    full = await db_get("change_orders", f"?id=eq.{rows[0]['id']}&select=*,projects(name,address)")
    return _attach_breach(full[0])


@router.patch("/{co_id}", response_model=ChangeOrderOut)
async def update_change_order(co_id: str, body: ChangeOrderUpdate, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get("change_orders", f"?id=eq.{co_id}&select=status,project_id,owner_price")
    if not existing:
        raise HTTPException(status_code=404, detail="Change order not found")
    old_status = existing[0]["status"]
    project_id = existing[0]["project_id"]
    owner_price = existing[0].get("owner_price") or 0

    # exclude_unset (not exclude_none) -- a caller may need to explicitly clear
    # a field (e.g. an import correction clearing description), and that null
    # has to reach the database instead of being silently dropped.
    await db_patch("change_orders", co_id, body.model_dump(exclude_unset=True))

    # Approving a change order should grow the project's contracted value by
    # its owner price (and shrink it back if it's ever un-approved) -- without
    # this, an approved addition never shows up in the project's contract
    # value or the dashboard's total-contract-value rollup.
    new_status = body.status if body.status is not None else old_status
    if new_status != old_status and owner_price:
        delta = 0.0
        if new_status == "approved" and old_status != "approved":
            delta = owner_price
        elif old_status == "approved" and new_status != "approved":
            delta = -owner_price
        if delta:
            proj_rows = await db_get("projects", f"?id=eq.{project_id}&select=contract_value")
            if proj_rows:
                current = proj_rows[0].get("contract_value") or 0
                await db_patch("projects", project_id, {"contract_value": round(current + delta, 2)})

    full = await db_get("change_orders", f"?id=eq.{co_id}&select=*,projects(name,address)")
    return _attach_breach(full[0])


@router.get("/{co_id}/export/pdf")
async def export_change_order_pdf(co_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("change_orders", f"?id=eq.{co_id}&select=*,projects(name,address,clients(first_name,last_name))")
    if not rows:
        raise HTTPException(status_code=404, detail="Change order not found")
    co = _attach_breach(rows[0])
    project = co.get("projects") or {}
    breadcrumb = breadcrumb_for(project)
    project_name = (project.get("name") or "").split("|")[0].strip()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch, leftMargin=SIDE_MARGIN, rightMargin=SIDE_MARGIN
    )
    PAGE_WIDTH = letter[0] - 2 * SIDE_MARGIN
    s = build_styles()

    elements = build_letterhead(s, PAGE_WIDTH, breadcrumb)
    co_number = f"CO-{str(co.get('co_number') or '?').zfill(3)}"
    elements.append(Paragraph(f"Change Order {co_number}: {xml_escape(co.get('title') or '')}", s["title"]))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.lightgrey, spaceAfter=10))

    type_labels = {"client_addition": "Client Addition", "oversight": "Oversight", "unforeseen": "Unforeseen"}
    discovered_labels = {"brent": "Brent", "shannon": "Shannon", "client": "Client", "subcontractor": "Subcontractor"}
    info_table = Table(
        [
            [Paragraph("TYPE", s["label"]), Paragraph("STATUS", s["label"]), Paragraph("DISCOVERED BY", s["label"])],
            [
                Paragraph(xml_escape(type_labels.get(co.get("co_type"), co.get("co_type") or "")), s["value"]),
                Paragraph(xml_escape((co.get("status") or "").title()), s["value"]),
                Paragraph(xml_escape(discovered_labels.get(co.get("discovered_by"), co.get("discovered_by") or "—")), s["value"]),
            ],
        ],
        colWidths=[PAGE_WIDTH / 3] * 3,
    )
    info_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (0, 0), 2),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 6))

    # Client-facing scope description only -- notes_internal is exactly the
    # team-only field it's named for and must never reach a document a
    # client could see, same principle as unit_cost/builder_cost being
    # excluded from the estimate export.
    if co.get("description"):
        elements.append(Paragraph(xml_escape(co["description"]), s["body"]))
        elements.append(Spacer(1, 10))

    # Owner price only -- builder_cost is internal margin data, same rule
    # the estimate PDF already follows for its own owner-price/builder-cost
    # split.
    owner_price = co.get("owner_price") or 0
    price_table = Table(
        [[Paragraph("Price", s["body"]), Paragraph(f"${owner_price:,.2f}", s["cell_right"])]],
        colWidths=[PAGE_WIDTH * 0.8, PAGE_WIDTH * 0.2],
    )
    price_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("LINEABOVE", (0, 0), (-1, -1), 0.75, branding.BRAND_BROWN),
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, branding.BRAND_BROWN),
    ]))
    elements.append(price_table)

    # A change order needs the client's sign-off to actually be approved --
    # unlike an invoice (just a bill), this is an agreement, so it gets the
    # same signature block the estimate proposal PDF ends with.
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Signature: _______________________________________", s["body"]))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Date: _______________________________________", s["body"]))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Print Name: _______________________________________", s["body"]))

    doc.build(elements, canvasmaker=NumberedCanvas)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"{co_number}-{project_name or 'change-order'}.pdf".replace(" ", "-")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
