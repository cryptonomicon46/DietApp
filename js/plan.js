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

// Phases after (or between) cuts. A diet break or maintenance eats at maintenance;
// a lean gain eats a small surplus for ~0.25%/week gain (Iraki et al. 2019).
export const PHASES = {
  cut:      { label: 'Cut', weeks: 8 },
  break:    { label: 'Diet break', weeks: 2 },
  maintain: { label: 'Maintenance', weeks: 4 },
  gain:     { label: 'Lean gain', weeks: 12, pct: 0.0025 },
};

export function dailyTargets(profile, weightLb, adjust = 0) {
  const base = bmr({ ...profile, weightLb });
  const tdee = base * ACTIVITY[profile.activity].factor;
  const phase = PHASES[profile.phase] ? profile.phase : 'cut';

  // Cut: lose at the chosen pace until the goal; at or below goal, eat at maintenance.
  const toGo = Math.max(weightLb - (profile.goalLb || 0), 0);
  const lbPerWeek = phase === 'cut' && toGo > 0 ? Math.min(weightLb * PACE[profile.pace].pct, 2) : 0;
  // Never cut more than 25% below maintenance.
  let deficit = Math.min((lbPerWeek * KCAL_PER_LB_FAT) / 7, tdee * 0.25);
  // Lean gain: a surplus of at most 15% above maintenance.
  if (phase === 'gain') deficit = -Math.min((weightLb * PHASES.gain.pct * KCAL_PER_LB_FAT) / 7, tdee * 0.15);
  const floor = profile.sex === 'male' ? 1500 : 1200;
  const kcal = Math.round(Math.max(tdee - deficit + adjust, floor) / 10) * 10;

  // Protein ~1 g/lb goal weight (≈2.2 g/kg): the top of Morton et al. 2018's
  // range and within Helms et al. 2014's 2.3–3.1 g/kg lean mass for a cut.
  // Fat 27% of calories (Helms: 15–30%); carbs fill the rest.
  const goal = Math.min(profile.goalLb || weightLb, weightLb);
  const p = Math.round(Math.max(goal, weightLb * 0.7));
  const f = Math.round(Math.max(kcal * 0.27 / 9, goal * 0.3));
  const c = Math.max(Math.round((kcal - p * 4 - f * 9) / 4), 50);

  // Report the rate the deficit actually supports (the 25% cap can slow it).
  // Positive = losing, negative = gaining.
  const actualRate = (deficit * 7) / KCAL_PER_LB_FAT;
  return { kcal, p, f, c, bmr: Math.round(base), tdee: Math.round(tdee), lbPerWeek: +actualRate.toFixed(2), phase };
}

// Weeks and date to reach the goal at the planned pace (the pace eases slightly as weight drops).
// Pass `rate` (lb/week from dailyTargets) when known; otherwise the pace setting is used.
export function goalProjection(profile, weightLb, from = new Date(), rate = null) {
  const goal = profile.goalLb;
  if (profile.phase === 'gain') {
    if (!goal || weightLb >= goal || !(rate < 0)) return { reached: true, weeks: 0, date: from };
    const weeks = (goal - weightLb) / -rate;
    const date = new Date(from); date.setDate(date.getDate() + Math.round(weeks * 7));
    return { reached: false, weeks: Math.max(1, Math.round(weeks)), date };
  }
  if (!goal || weightLb <= goal) return { reached: true, weeks: 0, date: from };
  if (rate > 0) {
    const weeks = (weightLb - goal) / rate;
    const date = new Date(from); date.setDate(date.getDate() + Math.round(weeks * 7));
    return { reached: false, weeks: Math.max(1, Math.round(weeks)), date };
  }
  let w = weightLb, weeks = 0;
  while (w > goal && weeks < 520) {
    const step = Math.min(w * PACE[profile.pace].pct, 2);
    if (w - step <= goal) { weeks += (w - goal) / step; break; }
    w -= step; weeks++;
  }
  const date = new Date(from); date.setDate(date.getDate() + Math.round(weeks * 7));
  return { reached: false, weeks: Math.max(1, Math.round(weeks)), date };
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
    // Fixed sides (fruit, veggies) shrink for small meals so the rest still fits.
    if (it.fixed) return target.kcal < 350 ? roundTo(it.fixed * 0.6, it.step) : it.fixed;
    // 3 eggs for bigger breakfasts, 2 for most, 1 when the fat budget is small.
    if (it.fixedByFat) return target.f >= 20 ? it.max : target.f >= 13 ? 100 : it.min;
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
    // Amounts you set yourself stay exact; auto-sized ones snap to the slider's step.
    grams: +(it.locked ? grams[i] : roundTo(grams[i], it.step)).toFixed(1),
  }));

  const totals = sum(portions);
  for (const k in totals) totals[k] = Math.round(totals[k]);
  const named = Object.fromEntries(portions.map((p) => [p.slot, p.food]));
  return { title: template.title(named), portions, totals };
}

