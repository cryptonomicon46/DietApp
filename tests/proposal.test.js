// ✅ Review before saving in Talk (js/proposal.js): a draft is saved exactly once, only from a live
// draft at its current version; "yes" counts only on its own; corrections add up on the current
// draft (meals and workouts), and what the phone can't place goes to the AI with the draft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/proposal.js';
import { parseMeal, parsePart } from '../js/foodText.js';
import { resize } from '../js/mealEstimate.js';
import { FOODS } from '../js/foods.js';
import { parseWorkout, needsHelp } from '../js/workoutText.js';

const tools = { parseMeal, parsePart, resize, FOODS };
const meal = (text, m = 'lunch') => ({ meal: m, items: parseMeal(text, FOODS).items });

test('a proposal saves once: the button and the voice share one commit', async () => {
  const p = P.makeProposal('meal', { x: 1 }, { now: 0 });
  let writes = 0;
  const write = async () => { writes++; return 'logged'; };
  const [a, b] = await Promise.all([P.commitOnce(p, 1, write, { now: 10 }), P.commitOnce(p, 1, write, { now: 10 })]);
  assert.equal(writes, 1);
  assert.deepEqual(a, b);
  assert.equal(p.state, 'committed');
  assert.deepEqual(await P.commitOnce(p, 1, write, { now: 20 }), a, 'again: the same answer');
  assert.equal(writes, 1);
});

test('nothing is written before commit; stale, expired and cancelled cards never write', async () => {
  let writes = 0;
  const write = async () => { writes++; };
  const p = P.makeProposal('meal', {}, { now: 0 });
  const q = P.revise(p, { y: 2 }, [], { now: 5 });
  assert.equal(q.version, 2);
  assert.deepEqual(await P.commitOnce(q, 1, write, { now: 6 }), { error: 'stale' });
  const old = P.makeProposal('meal', {}, { now: 0 });
  assert.deepEqual(await P.commitOnce(old, 1, write, { now: P.TTL + 1 }), { error: 'expired' });
  assert.equal(P.revise(old, {}, [], { now: P.TTL + 2 }), old, 'an expired card can\'t change');
  const c = P.cancel(P.makeProposal('workout', {}, { now: 0 }));
  assert.deepEqual(await P.commitOnce(c, 1, write, { now: 1 }), { error: 'cancelled' });
  assert.equal(writes, 0);
});

test('a failed write leaves the draft to try again', async () => {
  const p = P.makeProposal('meal', {}, { now: 0 });
  await assert.rejects(P.commitOnce(p, 1, async () => { throw new Error('offline'); }, { now: 1 }));
  assert.equal(p.state, 'draft');
  assert.deepEqual(await P.commitOnce(p, 1, async () => 'ok', { now: 2 }), { ok: true, result: 'ok' });
});

test('only a standalone yes confirms; "yes, but…" is a correction; okay/sure are unclear', () => {
  for (const y of ['Yes', 'yep', 'Yeah, looks good', 'log it please', 'Go ahead', "That's right", 'create it', 'save it.', 'yes log it']) assert.equal(P.replyKind(y), 'confirm', y);
  for (const n of ['cancel', 'never mind', 'forget it', "don't log it"]) assert.equal(P.replyKind(n), 'cancel', n);
  for (const u of ['okay', 'sure', 'no', '', 'um']) assert.equal(P.replyKind(u), 'unclear', u);
  for (const c of ['yes but add avocado', 'looks good, add a coffee', 'make the rice half a cup', 'no salsa']) assert.equal(P.replyKind(c), 'correct', c);
});

