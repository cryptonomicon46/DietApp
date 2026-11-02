// 🍽 The meal sheet's new parts: ⚖️ Fit to N kcal (protein kept), the 🥤 smoothie (picked, never
// rotated in), and where each logged meal came from (sourceContext / captureMethod).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPortions, fitMacros, perMealProtein, isFreeVeg } from '../js/mealFit.js';
import { FOODS, BREAKFASTS, BREAKFAST_ROTATION } from '../js/foods.js';
import { planForDay, portionMeal } from '../js/plan.js';
import * as D from '../js/dayPlan.js';

const kcalOf = (ps, grams) => Math.round(ps.reduce((a, x) => a + (FOODS[x.food].kcal * (grams[x.slot] ?? x.grams)) / 100, 0));
const eggs = [
  { slot: 'eggs', food: 'egg', grams: 50 }, { slot: 'protein', food: 'eggWhites', grams: 240 },
  { slot: 'carb', food: 'sourdough', grams: 50 }, { slot: 'fat', food: 'avocado', grams: 30 },
];

test('fit macros: protein in grams (≤ ½ the calories, ≥ 0.4 g/kg), carbs and fat in the plan\'s ratio', () => {
  const plan = { p: 72, c: 48, f: 22 };
  const a = fitMacros(400, plan, { minP: 33 });
  assert.equal(a.p, 50, 'half of 400 kcal');
  assert.ok(Math.abs((a.c * 4) / (a.c * 4 + a.f * 9) - (48 * 4) / (48 * 4 + 22 * 9)) < 0.03, 'the plan\'s carb : fat split');
  assert.ok(Math.abs(a.p * 4 + a.c * 4 + a.f * 9 - 400) <= 10);
  assert.equal(fitMacros(800, plan, { minP: 33 }).p, 72, 'a bigger meal keeps the planned protein');
  assert.equal(fitMacros(220, plan, { minP: 33 }).p, 33, 'never under 0.4 g/kg while that is ≤ 60 %');
  assert.equal(fitMacros(150, plan, { minP: 33 }).p, 23, '…and over 60 % it gives way');
  assert.equal(perMealProtein(180), 33);
  assert.equal(fitMacros(700, { p: 90, c: 20, f: 20 }, { minP: 33, maxShare: 0.6 }).p, 90, 'What\'s left can make up protein');
});

test('fit to a plan meal: lands on N, protein first, the same foods smaller or bigger, veg kept', () => {
  const data = { profile: { sex: 'male', age: 40, heightIn: 70, weight: 180, goal: 'lose', rate: 1 }, weights: [{ date: '2026-11-01', weight: 180 }] };
  for (const day of ['2026-11-02', '2026-11-03']) for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const m = D.planOf(data, day)[meal], live = m.portions.filter((x) => x.grams > 0);
    for (const n of [300, 400, 500, 600, 800]) {
      const r = fitPortions(m.portions, n, FOODS, { plan: m.target, minP: perMealProtein(180) }), tag = `${day} ${meal} ${n}`;
      assert.ok(r.reached, `${tag}: came to ${r.kcal}`);
      assert.equal(r.kcal, kcalOf(m.portions, r.grams), tag);
      for (const x of live) {
        const g = r.grams[x.slot] ?? x.grams;
        assert.ok(g > 0, `${tag}: ${x.food} stays in the meal`);
        if (n < m.totals.kcal) assert.ok(g <= x.grams, `${tag}: ${x.food} never grows when fitting down`);
        else assert.ok(g >= x.grams, `${tag}: ${x.food} never shrinks when fitting up`);
        if (isFreeVeg(FOODS[x.food]) && n >= 350) assert.equal(g, x.grams, `${tag}: veg kept`);
      }
      // A lean protein reaches its aim; a fatty one (salmon) gets as close as its fat allows.
      const lean = live.some((x) => ['chicken', 'eggWhites', 'whey', 'trout', 'beef'].includes(x.food));
      if (lean && (n < m.totals.kcal || r.aim.p <= m.totals.p)) assert.ok(r.macros.p >= r.aim.p - 5, `${tag}: protein ${r.macros.p} vs aim ${r.aim.p}`);
      assert.ok(r.macros.p * 4 <= Math.max(n * 0.55, m.totals.p * 4 * 1.15), `${tag}: protein isn't more than about half`);
    }
  }
});

test('locked foods never move; nothing to fit returns nothing', () => {
  const r = fitPortions(eggs.map((x) => (x.slot === 'carb' ? { ...x, locked: true } : x)), 320, FOODS);
  assert.equal(r.grams.carb, undefined);
  assert.deepEqual(fitPortions([], 300, FOODS).grams, {});
});

test('What\'s left: aims for the day\'s remaining macros', () => {
  const aim = { p: 60, c: 20, f: 15 };
  const r = fitPortions(eggs, 480, FOODS, { aim });
  assert.deepEqual(r.aim, aim);
  assert.ok(r.reached && r.macros.p >= 52, JSON.stringify(r.macros));
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
