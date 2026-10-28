# OurPawmily Build Progress

Last update: 2026-10-28 — Phases 4–11 authorized (master build authorization); Phase 4 at Checkpoint A. Phases 0–3 merged to `main` (`510eacc`) and deployed.

## Current phase and task

- **Session authorization (2026-10-28, second):** Phases 4–11 (Us/Watch, Health/Diet, permissions, Fitness, AI gateway + text parsing, photo → workout, legacy-code migration, Devices), with checkpoints A–E, then a full-product review and STOP. No deploy, no merge to `main`, no Read/Discover. Branch: `v2/phase-4-11` (from `main` at `510eacc`).
- **Phases 0–3:** merged to `main` (PR #1, `510eacc`) and deployed (reported by the user).
- **Phase 4 — Us / Watch:** done, Checkpoint A passed (below).
- **Phase 5 — Health + Diet:** done (below).
- **Phase 6 — Family permissions:** done; Checkpoint B below.
- **Phase 7 — Fitness:** done; Checkpoint C below.
- **Phase 8 — AI privacy gateway + 💬 Describe it:** done; details below.
- **Next:** Phase 9 — 📷 photo/screenshot → Today's Workout (Checkpoint D).

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
| Branch | `main` (deployed); `v2/phase-2-3` (Phases 0–1 gaps, 2, 3 — not merged, not deployed) |
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
4. **Audit S3:** some fields still accept plaintext in encrypted families (pre-existing; not in Phase 0–3 scope beyond the new fields, which are sealed-only).
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
| Plaintext accepted in encrypted families for some older fields (audit S3) | OPEN (pre-existing) |
| Shared family key: permissions are server-enforced, not cryptographic | DOCUMENTED; future security project (docs/ARCHITECTURE.md §9) |

Privacy review of Phase 3 features: request and grocery text sealed with the family key on the phone; the server sees who asked/helps, kind, day, clock time, and grocery timestamps. Notifications carry only the kind and day (never the text). Thread search decrypts in memory only, no index, nothing sent. App feedback sends only what the person sees in the form, after *Send this*. Nothing from Phases 2–3 goes to AI providers. No family key reaches any third party.

## Remaining household-code dependencies

Pinned by `tests/dependencies.test.js`. Phase 2 removed every way to create, join or change a code. Still reading through an existing code (for phones that already shared one, until their move to the family): the trackers' sync (`js/sync.js` `follow`, push/pull), dog files shared earlier (`js/dogs.js` legacy URL, read and delete only), linked calendars of the trackers (`js/calTab.js`, `POST /ics {code,url}`), Recover's old copies (`js/recover.js`), and the legacy assistant route for people not signed in.

## Decisions needed

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
