import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..deps import CurrentUser, get_current_user
from ..estimate_defaults import DEFAULT_CLOSING_TEXT
from ..schemas.estimates import (
    EstimateCreate,
    EstimateOut,
    EstimateUpdate,
    LineItemCreate,
    LineItemOut,
    LineItemUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/estimates", tags=["estimates"])


def _compute_costs(quantity: float, unit_cost: float, markup_type: str, markup_value: float) -> tuple[float, float]:
    builder_cost = round((quantity or 0) * (unit_cost or 0), 2)
    if markup_type == "flat":
        owner_price = round(builder_cost + (markup_value or 0), 2)
    else:
        owner_price = round(builder_cost * (1 + (markup_value or 0) / 100), 2)
    return builder_cost, owner_price


async def _recalc_estimate_totals(estimate_id: str) -> None:
    items = await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}")
    pm_fee_total = sum(i.get("owner_price") or 0 for i in items if i.get("bucket") == "pm_fee")
    construction_total = sum(i.get("owner_price") or 0 for i in items if i.get("bucket") == "construction")
    allowance_total = sum(i.get("owner_price") or 0 for i in items if i.get("bucket") == "allowance")
    await db_patch(
        "estimates",
        estimate_id,
        {
            "pm_fee_total": round(pm_fee_total, 2),
            "construction_total_owner_price": round(construction_total, 2),
            "allowance_total": round(allowance_total, 2),
            "grand_total_owner_price": round(pm_fee_total + construction_total + allowance_total, 2),
        },
    )


