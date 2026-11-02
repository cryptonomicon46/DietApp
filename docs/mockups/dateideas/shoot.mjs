// Photographs the Date ideas mockups (design only) at 390 px, 390 px dark and 320 px.
// Served like the other mockups (it loads the app's style.css):
//   node scripts/perf/pages.mjs &   then   node docs/mockups/dateideas/shoot.mjs
//   → docs/mockups/dateideas/out/*.png
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'out'); mkdirSync(out, { recursive: true });
const page = 'http://localhost:8098/DietApp/docs/mockups/dateideas/screens.html';
const IDS = ['dates', 'isdate', 'deck', 'seen', 'browse', 'lists', 'after', 'uscard'];
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
