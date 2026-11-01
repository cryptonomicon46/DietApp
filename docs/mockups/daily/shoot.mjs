// Photographs screens.html (design mockups only) at 390 px, 390 px dark and 320 px.
// The page imports the real WHOOP card code, so it must be served (not opened from disk):
//   node scripts/perf/pages.mjs &   then   node docs/mockups/daily/shoot.mjs
//   → docs/mockups/daily/out/*.png
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'out'); mkdirSync(out, { recursive: true });
const page = 'http://localhost:8098/DietApp/docs/mockups/daily/screens.html';
const IDS = ['home', 'sync', 'stale', 'listen', 'pause', 'meal', 'mealfix', 'workout', 'insight'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, dark] of [[390, false], [390, true], [320, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  for (const id of IDS) {
    await p.goto(`${page}#${id}`); await p.waitForSelector('body[data-ready="1"]'); await p.waitForTimeout(120);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (wide) console.log('OVERFLOW', w, dark ? 'dark' : '', id);
    await p.screenshot({ path: join(out, `${w}${dark ? '-dark' : ''}-${id}.png`), fullPage: true });
  }
  await ctx.close();
}
await b.close(); console.log('done');
