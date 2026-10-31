"""Free spoken conversation: role plays (job interview, meeting, travel…), voice first."""
import streamlit as st

from englishcoach import coach

from . import common as c
from .chat import chat


def render():
    db = c.store()
    st.title("Conversation libre")
    sc_key = st.session_state.get("scenario")
    if not sc_key:
        st.write("Choisis une situation et parle. Le coach joue son rôle, te répond à voix haute et corrige chacune de tes phrases.")
        cols = st.columns(3)
        for i, sc in enumerate(coach.SCENARIOS):
            with cols[i % 3].container(border=True):
                st.caption(f"Tu es {sc['you']}".upper())
                st.markdown(f"**{sc['label']}**")
                st.caption(sc["hint"] or "Décris toi-même la scène à jouer.")
                if sc["key"] != "custom" and st.button("Commencer", key=f"sc-{sc['key']}", use_container_width=True):
                    st.session_state.update(scenario=sc["key"], scenario_custom="")
                    st.rerun()
                if sc["key"] == "custom":
                    custom = st.text_input("Ta situation", placeholder="Ex. Je négocie une augmentation", key="custom-text",
                                           label_visibility="collapsed")
                    if st.button("Commencer", key="sc-custom", use_container_width=True, disabled=not custom.strip()):
                        st.session_state.update(scenario="custom", scenario_custom=custom.strip())
                        st.rerun()
        return

    sc = next(s for s in coach.SCENARIOS if s["key"] == sc_key)
    custom = st.session_state.get("scenario_custom", "")
    a, b = st.columns([4, 1])
    a.subheader(custom if sc["key"] == "custom" else sc["label"])
    if sc["hint"]:
        a.caption(sc["hint"])
    if b.button("Changer de situation"):
        st.session_state.pop(f"chat-rp-{sc_key}", None)
        st.session_state.pop("scenario", None)
        st.rerun()
    e = c.coach_gate()
    if not e:
        return
    level = db.get("level")
    label = custom if sc["key"] == "custom" else sc["label"]
    chat(f"chat-rp-{sc_key}", title=f"Conversation · {sc['label']}", them=sc["them"], kind="conversation", voice_first=True,
         first=lambda on: coach.roleplay_turn(e, sc, custom, level, [], None, on),
         turn=lambda h, msg, on: coach.roleplay_turn(e, sc, custom, level, h, msg, on),
         evaluate=lambda msgs, sp: coach.evaluate(e, f"a spoken role play: {label}", msgs, sp))
