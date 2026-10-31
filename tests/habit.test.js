// 🎉 Logging encouragement (js/habit.js): what to say and how big the confetti is, right after
// logging a meal or a weigh-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthDay, logCheer, weighStreak } from '../js/habit.js';
import * as C from '../js/cheer.js';

const D = '2026-10-31';
const eaten = (...meals) => ({ date: D, meals: Object.fromEntries(meals.map((m) => [m, { kcal: 500 }])) });

test('a meal: how many of the three so far; all three (or those and the weigh-in) is a big one', () => {
  assert.deepEqual(logCheer(healthDay({ eaten: eaten('breakfast') }, D), D, { meal: 'breakfast' }), { line: '🎉 1 of 3 meals logged today', big: false });
  assert.deepEqual(logCheer(healthDay({ eaten: eaten('breakfast', 'lunch') }, D), D, { meal: 'lunch' }), { line: '🎉 2 of 3 meals logged today', big: false });
  assert.equal(logCheer(healthDay({ eaten: eaten('breakfast', 'lunch', 'dinner') }, D), D, { meal: 'dinner' }).big, true);
  const strong = logCheer(healthDay({ eaten: eaten('breakfast', 'lunch', 'dinner'), weights: [{ date: D, weight: 160 }] }, D), D, { meal: 'dinner' });
  assert.equal(strong.big, true); assert.match(strong.line, /^💪/);
  assert.deepEqual(logCheer(healthDay({ eaten: eaten('breakfast', 'snack') }, D), D, { meal: 'snack' }), { line: '🎉 Logged — 1 of 3 meals so far today', big: false });
});

test('a weigh-in: mornings in a row; a full week (and each week after) is a big one', () => {
  const days = (n) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${D}T12:00:00Z`) - i * 864e5).toISOString().slice(0, 10), weight: 160 }));
  assert.equal(weighStreak(days(3), D), 3);
  assert.equal(weighStreak([{ date: '2026-10-29' }, { date: D }], D), 1, 'a gap ends the run');
  assert.equal(weighStreak([], D), 0);
  assert.deepEqual(logCheer(healthDay({}, D), D, { weighStreak: 3 }), { line: '🎉 3 mornings in a row', big: false });
  assert.deepEqual(logCheer(healthDay({}, D), D, { weighStreak: 7 }), { line: '🎉 7 mornings in a row — a full week!', big: true });
  assert.deepEqual(logCheer(healthDay({}, D), D, { weighStreak: 14 }), { line: '🎉 14 mornings in a row — 2 weeks!', big: true });
  assert.equal(logCheer(healthDay({}, D), D, { weighStreak: 1 }).big, false);
  assert.ok(logCheer(healthDay({}, D), D, { weighStreak: 1 }).line.length > 10, 'a first weigh-in still gets a kind line');
});

test('the trackers still get the same cheer module (re-exported)', () => {
  assert.equal(C.healthDay, healthDay); assert.equal(typeof C.cheerFor, 'function'); assert.equal(C.MAIN_MEALS.length, 3);
});
