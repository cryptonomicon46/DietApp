// 💬 Phase 8 — "Describe it": typed words → the workout model on the phone, with anything that
// wasn't said left empty and marked to check (never invented).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkout, needsHelp } from '../js/workoutText.js';
import { uncertain } from '../js/workout.js';

const shape = (w) => w.blocks.map((b) => [b.kind, b.rounds, b.items.map((i) => [i.name, i.sets.map((s) => [s.reps, s.bw ? 'bw' : s.weight])])]);

test('supersets in a sentence, "same weight" carried over, missing reps marked to check', () => {
  const r = parseWorkout('Squats x3 at 165 lbs superset with 55 lb RDLs, then lunges x3 with 45 lb dumbbells superset with rows at the same weight.');
  const w = r.workout;
  assert.deepEqual(r.unread, []);
  assert.equal(w.source, 'text');
  assert.deepEqual(w.blocks.map((b) => [b.kind, b.rounds]), [['superset', 3], ['superset', 3]]);
  assert.deepEqual(w.blocks.map((b) => b.items.map((i) => [i.name, i.sets[0].weight])), [[['Squats', 165], ['RDLs', 55]], [['Lunges', 45], ['Rows', 45]]]);
  // Reps were never said: empty and flagged, not guessed.
  for (const b of w.blocks) for (const i of b.items) for (const s of i.sets) { assert.equal(s.reps, null); assert.ok(s.uncertain.includes('reps')); }
  assert.ok(uncertain(w).length > 0);
});

test('the 4-round and 3-round lists, rep for rep, as typed on separate lines', () => {
  const { workout: w, unread } = parseWorkout('4 rounds:\nOverhead Press 12/12/11/11\nBent-over Row 12/13/14/13\nSquat 10/11/11/11\nChest Press 12/11/11/11\nBicycle Crunch 26/24/22/24\n\n3 rounds:\nAlternating Reverse Lunge 40 lb 14/14/14\nLateral Raise 20 lb 11/12/9');
  assert.deepEqual(unread, []);
  assert.deepEqual(shape(w), [
    ['circuit', 4, [['Overhead Press', [[12, null], [12, null], [11, null], [11, null]]], ['Bent-Over Row', [[12, null], [13, null], [14, null], [13, null]]], ['Squat', [[10, null], [11, null], [11, null], [11, null]]], ['Chest Press', [[12, null], [11, null], [11, null], [11, null]]], ['Bicycle Crunch', [[26, 'bw'], [24, 'bw'], [22, 'bw'], [24, 'bw']]]]],
    ['superset', 3, [['Alternating Reverse Lunge', [[14, 40], [14, 40], [14, 40]]], ['Lateral Raise', [[11, 20], [12, 20], [9, 20]]]]],
  ]);
  // Weights weren't given for the circuit: flagged; bodyweight isn't.
  assert.ok((w.blocks[0].items[0].sets[0].uncertain || []).includes('weight'));
  assert.ok(!(w.blocks[0].items[4].sets[0].uncertain || []).includes('weight'));
  // The same lists on one line read the same.
  const one = parseWorkout('4 rounds: Overhead Press 12/12/11/11, Bent-over Row 12/13/14/13, Squat 10/11/11/11, Chest Press 12/11/11/11, Bicycle Crunch 26/24/22/24. 3 rounds: Alternating Reverse Lunge 14/14/14 @ 40 lb, Lateral Raise 11/12/9 @ 20 lb');
  assert.deepEqual(shape(one.workout), shape(w));
});

test('straight sets, weight lists, bodyweight, timed and cardio', () => {
  const p = (t) => shape(parseWorkout(t).workout);
  assert.deepEqual(p('Bench 3x10 @ 135'), [['straight', 3, [['Bench', [[10, 135], [10, 135], [10, 135]]]]]]);
  assert.deepEqual(p('Bench 5x5 135, 155, 175, 185, 195'), [['straight', 5, [['Bench', [[5, 135], [5, 155], [5, 175], [5, 185], [5, 195]]]]]]);
  assert.deepEqual(p('Bench 3x10, rows 3x12'), [['straight', 3, [['Bench', [[10, null], [10, null], [10, null]]]]], ['straight', 3, [['Rows', [[12, null], [12, null], [12, null]]]]]]);
  assert.deepEqual(p('Deadlift 5x5 @ 225\nPull-ups 3x8'), [['straight', 5, [['Deadlift', Array(5).fill([5, 225])]]], ['straight', 3, [['Pull-Ups', Array(3).fill([8, 'bw'])]]]]);
  const plank = parseWorkout('Plank 3x45s').workout.blocks[0].items[0];
  assert.deepEqual(plank.sets.map((s) => [s.time, s.bw, s.uncertain || []]), Array(3).fill([45, true, []]));
  const run = parseWorkout('Run 3 miles').workout.blocks[0].items[0].sets[0];
  assert.deepEqual([run.distance, run.distUnit, run.uncertain || []], [3, 'mi', []]);
  assert.equal(parseWorkout('Bike 10 min').workout.blocks[0].items[0].sets[0].time, 600);
  assert.equal(parseWorkout('Squat 5x5 100 kg').workout.blocks[0].items[0].sets[0].unit, 'kg');
});

test('a circuit with counts before the names; a rounds header with no count is flagged', () => {
  assert.deepEqual(shape(parseWorkout('Circuit 3 rounds: 10 push-ups, 15 air squats, 20 sit-ups').workout), [['circuit', 3, [['Push-Ups', Array(3).fill([10, 'bw'])], ['Air Squats', Array(3).fill([15, 'bw'])], ['Sit-Ups', Array(3).fill([20, 'bw'])]]]]);
  const w = parseWorkout('Circuit:\n10 push-ups\n15 air squats').workout;
  assert.ok(w.blocks[0].uncertain.includes('rounds'));
});

test("what it can't place comes back unread, and only then is help worth asking for", () => {
  const ok = parseWorkout('Bench 3x10 @ 135');
  assert.equal(needsHelp(ok), false);
  const odd = parseWorkout('blah blah 12');
  assert.equal(odd.workout.blocks.length, 0);
  assert.deepEqual(odd.unread, ['blah blah 12']);
  assert.equal(needsHelp(odd), true);
  assert.equal(needsHelp(parseWorkout('')), true);
});
