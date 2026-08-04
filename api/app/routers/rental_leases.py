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


async def _ensure_payments_for_lease(lease: dict) -> None:
    """Lazily backfills the current + next month's rental_payments row for a
    lease if missing, rather than requiring a scheduled job -- this repo has
    no Vercel Cron configured, and every other recurring time-based feature
    (Phase 13's daily briefings) already follows this compute/backfill-on-read
    pattern. Only generates due dates that actually fall within the lease's
    term -- a lease that hasn't started yet or has already ended shouldn't
    get payment rows outside its own window."""
    today = date.today()
    targets = [(today.year, today.month)]
    targets.append(_next_month(*targets[0]))

    candidate_due_dates = []
    for year, month in targets:
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
        await db_post(
            "rental_payments",
            {"lease_id": lease["id"], "due_date": due_date, "amount_due": lease["monthly_rent"], "status": "due"},
        )


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
