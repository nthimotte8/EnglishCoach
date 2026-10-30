// Players for the source material: YouTube (IFrame API) and audio files/podcasts (<audio>).
// Both expose the same interface so exercises can replay a [start, end) segment of the original.
import { speak, stopSpeaking } from './speech.js';

let ytReady = null;
function loadYouTubeApi() {
  if (globalThis.YT?.Player) return Promise.resolve();
  if (!ytReady) {
    ytReady = new Promise((resolve, reject) => {
      const prev = globalThis.onYouTubeIframeAPIReady;
      globalThis.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytReady = null; reject(new Error('Le lecteur YouTube ne se charge pas (hors ligne ?).')); };
      document.head.append(s);
    });
  }
  return ytReady;
}

class BasePlayer {
  constructor() { this.segment = null; this.timer = null; this.onTime = null; }
  tick(t) {
    this.onTime?.(t);
    if (this.segment && t >= this.segment.end) { const s = this.segment; this.segment = null; this.pause(); s.resolve(); }
  }
  /** Plays [start, end) then pauses; resolves when done or stopped. */
  playSegment(start, end) {
    stopSpeaking();
    this.segment?.resolve();
    return new Promise((resolve) => {
      this.segment = { end: end ?? start + 6, resolve };
      this.seek(Math.max(0, start - 0.15), true);
    });
  }
  stop() { this.segment?.resolve(); this.segment = null; this.pause(); }
}

export class YouTubePlayer extends BasePlayer {
  constructor(el, videoId) {
    super();
    this.ready = loadYouTubeApi().then(() => new Promise((resolve) => {
      this.yt = new globalThis.YT.Player(el, {
        videoId, width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0 },
        events: {
          onReady: () => resolve(),
          onStateChange: (e) => {
            const playing = e.data === 1;
            clearInterval(this.timer);
            if (playing) this.timer = setInterval(() => this.tick(this.yt.getCurrentTime()), 200);
            else if ((e.data === 2 || e.data === 0) && this.segment) { const s = this.segment; this.segment = null; s.resolve(); }
          },
        },
      });
    }));
  }
  async seek(sec, play = true) { await this.ready; this.yt.seekTo(sec, true); if (play) this.yt.playVideo(); }
  pause() { this.yt?.pauseVideo?.(); }
  destroy() { clearInterval(this.timer); this.segment?.resolve(); this.yt?.destroy?.(); }
}

export class AudioPlayer extends BasePlayer {
  constructor(audioEl) {
    super();
    this.audio = audioEl;
    this.audio.addEventListener('timeupdate', () => this.tick(this.audio.currentTime));
    this.audio.addEventListener('pause', () => { if (this.segment && this.audio.currentTime < this.segment.end - 0.3) { const s = this.segment; this.segment = null; s.resolve(); } });
    this.audio.addEventListener('ended', () => { const s = this.segment; this.segment = null; s?.resolve(); });
    // timeupdate fires ~4×/s: poll faster while a short segment plays for a cleaner stop
    this.audio.addEventListener('play', () => { clearInterval(this.timer); this.timer = setInterval(() => { if (this.segment) this.tick(this.audio.currentTime); }, 80); });
  }
  seek(sec, play = true) { this.audio.currentTime = sec; if (play) this.audio.play().catch(() => {}); }
  pause() { this.audio.pause(); }
  destroy() { clearInterval(this.timer); this.segment?.resolve(); this.audio.pause(); }
}

/** Plays one exercise item: the original recording when there is one, else the synthetic voice. */
export function playItem(player, item, { slow = false } = {}) {
  if (player && item.start != null && !slow) return player.playSegment(item.start, item.end);
  return speak(item.text, { rate: slow ? 0.75 : 1 });
}
