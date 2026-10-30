// Settings: coach size, model cache, speech recognition, voice, backup and reset.
import * as ai from '../ai.js';
import * as db from '../db.js';
import { onAsrProgress, preloadAsr, speak } from '../speech.js';
import { $, $$, html, render, toast } from '../ui.js';

export async function mount(view) {
  const tier = await ai.getTier();
  const gpu = await ai.webgpuInfo();
  let offState = () => {};

  render(view, html`<div class="wrap">
    <div class="page-head"><div class="stack" style="gap:4px"><h1>Réglages</h1>
      <p>Tout fonctionne dans ce navigateur. Les modèles d’IA sont téléchargés une fois puis gardés en cache, ce qui permet de s’entraîner hors ligne.</p></div></div>

    <section class="panel">
      <h2>Niveau du coach</h2>
      ${gpu.ok ? '' : html`<p class="notice">${gpu.reason}</p>`}
      <p class="muted">Un modèle plus gros corrige mieux et évalue ton niveau plus finement, mais il demande plus de mémoire graphique et répond plus lentement.</p>
      <div class="stack" style="gap:8px" role="radiogroup" aria-label="Niveau du coach">
        ${ai.TIERS.map((t) => html`<label class="tier"><input type="radio" name="tier" value="${t.key}" ${t.key === tier ? 'checked' : ''}>
          <span class="stack" style="gap:2px"><b>${t.label}</b><span class="hint">${t.hint}</span><span class="hint mono" data-model="${t.key}"></span></span></label>`)}
      </div>
      <div class="row"><button class="btn primary" type="button" id="load">Charger le coach</button>
        <button class="btn danger" type="button" id="del">Supprimer ce modèle du cache</button></div>
      <div id="model-state" class="hint" aria-live="polite"></div>
    </section>

    <section class="panel">
      <h2>Reconnaissance vocale</h2>
      <p class="muted">Whisper (OpenAI, open source) transcrit ta voix et les fichiers audio directement dans le navigateur. Il se télécharge (~150 Mo) à la première utilisation.</p>
      <div class="row"><button class="btn" type="button" id="asr">Télécharger maintenant</button><span class="hint" id="asr-state"></span></div>
    </section>

    <section class="panel">
      <h2>Voix de lecture</h2>
      <p class="muted">Les textes et les réponses du coach sont lus par une voix anglaise de ton système. Sous Windows et dans Chrome, les voix « Natural » ou « Google » sont les plus naturelles.</p>
      <div class="row"><button class="btn" type="button" id="voice">Tester la voix</button></div>
    </section>

    <section class="panel">
      <h2>Mes données</h2>
      <p class="muted">Contenus, progression et carnet sont enregistrés dans ce navigateur uniquement. Sauvegarde-les pour les retrouver sur un autre ordinateur ou après avoir vidé le navigateur.</p>
      <div class="row">
        <button class="btn" type="button" id="export">Exporter une sauvegarde</button>
        <label class="btn" for="import-file">Restaurer une sauvegarde</label><input type="file" id="import-file" accept="application/json,.json" class="sr">
        <button class="btn danger" type="button" id="reset">Tout effacer</button>
      </div>
      <p class="hint">Les fichiers audio importés ne sont pas inclus dans la sauvegarde ; leurs transcriptions, si.</p>
    </section>
  </div>`);

  // show which concrete model each tier maps to
  if (gpu.ok) {
    for (const t of ai.TIERS) {
      ai.resolveTier(t.key).then((r) => { const el = $(`[data-model="${t.key}"]`, view); if (el) el.textContent = `${r.id}${r.vramMB ? ` · ${Math.round(r.vramMB / 100) / 10} Go de mémoire graphique` : ''}`; }).catch(() => {});
    }
  }

  const stateLine = $('#model-state', view);
  const paintState = async () => {
    const s = ai.state;
    const cached = await ai.isCached();
    stateLine.textContent = s.status === 'loading' ? `${s.text} ${Math.round(s.progress * 100)} %`
      : s.status === 'ready' || s.status === 'thinking' ? `Chargé : ${s.modelId}`
      : s.status === 'error' ? s.error
      : cached ? 'Téléchargé, pas encore chargé.' : 'Pas encore téléchargé.';
  };
  offState = ai.onState(() => { paintState(); });

  for (const r of $$('input[name="tier"]', view)) r.addEventListener('change', async () => { await ai.setTier(r.value); paintState(); });
  $('#load', view).addEventListener('click', () => ai.load().catch(() => {}));
  $('#del', view).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmer la suppression'; return; }
    try { await ai.deleteCached(await ai.getTier()); toast('Modèle supprimé du cache.'); } catch (err) { toast(err.message, 'bad'); }
    b.dataset.confirm = ''; b.textContent = 'Supprimer ce modèle du cache'; paintState();
  });

  $('#asr', view).addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    const off = onAsrProgress((p) => { $('#asr-state', view).textContent = `${Math.round(p.progress * 100)} %`; });
    try { await preloadAsr(); $('#asr-state', view).textContent = 'Prêt.'; } catch (err) { $('#asr-state', view).textContent = err.message; b.disabled = false; }
    off();
  });
  $('#voice', view).addEventListener('click', () => speak('Hi! I am your English coach. Shall we practise together today?'));

  $('#export', view).addEventListener('click', async () => {
    const data = await db.exportAll();
    for (const m of data.materials) delete m.audioBlob;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `english-coach-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  $('#import-file', view).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await db.importAll(JSON.parse(await f.text())); toast('Sauvegarde restaurée.', 'good'); location.hash = '#progression'; }
    catch (err) { toast(err.message || 'Fichier illisible.', 'bad'); }
  });
  $('#reset', view).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmer : tout effacer'; return; }
    await db.clearAll(); toast('Toutes tes données ont été effacées.'); location.hash = '#pratiquer';
  });

  return () => offState();
}
