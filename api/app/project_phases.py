"""Single source of truth for the construction phase list (distinct from
projects.status, which is the sales/pipeline stage -- lead, active, closed,
etc. A project's status stays "active" for basically this entire list; this
is what's happening ON SITE during that time). Mirrored on the frontend in
frontend/src/lib/projectPhases.ts -- kept in sync by hand since this is a
short, stable, app-wide list, not data a user edits."""

PROJECT_PHASES = [
    "pre_construction",
    "demo",
    "foundation",
    "framing",
    "rough_in",
    "insulation",
    "drywall",
    "interior_finishes",
    "exterior",
    "final_punch_list",
    "complete",
]

PROJECT_PHASE_LABEL = {
    "pre_construction": "Pre-Construction",
    "demo": "Demo",
    "foundation": "Foundation",
    "framing": "Framing",
    "rough_in": "Rough-In",
    "insulation": "Insulation",
    "drywall": "Drywall",
    "interior_finishes": "Interior Finishes",
    "exterior": "Exterior",
    "final_punch_list": "Final / Punch List",
    "complete": "Complete",
}


def merge_custom_phases(custom_phases: list[dict]) -> tuple[list[str], dict[str, str]]:
    """custom_phases: a project's `custom_phases` jsonb column -- a list of
    {"key", "label", "after"} dicts, each splicing one one-off phase into the
    default list right after its anchor key. Never stored pre-merged (see the
    migration's comment) so the default list can still evolve later.

    Order among multiple custom phases anchored to the SAME key matters: each
    new one chains after the previous one added there, not always right after
    the anchor itself -- otherwise a second phase added later would jump
    ahead of the first one. `last_inserted` tracks that per anchor."""
    keys = list(PROJECT_PHASES)
    labels = dict(PROJECT_PHASE_LABEL)
    last_inserted: dict[str, str] = {}
    for cp in custom_phases or []:
        key = cp.get("key")
        label = cp.get("label")
        after = cp.get("after")
        if not key or key in keys:
            continue  # no key, or a collision with something already in the list -- skip rather than corrupt ordering
        labels[key] = label or key
        anchor = after if after in keys else (keys[-1] if keys else None)
        if anchor is None:
            keys.append(key)
            continue
        insert_after = last_inserted.get(anchor, anchor)
        keys.insert(keys.index(insert_after) + 1, key)
        last_inserted[anchor] = key
    return keys, labels
