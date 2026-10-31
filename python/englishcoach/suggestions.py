"""Suggestions for every source (podcasts, YouTube, texts, topics, files), ranked by the learner's level.

The catalogue lives in suggestions.json, shared in content with the web version.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from .textproc import LEVELS

_DATA = json.loads((Path(__file__).with_name("suggestions.json")).read_text(encoding="utf-8"))

THEMES: list[tuple[str, str]] = [tuple(t) for t in _DATA["themes"]]
PODCASTS: list[dict] = _DATA["podcasts"]
YOUTUBE: list[dict] = _DATA["youtube"]
TEXT_SITES: list[dict] = _DATA["text_sites"]
TEXTS: list[dict] = _DATA["texts"]
TOPIC_IDEAS: list[dict] = _DATA["topic_ideas"]
FILE_TIPS: list[dict] = _DATA["file_tips"]


def rank_by_level(items: list[dict], level: str | None, theme: str = "tous") -> list[dict]:
    """Closest to the learner's level first; 'fit' marks items within one level of it."""
    li = LEVELS.index(level) if level in LEVELS else -1

    def dist(it):
        return 0 if li < 0 else min(abs(LEVELS.index(l) - li) for l in it["levels"])

    picked = [it for it in items if theme == "tous" or it.get("theme") == theme]
    ranked = [{**it, "fit": dist(it) <= 1, "_rank": dist(it) * 100 + i} for i, it in enumerate(picked)]
    return sorted(ranked, key=lambda x: x["_rank"])


def themes_for(items: list[dict]) -> list[tuple[str, str]]:
    present = {it.get("theme") for it in items}
    return [t for t in THEMES if t[0] == "tous" or t[0] in present]


def youtube_search_url(q: str) -> str:
    """YouTube search restricted to videos with subtitles (needed to get a transcript)."""
    return f"https://www.youtube.com/results?search_query={quote(q)}&sp=EgIoAQ%253D%253D"


def level_tag(it: dict, level: str | None) -> str:
    lv = it["levels"]
    tag = lv[0] if len(lv) == 1 else f"{lv[0]}–{lv[-1]}"
    return tag + (" · hors niveau" if level and not it.get("fit", True) else "")
