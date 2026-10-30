// Free spoken conversation: role plays (job interview, meeting, travel…), voice first.
import * as coach from '../coach.js';
import { getSetting } from '../db.js';
import { $, $$, html, render } from '../ui.js';
import { mountChat } from './chat.js';
import { coachGate } from './gate.js';

export async function mount(view) {
  let cleanup = () => {};
  const level = await getSetting('level');

  const pick = () => {
    cleanup();
    cleanup = () => {};
    render(view, html`<div class="wrap">
      <div class="page-head"><div class="stack" style="gap:4px"><h1>Conversation libre</h1>
        <p>Choisis une situation et parle. Le coach joue son rôle, te répond à voix haute et corrige chacune de tes phrases.</p></div></div>
      <div class="grid3">
        ${coach.SCENARIOS.map((s) => html`<button class="ex-card" type="button" data-sc="${s.key}">
          <span class="skill">Tu es ${s.you}</span><b>${s.label}</b>
          <span>${s.key === 'custom' ? 'Décris toi-même la scène à jouer.' : sceneHint(s.key)}</span></button>`)}
      </div>
      <form class="panel" id="custom" hidden>
        <label class="field">Décris la situation (en français ou en anglais)
          <textarea id="custom-text" rows="2" placeholder="Ex. Je négocie une augmentation avec mon manager"></textarea></label>
        <div class="row"><button class="btn primary" type="submit">Commencer</button></div>
      </form></div>`);
    for (const b of $$('[data-sc]', view)) {
      b.addEventListener('click', () => {
        if (b.dataset.sc === 'custom') { $('#custom', view).hidden = false; $('#custom-text', view).focus(); return; }
        play(coach.SCENARIOS.find((s) => s.key === b.dataset.sc), '');
      });
    }
    $('#custom', view).addEventListener('submit', (e) => {
      e.preventDefault();
      const t = $('#custom-text', view).value.trim();
      if (t) play(coach.SCENARIOS.find((s) => s.key === 'custom'), t);
    });
  };

  const play = (sc, custom) => {
    cleanup();
    render(view, html`<div class="wrap">
      <div class="page-head"><div class="stack" style="gap:4px"><h1>${sc.key === 'custom' ? 'Situation libre' : sc.label}</h1>
        <p>${custom || sceneHint(sc.key)}</p></div>
        <button class="btn" type="button" id="back">Changer de situation</button></div>
      <div id="body"></div></div>`);
    $('#back', view).addEventListener('click', pick);
    const body = $('#body', view);
    cleanup = coachGate(body, () => {
      cleanup = mountChat(body, {
        kind: 'conversation', title: `Conversation · ${sc.label}`, voiceFirst: true, them: themLabel(sc.key),
        first: (onReply) => coach.roleplayTurn(sc, custom, level, [], null, onReply),
        turn: (history, message, onReply) => coach.roleplayTurn(sc, custom, level, history, message, onReply),
        evaluate: (messages, speech) => coach.evaluate(`a spoken role play: ${sc.key === 'custom' ? custom : sc.label}`, messages, speech),
        onRestart: () => play(sc, custom),
      });
    });
  };

  pick();
  return () => cleanup();
}

function sceneHint(key) {
  return {
    interview: 'Présente ton parcours, tes projets data et tes motivations à un recruteur.',
    'hr-call': 'Premier appel avec une recruteuse : motivation, expérience, prétentions, préavis.',
    meeting: 'Fais le point sur ton avancement et explique un retard sur un pipeline.',
    smalltalk: 'Discussion détendue à la machine à café.',
    hotel: 'Un problème avec ta réservation à l’arrivée à New York.',
    restaurant: 'Commander, poser des questions sur le menu, régler l’addition.',
  }[key] ?? '';
}
const themLabel = (key) => ({ interview: 'Recruteur', 'hr-call': 'Recruteuse RH', meeting: 'Manager', smalltalk: 'Collègue', hotel: 'Réception', restaurant: 'Serveur' }[key] ?? 'Partenaire');
