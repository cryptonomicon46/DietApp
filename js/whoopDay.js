// ⌚ WHOOP's day, on the phone: Recovery, Sleep and the day's Strain, filed by date, and what
// OurPawmily makes of them. Pure (no storage, no network), so it's tested.
//
// Facts and interpretations are kept apart. What's stored (`whoopDaily`, in your own full copy
// only — in no Health part, so never shared) is WHOOP's own values under WHOOP's own field names
// (v2 API: recovery, sleep, cycle), never changed:
//   whoopDaily: { 'YYYY-MM-DD': { whoop: { recovery?, sleep?, cycle? }, syncedAt } }   (60 days)
// Everything OurPawmily works out — relative to your usual, the sleep deficit, the one context
// line, the planning facts — is computed from those when it's needed and never stored.
//
// Which date a record belongs to (the travel rule). WHOOP counts in physiological cycles (sleep
// onset to the next sleep onset), not calendar days, and gives every sleep and cycle the time-zone
// offset you were in when it was recorded. A day's WHOOP is the one from the night you woke up
// from, on the calendar where you woke up:
//   - sleep:    the date of its `end` (waking) in the sleep's own `timezone_offset`; naps don't count;
//   - recovery: the date of its sleep (`sleep_id`, else the main sleep in its cycle), else its cycle's;
//   - cycle:    the date of its main sleep, else the date 12 h after its start in its own offset.
// Never UTC alone, never the phone's current zone alone (only when WHOOP gave no offset). So a
// flight doesn't move yesterday's Recovery onto today, and a night across midnight or a clock
// change belongs to the morning you woke up. Today's entry is read for today and nothing else: if
// it isn't there yet, it's "not scored yet" — never yesterday's.
import { durationFor } from './workout.js';
import { offsetMin, localDate } from './workoutMatch.js';

export const MIN_DAYS = 14; // scored, non-calibrating days before "your usual" means anything
export const WINDOW = 30; // the days your usual range is drawn from
export const KEEP = 60; // days kept

