import test from 'node:test';
import assert from 'node:assert/strict';
import { planCsvRows } from '../js/poster.js';

test('meal plan CSV has foods, meal totals, the day target and saved combos', () => {
  const day = { date: '2026-10-14', target: { kcal: 1600, p: 156, f: 48, c: 136 }, meals: [
    { label: 'Breakfast', title: 'Whey shake', totals: { kcal: 400, p: 35, f: 12, c: 40 }, items: [{ name: 'Whey protein', amount: '1 scoop', grams: 30, kcal: 120, p: 24, f: 2, c: 3 }] },
    { label: 'Dinner', title: 'Ate out: sushi', totals: { kcal: 900, p: 35, f: 20, c: 140 }, items: [] },
  ] };
  const rows = planCsvRows(day, [{ name: 'Eggs & toast', kind: 'breakfast', items: [{ name: 'Whole eggs', amount: '2 eggs', grams: 100, kcal: 143, p: 13, f: 10, c: 1 }] }]);
  assert.deepEqual(rows.map((r) => r.food), ['Whey protein', 'MEAL TOTAL', 'Ate out: sushi', 'MEAL TOTAL', 'DAY TARGET', 'Whole eggs']);
  assert.equal(rows.at(-1).section, 'saved combo');
  assert.equal(rows.find((r) => r.food === 'DAY TARGET').kcal, 1600);
});
