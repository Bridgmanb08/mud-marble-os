from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..mentions import create_mention_notifications
from ..schemas.invoices import EstimateItemForInvoiceOut
from ..schemas.projects import (
    CostCodeVarianceOut,
    CostCodeVarianceRow,
    FinancialSummaryOut,
    ProjectCreate,
    ProjectNoteCreate,
    ProjectNoteOut,
    ProjectOut,
    ProjectUpdate,
)
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_invoicing_estimate(project_id: str, select: str) -> Optional[dict]:
    """The estimate invoicing (financial-summary, the "Add from Estimate"
    picker) should be measured against -- the highest-version APPROVED
    estimate if one exists, since that's what the client actually signed
    off on. Falls back to the highest version overall only when nothing has
    been approved yet (early in the sales process, before there's anything
    better to reference). Previously this always took the highest version
    number regardless of status, which meant an in-progress draft revision
    could silently shadow an already-approved contract for invoicing
    purposes -- a real bug, not a deliberate design choice."""
    approved = await db_get(
        "estimates", f"?project_id=eq.{project_id}&status=eq.approved&order=version.desc&limit=1&select={select}"
    )
    if approved:
        return approved[0]
    latest = await db_get("estimates", f"?project_id=eq.{project_id}&order=version.desc&limit=1&select={select}")
    return latest[0] if latest else None


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    include_archived: bool = False, _: CurrentUser = Depends(get_current_user)
):
    query = "?order=created_at.desc&select=*,clients(id,first_name,last_name,preferred_contact_method,is_advocate,is_repeat_client,notes),sms_contacts(id,phone_number,name)"
    if not include_archived:
        query += "&is_archived=eq.false"
    return await db_get("projects", query)


@router.post("", response_model=ProjectOut)
async def create_project(body: ProjectCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("projects", body.model_dump(exclude_none=True))
    full = await db_get("projects", f"?id=eq.{rows[0]['id']}&select=*,clients(id,first_name,last_name,preferred_contact_method,is_advocate,is_repeat_client,notes),sms_contacts(id,phone_number,name)")
    return full[0]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("projects", f"?id=eq.{project_id}&select=*,clients(id,first_name,last_name,preferred_contact_method,is_advocate,is_repeat_client,notes),sms_contacts(id,phone_number,name)")
    if not rows:
        raise HTTPException(status_code=404, detail="Project not found")
    return rows[0]


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, body: ProjectUpdate, _: CurrentUser = Depends(get_current_user)):
    # exclude_unset (not exclude_none) -- the frontend sends an explicit null to
    # clear a field (e.g. clearing start_date), and that null has to reach the
    # database. exclude_none would silently drop it instead.
    await db_patch("projects", project_id, body.model_dump(exclude_unset=True))
    full = await db_get("projects", f"?id=eq.{project_id}&select=*,clients(id,first_name,last_name,preferred_contact_method,is_advocate,is_repeat_client,notes),sms_contacts(id,phone_number,name)")
    return full[0]


