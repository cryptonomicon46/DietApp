// ⚡ The performance budget: a cold and a warm start of /family/ as a signed-in grown-up on a phone
// screen, with 4× CPU slowdown and a mid-range 4G network, against the real Worker (wrangler dev)
// and a Pages-like server. Fails when a budget in budget.json is broken. Timings (first paint,
// largest paint, long tasks) depend on the machine: they're reported, and only checked with
// PERF_STRICT=1 (the same machine the baseline was measured on).
// Run: node scripts/perf/pages.mjs & (cd server && npx wrangler dev …) & node scripts/perf/seed.mjs; node scripts/perf/budget.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { route } from './weather.mjs';

const { chromium } = createRequire(import.meta.url)('playwright'); // the repo's (CI) or a global one

const here = (f) => new URL(f, import.meta.url).pathname;
const seed = JSON.parse(readFileSync(here('.seeded.json')));
const BUDGET = JSON.parse(readFileSync(here('budget.json')));
const APP = process.env.APP || 'http://localhost:8098/DietApp/family/';
const OUT = process.env.OUT || 'perf-report';
const WINDOW = 6000; // requests made in the first 6 s count as start-up (deferred background work comes later)
const SETTLE = 8000; // layout shift and paints are read after 8 s

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true }); // the page's CSP allows only the real connector
await ctx.route('**/*', route);
await ctx.addInitScript(({ seed }) => {
  if (!location.href.startsWith('http')) return; // about:blank between runs has no storage
  if (!localStorage.getItem('perf.seeded')) {
    localStorage.setItem('fam.server', 'http://localhost:8787');
    localStorage.setItem('lp.g.sync', JSON.stringify({ url: 'http://localhost:8787' })); // before fam.server existed
    localStorage.setItem('fam.mode', 'live'); localStorage.setItem('fam.token.live', seed.sam); localStorage.setItem('fam.fid', seed.fid);
    localStorage.setItem('fam.tourSeen', '1'); localStorage.setItem('fam.helloNo', '1');
    localStorage.setItem('fam.keys', JSON.stringify({ [seed.fid]: seed.k }));
    localStorage.setItem('perf.seeded', '1');
  }
  const P = (window.__perf = { cls: 0, lcp: 0, longtasks: 0 });
  new PerformanceObserver((l) => { for (const x of l.getEntries()) P.longtasks += x.duration; }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const x of l.getEntries()) if (!x.hadRecentInput) P.cls += x.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { const x = l.getEntries().at(-1); if (x) P.lcp = Math.round(x.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
}, { seed });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });

async function start(label) {
  await page.goto('about:blank'); // the last page's timers end before counting starts
  const api = [], t0 = Date.now();
  const on = (r) => { if (/:8787/.test(r.url()) && r.method() !== 'OPTIONS' && Date.now() - t0 < WINDOW) { const u = new URL(r.url()); api.push(`${r.method()} ${u.pathname.replace(seed.fid, ':fid')}${u.search.replace(seed.fid, ':fid')}`); } };
  page.on('request', on);
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE);
  page.off('request', on);
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const fcp = performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint')?.startTime || -1;
    return { ...window.__perf, fcp: Math.round(fcp), jsKB: Math.round(res.filter((r) => /\.js(\?|$)/.test(r.name)).reduce((n, r) => n + (r.encodedBodySize || 0), 0) / 1024) };
  });
  // Photo files load as they scroll into view: counted on their own, not as start-up data.
  const photos = api.filter((x) => /^GET \/v2\/families\/:fid\/photos\/[a-z0-9]+/.test(x));
  api.splice(0, api.length, ...api.filter((x) => !photos.includes(x)));
  const seen = new Map();
  for (const x of api) seen.set(x, (seen.get(x) || 0) + 1);
  const dups = [...seen].filter(([, n]) => n > 1).map(([x, n]) => `${x} ×${n}`);
  return { label, api: api.length, photos: photos.length, dups, cls: Math.round(m.cls * 1000) / 1000, fcp: m.fcp, lcp: m.lcp, longtasks: Math.round(m.longtasks), jsKB: m.jsKB, requests: api };
}
const cold = await start('cold');
const warm = await start('warm');
await b.close();

const fails = [];
for (const r of [cold, warm]) {
  if (r.api > BUDGET.startupApi) fails.push(`${r.label}: ${r.api} start-up API requests (budget ${BUDGET.startupApi})`);
  if (r.dups.length) fails.push(`${r.label}: duplicate requests ${r.dups.join(', ')}`);
  if (r.cls > BUDGET.cls) fails.push(`${r.label}: layout shift ${r.cls} (budget ${BUDGET.cls})`);
  if (process.env.PERF_STRICT) {
    if (r.fcp > BUDGET.fcpMs) fails.push(`${r.label}: first paint ${r.fcp} ms (budget ${BUDGET.fcpMs})`);
    if (r.lcp > BUDGET.lcpMs) fails.push(`${r.label}: largest paint ${r.lcp} ms (budget ${BUDGET.lcpMs})`);
  }
}
if (cold.jsKB > BUDGET.startupJsKB) fails.push(`cold: ${cold.jsKB} KB of script (gzipped) at start-up (budget ${BUDGET.startupJsKB})`);
if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/perf.json`, JSON.stringify({ budget: BUDGET, cold, warm, errors, fails }, null, 1));
const row = (r) => `| ${r.label} | ${r.api} | ${r.photos} | ${r.dups.length} | ${r.cls} | ${r.fcp} | ${r.lcp} | ${r.longtasks} | ${r.jsKB} |`;
const md = `### ⚡ Performance budget\n\n| start | API requests | photo files | duplicates | layout shift | first paint ms | largest paint ms | long tasks ms | script KB |\n|---|---|---|---|---|---|---|---|---|\n${row(cold)}\n${row(warm)}\n| budget | ≤ ${BUDGET.startupApi} | | 0 | ≤ ${BUDGET.cls} | ${BUDGET.fcpMs}* | ${BUDGET.lcpMs}* | | ≤ ${BUDGET.startupJsKB} |\n\n*timings are checked only on the baseline machine (PERF_STRICT=1).\n\n${fails.length ? `**Over budget:**\n${fails.map((f) => `- ${f}`).join('\n')}` : '✅ Within budget.'}\n\n<details><summary>Cold start requests</summary>\n\n${cold.requests.map((x) => `- \`${x}\``).join('\n')}\n</details>\n`;
writeFileSync(`${OUT}/perf.md`, md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
process.exit(fails.length ? 1 : 0);