// A meal you built yourself: your foods and grams, no auto-sizing. `manual` (any of
// kcal/p/f/c) overrides the computed totals, e.g. numbers copied from a label or app.
export function customMeal(c, target) {
  const portions = (c.items || []).filter((x) => FOODS[x.food]).map((x, i) => ({
    slot: `i${i}`, food: x.food, grams: +x.grams || 0, options: [], range: FOODS[x.food].range, locked: false, custom: true,
  }));
  const totals = sum(portions);
  for (const k in totals) totals[k] = Math.round(totals[k]);
  const manual = c.manual && Object.values(c.manual).some((v) => v !== '' && v != null);
  if (manual) for (const k of ['kcal', 'p', 'f', 'c']) if (c.manual[k] !== '' && c.manual[k] != null) totals[k] = Math.round(+c.manual[k]);
  const names = portions.filter((x) => x.grams > 0).map((x) => FOODS[x.food].name.replace(/ \(.*\)/, '').toLowerCase());
  const title = c.title || (names.length ? names.slice(0, 3).join(', ').replace(/^./, (ch) => ch.toUpperCase()) + (names.length > 3 ? '…' : '') : 'Your meal');
  return { title, portions, totals, custom: true, manual: !!manual };
}

// Scale a list of {food, grams} so its calories land on `kcal`, rounding each to its slider
// step and keeping it inside the slider's range.
export function fitItems(items, kcal) {
  const total = items.reduce((a, x) => a + (FOODS[x.food]?.kcal || 0) * x.grams / 100, 0);
  if (!total || !kcal) return items.map((x) => ({ ...x }));
  const k = kcal / total;
  return items.map((x) => {
    const f = FOODS[x.food];
    if (!f) return { ...x };
    const [lo, hi, step] = f.range || [0, 2000, 1];
    const g = Math.round((x.grams * k) / step) * step;
    return { ...x, grams: Math.min(Math.max(g, x.grams > 0 ? Math.max(lo, step) : 0), Math.max(hi, x.grams)) };
  });
}

