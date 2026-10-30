// ⌚ Health 2 Phase B: WHOOP's day on the phone — which date a record belongs to (travel, midnight,
// clock changes), facts kept apart from interpretations, the usual range only once there's enough,
// and the planning facts' privacy boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/whoopDay.js';
import { normalize, complete } from '../js/workout.js';
import { splitHealth, PARTS } from '../js/healthParts.js';

// WHOOP v2 shapes (developer.whoop.com API reference).
const sleep = (id, cycle, start, end, tz, o = {}) => ({ id, cycle_id: cycle, v1_id: 1, user_id: 7, start, end, timezone_offset: tz, nap: false, score_state: 'SCORED',
  score: { stage_summary: { total_in_bed_time_milli: 8 * 3.6e6, total_awake_time_milli: 0.5 * 3.6e6, total_no_data_time_milli: 0, total_light_sleep_time_milli: 3.6 * 3.6e6, total_slow_wave_sleep_time_milli: 1.6 * 3.6e6, total_rem_sleep_time_milli: 1.6 * 3.6e6, sleep_cycle_count: 4, disturbance_count: 9 },
    sleep_needed: { baseline_milli: 7.5 * 3.6e6, need_from_sleep_debt_milli: 0.3 * 3.6e6, need_from_recent_strain_milli: 0.2 * 3.6e6, need_from_recent_nap_milli: 0 }, respiratory_rate: 15.2, sleep_performance_percentage: 88, sleep_consistency_percentage: 80, sleep_efficiency_percentage: 93.1 }, ...o });
const rec = (cycle, sleepId, score, o = {}) => ({ cycle_id: cycle, sleep_id: sleepId, user_id: 7, created_at: 'x', updated_at: 'x', score_state: 'SCORED', score: { user_calibrating: false, recovery_score: score, resting_heart_rate: 55, hrv_rmssd_milli: 61.4, spo2_percentage: 96, skin_temp_celsius: 33.6 }, ...o });
const cyc = (id, start, tz, strain, o = {}) => ({ id, user_id: 7, start, end: null, timezone_offset: tz, score_state: 'SCORED', score: { strain, kilojoule: 9000, average_heart_rate: 64, max_heart_rate: 150 }, ...o });

