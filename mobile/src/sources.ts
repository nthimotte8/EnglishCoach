// Content sources fetched directly from the phone: podcast RSS feeds and episodes, YouTube titles.
import * as FileSystem from 'expo-file-system/legacy';
import type { Episode } from './types';

export class SourceError extends Error {}

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : null;
};
const attr = (xml: string, name: string, a: string) => {
  const m = xml.match(new RegExp(`<${name}\\s[^>]*${a}="([^"]+)"`, 'i'));
  return m ? decode(m[1]) : null;
};
function duration(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map(Number);
  return parts.some(isNaN) ? null : parts.reduce((a, p) => a * 60 + p, 0);
}

export function parseFeed(xml: string, limit = 30): { show: string; episodes: Episode[] } {
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new SourceError('Ce lien n’est pas un flux RSS de podcast.');
  const head = xml.split(/<item[\s>]/i)[0];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const episodes: Episode[] = [];
  for (const it of items) {
    const url = attr(it, 'enclosure', 'url');
    const type = attr(it, 'enclosure', 'type') ?? 'audio';
    if (!url || !type.startsWith('audio')) continue;
    episodes.push({
      title: tag(it, 'title') ?? 'Épisode', audio_url: url, published: tag(it, 'pubDate'),
      duration: duration(tag(it, 'itunes:duration')),
    });
    if (episodes.length >= limit) break;
  }
  if (!episodes.length) throw new SourceError('Aucun épisode audio dans ce flux.');
  return { show: tag(head, 'title') ?? 'Podcast', episodes };
}

export async function fetchEpisodes(feedUrl: string) {
  if (!/^https?:\/\//i.test(feedUrl)) throw new SourceError('Colle un lien qui commence par https://');
  let res: Response;
  try { res = await fetch(feedUrl, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } }); }
  catch { throw new SourceError('Flux injoignable. Vérifie ta connexion et le lien.'); }
  if (!res.ok) throw new SourceError(`Le serveur du podcast a répondu ${res.status}.`);
  return parseFeed(await res.text());
}

/** Downloads an episode to the cache (needed for on-device transcription). */
export async function downloadEpisode(url: string, onProgress?: (f: number) => void): Promise<string> {
  const target = `${FileSystem.cacheDirectory}episode-${Date.now()}${/\.m4a(\?|$)/i.test(url) ? '.m4a' : '.mp3'}`;
  const dl = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const r = await dl.downloadAsync().catch(() => null);
  if (!r || r.status >= 400) throw new SourceError('Téléchargement de l’épisode impossible.');
  return r.uri;
}
export const removeFile = (uri: string) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

export function youtubeId(url: string): string | null {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function youtubeTitle(id: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
    return r.ok ? ((await r.json()) as { title?: string }).title ?? null : null;
  } catch { return null; }
}
