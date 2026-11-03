// 🤒 Sick day: a day mode you turn on yourself (Health, or "I'm sick today" in Talk). The app never
// guesses. For that day only:
//  • No calorie cut: the day's calories go up to maintenance (fever and fighting an infection use
//    more energy, not less), protein stays where it is, and the extra goes to carbs and fat in the
//    plan's own ratio. A lean-gain day (already above maintenance) is left as it is.
//  • The day is left out of the weekly check-in, the "days on target" count and your weight trend
//    (fluids move the scale when you're ill), so being sick never reads as being off plan.
//  • Fluids are counted (cups), easy-to-eat foods are offered (EASY_FOODS) and a short "Feel better"
//    list of drinks and comforts. No medicines: those are for a pharmacist or doctor to suggest.
// It ends with the day (the next morning Health asks whether you're still sick). Kept in your
// trackers under `sick` ({ 'YYYY-MM-DD': { fluids, comfort: [ids], at } }), in your Diet part —
// so only people you share your Diet with can see that a day was a sick day. Pure: data in, data
// out; the changes take a store ({ get, set }).
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const KEEP_DAYS = 120;
export const FLUID_GOAL = 8; // cups (about 2 litres): a simple, visible aim, not a rule

export const sickOf = (data, day) => (data?.sick || {})[day] || null;
export const isSick = (data, day) => !!sickOf(data, day);
export const sickDates = (data) => Object.keys(data?.sick || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
// Yesterday was a sick day and today isn't (yet): Health asks "Still feeling sick?".
export const askStillSick = (data, today) => isSick(data, shift(today, -1)) && !isSick(data, today);
// How many sick days in a row up to `day` (1 on the first).
export function sickRun(data, day) {
  let n = 0;
  while (isSick(data, shift(day, -n)) && n < 60) n++;
  return n;
}

// The day's targets on a sick day: maintenance calories, the same protein.
export function sickTargets(base) {
  const tdee = Math.round((+base.tdee || 0) / 10) * 10;
  if (!(tdee > base.kcal)) return { ...base, sick: true };
  const extra = tdee - base.kcal, cK = (base.c || 0) * 4, fK = (base.f || 0) * 9;
  const share = cK + fK > 0 ? cK / (cK + fK) : 0.6;
  return { ...base, kcal: tdee, c: Math.round(base.c + (extra * share) / 4), f: Math.round(base.f + (extra * (1 - share)) / 9), sick: true };
}
// Targets for `day`: the sick-day ones when it's a sick day, else as they were.
export const targetsForDay = (base, data, day) => (isSick(data, day) ? sickTargets(base) : base);
// A weigh-in on a sick day doesn't count in the trend.
export function trendWeights(weights = [], data) {
  const sick = new Set(sickDates(data));
  return sick.size ? weights.filter((w) => !sick.has(w.date)) : weights;
}

// ---------- changes (to a store: { get(key, fallback), set(key, value) }) ----------
function edit(s, fn) {
  const all = { ...(s.get('sick', {}) || {}) };
  fn(all);
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete all[k];
  s.set('sick', all);
  return all;
}
// Turn a day on or off. Returns what that day was before (for Undo: setSick(s, day, before)).
export function setSick(s, day, on) {
  const before = (s.get('sick', {}) || {})[day] ?? null;
  edit(s, (all) => {
    if (on && typeof on === 'object') all[day] = { ...on };
    else if (on) all[day] = all[day] || { fluids: 0, comfort: [], at: Date.now() };
    else delete all[day];
  });
  return before;
}
// +1 / −1 cup (never below 0). Turns the day on if it wasn't.
export function addFluid(s, day, n = 1) {
  let cups = 0;
  edit(s, (all) => { const e = { fluids: 0, comfort: [], ...(all[day] || { at: Date.now() }) }; e.fluids = Math.max(0, Math.min(30, (+e.fluids || 0) + n)); cups = e.fluids; all[day] = e; });
  return cups;
}
export function toggleComfort(s, day, id) {
  let on = false;
  edit(s, (all) => { const e = { fluids: 0, comfort: [], ...(all[day] || { at: Date.now() }) }; const set = new Set(e.comfort || []); if (set.has(id)) set.delete(id); else { set.add(id); on = true; } e.comfort = [...set]; all[day] = e; });
  return on;
}

// ---------- what to offer ----------
// 🥣 Easy to eat: soft, warm or bland, with protein where possible. Usual portions, rounded.
// tags: throat (sore throat), nose (stuffy / cough), stomach (upset stomach), appetite (no appetite).
export const EASY_TAGS = { throat: 'Sore throat', nose: 'Stuffy / cough', stomach: 'Upset stomach', appetite: 'No appetite' };
export const EASY_FOODS = [
  { id: 'soup', name: 'Chicken noodle soup', portion: '1½ cups', kcal: 190, p: 14, c: 20, f: 6, why: 'warm fluid and salt', tags: ['throat', 'nose', 'appetite'] },
  { id: 'congee', name: 'Rice congee with ginger and chicken', portion: '1 bowl', kcal: 220, p: 12, c: 33, f: 4, why: 'soft and gentle', tags: ['stomach', 'throat', 'appetite'] },
  { id: 'broth', name: 'Bone broth', portion: '1 mug', kcal: 40, p: 9, c: 0, f: 0, why: 'fluid and salt when food is hard', tags: ['stomach', 'appetite', 'throat'] },
  { id: 'oats', name: 'Oatmeal with banana and honey', portion: '1 bowl', kcal: 300, p: 8, c: 58, f: 4, why: 'warm, soft energy', tags: ['throat', 'appetite', 'stomach'] },
  { id: 'eggs', name: 'Scrambled eggs on toast', portion: '2 eggs, 1 slice', kcal: 280, p: 16, c: 15, f: 17, why: 'easy protein', tags: ['nose', 'appetite'] },
  { id: 'yogurt', name: 'Greek yogurt with honey', portion: '170 g', kcal: 130, p: 17, c: 13, f: 0, why: 'cool and soft', tags: ['throat'] },
  { id: 'shake', name: 'Protein shake', portion: '1 bottle', kcal: 160, p: 30, c: 5, f: 3, why: 'protein you can sip', tags: ['appetite', 'throat'] },
  { id: 'smoothie', name: 'Banana and yogurt smoothie', portion: '12 oz', kcal: 250, p: 14, c: 44, f: 3, why: 'cold, easy calories', tags: ['throat', 'appetite'] },
  { id: 'banana', name: 'Banana', portion: '1 medium', kcal: 105, p: 1, c: 27, f: 0, why: 'bland, some potassium', tags: ['stomach'] },
  { id: 'applesauce', name: 'Applesauce, unsweetened', portion: '1 cup', kcal: 100, p: 0, c: 27, f: 0, why: 'bland', tags: ['stomach'] },
  { id: 'toast', name: 'Plain toast', portion: '2 slices', kcal: 160, p: 6, c: 28, f: 2, why: 'bland', tags: ['stomach'] },
  { id: 'crackers', name: 'Saltine crackers', portion: '6', kcal: 75, p: 2, c: 13, f: 2, why: 'bland, a little salt', tags: ['stomach'] },
  { id: 'icepop', name: 'Fruit ice pop', portion: '1', kcal: 45, p: 0, c: 11, f: 0, why: 'soothes a sore throat', tags: ['throat'] },
];
export const easyFoods = (tag = null) => EASY_FOODS.filter((f) => !tag || f.tags.includes(tag));
export const easyFood = (id) => EASY_FOODS.find((f) => f.id === id) || null;
// The three quick picks on Health (soup first, then something with protein, then something soft).
export const QUICK_EASY = ['soup', 'eggs', 'oats'];
// What a picked easy food becomes in a meal (a fixed entry, like a packaged meal).
export const easyEntry = (f) => ({ prepared: { name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f, servings: 1, icon: '🥣' }, how: 'manual', ctx: 'home' });

// ☕ Feel better: drinks (each counts toward fluids; ones with calories are logged too) and comforts
// (a checklist for the day). Evidence, briefly: honey eases a cough (not for babies under 1);
// ginger can settle nausea; warm fluids, steam and saline ease a stuffy nose; a salt-water gargle
// soothes a sore throat; rest matters most.
export const FEEL_DRINKS = [
  { id: 'honeytea', name: 'Tea with honey and lemon', cups: 1, kcal: 25, c: 6, sub: 'honey eases a cough (never for babies under 1)' },
  { id: 'ginger', name: 'Ginger tea', cups: 1, kcal: 5, c: 1, sub: 'can settle a queasy stomach' },
  { id: 'peppermint', name: 'Peppermint or chamomile tea', cups: 1, kcal: 0, c: 0, sub: 'warm; chamomile at bedtime' },
  { id: 'broth', name: 'Warm broth', cups: 1, kcal: 40, c: 0, p: 9, sub: 'fluid and salt' },
  { id: 'electrolyte', name: 'Electrolyte drink', cups: 2, kcal: 50, c: 12, sub: '500 ml · with fever, sweating or an upset stomach' },
  { id: 'water', name: 'Water', cups: 1, kcal: 0, c: 0, sub: '' },
];
export const feelDrink = (id) => FEEL_DRINKS.find((d) => d.id === id) || null;
// A drink with calories, as a logged extra.
export const drinkExtra = (d) => (d.kcal > 0 ? { title: `☕ ${d.name}`, kcal: d.kcal, p: d.p || 0, c: d.c || 0, f: 0, sick: true } : null);
export const COMFORTS = [
  { id: 'gargle', name: 'Warm salt-water gargle', sub: '½ tsp salt in a cup of warm water, a few times a day' },
  { id: 'steam', name: 'Hot shower or steam', sub: 'eases a stuffy nose' },
  { id: 'saline', name: 'Saline nose spray or rinse', sub: 'for a neti pot, distilled or boiled-then-cooled water' },
  { id: 'humidifier', name: 'Humidifier on', sub: '' },
  { id: 'lozenge', name: 'Throat lozenge', sub: '' },
  { id: 'rest', name: 'Rest, and an early night', sub: 'an extra pillow helps a cough' },
];
export const CARE_LINE = 'For medicines, ask a pharmacist. Call your doctor for trouble breathing, a fever over 103 °F or lasting more than 3 days, if you can’t keep fluids down, or if you get better and then worse.';
