from datetime import datetime, timezone
from typing import Optional


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    # A caller that sends a genuinely offset-naive ISO string (no "Z", no
    # +HH:MM) would otherwise make compute_sop_breach's `now - sent_dt`
    # raise TypeError (can't subtract offset-naive and offset-aware
    # datetimes), 500ing the whole change-orders list for every row, not
    # just the bad one. Assume UTC rather than leaving it naive -- this app
    # writes sent_at as an ISO Z-suffixed timestamp everywhere it sets it.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def compute_sop_breach(status: str, sent_at: Optional[str], now: datetime) -> bool:
    """A change order is in SOP breach if it's been sent but not approved/rejected within 24h."""
    sent_dt = parse_dt(sent_at)
    if not sent_dt or status != "sent":
        return False
    hours_since_sent = (now - sent_dt).total_seconds() / 3600
    return hours_since_sent > 24
