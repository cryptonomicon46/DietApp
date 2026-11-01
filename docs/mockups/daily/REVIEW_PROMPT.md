# Design review prompt: OurPawmily Daily Health + Talk UX, with meal logging

> **How to use this file:** upload or paste the whole file into a new GPT conversation. It is
> self-contained. It is **DESIGN ONLY**: nothing here is built. Implementation starts only after the
> owner approves a revised design.
>
> **Names:** examples use **Sam** and **Pat** (the two adults), following the repository's naming rule.
>
> **Screens:** the 390 px mockups (`docs/mockups/daily/out/*.png`) can be attached alongside this file.
> Only the meal-logging changes in Part H don't have mockups yet.

---

## Part A: Instructions for the reviewer

You are reviewing a set of everyday-use improvements to a small private family health app. Act as a
senior mobile product designer and engineer who is strict about:
- **simplicity** (fewer concepts, one obvious action);
- **honest data** (never claim what the data can't support);
- **privacy**;
- **not breaking what already works.**

**What to do:**
1. Read Parts B–H.
2. Find what is **wrong, risky, missing, inconsistent, or more complicated than it needs to be**.
3. Answer every numbered question in Part J.
4. Propose concrete changes (wording, layout order, rules, thresholds, data fields), not general advice.

**Rules for the review:**
- **Respect the fixed constraints in B3.** If you think one is wrong, say so separately.
- **Prefer reusing what exists (B4) over new screens or concepts.** Don't propose new tabs.
- **Don't invent platform capabilities.** Where browser behaviour (speech recognition on iPhone, for
  example) is uncertain, say what to verify on a device and what to fall back to.
- **Every number shown to the user must come from deterministic code, not from an AI.**

**Required output format:**
1. **Verdict:** Approve / Approve with changes / Rework, plus one paragraph.
2. **Blocking issues:** numbered. For each give severity (critical / high / medium), the part, a concrete
   failure scenario, and the fix.
3. **Answers to Part J**, numbered to match.
4. **What to cut or defer**, to keep the build small and safe.
5. **Missing states, edge cases and tests.**
6. **Wording:** labels or messages you would change, and the replacement text.

---

## Part B: Context

### B1. The product

OurPawmily is a private family web app (installable on iPhone) for one household of two adults. It has
five tabs: **Home · Us · Calendar · Threads · Health**.

**Health** is each person's daily command centre. It shows, in this order:
1. **Today:** weight, the next meal, and today's workout.
2. **The WHOOP card:** Sleep, Recovery and Strain rings.
3. Nutrition and plan.
4. More.

**Talk to Pawmily** (a gold button on Home, a floating button elsewhere) is a voice-and-text command
bar. It can:
- log meals, weight, workouts and chores;
- add shows and books;
- answer questions about the day from the calendar.

It always shows a card and waits for a tap before changing anything.

### B2. Technical setup

- **Front end:** a web app on GitHub Pages. Merging to `main` deploys it.
- **Back end:** one Cloudflare Worker, deployed by hand by the owner.
- **Health data is end-to-end encrypted.** It is sealed on the phones with a family key; the server
  stores ciphertext.
- **Each person's Diet data** (profile, weights, meal log, the meal plan's edits, saved meal combos,
  saved packaged foods, preferences) is a private, separately sealed part. Others can read it only if
  that person shares Diet with them.
- **WHOOP is connected per phone.**
  - The sign-in and WHOOP's Recovery and Sleep data live only on that phone (localStorage) and are
    shared with nobody.
  - Workouts and daily calorie burn go into the person's Fitness data.
- **An AI gateway** on the Worker sends only allowlisted fields to Claude, with a purpose, a daily
  limit, and an audit line that never records values.
  - Meal text and meal photos are estimated through it today.
  - The phone tries its own food parser first.

### B3. Fixed constraints (do not design around these)

1. **Five tabs only.** No WHOOP, Insights or Talk tab.
2. **Nothing changes data without an explicit confirmation.** Finishing speech is never permission to
   write.
3. **No duplicate sources of truth.** Home and Health render the same WHOOP component from the same
   data; manual sync uses the existing sync pipeline.
4. **Privacy:**
   - Recovery and Sleep stay private to the person.
   - Health statistics are worked out on the phone.
   - If an AI phrases an answer, it gets aggregates only, never raw meals, workouts or weights.
