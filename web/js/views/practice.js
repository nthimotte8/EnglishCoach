// Practice page: the current content (player + synced transcript), exercise picker, recent contents.
import * as ai from '../ai.js';
import * as coach from '../coach.js';
import * as repo from '../repo.js';
import { cardKey } from '../srs.js';
import { speak } from '../speech.js';
import { linesFromSentences, words } from '../textproc.js';
import { $, $$, html, icon, render, shortDate, toast } from '../ui.js';
import { hasMedia, mediaHtml, mountMedia } from './media.js';

const EXERCISES = [
  { kind: 'lecture', skill: 'Prononciation', label: 'Lecture à voix haute', hint: 'Lis une phrase : chaque mot est analysé, avec réécoute de ta voix.' },
  { kind: 'repetition', skill: 'Mémoire + oral', label: 'Répétition sans texte', hint: 'Écoute le passage original puis répète-le de mémoire.' },
  { kind: 'reco', skill: 'Compréhension', label: 'Reconnaissance à l’écoute', hint: 'Retrouve le passage entendu parmi quatre.' },
  { kind: 'dictee', skill: 'Écoute + écrit', label: 'Dictée', hint: 'Écris mot pour mot ce que tu entends.' },
  { kind: 'trous', skill: 'Vocabulaire', label: 'Mots manquants', hint: 'Complète les mots retirés de la phrase.' },
];

const EXAMPLE = {
  title: 'How habits are formed', source: 'example', level: 'B2',
  sentences: [
    'So today I want to talk about how habits are formed.',
    'Most of what we do every day happens on autopilot.',
    'And that is actually a good thing for our brain.',
    'It saves energy for the decisions that really matter.',
    'But it also means bad habits are hard to break.',
    'Let me show you a simple way to change that.',
    'Every habit starts with a cue, something that triggers the behaviour.',
    'Then comes the routine, which is the action itself.',
    'Finally, there is a reward that tells your brain to remember the loop.',
    'If you keep the cue and the reward but change the routine, the habit changes too.',
  ],
};

