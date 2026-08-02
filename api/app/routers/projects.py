from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..mentions import create_mention_notifications
from ..schemas.projects import (
    FinancialSummaryOut,
    ProjectCreate,
    ProjectNoteCreate,
    ProjectNoteOut,
    ProjectOut,
    ProjectUpdate,
)
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/projects", tags=["projects"])


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

    estimates = await db_get(
        "estimates",
        f"?project_id=eq.{project_id}&order=version.desc&limit=1&select=id,grand_total_owner_price",
    )
    owner_price = (estimates[0].get("grand_total_owner_price") or 0) if estimates else 0

    line_items = []
    if estimates:
        line_items = await db_get(
            "estimate_line_items", f"?estimate_id=eq.{estimates[0]['id']}&select=builder_cost"
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

    existing_invoices = await db_get("invoices", f"?project_id=eq.{project_id}&select=amount_due")
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
