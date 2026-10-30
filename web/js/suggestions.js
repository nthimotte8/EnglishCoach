// Suggestions for every content source: YouTube channels, graded text sites, ready-made texts,
// topic ideas for the coach, and tips for audio files. Everything is ranked by the learner's CEFR level.
import { LEVELS } from './textproc.js';

/** Closest to the learner's level first; `fit` marks items within one level of it. */
export function rankByLevel(items, level, theme = 'tous') {
  const li = LEVELS.indexOf(level);
  const dist = (s) => (li < 0 ? 0 : Math.min(...s.levels.map((l) => Math.abs(LEVELS.indexOf(l) - li))));
  return items.filter((s) => theme === 'tous' || s.theme === theme)
    .map((s, i) => ({ ...s, fit: dist(s) <= 1, rank: dist(s) * 100 + i }))
    .sort((a, b) => a.rank - b.rank);
}

/** YouTube search restricted to videos with subtitles (needed to copy a transcript). */
export const youtubeSearchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIoAQ%253D%253D`;

export const YOUTUBE = [
  { q: 'BBC Learning English', name: 'BBC Learning English', levels: ['A2', 'B1'], theme: 'apprendre', why: 'Vocabulaire, grammaire et actualité expliqués lentement.' },
  { q: 'English with Lucy', name: 'English with Lucy', levels: ['B1', 'B2'], theme: 'apprendre', why: 'Prononciation britannique, expressions et pièges courants.' },
  { q: "Rachel's English pronunciation", name: "Rachel's English", levels: ['B1', 'C1'], theme: 'apprendre', why: 'Prononciation américaine décortiquée, idéal avant la lecture à voix haute.' },
  { q: 'TED-Ed', name: 'TED-Ed', levels: ['B1', 'B2'], theme: 'culture', why: 'Leçons animées de 5 minutes, anglais clair et sous-titré.' },
  { q: 'Kurzgesagt', name: 'Kurzgesagt – In a Nutshell', levels: ['B2', 'C1'], theme: 'science', why: 'Science expliquée avec de superbes animations, débit soutenu.' },
  { q: 'TED talk', name: 'TED', levels: ['B2', 'C1'], theme: 'culture', why: 'Conférences de 10 à 20 minutes, sur tous les sujets.' },
  { q: 'Vox explained', name: 'Vox', levels: ['B2', 'C1'], theme: 'actualite', why: 'Actualité et société expliquées en vidéos de 10 minutes.' },
  { q: 'CNBC Make It career', name: 'CNBC Make It', levels: ['B2', 'C1'], theme: 'business', why: 'Carrière, argent et entreprises, en format court.' },
  { q: 'job interview english tell me about yourself', name: 'Entretien d’embauche en anglais', levels: ['B1', 'B2'], theme: 'business', why: 'Exemples de réponses aux questions classiques d’entretien.' },
  { q: 'business english meetings phrases', name: 'Anglais des réunions', levels: ['B1', 'B2'], theme: 'business', why: 'Les formules pour animer, interrompre, conclure une réunion.' },
  { q: 'Fireship 100 seconds', name: 'Fireship', levels: ['B2', 'C1'], theme: 'tech', why: 'Une technologie expliquée en 100 secondes, débit rapide.' },
  { q: 'Seattle Data Guy data engineering', name: 'Seattle Data Guy', levels: ['B2', 'C1'], theme: 'tech', why: 'Le métier de Data Engineer raconté par un praticien.' },
  { q: 'Databricks data + AI summit keynote', name: 'Databricks Data + AI Summit', levels: ['C1', 'C2'], theme: 'tech', why: 'Conférences techniques sur Databricks, Delta Lake et l’IA.' },
  { q: 'data engineering system design interview', name: 'Entretiens techniques data', levels: ['C1', 'C2'], theme: 'tech', why: 'Expliquer une architecture à voix haute, comme en entretien.' },
];

export const TEXT_SITES = [
  { url: 'https://www.newsinlevels.com/', name: 'News in Levels', levels: ['A1', 'A2', 'B1'], theme: 'actualite', why: 'La même actualité en 3 niveaux de difficulté, avec audio.' },
  { url: 'https://breakingnewsenglish.com/', name: 'Breaking News English', levels: ['A2', 'B1', 'B2'], theme: 'actualite', why: 'Articles d’actualité gradués, très utilisés par les profs.' },
  { url: 'https://learningenglish.voanews.com/', name: 'VOA Learning English', levels: ['A2', 'B1'], theme: 'actualite', why: 'Articles en anglais simplifié, avec la version audio.' },
  { url: 'https://simple.wikipedia.org/', name: 'Simple English Wikipedia', levels: ['A2', 'B1'], theme: 'culture', why: 'Wikipédia écrite avec un vocabulaire et des phrases simples.' },
  { url: 'https://www.bbc.co.uk/learningenglish', name: 'BBC Learning English', levels: ['B1', 'B2'], theme: 'apprendre', why: 'Transcriptions des émissions et articles pour apprenants.' },
  { url: 'https://www.theguardian.com/international', name: 'The Guardian', levels: ['C1', 'C2'], theme: 'actualite', why: 'Presse britannique de référence, accès gratuit.' },
  { url: 'https://paulgraham.com/articles.html', name: 'Essais de Paul Graham', levels: ['C1', 'C2'], theme: 'business', why: 'Essais courts sur les startups et le travail, style limpide.' },
  { url: 'https://www.databricks.com/blog', name: 'Blog Databricks', levels: ['C1', 'C2'], theme: 'tech', why: 'Articles techniques de ton domaine, en anglais professionnel.' },
];

/** Ready-to-practise texts written for this app, one per level band. */
export const TEXTS = [
  { title: 'My morning routine', levels: ['A2'], theme: 'quotidien', text:
    'I usually wake up at seven o’clock. First, I drink a big glass of water and open the window. Then I take a shower and get dressed. I always have breakfast at home: bread, butter and a cup of coffee. At eight, I leave my flat and walk to the station. The train is often full, so I listen to music or a podcast. I arrive at work at nine. Before I start, I check my emails and say hello to my colleagues. I like my mornings because they are calm and simple.' },
  { title: 'Working from home', levels: ['B1'], theme: 'business', text:
    'Since the pandemic, many people work from home two or three days a week. For a lot of employees, it saves time and money, because they do not need to commute. They can also concentrate better without the noise of an open space. However, working from home is not perfect. Some people feel lonely, and it can be difficult to separate work from private life. Managers also worry that teams communicate less. That is why many companies now prefer a hybrid model. Employees come to the office for meetings and team activities, and they stay at home for tasks that need focus.' },
  { title: 'Preparing for a job interview', levels: ['B1', 'B2'], theme: 'business', text:
    'A good job interview starts long before you enter the room. First, research the company: read its website, recent news and the job description carefully. Then prepare a short story about your career, about two minutes long, that explains who you are and why you want this role. Recruiters often ask about a problem you solved, so choose two or three concrete examples and describe the situation, what you did and the result. Do not forget to prepare questions for them too. Asking about the team, the tools or the first projects shows that you are genuinely interested.' },
  { title: 'What a data engineer actually does', levels: ['B2'], theme: 'tech', text:
    'People often confuse data engineers with data scientists, but their jobs are quite different. A data scientist builds models and answers business questions. A data engineer makes sure the data needed for those questions is available, reliable and up to date. In practice, that means designing pipelines that collect data from many sources, clean it, and store it in a format that analysts can query. A large part of the job is invisible when everything works: monitoring jobs, handling late or broken files, and keeping costs under control. When a dashboard shows the right number at nine in the morning, it is usually thanks to a data engineer.' },
  { title: 'The real cost of meetings', levels: ['C1'], theme: 'business', text:
    'Most professionals would agree that they attend too many meetings, yet calendars keep filling up. Part of the problem is that the cost of a meeting is rarely made explicit. An hour-long call with eight people does not cost one hour; it costs eight, plus the time each participant needs to refocus afterwards. Some companies have responded by introducing meeting-free days or by requiring a written agenda before any invitation is sent. Others encourage asynchronous updates, where people share progress in writing and keep live discussions for genuine decisions. The underlying idea is simple: a meeting should be the most effective way to reach an outcome, not a default habit.' },
  { title: 'Small talk, big impact', levels: ['B2', 'C1'], theme: 'culture', text:
    'For many non-native speakers, small talk is harder than a technical presentation. A presentation follows a plan, while a casual chat at the coffee machine can go anywhere. Yet these short conversations matter: they build trust and make teamwork easier. The good news is that small talk follows predictable patterns. People talk about the weekend, the weather, travel plans or a recent event. Asking open questions, such as how someone spent their holiday, and sharing a small detail about yourself is usually enough to keep the conversation going. Nobody expects a brilliant speech, just genuine interest.' },
];

/** Topic ideas for the coach-written texts, by level. */
export const TOPIC_IDEAS = [
  { t: 'Présenter mon parcours professionnel en 2 minutes', levels: ['B1', 'B2', 'C1'] },
  { t: 'Expliquer un pipeline de données à quelqu’un qui n’est pas technique', levels: ['B2', 'C1'] },
  { t: 'Ma première semaine dans une nouvelle entreprise', levels: ['B1', 'B2'] },
  { t: 'Négocier un délai avec un client', levels: ['B2', 'C1'] },
  { t: 'Le télétravail : avantages et limites', levels: ['B1', 'B2'] },
  { t: 'L’intelligence artificielle va-t-elle changer mon métier ?', levels: ['B2', 'C1'] },
  { t: 'Raconter un voyage mémorable', levels: ['A2', 'B1'] },
  { t: 'Commander au restaurant et faire une réclamation', levels: ['A2', 'B1'] },
  { t: 'Mon sport préféré et pourquoi je l’aime', levels: ['A2', 'B1'] },
  { t: 'Un livre ou un film qui m’a marqué', levels: ['B1', 'B2'] },
  { t: 'Défendre une décision technique devant ma direction', levels: ['C1', 'C2'] },
  { t: 'Les données personnelles et la vie privée', levels: ['B2', 'C1'] },
];

export const FILE_TIPS = [
  { title: 'Un épisode de podcast téléchargé', why: 'Depuis Apple Podcasts, Spotify (épisodes sans DRM) ou le site de l’émission : le fichier MP3 s’importe directement.' },
  { title: 'Tes propres mémos vocaux', why: 'Enregistre-toi en racontant ta journée en anglais, puis importe le mémo : tu travailles sur tes propres phrases.' },
  { title: 'Un extrait de film ou de série', why: 'Un fichier vidéo (MP4) dont tu as les droits : la bande-son est transcrite, quelques minutes suffisent.' },
  { title: 'Une conférence ou un webinaire', why: 'Un enregistrement de présentation en anglais, idéal pour le vocabulaire professionnel.' },
];
