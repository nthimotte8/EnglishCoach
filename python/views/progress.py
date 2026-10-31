"""Progress: level, practice time, streak, CEFR curve, activity grid, history."""
from datetime import date, datetime, timedelta

import altair as alt
import pandas as pd
import streamlit as st

from englishcoach.textproc import LEVELS

from . import common as c


def fmt_minutes(m: int) -> str:
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60:02d}" if m % 60 else f"{m // 60} h"


def render():
    s = c.store().stats()
    st.title("Progression")
    st.caption(f"Depuis le {datetime.fromtimestamp(s['first_at']):%d/%m/%Y}. Tes données restent sur cet ordinateur." if s["first_at"]
               else "Fais un exercice ou une conversation : ta progression s’affichera ici.")
    rows = [[("Niveau actuel", s["level"] or "—"), ("Temps de pratique", fmt_minutes(s["total_minutes"])),
             ("Série en cours", f"{s['streak']} jour{'s' if s['streak'] > 1 else ''}"), ("Exercices", s["exercises"])],
            [("Conversations", s["conversations"]), ("Débit moyen à l’oral", f"{s['avg_wpm']} mots/min" if s["avg_wpm"] else "—"),
             ("Mots au carnet", s["cards"]["total"]), ("Mots acquis", s["cards"]["mastered"])]]
    for row in rows:
        for col, (label, value) in zip(st.columns(4), row):
            col.metric(label, value)

    left, right = st.columns(2)
    with left:
        st.subheader("Niveau CECRL")
        if s["curve"]:
            df = pd.DataFrame([{"date": datetime.fromtimestamp(p["at"]), "niveau": p["level"], "rang": LEVELS.index(p["level"])} for p in s["curve"]])
            chart = alt.Chart(df).mark_line(point=True, color="#1F4FA8").encode(
                x=alt.X("date:T", title=None),
                y=alt.Y("rang:Q", title=None, scale=alt.Scale(domain=[0, 5]),
                        axis=alt.Axis(values=list(range(6)), labelExpr="['A1','A2','B1','B2','C1','C2'][datum.value]")),
                tooltip=["date:T", "niveau:N"])
            st.altair_chart(chart.properties(height=240), use_container_width=True)
        else:
            st.info("Ta courbe apparaîtra après ton premier bilan avec le coach.")
    with right:
        st.subheader("Activité")
        today = date.today()
        start = today - timedelta(days=today.weekday() + 19 * 7)
        cells = []
        for i in range((today - start).days + 1):
            d = start + timedelta(days=i)
            cells.append({"semaine": i // 7, "jour": ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"][d.weekday()],
                          "date": d.isoformat(), "activités": s["activity"].get(d.isoformat(), 0)})
        heat = alt.Chart(pd.DataFrame(cells)).mark_rect(cornerRadius=3).encode(
            x=alt.X("semaine:O", axis=None), y=alt.Y("jour:O", sort=["lun", "mar", "mer", "jeu", "ven", "sam", "dim"], title=None),
            color=alt.Color("activités:Q", scale=alt.Scale(domain=[0, 1, 3, 7], range=["#EEF1F4", "#B9CBEA", "#6E92D3", "#1F4FA8"]), legend=None),
            tooltip=["date", "activités"])
        st.altair_chart(heat.properties(height=200), use_container_width=True)
        st.caption("20 dernières semaines")

    st.subheader("Historique")
    if s["history"]:
        st.dataframe(pd.DataFrame([{
            "Date": datetime.fromtimestamp(h["at"]).strftime("%d/%m %H:%M"), "Activité": c.EXERCISE_LABEL.get(h["kind"], h["kind"]),
            "Contenu": h["title"], "Score": f"{h['score']} %" if h["score"] is not None else "—",
            "Débit": f"{h['wpm']} m/min" if h["wpm"] else "—", "Niveau": h["level"] or "—"} for h in s["history"]]),
            hide_index=True, use_container_width=True)
    else:
        st.info("Chaque exercice et chaque conversation terminés apparaîtront ici.")
