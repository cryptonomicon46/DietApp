// ⚖️ Fit a meal to N calories (the meal sheet's "Fit to"). Pure (no storage).
//
// The macros first, then the grams. What a fitted meal aims for (fitMacros):
//  • Protein is set in grams, not as a share. Daily protein on a cut is 1.6–2.2 g/kg (Morton et
//    al. 2018; Helms et al. 2014), spread over the day's meals, and about 0.4 g/kg in a meal is what
//    maximises muscle protein synthesis from it (Schoenfeld & Aragon 2018). So a smaller meal keeps
//    its planned protein while that's at most half its calories (above that there'd be little room
//    for carbs and fat), and never drops below 0.4 g/kg unless that alone would be over 60 % of the
//    calories. A bigger meal keeps the planned protein; the extra calories go to carbs and fat.
//  • Carbs and fat share what's left in the plan's own carb : fat ratio (the plan keeps fat inside
//    the 20–35 % range of the Dietary Reference Intakes), so a fitted meal is the same meal, smaller
//    or bigger: not a plate of chicken with the rice gone.
//  • Non-starchy veg (< 40 kcal / 100 g) stay as they are — fibre and volume for few calories
//    (Rolls 2009) — trimmed only for a meal under 350 kcal, as the plan itself does.
// Then the grams (fitPortions): the amounts that land closest to those macros and to N, each kept
// inside its slider range, rounded to its step, and never dropped from the meal. Locked foods
// (🔒) don't move.
//   portions: [{ slot, food, grams, range?: [lo, hi, step], locked? }] (js/plan.js planOf portions)
//   opts.plan: the meal's planned { p, c, f } (grams); without it, the meal's own current split.
//   opts.minP: the per-meal protein floor in grams (0.4 g/kg; perMealProtein).
//   opts.aim: exact { p, c, f } grams to aim for instead (What's left: the day's remaining macros).
//   → { grams: { slot: g }, kcal, macros: { p, c, f } (what it comes to), aim, proteinCut, reached }
const kcalOf = (foods, x, g = x.grams) => ((foods[x.food]?.kcal || 0) * g) / 100;
// "Mostly protein": at least half its calories from protein (chicken, egg whites, whey…).
export const isProtein = (f) => !!f && f.kcal > 0 && (f.p * 4) / f.kcal >= 0.5;
// Non-starchy veg: kept as they are (see above).
export const isFreeVeg = (f) => !!f && f.kcal > 0 && f.kcal < 40;
// 0.4 g protein per kg of body weight (weight in lb).
export const perMealProtein = (lb) => (lb > 0 ? Math.round((lb / 2.20462) * 0.4) : 0);
export const PROTEIN_MAX_SHARE = 0.5;
export const PROTEIN_FLOOR_MAX_SHARE = 0.6;

// The macros a meal of `kcal` aims for, from the meal's planned { p, c, f }.
//   maxShare: protein's most, as a share of the calories (½; What's left allows 0.6, so protein
//   you're short of today can be made up).
export function fitMacros(kcal, plan = {}, { minP = 0, maxShare = PROTEIN_MAX_SHARE } = {}) {
  const pPlan = Math.max(0, +plan.p || 0);
  let p = Math.min(pPlan, (kcal * maxShare) / 4);
  p = Math.max(p, Math.min(minP, pPlan, (kcal * PROTEIN_FLOOR_MAX_SHARE) / 4));
  const cK = Math.max(0, +plan.c || 0) * 4, fK = Math.max(0, +plan.f || 0) * 9;
  const carbShare = cK + fK > 0 ? cK / (cK + fK) : 0.5;
  const rest = Math.max(0, kcal - p * 4);
  return { p: Math.round(p), c: Math.round((rest * carbShare) / 4), f: Math.round((rest * (1 - carbShare)) / 9) };
}

