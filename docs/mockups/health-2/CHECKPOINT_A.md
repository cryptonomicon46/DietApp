# Health 2 — Checkpoint A (N0): audit, research, mockups, classification

Branch `v2/health-2` from `main` `a3fbe02`, 2026-10-30. **Design only — nothing is implemented.**
Mockups: `screens.mjs` in this folder, injected into the running family app (its real header, nav and
`style.css`) and photographed at 390 and 320 px, light and dark, with a synthetic family (Sam).
No horizontal overflow at either width. `npm test`: 413 pass, 0 fail.

## 1. Audit (re-verified in the code)

| Area | Today | Evidence |
|---|---|---|
| Meal logging | Only in the trackers (`index.html`). Health's Nutrition card links there ("Today's plan →"). | `family/health.js:94-99`, `js/app.js:759-786` |
| Customising a meal | Tap the card → separate full-page editor; 📦 Packaged / 🍴 Ate out sit next to the breakfast-type picker | `js/app.js:788-874` |
| Ate out + drinks | Exist (12 dish presets × portion × eaten; wine/beer/cocktail chips) but only inside Customize › Ate out; drinks only with a restaurant meal | `js/app.js:914-952`, `js/plan.js:249-291` |
| Photo / voice / text food logging | None. Only the barcode scanner (Open Food Facts → saved food, not a logged meal) | `js/app.js` ~2524-2660 |
| Workout build | "Build it" starts with a **superset** block by default; "Add to Today's Workout" is the only exit | `family/fitness.js:292-314, 424-436` |
| Logging sets | ✓ per set; no "all sets"; Complete Workout saves even with sets unticked | `family/fitness.js:437-453`, `js/workout.js:132-138` |
| After completion | `fx.today = null` — the Health card goes back to "＋ Add Workout"; nothing kept for the day | `family/fitness.js:445-453` |
| Previous performance | Stored (`/workouts/log`, `got` per set) but not shown while training | `family/fitness.js:17-24, 60-61` |
| WHOOP | Scopes `offline read:workout read:cycles` — no recovery or sleep; strain not shown in the family app; WHOOP workouts never linked to a logged workout | `server/worker.js:30`, `js/activity.js:191-204` |
| Muscle volume | Only *planned* program sets (`weeklySets`), hidden when signed in | `js/lifting.js:146-152`, `js/app.js:2847-2850` |
| Weekly check-in | Exists in the trackers, approve-first (Keep my macros / −100 kcal …) | `js/app.js` check-in, `js/planCoach.js` |
| Health landing | Weight card (with 90-day chart) → Nutrition → Fitness → Devices; on a 390×844 phone the workout button is **below the fold** | `family/health.js:84-107`, screenshot `before/health.png` |

**Wording that conflicts with "never punish honest logging"** (proposed for CORE NOW, text-only):
- `js/planProgress.js:14` "⏳ Behind plan" in orange → "Slower than planned", neutral colour.
- `js/app.js:2945` "· 2-day streak" → drop the streak count.
- `js/app.js:904, 937` "About N kcal over this meal's target" → "Plans change. You have ~X kcal and ~Y g protein left today."
- `js/app.js:270, 1774`, `family/health.js:57` "N of the last 7 days on target" → keep the number, soften to "near target"? (**owner decision**)

## 2. Research (sources at the end)

