// Run with: node --test web/tests
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggest, toEpisode, toShow } from '../js/podcasts.js';
import { cardKey, dueCards, isMastered, newCard, review } from '../js/srs.js';
import { rankByLevel, TEXTS, TEXT_SITES, TOPIC_IDEAS, YOUTUBE, youtubeSearchUrl } from '../js/suggestions.js';
import {
  align, analyseSpeech, buildExercise, exerciseUnits, extractJson, linesFromSentences, linesFromTimedWords, parseFeed,
  parseTranscript, partialField, youtubeId,
} from '../js/textproc.js';

const YT = `0:12
So today I want to talk about how habits are formed.
[Music]
0:17
Most of what we do every day happens on autopilot.
0:22
And that is actually a good thing for our brain.
0:27
It saves energy for the decisions that really matter.`;

test('parses a YouTube transcript copied with timestamps on their own line', () => {
  const lines = parseTranscript(YT);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0], { t: '00:12', sec: 12, text: 'So today I want to talk about how habits are formed.' });
});

test('plain text is split into sentences', () => {
  assert.deepEqual(parseTranscript('Hello there. This is a test! Is it ok?').map((l) => l.text), ['Hello there.', 'This is a test!', 'Is it ok?']);
});

test('exercise units keep the time span in the source', () => {
  const units = exerciseUnits(parseTranscript(YT));
  assert.equal(units.length, 4);
  assert.deepEqual([units[0].start, units[0].end], [12, 17]);
  assert.deepEqual([units[3].start, units[3].end], [27, 33]);
});

test('unpunctuated captions fall back to 14-word chunks', () => {
  const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  assert.deepEqual(exerciseUnits([{ t: null, sec: null, text }]).map((u) => u.text.split(' ').length), [14, 14, 12]);
});

test('Whisper words are regrouped into lines', () => {
  const ws = [['Welcome', 0, .4], [' to', .5, .6], [' the', .7, .8], [' show.', .9, 1.2], [' Today', 2, 2.3], [' we', 2.4, 2.5], [' talk.', 2.6, 3]]
    .map(([word, start, end]) => ({ word, start, end }));
  const lines = linesFromTimedWords(ws);
  assert.deepEqual(lines.map((l) => l.text), ['Welcome to the show.', 'Today we talk.']);
  assert.equal(lines[1].t, '00:02');
});

test('generated sentences get estimated timings', () => {
  assert.equal(linesFromSentences(['One two three four five.', 'Six seven.'])[1].sec, 3);
});

test('alignment marks missing and extra words', () => {
  const a = align('It saves energy for the decisions.'.split(' '), 'it save energy for decisions that'.split(' '));
  assert.equal(a.matches, 4);
  assert.deepEqual(a.ops.filter((o) => o.kind === 'missing').map((o) => o.word), ['saves', 'the']);
});

test('pronunciation report: timing, pauses and fillers', () => {
  const timed = [['It', 0, .3], ['saves', .4, .7], ['um', .8, 1], ['energy.', 2.2, 2.6]].map(([word, start, end]) => ({ word, start, end }));
  const r = analyseSpeech('It saves energy.', 'It saves um energy.', timed);
  assert.equal(r.accuracy, 100);
  assert.equal(r.pauses.length, 1);
  assert.equal(r.pauses[0].after, 'um');
  assert.equal(r.fillers, 1);
  assert.ok(r.wpm > 0);
  assert.equal(r.ops.find((o) => o.word === 'saves').start, 0.4);
  const perfect = analyseSpeech('It saves energy.', 'it saves energy', [['it', 0, .3], ['saves', .35, .6], ['energy', .65, 1]].map(([word, start, end]) => ({ word, start, end })));
  assert.equal(perfect.score, 100);
  assert.deepEqual(analyseSpeech('Good morning everyone.', 'good morning').toPractise, ['everyone']);
});

test('exercises are well formed', () => {
  const units = exerciseUnits(parseTranscript(YT));
  for (const kind of ['lecture', 'repetition', 'dictee']) assert.equal(buildExercise(kind, units, 3).length, 3);
  for (const item of buildExercise('reco', units, 4)) { assert.ok(item.options.includes(item.text)); assert.equal(item.options.length, 4); }
  for (const item of buildExercise('trous', units, 4)) {
    item.blanks.forEach((b, k) => assert.ok(item.words[b].startsWith(item.answers[k])));
  }
  assert.deepEqual(buildExercise('dictee', units.slice(0, 1)), []);
  assert.throws(() => buildExercise('karaoke', units));
});

test('model replies are parsed tolerantly', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Sure! {"a":3} hope it helps'), { a: 3 });
  assert.throws(() => extractJson('no json'));
});

