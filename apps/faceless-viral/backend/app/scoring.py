"""Product scorecard from the Faceless Viral Commerce playbook."""

from __future__ import annotations


def compute_score(
    score_hook: int,
    score_price: int,
    score_problem: int,
    score_margin: int,
    score_social: int,
) -> int:
    parts = [score_hook, score_price, score_problem, score_margin, score_social]
    for value in parts:
        if value < 0 or value > 2:
            raise ValueError("Each score criterion must be 0, 1, or 2")
    return sum(parts)


def decision_from_score(score: int) -> str:
    """Return produce | archive suggestion. Researcher confirms."""
    return "produce" if score >= 7 else "archive"


def score_breakdown(
    score_hook: int,
    score_price: int,
    score_problem: int,
    score_margin: int,
    score_social: int,
) -> dict:
    total = compute_score(
        score_hook, score_price, score_problem, score_margin, score_social
    )
    return {
        "score_hook": score_hook,
        "score_price": score_price,
        "score_problem": score_problem,
        "score_margin": score_margin,
        "score_social": score_social,
        "score": total,
        "decision": decision_from_score(total),
        "threshold": 7,
    }
