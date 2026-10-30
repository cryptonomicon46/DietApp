// 💪 Health: Diet in plain terms — goal, phase, today's progress, weight trend, and "N of the last 7
// days on target" (no coins, no streaks). Worked out from your own copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onTarget, consistency, dietSummary, fitnessSummary, healthHtml } from '../family/health.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const today = '2026-10-28';

test('a day is on target when its meals are logged and calories are within 10% (at least 150 kcal)', () => {
  assert.equal(onTarget(null), null);
  assert.equal(onTarget({ eaten: 0, target: 2000 }), null, 'nothing logged: not counted either way');
  assert.equal(onTarget({ eaten: 900, target: 2000, meals: 1 }), null, 'half a day logged: not counted');
  assert.equal(onTarget({ eaten: 2150, target: 2000, meals: 3 }), true);
  assert.equal(onTarget({ eaten: 1820, target: 2000, meals: 3 }), true);
  assert.equal(onTarget({ eaten: 2400, target: 2000, meals: 3 }), false);
  assert.equal(onTarget({ eaten: 1450, target: 1400, meals: 3 }), true, 'small targets get ±150');
});

test('consistency counts the 7 days before today', () => {
  const days = {
    '2026-10-21': { eaten: 2000, target: 2000, meals: 3 }, '2026-10-22': { eaten: 2600, target: 2000, meals: 3 },
    '2026-10-24': { eaten: 1950, target: 2000, meals: 3 }, '2026-10-27': { eaten: 2050, target: 2000, meals: 3 },
    '2026-10-28': { eaten: 2000, target: 2000, meals: 3 }, // today: not counted yet
  };
  const c = consistency(days, today);
  assert.equal(c.of, 7); assert.equal(c.on, 3); assert.equal(c.logged, 4);
  assert.deepEqual(c.marks.map((m) => m.state), ['on', 'off', 'none', 'on', 'none', 'none', 'on']);
});

test('diet summary: phase, goal, today from the trackers (or the plan), weight trend', () => {
  const data = {
    profile: { sex: 'male', age: 40, heightIn: 70, goalLb: 175, phase: 'cut', phaseStart: '2026-10-07', pace: 'steady' },
    weights: [{ date: '2026-10-07', weight: 190 }, { date: '2026-10-14', weight: 188.8 }, { date: '2026-10-21', weight: 187.9 }, { date: '2026-10-28', weight: 187 }],
    days: { [today]: { eaten: 1240, target: 2050, protein: 96, proteinTarget: 180, left: { kcal: 810, p: 84, c: 120, f: 30 }, meals: 2 } },
  };
  const d = dietSummary(data, today);
  assert.equal(d.phaseLabel, 'Cut'); assert.equal(d.week, 4); assert.equal(d.toGoLb, 12);
  assert.deepEqual([d.today.kcal, d.today.kcalTarget, d.today.p, d.today.pTarget], [1240, 2050, 96, 180]);
  assert.match(d.trendText, /losing 1\.0 lb\/week/);
  // No day recorded yet today: the plan's targets, nothing eaten.
  const fresh = dietSummary({ ...data, days: {} }, today);
  assert.equal(fresh.today.kcal, 0); assert.ok(fresh.today.kcalTarget > 1500);
  // Not set up: says so, invents nothing.
  assert.equal(dietSummary({}, today).set, false);
  assert.equal(dietSummary({}, today).today, null);
});