test('RSS feeds keep audio episodes only', () => {
  const feed = parseFeed(`<?xml version="1.0"?><rss><channel><title><![CDATA[Daily &amp; English]]></title>
    <item><title>Notes</title></item>
    <item><title>Remote work</title><enclosure url="https://cdn.x.com/ep1.mp3?a=1&amp;b=2" type="audio/mpeg"/><itunes:duration>12:30</itunes:duration></item>
    <item><title>Video</title><enclosure url="https://cdn.x.com/v.mp4" type="video/mp4"/></item></channel></rss>`);
  assert.equal(feed.show, 'Daily & English');
  assert.deepEqual(feed.episodes, [{ title: 'Remote work', audioUrl: 'https://cdn.x.com/ep1.mp3?a=1&b=2', published: null, duration: 750 }]);
  assert.throws(() => parseFeed('<html></html>'));
});

test('YouTube ids', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://example.com'), null);
});

test('spaced repetition schedules further after each success', () => {
  const t0 = Date.UTC(2026, 9, 1);
  let c = newCard({ front: 'catch up' }, t0);
  c = review(c, 2, t0); assert.equal(c.interval, 1);
  c = review(c, 2, t0); assert.equal(c.interval, 6);
  c = review(c, 2, t0); assert.equal(c.interval, 15);
  c = review(c, 3, t0); assert.ok(c.interval >= 40);
  assert.ok(isMastered(c));
  const lapsed = review(c, 0, t0);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.due, t0 + 10 * 60 * 1000);
  assert.ok(lapsed.ease < c.ease);
  const due = dueCards([{ due: t0 + 5 }, { due: t0 - 10 }, { due: t0 - 5 }], t0);
  assert.deepEqual(due.map((x) => x.due), [t0 - 10, t0 - 5]);
  assert.equal(cardKey('  Catch-Up!  '), 'catchup');
});

test('a streamed JSON field is readable before the JSON is complete', () => {
  assert.deepEqual(partialField('', 'reply'), { value: '', done: false });
  assert.deepEqual(partialField('{"reply": "Hello, ho', 'reply'), { value: 'Hello, ho', done: false });
  assert.deepEqual(partialField('{"reply": "He said \\"hi\\"\\nthen', 'reply'), { value: 'He said "hi"\nthen', done: false });
  assert.deepEqual(partialField('{"reply": "Done.", "corrections": [', 'reply'), { value: 'Done.', done: true });
  assert.deepEqual(partialField('{"reply": "caf\\u00e9', 'reply'), { value: 'café', done: false });
  assert.deepEqual(partialField('{"reply": "cut \\u00', 'reply'), { value: 'cut ', done: false });
});

test('podcast suggestions follow the learner level and theme', () => {
  const b1 = suggest('B1');
  assert.ok(b1[0].fit && b1[0].levels.some((l) => ['A2', 'B1', 'B2'].includes(l)));
  assert.ok(b1.findIndex((s) => s.name === 'Data Engineering Podcast') > b1.findIndex((s) => s.name === '6 Minute English'));
  const c1 = suggest('C1');
  assert.ok(c1.slice(0, 6).every((s) => s.fit));
  assert.ok(suggest(null, 'tech').every((s) => s.theme === 'tech'));
  assert.equal(suggest(null).length, suggest(null, 'tous').length);
});

test('directory results are normalised', () => {
  assert.deepEqual(toShow({ collectionId: 7, collectionName: 'Daily', artistName: 'BBC', artworkUrl600: 'a.jpg', primaryGenreName: 'Education', feedUrl: 'f', trackCount: 3 }),
    { id: 7, title: 'Daily', author: 'BBC', artwork: 'a.jpg', genre: 'Education', feedUrl: 'f', count: 3 });
  assert.deepEqual(toEpisode({ trackName: 'Ep 1', episodeUrl: 'https://x/ep.mp3', trackTimeMillis: 361000, releaseDate: '2026-10-01', shortDescription: '<p>Hi  there</p>' }),
    { title: 'Ep 1', audioUrl: 'https://x/ep.mp3', duration: 361, published: '2026-10-01', description: 'Hi there' });
  assert.equal(toEpisode({ trackName: 'Video', episodeUrl: 'v.mp4', episodeContentType: 'video' }), null);
  assert.equal(toEpisode({ trackName: 'No audio' }), null);
});

test('suggestions for every source are well formed and level-ranked', () => {
  for (const list of [YOUTUBE, TEXT_SITES, TEXTS, TOPIC_IDEAS]) {
    for (const it of list) assert.ok(it.levels.length && it.levels.every((l) => ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(l)));
  }
  for (const t of TEXTS) {
    const lines = parseTranscript(t.text);
    assert.ok(lines.length >= 5, t.title);
    assert.ok(exerciseUnits(lines).length >= 5, t.title);
  }
  const a2 = rankByLevel(TEXTS, 'A2');
  assert.equal(a2[0].title, 'My morning routine');
  assert.equal(rankByLevel(TEXTS, 'C1')[0].levels.includes('C1'), true);
  assert.ok(rankByLevel(YOUTUBE, 'B2', 'tech').every((x) => x.theme === 'tech'));
  assert.ok(youtubeSearchUrl('data & AI').includes('search_query=data%20%26%20AI'));
});
