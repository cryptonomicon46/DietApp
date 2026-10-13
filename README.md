# Lean Plate

A simple, phone-friendly diet app for sustainable weight loss.

- **Today** – daily calories and protein / fat / carb targets, split into breakfast, lunch and dinner with exact portion sizes (grams + oz / cups / slices / scoops). Oats are weighed dry; meat, fish, eggs, rice and veggies are weighed cooked. The grocery list converts back to raw amounts to buy. Every item has a swap menu and a portion slider: pick almond butter instead of peanut butter, butter instead of avocado, steak / chicken thigh (dark) / breast (white) / ground beef / fish, sweet potato instead of rice, and drag a slider to set an amount yourself; the rest of the meal re-balances to stay on target. Swaps (except the day's protein) are remembered.
  - Breakfast: eggs + sourdough + avocado, or oatmeal + whey protein
  - Lunch & dinner: chicken, 95/5 beef, salmon, cod or trout with rice and veggies
- **Weekly check-in** – once a week the app greets you by name, asks how the week went (great / okay / hungry / low energy / hard to stick to), shows your week-over-week weight change, and offers macro changes (−100, −200, +100, +200 kcal, more protein, more carbs, or a custom P/F/C change) with one suggested from your trend and feedback.
- **Weight** – log weigh-ins, see a 7-day-average trend chart. After 2 weeks of data it suggests a ±100 kcal tweak if you're losing slower or faster than planned.
- **Groceries** – a weekly list built from your plan, grouped by Costco / Sprouts / Safeway, with checkboxes.
- **Training** (on Today) – workouts from **WHOOP** and **Garmin** (or a session you plan) add calories back as carbs. Planned cardio of 45+ minutes gets an **intra-workout carb** target (e.g. ~60 g/h for a 2-hour hard session) with banana / sports drink / gel / date options, taken out of your meals.
- **Science** – every number links to the peer-reviewed paper it comes from.
- **Scan** – scan a barcode with your phone camera (or type it) to see macros from [Open Food Facts](https://world.openfoodfacts.org) and how well it fits your plan; add it to your grocery list.

## How targets are set

- Maintenance: Mifflin-St Jeor BMR × activity factor.
- Deficit: your chosen pace (0.5–1% of body weight per week, max 2 lb/week), never more than 25% below maintenance, with a 1200/1500 kcal floor.
- Protein ≈ 1 g per lb of goal weight; fat ≈ 27% of calories; carbs fill the rest.

- Training days (when Profile → Activity is "Count my workouts"): base = BMR × 1.3 for everyday life, plus 75% of each workout's net calories, all added as carbs. Intra-workout carbs: <45 min none; ~1 h small amounts; 1–2.5 h 30–60 g/h; >2.5 h up to 90 g/h.

### Sources

| Setting | Paper |
|---|---|
| 0.5–1%/wk loss; protein, fat 15–30%, carbs | Helms, Aragon & Fitschen 2014, *JISSN* 11:20 — [doi](https://doi.org/10.1186/1550-2783-11-20) |
| Slower loss keeps more lean mass | Garthe et al. 2011, *IJSNEM* 21(2):97–104 |
| Protein ≥1.6 g/kg | Morton et al. 2018, *Br J Sports Med* 52:376 — [doi](https://doi.org/10.1136/bjsports-2017-097608) |
| Protein in a deficit | Jäger et al. 2017 ISSN position stand, *JISSN* 14:20 — [doi](https://doi.org/10.1186/s12970-017-0177-8) |
| Protein per meal | Schoenfeld & Aragon 2018, *JISSN* 15:10 — [doi](https://doi.org/10.1186/s12970-018-0215-1) |
| BMR equation | Mifflin et al. 1990, *Am J Clin Nutr* 51:241 — [doi](https://doi.org/10.1093/ajcn/51.2.241) |
| Carbs follow training load | Thomas, Erdman & Burke 2016, *Med Sci Sports Exerc* 48:543 — [doi](https://doi.org/10.1249/MSS.0000000000000852) |
| Intra-workout carbs | Jeukendrup 2014, *Sports Med* 44(S1):S25 — [doi](https://doi.org/10.1007/s40279-014-0148-z) |
| Wearable calorie error 27–93% | Shcherbina et al. 2017, *J Pers Med* 7:3 — [doi](https://doi.org/10.3390/jpm7020003) |
| MET values for planned sessions | Ainsworth et al. 2011, *Med Sci Sports Exerc* 43:1575 — [doi](https://doi.org/10.1249/MSS.0b013e31821ece12) |

## WHOOP & Garmin

- **Garmin CSV import** works with no setup: Garmin Connect → Activities → Export CSV → Lean Plate → Devices → Import.
- **Automatic sync** for WHOOP and Garmin (through Strava, since Garmin's own API is limited to approved businesses) needs a small free connector — see [`server/README.md`](server/README.md).

This is general guidance, not medical advice — check with a doctor or dietitian if you have health conditions.

## Run it

No build step. Serve the folder over HTTP and open it:

```sh
npm start          # python3 -m http.server 8080 → http://localhost:8080
npm test           # unit tests for the planning math
```

The camera scanner needs **HTTPS** on a phone. The easiest way is GitHub Pages: repo **Settings → Pages → Deploy from branch** (root folder), then open the site on your phone and use **Add to Home Screen**.

All data stays in your browser's local storage.