@router.get("/{project_id}/financial-summary", response_model=FinancialSummaryOut)
async def get_financial_summary(project_id: str, _: CurrentUser = Depends(get_current_user)):
    projects = await db_get(
        "projects",
        f"?id=eq.{project_id}&select=checking_balance,credit_card_balance,pending_invoices_manual",
    )
    if not projects:
        raise HTTPException(status_code=404, detail="Project not found")
    project = projects[0]

    estimate = await _get_invoicing_estimate(project_id, select="id,grand_total_owner_price")
    owner_price = (estimate.get("grand_total_owner_price") or 0) if estimate else 0

    line_items = []
    if estimate:
        line_items = await db_get(
            "estimate_line_items", f"?estimate_id=eq.{estimate['id']}&select=builder_cost"
        )
    base_builder_cost = sum(i.get("builder_cost") or 0 for i in line_items)

    approved_cos = await db_get(
        "change_orders", f"?project_id=eq.{project_id}&status=eq.approved&select=owner_price,builder_cost"
    )
    co_owner_price = sum(c.get("owner_price") or 0 for c in approved_cos)
    co_builder_cost = sum(c.get("builder_cost") or 0 for c in approved_cos)

    owner_price += co_owner_price
    builder_cost = base_builder_cost + co_builder_cost
    profit = owner_price - builder_cost

    sub_items = await db_get("project_subcontractor_items", f"?project_id=eq.{project_id}&select=amount")
    contracted_to_subs = sum(i.get("amount") or 0 for i in sub_items)

    sub_transactions = await db_get(
        "transactions", f"?project_id=eq.{project_id}&subcontractor_id=not.is.null&select=amount"
    )
    paid_to_subs = sum(abs(t.get("amount") or 0) for t in sub_transactions)

    # Only invoices actually sent count toward "invoiced" -- a draft that
    # hasn't gone out yet, or one that's been voided, was previously summed
    # in here too, which quietly deflated remaining_to_invoice (the exact
    # number that pre-fills a new invoice's amount) and could cause real
    # under-invoicing.
    existing_invoices = await db_get(
        "invoices", f"?project_id=eq.{project_id}&status=in.(sent,paid,overdue)&select=amount_due"
    )
    invoiced_to_date = sum(i.get("amount_due") or 0 for i in existing_invoices)

    return FinancialSummaryOut(
        owner_price=round(owner_price, 2),
        builder_cost=round(builder_cost, 2),
        profit=round(profit, 2),
        change_order_owner_price=round(co_owner_price, 2),
        change_order_builder_cost=round(co_builder_cost, 2),
        contracted_to_subs=round(contracted_to_subs, 2),
        paid_to_subs=round(paid_to_subs, 2),
        left_to_pay=round(contracted_to_subs - paid_to_subs, 2),
        invoiced_to_date=round(invoiced_to_date, 2),
        remaining_to_invoice=round(owner_price - invoiced_to_date, 2),
        checking_balance=project.get("checking_balance"),
        credit_card_balance=project.get("credit_card_balance"),
        pending_invoices_manual=project.get("pending_invoices_manual"),
    )


@router.get("/{project_id}/estimate-items-for-invoice", response_model=list[EstimateItemForInvoiceOut])
async def get_estimate_items_for_invoice(project_id: str, _: CurrentUser = Depends(get_current_user)):
    """Backs the "Add from Estimate" invoice picker -- every line item on the
    project's current estimate (the highest-version APPROVED one if any
    exists, else the highest version overall -- see _get_invoicing_estimate),
    each annotated with how much of it has already been invoiced across
    every invoice for this project, not just the one being built right now.
    That total is computed live by summing invoice_line_items rather than
    trusting a stored running total, so it can never drift out of sync with
    reality."""
    estimate = await _get_invoicing_estimate(project_id, select="id")
    if not estimate:
        return []
    estimate_id = estimate["id"]

    items = await db_get(
        "estimate_line_items",
        f"?estimate_id=eq.{estimate_id}&order=sort_order.asc&select=*,cost_codes(code,name)",
    )
    if not items:
        return []

    item_ids = ",".join(i["id"] for i in items)
    invoice_items = await db_get(
        "invoice_line_items", f"?source_line_item_id=in.({item_ids})&select=source_line_item_id,amount"
    )
    invoiced_by_item: dict[str, float] = {}
    for ii in invoice_items:
        source_id = ii.get("source_line_item_id")
        if source_id:
            invoiced_by_item[source_id] = invoiced_by_item.get(source_id, 0) + (ii.get("amount") or 0)

    out = []
    for i in items:
        owner_price = i.get("owner_price") or 0
        invoiced_amount = round(invoiced_by_item.get(i["id"], 0), 2)
        invoiced_pct = round((invoiced_amount / owner_price) * 100, 2) if owner_price else 0.0
        out.append(
            EstimateItemForInvoiceOut(
                id=i["id"],
                title=i["title"],
                cost_code_id=i.get("cost_code_id"),
                cost_codes=i.get("cost_codes"),
                cost_type=i.get("cost_type") or "none",
                owner_price=owner_price,
                notes_external=i.get("notes_external"),
                invoiced_amount=invoiced_amount,
                invoiced_pct=invoiced_pct,
                remaining_amount=round(owner_price - invoiced_amount, 2),
            )
        )
    return out


