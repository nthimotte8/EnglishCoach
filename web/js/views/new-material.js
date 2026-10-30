// Add a content: podcast, audio/video file, YouTube video + transcript, pasted text, or a text written by the coach.
import * as coach from '../coach.js';
import * as repo from '../repo.js';
import { getSetting } from '../db.js';
import { episodes, searchShows, suggest, THEMES } from '../podcasts.js';
import { decode, onAsrProgress, transcribe } from '../speech.js';
import { LEVELS, linesFromSentences, linesFromTimedWords, parseFeed, parseTranscript, youtubeId } from '../textproc.js';
import { $, $$, html, icon, render, toast } from '../ui.js';
import { coachGate } from './gate.js';

const MAX_MINUTES = 15;
const TOPICS = ['Technologie', 'Business', 'Data et IA', 'Voyage', 'Science', 'Culture', 'Vie quotidienne', 'Entretien d’embauche'];
const MODES = [['podcast', 'Podcast'], ['fichier', 'Fichier audio / vidéo'], ['youtube', 'YouTube'], ['texte', 'Texte'], ['theme', 'Thème']];

export async function mount(view) {
  let mode = 'podcast';
  let gateCleanup = () => {};
  render(view, html`<div class="wrap">
    <div class="page-head"><div class="stack" style="gap:4px"><h1>Nouveau contenu</h1>
      <p>Tout est transcrit et analysé dans ton navigateur, rien n’est envoyé sur un serveur.</p></div>
      <a class="btn" href="#pratiquer">Annuler</a></div>
    <div class="seg" role="group" aria-label="Source">${MODES.map(([k, l]) => html`<button type="button" data-mode="${k}" aria-pressed="${k === mode}">${l}</button>`)}</div>
    <div class="thinking" id="busy" hidden aria-live="polite"><span class="dot"></span><span id="busy-t"></span></div>
    <p class="notice" id="err" hidden role="alert"></p>
    <div id="pane"></div>
  </div>`);

  const pane = $('#pane', view);
  const setBusy = (t) => { if (t && $('#busy', view).hidden) setTimeout(() => $('#busy', view).scrollIntoView({ block: 'nearest', behavior: 'smooth' })); $('#busy', view).hidden = !t; $('#busy-t', view).textContent = t || ''; $$('button', pane).forEach((b) => { b.disabled = !!t; }); };
  const fail = (e) => {
    const box = $('#err', view);
    box.hidden = false;
    render(box, html`${e?.message || String(e)}${e?.link ? html` <a href="${e.link}" target="_blank" rel="noopener" download>Télécharger l’épisode</a>` : ''}`);
    setBusy(null);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const ok = async (m) => { await repo.createMaterial(m); location.hash = '#pratiquer'; };
  const clearErr = () => { $('#err', view).hidden = true; };

  /** Whisper transcription with an honest progress line (model download, then elapsed time). */
  async function transcribeAudio(audio, label) {
    const secs = audio.length / 16000;
    const off = onAsrProgress((p) => setBusy(`${p.text} ${Math.round(p.progress * 100)} %`));
    const t0 = Date.now();
    const tick = setInterval(() => setBusy(`${label} · ${Math.round((Date.now() - t0) / 1000)} s (audio de ${Math.round(secs / 60) || 1} min)`), 1000);
    try {
      setBusy(label);
      const r = await transcribe(audio, { words: true });
      const lines = r.words.length ? linesFromTimedWords(r.words) : parseTranscript(r.text);
      if (lines.length < 3) throw new Error('Pas assez de paroles anglaises reconnues dans cet audio.');
      return lines;
    } finally { clearInterval(tick); off(); }
  }

  const panes = {
    async podcast() {
      const level = await getSetting('level');
      let theme = 'tous';
      render(pane, html`<section class="panel">
          <form class="row" id="search" role="search" style="align-items:flex-end">
            <label class="field" style="flex:1 1 320px">Rechercher un podcast
              <input id="q" type="search" placeholder="Ex. data engineering, football, BBC, histoire…" autocomplete="off"></label>
            <button class="btn primary" type="submit">Rechercher</button></form>
          <div id="results" class="stack" style="gap:8px"></div>
        </section>
        <section class="panel" id="suggest-box">
          <div class="row between"><h2>Suggestions${level ? ` pour ton niveau (${level})` : ''}</h2>
            <span class="hint">Des podcasts pensés pour progresser, du plus simple au plus exigeant</span></div>
          <div class="row tight" role="group" aria-label="Thème">${THEMES.map(([k, l]) => html`<button class="pick" type="button" data-theme="${k}" aria-pressed="${k === theme}">${l}</button>`)}</div>
          <div class="grid3" id="sugg"></div>
        </section>
        <details class="panel"><summary class="label" style="cursor:pointer">Avancé : coller le lien RSS d’un podcast</summary>
          <form class="row" id="feed-form" style="align-items:flex-end;margin-top:10px">
            <label class="field" style="flex:1 1 320px">Lien RSS<input id="feed" type="url" inputmode="url" placeholder="https://…/feed.xml" autocomplete="off"></label>
            <button class="btn" type="submit">Voir les épisodes</button></form></details>`);

      const paintSuggestions = () => {
        const list = suggest(level, theme);
        render($('#sugg', pane), html`${list.map((s, i) => html`<button class="ex-card" type="button" data-sug="${i}">
          <span class="skill">${s.levels.join('–')} · ${s.len}${level && !s.fit ? ' · hors niveau' : ''}</span>
          <b>${s.name}</b><span>${s.by} · ${s.why}</span></button>`)}`);
        for (const b of $$('[data-sug]', pane)) {
          b.addEventListener('click', async () => {
            const sug = list[Number(b.dataset.sug)];
            clearErr(); setBusy(`Recherche de « ${sug.name} »…`);
            try {
              const found = await searchShows(sug.term, 5);
              setBusy(null);
              if (!found.length) throw new Error(`« ${sug.name} » est introuvable dans l’annuaire pour le moment.`);
              openShow(found[0]);
            } catch (e) { fail(e); }
          });
        }
      };
      for (const b of $$('[data-theme]', pane)) {
        b.addEventListener('click', () => { theme = b.dataset.theme; $$('[data-theme]', pane).forEach((x) => x.setAttribute('aria-pressed', x === b)); paintSuggestions(); });
      }
      paintSuggestions();

      $('#search', pane).addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = $('#q', pane).value.trim();
        if (!q) return;
        clearErr(); setBusy('Recherche…');
        try {
          const shows = await searchShows(q);
          setBusy(null);
          render($('#results', pane), shows.length ? html`<span class="label">${shows.length} podcast${shows.length > 1 ? 's' : ''} trouvé${shows.length > 1 ? 's' : ''}</span>
            <div class="grid3">${shows.map((sh, i) => html`<button class="show" type="button" data-show="${i}">
              ${sh.artwork ? html`<img src="${sh.artwork}" alt="" loading="lazy" width="56" height="56">` : html`<span class="show-ph" aria-hidden="true">${icon.talk}</span>`}
              <span class="stack" style="gap:2px;min-width:0"><b>${sh.title}</b><span class="hint">${sh.author}${sh.genre ? ` · ${sh.genre}` : ''}</span></span></button>`)}</div>`
            : html`<p class="empty">Aucun podcast trouvé. Essaie des mots en anglais (ex. « travel », « startup »).</p>`);
          for (const b of $$('[data-show]', pane)) b.addEventListener('click', () => openShow(shows[Number(b.dataset.show)]));
        } catch (err) { fail(err); }
      });

      const openShow = async (sh) => {
        clearErr(); setBusy(`Chargement des épisodes de « ${sh.title} »…`);
        try {
          const eps = await episodes(sh);
          setBusy(null);
          if (!eps.length) throw new Error('Aucun épisode audio trouvé pour ce podcast.');
          showEpisodes(sh.title, eps, sh.artwork);
        } catch (e) { fail(e); }
      };
      const showEpisodes = (show, eps, artwork) => {
        render($('#results', pane), html`<div class="row" style="gap:12px">
            ${artwork ? html`<img src="${artwork}" alt="" width="64" height="64" style="border-radius:10px">` : ''}
            <div class="stack" style="gap:2px;flex:1;min-width:0"><h2>${show}</h2>
              <span class="hint">Choisis un épisode : les ${MAX_MINUTES} premières minutes sont transcrites. Les épisodes courts sont plus rapides.</span></div>
            <button class="btn small" type="button" id="back-results">Fermer</button></div>
          ${eps.slice(0, 20).map((e, i) => html`<button class="ep" type="button" data-ep="${i}">
            <span class="stack" style="gap:2px;min-width:0;text-align:left"><span>${e.title}</span>${e.description ? html`<span class="hint">${e.description}</span>` : ''}</span>
            <span class="hint tnum" style="white-space:nowrap">${e.duration ? `${Math.round(e.duration / 60)} min` : ''}${e.published ? html`<br>${new Date(e.published).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}</span></button>`)}`);
        $('#results', pane).scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('#back-results', pane).addEventListener('click', () => render($('#results', pane), html``));
        for (const b of $$('[data-ep]', pane)) b.addEventListener('click', () => episode(show, eps[Number(b.dataset.ep)]));
      };
      const episode = async (show, ep) => {
        clearErr(); setBusy('Téléchargement de l’épisode…');
        try {
          let blob;
          try {
            const res = await fetch(ep.audioUrl);
            if (!res.ok) throw new Error();
            blob = await res.blob();
          } catch {
            throw Object.assign(new Error('Ce podcast ne laisse pas les sites web lire ses fichiers audio. Télécharge l’épisode (lien ci-dessous) puis importe-le dans « Fichier audio / vidéo ».'), { link: ep.audioUrl });
          }
          const { audio } = await decode(blob, MAX_MINUTES * 60);
          const lines = await transcribeAudio(audio, 'Transcription de l’épisode');
          await ok({ title: `${show} · ${ep.title}`.slice(0, 200), source: 'podcast', audioUrl: ep.audioUrl, lines });
        } catch (e) { fail(e); }
      };
      $('#feed-form', pane).addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = $('#feed', pane).value.trim();
        if (!url) return;
        clearErr(); setBusy('Chargement des épisodes…');
        try {
          let xml;
          try { xml = await (await fetch(url)).text(); } catch { throw new Error('Ce podcast refuse d’être lu par un site web. Cherche-le plutôt avec la recherche ci-dessus.'); }
          const feed = parseFeed(xml);
          setBusy(null);
          showEpisodes(feed.show, feed.episodes.map((x) => ({ ...x, description: '' })), null);
        } catch (err) { fail(err); }
      });
    },

    fichier() {
      render(pane, html`<section class="panel">
        <label class="drop" id="drop">
          ${icon.plus}<b>Dépose un fichier audio ou vidéo</b>
          <span class="hint">MP3, M4A, WAV, MP4, WebM… Les ${MAX_MINUTES} premières minutes sont transcrites par Whisper.</span>
          <input type="file" id="file" accept="audio/*,video/*" class="sr">
          <span class="btn small">Choisir un fichier</span>
        </label>
        <label class="field">Titre (facultatif)<input id="ftitle" type="text" placeholder="Ex. Épisode sur le télétravail"></label>
      </section>`);
      const go = async (file) => {
        if (!file) return;
        clearErr(); setBusy('Lecture du fichier…');
        try {
          const { audio } = await decode(file, MAX_MINUTES * 60);
          const lines = await transcribeAudio(audio, 'Transcription du fichier');
          await ok({ title: $('#ftitle', pane).value.trim() || file.name.replace(/\.[^.]+$/, ''), source: 'file', audioBlob: file, lines });
        } catch (e) { fail(e); }
      };
      $('#file', pane).addEventListener('change', (e) => go(e.target.files[0]));
      const drop = $('#drop', pane);
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); });
    },

    youtube() { textForm(true); },
    texte() { textForm(false); },

    theme() {
      render(pane, html`<div id="gate"></div>`);
      gateCleanup = coachGate($('#gate', pane), () => {
        let topic = TOPICS[0], level = 'B1';
        render(pane, html`<section class="panel">
          <p class="muted">Le coach écrit un monologue parlé sur ce thème, à ton niveau. Il est ensuite lu par la voix de ton ordinateur.</p>
          <div class="row tight">${TOPICS.map((t) => html`<button class="pick" type="button" data-topic="${t}" aria-pressed="${t === topic}">${t}</button>`)}</div>
          <label class="field" style="max-width:420px">Ou ton propre thème<input id="own" type="text" placeholder="Ex. Migrer un data lake vers Databricks"></label>
          <div class="seg" role="group" aria-label="Niveau">${LEVELS.slice(1, 5).map((l) => html`<button type="button" data-level="${l}" aria-pressed="${l === level}">${l}</button>`)}</div>
          <div class="row"><button class="btn primary" type="button" id="gen">Générer le texte</button></div></section>`);
        for (const b of $$('[data-topic]', pane)) b.addEventListener('click', () => { topic = b.dataset.topic; $$('[data-topic]', pane).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
        for (const b of $$('[data-level]', pane)) b.addEventListener('click', () => { level = b.dataset.level; $$('[data-level]', pane).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
        $('#gen', pane).addEventListener('click', async () => {
          clearErr();
          const t = $('#own', pane).value.trim() || topic;
          setBusy('Le coach écrit le texte… (10 à 40 s)');
          try {
            const g = await coach.generateText(t, level);
            await ok({ title: g.title, source: 'theme', theme: t, level, lines: linesFromSentences(g.sentences) });
          } catch (e) { fail(e); }
        });
      });
    },
  };

  function textForm(withVideo) {
    render(pane, html`<form class="panel" id="tf">
      ${withVideo ? html`<label class="field">Lien de la vidéo YouTube<input id="url" type="url" inputmode="url" required placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label>` : ''}
      <label class="field">Titre${withVideo ? ' (facultatif)' : ''}<input id="title" type="text" ${withVideo ? '' : 'required'} placeholder="Ex. How habits are formed"></label>
      <label class="field">${withVideo ? 'Transcription' : 'Texte en anglais'}<textarea id="text" rows="8" required placeholder="${withVideo ? 'Colle la transcription, avec ou sans horodatage.' : 'Colle un article, un discours, des paroles…'}"></textarea></label>
      ${withVideo ? html`<p class="hint">Sur YouTube, sous la vidéo : « … Plus », puis « Afficher la transcription ». Sélectionne tout le panneau et copie. Un navigateur ne peut pas récupérer la transcription tout seul.</p>` : ''}
      <div class="row"><button class="btn primary" type="submit">Charger</button></div></form>`);
    $('#tf', pane).addEventListener('submit', async (e) => {
      e.preventDefault(); clearErr();
      const lines = parseTranscript($('#text', pane).value);
      if (lines.length < 3) { fail(new Error('Colle au moins quelques phrases.')); return; }
      if (withVideo) {
        const id = youtubeId($('#url', pane).value);
        if (!id) { fail(new Error('Ce lien n’est pas une vidéo YouTube.')); return; }
        await ok({ title: $('#title', pane).value.trim() || 'Vidéo YouTube', source: 'youtube', videoId: id, url: `https://www.youtube.com/watch?v=${id}`, lines });
      } else {
        await ok({ title: $('#title', pane).value.trim(), source: 'text', lines });
      }
    });
  }

  const show = (k) => {
    gateCleanup(); gateCleanup = () => {};
    mode = k; clearErr(); setBusy(null);
    $$('[data-mode]', view).forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === k));
    panes[k]();
  };
  for (const b of $$('[data-mode]', view)) b.addEventListener('click', () => { if ($('#busy', view).hidden) show(b.dataset.mode); else toast('Patiente jusqu’à la fin de l’opération en cours.'); });
  show(mode);
  return () => gateCleanup();
}