test('the date rule: a normal night, a night across midnight, travel, a clock change — never UTC or the phone zone alone', () => {
  // Normal night in California: asleep 10:45 PM, awake 6:30 AM → that morning's date.
  let d = D.dailyFrom({ sleeps: [sleep('s1', 1, '2026-10-29T05:45:00Z', '2026-10-29T13:30:00Z', '-07:00')], recoveries: [rec(1, 's1', 70)], cycles: [cyc(1, '2026-10-29T05:45:00Z', '-07:00', 8.2)] });
  assert.deepEqual(Object.keys(d), ['2026-10-29']);
  assert.equal(d['2026-10-29'].whoop.recovery.score.recovery_score, 70);
  assert.equal(d['2026-10-29'].whoop.cycle.score.strain, 8.2);
  // After midnight: asleep 1:10 AM, awake 9 AM — still that morning.
  d = D.dailyFrom({ sleeps: [sleep('s2', 2, '2026-10-30T08:10:00Z', '2026-10-30T16:00:00Z', '-07:00')], recoveries: [rec(2, 's2', 50)] });
  assert.deepEqual(Object.keys(d), ['2026-10-30']);
  // Flew to Tokyo: woke 7:30 AM on the 31st in Tokyo (+09:00). In UTC and in California that
  // instant is still the 30th — using either would file Tokyo's morning as yesterday's.
  const tokyo = sleep('s3', 3, '2026-10-30T14:00:00Z', '2026-10-30T22:30:00Z', '+09:00');
  d = D.dailyFrom({ sleeps: [tokyo], recoveries: [rec(3, 's3', 40)] });
  assert.deepEqual(Object.keys(d), ['2026-10-31']);
  assert.equal(new Date('2026-10-30T22:30:00Z').toISOString().slice(0, 10), '2026-10-30', 'UTC alone would say the 30th');
  // Flew back to California the next night: two recoveries, two different mornings.
  d = D.dailyFrom({ sleeps: [tokyo, sleep('s4', 4, '2026-11-01T06:00:00Z', '2026-11-01T14:00:00Z', '-07:00')], recoveries: [rec(3, 's3', 40), rec(4, 's4', 65)] });
  assert.deepEqual(Object.keys(d).sort(), ['2026-10-31', '2026-11-01']);
  assert.equal(d['2026-10-31'].whoop.recovery.score.recovery_score, 40);
  assert.equal(d['2026-11-01'].whoop.recovery.score.recovery_score, 65);
  // US clocks go back at 2 AM on Sunday Nov 1, 2026: asleep 11 PM PDT, awake 7 AM PST.
  for (const tz of ['-07:00', '-08:00']) {
    d = D.dailyFrom({ sleeps: [sleep('s5', 5, '2026-11-01T06:00:00Z', '2026-11-01T15:00:00Z', tz)], recoveries: [rec(5, 's5', 61)] });
    assert.deepEqual(Object.keys(d), ['2026-11-01'], tz);
  }
  // Spring forward (Mar 8, 2026): asleep 11 PM PST, awake 7 AM PDT.
  d = D.dailyFrom({ sleeps: [sleep('s6', 6, '2026-03-08T07:00:00Z', '2026-03-08T14:00:00Z', '-07:00')], recoveries: [rec(6, 's6', 61)] });
  assert.deepEqual(Object.keys(d), ['2026-03-08']);
  // A nap is never the day's sleep; a recovery with no sleep in this sync finds its date from what's stored.
  d = D.dailyFrom({ sleeps: [sleep('n1', 7, '2026-10-29T21:00:00Z', '2026-10-29T21:40:00Z', '-07:00', { nap: true })] });
  assert.deepEqual(d, {});
  const stored = { '2026-10-29': { whoop: { sleep: D.sleepFacts(sleep('s1', 1, '2026-10-29T05:45:00Z', '2026-10-29T13:30:00Z', '-07:00')) } } };
  assert.deepEqual(Object.keys(D.dailyFrom({ recoveries: [rec(1, 's1', 72)] }, stored)), ['2026-10-29']);
  // A cycle with no sleep: 12 h after it began, in its own offset (asleep 11 PM → the next day).
  assert.equal(D.cycleDay(cyc(9, '2026-10-29T06:00:00Z', '-07:00', 3)), '2026-10-29');
  assert.equal(D.cycleDay(cyc(9, '2026-10-28T14:00:00Z', '+09:00', 3)), '2026-10-29');
});

test('facts kept as WHOOP gave them (its names, untouched); pending and unscorable kept as such; 60 days', () => {
  const s = sleep('s1', 1, '2026-10-29T05:45:00Z', '2026-10-29T13:30:00Z', '-07:00');
  const f = D.sleepFacts(s);
  assert.equal(f.score.sleep_performance_percentage, 88);
  assert.equal(f.score.stage_summary.total_rem_sleep_time_milli, s.score.stage_summary.total_rem_sleep_time_milli);
  assert.equal(f.score.stage_summary.sleep_cycle_count, 4); assert.equal(f.score.stage_summary.disturbance_count, 9);
  assert.equal(f.score.stage_summary.total_no_data_time_milli, undefined, 'only what the app uses');
  assert.equal(D.cycleFacts(cyc(1, s.start, '-07:00', 8, { step_count: 6214 })).step_count, 6214);
  assert.equal('step_count' in D.cycleFacts(cyc(1, s.start, '-07:00', 8, { step_count: null })), false);
  assert.deepEqual(D.recoveryFacts(rec(1, 's1', 44)).score, { user_calibrating: false, recovery_score: 44, resting_heart_rate: 55, hrv_rmssd_milli: 61.4, spo2_percentage: 96, skin_temp_celsius: 33.6 });
  assert.deepEqual(D.recoveryFacts(rec(1, 's1', 44, { score_state: 'PENDING_SCORE', score: undefined })), { cycle_id: 1, sleep_id: 's1', score_state: 'PENDING_SCORE' });
  assert.equal(D.recoveryFacts({ cycle_id: 1, score_state: 'UNSCORABLE' }).score, undefined);
  // Nothing derived is stored next to the facts.
  const day = D.dailyFrom({ sleeps: [s], recoveries: [rec(1, 's1', 70)], cycles: [cyc(1, s.start, '-07:00', 8)] })['2026-10-29'];
  assert.deepEqual(Object.keys(day), ['whoop']);
  assert.ok(!/relative|deficit|"band"|usual|"line"/i.test(JSON.stringify(day)));
  // Merge: WHOOP's newer value replaces the part; other parts kept; older than 60 days dropped.
  const old = { '2026-08-01': { whoop: { recovery: D.recoveryFacts(rec(0, 'x', 50)) } }, '2026-10-29': { whoop: { recovery: D.recoveryFacts(rec(1, 's1', 44, { score_state: 'PENDING_SCORE', score: undefined })), cycle: D.cycleFacts(cyc(1, s.start, '-07:00', 4)) } } };
  const m = D.mergeDaily(old, { '2026-10-29': { whoop: { recovery: D.recoveryFacts(rec(1, 's1', 70)) } } }, '2026-10-30', 5);
  assert.deepEqual(Object.keys(m), ['2026-10-29']);
  assert.equal(m['2026-10-29'].whoop.recovery.score.recovery_score, 70);
  assert.equal(m['2026-10-29'].whoop.cycle.score.strain, 4);
});

