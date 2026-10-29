// 💬 "Ask about my plan": what may go to Claude, and nothing else. The phone builds the facts from
// your own plan; the connector rebuilds them through the same allowlist before anything is sent,
// so a name, a meal, a note or a weight list can't ride along even if a phone tried.
//
// Allowed: phase, week, weeks, days left; today's targets; a 7-day summary of how many days were
// logged / on target and the average calories and protein on logged days; the calculated trend
// and the planned rate (lb/week); the plan's status; the planned goal date and the estimate; a
// count of training days; how much weigh-in data the trend rests on; and your question.
// Never: names, anyone else's data, meal names or descriptions, food or workout notes, weights,
// household content, threads, pets, keys.
import { planProgress } from './planProgress.js';
import { consistency } from './dietDays.js';

const PHASES = ['cut', 'break', 'maintain', 'gain'];
const STATUSES = ['on-track', 'behind', 'ahead', 'too-early'];
const num = (v, lo, hi, dp = 1) => { const n = +v; return v == null || v === '' || !Number.isFinite(n) ? null : Math.round(Math.min(hi, Math.max(lo, n)) * 10 ** dp) / 10 ** dp; };
const int = (v, lo, hi) => num(v, lo, hi, 0);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

// The allowlist: anything not named here is dropped, and every value is a bounded number, a
// date or one of a few fixed words.
export function cleanFacts(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.targets && typeof r.targets === 'object' ? r.targets : {};
  const a = r.adherence && typeof r.adherence === 'object' ? r.adherence : {};
  const d = r.data && typeof r.data === 'object' ? r.data : {};
  return {
    phase: PHASES.includes(r.phase) ? r.phase : null,
    week: int(r.week, 1, 104), weeks: int(r.weeks, 1, 104), daysLeft: int(r.daysLeft, 0, 800),
    targets: { kcal: int(t.kcal, 0, 9000), protein: int(t.protein, 0, 600), carbs: int(t.carbs, 0, 1500), fat: int(t.fat, 0, 600) },
    adherence: { daysLogged: int(a.daysLogged, 0, 7), daysOnTarget: int(a.daysOnTarget, 0, 7), avgKcal: int(a.avgKcal, 0, 9000), avgProtein: int(a.avgProtein, 0, 600) },
    trendLbPerWeek: num(r.trendLbPerWeek, -10, 10, 2), plannedLbPerWeek: num(r.plannedLbPerWeek, -5, 5, 2),
    status: STATUSES.includes(r.status) ? r.status : null,
    goalDate: date(r.goalDate), estimateDate: date(r.estimateDate),
    trainingDays7: int(r.trainingDays7, 0, 7),
    data: { weighIns: int(d.weighIns, 0, 400), spanDays: int(d.spanDays, 0, 400) },
  };
}
// Earlier turns of this chat: your questions and Claude's answers only (a few, each short).
export function cleanTurns(raw) {
  return (Array.isArray(raw) ? raw : []).slice(-4).map((x) => ({ q: String(x?.q ?? '').slice(0, 500), a: String(x?.a ?? '').slice(0, 800) })).filter((x) => x.q);
}

const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// The facts for your plan, from your own trackers. targets: today's {kcal, p, c, f}; planned:
// lb/week from dailyTargets; trainingDates: the dates you trained (any source).
export function planFacts({ profile = {}, weights = [], days = {}, today, targets = {}, planned = null, trainingDates = [] }) {
  const pr = planProgress({ profile, weights, days, today, planned });
  const last7 = [...Array(7).keys()].map((i) => days[shift(today, -i)]).filter((x) => x && (+x.meals || 0) > 0);
  const avg = (k) => (last7.length ? last7.reduce((s, x) => s + (+x[k] || 0), 0) / last7.length : null);
  const from = shift(today, -6);
  return cleanFacts({
    phase: pr.phase, week: pr.week, weeks: pr.weeks, daysLeft: pr.daysLeft,
    targets: { kcal: targets.kcal, protein: targets.p, carbs: targets.c, fat: targets.f },
    adherence: { daysLogged: last7.length, daysOnTarget: consistency(days, today).on, avgKcal: avg('eaten'), avgProtein: avg('protein') },
    trendLbPerWeek: pr.trend, plannedLbPerWeek: pr.planned, status: pr.status,
    goalDate: pr.estimate?.plannedDate || null, estimateDate: pr.estimate?.date || null,
    trainingDays7: new Set(trainingDates.filter((x) => x >= from && x <= today)).size,
    data: { weighIns: pr.quality.weighIns, spanDays: pr.quality.spanDays },
  });
}
// What the "What's sent" line shows, in words.
export function factsText(f) {
  const out = [];
  if (f.phase) out.push(`phase ${f.phase}${f.week ? `, week ${f.week} of ${f.weeks}` : ''}${f.daysLeft != null ? `, ${f.daysLeft} days left` : ''}`);
  if (f.targets.kcal) out.push(`targets ${f.targets.kcal} kcal · ${f.targets.protein} g protein · ${f.targets.carbs} g carbs · ${f.targets.fat} g fat`);
  out.push(`last 7 days: ${f.adherence.daysLogged} logged, ${f.adherence.daysOnTarget} on target${f.adherence.avgKcal != null ? `, about ${f.adherence.avgKcal} kcal and ${f.adherence.avgProtein} g protein on logged days` : ''}`);
  if (f.trendLbPerWeek != null) out.push(`trend ${f.trendLbPerWeek} lb/week (positive = losing) from ${f.data.weighIns} weigh-ins over ${f.data.spanDays} days`);
  if (f.plannedLbPerWeek != null) out.push(`planned ${f.plannedLbPerWeek} lb/week`);
  if (f.status) out.push(`status ${f.status}`);
  if (f.goalDate) out.push(`planned goal date ${f.goalDate}${f.estimateDate ? `, estimate ${f.estimateDate}` : ''}`);
  out.push(`${f.trainingDays7} training days this week`);
  return out;
}
