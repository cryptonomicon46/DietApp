import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, matchExercise, describe } from '../js/commands.js';

const one = (t, ids) => parseCommand(t, ids).actions;

test('exercise names', () => {
  assert.equal(matchExercise('bulgarian split squats'), 'splitSquat');
  assert.equal(matchExercise('Squats'), 'backSquat');
  assert.equal(matchExercise('squats', ['frontSquat']), 'frontSquat', 'prefer the squat in today\'s session');
  assert.equal(matchExercise('bench press'), 'bench');
  assert.equal(matchExercise('incline dumbbell press'), 'inclineDb');
  assert.equal(matchExercise('RDLs'), 'rdl');
  assert.equal(matchExercise('pull-ups'), 'pullUp');
  assert.equal(matchExercise('lateral raises'), 'lateralRaise');
  assert.equal(matchExercise('tricep pushdowns'), 'pushdown');
  assert.equal(matchExercise('hammer curls'), 'hammerCurl');
});

test('sets, reps, weights in many phrasings', () => {
  let a = one('squats 3 sets of 5 at 185');
  assert.deepEqual([a[0].exercise, a[0].sets.length, a[0].sets[0]], ['backSquat', 3, { r: 5, w: 185 }]);
  a = one('Bench 135 for 8, 8, 7');
  assert.deepEqual(a[0].sets.map((s) => s.r), [8, 8, 7]);
  assert.equal(a[0].sets[0].w, 135);
  a = one('add bulgarian split squats 3x10 at 40 pounds');
  assert.deepEqual([a[0].exercise, a[0].add, a[0].sets.length, a[0].sets[0].w], ['splitSquat', true, 3, 40]);
  a = one('curls thirty pounds twelve reps');
  assert.deepEqual([a[0].exercise, a[0].sets[0]], ['dbCurl', { r: 12, w: 30 }]);
  a = one('one hundred eighty five for five');
  assert.deepEqual(a[0].sets[0], { r: 5, w: 185 });
  a = one('rows 4 sets of 10 at 95 and then lateral raises 3 sets of 15 at 20');
  assert.deepEqual(a.map((x) => [x.exercise, x.sets.length]), [['bbRow', 4], ['lateralRaise', 3]]);
  a = one('pull ups 10 reps');
  assert.deepEqual([a[0].exercise, a[0].sets[0]], ['pullUp', { r: 10, w: null }]);
});

test('one more set', () => {
  const a = one('one more set of 8');
  assert.deepEqual([a[0].exercise, a[0].sets], [null, [{ r: 8, w: null }]]);
  assert.equal(one('another set of 6 at 45')[0].sets[0].w, 45);
});

test('weigh-in and nonsense', () => {
  assert.deepEqual(one('weigh in 161.4')[0], { type: 'weight', lb: 161.4 });
  assert.equal(parseCommand('how was my week').understood, false);
});

test('reorder commands', () => {
  const ids = ['backSquat', 'bench', 'bbRow', 'rdl'];
  assert.deepEqual(parseCommand('move rows after squats', ids).actions, [{ type: 'move', exercise: 'bbRow', after: 'backSquat' }]);
  assert.deepEqual(parseCommand('do RDLs before bench', ids).actions, [{ type: 'move', exercise: 'rdl', before: 'bench' }]);
  assert.deepEqual(parseCommand('do squats last', ids).actions, [{ type: 'move', exercise: 'backSquat', to: 'end' }]);
  assert.deepEqual(parseCommand('bench first', ids).actions, [{ type: 'move', exercise: 'bench', to: 'start' }]);
  // Logging sets still works when "after" appears with numbers.
  assert.equal(parseCommand('squats 3 sets of 5 at 185', ids).actions[0].type, 'sets');
});

test('heel raises are bodyweight', () => {
  const { actions } = parseCommand('heel raises 3 sets of 15', []);
  assert.equal(actions[0].exercise, 'heelRaise');
  assert.equal(describe(actions[0]), 'Bodyweight heel raise: 3 sets × 15, 15, 15 (bodyweight)');
});

test('rep lists without a weight', () => {
  const { actions } = parseCommand('pull ups 8, 7, 6 reps', ['pullUp']);
  assert.deepEqual(actions[0].sets, [{ r: 8, w: null }, { r: 7, w: null }, { r: 6, w: null }]);
});
