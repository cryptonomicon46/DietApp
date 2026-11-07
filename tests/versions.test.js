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
