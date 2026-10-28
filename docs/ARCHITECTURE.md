# OurPawmily — architecture summary (for independent review)

A read-only overview of how the app is built, as of October 2026 (beta, two active users).
It describes the code in this repository; it contains no secrets, keys, tokens or family data.
Line numbers are approximate; function names are the stable reference.

## 1. Directory structure

| Path | What it is |
|---|---|
| `family/` | **OurPawmily**, the family PWA (the main app). `index.html` (CSP, shell), `app.js` (all screens, ~4.2k lines, one ES module), `api.js` (fetch wrapper; runs the server in-browser for the demo), `crypto.js` (E2EE), `ideas.js` (date-idea ranking), `migrate.js` (import from the older trackers), `tour.js` (tour and What's new), `chat.js` (chat screens, lazy), `style.css`, policy pages (`privacy.html`, `terms.html`, `delete-account.html`). Navigation (2.0): bottom bar 🏠 Home · 💞 Us (couples) · 📅 Calendar · 📖 Threads (tabs: Threads, 📷 Photos = albums) · 💪 Health (opens the trackers' food/training screens for now, when the family manages diet & fitness); top right 💬 chats, ❓ help, ＋ create, Me. Home holds Next up, the week's thread digest, Your day, Today, Movies (opt-in), then the Gold Card, chores and the dogs (formerly the "Dogs & chores" tab). The social feed ("Moments"), 📰 News, 🐶 Rescue news and the ❤️ health meter are no longer shown; old `#feed`/`#dogs` links open Home |
| `index.html`, `js/`, `styles.css`, `sw.js`, `theme.js` | The **trackers** (diet, training, dogs, shows, calendar…) at the site root. `js/server.js` holds the connector's built-in address for both apps (localStorage `fam.server`; no longer read from the trackers' `lp.g.sync`, a previously set address is copied once). `js/` also holds pure logic modules the family app imports lazily (`brief.js`, `calendar.js`, `dogcal.js`, `dress.js`, `nextup.js`, `rhythm.js`, `showsCore.js`, `activity.js`) |
| `server/` | The **Cloudflare Worker** ("the connector"). `worker.js` (entry, routing, crons), `family.js` (the v2 family API: auth, families, invites, feed (kept, not shown in 2.0), data, admin), feature modules (`home.js` (🙋 requests and 🛒 groceries for Home), `threads.js`, `chat.js` + `chatHub.js` (chats; a Durable Object), `albums.js`, `market.js`, `nudges.js`, `tv.js`, `movies.js`, `news.js`, `outing.js`, `scout.js`, `search.js`, `links.js`, `push.js`, `photos.js`, `appts.js`, `us.js`, `bingo.js`, `picks.js`, `goldenPost.js`), AI modules (`helpAgent.js`, `helpGuide.js`, `assistant.js`), `wrangler.toml`, `README.md` (setup) |
| `tests/` | `node:test` suites (66 files, 277 tests), fixtures |
| `scripts/` | `bump-version.mjs` (cache-busting version), `check-links.mjs` (browser link check + news feeds), `perf/` (performance budget: `seed.mjs`, `pages.mjs`, `weather.mjs`, `budget.mjs`, `budget.json`) |
| `.github/workflows/check.yml` | CI on every push: tests, the link check, and the performance budget job |
| `mockups/` | Design mockups (not shipped) |

## 2. Technology stack

