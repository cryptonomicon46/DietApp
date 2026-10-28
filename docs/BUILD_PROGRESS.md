# OurPawmily Build Progress

Last update: 2026-10-28, after the Phase 0 + Phase 1 review gate. Evidence below was checked against the repository (commits, tests, CI runs, local measurements). Items marked **NOT VERIFIED** or **UNKNOWN** were not checked.

## Current phase and task

- **Phase 0 + Phase 1: complete and merged to `main`** (fast-forward to `f4896ca`, approved by the user with "go" on 2026-10-28; GitHub Pages deployed it).
- **Server deployment (`pawdeploy`): pending, by the user.** The Check on `main` is green (`f4896ca` and `e374c81`). Until the Worker is redeployed, the new app runs against the old server: report/block in Threads and Chats returns errors, and Devices shows WHOOP as "Not available yet".
- **Next authorized work: none.** Phase 2 and the Phase 0–1 follow-ups below need explicit authorization.

## Last safe commit, deployment and rollback

| Item | Value |
| --- | --- |
| Last verified safe commit | `f4896ca` (code); `e374c81` (docs only, on top) |
| Branch | `main` (feature branch `v2/phase-0-1` = `f4896ca`, kept) |
| Pages (front end) | deployed from `main` at `e374c81` — "pages build and deployment" run green |
| Worker (connector) | NOT deployed with Phase 0–1 yet (needs `git pull` + `pawdeploy`) |
| App rollback | revert the Phase 0–1 merge range on `main` and push (Pages redeploys) |
| Worker rollback | `npx wrangler rollback` in `server/` |
| Data migrations | none; nothing deleted. New KV records `fileby:<fid>:<pid>` (uploader per new file) and `report:<fid>:thread:<id>` / `report:<fid>:chat:<cid>` |

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

## Tests

- 2026-10-28, `npm test` at `e374c81`: **261 tests, 261 pass, 0 fail, 0 skipped** (62 files).
- CI Check on `main` at `f4896ca` and `e374c81`: test, links and perf jobs green.
- Authorization matrix covered: file uploader/creator/other member/child/connected family/stranger/after disconnect; thread and chat report/block. Household-area and Diet/Fitness permission tests: NOT STARTED (Phase 6).
- Mobile checks done: 390 px Home, Threads, Photos, Calendar, thread report menu, chat report sheet, trackers Privacy and Devices. NOT VERIFIED: keyboard-only navigation, screen reader, dark mode on the new Home greeting.

## Performance

Method: `scripts/perf/budget.mjs` — synthetic family (`scripts/perf/seed.mjs`) on `wrangler dev` (demo sign-in), Pages-like server, 390 × 844 phone, 4× CPU, 120 ms latency, 6 Mbps; requests in the first 6 s (photo files counted separately); medians of 3–5 runs on the same cloud machine, same session.

| Metric | `main` before 2.0 (`0c35063`) | After Phase 0–1 |
| --- | --- | --- |
| Start-up API requests (cold) | 18 | 17 (18 on a phone's first run: one-time vaccine list `PUT`) |
| Duplicate requests | 0 | 0 |
| Cold first / largest paint | 1.33 s / 1.33 s | 1.34 s / 1.34 s |
| Warm first paint | 1.06 s | ~1.06 s |
| Layout shift | 0.035 | 0.005 |
| Long tasks (cold) | ~490 ms | ~540 ms |
| Start-up script (gzipped) | 174 KB | 174 KB |

Tab switches after Home (requests): Us 5, Calendar 1, Threads 0, Photos 2, back to Home (after >20 s) 8.

On GitHub's runner (perf job): cold 18 requests, first paint 1.25 s, 0 duplicates.

## Known issues and gaps (open)

1. **Thread notifications still use the `feed` kind.** The 2.0 plan relabels shared "feed" notifications for Threads in Phase 1, keeping each person's setting. Not done.
2. **Audit S1 — linked calendar secret in a URL.** The phone sends the decrypted secret iCal link as `GET /ics?url=…` (query string). Not fixed; fix is a POST body.
3. **Tab-switch budget (≤ 4) exceeded:** Us 5, returning to Home 8.
4. **Long tasks up ~50 ms** (490 → 540 ms) against "do not increase".
5. **Start-up requests 17, target ≤ 14** — needs the Home redesign (Phase 3: Home reads two dog profiles, chores and dog stats).
6. **Account deletion doesn't delete a person's threads or replies** (pre-existing). Privacy page doesn't claim it.
7. **Hidden posts still written:** golden-day, dog-appointment "who can drive?", bingo and couples-picks posts go to the hidden feed.
8. **Ask for help removed** until Requests (Phase 3).
9. **Server/client window:** until `pawdeploy`, report/block errors and WHOOP shows "Not available yet".
10. **Help chat module** `server/helpAgent.js` updated; spot-check its answers after deploy: NOT VERIFIED.
11. Synthetic seed tracker profile has no `activity`, which makes the trackers throw `reading 'factor'` (harness data, not a 2.0 change; real profiles always have it).

## Security findings

| Finding | Status |
| --- | --- |
| Connected-family photo access (any ID) | FIXED `1aaa8d1` |
| `email_verified` missing counted as verified | FIXED `c0f82f0` |
| Outing free text → Gemini free tier | FIXED `c0f82f0` |
| Per-resource file authorization (audit S2) | FIXED `1aaa8d1` (in-family reads still rely on IDs only being given through resources a member can see) |
| Linked calendar secret in query string (audit S1) | OPEN |
| Plaintext accepted in encrypted families for some fields (audit S3) | OPEN |
| Shared family key: permissions are server-enforced, not cryptographic | DOCUMENTED; future security project (docs/ARCHITECTURE.md §9) |

## Remaining household-code dependencies

Pinned by `tests/dependencies.test.js`: `sync.ensure()` creates codes at trackers start-up (`js/app.js`); dog documents and adoption photos upload only under the code (`js/dogs.js`, `js/adopt.js`) — **the Phase 2 blocker**; trackers' linked calendars and the old subscribe link (`js/calTab.js`); Recover's old copies (`js/recover.js`); the sync itself (`js/sync.js`); the legacy assistant route for people not signed in.

## Decisions needed

- Authorize Phase 2 (no new codes), and whether to include the open Phase 0–1 gaps 1–4 and S1 first.
- Whether account deletion should delete or anonymize threads and replies.
- Whether the server should stop writing posts to the hidden feed now or in Phase 3.

## Evidence log

| Date | Scope/claim | Commit/files | Command or inspection | Result/limitation |
| --- | --- | --- | --- | --- |
| 2026-10-28 | Phase 0–1 tests | `e374c81` | `npm test` | 261/261 pass |
| 2026-10-28 | CI | `f4896ca`, `e374c81` on `main` | GitHub Actions "Check" and "pages build and deployment" | all green |
| 2026-10-28 | Performance before/after | `0c35063` vs `0e75cc3`+ | `node scripts/perf/budget.mjs` ×3–5, same machine | table above; cloud VM, timings ±10% |
| 2026-10-28 | UI | phone 390 px | Playwright screenshots of Home, Threads, Photos, Calendar, thread/chat report, trackers Privacy/Devices | no page errors in the family app |
| 2026-10-28 | Worker deploy | — | not run (user action) | pending |
