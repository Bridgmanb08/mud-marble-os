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
