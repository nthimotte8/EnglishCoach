// All prompts for the on-device coach. Kept short and explicit: a 1.5B model needs simple instructions,
// a short excerpt of the content, and a strict JSON format (enforced by a grammar in llm.ts).
import { completeJson } from './llm';
import { LEVELS } from './textproc';
import type { CoachReply, Evaluation, Level, Material, Turn } from './types';

const levelSchema = { type: 'string', enum: LEVELS };

/** A short excerpt fits the model's memory (4096 tokens shared by instructions, chat and answer). */
export function excerpt(m: Material, maxChars = 1800) {
  let out = '';
  for (const l of m.lines) {
    if (out.length + l.text.length > maxChars) break;
    out += l.text + '\n';
  }
  return out.trim();
}

export async function generateText(topic: string, level: Level) {
  const r = await completeJson<{ title: string; sentences: string[] }>([
    { role: 'system', content: 'You write short spoken English monologues for language learners. Answer in JSON.' },
    { role: 'user', content:
      `Topic (in French, write in English): "${topic}". Level: ${level} (CEFR).\n` +
      `Write 10 natural spoken sentences, like a short YouTube video script, each 8 to 22 words, using vocabulary of level ${level}. ` +
      'Give a short English title.' },
  ], {
    type: 'object', required: ['title', 'sentences'],
    properties: { title: { type: 'string' }, sentences: { type: 'array', items: { type: 'string' }, minItems: 6, maxItems: 12 } },
  }, { maxTokens: 600, temperature: 0.8 });
  const sentences = (r.sentences ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (sentences.length < 3) throw new Error('Le texte généré est trop court. Réessaie.');
  return { title: String(r.title || topic).slice(0, 120), sentences };
}

export async function estimateLevel(m: Material): Promise<Level | null> {
  const r = await completeJson<{ level: Level }>([
    { role: 'system', content: 'You assess how hard an English text is for learners. Answer in JSON.' },
    { role: 'user', content: `Which CEFR level (A1 to C2) does a learner need to understand this comfortably?\n\n${excerpt(m, 2500)}` },
  ], { type: 'object', required: ['level'], properties: { level: levelSchema } }, { maxTokens: 20, temperature: 0 });
  return LEVELS.includes(r.level) ? r.level : null;
}

function system(m: Material) {
  return (
    'You are English Coach, a friendly English speaking coach for a French adult learner.\n' +
    `The learner just studied this content titled "${m.title}":\n"""\n${excerpt(m)}\n"""\n` +
    'Rules:\n' +
    '1. Ask ONE short open question at a time about the content or the learner\'s opinion. Max 40 words, simple English.\n' +
    '2. For the learner\'s last message, list up to 3 real mistakes (grammar, word choice, unnatural phrasing). ' +
    'For each: "original" (their words), "better" (corrected English), "why" (short explanation in French). ' +
    'If there is no mistake, give an empty list. Ignore missing capitals and punctuation.\n' +
    '3. "tip": one short sentence in French.\n' +
    '4. "reply": your next message to the learner, in English.'
  );
}

const replySchema = {
  type: 'object', required: ['corrections', 'tip', 'reply'],
  properties: {
    corrections: {
      type: 'array', maxItems: 3,
      items: { type: 'object', required: ['original', 'better', 'why'],
        properties: { original: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' } } },
    },
    tip: { type: 'string' },
    reply: { type: 'string' },
  },
};

export async function coachTurn(m: Material, history: Turn[], message?: string): Promise<CoachReply> {
  const msgs = [
    { role: 'system' as const, content: system(m) },
    ...history.slice(-8),
    { role: 'user' as const, content: message ? `Learner: ${message}` : 'Start: ask your first question. Corrections must be empty.' },
  ];
  const r = await completeJson<CoachReply>(msgs, replySchema, { maxTokens: 350, temperature: 0.5 });
  // small models sometimes "correct" a sentence into itself: drop those
  const corrections = (r.corrections ?? []).filter((c) => c.original && c.better &&
    c.original.trim().toLowerCase().replace(/[.!?,]/g, '') !== c.better.trim().toLowerCase().replace(/[.!?,]/g, ''));
  return { corrections: message ? corrections : [], tip: r.tip ?? '', reply: (r.reply || 'Can you tell me more?').trim() };
}

export async function evaluate(m: Material, learnerMessages: string[]): Promise<Evaluation> {
  const listing = learnerMessages.map((t, i) => `${i + 1}. ${t}`).join('\n').slice(0, 5000);
  const r = await completeJson<Evaluation>([
    { role: 'system', content: 'You are a strict but fair CEFR English examiner. Answer in JSON. Strengths, work_on and summary are in French.' },
    { role: 'user', content:
      `A French learner answered questions about "${m.title}". Their messages:\n${listing}\n\n` +
      'Judge grammar, vocabulary range and how well ideas are developed. Short answers are weak evidence: do not overrate. ' +
      'Give the CEFR level, a score from 0 to 100, up to 3 strengths, up to 3 things to work on, and a one-sentence summary.' },
  ], {
    type: 'object', required: ['level', 'score', 'strengths', 'work_on', 'summary'],
    properties: {
      level: levelSchema, score: { type: 'integer', minimum: 0, maximum: 100 },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      work_on: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      summary: { type: 'string' },
    },
  }, { maxTokens: 400, temperature: 0.2 });
  return {
    level: LEVELS.includes(r.level as Level) ? (r.level as Level) : null,
    score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
    strengths: (r.strengths ?? []).slice(0, 3), work_on: (r.work_on ?? []).slice(0, 3), summary: r.summary ?? '',
  };
}
