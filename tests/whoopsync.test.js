// ⌚ The one WHOOP sync (family/whoopSync.js): one at a time, the right kind of sync, and an honest
// result — "updated" only when the card changed, "no newer scores" never a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWhoopSync, resultMessage, AUTO_MS, FRESH_MS, COOL_MS } from '../family/whoopSync.js';

function rig({ t = { lastSync: 0 }, fullOut = { added: 0, errors: [] }, change = false } = {}) {
  let clock = 10 * AUTO_MS, card = 'A', data = 'x';
  const calls = { full: 0, today: 0 }, results = [];
  let release;
  const s = makeWhoopSync({
    now: () => clock,
    read: () => ({ t }),
    full: async () => { calls.full++; await new Promise((ok) => { release = ok; setTimeout(ok, 0); }); if (change) { card = 'B'; data = 'y'; } return typeof fullOut === 'function' ? fullOut() : fullOut; },
    today: async () => { calls.today++; if (change) card = 'B'; },
    fingerprint: () => card, raw: () => data,
    onResult: (r) => results.push(r),
  });
  return { s, calls, results, t, tick: (ms) => { clock += ms; }, setLast: (ms) => { t.lastSync = clock - ms; } };
}

test('a double tap starts one sync; both taps get the same answer', async () => {
  const r = rig({ change: true });
  const [a, b] = await Promise.all([r.s.sync('manual'), r.s.sync('manual')]);
  assert.equal(r.calls.full, 1);
  assert.equal(a, b);
  assert.equal(a.status, 'updated');
  assert.equal(r.results.length, 1, 'views are told once');
});

test('Home and Health asking at once share one sync, whatever kind each asked for', async () => {
  const r = rig();
  const [home, health] = await Promise.all([r.s.sync('manual'), r.s.sync('auto')]);
  assert.equal(r.calls.full, 1);
  assert.equal(home, health);
});

test('synced but nothing new is "nochange", not a failure', async () => {
  const r = rig({ change: false });
  const res = await r.s.sync('manual');
  assert.equal(res.status, 'nochange');
  assert.deepEqual(resultMessage(res), { text: 'WHOOP synced — no newer scores yet.', tone: '' });
});

test('a tap within a minute of a full sync asks WHOOP for today only', async () => {
  const r = rig(); r.setLast(FRESH_MS / 2);
  const res = await r.s.sync('manual');
  assert.equal(r.calls.full, 0); assert.equal(r.calls.today, 1);
  assert.equal(res.status, 'fresh');
});

test('auto waits 20 minutes and never syncs while WHOOP needs reconnecting', async () => {
  const r = rig(); r.setLast(AUTO_MS / 2);
  assert.equal((await r.s.sync('auto')).status, 'skipped');
  r.setLast(AUTO_MS + 1000);
  assert.equal((await r.s.sync('auto')).status, 'nochange');
  r.t.problem = 'reconnect';
  assert.equal((await r.s.sync('auto')).status, 'skipped');
  assert.equal(r.calls.full, 1);
});

test('reconnect, error and 429 (with a two-minute wait for taps)', async () => {
  assert.equal((await rig({ fullOut: { added: 0, errors: [{ provider: 'whoop', kind: 'reconnect' }] } }).s.sync('manual')).status, 'reconnect');
  assert.equal((await rig({ fullOut: { added: 0, errors: [{ provider: 'whoop', kind: 'unavailable' }] } }).s.sync('manual')).status, 'error');
  const r = rig({ fullOut: { added: 0, errors: [{ provider: 'whoop', kind: 'unavailable', status: 429 }] } });
  assert.equal((await r.s.sync('manual')).status, 'busy');
  assert.equal((await r.s.sync('manual')).status, 'cooldown');
  assert.equal(r.calls.full, 1, 'no second request during the cool-down');
  r.tick(COOL_MS + 1);
  await r.s.sync('manual');
  assert.equal(r.calls.full, 2);
  assert.equal(resultMessage({ status: 'error' }).text, "Couldn't refresh WHOOP. Showing your last synced data.");
});

test('a thrown error never leaves the sync stuck', async () => {
  const r = rig({ fullOut: () => { throw Object.assign(new Error('offline'), { kind: 'unavailable' }); } });
  assert.equal((await r.s.sync('manual')).status, 'error');
  assert.equal(r.s.busy(), false);
  assert.equal((await r.s.sync('manual')).status, 'error', 'and can be tried again');
});

test('not connected on this phone: nothing to do', async () => {
  const s = makeWhoopSync({ read: () => null, full: async () => assert.fail('no sync'), today: async () => {}, fingerprint: () => '' });
  assert.equal((await s.sync('manual')).status, 'none');
});

test('new workouts with an unchanged card still tell other views to refresh', async () => {
  let data = 'x';
  const s = makeWhoopSync({ now: () => 1e12, read: () => ({ t: { lastSync: 0 } }), full: async () => { data = 'y'; return { added: 1, errors: [] }; }, today: async () => {}, fingerprint: () => 'same', raw: () => data });
  const res = await s.sync('manual');
  assert.equal(res.status, 'nochange');
  assert.equal(res.dataChanged, true);
  assert.equal(res.added, 1);
});
