# OurPawmily Build Progress

Last update: 2026-10-29 — Health/Fitness/Diet UX (H1–H12 with amendments) on `v2/health-ux`: H1–H11 done and checkpointed; H12 (Ask about my plan) next. Phases 4–11 and the Describe-it change are merged to `main` (PR #2 `d94c25f`, PR #3 `e9708af`) and deployed (reported by the user).

## Current phase and task

### Health / Fitness / Diet UX — H1–H12 (authorized 2026-10-29 with amendments 1–10; branch `v2/health-ux` from `main` `e9708af`)
- **Scope:** H1–H11 first, a checkpoint, then H12 (Phase B). Do not merge, do not deploy, stop for review.
- **Commits:** `72a5f9c` plan progress module; `1fd5089` Health command centre, Today's Workout / Train, program as input, names, filters, trackers changes; docs + checkpoint fixes in the next commit.
- **H1 / amendment 1 — Health is the day's command centre** (`family/health.js`): ⚖️ Weight (✓ 163.0 lb today · Weight trend →, or `[ lb ] Save`), 🥗 Nutrition (kcal / target, protein / target, plan line with status, Today's plan →), 🏋️ Fitness (title · N exercises · ~min · Start Workout →; in progress "x of y exercises · a of b sets" · Resume Workout →), Devices. No duplicated Meals or Fitness screens.
- **Weigh-in write path** (`editMine` in `family/app.js`): connect → pull (must have pulled once) → change `profileStore(owner).weights` → push → clear the shared cache. Refused up front in an encrypted family without the key. Verified in the browser: 179.4 saved on Health → trackers Meals shows "✓ Logged · 179.4 lb today" and Weight has it.
- **H2:** Today's plan → `../#today`; the weight line / sparkline → `../#weight`; Meals weigh-in card says ✓ Logged.
- **H3:** one calm line (`nudgeFor`, pure, tested; never scolds); opt-in 7 AM weigh-in reminder (`weighin` in `server/nudges.js`, a date only, no numbers in the notification; a Health weigh-in ticks it off).
- **H4:** Food subnav is Meals · Weight · Groceries; ▦ Scan a barcode at the top of Groceries, *‹ Groceries* on Scan, Groceries lit while scanning; `#scan` still opens Scan (verified).
- **H5 / amendments 2–4:** one workout model (`js/workout.js`, no new schema): Add (Build / Describe / Photo / Saved / 📋 Program) → Today's Workout (plan) → Start Workout (`active`, `startedAt`) → Train (plan per set, actual in `got`; "Set 1 — 8 × 70 (plan 10 reps · 65 lb) ✓") → Complete Workout → History (planned and actual). Supports straight/superset/circuit, rounds, per-set reps/weights, bodyweight, time, distance and new `perSide`. Lifting program = input (`js/programWorkout.js`): hidden behind a quiet "Set up a lifting program" until `lift.on` or past sessions; next program day with suggested loads; finished program workouts advance it and feed `suggestLoad`. Signed in, the trackers' lifting logger is hidden (tab label Activity, link to `family/#fitness`); its sessions stay in history. Active workout survives navigation and reload (`fam.fx.active.<fid>.<member>`, sealed; verified: save PUT blocked → reload → Resume Workout with the logged set; backup removed on Complete; no exercise name readable in localStorage).
- **H6 / amendment 5:** every Fitness screen has its parent on screen (‹ Health / ‹ Fitness / ‹ Today's Workout); trackers' header pill reads "‹ Health · Meals / Weight / Groceries / Scan / Activity" → `family/#health`; `#fitness` hash added. No `?from=` needed. Browser Back is never the only way out (Train → ‹ Today's Workout, bottom bar; trackers → header pill).
- **H7 / amendment 9:** research only, `docs/FUTURE_FEATURES.md` § Grocery ordering hand-off (DESIGN ONLY / NOT AUTHORIZED). **Limit:** provider domains were blocked from this sandbox; findings come from search excerpts restricted to official domains, marked "not confirmed" where unsure; re-read the cited pages before any decision. No retailer buttons.
- **H8:** history lists strength/circuit work (`W.isStrength`); other device activity → one line ("Also 2 other activities … (running, cycling) — not listed here, still counted in your Diet calories"). Verified with WHOOP functional-fitness / running / cycling.
- **H9:** `W.suggestName` ("Upper body circuit · 3 rounds", "Lower body · 3 exercises", one exercise → its name) as the editor's placeholder; used when untitled; Rename in the history sheet (older/device workouts get a renamed copy in the log, same id).
- **H10:** Build it / Describe it / Photo tiles each have a visible one-line description (WOD, coach's plan, screenshots); no hover-only help.
- **H11 / amendment 6:** `js/planProgress.js` (pure): week X of Y, days left, status On track / Behind plan / Ahead of plan / Too early to tell, reasons, estimate text ("At your recent estimated trend, reaching 168 lb by Jan 8 is unlikely."), one next step. Weak-signal gating: < 5 weigh-ins in this phase's last 21 days, < 10 days span, > 7-day gap with < 8 points, trend > 3 lb/wk or > 1.5 %/wk → Too early to tell; maintenance/break hold, gain inverted, no goal → no date, no planned rate → too early. Never changes targets (next step points to the approve-first check-in). Shown above Meals (with Why?) and as one line on Health.
- **Tests:** `tests/planprogress.test.js` (19), `tests/programworkout.test.js` (6), `tests/workout.test.js` (+6: per-side, progress, minutes, names, strength filter, program fields), `tests/health.test.js` (+2), `tests/nudges.test.js` (+1). `npm test` 2026-10-29: **378 pass, 0 fail**.
- **Browser checks (2026-10-29, local Pages :8098 + `wrangler dev` :8787 DEMO, seeded synthetic family, Chromium mobile 390 × 800 and 320 × 800):** the full amendment-10 flow — Health → weigh in → Meals ✓ Logged / Weight → nutrition status → Add Workout → Build it → Today's Workout → Start Workout → Train → record 8 × 70 → leave → Health "Resume Workout" → reload → Resume → Complete → history sheet → Rename; program setup → From my program; Describe it (phone) → Review with suggested name. No horizontal overflow at 320 or 390; no page errors. Fixed at 320: the "next round" marker squeezed names mid-word (now an inset bar; smaller inputs < 360 px).
- **Permissions:** unchanged server routes; new data rides existing parts (`weights` → Diet, `lift.on` → Fitness). Unit suites (`permissions`, `healthparts`, `devices`) pass; browser: Sam (shared both by Pat) reads Pat's diet/fitness parts and workouts (200) but not the full copy (403).
- **Performance (same machine, `scripts/perf/budget.mjs`, cold/warm, seeded family):** baseline `main` `e9708af` served from a worktree: 14 requests, 0 duplicates, CLS 0.007 / 0, start-up script 177 KB, paint 1288–1304 ms cold / 1024–1044 warm. This branch: 14, 0, 0.007 / 0, **178 KB** (+1 KB: weigh-in/editMine in `app.js`), paint 1340–1464 cold / 1012–1036 warm (cold run-to-run noise is ~±150 ms here; timings are only strict on the baseline machine). Within budget. Health/Fitness code stays lazy.
- **Known issues:** (1) family lazy modules import `../js/*.js` unversioned (pre-existing): for up to the host cache window after a deploy a phone could pair a new `fitness.js` with an old `workout.js`; self-heals; an import map in `family/index.html` would close it. (2) Trackers' two built-in profiles limit who can save a weigh-in from Health on a device (same as Devices); the message now says to open Today's plan once. (3) The trackers' header label is set when a tab opens, so a brand-new device shows "OurPawmily" until the first tab change after its account connects.

- **Session authorization (2026-10-28, second):** Phases 4–11 (Us/Watch, Health/Diet, permissions, Fitness, AI gateway + text parsing, photo → workout, legacy-code migration, Devices), with checkpoints A–E, then a full-product review and STOP. No deploy, no merge to `main`, no Read/Discover. Branch: `v2/phase-4-11` (from `main` at `510eacc`).
- **Phases 0–3:** merged to `main` (PR #1, `510eacc`) and deployed (reported by the user).
- **Phase 4 — Us / Watch:** done, Checkpoint A passed (below).
- **Phase 5 — Health + Diet:** done (below).
- **Phase 6 — Family permissions:** done; Checkpoint B below.
- **Phase 7 — Fitness:** done; Checkpoint C below.
- **Phase 8 — AI privacy gateway + 💬 Describe it:** done; details below.
- **Phase 9 — 📷 Photo → Today's Workout:** done; Checkpoint D below.
- **Phase 10 — legacy household-code migration:** done; details below.
- **Phase 11 — Devices / WHOOP / Garmin:** done; Checkpoint E below.
- **Final full-product review:** done (below). **Phases 4–11 are complete; stopped for review.** Not merged, not deployed.
- **Phase 4 amendment (📚 Read):** done (below); stopped for review.

### Describe it: Claude first (requested 2026-10-29, branch `v2/describe-claude`)
- **Change:** the Describe screen's main button is now **✨ Read it with Claude** (sends only the typed words, on tap; the privacy line sits under it), with **Read on this phone instead** as a link. Before, the phone always read first and offered Claude only when it couldn't place something — so the Claude option came and went, which was confusing.
- **Fallback:** if Claude isn't set up, you're offline, it fails, or finds no workout, the phone reads it and says why ("Claude couldn't read it just now, so your phone did."), with **Review it**. Without Claude on the connector, the screen shows a single **Read it** (phone).
- Only the button area updates once the app knows whether Claude is available (typed text is never wiped). Daily cap unchanged (40 a day per person).
- **Browser (390 px, mocked `/ai/workout`):** Claude OK → Review Workout, request body = `text, unit, today` only; Claude 502 → phone result with the note, Review it works; "Read on this phone instead" → Review Workout with no request to Claude. `npm test`: 344 pass.

### Phase 4 amendment — 📚 Read in Us (authorized 2026-10-28)
- **What's built:** 📚 Read is the second card on Us, directly under 📺 Watch (on screen at 390 × 844 without scrolling): for each of you, what you're reading/listening to now (two at most, "+N more"), your Want to Read count, **Open Books →**, **＋ Book**. Books view: **Reading** (by person) · **Want to Read** (yours first) · **Finished** (by year, ✋ Dropped folded underneath). Book details sheet: your status (Want to Read · Reading · Finished), 📖 / 🎧 / both, optional progress (% · page · chapter · minutes into an audiobook), ★ when finished, 💬 Discuss, ⋯ (Dropped, who sees it, series/narrator/length, take off my list, delete).
- **Quick logging:** Us › ＋ Book › type › pick › 📖 Reading / 🎧 Listening — **3 taps plus typing** (measured). Nothing bibliographic to type; *Add it by hand* exists for books the catalogue lacks.
- **Reading vs audiobook:** one canonical book; each person's state carries the format (`f: read | listen | both`). Audiobook details that belong to the book (narrator, length) are in its details (`audio`); the service (`svc`) and listening position (`p.min`) are the person's. Pat 🎧 63% and Sam 📖 28% on the same book, verified in the browser (Sam's add recognized "Already in your books").
- **Per-member state:** `state[bookId][memberId]`, written only through `PUT …/books/:id/me` by that person; tests show one person's change never touches another's.
- **Series:** `{ name, n }` from an Open Library edition (`"The Empyrean ; 1"`, `"Empyrean, #2"`, `"Book 5 of The Empyrean"` …) normalized by `parseSeries` and grouped by `seriesKey`; editable in ⋯ when the catalogue has none.
- **Authors / genres:** authors keep Open Library author ids (`OL…A`); genres are a small fixed vocabulary derived from noisy subjects (`genresOf`: fantasy, romance, romantasy, science fiction, …, nonfiction).
- **Public metadata source:** Open Library (search, work + editions, covers) through the connector, cached in Cloudflare's cache (not KV). Google Books was considered; it needs a key for useful quota and adds little for series. **Not verified live here:** Open Library is blocked from this sandbox (proxy 403), so search/details/covers were tested with fixtures and mocked network responses; check one real search after deploying.
- **Privacy boundaries:** book details sealed with the family key (verified: no title or author in the local connector's storage); state has ids and numbers only; Open Library gets only typed words / work ids / cover ids (test asserts nothing about the asker); covers proxied so Open Library never sees which covers a household views; default audience = the two of you, with Only me / Family; nothing goes to AI.
- **Scout foundation (not the engine):** `signals(books, state, member)` per person — authors (finished/reading/want counts), series (`finishedThrough`, `next`), genre weights from behaviour and ratings; `REASONS` with `kind: update | recommendation` and `explain()` text ("New in The Empyrean — you've read books 1–2", "New from Andy Weir, an author you've read", "Popular in science fiction you've been reading"); `reasonsFor(candidate, signals)` ranks a public candidate on the phone. Never a household blend.
- **Discuss → Threads:** `discuss('b:<bookId>', '📚 Title', 'Author · Series #n')` — one just-you-two thread per book, reopened every time (server dedupe by `ref`, tested; browser verified).
- **Book → screen later:** `bookRef(book)` = title, authors, Open Library work id, ISBN — what a Watch show/movie needs to say "based on a book you read"; no adaptation engine built.
- **Migration:** no structured book data existed anywhere (searched trackers, family app, server), so nothing was migrated; no private text was reinterpreted.
- **Tests:** `tests/books.test.js` (6): metadata/series/genres/junk; per-person state, formats, optional progress, Us preview, lists; per-person signals and explained reasons; Open Library search/ISBN/details/covers and what's sent; visibility (us/me/family), own-state-only writes, delete rules, strangers, leaving; encrypted family + one Discuss thread. `npm test`: 344 pass.
- **Mobile (390 and 320 px):** no horizontal scroll, every control named, tap targets ≥ 40 px; tab labels fixed to fit at 320; a cover that fails shows the 📚 placeholder.
- **Performance** (same machine): cold 14 requests, 0 duplicates, warm paint ~1.02 s, cold ~1.34 s (one outlier run 1.66 s with a long task), layout shift unchanged, start-up script **177 KB** (+1 KB: the lazy loader and Us hooks). Us gains one request (`/books`); covers only in Books/details, lazily.

### Final review (six perspectives)
Two independent reviewers (security/privacy; correctness) read `510eacc..HEAD` / `f4b3404..HEAD` without my notes; every finding below was traced in code before fixing.
- **Security/privacy — fixed:** (1) a signed-in phone could go back to uploading its full tracker copy to the household code after a 401 cleared its account record → `sync.household()` also refuses whenever a family sign-in token exists (test). (2) Daily AI caps weren't enforced for outing, tidy and bingo (bingo had no cap at all) → every route passes `underLimit`; cap refusals now say so (bingo 429 test; tidy returns the message instead of a 500). (3) Caller-chosen field names went into audit lines → only the count of dropped fields is kept. Audit S3 (partly): unsealed vaccine names on appointments → sealed on the phone, plaintext refused in encrypted families.
- **Security/privacy — documented, not changed:** the legacy `/assistant` route in `worker.js` (signed-out phones with a household code) isn't behind the gateway; the help chat's tool results (names, emails the help agent looks up) reach Anthropic outside the gateway's field list; family photo/document reads check family membership but not household areas (a member without Threads who knows a file id can still fetch it — they hold the family key anyway). Remaining S3 fields: bingo pack titles/squares, couples-picks names, Market borrower name, help-offer messages (all hidden or game features), member/pet avatar photos (sealing them would hide them from connected families — a product decision), and unsealed blob detection.
- **Correctness — fixed:** parser: "Bench 135x5" no longer means 135 sets (weight × reps), "x 135" no longer overwrites a stated set count, "RPE 8" / "rest 60" no longer become weights (they go to "couldn't place"), a stated set count wins over a shorter weight list (the rest left empty and flagged), "Monday 10/28" / "Week 3" headings aren't exercises (6th parser test). WHOOP: a day total belongs to the day the cycle wakes into (cycles start at bedtime); the "so far today" total only replaces the estimate once it's higher (a morning partial no longer freezes into the day's burn); device workouts use the local date; disconnect renews the token first so WHOOP's access is actually revoked; two apps renewing the same sign-in no longer falsely ask to reconnect. Fitness: "Read it with Claude" no longer stays disabled after an error, a late answer can't replace a draft you started meanwhile, and an offline moment no longer hides the Claude option or Devices until reload. Audit lines are one record per call (no lost lines, no oversized shared list).
- **Performance:** Watch moved out of the start-up script → **176 KB** (baseline 176; was 182). Cold 14 requests, 0 duplicates, paint ~1.33 s; warm layout shift 0 (baseline 0.007), cold first-ever 0.028 (known issue below).
- **Mobile/accessibility (320 px, all new screens: Health, Devices, Fitness, Describe, Review, Photo, Us, Watchlist):** no horizontal scroll, every control named, no duplicate ids; fixed two small tap targets (Fitness "Measured in" 31 → 40 px; note ♥/remove on Us 16 px → 44 px tap area). Keyboard: the photo picker is a real button (not a label), the Describe box is focused on open, status lines use `role=status`/`alert`.
- **Consumer design:** one primary action per screen (Read it / Review it / Add to Today's Workout / Connect WHOOP), no AI jargon in Fitness except the explicit "Read it with Claude" consent, honest unavailable states (Photo without Claude, WHOOP not set up, Garmin). What's New (`2026-12a`) tells existing members about Watch, Health, Fitness, Devices and who-sees-what.
- **Maintainability:** new code lives in small lazy modules (`health.js`, `fitness.js`, `deviceScreen.js`, `watch.js`, `js/workout.js`, `js/workoutText.js`, `js/devices.js`, `server/aiGateway.js`, `server/workoutAi.js`) with their own tests; `app.js` hands lazy modules their helpers once (`init`).
- `npm test`: 338 pass.

### Phase 11 — Devices (Checkpoint E)
**How WHOOP works now.** 💪 Health › *Devices ›* (or the trackers' 🔐 Privacy › Devices) › **Connect WHOOP** (shown only when the connector has `WHOOP_CLIENT_ID/SECRET`) → the phone makes a random `state` (kept in sessionStorage; `.f` = come back to the family app) → connector `/whoop/login` → WHOOP's own sign-in and consent page, scopes **`offline read:workout read:cycles`** (recovery dropped) → `/whoop/callback` exchanges the code with the client secret (which never leaves Cloudflare) → back to `family/#connect=whoop:<tokens>:<state>` (fragment only) → the phone checks the state (a sign-in that didn't start on this device, or a "no" on WHOOP's page, connects nothing) → tokens stored on this device under the owner's profile (`lp.p.<owner>.devices`; never exported, never in a Health part, never on the server) → the account copy is pulled, the last 14 days of workouts and day totals synced (all pages, `nextToken`), merged by WHOOP id, pushed (Fitness part). After that: a sync when the trackers open (≥ 10 min apart) and *Sync now*. Workouts → `workoutHistory` / `workouts` → 🏋️ Fitness history (`fromDeviceWorkout`) and today's calories; cycles → `deviceTotal[date]` → Diet's burn ("WHOOP (so far today)") unless a total was typed. Errors: refresh refused (400/401) or API 401/403 after one refresh → *reconnect* (Reconnect button); 5xx/offline → "couldn't reach WHOOP… tries again" (still connected). Disconnect → `/whoop/revoke` → WHOOP `DELETE /v2/user/access` (best effort), tokens deleted, workouts kept.
**How Garmin works now: it doesn't, and says so.** Garmin's Connect Developer Program (Health/Activity API) takes applications from businesses only — personal-use apps are rejected, commercial use needs a licence, and the program has been reported paused. The Garmin → Strava → app route was checked too: under Strava's API terms (June 2026) new apps start limited to their developer's own account (up to 10 athletes self-serve, more after review), need a paid developer subscription, and may not show one athlete's data to anyone else — which rules out sharing Garmin-via-Strava workouts with the family and makes it a poor fit. So Devices says "Not available. Garmin only opens its data to approved companies…"; nothing pretends to be connected. Phones that connected Strava before 2.0 can still disconnect it. Options are in Decisions.
- **Bugs fixed on the way:** new phones never synced at all (`syncDevices` required the pre-2.0 `devices.server` setting); tokens were stored under whichever profile was open (now always the owner's); the OAuth `state` was generated but never checked; a "no" on WHOOP's page gave a raw 500; only the first 25 workouts were read; a family-app-only device would have had no owner for its tokens (now resolved through the account) and must pull before pushing (it does — it can never upload a copy with only the new workouts).
- **Checkpoint E tests** (`tests/devices.test.js`, 9, phone code ↔ real worker ↔ fake WHOOP): connect (minimal scopes, client secret never in a URL, fragment only, back to family/, tokens not in the shared copy or any part, `/config` reveals only a boolean); forged state and "no" connect nothing and leave an existing connection alone; no data; a sync over pages with a duplicate and an unscored workout, day totals, re-sync adds nothing, data only in the Fitness part; expired sign-in renews; WHOOP down → still connected, recovers; access removed → reconnect, reconnect keeps history without duplicates; disconnect revokes, forgets, keeps workouts, also when WHOOP is down; server-side: nobody sees anything after connecting, Diet-only share → no workouts/burn, Fitness-only to Mom → Mom only, no token anywhere in what she gets. `npm test`: 335 pass.
- **Browser (390 px):** Health card "No device connected · Devices ›"; sheet with WHOOP (Not available yet / Connect WHOOP when configured), Garmin and Apple Health explained, privacy line; Connect → `/whoop/login?state=…f`; forged return → Health + "that sign-in didn't start here", nothing stored; good return (WHOOP mocked) → "⌚ 2 workouts brought in", card "WHOOP connected · synced Oct 28", account + Fitness part uploaded, both workouts in 🏋️ Fitness history.
- **Not verified here:** the real WHOOP service (no WHOOP app credentials in this environment; WHOOP's developer site isn't reachable from this session). The revoke endpoint (`DELETE /v2/user/access`) and the `next_token` field name are from WHOOP's v2 API as recalled and from secondary sources — check them on the first live connect (disconnect works locally either way).
- **Performance** (same machine): cold 14 requests, 0 duplicates, paint 1352 ms, script 182 KB (device UI is a lazy `family/deviceScreen.js`; the Health card line reads local storage only). Layout shift: warm 0 (was 0.007) after Next up remembers its height; cold first-ever visit 0.028 for the one person whose Next up has the two-line call reminder (time-of-day dependent; the same on the Phase 10 commit) — within the 0.05 budget, recorded as a known issue.

### Phase 10 — Legacy household-code migration
- **Privacy fix found while auditing:** before this phase, a signed-in phone kept uploading its *full* tracker copy (Diet, Fitness and Us together) to the household code until both partners shared everything both ways (`householdOff`). With Phase 6's per-part sharing, a Diet-only or private choice was therefore not binding on the old path. Now `sync.household()` (uploads) is false whenever `account.active()`; only phones that aren't signed in still upload the old way, unchanged.
- **Reads:** `householdReads()` keeps reading a partner who hasn't moved; `movedToAccount(profile)` skips anyone whose trackers are on their account in the family (their data comes only per their sharing). Both moved and sharing → the code isn't read at all (as before).
- **Dog files:** a file found only under the code is copied into the family file store (sealed with the family key) the first time a signed-in phone opens it; the old copy is kept until the person deletes the file.
- **Linked calendars (trackers):** signed in → `account.ics(url)` → `POST /v2/ics` (secret link in the body, account auth, 30/min); otherwise the legacy `/ics {code,url}`. Before, a signed-in phone without a code couldn't refresh linked calendars in the trackers at all.
- **Kept on purpose (not deleted):** the old copies under the code (readable with that code and by 🛟 Recover), the legacy endpoints, the legacy assistant route for signed-out phones. Signed-out phones: honest Privacy text "Still shared the old way… sign in to choose".
- **Tests:** `tests/legacy.test.js` (4: signed-out upload unchanged; signed in → no household PUT, old copy untouched, account updated, unmoved partner still read, moved partner never read even with a newer stale copy; dog file copied and old copy kept; calendars via account with the link in the body). `tests/account.test.js` updated to the stricter rule (no uploads while signed in, whatever is shared). `tests/dependencies.test.js` list: + `js/household.js` (reads the legacy state only to tell a signed-out phone). `npm test`: 326 pass.
- **Browser (trackers, both seed people, a legacy code set):** Sam's phone made 0 household writes and 1 read (Pat's old copy, before Pat connected); Pat's phone made 0 household requests. No errors.

### Phase 9 — Photo/screenshot → Today's Workout (Checkpoint D)
- **Flow:** Fitness › ＋ Add Workout › 📷 **Photo** → *Choose a photo or screenshot* → the picture is redrawn on the phone (canvas → JPEG, long edge ≤ 1600 px, orientation applied; EXIF/GPS/camera data gone) and shown → **Read it** (the only thing that sends) → "Reading… usually 5–20 seconds" → **Review Workout** (title "Read from your photo", ⚠️ "N things to check", unsure fields outlined amber, "Not placed: …") → correct → **Add to Today's Workout** → logger opens on round 1. Same model, same editor as Build/Describe.
- **Failure states:** connector without Claude → the Photo screen says so and offers Describe it / Build it, and the Photo button is hidden from then on; unreadable file (e.g. an unsupported format) → "Couldn't open that picture…"; Claude error/refusal/cut-off → "Couldn't read that photo — try a clearer one, or type it" (picture kept, retry possible); offline → "You're offline…"; 20 a day → the cap message; nothing found → toast "Couldn't find a workout in that picture". Leaving or choosing another picture while reading discards the late answer.
- **Checkpoint D tests** (`tests/photo.test.js`, 10, synthetic Claude answers): conventional/typed screenshot; the 4-round circuit + 3-round superset rep for rep (16 missing weights flagged, none on crunches); supersets with different weights; handwriting (doubtful name/rounds/reps flagged, best reading kept); missing weights/reps flagged even when Claude didn't flag them; bodyweight/timed/distance (a weight on a bodyweight move dropped); mixed reps and a round missing from the picture (blank, flagged, never copied); nothing readable → empty; the request = one image block + photo instructions + json_schema, refusal/max_tokens → failure; the route stores no picture, audits field names only, 413 over 3.5 MB, 400 on non-base64, 20/day → 429.
- **Browser (390 × 844, mocked `/ai/workout` + `ai: true` config; JPEG 2400 × 3200 with GPS + camera EXIF):** nothing sent before Read it; sent body = `image, mime, unit, today` only; JPEG 1200 × 1600, 68 KB, no `Exif`, no camera model; tap → Review 1.7 s (mock latency 1.5 s); 13 things flagged (12 weights + 1 name); corrected the name, added, logged round 1 ("1 of 18 sets"); no blob URLs left. Connector without Claude: honest screen, button hidden after. No page errors.
- **Not measured here (no API key in this environment):** real accuracy on real handwriting/whiteboards/screenshots and real latency. **Next step:** with `ANTHROPIC_API_KEY` on the connector, try 10 real photos (the list above) and record accuracy and seconds in this file.
- **AI cost (estimate, not measured):** a 1200 × 1600 picture ≈ 2,600 image tokens + ≈ 400 instruction tokens in; ≈ 1,500–4,000 tokens out (JSON + thinking at effort medium) → about $0.03–0.05 a photo at Sonnet 5.5 prices ($2 / $10 per M tokens); capped at 20 a day per person. Typed words at effort low: well under $0.01.
- **Privacy review:** explicit tap only; one redrawn picture + unit; Anthropic only (gateway `personal-image`); not stored on the connector (test), not in workouts, not in any other AI context; family key never involved; object URL revoked when leaving. Provider retention: Anthropic API — no training on API data by default; kept for a limited period for safety checks, then deleted (documented in privacy.html and ARCHITECTURE §6).
- **Answer to "can Pat screenshot a workout, correct it, add it and log immediately?"** Yes, in the tested flow: 📷 Photo → choose → Read it → fix the highlighted fields → Add → the logger is open on round 1. Real-photo accuracy still needs the live check above.
- **Performance** (same machine): cold 14 requests, 0 duplicates, paint 1356 ms, CLS 0.007, script 181 KB — unchanged; Photo code lives in the lazy `fitness.js`.

### Phase 8 — AI privacy gateway and natural-language workouts
- **Gateway** (`server/aiGateway.js`): purpose → field allowlist with size caps → minimized payload → the purpose's own provider (personal text/images: Anthropic only) → optional per-person daily cap → audit line (purpose, provider, field names, sizes, dropped names, ok/error, ms; never values; `aiaudit:<day>`, 30 days). Routed through it: the new `/ai/workout`, ✨ Tidy, 🧭 outing plan/swap (the phone's `job` hash is stripped first), 🤖 tracker commands (context narrowed to `day` + `exercises`), ❓ help chat, 🎲 bingo squares. Not routed: the scheduled scout/news jobs (public data only; documented in ARCHITECTURE §6).
- **💬 Describe it** (Fitness › Add Workout): `js/workoutText.js` reads the text on the phone — supersets ("superset with", +, &), "N rounds:" headers (one line or a header with lines under it), circuits, NxN, rep lists, weight lists, "@ 135", "same weight", bodyweight moves, times, distances, kg. Missing reps/weights stay null and are marked unsure; words it can't place come back as "unread" (and aren't turned into exercises). Clean → **Review Workout** directly; otherwise the screen says what it read and what it couldn't place, with **Review it** and (if the connector has Claude) **Read it with Claude** — explicit tap, words only. `/ai/workout` → `server/workoutAi.js` (`PARSE_MODEL`, Sonnet default; structured output json_schema; `toWorkout` keeps unsure marks and flags null reps/weights). Nothing is saved until **Add to Today's Workout**.
- **Tests:** `tests/workouttext.test.js` (5: the spec sentence → two 3-round supersets 165/55 and 45/45 with reps flagged; the 4-round and 3-round lists on separate lines and on one line, rep for rep; straight sets, weight lists, bodyweight, plank, run, bike, kg; circuits with counts first; unread/needsHelp). `tests/aigateway.test.js` (5: allowlist and caps; the run sees only the payload; audit has no values, including on failure; wrong provider refused before sending; daily cap; Claude answer → model; schema objects closed; the route: 401 signed out, extras never reach Claude, only audit/count keys stored, bad mime 400, provider down 502, no key 501). `npm test`: 312 pass.
- **Browser (390 px, wrangler dev, DEMO without Claude):** the spec sentence → Review Workout with 2 supersets × 3 rounds, 12 reps fields highlighted, weights 165/55/45/45; "Bench 3x10 @ 135 / warm up stuff 12" → "Read 1 exercise. Couldn't place: …" with Review it (no Claude button: connector has no key); "Not placed" line shown in the review. No page errors.
- **Performance** (`scripts/perf/budget.mjs`, same machine): cold 14 requests, 0 duplicates, paint 1296 ms, CLS 0.007, script 181 KB (Phase 7: 181 KB). The parser is loaded only when Read it is tapped; the config check runs only when the phone couldn't read something.
- **Privacy review:** what goes out — only the typed words + unit, only on tap, only to Anthropic; the family key never; nothing persisted but the audit line and a daily count (keyed by account id, values absent). Decrypted workouts stay on the phone. KV cost: up to 2 writes per AI request.

### Phase 7 — Fitness (Checkpoint C)

- **One workout model** (`js/workout.js`): Workout → blocks (straight / superset / circuit, rounds) → items → one set per round (reps, weight + unit, bodyweight, time, distance; planned target + what you did; `uncertain` field lists for parsers). Never invents: missing values stay empty and are marked; a superset with no stated round count is marked unsure.
- **Checkpoint C tests** (`tests/workout.test.js`, 7): conventional strength with a different weight per set; the 4-round circuit (12/12/11/11 · 12/13/14/13 · 10/11/11/11 · 12/11/11/11 · 26/24/22/24) and 3-round superset (lunge 40 lb 14/14/14 · lateral raise 20 lb 11/12/9) reproduced exactly; supersets with different weights; bodyweight; timed (plank); distance (row erg); cardio/activity; garbage input; editing, rounds, logging, completing, repeating; older lifting sessions and device workouts read unchanged; server records (owner-only writes, Fitness-sharing reads, stale copy refused, deleted on leave).
- **Today's Workout:** Health's Fitness card (Start / Continue, ＋ Add Workout, last workout) → Fitness: Today's Workout, Add Workout (✍️ Build it; 💬 Describe and 📷 Photo arrive in Phases 8–9), saved workouts, history with 🔁 Do it again today / Save it.
- **Builder / Review** (the same editor; AI-read workouts will open here with uncertain fields highlighted): name, parts with − / ＋ rounds, exercise names, per-round reps and weight (or bodyweight / time / distance), add exercise / superset / circuit; Add is enabled once nothing is missing.
- **Logging:** round by round, ✓ per set (with the numbers editable first), finished rounds fold (undo), Finish workout → history.
- **Storage:** two sealed records per person (`workouts:…:today`, `…:log`), owner writes with stale-copy protection (409), Fitness-sharing reads; batched saves (1.2 s, flushed when the app goes to the background).
- **Browser (390 px):** Build a 3-round superset with per-round reps/weights → Add to Today's Workout → log round 1 and a changed set → Finish → history, persisted across a reload. Found and fixed: Add stayed disabled after typing names; long names were cut off; ✓ wrapped below the inputs.
- **Performance:** Fitness is lazy (`family/fitness.js` 6.7 KB + `js/workout.js` 4.3 KB gzipped, loaded on Health/Fitness only). Start-up: 14 requests, 0 duplicates, CLS 0.007, paint ~1.31–1.33 s, script 181 KB (+1 KB wiring).

### Phase 6 — Family permissions (Checkpoint B)

Model: Google account → Family → Membership → Permissions. No household code anywhere in signed-in use.
- **Household areas** (`member.access`, creator only): Home, Calendar, Threads; absent = all (every pre-2.0 member keeps everything). Chosen when the creator adds a person and on each person's page (🔑 What Pat can use). Server: one guard for all area routes, plus thread list / connected threads / tagging / shared-file / request-notification checks. Client: hidden tabs, Home shows only your own day without Home, no requests for dogs data without Home.
- **Diet / Fitness** (Phase 5 parts): private by default; each person sets two lists; legacy `shareWith` copied into both until changed; nobody (creator, inviter, partner) can grant themselves another person's Health; Us part partner-only.
- **Limitation (documented, ARCHITECTURE §9):** permissions are server-enforced; every device holding the family key could decrypt ciphertext it obtained. Per-person/per-area keys are a future security project — the frozen key architecture is unchanged.

Checkpoint B matrix (`tests/permissions.test.js`, `tests/healthparts.test.js`, `tests/home.test.js`):

| Case | Result |
| --- | --- |
| Diet only / Fitness only / both / neither (Pat, Mom, a kid) | each part follows its own list; private by default |
| Full copy after split | owner only (403 for others) |
| Creator / inviter / partner granting themselves Health | 403 |
| Writing someone else's parts | 403 |
| Us part | partner 200, everyone else 403 |
| Stranger / another family's address | 404 |
| Old records (no `access`, single `shareWith`, not split) | all areas; full copy readable as before |
| Areas: ordinary member or self changing access; shrinking the creator | 403 |
| Area excluded (Home, Threads) | 403 on home, requests, groceries, chores, care, appts, dogstats, threads POST, albums; `/threads` list empty; not taggable; Calendar allowed |
| Areas vs Health | independent |
| Restoring all areas | `access` removed (= everyone else) |
| Member who left | 404, removed from everyone's lists, parts deleted |
| Child | no requests; nothing of others' Health unless shared |

Security review of Phases 5–6 (independent, 2026-10-28) — fixed in the commit after `19cf56a`:
1. **HIGH — Us part readable by any spouse/partner for non-partners (incl. kids), and by others after the creator left** (`partnerOf` falls back to "someone"). Fixed: `isCouple` — creator + their spouse/partner, mutual, never a child. Test added.
2. **MEDIUM — old feed posts (shown on Home) not gated by Home** (`/feed`, `/families/:fid/posts`, `/posts/:fid/:id`). Fixed: `posts` → Home in the guard; `/feed` and post actions only through families where you have Home. Test added.
3. **LOW — notifications to excluded members** (calendar reminders, dog appointments/vaccines, golden day, thread replies). Fixed: reminders by area, `adultsOf(…, area)`, followers filtered by Threads.
4. **LOW / documented** — before a person's phone first splits, members in both lists read the full copy (as before 2.0); phones still on a household code upload the full profile under it (Phase 10).

Browser (390 px): creator toggled Pat's Home and Threads off on Pat's page → Pat's bar: Home · Us · Calendar · Health; Home shows only Next up and a short note; Calendar works; no 403s at start-up (dog data isn't requested without Home). Security review: see Security findings.

### Phase 5 — Health and Diet

- **Health tab** (`family/health.js`, lazy): 💪 Health in the bottom bar now opens a screen in the family app (before: a link to the trackers). 🥗 Diet: phase + week, goal and lb to go, today's kcal and protein against targets (from today's tracker record, else the plan's own `dailyTargets`), carbs/fat left, weight (one decimal) with a 90-day line and lb/week trend for the current phase, **"N of the last 7 days on target"** with 7 dots. 🏋️ Fitness: workouts in the last 7 days and Training › (Phase 7 replaces this card). *Log food* / *Plan & weight ›* open the trackers' screens directly (`../#today`, `#weight`, `#lift`… new hash routes).
- **Calm feedback replaces the coin economy:** one rule (`js/dietDays.js`): a day counts once its meals are logged (3, or ≥60% of target); on target within ±10% of that day's calories (≥150 kcal). The trackers' 🪙 / 🍪 / 🔥 bar, coin totals, "earn 🪙" lines, badges and coin icons are gone (✓ marks a day that finished where the plan wanted); saved coin data is untouched (still in `days.csv`).
- **Diet / Fitness / Us split** (`js/healthParts.js`): each phone saves its tracker copy as three sealed parts (sent only when changed; uploads queued so two syncs don't write twice). Readers use the parts: the trackers' partner view (`account.pull`), the family app's person page (Diet + Fitness) and Us' 2-2-2-2 / ratings (partner's **Us** part — before, the rhythm only merged if the partner shared all their diet & fitness). Full copy becomes owner-only once parts exist; until then a member who could see everything still can (no one gains access). Data migration: none destructive; original record kept and still written.
- **Sharing UI:** two switches per person (🥗 Diet, 🏋️ Fitness) in Me › 💪 Who can see my Health and from the Health title line (Phase 6 enforcement in the server already, tests in Checkpoint B).
- Tests: `tests/health.test.js` (on-target rule, 7-day count, summary incl. not-set-up, no coins, escaping), `tests/healthparts.test.js` (split, legacy list until split, Diet-only, Us partner-only, no self-grant, no foreign writes).
- Browser (390 px): Health renders for Sam (Cut · week 3 of 8 · goal; 4 of 7 dots), sharing sheet with two switches per person; Health tab made **0 extra requests** (reuses Home's cached copy); trackers food screen shows "✓ 4 of the last 7 days on target", no coins; Sam's phone wrote the three parts once; Pat's phone read Sam's parts (not the full copy).
- Performance (fresh seed, 3 runs): start-up 14 requests, 0 duplicates, CLS 0.007, cold paint 1.32–1.43 s, **script 180 KB** (+4 KB since Phase 3 — new code in `app.js`; Phases 7+ go in lazy modules and Watch moves out of `app.js` in the final review).

### Phase 4 — Us and Watch (Checkpoint A)

| Item | Before | After |
| --- | --- | --- |
| Watch on Us | last card ("🍿 tonight's show"), below For you, Notes, Notebook, Plans, Ideas, Outing, 2-2-2-2 | **first card**, inside the first screen at 390 px (y 135–442 of 844); ready ~150–220 ms after tapping Us |
| What it shows | one show | "2 watching · 2 want to watch", up to 3 shows (🆕 new episodes, then most recent Watching, then ⭐ Up Next) with one action each, **Open Watchlist →**, ＋ Add |
| Us sections | 9 | 5 + a notebook link: 📺 Watch, For you (only answers needed), ❤️ Dates (plans + 2-2-2-2 + Suggest / Outing / Log a date + recent outings), ✨ Ideas for Us (3 curated), 💌 Notes, 📓 notebook → Threads |
| Show card | status, ＋ Episode, Set…, We watched tonight, 5 stars, 3 status buttons, Bingo, share, Delete | service, title, state line, **one action**, ••• → details |
| Watchlist | Now · By month · Year recap | Watching · Want to Watch (⭐ Up Next, Later) · Watched (history, month by month, recap, ✋ Dropped) |

State mapping (stored → shown → primary action), nothing rewritten:

| Stored `status` | Shown | Primary action |
| --- | --- | --- |
| `want` (new) | Want to Watch | ＋ Watched an episode (→ Watching) · movie: ✓ We watched it (→ Watched) |
| `upnext` | Want to Watch, ⭐ Up Next | same |
| `watching` | Watching · S·E | ＋ Watched an episode (next episode; next season only when TMDB's season list says so) |
| `finished` | Watched | ☆ Rate it (if you haven't) |
| `dropped` | in Watched › Dropped (recoverable) | — (details) |
| none (older records) | show → Watching, movie → Watched — unchanged from before | as above |

- One action = one `PATCH {status?, progress, night}`; a second episode the same night keeps the night (the old toggle could remove it). A show is marked Watched only by the user; when TMDB says the show has ended and this was its last episode, the app asks.
- Data migration: none needed — the server accepts `want` and a starting status on add; history (nights, progress, ratings, status timestamps) untouched; old clients keep working (`upnext`/`watching`/`finished`/`dropped` still valid).
- 💬 Discuss (show details, date-idea sheet, matches): one thread per item (`ref`), just-us; Recommendation → 💗 Interested → 💬 Discuss → Make it a plan → both say yes → Calendar. No comments inside Watch.
- Home: no Watch requests at start-up (checked); ✨ Next up already suggests shows with new episodes — no second Watch on Home.
- Mobile verification (Playwright, 390 × 844, light and dark): Us opens with Watch on screen; ＋ Episode logs S2 E3 → E4 with tonight; Open Watchlist one tap; Up Next, Drop/recover, Discuss (opens and re-opens the same thread) work; no page errors. Tests: `tests/watchlife.test.js` (state mapping, next episode/finale, one action, preview, server status/night, Discuss ref).
- Privacy: titles/services stay sealed; `ref` is an id or a keyed hash, never a title; Discuss threads are just-us.
- Performance (fresh seed, 3 runs): start-up 14 requests, 0 duplicates, CLS 0.007, cold paint ~1.32–1.36 s (one 1.58 s outlier), script 178 KB (+2 KB); tab switches Us 3 (+ TMDB lookups when configured), Calendar 2, Threads 0, Photos 2, Home revisit 4. Episode lookups stop after a 501 (no TMDB key) instead of firing one per show.

## Last safe commit, deployment and rollback

| Item | Value |
| --- | --- |
| Last verified safe commit | `main`: `e374c81` (deployed). Work branch `v2/phase-2-3`: see the evidence log (CI per commit) |
| Branch | `main` (deployed, Phases 0–3); `v2/phase-4-11` (Phases 4–11 + final review — not merged, not deployed; deploy order: `pawdeploy` the Worker and merge to `main` back to back) |
| Pages (front end) | deployed from `main` at `e374c81` — "pages build and deployment" run green |
| Worker (connector) | NOT deployed with Phase 0–1 yet (needs `git pull` + `pawdeploy`) |
| App rollback | revert the Phase 0–1 merge range on `main` and push (Pages redeploys) |
| Worker rollback | `npx wrangler rollback` in `server/` |
| Data migrations | none; nothing deleted. New KV records `fileby:<fid>:<pid>` (uploader per new file), `report:<fid>:thread:<id>` / `report:<fid>:chat:<cid>`, and (Phase 3) `requests:<fid>`, `groceries:<fid>`. Old feed posts untouched; the server just stops adding to the feed. |
| Deploy order for `v2/phase-2-3` | Worker first (`pawdeploy`: new routes `/home`, `/requests`, `/groceries`, `POST /v2/ics`, reply edit), then merge to `main` (Pages). An app without the new Worker shows Needs you / Groceries as "Couldn't check just now" and can't add. Between the two steps, linked calendars (family and trackers) don't refresh: the new Worker only accepts the link in a POST body (S1), the live app still sends GET; phones keep showing their cached copies. Do both steps back to back. |

## Deployment facts (verified)

- Pushing or merging to `main` deploys the front end to GitHub Pages ("pages build and deployment" runs on every push to `main`). Other branches don't deploy.
- The Worker deploys only when the user runs `pawdeploy` (wrangler deploy) on their computer.
- Every push runs the Check (`.github/workflows/check.yml`): tests, link check, performance budget.
- Phase A (`perf/phase-a`, `c20b8f2..0c35063`) was pushed to `main` at the start of Phase 0, before the user's "do not deploy automatically" instruction arrived. It is client-only.

## Completed implementation

### Phase 0 — safety net

| Change | Commit | Evidence |
| --- | --- | --- |
| Phase A integrated (shared reads, deferred work, parallel start, tap targets, placeholders) | `c20b8f2`..`0c35063` | `tests/shared.test.js`; measured 30 → 18 start-up requests |
| Sign-in requires `email_verified === true` (or `"true"`); tokens issued > 5 min in the future refused | `c0f82f0` | `tests/family.test.js` |
| Outings and stop swaps use Claude only (never Gemini's free tier) | `c0f82f0` | `tests/search.test.js` |
| Per-file authorization: uploader record; replace/delete by uploader or family creator; legacy files replaceable only by the creator; attach only your own files (posts, thread shots/PDFs, albums, chat, market); connected families must name the shared post/thread (`?in=`), no private-tagged posts, nothing after disconnect | `1aaa8d1` | `tests/fileauth.test.js` (4), `postphotos.test.js`, `threads.test.js` |
| Report and block in Threads (thread or reply) and Chats (message; member block) | `ece9656` | `tests/report.test.js` (2); checked in a browser (thread ⋯ menu, reply ⋯, chat message sheet) |
| Performance budget in CI (`scripts/perf/`) | `39a7ee8`, `4dda95d` | CI "perf" job green on `main` |

### Phase 1 — navigation and simplification

| Change | Commit | Evidence |
| --- | --- | --- |
| Five tabs: Home · Us · Calendar · Threads · Health; Home = greeting, Next up, Your day, Today, Gold Card, house, dogs; Threads with Threads / Photos tabs | `0e75cc3` | `tests/dependencies.test.js`, `tests/tour.test.js`; screenshots (phone 390 px) |
| Feed hidden (posts kept), ＋ Post / Ask for help removed, `#feed` / `#dogs` → Home | `0e75cc3` | browser check of old links |
| News and rescue news hidden; no client fetch; server edition only with `NEWS_ON` | `0e75cc3` | `dependencies.test.js`; start-up request list has no `/news` |
| Health meter retired (`js/fight.js` removed; saved data untouched) | `0e75cc3` | — |
| Family app server setting decoupled from `lp.g.sync` (`js/server.js`, `fam.server`) | `0e75cc3` | `tests/server.test.js` (2) |
| Household code removed from all normal UI (list below) | `49ad779` | `dependencies.test.js`; browser check of trackers Privacy and Devices, signed in and out |
| Devices: no connector URL, README text, CSV imports or code; WHOOP only when `/v2/config` says it's set up; Garmin "Coming later"; Strava only to disconnect | `49ad779` | browser check |
| Docs: README, help guide, ARCHITECTURE (security items, future security project), privacy policy, server README | `f4896ca` | — |

Household-code surfaces removed: trackers Privacy code card (show/send/change); "partner changed the code" pop-up; code-sharing advice; partner "Link phones" box and banner links; `#link=` one-tap joining; Devices household sharing section, connector URL and README text; calendar subscribe link (it carried the code); code wording in Recover, the assistant tip and the calendar error; README mentions on the family sign-in and Google Photos messages.

### Review fixes (`03cbd76`)

| Finding | Fix | Evidence |
| --- | --- | --- |
| Leaving a family deleted your threads/posts in another family you still belong to, when the two were connected | Connected families are cleaned only if you can no longer reach them (`stillReaches`) | `tests/deletion.test.js` (fails on the old code) |
| Account deletion with your own family deleted left your replies/comments in friends' families | Clean connected families before `deleteFamily`; full clean on account deletion | `tests/deletion.test.js` (fails on the old code) |
| Request "time" stored as free plain text in encrypted families | `HH:MM` only; time picker | `tests/home.test.js` |
| Kids could see/claim requests (server) | 403 / empty list for kids | `tests/home.test.js` |
| Leaving released claimed requests only if you had your own; `DELETE /members/<self>` skipped clean-up | Always released; self-removal = `/leave` | `tests/home.test.js` |
| "Last reply by" kept a removed person's name | Recomputed | `tests/deletion.test.js` |
| Dog files opened (and were cached) as locked bytes on a device without the key | `account.getFile` returns nothing there | code review |
| Reply images uploaded unlocked from a device without the key | Reply/edit refused there | code review |
| Double-send of reply / edit / feedback / Ask | Button disabled while sending (`busy`) | browser |
| Search of only spaces looped; highlight broke `&amp;` | Trimmed check; highlight before escaping | browser |
| 💡 App feedback board couldn't receive threads | Board in composer and Move; composer defaults to the open board | browser |
| Next up didn't refresh after reminder changes; call-Mom line and reminder settings lost with the Today / Your day cards | `refreshDay`; call line in Next up; Me › ✨ Next up & reminders | browser |
| 320 px: page scrolled sideways (care log); ✕ buttons 36 px; reply image picker not keyboard-reachable | Wrap; 44 px; visually-hidden input | browser (`a11y3.mjs`: no overflow at 320/1280, no unnamed or < 40 px controls on Home) |

## Tests

- 2026-10-28, `npm test` at `03cbd76`: **277 tests, 277 pass, 0 fail** (66 files). Earlier: 261/261 at `e374c81`.
- CI Check green on `main` (`f4896ca`, `e374c81`) and on `v2/phase-2-3` at `87452a5`, `29d83da`, `29b6939` (test, links, perf). `03cbd76`: green too.
- Authorization matrix covered: file uploader/creator/other member/child/connected family/stranger/after disconnect; thread and chat report/block. Requests: cross-family 404, kids 403, author/helper/owner rules, leaving. Household-area and Diet/Fitness permission tests: NOT STARTED (Phase 6).
- Mobile checks done: 390 px Home, Threads, Photos, Calendar, thread report menu, chat report sheet, trackers Privacy and Devices. Phase 3: Home at 390 px light and dark, 320 px and 1280 px (no sideways scroll), ask sheet, Needs you as helper, More about the dogs; keyboard: grocery add with Enter, Tab to the first tick. NOT VERIFIED: a real screen reader (VoiceOver/TalkBack), real iPhone/Android devices.

## Performance

Method: `scripts/perf/budget.mjs` — synthetic family (`scripts/perf/seed.mjs`) on `wrangler dev` (demo sign-in), Pages-like server, 390 × 844 phone, 4× CPU, 120 ms latency, 6 Mbps; requests in the first 6 s (photo files counted separately); medians of 3–5 runs on the same cloud machine, same session.

| Metric | `main` before 2.0 (`0c35063`) | After Phase 0–1 | After Phase 3 + review (`03cbd76`) |
| --- | --- | --- | --- |
| Start-up API requests (cold) | 18 | 17 (+1 one-time vaccine `PUT`) | **14** (vaccine dates checked once a day, 8 s after start) |
| Duplicate requests | 0 | 0 | 0 |
| Cold first / largest paint | 1.33 s / 1.33 s | 1.34 s | 1.31–1.40 s (median ~1.33 s, 5 runs) |
| Warm first paint | 1.06 s | ~1.06 s | ~1.03 s |
| Layout shift (cold / warm) | 0.035 | 0.005 | 0.007 / 0.007 (fresh seed with a request and 4 groceries) |
| Long tasks (cold) | ~490 ms | ~540 ms | ~450–580 ms (median ~510 ms) |
| Start-up script (gzipped) | 174 KB | 174 KB | 176 KB |

Tab switches after Home (requests, `tabs.mjs`): Us 3, Calendar 2, Threads 0, Photos 2, back to Home after > 20 s **4** (was 8).

Known limit: on a phone's very first visit, a Needs-you list much longer than the default reserved height shifts the page (measured 0.23 with ~6 requests); every later visit reuses the stored card height (a number only).

On GitHub's runner (perf job): cold 18 requests, first paint 1.25 s, 0 duplicates.

## Known issues and gaps (open)

Closed since the Phase 0–1 gate: feed → Threads notification label (`5c02573`), S1 (`5c02573`), tab-switch budget (Home revisit 4, Us 3), start-up ≤ 14, account deletion of threads (`1a31356`), hidden-feed writes (`3d38ca0`), Ask for help (Requests, `3d38ca0`), seed tracker profile crash (`87452a5`).

1. **Long tasks** ~510 ms median vs ~490 ms before 2.0 (within run-to-run noise of ±60 ms on this VM; not proven fixed).
2. **First-visit layout shift** with a long Needs-you list (see Performance).
3. **Concurrent edits to Home lists** (`requests:`, `groceries:`) are read-modify-write in KV: two simultaneous claims or adds can lose one (last write wins). Same pattern as chores and appointments. Low risk for one household; a fix would move the lists into the family's Durable Object.
4. **Audit S3:** partly fixed in the final review (appointment vaccine names sealed); the remaining fields are listed under Final review — mostly hidden features, plus avatars (a product decision).
10. **Cold first-visit layout shift 0.028** (budget 0.05; warm 0): only for the person with the 📞 call reminder when it wraps to two lines (time-of-day dependent); Next up remembers its height after the first visit.
11. **Real-world checks not possible here:** WHOOP live connect/sync/revoke (no WHOOP credentials; developer site unreachable from this session), Claude reading real photos and real typed workouts (no API key), help chat after deploy.
12. **A member without 📖 Threads also loses the couple's just-us notebook** (its threads are `aud: 'us'`) — decide whether the notebook should follow Us instead.
5. **Deploy window:** between `pawdeploy` and merging to `main`, linked calendars don't refresh (S1 changed the request shape). Do both back to back.
6. **A dog document deleted by someone other than its uploader** is removed from the dog's record, but the file stays in the store (the server refuses the delete: 403 by design).
7. **Trackers code** (`js/storage.js` built-in profiles) contains real first names — pre-existing, not shown in the family app; out of Phase 0–3 scope.
8. **The trackers' own grocery list** (built from the meal plan) is separate from Home's shared list until Health moves into the family app (Phase 5).
9. **Help chat answers** after deploy: NOT VERIFIED (needs the deployed Worker).

## Security findings

| Finding | Status |
| --- | --- |
| Connected-family photo access (any ID) | FIXED `1aaa8d1` |
| `email_verified` missing counted as verified | FIXED `c0f82f0` |
| Outing free text → Gemini free tier | FIXED `c0f82f0` |
| Per-resource file authorization (audit S2) | FIXED `1aaa8d1` |
| Linked calendar secret in query string (audit S1) | FIXED `5c02573` (POST body, family and trackers) |
| Leaving a family wiped your content in another family you belong to (connected) | FIXED `03cbd76` |
| Account deletion left replies in friends' families when your family was deleted | FIXED `03cbd76` |
| Request time as unsealed free text | FIXED `03cbd76` |
| Kids could read/claim requests | FIXED `29b6939` |
| Reply images uploaded unlocked from a keyless device | FIXED `03cbd76` |
| Plaintext accepted in encrypted families for some older fields (audit S3) | PARTLY FIXED (vaccine names, final review); rest listed under Final review |
| Signed-in phone could resume household-code uploads after a 401 | FIXED (final review) |
| No daily AI cap on bingo / outing / tidy | FIXED (final review) |
| Caller-chosen names in AI audit lines | FIXED (final review) |
| WHOOP OAuth state not checked; tokens under the open profile | FIXED (Phase 11) |
| Signed-in phones uploaded the full tracker copy to the household code | FIXED (Phase 10) |
| Us part readable beyond the couple; old posts without Home | FIXED (Checkpoint B) |
| Photo/document reads don't check household areas | OPEN (low; documented) |
| Legacy `/assistant` and help-tool results outside the AI gateway | OPEN (low; documented) |
| Shared family key: permissions are server-enforced, not cryptographic | DOCUMENTED; future security project (docs/ARCHITECTURE.md §9) |

Privacy review of Phase 3 features: request and grocery text sealed with the family key on the phone; the server sees who asked/helps, kind, day, clock time, and grocery timestamps. Notifications carry only the kind and day (never the text). Thread search decrypts in memory only, no index, nothing sent. App feedback sends only what the person sees in the form, after *Send this*. Nothing from Phases 2–3 goes to AI providers. No family key reaches any third party.

## Remaining household-code dependencies

Pinned by `tests/dependencies.test.js`. **After Phase 10:** signed-in phones never write to the code; they read only partners who haven't moved; old dog files move to the family store on first open; trackers' linked calendars use the account. What's left uses the code only for signed-out phones (sync, files, calendars, assistant) and 🛟 Recover. Removing the old copies and endpoints is a decision (below). Phase 2 removed every way to create, join or change a code. Still reading through an existing code (for phones that already shared one, until their move to the family): the trackers' sync (`js/sync.js` `follow`, push/pull), dog files shared earlier (`js/dogs.js` legacy URL, read and delete only), linked calendars of the trackers (`js/calTab.js`, `POST /ics {code,url}`), Recover's old copies (`js/recover.js`), and the legacy assistant route for people not signed in.

## Decisions needed
- **Garmin (Phase 11):** no direct integration is possible for a personal app (Garmin's program is business-only). Options: (a) leave it "Not available" (current); (b) apply to Garmin's program as a business if that ever applies; (c) Garmin → Strava with a paid Strava developer tier, limited to your own household's accounts and with Strava workouts kept out of family sharing; (d) wait for the iPhone app and read Garmin workouts from Apple Health. Recommendation: (a) now, (d) later.
- **WHOOP live check:** set `WHOOP_CLIENT_ID/SECRET` (scopes `read:workout read:cycles offline`; untick `read:recovery`) and try connect → sync → disconnect once after deploying.
- **Old household copies (Phase 10):** the last tracker copies and dog files stored under household codes are still on the connector (readable by anyone with that code, and by 🛟 Recover). Options: keep until every phone has signed in (current), or delete them after a date you choose. Deleting is irreversible, so it waits for your approval.

- Deployment of `v2/phase-2-3` (Worker via `pawdeploy`, then merge to `main`).
- Authorization for Phase 4 (not started).
- Optional: whether Home lists should move to the Durable Object to remove the concurrent-edit gap (issue 3).

## Evidence log

| Date | Scope/claim | Commit/files | Command or inspection | Result/limitation |
| --- | --- | --- | --- | --- |
| 2026-10-28 | Phase 0–1 tests | `e374c81` | `npm test` | 261/261 pass |
| 2026-10-28 | CI | `f4896ca`, `e374c81` on `main` | GitHub Actions "Check" and "pages build and deployment" | all green |
| 2026-10-28 | Performance before/after | `0c35063` vs `0e75cc3`+ | `node scripts/perf/budget.mjs` ×3–5, same machine | table above; cloud VM, timings ±10% |
| 2026-10-28 | UI | phone 390 px | Playwright screenshots of Home, Threads, Photos, Calendar, thread/chat report, trackers Privacy/Devices | no page errors in the family app |
| 2026-10-28 | Worker deploy | — | not run (user action) | pending |
| 2026-10-28 | Phase 2–3 tests | `03cbd76` | `npm test` | 277/277 pass |
| 2026-10-28 | CI | `87452a5`, `29d83da`, `29b6939`, `03cbd76` on `v2/phase-2-3` | GitHub Actions "Check" | green (test, links, perf) |
| 2026-10-28 | Performance after Phase 3 | `03cbd76` vs Phase 0–1 numbers | `node scripts/perf/budget.mjs` ×5 on a fresh `seed.mjs` family; `tabs.mjs` | table above; same VM, ±10% |
| 2026-10-28 | Review | `e374c81..03cbd76` | independent server security/privacy and client QA reviews; findings verified in code, fixed, tests added | see Review fixes |
| 2026-10-28 | UI | 390 px light/dark, 320 px, 1280 px | Playwright: `home3.mjs`, `a11y3.mjs`, `fix3.mjs` (scratch) | no page errors; no sideways scroll |
