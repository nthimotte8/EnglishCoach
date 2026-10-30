// End-to-end walk through the app with the AI models replaced by fakes (no GPU or download needed).
// Usage: python3 -m http.server 8123 -d web &  node web/tests/e2e.mjs [outDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8123/';
const OUT = process.argv[2] ?? '/tmp';
const MOCK = () => {
  const keys = (s) => Object.keys(s.properties ?? {});
  globalThis.__EC_MOCK__ = {
    cached: true,
    podcasts: {
      async search(term) {
        return [{ id: 1, title: term.includes('6 Minute') ? '6 Minute English' : 'Data Talks', author: 'BBC', artwork: null, genre: 'Education', feedUrl: null, count: 2 }];
      },
      async episodes() {
        return [{ title: 'Is AI changing work?', audioUrl: 'https://podcasts.example.invalid/ep1.mp3', duration: 370, published: '2026-10-20', description: 'Neil and Beth talk about AI.' }];
      },
    },
    async llm(messages, schema) {
      await new Promise((r) => setTimeout(r, 120));
      const k = keys(schema);
      const last = messages[messages.length - 1].content;
      if (k.includes('reply')) {
        return last.startsWith('Learner:')
          ? { corrections: [{ original: 'I has learned', better: 'I have learned', why: 'Avec « I », on utilise « have ».' }], tip: 'Essaie « I’ve come to realise ».', reply: 'Interesting! Can you give me an example from your own life?' }
          : { corrections: [], tip: '', reply: 'What was the main idea of the video, in your own words?' };
      }
      if (k.includes('sentences')) return { title: 'Remote work', sentences: ['Working from home changed my life.', 'I save two hours every day.', 'But I miss my colleagues a lot.', 'So I go to the office on Fridays.'] };
      if (k.includes('strengths')) return { level: 'B2', score: 71, strengths: ['Bon vocabulaire'], work_on: ['Les temps du passé'], summary: 'Bon niveau, attention aux accords.' };
      if (k.includes('meaning_fr')) return { meaning_fr: 'cerveau', example: 'Your brain needs sleep.' };
      if (k.includes('level')) return { level: 'B2' };
      throw new Error('unexpected schema ' + k);
    },
    async asr() {
      await new Promise((r) => setTimeout(r, 150));
      const said = ['So', 'today', 'I', 'want', 'to', 'um', 'talk', 'about', 'habits.'];
      let t = 0;
      const words = said.map((w, i) => { const start = t + (i === 6 ? 1.2 : 0.05); t = start + 0.3; return { word: ' ' + w, start, end: t }; });
      return { text: said.join(' '), words };
    },
  };
};

const errors = [];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['microphone'] });
await ctx.addInitScript(MOCK);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|youtube|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(name); } };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

