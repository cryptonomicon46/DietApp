// 🔥 The header's burned-vs-eaten line: the plan's target already has the deficit in it, so "over
// plan" can still be a deficit against what you burned (WHOOP so far, or the estimate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { burnSummary } from '../js/dietDays.js';
import { fromDeviceWorkout, isStrength } from '../js/workout.js';

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
