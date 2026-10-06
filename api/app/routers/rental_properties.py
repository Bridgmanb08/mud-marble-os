import asyncio
from datetime import date
from typing import Optional

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


def _attach_financials(prop: dict, hide_value_and_equity: bool = False) -> dict:
    """Equity and estimated cash flow are computed from the underlying
    numbers, not stored -- same convention as lease_status/is_late (derive
    rather than trust a value that can drift). Both are None (not 0) when
    there isn't enough information to compute them, so the frontend can tell
    "unknown" apart from "actually zero".

    hide_value_and_equity redacts purchase_value/debt/equity server-side for
    a user with app_users.hide_rental_financials set (e.g. a property
    manager who needs full operational visibility but not ownership
    value/equity) -- redacted here, not just hidden in the frontend, since
    the API must never hand the real numbers to a client that isn't allowed
    to see them. mortgage_payment/interest_rate/lender/loan_number are
    deliberately NOT redacted: they're operational financing details, not
    "value" or "equity", and estimated_monthly_cash_flow's accuracy depends
    on mortgage_payment staying visible."""
    value = prop.get("purchase_value")
    debt = prop.get("debt")
    prop["equity"] = (value - debt) if value is not None and debt is not None else None
    if hide_value_and_equity:
        prop["purchase_value"] = None
        prop["debt"] = None
        prop["equity"] = None

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


def compute_visit_info(
    property_ids: list[str], units: list[dict], visits: list[dict]
) -> tuple[dict[str, Optional[str]], dict[str, dict]]:
    """Last-visit dates per UNIT, plus a per-property summary.

    A visit with a unit_id counts for that unit only. A visit with no unit_id
    was logged before visits were tracked per unit and counts for every unit
    at that address, which is exactly how it behaved then, until someone
    assigns it to a unit.

    The property summary is the unit that has gone longest without a visit
    (never visited counts as longest), because a property needs a visit if
    any one of its units does. A property with no units falls back to its
    latest visit of any kind."""
    visits_by_property: dict[str, list[dict]] = {}
    for v in visits:
        visits_by_property.setdefault(v["property_id"], []).append(v)

    unit_last: dict[str, Optional[str]] = {}
    units_by_property: dict[str, list[dict]] = {}
    for u in units:
        units_by_property.setdefault(u["property_id"], []).append(u)
        best: Optional[str] = None
        for v in visits_by_property.get(u["property_id"], []):
            if v.get("unit_id") in (None, u["id"]) and (best is None or v["visited_at"] > best):
                best = v["visited_at"]
        unit_last[u["id"]] = best

    summary: dict[str, dict] = {}
    for pid in property_ids:
        pid_units = units_by_property.get(pid, [])
        if not pid_units:
            all_dates = [v["visited_at"] for v in visits_by_property.get(pid, [])]
            summary[pid] = {"last_visited_at": max(all_dates) if all_dates else None, "unit_label": None}
            continue
        stalest = min(pid_units, key=lambda u: (unit_last[u["id"]] or "", u.get("unit_label") or ""))
        summary[pid] = {
            "last_visited_at": unit_last[stalest["id"]],
            "unit_label": stalest.get("unit_label") if len(pid_units) > 1 else None,
        }
    return unit_last, summary


async def load_visit_info(
    property_ids: list[str], units: Optional[list[dict]] = None
) -> tuple[dict[str, Optional[str]], dict[str, dict]]:
    if not property_ids:
        return {}, {}
    id_filter = ",".join(property_ids)
    visits_query = f"?property_id=in.({id_filter})&select=property_id,unit_id,visited_at"
    if units is None:
        units, visits = await asyncio.gather(
            db_get("rental_units", f"?property_id=in.({id_filter})&select=id,property_id,unit_label&order=unit_label.asc"),
            db_get("rental_property_visits", visits_query),
        )
    else:
        visits = await db_get("rental_property_visits", visits_query)
    return compute_visit_info(property_ids, units, visits)


def _attach_visit_info(prop: dict, summary: dict[str, dict]) -> dict:
    info = summary.get(prop["id"]) or {}
    last_visited = info.get("last_visited_at")
    prop["last_visited_at"] = last_visited
    prop["days_since_visit"] = (date.today() - date.fromisoformat(last_visited)).days if last_visited else None
    prop["stalest_unit_label"] = info.get("unit_label")
    return prop


