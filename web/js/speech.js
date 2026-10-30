// Voice: microphone recording, Whisper speech-to-text (in a worker), and the browser's text-to-speech.
const mock = () => globalThis.__EC_MOCK__;

/* ---------------- Whisper ---------------- */
let worker = null;
let seq = 0;
const pending = new Map();
const progressListeners = new Set();
export function onAsrProgress(fn) { progressListeners.add(fn); return () => progressListeners.delete(fn); }

function asrWorker() {
  if (!worker) {
    worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { progressListeners.forEach((fn) => fn(data)); return; }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error('Reconnaissance vocale : ' + data.message));
      else p.resolve(data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error('La reconnaissance vocale n’a pas pu démarrer (' + (e.message || 'erreur') + ').'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function call(msg, transfer) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    asrWorker().postMessage({ id, ...msg }, transfer ?? []);
  });
}

/** Loads Whisper ahead of time (downloads ~150 MB the first time). */
export function preloadAsr() { return mock() ? Promise.resolve() : call({ type: 'load' }); }

/**
 * Transcribes 16 kHz mono audio. With words=true, returns word timestamps:
 * {text, words: [{word, start, end}]}.
 */
export async function transcribe(audio, { words = true } = {}) {
  if (mock()) return mock().asr(audio, { words });
  const copy = new Float32Array(audio);
  const r = await call({ type: 'transcribe', audio: copy, words }, [copy.buffer]);
  return { text: r.text, words: r.chunks.map((c) => ({ word: c.text, start: c.start, end: c.end })) };
}

/** Decodes any audio/video blob or file to 16 kHz mono Float32Array, keeping at most `maxSeconds`. */
export async function decode(blob, maxSeconds = Infinity) {
  const buf = await blob.arrayBuffer();
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf);
    const len = Math.min(audio.length, Math.floor(maxSeconds * 16000));
    const out = new Float32Array(len);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const data = audio.getChannelData(ch);
      for (let i = 0; i < len; i++) out[i] += data[i] / audio.numberOfChannels;
    }
    return { audio: out, duration: audio.duration };
  } catch {
    throw new Error('Ce fichier audio ne peut pas être lu par le navigateur. Essaie un MP3, M4A, WAV ou MP4.');
  } finally {
    ctx.close().catch(() => {});
  }
}

/* ---------------- microphone ---------------- */
export class Recorder {
  constructor() { this.rec = null; this.chunks = []; this.stream = null; this.startedAt = 0; }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  async start() {
    stopSpeaking();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error('Micro inaccessible. Autorise le micro pour ce site (icône à gauche de l’adresse) puis réessaie.');
    }
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.startedAt = Date.now();
  }
  /** Stops and returns {blob, url, audio (16 kHz Float32Array), seconds}. */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error('Aucun enregistrement en cours.'));
      this.rec.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
        this.rec = null;
        try {
          const { audio, duration } = await decode(blob);
          resolve({ blob, url: URL.createObjectURL(blob), audio, seconds: duration });
        } catch (e) { reject(e); }
      };
      this.rec.stop();
    });
  }
  cancel() {
    try { this.rec?.stop(); } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rec = null;
  }
}

/* ---------------- text-to-speech ---------------- */
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in globalThis)) return;
  const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const pref = ['Google US English', 'Microsoft Aria Online (Natural) - English (United States)', 'Samantha', 'Microsoft Jenny Online (Natural) - English (United States)', 'Google UK English Female', 'Daniel'];
  voice = pref.map((n) => vs.find((v) => v.name === n)).find(Boolean) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0] || null;
}
if ('speechSynthesis' in globalThis) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
export const canSpeak = () => 'speechSynthesis' in globalThis;

export function speak(text, { rate = 1 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); }
