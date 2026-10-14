// End-of-program review: what happened over the phase, and what to do next.
// Next-step advice follows:
//   diet breaks of 1–2 weeks at maintenance (Byrne et al. 2018 MATADOR; Peos et al. 2021 ICECAP),
//   slowing loss from metabolic adaptation (Trexler et al. 2014),
//   lean gain at ~0.25–0.5% body weight/week (Iraki et al. 2019).
import { buildTables } from './analytics.js';
import { PHASES, weeklyTrend } from './plan.js';
import { EXERCISES } from './lifting.js';

const DAY = 86400000;
const day = (d) => new Date(d + 'T12:00').getTime();

// 7-day average weight around a date (falls back to the nearest weigh-ins).
function avgNear(weights, date, dir) {
  const t = day(date);
  const win = weights.filter((w) => (dir < 0 ? day(w.date) >= t && day(w.date) < t + 7 * DAY : day(w.date) <= t && day(w.date) > t - 7 * DAY));
  const xs = (win.length ? win : weights).map((w) => w.weight);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// Estimated one-rep max (Epley) — a fair way to compare sets of different reps.
const e1rm = (w, r) => w * (1 + r / 30);

// plan = {rate: planned lb/week lost, atFloor: calories already at the safe minimum}
export function programReview(data, today, plan = {}) {
  const profile = data.profile || {};
  const phase = PHASES[profile.phase] ? profile.phase : 'cut';
  const start = profile.phaseStart || profile.createdOn || (data.weights?.[0]?.date) || today;
  const weeksPlanned = profile.phaseWeeks || PHASES[phase].weeks;
  const daysIn = Math.max(1, Math.round((day(today) - day(start)) / DAY) + 1);
  const weeksDone = +(daysIn / 7).toFixed(1);
  const inPhase = (r) => r.date >= start && r.date <= today;

  const weights = (data.weights || []).filter(inPhase);
  const startW = avgNear(weights, start, -1);
  const endW = avgNear(weights, today, 1);
  const change = startW != null && endW != null ? +(endW - startW).toFixed(1) : null;
  const trend = weeklyTrend(weights, 28);
  const ratePerWeek = trend ? +(-trend.lbPerWeek).toFixed(2) : (change != null ? +(-change / Math.max(weeksDone, 1)).toFixed(2) : null);
  const t = buildTables(data);
  const mains = t.meals.filter((m) => inPhase(m) && ['breakfast', 'lunch', 'dinner'].includes(m.meal));
  const judged = mains.filter((m) => m.on_target !== '');
  const days = t.days.filter(inPhase);
  const logged = days.filter((d) => d.result !== 'unlogged' && d.result !== 'incomplete');
  const onTrack = logged.filter((d) => ['deficit', 'too-big', 'maintained', 'on-plan'].includes(d.result));

  // Strength: best estimated 1RM per exercise in the first vs last two weeks of the phase.
  const sets = t.lifting_sets.filter(inPhase);
  const lifts = {};
  for (const s of sets) {
    if (s.week === 'deload') continue; // deload sets are light on purpose
    const k = s.exercise;
    const early = day(s.date) < day(start) + 14 * DAY;
    const late = day(s.date) > day(today) - 14 * DAY;
    const v = e1rm(+s.weight_lb, +s.reps);
    lifts[k] ||= { exercise: k, first: 0, last: 0 };
    if (early) lifts[k].first = Math.max(lifts[k].first, v);
    if (late) lifts[k].last = Math.max(lifts[k].last, v);
  }
  const mainNames = ['backSquat', 'bench', 'rdl', 'ohp', 'bbRow', 'trapBar', 'pullUp', 'deadlift'].map((k) => EXERCISES[k].name);
  const strength = Object.values(lifts).filter((l) => l.first && l.last)
    .sort((a, b) => (mainNames.indexOf(a.exercise) + 1 || 99) - (mainNames.indexOf(b.exercise) + 1 || 99))
    .slice(0, 5)
    .map((l) => ({ exercise: l.exercise, from: Math.round(l.first), to: Math.round(l.last), pct: Math.round(((l.last - l.first) / l.first) * 100) }));

  const r = {
    phase, start, today, weeksDone, weeksPlanned, done: daysIn >= weeksPlanned * 7,
    weight: { start: startW && +startW.toFixed(1), end: endW && +endW.toFixed(1), change, ratePerWeek, goal: profile.goalLb,
      pctBody: startW && change != null ? +((change / startW) * 100).toFixed(1) : null },
    nutrition: {
      daysLogged: logged.length, days: daysIn, mealsLogged: mains.length, mealsPossible: daysIn * 3,
      onTargetPct: judged.length ? Math.round((judged.filter((m) => m.on_target === 'yes').length / judged.length) * 100) : null,
      daysOnTrack: onTrack.length, proteinDays: logged.filter((d) => d.protein_g >= d.protein_target_g * 0.9).length,
      coins: days.reduce((a, d) => a + (+d.coins || 0), 0),
    },
    training: {
      workouts: t.lifting_sessions.filter(inPhase).length,
      activities: t.activities.filter(inPhase).length,
      activityHours: +(t.activities.filter(inPhase).reduce((a, x) => a + (+x.minutes || 0), 0) / 60).toFixed(1),
      strength,
    },
  };
  r.weight.plannedRate = plan.rate ?? null;
  r.next = nextSteps(r, profile, plan);
  return r;
}

// Options for what to do next, best first. Each has an action the app can start.
export function nextSteps(r, profile, plan = {}) {
  const w = r.weight;
  const n = r.nutrition;
  const plannedRate = plan.rate ?? null;
  // "Slow" means under half the planned pace (or under 0.25 lb/week without a plan).
  const slow = w.ratePerWeek != null && w.ratePerWeek < Math.max(0.25, (plannedRate || 0) * 0.5);
  const adherence = n.days ? n.daysLogged / n.days : 0;
  const accurate = (n.onTargetPct ?? 0) >= 60;
  const strengthUp = r.training.strength.filter((s) => s.pct >= 0).length >= Math.ceil(r.training.strength.length / 2);
  const opts = [];
  const add = (id, title, why, extra = {}) => opts.push({ id, title, why, ...extra });
  const goal = w.goal;
  const current = w.end ?? w.start;
  const atGoal = goal != null && current != null && current <= goal + 0.5;

  if (r.phase === 'cut') {
    if (atGoal) {
      add('maintain', 'Switch to maintenance for 4 weeks', `You reached your goal (${current} lb). Eating at maintenance lets your body settle at the new weight and makes it easier to keep.`, { recommended: true });
      add('gain', 'Then build muscle with a lean gain', 'A small surplus (~0.25% of body weight a week) with your lifting turns the leaner base into muscle.');
      add('cut', 'Set a new, lower goal and keep cutting', 'Only if you still want to lose more — start a fresh 8-week cut.');
    } else if (w.ratePerWeek > 0.2 && current - goal <= Math.max(2, w.ratePerWeek * 2.5)) {
      const wks = Math.max(1, Math.ceil((current - goal) / w.ratePerWeek));
      add('cut', `Finish the last ${(current - goal).toFixed(1)} lb, then maintain`, `You're about ${wks} week${wks > 1 ? 's' : ''} from your goal at your current pace. Keep the same targets to finish, then switch to maintenance.`, { recommended: true, weeks: wks + 1 });
      add('break', 'Take a 2-week diet break first', 'If you feel worn down, two weeks at maintenance first is fine — the last pounds will still come off after.');
    } else if (adherence < 0.6 || !accurate) {
      add('cut', 'Keep cutting, focus on logging', `You logged ${n.daysLogged} of ${n.days} days and ${n.onTargetPct ?? 0}% of meals were on target. Results follow consistency: keep the same targets for another 8 weeks and log every meal.`, { recommended: true });
      add('break', 'Take a 2-week diet break first', 'If the plan felt hard, two weeks at maintenance can reset hunger and motivation before you continue.');
    } else if (slow) {
      const vs = plannedRate ? ` (${w.ratePerWeek} vs ${plannedRate} lb/week planned)` : '';
      add('break', 'Take a 2-week diet break, then cut again', `Weight loss has been slower than planned${vs} even though you stuck to the plan — a normal adaptation after weeks of dieting. Two weeks at maintenance usually lowers hunger, and then the next cut starts fresh.`, { recommended: true });
      if (plan.atFloor) add('cut', 'Keep cutting and add daily walks', 'Your calories are already at the safe minimum, so move more instead: a 30–45 min walk most days adds roughly 150–250 kcal of burn.');
      else add('cut', 'Keep cutting with 100 kcal less', 'If you’d rather push on, a small cut from carbs restarts progress.', { adjust: -100 });
    } else {
      add('break', 'Take a 2-week diet break, then continue', `You're losing about ${w.ratePerWeek} lb/week and still ${(current - goal).toFixed(1)} lb from your goal. After 8 weeks of dieting, a 2-week break at maintenance reduces hunger and helps you finish strong.`, { recommended: true });
      add('cut', 'Continue the cut for another 8 weeks', 'Same targets, no break — fine if you feel good and training is going well.');
    }
    add('maintain', 'Stop here and maintain', 'Happy with where you are? Hold this weight for now.');
  } else if (r.phase === 'break') {
    add('cut', 'Resume the cut for another 8 weeks', 'Your break is done. Back to your deficit with fresh motivation.', { recommended: !atGoal });
    add('maintain', 'Stay at maintenance', 'If life is busy, holding steady is a win too.', { recommended: atGoal });
  } else if (r.phase === 'maintain') {
    add('gain', 'Start a lean gain', 'Weight is stable — a good time to build muscle with a small surplus.', { recommended: strengthUp });
    add('maintain', 'Keep maintaining', 'Stay here as long as you like.', { recommended: !strengthUp });
    add('cut', 'Start a new cut', 'If you want to get leaner, run another 8-week cut.');
  } else {
    add('maintain', 'Switch to maintenance', 'Lock in the muscle you built before deciding on the next phase.', { recommended: true });
    add('gain', 'Keep gaining', 'If strength is still climbing and you’re gaining slowly, continue.');
    add('cut', 'Start a cut', 'If you’ve gained more fat than you’d like, a cut brings it back down.');
  }
  // Training tip for the next phase.
  const tip = r.training.workouts < 12
    ? 'Training: aim for all three lifting days each week — most of the muscle you keep while cutting comes from lifting consistently.'
    : strengthUp
      ? 'Training: your lifts went up — start the next 6-week block and try a new variation for one exercise per day to keep progress coming.'
      : 'Training: holding strength while dieting is a success. Keep the same program and push for one more rep each week.';
  return { options: opts, tip };
}
