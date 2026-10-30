// Progress dashboard: level, practice time, streak, level curve, activity grid, vocabulary, history.
import * as repo from '../repo.js';
import { LEVELS } from '../textproc.js';
import { fmtMinutes, html, longDate, render, shortDate } from '../ui.js';

const KIND = { lecture: 'Lecture à voix haute', repetition: 'Répétition sans texte', reco: 'Reconnaissance à l’écoute', dictee: 'Dictée', trous: 'Mots manquants', coach: 'Discussion avec le coach', conversation: 'Conversation libre' };
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function mount(view) {
  const s = await repo.stats();
  render(view, html`<div class="wrap">
    <div class="page-head"><div class="stack" style="gap:4px"><h1>Progression</h1>
      <p>${s.firstAt ? `Depuis le ${longDate(s.firstAt)}. Tes données restent dans ce navigateur : pense à les sauvegarder dans Réglages.` : 'Fais un exercice ou une conversation : ta progression s’affichera ici.'}</p></div>
      <div class="row tight"><span class="label">Niveau actuel</span><span class="chip accent mono" style="font-size:18px;padding:6px 14px">${s.level ?? '—'}</span></div></div>
    <div class="grid4">
      ${[['Temps de pratique', fmtMinutes(s.totalMinutes)], ['Série en cours', `${s.streak} jour${s.streak > 1 ? 's' : ''}`],
        ['Exercices', s.exercises], ['Conversations', s.conversations], ['Contenus travaillés', s.materials],
        ['Débit moyen à l’oral', s.avgWpm ? `${s.avgWpm} mots/min` : '—'], ['Mots au carnet', s.cards.total], ['Mots acquis', s.cards.mastered]]
        .map(([l, v]) => html`<div class="panel stat"><span class="label">${l}</span><span class="v">${v}</span></div>`)}
    </div>
    <div class="grid2">
      <section class="panel"><div class="row between"><h2>Niveau CECRL</h2><span class="hint">évalué à chaque bilan</span></div>${curve(s.curve)}</section>
      <section class="panel"><div class="row between"><h2>Activité</h2><span class="hint">20 dernières semaines</span></div>
        <div class="scroll-x">${heat(s.activity)}</div>
        <div class="row tight hint">Moins ${[0, 1, 2, 3].map((n) => html`<span style="width:12px;height:12px;border-radius:3px;background:var(--heat${n})"></span>`)} Plus</div></section>
    </div>
    <section class="panel"><h2>Historique</h2>
      ${s.history.length ? html`<div class="scroll-x"><table class="t"><thead><tr><th>Date</th><th>Activité</th><th>Contenu</th><th>Score</th><th>Débit</th><th>Niveau</th></tr></thead><tbody>
        ${s.history.map((h) => html`<tr><td class="mono tnum">${shortDate(h.at)}</td><td>${KIND[h.kind] ?? h.kind}</td><td>${h.title}</td>
          <td class="tnum">${h.score != null ? `${h.score} %` : '—'}</td><td class="tnum">${h.wpm ? `${h.wpm} m/min` : '—'}</td><td class="mono">${h.level ?? '—'}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">Chaque exercice et chaque conversation terminés apparaîtront ici.</p>`}
    </section></div>`);
}

function curve(pts) {
  if (!pts.length) return html`<p class="empty">Ta courbe apparaîtra après ton premier bilan avec le coach.</p>`;
  const W = 640, H = 230, L = 40, R = 16, T = 16, B = 30;
  const y = (l) => T + (LEVELS.length - 1 - LEVELS.indexOf(l)) * ((H - T - B) / (LEVELS.length - 1));
  const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + i * ((W - L - R) / (pts.length - 1)));
  const last = pts.length - 1;
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Évolution du niveau CECRL">
    ${LEVELS.map((l) => html`<line x1="${L}" x2="${W - R}" y1="${y(l)}" y2="${y(l)}" stroke="var(--line-soft)"></line><text x="4" y="${y(l) + 4}">${l}</text>`)}
    ${pts.length > 1 ? html`<polyline points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>` : ''}
    ${pts.map((p, i) => html`<circle cx="${x(i)}" cy="${y(p.level)}" r="${i === last ? 5 : 3}" fill="var(--accent)"><title>${p.level} · ${shortDate(p.at)}</title></circle>`)}
    <text x="${x(0)}" y="${H - 8}" text-anchor="${pts.length === 1 ? 'middle' : 'start'}">${shortDate(pts[0].at)}</text>
    ${pts.length > 1 ? html`<text x="${x(last)}" y="${H - 8}" text-anchor="end">${shortDate(pts[last].at)}</text>` : ''}
  </svg>`;
}

function heat(activity) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 19 * 7);
  const cells = [];
  for (let i = 0; i < 140; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > today) { cells.push(html`<span style="background:transparent"></span>`); continue; }
    const n = activity[dayKey(d)] ?? 0;
    const lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 6 ? 2 : 3;
    cells.push(html`<span style="background:var(--heat${lvl})" title="${d.toLocaleDateString('fr-FR')} : ${n} activité${n > 1 ? 's' : ''}"></span>`);
  }
  return html`<div class="heat" role="img" aria-label="Activités par jour">${cells}</div>`;
}
