// Podcast search and suggestions, through the public Apple Podcasts directory (iTunes Search API).
// Calls go through script tags (the API's "callback" mode), which works from any website without a server.
import { rankByLevel } from './suggestions.js';
import { parseFeed } from './textproc.js';

const mock = () => globalThis.__EC_MOCK__?.podcasts;

/** Learner-friendly shows, by level and theme. Resolved by name in the directory when opened. */
export const SUGGESTIONS = [
  { term: '6 Minute English', name: '6 Minute English', by: 'BBC', levels: ['A2', 'B1'], theme: 'apprendre', len: '6 min', why: 'Un sujet d’actualité expliqué lentement, avec le vocabulaire clé.' },
  { term: 'The English We Speak BBC', name: 'The English We Speak', by: 'BBC', levels: ['B1', 'B2'], theme: 'apprendre', len: '3 min', why: 'Une expression courante par épisode, en situation.' },
  { term: 'VOA Learning English', name: 'VOA Learning English', by: 'Voice of America', levels: ['A2', 'B1'], theme: 'actualite', len: '5-15 min', why: 'L’actualité lue à vitesse réduite, vocabulaire simplifié.' },
  { term: 'Coffee Break English', name: 'Coffee Break English', by: 'Coffee Break Languages', levels: ['A2', 'B1'], theme: 'apprendre', len: '15-20 min', why: 'Des leçons progressives autour de situations du quotidien.' },
  { term: 'All Ears English Podcast', name: 'All Ears English', by: 'Lindsay & Michelle', levels: ['B1', 'B2'], theme: 'apprendre', len: '15-20 min', why: 'Anglais américain naturel et conversation de tous les jours.' },
  { term: 'English Learning for Curious Minds', name: 'English Learning for Curious Minds', by: 'Leonardo English', levels: ['B1', 'B2'], theme: 'culture', len: '20 min', why: 'Histoires fascinantes racontées clairement, avec transcriptions.' },
  { term: 'Business English Pod', name: 'Business English Pod', by: 'BEP', levels: ['B1', 'B2'], theme: 'business', len: '15 min', why: 'Réunions, négociations, présentations : l’anglais du bureau.' },
  { term: "Luke's English Podcast", name: "Luke's English Podcast", by: 'Luke Thompson', levels: ['B2', 'C1'], theme: 'apprendre', len: '30-60 min', why: 'Anglais britannique authentique, beaucoup d’humour.' },
  { term: 'Think Fast Talk Smart', name: 'Think Fast, Talk Smart', by: 'Stanford GSB', levels: ['B2', 'C1'], theme: 'business', len: '25 min', why: 'Communication professionnelle : réunions, prise de parole, entretiens.' },
  { term: 'The Indicator from Planet Money', name: 'The Indicator', by: 'NPR', levels: ['B2', 'C1'], theme: 'business', len: '10 min', why: 'Économie et entreprises en 10 minutes, rythme vivant.' },
  { term: 'NPR News Now', name: 'NPR News Now', by: 'NPR', levels: ['B2', 'C1'], theme: 'actualite', len: '5 min', why: 'Le journal américain, mis à jour chaque heure.' },
  { term: 'Short Wave NPR', name: 'Short Wave', by: 'NPR', levels: ['B2', 'C1'], theme: 'science', len: '12 min', why: 'Une découverte scientifique expliquée simplement.' },
  { term: 'TED Talks Daily', name: 'TED Talks Daily', by: 'TED', levels: ['B2', 'C1'], theme: 'culture', len: '10-20 min', why: 'Des conférences TED, un sujet différent chaque jour.' },
  { term: 'Practical AI podcast', name: 'Practical AI', by: 'Changelog', levels: ['C1', 'C2'], theme: 'tech', len: '45 min', why: 'IA appliquée et machine learning, sans jargon inutile.' },
  { term: 'Data Engineering Podcast', name: 'Data Engineering Podcast', by: 'Tobias Macey', levels: ['C1', 'C2'], theme: 'tech', len: '50 min', why: 'Pipelines, lakehouse, outils data : ton métier, en anglais.' },
  { term: 'HBR IdeaCast', name: 'HBR IdeaCast', by: 'Harvard Business Review', levels: ['C1', 'C2'], theme: 'business', len: '25 min', why: 'Management et carrière, par les auteurs de la HBR.' },
  { term: 'Freakonomics Radio', name: 'Freakonomics Radio', by: 'Stephen Dubner', levels: ['C1', 'C2'], theme: 'culture', len: '45 min', why: 'Économie et société sous un angle inattendu.' },
];

export const THEMES = [
  ['tous', 'Tous'], ['apprendre', 'Apprendre l’anglais'], ['business', 'Business et carrière'], ['tech', 'Tech et data'],
  ['actualite', 'Actualité'], ['science', 'Science'], ['culture', 'Culture et société'],
];

/** Suggestions for a theme, closest to the learner's level first. */
export const suggest = (level, theme = 'tous') => rankByLevel(SUGGESTIONS, level, theme);

let n = 0;
function jsonp(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = `__ecPodcast${Date.now()}_${n++}`;
    const s = document.createElement('script');
    const done = () => { clearTimeout(t); delete globalThis[cb]; s.remove(); };
    const t = setTimeout(() => { done(); reject(new Error('L’annuaire des podcasts ne répond pas. Vérifie ta connexion.')); }, timeoutMs);
    globalThis[cb] = (data) => { done(); resolve(data); };
    s.src = `${url}&callback=${cb}`;
    s.onerror = () => { done(); reject(new Error('L’annuaire des podcasts est injoignable.')); };
    document.head.append(s);
  });
}

/** Directory search result → show. */
export function toShow(r) {
  return {
    id: r.collectionId, title: r.collectionName ?? r.trackName ?? 'Podcast', author: r.artistName ?? '',
    artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? null, genre: r.primaryGenreName ?? '', feedUrl: r.feedUrl ?? null,
    count: r.trackCount ?? null,
  };
}
/** Directory lookup result → episode (audio only). */
export function toEpisode(r) {
  const audioUrl = r.episodeUrl ?? r.previewUrl ?? null;
  if (!audioUrl || (r.episodeContentType && r.episodeContentType !== 'audio')) return null;
  return {
    title: r.trackName ?? 'Épisode', audioUrl,
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
    published: r.releaseDate ?? null,
    description: String(r.shortDescription ?? r.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
  };
}

export async function searchShows(term, limit = 18) {
  if (mock()) return mock().search(term);
  const data = await jsonp(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=${limit}&term=${encodeURIComponent(term)}`);
  return (data.results ?? []).filter((r) => r.collectionId).map(toShow);
}

/** Latest episodes of a show. Falls back to its RSS feed when the directory has none. */
export async function episodes(show, limit = 25) {
  if (mock()) return mock().episodes(show);
  const data = await jsonp(`https://itunes.apple.com/lookup?id=${show.id}&media=podcast&entity=podcastEpisode&limit=${limit}`);
  const eps = (data.results ?? []).filter((r) => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode').map(toEpisode).filter(Boolean);
  if (eps.length || !show.feedUrl) return eps.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  const xml = await (await fetch(show.feedUrl)).text();
  return parseFeed(xml, limit).episodes.map((e) => ({ ...e, description: '' }));
}
