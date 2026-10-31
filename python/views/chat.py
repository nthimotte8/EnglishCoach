"""Chat with the coach, by text or by voice. Shared by the content discussion and the free conversation."""
import time

import streamlit as st

from englishcoach.textproc import analyse_speech

from . import common as c


def chat(state_key: str, *, title: str, them: str, kind: str, material_id=None, voice_first=False,
         first, turn, evaluate, intro: str = "") -> None:
    """first(on_reply) / turn(history, message, on_reply) / evaluate(messages, speech) -> dict."""
    db = c.store()
    s = st.session_state.setdefault(state_key, {"entries": [], "history": [], "learner": [], "speech": [], "started": time.time(),
                                                "done": False, "eval": None, "mic": 0, "pending": None, "lighter_shown": False})
    auto = st.toggle("Lire les réponses à voix haute", value=True, key="auto_speak")

    # conversation so far
    for i, e in enumerate(s["entries"]):
        if e["role"] == "fb":
            with st.chat_message("assistant", avatar=":material/spellcheck:"):
                c.feedback(e["fb"])
            continue
        with st.chat_message("user" if e["role"] == "me" else "assistant"):
            if e["role"] == "them":
                st.caption(them)
            st.write(e["text"])
            if e["role"] == "them" and st.button("Écouter", icon=":material/volume_up:", key=f"{state_key}-say-{i}"):
                c.speak(e["text"])

    def ask(message: str | None, spoken: dict | None):
        with st.chat_message("assistant"):
            st.caption(them)
            gen, box = c.run_streamed(lambda on_reply: turn(s["history"], message, on_reply) if message else first(on_reply))
            st.write_stream(gen)
        if "error" in box:
            st.error(f"Le coach n’a pas pu répondre : {box['error']}")
            if message:
                s["learner"].pop()
                s["entries"].pop()
                if spoken:
                    s["speech"].pop()
            return
        r = box["result"]
        if message:
            s["entries"].append({"role": "fb", "fb": r})
            with st.chat_message("assistant", avatar=":material/spellcheck:"):
                c.feedback(r)
            if r["corrections"]:
                db.add_corrections(r["corrections"], title)
            s["history"].append({"role": "user", "content": f"Learner: {message}"})
        s["history"].append({"role": "assistant", "content": r["reply"]})
        s["entries"].append({"role": "them", "text": r["reply"]})
        if auto:
            c.speak(r["reply"])

    # first question, or the message waiting to be answered
    if not s["entries"] and not s["done"]:
        if intro:
            st.caption(intro)
        ask(None, None)
    elif s["pending"] and not s["done"]:
        message, spoken = s["pending"]
        s["pending"] = None
        s["learner"].append(message)
        if spoken:
            s["speech"].append(spoken)
        s["entries"].append({"role": "me", "text": message})
        with st.chat_message("user"):
            st.write(message)
        ask(message, spoken)

    e = c.engine() if c.engine_loaded() else None
    if e and e.slow and c.tier() != "leger" and not s["lighter_shown"]:
        s["lighter_shown"] = True
        st.info(f"Ton ordinateur écrit environ {round(e.chars_per_sec / 6)} mots par seconde. Le coach « Léger » répond environ "
                "deux fois plus vite : tu peux le choisir dans Réglages.")

    if s["done"]:
        if s["eval"]:
            c.evaluation(s["eval"])
        if st.button("Recommencer", type="primary"):
            st.session_state.pop(state_key, None)
            st.rerun()
        return

    # voice input (Whisper), then text input
    rec = st.audio_input("Réponds à l’oral" if voice_first else "Ou réponds à l’oral", key=f"{state_key}-mic-{s['mic']}")
    if rec is not None:
        with st.spinner("Je transcris ce que tu as dit…"):
            r = c.transcriber().transcribe(rec.getvalue(), words=True)
        s["mic"] += 1
        if not r["text"].strip():
            st.warning("Je n’ai rien entendu. Réessaie plus près du micro.")
        else:
            a = analyse_speech(r["text"], r["text"], r["words"])
            s["pending"] = (r["text"], {"wpm": a["wpm"], "pauses": len(a["pauses"])} if a["wpm"] else None)
            st.rerun()
    typed = st.chat_input("Écris ta réponse en anglais…")
    if typed and typed.strip():
        s["pending"] = (typed.strip(), None)
        st.rerun()

    if len(s["learner"]) >= 2 and st.button("Terminer et obtenir mon bilan", icon=":material/grading:"):
        sp = [x for x in s["speech"] if x and x.get("wpm")]
        speech = {"wpm": round(sum(x["wpm"] for x in sp) / len(sp)), "pauses": sum(x["pauses"] for x in sp)} if sp else None
        try:
            with st.spinner("Évaluation de ton niveau…"):
                ev = evaluate(s["learner"], speech)
        except Exception as err:  # model error
            st.error(f"Évaluation impossible : {err}")
            return
        db.add_session(kind, c.minutes_since(s["started"]), material_id=material_id, title=title, score=ev["score"],
                       level=ev["level"], messages=len(s["learner"]), wpm=speech["wpm"] if speech else None)
        s.update(done=True, eval=ev)
        st.rerun()
