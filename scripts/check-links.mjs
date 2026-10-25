// 🔗 Before a deploy: open one sample of every kind of link the app builds (OpenTable, Google Maps,
// directions, Fandango, Ticketmaster, TMDB) in a real browser, plus the app's own pages.
// Fails on a page that's gone (404/410/5xx) or doesn't load; sites that turn away robots (401/403/429)
// are listed as "check by hand". Screenshots go to link-report/.
//   node scripts/check-links.mjs            (needs Playwright: npm i --no-save playwright)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openTableUrl } from '../server/scout.js';
import { shapeOuting } from '../server/outing.js';
import { searchUrl } from '../server/links.js';

const day = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
const o = shapeOuting({ area: 'Hayes Valley, San Francisco', stops: [{ time: '19:30', kind: 'dinner', name: 'Rich Table', opentable: true }] }, { day, from: 'San Jose', text: 'Hayes Valley' });
const APP = process.env.APP_URL || 'http://localhost:8080';
const links = [
  ['OpenTable search (scout + outings)', openTableUrl('Rich Table San Francisco', day, '19:30')],
  ['Google Maps place (outings)', o.stops[0].map],
  ['Google Maps directions (outings)', o.directions],
  ['Fandango search (movies)', 'https://www.fandango.com/search?q=Wicked'],
  ['Google search (dead-link fallback)', searchUrl('Rich Table San Francisco')],
  ['Ticketmaster', 'https://www.ticketmaster.com/'],
  ['TMDB (movie info and posters)', 'https://www.themoviedb.org/movie/now-playing'],
  ['The app', `${APP}/family/`],
  ['Privacy page', `${APP}/family/privacy.html`],
  ['Terms page', `${APP}/family/terms.html`],
  ['Trackers', `${APP}/`],
];

mkdirSync('link-report', { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const rows = [];
let bad = 0;
for (const [i, [name, url]] of links.entries()) {
  const p = await ctx.newPage();
  const errs = [];
  if (url.startsWith(APP)) p.on('pageerror', (e) => errs.push(e.message));
  let status = 0, note = '';
  try {
    const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    status = r?.status() || 0;
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `link-report/${String(i + 1).padStart(2, '0')}.png` });
  } catch (e) { note = e.message.split('\n')[0]; }
  const verdict = errs.length ? 'BROKEN' : !status || status === 404 || status === 410 || status >= 500 ? 'BROKEN' : status >= 400 ? 'CHECK BY HAND' : 'OK';
  if (verdict === 'BROKEN') bad++;
  rows.push(`${verdict.padEnd(13)} ${String(status || '-').padEnd(4)} ${name} — ${url}${note ? ` (${note})` : ''}${errs.length ? ` (page errors: ${errs.join('; ')})` : ''}`);
  await p.close();
}
await b.close();
const report = rows.join('\n');
console.log(report);
writeFileSync('link-report/report.txt', `${report}\n`);
if (bad) { console.error(`\n${bad} broken`); process.exit(1); }
