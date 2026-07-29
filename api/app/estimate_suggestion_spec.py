from typing import Optional

from .ai_provider import EstimateSuggestion, GapBranch, GapFollowUp, GapQuestion, GapResolution


def validate_suggestions(
    suggestions: list[EstimateSuggestion], valid_cost_code_ids: set[str]
) -> tuple[list[EstimateSuggestion], list[str]]:
    """Checks each suggestion's cost_code_id against the real, currently-active
    catalog -- the actual safety boundary, since a hallucinated or stale id is
    the one field the model can get wrong even when the JSON shape is valid.

    Unlike custom-widget-spec validation (which rejects an entire spec on one
    bad field, because a widget is a single atomic object), a suggestion list
    is N independent items: one hallucinated cost code shouldn't cost the user
    five other good suggestions. A bad cost_code_id degrades that one field to
    None (with a reason logged) rather than dropping the whole item; only an
    empty title drops the item outright, since it's unusable either way.
    """
    accepted: list[EstimateSuggestion] = []
    dropped: list[str] = []

    for s in suggestions:
        if not s.title.strip():
            dropped.append("a suggestion with an empty title was skipped")
            continue
        if s.cost_code_id and s.cost_code_id not in valid_cost_code_ids:
            dropped.append(f"'{s.title}' referenced a cost code that doesn't exist -- left unassigned")
            s = s.model_copy(update={"cost_code_id": None})
        accepted.append(s)

    return accepted, dropped


def _fix_suggestion(
    suggestion: EstimateSuggestion, valid_cost_code_ids: set[str], dropped: list[str]
) -> Optional[EstimateSuggestion]:
    """Same per-field degradation as validate_suggestions, but applied to one
    suggestion embedded at a specific slot in a gap-check question tree rather
    than a flat list -- an empty title drops just that suggestion (the
    surrounding advice/question text is still worth keeping), and a bad cost
    code degrades to unassigned rather than losing the whole branch."""
    if not suggestion.title.strip():
        dropped.append("a suggested line item with an empty title was dropped (the advice text was kept)")
        return None
    if suggestion.cost_code_id and suggestion.cost_code_id not in valid_cost_code_ids:
        dropped.append(f"'{suggestion.title}' referenced a cost code that doesn't exist -- left unassigned")
        return suggestion.model_copy(update={"cost_code_id": None})
    return suggestion


def _fix_resolution(resolution: GapResolution, valid_cost_code_ids: set[str], dropped: list[str]) -> GapResolution:
    if not resolution.suggestion:
        return resolution
    fixed = _fix_suggestion(resolution.suggestion, valid_cost_code_ids, dropped)
    return resolution.model_copy(update={"suggestion": fixed})


def _fix_branch(branch: GapBranch, valid_cost_code_ids: set[str], dropped: list[str]) -> GapBranch:
    fixed_suggestion = (
        _fix_suggestion(branch.suggestion, valid_cost_code_ids, dropped) if branch.suggestion else None
    )
    fixed_follow_up: Optional[GapFollowUp] = None
    if branch.follow_up:
        fixed_follow_up = branch.follow_up.model_copy(
            update={
                "yes": _fix_resolution(branch.follow_up.yes, valid_cost_code_ids, dropped),
                "no": _fix_resolution(branch.follow_up.no, valid_cost_code_ids, dropped),
            }
        )
    return branch.model_copy(update={"suggestion": fixed_suggestion, "follow_up": fixed_follow_up})


def validate_gap_questions(
    questions: list[GapQuestion], valid_cost_code_ids: set[str]
) -> tuple[list[GapQuestion], list[str]]:
    """Walks a gap-check question tree (up to 6 top-level questions, each with
    a yes/no branch and an optional one-level-deeper follow-up) and applies
    the same graceful, per-suggestion degradation as validate_suggestions at
    every slot a suggestion can appear -- a bad cost code or empty title only
    ever costs that one suggested line item, never the question or advice
    text around it."""
    dropped: list[str] = []
    fixed = [
        q.model_copy(
            update={
                "yes": _fix_branch(q.yes, valid_cost_code_ids, dropped),
                "no": _fix_branch(q.no, valid_cost_code_ids, dropped),
            }
        )
        for q in questions
    ]
    return fixed, dropped