- **Frontend:** plain HTML/CSS and native ES modules — no framework, no bundler, no npm runtime dependencies. Lazy `import()` for feature logic. A service worker (`sw.js`) caches the trackers' shell (network-first). Cache-busting via `?v=` on `family/app.js` and `style.css`.
- **Backend:** one Cloudflare Worker (JavaScript, ES modules). Storage: **Workers KV** (binding `HOUSEHOLD`; v2 keys are prefixed `v2:` through `store()` in `server/family.js`; Home's lists are `requests:<fid>` and `groceries:<fid>`), **R2** (binding `PHOTOS`, encrypted photo files), the **Cache API** (`caches.default`) for TMDB lookups.
- **Server dependency:** `@anthropic-ai/sdk` only (`server/package.json`), loaded with dynamic `import()` when a Claude call is made. Gemini is called with `fetch` (REST).
- **Tests:** Node's built-in `node:test`; browser checks with Playwright in CI (`scripts/check-links.mjs`) and during development.

## 3. Hosting and Cloudflare architecture

- **Static site:** GitHub Pages serves the repository (`APP_ORIGIN` in `server/wrangler.toml`). It is not Cloudflare Pages.
- **Worker** (`server/worker.js`): `fetch` handles
  - `/v2/*` → `familyApi()` in `server/family.js` (everything in OurPawmily);
  - legacy tracker endpoints: `/household/<code>/…` (data, calendar `.ics`, files), `/ics` (calendar proxy), `/assistant` (workout "Ask Claude"), WHOOP and Strava OAuth (`/whoop/*`, `/strava/*`; Strava is no longer offered for new connections). `/v2/config` reports which device connections are set up (only whether, never keys).
- **Crons** (`wrangler.toml`, dispatched in `worker.js scheduled()`):
  - `13 10 * * *`: nightly maintenance (`runMaintenance`).
  - `*/15 * * * *`: reminders and pushes (`runReminders` in `push.js`); at 6:45/15:45 Pacific also the news edition (`news.js`), but only when the `NEWS_ON` var is set — news is hidden in 2.0 (code and stored editions kept).
  - `13 13-22 * * 3`: Wednesday date scout, one area per run (`runScout`).
  - `43 13-22 * * 4`: Thursday refresh (no AI).
- **Durable Object** `ChatHub` (`server/chatHub.js`, SQLite-backed, free plan; bound as `CHAT`): one per family (`idFromName(fid)`). It stores that family's chat messages (sealed) and holds the phones' WebSockets (hibernation API, `ping`/`pong` auto-response). The Worker authenticates every chat request in `chatRoutes()` (`server/chat.js`) and passes the caller's member ID, their allowed chats and the family's current grown-ups to `POST /op`; sockets connect at `/v2/chat/ws` with a one-time ticket (60 s, single use, stored in the object) and an `Origin` check, and are closed when their member leaves or stops being eligible. The demo runs the same `ChatCore` over its local store.
- **R2:** photos are stored as `photoKey(fid, id, size)` (`server/photos.js`), `full` and `thumb`, already encrypted on the phone; served with `Cache-Control: private, immutable`. A per-family quota (`quotaBytes`) is enforced on upload.
- **Free-plan constraints the code is written around:** ≤ 50 outside requests per invocation (scout one area per run, link checks capped, news ≈ 20), few KV writes (one shared news record, background-job results with 1-day TTL), Cache API for repeated lookups.

## 4. Authentication and authorization

1. **Google sign-in** (Google Identity Services in the browser) → `POST /v2/auth/google` with the ID token.
2. `verifyGoogle()` (`server/family.js`) checks the RS256 signature against Google's certs (cached 1 h), issuer, audience (`GOOGLE_CLIENT_ID`), expiry, `email_verified` (must be `true`; a missing claim is refused) and `iat` (a token issued in the future is refused).
3. `startSession()` issues a random session token (stored in KV as `session:<token>`, 30-day TTL; the newest 10 per account are listed in the user record for "sign out everywhere"). The phone keeps it and sends `Authorization: Bearer …`.
4. **Authorization** is by membership: `loadFamily()`/`meIn()` only return a family whose `members[]` includes the caller's account ID (`g<google sub>`). Roles: `owner` (settings, delete, hand-over), `member`, and `relation: child` (restricted writes; no chats). Chats (`grownUp()` in `server/chat.js`) require an account, `relation !== 'child'`, and no birthday under 18. Friends' families are linked through `connections[]` and only see posts and threads shared with connections. **Files** (`server/photos.js`): each upload records its uploader (`fileby:<fid>:<pid>`); only the uploader or the family's creator can replace or delete it; posts, thread screenshots/PDFs, albums, chat messages and market listings accept only files the caller uploaded; a connected family fetches a file only by naming the shared post or thread it's on, never one tagging a member the family keeps private, and nothing after disconnecting. **Report/block** exist on threads and replies (report hides it for the reporter; the creator sees a count) and chat messages (the report keeps the message ID and reason, never the sealed content); blocking hides threads, replies and chats from that account.
5. **Invites** (`makeInvite`, `/invites/:code(/accept)`): single-use, 14-day TTL, bound to one email; accepting requires the signed-in Google email to equal the invite's email, then the account ID is bound to the member spot.
5b. **Leaving / deleting:** `removeMember(…, { keepPosts: false })` (leaving a family, deleting an account) deletes the person's tracker data, chats, posts and comments, their 🙋 requests (and unclaims ones they'd taken), and their threads (with screenshots, PDFs, uploader records and reports) and replies, votes, tags, reads and follows (`scrubThreads`). `deleteFamily` deletes every thread and uploader record with the family's files.
6. **Admin**: `ADMIN_EMAILS` secret; the maintainer desk (`/admin/*`).
7. **Demo mode**: `family/api.js` runs `familyApi` in the browser with a localStorage store; `/auth/demo` exists only when `env.DEMO` is set.
8. **Legacy trackers** authenticate with a **household code** (a shared secret in the URL path). The code is no longer shown, typed or sent anywhere in the UI (no Privacy card, no "Link phones", no `#link=`, no calendar subscribe link); phones that already shared through one keep syncing in the background until migration, and 🛟 Recover reads the old copies. "Just the trackers" sharing without an account is retired: sharing is only through a family. The endpoints remain.

