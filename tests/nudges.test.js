// 📞 Call Mom every two weeks: tick it off, the next is two weeks later; one nudge a day while due,
// at the start of a good time to call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeState, nudgesDue, nudgeRoutes } from '../server/nudges.js';
import { callWindows } from '../js/brief.js';

test('due every 14 days from the last call; a notification once a day at the call window', () => {
  assert.deepEqual(nudgeState({ every: 14, last: '2026-10-20' }, '2026-10-27'), { every: 14, last: '2026-10-20', next: '2026-11-03', due: false, overdue: 0, canUndo: false });
  const late = nudgeState({ every: 14, last: '2026-10-10' }, '2026-10-27');
  assert.deepEqual([late.due, late.overdue], [true, 3]);
  assert.equal(nudgeState({ every: 14 }, '2026-10-27').due, true, 'never called: due now');

  const today = '2026-10-27';
  const w = callWindows(today)[0];
  const slot = Math.floor(w.start.getTime() / 9e5) * 9e5;
  const n = { callmom: { every: 14, last: '2026-10-10' } };
  const due = nudgesDue(n, { today, from: slot, to: slot + 9e5 });
  assert.equal(due.length, 1);
  assert.match(due[0].msg.body, /last call 17 days ago/);
  assert.equal(nudgesDue(n, { today, from: slot + 9e5, to: slot + 18e5 }).length, 0, 'only at the start of the window');
  assert.equal(nudgesDue({ callmom: { ...n.callmom, notified: today } }, { today, from: slot, to: slot + 9e5 }).length, 0, 'once a day');
  assert.equal(nudgesDue({ callmom: { every: 14, last: '2026-10-20' } }, { today, from: slot, to: slot + 9e5 }).length, 0, 'not due yet');
});

test('workouts: one morning note for what is due', () => {
  const today = '2026-10-27';
  const all = { run: { every: 2, last: '2026-10-24' }, bike: { every: 3, last: '2026-10-26' }, hotyoga: { every: 3, last: '2026-10-23' } };
  assert.equal(nudgesDue(all, { today, from: 0, to: 9e5, hour: 9 }).length, 0, 'only at 7 AM');
  const [d] = nudgesDue(all, { today, from: 0, to: 9e5, hour: 7 });
  assert.deepEqual(d.ids, ['run', 'hotyoga']);
  assert.equal(d.msg.title, '💪 Due today');
  assert.match(d.msg.body, /🏃 Run \(3 days\) · 🧘 Hot yoga \(4 days\)/);
  const one = nudgesDue({ run: all.run }, { today, from: 0, to: 9e5, hour: 7 })[0];
  assert.equal(one.msg.title, '🏃 Time for a run');
  assert.equal(nudgesDue({ run: { ...all.run, notified: today } }, { today, from: 0, to: 9e5, hour: 7 }).length, 0);
});

test('set up, tick off, undo, change, stop', async () => {
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const json = (data, status = 200) => ({ status, data });
  const call = (path, method = 'GET', body = {}, today = '2026-10-27') => nudgeRoutes({ path, method, body, db, user: { uid: 'u1' }, json, today });
  assert.deepEqual((await call('/account/nudges')).data.nudges, {});
  assert.equal((await call('/account/nudges/callmom', 'PUT', { every: 14 })).data.nudges.callmom.due, true);
  const done = (await call('/account/nudges/callmom/done', 'POST', { date: '2026-10-27' })).data.nudges.callmom;
  assert.deepEqual([done.due, done.next, done.canUndo], [false, '2026-11-10', true]);
  assert.equal((await call('/account/nudges/callmom/undo', 'POST')).data.nudges.callmom.due, true, 'oops — not called after all');
  await call('/account/nudges/callmom/done', 'POST', { date: '2027-01-01' });
  assert.equal(m.get('nudges:u1').callmom.last, '2026-10-27', 'no future dates');
  assert.equal((await call('/account/nudges/callmom', 'PUT', { every: 21 })).data.nudges.callmom.next, '2026-11-17');
  assert.equal((await call('/account/nudges/zzz', 'PUT')).status, 404);
  await call('/account/nudges/callmom', 'DELETE');
  assert.deepEqual((await call('/account/nudges')).data.nudges, {});
});

test('a run every 2 days stays every 2 days', async () => {
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const r = await nudgeRoutes({ path: '/account/nudges/run', method: 'PUT', body: { every: 2 }, db, user: { uid: 'u' }, json: (data) => ({ data }), today: '2026-10-27' });
  assert.equal(r.data.nudges.run.every, 2);
});

test("Next up's top pick: saved for a nudge 30 minutes before, then sent once", async () => {
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const json = (data, status = 200) => ({ status, data });
  const at = Date.now() + 3 * 3600e3;
  assert.equal((await nudgeRoutes({ path: '/account/nextup', method: 'PUT', body: { at: 5 }, db, user: { uid: 'u' }, json, today: '2026-10-27' })).status, 400);
  await nudgeRoutes({ path: '/account/nextup', method: 'PUT', body: { at, title: '🏃 Run in 30 min?', body: '3 days since your last run' }, db, user: { uid: 'u' }, json, today: '2026-10-27' });
  assert.deepEqual(m.get('nextup:u'), { at, title: '🏃 Run in 30 min?', body: '3 days since your last run', sent: false });
});

test('morning weigh-in: opt-in, a calm 7 AM note with nothing private, ticked off by a weigh-in', () => {
  const today = '2026-10-29';
  assert.equal(nudgesDue({}, { today, from: 0, to: 9e5, hour: 7 }).length, 0, 'off unless turned on');
  const [d] = nudgesDue({ weighin: { every: 1, last: '2026-10-28' } }, { today, from: 0, to: 9e5, hour: 7 });
  assert.deepEqual(d.ids, ['weighin']);
  assert.equal(d.msg.title, '⚖️ Morning weigh-in');
  assert.equal(d.msg.url, 'family/#health');
  assert.doesNotMatch(d.msg.body, /\d/, 'no numbers in the notification');
  assert.equal(nudgesDue({ weighin: { every: 1, last: today } }, { today, from: 0, to: 9e5, hour: 7 }).length, 0, 'already weighed in today');
  const both = nudgesDue({ weighin: { every: 1, last: '2026-10-28' }, run: { every: 2, last: '2026-10-25' } }, { today, from: 0, to: 9e5, hour: 7 });
  assert.equal(both.length, 1);
  assert.deepEqual(both[0].ids, ['weighin', 'run']);
});
