"""Settings: coach size, speech recognition, voice, backup and reset."""
import json
from datetime import date

import streamlit as st

from englishcoach import llm, speech

from . import common as c


def render():
    db = c.store()
    st.title("Réglages")
    st.caption("Tout fonctionne sur cet ordinateur. Les modèles sont téléchargés une fois depuis Hugging Face, puis utilisés hors ligne.")

    with st.container(border=True):
        st.subheader("Niveau du coach")
        st.caption(f"Moteur : **{'MLX (puce Apple)' if llm.apple_silicon() else 'transformers / PyTorch'}**. "
                   "Un modèle plus gros corrige mieux mais demande plus de mémoire et répond plus lentement.")
        keys = list(llm.TIERS)
        choice = st.radio("Niveau", keys, index=keys.index(c.tier()), horizontal=True,
                          format_func=lambda k: llm.TIERS[k]["label"], label_visibility="collapsed")
        t = llm.TIERS[choice]
        st.caption(f"{t['hint']} Modèle : `{t['mlx'] if llm.apple_silicon() else t['hf']}`")
        if choice != c.tier():
            db.set("tier", choice)
            c.unload_engine()
            st.rerun()
        a, b = st.columns(2)
        if c.engine_loaded():
            e = c.engine()
            a.success("Coach chargé" + (f" · ~{round(e.chars_per_sec / 6)} mots/s" if e.chars_per_sec else ""))
            if b.button("Libérer la mémoire"):
                c.unload_engine()
                st.rerun()
        elif a.button("Charger le coach", type="primary"):
            c.engine()
            st.rerun()

    with st.container(border=True):
        st.subheader("Reconnaissance vocale")
        st.caption("Whisper (faster-whisper) transcrit ta voix et les fichiers audio sur le processeur, sans gêner le coach.")
        options = {"rapide": "Rapide (tiny, ~75 Mo)", "precis": "Précis (base, ~150 Mo)", "tres-precis": "Très précis (small, ~500 Mo, plus lent)"}
        q = st.radio("Qualité", list(options), index=list(options).index(c.asr_quality()), format_func=options.get, horizontal=True,
                     label_visibility="collapsed")
        if q != c.asr_quality():
            db.set("asr", q)
            st.rerun()

    with st.container(border=True):
        st.subheader("Voix de lecture")
        st.caption("Voix « Samantha » du Mac via la commande say ; ailleurs, la voix du système via pyttsx3.")
        if not speech.tts_available():
            st.warning("Aucune voix trouvée : installe pyttsx3 (pip install pyttsx3), et espeak sous Linux.")
        elif st.button("Tester la voix"):
            c.speak("Hi! I am your English coach. Shall we practise together today?")

    with st.container(border=True):
        st.subheader("Mes données")
        st.caption("Contenus, progression et carnet sont enregistrés sur cet ordinateur, dans le dossier ~/.english_coach.")
        st.download_button("Exporter une sauvegarde", json.dumps(db.export(), ensure_ascii=False).encode(),
                           file_name=f"english-coach-{date.today()}.json", mime="application/json")
        up = st.file_uploader("Restaurer une sauvegarde", type=["json"])
        if up and st.button("Restaurer cette sauvegarde"):
            try:
                db.import_(json.loads(up.getvalue()))
                st.success("Sauvegarde restaurée.")
            except (ValueError, KeyError) as e:
                st.error(str(e))
        if st.checkbox("Je veux tout effacer"):
            if st.button("Tout effacer", type="primary"):
                db.clear()
                for k in list(st.session_state):
                    del st.session_state[k]
                st.success("Toutes tes données ont été effacées.")
