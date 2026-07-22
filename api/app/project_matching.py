import re
from typing import Optional

STOPWORDS = {"and", "the", "phase", "full", "renovation", "st", "rd", "dr", "ave", "in"}


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOPWORDS and len(t) > 2}


def match_project(text: Optional[str], projects: list[dict]) -> Optional[dict]:
    """Best-effort match of a project mentioned in free text (e.g. an SMS body) against
    project name/address/city. Requires either 2+ overlapping tokens, or 1 overlapping
    token that includes a number (a street number is a strong, low-false-positive signal)."""
    if not text:
        return None
    text_tokens = _tokens(text)
    if not text_tokens:
        return None

    best = None
    best_score = 0
    for p in projects:
        candidate = " ".join(filter(None, [p.get("name"), p.get("address"), p.get("city")]))
        cand_tokens = _tokens(candidate)
        overlap = text_tokens & cand_tokens
        has_number_match = any(t.isdigit() for t in overlap)
        score = len(overlap)
        if score >= 2 or (score >= 1 and has_number_match):
            if score > best_score:
                best_score = score
                best = p
    return best