// The calendar date where the record says you were (js/workoutMatch.js, shared with workouts).
export { offsetMin, localDate };
export const sleepDay = (s) => (s?.end ? localDate(s.end, s.timezone_offset) : null);
export const cycleDay = (c) => (c?.start ? localDate(c.start, c.timezone_offset, 12 * 3600e3) : null);
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Did WHOOP grant Recovery and Sleep to this sign-in? (Unknown on an older connection until it
// next renews: then it says.)
export const hasDaily = (t) => !!t && /\bread:recovery\b/.test(t.scope || '') && /\bread:sleep\b/.test(t.scope || '');

// ---------- WHOOP's records → the facts kept (WHOOP's names; only what the app uses) ----------
const nums = (o, keys) => Object.fromEntries(keys.filter((k) => Number.isFinite(o?.[k])).map((k) => [k, o[k]]));
const STATES = ['SCORED', 'PENDING_SCORE', 'UNSCORABLE'];
const state = (x) => (STATES.includes(x?.score_state) ? x.score_state : 'PENDING_SCORE');
export function recoveryFacts(r) {
  const out = { cycle_id: r.cycle_id ?? null, sleep_id: r.sleep_id ?? null, score_state: state(r) };
  if (out.score_state === 'SCORED' && r.score) out.score = { user_calibrating: !!r.score.user_calibrating, ...nums(r.score, ['recovery_score', 'resting_heart_rate', 'hrv_rmssd_milli', 'spo2_percentage', 'skin_temp_celsius']) };
  return out;
}
export function sleepFacts(s) {
  const out = { id: s.id ?? null, cycle_id: s.cycle_id ?? null, start: s.start, end: s.end, timezone_offset: s.timezone_offset ?? null, nap: !!s.nap, score_state: state(s) };
  if (out.score_state === 'SCORED' && s.score) {
    out.score = {
      stage_summary: nums(s.score.stage_summary, ['total_in_bed_time_milli', 'total_awake_time_milli', 'total_light_sleep_time_milli', 'total_slow_wave_sleep_time_milli', 'total_rem_sleep_time_milli', 'sleep_cycle_count', 'disturbance_count']),
      sleep_needed: nums(s.score.sleep_needed, ['baseline_milli', 'need_from_sleep_debt_milli', 'need_from_recent_strain_milli', 'need_from_recent_nap_milli']),
      ...nums(s.score, ['sleep_performance_percentage', 'sleep_efficiency_percentage', 'sleep_consistency_percentage', 'respiratory_rate']),
    };
  }
  return out;
}
export function cycleFacts(c) {
  const out = { id: c.id ?? null, start: c.start, end: c.end ?? null, timezone_offset: c.timezone_offset ?? null, score_state: state(c) };
  if (out.score_state === 'SCORED' && c.score) out.score = nums(c.score, ['strain', 'kilojoule', 'average_heart_rate', 'max_heart_rate']);
  if (Number.isFinite(c.step_count)) out.step_count = c.step_count; // the cycle's steps so far (null: none)
  return out;
}
const inBed = (s) => s.score?.stage_summary?.total_in_bed_time_milli ?? (Date.parse(s.end) - Date.parse(s.start)) ?? 0;

// One sync's pages → { date: { whoop: {recovery?, sleep?, cycle?} } }. `prev` (what's stored) lets
// a recovery whose sleep came in an earlier sync still find its date.
export function dailyFrom({ recoveries = [], sleeps = [], cycles = [] } = {}, prev = {}) {
  const out = {};
  const put = (d, k, v) => { if (d) (out[d] ||= { whoop: {} }).whoop[k] = v; };
  const main = sleeps.filter((s) => s && !s.nap && s.end);
  // The main sleep of a cycle (the longest, if WHOOP split a night in two).
  const byCycle = new Map();
  for (const s of main) { const o = byCycle.get(s.cycle_id); if (!o || inBed(s) > inBed(o)) byCycle.set(s.cycle_id, s); }
  const byId = new Map(main.map((s) => [s.id, s]));
  const known = new Map(); // sleep id / cycle id → date, from what's stored
  for (const [d, e] of Object.entries(prev || {})) {
    const sl = e?.whoop?.sleep;
    if (sl?.id) known.set(`s:${sl.id}`, d);
    if (sl?.cycle_id != null) known.set(`c:${sl.cycle_id}`, d); // a cycle goes with its stored sleep's day
    if (e?.whoop?.cycle?.id != null) known.set(`c:${e.whoop.cycle.id}`, d);
  }
  for (const s of byCycle.values()) put(sleepDay(s), 'sleep', sleepFacts(s));
  const cyc = new Map(cycles.filter(Boolean).map((c) => [c.id, c]));
  for (const c of cyc.values()) { const s = byCycle.get(c.id); put(s ? sleepDay(s) : known.get(`c:${c.id}`) || cycleDay(c), 'cycle', cycleFacts(c)); }
  for (const r of recoveries.filter(Boolean)) {
    const s = byId.get(r.sleep_id) || byCycle.get(r.cycle_id), c = cyc.get(r.cycle_id);
    put(s ? sleepDay(s) : known.get(`s:${r.sleep_id}`) || known.get(`c:${r.cycle_id}`) || (c ? cycleDay(c) : null), 'recovery', recoveryFacts(r));
  }
  return out;
}
// Fresh facts over stored ones (each part replaced as a whole — WHOOP's latest is the fact),
// keeping KEEP days.
export function mergeDaily(stored = {}, fresh = {}, today, now = Date.now()) {
  const out = { ...stored };
  for (const [d, e] of Object.entries(fresh)) out[d] = { whoop: { ...(stored[d]?.whoop || {}), ...e.whoop }, syncedAt: now };
  const keep = addDays(today, -KEEP);
  return Object.fromEntries(Object.entries(out).filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= keep).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------- OurPawmily's interpretations (computed, never stored) ----------
// WHOOP's own colours: green 67–100, yellow 34–66, red 0–33.
export const scoreBand = (n) => (!Number.isFinite(n) ? null : n >= 67 ? 'green' : n >= 34 ? 'yellow' : 'red');
const scored = (r) => r?.score_state === 'SCORED' && !r.score?.user_calibrating && Number.isFinite(r.score?.recovery_score);
const quart = (a, q) => { const i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); };
// Your usual: the middle half of your own scored Recovery over the WINDOW days before today —
// only once there are MIN_DAYS of them (pending, unscorable and calibrating days don't count).
export function usualRange(daily = {}, today) { return usualOf(daily, today, (e) => (scored(e?.whoop?.recovery) ? e.whoop.recovery.score.recovery_score : null)); }
// The same "usual" (middle half, WINDOW days, MIN_DAYS valid ones) for any one number of a day.
export function usualOf(daily = {}, today, pick, round = 0) {
  const from = addDays(today, -WINDOW), k = 10 ** round;
  const s = Object.entries(daily).filter(([d]) => d >= from && d < today).map(([, e]) => pick(e)).filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < MIN_DAYS) return { ready: false, have: s.length, need: MIN_DAYS };
  return { ready: true, have: s.length, low: Math.round(quart(s, 0.25) * k) / k, high: Math.round(quart(s, 0.75) * k) / k };
}
export function relativeToUsual(score, range) {
  if (!range?.ready || !Number.isFinite(score)) return null;
  return score < range.low ? 'lower' : score > range.high ? 'higher' : 'usual';
}
// Hours asleep (light + deep + REM), hours WHOOP says you needed, and the gap.
export function sleepNumbers(sleep) {
  if (sleep?.score_state !== 'SCORED' || !sleep.score) return null;
  const st = sleep.score.stage_summary || {}, nd = sleep.score.sleep_needed || {};
  const asleep = (st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0);
  const need = Object.values(nd).reduce((a, b) => a + (b || 0), 0);
  if (!asleep) return null;
  const h = (ms) => Math.round(ms / 360000) / 10;
  return { hours: h(asleep), neededHours: need ? h(need) : null, deficitMinutes: need ? Math.max(0, Math.round((need - asleep) / 60000)) : null, performance: sleep.score.sleep_performance_percentage ?? null };
}
const stateOf = (r) => (!r ? 'none' : r.score_state === 'SCORED' ? 'scored' : r.score_state === 'UNSCORABLE' ? 'unscorable' : 'pending');
const strainOf = (e) => (Number.isFinite(e?.whoop?.cycle?.score?.strain) ? Math.round(e.whoop.cycle.score.strain * 10) / 10 : null);

