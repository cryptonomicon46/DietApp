// 🍽 One food day, shared by the trackers and Health: the same plan, the same totals and the same
// "what's left"; logging a meal (as planned, or something else) and drinks, alcohol kept apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseTargetsOf, targetsOf, planOf, dayEntry, logPlanned, logAs, unlog, addExtras, setDone, setGrams, rollDay, nextMeal,
  drinkEntry, whatFits, customOf, consumedOf, registerFoods,
} from '../js/dayPlan.js';
import { dailyTargets } from '../js/plan.js';

const today = '2026-10-30';
const profile = { sex: 'male', age: 35, heightIn: 70, activity: 'light', pace: 'steady', goalLb: 175, phase: 'cut' };
const store = (init = {}) => { const d = JSON.parse(JSON.stringify(init)); return { d, get: (k, f) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v; } }; };
const base = () => ({ profile, weights: [{ date: '2026-10-29', weight: 182 }] });

test('base targets follow the plan and the check-ins, never below the safe minimum', () => {
  const t = baseTargetsOf(base()), raw = dailyTargets(profile, 182, 0);
  assert.equal(t.p, Math.max(raw.p, 60));
  assert.ok(t.kcal >= 1500);
  const adj = baseTargetsOf({ ...base(), macroAdjust: { p: 0, f: 0, c: -25 } });
  assert.equal(adj.kcal, t.kcal - 100, 'a −25 g carb check-in is −100 kcal');
  assert.deepEqual(targetsOf(base(), today).kcal, t.kcal, 'no workouts: today = base');
});

test('✓ As planned logs the plan, rolls a new day over and keeps the day summary in step', () => {
  const s = store({ ...base(), eaten: { date: '2026-10-29', meals: { dinner: { title: 'x', kcal: 600, p: 40, f: 20, c: 60 } }, extras: [] } });
  assert.equal(nextMeal(s.d, today), 'breakfast');
  const e = logPlanned(s, today, 'breakfast', '7:30 AM');
  assert.equal(s.d.mealLog['2026-10-29'].meals.dinner.kcal, 600, "yesterday's log went into the history");
  assert.equal(s.d.eaten.date, today);
  assert.equal(e.at, '7:30 AM');
  assert.ok(e.kcal > 200 && e.p > 15 && e.foods.length, 'a real snapshot');
  assert.equal(s.d.days[today].eaten, e.kcal);
  assert.equal(s.d.days[today].meals, 1);
  assert.equal(nextMeal(s.d, today), 'lunch');
  unlog(s, today, 'breakfast');
  assert.equal(s.d.days[today].eaten, 0);
});

test('an unexpected lunch becomes today\'s lunch and dinner re-fits around it (targets unchanged)', () => {
  const s = store(base());
  const before = planOf(s.d, today);
  logPlanned(s, today, 'breakfast');
  logAs(s, today, 'lunch', { prepared: { name: 'Burrito bowl & chips', kcal: 1050, p: 45, c: 120, f: 42, icon: '🎙️' } });
  const after = planOf(s.d, today);
  assert.equal(after.lunch.title, '🎙️ Burrito bowl & chips');
  assert.equal(s.d.eaten.meals.lunch.kcal, 1050);
  assert.ok(after.dinner.totals.kcal < before.dinner.totals.kcal - 100, 'dinner got lighter');
  assert.ok(after.dinner.totals.p >= 15, 'protein stays');
  assert.equal(targetsOf(s.d, today).kcal, targetsOf(base(), today).kcal, 'the day\'s target is untouched');
  const left = s.d.days[today].left;
  assert.equal(left.kcal, targetsOf(s.d, today).kcal - s.d.days[today].eaten);
});