test("the Health screen: Today's anchors first, calm, private, escapes what it shows", () => {
  const html = healthHtml({ profile: { sex: 'female', age: 35, heightIn: 64, phase: 'maintain' }, weights: [{ date: today, weight: 140 }], workouts: [{ name: 'Run', start: '2026-10-27T07:00' }] }, { esc, today, sharing: '🔒 Private <b>' });
  assert.match(html, /Maintenance/);
  // Weighed in today: a quiet ✓ line, not the form.
  assert.match(html, /<b>Weight<\/b> <span class="good">✓ 140\.0 lb<\/span>/);
  assert.ok(!html.includes('data-weigh'));
  // Food: the next meal with its quick ways to log it.
  assert.match(html, /Breakfast is next/);
  for (const a of ['plan:breakfast', 'photo:breakfast', 'tell:breakfast', 'out:breakfast']) assert.ok(html.includes(`data-ml="${a}"`), a);
  // Today first, then Nutrition & plan, then More (weight trend, devices).
  assert.ok(html.indexOf('hl-anchors') < html.indexOf('Nutrition &amp; plan') && html.indexOf('Nutrition &amp; plan') < html.indexOf('Weight trend'));
  assert.match(html, /href="\.\.\/#weight"><span>⚖️ Weight trend/);
  assert.match(html, /href="\.\.\/#today">Today's plan ›/);
  assert.match(html, /\/ \d[\d,]* kcal/);
  assert.ok(!/🪙|coins|streak|failed|behind plan/i.test(html), 'no coins, streaks or failure words');
  assert.ok(html.includes('&#60;b&#62;') && !html.includes('Private <b>'), 'escaped');
  assert.equal(fitnessSummary({ workouts: [{ start: '2026-10-27T07:00' }, { start: '2026-10-01T07:00' }] }, today).week, 1);
});

test('Health: the weigh-in form until today is in; one quiet "Next"; plan status from the plan module', () => {
  const p = { sex: 'female', age: 35, heightIn: 64, phase: 'cut', goalLb: 130, phaseStart: '2026-10-01' };
  const html = healthHtml({ profile: p, weights: [{ date: '2026-10-20', weight: 141 }] }, { esc, today, hour: 7, sharing: '' });
  assert.match(html, /<form class="hl-weigh" data-weigh>/);
  assert.match(html, /placeholder="141\.0"/);
  assert.match(html, /Next: log today&#39;s weight|Next: log today's weight/);
  assert.match(html, /hl-row2 hot"><span class="hl-ic" aria-hidden="true">⚖️/, 'the weight row is the emphasised one in the morning');
  assert.equal((html.match(/hl-row2 hot/g) || []).length, 1, 'only one emphasis');
  assert.match(html, /week 4 of 8/);
  assert.match(html, /Too early to tell/);
  // The reminder only once its state is known.
  assert.ok(!html.includes('weighremind'));
  assert.match(healthHtml({ profile: p, weights: [] }, { esc, today, sharing: '', reminder: false }), /Morning weigh-in reminder<\/span><span class="go">Off · turn on/);
  assert.match(healthHtml({ profile: p, weights: [] }, { esc, today, sharing: '', reminder: true }), /On · turn off/);
});

test('the food anchor: next meal, adapting after a bigger meal, kind words for what\'s left, done for the day', async () => {
  const { foodState, nextUp, leftText } = await import('../family/health.js');
  const profile = { sex: 'male', age: 35, heightIn: 70, phase: 'cut', goalLb: 175, activity: 'light', pace: 'steady' };
  const weights = [{ date: today, weight: 182 }];
  const fresh = foodState({ profile, weights }, today, 8);
  assert.equal(fresh.next, 'breakfast'); assert.ok(fresh.title && fresh.kcal > 200);
  assert.deepEqual(nextUp({ hour: 8, weighed: true, food: fresh }), { anchor: 'food', text: 'breakfast' });
  assert.equal(nextUp({ hour: 7, weighed: false, food: fresh }).anchor, 'weight');
  assert.deepEqual(nextUp({ hour: 7, weighed: false, food: fresh, workout: 'active', title: 'Lower body' }), { anchor: 'workout', text: 'resume Lower body' });
  const big = { date: today, meals: { breakfast: { title: 'b', kcal: 420, p: 40, c: 30, f: 14, target: { kcal: 420 } }, lunch: { title: 'Burger & fries', kcal: 1300, p: 45, c: 130, f: 65, target: { kcal: 600 } } }, extras: [] };
  const off = foodState({ profile, weights, eaten: big }, today, 13);
  assert.equal(off.off.meal, 'lunch');
  assert.equal(nextUp({ hour: 13, weighed: true, food: off }).text, 'adjust the rest of today');
  const dinnerTime = foodState({ profile, weights, eaten: big }, today, 18);
  assert.equal(dinnerTime.off, null, 'at dinner time it is the next meal again');
  assert.equal(dinnerTime.next, 'dinner');
  assert.match(leftText({ kcal: -120, p: 60 }), /at its calorie target · about <b>60 g protein<\/b> to go/);
  assert.ok(!/over|exceed|-\d/.test(leftText({ kcal: -400, p: 0 })));
  assert.match(leftText({ kcal: 850, p: 55 }), /~850 kcal.*~55 g protein/);
  const all = { ...big, meals: { ...big.meals, dinner: { title: 'd', kcal: 600, p: 50, c: 50, f: 20 } } };
  assert.equal(foodState({ profile, weights, eaten: all }, today, 20).next, null);
  assert.equal(nextUp({ hour: 20, weighed: true, food: foodState({ profile, weights, eaten: all }, today, 20) }).text, "finish today's log");
  assert.equal(foodState({ profile, weights, eaten: { ...all, done: true } }, today, 20).done, true);
});

test('nudges are calm and pick the most useful thing', async () => {
  const { nudgeFor, dietSummary } = await import('../family/health.js');
  const p = { sex: 'male', age: 40, heightIn: 70, phase: 'cut', goalLb: 170 };
  const base = dietSummary({ profile: p, weights: [{ date: today, weight: 190 }] }, today);
  assert.match(nudgeFor(base, { workout: 'active' }), /partway through/);
  assert.match(nudgeFor({ set: false }), /Set up your plan/);
  const low = { ...base, today: { ...base.today, p: 40, pTarget: 180, kcal: 1500, kcalTarget: 2200 } };
  assert.match(nudgeFor(low, { hour: 18 }), /Protein is the one to watch today — about 140 g to go/);
  const over = { ...base, today: { ...base.today, kcal: 2600, kcalTarget: 2200, p: 180, pTarget: 180 } };
  assert.match(nudgeFor(over, { hour: 20 }), /one day doesn't move the trend/);
  for (const h of [7, 13, 20]) assert.ok(!/fail|bad|should have|missed/i.test(nudgeFor(base, { hour: h })));
});
