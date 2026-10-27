# OurPawmily — architecture summary (for independent review)

A read-only overview of how the app is built, as of October 2026 (beta, two active users).
It describes the code in this repository; it contains no secrets, keys, tokens or family data.
Line numbers are approximate; function names are the stable reference.

## 1. Directory structure

| Path | What it is |
|---|---|
| `family/` | **OurPawmily**, the family PWA (the main app). `index.html` (CSP, shell), `app.js` (all screens, ~4.2k lines, one ES module), `api.js` (fetch wrapper; runs the server in-browser for the demo), `crypto.js` (E2EE), `ideas.js` (date-idea ranking), `migrate.js` (import from the older trackers), `style.css`, policy pages (`privacy.html`, `terms.html`, `delete-account.html`) |
| `index.html`, `js/`, `styles.css`, `sw.js`, `theme.js` | The **trackers** (diet, training, dogs, shows, calendar…) at the site root. `js/` also holds pure logic modules the family app imports lazily (`brief.js`, `calendar.js`, `dogcal.js`, `dress.js`, `nextup.js`, `rhythm.js`, `showsCore.js`, `activity.js`) |
| `server/` | The **Cloudflare Worker** ("the connector"). `worker.js` (entry, routing, crons), `family.js` (the v2 family API: auth, families, invites, feed, data, admin), feature modules (`threads.js`, `chat.js` + `chatHub.js` (chats; a Durable Object), `albums.js`, `market.js`, `nudges.js`, `tv.js`, `movies.js`, `news.js`, `outing.js`, `scout.js`, `search.js`, `links.js`, `push.js`, `photos.js`, `appts.js`, `us.js`, `bingo.js`, `picks.js`, `goldenPost.js`), AI modules (`helpAgent.js`, `helpGuide.js`, `assistant.js`), `wrangler.toml`, `README.md` (setup) |
| `tests/` | `node:test` suites (52 files, 227 tests), fixtures |
| `scripts/` | `bump-version.mjs` (cache-busting version), `check-links.mjs` (browser link check + news feeds) |
| `.github/workflows/check.yml` | CI on every push: tests, then the link check |
| `mockups/` | Design mockups (not shipped) |

## 2. Technology stack

- **Frontend:** plain HTML/CSS and native ES modules — no framework, no bundler, no npm runtime dependencies. Lazy `import()` for feature logic. A service worker (`sw.js`) caches the trackers' shell (network-first). Cache-busting via `?v=` on `family/app.js` and `style.css`.
- **Backend:** one Cloudflare Worker (JavaScript, ES modules). Storage: **Workers KV** (binding `HOUSEHOLD`; v2 keys are prefixed `v2:` through `store()` in `server/family.js`), **R2** (binding `PHOTOS`, encrypted photo files), the **Cache API** (`caches.default`) for TMDB lookups.
- **Server dependency:** `@anthropic-ai/sdk` only (`server/package.json`), loaded with dynamic `import()` when a Claude call is made. Gemini is called with `fetch` (REST).
- **Tests:** Node's built-in `node:test`; browser checks with Playwright in CI (`scripts/check-links.mjs`) and during development.

## 3. Hosting and Cloudflare architecture

- **Static site:** GitHub Pages serves the repository (`APP_ORIGIN` in `server/wrangler.toml`). It is not Cloudflare Pages.
- **Worker** (`server/worker.js`): `fetch` handles
  - `/v2/*` → `familyApi()` in `server/family.js` (everything in OurPawmily);
  - legacy tracker endpoints: `/household/<code>/…` (data, calendar `.ics`, files), `/ics` (calendar proxy), `/assistant` (workout "Ask Claude"), WHOOP and Strava OAuth (`/whoop/*`, `/strava/*`).
- **Crons** (`wrangler.toml`, dispatched in `worker.js scheduled()`):
  - `13 10 * * *`: nightly maintenance (`runMaintenance`).
  - `*/15 * * * *`: reminders and pushes (`runReminders` in `push.js`); at 6:45/15:45 Pacific also the news (`runNews` in `news.js`).
  - `13 13-22 * * 3`: Wednesday date scout, one area per run (`runScout`).
  - `43 13-22 * * 4`: Thursday refresh (no AI).
