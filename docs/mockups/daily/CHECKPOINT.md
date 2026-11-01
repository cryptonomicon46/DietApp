# Daily Health + Talk UX: Phase 0/1 checkpoint (DESIGN ONLY, stopped for review)

Branch `v2/daily-health-talk-ux` from `main` `9e6cb18`, 2026-11-01.

**Nothing in the app has changed.** This branch adds only:
- `docs/mockups/daily/screens.html` and `shoot.mjs` (390 px mockups);
- this report;
- a `.gitignore` line for the screenshots;
- a `BUILD_PROGRESS` entry.

No merge, no deploy.

**The MCP / Agent Hub / Muse work is preserved untouched.** It was all committed and pushed, so nothing was stashed. The working tree was clean on `v2/household-agent-m1`.

| Branch | Commit | What |
| --- | --- | --- |
| `v2/muse-m0` | `ed22fcd` | Muse bridge M0 design + OpenAPI + mockups |
| `v2/agent-hub-m0` | `6071ce0` | Agent Hub M0 design + review package |
| `v2/household-agent-m1` | `5f8de15` | Household Agent M1 GPT review prompt |
| `v2/claude-inbox-mockups` | `f6faa0b` | Claude inbox mockups |
| `v2/quick-actions-mockups` | `ec146cd` | Quick actions mockups |

**Mockups:**
- `node scripts/perf/pages.mjs &`, then `node docs/mockups/daily/shoot.mjs`, which writes `docs/mockups/daily/out/` at 390 px, 390 px dark and 320 px.
- The page must be served, because it imports the real WHOOP card code.

---

## 1. Why Talk cuts you off

`family/app.js:436`:

```js
r.continuous = false
```

- **Single-utterance mode.** The phone's speech service ends the session at the first pause it judges to be the end of a sentence. That's often under a second on iPhone and in Chrome.
- **`onend` submits immediately.** `onend` (`app.js:439`) sets `ended`. Talk's listener (`family/talk.js:71-77`) then calls `send(voice.text)` at once.
- **No grace period, maximum length or restart.** Nothing waits through a pause, caps the session, or restarts it.
- **Text would be lost on a restart.** `onresult` rebuilds the whole text from the current session's results (`app.js:437`). So if the session were restarted, everything heard before would be gone.
- **Done arrives too late.** A Done button already exists (`talk.js:97-98`), but the session has usually ended before you reach it.

## 2. Today's WHOOP card and how it gets its data

