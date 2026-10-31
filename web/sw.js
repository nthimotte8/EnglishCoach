// Offline support: the app shell and its libraries are cached after the first visit.
// AI models are cached separately by WebLLM and transformers.js.
const VERSION = 'ec-v4';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/main.js', 'js/ai.js', 'js/podcasts.js', 'js/suggestions.js', 'js/coach.js', 'js/db.js', 'js/players.js', 'js/repo.js', 'js/speech.js', 'js/srs.js', 'js/textproc.js', 'js/ui.js',
  'js/llm-worker.js', 'js/whisper-worker.js',
  'js/views/chat.js', 'js/views/coach.js', 'js/views/conversation.js', 'js/views/exercise.js', 'js/views/gate.js', 'js/views/media.js',
  'js/views/new-material.js', 'js/views/practice.js', 'js/views/progress.js', 'js/views/settings.js', 'js/views/vocab.js',
];
const LIBS = /^https:\/\/(esm\.run|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ec-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // app files: network first (fresh after an update), cache when offline
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
    return;
  }
  // pinned library versions never change: cache first
  if (LIBS.test(e.request.url)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  }
});
