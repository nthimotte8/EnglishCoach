// Speech-to-text with Whisper (transformers.js), off the main thread.
// Messages in:  {id, type:'load'} | {id, type:'transcribe', audio: Float32Array (16 kHz mono), words: boolean}
// Messages out: {id, type:'progress', progress, text} | {id, type:'result', text, chunks} | {id, type:'error', message}
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

env.allowLocalModels = false; // models come from the Hugging Face hub, then from the browser cache

// "rapide" (tiny.en, ~40 Mo) is about twice as fast as "precis" (base.en, ~150 Mo), slightly less accurate.
const MODELS = { rapide: ['Xenova/whisper-tiny.en'], precis: ['Xenova/whisper-base.en', 'Xenova/whisper-tiny.en'] };
let asr = null;
let asrKey = null;
let loading = null;

async function hasWebGPU() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

function load(id, key = 'precis') {
  if (asr && asrKey === key) return Promise.resolve(asr);
  if (asr && asrKey !== key) { asr.dispose?.(); asr = null; }
  if (!loading) {
    loading = (async () => {
      // "rapide" runs on the processor: it leaves the graphics card to the coach, so both never compete
      // for memory (two models on the GPU of an 8 GB laptop can freeze the computer)
      const device = key === 'precis' && (await hasWebGPU()) ? 'webgpu' : 'wasm';
      const files = {};
      const progress_callback = (p) => {
        if (p.status !== 'progress' || !p.file) return;
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 };
        const t = Object.values(files).reduce((a, f) => a + f.total, 0);
        const l = Object.values(files).reduce((a, f) => a + f.loaded, 0);
        self.postMessage({ id, type: 'progress', progress: t ? l / t : 0, text: 'Téléchargement de la reconnaissance vocale…' });
      };
      let lastError;
      // quantised decoder first (much faster on the GPU); plain weights if a model has no such file
      const dtypes = device === 'webgpu' ? [{ encoder_model: 'fp32', decoder_model_merged: 'q4' }, 'fp32'] : ['q8'];
      for (const model of MODELS[key] ?? MODELS.precis) {
        for (const dtype of dtypes) {
          try {
            asr = await pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback });
            asrKey = key;
            return asr;
          } catch (e) { lastError = e; }
        }
      }
      throw lastError;
    })().finally(() => { loading = null; });
  }
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const run = await load(id, data.model);
    if (type === 'load') return self.postMessage({ id, type: 'result', text: '', chunks: [] });
    const long = data.audio.length > 16000 * 30;
    const base = { chunk_length_s: 30, stride_length_s: long ? 5 : undefined };
    let out;
    try {
      out = await run(data.audio, { ...base, return_timestamps: data.words ? 'word' : long });
    } catch (e) {
      // some exports have no cross-attention outputs for word timestamps: fall back to segment timestamps
      if (!data.words) throw e;
      out = await run(data.audio, { ...base, return_timestamps: true });
    }
    const chunks = (out.chunks ?? []).map((c) => ({ text: c.text, start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0 }));
    self.postMessage({ id, type: 'result', text: (out.text ?? '').trim(), chunks });
  } catch (e) {
    self.postMessage({ id, type: 'error', message: e?.message || String(e) });
  }
};
