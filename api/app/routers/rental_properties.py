import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import (
    RentalPropertyCreate,
    RentalPropertyOut,
    RentalPropertyUpdate,
    RentalUnitCreate,
    RentalUnitOut,
    RentalUnitUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/rental-properties", tags=["rentals"])


async def _active_lease_by_unit(unit_ids: list[str]) -> dict[str, dict]:
    """Today's active lease per unit (if any), keyed by unit_id -- lets unit
    cards show "occupied by X" / "vacant" without a second round trip per unit."""
    if not unit_ids:
        return {}
    today = date.today().isoformat()
    id_filter = ",".join(unit_ids)
    leases = await db_get(
        "rental_leases",
        f"?unit_id=in.({id_filter})&start_date=lte.{today}&end_date=gte.{today}&select=id,unit_id,rental_tenants(name)",
    )
    return {lease["unit_id"]: lease for lease in leases}


def _attach_unit_occupancy(unit: dict, active_by_unit: dict[str, dict]) -> dict:
    active = active_by_unit.get(unit["id"])
    unit["current_lease_id"] = active["id"] if active else None
    unit["current_tenant_name"] = (active.get("rental_tenants") or {}).get("name") if active else None
    return unit


async def _enrich_properties(rows: list[dict]) -> list[RentalPropertyOut]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    units = await db_get("rental_units", f"?property_id=in.({','.join(ids)})&select=*&order=unit_label.asc")
    active_by_unit = await _active_lease_by_unit([u["id"] for u in units])

    units_by_property: dict[str, list[dict]] = {}
    for u in units:
        units_by_property.setdefault(u["property_id"], []).append(_attach_unit_occupancy(u, active_by_unit))

    return [RentalPropertyOut(**r, units=units_by_property.get(r["id"], [])) for r in rows]


@router.get("", response_model=list[RentalPropertyOut])
async def list_properties(include_archived: bool = False, _: CurrentUser = Depends(get_current_user)):
    query = "?order=address.asc"
    if not include_archived:
        query += "&is_archived=eq.false"
    rows = await db_get("rental_properties", query)
    return await _enrich_properties(rows)


@router.post("", response_model=RentalPropertyOut)
async def create_property(body: RentalPropertyCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("rental_properties", body.model_dump())
    enriched = await _enrich_properties(rows)
    return enriched[0]


@router.get("/{property_id}", response_model=RentalPropertyOut)
async def get_property(property_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_properties", f"?id=eq.{property_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    enriched = await _enrich_properties(rows)
    return enriched[0]


@router.patch("/{property_id}", response_model=RentalPropertyOut)
async def update_property(property_id: str, body: RentalPropertyUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_properties", property_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_properties", f"?id=eq.{property_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    enriched = await _enrich_properties(rows)
    return enriched[0]


@router.delete("/{property_id}")
async def delete_property(property_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_properties", property_id)
    return {"ok": True}


@router.get("/{property_id}/units", response_model=list[RentalUnitOut])
async def list_units(property_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_units", f"?property_id=eq.{property_id}&order=unit_label.asc")
    active_by_unit = await _active_lease_by_unit([u["id"] for u in rows])
    return [_attach_unit_occupancy(u, active_by_unit) for u in rows]


@router.post("/{property_id}/units", response_model=RentalUnitOut)
async def create_unit(property_id: str, body: RentalUnitCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("rental_units", {**body.model_dump(), "property_id": property_id})
    return RentalUnitOut(**rows[0])


@router.patch("/units/{unit_id}", response_model=RentalUnitOut)
async def update_unit(unit_id: str, body: RentalUnitUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_units", unit_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_units", f"?id=eq.{unit_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Unit not found")
    return RentalUnitOut(**rows[0])


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_units", unit_id)
    return {"ok": True}
