// 🍽 Spoken meals without commas keep every food, and "Add … to dinner" adds to the meal as it
// stands (logged stays logged) instead of replacing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeal } from '../js/foodText.js';
import { FOODS } from '../js/foods.js';
import * as D from '../js/dayPlan.js';

test('a spoken list without commas keeps every food, with its own amount', () => {
  const foods = (t) => parseMeal(t, FOODS).items.map((x) => x.food);
  assert.deepEqual(foods('whey protein frozen berries and peanut butter'), ['whey', 'frozenBerries', 'pb']);
  assert.deepEqual(foods('chicken thigh sweet potato and veggies'), ['thigh', 'sweetPotato', 'veggies']);
  const r = parseMeal('1 scoop whey protein 1 cup frozen berries and 1 tbsp peanut butter', FOODS).items;
  assert.deepEqual(r.map((x) => [x.food, x.grams]), [['whey', 30], ['frozenBerries', 140], ['pb', 16]]);
  assert.deepEqual(foods('2 eggs Whole eggs'), ['egg'], 'the same food named twice is one food');
});

const day = '2026-11-02';
const store = () => {
  const data = { profile: { sex: 'male', age: 40, heightIn: 70, weight: 180, goal: 'lose', rate: 1 }, weights: [{ date: day, weight: 180 }] };
  return { data, get: (k, f) => (k in data ? data[k] : f), set: (k, v) => { data[k] = v; } };
};

test('add to a logged dinner: its foods plus the new ones, still logged, more calories', () => {
  const s = store();
  D.logAs(s, day, 'dinner', { items: [{ food: 'whey', grams: 30 }, { food: 'pb', grams: 16 }] });
  const before = D.logOf(s.data, day).meals.dinner.kcal;
  const r = D.addToMeal(s, day, 'dinner', { items: [{ food: 'frozenBerries', grams: 140 }, { food: 'pb', grams: 16 }] });
  assert.equal(r.logged, true);
  const items = D.customOf(s.data, day).dinner.items;
  assert.deepEqual(items.map((x) => [x.food, x.grams]), [['whey', 30], ['pb', 32], ['frozenBerries', 140]], 'whey kept, peanut butter doubled, berries added');
  assert.ok(D.logOf(s.data, day).meals.dinner.kcal > before);
});

test('add to a planned dinner keeps the plan\'s foods and stays planned; a packaged meal gets an extra', () => {
  const s = store();
  const plan = D.planOf(s.data, day).dinner.portions.filter((x) => x.grams > 0).length;
  D.addToMeal(s, day, 'dinner', { items: [{ food: 'frozenBerries', grams: 140 }] });
  assert.equal(D.customOf(s.data, day).dinner.items.length, plan + 1);
  assert.equal(D.logOf(s.data, day).meals.dinner, undefined, 'not logged by adding');
  D.logAs(s, day, 'lunch', { prepared: { name: 'Protein bar', kcal: 200, p: 20, c: 22, f: 7, servings: 1, icon: '📦' } });
  const r = D.addToMeal(s, day, 'lunch', { items: [{ food: 'dripCoffee', grams: 355 }], entry: { title: '☕ Coffee', kcal: 5, p: 0, c: 0, f: 0 } });
  assert.equal(r.mode, 'extra');
  assert.match(D.logOf(s.data, day).extras.at(-1).title, /with lunch/);
});

test('Undo after adding puts the meal and the extras back', () => {
  const s = store();
  D.logAs(s, day, 'dinner', { items: [{ food: 'whey', grams: 30 }] });
  const snap = D.mealSnapshot(s, day, 'dinner');
  D.addToMeal(s, day, 'dinner', { items: [{ food: 'pb', grams: 16 }] });
  D.restoreMeal(s, day, 'dinner', snap);
  assert.deepEqual(D.customOf(s.data, day).dinner.items, [{ food: 'whey', grams: 30 }]);
});
