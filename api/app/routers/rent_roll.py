import asyncio
from datetime import date

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import RentRollRow
from ..supabase_client import db_get
from .rental_leases import _ensure_payments_for_lease, _lease_status
from .rental_properties import _last_visited_by_property

router = APIRouter(prefix="/rentals", tags=["rentals"])


@router.get("/rent-roll", response_model=list[RentRollRow])
async def get_rent_roll(_: CurrentUser = Depends(get_current_user)):
    today = date.today().isoformat()
    current_month = today[:7]  # 'YYYY-MM'

    properties, units = await asyncio.gather(
        db_get("rental_properties", "?is_archived=eq.false&select=id,address&order=address.asc"),
        db_get("rental_units", "?select=id,property_id,unit_label&order=unit_label.asc"),
    )
    address_by_property = {p["id"]: p["address"] for p in properties}
    property_ids = list(address_by_property.keys())
    units = [u for u in units if u["property_id"] in address_by_property]

    unit_ids = [u["id"] for u in units]
    leases, last_visited_by_property = await asyncio.gather(
        db_get(
            "rental_leases",
            f"?unit_id=in.({','.join(unit_ids)})&select=*,tenants:rental_tenants(name)" if unit_ids else "?limit=0",
        ),
        _last_visited_by_property(property_ids),
    )

    # Today's active lease per unit -- same "occupied" definition used
    # everywhere else in this module (exactly one current lease per unit,
    # not every lease that's ever existed for it).
    active_lease_by_unit: dict[str, dict] = {}
    for lease in leases:
        if _lease_status(lease["start_date"], lease["end_date"], today) == "active":
            active_lease_by_unit[lease["unit_id"]] = lease

    # Backfill this/next month's payment rows for every active lease before
    # reading them back, same lazy-generation pattern as the per-lease rent
    # ledger -- so a lease nobody's opened individually yet still shows real
    # current-month due amounts here instead of looking falsely current.
    await asyncio.gather(*[_ensure_payments_for_lease(lease) for lease in active_lease_by_unit.values()])

    active_lease_ids = [lease["id"] for lease in active_lease_by_unit.values()]
    payments = (
        await db_get("rental_payments", f"?lease_id=in.({','.join(active_lease_ids)})&select=*")
        if active_lease_ids
        else []
    )
    payments_by_lease: dict[str, list[dict]] = {}
    for p in payments:
        payments_by_lease.setdefault(p["lease_id"], []).append(p)

    def _arrears(lease_id: str) -> tuple[float, float, float, bool]:
        rows = payments_by_lease.get(lease_id, [])
        current_month_due = sum(r["amount_due"] for r in rows if r["due_date"][:7] == current_month)
        current_month_paid = sum((r["amount_paid"] or 0) for r in rows if r["due_date"][:7] == current_month)
        past_due_total = sum(
            max(0.0, r["amount_due"] - (r["amount_paid"] or 0))
            for r in rows
            if r["due_date"][:7] < current_month and r["status"] != "paid"
        )
        current_month_late = any(
            r["due_date"][:7] == current_month and r["due_date"] < today and r["status"] != "paid" for r in rows
        )
        return current_month_due, current_month_paid, past_due_total, (past_due_total > 0 or current_month_late)

    rows: list[RentRollRow] = []
    for u in units:
        lease = active_lease_by_unit.get(u["id"])
        last_visited = last_visited_by_property.get(u["property_id"])
        days_since_visit = (date.fromisoformat(today) - date.fromisoformat(last_visited)).days if last_visited else None

        if lease is None:
            rows.append(
                RentRollRow(
                    property_id=u["property_id"],
                    property_address=address_by_property[u["property_id"]],
                    unit_id=u["id"],
                    unit_label=u["unit_label"],
                    last_visited_at=last_visited,
                    days_since_visit=days_since_visit,
                )
            )
            continue

        current_month_due, current_month_paid, past_due_total, is_late = _arrears(lease["id"])
        rows.append(
            RentRollRow(
                property_id=u["property_id"],
                property_address=address_by_property[u["property_id"]],
                unit_id=u["id"],
                unit_label=u["unit_label"],
                lease_id=lease["id"],
                tenant_name=(lease.get("tenants") or {}).get("name"),
                monthly_rent=lease["monthly_rent"],
                rent_due_day=lease["rent_due_day"],
                lease_status="active",
                current_month_due=current_month_due,
                current_month_paid=current_month_paid,
                past_due_total=past_due_total,
                is_late=is_late,
                last_visited_at=last_visited,
                days_since_visit=days_since_visit,
                lease_end_date=lease["end_date"],
                renewal_status=lease.get("renewal_status", "undecided"),
                renewal_rent_increase=lease.get("renewal_rent_increase"),
            )
        )

    rows.sort(key=lambda r: (r.property_address, r.unit_label))
    return rows
