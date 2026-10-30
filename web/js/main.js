// App shell: navigation, hash routing, coach status in the sidebar, offline support.
import * as ai from './ai.js';
import * as repo from './repo.js';
import { dueCards } from './srs.js';
import { $, $$, esc, icon, markup } from './ui.js';

const ROUTES = {
  pratiquer: { label: 'Pratiquer', short: 'Pratiquer', icon: icon.book, load: () => import('./views/practice.js') },
  coach: { label: 'Coach', short: 'Coach', icon: icon.chat, load: () => import('./views/coach.js') },
  conversation: { label: 'Conversation libre', short: 'Parler', icon: icon.talk, load: () => import('./views/conversation.js') },
  vocabulaire: { label: 'Vocabulaire', short: 'Mots', icon: icon.cards, load: () => import('./views/vocab.js') },
  progression: { label: 'Progression', short: 'Progrès', icon: icon.chart, load: () => import('./views/progress.js') },
  reglages: { label: 'Réglages', short: 'Réglages', icon: icon.gear, load: () => import('./views/settings.js') },
};
// sub-pages that belong to a section in the navigation
const PARENT = { nouveau: 'pratiquer', exercice: 'pratiquer' };
const SUB = { nouveau: () => import('./views/new-material.js'), exercice: () => import('./views/exercise.js') };

for (const a of $$('[data-nav]')) {
  const r = ROUTES[a.dataset.nav];
  a.innerHTML = `${markup(r.icon)}<span class="lbl-long">${esc(r.label)}</span><span class="lbl-short">${esc(r.short)}</span>`;
}

let cleanup = null;
let navToken = 0;
async function route() {
  const [name, ...args] = (location.hash.replace(/^#/, '') || 'pratiquer').split('-');
  const known = ROUTES[name] || SUB[name];
  const key = known ? name : 'pratiquer';
  const section = PARENT[key] ?? key;
  for (const a of $$('[data-nav]')) {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const token = ++navToken;
  try { cleanup?.(); } catch { /* view already gone */ }
  cleanup = null;
  const mod = await (SUB[key] ?? ROUTES[key].load)();
  if (token !== navToken) return;
  const view = $('#view');
  view.innerHTML = '';
  cleanup = (await mod.mount(view, args)) ?? null;
  document.title = `${(ROUTES[section] ?? ROUTES.pratiquer).label} · English Coach`;
  if (document.activeElement === document.body) view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  refreshBadge();
}
window.addEventListener('hashchange', route);

/** Number of vocabulary cards due, on the navigation link. */
export async function refreshBadge() {
  const n = dueCards(await repo.allCards(), Date.now(), 999).length;
  const link = $('[data-nav="vocabulaire"]');
  link.querySelector('.badge')?.remove();
  if (n) link.insertAdjacentHTML('beforeend', `<span class="badge" aria-label="${n} à réviser">${n > 99 ? '99+' : n}</span>`);
}

/* coach status in the sidebar */
ai.onState((s) => {
  const el = $('#model-status');
  if (s.status === 'loading') {
    el.innerHTML = `<span>${esc(s.text || 'Chargement du coach…')}</span><div class="progress"><i style="width:${Math.round(s.progress * 100)}%"></i></div>`;
  } else if (s.status === 'ready' || s.status === 'thinking') {
    el.innerHTML = `<span class="row tight"><span class="chip good">Coach prêt</span></span><span class="mono" style="font-size:11px">${esc(s.modelId ?? '')}</span>`;
  } else if (s.status === 'error') {
    el.innerHTML = `<span class="chip bad">Coach indisponible</span>`;
  } else {
    el.innerHTML = '<span>Coach non chargé</span>';
  }
});

/* offline: cache the app and its libraries once loaded */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

route();

// load the coach in the background if it is already downloaded, so the first answer does not wait
setTimeout(() => ai.warmUpIfCached(), 1500);
