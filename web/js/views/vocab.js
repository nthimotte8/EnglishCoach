// Vocabulary notebook with spaced-repetition review.
import * as ai from '../ai.js';
import * as coach from '../coach.js';
import * as repo from '../repo.js';
import { dueCards, GRADES, isMastered, review } from '../srs.js';
import { Recorder, speak, transcribe } from '../speech.js';
import { norm, words } from '../textproc.js';
import { $, $$, html, icon, markup, render, shortDate, toast } from '../ui.js';

const DAY = 86400000;
const nextLabel = (due) => {
  const d = due - Date.now();
  if (d <= 0) return 'maintenant';
  if (d < DAY) return 'aujourd’hui';
  const n = Math.round(d / DAY);
  return n === 1 ? 'demain' : `dans ${n} j`;
};
/** Hides the expression in its context sentence. */
const blank = (context, front) => {
  if (!context) return '';
  const re = new RegExp(`\\b${front.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(context) ? context.replace(re, '_____') : '';
};
const close = (a, b) => {
  const x = words(a).map(norm).join(' '), y = words(b).map(norm).join(' ');
  if (x === y) return 'exact';
  // one small typo per 6 letters is "almost"
  const dist = lev(x, y);
  return dist <= Math.max(1, Math.floor(y.length / 6)) ? 'almost' : 'wrong';
};
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export async function mount(view, [tab]) {
  let rec = new Recorder();
  const cards = await repo.allCards();
  const due = dueCards(cards);
  const active = tab === 'carnet' || !due.length ? 'carnet' : 'reviser';

  render(view, html`<div class="wrap">
    <div class="page-head"><div class="stack" style="gap:4px"><h1>Vocabulaire</h1>
      <p>Les mots que tu ajoutes et les corrections du coach reviennent au bon moment pour que tu les retiennes.</p></div>
      <div class="seg" role="group" aria-label="Vue"><button type="button" data-tab="reviser" aria-pressed="${active === 'reviser'}">Réviser${due.length ? ` (${due.length})` : ''}</button>
        <button type="button" data-tab="carnet" aria-pressed="${active === 'carnet'}">Carnet (${cards.length})</button></div></div>
    <div id="pane"></div></div>`);
  for (const b of $$('[data-tab]', view)) b.addEventListener('click', () => { location.hash = `#vocabulaire-${b.dataset.tab}`; });
  const pane = $('#pane', view);

  /* ---------------- review session ---------------- */
  if (active === 'reviser') {
    let i = 0, right = 0;
    const step = () => {
      if (i >= due.length) {
        render(pane, html`<section class="panel flash"><h2>Révision terminée</h2>
          <p class="muted">${right} / ${due.length} retrouvé${right > 1 ? 's' : ''} du premier coup. Les cartes reviendront au moment où tu risques de les oublier.</p>
          <div class="row"><a class="btn primary" href="#vocabulaire-carnet">Voir le carnet</a><a class="btn" href="#conversation">Les utiliser en conversation</a></div></section>`);
        import('../main.js').then((m) => m.refreshBadge());
        return;
      }
      const c = due[i];
      const isCorr = c.kind === 'correction';
      const hiddenCtx = isCorr ? '' : blank(c.context, c.front);
      render(pane, html`<section class="panel flash">
        <span class="hint">${i + 1} / ${due.length}</span>
        ${isCorr ? html`<span class="label">Comment le dire correctement ?</span><p class="front"><s>${c.back}</s></p>${c.meaning ? html`<p class="ctx">${c.meaning}</p>` : ''}`
          : html`<span class="label">Retrouve l’expression anglaise</span>
            ${c.meaning ? html`<p class="front">${c.meaning}</p>` : ''}
            ${hiddenCtx ? html`<p class="ctx">« ${hiddenCtx} »</p>` : c.meaning ? '' : html`<p class="front">${c.front}</p><p class="ctx">Tu te souviens de son sens ?</p>`}`}
        ${!isCorr && !c.meaning && !hiddenCtx ? '' : html`<form class="row" id="ans" style="justify-content:center;width:100%;max-width:560px">
          <label class="sr" for="guess">Ta réponse</label>
          <input class="input" id="guess" style="flex:1;min-width:180px" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Écris ou dis ta réponse">
          <button class="btn icon" type="button" id="say" aria-label="Répondre à l’oral">${icon.mic}</button>
          <button class="btn primary" type="submit">Vérifier</button></form>`}
        <button class="btn quiet" type="button" id="reveal">Afficher la réponse</button>
        <div id="back" class="stack" style="align-items:center" hidden></div>
      </section>`);
      const showBack = (verdict) => {
        $('#ans', pane)?.remove(); $('#reveal', pane).remove();
        const back = $('#back', pane);
        back.hidden = false;
        render(back, html`
          ${verdict ? html`<span class="chip ${verdict === 'exact' ? 'good' : verdict === 'almost' ? 'warm' : 'bad'}">${verdict === 'exact' ? 'Exact' : verdict === 'almost' ? 'Presque' : 'Pas tout à fait'}</span>` : ''}
          <p class="front">${c.front} <button class="btn quiet small" type="button" id="hear" aria-label="Écouter">${icon.speaker}</button></p>
          ${!isCorr && c.meaning ? html`<p class="muted">${c.meaning}</p>` : ''}
          ${c.context && !isCorr ? html`<p class="ctx">« ${c.context} »</p>` : ''}
          ${c.example ? html`<p class="ctx">Ex. : ${c.example}</p>` : ''}
          <span class="label">Comment ça s’est passé ?</span>
          <div class="grades">${GRADES.map((g) => html`<button class="btn${g.value === suggested(verdict) ? ' primary' : ''}" type="button" data-grade="${g.value}">${g.label}${g.hint ? html`<small>${g.hint}</small>` : ''}</button>`)}</div>`);
        speak(c.front);
        $('#hear', back).addEventListener('click', () => speak(c.front));
        for (const b of $$('[data-grade]', back)) {
          b.addEventListener('click', async () => {
            const g = Number(b.dataset.grade);
            if (g >= 2 && verdict !== 'wrong') right++;
            await repo.saveCard(review(c, g));
            if (g === 0) due.push({ ...review(c, g) }); // seen again at the end of this session
            i++; step();
          });
        }
        $('[data-grade].primary', back)?.focus();
      };
      const suggested = (v) => (v === 'exact' ? 2 : v === 'almost' ? 1 : v === 'wrong' ? 0 : -1);
      $('#reveal', pane).addEventListener('click', () => showBack(null));
      $('#ans', pane)?.addEventListener('submit', (e) => {
        e.preventDefault();
        const g = $('#guess', pane).value.trim();
        if (g) showBack(close(g, c.front));
      });
      $('#guess', pane)?.focus();
      $('#say', pane)?.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        if (!rec.recording) {
          try { await rec.start(); } catch (err) { toast(err.message, 'bad'); return; }
          b.classList.add('rec'); b.innerHTML = markup(icon.stop); return;
        }
        b.classList.remove('rec'); b.disabled = true;
        try {
          const take = await rec.stop();
          const r = await transcribe(take.audio, { words: false });
          $('#guess', pane).value = r.text.replace(/[.!?]+$/, '');
        } catch (err) { toast(err.message, 'bad'); }
        b.disabled = false; b.innerHTML = markup(icon.mic);
      });
    };
    step();
    return () => rec.cancel();
  }

  /* ---------------- notebook ---------------- */
  const paint = (filter = '') => {
    const f = norm(filter);
    const list = cards.filter((c) => !f || norm(c.front + ' ' + c.meaning + ' ' + c.back).includes(f)).sort((a, b) => b.createdAt - a.createdAt);
    render($('#list', pane), list.length ? html`<div class="scroll-x"><table class="t"><thead><tr><th>Expression</th><th>Sens / correction</th><th>Prochaine révision</th><th><span class="sr">Actions</span></th></tr></thead><tbody>
      ${list.map((c) => html`<tr>
        <td><b>${c.front}</b>${c.kind === 'correction' ? html`<br><span class="hint">au lieu de <s>${c.back}</s></span>` : ''}${c.context ? html`<br><span class="hint">« ${c.context} »</span>` : ''}</td>
        <td>${c.meaning || html`<span class="hint">—</span>`}${c.example ? html`<br><span class="hint">Ex. : ${c.example}</span>` : ''}</td>
        <td class="tnum">${isMastered(c) ? html`<span class="chip good">Acquis</span>` : nextLabel(c.due)}<br><span class="hint">ajouté le ${shortDate(c.createdAt)}</span></td>
        <td><div class="row tight" style="flex-wrap:nowrap">
          <button class="btn quiet small" type="button" data-hear="${c.id}" aria-label="Écouter ${c.front}">${icon.speaker}</button>
          ${!c.meaning && c.kind !== 'correction' ? html`<button class="btn quiet small" type="button" data-explain="${c.id}">Expliquer</button>` : ''}
          <button class="btn quiet small danger" type="button" data-del="${c.id}">Supprimer</button></div></td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">${cards.length ? 'Aucun résultat.' : 'Ton carnet est vide. Clique un mot dans une transcription, ou laisse le coach y ajouter ses corrections.'}</p>`);
  };

  render(pane, html`<section class="panel">
      <form class="row" id="add" style="align-items:flex-end">
        <label class="field" style="flex:1 1 220px">Nouvelle expression<input id="front" required placeholder="Ex. to catch up on"></label>
        <label class="field" style="flex:1 1 220px">Sens en français (facultatif)<input id="meaning" placeholder="Laisse vide : le coach le complète"></label>
        <button class="btn primary" type="submit">${icon.plus}Ajouter</button></form></section>
    <section class="panel">
      <div class="row between"><h2>Mon carnet</h2>
        <label class="field" style="flex:0 1 260px"><span class="sr">Rechercher</span><input id="q" type="search" placeholder="Rechercher…"></label></div>
      <div id="list"></div></section>`);
  paint();
  $('#q', pane).addEventListener('input', (e) => paint(e.target.value));
  $('#add', pane).addEventListener('submit', async (e) => {
    e.preventDefault();
    const front = $('#front', pane).value.trim();
    if (!front) return;
    const { card, added } = await repo.addCard({ front, meaning: $('#meaning', pane).value.trim(), source: 'Ajout manuel' });
    if (!added) { toast('Cette expression est déjà dans ton carnet.'); return; }
    cards.push(card);
    $('#front', pane).value = ''; $('#meaning', pane).value = '';
    paint($('#q', pane).value);
    if (!card.meaning) fill(card);
    import('../main.js').then((m) => m.refreshBadge());
  });
  const fill = async (card) => {
    if (ai.state.status !== 'ready') { toast('Charge le coach pour qu’il explique automatiquement les expressions.'); return; }
    try {
      const x = await coach.explain(card.front, card.context);
      const updated = { ...card, meaning: x.meaning, example: x.example };
      await repo.saveCard(updated);
      cards.splice(cards.findIndex((c) => c.id === card.id), 1, updated);
      paint($('#q', pane).value);
    } catch (err) { toast(err.message, 'bad'); }
  };
  $('#list', pane).addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const id = Number(t.dataset.hear ?? t.dataset.explain ?? t.dataset.del);
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (t.dataset.hear) speak(card.front);
    if (t.dataset.explain) { t.disabled = true; t.textContent = '…'; fill(card); }
    if (t.dataset.del) {
      if (t.dataset.confirm !== '1') { t.dataset.confirm = '1'; t.textContent = 'Confirmer'; return; }
      await repo.deleteCard(id);
      cards.splice(cards.indexOf(card), 1);
      paint($('#q', pane).value);
      import('../main.js').then((m) => m.refreshBadge());
    }
  });
  return () => rec.cancel();
}
