// Audio and video: text-to-speech, the YouTube player and the podcast player.
// Both players expose the same handle so screens can replay a [start, end) segment of the source.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import type { Material } from './api';
import { PlayIcon, StopIcon } from './icons';
import { font, useColors } from './theme';

/* ---------------- text-to-speech ---------------- */
export function speak(text: string, opts: { rate?: number; onDone?: () => void } = {}) {
  Speech.stop();
  void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  Speech.speak(text, { language: 'en-US', rate: opts.rate ?? 0.95, onDone: opts.onDone, onStopped: opts.onDone });
}
export const stopSpeaking = () => Speech.stop();

/* ---------------- shared handle ---------------- */
export type PlayerHandle = {
  /** Plays [start, end) seconds of the source, then pauses. Resolves when done or stopped. */
  playSegment: (start: number, end: number | null) => Promise<void>;
  seek: (sec: number) => void;
  stop: () => void;
};
type PlayerProps = { onTime?: (sec: number) => void };

/* ---------------- YouTube ----------------
   YouTube's terms require the player to stay visible (at least 200x200 px): it is never hidden.
   For "repeat without text" the screen hides the transcript, not the video. */
export const VideoPlayer = forwardRef<PlayerHandle, PlayerProps & { videoId: string }>(
  function VideoPlayer({ videoId, onTime }, ref) {
    const { width } = useWindowDimensions();
    const player = useRef<YoutubeIframeRef>(null);
    const [playing, setPlaying] = useState(false);
    const segment = useRef<{ end: number; resolve: () => void } | null>(null);

    useEffect(() => {
      if (!playing) return;
      const id = setInterval(async () => {
        const t = await player.current?.getCurrentTime().catch(() => null);
        if (t == null) return;
        onTime?.(t);
        const seg = segment.current;
        if (seg && t >= seg.end) { segment.current = null; setPlaying(false); seg.resolve(); }
      }, 250);
      return () => clearInterval(id);
    }, [playing, onTime]);

    useImperativeHandle(ref, () => ({
      playSegment: (start, end) => new Promise<void>((resolve) => {
        Speech.stop();
        segment.current?.resolve();
        segment.current = { end: end ?? start + 6, resolve };
        player.current?.seekTo(Math.max(0, start - 0.2), true);
        setPlaying(true);
      }),
      seek: (sec) => { player.current?.seekTo(sec, true); setPlaying(true); },
      stop: () => { segment.current?.resolve(); segment.current = null; setPlaying(false); },
    }), []);

    const h = Math.max(200, Math.round(Math.min(width - 32, 720) * 9 / 16));
    return (
      <View style={{ borderRadius: 12, overflow: 'hidden' }}>
        <YoutubePlayer
          ref={player} height={h} videoId={videoId} play={playing}
          onChangeState={(s: string) => {
            if (s === 'playing') setPlaying(true);
            if (s === 'paused' || s === 'ended') { setPlaying(false); segment.current?.resolve(); segment.current = null; }
          }}
          initialPlayerParams={{ preventFullScreen: true, rel: false }}
        />
      </View>
    );
  });

/* ---------------- podcast ---------------- */
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const PodcastPlayer = forwardRef<PlayerHandle, PlayerProps & { audioUrl: string; title: string }>(
  function PodcastPlayer({ audioUrl, title, onTime }, ref) {
    const c = useColors();
    const player = useAudioPlayer({ uri: audioUrl }, { updateInterval: 250 });
    const status = useAudioPlayerStatus(player);
    const segment = useRef<{ end: number; resolve: () => void } | null>(null);

    useEffect(() => {
      onTime?.(status.currentTime);
      const seg = segment.current;
      if (seg && status.currentTime >= seg.end) { segment.current = null; player.pause(); seg.resolve(); }
      if (seg && !status.playing && status.didJustFinish) { segment.current = null; seg.resolve(); }
    }, [status.currentTime, status.playing, status.didJustFinish, onTime, player]);

    useImperativeHandle(ref, () => ({
      playSegment: async (start, end) => {
        Speech.stop();
        segment.current?.resolve();
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
        await player.seekTo(Math.max(0, start - 0.1));
        return new Promise<void>((resolve) => { segment.current = { end: end ?? start + 6, resolve }; player.play(); });
      },
      seek: (sec) => { void player.seekTo(sec).then(() => player.play()); },
      stop: () => { segment.current?.resolve(); segment.current = null; player.pause(); },
    }), [player]);

    const toggle = () => {
      if (status.playing) { segment.current = null; player.pause(); }
      else { void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).then(() => player.play()); }
    };
    return (
      <View style={{ backgroundColor: c.video, padding: 16, gap: 10 }}>
        <Text style={{ color: '#C9D2DB', fontFamily: font.mono, fontSize: 12 }}>PODCAST</Text>
        <Text style={{ color: '#F3F6F9', fontSize: 18, fontWeight: '600' }}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause' : 'Lecture'} onPress={toggle}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F6F9', alignItems: 'center', justifyContent: 'center' }}>
            {status.playing ? <StopIcon color="#15202B" /> : <PlayIcon color="#15202B" />}
          </Pressable>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#3E4A57' }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: '#9FB5D8',
              width: `${status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0}%` }} />
          </View>
          <Text style={{ color: '#C9D2DB', fontFamily: font.mono, fontSize: 12 }}>
            {fmt(status.currentTime)}{status.duration ? ` / ${fmt(status.duration)}` : ''}
          </Text>
        </View>
      </View>
    );
  });

/* ---------------- one component for any material ---------------- */
export const SourcePlayer = forwardRef<PlayerHandle, PlayerProps & { material: Material }>(
  function SourcePlayer({ material, onTime }, ref) {
    if (material.video_id) return <VideoPlayer ref={ref} videoId={material.video_id} onTime={onTime} />;
    if (material.audio_url) return <PodcastPlayer ref={ref} audioUrl={material.audio_url} title={material.title} onTime={onTime} />;
    return null;
  });

/** Plays one exercise item: the real recording when the material has one, else the synthetic voice. */
export function playItem(player: PlayerHandle | null, material: Material, item: { text: string; start: number | null; end: number | null },
  rate?: number): Promise<void> {
  if (player && item.start != null && (material.video_id || material.audio_url) && !rate) {
    return player.playSegment(item.start, item.end);
  }
  return new Promise((resolve) => speak(item.text, { rate, onDone: resolve }));
}
