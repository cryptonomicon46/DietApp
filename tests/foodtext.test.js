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
