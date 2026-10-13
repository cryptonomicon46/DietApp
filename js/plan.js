import { FOODS, BREAKFASTS, PROTEINS, MAIN_MEAL } from './foods.js';

export const LB_PER_KG = 2.20462;
const KCAL_PER_LB_FAT = 3500;

// `tracked` covers everyday life only; workouts are added per day from
// Whoop / Garmin / manual logs (see activity.js), so they aren't double counted.
export const ACTIVITY = {
  tracked:   { label: 'Count my workouts (Whoop / Garmin / log) — recommended', factor: 1.3, tracked: true },
  sedentary: { label: 'Sedentary (desk job, little exercise)', factor: 1.2 },
  light:     { label: 'Light (1–3 workouts/week)', factor: 1.375 },
  moderate:  { label: 'Moderate (3–5 workouts/week)', factor: 1.55 },
  very:      { label: 'Very active (6–7 workouts/week)', factor: 1.725 },
};

// Weekly loss as a % of body weight. 0.5–1%/week preserves lean mass
// (Helms et al. 2014; Garthe et al. 2011 found 0.7%/wk beat 1.4%/wk).
export const PACE = {
  gentle: { label: 'Gentle (0.5% / week)', pct: 0.005 },
  steady: { label: 'Steady (0.75% / week)', pct: 0.0075 },
  faster: { label: 'Faster (1% / week)', pct: 0.01 },
};

export const MEAL_SPLIT = {
  breakfast: { kcal: 0.25, p: 0.25 },
  lunch:     { kcal: 0.35, p: 0.35 },
  dinner:    { kcal: 0.40, p: 0.40 },
};

export function bmr({ sex, age, heightIn, weightLb }) {
  const kg = weightLb / LB_PER_KG;
  const cm = heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function dailyTargets(profile, weightLb, adjust = 0) {
  const base = bmr({ ...profile, weightLb });
  const tdee = base * ACTIVITY[profile.activity].factor;

  const lbPerWeek = Math.min(weightLb * PACE[profile.pace].pct, 2);
  // Never cut more than 25% below maintenance.
  const deficit = Math.min((lbPerWeek * KCAL_PER_LB_FAT) / 7, tdee * 0.25);
  const floor = profile.sex === 'male' ? 1500 : 1200;
  const kcal = Math.round(Math.max(tdee - deficit + adjust, floor) / 10) * 10;

  // Protein ~1 g/lb goal weight (≈2.2 g/kg): the top of Morton et al. 2018's
  // range and within Helms et al. 2014's 2.3–3.1 g/kg lean mass for a cut.
  // Fat 27% of calories (Helms: 15–30%); carbs fill the rest.
  const goal = Math.min(profile.goalLb || weightLb, weightLb);
  const p = Math.round(Math.max(goal, weightLb * 0.7));
  const f = Math.round(Math.max(kcal * 0.27 / 9, goal * 0.3));
  const c = Math.max(Math.round((kcal - p * 4 - f * 9) / 4), 50);

  return { kcal, p, f, c, bmr: Math.round(base), tdee: Math.round(tdee), lbPerWeek: +lbPerWeek.toFixed(2) };
}

export function mealTargets(day) {
  // Intra-workout carbs come out of the meals' share.
  if (day.intraC) day = { ...day, kcal: day.kcal - day.intraC * 4, c: day.c - day.intraC };
  const out = {};
  for (const [meal, split] of Object.entries(MEAL_SPLIT)) {
    const kcal = day.kcal * split.kcal;
    const p = day.p * split.p;
    const f = day.f * split.kcal;
    const c = Math.max((kcal - p * 4 - f * 9) / 4, 0);
    out[meal] = { kcal: Math.round(kcal), p: Math.round(p), f: Math.round(f), c: Math.round(c) };
  }
  return out;
}

export function macrosOf(food, grams) {
  const d = FOODS[food];
  const k = grams / 100;
  return { kcal: d.kcal * k, p: d.p * k, f: d.f * k, c: d.c * k };
}

function sum(portions) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const { food, grams } of portions) {
    const m = macrosOf(food, grams);
    for (const key in t) t[key] += m[key];
  }
  return t;
}

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const roundTo = (x, step) => Math.round(x / step) * step;

