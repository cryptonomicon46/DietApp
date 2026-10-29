import test from 'node:test';
import assert from 'node:assert/strict';
import { planProgress, dataQuality, MIN, STATUS } from '../js/planProgress.js';

const DAY = 864e5;
const today = '2026-10-29';
const back = (n) => new Date(Date.parse(`${today}T12:00:00Z`) - n * DAY).toISOString().slice(0, 10);
// Weigh-ins every `every` days over the last `span` days, changing by `perWeek` lb/week (negative = losing).
const series = (span, every, from, perWeek) => {
  const out = [];
  for (let d = span; d >= 0; d -= every) out.push({ date: back(d), weight: Math.round((from + ((span - d) / 7) * perWeek) * 10) / 10 });
  return out;
};
const logged = (n) => Object.fromEntries([...Array(n).keys()].map((i) => [back(i), { meals: 3, eaten: 1800 }]));
const cut = { phase: 'cut', phaseStart: back(28), goalLb: 160, pace: 'steady' };

test('statuses have labels', () => {
  for (const s of ['on-track', 'behind', 'ahead', 'too-early']) assert.ok(STATUS[s].label);
});

test('on track: losing about the planned rate', () => {
  const r = planProgress({ profile: cut, weights: series(21, 2, 180, -1), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'on-track');
  assert.equal(r.week, 5);
  assert.equal(r.weeks, 8);
  assert.equal(r.daysLeft, 28);
  assert.ok(r.why.some((w) => /losing 1 lb\/week/.test(w)));
  assert.match(r.estimate.text, /^At your recent estimated trend/);
  assert.equal(r.next, "Keep doing what you're doing.");
});

test('behind: losing much slower than planned — the next step is the approve-first check-in', () => {
  const r = planProgress({ profile: cut, weights: series(21, 2, 180, -0.2), days: logged(7), today, planned: 1.2 });
  assert.equal(r.status, 'behind');
  assert.match(r.next, /check-in/);
  assert.match(r.next, /nothing changes until you approve/);
  assert.match(r.estimate.text, /is unlikely/);
  assert.equal(r.estimate.likely, false);
});

test('ahead: losing faster than planned', () => {
  const r = planProgress({ profile: cut, weights: series(21, 2, 180, -2), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'ahead');
  assert.equal(r.estimate.likely, true);
  assert.match(r.next, /Losing quickly/);
});

test('too early: few weigh-ins', () => {
  const w = [{ date: back(12), weight: 180 }, { date: back(6), weight: 179 }, { date: back(0), weight: 178.6 }];
  const r = planProgress({ profile: cut, weights: w, days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'too-early');
  assert.equal(r.estimate, null);
  assert.ok(r.why.some((x) => /3 weigh-ins so far/.test(x)));
});

test('too early: data covers too short a span', () => {
  const r = planProgress({ profile: cut, weights: series(6, 1, 180, -1), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'too-early');
  assert.ok(r.why.some((x) => /6 days of data/.test(x)));
});

test('too early: a long gap with few points', () => {
  const w = [back(20), back(19), back(18), back(17), back(2), back(1), back(0)].map((date, i) => ({ date, weight: 180 - i * 0.3 }));
  const q = dataQuality(w, today);
  assert.ok(q.maxGapDays > MIN.maxGapDays);
  assert.equal(q.ok, false);
  assert.equal(planProgress({ profile: cut, weights: w, days: logged(7), today, planned: 1 }).status, 'too-early');
});

test('too early: an implausibly large short-term change (water, not fat)', () => {
  const r = planProgress({ profile: cut, weights: series(14, 1, 180, -5), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'too-early');
  assert.equal(r.estimate, null);
  assert.ok(r.why.some((x) => /water, salt or carbs/.test(x)));
});

test('weigh-ins from before this phase started are not used', () => {
  const old = series(21, 1, 190, -1);
  const profile = { ...cut, phaseStart: back(5) };
  const r = planProgress({ profile, weights: old, days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'too-early');
  assert.ok(r.quality.weighIns <= 6);
});

test('maintenance: holding steady is on track, drifting is behind; no goal-date estimate', () => {
  const profile = { phase: 'maintain', phaseStart: back(21), goalLb: 160 };
  const hold = planProgress({ profile, weights: series(21, 2, 170, 0.1), days: logged(7), today, planned: 0 });
  assert.equal(hold.status, 'on-track');
  assert.equal(hold.estimate, null);
  const drift = planProgress({ profile, weights: series(21, 2, 170, 1), days: logged(7), today, planned: 0 });
  assert.equal(drift.status, 'behind');
  assert.equal(drift.weeks, 4);
});

test('diet break aims to hold steady even with no planned rate given', () => {
  const r = planProgress({ profile: { phase: 'break', phaseStart: back(13), goalLb: 160 }, weights: series(13, 1, 170, -0.1), days: logged(7), today });
  assert.equal(r.status, 'on-track');
  assert.equal(r.phaseLabel, 'Diet break');
  assert.equal(r.estimate, null);
});

test('gain: gaining about the planned rate is on track, faster is ahead, losing is behind', () => {
  const profile = { phase: 'gain', phaseStart: back(28), goalLb: 175 };
  const on = planProgress({ profile, weights: series(21, 2, 165, 0.4), days: logged(7), today, planned: -0.4 });
  assert.equal(on.status, 'on-track');
  assert.match(on.estimate.text, /175 lb/);
  assert.equal(planProgress({ profile, weights: series(21, 2, 165, 1.2), days: logged(7), today, planned: -0.4 }).status, 'ahead');
  assert.equal(planProgress({ profile, weights: series(21, 2, 165, -0.5), days: logged(7), today, planned: -0.4 }).status, 'behind');
});

test('no goal: a status but no date estimate, and it says why', () => {
  const r = planProgress({ profile: { phase: 'cut', phaseStart: back(28) }, weights: series(21, 2, 180, -1), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'on-track');
  assert.equal(r.estimate, null);
  assert.ok(r.why.some((x) => /No goal weight/.test(x)));
});

test('no planned rate in a cut: too early, with a nudge to set the pace', () => {
  const r = planProgress({ profile: cut, weights: series(21, 2, 180, -1), days: logged(7), today });
  assert.equal(r.status, 'too-early');
  assert.match(r.next, /goal and pace/);
});

test('stalled in a cut with a goal: the planned date is unlikely, with no made-up date', () => {
  const r = planProgress({ profile: cut, weights: series(21, 2, 180, 0), days: logged(7), today, planned: 1 });
  assert.equal(r.status, 'behind');
  assert.equal(r.estimate.date, null);
  assert.match(r.estimate.text, /^At your recent estimated trend, reaching 160 lb by \w{3} \d+ is unlikely\.$/);
});

test('next step: logging gaps come first, then weigh-in frequency', () => {
  const few = planProgress({ profile: cut, weights: series(21, 2, 180, -1), days: logged(3), today, planned: 1 });
  assert.match(few.next, /3 of the last 7 days/);
  const sparse = planProgress({ profile: cut, weights: series(21, 4, 180, -1), days: logged(7), today, planned: 1 });
  assert.match(sparse.next, /Weigh in 3–4 mornings a week/);
});

test('no weigh-ins and no profile: safe defaults, nothing thrown', () => {
  const r = planProgress({ today });
  assert.equal(r.status, 'too-early');
  assert.equal(r.week, null);
  assert.equal(r.current, null);
  assert.equal(r.estimate, null);
});

test('week never runs past the planned length; done once the phase ends', () => {
  const r = planProgress({ profile: { ...cut, phaseStart: back(70) }, weights: series(21, 2, 180, -1), days: logged(7), today, planned: 1 });
  assert.equal(r.week, 8);
  assert.equal(r.daysLeft, 0);
  assert.equal(r.done, true);
});

test('it never changes the profile', () => {
  const profile = { ...cut };
  const before = JSON.stringify(profile);
  planProgress({ profile, weights: series(21, 2, 180, -0.2), days: logged(7), today, planned: 1 });
  assert.equal(JSON.stringify(profile), before);
});