// Today, for the Health WHOOP section: WHOOP's numbers as they are, plus one calm context line.
// The line informs; it never tells you what to do, and WHOOP never changes your plan by itself.
export function recoveryContext(daily = {}, today) {
  const e = daily[today], r = e?.whoop?.recovery, st = stateOf(r);
  const score = st === 'scored' ? r.score?.recovery_score ?? null : null;
  const range = usualRange(daily, today);
  const relative = st === 'scored' && !r.score?.user_calibrating ? relativeToUsual(score, range) : null;
  const sleep = sleepNumbers(e?.whoop?.sleep);
  const out = {
    recovery: { state: st, score, band: scoreBand(score), relative, calibrating: !!r?.score?.user_calibrating, building: range.ready ? null : { have: range.have, need: range.need }, rhr: r?.score?.resting_heart_rate ?? null, hrv: r?.score?.hrv_rmssd_milli != null ? Math.round(r.score.hrv_rmssd_milli) : null },
    sleep: { state: stateOf(e?.whoop?.sleep), ...(sleep || {}) },
    strain: { today: strainOf(e), yesterday: strainOf(daily[addDays(today, -1)]) },
  };
  const tired = sleep?.deficitMinutes >= 45 ? ` Slept ${sleep.hours} h of the ${sleep.neededHours} h WHOOP says you needed.` : '';
  out.line = st === 'none' ? 'No Recovery for today yet — it comes after you wake and sync.'
    : st === 'pending' ? 'Recovery isn\'t scored yet — WHOOP is still working it out.'
      : st === 'unscorable' ? 'WHOOP couldn\'t score last night.'
        : out.recovery.calibrating ? `WHOOP is still calibrating.${tired}`
          : !relative ? `Building your usual range — ${range.have} of ${range.need} days so far.${tired}`
            : `${relative === 'usual' ? 'Recovery is in your usual range.' : `Recovery is ${relative} than your usual.`}${tired}`;
  out.lighterHint = relative === 'lower' || (sleep?.deficitMinutes ?? 0) >= 90;
  return out;
}
// Recent days for the 7-day sheet (newest first): WHOOP's values only.
export function lastDays(daily = {}, today, n = 7) {
  return Array.from({ length: n }, (_, i) => addDays(today, -i)).map((d) => {
    const e = daily[d], r = e?.whoop?.recovery, s = sleepNumbers(e?.whoop?.sleep);
    return { date: d, state: stateOf(r), recovery: r?.score_state === 'SCORED' ? r.score?.recovery_score ?? null : null, band: scoreBand(r?.score?.recovery_score), sleepHours: s?.hours ?? null, sleepPerf: s?.performance != null ? Math.round(s.performance) : null, strain: strainOf(e) };
  });
}