// n scored days before `today`, scores from fn(i).
const history = (today, n, fn, extra = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) => [D.addDays(today, -(i + 1)), { whoop: { recovery: D.recoveryFacts(rec(i, `s${i}`, fn(i))) } }]).concat(Object.entries(extra)));

test('your usual range: only after 14 valid days (pending, unscorable and calibrating don\'t count), the middle half of 30 days', () => {
  const today = '2026-10-30';
  const bad = {
    [D.addDays(today, -20)]: { whoop: { recovery: D.recoveryFacts(rec(1, 'a', 10, { score_state: 'PENDING_SCORE' })) } },
    [D.addDays(today, -21)]: { whoop: { recovery: D.recoveryFacts({ cycle_id: 2, score_state: 'UNSCORABLE' }) } },
    [D.addDays(today, -22)]: { whoop: { recovery: D.recoveryFacts(rec(3, 'c', 5, { score: { user_calibrating: true, recovery_score: 5 } })) } },
  };
  let r = D.usualRange(history(today, 13, (i) => 50 + i, bad), today);
  assert.deepEqual(r, { ready: false, have: 13, need: 14 });
  r = D.usualRange(history(today, 20, (i) => 40 + i * 2), today);
  assert.equal(r.ready, true); assert.ok(r.low >= 48 && r.high <= 72 && r.low < r.high);
  assert.equal(D.relativeToUsual(30, r), 'lower'); assert.equal(D.relativeToUsual(60, r), 'usual'); assert.equal(D.relativeToUsual(90, r), 'higher');
  assert.equal(D.relativeToUsual(30, { ready: false }), null);
  // Older than 30 days doesn't count; today never counts toward its own range.
  assert.equal(D.usualRange(history(D.addDays(today, -31), 20, () => 60), today).ready, false);
  // WHOOP's own colours.
  assert.deepEqual([0, 33, 34, 66, 67, 100].map(D.scoreBand), ['red', 'red', 'yellow', 'yellow', 'green', 'green']);
});

