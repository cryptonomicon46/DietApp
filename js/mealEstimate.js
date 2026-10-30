// 🍽 What you said you ate → foods you can resize. Pure, so it's tested (tests/mealestimate.test.js).
//
// The rule (owner, 2026-10-30): you edit what you ate — each food and how much — and the app works
// out protein, carbs, fat and calories. Typing those numbers is only for a packaged meal, where
// they're printed on the label.
//
// An item is { name, amount, kcal, p, c, f } plus, when it's a food the app knows, { food, grams }
// (resized in grams, or in the food's own unit — eggs, slices, cups), else { per, n }: per-serving
// numbers from Claude, resized in servings.

const R = Math.round;
const nice = (q) => { const w = Math.floor(q + 1e-9), fr = q - w; const f = fr > 0.7 ? '¾' : fr > 0.4 ? '½' : fr > 0.1 ? '¼' : ''; return f ? (w ? `${w}${f}` : f) : String(w || 0); };
const plural = (label) => (/(s|sh|ch|x)$/.test(label) ? `${label}es` : /y$/.test(label) && !/[aeiou]y$/.test(label) ? `${label.slice(0, -1)}ies` : `${label}s`);

// One food's numbers for an amount in grams.
export function macrosOf(food, grams) {
  const k = grams / 100;
  return { kcal: R(food.kcal * k), p: R(food.p * k), c: R(food.c * k), f: R(food.f * k) };
}
// How an item is resized: in its unit (half steps), else grams (the food's own slider step), else servings.
export function amountOf(item, FOODS) {
  const f = item.food && FOODS[item.food];
  if (f?.unit?.grams > 0) {
    // Small units (an egg, a slice) step by halves; big ones (a cup, an avocado) by about an eighth.
    const u = f.unit.grams, step = u <= 60 ? u / 2 : Math.max(f.range?.[2] || 5, Math.round(u / 8 / 5) * 5), q = item.grams / u;
    return { by: 'unit', value: item.grams, min: step, max: Math.max(u * 6, item.grams * 2), step, text: `${nice(q)} ${q > 1 ? plural(f.unit.label) : f.unit.label}`, sub: `${R(item.grams)} g` };
  }
  if (f) {
    const [lo, hi, st] = f.range || [0, 1000, 5], step = Math.max(st || 5, 1);
    return { by: 'grams', value: item.grams, min: Math.max(step, lo || step), max: Math.max(hi || 1000, item.grams * 2), step, text: `${R(item.grams)} g`, sub: '' };
  }
  const n = item.n ?? 1;
  return { by: 'servings', value: n, min: 0.25, max: 4, step: 0.25, text: `${nice(n)} × ${item.baseAmount || item.amount || 'serving'}`, sub: '' };
}
// The item at a new amount (grams for foods, servings otherwise), its numbers worked out again.
export function resize(item, value, FOODS) {
  const f = item.food && FOODS[item.food];
  if (f) { const grams = Math.max(0, R(+value || 0)); const a = amountOf({ ...item, grams }, FOODS); return { ...item, grams, ...macrosOf(f, grams), amount: a.by === 'unit' ? a.text : `${grams} g`, guess: false }; }
  const n = Math.max(0.25, Math.round((+value || 1) * 4) / 4), per = item.per || { kcal: item.kcal, p: item.p, c: item.c, f: item.f };
  return { ...item, per, n, baseAmount: item.baseAmount || item.amount, amount: `${nice(n)} × ${item.baseAmount || item.amount || 'serving'}`, kcal: R(per.kcal * n), p: R(per.p * n), c: R(per.c * n), f: R(per.f * n) };
}
// One step up or down.
export function nudge(item, dir, FOODS) { const a = amountOf(item, FOODS); return resize(item, Math.min(a.max, Math.max(a.min, a.value + dir * a.step)), FOODS); }

// Claude's items (name + amount + numbers) → foods the app knows, where the phone can place them
// exactly ("2 eggs" → Whole eggs 100 g); otherwise kept as servings.
export function placeItems(items, FOODS, parseMeal) {
  return items.map((x) => {
    if (x.food && FOODS[x.food]) return x;
    const got = parseMeal(`${x.amount || ''} ${x.name || ''}`.trim(), FOODS);
    const one = got.items.length === 1 && !got.unread.length ? got.items[0] : null;
    return one && !one.guess ? { ...one, name: FOODS[one.food].name } : { ...x, per: { kcal: x.kcal, p: x.p, c: x.c, f: x.f }, n: 1, baseAmount: x.amount };
  });
}

// Today's meal from the items: foods and grams (so it stays resizable after logging) when every
// item is a known food — scaled by how much you had (photo portion × how much you ate) — else null.
export function asMealItems(items, mult = 1) {
  if (!items.length || items.some((x) => !x.food)) return null;
  return items.filter((x) => x.grams > 0).map((x) => ({ food: x.food, grams: R(x.grams * mult) }));
}

// "Log a packaged meal…", "from the label", "pre-packaged" → the label form, with any numbers said.
export function packagedAsk(text) {
  const t = String(text || '');
  if (!/\b(pre-?packaged|packaged|packaged meal|from the label|the label says|label)\b/i.test(t)) return null;
  const num = (re) => { const m = re.exec(t); return m ? m[1] : ''; };
  const name = t.replace(/\b(log|a|an|my|the)\b/gi, ' ').replace(/\b(pre-?packaged|packaged|meal|from the label|the label says|label|for (breakfast|lunch|dinner|a snack|snack))\b/gi, ' ')
    .replace(/\d+(\.\d+)?\s*(kcal|calories|cal|g|grams?)?\s*(of\s+)?(protein|carbs?|fat)?/gi, ' ').replace(/[,:;—–-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    name: name.length >= 3 ? name.slice(0, 60).replace(/^./, (ch) => ch.toUpperCase()) : '',
    kcal: num(/(\d+(?:\.\d+)?)\s*(?:kcal|calories|cal)\b/i), p: num(/(\d+(?:\.\d+)?)\s*g?\s*(?:of\s+)?protein/i), c: num(/(\d+(?:\.\d+)?)\s*g?\s*(?:of\s+)?carbs?/i), f: num(/(\d+(?:\.\d+)?)\s*g?\s*(?:of\s+)?fat/i),
  };
}
