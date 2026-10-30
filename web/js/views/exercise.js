// Exercises on the current content. The two oral ones come with a detailed pronunciation report.
import * as repo from '../repo.js';
import { playItem } from '../players.js';
import { Recorder, speak, stopSpeaking, transcribe } from '../speech.js';
import { align, analyseSpeech, buildExercise, EXERCISES, exerciseUnits, norm, words } from '../textproc.js';
import { $, $$, html, icon, markup, minutesSince, render, toast } from '../ui.js';
import { hasMedia, mediaHtml, mountMedia } from './media.js';

const LABEL = { lecture: 'Lecture à voix haute', repetition: 'Répétition sans texte', reco: 'Reconnaissance à l’écoute', dictee: 'Dictée', trous: 'Mots manquants' };

export async function mount(view, [kind]) {
  const m = await repo.current();
  if (!m || !EXERCISES.includes(kind)) { location.hash = '#pratiquer'; return; }
  const items = buildExercise(kind, exerciseUnits(m.lines), 5);
  let media = { player: null, destroy: () => {} };
  const rec = new Recorder();
  const st = { i: 0, scores: [], wpm: [], answered: false, started: Date.now() };

  render(view, html`<div class="wrap">
    <div class="page-head"><div class="stack" style="gap:4px"><h1>${LABEL[kind]}</h1><p>${m.title}</p></div>
      <a class="btn" href="#pratiquer">Quitter</a></div>
    ${hasMedia(m) ? html`<section class="panel flush" style="max-width:720px">${mediaHtml(m, { title: false })}</section>` : ''}
    <section class="panel" id="ex" aria-live="polite"></section></div>`);
  const box = $('#ex', view);
  if (!items.length) { render(box, html`<p class="notice">Ce contenu est trop court pour cet exercice.</p>`); return () => {}; }
  media = mountMedia(view, m);
  const listen = (item, slow) => playItem(media.player, item, { slow });

  const head = () => html`<div class="row between"><span class="chip">${st.i + 1} / ${items.length}</span>
    <div class="progress" style="flex:1;max-width:420px" aria-hidden="true"><i style="width:${(st.i / items.length) * 100}%"></i></div></div>`;
  const listenBtns = (label) => html`<div class="row tight">
    <button class="btn primary" type="button" data-listen>${icon.speaker}${label}</button>
    <button class="btn" type="button" data-slow>Voix lente</button></div>`;
  const wireListen = (item) => {
    $('[data-listen]', box)?.addEventListener('click', () => listen(item, false));
    $('[data-slow]', box)?.addEventListener('click', () => listen(item, true));
  };
  const nextBtn = () => html`<div class="row"><button class="btn primary" type="button" id="next">${st.i === items.length - 1 ? 'Voir le résultat' : 'Phrase suivante'}</button></div>`;
  const answered = (score, wpm) => {
    st.answered = true; st.scores.push(score); if (wpm) st.wpm.push(wpm);
    box.insertAdjacentHTML('beforeend', markup(nextBtn()));
    $('#next', box).addEventListener('click', next);
    $('#next', box).focus();
  };

  function show() {
    st.answered = false;
    stopSpeaking(); media.player?.stop?.();
    const item = items[st.i];
    if (kind === 'lecture' || kind === 'repetition') return oral(item);
    if (kind === 'dictee') return dictation(item);
    if (kind === 'trous') return cloze(item);
    return reco(item);
  }

  /* ---------- oral: read aloud / repeat from memory ---------- */
  function oral(item) {
    const hidden = kind === 'repetition';
    render(box, html`${head()}
      <p class="muted">${hidden ? 'Écoute le passage, puis répète-le de mémoire, le plus naturellement possible.' : 'Lis cette phrase à voix haute. Écoute le modèle d’abord si tu veux.'}</p>
      <div id="target">${hidden ? html`<p class="notice" style="background:var(--chip);color:var(--muted)">Texte masqué : fie-toi à ton oreille.</p>` : html`<p class="say">${item.text}</p>`}</div>
      ${listenBtns(hidden ? 'Réécouter' : 'Écouter le modèle')}
      <div class="row"><button class="btn primary big" type="button" id="rec">${icon.mic}<span>Parler</span></button>
        <span class="hint" id="rec-hint"></span></div>
      <div id="report"></div>`);
    wireListen(item);
    if (hidden) listen(item);
    const btn = $('#rec', box);
    btn.addEventListener('click', async () => {
      if (!rec.recording) {
        try { await rec.start(); } catch (e) { toast(e.message, 'bad'); return; }
        btn.classList.add('rec'); btn.innerHTML = markup(icon.stop) + '<span>J’ai fini</span>';
        $('#rec-hint', box).innerHTML = '<span class="level-dot"></span>';
        return;
      }
      btn.classList.remove('rec'); btn.disabled = true; btn.innerHTML = markup(icon.mic) + '<span>Analyse…</span>';
      $('#rec-hint', box).textContent = 'Whisper analyse ta prononciation…';
      try {
        const take = await rec.stop();
        const r = await transcribe(take.audio, { words: true });
        const a = analyseSpeech(item.text, r.text, r.words);
        $('#target', box).innerHTML = markup(html`<p class="say muted" style="font-size:16px">${item.text}</p>`);
        btn.closest('.row').remove();
        renderReport(item, a, take);
        answered(a.score / 100, a.wpm);
      } catch (e) {
        toast(e.message, 'bad');
        btn.disabled = false; btn.innerHTML = markup(icon.mic) + '<span>Réessayer</span>'; $('#rec-hint', box).textContent = '';
      }
    });
  }

  function renderReport(item, a, take) {
    const tone = a.score >= 85 ? 'good' : a.score >= 60 ? 'warm' : 'bad';
    const timed = a.ops.filter((o) => o.start != null || o.kind === 'extra');
    const total = a.duration ? Math.max(a.duration, 0.5) : null;
    const t0 = a.ops.find((o) => o.start != null)?.start ?? 0;
    const pos = (t) => `${((t - t0) / total) * 100}%`;
    render($('#report', box), html`<div class="stack">
      <div class="row tight">
        <span class="chip ${tone}">Score ${a.score}</span>
        <span class="chip">Mots reconnus ${a.accuracy} %</span>
        ${a.wpm ? html`<span class="chip ${a.wpm < 90 ? 'warm' : ''}">${a.wpm} mots/min</span>` : ''}
        ${a.pauses.length ? html`<span class="chip warm">${a.pauses.length} pause${a.pauses.length > 1 ? 's' : ''} longue${a.pauses.length > 1 ? 's' : ''}</span>` : ''}
        ${a.fillers ? html`<span class="chip warm">${a.fillers} hésitation${a.fillers > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="diff" aria-label="Comparaison mot par mot">${a.ops.map((o) => o.kind === 'missing'
        ? html`<button class="missing" type="button" data-word="${o.word}" title="Écouter ce mot">${o.word}</button>`
        : html`<span class="${o.kind}">${o.word}</span>`)}</div>
      <div class="legend"><span><i style="background:var(--good)"></i>bien prononcé</span><span><i style="background:var(--bad)"></i>pas reconnu : clique pour l’écouter</span><span><i style="background:var(--subtle)"></i>en trop</span></div>
      ${total && timed.length ? html`<div class="stack" style="gap:6px"><span class="label">Ton débit dans le temps (${total.toFixed(1)} s)</span>
        <div class="timeline" role="img" aria-label="Chronologie de tes mots et de tes pauses">
          ${a.ops.filter((o) => o.start != null).map((o) => html`<span class="tw ${o.kind}" style="left:${pos(o.start)};width:${Math.max(0.8, ((o.end - o.start) / total) * 100)}%" title="${o.word}">${o.word}</span>`)}
          ${a.pauses.map((p) => html`<span class="gap" style="left:${pos(p.at)};width:${(p.seconds / total) * 100}%" title="Pause de ${p.seconds} s"></span>`)}
        </div>
        ${a.pauses.length ? html`<span class="hint">Pauses longues après : ${a.pauses.map((p) => `« ${p.after} » (${p.seconds} s)`).join(', ')}.</span>` : ''}</div>` : ''}
      <div class="compare">
        <div><span class="label">Ta voix</span><audio controls src="${take.url}"></audio></div>
        <div><span class="label">Le modèle</span><div class="row tight"><button class="btn small" type="button" data-model>${icon.play}Écouter</button><button class="btn small" type="button" data-model-slow>Lentement</button></div></div>
      </div>
      <p class="hint">Entendu : « ${a.recognized || '—'} »</p>
      ${a.toPractise.length ? html`<div class="row"><span class="hint">À retravailler : ${a.toPractise.join(', ')}</span>
        <button class="btn small" type="button" data-save>Ajouter ces mots au carnet</button></div>` : ''}
      <div class="row"><button class="btn small" type="button" data-retry>Réessayer cette phrase</button></div>
    </div>`);
    const rep = $('#report', box);
    for (const b of $$('[data-word]', rep)) b.addEventListener('click', () => speak(b.dataset.word.replace(/[^A-Za-z' -]/g, ''), { rate: 0.8 }));
    $('[data-model]', rep).addEventListener('click', () => listen(item, false));
    $('[data-model-slow]', rep).addEventListener('click', () => listen(item, true));
    $('[data-save]', rep)?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      let n = 0;
      for (const w of a.toPractise) if ((await repo.addCard({ front: w, context: item.text, source: m.title })).added) n++;
      toast(n ? `${n} mot${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au carnet.` : 'Ces mots sont déjà dans ton carnet.');
      import('../main.js').then((mm) => mm.refreshBadge());
    });
    $('[data-retry]', rep).addEventListener('click', () => { st.scores.pop(); if (a.wpm) st.wpm.pop(); show(); });
  }

  /* ---------- dictation ---------- */
  function dictation(item) {
    render(box, html`${head()}${listenBtns('Écouter la phrase')}
      <label class="field">Ce que tu entends<textarea class="input" id="dict" rows="3" spellcheck="false" autocapitalize="sentences"></textarea></label>
      <div class="row"><button class="btn primary" type="button" id="check">Vérifier</button></div><div id="res"></div>`);
    wireListen(item); listen(item);
    const input = $('#dict', box);
    input.focus();
    const check = () => {
      if (st.answered || !input.value.trim()) return;
      const r = align(words(item.text), words(input.value));
      input.readOnly = true; $('#check', box).remove();
      render($('#res', box), html`<div class="stack"><span class="chip ${r.score >= 0.9 ? 'good' : r.score >= 0.6 ? 'warm' : 'bad'}">${Math.round(r.score * 100)} %</span>
        <div class="diff">${r.ops.map((o) => html`<span class="${o.kind}">${o.word}</span>`)}</div>
        <div class="legend"><span><i style="background:var(--good)"></i>correct</span><span><i style="background:var(--bad)"></i>manquant ou mal écrit</span><span><i style="background:var(--subtle)"></i>en trop</span></div></div>`);
      answered(r.score);
    };
    $('#check', box).addEventListener('click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); st.answered ? next() : check(); } });
  }

  /* ---------- cloze ---------- */
  function cloze(item) {
    const parts = item.words.map((w, idx) => {
      const k = item.blanks.indexOf(idx);
      if (k < 0) return html`${w} `;
      const lead = w.match(/^[^A-Za-z0-9']*/)[0], trail = w.match(/[^A-Za-z0-9']*$/)[0];
      return html`${lead}<label class="sr" for="b${k}">Mot manquant ${k + 1}</label><input id="b${k}" data-k="${k}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${Math.max(7, item.answers[k].length + 2)}ch">${trail} `;
    });
    render(box, html`${head()}<p class="cloze">${parts}</p>${listenBtns('Écouter la phrase')}
      <div class="row"><button class="btn primary" type="button" id="check">Vérifier</button></div><div id="res"></div>`);
    wireListen(item);
    const inputs = $$('.cloze input', box);
    inputs[0]?.focus();
    const check = () => {
      if (st.answered) return;
      let ok = 0;
      inputs.forEach((el) => {
        const k = Number(el.dataset.k), good = norm(el.value) === norm(item.answers[k]);
        if (good) ok++;
        el.classList.add(good ? 'right' : 'wrong'); el.readOnly = true;
        if (!good) el.insertAdjacentHTML('afterend', markup(html` <span class="chip good">${item.answers[k]}</span>`));
      });
      $('#check', box).remove();
      render($('#res', box), html`<span class="chip ${ok === inputs.length ? 'good' : ok ? 'warm' : 'bad'}">${ok} / ${inputs.length} mots</span>`);
      answered(inputs.length ? ok / inputs.length : 0);
    };
    $('#check', box).addEventListener('click', check);
    inputs.forEach((el, k) => el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (st.answered) next(); else if (k < inputs.length - 1) inputs[k + 1].focus(); else check();
    }));
  }

  /* ---------- recognition ---------- */
  function reco(item) {
    render(box, html`${head()}${listenBtns('Écouter le passage')}<p class="muted">Quel passage as-tu entendu ?</p>
      <div class="choices">${item.options.map((o, k) => html`<button class="choice" type="button" data-k="${k}">${o}</button>`)}</div><div id="res"></div>`);
    wireListen(item); listen(item);
    for (const b of $$('.choice', box)) {
      b.addEventListener('click', () => {
        if (st.answered) return;
        const k = Number(b.dataset.k), right = item.options[k] === item.text;
        $$('.choice', box).forEach((x, j) => { x.disabled = true; if (item.options[j] === item.text) x.classList.add('right'); else if (j === k) x.classList.add('wrong'); });
        render($('#res', box), html`<span class="chip ${right ? 'good' : 'bad'}">${right ? 'Bonne réponse' : 'Ce n’était pas ce passage'}</span>`);
        answered(right ? 1 : 0);
      });
    }
  }

  async function next() {
    if (st.i < items.length - 1) { st.i++; show(); return; }
    stopSpeaking(); media.player?.stop?.();
    const score = Math.round((st.scores.reduce((a, b) => a + b, 0) / Math.max(1, st.scores.length)) * 100);
    const minutes = minutesSince(st.started);
    const wpm = st.wpm.length ? Math.round(st.wpm.reduce((a, b) => a + b, 0) / st.wpm.length) : null;
    await repo.addSession({ kind, materialId: m.id, title: m.title, score, minutes, wpm });
    render(box, html`<div class="row between"><h2>Exercice terminé</h2><span class="hint">${minutes} min</span></div>
      <div class="row" style="align-items:flex-end;gap:18px"><span class="big-score">${score}<span style="font-size:24px"> %</span></span>
        <p class="muted" style="max-width:46ch">${score >= 85 ? 'Très bien. Passe à un contenu plus difficile ou à la conversation libre.' : score >= 60 ? 'Bon travail. Refais l’exercice pour consolider.' : 'Réécoute la transcription ligne par ligne, puis recommence.'}</p></div>
      ${wpm ? html`<p class="hint">Débit moyen à l’oral : ${wpm} mots/min (un débit naturel se situe entre 120 et 160).</p>` : ''}
      <div class="row"><button class="btn primary" type="button" id="again">Recommencer</button><a class="btn" href="#pratiquer">Autre exercice</a><a class="btn" href="#coach">Discuter avec le coach</a></div>`);
    $('#again', box).addEventListener('click', () => { media.destroy(); mount(view, [kind]); });
  }

  show();
  return () => { rec.cancel(); stopSpeaking(); media.destroy(); };
}
