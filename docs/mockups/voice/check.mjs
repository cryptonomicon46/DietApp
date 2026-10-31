// Local check of Pawmily Voice Phase 1 (run against scripts/perf/pages.mjs on :8098 and `wrangler dev` on :8787
// with fake ELEVENLABS_* vars). The connector's voice settings are real; Claude's answer and the audio are stubbed.
// node docs/mockups/voice/check.mjs [width] [dark]
import { readFileSync } from 'node:fs';
import { route } from '../../../scripts/perf/weather.mjs';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const seed = JSON.parse(readFileSync(new URL('../../../scripts/perf/.seeded.json', import.meta.url)));
const W = +(process.argv[2] || 390), DARK = process.argv[3] === 'dark', S = new URL('./', import.meta.url).pathname, tag = `${W}${DARK ? '-dark' : ''}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true, timezoneId: 'America/Los_Angeles', colorScheme: DARK ? 'dark' : 'light' });
await ctx.route('**/*', route);
await ctx.route('http://localhost:8787/v2/config', async (r) => { const res = await r.fetch(); r.fulfill({ json: { ...(await res.json()), ai: true } }); });
const dayBodies = [], tts = [];
let spoken = { text: 'It will be 62°F and dry at 2 PM.', ticket: 'stub.ticket' };
await ctx.route('http://localhost:8787/v2/ai/talk/day', (r) => { const body = r.request().postDataJSON(); dayBodies.push(body); r.fulfill({ json: { answer: 'You have book club at 6 PM. It will be 62°F and dry at 2 PM.', suggestions: [], ...(body.voice ? { spoken, voicePrivate: spoken ? null : 'policy' } : {}) } }); });
let ttsReply = 'audio';
await ctx.route('http://localhost:8787/v2/voice/tts', (r) => { tts.push(r.request().postDataJSON()); if (ttsReply === 'audio') r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }); else r.fulfill({ status: 503, json: { error: 'Using device voice for now.', private: true, fallback: true } }); });
await ctx.addInitScript(({ seed }) => {
  if (!localStorage.getItem('x')) { localStorage.setItem('x', '1'); localStorage.setItem('fam.server', 'http://localhost:8787'); localStorage.setItem('fam.mode', 'live'); localStorage.setItem('fam.token.live', seed.sam); localStorage.setItem('fam.fid', seed.fid); localStorage.setItem('fam.tourSeen', '1'); localStorage.setItem('fam.helloNo', '1'); localStorage.setItem('fam.whatsNew', '2099'); localStorage.setItem('fam.keys', JSON.stringify({ [seed.fid]: seed.k })); localStorage.setItem('fam.talk.seen', '1'); localStorage.setItem('fam.talk.voice', 'off'); localStorage.setItem(`fam.talk.dayok4.${seed.fid}.x`, '1'); }
  window.__spoken = []; window.__played = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => window.__spoken.push(u.text), cancel() {}, getVoices: () => [] } });
  HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.slice(0, 5)); return Promise.resolve(); };
}, { seed });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/50[123]|404|favicon/.test(m.text())) errs.push('console: ' + m.text()); });
const txt = async (sel) => ((await p.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const wide = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || (document.querySelector('#sheet')?.open && document.querySelector('#sheet').scrollWidth > document.querySelector('#sheet').clientWidth + 1));
const ask = async (q = "What's my day like today?") => { await p.fill('#tkText', q); await p.click('.tk-form button[aria-label=Send]'); await p.waitForTimeout(1500); if (await p.$('[data-talk="dayok"]')) { await p.click('[data-talk="dayok"]'); } await p.waitForTimeout(3500); };
const vset = async () => { await p.click('[data-talk="vset"]'); await p.waitForTimeout(1200); };
const cloudReqs = () => p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /voiceCloud\.js/.test(e.name)).length);

await p.goto('http://localhost:8098/DietApp/family/#home'); await p.waitForTimeout(5000);
await p.click('.talk-bar'); await p.waitForTimeout(1500);
console.log('1 HINT:', await txt('.tk-hint'));
// A. Cloud voice OFF (the default): Talk answers; no provenance sent; no tts; the cloud provider never loaded.
await ask();
console.log('A answer:', await txt('.tk-answer'), '| voice sent:', !!dayBodies.at(-1)?.voice);
await p.click('[data-talk="speak"]'); await p.waitForTimeout(800);
console.log('A 🔊 → phone said:', JSON.stringify(await p.evaluate(() => window.__spoken.at(-1))), '| tts calls:', tts.length, '| voiceCloud.js loaded:', await cloudReqs());
await vset();
console.log('B settings (off):', (await txt('#tkOut')).slice(0, 400));
await p.screenshot({ path: `${S}${tag}-1-settings-off.png`, fullPage: false });
if (await wide()) console.log('OVERFLOW settings');
await p.evaluate(() => document.querySelector('.tk-vset')?.scrollIntoView({ block: 'end' })); await p.waitForTimeout(300);
await p.screenshot({ path: `${S}${tag}-2-settings-family.png` });
// C. The creator switches Cloud voice on; ticks Weather; chooses Pawmily Voice.
await p.check('[data-talkv="admin"]'); await p.waitForTimeout(1500);
await p.check('[data-talkv="cat:weather"]'); await p.waitForTimeout(1500);
await p.check('input[data-talkv="mode"][value="cloud"]'); await p.waitForTimeout(500);
const st = await p.evaluate(async ({ fid, tok }) => (await fetch(`http://localhost:8787/v2/families/${fid}/voice`, { headers: { Authorization: `Bearer ${tok}` } })).json(), { fid: seed.fid, tok: seed.sam });
console.log('C stored:', JSON.stringify({ ready: st.ready, cloud: st.admin.cloud, weather: st.prefs.cats.weather, health: st.prefs.cats.health }), '| choice:', await p.evaluate(() => localStorage.getItem('fam.talk.voiceOut')));
await p.evaluate(() => document.querySelector('#sheet .tk-vset')?.scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
await p.screenshot({ path: `${S}${tag}-3-settings-on.png` });
// D. A day question now carries provenance; the answer is labelled; 🔊 plays the ticketed sentence once, then replays without a new request.
await p.click('[data-talk="vback"]'); await p.waitForTimeout(800);
await ask();
const vb = dayBodies.at(-1);
console.log('D sent voice facts:', vb.voice?.facts?.length, 'domains', JSON.stringify([...new Set((vb.voice?.facts || []).map((f) => f.d))]), '| fid sent:', !!vb.fid, '| context has voiceFacts:', /voiceFacts/.test(vb.context));
console.log('D label:', await txt('.tk-voice'));
await p.click('[data-talk="speak"]'); await p.waitForTimeout(1200); await p.click('[data-talk="speak"]'); await p.waitForTimeout(800);
console.log('D tts bodies:', JSON.stringify(tts), '| played:', JSON.stringify(await p.evaluate(() => window.__played.filter((x) => x === 'blob:'))), '| voiceCloud.js loaded:', await cloudReqs());
await p.screenshot({ path: `${S}${tag}-4-answer-cloud.png` });
// E. Nothing allowed for this answer → no ticket → the phone reads the whole answer.
spoken = null; await ask();
console.log('E label:', await txt('.tk-voice'));
const before = tts.length; await p.click('[data-talk="speak"]'); await p.waitForTimeout(800);
console.log('E tts calls added:', tts.length - before, '| phone said:', JSON.stringify(await p.evaluate(() => window.__spoken.at(-1))));
await p.screenshot({ path: `${S}${tag}-5-answer-private.png` });
// F. Budget/quota → the connector says fallback → toast, and the phone reads it.
spoken = { text: 'Dry at 2 PM.', ticket: 'stub.t2' }; ttsReply = 'fallback'; await ask();
await p.click('[data-talk="speak"]'); await p.waitForTimeout(1200);
console.log('F toast:', await txt('#toast, .toast'), '| phone said:', JSON.stringify(await p.evaluate(() => window.__spoken.at(-1))));
// Put the family back to OFF for the next run.
await p.evaluate(async ({ fid, tok }) => { for (const [w, b] of [['admin', { cloud: false }], ['prefs', { prefs: { cats: {} } }]]) await fetch(`http://localhost:8787/v2/families/${fid}/voice/${w}`, { method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); }, { fid: seed.fid, tok: seed.sam });
await b.close(); console.log('ERRORS', errs);
