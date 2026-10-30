import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api, ExerciseKind, MaterialSummary } from '@/api';
import { PlusIcon, SpeakerIcon } from '@/icons';
import { PlayerHandle, SourcePlayer, speak, stopSpeaking } from '@/media';
import { useApp } from '@/store';
import { EXERCISE_LABEL } from '@/labels';
import { font, useColors } from '@/theme';
import { Button, Card, Chip, H, P } from '@/ui';

const EXERCISES: { kind: ExerciseKind; skill: string; hint: string }[] = [
  { kind: 'lecture', skill: 'Prononciation', hint: 'Lis une phrase, ta prononciation est évaluée.' },
  { kind: 'repetition', skill: 'Mémoire + oral', hint: 'Écoute un passage puis répète-le sans le texte.' },
  { kind: 'reco', skill: 'Compréhension', hint: 'Retrouve le passage entendu parmi quatre.' },
  { kind: 'dictee', skill: 'Écoute + écrit', hint: 'Écris mot pour mot ce que tu entends.' },
  { kind: 'trous', skill: 'Vocabulaire', hint: 'Complète les mots retirés de la phrase.' },
];

export default function Practice() {
  const c = useColors();
  const { material, setMaterial, model } = useApp();
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [recent, setRecent] = useState<MaterialSummary[]>([]);
  const [estimating, setEstimating] = useState(false);

  useFocusEffect(useCallback(() => {
    api.materials().then(setRecent).catch(() => {});
    return () => { stopSpeaking(); player.current?.stop(); };
  }, []));

  const current = useMemo(() => {
    if (!material?.video_id && !material?.audio_url) return -1;
    let idx = -1;
    material.lines.forEach((l, i) => { if (l.sec != null && l.sec <= time + 0.3) idx = i; });
    return idx;
  }, [material, time]);

  const wpm = useMemo(() => {
    if (!material) return null;
    const timed = material.lines.filter((l) => l.sec != null);
    const span = timed.length > 1 ? (timed[timed.length - 1].sec as number) - (timed[0].sec as number) : 0;
    return span > 20 && material.source !== 'theme' ? Math.round(material.word_count / (span / 60)) : null;
  }, [material]);

  async function estimate() {
    if (!material) return;
    setEstimating(true);
    try {
      const { level } = await api.estimateLevel(material.id);
      if (level) await setMaterial({ ...material, level });
    } catch { /* keep the button */ } finally { setEstimating(false); }
  }

  async function open(id: number) {
    try { await setMaterial(await api.material(id)); } catch { /* ignore */ }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 820, width: '100%', alignSelf: 'center' }}>
      {!material ? (
        <Card>
          <H>Commence par un contenu</H>
          <P muted>Choisis un épisode de podcast, une vidéo YouTube en anglais, colle une transcription, ou laisse le coach écrire un texte sur un thème.</P>
          <Button variant="primary" title="Ajouter un contenu" icon={<PlusIcon color={c.onAccent} />} onPress={() => router.push('/new-material')} />
        </Card>
      ) : (
        <>
          <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
            {material.video_id || material.audio_url ? (
              <SourcePlayer ref={player} material={material} onTime={setTime} />
            ) : (
              <View style={{ backgroundColor: c.video, padding: 20, gap: 6 }}>
                <Text style={{ color: '#C9D2DB', fontFamily: font.mono, fontSize: 12 }}>
                  {material.source === 'theme' ? `THÈME · ${material.theme ?? ''}` : 'TEXTE'}
                </Text>
                <Text style={{ color: '#F3F6F9', fontSize: 20, fontWeight: '600' }}>{material.title}</Text>
              </View>
            )}
            <View style={{ padding: 14, gap: 10 }}>
              {material.video_id && <H>{material.title}</H>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Chip tone="accent" label={`Niveau estimé ${material.level ?? '—'}`} />
                {wpm && <Chip label={`${wpm} mots/min`} />}
                <Chip label={`${material.word_count} mots`} />
                {!material.level && model.installed && <Button variant="quiet" title="Estimer le niveau" onPress={estimate} loading={estimating} />}
              </View>
            </View>
          </Card>

          <Card style={{ gap: 4, paddingHorizontal: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 }}>
              <H>Transcription</H>
              <P muted size={13}>Touche une ligne pour l’écouter</P>
            </View>
            <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
              {material.lines.map((l, i) => (
                <Pressable key={i} accessibilityRole="button"
                  onPress={() => ((material.video_id || material.audio_url) && l.sec != null ? player.current?.seek(l.sec) : speak(l.text))}
                  style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 8, borderRadius: 8,
                    backgroundColor: i === current ? c.accentSoft : pressed ? c.chip : 'transparent' })}>
                  <Text style={{ fontFamily: font.mono, fontSize: 13, color: c.subtle, minWidth: 44, paddingTop: 2 }}>
                    {l.t ?? String(i + 1).padStart(2, '0')}
                  </Text>
                  <Text style={{ flex: 1, color: c.fg, fontSize: 15, lineHeight: 22 }}>{l.text}</Text>
                  {!material.video_id && !material.audio_url && <SpeakerIcon color={c.subtle} size={16} />}
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          <View style={{ gap: 10 }}>
            <H>Choisir un exercice</H>
            {EXERCISES.map((e) => (
              <Pressable key={e.kind} accessibilityRole="button"
                onPress={() => { player.current?.stop(); router.push({ pathname: '/exercise/[kind]', params: { kind: e.kind } }); }}
                style={({ pressed }) => ({ backgroundColor: c.surface, borderWidth: 1, borderColor: pressed ? c.accent : c.field,
                  borderRadius: 12, padding: 14, gap: 4 })}>
                <Text style={{ color: c.accent, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.5 }}>{e.skill.toUpperCase()}</Text>
                <Text style={{ color: c.fg, fontSize: 16, fontWeight: '600' }}>{EXERCISE_LABEL[e.kind]}</Text>
                <Text style={{ color: c.muted, fontSize: 14 }}>{e.hint}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Changer de contenu" icon={<PlusIcon color={c.fg} />} onPress={() => router.push('/new-material')} />
        </>
      )}

      {recent.filter((r) => r.id !== material?.id).length > 0 && (
        <Card>
          <H>Contenus récents</H>
          {recent.filter((r) => r.id !== material?.id).slice(0, 8).map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => open(r.id)}
              style={({ pressed }) => ({ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.lineSoft, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: c.fg, fontSize: 15 }} numberOfLines={1}>{r.title}</Text>
              <Text style={{ color: c.subtle, fontSize: 13 }}>
                {r.source === 'theme' ? `Thème · ${r.theme}` : r.source === 'youtube' ? 'YouTube' : r.source === 'podcast' ? 'Podcast' : 'Texte'} · {r.word_count} mots{r.level ? ` · ${r.level}` : ''}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
