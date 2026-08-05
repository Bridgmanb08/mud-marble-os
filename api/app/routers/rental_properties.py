import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import (
    RentalPropertyCreate,
    RentalPropertyOut,
    RentalPropertyUpdate,
    RentalPropertyVisitCreate,
    RentalPropertyVisitOut,
    RentalPropertyVisitUpdate,
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


def _attach_financials(prop: dict) -> dict:
    """Equity and estimated cash flow are computed from the underlying
    numbers, not stored -- same convention as lease_status/is_late (derive
    rather than trust a value that can drift). Both are None (not 0) when
    there isn't enough information to compute them, so the frontend can tell
    "unknown" apart from "actually zero"."""
    value = prop.get("purchase_value")
    debt = prop.get("debt")
    prop["equity"] = (value - debt) if value is not None and debt is not None else None

    target_rent = prop.get("target_monthly_rent")
    if target_rent is None:
        prop["estimated_monthly_cash_flow"] = None
    else:
        carrying_costs = sum(
            prop.get(field) or 0
            for field in (
                "taxes_monthly",
                "insurance_monthly",
                "other_expenses_monthly",
                "mortgage_payment",
                "maintenance_monthly",
                "mowing_monthly",
                "utilities_monthly",
            )
        )
        prop["estimated_monthly_cash_flow"] = round(target_rent - carrying_costs, 2)
    return prop


async def _last_visited_by_property(property_ids: list[str]) -> dict[str, str]:
    """Most recent visited_at per property, derived from the visit log rather
    than a single mutable column -- same reasoning as _active_lease_by_unit
    above (derive current state from an event log, don't trust one field)."""
    if not property_ids:
        return {}
    visits = await db_get(
        "rental_property_visits",
        f"?property_id=in.({','.join(property_ids)})&select=property_id,visited_at&order=visited_at.desc",
    )
    latest: dict[str, str] = {}
    for v in visits:
        latest.setdefault(v["property_id"], v["visited_at"])  # first hit per id is the max, since sorted desc
    return latest


def _attach_visit_info(prop: dict, last_visited_by_property: dict[str, str]) -> dict:
    last_visited = last_visited_by_property.get(prop["id"])
    prop["last_visited_at"] = last_visited
    prop["days_since_visit"] = (date.today() - date.fromisoformat(last_visited)).days if last_visited else None
    return prop


async def _enrich_properties(rows: list[dict]) -> list[RentalPropertyOut]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    units, last_visited_by_property = await asyncio.gather(
        db_get("rental_units", f"?property_id=in.({','.join(ids)})&select=*&order=unit_label.asc"),
        _last_visited_by_property(ids),
    )
    active_by_unit = await _active_lease_by_unit([u["id"] for u in units])

    units_by_property: dict[str, list[dict]] = {}
    for u in units:
        units_by_property.setdefault(u["property_id"], []).append(_attach_unit_occupancy(u, active_by_unit))

    return [
        RentalPropertyOut(**_attach_visit_info(_attach_financials(r), last_visited_by_property), units=units_by_property.get(r["id"], []))
        for r in rows
    ]


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


@router.get("/{property_id}/visits", response_model=list[RentalPropertyVisitOut])
async def list_visits(property_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("rental_property_visits", f"?property_id=eq.{property_id}&order=visited_at.desc")


@router.post("/{property_id}/visits", response_model=RentalPropertyVisitOut)
async def log_visit(property_id: str, body: RentalPropertyVisitCreate, _: CurrentUser = Depends(get_current_user)):
    data = {
        "property_id": property_id,
        "visited_at": body.visited_at or date.today().isoformat(),
        "visited_by": body.visited_by,
        "notes": body.notes,
    }
    rows = await db_post("rental_property_visits", data)
    return rows[0]


# exclude_unset so a blank-but-untouched field (e.g. notes left empty on a
# quick pin-icon log) doesn't overwrite a summary added later -- same
# clients/projects/transactions PATCH convention used throughout this app.
@router.patch("/visits/{visit_id}", response_model=RentalPropertyVisitOut)
async def update_visit(visit_id: str, body: RentalPropertyVisitUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("rental_property_visits", visit_id, body.model_dump(exclude_unset=True))
    if not rows:
        raise HTTPException(status_code=404, detail="Visit not found")
    return rows[0]


@router.delete("/visits/{visit_id}")
async def delete_visit(visit_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_property_visits", visit_id)
    return {"ok": True}