test('today\'s context: WHOOP\'s numbers, one calm line, "Building your usual range", never yesterday\'s Recovery', () => {
  const today = '2026-10-30';
  // Not scored yet today: yesterday's 80 is never used for today.
  let daily = history(today, 20, (i) => (i === 0 ? 80 : 55 + (i % 5)));
  let c = D.recoveryContext(daily, today);
  assert.equal(c.recovery.state, 'none'); assert.equal(c.recovery.score, null);
  assert.match(c.line, /No Recovery for today yet/);
  daily[today] = { whoop: { recovery: D.recoveryFacts(rec(9, 'p', 0, { score_state: 'PENDING_SCORE', score: undefined })) } };
  assert.match(D.recoveryContext(daily, today).line, /isn't scored yet/);
  // Scored, lower than usual, short night.
  daily[today] = { whoop: { recovery: D.recoveryFacts(rec(9, 's9', 31)), sleep: D.sleepFacts(sleep('s9', 9, '2026-10-30T07:00:00Z', '2026-10-30T12:00:00Z', '-07:00', { score: { ...sleep().score, stage_summary: { total_light_sleep_time_milli: 3 * 3.6e6, total_slow_wave_sleep_time_milli: 1 * 3.6e6, total_rem_sleep_time_milli: 1 * 3.6e6 } } })), cycle: D.cycleFacts(cyc(9, '2026-10-30T07:00:00Z', '-07:00', 4.3)) } };
  daily[D.addDays(today, -1)].whoop.cycle = D.cycleFacts(cyc(8, '2026-10-29T06:00:00Z', '-07:00', 14.25));
  c = D.recoveryContext(daily, today);
  assert.deepEqual([c.recovery.score, c.recovery.band, c.recovery.relative], [31, 'red', 'lower']);
  assert.deepEqual(c.strain, { today: 4.3, yesterday: 14.3 });
  assert.deepEqual([c.sleep.hours, c.sleep.neededHours, c.sleep.deficitMinutes], [5, 8, 180]);
  assert.match(c.line, /^Recovery is lower than your usual\. Slept 5 h of the 8 h WHOOP says you needed\.$/);
  assert.equal(c.lighterHint, true);
  assert.ok(!/should|must|rest day|don't train/i.test(c.line), 'informs, never prescribes');
  // Not enough days yet: WHOOP's score and colour still shown, no comparison.
  c = D.recoveryContext({ [today]: daily[today] }, today);
  assert.deepEqual([c.recovery.score, c.recovery.band, c.recovery.relative], [31, 'red', null]);
  assert.match(c.line, /^Building your usual range — 0 of 14 days so far\./);
  // 7 days for the sheet.
  const days = D.lastDays(daily, today);
  assert.equal(days.length, 7); assert.equal(days[0].date, today); assert.equal(days[0].recovery, 31); assert.equal(days[1].strain, 14.3);
});

test('planning facts: exactly the structured fields, nothing private, and they never ride along with Health parts', () => {
  const today = '2026-10-30';
  const daily = history(today, 20, () => 60);
  daily[today] = { whoop: { recovery: D.recoveryFacts(rec(9, 's9', 31)), sleep: D.sleepFacts(sleep('s9', 9, '2026-10-30T06:00:00Z', '2026-10-30T14:00:00Z', '-07:00')), cycle: D.cycleFacts(cyc(9, '2026-10-30T06:00:00Z', '-07:00', 4.3)) } };
  const w = normalize({ id: 'wk1', title: 'Upper Body', status: 'planned', notes: 'Pat said go easy', blocks: [{ items: [{ name: 'Bench Press', note: 'shoulder twinge', sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 8, weight: 135 }] }] }] });
  const past = [40, 50].map((m) => ({ ...complete(normalize({ title: 'Upper Body' })), startedAt: 1e12, doneAt: 1e12 + m * 60000 }));
  const ctx = D.dayContextForPlanning({ daily, today, workout: w, history: past });
  assert.deepEqual(ctx, {
    date: today,
    recovery: { state: 'scored', scoreBand: 'red', relativeToUsual: 'lower' },
    sleep: { hours: 6.8, neededHours: 8, deficitMinutes: 72 },
    strain: { yesterday: null, today: 4.3 },
    plannedWorkout: { id: 'wk1', name: 'Upper Body', estimatedMinutes: 50, status: 'planned' },
  });
  const s = JSON.stringify(ctx);
  for (const bad of ['Pat', 'twinge', 'Bench', '61.4', 'hrv', 'resting', 'stage', 'rem', 'spo2', 'skin', '-07:00', '2026-10-29', 'score":31']) assert.ok(!s.toLowerCase().includes(bad.toLowerCase()), bad);
  assert.equal(D.dayContextForPlanning({ daily, today }).plannedWorkout, null);
  assert.equal(D.dayContextForPlanning({ daily: {}, today }).recovery.state, 'none');
  // whoopDaily is in no Health part: it stays in your own full copy, never shared.
  assert.ok(!Object.values(PARTS).flat().includes('whoopDaily'));
  assert.deepEqual(splitHealth({ whoopDaily: daily, workouts: [] }), { diet: {}, fitness: { workouts: [] }, us: {} });
});

