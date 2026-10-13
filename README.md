# Lean Plate

A simple, phone-friendly diet app for sustainable weight loss.

- **Today** – daily calories and protein / fat / carb targets, split into breakfast, lunch and dinner with exact portion sizes (grams + oz / cups / slices / scoops). Tap **Swap** to rotate a meal.
  - Breakfast: eggs + sourdough + avocado, or oatmeal + whey protein
  - Lunch & dinner: chicken, 95/5 beef, salmon, cod or trout with rice and veggies
- **Weight** – log weigh-ins, see a 7-day-average trend chart. After 2 weeks of data it suggests a ±100 kcal tweak if you're losing slower or faster than planned.
- **Groceries** – a weekly list built from your plan, grouped by Costco / Sprouts / Safeway, with checkboxes.
- **Scan** – scan a barcode with your phone camera (or type it) to see macros from [Open Food Facts](https://world.openfoodfacts.org) and how well it fits your plan; add it to your grocery list.

## How targets are set

- Maintenance: Mifflin-St Jeor BMR × activity factor.
- Deficit: your chosen pace (0.5–1% of body weight per week, max 2 lb/week), never more than 25% below maintenance, with a 1200/1500 kcal floor.
- Protein ≈ 1 g per lb of goal weight; fat ≈ 27% of calories; carbs fill the rest.

This is general guidance, not medical advice — check with a doctor or dietitian if you have health conditions.

## Run it

No build step. Serve the folder over HTTP and open it:

```sh
npm start          # python3 -m http.server 8080 → http://localhost:8080
npm test           # unit tests for the planning math
```

The camera scanner needs **HTTPS** on a phone. The easiest way is GitHub Pages: repo **Settings → Pages → Deploy from branch** (root folder), then open the site on your phone and use **Add to Home Screen**.

All data stays in your browser's local storage.
