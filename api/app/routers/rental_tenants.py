from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import RentalTenantCreate, RentalTenantOut, RentalTenantUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/rental-tenants", tags=["rentals"])


@router.get("", response_model=list[RentalTenantOut])
async def list_tenants(_: CurrentUser = Depends(get_current_user)):
    return await db_get("rental_tenants", "?order=name.asc")


@router.post("", response_model=RentalTenantOut)
async def create_tenant(body: RentalTenantCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("rental_tenants", body.model_dump())
    return rows[0]


@router.patch("/{tenant_id}", response_model=RentalTenantOut)
async def update_tenant(tenant_id: str, body: RentalTenantUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_tenants", tenant_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_tenants", f"?id=eq.{tenant_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return rows[0]


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_tenants", tenant_id)
    return {"ok": True}
