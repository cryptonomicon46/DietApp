// 📈 Plan progress: where you are in your plan, and whether your recent weigh-ins say it's working.
// Pure and on the phone — nothing here is sent anywhere. Short-term body weight is noisy (water,
// salt, carbs, training), so the status is "Too early to tell" whenever the signal is weak, and
// every projection is worded as an estimate from the recent trend. Nothing here changes targets:
// the approve-first weekly check-in stays the only way they change.
import { PHASES, weeklyTrend, goalProjection } from './plan.js';

const DAY = 864e5;
const t = (iso) => Date.parse(`${iso}T12:00:00Z`);
const shift = (iso, n) => new Date(t(iso) + n * DAY).toISOString().slice(0, 10);
const r1 = (n) => Math.round(n * 10) / 10;
export const STATUS = {
  'on-track': { label: 'On track', icon: '✅' },
  behind: { label: 'Behind plan', icon: '⏳' },
  ahead: { label: 'Ahead of plan', icon: '⚡' },
  'too-early': { label: 'Too early to tell', icon: '🌱' },
};
// What counts as enough to judge a trend.
export const MIN = { weighIns: 5, spanDays: 10, maxGapDays: 7, plausibleLbPerWeek: 3, plausiblePct: 0.015 };
const fmt = (iso) => new Date(t(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// How good the last three weeks of weigh-ins are (for this phase only).
export function dataQuality(weights, today, since = '') {
  const from = shift(today, -21);
  const pts = weights.filter((w) => w.date >= from && w.date <= today && (!since || w.date >= since));
  const span = pts.length >= 2 ? (t(pts.at(-1).date) - t(pts[0].date)) / DAY : 0;
  let gap = 0;
  for (let i = 1; i < pts.length; i++) gap = Math.max(gap, (t(pts[i].date) - t(pts[i - 1].date)) / DAY);
  const last7 = weights.filter((w) => w.date > shift(today, -7) && w.date <= today).length;
  const reasons = [];
  if (pts.length < MIN.weighIns) reasons.push(`${pts.length} weigh-in${pts.length === 1 ? '' : 's'} so far (a trend needs about ${MIN.weighIns})`);
  if (span < MIN.spanDays) reasons.push(`${Math.round(span)} day${Math.round(span) === 1 ? '' : 's'} of data (a trend needs about two weeks)`);
  if (gap > MIN.maxGapDays && pts.length < 8) reasons.push(`a ${Math.round(gap)}-day gap between weigh-ins`);
  return { points: pts, weighIns: pts.length, spanDays: Math.round(span), maxGapDays: Math.round(gap), last7, ok: !reasons.length, reasons };
}

// One person's plan progress. `planned` is lb/week lost from dailyTargets (positive = losing,
// negative = gaining, 0 = holding). `days` is the trackers' day records (for logging adherence).
export function planProgress({ profile = {}, weights = [], days = {}, today, planned = null }) {
  const phase = PHASES[profile.phase] ? profile.phase : 'cut';
  // The phase starts where the trackers' Program card says it does.
  const iso = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
  const start = iso(profile.phaseStart) || iso(profile.createdOn);
  const weeks = +profile.phaseWeeks || PHASES[phase].weeks;
  const week = start ? Math.min(weeks, Math.max(1, Math.floor((t(today) - t(start)) / (7 * DAY)) + 1)) : null;
  const end = start ? shift(start, weeks * 7) : null;
  const daysLeft = end ? Math.max(0, Math.round((t(end) - t(today)) / DAY)) : null;
  const done = end ? today >= end : false;
  const ws = weights.filter((w) => w?.date && +w.weight > 0).map((w) => ({ date: w.date, weight: +w.weight })).sort((a, b) => a.date.localeCompare(b.date));
  const current = ws.at(-1)?.weight || +profile.weight || null;
  const goalLb = +profile.goalLb || null;
  const toGo = goalLb && current ? r1(current - goalLb) : null;
  const logged7 = [...Array(7).keys()].map((i) => days[shift(today, -i)]).filter((d) => d && ((+d.meals || 0) > 0 || (+d.eaten || 0) > 0)).length;
  const base = { phase, phaseLabel: PHASES[phase].label, week, weeks, end, daysLeft, done, current, goalLb, toGo, logged7 };

  const q = dataQuality(ws, today, iso(profile.phaseStart) || '');
  const trendRaw = q.points.length >= 2 ? weeklyTrend(q.points) : null;
  // Positive = losing, like `planned`.
  const trend = trendRaw ? r1(-trendRaw.lbPerWeek) : null;
  const plan = planned == null ? (phase === 'cut' ? null : 0) : +planned;
  const why = [];
  if (trend != null) why.push(`Recent estimated trend: ${trend > 0 ? `losing ${trend}` : trend < 0 ? `gaining ${-trend}` : 'holding at'} lb/week (from ${q.weighIns} weigh-ins over ${q.spanDays} days)`);
  if (plan != null) why.push(`Plan: ${plan > 0 ? `lose ${r1(plan)}` : plan < 0 ? `gain ${r1(-plan)}` : 'hold steady at'} lb/week`);
  if (!goalLb && phase !== 'maintain' && phase !== 'break') why.push('No goal weight set, so there is no date estimate');
  why.push(`Meals logged on ${logged7} of the last 7 days · ${q.last7} weigh-in${q.last7 === 1 ? '' : 's'} this week`);

  // Weak signal: say so, and say what would make it clear.
  const implausible = trend != null && current && (Math.abs(trend) > MIN.plausibleLbPerWeek || Math.abs(trend) > current * MIN.plausiblePct);
  if (!q.ok || trend == null || implausible) {
    const reasons = [...q.reasons, ...(implausible ? [`the recent change (${Math.abs(trend)} lb/week) is bigger than body fat changes that fast — usually water, salt or carbs`] : [])];
    return { ...base, status: 'too-early', trend, planned: plan, quality: q, why: [...reasons.map((x) => `Not enough to judge yet: ${x}`), ...why], estimate: null, next: nextStep('too-early', { q, logged7, phase }) };
  }

  // Compare with the plan. Maintenance and diet breaks aim to hold steady.
  const target = phase === 'break' || phase === 'maintain' ? 0 : plan;
  if (target == null) return { ...base, status: 'too-early', trend, planned: plan, quality: q, why: ['No planned rate yet — set your pace in the plan', ...why], estimate: null, next: 'Set your goal and pace in the plan.' };
  const tol = Math.max(0.3, Math.abs(target) * 0.35);
  // For a gain phase "ahead" means gaining faster than planned; for a cut, losing faster.
  const diff = phase === 'gain' ? (-trend) - (-target) : trend - target;
  let status = Math.abs(diff) <= tol ? 'on-track' : diff < 0 ? 'behind' : 'ahead';
  if (target === 0) status = Math.abs(trend) <= tol ? 'on-track' : 'behind';

  // A goal-date estimate only for a cut or gain with a goal, worded as an estimate.
  let estimate = null;
  if (goalLb && current && (phase === 'cut' || phase === 'gain') && toGo) {
    const plannedProj = plan ? goalProjection(profile, current, new Date(t(today)), plan) : null;
    const plannedDate = plannedProj && !plannedProj.reached ? new Date(plannedProj.date).toISOString().slice(0, 10) : null;
    const rate = phase === 'gain' ? -trend : trend;
    const away = phase === 'gain' ? -toGo : toGo;
    if (rate > 0.1 && away > 0) {
      const date = shift(today, Math.round((away / rate) * 7));
      const likely = !plannedDate || date <= shift(plannedDate, 7);
      estimate = { date, plannedDate, likely, text: plannedDate
        ? `At your recent estimated trend, ${likely ? `you'd reach ${goalLb} lb around ${fmt(date)} — on course for ${fmt(plannedDate)}` : `reaching ${goalLb} lb by ${fmt(plannedDate)} is unlikely (around ${fmt(date)} instead)`}.`
        : `At your recent estimated trend, you'd reach ${goalLb} lb around ${fmt(date)}.` };
    } else if (plannedDate) {
      estimate = { date: null, plannedDate, likely: false, text: `At your recent estimated trend, reaching ${goalLb} lb by ${fmt(plannedDate)} is unlikely.` };
    }
  }
  return { ...base, status, trend, planned: plan, quality: q, why, estimate, next: nextStep(status, { q, logged7, phase, trend, current }) };
}

// The one most useful thing to do next.
function nextStep(status, { q, logged7, phase, trend, current }) {
  if (logged7 < 5) return `Meals are logged on ${logged7} of the last 7 days — logging most days makes the trend trustworthy.`;
  if (q.last7 < 3) return 'Weigh in 3–4 mornings a week, same time, before eating.';
  if (status === 'too-early') return 'Keep weighing in — a clear trend needs about two weeks.';
  if (status === 'behind') return phase === 'cut' ? 'Your weekly check-in can suggest a small calorie change — nothing changes until you approve it.' : 'Your weekly check-in can suggest a change — nothing changes until you approve it.';
  if (status === 'ahead' && phase === 'cut' && current && trend > current * 0.01) return 'Losing quickly — keep protein on target and check in on how you feel.';
  return 'Keep doing what you\'re doing.';
}
