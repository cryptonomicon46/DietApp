// Macros per 100 g as weighed: oats dry, everything cooked (USDA FoodData Central).
// `unit` lets the UI show a friendlier amount next to grams.
// `range` = slider limits in grams; `yield` = cooked / raw weight for the shopping list.
export const FOODS = {
  // Breakfast
  egg:        { name: 'Whole eggs',               kcal: 143, p: 12.6, f: 9.5,  c: 0.7,  unit: { label: 'egg', grams: 50 },      range: [50, 250, 50] },
  eggWhites:  { name: 'Egg whites (cooked)',      kcal: 52,  p: 10.9, f: 0.2,  c: 0.7,  unit: { label: 'cup', grams: 243 },     range: [0, 360, 15] },
  sourdough:  { name: 'Sourdough bread',          kcal: 272, p: 10.8, f: 2.4,  c: 51.9, unit: { label: 'slice', grams: 50 },    range: [0, 200, 25] },
  wheatBread: { name: 'Whole-wheat bread',        kcal: 252, p: 12.4, f: 3.5,  c: 42.7, unit: { label: 'slice', grams: 32 },    range: [0, 160, 16] },
  avocado:    { name: 'Avocado',                  kcal: 160, p: 2.0,  f: 14.7, c: 8.5,  unit: { label: 'avocado', grams: 136 }, range: [0, 150, 10] },
  butter:     { name: 'Butter',                   kcal: 717, p: 0.9,  f: 81.1, c: 0.1,  unit: { label: 'tbsp', grams: 14 },     range: [0, 28, 3.5] },
  cheddar:    { name: 'Cheddar cheese',           kcal: 403, p: 24.9, f: 33.1, c: 1.3,  unit: { label: 'oz', grams: 28 },       range: [0, 56, 7] },
  oats:       { name: 'Rolled oats (dry)',        kcal: 379, p: 13.2, f: 6.5,  c: 67.7, unit: { label: 'cup', grams: 80 },      range: [20, 160, 5] },
  whey:       { name: 'Whey protein',             kcal: 400, p: 80,   f: 5,    c: 10,   unit: { label: 'scoop', grams: 30 },    range: [0, 75, 7.5] },
  berries:    { name: 'Blueberries',              kcal: 57,  p: 0.7,  f: 0.3,  c: 14.5, unit: { label: 'cup', grams: 148 },     range: [0, 200, 25] },
  strawberries:{ name: 'Strawberries',            kcal: 32,  p: 0.7,  f: 0.3,  c: 7.7,  unit: { label: 'cup', grams: 152 },     range: [0, 250, 25] },
  banana:     { name: 'Banana',                   kcal: 89,  p: 1.1,  f: 0.3,  c: 22.8, unit: { label: 'banana', grams: 118 },  range: [0, 240, 20] },
  pb:         { name: 'Peanut butter',            kcal: 588, p: 25,   f: 50,   c: 20,   unit: { label: 'tbsp', grams: 16 },     range: [0, 48, 4] },
  almondButter:{ name: 'Almond butter',           kcal: 614, p: 21,   f: 55.5, c: 18.8, unit: { label: 'tbsp', grams: 16 },     range: [0, 48, 4] },
  walnuts:    { name: 'Walnuts',                  kcal: 654, p: 15.2, f: 65.2, c: 13.7, unit: { label: 'oz', grams: 28 },       range: [0, 42, 3.5] },
  // Lunch & dinner proteins (cooked)
  chicken:    { name: 'Chicken breast (white meat)', kcal: 165, p: 31.0, f: 3.6,  c: 0, oz: true, yield: 0.75, range: [0, 340, 5] },
  thigh:      { name: 'Chicken thigh (dark meat)',   kcal: 179, p: 25.0, f: 8.2,  c: 0, oz: true, yield: 0.7,  range: [0, 340, 5] },
  beef:       { name: '95/5 ground beef',            kcal: 193, p: 29.2, f: 7.6,  c: 0, oz: true, yield: 0.72, range: [0, 340, 5] },
  steak:      { name: 'Sirloin steak',               kcal: 187, p: 29.5, f: 6.7,  c: 0, oz: true, yield: 0.75, range: [0, 340, 5] },
  salmon:     { name: 'Salmon',                      kcal: 206, p: 22.1, f: 12.4, c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  cod:        { name: 'Cod',                         kcal: 105, p: 22.8, f: 0.9,  c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  trout:      { name: 'Rainbow trout',               kcal: 168, p: 23.8, f: 7.4,  c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  // Sides (cooked)
  rice:       { name: 'White/jasmine rice',       kcal: 130, p: 2.7, f: 0.3,  c: 28.2, unit: { label: 'cup', grams: 158 }, range: [0, 450, 10] },
  brownRice:  { name: 'Brown rice',               kcal: 112, p: 2.3, f: 0.8,  c: 23.5, unit: { label: 'cup', grams: 195 }, range: [0, 450, 10] },
  sweetPotato:{ name: 'Sweet potato (baked)',     kcal: 90,  p: 2.0, f: 0.2,  c: 20.7, unit: { label: 'medium', grams: 150 }, range: [0, 600, 10] },
  potato:     { name: 'Potato (baked)',           kcal: 93,  p: 2.5, f: 0.1,  c: 21.2, unit: { label: 'medium', grams: 170 }, range: [0, 600, 10] },
  quinoa:     { name: 'Quinoa',                   kcal: 120, p: 4.4, f: 1.9,  c: 21.3, unit: { label: 'cup', grams: 185 }, range: [0, 450, 10] },
  veggies:    { name: 'Mixed veggies',            kcal: 35,  p: 2.5, f: 0.3,  c: 7.0,  unit: { label: 'cup', grams: 100 }, range: [0, 400, 25] },
  oliveOil:   { name: 'Olive oil',                kcal: 884, p: 0,   f: 100,  c: 0,    unit: { label: 'tsp', grams: 4.5 }, range: [0, 31.5, 4.5] },
};

// Default protein rotation (one per day); every protein below can be picked.
export const PROTEINS = ['chicken', 'beef', 'salmon', 'cod', 'trout'];
const PROTEIN_OPTIONS = ['chicken', 'thigh', 'steak', 'beef', 'salmon', 'cod', 'trout'];

// Meal templates. Each item is a slot with swappable `options` (first = default).
// `drives` = the macro that slot is sized to hit; `fixed` = default grams for a fixed slot.
// `min`/`max` narrow the food's own range while auto-portioning.
export const BREAKFASTS = {
  eggs: {
    title: () => 'Eggs & toast',
    items: [
      { slot: 'eggs', options: ['egg'], fixedByFat: true, min: 100, max: 150 },
      { slot: 'protein', options: ['eggWhites'], drives: 'p' },
      { slot: 'carb', options: ['sourdough', 'wheatBread'], drives: 'c', min: 25 },
      { slot: 'fat', options: ['avocado', 'butter', 'cheddar', 'oliveOil'], drives: 'f' },
    ],
  },
  oatmeal: {
    title: () => 'Oatmeal with whey protein',
    items: [
      { slot: 'protein', options: ['whey', 'eggWhites'], drives: 'p', min: 15, max: 60 },
      { slot: 'carb', options: ['oats'], drives: 'c', min: 40, max: 120 },
      { slot: 'fruit', options: ['berries', 'strawberries', 'banana'], fixed: 75 },
      { slot: 'fat', options: ['pb', 'almondButter', 'walnuts'], drives: 'f' },
    ],
  },
};

export const MAIN_MEAL = {
  title: (f) => `${FOODS[f.protein].name.replace(/ \(.*\)/, '')}, ${FOODS[f.carb].name.replace(/ \(.*\)/, '').toLowerCase()} & veggies`,
  items: [
    { slot: 'protein', options: PROTEIN_OPTIONS, drives: 'p', min: 60, max: 260 },
    { slot: 'carb', options: ['rice', 'brownRice', 'sweetPotato', 'potato', 'quinoa'], drives: 'c', max: 450 },
    { slot: 'veggies', options: ['veggies'], fixed: 200 },
    { slot: 'fat', options: ['oliveOil', 'butter', 'avocado'], drives: 'f', max: 27 },
  ],
};

// Where to buy. Store brands/sizes vary by region, so these are suggestions.
export const STORES = {
  egg:       { store: 'Costco',  tip: 'Kirkland Signature 24-ct cage-free eggs', packGrams: 1200, packLabel: '24 eggs' },
  eggWhites: { store: 'Costco',  tip: 'Liquid egg whites, multi-carton pack', packGrams: 1450, packLabel: '3-pack of 16 oz cartons' },
  sourdough: { store: 'Sprouts', tip: 'Bakery sourdough loaf (Safeway and Costco bakeries too)', packGrams: 680, packLabel: '24 oz loaf' },
  avocado:   { store: 'Costco',  tip: 'Bag of Hass avocados (buy some firm, some ripe)', packGrams: 136 * 6, packLabel: 'bag of 6' },
  oats:      { store: 'Sprouts', tip: 'Bulk-bin old-fashioned rolled oats', packGrams: 454, packLabel: '1 lb' },
  whey:      { store: 'Costco',  tip: 'Whey protein tub (look for ~24 g protein / scoop)', packGrams: 30 * 70, packLabel: '~70 scoop tub' },
  berries:   { store: 'Costco',  tip: 'Frozen organic blueberries / mixed berries', packGrams: 1360, packLabel: '3 lb bag' },
  pb:        { store: 'Sprouts', tip: 'Natural peanut butter (just peanuts + salt)', packGrams: 454, packLabel: '16 oz jar' },
  chicken:   { store: 'Costco',  tip: 'Kirkland boneless skinless chicken breasts (freeze in portions)', packGrams: 454, packLabel: 'lb' },
  beef:      { store: 'Safeway', tip: '95/5 or 96/4 lean ground beef (Sprouts meat counter too)', packGrams: 454, packLabel: 'lb' },
  salmon:    { store: 'Costco',  tip: 'Kirkland Atlantic salmon fillets or frozen wild sockeye', packGrams: 454, packLabel: 'lb' },
  cod:       { store: 'Sprouts', tip: 'Seafood counter or frozen wild cod fillets (Safeway too)', packGrams: 454, packLabel: 'lb' },
  trout:     { store: 'Sprouts', tip: 'Rainbow trout fillets at the seafood counter', packGrams: 454, packLabel: 'lb' },
  rice:      { store: 'Costco',  tip: 'Jasmine rice bag (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.8, packLabel: 'lb dry' },
  veggies:   { store: 'Costco',  tip: 'Frozen stir-fry / broccoli florets; fresh at Sprouts', packGrams: 454, packLabel: 'lb' },
  oliveOil:  { store: 'Costco',  tip: 'Kirkland extra virgin olive oil', packGrams: 1000, packLabel: 'bottle' },
  wheatBread:  { store: 'Safeway', tip: 'Whole-wheat sandwich bread', packGrams: 680, packLabel: '24 oz loaf' },
  butter:      { store: 'Costco',  tip: 'Kirkland butter (freeze extra sticks)', packGrams: 454, packLabel: '1 lb' },
  cheddar:     { store: 'Costco',  tip: 'Sharp cheddar block or shredded', packGrams: 907, packLabel: '2 lb' },
  strawberries:{ store: 'Sprouts', tip: 'Fresh or frozen strawberries', packGrams: 454, packLabel: '1 lb' },
  banana:      { store: 'Costco',  tip: 'Bananas (3 lb bunch)', packGrams: 1360, packLabel: 'bunch' },
  almondButter:{ store: 'Costco',  tip: 'Kirkland almond butter', packGrams: 765, packLabel: '27 oz jar' },
  walnuts:     { store: 'Costco',  tip: 'Kirkland walnuts', packGrams: 1360, packLabel: '3 lb bag' },
  thigh:       { store: 'Costco',  tip: 'Kirkland boneless skinless chicken thighs', packGrams: 454, packLabel: 'lb' },
  steak:       { store: 'Costco',  tip: 'Top sirloin steaks (Safeway & Sprouts meat counters too)', packGrams: 454, packLabel: 'lb' },
  brownRice:   { store: 'Sprouts', tip: 'Bulk-bin brown rice (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.5, packLabel: 'lb dry' },
  sweetPotato: { store: 'Sprouts', tip: 'Sweet potatoes / yams', packGrams: 454, packLabel: 'lb' },
  potato:      { store: 'Safeway', tip: 'Russet or Yukon gold potatoes', packGrams: 454, packLabel: 'lb' },
  quinoa:      { store: 'Costco',  tip: 'Organic quinoa bag (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.7, packLabel: 'lb dry' },
};
