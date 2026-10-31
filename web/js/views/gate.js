// "Load the coach" panel, shown wherever the language model is needed and not loaded yet.
import * as ai from '../ai.js';
import { $, html, render } from '../ui.js';

/**
 * Renders the gate into `el` and calls onReady() once the model is loaded.
 * Returns a cleanup function.
 */
export function coachGate(el, onReady, { compact = false } = {}) {
  if (ai.state.status === 'ready' || ai.state.status === 'thinking') { onReady(); return () => {}; }
  let done = false;
  const paint = async () => {
    const s = ai.state;
    if (done) return;
    if (s.status === 'ready') { done = true; onReady(); return; }
    if (s.status === 'loading') {
      render(el, html`<section class="panel" aria-live="polite">
        <h2>Chargement du coach</h2>
        <p class="muted">${s.text || 'Préparation…'}</p>
        <div class="progress"><i style="width:${Math.round(s.progress * 100)}%"></i></div>
        <p class="hint">La première fois, le modèle est téléchargé (1 à 5 Go selon le niveau choisi). Ensuite il se charge depuis le cache du navigateur, même hors ligne.</p>
      </section>`);
      return;
    }
    const gpu = await ai.webgpuInfo();
    const tierKey = await ai.getTier();
    const tier = ai.TIERS.find((t) => t.key === tierKey);
    const cached = gpu.ok ? await ai.isCached(tierKey) : false;
    if (done || ai.state.status === 'loading') return;
    render(el, html`<section class="panel">
      <h2>${compact ? 'Charger le coach' : 'Le coach tourne sur ton ordinateur'}</h2>
      ${compact ? '' : html`<p class="muted">C’est un modèle d’IA qui s’exécute dans ton navigateur, sur ta carte graphique : gratuit, sans compte, et tes réponses ne quittent pas ton ordinateur.</p>`}
      ${gpu.ok ? html`
        ${tierKey !== 'leger' ? html`<p class="notice">Le niveau « ${tier?.label} » demande beaucoup de mémoire : sur un ordinateur à 8 Go (Mac M1, beaucoup de portables), il peut figer la machine. Passe en « Léger » dans <a href="#reglages">Réglages</a> en cas de doute.</p>` : ''}
        <p class="hint">Niveau du coach : <b>${tier?.label}</b> (${tier?.hint}). ${cached ? 'Déjà téléchargé : chargement en quelques secondes.' : 'Premier chargement : téléchargement unique, de préférence en Wi-Fi.'} <a href="#reglages">Changer</a></p>
        <div class="row"><button class="btn primary" type="button" data-load>${cached ? 'Charger le coach' : 'Télécharger et charger le coach'}</button></div>`
      : html`<p class="notice">${gpu.reason}</p>`}
      ${s.status === 'error' ? html`<p class="notice">${s.error}</p>` : ''}
    </section>`);
    $('[data-load]', el)?.addEventListener('click', () => { ai.load().catch(() => {}); });
  };
  const off = ai.onState(() => { paint(); });
  return () => { done = true; off(); };
}
