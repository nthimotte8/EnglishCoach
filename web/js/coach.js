// Every prompt the coach uses, in one place. Answers are JSON constrained by a schema.
import { json } from './ai.js';
import { LEVELS } from './textproc.js';

const S = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const str = { type: 'string' };
const level = { type: 'string', enum: LEVELS };
const list = (items, max) => ({ type: 'array', items, maxItems: max });
const corrections = list(S({ original: str, better: str, why: str }), 3);
// "reply" comes first so it can be shown and spoken while the corrections are still being written
const turnSchema = S({ reply: str, corrections, tip: str });

export function excerpt(material, maxChars = 2000) {
  let out = '';
  for (const l of material.lines) {
    if (out.length + l.text.length > maxChars) break;
    out += l.text + '\n';
  }
  return out.trim();
}

const same = (a, b) => String(a).toLowerCase().replace(/[^a-z' ]/g, '').trim() === String(b).toLowerCase().replace(/[^a-z' ]/g, '').trim();
const cleanCorrections = (cs) => (cs ?? []).filter((c) => c.original && c.better && !same(c.original, c.better)).slice(0, 3);

/* ---------------- content ---------------- */
export async function generateText(topic, lvl) {
  const r = await json([
    { role: 'system', content: 'You write short spoken English monologues for language learners. Answer in JSON.' },
    { role: 'user', content: `Topic (given in French, write in English): "${topic}". Target CEFR level: ${lvl}.\n` +
      `Write 10 to 12 natural spoken sentences, like the script of a short YouTube video, each 8 to 24 words, ` +
      `with vocabulary and grammar typical of level ${lvl}. Give a short catchy English title.` },
  ], S({ title: str, sentences: { type: 'array', items: str, minItems: 6, maxItems: 14 } }), { maxTokens: 800, temperature: 0.8 });
  const sentences = (r.sentences ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (sentences.length < 3) throw new Error('Le texte généré est trop court. Réessaie.');
  return { title: String(r.title || topic).slice(0, 140), sentences };
}

export async function estimateLevel(material) {
  const r = await json([
    { role: 'system', content: 'You assess how difficult English texts are for learners. Answer in JSON.' },
    { role: 'user', content: `Which CEFR level (A1 to C2) does a learner need to understand this spoken English comfortably?\n\n${excerpt(material, 3000)}` },
  ], S({ level }), { maxTokens: 30, temperature: 0 });
  return LEVELS.includes(r.level) ? r.level : null;
}

/* ---------------- discussion about a content ---------------- */
function contentSystem(material) {
  return 'You are English Coach, a friendly, demanding speaking coach for a French adult learner.\n' +
    `The learner just studied "${material.title}" (level ${material.level ?? 'unknown'}):\n"""\n${excerpt(material)}\n"""\n` +
    'Answer in JSON, in this order:\n' +
    '- "reply": your next message in English: ONE open question about the content, then about the learner\'s opinion and experience. Under 40 words.\n' +
    '- "corrections": up to 3 real mistakes in the learner\'s last message (grammar, word choice, unnatural phrasing): "original" (their words), "better" (natural English), "why" (short, in French). Empty if none. Ignore capitals and punctuation.\n' +
    '- "tip": one short sentence in French with an expression to reuse.';
}

export async function contentTurn(material, history, message, onReply) {
  const r = await json([
    { role: 'system', content: contentSystem(material) },
    ...history.slice(-8),
    { role: 'user', content: message ? `Learner: ${message}` : 'Start with your first question. Corrections must be empty.' },
  ], turnSchema, { maxTokens: 320, temperature: 0.5, stream: 'reply', onPartial: onReply });
  return { corrections: message ? cleanCorrections(r.corrections) : [], tip: r.tip ?? '', reply: (r.reply || 'Can you tell me more?').trim() };
}

/* ---------------- free conversation (role play) ---------------- */
export const SCENARIOS = [
  { key: 'interview', label: 'Entretien d’embauche', you: 'candidat·e', role: 'a hiring manager interviewing the learner for a Data Engineer job at an international company',
    opening: 'Greet the learner and ask them to introduce themselves.' },
  { key: 'hr-call', label: 'Appel RH de présélection', you: 'candidat·e', role: 'a friendly HR recruiter on a 20-minute screening call (motivation, experience, salary expectations, notice period)',
    opening: 'Introduce yourself and the purpose of the call.' },
  { key: 'meeting', label: 'Réunion d’équipe', you: 'membre de l’équipe', role: 'a project manager running a weekly team meeting about a delayed data pipeline project',
    opening: 'Open the meeting and ask the learner for a status update on their work.' },
  { key: 'smalltalk', label: 'Small talk avec un collègue', you: 'collègue', role: 'a British colleague chatting at the coffee machine',
    opening: 'Start some casual small talk about the weekend.' },
  { key: 'hotel', label: 'Voyage : hôtel et aéroport', you: 'voyageur·se', role: 'a hotel receptionist in New York; there is a problem with the learner\'s booking',
    opening: 'Welcome the learner at the front desk.' },
  { key: 'restaurant', label: 'Restaurant', you: 'client·e', role: 'a waiter in a busy London restaurant',
    opening: 'Welcome the learner and ask if they have a reservation.' },
  { key: 'custom', label: 'Situation libre…', you: 'toi', role: '', opening: 'Start the scene.' },
];

function roleplaySystem(sc, custom, lvl) {
  const role = sc.key === 'custom' ? `a character in this situation described by the learner: "${custom}"` : sc.role;
  return `You are playing ${role}. The learner is a French speaker practising spoken English${lvl ? ` (level ${lvl})` : ''}.\n` +
    'Answer in JSON, in this order:\n' +
    '- "reply": your next line, in character: 1 to 3 short spoken sentences, under 40 words, usually ending with a question. Keep the scene realistic.\n' +
    '- "corrections": out of character, up to 3 real mistakes in the learner\'s last message: "original", "better" (natural spoken English), "why" (short, in French). Empty if none. Ignore punctuation: messages come from speech recognition.\n' +
    '- "tip": one short sentence in French with a useful phrase for this situation.';
}

export async function roleplayTurn(sc, custom, lvl, history, message, onReply) {
  const r = await json([
    { role: 'system', content: roleplaySystem(sc, custom, lvl) },
    ...history.slice(-10),
    { role: 'user', content: message ? `Learner: ${message}` : `${sc.opening} Corrections must be empty.` },
  ], turnSchema, { maxTokens: 300, temperature: 0.7, stream: 'reply', onPartial: onReply });
  return { corrections: message ? cleanCorrections(r.corrections) : [], tip: r.tip ?? '', reply: (r.reply || 'Sorry, could you say that again?').trim() };
}

/* ---------------- evaluation ---------------- */
export async function evaluate(context, learnerMessages, speech) {
  const listing = learnerMessages.map((t, i) => `${i + 1}. ${t}`).join('\n').slice(0, 8000);
  const oral = speech ? `\nSpeaking data (from speech recognition): ${speech.wpm ?? '?'} words per minute on average, ${speech.pauses} long pauses.` : '';
  const r = await json([
    { role: 'system', content: 'You are a strict but fair CEFR English examiner. Answer in JSON. "strengths", "work_on" and "summary" are written in French.' },
    { role: 'user', content: `A French learner took part in this exercise: ${context}.\nTheir messages:\n${listing}${oral}\n\n` +
      'Judge grammar accuracy, vocabulary range, fluency and how well they develop ideas. Short answers are weak evidence: do not overrate. ' +
      'Give the CEFR level, a score from 0 to 100, up to 3 strengths, up to 3 precise things to work on, and a one or two sentence summary.' },
  ], S({ level, score: { type: 'integer', minimum: 0, maximum: 100 }, strengths: list(str, 3), work_on: list(str, 3), summary: str }),
  { maxTokens: 500, temperature: 0.2 });
  return {
    level: LEVELS.includes(r.level) ? r.level : null,
    score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
    strengths: (r.strengths ?? []).slice(0, 3), workOn: (r.work_on ?? []).slice(0, 3), summary: r.summary ?? '',
  };
}

/* ---------------- vocabulary ---------------- */
/** French meaning and a short example for a word or expression picked by the learner. */
export async function explain(expression, context) {
  const r = await json([
    { role: 'system', content: 'You are an English teacher for French speakers. Answer in JSON.' },
    { role: 'user', content: `Expression: "${expression}"${context ? `\nSentence where it appeared: "${context}"` : ''}\n` +
      'Give its meaning in this context in French (a few words), and one short natural English example sentence using it (different from the one above).' },
  ], S({ meaning_fr: str, example: str }), { maxTokens: 120, temperature: 0.3 });
  return { meaning: String(r.meaning_fr ?? '').trim(), example: String(r.example ?? '').trim() };
}