- **Durable Object** `ChatHub` (`server/chatHub.js`, SQLite-backed, free plan; bound as `CHAT`): one per family (`idFromName(fid)`). It stores that family's chat messages (sealed) and holds the phones' WebSockets (hibernation API, `ping`/`pong` auto-response). The Worker authenticates every chat request in `chatRoutes()` (`server/chat.js`) and passes the caller's member ID, their allowed chats and the family's current grown-ups to `POST /op`; sockets connect at `/v2/chat/ws` with a one-time ticket (60 s, single use, stored in the object) and an `Origin` check, and are closed when their member leaves or stops being eligible. The demo runs the same `ChatCore` over its local store.
- **R2:** photos are stored as `photoKey(fid, id, size)` (`server/photos.js`), `full` and `thumb`, already encrypted on the phone; served with `Cache-Control: private, immutable`. A per-family quota (`quotaBytes`) is enforced on upload.
- **Free-plan constraints the code is written around:** ≤ 50 outside requests per invocation (scout one area per run, link checks capped, news ≈ 20), few KV writes (one shared news record, background-job results with 1-day TTL), Cache API for repeated lookups.

## 4. Authentication and authorization

1. **Google sign-in** (Google Identity Services in the browser) → `POST /v2/auth/google` with the ID token.
2. `verifyGoogle()` (`server/family.js`) checks the RS256 signature against Google's certs (cached 1 h), issuer, audience (`GOOGLE_CLIENT_ID`), expiry and `email_verified` (see the open item in §9).
3. `startSession()` issues a random session token (stored in KV as `session:<token>`, 30-day TTL; the newest 10 per account are listed in the user record for "sign out everywhere"). The phone keeps it and sends `Authorization: Bearer …`.
4. **Authorization** is by membership: `loadFamily()`/`meIn()` only return a family whose `members[]` includes the caller's account ID (`g<google sub>`). Roles: `owner` (settings, delete, hand-over), `member`, and `relation: child` (restricted writes; no chats). Chats (`grownUp()` in `server/chat.js`) require an account, `relation !== 'child'`, and no birthday under 18. Friends' families are linked through `connections[]` and only see posts with `audience: 'connections'` (feed and post routes).
5. **Invites** (`makeInvite`, `/invites/:code(/accept)`): single-use, 14-day TTL, bound to one email; accepting requires the signed-in Google email to equal the invite's email, then the account ID is bound to the member spot.
6. **Admin**: `ADMIN_EMAILS` secret; the maintainer desk (`/admin/*`).
7. **Demo mode**: `family/api.js` runs `familyApi` in the browser with a localStorage store; `/auth/demo` exists only when `env.DEMO` is set.
8. **Legacy trackers** authenticate with a **household code** (a shared secret in the URL path). Account users have moved to v2, but the endpoints remain for recovery.

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
- **Server enforcement:** for encrypted families (`fam.e2ee`), private fields accept only sealed text (`sealed()`, `privText()` in `server/family.js`; `text()` in `threads.js`); plain text is rejected.
- **Plaintext metadata the server does see:** family, member and pet names, emails, relations, roles, connections, timestamps, likes and vote counts, reminder settings, "Next up" notification titles, movie-alert titles, photo sizes, the area used by the scout, and outing plans (kept one day).
- **No key rotation** on member removal (see §9).

## 6. AI integrations and data flows

Keys are never sent to any AI provider. All calls happen on the Worker; none run on the phone.

| Feature | Code | Provider | What is sent | Trigger |
|---|---|---|---|---|
| 💬 Help assistant | `helpAgent.js`, `/help/chat` in `family.js`, `helpTool()` | Anthropic (Claude) | The person's questions; via tools: their name, Google email, families' names, members' names, relations and status, invited emails; can resend invites, file a problem report (kept up to 180 days) | User opens Help |
| ✨ Tidy it up | `/families/:fid/tidy` in `family.js` | Anthropic (Haiku by default) | The decrypted text of the one note it's tapped on | Explicit tap |
| 🏋️ Ask Claude (trackers) | `assistant.js`, `/assistant` | Anthropic (`assistant.js` MODEL) | The typed workout command and today's exercise list | Explicit command |
| 💡 Weekly date scout | `scout.js` `claudeScout` → `search.js` `askSearch` | Gemini (Google Search) if `GEMINI_API_KEY`, else Claude | The area (town), dates, movie titles now playing | Cron, Wednesdays |
| 🧭 Plan an outing / ⇄ swap a stop | `outing.js` → `askSearch` | Gemini free tier unless the request includes the couple's taste line (then Claude); Claude fallback | Free text the person typed (≤120 chars), day, chosen chips, home town; optionally the taste line from their ratings | Explicit request |
| 📰 News summaries | `news.js` `summarize` | Gemini without search, else Claude Haiku | Public RSS headlines and blurbs only | Cron, twice a day |
| 🐶 Rescue news | `news.js` → `askSearch` | Gemini (Google Search), else Claude | The rescue's name and today's date | Cron, once a day |