async def _enrich_properties(rows: list[dict], hide_value_and_equity: bool = False) -> list[RentalPropertyOut]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    units, visits = await asyncio.gather(
        db_get("rental_units", f"?property_id=in.({','.join(ids)})&select=*&order=unit_label.asc"),
        db_get("rental_property_visits", f"?property_id=in.({','.join(ids)})&select=property_id,unit_id,visited_at"),
    )
    _, visit_summary = compute_visit_info(ids, units, visits)
    active_by_unit = await _active_lease_by_unit([u["id"] for u in units])

    units_by_property: dict[str, list[dict]] = {}
    for u in units:
        units_by_property.setdefault(u["property_id"], []).append(_attach_unit_occupancy(u, active_by_unit))

    return [
        RentalPropertyOut(
            **_attach_visit_info(_attach_financials(r, hide_value_and_equity), visit_summary),
            units=units_by_property.get(r["id"], []),
        )
        for r in rows
    ]


@router.get("", response_model=list[RentalPropertyOut])
async def list_properties(include_archived: bool = False, current_user: CurrentUser = Depends(get_current_user)):
    query = "?order=address.asc"
    if not include_archived:
        query += "&is_archived=eq.false"
    rows = await db_get("rental_properties", query)
    return await _enrich_properties(rows, current_user.hide_rental_financials)


@router.post("", response_model=RentalPropertyOut)
async def create_property(body: RentalPropertyCreate, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_post("rental_properties", body.model_dump())
    enriched = await _enrich_properties(rows, current_user.hide_rental_financials)
    return enriched[0]


@router.get("/{property_id}", response_model=RentalPropertyOut)
async def get_property(property_id: str, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_properties", f"?id=eq.{property_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    enriched = await _enrich_properties(rows, current_user.hide_rental_financials)
    return enriched[0]


@router.patch("/{property_id}", response_model=RentalPropertyOut)
async def update_property(property_id: str, body: RentalPropertyUpdate, current_user: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_properties", property_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_properties", f"?id=eq.{property_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Property not found")
    enriched = await _enrich_properties(rows, current_user.hide_rental_financials)
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


VISIT_SELECT = "*,rental_units(unit_label)"


async def _resolve_visit_unit(property_id: str, unit_id: Optional[str]) -> Optional[str]:
    """Which unit a new visit belongs to. A visit must never again be
    recorded for a whole address by accident, so a property with several
    units has to be told which one; a property with a single unit just
    uses it."""
    units = await db_get("rental_units", f"?property_id=eq.{property_id}&select=id")
    ids = {u["id"] for u in units}
    if unit_id:
        if unit_id not in ids:
            raise HTTPException(status_code=400, detail="That unit doesn't belong to this property.")
        return unit_id
    if len(ids) == 1:
        return next(iter(ids))
    if len(ids) > 1:
        raise HTTPException(status_code=400, detail="Choose which unit this visit was for.")
    return None


@router.get("/{property_id}/visits", response_model=list[RentalPropertyVisitOut])
async def list_visits(property_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "rental_property_visits", f"?property_id=eq.{property_id}&order=visited_at.desc&select={VISIT_SELECT}"
    )


@router.post("/{property_id}/visits", response_model=RentalPropertyVisitOut)
async def log_visit(property_id: str, body: RentalPropertyVisitCreate, _: CurrentUser = Depends(get_current_user)):
    data = {
        "property_id": property_id,
        "unit_id": await _resolve_visit_unit(property_id, body.unit_id),
        "visited_at": body.visited_at or date.today().isoformat(),
        "visited_by": body.visited_by,
        "notes": body.notes,
    }
    rows = await db_post("rental_property_visits", data)
    full = await db_get("rental_property_visits", f"?id=eq.{rows[0]['id']}&select={VISIT_SELECT}")
    return full[0]


# exclude_unset so a blank-but-untouched field (e.g. notes left empty on a
# quick pin-icon log) doesn't overwrite a summary added later -- same
# clients/projects/transactions PATCH convention used throughout this app.
@router.patch("/visits/{visit_id}", response_model=RentalPropertyVisitOut)
async def update_visit(visit_id: str, body: RentalPropertyVisitUpdate, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get("rental_property_visits", f"?id=eq.{visit_id}&select=id,property_id")
    if not existing:
        raise HTTPException(status_code=404, detail="Visit not found")
    updates = body.model_dump(exclude_unset=True)
    # A visit can be moved to a different unit, never back to "no unit" --
    # that's the whole-address behavior this exists to get rid of.
    if "unit_id" in updates:
        if updates["unit_id"] is None:
            del updates["unit_id"]
        else:
            await _resolve_visit_unit(existing[0]["property_id"], updates["unit_id"])
    if updates:
        await db_patch("rental_property_visits", visit_id, updates)
    full = await db_get("rental_property_visits", f"?id=eq.{visit_id}&select={VISIT_SELECT}")
    return full[0]


@router.delete("/visits/{visit_id}")
async def delete_visit(visit_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_property_visits", visit_id)
    return {"ok": True}