// Size each flexible food so the meal lands on its macro target.
// Each slot "drives" one macro; we iterate because they overlap (bread has
// protein, eggs have fat, ...), then round to practical amounts.
//   custom.picks = {slot: foodKey}  swaps a food into a slot
//   custom.grams = {slot: grams}    locks that slot (set with a slider);
//                                   the other slots re-balance around it.
export function portionMeal(template, target, custom = {}) {
  const picks = custom.picks || {};
  const locks = custom.grams || {};
  const items = template.items.map((it) => {
    const food = it.options.includes(picks[it.slot]) ? picks[it.slot] : it.options[0];
    const [lo, hi, step] = FOODS[food].range;
    const locked = locks[it.slot] != null;
    return {
      ...it, food, step, lo, hi, locked,
      min: Math.max(it.min ?? lo, lo), max: Math.min(it.max ?? hi, hi),
    };
  });
  const grams = items.map((it) => {
    if (it.locked) return clamp(locks[it.slot], it.lo, it.hi);
    if (it.fixed) return it.fixed;
    if (it.fixedByFat) return target.f >= 20 ? it.max : it.min;
    return it.min;
  });
  const total = () => sum(items.map((it, i) => ({ food: it.food, grams: grams[i] })));

  for (let iter = 0; iter < 60; iter++) {
    items.forEach((it, i) => {
      if (!it.drives || it.locked) return;
      const others = sum(items.map((o, j) => ({ food: o.food, grams: j === i ? 0 : grams[j] })));
      const per = FOODS[it.food][it.drives] / 100;
      grams[i] = per > 0 ? clamp((target[it.drives] - others[it.drives]) / per, it.min, it.max) : it.min;
    });
  }

  // Keep calories on target when a fatty protein or a locked slider pushes a
  // macro off: move the unlocked carb/fat slot whose macro is furthest off.
  for (let pass = 0; pass < 2; pass++) {
    const t = total();
    const diff = t.kcal - target.kcal;
    if (Math.abs(diff) <= 40) break;
    const off = { c: (t.c - target.c) * 4, f: (t.f - target.f) * 9 };
    const order = ['c', 'f'].sort((a, b) => (diff > 0 ? off[b] - off[a] : off[a] - off[b]));
    const canMove = (i) => i >= 0 && (diff > 0 ? grams[i] > 0 : grams[i] < items[i].hi);
    const idx = order.map((m) => items.findIndex((it) => it.drives === m && !it.locked)).find(canMove);
    if (idx == null) break;
    const it = items[idx];
    grams[idx] = clamp(grams[idx] - diff / (FOODS[it.food].kcal / 100), 0, it.hi);
  }

  const portions = items.map((it, i) => ({
    slot: it.slot,
    food: it.food,
    options: it.options,
    range: [it.lo, it.hi, it.step],
    locked: it.locked,
    grams: +(roundTo(grams[i], it.step)).toFixed(1),
  }));

  const totals = sum(portions);
  for (const k in totals) totals[k] = Math.round(totals[k]);
  const named = Object.fromEntries(portions.map((p) => [p.slot, p.food]));
  return { title: template.title(named), portions, totals };
}

// Deterministic rotation so each day looks different.
export function dayIndex(date) {
  const d = new Date(date);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// custom = {breakfast: {template, picks, grams}, lunch: {...}, dinner: {...}} for today.
// prefs  = sticky swaps, e.g. {oatmeal: {fat: 'almondButter'}, main: {carb: 'sweetPotato'}}.
export function planForDay(dayTargets, date, custom = {}, prefs = {}) {
  const meals = mealTargets(dayTargets);
  const n = dayIndex(date);
  const bKeys = Object.keys(BREAKFASTS);
  const bKey = BREAKFASTS[custom.breakfast?.template] ? custom.breakfast.template : bKeys[n % bKeys.length];
  const merge = (prefKey, c = {}, extra = {}) => ({ picks: { ...extra, ...prefs[prefKey], ...c.picks }, grams: c.grams });
  const rotate = (offset) => ({ protein: PROTEINS[(n + offset) % PROTEINS.length] });
  return {
    breakfast: { template: bKey, target: meals.breakfast, ...portionMeal(BREAKFASTS[bKey], meals.breakfast, merge(bKey, custom.breakfast)) },
    lunch: { target: meals.lunch, ...portionMeal(MAIN_MEAL, meals.lunch, merge('main', custom.lunch, rotate(0))) },
    dinner: { target: meals.dinner, ...portionMeal(MAIN_MEAL, meals.dinner, merge('main', custom.dinner, rotate(2))) },
  };
}

export function groceryList(dayTargets, startDate, days = 7, prefs = {}) {
  const totals = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const plan = planForDay(dayTargets, d, {}, prefs);
    for (const meal of Object.values(plan)) {
      // Portions are cooked weights; shop by raw weight.
      for (const { food, grams } of meal.portions) {
        if (grams > 0) totals[food] = (totals[food] || 0) + grams / (FOODS[food].yield || 1);
      }
    }
  }
  return totals;
}

// Weekly rate of change (lb/week) from a least-squares line over recent check-ins.
export function weeklyTrend(entries, windowDays = 21) {
  if (entries.length < 2) return null;
  const last = new Date(entries[entries.length - 1].date).getTime();
  const pts = entries
    .map((e) => ({ x: (new Date(e.date).getTime() - last) / 86400000, y: e.weight }))
    .filter((p) => p.x >= -windowDays);
  if (pts.length < 2) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return { lbPerWeek: slope * 7, spanDays: span };
}

