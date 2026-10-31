// Local check of the simpler meal logging (not committed): Health row → Something else → each way.
import { readFileSync } from 'node:fs';
import { route } from '/home/user/DietApp/scripts/perf/weather.mjs';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const seed = JSON.parse(readFileSync('/home/user/DietApp/scripts/perf/.seeded.json'));
const W = +(process.argv[2] || 390), DARK = process.argv[3] === 'dark', S = '/home/user/DietApp/docs/mockups/meals/out/', tag = `real-${W}${DARK ? '-dark' : ''}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true, timezoneId: 'America/Los_Angeles', colorScheme: DARK ? 'dark' : 'light' });
await ctx.route('**/*', route);
await ctx.route('http://localhost:8787/v2/config', async (r) => { const res = await r.fetch(); r.fulfill({ json: { ...(await res.json()), ai: true } }); });
await ctx.addInitScript(({ seed }) => { if (!localStorage.getItem('x')) { localStorage.setItem('x', '1'); localStorage.setItem('fam.server', 'http://localhost:8787'); localStorage.setItem('fam.mode', 'live'); localStorage.setItem('fam.token.live', seed.sam); localStorage.setItem('fam.fid', seed.fid); localStorage.setItem('fam.tourSeen', '1'); localStorage.setItem('fam.helloNo', '1'); localStorage.setItem('fam.whatsNew', '2099'); localStorage.setItem('fam.keys', JSON.stringify({ [seed.fid]: seed.k })); localStorage.setItem('fam.talk.seen', '1'); localStorage.setItem('fam.talk.voice', 'off'); } }, { seed });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/50[12]|404|favicon/.test(m.text())) errs.push('console: ' + m.text()); });
const txt = async (sel) => ((await p.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const wide = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || (document.querySelector('#sheet')?.open && document.querySelector('#sheet').scrollWidth > document.querySelector('#sheet').clientWidth + 1));
await p.goto('http://localhost:8098/DietApp/family/#health'); await p.waitForTimeout(5000);
const acts = await p.$eval('.hl-row2 .hl-acts', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => 'none');
console.log('ROW buttons:', acts); await p.screenshot({ path: `${S}${tag}-1-row.png` });
const other = await p.$('[data-ml^="other:"]'); await other.click(); await p.waitForTimeout(1200);
console.log('OTHER sheet:', (await txt('#sheetBody')).slice(0, 300)); await p.screenshot({ path: `${S}${tag}-2-other.png` }); if (await wide()) console.log('OVERFLOW other');
await p.click('.ml-way[data-ml^="photo:"]'); await p.waitForTimeout(1000);
console.log('PHOTO sheet:', (await txt('#sheetBody')).slice(0, 300), '| inputs:', JSON.stringify(await p.$$eval('[data-mlpick]', (l) => l.map((x) => ({ id: x.id, capture: x.getAttribute('capture') })))));
await p.click('[data-ml="pmeal:dinner"]'); await p.waitForTimeout(300); console.log('PHOTO meal now:', await txt('.chip.on'));
await p.screenshot({ path: `${S}${tag}-3-photo.png` }); if (await wide()) console.log('OVERFLOW photo');
// Ate out
await p.evaluate(() => document.querySelector('#sheet').close()); await p.waitForTimeout(300);
await (await p.$('[data-ml^="other:"]')).click(); await p.waitForTimeout(800); await p.click('.ml-way[data-ml^="out:"]'); await p.waitForTimeout(800);
console.log('OUT sheet bottom:', await txt('.ml-minis')); await p.screenshot({ path: `${S}${tag}-4-out.png`, fullPage: false }); if (await wide()) console.log('OVERFLOW out');
// Talk for a meal
await p.evaluate(() => document.querySelector('#sheet').close()); await p.waitForTimeout(300);
await (await p.$('[data-ml^="other:"]')).click(); await p.waitForTimeout(800);
const mealOf = await p.$eval('.ml-way.talk', (e) => e.dataset.talkmeal);
await p.click('.ml-way.talk'); await p.waitForTimeout(1200);
console.log('TALK for', mealOf, ':', await txt('.tk-meal'));
await p.fill('#tkText', '2 eggs and a slice of sourdough'); await p.click('.tk-form button[aria-label=Send]'); await p.waitForTimeout(2500);
console.log('AFTER say → sheet:', (await txt('#sheetBody')).slice(0, 160)); await p.screenshot({ path: `${S}${tag}-5-talkmeal.png` });
await b.close(); console.log('ERRORS', errs);
