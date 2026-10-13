import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets, planForDay, suggestAdjustment, weeklyTrend, groceryList } from '../js/plan.js';

const man = { sex: 'male', age: 35, heightIn: 70, activity: 'light', pace: 'steady', goalLb: 180 };
const woman = { sex: 'female', age: 30, heightIn: 64, activity: 'moderate', pace: 'gentle', goalLb: 135 };

test('daily targets are a moderate deficit with macros adding up', () => {
  for (const [p, w] of [[man, 210], [woman, 160]]) {
    const t = dailyTargets(p, w);
    assert.ok(t.kcal < t.tdee, 'below maintenance');
    assert.ok(t.kcal >= t.tdee * 0.75 - 10, 'deficit capped at 25%');
    assert.ok(t.lbPerWeek <= 2);
    assert.ok(Math.abs(t.p * 4 + t.f * 9 + t.c * 4 - t.kcal) < 15, 'macros match calories');
    assert.ok(t.p >= p.goalLb * 0.9, 'protein ~1 g/lb goal');
  }
});

test('calorie floor holds for small people', () => {
  const t = dailyTargets({ ...woman, heightIn: 58, age: 60, activity: 'sedentary', pace: 'faster', goalLb: 100 }, 110);
  assert.ok(t.kcal >= 1200);
});

test('each meal lands close to its target over a 2-week rotation', () => {
  for (const [p, w] of [[man, 210], [woman, 160]]) {
    const t = dailyTargets(p, w);
    for (let i = 0; i < 14; i++) {
      const plan = planForDay(t, new Date(2026, 9, 1 + i));
      let day = 0;
      for (const meal of Object.values(plan)) {
        assert.ok(Math.abs(meal.totals.p - meal.target.p) <= 6, `${meal.title} protein ${meal.totals.p} vs ${meal.target.p}`);
        assert.ok(Math.abs(meal.totals.kcal - meal.target.kcal) <= 90, `${meal.title} kcal ${meal.totals.kcal} vs ${meal.target.kcal}`);
        for (const x of meal.portions) assert.ok(x.grams > 0);
        day += meal.totals.kcal;
      }
      assert.ok(Math.abs(day - t.kcal) <= 120, `day total ${day} vs ${t.kcal}`);
    }
  }
});

test('swapping changes the meal', () => {
  const t = dailyTargets(man, 210);
  const d = new Date(2026, 9, 13);
  assert.notEqual(planForDay(t, d).dinner.title, planForDay(t, d, { dinner: 1 }).dinner.title);
  assert.notEqual(planForDay(t, d).breakfast.title, planForDay(t, d, { breakfast: 1 }).breakfast.title);
});

const series = (start, perWeek, days) => Array.from({ length: days }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
  weight: +(start + (perWeek / 7) * i).toFixed(1),
}));

test('trend and calorie adjustment', () => {
  assert.equal(suggestAdjustment(series(200, -1, 7), 1.5), null, 'needs 2 weeks');
  assert.ok(Math.abs(weeklyTrend(series(200, -1.5, 21)).lbPerWeek + 1.5) < 0.05);
  assert.equal(suggestAdjustment(series(200, -1.5, 21), 1.5).delta, 0);
  assert.equal(suggestAdjustment(series(200, -0.3, 21), 1.5).delta, -100);
  assert.equal(suggestAdjustment(series(200, -3, 21), 1.5).delta, 100);
});

test('grocery list covers every planned food', () => {
  const totals = groceryList(dailyTargets(man, 210), new Date(2026, 9, 13));
  for (const f of ['chicken', 'beef', 'salmon', 'cod', 'trout', 'rice', 'veggies', 'egg', 'oats', 'whey']) {
    assert.ok(totals[f] > 0, f);
  }
});
