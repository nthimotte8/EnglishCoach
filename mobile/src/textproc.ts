// Transcript parsing, exercise generation and scoring. Pure functions, no I/O.
// (Port of the former backend's textproc.py.)
import type { ExerciseItem, ExerciseKind, Level, Line, SpeechScore, WordOp } from './types';

export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const words = (s: string) => String(s).trim().split(/\s+/).filter(Boolean);
export const norm = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '');

export const toSec = (ts: string | null | undefined) =>
  ts ? ts.split(':').reduce((a, p) => a * 60 + Number(p), 0) : null;
export const fmtTs = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const TS_ONLY = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const TS_LEAD = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;
const NOISE = /^\[(music|musique|applause|applaudissements|laughter|rires)\]$/i;
const A11Y = /^\d+\s+(seconde?s?|minutes?)/i;
const SENT_END = /[.!?]["')\]]*$/;
const clean = (t: string) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

export function splitSentences(text: string): string[] {
  const parts = String(text).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return parts.map((p) => p.trim()).filter((p) => words(p).length >= 2);
}

/** Transcript pasted from YouTube (timestamps optional) or plain text. */
export function parseTranscript(raw: string): Line[] {
  const lines = String(raw).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out: Line[] = [];
  let pending: string | null = null;
  for (const l of lines) {
    if (A11Y.test(l)) continue;
    if (TS_ONLY.test(l)) { pending = l; continue; }
    const m = l.match(TS_LEAD);
    let t: string | null = null, text = l;
    if (m) { t = m[1]; text = m[2]; } else if (pending) t = pending;
    pending = null;
    text = clean(text);
    if (!text || NOISE.test(text)) continue;
    const sec = toSec(t);
    out.push({ t: sec != null ? fmtTs(sec) : null, sec, text });
  }
  if (!out.length) return [];
  if (out.every((o) => o.t === null)) return splitSentences(out.map((o) => o.text).join(' ')).map((text) => ({ t: null, sec: null, text }));
  return out;
}

/** Lines from timed recognition segments (one per word on iOS): regrouped into sentences or ~14-word lines. */
export function linesFromTimedWords(ws: { word: string; start: number; end: number }[]): Line[] {
  const out: Line[] = [];
  let cur: typeof ws = [];
  const flush = () => {
    if (!cur.length) return;
    const sec = Math.floor(cur[0].start);
    out.push({ t: fmtTs(sec), sec, text: cur.map((w) => w.word).join(' ') });
    cur = [];
  };
  ws.forEach((w, i) => {
    cur.push(w);
    const gap = i + 1 < ws.length ? ws[i + 1].start - w.end : 0;
    if (SENT_END.test(w.word) || cur.length >= 18 || (gap > 0.8 && cur.length >= 6)) flush();
  });
  flush();
  return out;
}

/** Lines for generated text, with an estimated speaking time (~150 words/min). */
export function linesFromSentences(sentences: string[]): Line[] {
  let sec = 0;
  return sentences.map((s) => s.trim()).filter(Boolean).map((text) => {
    const l = { t: fmtTs(sec), sec, text };
    sec += Math.max(3, Math.round(words(text).length / 2.5));
    return l;
  });
}

export type Unit = { text: string; start: number | null; end: number | null };

/** Sentences when the transcript is punctuated, otherwise ~14-word chunks; each keeps its time span. */
export function exerciseUnits(lines: Line[]): Unit[] {
  const tokens: [string, number][] = [];
  lines.forEach((l, i) => words(l.text).forEach((w) => tokens.push([w, i])));
  if (!tokens.length) return [];
  const span = (chunk: [string, number][]): Unit => {
    const first = chunk[0][1], last = chunk[chunk.length - 1][1];
    const start = lines[first].sec;
    let end = last + 1 < lines.length ? lines[last + 1].sec : null;
    if (end == null && lines[last].sec != null) end = (lines[last].sec as number) + 6;
    return { text: chunk.map(([w]) => w).join(' '), start, end };
  };
  let groups: [string, number][][] = [];
  let cur: [string, number][] = [];
  for (const tok of tokens) {
    cur.push(tok);
    if (SENT_END.test(tok[0])) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  const avg = tokens.length / groups.length;
  if (groups.length < 2 || avg > 32 || avg < 4) {
    groups = [];
    for (let i = 0; i < tokens.length; i += 14) groups.push(tokens.slice(i, i + 14));
  }
  return groups.filter((g) => g.length >= 4 && g.length <= 40).map(span);
}

export function align(expected: string[], said: string[]) {
  const n = expected.length, m = said.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(expected[i]) === norm(said[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: WordOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(expected[i]) === norm(said[j])) { ops.push({ kind: 'ok', word: expected[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ kind: 'missing', word: expected[i++] });
    else ops.push({ kind: 'extra', word: said[j++] });
  }
  while (i < n) ops.push({ kind: 'missing', word: expected[i++] });
  while (j < m) ops.push({ kind: 'extra', word: said[j++] });
  const matches = n && m ? dp[0][0] : 0;
  return { ops, matches, accuracy: n ? matches / n : 0, score: n ? matches / Math.max(n, m) : 0 };
}

/** accuracy = share of expected words recognised; fluency from speaking rate and long pauses. */
export function scoreSpeech(expected: string, recognized: string, timed: { start: number; end: number }[] = []): SpeechScore {
  const a = align(words(expected), words(recognized));
  let wpm: number | null = null, pauses = 0;
  if (timed.length >= 2) {
    const duration = Math.max(0.1, timed[timed.length - 1].end - timed[0].start);
    wpm = Math.round(timed.length / (duration / 60));
    for (let k = 1; k < timed.length; k++) if (timed[k].start - timed[k - 1].end > 0.7) pauses++;
  }
  const fluency = wpm == null ? 1 : Math.max(0, Math.min(1, wpm / 110) - 0.05 * pauses);
  return {
    recognized, score: Math.round(100 * (0.8 * a.score + 0.2 * fluency)), accuracy: Math.round(a.accuracy * 100),
    wpm, long_pauses: pauses, ops: a.ops, to_practise: a.ops.filter((o) => o.kind === 'missing').map((o) => o.word),
  };
}

const STOPWORDS = new Set(`the a an and or but so to of in on at for with from by as is are was were be been being it its
this that these those there their they them we you your our i me my he she his her him have has had do does did not no yes
can could will would should may might must just very really also than then about into over up down out more most some any
all what which who when where why how if because like get got going one`.split(/\s+/));

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function buildExercise(kind: ExerciseKind, units: Unit[], n = 5): ExerciseItem[] {
  if (units.length < 2) return [];
  return shuffle(units).slice(0, Math.min(n, units.length)).map((u) => {
    const item: ExerciseItem = { text: u.text, start: u.start, end: u.end };
    if (kind === 'reco') {
      item.options = shuffle([u.text, ...shuffle(units.filter((o) => o.text !== u.text)).slice(0, 3).map((o) => o.text)]);
    } else if (kind === 'trous') {
      const ws = words(u.text);
      const cand = ws.map((w, i) => i).filter((i) => norm(ws[i]).length >= 4 && !STOPWORDS.has(norm(ws[i])));
      let blanks = shuffle(cand).slice(0, ws.length > 14 ? 3 : 2).sort((a, b) => a - b);
      if (!blanks.length) blanks = [ws.reduce((best, w, i) => (norm(w).length > norm(ws[best]).length ? i : best), 0)];
      item.words = ws;
      item.blanks = blanks;
      item.answers = blanks.map((i) => ws[i].replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''));
    }
    return item;
  });
}

export const wordCount = (lines: Line[]) => lines.reduce((a, l) => a + words(l.text).length, 0);