// Eating out: typical restaurant portions (regular size). Restaurant meals run large —
// non-chain meals average ~1,200 kcal (Urban 2016) — so these lean generous on oil/butter.
export const EAT_OUT = {
  grilled:   { label: 'Grilled protein & veggies',          kcal: 650,  p: 50, f: 35, c: 30 },
  plate:     { label: 'Protein, rice/potato & veggies',      kcal: 900,  p: 50, f: 35, c: 90 },
  steak:     { label: 'Steak dinner with a side',            kcal: 1200, p: 70, f: 70, c: 60 },
  salad:     { label: 'Entrée salad with protein & dressing', kcal: 700, p: 40, f: 45, c: 30 },
  bowl:      { label: 'Burrito or rice bowl',                kcal: 1000, p: 45, f: 35, c: 120 },
  asian:     { label: 'Stir-fry or curry with rice',         kcal: 1000, p: 40, f: 40, c: 115 },
  sushi:     { label: 'Sushi (about 3 rolls)',               kcal: 900,  p: 35, f: 20, c: 140 },
  sandwich:  { label: 'Sandwich or wrap & a side',           kcal: 900,  p: 40, f: 40, c: 90 },
  burger:    { label: 'Burger & fries',                      kcal: 1300, p: 45, f: 65, c: 130 },
  pizza:     { label: 'Pizza (3 slices)',                    kcal: 900,  p: 40, f: 35, c: 105 },
  pasta:     { label: 'Pasta dish',                          kcal: 1100, p: 40, f: 45, c: 130 },
  brunch:    { label: 'Brunch plate (eggs, toast, potatoes)', kcal: 900, p: 35, f: 50, c: 75 },
};
// Drinks with the meal, per standard serving. Alcohol (7 kcal/g) counts in calories but isn't
// protein, fat or carbs, so only the sugar (mixers, residual sugar) is listed as carbs.
export const DRINKS = {
  redWine:     { label: 'Red wine', icon: '🍷', serving: '5 oz glass', kcal: 125, c: 4 },
  whiteWine:   { label: 'White wine', icon: '🥂', serving: '5 oz glass', kcal: 120, c: 4 },
  rose:        { label: 'Rosé', icon: '🍷', serving: '5 oz glass', kcal: 125, c: 4 },
  bubbly:      { label: 'Prosecco / Champagne', icon: '🥂', serving: '5 oz glass', kcal: 120, c: 2 },
  beer:        { label: 'Beer', icon: '🍺', serving: '12 oz', kcal: 155, c: 13 },
  lightBeer:   { label: 'Light beer', icon: '🍺', serving: '12 oz', kcal: 105, c: 6 },
  margarita:   { label: 'Margarita', icon: '🍸', serving: 'restaurant pour', kcal: 275, c: 27 },
  oldFashioned:{ label: 'Old fashioned', icon: '🥃', serving: 'cocktail', kcal: 175, c: 6 },
  martini:     { label: 'Martini', icon: '🍸', serving: 'cocktail', kcal: 175, c: 1 },
  espressoMartini: { label: 'Espresso martini', icon: '🍸', serving: 'cocktail', kcal: 230, c: 15 },
  mojito:      { label: 'Mojito', icon: '🍹', serving: 'cocktail', kcal: 215, c: 25 },
  ginTonic:    { label: 'Gin & tonic', icon: '🍸', serving: 'cocktail', kcal: 170, c: 14 },
  vodkaSoda:   { label: 'Vodka soda', icon: '🍸', serving: 'cocktail', kcal: 100, c: 0 },
  moscowMule:  { label: 'Moscow mule', icon: '🍹', serving: 'cocktail', kcal: 180, c: 18 },
  spritz:      { label: 'Aperol spritz', icon: '🍹', serving: 'cocktail', kcal: 160, c: 15 },
  whiskey:     { label: 'Whiskey / spirit, neat', icon: '🥃', serving: '1.5 oz', kcal: 100, c: 0 },
};
export function drinksTotals(drinks = {}) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, count: 0 };
  for (const [k, n] of Object.entries(drinks)) {
    const d = DRINKS[k];
    if (!d || !(n > 0)) continue;
    t.kcal += d.kcal * n; t.c += d.c * n; t.count += n;
  }
  return t;
}

export const EAT_OUT_SIZE = { light: { label: 'Light', x: 0.75 }, regular: { label: 'Regular', x: 1 }, large: { label: 'Large', x: 1.3 } };
export const EAT_OUT_ATE = { 1: 'All of it', 0.75: 'Most', 0.5: 'Half' };

