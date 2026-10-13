import { FOODS, BREAKFASTS, PROTEINS, mainMeal } from './foods.js';

export const LB_PER_KG = 2.20462;
const KCAL_PER_LB_FAT = 3500;

export const ACTIVITY = {
  sedentary: { label: 'Sedentary (desk job, little exercise)', factor: 1.2 },
  light:     { label: 'Light (1–3 workouts/week)', factor: 1.375 },
  moderate:  { label: 'Moderate (3–5 workouts/week)', factor: 1.55 },
  very:      { label: 'Very active (6–7 workouts/week)', factor: 1.725 },
};

// Weekly loss as a % of body weight. ~0.5–1%/week is the usual sustainable range.
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

  // Protein ~1 g per lb of goal weight keeps muscle while cutting.
  const goal = Math.min(profile.goalLb || weightLb, weightLb);
  const p = Math.round(Math.max(goal, weightLb * 0.7));
  const f = Math.round(Math.max(kcal * 0.27 / 9, goal * 0.3));
  const c = Math.max(Math.round((kcal - p * 4 - f * 9) / 4), 50);

  return { kcal, p, f, c, tdee: Math.round(tdee), lbPerWeek: +lbPerWeek.toFixed(2) };
}

export function mealTargets(day) {
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
// Each flexible food "drives" one macro; we iterate because they overlap
// (bread has protein, eggs have fat, ...), then round to practical amounts.
export function portionMeal(template, target) {
  const grams = template.items.map((it) => {
    if (it.fixed) return it.fixed;
    if (it.fixedByFat) return target.f >= 20 ? it.max : it.min;
    return it.min;
  });

  const solve = () => {
    for (let iter = 0; iter < 60; iter++) {
      template.items.forEach((it, i) => {
        if (!it.drives) return;
        const others = sum(template.items.map((o, j) => ({ food: o.food, grams: j === i ? 0 : grams[j] })));
        const per = FOODS[it.food][it.drives] / 100;
        grams[i] = clamp((target[it.drives] - others[it.drives]) / per, it.min, it.max);
      });
    }
  };
  solve();

  // Fatty proteins (salmon) can overshoot fat with oil already at 0:
  // trim the carb food so calories still match the target.
  const carbIdx = template.items.findIndex((it) => it.drives === 'c');
  const over = sum(template.items.map((it, i) => ({ food: it.food, grams: grams[i] }))).kcal - target.kcal;
  if (carbIdx >= 0 && over > 40) {
    const it = template.items[carbIdx];
    grams[carbIdx] = clamp(grams[carbIdx] - over / (FOODS[it.food].kcal / 100), it.min, it.max);
  }

  const portions = template.items.map((it, i) => ({
    food: it.food,
    grams: it.step ? roundTo(grams[i], it.step) : grams[i],
  })).filter((p) => p.grams > 0);

  const totals = sum(portions);
  for (const k in totals) totals[k] = Math.round(totals[k]);
  return { title: template.title, portions, totals };
}

// Deterministic rotation so each day looks different, with a user offset for "swap".
export function dayIndex(date) {
  const d = new Date(date);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function planForDay(dayTargets, date, swaps = {}) {
  const meals = mealTargets(dayTargets);
  const n = dayIndex(date);
  const bKeys = Object.keys(BREAKFASTS);
  const breakfastKey = bKeys[(n + (swaps.breakfast || 0)) % bKeys.length];
  const lunchProtein = PROTEINS[(n + (swaps.lunch || 0)) % PROTEINS.length];
  const dinnerProtein = PROTEINS[(n + 2 + (swaps.dinner || 0)) % PROTEINS.length];
  return {
    breakfast: { target: meals.breakfast, ...portionMeal(BREAKFASTS[breakfastKey], meals.breakfast) },
    lunch: { target: meals.lunch, ...portionMeal(mainMeal(lunchProtein), meals.lunch) },
    dinner: { target: meals.dinner, ...portionMeal(mainMeal(dinnerProtein), meals.dinner) },
  };
}

export function groceryList(dayTargets, startDate, days = 7) {
  const totals = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const plan = planForDay(dayTargets, d);
    for (const meal of Object.values(plan)) {
      for (const { food, grams } of meal.portions) totals[food] = (totals[food] || 0) + grams;
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