export async function mount(view) {
  const [m, recent, cards] = await Promise.all([repo.current(), repo.listMaterials(), repo.allCards()]);
  const saved = new Set(cards.map((c) => c.key));
  let media = { destroy: () => {} };

  const others = recent.filter((r) => r.id !== m?.id).slice(0, 10);
  render(view, html`<div class="wrap">
    ${m ? html`
      <section class="panel flush">
        ${mediaHtml(m)}
        <div class="meta">
          <div class="row tight">
            <span class="chip accent" id="lvl">Niveau estimé ${m.level ?? '—'}</span>
            ${wpm(m) ? html`<span class="chip">${wpm(m)} mots/min</span>` : ''}
            <span class="chip">${m.wordCount} mots</span>
            ${m.level ? '' : html`<button class="btn quiet small" type="button" id="estimate">Estimer le niveau</button>`}
          </div>
          <a class="btn small" href="#nouveau">${icon.plus}Changer de contenu</a>
        </div>
        <div class="row between" style="padding:12px 18px 0"><h2>Transcription</h2>
          <span class="hint">Clique un mot pour l’ajouter à ton carnet, l’horaire pour écouter la ligne.</span></div>
        <div class="transcript" id="tr">
          ${m.lines.map((l, i) => html`<div class="tline" data-i="${i}">
            <button class="ts" type="button" data-play="${i}" aria-label="Écouter la ligne ${i + 1}">${l.t ?? String(i + 1).padStart(2, '0')}</button>
            <span>${words(l.text).map((w) => html`<span class="w${saved.has(cardKey(w)) ? ' saved' : ''}" data-w="${w}">${w}</span> `)}</span></div>`)}
        </div>
      </section>
      <section class="stack">
        <h2>Choisir un exercice</h2>
        <div class="grid3">
          ${EXERCISES.map((e) => html`<a class="ex-card" style="text-decoration:none" href="#exercice-${e.kind}">
            <span class="skill">${e.skill}</span><b>${e.label}</b><span>${e.hint}</span></a>`)}
          <a class="ex-card" style="text-decoration:none" href="#coach"><span class="skill">Expression orale</span><b>Discuter avec le coach</b><span>Questions sur ce contenu, corrections et bilan de niveau.</span></a>
        </div>
      </section>`
    : html`
      <div class="page-head"><div class="stack" style="gap:6px"><h1>Bienvenue</h1>
        <p>Choisis un podcast, une vidéo YouTube, un fichier audio ou laisse le coach écrire un texte. Tu t’entraînes ensuite à l’écoute et à l’oral, et le coach corrige ton anglais. Tout tourne dans ton navigateur.</p></div></div>
      <div class="row"><a class="btn primary" href="#nouveau">${icon.plus}Ajouter un contenu</a>
        <button class="btn" type="button" id="example">Essayer avec un exemple</button></div>`}
    ${others.length ? html`<section class="panel"><h2>Contenus récents</h2><div>
      ${others.map((r) => html`<div class="list-item">
        <button class="link-btn" type="button" data-open="${r.id}"><b>${r.title}</b><br><span class="hint">${sourceLabel(r)} · ${r.wordCount} mots${r.level ? ` · ${r.level}` : ''} · ${shortDate(r.createdAt)}</span></button>
        <button class="btn quiet small danger" type="button" data-del="${r.id}" aria-label="Supprimer ${r.title}">Supprimer</button></div>`)}
    </div></section>` : ''}
  </div>`);

  $('#example', view)?.addEventListener('click', async () => {
    await repo.createMaterial({ title: EXAMPLE.title, source: 'example', level: EXAMPLE.level, lines: linesFromSentences(EXAMPLE.sentences) });
    mount(view);
  });
  for (const b of $$('[data-open]', view)) b.addEventListener('click', async () => { await repo.setCurrent(Number(b.dataset.open)); media.destroy(); mount(view); });
  for (const b of $$('[data-del]', view)) {
    b.addEventListener('click', async () => {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmer'; return; }
      await repo.deleteMaterial(Number(b.dataset.del)); media.destroy(); mount(view);
    });
  }
  if (!m) return () => {};

  media = mountMedia(view, m);
  const player = media.player;
  // highlight the line being played
  if (player) {
    let last = -1;
    player.onTime = (t) => {
      let idx = -1;
      m.lines.forEach((l, i) => { if (l.sec != null && l.sec <= t + 0.3) idx = i; });
      if (idx === last) return;
      $$('.tline.on', view).forEach((e) => e.classList.remove('on'));
      const el = $(`.tline[data-i="${idx}"]`, view);
      if (el) { el.classList.add('on'); el.scrollIntoView({ block: 'nearest' }); }
      last = idx;
    };
  }

  $('#tr', view).addEventListener('click', async (e) => {
    const p = e.target.closest('[data-play]');
    if (p) {
      const l = m.lines[Number(p.dataset.play)];
      if (player && hasMedia(m) && l.sec != null) player.seek(l.sec);
      else speak(l.text);
      return;
    }
    const w = e.target.closest('[data-w]');
    if (!w) return;
    const expression = w.dataset.w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
    if (!expression) return;
    const line = m.lines[Number(w.closest('.tline').dataset.i)].text;
    const { card, added } = await repo.addCard({ front: expression, context: line, source: m.title });
    if (!added) { toast(`« ${expression} » est déjà dans ton carnet.`); return; }
    $$('[data-w]', view).filter((x) => cardKey(x.dataset.w) === card.key).forEach((x) => x.classList.add('saved'));
    toast(`« ${expression} » ajouté à ton carnet.`);
    import('../main.js').then((mm) => mm.refreshBadge());
    if (ai.state.status === 'ready') {
      coach.explain(expression, line).then((x) => repo.saveCard({ ...card, meaning: x.meaning, example: x.example })).catch(() => {});
    }
  });

  $('#estimate', view)?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (ai.state.status !== 'ready') { toast('Charge d’abord le coach (onglet Coach ou Réglages).'); return; }
    b.disabled = true; b.textContent = 'Estimation…';
    try {
      const level = await coach.estimateLevel(m);
      if (level) { await repo.updateMaterial({ ...m, level }); $('#lvl', view).textContent = `Niveau estimé ${level}`; b.remove(); }
      else { b.disabled = false; b.textContent = 'Estimer le niveau'; }
    } catch (err) { toast(err.message, 'bad'); b.disabled = false; b.textContent = 'Estimer le niveau'; }
  });

  return () => media.destroy();
}

function wpm(m) {
  if (m.source === 'theme' || m.source === 'example') return null;
  const timed = m.lines.filter((l) => l.sec != null);
  const span = timed.length > 1 ? timed[timed.length - 1].sec - timed[0].sec : 0;
  return span > 20 ? Math.round(m.wordCount / (span / 60)) : null;
}

export const sourceLabel = (r) => ({ youtube: 'YouTube', podcast: 'Podcast', file: 'Fichier', theme: `Thème · ${r.theme ?? ''}`, example: 'Exemple', text: 'Texte' }[r.source] ?? 'Texte');