export function fitPortions(portions = [], target, foods, { plan, minP = 0, aim: aimIn } = {}) {
  const live = portions.filter((x) => foods[x.food] && x.grams > 0);
  const step = (x) => x.range?.[2] || foods[x.food]?.range?.[2] || 5;
  const hi = (x) => Math.max(x.range?.[1] ?? foods[x.food]?.range?.[1] ?? 2000, x.grams);
  const round = (x, g) => Math.min(hi(x), Math.max(step(x), Math.round(g / step(x)) * step(x)));
  const macrosOf = (g) => live.reduce((a, x) => { const f = foods[x.food], k = (g[x.slot] ?? x.grams) / 100; a.p += f.p * k; a.c += f.c * k; a.f += f.f * k; a.kcal += f.kcal * k; return a; }, { p: 0, c: 0, f: 0, kcal: 0 });
  const now = macrosOf({});
  if (!(target > 0) || now.kcal <= 0) return { grams: {}, kcal: Math.round(now.kcal), macros: { p: Math.round(now.p), c: Math.round(now.c), f: Math.round(now.f) }, aim: null, proteinCut: false, reached: false };
  const planned = plan && (+plan.p || +plan.c || +plan.f) ? plan : now;
  const aim = aimIn || fitMacros(target, planned, { minP });

  // Veg stay (trimmed for a very small meal); locked foods don't move; the rest are solved for.
  const out = {};
  for (const x of live) if (!x.locked && isFreeVeg(foods[x.food])) out[x.slot] = target < 350 ? round(x, x.grams * 0.6) : x.grams;
  const flex = live.filter((x) => !x.locked && !(x.slot in out));
  // The same meal, smaller or bigger: fitting down never grows a food, fitting up never shrinks one.
  const down = target < now.kcal;
  const lo = (x) => (down ? step(x) : x.grams), top = (x) => (down ? x.grams : hi(x));
  const fit = (x, gr) => Math.min(top(x), Math.max(lo(x), gr));
  // Closeness, in calories: the total counts most, then protein short of its aim, then carbs and
  // fat. Protein over its aim counts like carbs and fat (more protein isn't a problem, but it
  // shouldn't crowd them out).
  const W = { p: 3, kcal: 4, c: 1, f: 1 };
  const w = (k, s) => (k === 'p' && s > T.p ? 1 : W[k]);
  const T = { p: aim.p * 4, c: aim.c * 4, f: aim.f * 9, kcal: target };
  const per = (x) => { const f = foods[x.food]; return { p: f.p * 0.04, c: f.c * 0.04, f: f.f * 0.09, kcal: f.kcal / 100 }; };
  const g = { ...out };
  for (const x of flex) g[x.slot] = x.grams;
  const sums = () => { const m = macrosOf(g); return { p: m.p * 4, c: m.c * 4, f: m.f * 9, kcal: m.kcal }; };
  const cost = (s) => Object.keys(W).reduce((a, k) => a + w(k, s[k]) * (s[k] - T[k]) ** 2, 0);
  // Least squares, one food at a time (each step is that food's best amount given the others).
  for (let iter = 0; iter < 80; iter++) {
    for (const x of flex) {
      const a = per(x), s = sums();
      let num = 0, den = 0;
      for (const k of Object.keys(W)) { const r = T[k] - (s[k] - a[k] * g[x.slot]), wk = w(k, s[k]); num += wk * a[k] * r; den += wk * a[k] * a[k]; }
      g[x.slot] = den > 0 ? fit(x, num / den) : g[x.slot];
    }
  }
  for (const x of flex) g[x.slot] = fit(x, round(x, g[x.slot]));
  // Rounded amounts: nudge one step at a time while that brings it closer.
  for (let n = 0; n < 40; n++) {
    let best = null, bestCost = cost(sums());
    for (const x of flex) for (const d of [-1, 1]) {
      const was = g[x.slot], nx = fit(x, round(x, was + d * step(x)));
      if (nx === was) continue;
      g[x.slot] = nx;
      const c = cost(sums());
      if (c < bestCost - 1e-6) { bestCost = c; best = [x.slot, nx]; }
      g[x.slot] = was;
    }
    if (!best) break;
    g[best[0]] = best[1];
  }
  for (const x of flex) out[x.slot] = +(+g[x.slot]).toFixed(1);
  const m = macrosOf(out), kcal = Math.round(m.kcal);
  return {
    grams: out, kcal, aim,
    macros: { p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f) },
    // Protein came out lower than the meal had (it was more than half a small meal).
    proteinCut: m.p < now.p - 3,
    reached: Math.abs(kcal - target) <= Math.max(25, target * 0.05),
  };
}
