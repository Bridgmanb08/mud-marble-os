import asyncio
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.rentals import RentalDashboardSummary
from ..supabase_client import db_get

router = APIRouter(prefix="/rentals", tags=["rentals"])


def _on_time_rate(payments: list[dict], today: str, window_days: int) -> Optional[float]:
    cutoff = (date.fromisoformat(today) - timedelta(days=window_days)).isoformat()
    due_and_payable = [p for p in payments if cutoff <= p["due_date"] <= today]
    if not due_and_payable:
        return None
    on_time = sum(1 for p in due_and_payable if p.get("paid_date") and p["paid_date"] <= p["due_date"])
    return round(on_time / len(due_and_payable) * 100, 1)


@router.get("/dashboard-summary", response_model=RentalDashboardSummary)
async def get_dashboard_summary(_: CurrentUser = Depends(get_current_user)):
    today = date.today().isoformat()
    horizon_60 = (date.today() + timedelta(days=60)).isoformat()

    payments, leases, work_orders = await asyncio.gather(
        db_get("rental_payments", f"?due_date=lte.{today}&select=due_date,paid_date"),
        db_get("rental_leases", f"?end_date=gte.{today}&end_date=lte.{horizon_60}&select=id"),
        db_get("rental_work_orders", "?status=neq.resolved&select=id"),
    )

    return RentalDashboardSummary(
        on_time_rate_30=_on_time_rate(payments, today, 30),
        on_time_rate_60=_on_time_rate(payments, today, 60),
        on_time_rate_90=_on_time_rate(payments, today, 90),
        leases_expiring_60d=len(leases),
        open_work_orders=len(work_orders),
    )
