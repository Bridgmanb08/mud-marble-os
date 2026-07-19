from datetime import datetime
from typing import Optional


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def compute_sop_breach(status: str, sent_at: Optional[str], now: datetime) -> bool:
    """A change order is in SOP breach if it's been sent but not approved/rejected within 24h."""
    sent_dt = parse_dt(sent_at)
    if not sent_dt or status != "sent":
        return False
    hours_since_sent = (now - sent_dt).total_seconds() / 3600
    return hours_since_sent > 24
