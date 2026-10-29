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

test('the Health screen: calm, private, escapes what it shows', () => {
  const html = healthHtml({ profile: { sex: 'female', age: 35, heightIn: 64, phase: 'maintain' }, weights: [{ date: today, weight: 140 }], workouts: [{ name: 'Run', start: '2026-10-27T07:00' }] }, { esc, today, sharing: '🔒 Private <b>' });
  assert.match(html, /Maintenance/);
  // Weighed in today: the status and where the trend is, not the form.
  assert.match(html, /✓ <b>140\.0 lb<\/b> today/);
  assert.match(html, /href="\.\.\/#weight">Weight trend →/);
  assert.ok(!html.includes('data-weigh'));
  assert.match(html, /href="\.\.\/#today">Today's plan →/);
  assert.match(html, /\/ \d[\d,]* kcal/);
  assert.match(html, /g protein/);
  assert.ok(!/🪙|coins|streak/i.test(html), 'no coins or streaks');
  assert.ok(html.includes('&#60;b&#62;') && !html.includes('Private <b>'), 'escaped');
  assert.equal(fitnessSummary({ workouts: [{ start: '2026-10-27T07:00' }, { start: '2026-10-01T07:00' }] }, today).week, 1);
});

test('Health: the weigh-in form until today is in; one calm nudge; plan status from the plan module', () => {
  const p = { sex: 'female', age: 35, heightIn: 64, phase: 'cut', goalLb: 130, phaseStart: '2026-10-01' };
  const html = healthHtml({ profile: p, weights: [{ date: '2026-10-20', weight: 141 }] }, { esc, today, hour: 7, sharing: '' });
  assert.match(html, /<form class="hl-weigh" data-weigh>/);
  assert.match(html, /placeholder="141\.0"/);
  assert.match(html, /quick weigh-in before breakfast/);
  assert.match(html, /week 4 of 8/);
  assert.match(html, /Too early to tell/);
  // The reminder link only once its state is known.
  assert.ok(!html.includes('weighremind'));
  assert.match(healthHtml({ profile: p, weights: [] }, { esc, today, sharing: '', reminder: false }), /Remind me each morning/);
  assert.match(healthHtml({ profile: p, weights: [] }, { esc, today, sharing: '', reminder: true }), /Morning reminder on/);
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
