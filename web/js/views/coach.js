// Discussion with the coach about the content being practised.
import * as coach from '../coach.js';
import * as repo from '../repo.js';
import { $, html, render } from '../ui.js';
import { mountChat } from './chat.js';
import { coachGate } from './gate.js';

export async function mount(view) {
  const material = await repo.current();
  let cleanup = () => {};
  const start = () => {
    cleanup();
    render(view, html`<div class="wrap">
      <div class="page-head"><div class="stack" style="gap:4px"><h1>Discussion avec le coach</h1>
        <p>${material ? html`Sur : <b>${material.title}</b>. Le coach te pose des questions, corrige chaque réponse et t’évalue à la fin.` : ''}</p></div></div>
      <div id="body"></div></div>`);
    const body = $('#body', view);
    if (!material) {
      render(body, html`<section class="panel"><h2>Pas encore de contenu</h2>
        <p class="muted">Le coach discute du contenu que tu viens de travailler. Choisis-en un d’abord, ou entraîne-toi en conversation libre.</p>
        <div class="row"><a class="btn primary" href="#nouveau">Ajouter un contenu</a><a class="btn" href="#conversation">Conversation libre</a></div></section>`);
      return;
    }
    cleanup = coachGate(body, () => {
      cleanup = mountChat(body, {
        kind: 'coach', title: material.title, materialId: material.id, them: 'Coach',
        first: (onReply) => coach.contentTurn(material, [], null, onReply),
        turn: (history, message, onReply) => coach.contentTurn(material, history, message, onReply),
        evaluate: (messages, speech) => coach.evaluate(`a discussion about the content "${material.title}"`, messages, speech),
        onRestart: start,
      });
    });
  };
  start();
  return () => cleanup();
}