test("the detail sheets: Recovery's inputs beside your usual, Sleep's stages and need, today's Strain and workout zones", () => {
  const today = '2026-10-30';
  const daily = history(today, 20, (i) => 60 + (i % 5));
  for (let i = 1; i <= 20; i++) daily[D.addDays(today, -i)].whoop.sleep = D.sleepFacts(sleep(`s${i}`, i, '2026-10-01T06:00:00Z', '2026-10-01T14:00:00Z', '-07:00'));
  daily[today] = { whoop: { recovery: D.recoveryFacts(rec(9, 's9', 63)), sleep: D.sleepFacts(sleep('s9', 9, '2026-10-30T06:02:00Z', '2026-10-30T13:50:00Z', '-07:00')), cycle: D.cycleFacts(cyc(9, '2026-10-30T06:02:00Z', '-07:00', 9.83, { step_count: 6214 })) } };
  daily[D.addDays(today, -1)].whoop.cycle = D.cycleFacts(cyc(8, '2026-10-29T06:00:00Z', '-07:00', 14.2));
  const r = D.recoveryDetail(daily, today);
  assert.deepEqual(r.rows.map((x) => x.key), ['hrv', 'rhr', 'resp', 'sleep', 'spo2', 'skin']);
  const hrv = r.rows.find((x) => x.key === 'hrv');
  assert.deepEqual([hrv.value, hrv.unit, hrv.usual.low, hrv.usual.high], [61, 'ms', 61, 61]);
  assert.equal(r.rows.find((x) => x.key === 'sleep').usual, null);
  // Not enough days: no "usual" for any of them.
  assert.ok(D.recoveryDetail({ [today]: daily[today] }, today).rows.every((x) => x.usual == null));
  const sl = D.sleepDetail(daily, today);
  assert.deepEqual([sl.from, sl.to, sl.hours, sl.consistency, sl.efficiency, sl.disturbances, sl.cycles], ['11:02 PM', '6:50 AM', 6.8, 80, 93, 9, 4]);
  assert.deepEqual(sl.stages.map(([k]) => k), ['Awake', 'Light', 'Deep (SWS)', 'REM']);
  assert.deepEqual(sl.need, { baseline: 7.5, debt: 0.3, strain: 0.2, nap: 0 });
  assert.equal(D.sleepDetail({}, today).state, 'none');
  // Strain: today's cycle; today's WHOOP workouts only (in their own offset), zones added up.
  const w = (id, start, z, tz = '-07:00') => ({ id: `whoop:${id}`, name: 'weightlifting', start, minutes: 48, kcal: 330, strain: 8.6, avgHr: 117, maxHr: 158, zones: z, tz });
  const st = D.strainDetail(daily, today, [w('a', '2026-10-30T16:31:00Z', [4, 12, 18, 9, 4, 1]), w('b', '2026-10-30T13:00:00Z', [1, 1, 1, 1, 1, 1]), w('old', '2026-10-30T05:00:00Z', [9, 9, 9, 9, 9, 9]), { id: 'strava:1', start: '2026-10-30T15:00:00Z' }]);
  assert.deepEqual([st.strain, st.yesterday, st.kcal, st.steps, st.avgHr, st.maxHr], [9.8, 14.2, 2151, 6214, 64, 150]);
  assert.deepEqual(st.zones, [5, 13, 19, 10, 5, 2], 'the 10 PM workout the night before is yesterday\'s');
  assert.deepEqual(st.workouts.map((x) => [x.id, x.at]), [['whoop:a', '9:31 AM'], ['whoop:b', '6:00 AM']]);
  assert.equal(D.strainDetail({}, today, []).zones, null);
});
