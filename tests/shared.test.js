// Shared requests (family/shared.js): one request for callers asking at once, reuse for a few
// seconds, a copy each, failures not kept, clear() on any change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShared } from '../family/shared.js';

test('callers asking at once share one request, each with its own copy', async () => {
  let n = 0, clock = 0;
  const shared = makeShared(async (p) => { n++; return { path: p, list: [1, 2] }; }, { ms: 1000, now: () => clock });
  const [a, b, c] = await Promise.all([shared('/us'), shared('/us'), shared('/appts')]);
  assert.equal(n, 2, '/us once, /appts once');
  assert.deepEqual(a, b);
  a.list.push(3);
  assert.deepEqual((await shared('/us')).list, [1, 2], "one caller changing its copy doesn't change the next");
  assert.equal(n, 2, 'reused within the window');
  clock = 1500;
  await shared('/us');
  assert.equal(n, 3, 'asked again once it is older');
  assert.equal(c.path, '/appts');
});

test('a failure is not kept; clear() forgets everything', async () => {
  let n = 0, fail = true;
  const shared = makeShared(async () => { n++; if (fail) throw new Error('offline'); return { ok: 1 }; });
  await assert.rejects(shared('/feed'), /offline/);
  fail = false;
  assert.deepEqual(await shared('/feed'), { ok: 1 }, 'the next call asks again');
  assert.equal(n, 2);
  shared.clear();
  assert.equal(shared.size(), 0);
  await shared('/feed');
  assert.equal(n, 3);
});

test('⚡ an older answer comes back at once while a fresh one is asked for; a change is told once', async () => {
  let n = 0, clock = 0, v = 1;
  const fresh = [];
  const shared = makeShared(async () => { n++; return { v }; }, { ms: 1000, keep: 60000, now: () => clock, onFresh: (p) => fresh.push(p) });
  assert.deepEqual(await shared('/us'), { v: 1 });
  clock = 5000; v = 2;
  assert.deepEqual(await shared('/us'), { v: 1 }, 'stale, at once');
  assert.equal(n, 2, 'and a fresh one asked for behind it');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(fresh, ['/us'], 'the screen is told it changed');
  assert.deepEqual(await shared('/us'), { v: 2 });
  clock = 10000;
  await shared('/us'); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(fresh, ['/us'], 'the same answer again: nothing to redraw');
  clock = 100000;
  v = 3;
  assert.deepEqual(await shared('/us'), { v: 3 }, 'past `keep`: waits for the fresh answer');
});

test('⚡ offline: the last good answer stays; drop() and seed() for your own saved record', async () => {
  let fail = false, clock = 0;
  const shared = makeShared(async (p) => { if (fail) throw new Error('offline'); return { p }; }, { ms: 1000, now: () => clock });
  await shared('/a'); await shared('/me/data');
  fail = true; clock = 5000;
  assert.deepEqual(await shared('/a'), { p: '/a' }, 'still there while the refresh fails');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(await shared('/a'), { p: '/a' });
  shared.drop((p) => p.startsWith('/me'));
  assert.equal(shared.size(), 1);
  shared.seed('/me/data', { data: { weights: [1] } });
  const got = await shared('/me/data');
  got.data.weights.push(2);
  assert.deepEqual(await shared('/me/data'), { data: { weights: [1] } }, 'a copy each, even of a seeded answer');
});
