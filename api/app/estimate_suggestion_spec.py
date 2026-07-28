from .ai_provider import EstimateSuggestion


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
