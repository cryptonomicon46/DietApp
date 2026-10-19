import test from 'node:test';
import assert from 'node:assert/strict';
import { periodOf, liftStats, bestBefore, prCount, cardioStats, paceText, climbStats, climbHighlights, e1rm } from '../js/progress.js';
import { sportOf } from '../js/activity.js';
import { buildTables } from '../js/analytics.js';

test('progress periods: Monday–Sunday weeks and calendar months, with the one before', () => {
  assert.deepEqual((({ from, to, prevFrom, prevTo }) => ({ from, to, prevFrom, prevTo }))(periodOf('week', '2026-10-21')), { from: '2026-10-19', to: '2026-10-25', prevFrom: '2026-10-12', prevTo: '2026-10-18' });
  const m = periodOf('month', '2026-10-21');
  assert.deepEqual([m.from, m.to, m.prevFrom, m.prevTo, m.label, m.prevLabel], ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30', 'October', 'September']);
});

test('lifting: sets, volume, best estimated 1RM and new PRs', () => {
  const sessions = [
    { date: '2026-09-20', entries: [{ exercise: 'bench', sets: [{ w: 175, r: 5 }] }] },
    { date: '2026-10-02', entries: [{ exercise: 'bench', sets: [{ w: 185, r: 5 }, { w: 185, r: 4 }] }, { exercise: 'pullup', sets: [{ w: 180, r: 8, bw: true }] }] },
  ];
  const L = liftStats(sessions, '2026-10-01', '2026-10-31');
  assert.deepEqual([L.sessions, L.sets, L.volume], [1, 3, 185 * 9]);
  assert.equal(Math.round(L.best.bench), Math.round(e1rm(185, 5)));
  assert.equal(prCount(L, bestBefore(sessions, '2026-10-01')), 1);
});

test('cardio: miles, pace and hot yoga; synced workouts count unless already added', () => {
  const acts = [
    { date: '2026-10-02', sport: 'running', minutes: 36, miles: 4 },
    { date: '2026-10-05', sport: 'hotYoga', minutes: 60 },
    { date: '2026-10-06', sport: 'cycling', minutes: 120, miles: 30 },
  ];
  const hist = [{ start: '2026-10-02T07:00', name: 'Running', minutes: 36 }, { start: '2026-10-09T07:00', name: 'Hot Yoga', minutes: 75 }];
  const C = cardioStats(acts, hist, sportOf, '2026-10-01', '2026-10-31');
  assert.deepEqual([C.running.n, C.running.miles, C.cycling.miles, C.hotYoga.n, C.hotYoga.minutes, C.sessions], [1, 4, 30, 2, 135, 4]);
  assert.equal(paceText(C.running.pace), '9:00 /mi');
});

test('climbing: attempts and sends per grade, top send, and highlights vs last period', () => {
  const climbs = [
    { date: '2026-09-10', grades: { boulder: { V4: { a: 5, s: 3 }, V5: { a: 9, s: 2 } } } },
    { date: '2026-10-03', grades: { boulder: { V4: { a: 5, s: 4 }, V5: { a: 6, s: 2 }, V6: { a: 3, s: 1 } }, lead: { '5.10a': { a: 2, s: 2 }, '5.10c': { a: 2, s: 1 } } } },
    { date: '2026-10-10', grades: { boulder: { V5: { a: 4, s: 2 } } } },
  ];
  const K = climbStats(climbs, '2026-10-01', '2026-10-31');
  assert.equal(K.sessions, 2);
  assert.deepEqual(K.by.boulder.grades.V5, { a: 10, s: 4 });
  assert.deepEqual([K.by.boulder.top, K.by.lead.top, K.by.toprope.top], ['V6', '5.10c', null]);
  const H = climbHighlights(K, climbStats(climbs, '2026-09-01', '2026-09-30'));
  assert.ok(H.some((h) => h.includes('Bouldering top send up: V5 → V6')), H.join(' | '));
  assert.ok(H.some((h) => h.includes('V5 send rate up from 22% to 40%')), H.join(' | '));
  // A send without an attempt still counts as an attempt.
  assert.deepEqual(climbStats([{ date: '2026-10-01', grades: { toprope: { '5.11a': { s: 1 } } } }], '2026-10-01', '2026-10-31').by.toprope.grades['5.11a'], { a: 1, s: 1 });
  const t = buildTables({ climbs: [climbs[1]] });
  assert.equal(t.climbing.length, 5);
  assert.deepEqual(t.climbing.find((r) => r.grade === 'V6'), { date: '2026-10-03', gym: '', minutes: '', discipline: 'bouldering', grade: 'V6', attempts: 3, sends: 1 });
  assert.equal(sportOf('Hot Yoga'), 'hotYoga');
  assert.equal(sportOf('Yoga'), 'yoga');
});
