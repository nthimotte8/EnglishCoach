// Transcript parsing, exercise generation and pronunciation scoring.
// Pure functions, no DOM and no I/O: shared by the app and the Node tests.

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);
export const norm = (w) => String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '');
export const wordCount = (lines) => lines.reduce((a, l) => a + words(l.text).length, 0);

export const toSec = (ts) => (ts ? ts.split(':').reduce((a, p) => a * 60 + Number(p), 0) : null);
export const fmtTs = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const TS_ONLY = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const TS_LEAD = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;
const NOISE = /^\[(music|musique|applause|applaudissements|laughter|rires)\]$/i;
const A11Y = /^\d+\s+(seconde?s?|minutes?)/i;
const SENT_END = /[.!?]["')\]]*$/;
const clean = (t) => t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

export function splitSentences(text) {
  const parts = String(text).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return parts.map((p) => p.trim()).filter((p) => words(p).length >= 2);
}

/** Transcript pasted from YouTube (timestamps optional) or plain text → [{t, sec, text}]. */
export function parseTranscript(raw) {
  const lines = String(raw).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  let pending = null;
  for (const l of lines) {
    if (A11Y.test(l)) continue;
    if (TS_ONLY.test(l)) { pending = l; continue; }
    const m = l.match(TS_LEAD);
    let t = null, text = l;
    if (m) { t = m[1]; text = m[2]; } else if (pending) t = pending;
    pending = null;
    text = clean(text);
    if (!text || NOISE.test(text)) continue;
    const sec = toSec(t);
    out.push({ t: sec != null ? fmtTs(sec) : null, sec, text });
  }
  if (!out.length) return [];
  if (out.every((o) => o.t === null)) {
    return splitSentences(out.map((o) => o.text).join(' ')).map((text) => ({ t: null, sec: null, text }));
  }
  return out;
}

/** Whisper word chunks [{word, start, end}] → lines cut at sentence ends, long pauses or 18 words. */
export function linesFromTimedWords(ws) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const sec = Math.floor(cur[0].start);
    out.push({ t: fmtTs(sec), sec, text: cur.map((w) => w.word.trim()).join(' ') });
    cur = [];
  };
  ws.forEach((w, i) => {
    if (!w.word.trim()) return;
    cur.push(w);
    const gap = i + 1 < ws.length ? ws[i + 1].start - w.end : 0;
    if (SENT_END.test(w.word.trim()) || cur.length >= 18 || (gap > 0.8 && cur.length >= 6)) flush();
  });
  flush();
  return out;
}

/** Lines for generated text with an estimated speaking time (~150 words/min). */
export function linesFromSentences(sentences) {
  let sec = 0;
  return sentences.map((s) => String(s).trim()).filter(Boolean).map((text) => {
    const l = { t: fmtTs(sec), sec, text };
    sec += Math.max(3, Math.round(words(text).length / 2.5));
    return l;
  });
}