await page.goto(BASE + '#pratiquer');
await step('welcome page', async () => { await page.getByRole('heading', { name: 'Bienvenue' }).waitFor({ timeout: 5000 }); await shot('01-welcome'); });
await step('example content', async () => {
  await page.getByRole('button', { name: 'Essayer avec un exemple' }).click();
  await page.getByText('How habits are formed').first().waitFor();
  await page.locator('.tline').nth(9).waitFor();
});
await step('click a word adds it to the notebook', async () => {
  await page.locator('[data-w="brain."]').click();
  await page.getByText('« brain » ajouté à ton carnet.').waitFor();
  await page.locator('[data-nav="vocabulaire"] .badge').waitFor();
  await shot('02-practice');
});
await step('dictation exercise end to end', async () => {
  await page.getByRole('link', { name: /Dictée/ }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('#dict').fill('So today I want to talk about habits');
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await page.locator('#res .chip').waitFor();
    await page.locator('#next').click();
  }
  await page.getByRole('heading', { name: 'Exercice terminé' }).waitFor();
});
await step('cloze exercise', async () => {
  await page.goto(BASE + '#exercice-trous');
  await page.locator('.cloze input').first().fill('xxx');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await page.locator('#res .chip').waitFor();
});
await step('recognition exercise', async () => {
  await page.goto(BASE + '#exercice-reco');
  await page.locator('.choice').first().click();
  await page.locator('#res .chip').waitFor();
});
await step('read aloud with pronunciation report', async () => {
  await page.goto(BASE + '#exercice-lecture');
  await page.locator('#rec').click();
  await page.waitForTimeout(700);
  await page.locator('#rec').click();
  await page.locator('.timeline').waitFor({ timeout: 8000 });
  await page.locator('.compare audio').waitFor();
  await page.getByText(/hésitation/).waitFor();
  await shot('03-pronunciation');
  await page.getByRole('button', { name: 'Ajouter ces mots au carnet' }).click().catch(() => {});
});
await step('coach discussion with corrections and evaluation', async () => {
  await page.goto(BASE + '#coach');
  await page.getByRole('button', { name: /Charger le coach/ }).click();
  await page.getByText('What was the main idea').waitFor();
  for (const msg of ['I has learned that habits save energy', 'I has learned to change my routine']) {
    await page.locator('#say').fill(msg);
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await page.getByText('Interesting!').last().waitFor();
  }
  await page.locator('.fb').first().waitFor();
  await page.getByRole('button', { name: 'Terminer et obtenir mon bilan' }).click();
  await page.getByRole('heading', { name: 'Bilan' }).waitFor();
  await shot('04-coach');
});
await step('free conversation by voice', async () => {
  await page.goto(BASE + '#conversation');
  await page.getByRole('button', { name: /Entretien d’embauche/ }).click();
  await page.getByText('What was the main idea').waitFor();
  await page.locator('#mic-big').click();
  await page.waitForTimeout(600);
  await page.locator('#mic-big').click();
  await page.locator('.msg.me').waitFor();
  await page.getByText('Interesting!').waitFor();
  await shot('05-conversation');
});
await step('vocabulary review', async () => {
  await page.goto(BASE + '#vocabulaire');
  await page.locator('.flash').waitFor();
  await shot('06-review');
  await page.getByRole('button', { name: 'Afficher la réponse' }).click();
  await page.locator('[data-grade="2"]').click();
});
await step('notebook add + explain', async () => {
  await page.goto(BASE + '#vocabulaire-carnet');
  await page.locator('#front').fill('to catch up on');
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await page.getByText('to catch up on').waitFor();
  await shot('07-notebook');
});
await step('theme text generation', async () => {
  await page.goto(BASE + '#nouveau');
  await page.getByRole('button', { name: 'Thème' }).click();
  await page.getByRole('button', { name: 'Générer le texte' }).click();
  await page.getByRole('heading', { name: 'Remote work' }).waitFor();
});
await step('youtube + pasted transcript form validates', async () => {
  await page.goto(BASE + '#nouveau');
  await page.getByRole('button', { name: 'YouTube' }).click();
  await page.locator('#url').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.locator('#text').fill('0:01\nHello and welcome to the channel.\n0:04\nToday we talk about habits.\n0:08\nLet us get started now.');
  await page.getByRole('button', { name: 'Charger' }).click();
  await page.locator('.tline').nth(2).waitFor();
});
await step('podcast suggestions, search and episode fallback', async () => {
  await page.goto(BASE + '#nouveau');
  await page.getByText('Suggestions pour ton niveau (B2)').waitFor();
  await page.getByRole('button', { name: 'Tech et data' }).click();
  await page.locator('[data-sug]').first().waitFor();
  await page.getByRole('button', { name: 'Tous' }).click();
  await page.locator('[data-sug]').filter({ hasText: '6 Minute English' }).click();
  await page.getByRole('heading', { name: '6 Minute English' }).waitFor();
  await page.locator('#q').fill('data');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.locator('[data-show]').first().click();
  await page.getByRole('heading', { name: 'Data Talks' }).waitFor();
  await page.locator('[data-ep]').first().click();
  await page.getByRole('link', { name: 'Télécharger l’épisode' }).waitFor({ timeout: 15000 });
  await shot('12-podcasts');
});
await step('progress dashboard', async () => {
  await page.goto(BASE + '#progression');
  await page.locator('svg.chart').waitFor();
  await page.getByText('Discussion avec le coach').first().waitFor();
  await shot('08-progress');
});
await step('settings + export', async () => {
  await page.goto(BASE + '#reglages');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter une sauvegarde' }).click()]);
  const data = JSON.parse(await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
  if (data.app !== 'english-coach' || !data.sessions.length) throw new Error('bad export');
  await shot('09-settings');
});

// phone width + dark theme
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', permissions: ['microphone'] });
await phone.addInitScript(MOCK);
const p2 = await phone.newPage();
p2.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
await p2.goto(BASE + '#pratiquer');
await p2.getByRole('button', { name: 'Essayer avec un exemple' }).click();
await p2.locator('.tline').first().waitFor();
const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(overflow > 0 ? `FAIL phone horizontal overflow ${overflow}px` : 'ok   phone has no horizontal scroll');
if (overflow > 0) errors.push('overflow');
await p2.screenshot({ path: `${OUT}/10-phone-dark.png`, fullPage: true });
await p2.goto(BASE + '#vocabulaire-carnet');
await p2.screenshot({ path: `${OUT}/11-phone-vocab.png`, fullPage: true });

await browser.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n` + errors.join('\n') : '\nall e2e checks passed');
process.exit(errors.length ? 1 : 0);
