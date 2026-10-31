"""Discussion with the coach about the content being practised."""
import streamlit as st

from englishcoach import coach

from . import common as c
from .chat import chat


def render():
    db = c.store()
    m = db.current()
    st.title("Discussion avec le coach")
    if not m:
        st.info("Le coach discute du contenu que tu viens de travailler. Choisis-en un d’abord, ou entraîne-toi en conversation libre.")
        a, b = st.columns(2)
        if a.button("Ajouter un contenu", type="primary"):
            c.go("nouveau")
        if b.button("Conversation libre"):
            c.go("conversation")
        return
    st.caption(f"Sur : **{m['title']}**. Le coach te pose des questions, corrige chaque réponse et t’évalue à la fin.")
    e = c.coach_gate()
    if not e:
        return
    chat(f"chat-content-{m['id']}", title=m["title"], them="Coach", kind="coach", material_id=m["id"],
         first=lambda on: coach.content_turn(e, m, [], None, on),
         turn=lambda h, msg, on: coach.content_turn(e, m, h, msg, on),
         evaluate=lambda msgs, sp: coach.evaluate(e, f'a discussion about the content "{m["title"]}"', msgs, sp))