// c.eatout = {place, mode: 'estimate'|'menu', dish, size, ate, menu: {kcal, p, f, c}}
export function eatOutMeal(c, target) {
  const e = c.eatout || {};
  let totals;
  if (e.mode === 'menu') {
    const m = e.menu || {};
    const kcal = +m.kcal || 0;
    // Only calories known: assume a typical restaurant split (25% protein, 40% fat, 35% carbs).
    totals = {
      kcal,
      p: m.p !== '' && m.p != null ? +m.p : kcal * 0.25 / 4,
      f: m.f !== '' && m.f != null ? +m.f : kcal * 0.40 / 9,
      c: m.c !== '' && m.c != null ? +m.c : kcal * 0.35 / 4,
    };
  } else {
    const d = EAT_OUT[e.dish] || EAT_OUT.plate;
    const x = (EAT_OUT_SIZE[e.size] || EAT_OUT_SIZE.regular).x * (+e.ate || 1);
    totals = { kcal: d.kcal * x, p: d.p * x, f: d.f * x, c: d.c * x };
  }
  // Wine, beer and cocktails with the meal.
  const dr = drinksTotals(e.drinks);
  totals.kcal += dr.kcal; totals.c += dr.c;
  for (const k in totals) totals[k] = Math.round(totals[k]);
  const what = e.mode === 'menu' ? (e.dishName || 'from the menu') : (EAT_OUT[e.dish] || EAT_OUT.plate).label.toLowerCase();
  const drinksNote = dr.count ? ` + ${dr.count % 1 ? dr.count : dr.count} drink${dr.count === 1 ? '' : 's'}` : '';
  return { title: `Ate out${e.place ? ` at ${e.place}` : ''}: ${what}${drinksNote}`, portions: [], totals, custom: true, eatout: true, drinks: dr };
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
  const build = (name, auto) => (custom[name]?.eatout ? eatOutMeal(custom[name], meals[name])
    : custom[name]?.items ? customMeal(custom[name], meals[name]) : auto());
  // Optional afternoon snack: its calories come out of lunch and dinner, from whichever has
  // more carbs (rice, potato) to give — meals you built or ate out keep their size.
  let snack = null;
  if (custom.snack?.on) {
    const sm = customMeal(custom.snack, null);
    snack = { ...sm, title: custom.snack.items?.length ? sm.title : 'Afternoon snack', target: sm.totals, snack: true };
    const auto = { lunch: () => portionMeal(MAIN_MEAL, meals.lunch, merge('main', custom.lunch, rotate(0))), dinner: () => portionMeal(MAIN_MEAL, meals.dinner, merge('main', custom.dinner, rotate(2))) };
    const room = Object.fromEntries(['lunch', 'dinner'].map((m) => [m, custom[m]?.items || custom[m]?.eatout ? 0 : auto[m]().totals.c * 4]));
    const total = room.lunch + room.dinner;
    for (const m of ['lunch', 'dinner']) {
      const share = total ? room[m] / total : 0.5;
      const t = meals[m];
      const kcal = Math.max(t.kcal - sm.totals.kcal * share, 150);
      const p = Math.max(t.p - sm.totals.p * share, 15);
      meals[m] = { kcal: Math.round(kcal), p: Math.round(p), f: t.f, c: Math.round(Math.max((kcal - p * 4 - t.f * 9) / 4, 0)) };
    }
  }
  return {
    ...(snack ? { snack } : {}),
    breakfast: { template: bKey, target: meals.breakfast, ...build('breakfast', () => portionMeal(BREAKFASTS[bKey], meals.breakfast, merge(bKey, custom.breakfast))) },
    lunch: { target: meals.lunch, ...build('lunch', () => portionMeal(MAIN_MEAL, meals.lunch, merge('main', custom.lunch, rotate(0)))) },
    dinner: { target: meals.dinner, ...build('dinner', () => portionMeal(MAIN_MEAL, meals.dinner, merge('main', custom.dinner, rotate(2)))) },
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
// target: planned lb/week lost (negative while gaining, 0 at maintenance).
export function suggestAdjustment(entries, targetLbPerWeek) {
  const trend = weeklyTrend(entries);
  if (!trend || trend.spanDays < 14) return null;
  const lost = -trend.lbPerWeek;
  const target = targetLbPerWeek;
  const tol = Math.max(0.25, Math.abs(target) * 0.5);
  if (lost < target - tol) return { delta: -100, lost, target, reason: target > 0 ? 'slower than planned' : target < 0 ? 'gaining faster than planned' : 'drifting up' };
  if (lost > target + tol) return { delta: 100, lost, target, reason: target > 0 ? 'faster than planned — protect muscle & energy' : target < 0 ? 'not gaining yet' : 'drifting down' };
  return { delta: 0, lost, target, reason: 'on track' };
}

export const rateText = (lost) => (lost > 0.05 ? `losing ${lost.toFixed(1)} lb/week` : lost < -0.05 ? `gaining ${(-lost).toFixed(1)} lb/week` : 'holding steady');

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
export function recommendCheckin(trend, feeling, atFloor = false) {
  const struggling = feeling === 'hungry' || feeling === 'tired' || feeling === 'hard';
  // Already at the calorie floor: don't cut further — move more instead.
  if (atFloor && trend && trend.delta < 0) {
    return { id: 'keep', why: `You're ${rateText(trend.lost)}, but your calories are already at the safe minimum. Keep them here and add activity instead — a daily 30–45 min walk adds roughly 150–250 kcal.` };
  }
  if (!trend) {
    if (feeling === 'hungry') return { id: 'moreProtein', why: 'Protein is the most filling macro — same calories, fewer cravings.' };
    if (feeling === 'tired') return { id: 'moreCarbs', why: 'Shifting fat to carbs usually helps training energy at the same calories.' };
    return { id: 'keep', why: 'Not enough weigh-ins yet to judge your trend — keep going and log a few more.' };
  }
  const now = rateText(trend.lost);
  const cutting = (trend.target ?? 1) > 0;
  if (trend.delta < 0) {
    if (cutting && trend.lost < 0 && !struggling) return { id: 'minus200', why: `You're ${now} while cutting, so a bigger cut makes sense.` };
    return { id: 'minus100', why: `You're ${now}, ${trend.reason ?? 'off plan'}. A small cut gets you back on track${struggling ? ' — taken from carbs so protein keeps you full' : ''}.` };
  }
  if (trend.delta > 0) {
    if (cutting && struggling) return { id: 'plus200', why: `You're ${now} — faster than needed, and it's showing. More food will help you keep muscle and energy.` };
    return { id: 'plus100', why: `You're ${now}, ${trend.reason ?? 'off plan'}. A little more food gets you back on track.` };
  }
  if (feeling === 'hungry') return { id: 'moreProtein', why: `Right on plan (${now}). Swapping carbs for protein should help with hunger.` };
  if (feeling === 'tired') return { id: 'moreCarbs', why: `Right on plan (${now}). Moving some fat to carbs should help energy.` };
  return { id: 'keep', why: `Right on plan (${now}) — no change needed.` };
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

// ---------- weekly check-in on the diet's weekly anniversary ----------
export const KCAL_PER_LB = 3500;
const dnum = (d) => Date.parse(`${d}T12:00:00Z`) / 864e5;
const ddate = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
// Check-ins fall every 7 days from the day the diet (phase) started: start on a Monday, check in
// each Monday. → { week, due, next } for the latest one that has come round, or null in week 1.
export function checkinWindow(start, today) {
  if (!start) return null;
  const days = dnum(today) - dnum(start);
  if (days < 7) return null;
  const week = Math.floor(days / 7);
  return { week, due: ddate(dnum(start) + week * 7), next: ddate(dnum(start) + (week + 1) * 7) };
}
export function isCheckinDue(start, today, checkins = [], snoozedOn = null) {
  const w = checkinWindow(start, today);
  return !!w && snoozedOn !== today && !checkins.some((c) => c.date >= w.due && c.change !== 'phase');
}

// What the week says, and the change it calls for. Uses the energy balance the evidence supports:
// real maintenance ≈ what you ate + what you lost (3,500 kcal per lb), so the calories for your
// planned pace = that − planned loss. Changes are kept small (±50–250 kcal), never below the
// floor, and a fast loss (>1% of body weight a week) gets more food (Helms 2014). Long cuts get
// a maintenance phase / diet break of 1–2 weeks (Byrne 2018 MATADOR; Peos 2021 ICECAP).
// in: { days: [{date, eaten, target}], weights: [{date, weight}] (this phase), targetKcal, targetRate
//       (lb/wk lost; 0 maintenance), floor, weightLb, weeksIn, plannedWeeks, phase, feeling }
export function weeklyReview(o) {
  const logged = (o.days || []).filter((d) => d.eaten > 300);
  const avgIntake = logged.length ? Math.round(logged.reduce((a, d) => a + d.eaten, 0) / logged.length) : null;
  const avgTarget = logged.length ? Math.round(logged.reduce((a, d) => a + (d.target || o.targetKcal), 0) / logged.length) : o.targetKcal;
  const trend = weeklyTrend(o.weights || [], 14);
  const lost = trend && trend.spanDays >= 6 && (o.weights || []).length >= 3 ? +(-trend.lbPerWeek).toFixed(2) : null;
  const enoughFood = logged.length >= 4;
  const onPlan = enoughFood && Math.abs(avgIntake - avgTarget) <= avgTarget * 0.1;
  const tdee = enoughFood && lost != null ? Math.round(avgIntake + (lost * KCAL_PER_LB) / 7) : null;
  const cutting = (o.phase || 'cut') === 'cut';
  const struggling = ['hungry', 'tired', 'hard'].includes(o.feeling);
  const pctPerWeek = lost != null && o.weightLb ? (lost / o.weightLb) * 100 : null;
  const out = { logged: logged.length, avgIntake, avgTarget, lost, tdee, pctPerWeek, onPlan, notes: [] };
  const round50 = (x) => Math.round(x / 50) * 50;
  const clampDelta = (d) => Math.max(o.floor - o.targetKcal, Math.max(-250, Math.min(250, d)));

  // Cut length: after the planned weeks (or 12+), or worn down at 8+, take maintenance.
  const longCut = cutting && (o.weeksIn >= (o.plannedWeeks || 12) || o.weeksIn >= 12);
  if (cutting && (longCut || (o.weeksIn >= 8 && struggling))) {
    out.id = 'maintenance';
    out.delta = 0;
    out.why = longCut
      ? `Week ${o.weeksIn} of your cut. Cuts work best in blocks of about 8–12 weeks; 1–2 weeks at maintenance now eases hunger and fatigue, then you can start the next block.`
      : `Week ${o.weeksIn} and the week felt hard. A 1–2 week diet break at maintenance helps you stick with it and keeps fat loss going afterwards.`;
    return out;
  }
  if (!enoughFood) {
    out.id = 'keep'; out.delta = 0;
    out.why = `Only ${logged.length} day${logged.length === 1 ? '' : 's'} of meals logged this week — not enough to judge. Keep your targets and log most days so next week's check-in can fine-tune.`;
    return out;
  }
  if (avgIntake > avgTarget * 1.1 && cutting) {
    out.id = 'keep'; out.delta = 0;
    out.why = `You averaged ${avgIntake} kcal against a ${avgTarget} target. Hitting the current plan will do more than cutting calories further — keep it and aim for target most days.`;
    return out;
  }
  if (lost == null) {
    out.id = 'keep'; out.delta = 0;
    out.why = 'Too few weigh-ins this week to read the trend. Keep your targets and weigh in most mornings.';
    return out;
  }
  if (cutting && o.weeksIn <= 1 && lost > 0) {
    out.id = 'keep'; out.delta = 0;
    out.why = `First week: ${lost.toFixed(1)} lb/week, partly water and stored carbs. Keep the plan — week 2 shows the real trend.`;
    return out;
  }
  let delta = clampDelta(round50((tdee - (o.targetRate * KCAL_PER_LB) / 7) - o.targetKcal));
  if (cutting && pctPerWeek > 1) delta = Math.max(delta, 100); // losing too fast: protect muscle
  if (cutting && struggling && delta < 0) delta = Math.max(delta, -100);
  out.delta = Math.abs(delta) < 50 ? 0 : delta;
  out.id = out.delta === 0 ? 'keep' : 'suggested';
  const pace = lost >= 0 ? `losing ${lost.toFixed(1)} lb/week` : `gaining ${(-lost).toFixed(1)} lb/week`;
  out.why = `You ate about ${avgIntake} kcal/day and were ${pace}, so your real maintenance is about ${tdee} kcal. `
    + (out.delta === 0 ? `That matches your plan — no change needed.`
      : `For your planned −${(+o.targetRate).toFixed(1)} lb/week, ${out.delta > 0 ? 'add' : 'cut'} ${Math.abs(out.delta)} kcal/day.`)
    + (cutting && pctPerWeek > 1 ? ' You\'re losing more than 1% of body weight a week, which risks muscle — eat a bit more.' : '');
  return out;
}
// Split a calorie change mostly from carbs, some from fat; protein stays.
export function deltaMacros(kcal) {
  const f = Math.round((kcal * 0.3) / 9);
  return { p: 0, f, c: Math.round((kcal - f * 9) / 4) };
}
