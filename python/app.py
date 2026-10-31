"""English Coach — version Python (Streamlit).

Lancer :  streamlit run app.py
Tout tourne sur ton ordinateur : coach IA, reconnaissance vocale, voix. Sans clé d'API.
"""
import streamlit as st

from englishcoach import llm, srs
from views import coach_page, common, conversation, exercise, new_material, practice, progress, settings, vocab

st.set_page_config(page_title="English Coach", page_icon="🎧", layout="wide")

pages = {
    "pratiquer": st.Page(practice.render, title="Pratiquer", icon=":material/menu_book:", url_path="pratiquer", default=True),
    "nouveau": st.Page(new_material.render, title="Nouveau contenu", icon=":material/add_circle:", url_path="nouveau"),
    "exercice": st.Page(exercise.render, title="Exercice", icon=":material/fitness_center:", url_path="exercice"),
    "coach": st.Page(coach_page.render, title="Coach", icon=":material/chat:", url_path="coach"),
    "conversation": st.Page(conversation.render, title="Conversation libre", icon=":material/record_voice_over:", url_path="conversation"),
    "vocabulaire": st.Page(vocab.render, title="Vocabulaire", icon=":material/style:", url_path="vocabulaire"),
    "progression": st.Page(progress.render, title="Progression", icon=":material/monitoring:", url_path="progression"),
    "reglages": st.Page(settings.render, title="Réglages", icon=":material/settings:", url_path="reglages"),
}
common.PAGES.update(pages)

nav = st.navigation({
    "S’entraîner": [pages["pratiquer"], pages["nouveau"], pages["exercice"]],
    "Parler": [pages["coach"], pages["conversation"]],
    "Suivre": [pages["vocabulaire"], pages["progression"], pages["reglages"]],
})

with st.sidebar:
    st.markdown("### English Coach")
    due = len(srs.due_cards(common.store().cards(), limit=999))
    if due:
        st.caption(f"📚 {due} carte{'s' if due > 1 else ''} de vocabulaire à réviser")
    t = llm.TIERS[common.tier()]
    if common.engine_loaded():
        e = common.engine()
        speed = f" · ~{round(e.chars_per_sec / 6)} mots/s" if e.chars_per_sec else ""
        st.caption(f":green[● Coach prêt] ({t['label']}{speed})")
    else:
        st.caption(f"○ Coach non chargé ({t['label']})")

nav.run()
