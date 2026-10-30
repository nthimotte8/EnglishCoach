// Data access on top of IndexedDB: contents, practice sessions, vocabulary cards, progress.
import * as db from './db.js';
import { cardKey, isDue, isMastered, newCard } from './srs.js';
import { wordCount } from './textproc.js';

/* ---------------- contents ---------------- */
export async function createMaterial(m) {
  const row = await db.put('materials', { level: null, url: null, videoId: null, audioUrl: null, theme: null, ...m,
    wordCount: wordCount(m.lines), createdAt: Date.now() });
  await setCurrent(row.id);
  return row;
}
export const getMaterial = (id) => db.get('materials', id);
export async function listMaterials() { return (await db.all('materials')).sort((a, b) => b.createdAt - a.createdAt); }
export async function updateMaterial(m) { return db.put('materials', m); }
export async function deleteMaterial(id) {
  await db.del('materials', id);
  if ((await db.getSetting('material')) === id) await db.setSetting('material', null);
}
export async function current() {
  const id = await db.getSetting('material');
  return id ? (await getMaterial(id)) ?? null : null;
}
export const setCurrent = (id) => db.setSetting('material', id);

/* ---------------- sessions ---------------- */
export async function addSession(s) {
  const row = await db.put('sessions', { materialId: null, score: null, level: null, messages: 0, wpm: null, ...s,
    minutes: Math.max(1, s.minutes ?? 1), at: Date.now() });
  if (s.level) await db.setSetting('level', s.level);
  return row;
}

/* ---------------- vocabulary ---------------- */
/** Adds a card unless the same expression is already in the notebook. Returns {card, added}. */
export async function addCard(fields) {
  const key = cardKey(fields.front);
  if (!key) return { card: null, added: false };
  const existing = (await db.all('cards')).find((c) => c.key === key);
  if (existing) return { card: existing, added: false };
  const card = await db.put('cards', newCard({ kind: 'word', back: '', meaning: '', example: '', context: '', source: '', ...fields, key }));
  return { card, added: true };
}
export const allCards = () => db.all('cards');
export const saveCard = (c) => db.put('cards', c);
export const deleteCard = (id) => db.del('cards', id);

/** Adds the coach's corrections to the notebook as "correct this" cards. Returns how many were new. */
export async function addCorrections(corrections, source) {
  let n = 0;
  for (const c of corrections) {
    const r = await addCard({ kind: 'correction', front: c.better, back: c.original, meaning: c.why, source });
    if (r.added) n++;
  }
  return n;
}

/* ---------------- progress ---------------- */
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function stats() {
  const [sessions, materials, cards, level] = await Promise.all([db.all('sessions'), db.all('materials'), db.all('cards'), db.getSetting('level')]);
  sessions.sort((a, b) => b.at - a.at);
  const titles = Object.fromEntries(materials.map((m) => [m.id, m.title]));
  const activity = {};
  sessions.forEach((s) => { const k = dayKey(s.at); activity[k] = (activity[k] ?? 0) + 1; });
  cards.forEach((c) => { if (c.lastReview) { const k = dayKey(c.lastReview); activity[k] = (activity[k] ?? 0) + 1; } });
  let streak = 0;
  for (let d = new Date(); ; d.setDate(d.getDate() - 1)) {
    if (activity[dayKey(d)]) streak++;
    else if (streak || dayKey(d) !== dayKey(Date.now())) break; // today may still be empty
  }
  const spoken = sessions.filter((s) => s.wpm);
  return {
    level,
    totalMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
    materials: new Set(sessions.filter((s) => s.materialId).map((s) => s.materialId)).size,
    exercises: sessions.filter((s) => !['coach', 'conversation'].includes(s.kind)).length,
    conversations: sessions.filter((s) => ['coach', 'conversation'].includes(s.kind)).length,
    messages: sessions.reduce((a, s) => a + (s.messages ?? 0), 0),
    avgWpm: spoken.length ? Math.round(spoken.reduce((a, s) => a + s.wpm, 0) / spoken.length) : null,
    firstAt: sessions.length ? sessions[sessions.length - 1].at : null,
    streak,
    curve: sessions.filter((s) => s.level).reverse().map((s) => ({ at: s.at, level: s.level })),
    activity,
    history: sessions.slice(0, 60).map((s) => ({ ...s, title: s.title ?? titles[s.materialId] ?? '—' })),
    cards: { total: cards.length, due: cards.filter((c) => isDue(c)).length, mastered: cards.filter(isMastered).length },
  };
}