@router.get("", response_model=list[EstimateOut])
async def list_estimates(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc&select=*,projects(name)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("estimates", query)


@router.get("/{estimate_id}", response_model=EstimateOut)
async def get_estimate(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("estimates", f"?id=eq.{estimate_id}&select=*,projects(name)")
    if not rows:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return rows[0]


@router.post("", response_model=EstimateOut)
async def create_estimate(body: EstimateCreate, _: CurrentUser = Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    data.setdefault("closing_text", DEFAULT_CLOSING_TEXT)
    rows = await db_post("estimates", data)
    estimate = rows[0]
    if body.pm_fee_total > 0:
        await db_post(
            "estimate_line_items",
            {
                "estimate_id": estimate["id"],
                "bucket": "pm_fee",
                "group_name": "PM Fee",
                "title": "Project management fee",
                "quantity": 1,
                "unit_cost": body.pm_fee_total,
                "cost_type": "none",
                "markup_type": "flat",
                "markup_value": 0,
                "builder_cost": body.pm_fee_total,
                "owner_price": body.pm_fee_total,
                "sort_order": 1,
            },
        )
        await _recalc_estimate_totals(estimate["id"])
        full = await db_get("estimates", f"?id=eq.{estimate['id']}&select=*,projects(name)")
        return full[0]
    return estimate


@router.patch("/{estimate_id}", response_model=EstimateOut)
async def update_estimate(estimate_id: str, body: EstimateUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("estimates", estimate_id, body.model_dump(exclude_none=True))
    full = await db_get("estimates", f"?id=eq.{estimate_id}&select=*,projects(name)")
    if not full:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return full[0]


@router.post("/{estimate_id}/duplicate", response_model=EstimateOut)
async def duplicate_estimate(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    originals = await db_get("estimates", f"?id=eq.{estimate_id}")
    if not originals:
        raise HTTPException(status_code=404, detail="Estimate not found")
    original = originals[0]
    siblings = await db_get(
        "estimates", f"?project_id=eq.{original['project_id']}&select=version&order=version.desc&limit=1"
    )
    next_version = (siblings[0]["version"] + 1) if siblings else 1

    new_estimate = (
        await db_post(
            "estimates",
            {
                "project_id": original["project_id"],
                "version": next_version,
                "status": "draft",
                "title": original.get("title"),
                "notes_internal": original.get("notes_internal"),
                "approval_deadline": original.get("approval_deadline"),
                "introductory_text": original.get("introductory_text"),
                "closing_text": original.get("closing_text") or DEFAULT_CLOSING_TEXT,
            },
        )
    )[0]

    items = await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc")
    for item in items:
        await db_post(
            "estimate_line_items",
            {
                "estimate_id": new_estimate["id"],
                "cost_code_id": item.get("cost_code_id"),
                "group_name": item.get("group_name"),
                "bucket": item.get("bucket"),
                "title": item.get("title"),
                "description": item.get("description"),
                "quantity": item.get("quantity"),
                "unit": item.get("unit"),
                "unit_cost": item.get("unit_cost"),
                "cost_type": item.get("cost_type"),
                "builder_cost": item.get("builder_cost"),
                "markup_type": item.get("markup_type"),
                "markup_value": item.get("markup_value"),
                "owner_price": item.get("owner_price"),
                "notes_internal": item.get("notes_internal"),
                "notes_external": item.get("notes_external"),
                "sort_order": item.get("sort_order"),
            },
        )
    await _recalc_estimate_totals(new_estimate["id"])
    full = await db_get("estimates", f"?id=eq.{new_estimate['id']}&select=*,projects(name)")
    return full[0]


@router.get("/{estimate_id}/items", response_model=list[LineItemOut])
async def list_line_items(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=*,cost_codes(code,name)"
    )


@router.post("/{estimate_id}/items", response_model=LineItemOut)
async def create_line_item(estimate_id: str, body: LineItemCreate, _: CurrentUser = Depends(get_current_user)):
    builder_cost, owner_price = _compute_costs(body.quantity, body.unit_cost, body.markup_type, body.markup_value)
    data = {
        **body.model_dump(exclude_none=True),
        "estimate_id": estimate_id,
        "builder_cost": builder_cost,
        "owner_price": owner_price,
    }
    rows = await db_post("estimate_line_items", data)
    await _recalc_estimate_totals(estimate_id)
    full = await db_get("estimate_line_items", f"?id=eq.{rows[0]['id']}&select=*,cost_codes(code,name)")
    return full[0]


@router.patch("/{estimate_id}/items/{item_id}", response_model=LineItemOut)
async def update_line_item(
    estimate_id: str, item_id: str, body: LineItemUpdate, _: CurrentUser = Depends(get_current_user)
):
    existing_rows = await db_get("estimate_line_items", f"?id=eq.{item_id}")
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Line item not found")
    existing = existing_rows[0]
    updates = body.model_dump(exclude_none=True)
    merged = {**existing, **updates}
    builder_cost, owner_price = _compute_costs(
        merged.get("quantity") or 0, merged.get("unit_cost") or 0, merged.get("markup_type") or "percent", merged.get("markup_value") or 0
    )
    updates["builder_cost"] = builder_cost
    updates["owner_price"] = owner_price
    await db_patch("estimate_line_items", item_id, updates)
    await _recalc_estimate_totals(estimate_id)
    full = await db_get("estimate_line_items", f"?id=eq.{item_id}&select=*,cost_codes(code,name)")
    return full[0]


@router.delete("/{estimate_id}/items/{item_id}")
async def delete_line_item(estimate_id: str, item_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("estimate_line_items", item_id)
    await _recalc_estimate_totals(estimate_id)
    return {"ok": True}


GROUP_LABEL_FALLBACK = "Ungrouped"


async def _gather_export_data(estimate_id: str):
    estimates = await db_get("estimates", f"?id=eq.{estimate_id}&select=*,projects(name,address,clients(first_name,last_name))")
    if not estimates:
        raise HTTPException(status_code=404, detail="Estimate not found")
    estimate = estimates[0]
    items = await db_get(
        "estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=*,cost_codes(code,name)"
    )
    groups: dict[str, list[dict]] = {}
    for item in items:
        key = item.get("group_name") or GROUP_LABEL_FALLBACK
        groups.setdefault(key, []).append(item)
    return estimate, groups


@router.get("/{estimate_id}/export/pdf")
async def export_estimate_pdf(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    estimate, groups = await _gather_export_data(estimate_id)
    project = estimate.get("projects") or {}
    client = (project.get("clients") or {}) if project else {}
    client_name = f"{client.get('first_name') or ''} {client.get('last_name') or ''}".strip()
    project_name = (project.get("name") or "").split("|")[0].strip()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey)

    elements = [
        Paragraph("Mud &amp; Marble", h1),
        Paragraph(
            estimate.get("title") or f"Proposal for {client_name or project_name}",
            ParagraphStyle("subtitle", parent=styles["Normal"], fontSize=12, spaceAfter=4),
        ),
        Paragraph(f"{project_name}" + (f" — {client_name}" if client_name else ""), small),
        Spacer(1, 14),
    ]

    intro = estimate.get("introductory_text")
    if intro:
        elements.append(Paragraph(intro.replace("\n", "<br/>"), body))
        elements.append(Spacer(1, 10))

    for group_name, items in groups.items():
        elements.append(Paragraph(group_name, h2))
        table_data = [["Item", "Description", "Qty/Unit", "Unit Price", "Price"]]
        for item in items:
            cc = item.get("cost_codes")
            item_label = item.get("title") or ""
            if cc:
                item_label += f"<br/><font size=7 color='grey'>{cc.get('code')} - {cc.get('name')}</font>"
            qty_unit = f"{item.get('quantity') or 0:g}" + (f" {item['unit']}" if item.get("unit") else "")
            table_data.append(
                [
                    Paragraph(item_label, body),
                    Paragraph(item.get("description") or "", body),
                    qty_unit,
                    f"${(item.get('unit_cost') or 0):,.2f}",
                    f"${(item.get('owner_price') or 0):,.2f}",
                ]
            )
        t = Table(table_data, colWidths=[1.4 * inch, 2.1 * inch, 0.9 * inch, 0.9 * inch, 0.9 * inch])
        t.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.75, colors.grey),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(t)
        elements.append(Spacer(1, 8))

    total = estimate.get("grand_total_owner_price") or 0
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(f"<b>Total Price: ${total:,.2f}</b>", ParagraphStyle("total", parent=styles["Normal"], fontSize=13, alignment=2)))
    elements.append(Spacer(1, 20))

    closing = estimate.get("closing_text") or DEFAULT_CLOSING_TEXT
    for para in closing.split("\n\n"):
        elements.append(Paragraph(para.replace("\n", "<br/>"), body))
        elements.append(Spacer(1, 6))

    elements.append(Spacer(1, 20))
    elements.append(Paragraph("Signature: _______________________________________", body))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Date: _______________________________________", body))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Print Name: _______________________________________", body))

    doc.build(elements)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"proposal-{project_name or 'estimate'}-v{estimate['version']}.pdf".replace(" ", "-")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{estimate_id}/export/excel")
async def export_estimate_excel(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    estimate, groups = await _gather_export_data(estimate_id)
    project = estimate.get("projects") or {}
    project_name = (project.get("name") or "").split("|")[0].strip()

    wb = Workbook()
    ws = wb.active
    ws.title = "Proposal"
    header_font = Font(bold=True)

    ws.append([estimate.get("title") or f"Proposal for {project_name}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])

    for group_name, items in groups.items():
        ws.append([group_name])
        ws.cell(row=ws.max_row, column=1).font = header_font
        ws.append(["Item", "Description", "Qty", "Unit", "Unit Price", "Price"])
        for cell in ws[ws.max_row]:
            cell.font = header_font
        for item in items:
            ws.append(
                [
                    item.get("title"),
                    item.get("description"),
                    item.get("quantity"),
                    item.get("unit"),
                    item.get("unit_cost"),
                    item.get("owner_price"),
                ]
            )
        ws.append([])

    ws.append(["", "", "", "", "Total", estimate.get("grand_total_owner_price") or 0])
    ws.cell(row=ws.max_row, column=5).font = header_font
    ws.cell(row=ws.max_row, column=6).font = header_font

    for col, width in zip("ABCDEF", [28, 40, 8, 8, 12, 12]):
        ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()
    buf.close()

    filename = f"proposal-{project_name or 'estimate'}-v{estimate['version']}.xlsx".replace(" ", "-")
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