- **Meal logging.** MacroFactor uses one plate-based logger with five entry methods (search, barcode/label, quick add, AI describe, photo). The photo and describe flows return *editable* entries, never silent logs, and suggest a hand or fork in the photo for scale. MyFitnessPal Meal Scan (now Cal AI technology, paid) and Lose It Snap It both ask you to confirm items. Reviewers find photo estimates rough (±10–20 %), worst for restaurant food with hidden oil and for mixed dishes. **Adopted:** confirm-before-log; editable items; portion and "how much you ate"; an "estimate" label; a restaurant-oil note. **Not adopted:** silent auto-logging; claims of accuracy.
- **Workouts.** Hevy and Strong tick a set when it's done. A tick starts a rest timer, and you can finish once one set is done. StrengthLog asks what to do with unfinished sets at the end. **Adopted:** ✓ per set; ✓ All sets; an explicit "Log remaining sets as planned" with confirm and Undo; an optional rest timer; last-time numbers inline.
- **Volume.** Schoenfeld 2017 found a graded dose-response (<5, 5–9 and 10+ weekly sets per muscle → about 5.4 %, 6.6 % and 9.8 % growth). Pelland 2024 (67 studies) found the best fit with fractional counting (indirect sets = ½), diminishing returns past roughly 11 sets, and a minimum effective dose around 4 fractional sets. Fitbod sets weekly targets of 10–20 sets and counts the primary muscle only. **Adopted for N6:** fractional counting, a typical band of about 4–10 sets for maintenance and lower-priority muscles and about 8–16 for focus muscles, shown as guidance only. Confirm against the primary papers before N6.
- **Alcohol.** 7 kcal per g; a US standard drink is about 14 g (≈98 kcal from alcohol). Red wine is ~125 kcal per 5 oz, white ~120, beer ~150, cocktails 100–300+. The existing `DRINKS` values match. Alcohol kcal ≈ total kcal − 4 × carbs.
- **WHOOP v2.** The scopes are `read:recovery`, `read:sleep`, `read:cycles` and `read:workout`; v2 uses UUID ids. **developer.whoop.com is blocked by this session's network settings**, so the exact score field names (`recovery_score`, `hrv_rmssd_milli`, sleep stage and zone-duration names) must be confirmed at the start of Phase B. Allow that domain, or I'll read them from a real API response.

## 3. Voice ("🎙️ Tell me") — privacy finding

