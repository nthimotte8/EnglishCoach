"""Practice: the current content (player + transcript), exercises, recent contents."""
from datetime import datetime

import streamlit as st

from englishcoach import coach
from englishcoach.textproc import lines_from_sentences, words

from . import common as c

EXERCISES = [
    ("lecture", "Prononciation", "Lis une phrase : chaque mot est analysé, avec réécoute de ta voix."),
    ("repetition", "Mémoire + oral", "Écoute le passage original puis répète-le de mémoire."),
    ("reco", "Compréhension", "Retrouve le passage entendu parmi quatre."),
    ("dictee", "Écoute + écrit", "Écris mot pour mot ce que tu entends."),
    ("trous", "Vocabulaire", "Complète les mots retirés de la phrase."),
]

EXAMPLE = ["So today I want to talk about how habits are formed.", "Most of what we do every day happens on autopilot.",
           "And that is actually a good thing for our brain.", "It saves energy for the decisions that really matter.",
           "But it also means bad habits are hard to break.", "Let me show you a simple way to change that.",
           "Every habit starts with a cue, something that triggers the behaviour.", "Then comes the routine, which is the action itself.",
           "Finally, there is a reward that tells your brain to remember the loop.",
           "If you keep the cue and the reward but change the routine, the habit changes too."]


def wpm(m: dict):
    if m["source"] in ("theme", "example", "text"):
        return None
    timed = [l["sec"] for l in m["lines"] if l["sec"] is not None]
    span = timed[-1] - timed[0] if len(timed) > 1 else 0
    return round(m["word_count"] / (span / 60)) if span > 20 else None


def render():
    db = c.store()
    m = db.current()
    if not m:
        st.title("Bienvenue")
        st.write("Choisis un podcast, une vidéo YouTube, un fichier audio, un texte, ou laisse le coach écrire un texte. "
                 "Tu t’entraînes ensuite à l’écoute et à l’oral, et le coach corrige ton anglais. Tout tourne sur ton ordinateur.")
        col1, col2 = st.columns(2)
        if col1.button("Ajouter un contenu", type="primary", icon=":material/add:", use_container_width=True):
            c.go("nouveau")
        if col2.button("Essayer avec un exemple", use_container_width=True):
            db.create_material("How habits are formed", "example", lines_from_sentences(EXAMPLE), level="B2")
            st.rerun()
        recent(db, None)
        return

    st.caption(c.SOURCE_LABEL.get(m["source"], "Texte") + (f" · {m['theme']}" if m.get("theme") else ""))
    st.title(m["title"])
    c.full_player(m)
    info = [f"Niveau estimé **{m['level'] or '—'}**", f"{m['word_count']} mots"]
    if wpm(m):
        info.insert(1, f"{wpm(m)} mots/min")
    left, right = st.columns([3, 1])
    left.markdown(" · ".join(info))
    if not m["level"] and c.engine_loaded() and right.button("Estimer le niveau"):
        with st.spinner("Estimation…"):
            lvl = coach.estimate_level(c.engine(), m)
        if lvl:
            db.set_material_level(m["id"], lvl)
            st.rerun()

    # the line being replayed, if any
    line = st.session_state.get("play_line")
    if line is not None and line < len(m["lines"]):
        l = m["lines"][line]
        nxt = m["lines"][line + 1]["sec"] if line + 1 < len(m["lines"]) else None
        c.play_segment(m, l["sec"], nxt, l["text"])

    with st.expander(f"Transcription ({len(m['lines'])} lignes)", expanded=True):
        with st.container(height=360):
            for i, l in enumerate(m["lines"][:400]):
                a, b = st.columns([1, 9], vertical_alignment="center")
                if a.button(l["t"] or f"{i + 1:02d}", key=f"line-{i}", help="Écouter cette ligne", use_container_width=True):
                    st.session_state["play_line"] = i
                    st.rerun()
                b.write(l["text"])

    with st.expander("Ajouter des mots à mon carnet"):
        idx = st.selectbox("Ligne", range(len(m["lines"])), format_func=lambda i: m["lines"][i]["text"][:90])
        line_text = m["lines"][idx]["text"]
        picked = st.pills("Mots", [w.strip(".,!?;:\"'()") for w in words(line_text)], selection_mode="multi", key=f"pills-{idx}")
        if st.button("Ajouter au carnet", disabled=not picked):
            added = 0
            for w in picked:
                card, new = db.add_card(w, context=line_text, source=m["title"])
                if new and c.engine_loaded():
                    try:
                        x = coach.explain(c.engine(), w, line_text)
                        db.save_card({**card, "meaning": x["meaning"], "example": x["example"]})
                    except Exception:
                        pass
                added += new
            st.toast(f"{added} mot(s) ajouté(s) au carnet." if added else "Déjà dans ton carnet.")

    st.subheader("Choisir un exercice")
    cols = st.columns(3)
    for k, (kind, skill, hint) in enumerate(EXERCISES):
        with cols[k % 3].container(border=True):
            st.caption(skill.upper())
            st.markdown(f"**{c.EXERCISE_LABEL[kind]}**")
            st.caption(hint)
            if st.button("Commencer", key=f"ex-{kind}", use_container_width=True):
                st.session_state["ex_kind"] = kind
                st.session_state.pop("ex", None)
                c.go("exercice")
    with cols[len(EXERCISES) % 3].container(border=True):
        st.caption("EXPRESSION ORALE")
        st.markdown("**Discuter avec le coach**")
        st.caption("Questions sur ce contenu, corrections et bilan de niveau.")
        if st.button("Ouvrir", key="ex-coach", use_container_width=True):
            c.go("coach")

    if st.button("Changer de contenu", icon=":material/add:"):
        c.go("nouveau")
    recent(db, m["id"])


def recent(db, current_id):
    others = [r for r in db.materials() if r["id"] != current_id][:10]
    if not others:
        return
    st.subheader("Contenus récents")
    for r in others:
        a, b, d = st.columns([6, 1, 1], vertical_alignment="center")
        a.markdown(f"**{r['title']}**  \n:gray[{c.SOURCE_LABEL.get(r['source'], 'Texte')} · {r['word_count']} mots"
                   f"{' · ' + r['level'] if r['level'] else ''} · {datetime.fromtimestamp(r['created_at']):%d/%m}]")
        if b.button("Ouvrir", key=f"open-{r['id']}"):
            db.set("material", r["id"])
            st.session_state.pop("play_line", None)
            st.rerun()
        if d.button("Supprimer", key=f"del-{r['id']}"):
            db.delete_material(r["id"])
            st.rerun()
