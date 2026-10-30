# Prompt: Meals you can plan, log and resize in one place (mockups first)

> Paste this into a development session. **Authorized by this prompt: M0 (mockups) only.** Build
> phases M1–M3 need the owner's OK after reviewing the mockups. Follow `CLAUDE.md` throughout.

## 1. What the owner asked for (2026-10-30)

> "When I describe a meal via Talk to Pawmily, it'll either plan it or plan and log it. Provide the
> two button options. Further, it should be easy to edit the meal right from the Health tab, where I
> can scroll the portion sizes to update the meal, without having to dig deep into the app."

Observed on the owner's phone: Talk → "log two eggs, a cup of egg whites, an avocado and a slice of
sourdough for lunch" → the **🎙️ Here's what I got** sheet (Lunch; Whole eggs 2 eggs 143 kcal, Egg
whites 1 cup 126 kcal, Avocado 1 avocado 181 kcal, Sourdough 1 slice 131 kcal; 581 kcal 47P 30C 31F)
with **✓ Log 581 kcal**, *Edit the numbers*, *Say it again*. After logging, changing a portion
meant **Health → Weight trend → the trackers' Meals tab → several more taps**.

## 2. What the code does today (verified in the repo, re-check before building)

| Where | Behaviour | Why it hurts |
| --- | --- | --- |
| `family/talk.js` `diet.log` card | Hands off to Meals' **Tell me** (`family/meals.js` `tellWith`) | One path only: log. No "plan it". |
| `family/meals.js` `drawEst` (estimate sheet) | Items can only be removed (×); amounts are fixed; *Edit the numbers* jumps to ✏️ Quick macros (`eedit` → `quickSheet`) and **loses the items** | Can't say "1½ avocado" or "half the bread" without retyping. |
| `family/meals.js` `logEstimate` | Logs the whole estimate as **one lump** (`prepared: { name, kcal, p, c, f }` via `D.logAs`), even when every item is a known food with grams (`js/foodText.js` `parseMeal` gives `food`, `grams`) | The logged meal has no foods → the meal sheet has no portion rows → editing means the trackers. |
| `family/meals.js` `mealSheet` | A **planned** meal already has per-food −/+ gram steppers (`g:meal:slot:±step`, typed grams), *Save changes* for a logged meal | Good. Reuse it, but the steps are small and it only works for plan-built meals. |
| `family/health.js` food row | "Lunch is next" is a button (opens `mealSheet`); once meals are logged it shows **"3 meals logged" as plain text**, with no way into each meal | Nowhere to tap to fix a logged meal from Health. |
| `js/dayPlan.js` | `planOf` already supports a day's custom meal from items (`custom.meals[meal].items` → `customMeal`), `logPlanned`, `setGrams`, `unlog` | The data model can already hold "this meal = these foods at these grams", planned or logged. |

**Root cause:** Tell me (and Talk) saves meals as numbers rather than foods. Fix the data first, then the
screens are simple.

## 3. Goals

1. **Two clear choices after describing a meal:** **Plan it** (it becomes that meal's plan for today, and
   the rest of the day re-balances) and **Plan & log** (planned and marked eaten now). One tap each.
2. **Resize any meal in place:** each food has a portion control you can drag or scroll, with live
   totals and what's left for the day. It works the same for planned meals, logged meals and Tell me
   estimates.
3. **Every meal reachable from Health in one tap:** Breakfast, Lunch, Snack and Dinner rows on Health's
   Today card, each showing planned or ✓ logged, kcal and protein. Tapping one opens the same meal sheet.
4. Nothing hidden behind "Weight trend" or the trackers for everyday edits. The trackers keep the deep
   tools (swap foods, combos, templates).

## 4. Non-goals and constraints

- No new AI calls. Tell me already reads text on the phone, with Claude only as the fallback
  (`diet.text`). Resizing is done entirely on the phone.
- Don't change encryption, keys, sign-in or the write path (`editMine` → `commit` stays).
- Keep the five tabs. Don't add a new tab or a new kind of record.
- Old lump-sum meals (`prepared`, `eatout`, Quick macros) stay valid and editable as whole servings.
- Follow the doc rules in `CLAUDE.md`: Sam and Pat in examples, no names or secrets.

## 5. Proposed design (to mock up, then judge)

### 5a. Talk → meal card with two buttons
- Talk's `diet.log` step shows a meal card (not a hand-off). It has:
  - the meal slot as a chip you can change (Breakfast, Lunch, Snack or Dinner; the default is what was
    said, else the next meal);
  - the item list with portion controls (as in 5c);
  - live totals, plus "after this: ~X kcal, Y g protein left today".
- Two buttons of equal weight: **Plan it** (secondary) and **✓ Plan & log** (primary, the default when
  they said "I had…" or "log…"). Undo on both.
- The wording decides which is primary: "I'm having / I'll have / plan" makes Plan it primary; "I had /
  ate / log" makes Plan & log primary.
- If that slot is already logged, show "Replace logged lunch?" with **Replace** and **Add as extra**.

### 5b. Saving as foods, not a lump
- If every item is a known food (`food` + `grams`), save the meal as today's custom meal
  `{ items: [{ food, grams }] }`. **Plan & log** is then `logPlanned`.
- If an item couldn't be matched, or Claude read it (kcal only), keep it as an item with
  `servings: 1` and per-serving macros. Its control scales servings (¼ steps), not grams.
- Find out whether `customMeal` can hold a non-food line or whether a small `extraItems` field is
  needed. Propose the smallest change in `js/dayPlan.js`, with tests.

### 5c. The portion control (the main new interaction)
- Each food row has its name, the amount in the food's own unit where there is one ("2 eggs", "1½
  slices", "180 g"), and the row's kcal and protein.
