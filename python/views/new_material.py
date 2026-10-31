"""Add a content: podcast, audio/video file, YouTube video, text, or a text written by the coach. Each with suggestions."""
from pathlib import Path

import streamlit as st

from englishcoach import coach, sources
from englishcoach import suggestions as sg
from englishcoach.textproc import LEVELS, lines_from_segments, lines_from_sentences, lines_from_timed_words, parse_transcript, youtube_id

from . import common as c

MAX_MINUTES = 15
TOPICS = ["Technologie", "Business", "Data et IA", "Voyage", "Science", "Culture", "Vie quotidienne", "Entretien d’embauche"]


def done(m):
    st.session_state.pop("play_line", None)
    st.toast(f"« {m['title']} » est prêt.")
    c.go("pratiquer")


def transcribe_to_lines(audio_path: Path) -> list[dict]:
    with st.status("Transcription par Whisper…", expanded=False) as status:
        tr = c.transcriber()
        status.update(label=f"Transcription des {MAX_MINUTES} premières minutes… (environ 1 min pour 10 min d’audio sur un Mac M1)")
        r = tr.transcribe(str(audio_path), words=True, max_seconds=MAX_MINUTES * 60)
        status.update(label="Transcription terminée", state="complete")
    lines = lines_from_timed_words(r["words"]) if r["words"] else lines_from_segments(r["segments"])
    if len(lines) < 3:
        raise ValueError("Pas assez de paroles anglaises reconnues dans cet audio.")
    return lines


def theme_filter(items, key):
    themes = sg.themes_for(items)
    if len(themes) <= 2:
        return "tous"
    labels = dict(themes)
    return st.segmented_control("Thème", list(labels), format_func=labels.get, default="tous", key=key) or "tous"


