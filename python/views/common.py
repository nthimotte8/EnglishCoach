"""Shared helpers for the Streamlit pages: storage, models, players, the coach gate, streaming."""
from __future__ import annotations

import html
import queue
import threading
import time
import uuid
from pathlib import Path

import streamlit as st

from englishcoach import llm, speech
from englishcoach.db import DATA_DIR, Store

EXERCISE_LABEL = {"lecture": "Lecture à voix haute", "repetition": "Répétition sans texte", "reco": "Reconnaissance à l’écoute",
                  "dictee": "Dictée", "trous": "Mots manquants", "coach": "Discussion avec le coach", "conversation": "Conversation libre"}
SOURCE_LABEL = {"youtube": "Vidéo YouTube", "podcast": "Podcast", "file": "Fichier importé", "theme": "Thème",
                "example": "Exemple", "text": "Texte"}


# ---------------------------------------------------------------- storage
@st.cache_resource
def store() -> Store:
    return Store()


def audio_dir() -> Path:
    d = DATA_DIR / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_audio_path(suffix: str) -> Path:
    return audio_dir() / f"{uuid.uuid4().hex}{suffix if suffix.startswith('.') else '.' + suffix}"


def esc(s) -> str:
    return html.escape(str(s or ""))


# ---------------------------------------------------------------- models
@st.cache_resource(max_entries=1, show_spinner=False)
def _engine(tier: str) -> llm.Engine:
    return llm.Engine(tier)


@st.cache_resource(max_entries=1, show_spinner=False)
def _transcriber(quality: str) -> speech.Transcriber:
    return speech.Transcriber(quality)


def tier() -> str:
    return store().get("tier", "leger")


def asr_quality() -> str:
    return store().get("asr", "rapide")


def engine_loaded() -> bool:
    return bool(st.session_state.get("engine_ready_for") == tier())


def engine() -> llm.Engine:
    with st.spinner("Chargement du coach… (la première fois, téléchargement du modèle)"):
        e = _engine(tier())
    st.session_state["engine_ready_for"] = tier()
    return e


def unload_engine() -> None:
    _engine.clear()
    st.session_state.pop("engine_ready_for", None)


def transcriber() -> speech.Transcriber:
    with st.spinner("Chargement de la reconnaissance vocale… (la première fois, téléchargement de Whisper)"):
        return _transcriber(asr_quality())


def coach_gate(compact: bool = False) -> llm.Engine | None:
    """Returns the engine when loaded; otherwise shows a "load" panel and returns None."""
    if engine_loaded():
        return engine()
    t = llm.TIERS[tier()]
    with st.container(border=True):
        st.subheader("Charger le coach" if compact else "Le coach tourne sur ton ordinateur")
        if not compact:
            st.write("C’est un modèle d’IA open source exécuté par Python sur ta machine : gratuit, sans compte, sans clé d’API, "
                     "et tes réponses ne quittent pas ton ordinateur.")
        if tier() != "leger":
            st.warning(f"Le niveau « {t['label']} » demande plus de mémoire. Sur un ordinateur à 8 Go, garde « Léger » "
                       "(page Réglages) en cas de doute.")
        st.caption(f"Niveau : **{t['label']}** · {t['hint']} · moteur : {'MLX (puce Apple)' if llm.apple_silicon() else 'transformers'}")
        if st.button("Charger le coach", type="primary", key=f"gate-{compact}"):
            ok = False
            try:
                engine()
                ok = True
            except Exception as e:  # missing package, no disk space, no memory…
                st.error(f"Le coach n’a pas pu se charger : {e}")
            if ok:
                st.rerun()  # outside the try: Streamlit's rerun signal must not be caught
    return None


def run_streamed(call):
    """Runs call(on_reply) in a thread; returns (generator of reply text deltas, result box)."""
    q: queue.Queue = queue.Queue()
    box: dict = {}

    def on_reply(text: str, done: bool) -> None:
        q.put(("text", text))

    def worker() -> None:
        try:
            box["result"] = call(on_reply)
        except Exception as e:  # shown by the caller
            box["error"] = e
        finally:
            q.put(("end", None))

    threading.Thread(target=worker, daemon=True).start()

    def gen():
        shown = ""
        while True:
            kind, val = q.get()
            if kind == "end":
                break
            if val.startswith(shown) and len(val) > len(shown):
                delta, shown = val[len(shown):], val
                yield delta
        if not shown and "result" in box:
            yield box["result"].get("reply", "")
    return gen, box


