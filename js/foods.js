// Macros per 100 g as weighed: oats dry, everything cooked (USDA FoodData Central).
// `unit` lets the UI show a friendlier amount next to grams.
// `yield` = cooked weight / raw weight, used to turn cooked portions into a raw shopping amount.
export const FOODS = {
  egg:        { name: 'Whole eggs',            kcal: 143, p: 12.6, f: 9.5,  c: 0.7,  unit: { label: 'egg', grams: 50 } },
  eggWhites:  { name: 'Egg whites (cooked)',     kcal: 52,  p: 10.9, f: 0.2,  c: 0.7,  unit: { label: 'cup', grams: 243 } },
  sourdough:  { name: 'Sourdough bread',       kcal: 272, p: 10.8, f: 2.4,  c: 51.9, unit: { label: 'slice', grams: 50 } },
  avocado:    { name: 'Avocado',               kcal: 160, p: 2.0,  f: 14.7, c: 8.5,  unit: { label: 'avocado', grams: 136 } },
  oats:       { name: 'Rolled oats (dry)',     kcal: 379, p: 13.2, f: 6.5,  c: 67.7, unit: { label: 'cup', grams: 80 } },
  whey:       { name: 'Whey protein',          kcal: 400, p: 80,   f: 5,    c: 10,   unit: { label: 'scoop', grams: 30 } },
  berries:    { name: 'Blueberries',           kcal: 57,  p: 0.7,  f: 0.3,  c: 14.5, unit: { label: 'cup', grams: 148 } },
  pb:         { name: 'Peanut butter',         kcal: 588, p: 25,   f: 50,   c: 20,   unit: { label: 'tbsp', grams: 16 } },
  chicken:    { name: 'Chicken breast (cooked)',  kcal: 165, p: 31.0, f: 3.6,  c: 0, oz: true, yield: 0.75 },
  beef:       { name: '95/5 ground beef (cooked)',kcal: 193, p: 29.2, f: 7.6,  c: 0, oz: true, yield: 0.72 },
  salmon:     { name: 'Salmon (cooked)',          kcal: 206, p: 22.1, f: 12.4, c: 0, oz: true, yield: 0.8 },
  cod:        { name: 'Cod (cooked)',             kcal: 105, p: 22.8, f: 0.9,  c: 0, oz: true, yield: 0.8 },
  trout:      { name: 'Rainbow trout (cooked)',   kcal: 168, p: 23.8, f: 7.4,  c: 0, oz: true, yield: 0.8 },
  rice:       { name: 'White/jasmine rice (cooked)', kcal: 130, p: 2.7, f: 0.3, c: 28.2, unit: { label: 'cup', grams: 158 } },
  veggies:    { name: 'Mixed veggies (cooked)',         kcal: 35,  p: 2.5,  f: 0.3,  c: 7.0,  unit: { label: 'cup', grams: 100 } },
  oliveOil:   { name: 'Olive oil',             kcal: 884, p: 0,    f: 100,  c: 0,    unit: { label: 'tsp', grams: 4.5 } },
};

export const PROTEINS = ['chicken', 'beef', 'salmon', 'cod', 'trout'];

// Meal templates. `drives` = the macro a flexible food is sized to hit.
// Fixed foods have a set gram amount. min/max/step are in grams.
export const BREAKFASTS = {
  eggs: {
    title: 'Eggs, sourdough & avocado',
    items: [
      { food: 'egg', fixedByFat: true, step: 50, min: 100, max: 150 },
      { food: 'eggWhites', drives: 'p', step: 25, min: 0, max: 300 },
      { food: 'sourdough', drives: 'c', step: 25, min: 25, max: 150 },
      { food: 'avocado', drives: 'f', step: 10, min: 0, max: 140 },
    ],
  },
  oatmeal: {
    title: 'Oatmeal with whey protein',
    items: [
      { food: 'whey', drives: 'p', step: 15, min: 15, max: 60 },
      { food: 'oats', drives: 'c', step: 10, min: 40, max: 120 },
      { food: 'berries', fixed: 75 },
      { food: 'pb', drives: 'f', step: 8, min: 0, max: 32 },
    ],
  },
};

export function mainMeal(protein) {
  return {
    title: `${FOODS[protein].name.replace(' (cooked)', '')}, rice & veggies`,
    items: [
      { food: protein, drives: 'p', step: 5, min: 65, max: 260 },
      { food: 'rice', drives: 'c', step: 10, min: 0, max: 400 },
      { food: 'veggies', fixed: 200 },
      { food: 'oliveOil', drives: 'f', step: 4.5, min: 0, max: 27 },
    ],
  };
}

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
};
