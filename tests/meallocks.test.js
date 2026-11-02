// 🔒 Locking a food's amount keeps it on the coming days (blueberries stay at 0 g while you're out);
// unlocking lets the plan size it again.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/dayPlan.js';
import { stickyGrams } from '../js/plan.js';
import { BREAKFASTS } from '../js/foods.js';

const data = () => ({ profile: { sex: 'male', age: 40, heightIn: 70, weight: 180, goal: 'lose', rate: 1 }, weights: [{ date: '2026-11-01', weight: 180 }] });
const store = (d) => ({ get: (k, f) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v; } });

test('a locked amount holds on the next days, only while the slot has that food', () => {
  const t = BREAKFASTS.oatmeal, fruit = t.items.find((x) => x.options.length && /berr/i.test(x.options.join())) || t.items.find((x) => x.slot === 'fruit');
  assert.ok(fruit, 'oatmeal has a fruit slot');
  const prefs = { locks: { oatmeal: { [fruit.slot]: { food: fruit.options[0], grams: 0 } } } };
  assert.deepEqual(stickyGrams(prefs, 'oatmeal', t, {}), { [fruit.slot]: 0 });
  assert.deepEqual(stickyGrams(prefs, 'oatmeal', t, { [fruit.slot]: fruit.options[1] }), {}, 'another fruit picked: the plan sizes it');
  assert.deepEqual(stickyGrams({ locks: { oatmeal: { [fruit.slot]: null } } }, 'oatmeal', t, {}), {}, 'unlocked');
});

test('lock today → tomorrow keeps it; unlock → the plan sizes it again', () => {
  const d = data(), s = store(d), day1 = '2026-11-02', day2 = '2026-11-03';
  const m = D.planOf(d, day1).dinner, x = m.portions.find((p) => p.grams > 0 && p.slot !== 'protein') || m.portions[0];
  D.setGrams(s, day1, 'dinner', x.slot, 0);
  assert.equal(D.lockAmount(s, day1, 'dinner', x.slot, true), true);
  assert.equal(D.isLockedFor(d, D.planOf(d, day1).dinner, 'dinner', x.slot), true);
  const next = D.planOf(d, day2).dinner.portions.find((p) => p.slot === x.slot);
  assert.equal(next.grams, 0, 'still 0 g the next day');
  assert.equal(next.locked, true);
  D.lockAmount(s, day2, 'dinner', x.slot, false);
  assert.equal(d.prefs.locks.main[x.slot], null, 'kept as null so a stale copy can\'t bring it back');
  assert.ok(D.planOf(d, day2).dinner.portions.find((p) => p.slot === x.slot).grams > 0, 'sized by the plan again');
});

test('locking keeps the amount you see (passed in), not the one saved before', () => {
  const d = data(), s = store(d), day = '2026-11-02';
  const x = D.planOf(d, day).dinner.portions.find((p) => p.slot === 'veggies');
  assert.ok(x.grams > 0);
  D.lockAmount(s, day, 'dinner', x.slot, true, 0);
  assert.equal(d.prefs.locks.main[x.slot].grams, 0);
  assert.equal(D.planOf(d, '2026-11-04').dinner.portions.find((p) => p.slot === x.slot).grams, 0);
});

test('a locked protein holds only on days that protein comes round', () => {
  const d = data(), s = store(d), day = '2026-11-02';
  const x = D.planOf(d, day).dinner.portions.find((p) => p.slot === 'protein');
  D.lockAmount(s, day, 'dinner', 'protein', true, 120);
  for (const n of ['03', '04', '05', '06', '07', '08']) {
    const p = D.planOf(d, `2026-11-${n}`).dinner.portions.find((q) => q.slot === 'protein');
    if (p.food === x.food) assert.equal(p.grams, 120, n);
    else assert.equal(p.locked, false, `${n}: ${p.food} is sized by the plan`);
  }
});

test('🔁 swap a plan food for another of its slot: sized by the plan, remembered (not lunch/dinner proteins)', () => {
  const d = data(), s = store(d), day = '2026-11-02';
  const carb = D.planOf(d, day).dinner.portions.find((p) => p.slot === 'carb');
  const other = carb.options.find((f) => f !== carb.food);
  assert.equal(D.setPick(s, day, 'dinner', 'carb', other), true);
  const now = D.planOf(d, day).dinner.portions.find((p) => p.slot === 'carb');
  assert.equal(now.food, other);
  assert.ok(now.grams > 0, 'the plan sizes the new food');
  assert.equal(d.prefs.main.carb, other, 'remembered for lunch and dinner');
  assert.equal(D.planOf(d, '2026-11-03').lunch.portions.find((p) => p.slot === 'carb').food, other);
  const prot = D.planOf(d, day).dinner.portions.find((p) => p.slot === 'protein');
  D.setPick(s, day, 'dinner', 'protein', prot.options.find((f) => f !== prot.food));
  assert.equal(d.prefs.main.protein, undefined, 'proteins keep rotating day by day');
  assert.equal(D.setPick(s, day, 'dinner', 'carb', 'whey'), false, 'only that slot\'s own options');
});
