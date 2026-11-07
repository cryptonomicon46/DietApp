// 🐾 The opening: plays on cold launches only, never blocks the app, works without its own script
// (the page's CSP allows no inline scripts), and respects Reduce Motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../family/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../family/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../family/app.js', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../family/manifest.webmanifest', import.meta.url), 'utf8'));

test('the opening is in the page, hidden from screen readers, with no script of its own', () => {
  const m = html.match(/<div class="splash" id="splash" aria-hidden="true">[\s\S]*?<\/div><\/div>/);
  assert.ok(m, 'splash markup right after <body>');
  assert.ok(html.indexOf('id="splash"') < html.indexOf('<main id="view"'));
  assert.ok(!/<script(?![^>]*src=)(?![^>]*type="importmap")[^>]*>/.test(html), 'no inline script (CSP) besides the hash-allowed import map');
  assert.equal([...m[0].matchAll(/<span style="--i:\d+">(.)<\/span>/g)].map((x) => x[1]).join(''), 'OurPawmily');
  assert.match(m[0], /Home, health and the dogs/);
  assert.ok(!/<img|url\(/.test(m[0]), 'no image to download');
});

test('it lifts by itself, has a dark look and a Reduce Motion fade, and moves only transform/opacity', () => {
  assert.match(css, /\.splash \{[^}]*animation: sp-out \.42s ease-in 10s both; --sp-t: 3;/);
  assert.match(css, /\.splash\.done\.skip \{ animation: sp-out \.25s/);
  assert.match(css, /\.nosplash \.splash \{ display: none; \}/);
  assert.match(css, /:root\[data-theme=dark\] \.splash/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.sp-paw, \.sp-toe, \.sp-heart \{ animation: none; \}/);
  for (const k of css.match(/@keyframes sp-[\s\S]*?\}\s*\}/g) || []) assert.ok(!/(width|height|top|left|margin|padding):/.test(k), k.slice(0, 30));
});

test('cold launches only, and the app lifts it once the first screen is drawn', () => {
  assert.match(theme, /nav\.type !== 'navigate'/);
  assert.match(theme, /document\.referrer/);
  assert.match(theme, /\/family\\\/\(index\\\.html\)\?\$/);
  assert.match(app, /function splashDone\(\)/);
  assert.match(app, /\.finally\(splashDone\);/);
  assert.match(app, /calm \? 300 : SPLASH_MS/);
  assert.match(app, /const SPLASH_MS = 3 \* 1280;/);
  assert.match(app, /getElementById\('splash'\)\?\.addEventListener\('click'/);
  assert.equal(manifest.background_color, '#2f7d5b');
});
