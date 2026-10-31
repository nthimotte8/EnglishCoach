"""Vocabulary notebook with spaced-repetition review."""
import re
import time
from datetime import datetime

import streamlit as st

from englishcoach import coach
from englishcoach.srs import DAY, GRADES, check_answer, due_cards, is_mastered, review

from . import common as c


def blank(context: str, front: str) -> str:
    if not context:
        return ""
    pattern = re.compile(rf"\b{re.escape(front)}\b", re.I)
    return pattern.sub("_____", context, count=1) if pattern.search(context) else ""


def next_label(due: float) -> str:
    d = due - time.time()
    if d <= 0:
        return "maintenant"
    if d < DAY:
        return "aujourd’hui"
    n = round(d / DAY)
    return "demain" if n == 1 else f"dans {n} j"


def render():
    db = c.store()
    st.title("Vocabulaire")
    st.caption("Les mots que tu ajoutes et les corrections du coach reviennent au bon moment pour que tu les retiennes.")
    cards = db.cards()
    review_tab, book_tab = st.tabs([f"Réviser ({len(due_cards(cards, limit=999))})", f"Carnet ({len(cards)})"])
    with review_tab:
        review_session(db, cards)
    with book_tab:
        notebook(db, cards)


def review_session(db, cards):
    rs = st.session_state.get("review")
    if rs is None:
        rs = {"queue": [card["id"] for card in due_cards(cards)], "i": 0, "right": 0, "shown": None, "mic": 0}
        st.session_state["review"] = rs
    if rs["i"] >= len(rs["queue"]):
        if rs["queue"]:
            st.success(f"Révision terminée : {rs['right']} / {len(rs['queue'])} retrouvé(s) du premier coup.")
        else:
            st.info("Rien à réviser pour le moment. Ajoute des mots depuis une transcription, ou laisse le coach y mettre ses corrections.")
        if st.button("Nouvelle session de révision"):
            st.session_state.pop("review", None)
            st.rerun()
        return
    by_id = {card["id"]: card for card in cards}
    card = by_id.get(rs["queue"][rs["i"]])
    if not card:
        rs["i"] += 1
        st.rerun()
    st.progress(rs["i"] / len(rs["queue"]), text=f"{rs['i'] + 1} / {len(rs['queue'])}")
    is_corr = card.get("kind") == "correction"
    hidden = "" if is_corr else blank(card.get("context", ""), card["front"])
    with st.container(border=True):
        if is_corr:
            st.caption("Comment le dire correctement ?")
            st.markdown(f"### ~~{card.get('back', '')}~~")
            if card.get("meaning"):
                st.caption(card["meaning"])
        else:
            st.caption("Retrouve l’expression anglaise")
            if card.get("meaning"):
                st.markdown(f"### {card['meaning']}")
            if hidden:
                st.write(f"« {hidden} »")
            if not card.get("meaning") and not hidden:
                st.markdown(f"### {card['front']}")
                st.caption("Tu te souviens de son sens ?")

        if rs["shown"] is None:
            can_answer = is_corr or card.get("meaning") or hidden
            if can_answer:
                guess = st.text_input("Ta réponse", key=f"g-{card['id']}-{rs['i']}")
                spoken = st.audio_input("Ou dis-la", key=f"m-{card['id']}-{rs['mic']}")
                if spoken is not None:
                    guess = c.transcriber().transcribe(spoken.getvalue(), words=False)["text"].strip(" .!?")
                    st.caption(f"Entendu : « {guess} »")
                a, b = st.columns(2)
                if a.button("Vérifier", type="primary", disabled=not guess.strip()):
                    rs["shown"] = check_answer(guess, card["front"])
                    rs["mic"] += 1
                    st.rerun()
            else:
                a, b = st.columns(2)
            if b.button("Afficher la réponse"):
                rs["shown"] = "revealed"
                st.rerun()
            return

        verdict = rs["shown"]
        if verdict in ("exact", "almost", "wrong"):
            {"exact": st.success, "almost": st.warning, "wrong": st.error}[verdict](
                {"exact": "Exact", "almost": "Presque", "wrong": "Pas tout à fait"}[verdict])
        st.markdown(f"## {card['front']}")
        c.speak(card["front"], autoplay=False)
        if not is_corr and card.get("meaning"):
            st.write(card["meaning"])
        if card.get("context") and not is_corr:
            st.caption(f"« {card['context']} »")
        if card.get("example"):
            st.caption(f"Ex. : {card['example']}")
        st.caption("Comment ça s’est passé ?")
        suggested = {"exact": 2, "almost": 1, "wrong": 0}.get(verdict, -1)
        cols = st.columns(4)
        for col, (value, label, hint) in zip(cols, GRADES):
            if col.button(label + (f" ({hint})" if hint else ""), key=f"grade-{value}", use_container_width=True,
                          type="primary" if value == suggested else "secondary"):
                updated = review(card, value)
                db.save_card(updated)
                if value >= 2 and verdict != "wrong":
                    rs["right"] += 1
                if value == 0:
                    rs["queue"].append(card["id"])  # seen again at the end of this session
                rs.update(i=rs["i"] + 1, shown=None)
                st.rerun()


