# OurPawmily Build Progress

Last update: 2026-10-28, Phase 3 implemented; second-pass review of Phases 0–3 in progress. Evidence below was checked against the repository (commits, tests, CI runs, local measurements). Items marked **NOT VERIFIED** or **UNKNOWN** were not checked.

## Current phase and task

- **Session authorization (2026-10-28):** Phase 0–1 gaps → Phase 2 → Phase 3 → full review of Phases 0–3, then STOP before Phase 4. Work happens on branch `v2/phase-2-3`; nothing is merged to `main` (deploy) without approval.
- **Phase 0 + Phase 1:** complete, merged to `main` at `f4896ca` (deployed to Pages). Worker deploy (`pawdeploy`) by the user: pending/unknown.
- **Phase 0–1 gaps:** done on `v2/phase-2-3`:
  - account deletion / leaving a family deletes the person's threads and replies; deleting a family deletes its threads (`1a31356`);
  - calendar links never in a URL — audit S1 — and thread notifications relabelled "📖 Threads" (`5c02573`);
  - tab switches re-measured on a stable server: Us 3, Calendar 1, Threads 0, Photos 2; returning to Home after > 20 s still 8 → handled with the Phase 3 Home redesign, as are long tasks.
- **Phase 2:** done (`87452a5`): no code is ever created/joined/changed; dog documents and adoption photos go to the family file store (sealed); browser check shows no `/household/` requests for a signed-in phone without a code.
- **Phase 3:** implemented on `v2/phase-2-3`:
  - Threads (`29d83da`): 🔎 search on the phone, ☆ Save / ★ Saved, ✎ edit your replies, 📷 up to 4 images on a reply, 💡 App feedback board with an explicit "send to the developer" form.
  - Home lists on the connector (`1c5948d`): `server/home.js` — 🙋 Requests (claim one helper at a time, done, remove; grown-ups notified) and a shared 🛒 Groceries list; both sealed in an encrypted family; one `GET /home`.
  - Home client (`3d38ca0`): greeting, Next up, 🔔 Needs you (requests, rides without a driver this week, threads you're tagged in, your own requests, Ask for a hand), 🛒 Groceries, house, dogs' care + walk, dog row, *More about the dogs* (lazy), 📌 Pinned. Today / Your day / digest cards removed from Home. ＋ › Ask for a hand.
  - No more hidden-feed writes (`3d38ca0`): golden days (now a notification with the dogs' note), new dog appointments, bingo wins, picks endings.
  - Fixes and docs (`29b6939`, `34de25a`): kids can't see/ask/take requests (server); leaving always releases claimed requests; `DELETE /members/<self>` does the `/leave` clean-up; call-Mom line moved into Next up; run/ride/hot-yoga reminders reachable from Me and Next up's ⋯; README, help guide, tour (What's new `2026-11b`), privacy, delete-account page, ARCHITECTURE.
- **Second-pass review (QA, security/privacy, performance, mobile UX, accessibility):** done (`03cbd76`). Two independent code reviews (server security/privacy; client QA) plus browser checks; every verified finding fixed with tests where testable — see *Security findings* and *Review fixes* below. **STOP: Phase 4 is not authorized.**

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