5. **Only WHOOP's official public API.** No private endpoints, scraping or copied app credentials.
6. **Encryption, keys, sign-in and invite security are not changed.**
7. **Home's first paint must not wait for WHOOP or any network call.** Performance is measured before
   and after.

### B4. What already exists (verified in the code)

- **WHOOP card:** one pure function that renders the card (rings in WHOOP's colours, "your usual"
  range, a one-line interpretation, *Last 7 days ›*, tap a ring for details). It is used only in Health
  today.
- **WHOOP sync, three separate paths:**
  - auto when Health opens (at most every 20 minutes): pull the account copy, then fetch 3 days of
    workouts, cycles, recovery and sleep, then save the account copy;
  - every 5 minutes while Health is on screen: today only, 2 WHOOP requests, kept on the phone;
  - **Sync now** in Health › Devices.
- **Gaps in that sync:**
  - The three paths don't share an in-flight guard, so parallel syncs are possible.
  - There is no "synced but no newer data" result.
  - Rate-limit responses (429) aren't handled specially.
- **Talk listening:**
  - The browser's speech recognition runs in single-utterance mode (`continuous = false`).
  - Talk submits the moment the browser ends the session, which is often at the first natural pause.
  - A **Done** button exists but usually comes too late.
- **Talk's meal and workout flows** hand off to their own screens: meals to an estimate sheet with
  **✓ Plan & log**, workouts to the workout editor with **Save**. No Talk path writes without a tap
  today. Missing:
  - review inside Talk;
  - spoken corrections;
  - spoken confirmation.
- **The meal sheet** (tap Breakfast in Health) shows:
  - the planned meal ("Eggs & toast · planned");
  - each food with − / grams / + and a slider;
  - **✓ Log as planned** and **＋ Something else**;
  - a **More** menu (Same as yesterday, Quick macros, Packaged, Drinks, Low-carb today).
- **"Something else"** opens a list: Say what you had (Talk), From a photo, Ate out, Packaged, plus
  Same as yesterday, Drinks and Low-carb today.
