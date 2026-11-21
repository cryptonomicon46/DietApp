// 🔄 A new version never runs with old shared files: OurPawmily's page maps every ../js/ file to the
// current version (like the trackers' page), and its Content-Security-Policy allows exactly that map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../family/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('family/index.html maps every shared file to the current version, allowed by its exact hash', () => {
  const m = html.match(/<script type="importmap" id="versions">([\s\S]*?)<\/script>/);
  assert.ok(m, 'import map present');
  const v = sw.match(/lean-plate-v(\d+)/)[1];
  const map = JSON.parse(m[1]).imports;
  const files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
  for (const f of files) assert.equal(map[`../js/${f}`], `../js/${f}?v=${v}`, f);
  const hash = createHash('sha256').update(m[1]).digest('base64');
  assert.match(html, new RegExp(`script-src 'self' 'sha256-${hash.replace(/[+/=]/g, (c) => `\\${c}`)}'`));
  assert.ok(html.indexOf('id="versions"') < html.indexOf('<script type="module"'), 'before the first module');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('id="versions"'), 'after the CSP');
});

test("✨ the update check reads OurPawmily's own version, not the trackers' entry in the map", () => {
  const app = readFileSync(new URL('../family/app.js', import.meta.url), 'utf8');
  const line = app.split('\n').find((l) => l.startsWith('export const latestVersion'));
  assert.ok(line, 'latestVersion is defined');
  const latestVersion = new Function(`return ${line.replace('export const latestVersion = ', '').replace(/;$/, '')}`)();
  const own = html.match(/<script type="module" src="app\.js\?v=(\d+)"><\/script>/)[1];
  assert.equal(latestVersion(html), own);
  assert.notEqual(latestVersion(html), html.match(/app\.js\?v=(\d+)/)[1], 'the first app.js?v= in the page is the map\'s, which is why the old check never settled');
  assert.equal(latestVersion('<html></html>'), null);
  // The update tap loads a fresh address, and the app tidies it away on arrival.
  assert.match(app, /location\.replace\(`\$\{location\.pathname\}\?fresh=\$\{latest\}\$\{location\.hash\}`\)/);
  assert.match(app, /has\('fresh'\)\) history\.replaceState/);
});
