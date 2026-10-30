// On-device language model (llama.cpp through llama.rn). Free, offline, no API key.
// Model: Qwen2.5-1.5B-Instruct, Q4_K_M quantisation (~1 GB, Apache-2.0), downloaded once on first use.
// Chosen to fit an iPhone 13 (4 GB of RAM); swap MODEL for a bigger one on newer phones.
import * as FileSystem from 'expo-file-system/legacy';
import * as Llama from 'llama.rn';

export const MODEL = {
  name: 'Qwen2.5 1.5B Instruct',
  file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  approxBytes: 986 * 1024 * 1024,
};
const DIR = FileSystem.documentDirectory + 'models/';
const PATH = DIR + MODEL.file;

export class LLMError extends Error {}

type Ctx = Awaited<ReturnType<typeof Llama.initLlama>>;
let ctx: Ctx | null = null;
let loading: Promise<Ctx> | null = null;
let queue: Promise<unknown> = Promise.resolve(); // llama.cpp runs one completion at a time

export async function modelStatus(): Promise<{ installed: boolean; bytes: number }> {
  const info = await FileSystem.getInfoAsync(PATH);
  // a partial download is smaller than ~90 % of the expected size
  const bytes = info.exists && 'size' in info ? info.size ?? 0 : 0;
  return { installed: info.exists && bytes > MODEL.approxBytes * 0.9, bytes };
}

let download: FileSystem.DownloadResumable | null = null;

export async function downloadModel(onProgress: (fraction: number) => void): Promise<void> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  download = FileSystem.createDownloadResumable(MODEL.url, PATH, {}, (p) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : MODEL.approxBytes;
    onProgress(Math.min(1, p.totalBytesWritten / total));
  });
  try {
    const r = await download.downloadAsync();
    if (!r || r.status >= 400) throw new LLMError(`Téléchargement refusé (${r?.status ?? '?'}).`);
  } catch (e) {
    await FileSystem.deleteAsync(PATH, { idempotent: true });
    throw e instanceof LLMError ? e : new LLMError('Téléchargement interrompu. Vérifie ta connexion et réessaie.');
  } finally {
    download = null;
  }
}
export async function cancelDownload() { await download?.cancelAsync().catch(() => {}); }

export async function deleteModel() {
  await release();
  await FileSystem.deleteAsync(PATH, { idempotent: true });
}

async function context(): Promise<Ctx> {
  if (ctx) return ctx;
  if (!loading) {
    loading = (async () => {
      if (!(await modelStatus()).installed) throw new LLMError('Le modèle du coach n’est pas encore téléchargé.');
      ctx = await Llama.initLlama({ model: PATH, n_ctx: 4096, n_gpu_layers: 99, use_mlock: false });
      return ctx;
    })().finally(() => { loading = null; });
  }
  return loading;
}

/** Load the model in the background (a few seconds) so the first answer comes faster. */
export function warmUp() { void context().catch(() => {}); }

export async function release() {
  const c = ctx; ctx = null;
  await c?.release().catch(() => {});
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Extract one JSON value from a model reply (whole text, a ``` fence, or first {...}). */
export function extractJson(text: string): any {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  throw new LLMError('Le coach a donné une réponse illisible. Réessaie.');
}

/**
 * Ask for JSON matching `schema`. The schema is turned into a llama.cpp grammar so a small
 * model cannot drift out of the format.
 */
export async function completeJson<T = any>(messages: ChatMessage[], schema: object, opts: {
  maxTokens?: number; temperature?: number; onText?: (partial: string) => void;
} = {}): Promise<T> {
  const run = async () => {
    const c = await context();
    const toGrammar = (Llama as any).convertJsonSchemaToGrammar as undefined | ((a: object) => string | Promise<string>);
    const grammar = toGrammar ? await toGrammar({ schema, propOrder: {} }) : undefined;
    let partial = '';
    const res = await c.completion(
      {
        messages, n_predict: opts.maxTokens ?? 400, temperature: opts.temperature ?? 0.4, top_p: 0.9,
        stop: ['<|im_end|>', '<|endoftext|>'], ...(grammar ? { grammar } : {}),
      } as any,
      (data: { token?: string }) => { if (data.token) { partial += data.token; opts.onText?.(partial); } },
    );
    return extractJson(res.text) as T;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export function stop() { void ctx?.stopCompletion().catch(() => {}); }
