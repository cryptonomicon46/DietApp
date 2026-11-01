// ⚖️ Fit a meal to N calories (the meal sheet's "Fit to"). Protein first: foods that are mostly
// protein keep their grams while the carbs and fats make up the difference; only when that can't
// reach N does protein shrink too (and the answer says so). Locked foods never move. Each food is
// rounded to its slider step and kept inside its slider range. Pure (no storage).
//   portions: [{ slot, food, grams, range?: [lo, hi, step], locked? }] (js/plan.js planOf portions)
//   → { grams: { slot: g }, kcal (what it comes to), proteinCut (protein had to shrink), reached }
const kcalOf = (foods, x, g = x.grams) => ((foods[x.food]?.kcal || 0) * g) / 100;
// "Mostly protein": at least half its calories from protein (chicken, egg whites, whey…).
export const isProtein = (f) => !!f && f.kcal > 0 && (f.p * 4) / f.kcal >= 0.5;

export function fitPortions(portions = [], target, foods) {
  const live = portions.filter((x) => foods[x.food] && x.grams > 0);
  const step = (x) => x.range?.[2] || foods[x.food]?.range?.[2] || 5;
  const hi = (x) => Math.max(x.range?.[1] ?? foods[x.food]?.range?.[1] ?? 2000, x.grams);
  const round = (x, g) => Math.min(hi(x), Math.max(step(x), Math.round(g / step(x)) * step(x)));
  const kept = live.filter((x) => x.locked), flex = live.filter((x) => !x.locked);
  const prot = flex.filter((x) => isProtein(foods[x.food])), rest = flex.filter((x) => !isProtein(foods[x.food]));
  const sum = (list, g = (x) => x.grams) => list.reduce((a, x) => a + kcalOf(foods, x, g(x)), 0);
  const fixed = sum(kept), P = sum(prot), R = sum(rest);
  const out = {};
  let proteinCut = false;
  if (!(target > 0) || P + R <= 0) return { grams: {}, kcal: Math.round(fixed + P + R), proteinCut, reached: false };
  // Carbs and fats first (protein kept); if that would leave them under a quarter of what they
  // were, or there are none, everything that can move scales together.
  const k = R > 0 ? (target - fixed - P) / R : -1;
  if (k >= 0.25) for (const x of rest) out[x.slot] = round(x, x.grams * k);
  else {
    const all = (target - fixed) / (P + R);
    for (const x of flex) out[x.slot] = round(x, x.grams * Math.max(all, 0.05));
    proteinCut = prot.length > 0 && all < 1;
  }
  const kcal = Math.round(fixed + live.reduce((a, x) => a + kcalOf(foods, x, out[x.slot] ?? x.grams), 0));
  return { grams: out, kcal, proteinCut, reached: Math.abs(kcal - target) <= Math.max(25, target * 0.05) };
}
