// 🔥 The header's burned-vs-eaten line: the plan's target already has the deficit in it, so "over
// plan" can still be a deficit against what you burned (WHOOP so far, or the estimate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { burnSummary } from '../js/dietDays.js';
import { fromDeviceWorkout, isStrength, isLight, groupLight } from '../js/workout.js';

test("over the plan but under what WHOOP says you've burned: still a deficit", () => {
  // The owner's day: target 1751, ate 1839 (88 over plan), WHOOP 2079 burned so far.
  assert.deepEqual(burnSummary({ burned: 2079, source: 'WHOOP (so far today)', eaten: 1839 }), { burned: 2079, from: 'WHOOP, so far', deficit: true, kcal: 240 });
  assert.deepEqual(burnSummary({ burned: 2000, source: 'estimate: daily life + your activities', eaten: 2150.4 }), { burned: 2000, from: 'estimate for today', deficit: false, kcal: 150 });
  assert.equal(burnSummary({ burned: 2650, source: 'WHOOP (you entered)', eaten: 1800 }).from, 'WHOOP');
  assert.equal(burnSummary({ burned: 2000, source: 'WHOOP (you entered)', eaten: 0 }), null, 'nothing eaten yet: no line');
  assert.equal(burnSummary({ burned: 0, eaten: 500 }), null);
});

test('a WHOOP climb is an activity, not strength work (History lists it; "last time" and repeat skip it)', () => {
  const w = fromDeviceWorkout({ id: 'whoop:abc', name: 'rock-climbing', start: '2026-10-30T18:19:00-07:00', minutes: 75, kcal: 417 });
  assert.deepEqual([w.title, w.source, w.activity.minutes, w.activity.kcal, w.status], ['Rock climbing', 'device', 75, 417, 'done']);
  assert.equal(isStrength(w), false);
  assert.equal(isStrength(fromDeviceWorkout({ id: 'whoop:x', name: 'weightlifting', start: '2026-10-27T10:00:00Z', minutes: 33 })), true);
});

test("a day's walks, stretches and short bits become one Everyday activity row; climbs and lifts keep theirs", () => {
  const dev = (id, name, start, minutes, kcal) => fromDeviceWorkout({ id, name, start, minutes, kcal });
  // The owner's Thursday in WHOOP, plus a climb, a long hike and a lift on other days.
  const thu = [dev('w1', 'walking', '2026-10-29T12:33:00', 24, 110), dev('w2', 'hiking', '2026-10-29T17:34:00', 15, 90), dev('w3', 'walking', '2026-10-29T17:50:00', 2, 9), dev('w4', 'stretching', '2026-10-29T17:53:00', 5, null)];
  const others = [dev('c1', 'rock-climbing', '2026-10-30T18:19:00', 75, 417), dev('h1', 'hiking', '2026-10-25T09:00:00', 120, 700), dev('l1', 'weightlifting', '2026-10-27T10:00:00', 33, 210), dev('s1', 'stretching', '2026-10-26T08:00:00', 10, 20)];
  assert.deepEqual(thu.map(isLight), [true, true, true, true]);
  assert.deepEqual(others.map(isLight), [false, false, false, true]);
  const out = groupLight([...others.slice(0, 1), ...thu, ...others.slice(1)]);
  const g = out.find((w) => w.group);
  assert.deepEqual([g.title, g.date, g.activity.kind, g.activity.minutes, g.activity.kcal, g.group.length], ['Everyday activity', '2026-10-29', 'walking, hiking, stretching', 46, 209, 4]);
  assert.deepEqual(out.map((w) => w.title), ['Rock climbing', 'Everyday activity', 'Hiking', 'Weightlifting', 'Stretching'], 'one row for Thursday, in place; a lone stretch stays itself');
});
