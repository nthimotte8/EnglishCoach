"""Exercises on the current content. The oral ones come with a detailed pronunciation report."""
import time

import altair as alt
import pandas as pd
import streamlit as st

from englishcoach.textproc import EXERCISES, align, analyse_speech, build_exercise, exercise_units, norm, words

from . import common as c


def render():
    db = c.store()
    m = db.current()
    kind = st.session_state.get("ex_kind")
    if not m:
        st.info("Choisis d’abord un contenu dans « Pratiquer ».")
        return
    if kind not in EXERCISES:
        kind = st.segmented_control("Exercice", EXERCISES, format_func=c.EXERCISE_LABEL.get, default="lecture")
        st.session_state["ex_kind"] = kind
    ex = st.session_state.get("ex")
    if not ex or ex["kind"] != kind or ex["material_id"] != m["id"]:
        ex = {"kind": kind, "material_id": m["id"], "items": build_exercise(kind, exercise_units(m["lines"]), 5),
              "i": 0, "scores": [], "wpm": [], "answered": False, "started": time.time(), "saved": False}
        st.session_state["ex"] = ex

    st.title(c.EXERCISE_LABEL[kind])
    st.caption(m["title"])
    if not ex["items"]:
        st.warning("Ce contenu est trop court pour cet exercice.")
        return
    if ex["i"] >= len(ex["items"]):
        return finish(db, m, ex)

    item = ex["items"][ex["i"]]
    st.progress(ex["i"] / len(ex["items"]), text=f"{ex['i'] + 1} / {len(ex['items'])}")
    key = f"{kind}-{m['id']}-{ex['i']}-{ex['started']}"

    def listen_buttons(label="Écouter"):
        a, b, _ = st.columns([2, 2, 4])
        if a.button(label, icon=":material/volume_up:", key=f"l-{key}", type="primary"):
            st.session_state[f"play-{key}"] = "normal"
        if b.button("Voix lente", key=f"s-{key}"):
            st.session_state[f"play-{key}"] = "slow"
        mode = st.session_state.get(f"play-{key}")
        if mode:
            c.play_segment(m, item["start"], item["end"], item["text"], slow=mode == "slow")

    if kind in ("lecture", "repetition"):
        oral(db, m, ex, item, key, listen_buttons)
    elif kind == "dictee":
        listen_buttons("Écouter la phrase")
        guess = st.text_area("Ce que tu entends", key=f"d-{key}", disabled=ex["answered"], height=90)
        if not ex["answered"] and st.button("Vérifier", type="primary", disabled=not guess.strip()):
            r = align(words(item["text"]), words(guess))
            ex.update(answered=True, last={"ops": r["ops"], "score": r["score"]})
            ex["scores"].append(r["score"])
            st.rerun()
        if ex["answered"]:
            st.metric("Résultat", f"{round(ex['last']['score'] * 100)} %")
            st.markdown(c.diff_html(ex["last"]["ops"]), unsafe_allow_html=True)
            legend()
    elif kind == "trous":
        shown = " ".join(f"**({item['blanks'].index(i) + 1}) ____**" if i in item["blanks"] else w for i, w in enumerate(item["words"]))
        st.markdown(f"### {shown}")
        listen_buttons("Écouter la phrase")
        cols = st.columns(len(item["blanks"]))
        vals = [cols[k].text_input(f"Mot {k + 1}", key=f"t-{key}-{k}", disabled=ex["answered"]) for k in range(len(item["blanks"]))]
        if not ex["answered"] and st.button("Vérifier", type="primary", disabled=not any(v.strip() for v in vals)):
            ok = [norm(v) == norm(a) for v, a in zip(vals, item["answers"])]
            ex.update(answered=True, last={"ok": ok})
            ex["scores"].append(sum(ok) / len(ok))
            st.rerun()
        if ex["answered"]:
            for k, (good, a) in enumerate(zip(ex["last"]["ok"], item["answers"])):
                st.markdown(f"{k + 1}. " + (f":green[{a} ✓]" if good else f":red[✗] la réponse était **{a}**"))
    else:  # reco
        listen_buttons("Écouter le passage")
        choice = st.radio("Quel passage as-tu entendu ?", item["options"], index=None, key=f"r-{key}", disabled=ex["answered"])
        if not ex["answered"] and st.button("Valider", type="primary", disabled=choice is None):
            right = choice == item["text"]
            ex.update(answered=True, last={"right": right})
            ex["scores"].append(1.0 if right else 0.0)
            st.rerun()
        if ex["answered"]:
            (st.success if ex["last"]["right"] else st.error)("Bonne réponse." if ex["last"]["right"] else f"C’était : « {item['text']} »")

    if ex["answered"] and st.button("Voir le résultat" if ex["i"] == len(ex["items"]) - 1 else "Phrase suivante", type="primary"):
        ex.update(i=ex["i"] + 1, answered=False)
        st.rerun()


def legend():
    st.caption(":green[vert : bien reconnu] · :red[rouge : manquant ou mal prononcé/écrit] · :gray[barré : en trop]")


