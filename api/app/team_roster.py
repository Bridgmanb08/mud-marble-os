"""Canonical team-member names for task assignment.

Several older code paths (the Fathom transcript-extraction prompt, the
Ask AI create_task tool, hand-typed entries) used a lowercase first-name
shorthand like "shannon" as the assignee. That silently breaks anything
that matches a person's own tasks by exact name -- TeamReminders' "is this
my task" check and the team-workload aggregation both compare against
app_users.name (e.g. "Shannon Ingram"), so a task assigned as "shannon"
never matched and just fell through those checks unnoticed.

This is the single source of truth for the real roster and for turning any
known shorthand into the one canonical full name, so the assignee picker
and the normalizer can't drift out of sync with each other.
"""

CANONICAL_NAMES = [
    "Brent Bridgman",
    "Shannon Ingram",
    "Megan Martens",
    "Faith Wyatt",
    "Alex Peralta",
    "Manuel Alvarado",
]

_FIRST_NAME_TO_FULL = {name.split()[0].lower(): name for name in CANONICAL_NAMES}


def normalize_assignee_name(raw):
    """Maps a known first-name shorthand (any case) to the canonical full
    name. Anything else -- an already-correct full name, or someone not on
    the roster (a subcontractor, an installer) -- passes through unchanged."""
    if not raw:
        return raw
    return _FIRST_NAME_TO_FULL.get(raw.strip().lower(), raw)
