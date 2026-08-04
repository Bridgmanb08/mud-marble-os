import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import branding
from ..deps import CurrentUser, get_current_user
from ..estimate_defaults import DEFAULT_CLOSING_TEXT
from ..estimate_text_defaults_store import get_or_create_estimate_text_defaults
from ..rich_text import rich_text_to_pdf_markup
from ..schemas.estimates import (
    EstimateCreate,
    EstimateOut,
    EstimateUpdate,
    LineItemCreate,
    LineItemOut,
    LineItemReference,
    LineItemUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post, db_post_many

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


@router.get("/line-items/search", response_model=list[LineItemReference])
async def search_line_items(
    cost_code_id: Optional[str] = None,
    q: Optional[str] = None,
    exclude_estimate_id: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    if not cost_code_id and not q:
        return []
    query = "?order=created_at.desc&limit=25&select=*,estimates(project_id,projects(name))"
    if cost_code_id:
        query += f"&cost_code_id=eq.{cost_code_id}"
    if q:
        escaped = q.replace(",", "").replace("(", "").replace(")", "")
        query += f"&or=(title.ilike.*{escaped}*,description.ilike.*{escaped}*)"
    if exclude_estimate_id:
        query += f"&estimate_id=neq.{exclude_estimate_id}"
    rows = await db_get("estimate_line_items", query)
    results = []
    for r in rows:
        est = r.get("estimates") or {}
        proj = est.get("projects") or {}
        results.append(
            LineItemReference(
                id=r["id"],
                estimate_id=r["estimate_id"],
                project_name=(proj.get("name") or "").split("|")[0].strip() or None,
                title=r["title"],
                description=r.get("description"),
                quantity=r["quantity"],
                unit=r.get("unit"),
                unit_cost=r["unit_cost"],
                cost_type=r["cost_type"],
                builder_cost=r["builder_cost"],
                markup_type=r["markup_type"],
                markup_value=r["markup_value"],
                owner_price=r["owner_price"],
                estimated_days=r.get("estimated_days"),
                notes_internal=r.get("notes_internal"),
                notes_external=r.get("notes_external"),
                created_at=r["created_at"],
            )
        )
    return results


@router.get("/{estimate_id}", response_model=EstimateOut)
async def get_estimate(estimate_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("estimates", f"?id=eq.{estimate_id}&select=*,projects(name)")
    if not rows:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return rows[0]


@router.post("", response_model=EstimateOut)
async def create_estimate(body: EstimateCreate, _: CurrentUser = Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    if "closing_text" not in data or "introductory_text" not in data:
        defaults = await get_or_create_estimate_text_defaults()
        data.setdefault("closing_text", defaults.get("closing_text") or DEFAULT_CLOSING_TEXT)
        data.setdefault("introductory_text", defaults.get("introductory_text"))
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
    if items:
        await db_post_many(
            "estimate_line_items",
            [
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
                }
                for item in items
            ],
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

    who = client_name or project_name
    breadcrumb = who + (f" | {project_name}" if project_name and project_name != who else "")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    styles = getSampleStyleSheet()
    wordmark_h1 = ParagraphStyle("wordmark_h1", parent=styles["Heading1"], fontSize=14, alignment=1, spaceBefore=4, spaceAfter=1)
    company_line = ParagraphStyle("company_line", parent=styles["Normal"], fontSize=8, alignment=1, textColor=colors.grey, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10.5, spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=8.5, leading=11.5)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=7.8, leading=10)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    small_right = ParagraphStyle("small_right", parent=small, alignment=2)
    title_style = ParagraphStyle("title", parent=styles["Normal"], fontSize=13, spaceBefore=6, spaceAfter=2, fontName="Helvetica-Bold")

    # Centered logo + wordmark + company contact line -- matches the
    # BuilderTrend reference proposal's header layout.
    elements = [
        Image(branding.LOGO_PATH, width=0.55 * inch, height=0.55 * inch, hAlign="CENTER"),
        Paragraph("Mud &amp; Marble", wordmark_h1),
        Paragraph(branding.COMPANY_ADDRESS_LINE, company_line),
    ]

    # Left: who this proposal is for. Right: print date. Same row, small text --
    # matches the reference's breadcrumb + print-date line above the title.
    print_date = datetime.now()
    header_row = Table(
        [[
            Paragraph(breadcrumb, small),
            Paragraph(f"Print Date: {print_date.month}-{print_date.day}-{print_date.year}", small_right),
        ]],
        colWidths=[4.2 * inch, 3 * inch],
    )
    header_row.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    elements.append(header_row)
    elements.append(Paragraph(estimate.get("title") or f"Proposal for {breadcrumb}", title_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.lightgrey, spaceAfter=8))

    intro = estimate.get("introductory_text")
    if intro:
        elements.append(Paragraph(rich_text_to_pdf_markup(intro), body))
        elements.append(Spacer(1, 8))

    for group_name, items in groups.items():
        elements.append(Paragraph(group_name, h2))
        table_data = [["Item", "Description", "Qty/Unit", "Unit Price", "Price"]]
        for item in items:
            cc = item.get("cost_codes")
            item_label = item.get("title") or ""
            if cc:
                item_label += f"<br/><font size=7 color='grey'>{cc.get('code')} - {cc.get('name')}</font>"
            qty_unit = f"{item.get('quantity') or 0:g}" + (f" {item['unit']}" if item.get("unit") else "")
            # Client-facing figures only -- unit_cost/builder_cost are internal
            # margin data and must never appear on anything a client sees.
            # "Unit Price" here is a derived per-unit client price
            # (owner_price / quantity), the same thing BuilderTrend's export
            # shows, not the builder's cost.
            qty = item.get("quantity") or 0
            owner_price = item.get("owner_price") or 0
            client_unit_price = (owner_price / qty) if qty else owner_price
            table_data.append(
                [
                    Paragraph(item_label, cell),
                    Paragraph(item.get("description") or "", cell),
                    qty_unit,
                    f"${client_unit_price:,.2f}",
                    f"${owner_price:,.2f}",
                ]
            )
        t = Table(table_data, colWidths=[1.3 * inch, 2.6 * inch, 0.75 * inch, 0.85 * inch, 0.85 * inch])
        t.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 7.8),
                    ("BACKGROUND", (0, 0), (-1, 0), branding.BRAND_CREAM),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.75, branding.BRAND_BROWN),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        elements.append(t)
        elements.append(Spacer(1, 6))

    total = estimate.get("grand_total_owner_price") or 0
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(f"<b>Total Price: ${total:,.2f}</b>", ParagraphStyle("total", parent=styles["Normal"], fontSize=12, alignment=2)))
    elements.append(Spacer(1, 16))

    closing = estimate.get("closing_text") or DEFAULT_CLOSING_TEXT
    elements.append(Paragraph(rich_text_to_pdf_markup(closing), body))
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
            # Client-facing figures only -- unit_cost/builder_cost are internal
            # margin data and must never appear in anything exported for a
            # client. "Unit Price" is a derived client per-unit price
            # (owner_price / quantity), not the builder's cost.
            qty = item.get("quantity") or 0
            owner_price = item.get("owner_price") or 0
            client_unit_price = (owner_price / qty) if qty else owner_price
            ws.append(
                [
                    item.get("title"),
                    item.get("description"),
                    item.get("quantity"),
                    item.get("unit"),
                    client_unit_price,
                    owner_price,
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
