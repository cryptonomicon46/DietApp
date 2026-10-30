// ⌚↔🏋️ Health 2 Phase B: WHOOP workouts matched to logged workouts — by overlap, the nearest for
// "Log as done", your own pick, never across days — and calories counted once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAll, deviceFacts, candidatesFor, waitingForDevice } from '../js/workoutMatch.js';
import { normalize, complete } from '../js/workout.js';
import { burnedOf } from '../js/dayPlan.js';

const at = (s) => Date.parse(s);
const dev = (id, start, minutes, o = {}) => ({ id: `whoop:${id}`, name: 'weightlifting', start, minutes, kcal: 320, strain: 11.2, avgHr: 118, maxHr: 161, zones: [5, 10, 20, 15, 5, 0], tz: '-07:00', ...o });
const logged = (id, date, startedAt, doneAt, o = {}) => normalize({ ...complete(normalize({ id, title: 'Upper Body', date })), startedAt, doneAt, status: 'done', ...o });

test('overlap: a workout started and finished in the app takes the WHOOP workout it overlaps most', () => {
  // 5:30–6:25 PM in California (UTC-7).
  const w = logged('a', '2026-10-29', at('2026-10-30T00:30:00Z'), at('2026-10-30T01:25:00Z'));
  const near = dev('x', '2026-10-30T00:35:00Z', 50), other = dev('y', '2026-10-29T15:00:00Z', 30, { name: 'running' });
  const m = matchAll([w], [other, near]);
  assert.equal(m.get('a').device.id, 'whoop:x'); assert.equal(m.get('a').method, 'overlap');
  assert.deepEqual(deviceFacts(m.get('a')), { id: 'whoop:x', method: 'overlap', strain: 11.2, kcal: 320, avgHr: 118, maxHr: 161, zones: [5, 10, 20, 15, 5, 0], minutes: 50, name: 'weightlifting' });
  // Two logged workouts, two WHOOP workouts: each pairs with its own.
  const w2 = logged('b', '2026-10-29', at('2026-10-29T15:00:00Z'), at('2026-10-29T15:35:00Z'));
  const both = matchAll([w, w2], [near, other]);
  assert.deepEqual([both.get('a').device.id, both.get('b').device.id], ['whoop:x', 'whoop:y']);
});

test('"Log as done" takes the nearest WHOOP workout of the same day — never one from another day', () => {
  // Logged as done at 7 PM on the 29th (California); WHOOP has 5:30 PM that day and 9 AM the next.
  const w = logged('c', '2026-10-29', at('2026-10-30T02:00:00Z'), at('2026-10-30T02:00:00Z'));
  const m = matchAll([w], [dev('late', '2026-10-30T16:00:00Z', 45), dev('same', '2026-10-30T00:30:00Z', 50), dev('early', '2026-10-29T14:00:00Z', 40)]);
  assert.equal(m.get('c').device.id, 'whoop:same'); assert.equal(m.get('c').method, 'nearest');
  // Only a next-day WHOOP workout: no match (the 30th in WHOOP's own offset is another day).
  assert.equal(matchAll([w], [dev('late', '2026-10-30T16:00:00Z', 45)]).size, 0);
  // Evening workout in UTC terms is the next day — but in its own offset it's the 29th.
  assert.equal(matchAll([w], [dev('eve', '2026-10-30T03:30:00Z', 30)]).get('c').device.id, 'whoop:eve');
  // A WHOOP workout already matched by overlap isn't taken again.
  const t = logged('d', '2026-10-29', at('2026-10-30T00:30:00Z'), at('2026-10-30T01:20:00Z'));
  const both = matchAll([w, t], [dev('same', '2026-10-30T00:30:00Z', 50)]);
  assert.equal(both.get('d').device.id, 'whoop:same'); assert.equal(both.has('c'), false);
});

test('your pick wins: "this one", or "not this one" (unlinked); the pick survives saving', () => {
  const list = [dev('x', '2026-10-30T00:35:00Z', 50), dev('y', '2026-10-29T15:00:00Z', 30)];
  const w = logged('a', '2026-10-29', at('2026-10-30T00:30:00Z'), at('2026-10-30T01:25:00Z'), { match: { id: 'whoop:y' } });
  assert.equal(normalize(JSON.parse(JSON.stringify(w))).match.id, 'whoop:y');
  assert.deepEqual([matchAll([w], list).get('a').device.id, matchAll([w], list).get('a').method], ['whoop:y', 'manual']);
  const off = logged('a', '2026-10-29', at('2026-10-30T00:30:00Z'), at('2026-10-30T01:25:00Z'), { match: { none: true } });
  assert.deepEqual(normalize(off).match, { none: true });
  assert.equal(matchAll([off], list).size, 0);
  assert.deepEqual(candidatesFor(off, list).map((x) => x.id), ['whoop:y', 'whoop:x']);
  // A pick from another day is ignored.
  const wrong = logged('a', '2026-10-28', at('2026-10-29T00:30:00Z'), at('2026-10-29T01:25:00Z'), { match: { id: 'whoop:x' } });
  assert.equal(matchAll([wrong], list).size, 0);
  // Waiting for WHOOP: done today, connected, nothing yet, for up to 6 h.
  const now = at('2026-10-30T02:00:00Z');
  assert.equal(waitingForDevice(w, null, { connected: true, now, today: '2026-10-29' }), true);
  assert.equal(waitingForDevice(w, null, { connected: false, now, today: '2026-10-29' }), false);
  assert.equal(waitingForDevice(w, null, { connected: true, now: now + 7 * 3600e3, today: '2026-10-29' }), false);
  assert.equal(waitingForDevice(off, null, { connected: true, now, today: '2026-10-29' }), false);
});

test('calories are counted once: a matched pair adds nothing to the Diet burn', () => {
  const today = new Date().toLocaleDateString('en-CA');
  const start = new Date(`${today}T17:30:00`).toISOString();
  const data = { profile: { sex: 'male', age: 40, heightIn: 70, activity: 'tracked' }, weights: [{ date: today, weight: 180 }], workouts: [{ id: 'whoop:x', name: 'weightlifting', start, minutes: 50, kcal: 320 }] };
  const before = burnedOf(data, today).kcal;
  const w = logged('a', today, Date.parse(start), Date.parse(start) + 50 * 60000);
  const m = matchAll([w], data.workouts);
  assert.equal(m.get('a').device.kcal, 320);
  // The logged workout isn't part of the Diet data at all, and matching writes nothing into it.
  assert.equal(burnedOf(data, today).kcal, before);
  assert.ok(before > burnedOf({ ...data, workouts: [] }, today).kcal);
});