# ---------------------------------------------------------------- voice and players
@st.cache_data(show_spinner=False, max_entries=200)
def _tts(text: str, rate: float):
    return speech.tts(text, rate)


def speak(text: str, rate: float = 1.0, autoplay: bool = True, key: str | None = None) -> None:
    out = _tts(text, rate)
    if out:
        st.audio(out[0], format=out[1], autoplay=autoplay)
    else:
        st.caption("Aucune voix de synthèse disponible sur cet ordinateur (installe pyttsx3).")


def play_segment(material: dict, start: int | None, end: int | None, text: str, slow: bool = False) -> None:
    """Replays a passage: the original recording when there is one, otherwise the synthetic voice."""
    if start is not None and not slow:
        stop = int(end) + 1 if end is not None else int(start) + 7
        if material.get("video_id"):
            st.video(f"https://www.youtube.com/watch?v={material['video_id']}", start_time=int(start), end_time=stop, autoplay=True)
            return
        if material.get("audio_path") and Path(material["audio_path"]).exists():
            st.audio(material["audio_path"], start_time=int(start), end_time=stop, autoplay=True)
            return
        if material.get("audio_url"):
            st.audio(material["audio_url"], start_time=int(start), end_time=stop, autoplay=True)
            return
    speak(text, 0.75 if slow else 1.0)


def full_player(material: dict) -> None:
    if material.get("video_id"):
        st.video(f"https://www.youtube.com/watch?v={material['video_id']}")
    elif material.get("audio_path") and Path(material["audio_path"]).exists():
        st.audio(material["audio_path"])
    elif material.get("audio_url"):
        st.audio(material["audio_url"])


def has_media(material: dict) -> bool:
    return bool(material.get("video_id") or material.get("audio_path") or material.get("audio_url"))


# ---------------------------------------------------------------- rendering helpers
def diff_html(ops: list[dict]) -> str:
    colors = {"ok": "#1D6B44", "missing": "#A3241C", "extra": "#5D6975"}
    deco = {"ok": "none", "missing": "underline wavy", "extra": "line-through"}
    spans = [f'<span style="color:{colors[o["kind"]]};text-decoration:{deco[o["kind"]]};text-underline-offset:5px">{esc(o["word"])}</span>'
             for o in ops]
    return f'<div style="font-size:1.25rem;line-height:2">{" ".join(spans)}</div>'


def feedback(fb: dict) -> None:
    with st.container(border=True):
        if fb["corrections"]:
            for c in fb["corrections"]:
                st.markdown(f"<s>{esc(c['original'])}</s> → <b>{esc(c['better'])}</b>"
                            + (f"<br><small>{esc(c['why'])}</small>" if c.get("why") else ""), unsafe_allow_html=True)
            st.caption("Ajouté à ton carnet de vocabulaire.")
        else:
            st.markdown(":green[Aucune erreur, bien joué.]")
        if fb.get("tip"):
            st.caption(fb["tip"])


def evaluation(ev: dict) -> None:
    with st.container(border=True):
        c1, c2 = st.columns(2)
        c1.metric("Niveau estimé", ev["level"] or "—")
        c2.metric("Score", f"{ev['score']} / 100")
        if ev["summary"]:
            st.write(ev["summary"])
        if ev["strengths"]:
            st.markdown("**Points forts**\n" + "\n".join(f"- {s}" for s in ev["strengths"]))
        if ev["work_on"]:
            st.markdown("**À travailler**\n" + "\n".join(f"- {s}" for s in ev["work_on"]))


def minutes_since(t0: float) -> int:
    return max(1, round((time.time() - t0) / 60))


def go(page: str) -> None:
    st.switch_page(PAGES[page])


PAGES: dict = {}  # filled by app.py
