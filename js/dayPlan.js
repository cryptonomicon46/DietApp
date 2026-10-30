// 🍽 One person's food day, worked out from their tracker copy (the same keys the trackers keep:
// profile, weights, custom, planned, dailyMeals, eaten, mealLog, …). Shared by the trackers
// (js/app.js) and Health (family/meals.js) so both see the same plan, the same totals and the
// same "what's left", and log meals the same way. Pure: data in, data out — the changes at the
// bottom take a store ({get, set}) and only touch the keys they name.
import { dailyTargets, activityOf, planForDay, DRINKS } from './plan.js';
import { trainingDay, applyTraining } from './activity.js';
import { FOODS, addScannedFoods, addMyFoods, makeMyFood } from './foods.js';

export const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'];
export const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const localDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const clone = (x) => JSON.parse(JSON.stringify(x));
const r = Math.round;

// The foods only this person (or their partner on this phone) added: scanned packages and My foods.
export function registerFoods(data = {}, more = []) {
  addScannedFoods(data.scannedFoods || {});
  const list = {};
  for (const [owner, mine] of [['me', data.myFoods || {}], ...more]) for (const [id, e] of Object.entries(mine || {})) list[id] = { ...makeMyFood(e), by: owner, ...(e.deleted ? { hidden: true } : {}) };
  addMyFoods(list);
}

export const currentWeightOf = (data) => { const w = data.weights || []; return w.length ? w[w.length - 1].weight : data.profile?.weight; };

// The day's base targets, with the weekly check-ins' changes (never below the safe minimum).
export function baseTargetsOf(data) {
  const t = dailyTargets(data.profile, currentWeightOf(data), data.adjust || 0);
  const a = data.macroAdjust || { p: 0, f: 0, c: 0 };
  const p = Math.max(t.p + (a.p || 0), 60), f = Math.max(t.f + (a.f || 0), 25);
  let c = Math.max(t.c + (a.c || 0), 30);
  const floor = data.profile?.sex === 'male' ? 1500 : 1200;
  const kcalWith = (cc) => t.kcal + (p - t.p) * 4 + (f - t.f) * 9 + (cc - t.c) * 4;
  if (kcalWith(c) < floor) c += Math.ceil((floor - kcalWith(c)) / 4);
  return { ...t, p, f, c, kcal: r(kcalWith(c)), atFloor: kcalWith(c) <= floor + 20 };
}
export function trainingOf(data, today) {
  const base = baseTargetsOf(data);
  const workouts = (data.workouts || []).filter((w) => w?.start && localDay(new Date(w.start)) === today);
  const manual = (data.activities || []).filter((a) => a.date === today);
  return trainingDay(workouts, manual, { bmr: base.bmr, weightKg: currentWeightOf(data) / 2.20462, tracked: !!activityOf(data.profile).tracked });
}
// Today's targets, including workout calories and intra-workout carbs.
export const targetsOf = (data, today) => applyTraining(baseTargetsOf(data), trainingOf(data, today));

