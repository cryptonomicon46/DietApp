// Run before each deploy: `node scripts/bump-version.mjs`.
// Gives every app file a new ?v= address (via an import map), so browsers can never mix
// an old cached file with new ones after an update, and bumps the offline cache name.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

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
console.log(`version ${v}`);
