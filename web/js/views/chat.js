// Chat with the coach, by text or by voice. Shared by the content discussion and the free conversation.
import * as ai from '../ai.js';
import * as repo from '../repo.js';
import { Recorder, speak, stopSpeaking, transcribe, warmUpAsr } from '../speech.js';
import { analyseSpeech } from '../textproc.js';
import { $, evaluationHtml, feedbackHtml, html, icon, markup, minutesSince, render, toast } from '../ui.js';

/**
 * opts: {
 *   kind: 'coach' | 'conversation', title, materialId, voiceFirst,
 *   them: label of the other speaker,
 *   first(): Promise<{reply}>, turn(history, message): Promise<{corrections, tip, reply}>,
 *   evaluate(messages, speech): Promise<evaluation>, onRestart()
 * }
 */
export function mountChat(root, opts) {
  const st = { history: [], learner: [], speech: [], busy: false, done: false, autoSpeak: true, started: Date.now() };
  const rec = new Recorder();
  let ctlStop = false;

  render(root, html`
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="composer" id="composer">
      <div class="thinking" id="wait" hidden><span class="dot"></span><span id="wait-t"></span>
        <button class="btn quiet small" type="button" id="halt">Arrêter</button></div>
      ${opts.voiceFirst ? html`<div class="mic-hero">
          <button class="btn primary big" type="button" id="mic-big">${icon.mic}<span>Appuie et parle</span></button>
          <span class="hint" id="mic-hint">Parle en anglais, puis appuie de nouveau pour envoyer.</span>
        </div>` : ''}
      <form class="composer-row" id="form">
        <label class="sr" for="say">Ta réponse</label>
        <textarea id="say" class="input" rows="1" placeholder="${opts.voiceFirst ? 'Ou écris ta réponse…' : 'Écris ta réponse en anglais…'}"></textarea>
        ${opts.voiceFirst ? '' : html`<button class="btn icon" type="button" id="mic" aria-label="Répondre à l’oral">${icon.mic}</button>`}
        <button class="btn primary icon" type="submit" aria-label="Envoyer">${icon.send}</button>
      </form>
      <div class="row between">
        <label class="row tight hint"><input type="checkbox" id="auto" checked> Lire les réponses à voix haute</label>
        <button class="btn quiet small" type="button" id="end" hidden>Terminer et obtenir mon bilan</button>
      </div>
    </div>`);

  const chat = $('#chat', root);
  const add = (view) => { chat.insertAdjacentHTML('beforeend', markup(view)); chat.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const busy = (label) => {
    st.busy = !!label;
    $('#wait', root).hidden = !label;
    $('#wait-t', root).textContent = label || '';
    for (const b of root.querySelectorAll('#form button, #mic-big, #end')) b.disabled = !!label && b.id !== 'halt';
  };
  // (reply bubbles are built live in ask())

  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-speak]');
    if (b) speak(b.dataset.speak);
  });

  async function ask(message, spoken) {
    busy(message ? 'Le coach réfléchit…' : 'Le coach prépare sa première question…');
    ctlStop = false;
    // the corrections slot sits between the learner's message and the reply, filled when they arrive
    if (message) add(html`<div class="fb pending" data-fb><span class="thinking"><span class="dot"></span>Corrections en cours…</span></div>`);
    const slot = message ? [...chat.querySelectorAll('[data-fb]')].pop() : null;
    let live = null, spoke = false;
    // the reply is shown while it is written, and spoken as soon as it is complete
    const onReply = (text, done) => {
      if (ctlStop) return;
      if (!live && text) {
        add(html`<div class="msg them" data-live><span class="who">${opts.them}</span><span data-text></span></div>`);
        live = [...chat.querySelectorAll('[data-live]')].pop();
        busy(message ? 'Le coach vérifie ta phrase…' : 'Le coach termine sa réponse…');
      }
      if (live) live.querySelector('[data-text]').textContent = text;
      if (done && !spoke && text) { spoke = true; if (st.autoSpeak) speak(text); }
    };
    try {
      const r = message ? await opts.turn(st.history, message, onReply) : await opts.first(onReply);
      if (ctlStop) { slot?.remove(); return; }
      if (!live) onReply(r.reply, true);
      live.querySelector('[data-text]').textContent = r.reply;
      live.removeAttribute('data-live');
      live.insertAdjacentHTML('beforeend', markup(html`<div><button class="btn quiet small" type="button" data-speak="${r.reply}">${icon.speaker}Écouter</button></div>`));
      if (!spoke) { spoke = true; if (st.autoSpeak) speak(r.reply); }
      if (message) {
        slot.outerHTML = markup(feedbackHtml(r));
        if (r.corrections.length) {
          const n = await repo.addCorrections(r.corrections, opts.title);
          if (n) import('../main.js').then((m) => m.refreshBadge());
        }
        st.history.push({ role: 'user', content: 'Learner: ' + message });
      }
      st.history.push({ role: 'assistant', content: r.reply });
      maybeSuggestLighter();
    } catch (e) {
      slot?.remove(); live?.remove();
      add(html`<p class="notice">${e.message || 'Le coach n’a pas pu répondre.'}</p>`);
      if (message) { st.learner.pop(); if (spoken) st.speech.pop(); }
    } finally {
      busy(null);
      $('#end', root).hidden = st.learner.length < 2 || st.done;
    }
  }

  // once per conversation: on a slow computer, offer the lighter model
  let suggested = false;
  async function maybeSuggestLighter() {
    if (suggested || !ai.isSlow() || (await ai.getTier()) === 'leger') return;
    suggested = true;
    const wps = Math.round(ai.state.charsPerSec / 6);
    add(html`<div class="notice row between" data-lighter><span>Ton ordinateur écrit environ ${wps} mots par seconde. Le coach « Léger » répond à peu près deux fois plus vite, avec des corrections un peu moins fines.</span>
      <button class="btn small" type="button">Passer en Léger</button></div>`);
    const box = [...chat.querySelectorAll('[data-lighter]')].pop();
    box.querySelector('button').addEventListener('click', async () => {
      box.innerHTML = markup(html`<span class="thinking"><span class="dot"></span>Chargement du coach Léger…</span>`);
      await ai.setTier('leger');
      try { await ai.load(); box.textContent = 'Coach Léger chargé : les prochaines réponses seront plus rapides.'; }
      catch (err) { box.textContent = err.message; }
    });
  }

  function send(text, spoken) {
    const t = text.trim();
    if (!t || st.busy || st.done) return;
    stopSpeaking();
    $('#say', root).value = '';
    st.learner.push(t);
    if (spoken) st.speech.push(spoken);
    add(html`<div class="msg me">${t}</div>`);
    ask(t, spoken);
  }

  async function toggleMic() {
    const bigLabel = $('#mic-big span', root);
    const btn = $('#mic-big', root) ?? $('#mic', root);
    if (!rec.recording) {
      try { await rec.start(); } catch (e) { toast(e.message, 'bad'); return; }
      btn.classList.add('rec');
      btn.innerHTML = markup(icon.stop) + (bigLabel ? '<span>J’ai fini</span>' : '');
      btn.setAttribute('aria-label', 'Arrêter et envoyer');
      return;
    }
    btn.classList.remove('rec');
    btn.innerHTML = markup(icon.mic) + (bigLabel ? '<span>Appuie et parle</span>' : '');
    btn.setAttribute('aria-label', 'Répondre à l’oral');
    busy('Je transcris ce que tu as dit…');
    try {
      const take = await rec.stop();
      const r = await transcribe(take.audio, { words: true });
      busy(null);
      if (!r.text.trim()) { toast('Je n’ai rien entendu. Réessaie plus près du micro.'); return; }
      const a = analyseSpeech(r.text, r.text, r.words);
      send(r.text, { wpm: a.wpm, pauses: a.pauses.length });
    } catch (e) {
      busy(null);
      toast(e.message, 'bad');
    }
  }

  $('#form', root).addEventListener('submit', (e) => { e.preventDefault(); send($('#say', root).value); });
  $('#say', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); } });
  $('#say', root).addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; });
  ($('#mic-big', root) ?? $('#mic', root))?.addEventListener('click', toggleMic);
  $('#auto', root).addEventListener('change', (e) => { st.autoSpeak = e.target.checked; if (!st.autoSpeak) stopSpeaking(); });
  $('#halt', root).addEventListener('click', () => { ctlStop = true; ai.interrupt(); busy(null); });
  $('#end', root).addEventListener('click', async () => {
    stopSpeaking();
    busy('Évaluation de ton niveau…');
    try {
      const sp = st.speech.filter((s) => s.wpm);
      const speech = sp.length ? { wpm: Math.round(sp.reduce((a, s) => a + s.wpm, 0) / sp.length), pauses: sp.reduce((a, s) => a + s.pauses, 0) } : null;
      const ev = await opts.evaluate(st.learner, speech);
      await repo.addSession({ kind: opts.kind, materialId: opts.materialId ?? null, title: opts.title, score: ev.score, level: ev.level,
        minutes: minutesSince(st.started), messages: st.learner.length, wpm: speech?.wpm ?? null });
      st.done = true;
      add(evaluationHtml(ev));
      add(html`<div class="row"><button class="btn" type="button" id="again">Recommencer</button></div>`);
      $('#again', root).addEventListener('click', () => opts.onRestart());
      $('#composer', root).hidden = true;
    } catch (e) {
      add(html`<p class="notice">${e.message}</p>`);
    } finally { busy(null); if (st.done) $('#end', root).hidden = true; }
  });

  if (opts.voiceFirst) warmUpAsr();
  ask(null);
  return () => { rec.cancel(); stopSpeaking(); ctlStop = true; };
}