@router.get("/{project_id}/cost-code-variance", response_model=CostCodeVarianceOut)
async def get_cost_code_variance(project_id: str, _: CurrentUser = Depends(get_current_user)):
    """Budget vs. actual, broken down by cost code -- the whole-project total
    already exists in financial-summary, but that alone can't answer "why did
    this job run over": drywall could be way under budget while electrical
    eats the difference, and a single project total hides that entirely.
    Budgeted comes from the same authoritative estimate financial-summary
    uses (see _get_invoicing_estimate); actual comes from real expense
    transactions tagged to this project, the same abs(amount)-for-expenses
    convention already used in dashboard.py's cash-position math."""
    estimate = await _get_invoicing_estimate(project_id, select="id")

    budgeted_by_code: dict[Optional[str], float] = {}
    code_labels: dict[Optional[str], tuple[str, str]] = {}
    if estimate:
        line_items = await db_get(
            "estimate_line_items",
            f"?estimate_id=eq.{estimate['id']}&select=cost_code_id,builder_cost,cost_codes(code,name)",
        )
        for item in line_items:
            cc_id = item.get("cost_code_id")
            budgeted_by_code[cc_id] = budgeted_by_code.get(cc_id, 0) + (item.get("builder_cost") or 0)
            cc = item.get("cost_codes")
            code_labels[cc_id] = (cc["code"], cc["name"]) if cc else ("—", "No cost code")

    actual_by_code: dict[Optional[str], float] = {}
    transactions = await db_get(
        "transactions",
        f"?project_id=eq.{project_id}&transaction_type=eq.expense&select=cost_code_id,amount,cost_codes(code,name)",
    )
    for t in transactions:
        cc_id = t.get("cost_code_id")
        actual_by_code[cc_id] = actual_by_code.get(cc_id, 0) + abs(t.get("amount") or 0)
        if cc_id not in code_labels:
            cc = t.get("cost_codes")
            code_labels[cc_id] = (cc["code"], cc["name"]) if cc else ("—", "No cost code")

    rows: list[CostCodeVarianceRow] = []
    for cc_id in set(budgeted_by_code) | set(actual_by_code):
        budgeted = round(budgeted_by_code.get(cc_id, 0), 2)
        actual = round(actual_by_code.get(cc_id, 0), 2)
        code, name = code_labels.get(cc_id, ("—", "No cost code"))
        rows.append(
            CostCodeVarianceRow(
                cost_code_id=cc_id,
                code=code,
                name=name,
                budgeted=budgeted,
                actual=actual,
                variance=round(actual - budgeted, 2),
                variance_pct=round(((actual - budgeted) / budgeted) * 100, 1) if budgeted else None,
            )
        )
    # Worst overage first -- the whole point of this report is "what's
    # blowing the budget," not an alphabetical cost-code listing.
    rows.sort(key=lambda r: r.variance, reverse=True)

    return CostCodeVarianceOut(
        estimate_id=estimate["id"] if estimate else None,
        rows=rows,
        total_budgeted=round(sum(r.budgeted for r in rows), 2),
        total_actual=round(sum(r.actual for r in rows), 2),
        total_variance=round(sum(r.variance for r in rows), 2),
    )


@router.get("/{project_id}/notes", response_model=list[ProjectNoteOut])
async def list_project_notes(project_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("project_notes", f"?project_id=eq.{project_id}&order=created_at.desc")


@router.post("/{project_id}/notes", response_model=ProjectNoteOut)
async def create_project_note(
    project_id: str, body: ProjectNoteCreate, current_user: CurrentUser = Depends(get_current_user)
):
    rows = await db_post("project_notes", {"project_id": project_id, **body.model_dump()})
    note = rows[0]
    proj = await db_get("projects", f"?id=eq.{project_id}&select=name")
    project_name = proj[0]["name"].split("|")[0].strip() if proj else "a project"
    await create_mention_notifications(
        content=body.content,
        project_id=project_id,
        source_type="project_note",
        source_id=note["id"],
        message=f"{current_user.name or current_user.email} mentioned you in a note on {project_name}",
        exclude_user_id=current_user.id,
    )
    return note
