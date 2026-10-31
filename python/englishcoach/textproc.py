"""Transcripts, exercises and pronunciation scoring. Pure functions: no I/O, fully unit-tested."""
from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

_TS_ONLY = re.compile(r"^(\d{1,2}:)?\d{1,2}:\d{2}$")
_TS_LEAD = re.compile(r"^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$")
_NOISE = re.compile(r"^\[(music|musique|applause|applaudissements|laughter|rires)\]$", re.I)
_A11Y = re.compile(r"^\d+\s+(seconde?s?|minutes?)", re.I)  # labels in transcripts copied from YouTube
_SENT_END = re.compile(r"[.!?][\"')\]]*$")
_FILLERS = re.compile(r"^(uh+|um+|erm+|euh+|hmm+|ah+)$", re.I)

STOPWORDS = set(
    """the a an and or but so to of in on at for with from by as is are was were be been being it its
    this that these those there their they them we you your our i me my he she his her him have has had
    do does did not no yes can could will would should may might must just very really also than then
    about into over up down out more most some any all what which who when where why how if because like
    get got going one""".split()
)
EXERCISES = ("lecture", "repetition", "reco", "dictee", "trous")


def words(text: str) -> list[str]:
    return [w for w in str(text or "").split() if w]


def norm(word: str) -> str:
    w = str(word).lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9']", "", w)


def word_count(lines: list[dict]) -> int:
    return sum(len(words(l["text"])) for l in lines)


def to_sec(ts: str | None) -> int | None:
    if not ts:
        return None
    total = 0
    for part in ts.split(":"):
        total = total * 60 + int(part)
    return total


def fmt_ts(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 60:02d}:{sec % 60:02d}"


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", "", text)).strip()


def split_sentences(text: str) -> list[str]:
    parts = re.findall(r"[^.!?]+[.!?]+[\"')\]]*|[^.!?]+$", str(text))
    return [p.strip() for p in parts if len(words(p)) >= 2]


def parse_transcript(raw: str) -> list[dict]:
    """Transcript pasted from YouTube (timestamps optional) or plain text -> [{t, sec, text}]."""
    lines = [l.strip() for l in str(raw).replace("\r", "").split("\n") if l.strip()]
    out: list[dict] = []
    pending = None
    for l in lines:
        if _A11Y.match(l):
            continue
        if _TS_ONLY.match(l):
            pending = l
            continue
        m = _TS_LEAD.match(l)
        t, text = None, l
        if m:
            t, text = m.group(1), m.group(2)
        elif pending:
            t = pending
        pending = None
        text = _clean(text)
        if not text or _NOISE.match(text):
            continue
        sec = to_sec(t)
        out.append({"t": fmt_ts(sec) if sec is not None else None, "sec": sec, "text": text})
    if not out:
        return []
    if all(o["t"] is None for o in out):
        return [{"t": None, "sec": None, "text": s} for s in split_sentences(" ".join(o["text"] for o in out))]
    return out


def lines_from_segments(segments: list[dict]) -> list[dict]:
    """Timed snippets ({text, start}) from YouTube or Whisper -> lines."""
    out = []
    for s in segments:
        text = _clean(str(s.get("text", "")))
        if not text or _NOISE.match(text):
            continue
        out.append({"t": fmt_ts(s.get("start", 0)), "sec": int(float(s.get("start", 0))), "text": text})
    return out


def lines_from_timed_words(ws: list[dict]) -> list[dict]:
    """Whisper words [{word, start, end}] -> lines cut at sentence ends, long pauses or 18 words."""
    out, cur = [], []

    def flush():
        if cur:
            sec = int(cur[0]["start"])
            out.append({"t": fmt_ts(sec), "sec": sec, "text": " ".join(w["word"].strip() for w in cur)})
            cur.clear()

    for i, w in enumerate(ws):
        if not w["word"].strip():
            continue
        cur.append(w)
        gap = ws[i + 1]["start"] - w["end"] if i + 1 < len(ws) else 0
        if _SENT_END.search(w["word"].strip()) or len(cur) >= 18 or (gap > 0.8 and len(cur) >= 6):
            flush()
    flush()
    return out


def lines_from_sentences(sentences: list[str]) -> list[dict]:
    """Generated text: estimated speaking time (~150 words/min)."""
    out, sec = [], 0
    for s in sentences:
        s = str(s).strip()
        if not s:
            continue
        out.append({"t": fmt_ts(sec), "sec": sec, "text": s})
        sec += max(3, round(len(words(s)) / 2.5))
    return out


@dataclass
class Unit:
    text: str
    start: int | None  # seconds in the source, when known
    end: int | None


def exercise_units(lines: list[dict]) -> list[Unit]:
    """Sentences when punctuated, otherwise ~14-word chunks; each keeps its time span in the source."""
    tokens = [(w, i) for i, l in enumerate(lines) for w in words(l["text"])]
    if not tokens:
        return []

    def span(chunk):
        first, last = chunk[0][1], chunk[-1][1]
        start = lines[first].get("sec")
        end = lines[last + 1].get("sec") if last + 1 < len(lines) else None
        if end is None and lines[last].get("sec") is not None:
            end = lines[last]["sec"] + 6
        return Unit(" ".join(w for w, _ in chunk), start, end)

    groups, cur = [], []
    for tok in tokens:
        cur.append(tok)
        if _SENT_END.search(tok[0]):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    avg = len(tokens) / len(groups)
    if len(groups) < 2 or avg > 32 or avg < 4:
        groups = [tokens[i : i + 14] for i in range(0, len(tokens), 14)]
    return [span(g) for g in groups if 4 <= len(g) <= 40]


