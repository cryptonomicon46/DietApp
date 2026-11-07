// Run before each deploy: `node scripts/bump-version.mjs`.
// Gives every app file a new ?v= address (via an import map), so browsers can never mix
// an old cached file with new ones after an update, and bumps the offline cache name.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(`${root}sw.js`, 'utf8');
const v = Number(sw.match(/lean-plate-v(\d+)/)[1]) + 1;
writeFileSync(`${root}sw.js`, sw.replace(/lean-plate-v\d+/, `lean-plate-v${v}`));

const modules = readdirSync(`${root}js`).filter((f) => f.endsWith('.js')).sort();
const map = { imports: Object.fromEntries(modules.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) };
let html = readFileSync(`${root}index.html`, 'utf8');
const block = `<script type="importmap" id="versions">\n${JSON.stringify(map, null, 2)}\n  </script>`;
html = /<script type="importmap" id="versions">[\s\S]*?<\/script>/.test(html)
  ? html.replace(/<script type="importmap" id="versions">[\s\S]*?<\/script>/, block)
  : html.replace('<script type="module" src="js/app.js', `${block}\n  <script type="module" src="js/app.js`);
html = html.replace(/<script type="module" src="js\/app\.js(\?v=\d+)?"><\/script>/, `<script type="module" src="js/app.js?v=${v}"></script>`);
html = html.replace(/href="styles\.css(\?v=\d+)?"/, `href="styles.css?v=${v}"`);
writeFileSync(`${root}index.html`, html);

// OurPawmily (family/index.html) gets the same map for the shared files it uses (../js/*), so a
// new version never runs with an old cached food reader, plan or parser. Its page allows no inline
// script, so the map is allowed by its exact hash in the page's Content-Security-Policy.
const fmap = JSON.stringify({ imports: Object.fromEntries(modules.map((f) => [`../js/${f}`, `../js/${f}?v=${v}`])) });
const hash = `'sha256-${createHash('sha256').update(fmap).digest('base64')}'`;
let fam = readFileSync(`${root}family/index.html`, 'utf8');
const fblock = `<script type="importmap" id="versions">${fmap}</script>`;
fam = /<script type="importmap" id="versions">[\s\S]*?<\/script>/.test(fam)
  ? fam.replace(/<script type="importmap" id="versions">[\s\S]*?<\/script>/, fblock)
  : fam.replace('<script src="../theme.js"></script>', `<script src="../theme.js"></script>\n  ${fblock}`);
fam = fam.replace(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')?/, `script-src 'self' ${hash}`);
writeFileSync(`${root}family/index.html`, fam);
console.log(`version ${v}`);
