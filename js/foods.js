// Macros per 100 g as weighed: oats dry, everything cooked (USDA FoodData Central).
// `unit` lets the UI show a friendlier amount next to grams.
// `range` = slider limits in grams; `yield` = cooked / raw weight for the shopping list;
// `raw` = cooked / raw (or dry) weight for weighing before cooking (meat and fish use `yield`);
// `cooked` = cooked / dry weight for foods stored dry (oats cooked in water: USDA 379 vs 71 kcal per 100 g).
export const FOODS = {
  // Breakfast
  egg:        { name: 'Whole eggs',               kcal: 143, p: 12.6, f: 9.5,  c: 0.7,  unit: { label: 'egg', grams: 50 },      range: [50, 250, 50] },
  eggWhites:  { name: 'Egg whites (cooked)',      kcal: 52,  p: 10.9, f: 0.2,  c: 0.7,  unit: { label: 'cup', grams: 243 },     range: [0, 360, 15] },
  sourdough:  { name: 'Sourdough bread',          kcal: 272, p: 10.8, f: 2.4,  c: 51.9, unit: { label: 'slice', grams: 50 },    range: [0, 200, 12.5] },
  wheatBread: { name: 'Whole-wheat bread',        kcal: 252, p: 12.4, f: 3.5,  c: 42.7, unit: { label: 'slice', grams: 32 },    range: [0, 160, 16] },
  avocado:    { name: 'Avocado',                  kcal: 160, p: 2.0,  f: 14.7, c: 8.5,  unit: { label: 'avocado', grams: 136 }, range: [0, 150, 5] },
  butter:     { name: 'Butter',                   kcal: 717, p: 0.9,  f: 81.1, c: 0.1,  unit: { label: 'tbsp', grams: 14 },     range: [0, 28, 3.5] },
  cheddar:    { name: 'Cheddar cheese',           kcal: 403, p: 24.9, f: 33.1, c: 1.3,  unit: { label: 'oz', grams: 28 },       range: [0, 56, 7] },
  oats:       { name: 'Rolled oats',              kcal: 379, p: 13.2, f: 6.5,  c: 67.7, unit: { label: 'cup', grams: 80 }, cooked: 5.3, range: [20, 160, 5] },
  whey:       { name: 'Whey protein',             kcal: 400, p: 80,   f: 5,    c: 10,   unit: { label: 'scoop', grams: 30 },    range: [0, 75, 5] },
  berries:    { name: 'Blueberries',              kcal: 57,  p: 0.7,  f: 0.3,  c: 14.5, unit: { label: 'cup', grams: 148 },     range: [0, 200, 25] },
  frozenBerries:{ name: 'Frozen mixed berries',  kcal: 50,  p: 0.7,  f: 0.4,  c: 12.0, unit: { label: 'cup', grams: 140 },     range: [0, 300, 10] },
  strawberries:{ name: 'Strawberries',            kcal: 32,  p: 0.7,  f: 0.3,  c: 7.7,  unit: { label: 'cup', grams: 152 },     range: [0, 250, 25] },
  banana:     { name: 'Banana',                   kcal: 89,  p: 1.1,  f: 0.3,  c: 22.8, unit: { label: 'banana', grams: 118 },  range: [0, 240, 20] },
  pb:         { name: 'Peanut butter',            kcal: 588, p: 25,   f: 50,   c: 20,   unit: { label: 'tbsp', grams: 16 },     range: [0, 48, 4] },
  // Snacks (USDA; fruit counted by the piece, berries by the cup)
  apple:      { name: 'Apple',                    kcal: 52,  p: 0.3,  f: 0.2,  c: 13.8, unit: { label: 'apple', grams: 182 },  range: [0, 546, 91] },
  orange:     { name: 'Orange',                   kcal: 47,  p: 0.9,  f: 0.1,  c: 11.8, unit: { label: 'orange', grams: 131 }, range: [0, 393, 65.5] },
  pear:       { name: 'Pear',                     kcal: 57,  p: 0.4,  f: 0.1,  c: 15.2, unit: { label: 'pear', grams: 178 },   range: [0, 534, 89] },
  grapes:     { name: 'Grapes',                   kcal: 69,  p: 0.7,  f: 0.2,  c: 18.1, unit: { label: 'cup', grams: 151 },    range: [0, 453, 37.75] },
  mixedNuts:  { name: 'Mixed nuts (unsalted)',               kcal: 607, p: 20,   f: 54,   c: 21,   unit: { label: 'handful', grams: 28 }, range: [0, 84, 7] },
  cashews:    { name: 'Cashews (unsalted)',       kcal: 574, p: 15.3, f: 46.4, c: 32.7, unit: { label: 'handful', grams: 28 }, range: [0, 84, 7] },
  almonds:    { name: 'Almonds',                  kcal: 579, p: 21.2, f: 49.9, c: 21.6, unit: { label: 'handful', grams: 28 }, range: [0, 84, 7] },
  greekYogurt:{ name: 'Greek yogurt (plain 0%)',  kcal: 59,  p: 10.3, f: 0.4,  c: 3.6,  unit: { label: 'cup', grams: 170 },    range: [0, 510, 42.5] },
  // Bars & shakes: per 100 g from one bar/bottle's label (a common flavor).
  clifBar:     { name: 'Clif Bar (chocolate chip)', kcal: 367.6, p: 14.7, f: 7.4, c: 64.7, unit: { label: 'bar', grams: 68 }, range: [0, 204, 34], quick: true },
  clifBuilders: { name: 'Clif Builders protein bar', kcal: 426.5, p: 29.4, f: 16.2, c: 44.1, unit: { label: 'bar', grams: 68 }, range: [0, 204, 34], quick: true },
  barebells:   { name: 'Barebells protein bar', kcal: 363.6, p: 36.4, f: 14.5, c: 30.9, unit: { label: 'bar', grams: 55 }, range: [0, 165, 27.5], quick: true },
  questBar:    { name: 'Quest protein bar', kcal: 316.7, p: 35.0, f: 13.3, c: 36.7, unit: { label: 'bar', grams: 60 }, range: [0, 180, 30], quick: true },
  rxBar:       { name: 'RXBAR', kcal: 403.8, p: 23.1, f: 17.3, c: 44.2, unit: { label: 'bar', grams: 52 }, range: [0, 156, 26], quick: true },
  kirklandBar: { name: 'Kirkland protein bar', kcal: 316.7, p: 35.0, f: 11.7, c: 36.7, unit: { label: 'bar', grams: 60 }, range: [0, 180, 30], quick: true },
  // Coffee shop: typical 12 oz drinks with 2% milk and no added syrup (per drink → per 100 g);
  // a bakery chocolate chip cookie ≈ 60 g (USDA: 488 kcal per 100 g).
  cappuccino:  { name: 'Cappuccino (12 oz, 2% milk)', kcal: 28.17, p: 1.69, f: 1.13, c: 2.82, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  latte:       { name: 'Latte (12 oz, 2% milk)', kcal: 42.25, p: 2.82, f: 1.69, c: 4.23, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  icedLatte:   { name: 'Iced latte (12 oz, 2% milk)', kcal: 28.17, p: 1.69, f: 1.13, c: 2.82, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  cortado:     { name: 'Cortado (2% milk)', kcal: 46.15, p: 3.08, f: 1.92, c: 4.62, unit: { label: 'cortado', grams: 130 }, range: [0, 260, 65.0], coffee: true },
  flatWhite:   { name: 'Flat white (12 oz, whole milk)', kcal: 47.89, p: 2.54, f: 2.54, c: 3.94, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  oatLatte:    { name: 'Oat milk latte (12 oz)', kcal: 53.52, p: 0.56, f: 2.54, c: 7.32, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  mocha:       { name: 'Mocha (12 oz, 2%, no whip)', kcal: 53.52, p: 2.82, f: 1.69, c: 7.32, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  chaiLatte:   { name: 'Chai latte (12 oz, 2% milk)', kcal: 53.52, p: 1.69, f: 0.99, c: 9.3, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  americano:   { name: 'Americano (12 oz)', kcal: 2.82, p: 0.28, f: 0.0, c: 0.56, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  espresso:    { name: 'Espresso (double shot)', kcal: 8.33, p: 0.5, f: 0.17, c: 1.33, unit: { label: 'double shot', grams: 60 }, range: [0, 120, 30.0], coffee: true },
  dripCoffee:  { name: 'Drip coffee, black (12 oz)', kcal: 1.41, p: 0.2, f: 0.03, c: 0.0, unit: { label: 'cup', grams: 355 }, range: [0, 710, 177.5], coffee: true },
  chocCookie:  { name: 'Chocolate chip cookie (coffee shop)', kcal: 488, p: 4.9, f: 24, c: 64, unit: { label: 'cookie', grams: 60 }, range: [0, 120, 30], coffee: true },
  premierShake: { name: 'Premier Protein shake', kcal: 47.1, p: 8.8, f: 0.9, c: 1.5, unit: { label: 'bottle', grams: 340 }, range: [0, 1020, 170], quick: true },
  corePower:   { name: 'Fairlife Core Power (26 g)', kcal: 41.1, p: 6.3, f: 1.1, c: 1.9, unit: { label: 'bottle', grams: 414 }, range: [0, 1242, 207], quick: true },
  oatMilk:    { name: 'Oat milk',                 kcal: 50,  p: 1.3,  f: 2.9,  c: 6.7,  unit: { label: 'cup', grams: 240 },     range: [0, 480, 20] },
  almondMilk: { name: 'Almond milk (unsweetened)', kcal: 15, p: 0.6,  f: 1.2,  c: 0.3,  unit: { label: 'cup', grams: 240 },     range: [0, 480, 20] },
  milk2:      { name: '2% milk',                  kcal: 50,  p: 3.3,  f: 2.0,  c: 4.8,  unit: { label: 'cup', grams: 244 },     range: [0, 480, 20] },
  almondButter:{ name: 'Almond butter',           kcal: 614, p: 21,   f: 55.5, c: 18.8, unit: { label: 'tbsp', grams: 16 },     range: [0, 48, 4] },
  walnuts:    { name: 'Walnuts',                  kcal: 654, p: 15.2, f: 65.2, c: 13.7, unit: { label: 'oz', grams: 28 },       range: [0, 42, 3.5] },
  // Lunch & dinner proteins (cooked)
  chicken:    { name: 'Chicken breast (white meat)', kcal: 165, p: 31.0, f: 3.6,  c: 0, oz: true, yield: 0.75, range: [0, 340, 5] },
  thigh:      { name: 'Chicken thigh (dark meat)',   kcal: 179, p: 25.0, f: 8.2,  c: 0, oz: true, yield: 0.7,  range: [0, 340, 5] },
  beef:       { name: '95/5 ground beef',            kcal: 193, p: 29.2, f: 7.6,  c: 0, oz: true, yield: 0.72, range: [0, 340, 5] },
  steak:      { name: 'Sirloin steak',               kcal: 187, p: 29.5, f: 6.7,  c: 0, oz: true, yield: 0.75, range: [0, 340, 5] },
  // Farmed Atlantic carries about twice the fat of wild (USDA, cooked, dry heat).
  salmon:     { name: 'Farmed salmon (Atlantic)',    kcal: 206, p: 22.1, f: 12.4, c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  wildSalmon: { name: 'Wild salmon (sockeye)',       kcal: 156, p: 26.5, f: 5.6,  c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  cod:        { name: 'Cod',                         kcal: 105, p: 22.8, f: 0.9,  c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  // Canned light tuna in water, drained (USDA): one can = 3 oz (85 g) drained; steps of ½ can.
  tuna:       { name: 'Canned tuna (in water)',      kcal: 116, p: 25.5, f: 0.8,  c: 0, unit: { label: 'can', grams: 85 }, range: [0, 340, 42.5] },
  // Deli slices, ready to eat (USDA deli turkey / chicken breast; label values are similar). One slice ≈ ½ oz.
  turkeyDeli: { name: 'Smoked turkey breast (deli slices)', kcal: 104, p: 17.1, f: 1.7, c: 4.2, unit: { label: 'slice', grams: 14 }, range: [0, 280, 14] },
  chickenDeli:{ name: 'Chicken breast (deli slices)',       kcal: 90,  p: 17.0, f: 1.5, c: 2.5, unit: { label: 'slice', grams: 14 }, range: [0, 280, 14] },
  trout:      { name: 'Rainbow trout',               kcal: 168, p: 23.8, f: 7.4,  c: 0, oz: true, yield: 0.8,  range: [0, 340, 5] },
  // Lavash wrap (whole grain & flax): label per sheet (57 g) = 100 kcal, 6 g protein, 1 g fat, 19 g carbs; steps of ½ sheet.
  lavash:     { name: 'Lavash wrap',             kcal: 175.4, p: 10.53, f: 1.75, c: 33.33, unit: { label: 'sheet', grams: 57 }, range: [0, 228, 28.5] },
  // Sides (cooked)
  rice:       { name: 'White/jasmine rice',       kcal: 130, p: 2.7, f: 0.3,  c: 28.2, unit: { label: 'cup', grams: 158 }, raw: 2.8, range: [0, 450, 10] },
  brownRice:  { name: 'Brown rice',               kcal: 112, p: 2.3, f: 0.8,  c: 23.5, unit: { label: 'cup', grams: 195 }, raw: 2.6, range: [0, 450, 10] },
  sweetPotato:{ name: 'Sweet potato (baked)',     kcal: 90,  p: 2.0, f: 0.2,  c: 20.7, unit: { label: 'medium', grams: 150 }, raw: 0.8, range: [0, 600, 10] },
  potato:     { name: 'Potato (baked)',           kcal: 93,  p: 2.5, f: 0.1,  c: 21.2, unit: { label: 'medium', grams: 170 }, raw: 0.8, range: [0, 600, 10] },
  quinoa:     { name: 'Quinoa',                   kcal: 120, p: 4.4, f: 1.9,  c: 21.3, unit: { label: 'cup', grams: 185 }, raw: 2.75, range: [0, 450, 10] },
  veggies:    { name: 'Mixed veggies',            kcal: 35,  p: 2.5, f: 0.3,  c: 7.0,  unit: { label: 'cup', grams: 100 }, raw: 0.9, range: [0, 400, 25] },
  broccoli:   { name: 'Broccoli',                 kcal: 35,  p: 2.4, f: 0.4,  c: 7.2,  unit: { label: 'cup', grams: 156 }, raw: 0.9, range: [0, 400, 25] },
  salad:      { name: 'Salad (butter lettuce & cucumber)', kcal: 14, p: 1.0, f: 0.2, c: 2.9, unit: { label: 'bowl', grams: 150 }, range: [0, 400, 25] },
  cauliflower:{ name: 'Cauliflower',              kcal: 23,  p: 1.8, f: 0.5,  c: 4.1,  unit: { label: 'cup', grams: 124 }, raw: 0.9, range: [0, 400, 25] },
  oliveOil:   { name: 'Olive oil',                kcal: 884, p: 0,   f: 100,  c: 0,    unit: { label: 'tsp', grams: 4.5 }, range: [0, 31.5, 4.5] },
};

// Groups for the "add a food" picker when you build a meal yourself.
export const FOOD_GROUPS = {
  Protein: ['whey', 'eggWhites', 'egg', 'chicken', 'thigh', 'beef', 'steak', 'salmon', 'wildSalmon', 'cod', 'trout', 'tuna', 'turkeyDeli', 'chickenDeli', 'cheddar'],
  Carbs: ['oats', 'sourdough', 'wheatBread', 'lavash', 'rice', 'brownRice', 'sweetPotato', 'potato', 'quinoa', 'banana'],
  'Fruit & veg': ['frozenBerries', 'berries', 'strawberries', 'veggies', 'broccoli', 'cauliflower', 'salad'],
  Milk: ['oatMilk', 'almondMilk', 'milk2'],
  'Coffee shop': ['latte', 'cappuccino', 'icedLatte', 'cortado', 'flatWhite', 'oatLatte', 'mocha', 'chaiLatte', 'americano', 'espresso', 'dripCoffee', 'chocCookie'],
  Snacks: ['apple', 'banana', 'orange', 'pear', 'grapes', 'strawberries', 'berries', 'mixedNuts', 'cashews', 'almonds', 'greekYogurt'],
  'Bars & shakes': ['clifBar', 'clifBuilders', 'barebells', 'questBar', 'rxBar', 'kirklandBar', 'premierShake', 'corePower'],
  Fats: ['avocado', 'almondButter', 'pb', 'walnuts', 'butter', 'oliveOil'],
};

// Default protein rotation (one per day); every protein below can be picked.
export const PROTEINS = ['chicken', 'beef', 'salmon', 'cod', 'trout'];
const PROTEIN_OPTIONS = ['chicken', 'thigh', 'steak', 'beef', 'salmon', 'wildSalmon', 'cod', 'trout', 'tuna', 'turkeyDeli', 'chickenDeli'];

// Meal templates. Each item is a slot with swappable `options` (first = default).
// `drives` = the macro that slot is sized to hit; `fixed` = default grams for a fixed slot.
// `min`/`max` narrow the food's own range while auto-portioning.
export const BREAKFASTS = {
  eggs: {
    title: () => 'Eggs & toast',
    items: [
      { slot: 'eggs', options: ['egg'], fixedByFat: true, min: 50, max: 150 },
      { slot: 'protein', options: ['eggWhites'], drives: 'p' },
      { slot: 'carb', options: ['sourdough', 'wheatBread', 'lavash'], drives: 'c', min: 25 },
      { slot: 'fat', options: ['avocado', 'butter', 'cheddar', 'oliveOil', 'mixedNuts', 'cashews'], drives: 'f' },
    ],
  },
  oatmeal: {
    title: () => 'Oatmeal with whey protein',
    items: [
      { slot: 'protein', options: ['whey', 'eggWhites'], drives: 'p', min: 15, max: 60 },
      { slot: 'carb', options: ['oats'], drives: 'c', min: 40, max: 120 },
      { slot: 'fruit', options: ['berries', 'frozenBerries', 'strawberries', 'banana'], fixed: 75 },
      { slot: 'fat', options: ['pb', 'almondButter', 'walnuts', 'mixedNuts', 'cashews', 'avocado'], drives: 'f' },
    ],
  },
};

export const MAIN_MEAL = {
  title: (f) => `${FOODS[f.protein].name.replace(/ \(.*\)/, '')}, ${FOODS[f.carb].name.replace(/ \(.*\)/, '').toLowerCase()} & ${f.veggies && f.veggies !== 'veggies' ? FOODS[f.veggies].name.replace(/ \(.*\)/, '').toLowerCase() : 'veggies'}`,
  items: [
    { slot: 'protein', options: PROTEIN_OPTIONS, drives: 'p', min: 60, max: 260 },
    { slot: 'carb', options: ['rice', 'brownRice', 'sweetPotato', 'potato', 'quinoa', 'sourdough', 'lavash'], drives: 'c', max: 450 },
    { slot: 'veggies', options: ['veggies', 'broccoli', 'cauliflower', 'salad'], fixed: 200 },
    { slot: 'fat', options: ['oliveOil', 'butter', 'avocado', 'mixedNuts', 'cashews'], drives: 'f' },
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
  salmon:    { store: 'Costco',  tip: 'Kirkland farmed Atlantic salmon fillets', packGrams: 454, packLabel: 'lb' },
  wildSalmon:{ store: 'Costco',  tip: 'Kirkland frozen wild sockeye fillets (fresh at Sprouts in season)', packGrams: 454, packLabel: 'lb' },
  cod:       { store: 'Sprouts', tip: 'Seafood counter or frozen wild cod fillets (Safeway too)', packGrams: 454, packLabel: 'lb' },
  tuna:      { store: 'Costco',  tip: 'Kirkland or Wild Planet light tuna in water (3 oz drained per can)', packGrams: 85, packLabel: 'can' },
  turkeyDeli:  { store: 'Costco',  tip: 'Smoked or oven-roasted turkey breast, sliced (deli counter at Safeway / Sprouts too); low-sodium if you can', packGrams: 454, packLabel: 'lb' },
  chickenDeli: { store: 'Safeway', tip: 'Oven-roasted chicken breast deli slices (deli counter or pre-packed)', packGrams: 454, packLabel: 'lb' },
  trout:     { store: 'Sprouts', tip: 'Rainbow trout fillets at the seafood counter', packGrams: 454, packLabel: 'lb' },
  rice:      { store: 'Costco',  tip: 'Jasmine rice bag (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.8, packLabel: 'lb dry' },
  veggies:   { store: 'Costco',  tip: 'Frozen stir-fry / mixed vegetables; fresh at Sprouts', packGrams: 454, packLabel: 'lb' },
  broccoli:  { store: 'Costco',  tip: 'Kirkland frozen broccoli florets, or fresh crowns at Sprouts', packGrams: 454, packLabel: 'lb' },
  salad:       { store: 'Sprouts', tip: 'Butter lettuce (living heads or clamshell) + cucumbers — half and half by weight', packGrams: 454, packLabel: 'lb' },
  cauliflower:{ store: 'Sprouts', tip: 'Fresh cauliflower head or frozen florets (Costco, Safeway too)', packGrams: 454, packLabel: 'lb' },
  oliveOil:  { store: 'Costco',  tip: 'Kirkland extra virgin olive oil', packGrams: 1000, packLabel: 'bottle' },
  lavash:      { store: 'Sprouts', tip: 'Lavash flatbread (e.g. Atoria\'s whole grain & flax, ~100 kcal a sheet); Costco and Safeway carry it too', packGrams: 57 * 4, packLabel: 'pack of 4 sheets' },
  wheatBread:  { store: 'Safeway', tip: 'Whole-wheat sandwich bread', packGrams: 680, packLabel: '24 oz loaf' },
  butter:      { store: 'Costco',  tip: 'Kirkland butter (freeze extra sticks)', packGrams: 454, packLabel: '1 lb' },
  cheddar:     { store: 'Costco',  tip: 'Sharp cheddar block or shredded', packGrams: 907, packLabel: '2 lb' },
  frozenBerries:{ store: 'Costco', tip: 'Kirkland frozen organic mixed berries (unsweetened)', packGrams: 1810, packLabel: '4 lb bag' },
  strawberries:{ store: 'Sprouts', tip: 'Fresh or frozen strawberries', packGrams: 454, packLabel: '1 lb' },
  banana:      { store: 'Costco',  tip: 'Bananas (3 lb bunch)', packGrams: 1360, packLabel: 'bunch' },
  apple:       { store: 'Costco',  tip: 'Apples (bag)', packGrams: 182 * 8, packLabel: 'bag of ~8' },
  orange:      { store: 'Costco',  tip: 'Navel oranges or mandarins', packGrams: 131 * 8, packLabel: 'bag of ~8' },
  pear:        { store: 'Sprouts', tip: 'Pears', packGrams: 178 * 4, packLabel: '4 pears' },
  grapes:      { store: 'Costco',  tip: 'Seedless grapes', packGrams: 1360, packLabel: '3 lb clamshell' },
  mixedNuts:   { store: 'Costco',  tip: 'Kirkland unsalted mixed nuts', packGrams: 1130, packLabel: '2.5 lb jar' },
  cashews:     { store: 'Costco',  tip: 'Kirkland unsalted whole cashews', packGrams: 1130, packLabel: '2.5 lb bag' },
  almonds:     { store: 'Costco',  tip: 'Kirkland whole almonds', packGrams: 1360, packLabel: '3 lb bag' },
  greekYogurt: { store: 'Costco',  tip: 'Kirkland or Fage plain nonfat Greek yogurt', packGrams: 1360, packLabel: '48 oz tub' },
  oatMilk:     { store: 'Costco',  tip: 'Oatly or Califia oat milk (Costco multipacks)', packGrams: 1890, packLabel: 'half gallon' },
  almondMilk:  { store: 'Costco',  tip: 'Kirkland unsweetened almond milk', packGrams: 946, packLabel: 'quart' },
  milk2:       { store: 'Safeway', tip: '2% milk', packGrams: 1890, packLabel: 'half gallon' },
  almondButter:{ store: 'Costco',  tip: 'Kirkland almond butter', packGrams: 765, packLabel: '27 oz jar' },
  walnuts:     { store: 'Costco',  tip: 'Kirkland walnuts', packGrams: 1360, packLabel: '3 lb bag' },
  thigh:       { store: 'Costco',  tip: 'Kirkland boneless skinless chicken thighs', packGrams: 454, packLabel: 'lb' },
  steak:       { store: 'Costco',  tip: 'Top sirloin steaks (Safeway & Sprouts meat counters too)', packGrams: 454, packLabel: 'lb' },
  brownRice:   { store: 'Sprouts', tip: 'Bulk-bin brown rice (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.5, packLabel: 'lb dry' },
  sweetPotato: { store: 'Sprouts', tip: 'Sweet potatoes / yams', packGrams: 454, packLabel: 'lb' },
  potato:      { store: 'Safeway', tip: 'Russet or Yukon gold potatoes', packGrams: 454, packLabel: 'lb' },
  quinoa:      { store: 'Costco',  tip: 'Organic quinoa bag (1 cup dry ≈ 3 cups cooked)', packGrams: 454 * 2.7, packLabel: 'lb dry' },
};

// Foods you scanned (per 100 g), saved per profile and usable in any meal.
export function addScannedFoods(list) {
  const ids = Object.keys(list || {});
  Object.assign(FOODS, list);
  FOOD_GROUPS.Scanned = ids;
  if (!ids.length) delete FOOD_GROUPS.Scanned;
}
