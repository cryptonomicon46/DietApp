// 🎙️ "Tell me" on the phone: "two eggs, two slices of sourdough, half an avocado and coffee" →
// foods you already know (js/foods.js, plus your own), with amounts. Whatever it can't place is
// listed, never guessed silently; only then — and only if you tap — the words (never audio) can be
// read by Claude instead. Pure: text in, items out.
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25, couple: 2, few: 3 };
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
// Units that are a weight, and ones that are "one of the food's own units" (slice, cup, egg…).
const WEIGHT = { g: 1, gram: 1, grams: 1, oz: 28.35, ounce: 28.35, ounces: 28.35 };
const UNIT_WORDS = ['slice', 'slices', 'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'scoop', 'scoops', 'piece', 'pieces', 'handful', 'handfuls', 'bar', 'bars', 'bottle', 'bottles', 'can', 'cans', 'shot', 'shots', 'glass', 'glasses', 'bowl', 'bowls', 'medium', 'serving', 'servings'];
// Everyday words → a known food (the food's own name is matched too).
const ALIAS = {
  egg: 'egg', eggs: 'egg', 'egg white': 'eggWhites', 'egg whites': 'eggWhites', toast: 'wheatBread', bread: 'wheatBread',
  coffee: 'dripCoffee', 'black coffee': 'dripCoffee', 'drip coffee': 'dripCoffee', latte: 'latte', cappuccino: 'cappuccino', espresso: 'espresso', americano: 'americano',
  avocado: 'avocado', avo: 'avocado', oatmeal: 'oats', oats: 'oats', 'protein shake': 'premierShake', shake: 'premierShake', yogurt: 'greekYogurt', 'greek yogurt': 'greekYogurt',
  chicken: 'chicken', 'chicken breast': 'chicken', 'chicken thigh': 'thigh', rice: 'rice', 'brown rice': 'brownRice', salmon: 'salmon', steak: 'steak', beef: 'beef', 'ground beef': 'beef',
  tuna: 'tuna', shrimp: 'shrimp', cod: 'cod', potato: 'potato', 'sweet potato': 'sweetPotato', quinoa: 'quinoa', broccoli: 'broccoli', veggies: 'veggies', vegetables: 'veggies', salad: 'salad',
  banana: 'banana', apple: 'apple', orange: 'orange', pear: 'pear', grapes: 'grapes', blueberries: 'berries', berries: 'berries', strawberries: 'strawberries',
  'peanut butter': 'pb', 'almond butter': 'almondButter', almonds: 'almonds', cashews: 'cashews', nuts: 'mixedNuts', walnuts: 'walnuts', butter: 'butter', cheese: 'cheddar', cheddar: 'cheddar',
  'olive oil': 'oliveOil', milk: 'milk2', 'oat milk': 'oatMilk', 'almond milk': 'almondMilk', cookie: 'chocCookie', 'protein bar': 'questBar', whey: 'whey', 'protein powder': 'whey',
};
// Meat and fish without an amount: a typical cooked portion (shown as "~", to check).
const PORTION_G = 150;
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}½¼¾⅓⅔/.\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
const NICE = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const nice = (q) => { const w = Math.floor(q), f = Math.round((q - w) * 100) / 100; return NICE[f] ? `${w || ''}${NICE[f]}` : String(+q.toFixed(2)); };
const plural = (label) => label.replace(/y$/, 'ie').replace(/(sh|ch|s|x)$/, '$1e') + 's';
const sing = (w) => w.replace(/(ies)$/, 'y').replace(/(ches|shes|xes|oes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1');

function lexicon(foods) {
  const out = [];
  for (const [k, f] of Object.entries(foods)) {
    if (f.hidden) continue;
    const n = norm(f.name.replace(/\(.*?\)/g, ''));
    if (n) out.push([n, k]);
    out.push([norm(k), k]);
  }
  for (const [a, k] of Object.entries(ALIAS)) if (foods[k]) out.push([a, k]);
  return out.sort((a, b) => b[0].length - a[0].length);
}
function quantity(words) {
  let n = null, i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    if (/^\d+(\.\d+)?$/.test(w)) n = (n || 0) + +w;
    else if (/^\d+\/\d+$/.test(w)) { const [a, b] = w.split('/'); n = (n || 0) + +a / +b; }
    else if (/^\d+[½¼¾⅓⅔]$/.test(w)) n = (n || 0) + parseInt(w, 10) + FRAC[w.slice(-1)];
    else if (FRAC[w] != null) n = (n || 0) + FRAC[w];
    else if (w === 'half' || w === 'quarter') n = (n || 0) + NUM[w]; // "half", "1 and a half"
    else if (w === 'a' || w === 'an' || w === 'of' || w === 'and') continue; // "half of an", "a couple of"
    else if (NUM[w] != null) n = (n || 0) + NUM[w];
    else break;
  }
  return { n, rest: words.slice(i) };
}
// One part ("2 slices of sourdough") → an item, or null when no food matched.
export function parsePart(part, foods, lex = lexicon(foods)) {
  const words = norm(part).split(' ').filter(Boolean);
  if (!words.length) return null;
  let { n, rest } = quantity(words);
  let unit = null;
  if (rest[0] && (WEIGHT[rest[0]] || UNIT_WORDS.includes(rest[0]))) { unit = rest[0]; rest = rest.slice(1); }
  if (rest[0] === 'of') rest = rest.slice(1);
  const phrase = rest.join(' ');
  const hit = lex.find(([a]) => (` ${phrase} `).includes(` ${a} `) || (` ${phrase} `).includes(` ${sing(a)} `) || sing(phrase) === sing(a));
  if (!hit) return null;
  const key = hit[1], f = foods[key];
  const qty = n ?? 1;
  let grams, guess = false;
  if (unit && WEIGHT[unit]) grams = qty * WEIGHT[unit];
  else if (f.unit && (!unit || sing(unit) === sing(f.unit.label) || !WEIGHT[unit])) grams = qty * f.unit.grams;
  else { grams = qty * PORTION_G; guess = true; }
  grams = Math.round(grams);
  const k = grams / 100;
  return {
    food: key, name: f.name, grams, guess,
    amount: unit && WEIGHT[unit] ? `${grams} g` : f.unit ? `${nice(qty)} ${qty > 1 ? plural(f.unit.label) : f.unit.label}` : `~${grams} g`,
    kcal: Math.round(f.kcal * k), p: Math.round(f.p * k), c: Math.round(f.c * k), f: Math.round(f.f * k),
  };
}
// The whole sentence → { items, unread: parts it couldn't place }.
export function parseMeal(text, foods) {
  const lex = lexicon(foods);
  const clean = String(text || '').replace(/(\d)\s*(g|grams?|oz)\b/gi, '$1 $2').replace(/(\d+)\s+and\s+a\s+half/gi, (m, d) => `${d}.5`);
  const parts = clean.split(/,|;|\n|\band\b|\bwith\b|\bplus\b|\+|&/i).map((x) => x.trim()).filter(Boolean);
  const items = [], unread = [];
  for (const p of parts.slice(0, 20)) { const it = parsePart(p, foods, lex); if (it) items.push(it); else unread.push(p.slice(0, 60)); }
  return { items, unread };
}
export function totalOf(items) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items) for (const k in t) t[k] += +it[k] || 0;
  for (const k in t) t[k] = Math.round(t[k]);
  return t;
}