// After 2+ weeks of data, nudge calories by 100 if progress is off pace.
export function suggestAdjustment(entries, targetLbPerWeek) {
  const trend = weeklyTrend(entries);
  if (!trend || trend.spanDays < 14) return null;
  const lost = -trend.lbPerWeek;
  if (lost < targetLbPerWeek * 0.5) return { delta: -100, lost, reason: 'slower than planned' };
  if (lost > targetLbPerWeek * 1.5) return { delta: 100, lost, reason: 'faster than planned — protect muscle & energy' };
  return { delta: 0, lost, reason: 'on track' };
}

// Rough "how well does this fit a cut" signal, from per-100 g values.
export function fitScore({ kcal, p }) {
  if (!kcal) return { label: 'Unknown', tone: 'muted' };
  const ppc = (p * 4) / kcal; // share of calories from protein
  if (ppc >= 0.35) return { label: 'Great fit — high protein', tone: 'good' };
  if (ppc >= 0.2) return { label: 'Good fit', tone: 'good' };
  if (kcal > 450 && ppc < 0.1) return { label: 'Calorie-dense — portion carefully', tone: 'warn' };
  return { label: 'Fits in moderation', tone: 'ok' };
}

// ---------- weekly check-in ----------
export const FEELINGS = {
  great:  'Great',
  okay:   'Okay',
  hungry: 'Often hungry',
  tired:  'Low energy',
  hard:   'Hard to stick to',
};

// Macro changes offered at each check-in (grams per day).
export const CHECKIN_OPTIONS = [
  { id: 'keep',        label: 'Keep my macros',               detail: 'No change',                 delta: { p: 0, f: 0, c: 0 } },
  { id: 'minus100',    label: '−100 kcal',                    detail: '−25 g carbs',               delta: { p: 0, f: 0, c: -25 } },
  { id: 'minus200',    label: '−200 kcal',                    detail: '−30 g carbs, −9 g fat',     delta: { p: 0, f: -9, c: -30 } },
  { id: 'plus100',     label: '+100 kcal',                    detail: '+25 g carbs',               delta: { p: 0, f: 0, c: 25 } },
  { id: 'plus200',     label: '+200 kcal',                    detail: '+30 g carbs, +9 g fat',     delta: { p: 0, f: 9, c: 30 } },
  { id: 'moreProtein', label: 'More protein, same calories',  detail: '+20 g protein, −20 g carbs', delta: { p: 20, f: 0, c: -20 } },
  { id: 'moreCarbs',   label: 'More carbs, less fat',         detail: '+20 g carbs, −9 g fat',     delta: { p: 0, f: -9, c: 20 } },
];

export const deltaKcal = (d) => (d.p || 0) * 4 + (d.f || 0) * 9 + (d.c || 0) * 4;

// Pick the suggested option from the weight trend and how the week felt.
export function recommendCheckin(trend, feeling) {
  const struggling = feeling === 'hungry' || feeling === 'tired' || feeling === 'hard';
  if (!trend) {
    if (feeling === 'hungry') return { id: 'moreProtein', why: 'Protein is the most filling macro — same calories, fewer cravings.' };
    if (feeling === 'tired') return { id: 'moreCarbs', why: 'Shifting fat to carbs usually helps training energy at the same calories.' };
    return { id: 'keep', why: 'Not enough weigh-ins yet to judge your trend — keep going and log a few more.' };
  }
  const lost = trend.lost.toFixed(1);
  if (trend.delta < 0) {
    if (trend.lost < 0 && !struggling) return { id: 'minus200', why: `You're up ${Math.abs(lost)} lb/week, so a bigger cut makes sense.` };
    return { id: 'minus100', why: `You're losing ${lost} lb/week, slower than planned. A small cut gets you back on pace${struggling ? ' — taken from carbs so protein keeps you full' : ''}.` };
  }
  if (trend.delta > 0) {
    if (struggling) return { id: 'plus200', why: `You're losing ${lost} lb/week — faster than needed, and it's showing. More food will help you keep muscle and energy.` };
    return { id: 'plus100', why: `You're losing ${lost} lb/week, faster than planned. A little more food protects muscle.` };
  }
  if (feeling === 'hungry') return { id: 'moreProtein', why: `Right on pace (${lost} lb/week). Swapping carbs for protein should help with hunger.` };
  if (feeling === 'tired') return { id: 'moreCarbs', why: `Right on pace (${lost} lb/week). Moving some fat to carbs should help energy.` };
  return { id: 'keep', why: `Right on pace at ${lost} lb/week — no change needed.` };
}

// Average weight of the last 7 days vs the 7 days before.
export function weekOverWeek(entries, today = new Date()) {
  const avg = (from, to) => {
    const xs = entries.filter((e) => {
      const age = (today - new Date(e.date + 'T12:00')) / 86400000;
      return age >= from && age < to;
    }).map((e) => e.weight);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const now = avg(-1, 7), before = avg(7, 14);
  return now != null && before != null ? { now, before, change: now - before } : null;
}