## 5. End-to-end encryption and key management

Implemented in `family/crypto.js`; used throughout `family/app.js`.

- **Cipher:** AES-256-GCM via WebCrypto, 12-byte random IV, output `e1:<base64url(iv‖ciphertext)>` (`seal`/`open`/`tryOpen`; `sealBytes`/`openBytes` for photos).
- **Family key:** 32 random bytes from `newKey()`, created on the phone in `encryptFamily()` (`app.js`) when a family is created. The server gets only a **key check** (a constant sealed with the key) to tell right keys from wrong ones (`makeCheck`/`checkKey`).
- **On the device:** IndexedDB `pawmily-keys` (fallback localStorage `fam.keys`), loaded and validated in `loadKeys()`.
- **Getting the key to another device or person:**
  - Invite links: `inviteSheet()` appends the family key (or a connection key) after `#` in the URL.
  - "Add a device": `deviceLink()` puts `#k=<fid>.<key>` after `#`.
  - Fragments are never sent to servers; `boot()` removes them from the address bar.
- **Recovery:** a 5×5-character recovery phrase (~124 bits) → PBKDF2-SHA-256 (310,000 iterations) → AES-GCM over `{fid: key}`; the locked backup is stored on the server (`lockBackup`/`unlockBackup`, `/account/keybackup`).
- **Friends' families:** each connection has a connection key, stored on the server sealed with each family's key (`connkeys`). A post shared with friends gets its own key `pk`, sealed for the family and for each connection.
- **Watch states** (`js/showsCore.js`): stored statuses are unchanged — `want` (new) and `upnext` show as *Want to Watch* (`upnext` = ⭐ Up Next), `watching`, `finished` (*Watched*), `dropped`. A record with no status keeps its old meaning (show → Watching, movie → Watched). `PATCH /watch/shows/:id {status, progress, night}` logs an episode in one call; `night` never removes an existing night.
- **🏋️ Workouts** (2.0 Phase 7): one model, `js/workout.js` (Workout → blocks (straight / superset / circuit, rounds) → items → one set per round with reps, weight + unit, bodyweight, time, distance, done/`got`, and `uncertain` field lists). Built by hand, from text (Phase 8) or a photo (Phase 9) — always this shape. Stored per person as two sealed records, `workouts:<fid>:<member>:today` ({today, templates}) and `:log` ({log}), via `GET/PUT /families/:fid/members/:id/workouts/today|log` — PUT by the person (with `base`: an older copy is refused, 409); GET by the person and their Fitness sharing list. Older lifting sessions and device workouts are read through adapters, never rewritten. UI: `family/fitness.js` (lazy); saves are batched (1.2 s) and flushed when the app goes to the background.
- **🔑 Household areas** (2.0 Phase 6): `member.access` ⊆ `home | calendar | threads` (absent = all; the creator always all), set only by the creator (`PATCH /members/:id {access}`, or `access` when the creator adds a person). One guard in `familyApi` maps the first segment after `/families/:fid/` to an area (`AREA_OF`: home, requests, groceries, chores, care, appts, dogstats, vaxdue, tidy → home; events, calfeeds → calendar; threads, boards, albums → threads) and answers 403. `threads.js` applies Threads to the cross-family list, connected-family threads (`threadFamilies`), and tagging; `sharedFile` requires Threads in the family that reaches a connected family's thread file; request notifications skip people without Home. Not gated: Us (couple), Health (per person), chats (grown-ups), games, the file store as such (in-family file ids are only handed out through resources a member can see).
- **💪 Health parts** (`js/healthParts.js`): a person's tracker copy (`data:<fid>:<member>`, sealed) is also saved by their own phone as three sealed parts, `health:<fid>:<member>:diet|fitness|us`, each sent only when it changed (`account.pushParts` in the trackers, `saveMine` in the family app). `GET/PUT /families/:fid/members/:id/health/:part`: PUT by the person only (or the person who added someone not yet joined); GET Diet/Fitness by the person and the members in their `share.diet` / `share.fitness` lists (set only by that person; an older single `shareWith` counts for both until either is set), Us by the person's partner only (`canSeePart`). Once any part exists (`member.healthSplit`), the full copy is the person's alone; before that, a member in both lists can still read it (the pre-2.0 behaviour). Linked calendar addresses, device sign-ins and per-phone bookkeeping are in no part. Leaving a family or deleting it deletes the parts.
- **Thread `ref`** (💬 Discuss from a show or a date idea): an opaque id, `w:<show id>` or `i:<idea token>` (the idea token is an HMAC of the idea id with the family key, so it doesn't reveal which idea). Creating a thread with a `ref` that already has a thread the caller can see returns that thread.
- **Server enforcement:** for encrypted families (`fam.e2ee`), private fields accept only sealed text (`sealed()`, `privText()` in `server/family.js`; `text()` in `threads.js`, `boxOf()` in `home.js`); plain text is rejected.
- **Plaintext metadata the server does see:** family, member and pet names, who asked for a hand and who's helping, a request's kind, day and time, when a grocery item was added or ticked and by whom, emails, relations, roles, connections, timestamps, likes and vote counts, reminder settings, "Next up" notification titles, movie-alert titles, photo sizes, the area used by the scout, and outing plans (kept one day).
- **No key rotation** on member removal (see §9).

## 6. AI integrations and data flows

Keys are never sent to any AI provider. All calls happen on the Worker; none run on the phone.

**The AI privacy gateway (`server/aiGateway.js`, 2.0 Phase 8).** Every request carrying personal content goes through `aiCall({ db, purpose, input, who, underLimit }, run)`: the purpose must be one listed in `PURPOSES`; `minimize()` keeps only that purpose's allowed fields, each with a size cap (over the cap → 413), and names the dropped ones; the provider must be the purpose's own, and `personal-text` / `personal-image` payloads may only go to Anthropic (`public` may also go to Gemini); an optional per-person daily cap (`ai:<purpose>:<uid>:<day>`); and an audit line in `aiaudit:<day>` (last 1000, 30-day TTL) with purpose, provider, payload kind, field names, sizes, dropped field names, ok/error status and duration — never values. `run(payload)` receives only the minimized payload. Purposes: `workout.text`, `workout.photo`, `outing.plan`, `outing.swap`, `thread.tidy`, `tracker.command`, `help.chat`, `bingo.squares`. The scheduled scout and news jobs send only public data (area, dates, movie titles, public headlines) and are not routed through it.

| Feature | Code | Provider | What is sent | Trigger |
|---|---|---|---|---|
| 💬 Help assistant | `helpAgent.js`, `/help/chat` in `family.js`, `helpTool()` | Anthropic (Claude) | The person's questions; via tools: their name, Google email, families' names, members' names, relations and status, invited emails; can resend invites, file a problem report (kept up to 180 days) | User opens Help |
| 💬 Describe it (Fitness) | `js/workoutText.js` on the phone; `/ai/workout` → `workoutAi.js` `readWorkout` | On the phone first; Anthropic (`PARSE_MODEL`, Sonnet by default) only on an explicit "Read it with Claude" | The typed words (≤1500 chars) and the weight unit; structured output (`output_config.format` json_schema) mapped to `js/workout.js` with unsure fields kept; nothing stored but the audit line | Explicit tap |
| 📷 Photo (Fitness) | `fitness.js` `redraw()` (canvas → JPEG ≤ 1600 px, no EXIF); `/ai/workout` → `readWorkout` | Anthropic (`PARSE_MODEL`, effort medium) | One redrawn image (≤ 3.5 MB base64, JPEG/PNG/WebP) and the weight unit; not stored; 20 a day per person | Explicit "Read it" |
| ✨ Tidy it up | `/families/:fid/tidy` in `family.js` | Anthropic (Haiku by default) | The decrypted text of the one note it's tapped on | Explicit tap |
| 🏋️ Ask Claude (trackers) | `assistant.js`, `/assistant` | Anthropic (`assistant.js` MODEL) | The typed workout command and today's exercise list | Explicit command |
| 💡 Weekly date scout | `scout.js` `claudeScout` → `search.js` `askSearch` | Gemini (Google Search) if `GEMINI_API_KEY`, else Claude | The area (town), dates, movie titles now playing | Cron, Wednesdays |
| 🧭 Plan an outing / ⇄ swap a stop | `outing.js` → `askSearch` | Anthropic (Claude) only — never Gemini's free tier | Free text the person typed (≤120 chars), day, chosen chips, home town; the taste line from their ratings only when 💞 Use our taste is on | Explicit request |
| 📰 News summaries | `news.js` `summarize` | Gemini without search, else Claude Haiku | Public RSS headlines and blurbs only | Cron, twice a day — only with `NEWS_ON` (hidden in 2.0) |
| 🐶 Rescue news | `news.js` → `askSearch` | Gemini (Google Search), else Claude | The rescue's name and today's date | With the news edition — only with `NEWS_ON` (hidden in 2.0) |

Usage is counted per provider in KV (`searchruns:<month>`, `scoutruns:…`, `outingruns:…`, `tidyruns:…`) with monthly caps (env `SCOUT_MAX_RUNS`, `OUTING_MAX_RUNS`, `TIDY_MAX_RUNS`). Outing text no longer goes to Gemini (fixed in 2.0 Phase 0, see §9).

## 7. Other external services

| Service | Use | Data |
|---|---|---|
| Google Identity Services | Sign-in | Standard OAuth/OIDC |
| Web Push services (Apple, Google, Mozilla, Microsoft) | Notifications (`push.js`, RFC 8291 encrypted, VAPID) | Short titles like "Sam left you a note" |
| Open-Meteo | Weather and geocoding, called from the phone | Coordinates or town names |
| TMDB, OMDb, JustWatch (via TMDB) | Shows, movies, scores, where to watch | Titles and IDs |
| Ticketmaster, SeatGeek | Events for the scout | Area, dates |
| Public RSS feeds | News (only with `NEWS_ON`) | — (fetch only) |
| WHOOP, Strava | Workout import (trackers; WHOOP only when its secrets are set, Strava only to disconnect an existing link) | OAuth tokens (kept on the phone, excluded from sync) |

## 8. Tests and CI

- `npm test` runs 261 `node:test` tests across 62 files, covering:
  - server routes, called directly with an in-memory KV (`family.test.js`, `threads.test.js`, `nudges.test.js`, `movies.test.js`, `tv.test.js`, `news.test.js`, `search.test.js`, `outing.test.js`, `photos.test.js`, `push.test.js`, …);
  - pure logic (`nextup.test.js`, `ideas.test.js`, `dogcal.test.js`, `calendar.test.js`, …);
  - crypto (`e2ee.test.js`).
  - 2.0 guard rails (`dependencies.test.js`): where the household code is still used, no code or connector set-up in what people see, and Home starting without the feed or news.
- CI (`check.yml`) runs the tests, then `scripts/check-links.mjs` in Chromium. Sites that block robots (OpenTable, Ticketmaster) are reported as "check by hand".
- **Performance budget** (a separate CI job, `scripts/perf/`: `seed.mjs`, `pages.mjs`, `weather.mjs`, `budget.mjs`, `budget.json`): cold and warm start of `/family/` on a throttled phone profile against `wrangler dev`. It fails on more than 18 start-up API requests, any duplicate request, layout shift over 0.05, or start-up script over 200 KB gzipped. Paint times (FCP/LCP) are reported, and checked only with `PERF_STRICT=1`.
- UI flows are checked with Playwright scripts during development (not committed). There are no committed end-to-end UI tests.

## 9. Known limitations and open items

Security items previously under review — all **FIXED in 2.0 Phase 0**:
1. **Connected-family photo access — FIXED:** files record their uploader; a connected family can fetch a file only by naming the shared post or thread it's on (never one tagging a privately kept member, nothing after disconnecting), and only the uploader or the creator can replace or delete it.
2. **`email_verified` — FIXED:** `verifyGoogle()` now requires `email_verified` to be `true` (a missing claim is refused) and refuses tokens issued in the future.
3. **Outing text → Gemini free tier — FIXED:** 🧭 outings and swapping a stop go to Claude only, never Gemini.

**FUTURE SECURITY PROJECT: Per-person/per-area cryptographic isolation for Diet and Fitness.** Today every family member holds the same family key, so Family membership permissions (household areas, Diet/Fitness sharing) are enforced by the server, not cryptographically isolated between family members. Acceptable for the beta; before a commercial or external-family launch this will be separately designed and audited (whether personal Health areas need separate encryption keys). Not part of Phase 0 or 1; the key architecture is unchanged.

Household-code migration (open): since 2.0 Phase 2 no code is created, joined or changed (`sync.ensure`, `join`, `rotate` removed), and signed-in phones store dog documents and adoption photos in the family file store (`account.putFile` → `/v2/families/:fid/photos/:id?size=doc`, sealed with the family key). The remaining dependencies are listed in `tests/dependencies.test.js` — existing phones' background sync, reading files shared earlier under a code, the old calendar subscription link, 🛟 Recover's old copies, linked calendars in the trackers, and the legacy assistant route — to be migrated in Phase 10.

Design items deferred to the security redesign:
- **Invite and device links carry the key**, so the key ends up in email and messaging histories.
- **No key rotation** when a member is removed.
- **Invite keys are left in localStorage** (`fam.inviteKey`/`fam.inviteCk`) if an invite is declined or has expired.
- **Session tokens are stored unhashed** in KV.
- **Keys are kept as extractable strings**, and the session token is in localStorage, so an XSS would expose both.
- **Legacy household-code endpoints** remain (hidden from the UI), with older plaintext tracker copies, until the Phase 2/10 migration.
- **500 responses return `err.message`.**
- **Decrypted photos are cached on the phone** (IndexedDB `photoDb`) with no expiry, and they stay after leaving a family.

## 10. Performance notes and likely bottlenecks

- **No build step:** `family/app.js` is ~378 KB unminified (plus `style.css` ~71 KB), parsed on every cold start. Feature logic is lazy-loaded; the screens are not.
- **Home** (2.0 Phase 3): one `GET /families/:fid/home` returns both 🙋 requests and 🛒 groceries (two KV reads). Start-up is 14 API requests on the synthetic family; the dogs' profiles and stats load only when *More about the dogs* is opened, the vaccine due dates are re-checked once a day per phone 8 s after start-up (for the 9 AM reminders), and Home re-reads `/threads` and `/us` at most every 2 minutes (the app refreshes them when it comes back to the foreground). The Needs-you and Groceries cards keep their last height on the phone (a number only) so the page doesn't jump while they load.
- **Health** (2.0 Phase 5): not part of start-up. The Health tab is `family/health.js` (lazy, imports `js/plan.js` and `js/dietDays.js`); it reads your own copy from the shared cache Home already filled, so opening it made no extra request in the local check.
- **Us / Watch** (2.0 Phase 4): Us is not part of start-up. Opening it reads `/watch`, `/us`, `/ideas`, the rhythm and `/threads` (shared cache); the 📺 Watch card draws as soon as `/watch` arrives. Episode dates (`/tv/*`, TMDB) are looked up per show, one first: a 501 (no TMDB key) stops further lookups for that visit.
- **`/v2/feed`:** reads up to 40 post records per family and per connected family (one KV read each), then the phone decrypts each. Since 2.0 the app no longer calls it at start-up (Home loads without the feed or news).
- **`families()`** loads every family record of the caller on many requests.
- **Reminders cron:** lists all push subscriptions every 15 minutes and walks each user's families.
- **External lookups** (scout, news, outings, movies) are cached in KV or the Cache API and run in the background (`ctx.waitUntil`, background jobs with notifications), but the first news edition (when `NEWS_ON` is set) and the first scout of the week are slow by design.
- **The phone caches** photos (decrypted bytes in IndexedDB), TMDB lookups, news (30 min), movies (6 h) and geocoding in localStorage.
