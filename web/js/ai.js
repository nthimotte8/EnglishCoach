// The coach's language model, running in the browser on the graphics card (WebLLM + WebGPU).
// Free, no API key, works offline once the model is in the browser cache.
import { extractJson, partialField } from './textproc.js';
import { getSetting, setSetting } from './db.js';

const WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2.84';

// Candidates per tier, in order of preference. The first one that exists in WebLLM's catalogue
// and that the graphics card can run (f16 shaders or not) is used.
export const TIERS = [
  { key: 'leger', label: 'Léger', hint: 'Conseillé avec 8 Go de mémoire (Mac M1, portables), ~1 Go', candidates: [
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC'] },
  { key: 'equilibre', label: 'Équilibré', hint: '16 Go de mémoire conseillés, ~2,5 Go. Peut figer un ordinateur à 8 Go', candidates: [
    'Qwen2.5-3B-Instruct-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    'Qwen2.5-3B-Instruct-q4f32_1-MLC', 'Llama-3.2-3B-Instruct-q4f32_1-MLC'] },
  { key: 'precis', label: 'Précis', hint: 'Ordinateur puissant (carte graphique dédiée ou 32 Go), ~5 Go', candidates: [
    'Qwen2.5-7B-Instruct-q4f16_1-MLC', 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    'Qwen2.5-7B-Instruct-q4f32_1-MLC', 'Llama-3.1-8B-Instruct-q4f32_1-MLC'] },
];

const mock = () => globalThis.__EC_MOCK__;
let webllm = null;
let engine = null;
let loadedId = null;
let loading = null;
let queue = Promise.resolve();
const listeners = new Set();
export const state = { status: 'idle', progress: 0, text: '', modelId: null, error: null, charsPerSec: null };

function emit(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}
export function onState(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export async function webgpuInfo() {
  if (mock()) return { ok: true, f16: true };
  if (!('gpu' in navigator)) return { ok: false, reason: 'Ce navigateur ne gère pas WebGPU. Utilise Chrome ou Edge à jour sur ordinateur.' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'Aucune carte graphique compatible WebGPU n’a été trouvée.' };
    return { ok: true, f16: adapter.features.has('shader-f16') };
  } catch {
    return { ok: false, reason: 'WebGPU est désactivé dans ce navigateur.' };
  }
}

async function lib() {
  if (!webllm) webllm = await import(WEBLLM);
  return webllm;
}

/** Resolves a tier to a concrete model in WebLLM's catalogue: {id, vramMB}. */
export async function resolveTier(key) {
  if (mock()) return { id: `mock-${key}`, vramMB: 1000 };
  const tier = TIERS.find((t) => t.key === key) ?? TIERS[1];
  const [{ prebuiltAppConfig }, gpu] = await Promise.all([lib(), webgpuInfo()]);
  const list = prebuiltAppConfig.model_list;
  for (const id of tier.candidates) {
    if (id.includes('q4f16') && !gpu.f16) continue;
    const m = list.find((x) => x.model_id === id);
    if (m) return { id, vramMB: Math.round(m.vram_required_MB ?? 0) };
  }
  // catalogue changed: take any instruct model of a similar size
  const size = { leger: /1\.5B|1B/, equilibre: /3B/, precis: /7B|8B/ }[tier.key];
  const m = list.find((x) => size.test(x.model_id) && /Instruct/.test(x.model_id) && (gpu.f16 || !x.model_id.includes('q4f16')));
  if (!m) throw new Error('Aucun modèle compatible trouvé pour ce niveau.');
  return { id: m.model_id, vramMB: Math.round(m.vram_required_MB ?? 0) };
}

/** Default: the light model. A bigger one on an 8 GB computer can saturate memory and freeze the whole machine. */
export const getTier = () => getSetting('tier', 'leger');

// keeps answers fast and memory low: instructions + short history + answer fit comfortably in 2048 tokens
const CHAT_OPTS = { context_window_size: 2048 };
// the model is removed from the graphics card after this much inactivity, to give the memory back
const IDLE_UNLOAD_MS = 8 * 60 * 1000;
let worker = null;
let idleTimer = null;

async function unloadEngine() {
  const e = engine, w = worker;
  engine = null; worker = null; loadedId = null;
  clearTimeout(idleTimer);
  await e?.unload().catch(() => {});
  w?.terminate();
}
function armIdleUnload() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (state.status !== 'ready') return armIdleUnload();
    await unloadEngine();
    emit({ status: 'idle', modelId: null });
  }, IDLE_UNLOAD_MS);
}
/** Frees the graphics card now (e.g. when leaving the coach pages for a long time). */
export async function unload() { await unloadEngine(); emit({ status: 'idle', modelId: null }); }
export async function setTier(key) {
  await setSetting('tier', key);
  if (engine) { await unloadEngine(); emit({ status: 'idle', modelId: null }); }
}

/** True when the model files are already in the browser cache (no download needed). */
export async function isCached(key) {
  if (mock()) return !!mock().cached;
  try {
    const { id } = await resolveTier(key ?? (await getTier()));
    const l = await lib();
    return l.hasModelInCache ? await l.hasModelInCache(id) : false;
  } catch { return false; }
}

export async function deleteCached(key) {
  const { id } = await resolveTier(key);
  const l = await lib();
  if (loadedId === id) { await unloadEngine(); emit({ status: 'idle', modelId: null }); }
  await l.deleteModelAllInfoInCache?.(id);
}

/** Downloads (first time) and loads the model onto the graphics card. */
export async function load() {
  if (mock()) { emit({ status: 'ready', progress: 1, modelId: 'mock' }); return; }
  const { id } = await resolveTier(await getTier());
  if (engine && loadedId === id) return;
  if (!loading) {
    loading = (async () => {
      const gpu = await webgpuInfo();
      if (!gpu.ok) throw new Error(gpu.reason);
      emit({ status: 'loading', progress: 0, text: 'Préparation du coach…', error: null });
      const l = await lib();
      if (engine) await unloadEngine();
      worker = new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' });
      engine = await l.CreateWebWorkerMLCEngine(worker, id,
        { initProgressCallback: (r) => emit({ progress: r.progress ?? 0, text: frenchProgress(r.text) }) }, CHAT_OPTS);
      loadedId = id;
      armIdleUnload();
      emit({ status: 'ready', progress: 1, modelId: id, text: '' });
    })().catch((e) => {
      unloadEngine();
      const message = /memory|OOM|allocate/i.test(String(e?.message)) ?
        'Pas assez de mémoire graphique pour ce modèle. Choisis un niveau plus léger dans Réglages.' :
        (e?.message || 'Impossible de charger le coach.');
      emit({ status: 'error', error: message });
      throw new Error(message);
    }).finally(() => { loading = null; });
  }
  return loading;
}

function frenchProgress(t = '') {
  if (/Fetching|Loading model from cache|fetch/i.test(t)) {
    const m = t.match(/(\d+)%/);
    return /cache/i.test(t) ? 'Chargement du coach depuis le cache…' : `Téléchargement du coach${m ? ` (${m[1]} %)` : '…'}`;
  }
  if (/shader|compil|GPU/i.test(t)) return 'Préparation sur la carte graphique…';
  return t ? 'Chargement du coach…' : '';
}

/**
 * Ask the model for JSON matching `schema` (enforced by a grammar inside WebLLM).
 * The answer is streamed: with `stream: 'reply'`, onPartial(text, done) receives that string field
 * while it is being written, so the page can show and speak it before the rest is generated.
 * Calls are queued: the model answers one request at a time.
 */
export function json(messages, schema, { maxTokens = 400, temperature = 0.4, stream = null, onPartial = null } = {}) {
  const run = async () => {
    if (mock()) {
      const r = await mock().llm(messages, schema);
      if (stream && onPartial && r?.[stream]) { onPartial(r[stream].slice(0, 12), false); onPartial(r[stream], true); }
      return r;
    }
    await load();
    emit({ status: 'thinking' });
    let text = '', firstAt = null, lastSent = '';
    try {
      const chunks = await engine.chat.completions.create({
        messages, temperature, top_p: 0.9, max_tokens: maxTokens, stream: true,
        response_format: { type: 'json_object', schema: JSON.stringify(schema) },
      });
      for await (const chunk of chunks) {
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (!delta) continue;
        if (firstAt === null) firstAt = performance.now();
        text += delta;
        if (stream && onPartial) {
          const p = partialField(text, stream);
          if (p.value !== lastSent || p.done) { onPartial(p.value, p.done); lastSent = p.value; if (p.done) onPartial = null; }
        }
      }
      // writing speed, used to suggest a lighter model on slow machines
      if (firstAt !== null && text.length > 40) {
        const cps = text.length / Math.max(0.1, (performance.now() - firstAt) / 1000);
        emit({ charsPerSec: Math.round(state.charsPerSec ? state.charsPerSec * 0.6 + cps * 0.4 : cps) });
      }
      return extractJson(text);
    } finally {
      emit({ status: 'ready' });
      armIdleUnload();
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** True when answers are slow enough that a lighter model would clearly help (~ under 10 words/s). */
export const isSlow = () => state.charsPerSec !== null && state.charsPerSec < 55;

export function interrupt() { try { engine?.interruptGenerate(); } catch { /* nothing running */ } }
