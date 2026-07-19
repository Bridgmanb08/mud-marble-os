from typing import Literal, Optional, Union

from pydantic import BaseModel

# Every source a custom widget can read from is one of the array fields the /api/dashboard
# endpoint already returns to any authenticated user — a custom widget is a different view
# on data already authorized for that user, never a new data source or a new query.
SOURCE_FIELDS: dict[str, set[str]] = {
    "active_projects": {"id", "name", "client_name", "health_status"},
    "upcoming_tasks": {"id", "title", "project_name", "assigned_to", "scheduled_end"},
    "recent_activity": {"id", "author", "note_type", "project_name", "content", "created_at"},
    "contractor_milestones": {"id", "title", "project_name", "assigned_to", "scheduled_end", "days_until_due", "overdue"},
    "client_communications": {"project_id", "project_name", "last_contact_at", "days_since_contact", "overdue"},
    "change_orders_action": {"id", "co_number", "title", "project_name", "status", "hours_since_sent", "sop_breach"},
    "ar_aging_detail": {"project_name", "client_name", "amount_outstanding", "days_overdue"},
    "project_profitability": {"project_id", "project_name", "estimated", "actual_spend", "variance"},
    "design_projects": {"project_id", "project_name", "timeline_pct", "task_completion_pct", "at_risk"},
}

NUMERIC_FIELDS: dict[str, set[str]] = {
    "active_projects": set(),
    "upcoming_tasks": set(),
    "recent_activity": set(),
    "contractor_milestones": {"days_until_due"},
    "client_communications": {"days_since_contact"},
    "change_orders_action": {"co_number", "hours_since_sent"},
    "ar_aging_detail": {"amount_outstanding", "days_overdue"},
    "project_profitability": {"estimated", "actual_spend", "variance"},
    "design_projects": {"timeline_pct", "task_completion_pct"},
}

WidgetSource = Literal[
    "active_projects",
    "upcoming_tasks",
    "recent_activity",
    "contractor_milestones",
    "client_communications",
    "change_orders_action",
    "ar_aging_detail",
    "project_profitability",
    "design_projects",
]


class WidgetFilter(BaseModel):
    field: str
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains"]
    value: Union[str, float, bool]


class CustomWidgetSpec(BaseModel):
    source: WidgetSource
    filters: list[WidgetFilter] = []
    aggregation: Literal["count", "sum", "avg", "list"] = "list"
    aggregation_field: Optional[str] = None


class SpecValidationError(ValueError):
    pass


def validate_spec(spec: CustomWidgetSpec) -> None:
    """Raises SpecValidationError if the spec references anything outside the whitelist.

    This is the actual safety boundary for AI-generated widgets: even if the model
    hallucinates a field or source that doesn't exist, this rejects it before it's
    ever saved or rendered — nothing downstream trusts the model's output directly.
    """
    fields = SOURCE_FIELDS[spec.source]
    for f in spec.filters:
        if f.field not in fields:
            raise SpecValidationError(f"'{f.field}' is not a field on '{spec.source}'")

    if spec.aggregation in ("sum", "avg"):
        if not spec.aggregation_field:
            raise SpecValidationError(f"aggregation '{spec.aggregation}' requires aggregation_field")
        if spec.aggregation_field not in NUMERIC_FIELDS[spec.source]:
            raise SpecValidationError(f"'{spec.aggregation_field}' is not a numeric field on '{spec.source}'")
