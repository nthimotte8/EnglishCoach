// Builds the right player for a content: YouTube video, or audio (podcast URL or imported file).
import { AudioPlayer, YouTubePlayer } from '../players.js';
import { $, html, icon } from '../ui.js';

export const hasMedia = (m) => !!(m.videoId || m.audioUrl || m.audioBlob);

export function mediaHtml(m, { title = true } = {}) {
  const kind = m.source === 'youtube' ? 'Vidéo YouTube' : m.source === 'podcast' ? 'Podcast' : m.source === 'file' ? 'Fichier importé'
    : m.source === 'theme' ? `Thème · ${m.theme ?? ''}` : m.source === 'example' ? 'Exemple' : 'Texte';
  return html`
    ${m.videoId ? html`<div class="video"><div id="yt"></div></div>` : ''}
    <div class="stage">
      <span class="kind">${kind}</span>
      ${title ? html`<h1>${m.title}</h1>` : ''}
      ${m.videoId ? html`<a class="hint" style="color:var(--stage-fg)" href="https://www.youtube.com/watch?v=${m.videoId}" target="_blank" rel="noopener">${icon.external} Ouvrir sur YouTube</a>` : ''}
    </div>
    ${m.audioUrl || m.audioBlob ? html`<div class="audio-bar"><audio id="audio" controls preload="metadata"></audio></div>` : ''}`;
}

/** Creates the player once mediaHtml() is in the DOM. Returns {player, destroy}. */
export function mountMedia(root, m) {
  if (m.videoId) {
    const p = new YouTubePlayer($('#yt', root), m.videoId);
    p.ready.catch(() => { const box = $('.video', root); if (box) box.innerHTML = '<p class="notice" style="position:static;margin:16px">Le lecteur YouTube n’a pas pu se charger (connexion ?).</p>'; });
    return { player: p, destroy: () => p.destroy() };
  }
  const el = $('#audio', root);
  if (!el) return { player: null, destroy: () => {} };
  let url = m.audioUrl;
  if (m.audioBlob) url = URL.createObjectURL(m.audioBlob);
  el.src = url;
  const p = new AudioPlayer(el);
  return { player: p, destroy: () => { p.destroy(); if (m.audioBlob) URL.revokeObjectURL(url); } };
}
