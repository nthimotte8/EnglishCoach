import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { api, LEVELS, Stats } from '@/api';
import { useApp } from '@/store';
import { EXERCISE_LABEL } from '@/labels';
import { MODEL } from '@/llm';
import { ModelGate } from '@/ModelGate';
import { font, useColors } from '@/theme';
import { Button, Card, H, Notice, P } from '@/ui';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

export default function Account() {
  const c = useColors();
  const { model, deleteModel } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { width } = useWindowDimensions();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await api.stats()); setError(null); }
    catch { setError('Impossible de charger ta progression.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));


  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 820, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <H size={19}>Ma progression</H>
          <P muted size={13}>
            {stats?.first_session_at ? `Depuis le ${new Date(stats.first_session_at).toLocaleDateString('fr-FR')} · ` : ''}Données gardées sur cet iPhone
          </P>
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <P muted size={12}>Niveau</P>
          <View style={{ backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 18, fontFamily: font.mono }}>{stats?.level ?? '—'}</Text>
          </View>
        </View>
      </Card>

      {error && <Notice text={error} />}
      {!stats && !error && <ActivityIndicator color={c.accent} />}

      {stats && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              ['Temps de pratique', fmtMinutes(stats.total_minutes)],
              ['Contenus travaillés', String(stats.materials)],
              ['Exercices réalisés', String(stats.exercises)],
              ['Échanges avec le coach', String(stats.coach_messages)],
            ].map(([label, value]) => (
              <Card key={label} style={{ flexBasis: width > 700 ? '22%' : '46%', flexGrow: 1, gap: 4 }}>
                <P muted size={13}>{label}</P>
                <Text style={{ color: c.fg, fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
              </Card>
            ))}
          </View>

          <Card>
            <H>Courbe de progression</H>
            <LevelCurve stats={stats} />
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <H>Activité</H><P muted size={13}>20 dernières semaines</P>
            </View>
            <Heatmap activity={stats.activity} />
          </Card>

          <Card style={{ gap: 0 }}>
            <H style={{ marginBottom: 8 }}>Historique</H>
            {stats.history.length === 0
              ? <P muted>Chaque exercice ou discussion terminé apparaîtra ici.</P>
              : stats.history.map((h) => (
                <View key={h.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.lineSoft }}>
                  <Text style={{ color: c.subtle, fontFamily: font.mono, fontSize: 13, width: 44 }}>{shortDate(h.created_at)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.fg, fontSize: 15 }}>{EXERCISE_LABEL[h.exercise] ?? h.exercise}</Text>
                    <Text style={{ color: c.subtle, fontSize: 13 }} numberOfLines={1}>{h.material_title ?? '—'}</Text>
                  </View>
                  <Text style={{ color: c.fg, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                    {h.score != null ? `${h.score} %` : '—'}{h.level ? ` · ${h.level}` : ''}
                  </Text>
                </View>
              ))}
          </Card>
        </>
      )}
      {model.installed ? (
        <Card>
          <H>Coach hors ligne</H>
          <P muted size={14}>{MODEL.name} est installé sur cet iPhone (environ 1 Go).</P>
          {confirmDelete ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Annuler" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
              <Button variant="primary" title="Supprimer" onPress={async () => { await deleteModel(); setConfirmDelete(false); }} style={{ flex: 1 }} />
            </View>
          ) : <Button title="Supprimer le modèle pour libérer de l’espace" onPress={() => setConfirmDelete(true)} />}
        </Card>
      ) : <ModelGate compact><View /></ModelGate>}
    </ScrollView>
  );
}

function LevelCurve({ stats }: { stats: Stats }) {
  const c = useColors();
  const pts = stats.curve;
  if (!pts.length) return <P muted>Ta courbe apparaîtra après ta première discussion évaluée avec le coach.</P>;
  const W = 640, H = 220, L = 36, R = 14, T = 14, B = 28;
  const y = (lvl: string) => T + (LEVELS.length - 1 - LEVELS.indexOf(lvl as never)) * ((H - T - B) / (LEVELS.length - 1));
  const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + i * ((W - L - R) / (pts.length - 1)));
  return (
    <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      {LEVELS.map((l) => (
        <React.Fragment key={l}>
          <Line x1={L} x2={W - R} y1={y(l)} y2={y(l)} stroke={c.lineSoft} strokeWidth={1} />
          <SvgText x={2} y={y(l) + 4} fill={c.subtle} fontSize={12} fontFamily={font.mono}>{l}</SvgText>
        </React.Fragment>
      ))}
      {pts.length > 1 && <Polyline points={pts.map((p, i) => `${x(i)},${y(p.level)}`).join(' ')} fill="none" stroke={c.accent}
        strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.level)} r={i === pts.length - 1 ? 5 : 3} fill={c.accent} />)}
      <SvgText x={x(0)} y={H - 6} fill={c.subtle} fontSize={12} fontFamily={font.mono} textAnchor={pts.length === 1 ? 'middle' : 'start'}>
        {shortDate(pts[0].at)}
      </SvgText>
      {pts.length > 1 && <SvgText x={x(pts.length - 1)} y={H - 6} fill={c.subtle} fontSize={12} fontFamily={font.mono} textAnchor="end">
        {shortDate(pts[pts.length - 1].at)}
      </SvgText>}
    </Svg>
  );
}

function Heatmap({ activity }: { activity: Record<string, number> }) {
  const c = useColors();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 19 * 7);
  const weeks: { color: string }[][] = [];
  for (let w = 0; w < 20; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      const n = day > today ? -1 : activity[dayKey(day)] ?? 0;
      col.push({ color: n < 0 ? 'transparent' : c.heat[n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3] });
    }
    weeks.push(col);
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel="Activités par jour sur 20 semaines">
        {weeks.map((col, w) => (
          <View key={w} style={{ gap: 4 }}>
            {col.map((cell, d) => <View key={d} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: cell.color }} />)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
