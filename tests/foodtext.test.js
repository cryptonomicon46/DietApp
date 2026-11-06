// 🎙️ "Tell me" read on the phone: everyday sentences become foods you already know, with amounts;
// what it can't place is listed (for Claude, or for you), never guessed silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../js/foods.js';
import { parseMeal, totalOf } from '../js/foodText.js';

const names = (r) => r.items.map((i) => [i.food, i.amount]);

test('a spoken breakfast: words for numbers, halves, slices and plain "coffee"', () => {
  const r = parseMeal('Two eggs, two slices of sourdough, half an avocado and coffee', FOODS);
  assert.deepEqual(names(r), [['egg', '2 eggs'], ['sourdough', '2 slices'], ['avocado', '½ avocado'], ['dripCoffee', '1 cup']]);
  assert.deepEqual(r.unread, []);
  const t = totalOf(r.items);
  assert.ok(t.kcal > 450 && t.kcal < 560 && t.p >= 20);
});

test('weights, "1 and a half", "+" and "with"', () => {
  assert.deepEqual(names(parseMeal('150g chicken with rice and broccoli', FOODS)), [['chicken', '150 g'], ['rice', '1 cup'], ['broccoli', '1 cup']]);
  assert.deepEqual(names(parseMeal('1 and a half cups of greek yogurt + blueberries', FOODS)), [['greekYogurt', '1½ cups'], ['berries', '1 cup']]);
  assert.equal(parseMeal('8 oz steak', FOODS).items[0].grams, 227);
});

test('meat or fish with no amount is a typical portion, marked to check; unknown foods are listed', () => {
  const r = parseMeal('salmon and 3 slices pizza', FOODS);
  assert.equal(r.items[0].food, 'salmon'); assert.equal(r.items[0].guess, true);
  assert.deepEqual(r.unread, ['3 slices pizza']);
  assert.deepEqual(parseMeal('', FOODS), { items: [], unread: [] });
});

test('🍲 a dish is left for Claude, not read as its main ingredient; describing words are still fine', async () => {
  const { placeItems } = await import('../js/mealEstimate.js');
  for (const t of ['Two cups of chicken noodle soup', 'beef stew', 'fried chicken', 'chicken tikka masala'])
    assert.deepEqual(parseMeal(t, FOODS).items, [], t);
  assert.deepEqual(parseMeal('Two cups of chicken noodle soup', FOODS).unread, ['Two cups of chicken noodle soup']);
  const foods = (t) => parseMeal(t, FOODS).items.map((x) => x.food);
  assert.deepEqual(foods('grilled chicken and rice'), ['chicken', 'rice']);
  assert.deepEqual(foods('2 large eggs and toast'), ['egg', 'wheatBread']);
  assert.deepEqual(foods('8 oz grilled salmon'), ['salmon']);
  assert.deepEqual(foods('plain greek yogurt with blueberries'), ['greekYogurt', 'berries']);
  assert.deepEqual(foods('I had 2 scrambled eggs for breakfast'), ['egg']);
  // Claude's answer for the soup stays the soup (its own numbers), not chicken breast.
  const [soup] = placeItems([{ name: 'Chicken noodle soup', amount: '2 cups', kcal: 250, p: 18, c: 26, f: 8 }], FOODS, parseMeal);
  assert.equal(soup.food, undefined);
  assert.equal(soup.kcal, 250);
});
