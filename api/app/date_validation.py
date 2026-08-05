from typing import Optional


def check_date_order(start: Optional[str], end: Optional[str], label: str = "End date") -> None:
    """Shared by every schema with a start/end date pair (tasks, projects,
    rental leases) -- raises if the end is before the start. Only checks
    when both are actually present, since either side may be left blank."""
    if start and end and end < start:
        raise ValueError(f"{label} cannot be before the start date")
