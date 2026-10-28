// 🧭 OurPawmily 2.0 guard rails: where the legacy household code is still used (the list Phase 2
// starts from), no household code or connector set-up in what people see, and no feed or news
// work when the family app starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const files = (dir, ext = '.js') => readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);

test('the legacy household code is used only where the migration list says', () => {
  const uses = [...files('js'), ...files('family')].filter((f) => /\/household\/|sync\.settings\(\)|sync\.household\(\)|sync\.ensure\(\)/.test(read(f))).sort();
  assert.deepEqual(uses, [
    'js/app.js', //     sync.ensure() at start-up (new codes: Phase 2), the legacy assistant route
    'js/calTab.js', //  linked calendars through the connector; the old subscribe link (not shown)
    'js/dogs.js', //    dog documents and adoption photos (move to the family file store: Phase 2)
    'js/recover.js', // 🛟 Recover reads old shared copies
    'js/sync.js', //    the sync itself
  ]);
  for (const f of files('family')) assert.doesNotMatch(read(f), /lp\.g\.sync|\/household\//, `${f} doesn't depend on the trackers' sharing settings`);
});

test('no household code, connector address or README set-up in what people see', () => {
  const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script type="importmap"[\s\S]*?<\/script>/, '');
  for (const f of ['index.html', 'family/index.html']) assert.doesNotMatch(visible(read(f)), /household code|connector url|server\/README|\.csv/i, f);
  // Strings shown by the apps (comments aside).
  const shown = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const f of [...files('family'), 'js/app.js', 'js/household.js', 'js/recover.js', 'js/devices.js'])
    assert.doesNotMatch(shown(read(f)), /household code|Link phones|connector URL|server\/README/i, f);
});

test('the family app starts on Home without the feed or the news', () => {
  const app = read('family/app.js');
  const home = app.slice(app.indexOf('async function homeView()'), app.indexOf('// 📖 Threads:'));
  assert.ok(home.length > 200);
  assert.doesNotMatch(home, /\/feed|renderNews|renderPosts|renderAlbums|moveOldPhotos/);
  assert.match(app, /view: 'home'/);
  assert.match(read('family/index.html'), /data-view="home"[\s\S]*data-view="us"[\s\S]*data-view="calendar"[\s\S]*data-view="threads"[\s\S]*>Health</);
  assert.doesNotMatch(read('server/worker.js').replace(/\/\/.*$/gm, ''), /const news = runNewsEdition/, 'the news edition only runs when switched on');
});