**The card is already one pure function.**
- `whoopHtml(w, esc)` in `family/health.js:173-196` builds it from:
  - `ring()`;
  - `WHOOP_COLORS` (WHOOP's palette);
  - the *Data by WHOOP* mark;
  - three tiles (Sleep, Recovery, Strain, in WHOOP's order) with their sub-lines;
  - the calm line;
  - the optional 🪶 *Make today's workout lighter*.
- The other views live in the same file: `whoopDaysHtml` (Last 7 days), `recoveryDetailHtml`, `sleepDetailHtml` and `strainDetailHtml`.
- Styles: `.hl-whoop` / `.wh-*`, `family/style.css:1367-1407`.

**Where the card's data comes from:**
1. `whoopHere()` (`app.js:557`) reads this phone's WHOOP sign-in and `whoopDaily` (60 days) from `lp.p.<owner>.*`. Recovery and Sleep are private and never leave the phone.
2. `js/whoopDay.js` `recoveryContext(daily, today)` produces the card's data:
   - scores, the WHOOP band, "your usual" (the middle half of 30 days, once there are 14);
   - sleep hours against need;
   - strain today and yesterday;
   - the line.
3. `healthView()` (`app.js:551`) adds `dailyMissing` (the reconnect state) and `lighter` (from Fitness).
4. Taps go through global handlers: `whoopdays` and `whoopdetail` (`app.js:4763`).

**What it means for Home.**
- The card can render anywhere `whoopHere()` and `recoveryContext()` can run.
- The only Health-specific part is `lighter`, which needs the Fitness module.

## 3. How WHOOP sync works today

**Three paths, with no shared result:**

| Path | When | What it does |
| --- | --- | --- |
| `whoopAutoSync` (`app.js:568`) | Opening Health, at most every 20 min, not while reconnect is needed | `deviceScreen.quietSync()` → `syncHere(3)`: pull the account copy, then `syncOwner(3, {daily:true})` → `devices.sync` → `whoopSince`. That reads all pages (≤8 each) of workouts, cycles, recovery and sleep since 3 days ago (28 days the first time), then `mergeSynced`, then push the account copy. Re-renders Health if anything changed. |
| `whoopTicker` (`app.js:576`) | Every 60 s while Health is on screen and visible, if ≥4.5 min since the last | `todayRefresh()` → `refreshToday()`: 2 WHOOP requests (cycles + workouts for the last 36 h), kept on the phone, no account save |
| Devices › **Sync now** (`deviceScreen.js:66`) | Tap | `syncHere(3)`; toast "⌚ Up to date" or "N new workouts" |

**Sign-in:**
- `accessToken()` refreshes a minute before expiry through the connector's `/whoop/refresh`.
- An API 401 gets one forced refresh and retry.
- If the refresh is refused (400/401), or the API returns 401/403 after the retry, the state becomes `problem: 'reconnect'`. That check first allows for the other app having already renewed the token.
- Offline or a 5xx sets `problem: 'unavailable'`, and the phone stays connected.

**Cache and timestamps:**
- Everything is in localStorage.
- `whoopDaily` keeps 60 days, and each day has a `syncedAt`.
- `t.lastSync` is the last full sync and `t.todayAt` the last today-only refresh.
- WHOOP's own times kept: the sleep's start and end, with its timezone offset.
- **Not kept:** WHOOP's `created_at`/`updated_at` for recovery and cycles. `recoveryFacts` drops them, so "Recovery scored 6:41 AM" can't be shown today.

**Gaps:**
- **Parallel syncs are possible.** Auto and the ticker share a flag (`whoopSyncing`), but Devices › Sync now ignores it.
- **No "no newer data" result.** `quietSync` returns only true/false, and the Devices toast counts workouts.
- **No rate-limit handling.** A 429 becomes "unavailable".
- **Every full sync also pulls and pushes the account copy.** That counts against the KV free plan's 1,000 writes a day.
- **WHOOP's published rate limits weren't checked against WHOOP's docs.** The developer site is outside this session's network. I recall about 100 requests a minute and 10,000 a day per app.

## 4. WHOOP battery and charging (official API)

**Not exposed.** WHOOP's public v2 API (OAuth scopes `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement`) has endpoints for:
- profile;
- body measurements;
- cycles;
- recovery;
- sleep;
- workouts.

It has none for device battery, the battery pack or charging state.

Sources (secondary; `developer.whoop.com` isn't reachable from this session):
- [Terra: WHOOP API in 2026](https://tryterra.co/blog/whoop-api-data-access-permissions-limitations-2026)
- [Thryve: WHOOP API data access](https://www.thryve.health/blog/whoop-api-data-access-integration)
- [WHOOP developer support](https://developer.whoop.com/docs/developing/support)

The only battery data mentioned anywhere is in WHOOP's private app API, which is excluded by the brief.

**Decision:** the feature is omitted. It will be recorded as *"WHOOP public API does not expose supported battery/charging state"*. Re-check on `developer.whoop.com` when that site is reachable. This doesn't block anything.

## 5. Proposed Home WHOOP: reuse, not a copy

**One shared module, `family/whoopCard.js` (new).**
- `ring`, `WHOOP_COLORS`, the WHOOP mark, `whoopHtml`, `whoopDaysHtml` and the three detail sheets move into it **verbatim** from `family/health.js`.
- `health.js` imports and re-exports them, so its tests and callers are unchanged.
- Health and Home both call `whoopHtml(model, esc)`. One `whoopModel()` in `app.js` builds the model, so the same data feeds both.

**Home placement:**

```
greeting
Talk to Pawmily
WHOOP card
SYNC WHOOP + Last synced
✨ Next up
Look
needs attention
groceries
classes
…
```

- The card is shown only on a phone where WHOOP is connected. Other phones see Home unchanged.
- The needs-attention card (requests, today's appointments) follows. If you'd rather it come first when it has something due today, that's a one-line swap (decision **a**).

**Home renders from what the phone already has:**
- `homeView` checks the WHOOP sign-in with one localStorage read.
- It reserves the card's height (no layout shift) and paints the rest of Home.
- After first paint it lazily imports `whoopCard.js` + `whoopDay.js` and fills the card from the cache.
- It never waits for WHOOP.
- **Then, deferred:** the same 20-minute auto-sync Health uses (decision **b**).

**The 🪶 lighter offer appears on Home only when it's relevant.**
- It shows only when `recoveryContext().lighterHint` is true (Recovery below your usual, or a short night).
- Only then does Home load Fitness to ask whether there's a workout today. Otherwise Home never loads Fitness.

**Stale data:**
- The card counts as stale when the last sync was before today's local midnight, or more than 6 hours ago.
- A one-line notice goes above it, as in the mockup: "⏳ Last synced yesterday 9:40 PM — tap Sync WHOOP".

**Load size on Home:**
- `whoopDay.js` imports `workout.js` (9.3 KB gzipped) only for `dayContextForPlanning`'s `durationFor`.
- I'll move `dayContextForPlanning` to a small `js/whoopPlan.js`, so Home loads about 12 KB gzipped (card + `whoopDay` + `workoutMatch`) instead of about 21 KB.

## 6. Proposed sync flow and states

**One controller, `family/whoopSync.js` (new).** It owns the single in-flight promise. Health's auto-sync, Health's ticker, Home's button and Devices › Sync now all call it:

```
sync({ kind: 'auto' | 'tick' | 'manual' })
  → { status: 'updated' | 'nochange' | 'fresh' | 'error' | 'reconnect', at, newWorkouts }
```

- **A call while a sync is running returns the same promise.** It's coalesced, and double taps can't start parallel requests.
- **A manual tap within 60 s of the last full sync** runs only the today refresh (2 requests). If nothing changed, it answers *"Up to date — synced a moment ago"*.
- **Otherwise it runs the existing `syncHere(3)`.** That's the same pipeline as today: incremental (3 days), with the account save.
- **How "updated" and "nochange" are told apart:** a fingerprint of `whoopDaily[today]` (states and scores of recovery, sleep and cycle) plus today's WHOOP workout ids, taken before and after. A sync that worked but brought nothing new is **"WHOOP synced — no newer data yet"**, never a failure.
- **A 429** is treated as "unavailable", with a cool-down: no new manual full sync for 2 minutes. The old values stay.
- **On "updated"**, the controller tells whichever view is open to re-render the card in place. Home's card and Health's card refresh without reloading the page.

**States (mockup `#sync`):**

| State | What you see |
| --- | --- |
| Ready | **SYNC WHOOP**, "Last synced 7:12 AM · Sleep ended 6:41 AM" |
| Syncing | Spinner, **SYNCING WHOOP…**, button disabled, card unchanged |
| Updated | "✓ WHOOP updated" (4 s), new time |
| Nothing new | "WHOOP synced — no newer data yet" |
| Just synced | "Up to date — synced a moment ago" |
| Couldn't reach | "Couldn't sync WHOOP — showing what you had", **Try again** |
| Reconnect | "WHOOP needs to reconnect", red **Reconnect WHOOP** button (the existing `devconnect`) |

**What the two times mean:**
- "Last synced" is `t.lastSync`, when Pawmily last completed a sync.
- "Sleep ended" is WHOOP's own record of the end of last night's sleep.
- "Recovery scored HH:MM" would need WHOOP's recovery `updated_at`. That's a small, additive change to `recoveryFacts` (decision **f**). Until then it isn't shown, and nothing is made up.

## 7. Proposed listening state machine

`js/listen.js` (new) is pure and testable with a fake recogniser. `family/app.js` `listenNow` wires it to the browser's `SpeechRecognition`.

```
idle → listening ⇄ pausing → finishing → (final text) → understanding → review | answer
          │  ↑ speech resets the pause
          └→ restarting (the browser ended on its own) → listening
cancel / type instead → idle (text discarded)
```

**Recogniser settings:**
- `continuous = true` and `interimResults = true`.
- Final segments are kept by `(session, resultIndex)` and appended **once**.
- Interim text is replaced on every event.
- An overlap guard covers engines that resend everything heard so far as one "final" (seen on some iOS versions): if the new final starts with the text already kept, only the new tail is appended.

**Pauses** (timed from the last result):

| Silence | What happens |
| --- | --- |
| Under 1.2 s | Nothing changes |
| 1.2–2.5 s | *"Still listening… keep talking to add more"* with a bar running down. Speaking resets it. |
| 2.5 s (tunable 1.5–3.0; tuned on your iPhone in Phase 2) | **Finish** |

**Endings and limits:**
- **No words at all for 8 s:** "I didn't hear anything".
- **90 s in total:** finish.
- **The browser ends the session on its own** (no error, not stopped by us, under the maximum): restart within about 250 ms and keep the text.
- **The restart is refused** (iOS may require a tap): show the transcript with **Keep talking** and **Done**.

**Done:**
- `stop()`, then wait up to 1 s for the last final segment, then finish.
- **Cancel** and **Type instead** call `abort()` and keep nothing.

**Finishing never writes anything.** The text goes to `send()`, which produces a review card (§8) or a read-only answer.

## 8. Proposed review-before-write

**Audit result: no Talk path writes today without a tap.**
- Weight, chores, Watch, Read and calendar cards each need their button.
- A meal hands off to Meals' estimate sheet (**✓ Plan & log**).
- A workout hands off to Fitness's editor (**Save**).

What's missing:
- Talk closes on the hand-off, so you leave the conversation.
- There's no spoken correction.
- The workout "review" is the full editor.
- There's no spoken confirmation.

**Proposal** (`js/proposal.js`, new, pure). Each proposal is:

```
{ id, kind: 'meal' | 'workout', payload, version, createdAt, expiresAt (+10 min), state: 'draft' | 'committing' | 'committed' | 'cancelled' | 'expired' }
```

It is held in memory only: never stored, never sent.

**Meal:**
- Talk reads the text with Meals' own reader: `parseMeal` on the phone, otherwise `/ai/diet/text`, exactly as *Tell me* does today.
- The card shows items, amounts and the kcal/protein/carbs/fat totals (mockup `#meal`).
- **✓ Log meal** commits through the existing ✓ Plan & log path (`D.logAs`). It's one write, with Undo.

**Workout:**
- Talk reads it with `workoutText.parseWorkout` on the phone, otherwise `/ai/workout`.
- The card shows blocks: straight sets, supersets with rounds (mockup `#workout`).
- **✓ Create workout** saves it as today's workout through Fitness's own save.

**Edit** opens the existing meal estimate sheet or workout editor with the draft. Saving there is that editor's normal write.

**Spoken correction (🎤 Change)** listens for that card only:
- **Confirm** ("yes", "log it", "looks good", "create it") → `commit(id, version)`.
- **Cancel** ("cancel", "never mind") → cancelled. Nothing is written.
- **Anything else is a correction:**
  1. First a phone-side amendment reader: "make the rice half a cup", "remove the salsa", "add a coffee", "it was dinner", "make it 4 sets".
  2. Otherwise the original words plus the correction are re-read through the same `/ai/diet/text` or `/ai/workout`. **No Worker change is needed.**
  3. Either way the result is a new **version**. Changed rows are highlighted (mockup `#mealfix`).

**Exactly once:**
- The button and the voice both call `commit(id, version)`. It acts only from `draft` with the current version, and moves to `committing` before the write.
- A second call while committing, or after it, returns the same result.
- An expired card says "This one expired — say it again".

**A stray "yes" can't act:**
- Spoken confirmation is accepted only from 🎤 Change on a card that is on screen and not expired.
- "Yes" said in a new Talk session, with no card showing, answers "There's nothing waiting to confirm."

**Questions are never asked to confirm.** "What's my Recovery?" or "How many runs?" are answered directly.

## 9. Meal logging coverage (definition)

There's no record of past meal plans. Every day's plan always has the three main meals, so coverage counts **main meals: breakfast, lunch and dinner**.

```
expected(day) = 3, or the number of main meals logged if you tapped "Done logging today" (a skipped meal isn't a miss)
coverage = Σ main meals logged / Σ expected, over the days of the period
```

**Reported alongside coverage:**
- `mealsLogged`, which includes snacks and extras;
- `daysWithAnyMealLogging`;
- `daysWithCompleteLogging`, as defined in §10.

**The sentence states facts:** "You logged 14 of 21 main meals across 5 of the last 7 days". It doesn't guess why a meal is missing.

Data: `mealLog` (past days) merged with `eaten` (today), as `js/analytics.js mealLogs` already does.

## 10. Qualified nutrition day (definition)

A day **qualifies** only if one of these holds:
- you tapped **Done logging today** (`log.done` / `days[d].complete`);
- **all three main meals are logged**.

Then:

```
qualifiedDays
daysBelowCalorieTarget        eaten < that day's target kcal
daysAtOrAboveCalorieTarget
unclassifiedIncompleteDays    any logging, but not qualified
```

- "Eaten" comes from the meals, extras and drinks (`consumedOf`).
- The target is the day's own stored target (`days[d].target`, which includes training). If that's missing, it's recomputed and flagged "estimated target".

**Deliberately stricter than the existing `dietDays.onTarget` rule** (3 meals *or* ≥60% of target). Under that rule a day eaten at 60% of target would count as "below target", which is exactly the false positive the brief rules out. The existing dots in Health are unchanged (decision **d**).

**The wording is "below your calorie target", never "deficit".**

## 11. HealthInsights architecture

`js/healthInsights.js` (new) is pure and has no network or storage access.

```
periodRange(name, today)
  today | last3 | last7 | last14 | last30 | thisWeek | lastWeek
  local calendar; weeks run Monday–Sunday (progress.periodOf)
  "last N days" means N complete days before today
insights({ meals, days, weights, workouts, whoopDaily, profile }, period)
  → { period, nutrition, training, weight, whoop, confidence, notes }
compare(a, b)
  → the few biggest differences, each above a threshold
    (e.g. coverage ≥15 points, ≥1 session, weight average ≥0.5 lb, Recovery average ≥8)
```

**Facts per area:**
- **Nutrition:** §9 and §10, plus average kcal and protein on qualified days.
- **Training** (from the list described in §12):
  - `strengthSessions`, `plannedStrengthSessions`, `completedPlannedStrengthSessions`;
  - `runs` / `runMinutes` / `runDistance`, `bikeSessions` / `bikeMinutes`, `climbingSessions`;
  - `workoutDays`, `restDays`, light activity apart.
  - Planned strength sessions are the lifting program's 3 a week, the only weekly plan the app has, plus any planned Fitness workouts dated in the period.
- **Weight:** reuses the existing `plan.weekOverWeek` and `planProgress.dataQuality`. Also `latestWeight`, `recentAverage`, `previousPeriodAverage`, `trendDelta`, `weighInCount`. Never a trend from one weigh-in.
- **WHOOP:** `averageRecovery`, `averageSleepPerformance`, `averageStrain` from the same `whoopDaily` (WHOOP's date rule).
- **Confidence per area:**

| Level | Rule |
| --- | --- |
| `strong` | ≥ 70% of days qualified (food), ≥ 3 weigh-ins (weight), ≥ 5 scored days (WHOOP) |
| `partial` | Anything in between |
| `insufficient` | < 2 qualified days / < 2 weigh-ins / < 3 scored days. Those facts aren't stated, and the answer says so. |

**How a question reaches it (Talk):**
1. A new phone-side step, `health.ask {topic, period, compare}`, for "how many / how consistent / did I stick / compare / how did I do" plus a period.
2. It's checked **before** the day-question check, which today grabs "how many meals…" and asks for calendar consent.
3. The phone gathers the inputs: your own copy (`memberData`), Fitness's done list and `whoopDaily`.
4. It answers with a deterministic sentence plus the supporting facts (mockup `#insight`).
5. Every number comes from `healthInsights`. Nothing leaves the phone.

**Open "why" questions** ("why might my progress have stalled?", "what did I do differently?"):
- Without AI, they get the comparison's biggest differences in plain sentences ("The main differences I can see…", "This coincided with…").
- Natural phrasing would need a new gateway purpose, `talk.health`. Its fields would be the aggregates only (≤ 2 KB), the question, and no raw history.
- That's a **Worker change**, so `pawdeploy` (decision **e**).

## 12. Deduplicating WHOOP and logged workouts

**What exists:**
- Fitness already deduplicates correctly. `allDone(true)` takes the Fitness log plus older records and removes device workouts matched by `workoutMatch.matchAll`. Matching is same-day only, by the device's own date (`localDate(start, tz)`), with each device workout used once.
- `activity.trainingDay` skips a typed activity when a synced session of the same kind with at least 60% of its minutes exists.

**Problems elsewhere:**
- `family/health.js fitnessSummary` adds up `workouts` and `workoutHistory`, which overlap, so it **double-counts**. Only a test uses it.
- `progress.cardioStats`, `analytics` and the trackers' coach facts date WHOOP workouts with `start.slice(0,10)`. That's the **UTC** date, so an evening workout lands on the wrong day.
- Climbs are kept in `climbs` and also as `activities` entries with `sport: 'climbing'`.

**HealthInsights' rule:**
- Consume exactly what Fitness shows: export `allDone(true)` from Fitness as a pure builder.
- Add typed tracker activities only when `trainingDay`'s rule says they aren't already covered.
- Count climbs once per date.
- Date every device workout with `localDate(start, tz)`.
- Group light items (walks, stretching, meditation, or under 20 min) apart: they're reported but not counted as workouts.
- Existing modules with the UTC date aren't changed in this build. They're listed as a known issue.

## 13. Mockups (390 px; also 390 px dark and 320 px)

`docs/mockups/daily/screens.html`, photographed by `shoot.mjs` into `out/`. The PNGs aren't committed, as with the other mockups.

| Id | Shows |
| --- | --- |
| `#home` | Home: greeting, Talk, the **real** Health WHOOP card (`whoopHtml` + `recoveryContext`), **SYNC WHOOP**, Last synced / Sleep ended |
| `#sync` | Ready, Syncing, Updated, Nothing new, Couldn't reach, Reconnect, Just synced |
| `#stale` | Stale notice over the card; the card's existing reconnect state |
| `#listen` | Listening with a live transcript (final + grey interim), big **Done**, Cancel, Type instead |
| `#pause` | Natural pause: "Still listening…", the bar, "Reading it in a moment — or tap Done" |
| `#meal` | Lunch: items, kcal/protein/carbs/fat, "Does this look right?", **✓ Log meal** · Edit · 🎤 Change · Cancel |
| `#mealfix` | After "make the rice half a cup": changed row highlighted, new totals, still not logged |
| `#workout` | Upper body: straight sets + a superset (3 rounds), about 40 min, **✓ Create workout** · Edit · 🎤 Change · Cancel |
| `#insight` | "How did I do this week?": a short answer, six facts, a *Partial food data* confidence note, "Compare with last week ›" |

Checked: no horizontal overflow at 390 or 320 px.

## 14. Files expected to change (Phase 2)

**New:**
- `family/whoopCard.js`;
- `family/whoopSync.js`;
- `js/whoopPlan.js`, holding `dayContextForPlanning` moved out of `whoopDay.js`;
- `js/listen.js`;
- `js/proposal.js` (with the amendment reader);
- `js/healthInsights.js`.

**Changed:**
- `family/app.js`:
  - the Home WHOOP section and sync button;
  - `whoopModel`;
  - the Health WHOOP paths, through the controller;
  - `listenNow` using `listen.js`;
  - Talk's new inputs (health facts, meal and workout read/commit).
- `family/health.js`: re-exports from `whoopCard.js`.
- `family/deviceScreen.js`: `syncHere` returns a detailed result; Sync now goes through the controller.
- `js/whoopDay.js`.
- `family/talk.js`: listening UI, review cards, 🎤 Change, health answers.
- `js/talkParse.js`: `health.ask`, confirm/cancel/correction phrases.
- `js/talkActions.js`: `health.ask` as a read action.
- `js/talkDay.js`: `isDayQuestion` leaves past-period health questions alone.
- `family/meals.js`: estimate + commit exported, and the estimate sheet seeded from a draft.
- `family/fitness.js`: the done-list builder exported, and the editor seeded from a draft.
- `family/style.css`.

**Only if (e) is approved:** `server/aiGateway.js` and `server/talkAi.js` (`talk.health`), which means `pawdeploy`.

**Docs:**
- `README.md`;
- `server/helpGuide.js`;
- `family/tour.js` (`WHATS_NEW`);
- `family/privacy.html`, only if (e);
- `docs/ARCHITECTURE.md`;
- `docs/BUILD_PROGRESS.md`.

**Versions:** `scripts/bump-version.mjs` and `family/index.html` `?v=`.

## 15. Tests (Phase 2)

- **`tests/whoopcard.test.js`:**
  - Home and Health render byte-identical card HTML for the same model;
  - one model builder;
  - stale, reconnect, loading and empty states;
  - no Home-only store;
  - no battery field.
- **`tests/whoopsync.test.js`** (fake devices module and clock):
  - one in-flight sync, so a double tap means one request set;
  - the auto, tick and manual paths share it;
  - updated vs nochange vs error vs reconnect vs fresh;
  - old values kept while syncing;
  - 429 cool-down;
  - the last-synced time.
- **`tests/listen.test.js`** (fake recogniser):
  - several final segments;
  - interim text replaced;
  - the overlap guard (no duplicates);
  - pause timing (1.2 s / 2.5 s);
  - Done;
  - an unexpected end leads to a restart with the text kept;
  - a refused restart leads to Keep talking;
  - the 90 s cap and the 8 s with no words;
  - cancel;
  - `not-allowed` and `no-speech`.
- **`tests/proposal.test.js`:**
  - a meal or workout produces a proposal only, with no write before commit;
  - a spoken correction produces a new version (the rice ½ cup case; remove; add; meal change; sets);
  - the button and voice share `commit`;
  - exactly once, under concurrent calls;
  - cancel writes nothing;
  - expired can't commit;
  - a stray "yes" with no card does nothing;
  - the same for workouts.
- **`tests/healthinsights.test.js`:**
  - period ranges, including across midnight and weeks starting Monday;
  - counts;
  - coverage, including skipped meals with "done";
  - qualified days, where an incomplete day is **never** below target;
  - training counts, with a WHOOP + logged workout counted once and the device's own date for an evening UTC workout;
  - climbs counted once;
  - light activities apart;
  - weight trend, with a single weigh-in giving `insufficient`;
  - comparison thresholds;
  - confidence levels;
  - no AI call is made for any number.
- **Updates:**
  - `talkparse`: `health.ask` and confirm phrases;
  - `talkday`: "how many meals…" is no longer a day question;
  - `health`: the re-exports.
- **Browser check (Playwright, local Pages + `wrangler dev`, synthetic family with seeded WHOOP):**
  - Home card + Sync states;
  - Health parity;
  - 390 and 320 px, dark;
  - keyboard focus on the rings and button;
  - 44 px tap targets.
- **On-device check needed (yours):** iPhone PWA speech behaviour (continuous mode, restarts, pause timing).

## 16. Home performance

**Phones without WHOOP:**
- Home does exactly what it does today, plus one localStorage read for the sign-in.
- No new code is loaded and there's no new request.

**Phones with WHOOP:**
- **First paint is unchanged.** The card's space is reserved, so nothing shifts.
- **After first paint:**
  - one lazy chunk of about 12 KB gzipped (`whoopCard` + `whoopDay` + `workoutMatch`, after splitting out `whoopPlan`);
  - parsing `whoopDaily` (about 60 days);
  - rendering from the cache.
- **Network** only for the deferred auto-sync (at most every 20 min), or when you tap Sync.

**To measure in Phase 2,** on the same machine, old commit served from a worktree vs new:
- `scripts/perf/budget.mjs` cold and warm. The demo family has no WHOOP, so this should be unchanged.
- A WHOOP-seeded run: Home LCP, CLS, long tasks, requests at start and duplicates, and JS loaded at start.

## 17. Privacy

**WHOOP:**
- Nothing new leaves the phone.
- Home shows **your own** WHOOP from this phone, exactly as Health does. Recovery and Sleep stay in no shared part.
- The card's "private to you" line stays in the Last-7-days sheet.

**Speech:** unchanged. The phone's own speech service turns voice into text, and Pawmily gets words only.

**Proposals:**
- Held in memory until you confirm, never stored or sent.
- A correction re-read by AI sends the meal or workout text, exactly as *Tell me* / *Describe* do today.

**Health questions:**
- Answered on the phone from your own data.
- No calendar consent is needed and nothing is sent.
- **Only with (e):** aggregates, never meals, workouts or weights, go to Claude under a new allowlisted purpose. The privacy page would then be updated.

## Decisions needed

- **(a) Home order.** WHOOP right under Talk and above Next up and needs-attention (proposed), or needs-attention first when something is due today?
- **(b) Auto-sync on opening Home** (same 20-minute rule as Health, deferred until after paint): yes (proposed) or only on Sync?
- **(c) Pause-to-finish.** 2.5 s to start with (proposed), tuned on your iPhone.
- **(d) Qualified day.** "Done logging today" or all three main meals (proposed, stricter than today's 60% rule, which stays for the dots).
- **(e) AI phrasing for "why" questions:**
  - With it: aggregates only, through a new gateway purpose. Needs a Worker change and `pawdeploy`.
  - Without it: answers are deterministic sentences on the phone (proposed for this build, with (e) as a follow-up).
- **(f) Keep WHOOP's recovery `updated_at`**, so the card can say "Recovery scored 6:41 AM". It's small and additive.
