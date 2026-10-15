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
        for (const x of meal.portions) assert.ok(x.grams >= 0);
        day += meal.totals.kcal;
      }
      assert.ok(Math.abs(day - t.kcal) <= 120, `day total ${day} vs ${t.kcal}`);
    }
  }
});

test('swapping foods and meals', () => {
  const t = dailyTargets(man, 210);
  const d = new Date(2026, 9, 13);
  const base = planForDay(t, d);
  const custom = planForDay(t, d, { dinner: { picks: { protein: 'steak', carb: 'sweetPotato', fat: 'butter' } } });
  assert.equal(custom.dinner.title, 'Sirloin steak, sweet potato & veggies');
  assert.deepEqual(custom.dinner.portions.map((p) => p.food), ['steak', 'sweetPotato', 'veggies', 'butter']);
  assert.ok(Math.abs(custom.dinner.totals.p - custom.dinner.target.p) <= 6);
  const otherBreakfast = base.breakfast.template === 'eggs' ? 'oatmeal' : 'eggs';
  assert.equal(planForDay(t, d, { breakfast: { template: otherBreakfast } }).breakfast.template, otherBreakfast);
  // Sticky preferences apply to every day; protein picks don't leak into prefs.
  const pref = planForDay(t, d, {}, { oatmeal: { fat: 'almondButter' } });
  const oat = planForDay(t, d, { breakfast: { template: 'oatmeal' } }, { oatmeal: { fat: 'almondButter' } });
  assert.ok(oat.breakfast.portions.some((p) => p.food === 'almondButter'));
  assert.ok(pref.lunch.portions[0].food);
  // White vs dark chicken.
  const thigh = planForDay(t, d, { lunch: { picks: { protein: 'thigh' } } });
  assert.equal(thigh.lunch.portions[0].food, 'thigh');
});

