"""Local storage (SQLite) in ~/.english_coach (or $EC_DATA_DIR). Nothing leaves the computer."""
from __future__ import annotations

import json
import os
import sqlite3
import time
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from .srs import card_key, is_due, is_mastered, new_card
from .textproc import word_count

DATA_DIR = Path(os.environ.get("EC_DATA_DIR", Path.home() / ".english_coach"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, url TEXT, video_id TEXT,
  audio_path TEXT, audio_url TEXT, theme TEXT, level TEXT, lines_json TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, material_id INTEGER, title TEXT, score INTEGER, minutes INTEGER NOT NULL,
  level TEXT, messages INTEGER NOT NULL DEFAULT 0, wpm INTEGER, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
"""


class Store:
    def __init__(self, path: str | Path | None = None):
        if path is None:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            path = DATA_DIR / "english_coach.db"
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    # ---------- settings
    def get(self, key: str, default=None):
        row = self.conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set(self, key: str, value) -> None:
        if value is None:
            self.conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        else:
            self.conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        self.conn.commit()

    # ---------- contents
    def create_material(self, title: str, source: str, lines: list[dict], **kw) -> dict:
        cur = self.conn.execute(
            """INSERT INTO materials (title, source, url, video_id, audio_path, audio_url, theme, level, lines_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, source, kw.get("url"), kw.get("video_id"), kw.get("audio_path"), kw.get("audio_url"),
             kw.get("theme"), kw.get("level"), json.dumps(lines), time.time()))
        self.conn.commit()
        self.set("material", cur.lastrowid)
        return self.material(cur.lastrowid)

    @staticmethod
    def _material(row) -> dict:
        d = dict(row)
        d["lines"] = json.loads(d.pop("lines_json"))
        d["word_count"] = word_count(d["lines"])
        return d

    def material(self, mid: int | None) -> dict | None:
        row = self.conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone() if mid else None
        return self._material(row) if row else None

    def current(self) -> dict | None:
        return self.material(self.get("material"))

    def materials(self) -> list[dict]:
        return [self._material(r) for r in self.conn.execute("SELECT * FROM materials ORDER BY created_at DESC, id DESC")]

    def set_material_level(self, mid: int, level: str) -> None:
        self.conn.execute("UPDATE materials SET level = ? WHERE id = ?", (level, mid))
        self.conn.commit()

    def delete_material(self, mid: int) -> None:
        m = self.material(mid)
        if m and m.get("audio_path"):
            Path(m["audio_path"]).unlink(missing_ok=True)
        self.conn.execute("DELETE FROM materials WHERE id = ?", (mid,))
        self.conn.commit()
        if self.get("material") == mid:
            self.set("material", None)

    # ---------- practice sessions
    def add_session(self, kind: str, minutes: int, material_id=None, title=None, score=None, level=None,
                    messages=0, wpm=None) -> None:
        self.conn.execute(
            "INSERT INTO sessions (kind, material_id, title, score, minutes, level, messages, wpm, at) VALUES (?,?,?,?,?,?,?,?,?)",
            (kind, material_id, title, score, max(1, int(minutes)), level, messages, wpm, time.time()))
        self.conn.commit()
        if level:
            self.set("level", level)

    def sessions(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM sessions ORDER BY at DESC, id DESC")]

    # ---------- vocabulary
    def cards(self) -> list[dict]:
        return [{**json.loads(r["data"]), "id": r["id"]} for r in self.conn.execute("SELECT id, data FROM cards")]

    def add_card(self, front: str, **fields) -> tuple[dict | None, bool]:
        """Adds a card unless the expression is already there. Returns (card, added)."""
        key = card_key(front)
        if not key:
            return None, False
        row = self.conn.execute("SELECT id, data FROM cards WHERE key = ?", (key,)).fetchone()
        if row:
            return {**json.loads(row["data"]), "id": row["id"]}, False
        card = new_card({"front": front.strip(), **fields, "key": key})
        cur = self.conn.execute("INSERT INTO cards (key, data) VALUES (?, ?)", (key, json.dumps(card)))
        self.conn.commit()
        return {**card, "id": cur.lastrowid}, True

    def save_card(self, card: dict) -> None:
        data = {k: v for k, v in card.items() if k != "id"}
        self.conn.execute("UPDATE cards SET data = ? WHERE id = ?", (json.dumps(data), card["id"]))
        self.conn.commit()

    def delete_card(self, cid: int) -> None:
        self.conn.execute("DELETE FROM cards WHERE id = ?", (cid,))
        self.conn.commit()

    def add_corrections(self, corrections: list[dict], source: str) -> int:
        n = 0
        for c in corrections:
            _, added = self.add_card(c["better"], kind="correction", back=c["original"], meaning=c.get("why", ""), source=source)
            n += added
        return n

    # ---------- progress
    def stats(self) -> dict:
        ss, cards = self.sessions(), self.cards()
        titles = {m["id"]: m["title"] for m in self.materials()}
        day = lambda ts: datetime.fromtimestamp(ts).date().isoformat()
        activity = Counter(day(s["at"]) for s in ss)
        activity.update(day(c["last_review"]) for c in cards if c.get("last_review"))
        streak, d = 0, date.today()
        if not activity.get(d.isoformat()):
            d -= timedelta(days=1)  # today may still be empty
        while activity.get(d.isoformat()):
            streak += 1
            d -= timedelta(days=1)
        spoken = [s["wpm"] for s in ss if s["wpm"]]
        return {
            "level": self.get("level"),
            "total_minutes": sum(s["minutes"] for s in ss),
            "materials": len({s["material_id"] for s in ss if s["material_id"]}),
            "exercises": sum(1 for s in ss if s["kind"] not in ("coach", "conversation")),
            "conversations": sum(1 for s in ss if s["kind"] in ("coach", "conversation")),
            "messages": sum(s["messages"] for s in ss),
            "avg_wpm": round(sum(spoken) / len(spoken)) if spoken else None,
            "first_at": ss[-1]["at"] if ss else None,
            "streak": streak,
            "curve": [{"at": s["at"], "level": s["level"]} for s in reversed(ss) if s["level"]],
            "activity": dict(activity),
            "history": [{**s, "title": s["title"] or titles.get(s["material_id"], "—")} for s in ss[:60]],
            "cards": {"total": len(cards), "due": sum(1 for c in cards if is_due(c)), "mastered": sum(1 for c in cards if is_mastered(c))},
        }

    # ---------- backup
    def export(self) -> dict:
        settings = {r["key"]: json.loads(r["value"]) for r in self.conn.execute("SELECT * FROM settings")}
        return {"app": "english-coach-python", "version": 1, "exported_at": time.time(),
                "materials": [dict(r) for r in self.conn.execute("SELECT * FROM materials")],
                "sessions": self.sessions(), "cards": [dict(r) for r in self.conn.execute("SELECT * FROM cards")],
                "settings": settings}

    def import_(self, data: dict) -> None:
        if not isinstance(data, dict) or data.get("app") != "english-coach-python":
            raise ValueError("Ce fichier n’est pas une sauvegarde English Coach (version Python).")
        with self.conn:
            for t in ("materials", "sessions", "cards", "settings"):
                self.conn.execute(f"DELETE FROM {t}")
            for t in ("materials", "sessions", "cards"):
                allowed = {r["name"] for r in self.conn.execute(f"PRAGMA table_info({t})")}
                for row in data.get(t, []):
                    row = {k: v for k, v in row.items() if k in allowed}  # never trust column names from a file
                    if not row:
                        continue
                    cols = ", ".join(row)
                    self.conn.execute(f"INSERT INTO {t} ({cols}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
            for k, v in data.get("settings", {}).items():
                self.conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))

    def clear(self) -> None:
        with self.conn:
            for t in ("materials", "sessions", "cards", "settings"):
                self.conn.execute(f"DELETE FROM {t}")