Usage is counted per provider in KV (`searchruns:<month>`, `scoutruns:…`, `outingruns:…`, `tidyruns:…`) with monthly caps (env `SCOUT_MAX_RUNS`, `OUTING_MAX_RUNS`, `TIDY_MAX_RUNS`). The open privacy question about outing text and Gemini's free tier is in §9.

## 7. Other external services

| Service | Use | Data |
|---|---|---|
| Google Identity Services | Sign-in | Standard OAuth/OIDC |
| Web Push services (Apple, Google, Mozilla, Microsoft) | Notifications (`push.js`, RFC 8291 encrypted, VAPID) | Short titles like "Sam left you a note" |
| Open-Meteo | Weather and geocoding, called from the phone | Coordinates or town names |
| TMDB, OMDb, JustWatch (via TMDB) | Shows, movies, scores, where to watch | Titles and IDs |
| Ticketmaster, SeatGeek | Events for the scout | Area, dates |
| Public RSS feeds | News | — (fetch only) |
| WHOOP, Strava | Workout import (trackers) | OAuth tokens (kept on the phone, excluded from sync) |

## 8. Tests and CI

- `npm test` runs 227 `node:test` tests across 52 files, covering:
  - server routes, called directly with an in-memory KV (`family.test.js`, `threads.test.js`, `nudges.test.js`, `movies.test.js`, `tv.test.js`, `news.test.js`, `search.test.js`, `outing.test.js`, `photos.test.js`, `push.test.js`, …);
  - pure logic (`nextup.test.js`, `ideas.test.js`, `dogcal.test.js`, `calendar.test.js`, …);
  - crypto (`e2ee.test.js`).
- CI (`check.yml`) runs the tests, then `scripts/check-links.mjs` in Chromium. Sites that block robots (OpenTable, Ticketmaster) are reported as "check by hand".
- UI flows are checked with Playwright scripts during development (not committed). There are no committed end-to-end UI tests.

## 9. Known limitations and open items

Security items under review (no changes made yet):
1. **Connected-family photo access:** `/families/:fid/photos/:id` lets any member of a connected family fetch any photo ID of that family, not only photos on posts shared with them (encrypted families' photos stay locked; never-encrypted families' would not).
2. **`email_verified`:** `verifyGoogle()` rejects only an explicit `false`; a missing claim passes.
3. **Outing text → Gemini free tier:** free text typed by the person goes to a provider whose free tier may use it to improve products.

Design items deferred to the security redesign:
- **Invite and device links carry the key**, so the key ends up in email and messaging histories.
- **No key rotation** when a member is removed.
- **Invite keys are left in localStorage** (`fam.inviteKey`/`fam.inviteCk`) if an invite is declined or has expired.
- **Session tokens are stored unhashed** in KV.
- **Keys are kept as extractable strings**, and the session token is in localStorage, so an XSS would expose both.
- **Legacy household-code endpoints** remain, with older plaintext tracker copies.
- **500 responses return `err.message`.**
- **Decrypted photos are cached on the phone** (IndexedDB `photoDb`) with no expiry, and they stay after leaving a family.

## 10. Performance notes and likely bottlenecks

- **No build step:** `family/app.js` is ~378 KB unminified (plus `style.css` ~71 KB), parsed on every cold start. Feature logic is lazy-loaded; the screens are not.
- **`/v2/feed`:** reads up to 40 post records per family and per connected family (one KV read each), then the phone decrypts each.
- **`families()`** loads every family record of the caller on many requests.
- **Reminders cron:** lists all push subscriptions every 15 minutes and walks each user's families.
- **External lookups** (scout, news, outings, movies) are cached in KV or the Cache API and run in the background (`ctx.waitUntil`, background jobs with notifications), but the first news edition and the first scout of the week are slow by design.
- **The phone caches** photos (decrypted bytes in IndexedDB), TMDB lookups, news (30 min), movies (6 h) and geocoding in localStorage.
