from typing import Literal, Optional, Union

from pydantic import BaseModel

# Every report source maps to one real table, with an explicit whitelist of which
# columns can be filtered/grouped/summed -- the same safety pattern as
# custom_widget_spec.py, extended to raw financial tables for CFO-level reporting
# (custom widgets only read from the dashboard's pre-aggregated summary; reports
# query the underlying ledger/invoice/change-order tables directly).
ReportSource = Literal["transactions", "invoices", "change_orders", "projects"]

SOURCE_CONFIG: dict[str, dict] = {
    "transactions": {
        "table": "transactions",
        "select": "*,projects(name),cost_codes(code,name)",
        "filter_fields": {
            "transaction_type", "vendor", "payment_source", "is_allowance", "is_change_order",
            "project_id", "cost_code_id", "transaction_date", "amount",
        },
        "group_fields": {"project", "cost_code", "vendor", "transaction_type", "month"},
        "numeric_fields": {"amount"},
        "date_field": "transaction_date",
    },
    "invoices": {
        "table": "invoices",
        "select": "*,projects(name)",
        "filter_fields": {"invoice_type", "status", "project_id", "issued_at", "due_date", "amount_due", "amount_paid"},
        "group_fields": {"project", "status", "invoice_type", "month"},
        "numeric_fields": {"amount_due", "amount_paid"},
        "date_field": "issued_at",
    },
    "change_orders": {
        "table": "change_orders",
        "select": "*,projects(name)",
        "filter_fields": {"co_type", "status", "discovered_by", "project_id", "created_at", "owner_price", "builder_cost"},
        "group_fields": {"project", "status", "co_type", "month"},
        "numeric_fields": {"owner_price", "builder_cost"},
        "date_field": "created_at",
    },
    "projects": {
        "table": "projects",
        "select": "*",
        "filter_fields": {"status", "health_status", "project_type", "city", "state", "created_at", "contract_value"},
        "group_fields": {"status", "health_status", "project_type"},
        "numeric_fields": {"contract_value"},
        "date_field": "created_at",
    },
}


class ReportFilter(BaseModel):
    field: str
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains"]
    value: Union[str, float, bool]


class ReportSpec(BaseModel):
    source: ReportSource
    filters: list[ReportFilter] = []
    group_by: str
    aggregation: Literal["sum", "avg", "count"] = "sum"
    aggregation_field: Optional[str] = None
    chart_type: Literal["bar", "line", "pie", "table"] = "bar"


class SpecValidationError(ValueError):
    pass


def validate_spec(spec: ReportSpec) -> None:
    if spec.source not in SOURCE_CONFIG:
        raise SpecValidationError(f"'{spec.source}' is not a valid report source")
    config = SOURCE_CONFIG[spec.source]

    for f in spec.filters:
        if f.field not in config["filter_fields"]:
            raise SpecValidationError(f"'{f.field}' is not filterable on '{spec.source}'")

    if spec.group_by not in config["group_fields"]:
        raise SpecValidationError(f"'{spec.group_by}' is not a valid grouping for '{spec.source}'")

    if spec.aggregation in ("sum", "avg"):
        if not spec.aggregation_field or spec.aggregation_field not in config["numeric_fields"]:
            raise SpecValidationError(f"'{spec.aggregation_field}' is not a numeric field on '{spec.source}'")
