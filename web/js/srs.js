// Spaced repetition for the vocabulary notebook (simplified SM-2).
// A card is reviewed, the learner grades recall 0–3, and the next review date moves further away each success.

export const GRADES = [
  { value: 0, label: 'À revoir', hint: '< 10 min' },
  { value: 1, label: 'Difficile' },
  { value: 2, label: 'Bien' },
  { value: 3, label: 'Facile' },
];

const DAY = 86400000;

export function newCard(fields, now = Date.now()) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, createdAt: now, lastReview: null, ...fields };
}

/** Returns the updated card after a review graded 0 (forgot) to 3 (easy). */
export function review(card, grade, now = Date.now()) {
  const c = { ...card, lastReview: now };
  if (grade === 0) {
    c.reps = 0;
    c.lapses += 1;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000;
    return c;
  }
  c.ease = Math.max(1.3, c.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  if (c.reps === 0) c.interval = grade === 3 ? 4 : 1;
  else if (c.reps === 1) c.interval = grade === 1 ? 3 : grade === 3 ? 8 : 6;
  else c.interval = Math.round(c.interval * (grade === 1 ? 1.2 : c.ease * (grade === 3 ? 1.3 : 1)));
  c.interval = Math.min(c.interval, 365);
  c.reps += 1;
  c.due = now + c.interval * DAY;
  return c;
}

export const isDue = (card, now = Date.now()) => card.due <= now;
/** Mastered: survived at least 3 reviews and is spaced 3 weeks or more. */
export const isMastered = (card) => card.reps >= 3 && card.interval >= 21;

/** Due cards first (most overdue first), capped per session. */
export function dueCards(cards, now = Date.now(), limit = 20) {
  return cards.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due).slice(0, limit);
}

/** Normalised key so the same expression is not added twice. */
export const cardKey = (front) => String(front).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
