import test from 'node:test';
import assert from 'node:assert/strict';
import { mealOnTarget, buildTables, toCsv, summary } from '../js/analytics.js';

const target = { kcal: 600, p: 50, f: 20, c: 55 };
const meal = (kcal, p, f, c) => ({ title: 'Chicken, rice & veggies', kcal, p, f, c, target, at: '12:30 PM', foods: 'Chicken breast 170g; Rice 150g' });

test('on-target meals: calories ±10%, protein ≥90%', () => {
  assert.equal(mealOnTarget(meal(610, 52, 21, 54)), true);
  assert.equal(mealOnTarget(meal(700, 52, 21, 54)), false, 'too many calories');
  assert.equal(mealOnTarget(meal(600, 40, 21, 54)), false, 'low protein');
  assert.equal(mealOnTarget(meal(600, 50, 30, 40)), true, 'fat/carb trade-off is fine');
  assert.equal(mealOnTarget({ kcal: 300, p: 10, f: 5, c: 40 }), null, 'no target saved');
});

const data = {
  weights: [{ date: '2026-10-12', weight: 161.4 }],
  mealLog: { '2026-10-12': { meals: { breakfast: meal(610, 52, 21, 54), dinner: meal(800, 45, 35, 60) }, fuel: null, extras: [{ title: 'Greek yogurt', kcal: 100, p: 18, f: 1, c: 6 }] } },
  eaten: { date: '2026-10-13', meals: { lunch: meal(590, 51, 19, 56) }, fuel: { title: 'Intra-workout fuel', kcal: 240, c: 60 }, extras: [] },
  days: {
    '2026-10-12': { eaten: 1700, burned: 2300, target: 1650, plannedDeficit: 550, protein: 150, proteinTarget: 156, floor: 1500 },
    '2026-10-13': { eaten: 830, burned: 2400, target: 1900, plannedDeficit: 550, protein: 51, proteinTarget: 156, floor: 1500 },
  },
  activities: [{ date: '2026-10-13', sport: 'cycling', intensity: 'hard', minutes: 120, kcal: 1100 }],
  workoutHistory: [{ id: 'whoopcsv:2026-10-12T07:00', name: 'Rock Climbing', start: '2026-10-12T07:00', minutes: 90, kcal: 600, strain: 11.2 }],
  lift: { sessions: [{ date: '2026-10-12', block: 1, week: 1, day: 'A', entries: [{ slot: 'A1', exercise: 'backSquat', sets: [{ w: 185, r: 6 }, { w: 185, r: 5 }] }] }] },
  checkins: [{ date: '2026-10-12', feeling: 'hungry', note: 'busy, week', change: 'moreProtein', delta: { p: 20, f: 0, c: -20 }, kcal: 0 }],
};

test('tables cover meals, days, activities, lifting, weigh-ins, check-ins', () => {
  const t = buildTables(data);
  assert.equal(t.meals.filter((m) => ['breakfast', 'lunch', 'dinner'].includes(m.meal)).length, 3);
  assert.deepEqual(t.meals.map((m) => m.on_target).filter(Boolean), ['yes', 'no', 'yes']);
  assert.ok(t.meals.some((m) => m.meal === 'snack') && t.meals.some((m) => m.meal === 'workout fuel'));
  assert.equal(t.days[0].deficit_kcal, 600);
  assert.equal(t.days[0].weight_lb, 161.4);
  assert.deepEqual(t.activities.map((a) => a.source), ['whoop', 'added by you']);
  assert.equal(t.lifting_sets.length, 2);
  assert.equal(t.lifting_sessions[0].volume_lb, 185 * 11);
  assert.equal(t.checkins[0].feeling, 'Often hungry');
});

test('CSV quoting', () => {
  const csv = toCsv(buildTables(data).checkins);
  assert.match(csv, /^date,feeling,note,/);
  assert.match(csv, /"busy, week"/);
  assert.equal(toCsv([]), '');
});

test('30-day summary', () => {
  const s = summary(data, '2026-10-13');
  assert.equal(s.mealsLogged, 3);
  assert.equal(s.mealsOnTarget, 2);
  assert.equal(s.deficitDays, 2);
  assert.equal(s.liftSessions, 1);
  assert.equal(s.activities, 2);
  assert.equal(s.activityMinutes, 210);
});

test('zip writer produces a valid archive', async () => {
  const { makeZip } = await import('../js/zip.js');
  const { writeFileSync, mkdtempSync, readFileSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const dir = mkdtempSync('/tmp/zt-');
  writeFileSync(`${dir}/t.zip`, makeZip([{ name: 'a.csv', text: 'x,y\n1,2\n' }, { name: 'b.txt', text: 'héllo' }]));
  execSync(`cd ${dir} && unzip -q t.zip`);
  assert.equal(readFileSync(`${dir}/a.csv`, 'utf8'), 'x,y\n1,2\n');
  assert.equal(readFileSync(`${dir}/b.txt`, 'utf8'), 'héllo');
});

test('a week as CSV rows, every day present', async () => {
  const { weekRows, toCsv } = await import('../js/analytics.js');
  const data = {
    days: { '2026-10-12': { target: 2000, eaten: 1950, burned: 2500, protein: 150, proteinTarget: 160 } },
    weights: [{ date: '2026-10-12', weight: 209.8 }, { date: '2026-10-14', weight: 209.2 }],
    mealLog: { '2026-10-12': { meals: { breakfast: { title: 'Eggs & toast', kcal: 450, p: 30, f: 20, c: 35 }, dinner: { title: 'Salmon & rice', kcal: 700, p: 50, f: 25, c: 60 } }, extras: [{ title: 'Latte', kcal: 150, p: 10, f: 6, c: 15 }] } },
    activities: [{ date: '2026-10-13', sport: 'running', minutes: 40, kcal: 420 }],
  };
  const rows = weekRows(data, '2026-10-12');
  assert.equal(rows.length, 7);
  assert.deepEqual([rows[0].date, rows[0].weekday, rows[0].weight_lb, rows[0].kcal_eaten, rows[0].protein_g, rows[0].meals_logged], ['2026-10-12', 'Mon', 209.8, 1300, 90, 3]);
  assert.match(rows[0].foods, /breakfast: Eggs & toast; dinner: Salmon & rice; snack: Latte/);
  assert.match(rows[1].activities, /40 min 420 kcal/);
  assert.equal(rows[2].weight_lb, 209.2);
  assert.equal(rows[6].day_result, 'not logged');
  assert.match(toCsv(rows).split('\n')[0], /^date,weekday,weight_lb,kcal_eaten/);
});