// Today's meal changes, read only: today's edits, else what was planned ahead for today.
export function customOf(data, today) {
  return data.custom?.date === today ? data.custom.meals || {} : (data.planned || {})[today] || {};
}
// Meals kept the same every day fill in unless today's version was changed.
export function withDaily(custom, daily = {}) {
  const out = { ...custom };
  for (const [meal, d] of Object.entries(daily || {})) {
    const c = custom[meal] || {};
    if (c.items || c.prepared || c.eatout) continue;
    out[meal] = { ...clone(d), ...(c.lowCarb ? { lowCarb: true } : {}) };
  }
  return out;
}
export const logOf = (data, today) => (data.eaten?.date === today ? { meals: {}, fuel: null, extras: [], ...data.eaten } : { meals: {}, fuel: null, extras: [] });
export function planOf(data, today) {
  return planForDay(targetsOf(data, today), new Date(`${today}T12:00:00`), withDaily(customOf(data, today), data.dailyMeals), data.prefs || {}, { logged: Object.keys(logOf(data, today).meals || {}) });
}
export function consumedOf(log) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, alc: 0 };
  for (const it of [...Object.values(log.meals || {}), ...(log.fuel ? [log.fuel] : []), ...(log.extras || [])]) for (const k in t) t[k] += +it[k] || 0;
  return t;
}
// Calories burned today: a WHOOP total you typed, else resting + daily life + each activity's
// burn; WHOOP's synced total counts once it's past that estimate.
export function burnedOf(data, today) {
  const typed = (data.whoopTotal || {})[today];
  if (typed) return { kcal: typed, source: 'WHOOP (you entered)' };
  const synced = (data.deviceTotal || {})[today];
  const base = baseTargetsOf(data);
  if (!activityOf(data.profile).tracked) return synced > base.tdee ? { kcal: synced, source: 'WHOOP (so far today)' } : { kcal: base.tdee, source: 'estimate from your activity level' };
  const day = trainingOf(data, today);
  const exercise = day.sessions.reduce((a, w) => a + Math.max((w.kcal || 0) - (base.bmr / 1440) * w.minutes, 0), 0);
  const est = r(base.tdee + exercise);
  if (synced > est) return { kcal: synced, source: 'WHOOP (so far today)' };
  return { kcal: est, source: 'estimate: daily life + your activities' };
}
// Positive while cutting, 0 at maintenance or on a diet break, negative on a lean gain.
export function plannedDeficit(base, burned, t) {
  if (base.lbPerWeek < 0) return base.tdee - base.kcal;
  if (base.lbPerWeek === 0) return 0;
  return Math.max(base.tdee - base.kcal, burned - t.kcal);
}
// The day's summary the trackers keep in `days` (and Health reads).
export function dayEntry(data, today) {
  const t = targetsOf(data, today), base = baseTargetsOf(data), log = logOf(data, today), ate = consumedOf(log);
  const burned = burnedOf(data, today).kcal;
  return {
    eaten: r(ate.kcal), burned, target: t.kcal,
    plannedDeficit: plannedDeficit(base, burned, t), protein: r(ate.p), proteinTarget: t.p,
    left: { kcal: r(t.kcal - ate.kcal), p: r(t.p - ate.p), c: r(t.c - ate.c), f: r(t.f - ate.f) },
    floor: data.profile?.sex === 'male' ? 1500 : 1200,
    meals: Object.keys(log.meals || {}).length,
    ...(ate.alc ? { alc: r(ate.alc) } : {}),
    ...(log.done ? { complete: true } : {}),
  };
}
export const atNow = (d = new Date()) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
// What a logged meal keeps: its title, macros, target and foods.
export function snapshotOf(m, at = atNow()) {
  return {
    title: m.title, kcal: m.totals.kcal, p: m.totals.p, f: m.totals.f, c: m.totals.c, target: m.target,
    foods: (m.portions || []).filter((x) => x.grams > 0 && FOODS[x.food]).map((x) => `${FOODS[x.food].name} ${x.grams}g`).join('; '), at,
  };
}
// The next meal to log today (null once breakfast, lunch and dinner are all in).
export function nextMeal(data, today) {
  const log = logOf(data, today);
  return MAIN_MEALS.find((m) => !log.meals?.[m]) || null;
}

// 🍷 Drinks: per drink, scaled by pour for wine (5 oz standard). Alcohol (7 kcal/g) is counted
// in calories but kept apart from protein, carbs and fat: kcal − 4·carbs.
export const POURS = { 5: 1, 6: 1.2, 9: 1.8 };
const WINES = new Set(['redWine', 'whiteWine', 'rose', 'bubbly']);
export function drinkEntry(key, n, pour = 5, custom = null) {
  if (custom) {
    const kcal = Math.max(0, +custom.kcal || 0) * n, c = Math.max(0, +custom.c || 0) * n;
    return { title: `${n} × ${String(custom.name || 'Drink').slice(0, 40)}`, kcal: r(kcal), p: 0, f: 0, c: r(c), alc: r(Math.max(0, kcal - 4 * c)), drink: true };
  }
  const d = DRINKS[key];
  if (!d || !(n > 0)) return null;
  const x = WINES.has(key) ? POURS[pour] || 1 : 1;
  const kcal = d.kcal * x * n, c = d.c * x * n;
  return { title: `${d.icon} ${n} × ${d.label}${WINES.has(key) && pour !== 5 ? ` (${pour} oz)` : ''}`, kcal: r(kcal), p: 0, f: 0, c: r(c), alc: r(Math.max(0, kcal - 4 * c)), drink: true };
}

