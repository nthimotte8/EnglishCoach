// Local storage on the iPhone (SQLite). Nothing leaves the device.
import * as SQLite from 'expo-sqlite';
import type { ExerciseKind, HistoryRow, Level, Line, Material, MaterialSummary, Source, Stats } from './types';
import { wordCount } from './textproc';

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = (async () => {
      const d = await SQLite.openDatabaseAsync('english_coach.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, source TEXT NOT NULL, url TEXT, video_id TEXT,
          audio_url TEXT, theme TEXT, level TEXT, lines_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, exercise TEXT NOT NULL, score INTEGER,
          minutes INTEGER NOT NULL DEFAULT 1, level TEXT, messages INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      `);
      return d;
    })();
  }
  return dbp;
}

type MaterialRow = Omit<Material, 'lines' | 'word_count'> & { lines_json: string };
const toMaterial = (r: MaterialRow): Material => {
  const lines: Line[] = JSON.parse(r.lines_json);
  const { lines_json, ...rest } = r;
  return { ...rest, lines, word_count: wordCount(lines) };
};

export async function createMaterial(m: {
  title: string; source: Source; lines: Line[]; url?: string | null; video_id?: string | null;
  audio_url?: string | null; theme?: string | null; level?: Level | null;
}): Promise<Material> {
  const d = await db();
  const r = await d.runAsync(
    'INSERT INTO materials (title, source, url, video_id, audio_url, theme, level, lines_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    m.title, m.source, m.url ?? null, m.video_id ?? null, m.audio_url ?? null, m.theme ?? null, m.level ?? null,
    JSON.stringify(m.lines), new Date().toISOString());
  return (await getMaterial(r.lastInsertRowId))!;
}

export async function getMaterial(id: number): Promise<Material | null> {
  const r = await (await db()).getFirstAsync<MaterialRow>('SELECT * FROM materials WHERE id = ?', id);
  return r ? toMaterial(r) : null;
}

export async function listMaterials(limit = 50): Promise<MaterialSummary[]> {
  const rows = await (await db()).getAllAsync<MaterialRow>('SELECT * FROM materials ORDER BY id DESC LIMIT ?', limit);
  return rows.map((r) => { const { lines, ...s } = toMaterial(r); return s; });
}

export async function setMaterialLevel(id: number, level: Level) {
  await (await db()).runAsync('UPDATE materials SET level = ? WHERE id = ?', level, id);
}

export async function addSession(s: {
  material_id: number | null; exercise: ExerciseKind | 'coach'; score: number | null; minutes: number;
  level?: Level | null; messages?: number;
}) {
  await (await db()).runAsync(
    'INSERT INTO sessions (material_id, exercise, score, minutes, level, messages, created_at) VALUES (?,?,?,?,?,?,?)',
    s.material_id, s.exercise, s.score, Math.max(1, s.minutes), s.level ?? null, s.messages ?? 0, new Date().toISOString());
  if (s.level) await setSetting('level', s.level);
}

export async function getSetting(key: string): Promise<string | null> {
  const r = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return r?.value ?? null;
}
export async function setSetting(key: string, value: string | null) {
  const d = await db();
  if (value === null) await d.runAsync('DELETE FROM settings WHERE key = ?', key);
  else await d.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function stats(): Promise<Stats> {
  const rows = await (await db()).getAllAsync<HistoryRow & { messages: number }>(
    `SELECT s.*, m.title AS material_title FROM sessions s LEFT JOIN materials m ON m.id = s.material_id
     ORDER BY s.created_at DESC, s.id DESC`);
  const activity: Record<string, number> = {};
  rows.forEach((s) => { const k = dayKey(s.created_at); activity[k] = (activity[k] ?? 0) + 1; });
  return {
    level: (await getSetting('level')) as Level | null,
    total_minutes: rows.reduce((a, s) => a + s.minutes, 0),
    materials: new Set(rows.filter((s) => s.material_id).map((s) => s.material_id)).size,
    exercises: rows.filter((s) => s.exercise !== 'coach').length,
    coach_messages: rows.reduce((a, s) => a + (s.messages ?? 0), 0),
    first_session_at: rows.length ? rows[rows.length - 1].created_at : null,
    curve: rows.filter((s) => s.level).reverse().map((s) => ({ at: s.created_at, level: s.level as Level })),
    activity,
    history: rows.slice(0, 50),
  };
}
