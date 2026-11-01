// 🍽 The meal sheet's new parts: ⚖️ Fit to N kcal (protein kept), the 🥤 smoothie (picked, never
// rotated in), and where each logged meal came from (sourceContext / captureMethod).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPortions, isProtein } from '../js/mealFit.js';
import { FOODS, BREAKFASTS, BREAKFAST_ROTATION } from '../js/foods.js';
import { planForDay, portionMeal } from '../js/plan.js';
import * as D from '../js/dayPlan.js';

const kcalOf = (ps, grams) => Math.round(ps.reduce((a, x) => a + (FOODS[x.food].kcal * (grams[x.slot] ?? x.grams)) / 100, 0));
const eggs = [
  { slot: 'eggs', food: 'egg', grams: 50 }, { slot: 'protein', food: 'eggWhites', grams: 240 },
  { slot: 'carb', food: 'sourdough', grams: 50 }, { slot: 'fat', food: 'avocado', grams: 30 },
];

test('fit to fewer calories keeps the protein and trims carbs and fat', () => {
  assert.ok(isProtein(FOODS.eggWhites) && !isProtein(FOODS.sourdough) && !isProtein(FOODS.avocado));
  const r = fitPortions(eggs, 300, FOODS);
  assert.equal(r.grams.protein, undefined, 'egg whites untouched');
  assert.ok(r.grams.carb < 50 && r.grams.fat < 30);
  assert.equal(r.proteinCut, false);
  assert.ok(r.reached, `came to ${r.kcal}`);
  assert.equal(r.kcal, kcalOf(eggs, r.grams));
});

test('fit to more calories grows carbs and fat, never past their range', () => {
  const r = fitPortions(eggs, 600, FOODS);
  assert.ok(r.grams.carb > 50 && r.grams.fat > 30);
  for (const x of eggs) if (r.grams[x.slot] != null) assert.ok(r.grams[x.slot] <= Math.max(FOODS[x.food].range?.[1] ?? 2000, x.grams), x.food);
});

test('too few calories to keep the protein: everything shrinks, and it says so', () => {
  const r = fitPortions(eggs, 150, FOODS);
  assert.equal(r.proteinCut, true);
  assert.ok(r.grams.protein < 240);
});

test('locked foods never move; nothing to fit returns nothing', () => {
  const r = fitPortions(eggs.map((x) => (x.slot === 'carb' ? { ...x, locked: true } : x)), 320, FOODS);
  assert.equal(r.grams.carb, undefined);
  assert.deepEqual(fitPortions([], 300, FOODS).grams, {});
});

test('the smoothie is sized to the meal, and never joins the daily rotation', () => {
  assert.deepEqual(BREAKFAST_ROTATION, ['eggs', 'oatmeal']);
  assert.ok(BREAKFASTS.smoothie);
  const m = portionMeal(BREAKFASTS.smoothie, { kcal: 450, p: 35, c: 45, f: 14 }, {});
  assert.equal(m.title, 'Protein smoothie');
  assert.ok(Math.abs(m.totals.p - 35) <= 6 && Math.abs(m.totals.c - 45) <= 10, JSON.stringify(m.totals));
  const day = { kcal: 2200, p: 180, c: 200, f: 70 };
  const seen = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map((d) => planForDay(day, d).breakfast.template));
  assert.deepEqual([...seen].sort(), ['eggs', 'oatmeal']);
  assert.equal(planForDay(day, '2026-11-02', { breakfast: { template: 'smoothie' } }).breakfast.template, 'smoothie', 'picked by hand');
});

test('where a meal came from, and how it was entered', () => {
  const cases = [
    [{}, 'plan', 'template'],
    [{ template: 'oatmeal', picked: true }, 'home', 'template'],
    [{ items: [{ food: 'egg', grams: 50 }], combo: 'c1' }, 'home', 'combo'],
    [{ prepared: { icon: '📦' } }, 'packaged', 'manual'],
    [{ prepared: { icon: '🔁' } }, 'home', 'again'],
    [{ eatout: { mode: 'estimate' } }, 'eatout', 'template'],
    [{ eatout: { mode: 'menu' }, how: 'photo', ctx: 'eatout' }, 'eatout', 'photo'],
    [{ eatout: { mode: 'menu' }, how: 'said', ctx: 'eatout' }, 'eatout', 'said'],
  ];
  for (const [c, ctx, how] of cases) assert.deepEqual(D.sourceOf(c), { sourceContext: ctx, captureMethod: how }, JSON.stringify(c));
});

test('a logged meal records its source; meals logged before stay valid', () => {
  const data = { profile: { sex: 'male', age: 40, heightIn: 70, weight: 180, goal: 'lose', rate: 1 }, weights: [{ date: '2026-11-01', weight: 180 }] };
  const st = { get: (k, f) => (k in data ? data[k] : f), set: (k, v) => { data[k] = v; } };
  D.planAs(st, '2026-11-01', 'breakfast', { prepared: { name: 'Protein bar', kcal: 200, p: 20, c: 22, f: 7, servings: 1, icon: '📦' } });
  const e = D.logPlanned(st, '2026-11-01', 'breakfast', '8:00 AM');
  assert.equal(e.sourceContext, 'packaged');
  assert.equal(e.captureMethod, 'manual');
  assert.equal(e.kcal, 200);
});