test('locked slider keeps its grams and the rest re-balances calories', () => {
  const t = dailyTargets(man, 210);
  const d = new Date(2026, 9, 13);
  const auto = planForDay(t, d, { breakfast: { template: 'oatmeal' } }).breakfast;
  const autoOats = auto.portions.find((p) => p.slot === 'carb').grams;
  const more = planForDay(t, d, { breakfast: { template: 'oatmeal', grams: { carb: autoOats + 40 } } }).breakfast;
  const oats = more.portions.find((p) => p.slot === 'carb');
  assert.equal(oats.grams, autoOats + 40);
  assert.ok(oats.locked);
  const fatAuto = auto.portions.find((p) => p.slot === 'fat').grams;
  const fatMore = more.portions.find((p) => p.slot === 'fat').grams;
  assert.ok(fatMore < fatAuto, 'nut butter trimmed to make room for extra oats');
  assert.ok(Math.abs(more.totals.kcal - more.target.kcal) <= 60, `${more.totals.kcal} vs ${more.target.kcal}`);
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

test('weekly check-in recommendations', async () => {
  const { recommendCheckin, CHECKIN_OPTIONS, deltaKcal } = await import('../js/plan.js');
  assert.equal(recommendCheckin(null, 'great').id, 'keep');
  assert.equal(recommendCheckin(null, 'hungry').id, 'moreProtein');
  assert.equal(recommendCheckin({ delta: -100, lost: 0.3 }, 'great').id, 'minus100');
  assert.equal(recommendCheckin({ delta: -100, lost: -0.4 }, 'okay').id, 'minus200');
  assert.equal(recommendCheckin({ delta: 100, lost: 2.5 }, 'tired').id, 'plus200');
  assert.equal(recommendCheckin({ delta: 0, lost: 1.2 }, 'hungry').id, 'moreProtein');
  const k = Object.fromEntries(CHECKIN_OPTIONS.map((o) => [o.id, deltaKcal(o.delta)]));
  assert.deepEqual([k.minus100, k.plus100, k.moreProtein], [-100, 100, 0]);
  assert.ok(Math.abs(k.minus200 + 200) <= 5 && Math.abs(k.moreCarbs) <= 5);
});

test('default plan: 162 → 156 lb at a steady pace', async () => {
  const { goalProjection } = await import('../js/plan.js');
  const prof = { sex: 'male', age: 35, heightIn: 70, activity: 'tracked', pace: 'steady', goalLb: 156 };
  const t = dailyTargets(prof, 162);
  assert.ok(t.lbPerWeek >= 1 && t.lbPerWeek <= 1.25, `${t.lbPerWeek}`);
  const proj = goalProjection(prof, 162, new Date(2026, 9, 13), t.lbPerWeek);
  assert.ok(proj.weeks >= 5 && proj.weeks <= 6, `${proj.weeks}`);
  assert.ok(t.kcal < t.tdee && t.kcal >= t.tdee * 0.75 - 10);
  const atGoal = dailyTargets(prof, 155.8);
  assert.equal(atGoal.lbPerWeek, 0);
  assert.ok(Math.abs(atGoal.kcal - atGoal.tdee) <= 10, 'maintenance at goal');
});

test('custom meal: your own foods, grams and optional typed macros', async () => {
  const { customMeal } = await import('../js/plan.js');
  const t = dailyTargets(man, 210);
  const items = [{ food: 'whey', grams: 30 }, { food: 'frozenBerries', grams: 140 }, { food: 'almondButter', grams: 16 }];
  const plan = planForDay(t, new Date(2026, 9, 13), { breakfast: { items } });
  const b = plan.breakfast;
  assert.ok(b.custom);
  assert.equal(b.title, 'Whey protein, frozen mixed berries, almond butter');
  assert.deepEqual(b.portions.map((x) => [x.food, x.grams]), [['whey', 30], ['frozenBerries', 140], ['almondButter', 16]]);
  assert.equal(b.totals.p, Math.round(24 + 0.98 + 3.36));
  assert.ok(b.target.kcal > 0, 'still compared with the breakfast target');
  const typed = customMeal({ items, manual: { kcal: 320, p: 30, f: '', c: '' } }, b.target);
  assert.deepEqual([typed.totals.kcal, typed.totals.p, typed.manual], [320, 30, true]);
  assert.equal(typed.totals.f, b.totals.f, 'blank fields keep the computed value');
});

test('no check-in cut below the calorie floor', async () => {
  const { recommendCheckin } = await import('../js/plan.js');
  const r = recommendCheckin({ delta: -100, lost: 0.1, target: 1, reason: 'slower than planned' }, 'great', true);
  assert.equal(r.id, 'keep');
  assert.match(r.why, /safe minimum/);
});

test('broccoli and cauliflower swap in for mixed veggies', async () => {
  const { portionMeal } = await import('../js/plan.js');
  const { MAIN_MEAL, FOODS } = await import('../js/foods.js');
  const m = portionMeal(MAIN_MEAL, { kcal: 600, p: 45, f: 15, c: 60 }, { picks: { protein: 'chicken', veggies: 'broccoli' } });
  const veg = m.portions.find((x) => x.slot === 'veggies');
  assert.equal(veg.food, 'broccoli');
  assert.deepEqual(veg.options, ['veggies', 'broccoli', 'cauliflower', 'salad']);
  assert.ok(FOODS.cauliflower.kcal < FOODS.broccoli.kcal);
});

test('eating out: estimates and menu numbers', async () => {
  const { eatOutMeal, EAT_OUT } = await import('../js/plan.js');
  const est = eatOutMeal({ eatout: { mode: 'estimate', dish: 'burger', size: 'large', ate: 0.5, place: 'Five Guys' } });
  assert.equal(est.totals.kcal, Math.round(EAT_OUT.burger.kcal * 1.3 * 0.5));
  assert.match(est.title, /Ate out at Five Guys: burger & fries/);
  const menu = eatOutMeal({ eatout: { mode: 'menu', menu: { kcal: 800, p: 45, f: '', c: '' } } });
  assert.equal(menu.totals.kcal, 800);
  assert.equal(menu.totals.p, 45);
  assert.equal(menu.totals.f, Math.round(800 * 0.4 / 9));
});

test('fitting a saved combo to a meal target', async () => {
  const { fitItems } = await import('../js/plan.js');
  const { FOODS } = await import('../js/foods.js');
  const items = [{ food: 'whey', grams: 30 }, { food: 'oatMilk', grams: 240 }, { food: 'frozenBerries', grams: 140 }];
  const kcal = (xs) => xs.reduce((a, x) => a + FOODS[x.food].kcal * x.grams / 100, 0);
  const fit = fitItems(items, 450);
  assert.ok(Math.abs(kcal(fit) - 450) < 40, `fitted to ${kcal(fit)}`);
  for (const x of fit) assert.equal(x.grams % FOODS[x.food].range[2], 0, `${x.food} on its slider step`);
  assert.deepEqual(fitItems([], 400), []);
});

test('an afternoon snack comes out of lunch and dinner', async () => {
  const { planForDay } = await import('../js/plan.js');
  const day = { kcal: 1800, p: 160, f: 55, c: 160 };
  const date = new Date('2026-10-14T12:00:00');
  const without = planForDay(day, date, {}, {});
  const withSnack = planForDay(day, date, { snack: { on: true, items: [{ food: 'apple', grams: 182 }, { food: 'almonds', grams: 28 }] } }, {});
  assert.equal(without.snack, undefined);
  const s = withSnack.snack.totals.kcal;
  assert.ok(s > 200 && s < 300, `apple + almonds ≈ 257 kcal, got ${s}`);
  const drop = (without.lunch.target.kcal + without.dinner.target.kcal) - (withSnack.lunch.target.kcal + withSnack.dinner.target.kcal);
  assert.ok(Math.abs(drop - s) <= 2, `lunch+dinner targets drop by the snack (${drop} vs ${s})`);
  assert.equal(withSnack.breakfast.target.kcal, without.breakfast.target.kcal);
  assert.equal(planForDay(day, date, { snack: { on: true, items: [] } }, {}).snack.title, 'Afternoon snack');
});
