import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError, CoachReply, Evaluation } from '@/api';
import { MicIcon, SendIcon, SpeakerIcon, StopIcon } from '@/icons';
import { speak, stopSpeaking } from '@/media';
import { ModelGate } from '@/ModelGate';
import { useListener } from '@/speech';
import { useApp } from '@/store';
import { minutesSince } from '@/labels';
import { stop as stopModel } from '@/llm';
import { useColors } from '@/theme';
import { Button, Card, Chip, H, Notice, P } from '@/ui';

type Entry =
  | { kind: 'coach'; text: string }
  | { kind: 'me'; text: string }
  | { kind: 'feedback'; reply: CoachReply }
  | { kind: 'eval'; ev: Evaluation };

export default function Coach() {
  const c = useColors();
  const { material } = useApp();
  const mic = useListener();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const started = useRef(0);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { reset(); }, [material?.id]);
  useEffect(() => () => stopSpeaking(), []);

  function reset() {
    setEntries([]); setHistory([]); setInput(''); setError(null); setFinished(false); stopSpeaking();
  }
  const learnerMessages = entries.filter((e): e is { kind: 'me'; text: string } => e.kind === 'me').map((e) => e.text);

  async function ask(message?: string) {
    if (!material) return;
    setBusy('Le coach réfléchit…'); setError(null);
    try {
      const r = await api.coachTurn(material, history, message);
      const add: Entry[] = [];
      if (message) add.push({ kind: 'feedback', reply: r });
      add.push({ kind: 'coach', text: r.reply });
      setEntries((e) => [...e, ...add]);
      setHistory((h) => [...h, ...(message ? [{ role: 'user' as const, content: 'Learner: ' + message }] : []),
        { role: 'assistant' as const, content: r.reply }].slice(-16));
      if (autoSpeak) speak(r.reply);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Le coach n’a pas pu répondre.');
    } finally {
      setBusy(null);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  function start() { started.current = Date.now(); void ask(); }

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setEntries((e) => [...e, { kind: 'me', text: t }]);
    void ask(t);
  }

  async function voice() {
    setError(null);
    if (!mic.listening) {
      stopSpeaking();
      try { await mic.start(); } catch (e) { setError(e instanceof Error ? e.message : 'Micro indisponible.'); }
      return;
    }
    try {
      const { text } = await mic.stop();
      if (text.trim()) send(text); else setError('Je n’ai rien entendu. Réessaie plus près du micro.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Reconnaissance vocale impossible.'); }
  }

  async function evaluate() {
    if (!material || !learnerMessages.length) return;
    setBusy('Évaluation de ton niveau…'); setError(null); stopSpeaking();
    try {
      const ev = await api.evaluate(material, learnerMessages, minutesSince(started.current));
      setEntries((e) => [...e, { kind: 'eval', ev }]);
      setFinished(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Évaluation impossible.');
    } finally {
      setBusy(null);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  if (!material) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Card>
          <H>Pas encore de contenu</H>
          <P muted>Le coach discute avec toi du contenu que tu viens de travailler. Choisis-en un d’abord.</P>
          <Button variant="primary" title="Ajouter un contenu" onPress={() => router.push('/new-material')} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 820, width: '100%', alignSelf: 'center' }}>
        <P muted size={13}>Sur : {material.title}</P>
        {entries.length === 0 && !busy && (
          <ModelGate><Card>
            <P>Le coach te pose des questions sur ce contenu. Réponds à l’écrit ou à l’oral : chaque réponse est corrigée, et tu obtiens un bilan de niveau à la fin.</P>
            <Button variant="primary" title="Démarrer la discussion" onPress={start} />
          </Card></ModelGate>
        )}
        {entries.map((e, k) => {
          if (e.kind === 'coach') return (
            <View key={k} style={{ alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: c.chip, borderRadius: 12, padding: 12, gap: 6 }}>
              <Text style={{ color: c.fg, fontSize: 16, lineHeight: 23 }}>{e.text}</Text>
              <Button variant="quiet" title="Écouter" icon={<SpeakerIcon color={c.accent} size={16} />} onPress={() => speak(e.text)}
                style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} />
            </View>
          );
          if (e.kind === 'me') return (
            <View key={k} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: c.accent, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: c.onAccent, fontSize: 16, lineHeight: 23 }}>{e.text}</Text>
            </View>
          );
          if (e.kind === 'feedback') return (
            <View key={k} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: c.warmBg, borderRadius: 10, padding: 12, gap: 6 }}>
              <Text style={{ color: c.warmFg, fontWeight: '600' }}>Retour du coach</Text>
              {e.reply.corrections.length === 0
                ? <Text style={{ color: c.good }}>Aucune erreur, bien joué.</Text>
                : e.reply.corrections.map((x, j) => (
                  <View key={j}>
                    <Text style={{ color: c.warmFg }}>
                      <Text style={{ textDecorationLine: 'line-through' }}>{x.original}</Text> → <Text style={{ fontWeight: '600' }}>{x.better}</Text>
                    </Text>
                    {!!x.why && <Text style={{ color: c.warmFg, fontSize: 13 }}>{x.why}</Text>}
                  </View>
                ))}
              {!!e.reply.tip && <Text style={{ color: c.warmFg, fontSize: 14 }}>{e.reply.tip}</Text>}
            </View>
          );
          return (
            <Card key={k}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <H>Bilan de la discussion</H>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {e.ev.level && <Chip tone="accent" label={e.ev.level} />}
                  <Chip label={`${e.ev.score} / 100`} />
                </View>
              </View>
              {!!e.ev.summary && <P>{e.ev.summary}</P>}
              {e.ev.strengths.length > 0 && <><P muted size={13}>Points forts</P>{e.ev.strengths.map((s, j) => <P key={j}>• {s}</P>)}</>}
              {e.ev.work_on.length > 0 && <><P muted size={13}>À travailler</P>{e.ev.work_on.map((s, j) => <P key={j}>• {s}</P>)}</>}
              <Button title="Nouvelle discussion" onPress={reset} />
            </Card>
          );
        })}
        {busy && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={c.accent} /><P muted size={14}>{busy}</P>
            <Button variant="quiet" title="Arrêter" onPress={stopModel} style={{ minHeight: 32 }} />
          </View>
        )}
        {error && <Notice text={error} />}
      </ScrollView>

      {entries.length > 0 && !finished && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput value={input} onChangeText={setInput} placeholder="Réponds en anglais…" placeholderTextColor={c.subtle}
              multiline editable={!busy && !mic.listening} accessibilityLabel="Ta réponse"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: c.field, borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 16 }} />
            <Button accessibilityLabel={mic.listening ? 'Arrêter et envoyer' : 'Répondre à l’oral'} onPress={voice} disabled={!!busy}
              icon={mic.listening ? <StopIcon color={c.bad} /> : <MicIcon color={c.fg} />} />
            <Button variant="primary" accessibilityLabel="Envoyer" onPress={() => send(input)} disabled={!input.trim() || !!busy}
              icon={<SendIcon color={c.onAccent} />} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button variant="quiet" title={autoSpeak ? 'Lecture auto : oui' : 'Lecture auto : non'} onPress={() => setAutoSpeak((v) => !v)}
              style={{ minHeight: 32, paddingHorizontal: 0 }} />
            {learnerMessages.length >= 2 && <Button variant="quiet" title="Terminer et évaluer" onPress={evaluate} disabled={!!busy}
              style={{ minHeight: 32, paddingHorizontal: 0 }} />}
          </View>
          {mic.listening && <P muted size={13}>{mic.text ? `« ${mic.text} »` : 'Je t’écoute…'} Touche le carré pour envoyer.</P>}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
