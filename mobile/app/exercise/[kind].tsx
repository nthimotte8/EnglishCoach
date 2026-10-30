import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError, ExerciseItem, ExerciseKind, SpeechScore, WordOp } from '@/api';
import { MicIcon, SpeakerIcon, StopIcon } from '@/icons';
import { PlayerHandle, playItem, SourcePlayer, stopSpeaking } from '@/media';
import { useListener } from '@/speech';
import { useApp } from '@/store';
import { EXERCISE_LABEL, minutesSince } from '@/labels';
import { align, norm, words } from '@/textproc';
import { useColors } from '@/theme';
import { Button, Card, Chip, H, Notice, P } from '@/ui';

const ORAL: ExerciseKind[] = ['lecture', 'repetition'];

export default function Exercise() {
  const c = useColors();
  const { kind } = useLocalSearchParams<{ kind: ExerciseKind }>();
  const { material } = useApp();
  const player = useRef<PlayerHandle>(null);
  const [items, setItems] = useState<ExerciseItem[] | null>(null);
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ score: number; minutes: number } | null>(null);
  const started = useRef(Date.now());
  const hasMedia = !!(material?.video_id || material?.audio_url);

  async function load() {
    if (!material) return;
    setItems(null); setI(0); setScores([]); setAnswered(false); setError(null); setDone(null);
    started.current = Date.now();
    try { setItems((await api.exercise(material.id, kind)).items); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Impossible de préparer l’exercice.'); }
  }
  useEffect(() => { void load(); return () => { stopSpeaking(); player.current?.stop(); }; }, [material?.id, kind]);

  if (!material) return <View style={{ padding: 16 }}><Notice text="Choisis d’abord un contenu dans l’onglet Pratiquer." /></View>;
  const item = items?.[i];
  const listen = (rate?: number) => item ? playItem(player.current, material, item, rate) : Promise.resolve();

  function record(score: number) {
    setScores((s) => [...s, score]); setAnswered(true);
  }
  async function next() {
    if (!items) return;
    player.current?.stop(); stopSpeaking();
    if (i < items.length - 1) { setI(i + 1); setAnswered(false); return; }
    const all = scores;
    const score = Math.round((all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)) * 100);
    const minutes = minutesSince(started.current);
    setDone({ score, minutes });
    api.saveSession({ material_id: material!.id, exercise: kind, score, minutes }).catch(() => {});
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: EXERCISE_LABEL[kind] ?? 'Exercice' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 820, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled">
        {/* The real recording stays visible (YouTube terms); only the text is hidden where the exercise needs it. */}
        {hasMedia && !done && (
          <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}><SourcePlayer ref={player} material={material} /></Card>
        )}

        {error && <><Notice text={error} /><Button title="Retour" onPress={() => router.back()} /></>}
        {!items && !error && <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />}

        {done ? (
          <Card>
            <H>{EXERCISE_LABEL[kind]} terminé</H>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
              <Text style={{ color: c.fg, fontSize: 48, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{done.score} %</Text>
              <P muted style={{ flex: 1 }}>
                {done.score >= 85 ? 'Très bien, passe à un contenu plus difficile.'
                  : done.score >= 60 ? 'Bon travail. Refais-le pour consolider.' : 'Réécoute le passage ligne par ligne, puis recommence.'}
              </P>
            </View>
            <Button variant="primary" title="Recommencer" onPress={load} />
            <Button title="Autre exercice" onPress={() => router.back()} />
          </Card>
        ) : item && items ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Chip label={`${i + 1} / ${items.length}`} />
              <View style={{ flex: 1, height: 6, marginLeft: 12, borderRadius: 3, backgroundColor: c.chip }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${(i / items.length) * 100}%` }} />
              </View>
            </View>
            {ORAL.includes(kind) && <OralItem key={i} kind={kind} item={item} listen={listen} onScore={record} />}
            {kind === 'dictee' && <DictationItem key={i} item={item} listen={listen} onScore={record} />}
            {kind === 'trous' && <ClozeItem key={i} item={item} listen={listen} onScore={record} />}
            {kind === 'reco' && <RecoItem key={i} item={item} listen={listen} onScore={record} />}
            {answered && <Button variant="primary" title={i === items.length - 1 ? 'Voir le résultat' : 'Phrase suivante'} onPress={next} />}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ItemProps = { item: ExerciseItem; listen: (rate?: number) => Promise<void>; onScore: (s: number) => void };

function ListenButtons({ listen, label = 'Écouter' }: { listen: ItemProps['listen']; label?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary" title={label} icon={<SpeakerIcon color={c.onAccent} />} onPress={() => listen()} />
      <Button title="Voix lente" onPress={() => listen(0.7)} />
    </View>
  );
}

function Diff({ ops }: { ops: WordOp[] }) {
  const c = useColors();
  return (
    <Text style={{ fontSize: 17, lineHeight: 28 }}>
      {ops.map((o, k) => (
        <Text key={k} style={o.kind === 'ok' ? { color: c.good } : o.kind === 'missing'
          ? { color: c.bad, textDecorationLine: 'underline' } : { color: c.subtle, textDecorationLine: 'line-through' }}>
          {o.word}{' '}
        </Text>
      ))}
    </Text>
  );
}

function OralItem({ kind, item, listen, onScore }: ItemProps & { kind: ExerciseKind }) {
  const c = useColors();
  const mic = useListener();
  const [result, setResult] = useState<SpeechScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState(kind === 'lecture');

  useEffect(() => { if (kind === 'repetition') void listen().then(() => setHeard(true)); return () => mic.cancel(); }, []);

  async function toggle() {
    setError(null);
    if (!mic.listening) {
      try { stopSpeaking(); await mic.start(); } catch (e) { setError(e instanceof Error ? e.message : 'Micro indisponible.'); }
      return;
    }
    try {
      const said = await mic.stop();
      if (!said.text.trim()) { setError('Je n’ai rien entendu. Réessaie en parlant plus près du micro.'); return; }
      const r = api.scoreSpeech(item.text, said);
      setResult(r);
      onScore(r.score / 100);
    } catch (e) { setError(e instanceof Error ? e.message : 'Évaluation impossible.'); }
  }

  const showText = kind === 'lecture' || !!result;
  return (
    <View style={{ gap: 14 }}>
      <P muted size={14}>{kind === 'lecture' ? 'Lis cette phrase à voix haute.' : 'Écoute le passage, puis répète-le de mémoire.'}</P>
      {showText
        ? (result ? <Diff ops={result.ops} /> : <Text style={{ color: c.fg, fontSize: 19, lineHeight: 28 }}>{item.text}</Text>)
        : <View style={{ backgroundColor: c.chip, borderRadius: 10, padding: 16 }}><P muted>Texte masqué : fie-toi à ton oreille.</P></View>}
      <ListenButtons listen={listen} label={kind === 'lecture' ? 'Écouter le modèle' : 'Réécouter'} />
      {!result && (
        <Button variant={mic.listening ? 'secondary' : 'primary'} disabled={!heard}
          title={mic.listening ? 'J’ai fini' : 'Parler'}
          icon={mic.listening ? <StopIcon color={c.bad} /> : <MicIcon color={c.onAccent} />} onPress={toggle} />
      )}
      {mic.listening && <P muted size={14}>{mic.text ? `« ${mic.text} »` : 'Je t’écoute…'}</P>}
      {error && <Notice text={error} />}
      {result && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip tone={result.score >= 85 ? 'good' : result.score >= 60 ? 'warm' : 'bad'} label={`Score ${result.score}`} />
            <Chip label={`Mots compris ${result.accuracy} %`} />
            {result.wpm ? <Chip label={`${result.wpm} mots/min`} /> : null}
            {result.long_pauses > 0 ? <Chip tone="warm" label={`${result.long_pauses} pause${result.long_pauses > 1 ? 's' : ''} longue${result.long_pauses > 1 ? 's' : ''}`} /> : null}
          </View>
          <P muted size={14}>Entendu : « {result.recognized || '—'} »</P>
          {result.to_practise.length > 0 && <P size={14}>À retravailler : {result.to_practise.join(', ')}</P>}
        </View>
      )}
    </View>
  );
}

function DictationItem({ item, listen, onScore }: ItemProps) {
  const c = useColors();
  const [value, setValue] = useState('');
  const [ops, setOps] = useState<WordOp[] | null>(null);
  const [score, setScore] = useState(0);
  useEffect(() => { void listen(); }, []);
  function check() {
    const r = align(words(item.text), words(value));
    setOps(r.ops); setScore(r.score); onScore(r.score);
  }
  return (
    <View style={{ gap: 14 }}>
      <ListenButtons listen={listen} label="Écouter la phrase" />
      <TextInput value={value} onChangeText={setValue} editable={!ops} multiline autoCapitalize="sentences" autoCorrect={false}
        placeholder="Écris ce que tu entends" placeholderTextColor={c.subtle} accessibilityLabel="Ce que tu entends"
        style={{ minHeight: 80, borderWidth: 1, borderColor: c.field, borderRadius: 8, padding: 12, color: c.fg, fontSize: 17, textAlignVertical: 'top' }} />
      {!ops ? <Button variant="primary" title="Vérifier" onPress={check} disabled={!value.trim()} /> : (
        <View style={{ gap: 8 }}>
          <Chip tone={score >= 0.9 ? 'good' : score >= 0.6 ? 'warm' : 'bad'} label={`${Math.round(score * 100)} %`} />
          <Diff ops={ops} />
        </View>
      )}
    </View>
  );
}

function ClozeItem({ item, listen, onScore }: ItemProps) {
  const c = useColors();
  const blanks = item.blanks ?? [];
  const answers = item.answers ?? [];
  const [vals, setVals] = useState<string[]>(blanks.map(() => ''));
  const [checked, setChecked] = useState(false);
  const ok = (k: number) => norm(vals[k]) === norm(answers[k]);
  function check() {
    setChecked(true);
    onScore(blanks.length ? blanks.filter((_, k) => ok(k)).length / blanks.length : 0);
  }
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 10 }}>
        {(item.words ?? []).map((w, idx) => {
          const k = blanks.indexOf(idx);
          if (k < 0) return <Text key={idx} style={{ color: c.fg, fontSize: 18 }}>{w} </Text>;
          const good = checked && ok(k);
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
              <TextInput value={vals[k]} editable={!checked} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Mot manquant ${k + 1}`}
                onChangeText={(t) => setVals((v) => v.map((x, j) => (j === k ? t : x)))}
                style={{ minWidth: Math.max(70, answers[k].length * 12), height: 38, paddingHorizontal: 8, fontSize: 17, color: c.fg,
                  borderBottomWidth: 2, borderBottomColor: !checked ? c.accent : good ? c.good : c.bad,
                  backgroundColor: !checked ? c.accentSoft : good ? c.goodSoft : c.badSoft, borderRadius: 4 }} />
              {checked && !good && <Text style={{ color: c.good, fontSize: 15, marginLeft: 6 }}>{answers[k]}</Text>}
            </View>
          );
        })}
      </View>
      <ListenButtons listen={listen} label="Écouter la phrase" />
      {!checked && <Button variant="primary" title="Vérifier" onPress={check} disabled={vals.every((v) => !v.trim())} />}
    </View>
  );
}

function RecoItem({ item, listen, onScore }: ItemProps) {
  const c = useColors();
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => { void listen(); }, []);
  return (
    <View style={{ gap: 12 }}>
      <ListenButtons listen={listen} label="Écouter le passage" />
      <P muted size={14}>Quel passage as-tu entendu ?</P>
      {(item.options ?? []).map((o) => {
        const right = o === item.text;
        const state = !choice ? 'idle' : right ? 'right' : o === choice ? 'wrong' : 'idle';
        return (
          <Pressable key={o} accessibilityRole="button" disabled={!!choice}
            onPress={() => { setChoice(o); onScore(right ? 1 : 0); }}
            style={{ padding: 14, borderRadius: 10, borderWidth: 1,
              borderColor: state === 'right' ? c.good : state === 'wrong' ? c.bad : c.field,
              backgroundColor: state === 'right' ? c.goodSoft : state === 'wrong' ? c.badSoft : c.surface }}>
            <Text style={{ color: c.fg, fontSize: 15, lineHeight: 21 }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
