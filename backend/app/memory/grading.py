"""Deterministic grading for MCQ and numeric answers."""

import re

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.translate(_BN_DIGITS)).strip().lower().rstrip(".।")


def parse_number(text: str) -> float | None:
    m = re.search(r"-?\d+(?:\.\d+)?", normalize(text).replace(",", ""))
    return float(m.group()) if m else None


def grade_mcq(response: str, answer: str, options: list[str] | None) -> bool:
    r, a = normalize(response), normalize(answer)
    if r == a:
        return True
    # Accept an option letter ("b") or index ("2") when options exist.
    if options:
        letters = "abcdefgh"
        idx = letters.index(r) if len(r) == 1 and r in letters else (int(r) - 1 if r.isdigit() else -1)
        if 0 <= idx < len(options):
            return normalize(options[idx]) == a
    return False


def grade_numeric(response: str, answer: str, rel_tol: float = 1e-3) -> bool:
    r, a = parse_number(response), parse_number(answer)
    if r is None or a is None:
        return False
    return abs(r - a) <= max(rel_tol * abs(a), 1e-9)