- Under it, a **horizontal snap-scroll ruler**:
  - CSS `scroll-snap`, ticks at the food's natural step (1 egg, ½ slice, 10 g, ¼ avocado);
  - the current amount is centred; flick to change it;
  - totals update live, without a network call.
- Also keep **− / +** buttons (for accessibility and precise taps) and **tap the amount to type it**.
- Quick chips: **½× · 1× · 1½× · 2×** for the whole meal.
- Accessibility:
  - the ruler is `role="slider"` with `aria-valuetext` ("2 eggs, 143 calories");
  - arrow keys step it;
  - targets are at least 44 px;
  - with reduced motion, there's no momentum animation.
- Find out whether one ruler at a time (expanding the row you tap) reads better than all rows open.
  Mock both.

### 5d. Health → Today: every meal one tap away
- Replace the single "N meals logged" / "Lunch is next" line with a compact meal list inside Today's food
  row:
  - `Breakfast ✓ 581 kcal · 47 g P` / `Lunch · planned 598 kcal` / `Dinner · planned 691 kcal`;
  - the next meal is highlighted;
  - a footer with what's left.
- Tapping a meal opens `mealSheet` with the 5c controls.
- A logged meal shows **Save changes** (only enabled once something changed), and **Unlog** stays
  under More.
- The ✓ As planned, 📷 Photo, 🎙️ Tell me and 🍴 Ate out quick actions stay where they are.

### 5e. Logged lump meals (legacy, Quick macros, eat-out)
- These show one "serving" ruler (¼ to 3 servings) and a *Break into foods* link that opens Tell me
  pre-filled with the meal's name.

## 6. M0 deliverables: mockups (stop for review)

- Make static mockups with the repo's mockup setup, like `docs/mockups/talk/*.mjs`: real app CSS, a
  synthetic family, Playwright screenshots at **390 px, 320 px and dark mode**.
- Put them in `docs/mockups/meals/`, with `CHECKPOINT_M0.md` explaining each screen and the open choices.
1. Talk → meal card, with **Plan it** / **✓ Plan & log** (an "I had…" phrasing and an "I'll have…"
   phrasing).
2. The same card with one row's ruler open, mid-scroll, and live totals.
3. The slot already logged: Replace / Add as extra.
4. An unmatched or Claude-read item shown with a servings ruler.
5. Health Today with the meal list: morning (nothing logged), midday (breakfast ✓), evening (all ✓).
6. Tap a logged meal → the meal sheet with rulers and Save changes, at both rest and edited states.
7. A legacy lump meal with the servings ruler and *Break into foods*.
8. The two ruler layouts compared: one row open at a time, and all rows open.
9. States: loading, the family key locked on this device, offline (changes queued or blocked, as today),
   an error, and an empty plan (no Diet set up).
- Check each screen: no horizontal page scroll at 320 px; tap targets ≥ 44 px; contrast in dark mode;
  keyboard and screen-reader labels written down.
- **Stop after M0** and report the screenshots and the open questions (section 9).

## 7. Build phases after approval (not authorized by this prompt)

- **M1 – data:**
  - save Tell me and Talk meals as foods (5b);
  - "Plan it" writes today's custom meal, "Plan & log" adds `logPlanned`;
  - Undo for both;
  - tests in `tests/` for the custom-items meal, scaling, replace versus extra, and legacy lumps staying
    valid.
- **M2 – controls:**
  - the ruler component (shared by the estimate sheet, the meal sheet and the Talk card);
  - live totals and what's left;
  - accessibility as in 5c.
- **M3 – Health and Talk:**
  - the meal list on Health Today;
  - the Talk meal card with two buttons;
  - re-use `mealSheet` everywhere.
- **For every build phase:**
  - follow `CLAUDE.md`: `node scripts/bump-version.mjs`, bump `app.js?v=` and `style.css?v=`, run
    `npm test`;
  - check the performance budget before and after (`scripts/perf/budget.mjs`);
  - update docs (README, help guide, tour `WHATS_NEW`, ARCHITECTURE, BUILD_PROGRESS);
  - verify in the browser at 390 px, 320 px and dark mode;
  - work on a branch and open a PR, with no merge to `main` without approval.

## 8. Acceptance criteria

- Talk to a logged meal takes ≤ 2 taps after speaking: the card, then ✓ Plan & log. Talk to a planned
  meal also takes ≤ 2 taps.
- From Health, changing a logged meal's portion takes ≤ 3 taps or gestures: tap the meal, scroll the
  ruler, Save. It never goes through Weight trend or the trackers.
- After saving, the totals, what's left and the rest of the day's plan update at once, and they match
  what the trackers' Today's plan shows (one source: `js/dayPlan.js`).
- Meals logged before the change still open and can be edited as servings.
- Nothing extra goes to Claude or any third party. Food data stays locked with the family key as today.
- No startup cost: the meal code stays lazy-loaded (`meals()`), and Health's first paint stays within
  budget.

## 9. Questions for the owner (put them in CHECKPOINT_M0.md with a recommendation)

1. **Ruler or wheel?** A horizontal snap ruler (recommended: it works well on the web and at 320 px)
   versus an iOS-style vertical wheel.
2. **One row's ruler open at a time** (recommended: calmer) **or all open?**
3. **Default button** when the wording is unclear: Plan & log (recommended, since most Talk meals
   are things already eaten) or Plan it?
4. **Should "Plan it" also offer tomorrow** ("Plan for tomorrow's breakfast")? Recommendation: not in
   this round.
5. **Partner meals:** when Diet is shared, should a planned meal ever be offered to the partner?
   Recommendation: no. Under Talk's shared-person rule, this would be a proposal (T2), not part of this
   work.
