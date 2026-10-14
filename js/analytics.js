// Turns one person's saved data into spreadsheet-ready tables and a short summary.
import { EXERCISES, MUSCLES } from './lifting.js';
import { SPORTS, INTENSITY } from './activity.js';
import { scoreDay } from './rewards.js';
import { FEELINGS } from './plan.js';

// A meal counts as "on target" when calories are within ±10% of the meal's target and
// protein reaches 90% of it. Fat and carbs can trade places (salmon has more fat, oats
// more carbs); what matters for fat loss is total energy and protein.
export function mealOnTarget(m) {
  const t = m.target;
  if (!t) return null;
  return Math.abs(m.kcal - t.kcal) <= t.kcal * 0.10 && m.p >= t.p * 0.9;
}

const pct = (v, goal) => (goal ? Math.round(((v - goal) / goal) * 100) : '');

// All logged days: past days from mealLog plus today's open log.
function mealLogs(data) {
  const logs = { ...(data.mealLog || {}) };
  if (data.eaten?.date) { const { date, ...log } = data.eaten; logs[date] = log; }
  return logs;
}

export function buildTables(data) {
  const logs = mealLogs(data);
  const weights = data.weights || [];
  const weightOn = Object.fromEntries(weights.map((w) => [w.date, w.weight]));

  const meals = [];
  for (const date of Object.keys(logs).sort()) {
    const log = logs[date];
    for (const name of ['breakfast', 'lunch', 'snack', 'dinner']) {
      const m = log.meals?.[name];
      if (!m) continue;
      const t = m.target || {};
      const ok = mealOnTarget(m);
      meals.push({
        date, meal: name, title: m.title, foods: m.foods || '', kcal: m.kcal, protein_g: m.p, fat_g: m.f, carbs_g: m.c,
        target_kcal: t.kcal ?? '', target_protein_g: t.p ?? '', target_fat_g: t.f ?? '', target_carbs_g: t.c ?? '',
        kcal_vs_target_pct: pct(m.kcal, t.kcal), on_target: ok == null ? '' : ok ? 'yes' : 'no', logged_at: m.at || '',
      });
    }
    if (log.fuel) meals.push({ date, meal: 'workout fuel', title: log.fuel.title, kcal: log.fuel.kcal, protein_g: 0, fat_g: 0, carbs_g: log.fuel.c });
    for (const x of log.extras || []) meals.push({ date, meal: 'snack', title: x.title, kcal: x.kcal, protein_g: x.p, fat_g: x.f, carbs_g: x.c });
  }

  const days = Object.keys(data.days || {}).sort().map((date) => {
    const d = data.days[date];
    const s = scoreDay(d);
    const logged = logs[date]?.meals ? Object.keys(logs[date].meals).length : '';
    return {
      date, target_kcal: d.target, eaten_kcal: d.eaten, burned_kcal: d.burned, deficit_kcal: Math.round(d.burned - d.eaten),
      protein_g: d.protein, protein_target_g: d.proteinTarget, meals_logged: logged, result: s.status, coins: s.coins, cookies: s.cookies,
      weight_lb: weightOn[date] ?? '',
    };
  });

  const activities = [
    ...(data.activities || []).map((a) => ({
      date: a.date, source: 'added by you', activity: SPORTS[a.sport]?.name || a.type, minutes: a.minutes,
      kcal: a.kcal ?? '', intensity: INTENSITY[a.intensity]?.label || '', strain: '',
    })),
    ...(data.workoutHistory || []).map((w) => ({
      date: String(w.start).slice(0, 10), source: String(w.id).split(':')[0].replace('whoopcsv', 'whoop'), activity: w.name, minutes: w.minutes,
      kcal: w.kcal ?? '', intensity: '', strain: w.strain ?? '',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const sessions = data.lift?.sessions || [];
  const lifting_sets = [];
  const lifting_sessions = sessions.map((s) => {
    let sets = 0, volume = 0;
    for (const e of s.entries) {
      e.sets.forEach((x, i) => {
        sets++; volume += x.w * x.r;
        lifting_sets.push({
          date: s.date, block: s.block, week: s.week === 6 ? 'deload' : s.week, day: s.day,
          exercise: EXERCISES[e.exercise]?.name || e.exercise, muscle: MUSCLES[EXERCISES[e.exercise]?.muscle] || '',
          set: i + 1, weight_lb: x.w, reps: x.r, bodyweight: x.bw ? 'yes' : '',
        });
      });
    }
    return { date: s.date, block: s.block, week: s.week === 6 ? 'deload' : s.week, day: s.day, exercises: s.entries.filter((e) => e.sets.length).length, sets, volume_lb: volume };
  });

  const weigh_ins = weights.map((w) => ({ date: w.date, weight_lb: w.weight }));
  const checkins = (data.checkins || []).map((c) => ({
    date: c.date, feeling: FEELINGS[c.feeling] || '', note: c.note || '', change: c.change, kcal_change: c.kcal,
    protein_change_g: c.delta?.p ?? '', fat_change_g: c.delta?.f ?? '', carbs_change_g: c.delta?.c ?? '',
  }));

  return { meals, days, activities, lifting_sessions, lifting_sets, weigh_ins, checkins };
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

// Quick stats for the last `n` days (including today).
export function summary(data, today, n = 30) {
  const t = buildTables(data);
  const from = new Date(today + 'T12:00'); from.setDate(from.getDate() - (n - 1));
  const since = from.toISOString().slice(0, 10);
  const inRange = (r) => r.date >= since && r.date <= today;
  const meals = t.meals.filter((m) => inRange(m) && ['breakfast', 'lunch', 'dinner'].includes(m.meal));
  const judged = meals.filter((m) => m.on_target !== '');
  const days = t.days.filter(inRange);
  const logged = days.filter((d) => d.result !== 'unlogged');
  return {
    days: n,
    mealsLogged: meals.length,
    mealsOnTarget: judged.filter((m) => m.on_target === 'yes').length,
    mealsJudged: judged.length,
    daysLogged: logged.length,
    deficitDays: logged.filter((d) => ['deficit', 'too-big', 'maintained'].includes(d.result)).length,
    proteinDays: logged.filter((d) => d.protein_g >= d.protein_target_g * 0.9).length,
    liftSessions: t.lifting_sessions.filter(inRange).length,
    activities: t.activities.filter(inRange).length,
    activityMinutes: t.activities.filter(inRange).reduce((a, r) => a + (+r.minutes || 0), 0),
  };
}
