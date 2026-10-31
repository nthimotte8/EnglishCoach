"""Spaced repetition for the vocabulary notebook (simplified SM-2). Times are Unix seconds."""
from __future__ import annotations

import re
import time

DAY = 86400
GRADES = [(0, "À revoir", "< 10 min"), (1, "Difficile", ""), (2, "Bien", ""), (3, "Facile", "")]


def card_key(front: str) -> str:
    """Normalised key so the same expression is not added twice."""
    s = str(front).lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", "", s)).strip()


def new_card(fields: dict, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    return {"ease": 2.5, "interval": 0, "reps": 0, "lapses": 0, "due": now, "created_at": now, "last_review": None,
            "kind": "word", "back": "", "meaning": "", "example": "", "context": "", "source": "", **fields}


def review(card: dict, grade: int, now: float | None = None) -> dict:
    """Card after a review graded 0 (forgot) to 3 (easy)."""
    now = time.time() if now is None else now
    c = {**card, "last_review": now}
    if grade == 0:
        c.update(reps=0, lapses=c["lapses"] + 1, interval=0, ease=max(1.3, c["ease"] - 0.2), due=now + 600)
        return c
    c["ease"] = max(1.3, c["ease"] + (-0.15 if grade == 1 else 0.15 if grade == 3 else 0))
    if c["reps"] == 0:
        c["interval"] = 4 if grade == 3 else 1
    elif c["reps"] == 1:
        c["interval"] = 3 if grade == 1 else 8 if grade == 3 else 6
    else:
        c["interval"] = round(c["interval"] * (1.2 if grade == 1 else c["ease"] * (1.3 if grade == 3 else 1)))
    c["interval"] = min(c["interval"], 365)
    c["reps"] += 1
    c["due"] = now + c["interval"] * DAY
    return c


def is_due(card: dict, now: float | None = None) -> bool:
    return card["due"] <= (time.time() if now is None else now)


def is_mastered(card: dict) -> bool:
    return card["reps"] >= 3 and card["interval"] >= 21


def due_cards(cards: list[dict], now: float | None = None, limit: int = 20) -> list[dict]:
    now = time.time() if now is None else now
    return sorted((c for c in cards if c["due"] <= now), key=lambda c: c["due"])[:limit]


def lev(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def check_answer(guess: str, answer: str) -> str:
    """'exact', 'almost' (one small typo per 6 letters) or 'wrong'."""
    from .textproc import norm, words

    x, y = " ".join(norm(w) for w in words(guess)), " ".join(norm(w) for w in words(answer))
    if x == y:
        return "exact"
    return "almost" if lev(x, y) <= max(1, len(y) // 6) else "wrong"
