import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { api, ApiError, Episode, Level, LEVELS } from '@/api';
import { ModelGate } from '@/ModelGate';
import { useApp } from '@/store';
import { useColors } from '@/theme';
import { Button, Card, Field, Notice, P, Segmented } from '@/ui';

type Mode = 'podcast' | 'youtube' | 'theme';
const TOPICS = ['Technologie', 'Business', 'Voyage', 'Science', 'Culture', 'Vie quotidienne', 'Entretien d’embauche'];

// Free English-learning shows with public RSS feeds (check they load; any RSS link works).
const SUGGESTED_FEEDS = [
  { name: 'BBC 6 Minute English', feed: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss' },
  { name: 'VOA Learning English', feed: 'https://learningenglish.voanews.com/podcast/?count=30' },
];

export default function NewMaterial() {
  const c = useColors();
  const { setMaterial } = useApp();
  const [mode, setMode] = useState<Mode>('podcast');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // podcast
  const [feed, setFeed] = useState('');
  const [show, setShow] = useState('');
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [picked, setPicked] = useState<Episode | null>(null);
  // youtube / text
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  // theme
  const [topic, setTopic] = useState(TOPICS[0]);
  const [level, setLevel] = useState<Level>('B1');

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : 'Une erreur est survenue.'); }
    finally { setBusy(null); }
  }
  const loadFeed = (u = feed) => run('Chargement des épisodes…', async () => {
    setEpisodes(null); setPicked(null);
    const r = await api.episodes(u);
    setShow(r.show); setEpisodes(r.episodes);
  });
  const done = async (m: Awaited<ReturnType<typeof api.material>>) => { await setMaterial(m); router.back(); };
  const create = () => run('Préparation…', async () => {
    if (mode === 'podcast' && picked) await done(await api.fromPodcast(picked, show, (s) => setBusy(s)));
    else if (mode === 'youtube') await done(await api.fromText(title, text, url.trim() || undefined));
    else if (mode === 'theme') { setBusy('Le coach écrit le texte… (20 à 40 s)'); await done(await api.fromTheme(topic, level)); }
  });

  const ready = mode === 'podcast' ? !!picked : mode === 'youtube' ? text.trim().length > 20 : true;
  const chip = (on: boolean) => ({
    paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' as const, borderRadius: 999, borderWidth: 1,
    borderColor: on ? c.accent : c.field, backgroundColor: on ? c.accentSoft : c.surface,
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Segmented value={mode} onChange={(m) => { if (!busy) { setMode(m); setError(null); } }} options={[
          { value: 'podcast', label: 'Podcast' }, { value: 'youtube', label: 'YouTube / texte' }, { value: 'theme', label: 'Thème' },
        ]} />

        {mode === 'theme' ? (
          <ModelGate>
            <Card>
              <P muted size={13}>Le coach écrit un monologue parlé sur ce thème, à ton niveau.</P>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TOPICS.map((t) => (
                  <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: t === topic }} onPress={() => setTopic(t)} style={chip(t === topic)}>
                    <Text style={{ color: t === topic ? c.accentStrong : c.fg, fontSize: 14 }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Segmented value={level} onChange={setLevel} options={LEVELS.filter((l) => l !== 'A1' && l !== 'C2').map((l) => ({ value: l, label: l }))} />
              {error && <Notice text={error} />}
              <Button variant="primary" title="Générer le texte" onPress={create} loading={!!busy} />
              {busy && <P muted size={13}>{busy}</P>}
            </Card>
          </ModelGate>
        ) : (
          <Card>
            {mode === 'podcast' && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SUGGESTED_FEEDS.map((f) => (
                    <Pressable key={f.feed} accessibilityRole="button" disabled={!!busy}
                      onPress={() => { setFeed(f.feed); void loadFeed(f.feed); }} style={chip(feed === f.feed)}>
                      <Text style={{ color: feed === f.feed ? c.accentStrong : c.fg, fontSize: 14 }}>{f.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="Ou le lien RSS d’un autre podcast" value={feed} onChangeText={setFeed} autoCapitalize="none"
                  autoCorrect={false} keyboardType="url" placeholder="https://…/feed.xml" onSubmitEditing={() => loadFeed()} />
                {!episodes && <Button title="Voir les épisodes" onPress={() => loadFeed()} disabled={feed.trim().length < 10 || !!busy} />}
                {episodes && (
                  <View style={{ gap: 6 }}>
                    <P muted size={13}>{show} · choisis un épisode court (moins de 15 min) : il est transcrit sur ton iPhone.</P>
                    {episodes.slice(0, 15).map((e) => {
                      const on = picked?.audio_url === e.audio_url;
                      return (
                        <Pressable key={e.audio_url} accessibilityRole="button" accessibilityState={{ selected: on }} disabled={!!busy}
                          onPress={() => setPicked(e)}
                          style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: on ? c.accent : c.lineSoft,
                            backgroundColor: on ? c.accentSoft : c.surface }}>
                          <Text style={{ color: c.fg, fontSize: 15 }} numberOfLines={2}>{e.title}</Text>
                          {e.duration ? <Text style={{ color: c.subtle, fontSize: 13 }}>{Math.round(e.duration / 60)} min</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
            {mode === 'youtube' && (
              <>
                <Field label="Lien YouTube (facultatif, pour lire la vidéo dans l’app)" value={url} onChangeText={setUrl}
                  autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://www.youtube.com/watch?v=…" />
                <Field label="Titre (facultatif)" value={title} onChangeText={setTitle} />
                <Field label="Transcription" value={text} onChangeText={setText} multiline
                  style={{ minHeight: 160, textAlignVertical: 'top' }} placeholder="Colle la transcription, avec ou sans horodatage." />
                <P muted size={13}>Sur YouTube : sous la vidéo, « … Plus » puis « Afficher la transcription », sélectionne et copie.</P>
              </>
            )}
            {error && <Notice text={error} />}
            {(mode === 'youtube' || episodes) && (
              <Button variant="primary" title={mode === 'podcast' ? 'Transcrire cet épisode' : 'Charger'} onPress={create}
                loading={!!busy && busy !== 'Chargement des épisodes…'} disabled={!ready || !!busy} />
            )}
            {busy && <P muted size={13}>{busy}</P>}
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
