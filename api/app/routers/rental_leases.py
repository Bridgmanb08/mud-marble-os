import calendar
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import (
    RentalLeaseCreate,
    RentalLeaseOut,
    RentalLeaseUpdate,
    RentalPaymentOut,
    RentalPaymentUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(tags=["rentals"])

LEASE_SELECT = "*,tenants:rental_tenants(*),rental_units(*)"


def _lease_status(start_date: str, end_date: str, today: Optional[str] = None) -> str:
    today = today or date.today().isoformat()
    if end_date < today:
        return "ended"
    if start_date > today:
        return "upcoming"
    return "active"


def _attach_lease_status(lease: dict) -> dict:
    lease["lease_status"] = _lease_status(lease["start_date"], lease["end_date"])
    return lease


def _is_late(due_date: str, status: str, today: Optional[str] = None) -> bool:
    today = today or date.today().isoformat()
    return due_date < today and status != "paid"


def _attach_is_late(payment: dict) -> dict:
    payment["is_late"] = _is_late(payment["due_date"], payment["status"])
    return payment


@router.get("/rental-leases", response_model=list[RentalLeaseOut])
async def list_leases(
    unit_id: Optional[str] = None,
    property_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    _: CurrentUser = Depends(get_current_user),
):
    query = f"?select={LEASE_SELECT}&order=start_date.desc"
    if unit_id:
        query += f"&unit_id=eq.{unit_id}"
    elif property_id:
        units = await db_get("rental_units", f"?property_id=eq.{property_id}&select=id")
        unit_ids = [u["id"] for u in units]
        if not unit_ids:
            return []
        query += f"&unit_id=in.({','.join(unit_ids)})"
    if tenant_id:
        query += f"&tenant_id=eq.{tenant_id}"
    rows = await db_get("rental_leases", query)
    return [_attach_lease_status(r) for r in rows]


@router.post("/rental-leases", response_model=RentalLeaseOut)
async def create_lease(body: RentalLeaseCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("rental_leases", body.model_dump())
    full = await db_get("rental_leases", f"?id=eq.{rows[0]['id']}&select={LEASE_SELECT}")
    return _attach_lease_status(full[0])


@router.get("/rental-leases/{lease_id}", response_model=RentalLeaseOut)
async def get_lease(lease_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("rental_leases", f"?id=eq.{lease_id}&select={LEASE_SELECT}")
    if not rows:
        raise HTTPException(status_code=404, detail="Lease not found")
    return _attach_lease_status(rows[0])


@router.patch("/rental-leases/{lease_id}", response_model=RentalLeaseOut)
async def update_lease(lease_id: str, body: RentalLeaseUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_leases", lease_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_leases", f"?id=eq.{lease_id}&select={LEASE_SELECT}")
    if not rows:
        raise HTTPException(status_code=404, detail="Lease not found")
    return _attach_lease_status(rows[0])


@router.delete("/rental-leases/{lease_id}")
async def delete_lease(lease_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("rental_leases", lease_id)
    return {"ok": True}


def _due_date_for_month(year: int, month: int, rent_due_day: int) -> str:
    """Clamps rent_due_day to the last real day of the target month (e.g. a
    due-day of 31 in a 30-day month lands on the 30th, not an invalid date)."""
    last_day = calendar.monthrange(year, month)[1]
    day = min(rent_due_day, last_day)
    return date(year, month, day).isoformat()


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _months_through(start_year: int, start_month: int, end_year: int, end_month: int) -> list[tuple[int, int]]:
    """Every (year, month) pair from start through end, inclusive."""
    months = []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        months.append((y, m))
        y, m = _next_month(y, m)
    return months


async def _ensure_payments_for_lease(lease: dict) -> None:
    """Lazily backfills missing rental_payments rows for a lease, rather than
    requiring a scheduled job -- this repo has no Vercel Cron configured, and
    every other recurring time-based feature (Phase 13's daily briefings)
    already follows this compute/backfill-on-read pattern.

    Iterates every month from the LEASE'S OWN START through current+next
    month -- not just "today/today+1" -- and lets the existing-rows check
    below skip whatever's already there. Two real gaps the old
    current/next-only version had: (1) a lease whose start date falls after
    that month's rent_due_day has no valid due date in its first calendar
    month at all, so the actual first real due date is the FOLLOWING month --
    with only "today/today+1" ever considered, that first month's payment
    row could never be created once the calendar moved past it, permanently.
    (2) any month nobody opened the rent roll for was simply never
    generated, with no catch-up mechanism -- arrears silently understated
    what a tenant actually owed. Iterating from lease start makes this
    self-healing: whatever's missing gets backfilled the next time anyone
    looks, regardless of how long the gap was."""
    today = date.today()
    lease_start = date.fromisoformat(lease["start_date"])
    end_year, end_month = _next_month(today.year, today.month)

    candidate_due_dates = []
    for year, month in _months_through(lease_start.year, lease_start.month, end_year, end_month):
        due_date = _due_date_for_month(year, month, lease["rent_due_day"])
        if lease["start_date"] <= due_date <= lease["end_date"]:
            candidate_due_dates.append(due_date)
    if not candidate_due_dates:
        return

    existing = await db_get(
        "rental_payments", f"?lease_id=eq.{lease['id']}&due_date=in.({','.join(candidate_due_dates)})&select=due_date"
    )
    existing_dates = {e["due_date"] for e in existing}
    missing = [d for d in candidate_due_dates if d not in existing_dates]
    for due_date in missing:
        try:
            await db_post(
                "rental_payments",
                {"lease_id": lease["id"], "due_date": due_date, "amount_due": lease["monthly_rent"], "status": "due"},
            )
        except HTTPException:
            # This is a check-then-insert with no locking between the two --
            # a concurrent request backfilling the SAME lease (two people
            # opening its rent ledger at once, or this reading it alongside
            # rent_roll.py's own call) can race past the existing-rows check
            # above and both try to insert the same (lease_id, due_date).
            # The unique constraint on that pair (migration 0043) is what
            # actually keeps the data correct; db_post surfaces that
            # conflict as a generic 502, which used to bubble up as an
            # unhandled failure for whichever request lost the race even
            # though the end state (the row exists) is exactly what was
            # wanted. The caller re-reads rental_payments right after this
            # function returns, so swallowing the loser's failure here is
            # safe -- it'll see the winner's row either way.
            continue


@router.get("/rental-leases/{lease_id}/payments", response_model=list[RentalPaymentOut])
async def list_payments(lease_id: str, _: CurrentUser = Depends(get_current_user)):
    lease_rows = await db_get("rental_leases", f"?id=eq.{lease_id}")
    if not lease_rows:
        raise HTTPException(status_code=404, detail="Lease not found")
    await _ensure_payments_for_lease(lease_rows[0])
    rows = await db_get("rental_payments", f"?lease_id=eq.{lease_id}&order=due_date.desc")
    return [_attach_is_late(r) for r in rows]


@router.patch("/rental-payments/{payment_id}", response_model=RentalPaymentOut)
async def update_payment(payment_id: str, body: RentalPaymentUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("rental_payments", payment_id, body.model_dump(exclude_unset=True))
    rows = await db_get("rental_payments", f"?id=eq.{payment_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Payment not found")
    return _attach_is_late(rows[0])