// 🔎 What fits: meals that fit what's left of today, ranked on this phone — your planned meals
// still to come, saved combos and packaged meals, and meals you've logged recently.
export function whatFits(data, today, { remaining, limit = 3, plan = null } = {}) {
  const left = remaining || dayEntry(data, today).left;
  const kcal = Math.max(left.kcal, 0), p = Math.max(left.p, 0);
  // Calories used up but protein still to go: light, protein-first options instead.
  const proteinFirst = kcal < 250 && p >= 20;
  if (kcal < 80 && !proteinFirst) return [];
  const pl = plan || planOf(data, today), log = logOf(data, today);
  const seen = new Set(), out = [];
  const add = (name, t, from, use) => {
    const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t || !(t.kcal > 0) || seen.has(key)) return;
    seen.add(key);
    out.push({ name, kcal: r(t.kcal), p: r(t.p || 0), c: r(t.c || 0), f: r(t.f || 0), from, use });
  };
  for (const m of MAIN_MEALS) if (!log.meals?.[m] && pl[m]) add(pl[m].title, pl[m].totals, `your planned ${MEAL_NAMES[m].toLowerCase()}`, { kind: 'planned', meal: m });
  for (const c of data.combos || []) {
    const t = { kcal: 0, p: 0, c: 0, f: 0 };
    for (const it of c.items || []) { const f = FOODS[it.food]; if (!f) continue; for (const k in t) t[k] += (f[k] * it.grams) / 100; }
    if (c.manual) for (const k of ['kcal', 'p', 'f', 'c']) if (c.manual[k] !== '' && c.manual[k] != null) t[k] = +c.manual[k];
    add(c.name, t, 'a combo you saved', { kind: 'combo', id: c.id });
  }
  for (const pm of data.preparedMeals || []) add(pm.name, { kcal: +pm.kcal > 0 ? +pm.kcal : (+pm.p || 0) * 4 + (+pm.c || 0) * 4 + (+pm.f || 0) * 9, p: +pm.p, c: +pm.c, f: +pm.f }, 'a packaged meal you saved', { kind: 'prepared', name: pm.name });
  const days = Object.keys(data.mealLog || {}).filter((d) => d < today).sort().slice(-14).reverse();
  for (const d of days) for (const e of Object.values(data.mealLog[d].meals || {})) if (e?.title) add(e.title.replace(/^[^\w(]+/u, '').trim() || e.title, e, 'you had this recently', { kind: 'recent', entry: { title: e.title, kcal: e.kcal, p: e.p, c: e.c, f: e.f } });
  if (proteinFirst) {
    // Everyday protein-dense foods, one usual serving each.
    for (const k of ['greekYogurt', 'premierShake', 'corePower', 'eggWhites', 'turkeyDeli', 'tuna', 'chicken']) {
      const f = FOODS[k]; if (!f) continue;
      const g = k === 'turkeyDeli' ? 84 : k === 'eggWhites' ? 160 : k === 'chicken' ? 120 : f.unit?.grams || 100;
      const x = g / 100;
      add(f.name.replace(/\s*\(.*?\)/g, ''), { kcal: f.kcal * x, p: f.p * x, c: f.c * x, f: f.f * x }, 'quick protein', { kind: 'recent', entry: { title: f.name, kcal: r(f.kcal * x), p: r(f.p * x), c: r(f.c * x), f: r(f.f * x) } });
    }
    return out.filter((o) => o.kcal <= 400 && o.p / o.kcal >= 0.07).sort((a, b) => b.p / b.kcal - a.p / a.kcal || a.kcal - b.kcal).slice(0, limit);
  }
  // Closest to "a sensible next meal": at most what's left, protein close to what's left.
  const aim = Math.min(kcal, Math.max(350, kcal * 0.85));
  const score = (o) => Math.abs(o.kcal - aim) / Math.max(aim, 1) + (o.kcal > kcal ? 1 + (o.kcal - kcal) / kcal : 0) + (p ? Math.abs(Math.min(o.p, p) - p) / p * 0.8 : 0);
  return out.filter((o) => o.kcal <= kcal * 1.15).sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, limit);
}