/** Sentences when punctuated, otherwise ~14-word chunks; each keeps its time span in the source. */
export function exerciseUnits(lines) {
  const tokens = [];
  lines.forEach((l, i) => words(l.text).forEach((w) => tokens.push([w, i])));
  if (!tokens.length) return [];
  const span = (chunk) => {
    const first = chunk[0][1], last = chunk[chunk.length - 1][1];
    const start = lines[first].sec;
    let end = last + 1 < lines.length ? lines[last + 1].sec : null;
    if (end == null && lines[last].sec != null) end = lines[last].sec + 6;
    return { text: chunk.map(([w]) => w).join(' '), start, end };
  };
  let groups = [], cur = [];
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

/** Word-level LCS alignment between what was expected and what was said. */
export function align(expected, said) {
  const n = expected.length, m = said.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(expected[i]) === norm(said[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(expected[i]) === norm(said[j])) { ops.push({ kind: 'ok', word: expected[i], at: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ kind: 'missing', word: expected[i++] });
    else ops.push({ kind: 'extra', word: said[j], at: j++ });
  }
  while (i < n) ops.push({ kind: 'missing', word: expected[i++] });
  while (j < m) ops.push({ kind: 'extra', word: said[j], at: j++ });
  const matches = n && m ? dp[0][0] : 0;
  return { ops, matches, accuracy: n ? matches / n : 0, score: n ? matches / Math.max(n, m) : 0 };
}

/**
 * Pronunciation report from Whisper's word timestamps.
 * - accuracy: share of expected words recognised (intelligibility)
 * - wpm, long pauses (> 0.7 s between words), hesitations (fillers like "uh", "um")
 * - per-word timing so the UI can draw a timeline and replay single words
 */
export function analyseSpeech(expected, recognized, timed = []) {
  const said = timed.length ? timed.map((w) => w.word.trim()).filter(Boolean) : words(recognized);
  const a = align(words(expected), said);
  let wpm = null, pauses = [], duration = null;
  const tw = timed.filter((w) => w.word.trim());
  if (tw.length >= 2) {
    duration = Math.max(0.1, tw[tw.length - 1].end - tw[0].start);
    wpm = Math.round(tw.length / (duration / 60));
    for (let k = 1; k < tw.length; k++) {
      const gap = tw[k].start - tw[k - 1].end;
      if (gap > 0.7) pauses.push({ after: tw[k - 1].word.trim(), seconds: Math.round(gap * 10) / 10, at: tw[k - 1].end });
    }
  }
  const fillers = said.filter((w) => /^(uh+|um+|erm+|euh+|hmm+|ah+)$/i.test(norm(w))).length;
  const fluency = wpm == null ? 1 : Math.max(0, Math.min(1, wpm / 110) - 0.05 * pauses.length - 0.03 * fillers);
  const ops = a.ops.map((o) => (o.at != null && tw[o.at] ? { ...o, start: tw[o.at].start, end: tw[o.at].end } : o));
  return {
    recognized: recognized.trim(),
    score: Math.round(100 * (0.8 * a.score + 0.2 * fluency)),
    accuracy: Math.round(a.accuracy * 100),
    wpm, duration, pauses, fillers, ops,
    toPractise: [...new Set(a.ops.filter((o) => o.kind === 'missing').map((o) => o.word.replace(/[^A-Za-z']/g, '')).filter(Boolean))],
  };
}

const STOPWORDS = new Set(`the a an and or but so to of in on at for with from by as is are was were be been being it its
this that these those there their they them we you your our i me my he she his her him have has had do does did not no yes
can could will would should may might must just very really also than then about into over up down out more most some any
all what which who when where why how if because like get got going one`.split(/\s+/));

export function shuffle(a, rnd = Math.random) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export const EXERCISES = ['lecture', 'repetition', 'reco', 'dictee', 'trous'];

export function buildExercise(kind, units, n = 5, rnd = Math.random) {
  if (!EXERCISES.includes(kind)) throw new Error(`unknown exercise ${kind}`);
  if (units.length < 2) return [];
  return shuffle(units, rnd).slice(0, Math.min(n, units.length)).map((u) => {
    const item = { text: u.text, start: u.start, end: u.end };
    if (kind === 'reco') {
      item.options = shuffle([u.text, ...shuffle(units.filter((o) => o.text !== u.text), rnd).slice(0, 3).map((o) => o.text)], rnd);
    } else if (kind === 'trous') {
      const ws = words(u.text);
      const cand = ws.map((_, i) => i).filter((i) => norm(ws[i]).length >= 4 && !STOPWORDS.has(norm(ws[i])));
      let blanks = shuffle(cand, rnd).slice(0, ws.length > 14 ? 3 : 2).sort((a, b) => a - b);
      if (!blanks.length) blanks = [ws.reduce((best, w, i) => (norm(w).length > norm(ws[best]).length ? i : best), 0)];
      item.words = ws;
      item.blanks = blanks;
      item.answers = blanks.map((i) => ws[i].replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''));
    }
    return item;
  });
}

/** Extract one JSON value from a model reply (whole text, a ``` fence, or first {...}). */
export function extractJson(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch { /* try the next shape */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* next */ } }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through */ } }
  throw new Error('Le coach a donné une réponse illisible. Réessaie.');
}

/**
 * Reads a string field out of JSON that is still being written, e.g. '{"reply": "Hello, ho'.
 * Returns {value, done}: the text so far (unescaped) and whether its closing quote has arrived.
 */
export function partialField(text, field) {
  const m = String(text).match(new RegExp(`"${field}"\\s*:\\s*"`));
  if (!m) return { value: '', done: false };
  let out = '', i = m.index + m[0].length;
  const esc = { n: '\n', t: '\t', r: '', '"': '"', '\\': '\\', '/': '/', b: '', f: '' };
  while (i < text.length) {
    const c = text[i];
    if (c === '"') return { value: out, done: true };
    if (c === '\\') {
      const n = text[i + 1];
      if (n === undefined) break;
      if (n === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += esc[n] ?? n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return { value: out, done: false };
}

export function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Minimal RSS reader (podcast feeds). */
export function parseFeed(xml, limit = 30) {
  const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
  const tag = (x, name) => { const m = x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : null; };
  const attr = (x, name, a) => { const m = x.match(new RegExp(`<${name}\\s[^>]*${a}="([^"]+)"`, 'i')); return m ? decode(m[1]) : null; };
  const dur = (raw) => {
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    const p = raw.split(':').map(Number);
    return p.some(Number.isNaN) ? null : p.reduce((a, x) => a * 60 + x, 0);
  };
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new Error('Ce lien n’est pas un flux RSS de podcast.');
  const head = xml.split(/<item[\s>]/i)[0];
  const episodes = [];
  for (const it of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []) {
    const url = attr(it, 'enclosure', 'url');
    const type = attr(it, 'enclosure', 'type') ?? 'audio';
    if (!url || !type.startsWith('audio')) continue;
    episodes.push({ title: tag(it, 'title') ?? 'Épisode', audioUrl: url, published: tag(it, 'pubDate'), duration: dur(tag(it, 'itunes:duration')) });
    if (episodes.length >= limit) break;
  }
  if (!episodes.length) throw new Error('Aucun épisode audio dans ce flux.');
  return { show: tag(head, 'title') ?? 'Podcast', episodes };
}