def notebook(db, cards):
    with st.form("add-card", clear_on_submit=True):
        a, b = st.columns(2)
        front = a.text_input("Nouvelle expression", placeholder="Ex. to catch up on")
        meaning = b.text_input("Sens en français (facultatif)", placeholder="Laisse vide : le coach le complète")
        if st.form_submit_button("Ajouter", type="primary") and front.strip():
            card, added = db.add_card(front.strip(), meaning=meaning.strip(), source="Ajout manuel")
            if not added:
                st.warning("Cette expression est déjà dans ton carnet.")
            else:
                if not meaning.strip() and c.engine_loaded():
                    try:
                        x = coach.explain(c.engine(), front.strip())
                        db.save_card({**card, "meaning": x["meaning"], "example": x["example"]})
                    except Exception:
                        pass
                st.session_state.pop("review", None)
                st.rerun()
    q = st.text_input("Rechercher", placeholder="Rechercher…", label_visibility="collapsed").lower().strip()
    shown = [card for card in sorted(cards, key=lambda x: x["created_at"], reverse=True)
             if not q or q in (card["front"] + " " + card.get("meaning", "") + " " + card.get("back", "")).lower()]
    if not shown:
        st.info("Aucun résultat." if cards else "Ton carnet est vide. Ajoute des mots depuis une transcription, "
                "ou laisse le coach y mettre ses corrections.")
        return
    for card in shown:
        with st.container(border=True):
            a, b, d = st.columns([5, 3, 2], vertical_alignment="center")
            extra = f"  \n:gray[au lieu de ~~{card['back']}~~]" if card.get("kind") == "correction" and card.get("back") else ""
            a.markdown(f"**{card['front']}**{extra}" + (f"  \n:gray[« {card['context']} »]" if card.get("context") else ""))
            b.markdown((card.get("meaning") or ":gray[—]") + (f"  \n:gray[Ex. : {card['example']}]" if card.get("example") else ""))
            status = "Acquis" if is_mastered(card) else next_label(card["due"])
            d.caption(f"{status} · ajouté le {datetime.fromtimestamp(card['created_at']):%d/%m}")
            x, y, z = d.columns(3)
            if x.button("🔊", key=f"hear-{card['id']}", help="Écouter"):
                c.speak(card["front"])
            if not card.get("meaning") and card.get("kind") != "correction" and c.engine_loaded() and y.button("💡", key=f"exp-{card['id']}", help="Expliquer"):
                x2 = coach.explain(c.engine(), card["front"], card.get("context", ""))
                db.save_card({**card, "meaning": x2["meaning"], "example": x2["example"]})
                st.rerun()
            if z.button("🗑", key=f"del-{card['id']}", help="Supprimer"):
                db.delete_card(card["id"])
                st.session_state.pop("review", None)
                st.rerun()