def oral(db, m, ex, item, key, listen_buttons):
    hidden = ex["kind"] == "repetition"
    st.write("Écoute le passage, puis répète-le de mémoire, le plus naturellement possible." if hidden
             else "Lis cette phrase à voix haute. Écoute le modèle d’abord si tu veux.")
    if hidden and not ex["answered"]:
        st.info("Texte masqué : fie-toi à ton oreille.")
    else:
        st.markdown(f"### {item['text']}")
    listen_buttons("Réécouter" if hidden else "Écouter le modèle")
    if not ex["answered"]:
        rec = st.audio_input("Enregistre-toi, puis arrête l’enregistrement", key=f"a-{key}-{ex.get('retry', 0)}")
        if rec is not None:
            with st.spinner("Whisper analyse ta prononciation…"):
                r = c.transcriber().transcribe(rec.getvalue(), words=True)
            a = analyse_speech(item["text"], r["text"], r["words"])
            ex.update(answered=True, last=a, take=rec.getvalue())
            ex["scores"].append(a["score"] / 100)
            if a["wpm"]:
                ex["wpm"].append(a["wpm"])
            st.rerun()
        return
    a = ex["last"]
    cols = st.columns(5)
    cols[0].metric("Score", a["score"])
    cols[1].metric("Mots reconnus", f"{a['accuracy']} %")
    cols[2].metric("Débit", f"{a['wpm']} mots/min" if a["wpm"] else "—")
    cols[3].metric("Pauses longues", len(a["pauses"]))
    cols[4].metric("Hésitations", a["fillers"])
    st.markdown(c.diff_html(a["ops"]), unsafe_allow_html=True)
    legend()
    timed = [o for o in a["ops"] if o.get("start") is not None]
    if timed:
        df = pd.DataFrame([{"mot": o["word"], "début": o["start"], "fin": o["end"],
                            "statut": "bien reconnu" if o["kind"] == "ok" else "en trop"} for o in timed])
        bars = alt.Chart(df).mark_bar(height=26, cornerRadius=4).encode(
            x=alt.X("début:Q", title="secondes"), x2="fin:Q",
            color=alt.Color("statut:N", scale=alt.Scale(domain=["bien reconnu", "en trop"], range=["#1D6B44", "#93A0AC"]), legend=None),
            tooltip=["mot", "début", "fin"])
        labels = alt.Chart(df).mark_text(dy=-22, fontSize=11).encode(x="début:Q", text="mot:N")
        st.caption("Ton débit dans le temps")
        st.altair_chart((bars + labels).properties(height=90), use_container_width=True)
        if a["pauses"]:
            st.caption("Pauses longues après : " + ", ".join(f"« {p['after']} » ({p['seconds']} s)" for p in a["pauses"]))
    left, right = st.columns(2)
    with left:
        st.caption("Ta voix")
        st.audio(ex["take"], format="audio/wav")
    with right:
        st.caption("Le modèle")
        if st.button("Écouter le modèle", key=f"model-{key}"):
            c.play_segment(m, item["start"], item["end"], item["text"])
    st.caption(f"Entendu : « {a['recognized'] or '—'} »")
    if a["to_practise"]:
        st.write("À retravailler : " + ", ".join(a["to_practise"]))
        cols = st.columns(min(6, len(a["to_practise"])))
        for i, w in enumerate(a["to_practise"][:6]):
            if cols[i].button(f"🔊 {w}", key=f"w-{key}-{i}"):
                c.speak(w, 0.8)
        if st.button("Ajouter ces mots au carnet", key=f"save-{key}"):
            n = sum(db.add_card(w, context=item["text"], source=m["title"])[1] for w in a["to_practise"])
            st.toast(f"{n} mot(s) ajouté(s) au carnet." if n else "Ces mots sont déjà dans ton carnet.")
    if st.button("Réessayer cette phrase", key=f"retry-{key}"):
        ex["scores"].pop()
        if a["wpm"]:
            ex["wpm"].pop()
        ex["answered"] = False
        ex["retry"] = ex.get("retry", 0) + 1  # a new recorder widget, empty
        st.rerun()


def finish(db, m, ex):
    score = round(sum(ex["scores"]) / max(1, len(ex["scores"])) * 100)
    minutes = c.minutes_since(ex["started"])
    wpm = round(sum(ex["wpm"]) / len(ex["wpm"])) if ex["wpm"] else None
    if not ex["saved"]:
        db.add_session(ex["kind"], minutes, material_id=m["id"], title=m["title"], score=score, wpm=wpm)
        ex["saved"] = True
    st.subheader("Exercice terminé")
    st.metric("Score", f"{score} %")
    st.write("Très bien. Passe à un contenu plus difficile ou à la conversation libre." if score >= 85 else
             "Bon travail. Refais l’exercice pour consolider." if score >= 60 else
             "Réécoute la transcription ligne par ligne, puis recommence.")
    if wpm:
        st.caption(f"Débit moyen à l’oral : {wpm} mots/min (un débit naturel se situe entre 120 et 160).")
    a, b, d = st.columns(3)
    if a.button("Recommencer", type="primary"):
        st.session_state.pop("ex", None)
        st.rerun()
    if b.button("Autre exercice"):
        st.session_state.pop("ex", None)
        c.go("pratiquer")
    if d.button("Discuter avec le coach"):
        c.go("coach")
