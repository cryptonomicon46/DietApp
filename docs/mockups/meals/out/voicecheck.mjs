// Local check of the Pawmily voice choice (not committed): config says voice; the toggle shows; 🔊 asks /voice/tts.
import { readFileSync } from 'node:fs';
import { route } from '/home/user/DietApp/scripts/perf/weather.mjs';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const seed = JSON.parse(readFileSync('/home/user/DietApp/scripts/perf/.seeded.json'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true, timezoneId: 'America/Los_Angeles' });
await ctx.route('**/*', route);
await ctx.route('http://localhost:8787/v2/config', async (r) => { const res = await r.fetch(); r.fulfill({ json: { ...(await res.json()), ai: true, voice: true } }); });
await ctx.route('http://localhost:8787/v2/ai/talk/day', (r) => r.fulfill({ json: { answer: 'You have book club at 6 PM.', suggestions: [] } }));
const tts = []; await ctx.route('http://localhost:8787/v2/voice/tts', (r) => { tts.push(r.request().postDataJSON()); r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }); });
await ctx.addInitScript(({ seed }) => { if (!localStorage.getItem('x')) { localStorage.setItem('x', '1'); localStorage.setItem('fam.server', 'http://localhost:8787'); localStorage.setItem('fam.mode', 'live'); localStorage.setItem('fam.token.live', seed.sam); localStorage.setItem('fam.fid', seed.fid); localStorage.setItem('fam.tourSeen', '1'); localStorage.setItem('fam.helloNo', '1'); localStorage.setItem('fam.whatsNew', '2099'); localStorage.setItem('fam.keys', JSON.stringify({ [seed.fid]: seed.k })); localStorage.setItem('fam.talk.seen', '1'); localStorage.setItem('fam.talk.voice', 'off'); } window.__spoken = []; window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } }; Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => window.__spoken.push(u.text), cancel() {}, getVoices: () => [] } }); }, { seed });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const txt = async (sel) => ((await p.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
await p.goto('http://localhost:8098/DietApp/family/#home'); await p.waitForTimeout(5000);
await p.click('.talk-bar'); await p.waitForTimeout(1200);
console.log('HINT before:', await txt('.tk-hint'));
await p.click('[data-talk="voicepick"]'); await p.waitForTimeout(400);
console.log('HINT after pick:', await txt('.tk-hint'), '| LS', await p.evaluate(() => localStorage.getItem('fam.talk.voiceOut')));
await p.fill('#tkText', "What's on today?"); await p.click('.tk-form button[aria-label=Send]'); await p.waitForTimeout(1200);
if (await p.$('[data-talk="dayok"]')) { await p.click('[data-talk="dayok"]'); await p.waitForTimeout(3000); }
await p.click('[data-talk="speak"]'); await p.waitForTimeout(1500);
console.log('TTS asked:', JSON.stringify(tts), '| phone voice used:', JSON.stringify(await p.evaluate(() => window.__spoken)));
await b.close(); console.log('ERRORS', errs);
