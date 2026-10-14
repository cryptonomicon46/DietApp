import test from 'node:test';
import assert from 'node:assert/strict';
import { programReview } from '../js/review.js';

const iso = (d) => d.toISOString().slice(0, 10);
function makeData({ lbPerWeek, adherence = 1, goal = 156, start = 162 }) {
  const s = new Date(Date.UTC(2026, 8, 1, 12));
  const weights = [], days = {}, mealLog = {};
  const target = { kcal: 600, p: 50, f: 20, c: 55 };
  for (let i = 0; i < 56; i++) {
    const d = iso(new Date(s.getTime() + i * 864e5));
    weights.push({ date: d, weight: +(start - (lbPerWeek / 7) * i).toFixed(1) });
    if (i % 10 < adherence * 10) {
      days[d] = { eaten: 1700, burned: 2300, target: 1650, plannedDeficit: 550, protein: 150, proteinTarget: 156, floor: 1500, meals: 3 };
      mealLog[d] = { meals: Object.fromEntries(['breakfast', 'lunch', 'dinner'].map((m) => [m, { title: 'x', kcal: 600, p: 50, f: 20, c: 55, target }])), extras: [] };
    }
  }
  const sessions = [];
  for (let i = 0; i < 56; i += 2) sessions.push({ date: iso(new Date(s.getTime() + i * 864e5)), block: 1, week: 1, day: 'A', entries: [{ exercise: 'backSquat', sets: [{ w: 185 + i, r: 5 }] }] });
  return { profile: { goalLb: goal, phase: 'cut', phaseStart: iso(s), createdOn: iso(s) }, weights, days, mealLog, lift: { sessions } };
}
const end = '2026-10-26';

test('8-week review: results', () => {
  const r = programReview(makeData({ lbPerWeek: 1 }), end);
  assert.equal(r.done, true);
  assert.ok(r.weight.change < -6 && r.weight.change > -8.5, `${r.weight.change}`);
  assert.ok(Math.abs(r.weight.ratePerWeek - 1) < 0.1);
  assert.equal(r.nutrition.daysLogged, 56);
  assert.equal(r.nutrition.onTargetPct, 100);
  assert.equal(r.training.workouts, 28);
  assert.equal(r.training.strength[0].exercise, 'Barbell back squat');
  assert.ok(r.training.strength[0].pct > 0);
});

test('next steps follow the situation', () => {
  const rec = (d) => programReview(d, end).next.options.find((o) => o.recommended).id;
  assert.equal(rec(makeData({ lbPerWeek: 1, goal: 148 })), 'break', 'on track, not at goal → diet break');
  assert.equal(rec(makeData({ lbPerWeek: 1, goal: 156, start: 163 })), 'maintain', 'reached goal → maintain');
  assert.equal(rec(makeData({ lbPerWeek: 0.1, goal: 148 })), 'break', 'plateau with good adherence → break');
  assert.equal(rec(makeData({ lbPerWeek: 0.5, adherence: 0.4, goal: 148 })), 'cut', 'low adherence → keep cutting, log more');
});

test('close to goal → finish the cut first', () => {
  const d = makeData({ lbPerWeek: 1, goal: 154, start: 162.5 });
  const rec = programReview(d, end).next.options.find((o) => o.recommended);
  assert.equal(rec.id, 'cut');
  assert.match(rec.title, /Finish the last/);
});

test('slow versus the planned rate → plateau advice; at the floor → walks, not cuts', () => {
  const d = makeData({ lbPerWeek: 0.4, goal: 148 });
  const r = programReview(d, end, { rate: 1.5, atFloor: true });
  const rec = r.next.options.find((o) => o.recommended);
  assert.equal(rec.id, 'break');
  assert.match(rec.why, /slower than planned/);
  assert.ok(r.next.options.some((o) => /walks/.test(o.title)));
  assert.ok(!r.next.options.some((o) => o.adjust === -100));
});
