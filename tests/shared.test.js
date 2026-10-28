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
