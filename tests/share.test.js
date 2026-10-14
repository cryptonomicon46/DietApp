import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportText, reportCsvRows, weeklyRows, combosText, combosCsvRows } from '../js/share.js';

const meal = (title, kcal, p, f, c) => ({ title, kcal, p, f, c });
const data = {
  today: '2026-10-14',
  todayLog: { meals: { breakfast: meal('Whey shake', 400, 44, 11, 40) }, extras: [] },
  mealLog: {
    '2026-10-13': { meals: { breakfast: meal('Eggs & toast', 420, 40, 12, 37), lunch: meal('Chicken bowl', 550, 55, 16, 48), dinner: meal('Salmon', 640, 59, 31, 31) }, extras: [meal('Greek yogurt', 90, 17, 0, 6)] },
    '2026-10-10': { meals: { lunch: meal('Turkey wrap', 480, 40, 15, 45) }, extras: [] },
  },
  days: { '2026-10-13': { target: 1650, proteinTarget: 160, burned: 2500 }, '2026-10-10': { target: 1650, proteinTarget: 160 } },
  weights: [{ date: '2026-10-01', weight: 162 }, { date: '2026-10-09', weight: 160.4 }, { date: '2026-10-13', weight: 159.8 }],
  programStart: '2026-09-20', phase: 'cut',
};

test('a week report averages logged days and tracks weight from the last earlier weigh-in', () => {
  const r = buildReport(data, 'week');
  assert.equal(r.from, '2026-10-08');
  assert.equal(r.totalDays, 7);
  assert.equal(r.loggedDays, 3);
  assert.equal(r.days.find((d) => d.date === '2026-10-13').kcal, 1700);
  assert.equal(r.avg.kcal, Math.round((1700 + 480 + 400) / 3));
  assert.deepEqual([r.weight.start, r.weight.end, r.weight.change], [160.4, 159.8, -0.6]);
  assert.equal(r.onTarget, 1, '1700 is within 10% of 1650; 480 is not');
  const text = reportText(r, 'Sandman');
  assert.match(text, /Sandman's cut/);
  assert.match(text, /Weight: 160.4 → 159.8 lb \(−0.6 lb\)/);
  assert.match(text, /Salmon \(640\)/);
  assert.match(text, /not logged/);
  assert.equal(reportCsvRows(r).length, 7);
});

test('one day and the full program', () => {
  assert.equal(buildReport(data, 'day').totalDays, 1);
  const full = buildReport(data, 'program');
  assert.equal(full.from, '2026-09-20');
  assert.equal(weeklyRows(full).length, Math.ceil(full.totalDays / 7));
  assert.match(reportText(full, ''), /Sep 20–Sep 26: not logged/);
});

test('combos as text and CSV', () => {
  const groups = [{ meal: 'breakfast', combos: [{ name: 'Whey shake', totals: { kcal: 405, p: 44, f: 11, c: 40 }, items: [{ name: 'Whey protein', amount: '1⅔ scoops', grams: 50, kcal: 200, p: 40, f: 3, c: 5 }] }] }, { meal: 'lunch', combos: [] }];
  const t = combosText(groups, 'Sandman');
  assert.match(t, /☀️ BREAKFAST/);
  assert.match(t, /• Whey shake \(405 kcal · 44P 11F 40C\)/);
  assert.match(t, /– Whey protein: 1⅔ scoops \(50 g\)/);
  assert.doesNotMatch(t, /LUNCH/);
  assert.deepEqual(combosCsvRows(groups).map((x) => x.food), ['Whey protein', 'TOTAL']);
});