test('meal: remove, add, change an amount, half and double — on the phone', () => {
  const d = meal('2 eggs, 1 slice of sourdough, half an avocado');
  let r = P.amendMeal(d, 'remove the avocado and add a coffee', tools);
  assert.ok(r.ok);
  assert.deepEqual(r.draft.items.map((x) => x.food), ['egg', 'sourdough', 'dripCoffee']);
  assert.deepEqual(r.changed, [2]);
  r = P.amendMeal(r.draft, 'make the eggs 3', tools);
  assert.ok(r.ok, 'amount with the food named');
  assert.equal(r.draft.items[0].grams, 3 * FOODS.egg.unit.grams);
  r = P.amendMeal(r.draft, 'double the sourdough', tools);
  assert.ok(r.ok);
  assert.equal(r.draft.items[1].grams, 2 * d.items[1].grams);
  assert.ok(r.draft.items[1].kcal > d.items[1].kcal);
  const rice = meal('1 cup of rice and chicken');
  const h = P.amendMeal(rice, 'make the rice half a cup', tools);
  assert.ok(h.ok);
  assert.equal(h.draft.items[0].grams, Math.round(FOODS.rice.unit.grams / 2));
});

test('meal: "it was dinner" moves it; corrections add up on the current draft', () => {
  const d = meal('2 eggs and toast', 'breakfast');
  const a = P.amendMeal(d, 'it was dinner', tools);
  assert.equal(a.draft.meal, 'dinner');
  const b = P.amendMeal(a.draft, 'no toast', tools);
  assert.equal(b.draft.meal, 'dinner', 'the earlier change stays');
  assert.deepEqual(b.draft.items.map((x) => x.food), ['egg']);
});

test('meal: what the phone can\'t place goes to the AI with the current draft', () => {
  const d = meal('2 eggs and toast');
  const r = P.amendMeal(d, 'swap the toast for a bagel with lox', tools);
  assert.equal(r.ok, false);
  const text = P.mealDraftText(d, 'swap the toast for a bagel with lox');
  assert.match(text, /^I had: .*eggs?.*Change: swap the toast/i);
  assert.equal(P.amendMeal(d, 'add something weird', tools).ok, false, 'an add it can\'t read is not guessed');
});

test('workout: sets for all or one, reps, weight, rounds, add, remove', () => {
  const w = parseWorkout('Squats 3x8 at 185; bench 3x10 at 135', { today: '2026-11-01' }).workout;
  const t = { parseWorkout, needsHelp, today: '2026-11-01' };
  let r = P.amendWorkout(w, 'make it 4 sets', t);
  assert.ok(r.ok);
  assert.deepEqual(r.workout.blocks.map((b) => b.items[0].sets.length), [4, 4]);
  r = P.amendWorkout(r.workout, 'make the bench 145 for 8 reps', t);
  assert.ok(r.ok);
  assert.deepEqual(r.workout.blocks[1].items[0].sets.map((s) => [s.reps, s.weight]), [[8, 145], [8, 145], [8, 145], [8, 145]]);
  assert.deepEqual(r.workout.blocks[0].items[0].sets.map((s) => s.weight), [185, 185, 185, 185], 'squats unchanged');
  assert.deepEqual(r.changed, [r.workout.blocks[1].items[0].id]);
  r = P.amendWorkout(r.workout, 'add plank 3x45s', t);
  assert.ok(r.ok);
  assert.equal(r.workout.blocks.length, 3);
  r = P.amendWorkout(r.workout, 'remove the squats', t);
  assert.deepEqual(r.workout.blocks.map((b) => b.items[0].name), ['Bench', 'Plank']);
  assert.equal(P.amendWorkout(w, 'at 200', t).ok, false, 'a weight for "everything" needs one exercise named');
});

test('workout: superset two exercises into one block with rounds', () => {
  const w = parseWorkout('Curls 3x12 at 25; dips 3x10', { today: '' }).workout;
  const r = P.amendWorkout(w, 'superset the curls and dips', { parseWorkout, needsHelp });
  assert.ok(r.ok);
  assert.equal(r.workout.blocks.length, 1);
  assert.equal(r.workout.blocks[0].kind, 'superset');
  assert.equal(r.workout.blocks[0].rounds, 3);
  assert.deepEqual(r.workout.blocks[0].items.map((x) => x.name), ['Curls', 'Dips']);
  assert.match(P.workoutDraftText(r.workout, 'swap dips for pushups'), /3 rounds: Curls .* superset with Dips .*Change: swap dips/);
});
