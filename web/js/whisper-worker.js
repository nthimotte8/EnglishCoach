// Speech-to-text with Whisper (transformers.js), off the main thread.
// Messages in:  {id, type:'load'} | {id, type:'transcribe', audio: Float32Array (16 kHz mono), words: boolean}
// Messages out: {id, type:'progress', progress, text} | {id, type:'result', text, chunks} | {id, type:'error', message}
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

env.allowLocalModels = false; // models come from the Hugging Face hub, then from the browser cache

// base.en is a good balance of speed and accuracy; tiny.en is the fallback for weak machines.
const MODELS = ['Xenova/whisper-base.en', 'Xenova/whisper-tiny.en'];
let asr = null;
let loading = null;

async function hasWebGPU() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

function load(id) {
  if (asr) return Promise.resolve(asr);
  if (!loading) {
    loading = (async () => {
      const device = (await hasWebGPU()) ? 'webgpu' : 'wasm';
      const files = {};
      const progress_callback = (p) => {
        if (p.status !== 'progress' || !p.file) return;
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 };
        const t = Object.values(files).reduce((a, f) => a + f.total, 0);
        const l = Object.values(files).reduce((a, f) => a + f.loaded, 0);
        self.postMessage({ id, type: 'progress', progress: t ? l / t : 0, text: 'Téléchargement de la reconnaissance vocale…' });
      };
      let lastError;
      for (const model of MODELS) {
        try {
          asr = await pipeline('automatic-speech-recognition', model, {
            device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback,
          });
          return asr;
        } catch (e) { lastError = e; }
      }
      throw lastError;
    })().finally(() => { loading = null; });
  }
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const run = await load(id);
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