// ---------- changes (to a store: {get(key, fallback), set(key, value)}) ----------
// A new day: yesterday's log goes into the history; today's meal edits start from anything
// planned ahead for today (what the trackers do when they open on a new day).
export function rollDay(s, today) {
  const eaten = s.get('eaten', {}) || {};
  if (eaten.date !== today) {
    if (eaten.date) { const { date, ...log } = eaten; s.set('mealLog', { ...(s.get('mealLog', {}) || {}), [date]: log }); }
    s.set('eaten', { date: today, meals: {}, fuel: null, extras: [] });
  }
  const custom = s.get('custom', {}) || {};
  if (custom.date !== today) {
    const planned = { ...(s.get('planned', {}) || {}) };
    const meals = planned[today] || {};
    delete planned[today];
    for (const d of Object.keys(planned)) if (d < today) delete planned[d];
    s.set('planned', planned);
    s.set('custom', { date: today, meals });
  }
}
const dataOf = (s) => new Proxy({}, { get: (_, k) => s.get(k, undefined) });
// Keep today's summary in step after a change.
export function record(s, today) { s.set('days', { ...(s.get('days', {}) || {}), [today]: dayEntry(dataOf(s), today) }); }
function editLog(s, today, fn) { rollDay(s, today); const log = s.get('eaten'); fn(log); s.set('eaten', log); record(s, today); return log; }
// ✓ As planned.
export function logPlanned(s, today, meal, at = atNow()) {
  rollDay(s, today);
  const m = planOf(dataOf(s), today)[meal];
  if (!m) return null;
  return editLog(s, today, (log) => { log.meals[meal] = snapshotOf(m, at); }).meals[meal];
}
// A meal that wasn't the plan (photo, Tell me, quick macros, packaged, ate out, same as
// yesterday): it becomes today's version of that meal — so the trackers show it and the meals
// still to come re-fit around it — and it's logged.
export function logAs(s, today, meal, c, at = atNow()) {
  rollDay(s, today);
  const custom = s.get('custom');
  custom.meals = { ...custom.meals, [meal]: c };
  s.set('custom', custom);
  return logPlanned(s, today, meal, at);
}
export function unlog(s, today, meal) { return editLog(s, today, (log) => { delete log.meals[meal]; }); }
export function addExtras(s, today, items) { return editLog(s, today, (log) => { log.extras = [...(log.extras || []), ...items.filter(Boolean)]; }); }
export function removeExtra(s, today, i) { return editLog(s, today, (log) => { log.extras = (log.extras || []).filter((_, j) => j !== i); }); }
// "Done logging today" (or not): tells the weekly review this day is complete.
export function setDone(s, today, done = true) { return editLog(s, today, (log) => { if (done) log.done = true; else delete log.done; }); }
// One food's grams in a planned meal (locks that amount, like the trackers' grams box). A meal
// you already logged is corrected to match.
export function setGrams(s, today, meal, slot, grams) {
  rollDay(s, today);
  const custom = s.get('custom'), daily = (s.get('dailyMeals', {}) || {})[meal];
  const meals = custom.meals;
  const c0 = meals[meal] || {};
  if (daily && !c0.items && !c0.prepared && !c0.eatout) meals[meal] = { ...clone(daily), ...c0 };
  const c = (meals[meal] ||= {});
  const g = Math.max(0, +grams || 0);
  if (c.items && /^i\d+$/.test(slot)) c.items[+slot.slice(1)] && (c.items[+slot.slice(1)].grams = g);
  else {
    if (meal === 'breakfast') c.template = planOf(dataOf(s), today).breakfast.template;
    c.grams = { ...c.grams, [slot]: g };
  }
  s.set('custom', custom);
  const log = s.get('eaten');
  if (log.meals?.[meal]) { log.meals[meal] = { ...snapshotOf(planOf(dataOf(s), today)[meal]), at: log.meals[meal].at }; s.set('eaten', log); }
  record(s, today);
}