def render():
    db = c.store()
    level = db.get("level")
    st.title("Nouveau contenu")
    st.caption("Tout est transcrit et analysé sur ton ordinateur.")
    tabs = st.tabs(["Podcast", "Fichier audio / vidéo", "YouTube", "Texte", "Thème"])

    # ------------------------------------------------------------ podcast
    with tabs[0]:
        with st.form("pod-search"):
            q = st.text_input("Rechercher un podcast", placeholder="Ex. data engineering, football, BBC, histoire…")
            if st.form_submit_button("Rechercher", type="primary") and q.strip():
                try:
                    st.session_state["pod_results"] = sources.search_shows(q.strip())
                    st.session_state.pop("pod_show", None)
                except sources.SourceError as e:
                    st.error(str(e))

        show = st.session_state.get("pod_show")
        if show:
            with st.container(border=True):
                a, b = st.columns([1, 6])
                if show.get("artwork"):
                    a.image(show["artwork"], width=72)
                b.subheader(show["title"])
                b.caption(f"Les {MAX_MINUTES} premières minutes de l’épisode sont transcrites. Les épisodes courts sont plus rapides.")
                if b.button("Fermer", key="close-show"):
                    st.session_state.pop("pod_show", None)
                    st.rerun()
                for i, ep in enumerate(show.get("episodes", [])[:20]):
                    x, y = st.columns([5, 1], vertical_alignment="center")
                    meta = " · ".join(v for v in [f"{round(ep['duration'] / 60)} min" if ep.get("duration") else "",
                                                  str(ep.get("published") or "")[:10]] if v)
                    x.markdown(f"**{ep['title']}**  \n:gray[{meta}]" + (f"  \n<small>{c.esc(ep['description'])}</small>" if ep.get("description") else ""),
                               unsafe_allow_html=True)
                    if y.button("Transcrire", key=f"ep-{i}"):
                        m = None
                        try:
                            with st.spinner("Téléchargement de l’épisode…"):
                                suffix = ".m4a" if ".m4a" in ep["audio_url"].lower() else ".mp3"
                                path = sources.download(ep["audio_url"], c.new_audio_path(suffix))
                            lines = transcribe_to_lines(path)
                            m = db.create_material(f"{show['title']} · {ep['title']}"[:200], "podcast", lines,
                                                   audio_path=str(path), audio_url=ep["audio_url"])
                        except Exception as e:  # download, decoding or transcription error
                            st.error(str(e))
                        if m:
                            done(m)

        results = st.session_state.get("pod_results")
        if results is not None and not show:
            st.caption(f"{len(results)} podcast(s) trouvé(s)" if results else "Aucun podcast trouvé. Essaie des mots en anglais.")
            cols = st.columns(3)
            for i, sh in enumerate(results):
                with cols[i % 3].container(border=True):
                    if sh.get("artwork"):
                        st.image(sh["artwork"], width=64)
                    st.markdown(f"**{sh['title']}**  \n:gray[{sh['author']}{' · ' + sh['genre'] if sh['genre'] else ''}]")
                    if st.button("Voir les épisodes", key=f"show-{i}"):
                        open_show(sh)

        st.subheader("Suggestions" + (f" pour ton niveau ({level})" if level else ""))
        theme = theme_filter(sg.PODCASTS, "pod-theme")
        cols = st.columns(3)
        for i, s in enumerate(sg.rank_by_level(sg.PODCASTS, level, theme)):
            with cols[i % 3].container(border=True):
                st.caption(f"{sg.level_tag(s, level)} · {s['len']}")
                st.markdown(f"**{s['name']}**  \n:gray[{s['by']} · {s['why']}]")
                if st.button("Voir les épisodes", key=f"sug-{s['term']}"):
                    try:
                        found = sources.search_shows(s["term"], 5)
                        if not found:
                            st.error(f"« {s['name']} » est introuvable dans l’annuaire pour le moment.")
                        else:
                            open_show(found[0])
                    except sources.SourceError as e:
                        st.error(str(e))

        with st.expander("Avancé : lien RSS d’un podcast"):
            feed = st.text_input("Lien RSS", placeholder="https://…/feed.xml")
            if st.button("Voir les épisodes", key="rss") and feed.strip():
                try:
                    f = sources.feed_episodes(feed.strip())
                    st.session_state["pod_show"] = {"title": f["show"], "artwork": None, "episodes": f["episodes"]}
                    st.rerun()
                except sources.SourceError as e:
                    st.error(str(e))

    # ------------------------------------------------------------ file
    with tabs[1]:
        up = st.file_uploader("Dépose un fichier audio ou vidéo", type=["mp3", "m4a", "wav", "aac", "ogg", "flac", "mp4", "mov", "webm", "mkv"])
        title = st.text_input("Titre (facultatif)", key="file-title")
        if up and st.button("Transcrire ce fichier", type="primary"):
            path = c.new_audio_path(Path(up.name).suffix or ".mp3")
            path.write_bytes(up.getvalue())
            m = None
            try:
                lines = transcribe_to_lines(path)
                m = db.create_material(title.strip() or Path(up.name).stem, "file", lines, audio_path=str(path))
            except Exception as e:  # decoding or transcription error
                path.unlink(missing_ok=True)
                st.error(f"Transcription impossible : {e}")
            if m:
                done(m)  # outside the try: page switches must not be caught
        st.subheader("Idées de fichiers à importer")
        cols = st.columns(2)
        for i, t in enumerate(sg.FILE_TIPS):
            cols[i % 2].markdown(f"**{t['title']}**  \n:gray[{t['why']}]")

    # ------------------------------------------------------------ YouTube
    with tabs[2]:
        url = st.text_input("Lien de la vidéo YouTube", placeholder="https://www.youtube.com/watch?v=…")
        if st.button("Charger la vidéo", type="primary", key="yt-load"):
            vid = youtube_id(url)
            if not vid:
                st.error("Ce lien n’est pas une vidéo YouTube.")
            else:
                try:
                    with st.spinner("Récupération de la transcription…"):
                        lines = sources.youtube_transcript(vid)
                        title = sources.youtube_title(vid) or f"Vidéo YouTube {vid}"
                    if len(lines) < 3:
                        st.error("La transcription de cette vidéo est trop courte.")
                    else:
                        done(db.create_material(title, "youtube", lines, video_id=vid, url=f"https://www.youtube.com/watch?v={vid}"))
                except sources.SourceError as e:
                    st.warning(str(e))
                    st.session_state["yt_manual"] = vid
        if st.session_state.get("yt_manual"):
            with st.form("yt-manual"):
                st.caption("Sur YouTube : sous la vidéo, « … Plus », puis « Afficher la transcription ». Copie tout le panneau ici.")
                text = st.text_area("Transcription", height=180)
                if st.form_submit_button("Charger avec cette transcription"):
                    lines = parse_transcript(text)
                    vid = st.session_state.pop("yt_manual")
                    if len(lines) < 3:
                        st.error("Colle au moins quelques lignes.")
                    else:
                        done(db.create_material(sources.youtube_title(vid) or "Vidéo YouTube", "youtube", lines, video_id=vid,
                                                url=f"https://www.youtube.com/watch?v={vid}"))
        st.subheader("Trouver une vidéo")
        q = st.text_input("Rechercher sur YouTube (vidéos sous-titrées)", placeholder="Ex. data engineering explained")
        if q.strip():
            st.link_button("Ouvrir la recherche sur YouTube", sg.youtube_search_url(q.strip()), icon=":material/open_in_new:")
        st.subheader("Chaînes suggérées" + (f" pour ton niveau ({level})" if level else ""))
        theme = theme_filter(sg.YOUTUBE, "yt-theme")
        cols = st.columns(3)
        for i, s in enumerate(sg.rank_by_level(sg.YOUTUBE, level, theme)):
            with cols[i % 3].container(border=True):
                st.caption(sg.level_tag(s, level))
                st.markdown(f"**{s['name']}**  \n:gray[{s['why']}]")
                st.link_button("Ouvrir sur YouTube", sg.youtube_search_url(s["q"]), use_container_width=True)

    # ------------------------------------------------------------ text
    with tabs[3]:
        with st.form("text-form"):
            title = st.text_input("Titre")
            text = st.text_area("Texte en anglais", height=200, placeholder="Colle un article, un discours, des paroles…")
            if st.form_submit_button("Charger", type="primary"):
                lines = parse_transcript(text)
                if not title.strip() or len(lines) < 3:
                    st.error("Donne un titre et colle au moins quelques phrases.")
                else:
                    done(db.create_material(title.strip(), "text", lines))
        st.subheader("Textes prêts à pratiquer" + (f" pour ton niveau ({level})" if level else ""))
        theme = theme_filter(sg.TEXTS, "txt-theme")
        cols = st.columns(3)
        for i, t in enumerate(sg.rank_by_level(sg.TEXTS, level, theme)):
            with cols[i % 3].container(border=True):
                st.caption(f"{sg.level_tag(t, level)} · {len(t['text'].split())} mots")
                st.markdown(f"**{t['title']}**  \n:gray[{t['text'][:110]}…]")
                if st.button("Pratiquer ce texte", key=f"txt-{t['title']}", use_container_width=True):
                    done(db.create_material(t["title"], "text", parse_transcript(t["text"]), level=t["levels"][-1]))
        st.subheader("Où trouver des textes")
        cols = st.columns(3)
        for i, s in enumerate(sg.rank_by_level(sg.TEXT_SITES, level)):
            with cols[i % 3].container(border=True):
                st.caption(sg.level_tag(s, level))
                st.markdown(f"**{s['name']}**  \n:gray[{s['why']}]")
                st.link_button("Ouvrir le site", s["url"], use_container_width=True)

    # ------------------------------------------------------------ theme
    with tabs[4]:
        eng = c.coach_gate(compact=True)
        if eng:
            st.caption("Le coach écrit un monologue parlé sur ce thème, à ton niveau, lu ensuite par la voix de ton ordinateur.")
            topic = st.pills("Thème", TOPICS, default=TOPICS[0], key="topic")
            ideas = [x["topic"] for x in sg.rank_by_level([{**i, "theme": "tous"} for i in sg.TOPIC_IDEAS], level)][:8]
            idea = st.pills("Idées" + (f" pour ton niveau ({level})" if level else ""), ideas, key="idea")
            own = st.text_input("Ou ton propre thème", value=idea or "", placeholder="Ex. Migrer un data lake vers Databricks")
            lv = st.segmented_control("Niveau", LEVELS[1:5], default=level if level in LEVELS[1:5] else "B1", key="gen-level")
            if st.button("Générer le texte", type="primary"):
                m = None
                try:
                    with st.spinner("Le coach écrit le texte…"):
                        g = coach.generate_text(eng, own.strip() or topic or TOPICS[0], lv or "B1")
                    m = db.create_material(g["title"], "theme", lines_from_sentences(g["sentences"]), theme=own.strip() or topic, level=lv)
                except Exception as e:  # model error or unreadable answer
                    st.error(str(e))
                if m:
                    done(m)


def open_show(show: dict):
    try:
        with st.spinner(f"Chargement des épisodes de « {show['title']} »…"):
            eps = sources.episodes(show)
        if not eps:
            st.error("Aucun épisode audio trouvé pour ce podcast.")
            return
        st.session_state["pod_show"] = {**show, "episodes": eps}
        st.rerun()
    except sources.SourceError as e:
        st.error(str(e))
