// Speech recognition with iOS's built-in recogniser, forced to run on the device (free, offline).
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

export type TimedWord = { word: string; start: number; end: number };
type Segment = { segment?: string; startTimeMillis?: number; endTimeMillis?: number };
type ResultEvent = { isFinal: boolean; results: { transcript: string; segments?: Segment[] }[] };

const OPTIONS = {
  lang: 'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: true, addsPunctuation: true,
};

export class SpeechError extends Error {}

const toWords = (segs: Segment[] | undefined): TimedWord[] =>
  (segs ?? []).filter((s) => s.segment && s.startTimeMillis != null).map((s) => ({
    word: String(s.segment), start: (s.startTimeMillis as number) / 1000,
    end: ((s.endTimeMillis ?? s.startTimeMillis) as number) / 1000,
  }));

async function ensureReady() {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) throw new SpeechError('Autorise le micro et la reconnaissance vocale dans Réglages › English Coach.');
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
    throw new SpeechError('La reconnaissance vocale hors ligne n’est pas disponible : dans Réglages › Général › Clavier, ajoute le clavier anglais et active la dictée.');
  }
}

/** Accumulates results: final chunks are kept, the latest partial replaces the previous one. */
class Collector {
  finals: { text: string; words: TimedWord[] }[] = [];
  partial = { text: '', words: [] as TimedWord[] };
  add(e: ResultEvent) {
    const r = e.results[0];
    if (!r) return;
    const chunk = { text: r.transcript.trim(), words: toWords(r.segments) };
    if (e.isFinal) { if (chunk.text) this.finals.push(chunk); this.partial = { text: '', words: [] }; }
    else this.partial = chunk;
  }
  get text() { return [...this.finals.map((f) => f.text), this.partial.text].filter(Boolean).join(' '); }
  get words() { return [...this.finals.flatMap((f) => f.words), ...this.partial.words]; }
}

/** Live listening from the microphone, with the text appearing as the learner speaks. */
export function useListener() {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const collector = useRef<Collector | null>(null);
  const done = useRef<((r: { text: string; words: TimedWord[] }) => void) | null>(null);
  const failed = useRef<((e: Error) => void) | null>(null);

  useSpeechRecognitionEvent('result', (e: ResultEvent) => {
    if (!collector.current) return;
    collector.current.add(e);
    setText(collector.current.text);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const c = collector.current;
    collector.current = null;
    done.current?.({ text: c?.text ?? '', words: c?.words ?? [] });
    done.current = null; failed.current = null;
  });
  useSpeechRecognitionEvent('error', (e: { error: string; message: string }) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return; // 'end' follows with whatever was heard
    failed.current?.(new SpeechError('Reconnaissance vocale interrompue : ' + e.message));
    failed.current = null;
  });

  const start = useCallback(async () => {
    await ensureReady();
    collector.current = new Collector();
    setText('');
    ExpoSpeechRecognitionModule.start(OPTIONS);
    setListening(true);
  }, []);

  /** Stops listening and resolves with everything heard. */
  const stop = useCallback(() => new Promise<{ text: string; words: TimedWord[] }>((resolve, reject) => {
    if (!collector.current) return resolve({ text: '', words: [] });
    done.current = resolve; failed.current = reject;
    ExpoSpeechRecognitionModule.stop();
  }), []);

  const cancel = useCallback(() => { collector.current = null; done.current = null; ExpoSpeechRecognitionModule.abort(); }, []);

  return { listening, text, start, stop, cancel };
}

/** Transcribes a local audio file (a downloaded podcast episode). Takes about as long as the audio, or less. */
export async function transcribeFile(uri: string, onText?: (t: string) => void): Promise<{ text: string; words: TimedWord[] }> {
  await ensureReady();
  const c = new Collector();
  return new Promise((resolve, reject) => {
    const subs = [
      ExpoSpeechRecognitionModule.addListener('result', (e: ResultEvent) => { c.add(e); onText?.(c.text); }),
      ExpoSpeechRecognitionModule.addListener('end', () => { subs.forEach((s) => s.remove()); resolve({ text: c.text, words: c.words }); }),
      ExpoSpeechRecognitionModule.addListener('error', (e: { error: string; message: string }) => {
        if (e.error === 'no-speech') return;
        subs.forEach((s) => s.remove());
        reject(new SpeechError('Transcription impossible : ' + e.message));
      }),
    ];
    ExpoSpeechRecognitionModule.start({ ...OPTIONS, interimResults: false, audioSource: { uri } });
  });
}

export function stopFileTranscription() { ExpoSpeechRecognitionModule.stop(); }
