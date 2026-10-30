// 🍽 Meals you describe stay foods you can resize: weights in, protein/carbs/fat/calories out.
// Typed macros are only for packaged meals (owner, 2026-10-30).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../js/foods.js';
import { parseMeal } from '../js/foodText.js';
import { amountOf, resize, nudge, placeItems, asMealItems, packagedAsk, macrosOf } from '../js/mealEstimate.js';
import * as D from '../js/dayPlan.js';
import { parseTalk } from '../js/talkParse.js';

const said = () => parseMeal('2 eggs, a cup of egg whites, an avocado and a slice of sourdough', FOODS).items;

test("each food is resized in its own unit or grams, and the numbers follow", () => {
  const [eggs, whites, avo, bread] = said();
  assert.deepEqual(amountOf(eggs, FOODS), { by: 'unit', value: 100, min: 25, max: 300, step: 25, text: '2 eggs', sub: '100 g' });
  assert.equal(amountOf(whites, FOODS).step, 30); assert.equal(amountOf(avo, FOODS).step, 15);
  const three = nudge(nudge(eggs, 1, FOODS), 1, FOODS);
  assert.equal(three.grams, 150); assert.equal(three.amount, '3 eggs'); assert.deepEqual({ kcal: three.kcal, p: three.p }, macrosOf(FOODS.egg, 150) && { kcal: Math.round(FOODS.egg.kcal * 1.5), p: Math.round(FOODS.egg.p * 1.5) });
  const half = resize(avo, 68, FOODS);
  assert.equal(amountOf(half, FOODS).text, '½ avocado'); assert.equal(half.kcal, Math.round(FOODS.avocado.kcal * 0.68));
  assert.equal(nudge(resize(bread, 25, FOODS), -1, FOODS).grams, 25, 'never below one step');
});

test("Claude's items become foods where the phone can place them exactly; the rest resize in servings", () => {
  const items = placeItems([{ name: 'Whole eggs', amount: '2 eggs', kcal: 140, p: 12, c: 1, f: 10 }, { name: 'Chicken tikka masala', amount: '1 bowl', kcal: 620, p: 38, c: 40, f: 30 }], FOODS, parseMeal);
  assert.equal(items[0].food, 'egg'); assert.equal(items[0].grams, 100);
  assert.equal(items[1].food, undefined); assert.equal(amountOf(items[1], FOODS).by, 'servings');
  const more = resize(items[1], 1.5, FOODS);
  assert.deepEqual([more.kcal, more.p, more.amount], [930, 57, '1½ × 1 bowl']);
});

test('the meal you keep is its foods and grams (so it stays resizable) — or null when something is only numbers', () => {
  assert.deepEqual(asMealItems(said()), [{ food: 'egg', grams: 100 }, { food: 'eggWhites', grams: 243 }, { food: 'avocado', grams: 136 }, { food: 'sourdough', grams: 50 }]);
  assert.deepEqual(asMealItems(said(), 0.5)[0], { food: 'egg', grams: 50 });
  assert.equal(asMealItems([...said(), { name: 'Mystery', kcal: 100, p: 1, c: 1, f: 1 }]), null);
});

test('Plan it: the meal becomes today\'s plan for that slot (not logged), the day re-fits, and a later resize sticks', () => {
  const data = { profile: { sex: 'male', age: 40, heightIn: 70, activity: 'moderate', goal: 'maintain' }, weights: [{ date: '2026-10-29', weight: 160 }] };
  const s = { get: (k, f) => (k in data ? data[k] : f), set: (k, v) => { data[k] = v; } };
  const today = '2026-10-30', items = asMealItems(said());
  const m = D.planAs(s, today, 'breakfast', { items });
  assert.ok(m.portions.some((p) => p.food === 'avocado'));
  assert.equal(D.logOf(data, today).meals.breakfast, undefined, 'planned, not logged');
  D.logPlanned(s, today, 'breakfast');
  assert.equal(D.logOf(data, today).meals.breakfast.kcal, m.totals.kcal);
  // Resizing the avocado afterwards (Health → the meal → amounts) corrects the logged meal.
  D.setGrams(s, today, 'breakfast', 'i2', 68);
  const less = FOODS.avocado.kcal * (1.36 - 0.68);
  assert.ok(Math.abs(D.logOf(data, today).meals.breakfast.kcal - (m.totals.kcal - less)) <= 2, 'half the avocado comes off the logged meal');
  assert.match(D.logOf(data, today).meals.breakfast.foods, /Avocado 68g/);
});

test('macros are typed only for packaged meals', () => {
  assert.equal(packagedAsk('2 eggs and a slice of sourdough'), null);
  assert.deepEqual(packagedAsk('a packaged meal'), { name: '', kcal: '', p: '', c: '', f: '' });
  assert.deepEqual(packagedAsk('Trader Joe\'s chicken burrito, packaged, 450 calories 30 g protein 12g fat'), { name: "Trader Joe's chicken burrito", kcal: '450', p: '30', c: '', f: '12' });
  assert.ok(packagedAsk('from the label: 300 kcal'));
});

test('Talk: planning ahead opens it with Plan it first; logging stays logging', () => {
  assert.deepEqual(parseTalk('Plan dinner: salmon and rice').steps[0], { do: 'diet.log', meal: 'dinner', text: 'salmon and rice', plan: true });
  assert.deepEqual(parseTalk("I'll have a burrito bowl for lunch").steps[0], { do: 'diet.log', meal: 'lunch', text: 'a burrito bowl', plan: true });
  assert.deepEqual(parseTalk('Log 2 eggs and a slice of sourdough for breakfast').steps[0], { do: 'diet.log', meal: 'breakfast', text: '2 eggs and a slice of sourdough' });
  assert.deepEqual(parseTalk('Log a packaged meal for lunch').steps[0], { do: 'diet.log', meal: 'lunch', text: 'a packaged meal' });
});
