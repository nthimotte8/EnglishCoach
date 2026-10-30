// Add a content: podcast, audio/video file, YouTube video + transcript, pasted text, or a text written by the coach.
import * as coach from '../coach.js';
import * as repo from '../repo.js';
import { decode, onAsrProgress, transcribe } from '../speech.js';
import { LEVELS, linesFromSentences, linesFromTimedWords, parseFeed, parseTranscript, youtubeId } from '../textproc.js';
import { $, $$, html, icon, render, toast } from '../ui.js';
import { coachGate } from './gate.js';

const MAX_MINUTES = 15;
const FEEDS = [
  { name: 'BBC 6 Minute English', feed: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss' },
  { name: 'VOA Learning English', feed: 'https://learningenglish.voanews.com/podcast/?count=30' },
];
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
    <div id="pane"></div>
    <div class="thinking" id="busy" hidden><span class="dot"></span><span id="busy-t"></span></div>
    <p class="notice" id="err" hidden></p>
  </div>`);

  const pane = $('#pane', view);
  const setBusy = (t) => { $('#busy', view).hidden = !t; $('#busy-t', view).textContent = t || ''; $$('button', pane).forEach((b) => { b.disabled = !!t; }); };
  const fail = (e) => { $('#err', view).hidden = false; $('#err', view).textContent = e?.message || String(e); setBusy(null); };
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
    podcast() {
      render(pane, html`<section class="panel">
        <div class="row tight">${FEEDS.map((f) => html`<button class="pick" type="button" data-feed="${f.feed}">${f.name}</button>`)}</div>
        <form class="row" id="feed-form" style="align-items:flex-end">
          <label class="field" style="flex:1 1 320px">Ou le lien RSS d’un autre podcast
            <input id="feed" type="url" inputmode="url" placeholder="https://…/feed.xml" autocomplete="off"></label>
          <button class="btn" type="submit">Voir les épisodes</button></form>
        <div id="eps" class="stack" style="gap:6px"></div>
        <p class="hint">Certains podcasts empêchent les sites de lire leurs fichiers. Dans ce cas, télécharge l’épisode et utilise l’onglet « Fichier audio / vidéo ».</p>
      </section>`);
      const load = async (url) => {
        clearErr(); setBusy('Chargement des épisodes…');
        try {
          let xml;
          try { xml = await (await fetch(url)).text(); } catch { throw new Error('Ce podcast refuse d’être lu par un site web (protection CORS). Télécharge un épisode depuis ton appli de podcasts et importe-le dans « Fichier audio / vidéo ».'); }
          const feed = parseFeed(xml);
          setBusy(null);
          render($('#eps', pane), html`<span class="label">${feed.show} · choisis un épisode (les ${MAX_MINUTES} premières minutes sont transcrites)</span>
            ${feed.episodes.slice(0, 15).map((e, i) => html`<button class="ep" type="button" data-ep="${i}"><span>${e.title}</span>
              <span class="hint">${e.duration ? `${Math.round(e.duration / 60)} min` : ''}</span></button>`)}`);
          for (const b of $$('[data-ep]', pane)) b.addEventListener('click', () => episode(feed.show, feed.episodes[Number(b.dataset.ep)]));
        } catch (e) { fail(e); }
      };
      const episode = async (show, ep) => {
        clearErr(); setBusy('Téléchargement de l’épisode…');
        try {
          let blob;
          try { blob = await (await fetch(ep.audioUrl)).blob(); } catch { throw new Error('Ce podcast ne laisse pas les sites télécharger ses épisodes. Télécharge-le toi-même puis importe-le dans « Fichier audio / vidéo ».'); }
          const { audio } = await decode(blob, MAX_MINUTES * 60);
          const lines = await transcribeAudio(audio, 'Transcription de l’épisode');
          await ok({ title: `${show} · ${ep.title}`.slice(0, 200), source: 'podcast', audioUrl: ep.audioUrl, lines });
        } catch (e) { fail(e); }
      };
      for (const b of $$('[data-feed]', pane)) b.addEventListener('click', () => { $('#feed', pane).value = b.dataset.feed; load(b.dataset.feed); });
      $('#feed-form', pane).addEventListener('submit', (e) => { e.preventDefault(); const u = $('#feed', pane).value.trim(); if (u) load(u); });
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
