from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.invoices import InvoiceCreate, InvoiceOut, InvoiceUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceOut])
async def list_invoices(project_id: Optional[str] = None, _: CurrentUser = Depends(get_current_user)):
    query = "?order=created_at.desc&select=*,projects(name)"
    if project_id:
        query += f"&project_id=eq.{project_id}"
    return await db_get("invoices", query)


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
    await db_patch("invoices", invoice_id, body.model_dump(exclude_none=True))
    full = await db_get("invoices", f"?id=eq.{invoice_id}&select=*,projects(name)")
    return full[0]