test('changing a food\'s grams updates the plan, and a logged meal is corrected to match', () => {
  const s = store(base());
  const slot = planOf(s.d, today).lunch.portions[0].slot;
  logPlanned(s, today, 'lunch');
  setGrams(s, today, 'lunch', slot, 250);
  const p = planOf(s.d, today).lunch.portions.find((x) => x.slot === slot);
  assert.equal(p.grams, 250);
  assert.equal(s.d.eaten.meals.lunch.kcal, planOf(s.d, today).lunch.totals.kcal);
  assert.equal(customOf(s.d, today).lunch.grams[slot], 250);
});

test('drinks: per glass, wine pours scale, alcohol calories kept apart from protein, carbs and fat', () => {
  const red = drinkEntry('redWine', 2);
  assert.deepEqual({ kcal: red.kcal, c: red.c, alc: red.alc, p: red.p, f: red.f }, { kcal: 250, c: 8, alc: 218, p: 0, f: 0 });
  assert.equal(drinkEntry('redWine', 1, 9).kcal, 225, 'a 9 oz pour is 1.8 glasses');
  assert.equal(drinkEntry('beer', 1, 9).kcal, 155, 'pour only applies to wine');
  assert.equal(drinkEntry('beer', 0), null);
  const mine = drinkEntry(null, 1, 5, { name: 'Paloma', kcal: 220, c: 20 });
  assert.equal(mine.alc, 140);
  const s = store(base());
  addExtras(s, today, [red, mine]);
  assert.equal(consumedOf(s.d.eaten).alc, 358);
  assert.equal(s.d.days[today].alc, 358);
});

test('"Done logging today" marks the day complete (and can be undone)', () => {
  const s = store(base());
  setDone(s, today);
  assert.equal(s.d.days[today].complete, true);
  setDone(s, today, false);
  assert.equal(s.d.days[today].complete, undefined);
});

test('a new day starts from meals planned ahead for it and drops older plans', () => {
  const s = store({ ...base(), custom: { date: '2026-10-29', meals: { lunch: { lowCarb: true } } }, planned: { [today]: { dinner: { lowCarb: true } }, '2026-10-20': { lunch: {} } } });
  rollDay(s, today);
  assert.deepEqual(s.d.custom, { date: today, meals: { dinner: { lowCarb: true } } });
  assert.deepEqual(s.d.planned, {});
});

test('what fits: ranked on the phone from planned meals, saved meals and recent meals, within what\'s left', () => {
  const data = {
    ...base(),
    preparedMeals: [{ name: 'Chicken burrito bowl', kcal: 420, p: 30, c: 45, f: 14 }, { name: 'Giant lasagna', kcal: 1400, p: 50, c: 150, f: 60 }],
    mealLog: { '2026-10-28': { meals: { dinner: { title: 'Salmon, rice & veggies', kcal: 510, p: 45, c: 50, f: 14 } } } },
    eaten: { date: today, meals: { breakfast: { title: 'b', kcal: 420, p: 40, c: 30, f: 14 }, lunch: { title: 'l', kcal: 1050, p: 45, c: 120, f: 42 } }, extras: [] },
  };
  const fits = whatFits(data, today, { remaining: { kcal: 620, p: 48 } });
  assert.ok(fits.length >= 2 && fits.length <= 3);
  assert.ok(fits.every((o) => o.kcal <= 620 * 1.15), 'nothing far over what\'s left');
  assert.ok(!fits.some((o) => o.name === 'Giant lasagna'));
  assert.ok(fits.some((o) => o.from === 'you had this recently'));
  assert.deepEqual(whatFits(data, today, { remaining: { kcal: 40, p: 5 } }), [], 'nothing left: no suggestions');
});

test('foods you added yourself are known when the plan is worked out', () => {
  registerFoods({ myFoods: { my_bar: { name: 'Sam bar', p: 20, c: 25, f: 8, grams: 60, cat: 'mixed' } } });
  const s = store(base());
  logAs(s, today, 'lunch', { items: [{ food: 'my_bar', grams: 60 }] });
  assert.equal(s.d.eaten.meals.lunch.p, 20);
});