- **The older tracker screen (Today's plan) already has features the meal sheet lacks:**
  - a **saved-combo picker** (this meal's combos first, then other meals', then the partner's);
  - **⚡ Quick swap: bar or shake** (protein bars and shakes from the food list);
  - **☆ Save combo**;
  - **⚖️ Fit to N kcal**, which scales every food uniformly to the meal's target.
- **Meal templates:**
  - Breakfast rotates daily between **Eggs & toast** and **Oatmeal with whey**.
  - Lunch and dinner use a protein + carb + veg + fat template.
  - Templates auto-size each slot to the meal's protein, carb and fat target.
  - There is no smoothie template, though the food list has whey, berries, banana, almond milk, oat
    milk and peanut butter.
- **Ate out:**
  - pick the closest dish from 12 typical restaurant plates;
  - portion size and how much you ate;
  - or enter calories from a menu;
  - drinks are a separate sheet (wine, beer and cocktails per serving; alcohol counts in calories,
    not protein, carbs or fat).
- **Packaged:**
  - name, protein/carbs/fat/calories, servings, "save for next time";
  - snap the label (AI reads it);
  - saved packaged foods appear as small links.
- **Logged meals** keep a title, kcal, protein/carbs/fat, the target, the foods and the time. They keep
  **no source field**: whether a meal was eaten out, a combo or packaged is only hinted at by the title.

---

## Part C: Home WHOOP card + SYNC WHOOP

1. **Shared component.**
   - Move the WHOOP card's rendering code, verbatim, into one module that Health and Home both import.
   - One function builds the card's data model for both.
   - Any future change to the card shows in both places automatically.
2. **Home order:**

   ```
   greeting
   Talk to Pawmily
   WHOOP card
   SYNC WHOOP + "Last synced 7:12 AM · Sleep ended 6:41 AM"
   ✨ Next up
   Look
   needs-attention (requests, today's appointments)
   groceries
   …
   ```

   The card is shown only on a phone where WHOOP is connected.
3. **First paint:**
   - Home reserves the card's height (no layout shift) and paints.
   - Then it lazily loads about 12 KB (gzipped) and fills the card from the phone's cache.
   - It never waits for WHOOP.
   - Proposed: the same 20-minute auto-sync as Health, run after paint.
4. **One sync controller** used by Health's auto-sync and 5-minute refresh, Home's button and Devices ›
   Sync now:
   - A call while a sync runs gets the same promise, so double taps can't start parallel syncs.
   - A manual tap within 60 s of the last full sync asks WHOOP for today only (2 requests).
   - Otherwise it runs the existing 3-day incremental sync.
   - A 429 starts a 2-minute cool-down.
   - Old values stay visible throughout.
   - On success both cards re-render in place, with no page reload.
5. **Button states:**

   | State | What you see |
   | --- | --- |
   | Ready | **SYNC WHOOP** |
   | Syncing | **SYNCING WHOOP…**, spinner, disabled |
   | Updated | "✓ WHOOP updated" |
   | Nothing new | "WHOOP synced — no newer data yet" (never shown as a failure) |
   | Just synced | "Up to date — synced a moment ago" |
   | Couldn't reach | "Couldn't sync WHOOP — showing what you had", **Try again** |
   | Reconnect | "WHOOP needs to reconnect", **Reconnect WHOOP** |

   "Nothing new" is decided by a before/after fingerprint of today's recovery, sleep and cycle states
   and scores, plus today's WHOOP workout ids.
6. **Times shown:**
   - "Last synced" is when Pawmily last finished a sync.
   - "Sleep ended" is WHOOP's own sleep record.
   - "Recovery scored 6:41 AM" would need WHOOP's recovery `updated_at`, which isn't kept today. Keeping
     it is a small, additive change, pending the owner's OK.
   - **Stale:** if the last sync was before today's midnight or more than 6 h ago, a one-line notice
     appears above the card.
7. **Battery and charging:** WHOOP's public v2 API has no battery or charging endpoints (checked
   through secondary sources; WHOOP's developer site wasn't reachable from the design session).
   Omitted, and documented.

## Part D: Talk listening

A pure state machine (testable with a fake recogniser):

```
idle → listening ⇄ pausing → finishing → understanding → review | answer
          └→ restarting (the browser ended on its own) → listening
cancel / type instead → idle (nothing kept)
```

**Recognition and transcript:**
- `continuous = true`, `interimResults = true`.
- Final segments are appended exactly once, keyed by session and result index.
- Interim text is replaced on every event.
- An overlap guard covers engines that resend everything heard so far as one "final".

**Pauses:**

| Silence | What happens |
| --- | --- |
| Under 1.2 s | Nothing |
| 1.2–2.5 s | "Still listening… keep talking to add more", with a bar running down. Speaking resets it. |
| About 2.5 s (tunable 1.5–3.0 on the owner's iPhone) | Finish |

**Endings and limits:**
- No words at all for 8 s: "I didn't hear anything".
- 90 s in total: finish.
- The browser ends the session on its own: restart within about 250 ms and keep the text.
- iPhone refuses the restart without a tap: show the transcript with **Keep talking** and **Done**.

**Controls:** a big **Done** button, plus **Cancel** and **Type instead**.

## Part E: Review before write (Talk)

**A "proposal" is held in memory only:**

```
{ id, kind: 'meal' | 'workout', payload, version, expiresAt (+10 min), state }
```

**The meal card ("Here's what I heard · not logged yet"):**
- items with amounts and kcal;
- kcal, protein, carbs and fat totals;
- "Does this look right?";
- **✓ Log meal** · **✏️ Edit** · **🎤 Change** · **Cancel**.

**The workout card:**
- blocks, including supersets with rounds;
- an estimated time;
- **✓ Create workout** · Edit · 🎤 Change · Cancel.

**🎤 Change** listens for that card only:
- **Confirm** phrases ("yes", "log it", "looks good") commit the card.
- **Cancel** phrases cancel it.
- **Anything else is a correction:**
  1. First a phone-side amendment reader: "make the rice half a cup", "remove the salsa", "add a
     coffee", "it was dinner", "make it 4 sets".
  2. Otherwise the original words plus the correction are re-read with the existing AI endpoints, with
     no server change.
  3. The result is a new version, with the changed rows highlighted.

**Exactly once:**
- The button and the voice call the same `commit(id, version)`. It acts only from draft with the current
  version.
- A repeat call returns the same result.
- An expired card can't commit.
- A "yes" when no card is on screen answers "There's nothing waiting to confirm."

**The editors:**
- **Edit** opens the existing meal sheet (Part H) or the workout editor with the draft.
- The write uses each area's existing save path, with Undo.

**Questions are answered directly**, with no confirmation step.

## Part F: HealthInsights (deterministic statistics)

A pure module on the phone. AI never does the arithmetic.

- **Periods:** today, last 3 / 7 / 14 / 30 days (complete days before today), this week, last week.
  Weeks run Monday to Sunday, in local calendar days.
- **Meal logging coverage:**
  - Main meals logged ÷ expected main meals.
  - Expected is 3 a day, or the number of main meals actually logged if the person tapped "Done
    logging today" (a deliberately skipped meal isn't a miss).
  - Reported alongside: meals logged (including snacks), days with any logging, and complete days.
  - The sentences are factual: "You logged 14 of 21 main meals across 5 of the last 7 days."
- **Qualified ("well-logged") nutrition day:**
  - The person tapped "Done logging today", **or** all three main meals are logged.
  - Then the day is counted below target (eaten < that day's stored target) or at/above target.
  - Days that are logged but not qualified are "unclassified", never "below target".
  - This is stricter than the app's existing on-target dots (3 meals **or** ≥ 60% of target), which stay
    as they are.
- **Training:**
  - Strength sessions and planned vs completed lifts (the lifting program is 3 a week).
  - Runs, rides and climbs, with minutes and distance; workout days and rest days.
  - Built from exactly the list Fitness shows, which already deduplicates WHOOP workouts matched to
    logged ones.
  - Dated by the workout's own timezone.
  - Climbs counted once per day.
  - Light items (walks, stretching, under 20 min) reported separately.
- **Weight:** latest, recent average, previous-period average, change, and weigh-in count. It reuses the
  existing week-over-week code. There is never a trend from a single weigh-in.
- **WHOOP:** average Recovery, Sleep performance and Strain, from the same WHOOP data.
- **Confidence** per area:

  | Level | Rule |
  | --- | --- |
  | Strong | ≥ 70% of days qualified (food), ≥ 3 weigh-ins (weight), ≥ 5 scored WHOOP days |
  | Partial | In between |
  | Insufficient | Below that. The answer says so plainly instead of stating the number. |

- **Comparison:** last 7 complete days vs the 7 before. Only differences above a threshold are
  reported, for example:
  - logging coverage ≥ 15 points;
  - at least one session;
  - weight average ≥ 0.5 lb;
  - Recovery average ≥ 8.
- **Talk routing:** a new phone-side `health.ask` step, checked **before** the existing "question about
  the day" check (which today grabs "how many meals…" and asks for calendar consent).
- **Answers:** deterministic sentences plus a few supporting facts, for example "How did I do this
  week?" in the mockup.
- **Wording:** "The records show…", "This coincided with…", never "caused".
- **Open "why" questions:**
  - Without AI, they get the biggest differences in plain sentences.
  - Optional AI phrasing would send aggregates only, through a new gateway purpose. That needs a server
    deploy and is pending the owner's OK.

## Part G: Navigation and privacy summary

- **No new tabs.** Everything lives in Home, Health and Talk.
- **Nothing new leaves the phone,** except the optional AI phrasing (aggregates only) and corrections
  re-read by the existing meal and workout AI endpoints (the same text those features send today).
- **Proposals are never stored or sent.**

## Part H: Meal logging redesign (new)

The owner's request, in short:

> In the Breakfast sheet the top-right says "planned"; it should be a dropdown of planned + saved
> breakfast combos. After picking one I can still adjust the foods with the sliders. Add "Fit to XX
> calories": a box pre-filled (e.g. 500) with up/down arrows, so one person can fit to 300 and the other
> to 400. Let me switch to a protein bar or a smoothie. Make Packaged prominent. "Something else" should
> become "Ate out", where I can take a photo of the meal, log alcohol, and speak a description.

### H1. Proposed meal sheet (Breakfast)

```
Breakfast                                   [ Eggs & toast · planned ▾ ]   ✕
367 kcal · 38 P · 27 C · 11 F        You have ~1,511 kcal and ~156 g protein left today.
Fit to  [ − ]  [ 367 ] kcal  [ + ]                          (planned 367)
Whole eggs         − [ 50 ] g +    ───●──────   1 egg
Egg whites         − [240 ] g +    ───────●──   ¾ cup
Sourdough bread    − [ 50 ] g +    ───●──────   1 slice
Avocado            − [ 30 ] g +    ──●───────   ¼ avocado
[ ✓ Log breakfast · 367 kcal ]
[ 📦 Packaged ]                      [ 🍴 Ate out ]
🎙️ Say it · 📷 Photo · 🍷 Drinks · 🥑 Low-carb · ☆ Save as combo
```

### H2. The source picker (replaces the word "planned")

The button reads "{meal name} · {source} ▾" and opens an **inline grouped list** inside the same sheet,
not a second sheet:

| Group | What it holds |
| --- | --- |
| **Today's plan** | The planned template (✓ marked), the other breakfast template (Oatmeal with whey), and a new **Protein smoothie** template (H4) |
| **Your combos** | This meal's saved combos first, then other meals' |
| **Pat's combos** | Only when Pat shares Diet with you (the server already enforces this) |
| **Bars & shakes** | The protein bars and shakes in the food list |
| **Again** | Same as yesterday |
| **From you** | "🎙️ What you said" / "📷 From your photo", when the sheet was opened from Talk or a photo |

- Each row shows its kcal and protein.
- Picking a row loads its foods into the same slider rows. **Nothing is saved until Log.**
- A bar or shake shows a **quantity** stepper (½-unit steps) instead of grams sliders, and hides
  Fit-to.

### H3. Fit to N kcal

- **The input** is a number box with − / + buttons in 25 kcal steps. It accepts typing.
- **Default value:**
  - The owner's example pre-fills 500.
  - Proposed default: **this person's planned target for this meal**, which already differs per person
    because each has their own plan.
  - It then remembers the **last value each person used for each meal** ("Pat fits breakfast to 300").
    That is stored in the person's private Diet preferences, so it syncs across their own devices.
- **When it applies:** live, as the value changes (debounced). The sliders move to the new grams.
- **The rule (protein-aware; the old tracker's version scales everything uniformly):**
  - Foods that are mainly protein stay at their grams while possible.
  - Carb and fat foods absorb the change, in the plan's carb:fat proportion.
  - Locked foods 🔒 don't move.
  - Each food is rounded to its slider step and kept within its range.
- **For a planned template,** the template's own auto-sizer is used with a target of
  `{ kcal: N, protein: the planned protein (capped at 60% of N), carbs and fat scaled }`.
- **If N can't be reached without cutting protein:** "Closest: 314 kcal with protein kept · Shrink
  protein too".
- **Fit is a starting point.** The sliders still adjust each food afterwards.

### H4. Protein smoothie template

- **Ingredients:**
  - whey (sized for protein);
  - frozen mixed berries or banana (sized for carbs);
  - almond or oat milk (fixed 240 g);
  - peanut or almond butter (sized for fat).
- **Not part of the daily breakfast rotation.** The rotation list stays exactly Eggs & toast and
  Oatmeal, so existing days don't change. The smoothie is chosen from the picker.

### H5. Actions

- **Primary:** **✓ Log {meal} · N kcal**. It replaces "Log as planned", because the source may not be
  the plan.
- **Two prominent, equal buttons:** **📦 Packaged** and **🍴 Ate out**.
- **A small row:** 🎙️ Say it · 📷 Photo · 🍷 Drinks · 🥑 Low-carb · ☆ Save as combo.
- **"＋ Something else" is removed.** Its options are spread across the picker (Same as yesterday), the
  two big buttons, and the small row.
- **The Health "Breakfast is next" row:**
  - **✓ As planned** (one tap logs; unchanged) and **🍴 Ate out** (replacing "Something else").
  - Tapping the meal's title, or the Breakfast / Lunch / Dinner chips, opens the full sheet with the
    picker, Fit-to and Packaged.

### H6. Packaged

- **First:** your saved packaged foods as large rows. One tap goes to a servings stepper (½, 1, 1½, 2,
  or a number), then Log.
- **Then:** a prominent **📷 Snap the label**.
- **Then:** manual entry (name, protein/carbs/fat/calories), with "Save for next time" on by default.

### H7. Ate out (one screen)

1. **"What did you have?"** with three big options:
   - **📷 Photo of the dish:** the existing photo estimate, with a restaurant hint.
   - **🎙️ Describe it:** Talk-style listening (Part D); the text is read by the existing meal endpoint
     with "restaurant meal" added.
   - **🍽 Pick the closest:** the existing 12 plates.

   The result shows as a dish (or items) with **Portion** and **How much you ate**. "Menu shows
   calories" is kept.
2. **🍷 Drinks**, inline: the existing chips with counts. Alcohol kcal is shown apart ("incl. 250 kcal
   alcohol") and isn't counted as protein, carbs or fat.
3. **Where** (optional).
4. **The total, then ✓ Log.**

### H8. Data

**Each logged meal gets an additive `src` field:**
- the values: `plan | template | combo | bar | packaged | eatout | photo | said | again | quick`;
- plus `fitKcal` when the meal was fitted.

Older entries without it fall back to the title.
- This lets HealthInsights say "ate out 3 times this week" honestly.
- The privacy class doesn't change.

### H9. One meal editor everywhere

- Talk's meal review **Edit** opens this same sheet, with source "🎙️ What you said".
- Photo results open it with "📷 From your photo".
- **One editor, many sources.**

### H10. Things to watch

- **The rotation must not shift.** Today the breakfast rotation is computed from the template list's
  length, so adding the smoothie needs an explicit rotation list.
- **Combos saved in the old tracker** (`{name, meal, items[{food, grams}], manual?}`) are the same
  records the picker reads. Partner combos come from the partner's shared Diet part, not from local
  copies.
- **A combo saved with typed-in "manual" macros** has no foods to slide. It shows as a fixed entry with
  quantity, and Fit is hidden.

---

## Part I: Decisions already proposed (comment if you disagree)

- **(a)** WHOOP right under Talk on Home, above Next up and needs-attention.
- **(b)** Auto-sync on opening Home, using the same 20-minute rule, after paint.
- **(c)** Finish after 2.5 s of quiet, tuned on a device.
- **(d)** The qualified-day rule in Part F.
- **(e)** Deterministic answers in this build; AI phrasing for "why" questions later, needing a server
  deploy.
- **(f)** Keep WHOOP's recovery `updated_at`.
- **(g)** Fit-to defaults to the meal's planned target, then remembers each person's last value.
- **(h)** Remove "Something else"; the Health row becomes ✓ As planned + 🍴 Ate out.

---

## Part J: Questions for the reviewer

1. **Home hierarchy:** is the full WHOOP card right under Talk the right call for a household Home that
   also holds chores, dogs and requests? When should needs-attention outrank it?
2. **Sync button:** is a full-width dark **SYNC WHOOP** under the card too heavy? Would a smaller control
   inside the card be clearer, given the owner explicitly wants it prominent?
3. **"No newer data":** is the before/after fingerprint a sound way to tell "nothing new" from "updated"?
   Any case where WHOOP updates a score without a state change that this would miss?
4. **Listening:** are 1.2 s / 2.5 s / 8 s / 90 s sensible starting values? What fallback do you recommend
   if iPhone refuses to restart recognition without a tap?
5. **Spoken confirmation:** is restricting "yes" to the 🎤 Change button on a visible, unexpired card
   enough to prevent accidental logging? What phrases should never count as a confirmation?
6. **Corrections:** which correction phrasings must the phone handle without AI in version 1? Is
   re-reading "original words + correction" through the existing AI endpoints a safe fallback?
7. **Coverage and qualified days:** are the definitions in Part F honest and useful? Any case where they
   would mislead (for example a deliberate one-meal-a-day pattern, or a day with only snacks)?
8. **Confidence thresholds:** are 70% / 3 weigh-ins / 5 WHOOP days the right cut-offs? How should the
   answer read when food data is partial but training data is strong?
9. **Comparisons:** are the "meaningful difference" thresholds reasonable? How many differences should
   an answer show at most?
10. **Meal source picker:** is an inline grouped list better than a native `<select>` on iPhone for
    about 6–20 options? How should the picker look when a meal is already logged?
11. **Fit-to:** is "keep protein, flex carbs and fat" the right default? Is the plan target or the
    owner's fixed 500 the better pre-fill? Should the fit be remembered per person and meal, per meal
    only, or not at all?
12. **Removing "Something else":** does spreading its options across the picker, two buttons and a small
    row lose discoverability? Is **✓ As planned + 🍴 Ate out** the right pair for the Health row?
13. **Ate out:** is one screen with three estimate methods + drinks + where too dense at 390 px? What
    order would you use?
14. **Packaged prominence:** is a large saved-items list plus Snap the label the right first view?
15. **Data:** is the `src` field enough for "ate out N times" and similar insights, and what else (if
    anything) should a logged meal record?
16. **Scope:** which of Parts C–H would you ship first if the build had to be split into two
    releases, and why?
17. **Anything else** that would make daily logging slower, confusing, or less trustworthy.
