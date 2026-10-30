// Everything the screens need, running entirely on the iPhone: no server, no account, no API key.
import * as coach from './coach';
import * as store from './db';
import { LLMError } from './llm';
import { transcribeFile, SpeechError, TimedWord } from './speech';
import { downloadEpisode, fetchEpisodes, removeFile, SourceError, youtubeId, youtubeTitle } from './sources';
import { buildExercise, exerciseUnits, linesFromSentences, linesFromTimedWords, parseTranscript, scoreSpeech } from './textproc';
import type { Episode, ExerciseKind, Level, Material, Turn } from './types';

export * from './types';
export { LEVELS } from './textproc';

/** One error type for the screens, whatever failed underneath. */
export class ApiError extends Error {
  constructor(message: string) { super(message); }
}
async function guard<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof LLMError || e instanceof SpeechError || e instanceof SourceError) throw new ApiError(e.message);
    throw new ApiError(e instanceof Error && e.message ? e.message : fallback);
  }
}
const need = async (id: number) => {
  const m = await store.getMaterial(id);
  if (!m) throw new ApiError('Contenu introuvable.');
  return m;
};

export const api = {
  stats: () => store.stats(),
  materials: () => store.listMaterials(),
  material: (id: number) => need(id),

  /** YouTube: the video plays in the app; the transcript is pasted (no server to fetch it). */
  fromText: (title: string, text: string, url?: string) => guard(async () => {
    const lines = parseTranscript(text);
    if (lines.length < 3) throw new ApiError('Colle au moins quelques lignes de transcription.');
    const vid = url ? youtubeId(url) : null;
    const name = title.trim() || (vid ? (await youtubeTitle(vid)) ?? 'Vidéo YouTube' : 'Ma transcription');
    return store.createMaterial({ title: name, source: vid ? 'youtube' : 'text', lines, video_id: vid,
      url: vid ? `https://www.youtube.com/watch?v=${vid}` : null });
  }, 'Impossible d’enregistrer ce contenu.'),

  fromTheme: (topic: string, level: Level) => guard(async () => {
    const g = await coach.generateText(topic, level);
    return store.createMaterial({ title: g.title, source: 'theme', theme: topic, level, lines: linesFromSentences(g.sentences) });
  }, 'Le coach n’a pas pu écrire le texte.'),

  episodes: (feed: string) => guard(() => fetchEpisodes(feed.trim()), 'Flux introuvable.'),

  fromPodcast: (e: Episode, show: string, onStatus?: (s: string) => void) => guard(async () => {
    onStatus?.('Téléchargement de l’épisode…');
    const file = await downloadEpisode(e.audio_url, (f) => onStatus?.(`Téléchargement de l’épisode… ${Math.round(f * 100)} %`));
    try {
      onStatus?.('Transcription sur ton iPhone… (environ la durée de l’épisode)');
      const r = await transcribeFile(file, (t) => onStatus?.(`Transcription… ${t.split(/\s+/).length} mots`));
      const lines = r.words.length ? linesFromTimedWords(r.words) : parseTranscript(r.text);
      if (lines.length < 3) throw new ApiError('Aucune parole anglaise reconnue dans cet épisode.');
      return store.createMaterial({ title: `${show} · ${e.title}`.slice(0, 200), source: 'podcast', audio_url: e.audio_url, lines });
    } finally { await removeFile(file); }
  }, 'Impossible de transcrire cet épisode.'),

  estimateLevel: (id: number) => guard(async () => {
    const level = await coach.estimateLevel(await need(id));
    if (level) await store.setMaterialLevel(id, level);
    return { level };
  }, 'Estimation impossible.'),

  exercise: async (id: number, kind: ExerciseKind, n = 5) => {
    const items = buildExercise(kind, exerciseUnits((await need(id)).lines), n);
    if (!items.length) throw new ApiError('Ce contenu est trop court pour cet exercice.');
    return { kind, items };
  },

  /** Scores what the learner said (already recognised on the device) against the expected sentence. */
  scoreSpeech: (expected: string, said: { text: string; words: TimedWord[] }) => scoreSpeech(expected, said.text, said.words),

  coachTurn: (m: Material, history: Turn[], message?: string) =>
    guard(() => coach.coachTurn(m, history, message), 'Le coach n’a pas pu répondre.'),

  evaluate: (m: Material, messages: string[], minutes: number) => guard(async () => {
    const ev = await coach.evaluate(m, messages);
    await store.addSession({ material_id: m.id, exercise: 'coach', score: ev.score, minutes, level: ev.level, messages: messages.length });
    return ev;
  }, 'Évaluation impossible.'),

  saveSession: (s: { material_id: number; exercise: ExerciseKind; score: number; minutes: number }) => store.addSession(s),
};