def align(expected: list[str], said: list[str]) -> dict:
    """Word-level LCS alignment between what was expected and what was said."""
    n, m = len(expected), len(said)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i][j] = dp[i + 1][j + 1] + 1 if norm(expected[i]) == norm(said[j]) else max(dp[i + 1][j], dp[i][j + 1])
    ops, i, j = [], 0, 0
    while i < n and j < m:
        if norm(expected[i]) == norm(said[j]):
            ops.append({"kind": "ok", "word": expected[i], "at": j})
            i, j = i + 1, j + 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            ops.append({"kind": "missing", "word": expected[i]})
            i += 1
        else:
            ops.append({"kind": "extra", "word": said[j], "at": j})
            j += 1
    ops += [{"kind": "missing", "word": w} for w in expected[i:]]
    ops += [{"kind": "extra", "word": said[k], "at": k} for k in range(j, m)]
    matches = dp[0][0] if n and m else 0
    return {"ops": ops, "matches": matches, "accuracy": matches / n if n else 0.0,
            "score": matches / max(n, m) if n else 0.0}


def analyse_speech(expected: str, recognized: str, timed: list[dict] | None = None) -> dict:
    """Pronunciation report: recognised words, speaking rate, long pauses (> 0.7 s), hesitations."""
    tw = [w for w in (timed or []) if str(w.get("word", "")).strip()]
    said = [w["word"].strip() for w in tw] if tw else words(recognized)
    a = align(words(expected), said)
    wpm, duration, pauses = None, None, []
    if len(tw) >= 2:
        duration = max(0.1, tw[-1]["end"] - tw[0]["start"])
        wpm = round(len(tw) / (duration / 60))
        for p, q in zip(tw, tw[1:]):
            gap = q["start"] - p["end"]
            if gap > 0.7:
                pauses.append({"after": p["word"].strip(), "seconds": round(gap, 1), "at": p["end"]})
    fillers = sum(1 for w in said if _FILLERS.match(norm(w)))
    fluency = 1.0 if wpm is None else max(0.0, min(1.0, wpm / 110) - 0.05 * len(pauses) - 0.03 * fillers)
    ops = []
    for o in a["ops"]:
        if o.get("at") is not None and o["at"] < len(tw):
            o = {**o, "start": tw[o["at"]]["start"], "end": tw[o["at"]]["end"]}
        ops.append(o)
    to_practise = []
    for o in a["ops"]:
        w = re.sub(r"[^A-Za-z']", "", o["word"])
        if o["kind"] == "missing" and w and w not in to_practise:
            to_practise.append(w)
    return {
        "recognized": recognized.strip(),
        "score": round(100 * (0.8 * a["score"] + 0.2 * fluency)),
        "accuracy": round(a["accuracy"] * 100),
        "wpm": wpm, "duration": duration, "pauses": pauses, "fillers": fillers, "ops": ops,
        "to_practise": to_practise,
    }


def build_exercise(kind: str, units: list[Unit], n: int = 5, rng: random.Random | None = None) -> list[dict]:
    rng = rng or random.Random()
    if kind not in EXERCISES:
        raise ValueError(f"unknown exercise {kind!r}")
    if len(units) < 2:
        return []
    items = []
    for u in rng.sample(units, min(n, len(units))):
        item = {"text": u.text, "start": u.start, "end": u.end}
        if kind == "reco":
            others = [o.text for o in units if o.text != u.text]
            opts = [u.text] + rng.sample(others, min(3, len(others)))
            rng.shuffle(opts)
            item["options"] = opts
        elif kind == "trous":
            ws = words(u.text)
            cand = [i for i, w in enumerate(ws) if len(norm(w)) >= 4 and norm(w) not in STOPWORDS]
            k = 3 if len(ws) > 14 else 2
            blanks = sorted(rng.sample(cand, min(k, len(cand)))) if cand else [max(range(len(ws)), key=lambda i: len(norm(ws[i])))]
            item.update(words=ws, blanks=blanks,
                        answers=[re.sub(r"^[^A-Za-z0-9']+|[^A-Za-z0-9']+$", "", ws[i]) for i in blanks])
        items.append(item)
    return items


def extract_json(text: str):
    """One JSON value from a model reply: whole text, a ``` fence, or the first {...}."""
    t = str(text).strip()
    try:
        return json.loads(t)
    except ValueError:
        pass
    fence = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    if fence:
        try:
            return json.loads(fence.group(1))
        except ValueError:
            pass
    s, e = t.find("{"), t.rfind("}")
    if 0 <= s < e:
        try:
            return json.loads(t[s : e + 1])
        except ValueError:
            pass
    raise ValueError("Le coach a donné une réponse illisible. Réessaie.")


_ESC = {"n": "\n", "t": "\t", "r": "", '"': '"', "\\": "\\", "/": "/", "b": "", "f": ""}


def partial_field(text: str, field: str) -> tuple[str, bool]:
    """Reads a string field from JSON still being generated: ('Hello, ho', False)."""
    m = re.search(rf'"{re.escape(field)}"\s*:\s*"', text)
    if not m:
        return "", False
    out, i = [], m.end()
    while i < len(text):
        c = text[i]
        if c == '"':
            return "".join(out), True
        if c == "\\":
            if i + 1 >= len(text):
                break
            n = text[i + 1]
            if n == "u":
                hx = text[i + 2 : i + 6]
                if len(hx) < 4:
                    break
                out.append(chr(int(hx, 16)))
                i += 6
                continue
            out.append(_ESC.get(n, n))
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out), False


def youtube_id(url: str) -> str | None:
    m = re.search(r"(?:youtu\.be/|v=|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})", url or "")
    if m:
        return m.group(1)
    return url if re.fullmatch(r"[A-Za-z0-9_-]{11}", url or "") else None
