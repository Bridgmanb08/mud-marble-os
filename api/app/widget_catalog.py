WIDGET_IDS = [
    "key_metrics",
    "active_project_health",
    "upcoming_tasks",
    "recent_activity",
    "fathom_import",
    "contractor_milestones",
    "client_communications",
    "change_orders_action",
    "ar_aging",
    "project_profitability",
    "qbo_sync",
    "cash_position",
    "alex_cost",
    "design_projects",
]

# Per role: default widget order (also determines which are visible by default).
ROLE_DEFAULTS = {
    "owner": [
        "key_metrics",
        "active_project_health",
        "change_orders_action",
        "upcoming_tasks",
        "recent_activity",
        "fathom_import",
    ],
    "ops": [
        "contractor_milestones",
        "active_project_health",
        "client_communications",
        "change_orders_action",
        "upcoming_tasks",
        "fathom_import",
        "recent_activity",
    ],
    "cfo": [
        "ar_aging",
        "project_profitability",
        "qbo_sync",
        "cash_position",
        "alex_cost",
        "key_metrics",
        "recent_activity",
    ],
    "assistant": [
        "upcoming_tasks",
        "fathom_import",
        "client_communications",
        "recent_activity",
        "key_metrics",
    ],
    "design": [
        "design_projects",
        "upcoming_tasks",
        "recent_activity",
    ],
    "member": [
        "key_metrics",
        "active_project_health",
        "upcoming_tasks",
        "recent_activity",
        "fathom_import",
    ],
}


def default_widgets_for_role(role: str) -> list[dict]:
    ids = ROLE_DEFAULTS.get(role, ROLE_DEFAULTS["member"])
    return [{"id": w, "visible": True} for w in ids]
