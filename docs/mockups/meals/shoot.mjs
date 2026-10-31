// Photographs screens.html (design mockups only) at 390 px, 320 px and in dark mode:
//   node docs/mockups/meals/shoot.mjs  →  docs/mockups/meals/out/*.png (not committed)
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'out'); mkdirSync(out, { recursive: true });
const page = pathToFileURL(join(here, 'screens.html')).href;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, dark] of [[390, false], [320, false], [390, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage();
  for (const id of ['row', 'other', 'photo', 'photoest', 'out', 'pack', 'alt']) {
    await p.goto(`${page}#${id}`); await p.waitForTimeout(150);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (wide) console.log('OVERFLOW', w, dark ? 'dark' : '', id);
    await p.screenshot({ path: join(out, `${w}${dark ? '-dark' : ''}-${id}.png`) });
  }
  await ctx.close();
}
await b.close(); console.log('done');
