// Small DOM helpers shared by every view.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Tagged template that escapes interpolated values; wrap trusted markup with raw(). */
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s) });
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (Array.isArray(v)) out += v.map((x) => (x && x[RAW] !== undefined ? x[RAW] : esc(x))).join('');
      else if (v && v[RAW] !== undefined) out += v[RAW];
      else if (v !== false && v != null) out += esc(v);
    }
  });
  return raw(out);
}
/** The markup string of an html`` value (escaped if it is plain text). */
export const markup = (view) => view?.[RAW] ?? esc(view);
export const render = (el, view) => { el.innerHTML = markup(view); };

let toastTimer = null;
export function toast(message, tone = 'neutral') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

export const fmtMinutes = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`);
export const shortDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
export const longDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
export const minutesSince = (start) => Math.max(1, Math.round((Date.now() - start) / 60000));

const P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const icon = {
  mic: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`),
  stop: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`),
  play: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M7 5l12 7-12 7z"/></svg>`),
  speaker: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`),
  send: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`),
  plus: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M12 5v14M5 12h14"/></svg>`),
  book: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>`),
  chat: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M4 5h16v11H9l-5 4z"/></svg>`),
  talk: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M3 6h12v8H8l-5 4z"/><path d="M15 9h6v8l-4-3h-2"/></svg>`),
  cards: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>`),
  chart: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M4 20V4M4 20h16"/><path d="M8 15l4-5 3 3 5-6"/></svg>`),
  gear: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`),
  external: raw(`<svg class="i" viewBox="0 0 24 24" ${P}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`),
};

/** Shared rendering of coach feedback (corrections + tip). */
export function feedbackHtml(fb) {
  return html`<div class="fb" role="note">
    <b>Retour du coach</b>
    ${fb.corrections.length ? fb.corrections.map((c) => html`<div class="corr">
        <span><s>${c.original}</s> → <strong>${c.better}</strong></span>${c.why ? html`<span>${c.why}</span>` : ''}</div>`)
      : html`<span class="ok-line">Aucune erreur, bien joué.</span>`}
    ${fb.tip ? html`<span>${fb.tip}</span>` : ''}
    ${fb.corrections.length ? html`<span class="hint">Ajouté à ton carnet de vocabulaire.</span>` : ''}
  </div>`;
}

export function evaluationHtml(ev) {
  return html`<section class="panel evalcard">
    <div class="row between"><h3>Bilan</h3><div class="row tight">${ev.level ? html`<span class="chip accent mono">${ev.level}</span>` : ''}<span class="chip tnum">${ev.score} / 100</span></div></div>
    ${ev.summary ? html`<p>${ev.summary}</p>` : ''}
    ${ev.strengths.length ? html`<span class="label">Points forts</span><ul>${ev.strengths.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
    ${ev.workOn.length ? html`<span class="label">À travailler</span><ul>${ev.workOn.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
  </section>`;
}