- **Recommended: the phone keyboard's microphone.** "Tell me" opens a text box; the person types, or taps the 🎤 on their keyboard. **OurPawmily never receives audio, only text.** iOS keyboard dictation runs on the device on recent iPhones for supported languages; it can use Apple's servers on older devices, for other languages, or with "Improve Siri & Dictation" turned on. Android depends on the keyboard (Gboard may use Google's servers). That choice is the OS's and the person's, and the privacy page will say so.
- **Not recommended now: the Web Speech API in the page.** `processLocally` defaults to false, so Chrome may send audio to Google's servers. On-device mode is new and not available everywhere, and Safari's behaviour isn't documented. It could be added later only with `processLocally: true` and feature detection.
- **Text interpretation.** On the phone first: a deterministic parser for common foods and quantities ("2 eggs", "½ avocado", "2 slices sourdough") against `foods.js` and My foods. Otherwise the **text only** goes to Claude (new purpose `diet.text`, capped), with structured output and an editable preview; the person confirms. No audio, no recordings, and nothing stored server-side.
- **Result:** no audio leaves the device through OurPawmily, so there's no stop condition.

## 4. A9 — Rest timer evaluation

- **Recommended: SMALL ADDITION, off by default.** It's a toggle in the workout, and once switched on it stays on for that person.
- **Straight sets:** the timer starts when a set is ticked.
- **Supersets and circuits:** it runs only after a full round, or not at all.
- **Default rest:** 90 s for compound lifts, 60 s for isolation. +30 s and Skip are available.
- **Timing:** shown from timestamps (not a ticking interval), so it's right when the phone wakes. A vibration at zero where supported.
- **No push notifications** (background timers on iOS PWAs are unreliable), so the timer is visible only while the app is open. That limitation will be documented.

## 5. Tap counts and cognitive load (A15)

"Today" is measured on `main` at 390 px. "Proposed" is from the mockups. Typing is not counted as taps.

| Task | Today | Proposed | Notes |
|---|---|---|---|
| Log morning weight | 1 (type + Save) | 1 | Now first in Today and emphasised in the morning |
| Log a planned meal | 2 + switching apps + long scroll | **1** | ✓ As planned on Health |
| Voice-log an unplanned meal | not possible (≈8+ by swapping foods) | **3** | 🎙️ → keyboard 🎤 → Log (after a glance at the preview) |
| Photo-log a meal | not possible | **3** | 📷 → shutter → Log it |
| Repeat yesterday's meal | ≈5 (combo picker) | **3** | meal → More → Same as yesterday |
| Log two drinks | 7, and only with a restaurant meal | 6 (5 from a meal sheet) | Rare action, so kept under More. Option: an evening-only 🍷 shortcut for people who log drinks often (owner decision) |
| Start today's workout | 1 + scroll (below the fold) | **1**, no scroll | |
| Complete one set | 1 | 1 | Last-time numbers now inline |
| Resume an active workout | 1 + scroll | **1**, no scroll | Emphasised row |
| Finish a workout | 1 (unticked sets silently stay undone) | 1, or 3 with "Log remaining sets as planned" + confirm | Clear about what gets recorded |
| Log a workout already done | 5 + one tap per set | **4** | Build → Log as done → Done |
| See what to eat next | 1 + scroll (on another page) | **0** (on Health); What fits? = 1 | |
| Adjust the rest of today after an unplanned lunch | not supported (edit each meal by hand) | **2** | Adjust the rest of today → Use |

## 6. Screens and the single most likely action

| Mockup | Most likely action |
|---|---|
| A1 Morning | Type the weight → Save |
| A2 Meal time | ✓ As planned on lunch |
| A3 After an unexpected lunch | Adjust the rest of today |
| A3b Adjust the rest of today | Use the first dinner option |
| A3c What fits? | Plan the top option |
| A4 Active workout (Health) | ▶ Resume Lower body |
| A4b Training | Tick the next set ✓ |
| A5 Workout complete (Health) | ✓ As planned on dinner |
| A5b Summary | Done (or Accept the progression) |
| A6 WHOOP, lower recovery | Start workout (Keep / Make it lighter is optional) |
| A7 Evening | ✓ Done logging today |
| A8 Weekly check-in | Keep current plan, or Approve |
| M1 Meal sheet | ✓ Log as planned |
| M2 More | Same as yesterday |
| M3 Tell me | Log (after a glance at the items) |
| M4–M8 | Log it / Add |
| W1 Build | ▶ Start now |
| W2 Confirm | ✓ Log 4 sets as planned |
| W3 After confirming | Complete workout |
| F1–F3 Fitness / Weekly balance | Add workout / Show my week / read it — nothing required |
| R1 WHOOP needs reconnecting | ✓ As planned (Reconnect is secondary) |

Every Health screen keeps the three anchors in the same order (Weight · Food · Workout). One row is emphasised at a time, and there's one quiet "Next: …" hint.

## 7. Classification

**Rating key:** use = daily usefulness · cost = implementation cost · privacy = privacy/security impact · perf = performance risk · arch = architecture risk.

### Phase A (core Health UX)

| Item | Class | use | cost | privacy | perf | arch | Notes |
|---|---|---|---|---|---|---|---|
| Revised landing (Today anchors, then WHOOP / Nutrition & plan / More) | **CORE NOW** | high | med | none | low (lazy, 0 new start-up requests) | low | |
| A1 persistent anchors + A2 one "Next" hint | **CORE NOW** | high | low | none | none | low | deterministic from time and state |
| N1 one shared meal sheet (Log as planned · Photo · Tell me · Ate out · More) | **CORE NOW** | high | **high** | none | low | **med** | the family app must write the sealed Diet part, as the weigh-in does |
| Wording fixes (§1) | **CORE NOW** | med | low | none | none | none | text only |
| N2 photo estimate (`diet.photo`) | **CORE NOW** | high | med | **med** — image to Claude, not kept | low | low | reuses the `lookAi.js` pattern |
| A3 Tell me (keyboard dictation + parser + `diet.text`) | **SMALL ADDITION** | high | med | low — text only | none | low | shares N2's preview card |
| N3 drinks (counters, pour, custom, standalone, alcohol kcal apart) | **CORE NOW** | med | low | none | none | low | extends `DRINKS` |
| N4 Log as done · ✓ All sets · Log remaining sets as planned + Undo · completed card kept · summary | **CORE NOW** | high | med | none | none | low | |
| A7 last time inline | **CORE NOW** | high | low | none | none | none | already in `/workouts/log` |
| A5 Adjust the rest of today | **SMALL ADDITION** | high | med | none | none | low | on the phone; targets unchanged; scales the remaining planned meals |
| A4 What fits? | **SMALL ADDITION** | high | med | none | none | low | same ranking engine as A5, on the phone |
| A6 "Done logging today" + partial-day flag | **SMALL ADDITION** | med | low | none | none | low | the flag now; the weekly maths use it in A11 |
| A9 rest timer (off by default) | **SMALL ADDITION** | med | low | none | none | none | §4 |
| A8 progression suggestion | **SMALL ADDITION** (drop if Phase A slips) | med | low-med | none | none | low | rule: every planned set done at the planned reps in the last session → +5 lb (upper or isolation), +10 lb (lower compound). Accepting changes only the next planned weight or the saved template, with approval |
| A12 "the plan is learning" lines | **SMALL ADDITION** | med | low | none | none | none | counts only, no invented precision |
| A13 no dashboards on Health | **CORE NOW** (rule) | — | — | — | — | — | |

### Phase B (WHOOP)

| Item | Class | Notes |
|---|---|---|
| N5 recovery/sleep/strain strip + workout match | **CORE (Phase B)** | needs `read:recovery read:sleep` and a reconnect; recovery and sleep are private by default |
| A10 context line ("in your usual range — no change") | **CORE (Phase B)** | deterministic: compares to the person's own 30-day median |
| A10 Make it lighter (one set fewer per exercise) | **SMALL ADDITION (Phase B)** | changes today's workout only, after a tap |

### Later checkpoints

| Item | Class | Notes |
|---|---|---|
| A11 weekly review on Health ("Your week") | **FOLLOW-UP** | its own checkpoint after Phase A. Reuses the trackers' approve-first check-in engine; adds completeness (A6), training count and recovery |
| N6 Weekly balance in Fitness + quiz | **FOLLOW-UP** | separate checkpoint as required; descriptive wording; catch-up optional |
| Web Speech API in the page | **FOLLOW-UP** | only with `processLocally: true` |

## 8. Decisions for the product owner

1. **Approve the subset.** Recommended: Phase A = all CORE NOW items, plus Tell me, Adjust the rest of today, What fits?, Done logging today and last time. Rest timer and progression go last and are dropped if Phase A slips.
2. **"N of the last 7 days on target":** keep it, soften it to "near target", or remove it.
3. **Drinks shortcut:** add an evening-only 🍷 under Next meal for people who log drinks often, or keep drinks under More only (as mocked).
4. **WHOOP docs:** allow `developer.whoop.com` in this environment's network settings before Phase B, or accept field names read from a live response.
5. **Build-it default:** start with a plain exercise instead of a superset (recommended), or keep the superset default.

## Sources
- MacroFactor AI food logging: https://help.macrofactorapp.com/en/articles/258-ai-food-logging
- MacroFactor label scanner: https://macrofactor.com/label-scanner-announcement/
- MacroFactor vs Cal AI: https://macrofactor.com/macrofactor-vs-cal-ai/
- Meal scan accuracy test: https://feastgood.com/?p=43194
- Cal AI teardown: https://www.raftlabs.com/blog/cal-ai-product-teardown
- Photo calorie apps 2026: https://programminginsider.com/best-photo-calorie-tracking-apps-2026/
- Lose It vs MyFitnessPal speed: https://nutriscan.app/blog/posts/myfitnesspal-vs-lose-it-2026-which-app-is-faster-d4cb63c7c2
- Hevy strength training: https://www.hevyapp.com/use-cases/strength-training-app/
- Hevy workout log: https://www.hevyapp.com/features/workout-log/
- StrengthLog unfinished sets: https://help.strengthlog.com/?p=252
- Fitbod weekly set targets: https://help.fitbod.me/hc/en-us/articles/24739986755223-Weekly-Set-Targets
- Schoenfeld 2017 dose-response: https://core.ac.uk/download/200371264.pdf
- Schoenfeld volume follow-up: https://biolayne.com/reps/issue-24/volume-and-hypertrophy-doubts-about-the-doubts/
- Pelland 2024: https://bibbase.org/network/publication/joshuapelland-jacobremmert-zacrobinson-sethhinson-michaelzourdos-theresistancetrainingdoseresponsemetaregressionsexploringtheeectsofweeklyvolumeandfrequencyonmusclehypertrophyandstrengthgain-2024
- Pelland 2024 summary: https://train.fitness/personal-trainer-blogs/not-all-sets-are-created-equal
- Alcohol calories: https://legionathletics.com/calories-in-alcohol
- WHOOP v1→v2 migration: https://developer.whoop.com/docs/developing/v1-v2-migration
- WHOOP API scopes 2026: https://tryterra.co/blog/whoop-api-data-access-permissions-limitations-2026
- MDN SpeechRecognition.processLocally: https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally
- Chromium on-device speech: https://groups.google.com/a/chromium.org/g/blink-dev/c/kR1Q5pcrk1Y
- Apple dictation privacy (secondary): https://www.yaps.ai/blog/apple-dictation-data-privacy.md
