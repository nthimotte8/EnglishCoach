export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Line = { t: string | null; sec: number | null; text: string };
export type Source = 'youtube' | 'text' | 'theme' | 'podcast';

export type MaterialSummary = {
  id: number; title: string; source: Source; url: string | null; video_id: string | null; audio_url: string | null;
  theme: string | null; level: Level | null; word_count: number; created_at: string;
};
export type Material = MaterialSummary & { lines: Line[] };

export type ExerciseKind = 'lecture' | 'repetition' | 'reco' | 'dictee' | 'trous';
export type ExerciseItem = {
  text: string; start: number | null; end: number | null;
  options?: string[]; words?: string[]; blanks?: number[]; answers?: string[];
};
export type WordOp = { kind: 'ok' | 'missing' | 'extra'; word: string };
export type SpeechScore = {
  recognized: string; score: number; accuracy: number; wpm: number | null; long_pauses: number;
  ops: WordOp[]; to_practise: string[];
};
export type Correction = { original: string; better: string; why: string };
export type CoachReply = { corrections: Correction[]; tip: string; reply: string };
export type Evaluation = { level: Level | null; score: number; strengths: string[]; work_on: string[]; summary: string };
export type HistoryRow = {
  id: number; created_at: string; material_id: number | null; material_title: string | null;
  exercise: ExerciseKind | 'coach'; score: number | null; minutes: number; level: Level | null;
};
export type Stats = {
  level: Level | null; total_minutes: number; materials: number; exercises: number; coach_messages: number;
  first_session_at: string | null; curve: { at: string; level: Level }[]; activity: Record<string, number>;
  history: HistoryRow[];
};
export type Episode = { title: string; audio_url: string; published: string | null; duration: number | null };
export type Turn = { role: 'user' | 'assistant'; content: string };