// ---------- the three detail sheets (tap Recovery, Sleep or Strain) ----------
// "11:02 PM" where the record says you were.
export function clockAt(iso, tz) {
  const t = Date.parse(iso), off = offsetMin(tz);
  if (!Number.isFinite(t)) return '';
  const d = off == null ? new Date(t) : new Date(t + off * 60000);
  const h = off == null ? d.getHours() : d.getUTCHours(), m = off == null ? d.getMinutes() : d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const ok = (r) => r?.score_state === 'SCORED' && !r.score?.user_calibrating;
// Recovery: WHOOP's score and what went into it, each beside your usual (once there's enough).
export function recoveryDetail(daily = {}, today) {
  const c = recoveryContext(daily, today), e = daily[today]?.whoop || {}, r = e.recovery?.score || {}, sl = e.sleep?.score || {};
  const fromRec = (k) => (x) => (ok(x?.whoop?.recovery) ? x.whoop.recovery.score[k] ?? null : null);
  const row = (key, label, value, unit, usual, round = 0) => ({ key, label, value: value == null ? null : round ? r1(value) : Math.round(value), unit, usual: usual.ready ? usual : null });
  const resp = (x) => (x?.whoop?.sleep?.score_state === 'SCORED' ? x.whoop.sleep.score?.respiratory_rate ?? null : null);
  const sn = sleepNumbers(e.sleep);
  return {
    ...c.recovery, line: c.line,
    rows: [
      row('hrv', 'Heart rate variability', r.hrv_rmssd_milli, 'ms', usualOf(daily, today, fromRec('hrv_rmssd_milli'))),
      row('rhr', 'Resting heart rate', r.resting_heart_rate, 'bpm', usualOf(daily, today, fromRec('resting_heart_rate'))),
      row('resp', 'Respiratory rate', sl.respiratory_rate, 'rpm', usualOf(daily, today, resp, 1), 1),
      row('sleep', 'Sleep performance', sl.sleep_performance_percentage, '%', { ready: false }),
      row('spo2', 'Blood oxygen', r.spo2_percentage, '%', usualOf(daily, today, fromRec('spo2_percentage'))),
      row('skin', 'Skin temp', r.skin_temp_celsius, '°C', usualOf(daily, today, fromRec('skin_temp_celsius'), 1), 1),
    ].filter((x) => x.value != null),
    sleep: sn,
  };
}
// Sleep: when, the stages, hours against what WHOOP says you needed (and why), and its other scores.
export function sleepDetail(daily = {}, today) {
  const s = daily[today]?.whoop?.sleep;
  if (s?.score_state !== 'SCORED' || !s.score) return { state: !s ? 'none' : s.score_state === 'UNSCORABLE' ? 'unscorable' : 'pending' };
  const st = s.score.stage_summary || {}, nd = s.score.sleep_needed || {}, h = (ms) => r1((ms || 0) / 3.6e6);
  const resp = usualOf(daily, today, (x) => (x?.whoop?.sleep?.score_state === 'SCORED' ? x.whoop.sleep.score?.respiratory_rate ?? null : null), 1);
  return {
    state: 'scored', performance: s.score.sleep_performance_percentage ?? null, from: clockAt(s.start, s.timezone_offset), to: clockAt(s.end, s.timezone_offset),
    ...sleepNumbers(s), inBed: h(st.total_in_bed_time_milli),
    stages: [['Awake', h(st.total_awake_time_milli)], ['Light', h(st.total_light_sleep_time_milli)], ['Deep (SWS)', h(st.total_slow_wave_sleep_time_milli)], ['REM', h(st.total_rem_sleep_time_milli)]],
    need: { baseline: h(nd.baseline_milli), debt: h(nd.need_from_sleep_debt_milli), strain: h(nd.need_from_recent_strain_milli), nap: h(nd.need_from_recent_nap_milli) },
    consistency: s.score.sleep_consistency_percentage ?? null, efficiency: s.score.sleep_efficiency_percentage != null ? Math.round(s.score.sleep_efficiency_percentage) : null,
    respiratory: r1(s.score.respiratory_rate), respiratoryUsual: resp.ready ? resp : null,
    disturbances: st.disturbance_count ?? null, cycles: st.sleep_cycle_count ?? null,
  };
}
// Strain: today's so far, and today's WHOOP workouts with their heart-rate zones (WHOOP gives zones
// per workout, not for the whole day — the total is your workouts'). `workouts`: workoutHistory.
export function strainDetail(daily = {}, today, workouts = []) {
  const cy = daily[today]?.whoop?.cycle, sc = cy?.score || {};
  const list = workouts.filter((x) => /^whoop:/.test(x.id || '') && x.start && localDate(x.start, x.tz) === today).sort((a, b) => b.start.localeCompare(a.start));
  const zones = [0, 1, 2, 3, 4, 5].map((i) => list.reduce((a, x) => a + (x.zones?.[i] || 0), 0));
  return {
    strain: r1(sc.strain), yesterday: recoveryContext(daily, today).strain.yesterday,
    kcal: Number.isFinite(sc.kilojoule) ? Math.round(sc.kilojoule / 4.184) : null, avgHr: sc.average_heart_rate ?? null, maxHr: sc.max_heart_rate ?? null, steps: cy?.step_count ?? null,
    zones: zones.some(Boolean) ? zones : null,
    workouts: list.map((x) => ({ id: x.id, name: x.name, at: clockAt(x.start, x.tz), minutes: x.minutes, strain: r1(x.strain), kcal: x.kcal, avgHr: x.avgHr ?? null, maxHr: x.maxHr ?? null })),
  };
}

// 🧭 The one read-only interface a future planner gets (docs/TALK_TO_PAWMILY.md): structured
// facts only — no prose, no names, notes, history, raw stages, calendar, family, Threads, meals or
// location. Not sent anywhere in Health 2 Phase B.
export function dayContextForPlanning({ daily = {}, today, workout = null, history = [] } = {}) {
  const c = recoveryContext(daily, today);
  const dur = workout ? durationFor(workout, history) : null;
  return {
    date: today,
    recovery: { state: c.recovery.state, scoreBand: c.recovery.band, relativeToUsual: c.recovery.relative },
    sleep: { hours: c.sleep.hours ?? null, neededHours: c.sleep.neededHours ?? null, deficitMinutes: c.sleep.deficitMinutes ?? null },
    strain: { yesterday: c.strain.yesterday, today: c.strain.today },
    plannedWorkout: workout ? { id: workout.id, name: workout.title, estimatedMinutes: dur?.minutes ?? null, status: workout.status } : null,
  };
}
