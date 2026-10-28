# Connector: OurPawmily's server (accounts, families, WHOOP sync)

The connector is a Cloudflare Worker. It runs OurPawmily (`/v2/…`), and for the
trackers it does the WHOOP sign-in handshake (WHOOP requires a **client secret**,
which can't live in a static web page) and proxies read-only workout requests.
WHOOP tokens are kept in the app on your phone.

The app has the connector's address built in (`js/server.js`): there's nothing to
paste on the phone. **Devices** in the trackers asks the connector which device
connections it has set up (`/v2/config` says only whether, never any keys):

- **WHOOP:** *Connect* once `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET` are set (below); otherwise *Not available yet*.
- **Strava:** no longer offered for new connections. A phone that already connected it can disconnect it.
- **Garmin:** coming later (Garmin's own API is only open to approved business developers). There's no CSV import any more.
- **Apple Health:** needs the iPhone app, not available yet.

## Household sharing (legacy)

Before accounts, the worker kept a copy of each person's tracker data under a private
household code so the other phone could view it. In 2.0 sharing happens only through an
OurPawmily family, and the code is no longer shown anywhere in the app. Phones that already
shared through a code keep syncing in the background until their migration (a later phase),
and 🛟 Recover can still read those copies. The `/household/…` routes stay for them.

## Setup (≈10–15 minutes, free tiers)

1. **Create the apps**
   - WHOOP: <https://developer-dashboard.whoop.com> → create app. Scopes:
     `read:workout`, `read:cycles`, `read:recovery`, `offline`.
     Redirect URL: `https://<your-worker>.workers.dev/whoop/callback`
   - Strava (legacy, only for phones already connected): <https://www.strava.com/settings/api> → create app.
     Authorization Callback Domain: `<your-worker>.workers.dev`
2. **Deploy the worker**
   ```sh
   cd server
   npm install                                   # bundles the Claude SDK (used only by "Ask Claude")
   npx wrangler login
   npx wrangler kv namespace create HOUSEHOLD     # paste the printed id into wrangler.toml
   npx wrangler deploy
   npx wrangler secret put WHOOP_CLIENT_ID      --name lean-plate-connect
   npx wrangler secret put WHOOP_CLIENT_SECRET  --name lean-plate-connect
   npx wrangler secret put STRAVA_CLIENT_ID     --name lean-plate-connect
   npx wrangler secret put STRAVA_CLIENT_SECRET --name lean-plate-connect
   # APP_ORIGIN is set in wrangler.toml (change it if you host the app elsewhere)
   ```
3. **Household sharing** (legacy): nothing to set up. New phones don't use it; phones that
   already shared through a code keep syncing until their migration.
4. **WHOOP (optional):** once the two WHOOP secrets are set, **Devices** shows **Connect WHOOP**
   on every phone — no URL to paste. The STRAVA secrets only matter for phones that already
   connected Strava.

## Ask Claude (optional)

The Lift tab understands commands like "squats 3 sets of 5 at 185" on the phone itself.
When it can't parse a sentence ("after the squats I did the rear-foot-elevated thing, ten,
ten, eight with forties"), it sends the sentence and today's exercise list to this worker's
`/assistant` route, which asks Claude (low effort) to turn it into sets,
added exercises or a weigh-in. You get an **Undo** button as with any command.

```sh
cd server
npm install
npx wrangler secret put ANTHROPIC_API_KEY --name lean-plate-connect   # paste the key only into this prompt
npx wrangler deploy
```

- Get a key at <https://console.anthropic.com> → API keys. It lives only in Cloudflare's
  secret store, never in the app or the repo.
- Signed-in phones go through your account. The older route (for phones still on legacy
  household sharing) checks that the household code already has data, so strangers can't
  spend your credit.
- Cost: roughly 1–3¢ per command, and only for commands the phone couldn't parse itself.
  Set a monthly spend limit in the Anthropic console if you want a hard cap.
- Refusal fallback is on (`fallbacks: "default"`): if Claude's safety filters ever decline
  a request, the API retries it on Anthropic's recommended fallback model automatically.
- Without the key, everything else works; unparsed commands just show a hint.


## Dog documents (vaccine records, PDFs, photos)

Signed in, the trackers store dog documents and adoption-board screenshots in the family's
file store (R2, `/v2/families/:fid/photos/:id?size=doc`), locked with the family key.

(Legacy storage, read only for files shared before 2.0 and by phones that still share through a
code without an account:) the HOUSEHOLD KV namespace, under
`/household/<code>/file/<id>` (PDF or image, up to 10 MB each). This needs the
updated worker. Deploy it once:

```
cd server
npm install          # needed on any fresh copy: the worker bundles @anthropic-ai/sdk
npx wrangler deploy
```

If the deploy says `Could not resolve "@anthropic-ai/sdk"`, you skipped
`npm install` (node_modules isn't in git). Run it in `server/` and deploy again.

Until then, documents stay on the phone that added them; the app retries the
upload automatically after the update.

## Shared calendar feed (legacy)

`/household/<code>/calendar.ics` serves both partners' events as one calendar for
Apple Calendar (webcal://) and Google Calendar (From URL). The app no longer shows
this link (it carried the household code); calendars already subscribed keep
updating, and a private family subscription link will replace it later.

## Linked calendars

The connector fetches a linked iCloud (`*.icloud.com`), Google (`calendar.google.com`) or
Outlook calendar for the app — phones can't fetch those directly because of browser rules.
The secret calendar link is sent in the request body (`POST /v2/ics {url}`; the older trackers
use `POST /ics {code, url}`), never in a URL.

## OurPawmily Families (preview): Google sign-in

The family app at `/family/` (families, invites by email, pets, threads, chats, who-sees-what) uses this same connector under `/v2/…` and the same `HOUSEHOLD` storage — no new database. Until the steps below are done it runs as an on-phone demo.

1. **Deploy the update:** `cd server && npm install && npx wrangler deploy`.
2. **Create a Google sign-in client (free, once):**
   - Go to <https://console.cloud.google.com/> → create a project (e.g. "OurPawmily").
   - **APIs & Services → OAuth consent screen:** *External*, app name *OurPawmily*, your email as support and developer contact. While it's in *Testing*, add each person's Gmail under **Test users** (up to 100), or **Publish** it — basic sign-in (name, email, picture) doesn't need Google's review.
   - **APIs & Services → Credentials → Create credentials → OAuth client ID:** type *Web application*. Under **Authorized JavaScript origins** add your app's origin (e.g. `https://you.github.io`, no path). No redirect URI is needed.
   - Copy the **Client ID** (ends in `.apps.googleusercontent.com`). It isn't a password, but keep it out of the repo anyway:
3. **Give it to the connector:** `npx wrangler secret put GOOGLE_CLIENT_ID` and paste it.

4. **Support email (optional for the beta, needed for the stores):** `npx wrangler secret put SUPPORT_EMAIL` with the address people should write to. It shows in the app under Me › Account & security.

5. **Help desk (optional):** the 💬 Help chat (Me › Help, the sign-in screen, and 🔐 Privacy in the trackers) answers from the app's guide on its own. With the `ANTHROPIC_API_KEY` secret (the same one "Ask Claude" uses) Claude answers instead and can, for the person asking only: look at their account and families, resend an invite, sign out their other devices (after they confirm), and file a problem for you.
6. **You as maintainer:** `npx wrangler secret put ADMIN_EMAILS` with your Google email (comma-separate several). Me › Maintainer then shows the problems people filed (with their help chat), app glitches phones reported, and the nightly check. Mark problems done there, or run the check now.
7. **📸 Photo storage (Cloudflare R2):** photos and PDFs are kept as files (a thumbnail and the full photo, locked on the phone in an encrypted family) in an R2 bucket, so the app stays quick and KV stays small. Each upload records who uploaded it; only they or the family's creator can replace or delete it. Once: in the Cloudflare dashboard turn on **R2 Object Storage** (free up to 10 GB a month), then from `server/` run `npx wrangler r2 bucket create ourpawmily-photos` and deploy. `wrangler.toml` already binds it as `PHOTOS`; each family can use up to 2 GB (set `PHOTO_QUOTA_MB` under `[vars]` to change it). Without the bucket, remove the `[[r2_buckets]]` block and posts keep photos inside them, as before. Phones move older photos over on their own.
8. **Notification reminders:** the second cron (every 15 minutes) sends appointment, event and vaccine reminders to phones that turned notifications on. Notifications need no setup: the connector makes its own VAPID key pair the first time someone turns them on and keeps it in KV (`v2:push:vapid`). If `SUPPORT_EMAIL` is set it's given to push services as the contact.
10. **💡 Date scout (optional):** every Wednesday morning (the third cron, hourly from 6:13 AM Pacific, one area a run so each stays under the free plan's 50 outside requests) the connector gathers date ideas for each area a couple lives in, and on Thursday (the fourth cron) refreshes films, scores and events without Claude: events from Ticketmaster (and SeatGeek), every movie now playing, ranked by critics and audiences, with the ones over the family's bar marked as a critics' pick (TMDB + one OMDb call per film), and — with `ANTHROPIC_API_KEY` — Claude with web search for showtimes at each family's theatres and new bars and restaurants (each gets an OpenTable link). Each source is skipped without its key, all free: `npx wrangler secret put TICKETMASTER_KEY` (developer.ticketmaster.com › My Apps › Consumer Key), `TMDB_KEY` (themoviedb.org › Settings › API, the read access token), `OMDB_KEY` (omdbapi.com/apikey.aspx), `SEATGEEK_CLIENT_ID` (platform.seatgeek.com, needs their approval). **Free search with Gemini:** with `GEMINI_API_KEY` set, the weekly search (and the news, when it's on) uses Google's Gemini with Google Search — free within Google's daily allowance — and Claude only as the backup. Get a key at aistudio.google.com › Get API key, then `npx wrangler secret put GEMINI_API_KEY` and `pawdeploy`. `GEMINI_MODEL` picks the model (a Flash model by default). Only public questions go to Gemini (an area, dates); anything with what someone typed or rated, including outings, stays with Claude. `SCOUT_MODEL` picks the Claude model (Sonnet by default) and `SCOUT_MAX_RUNS` caps Claude runs per area per month (6). Me › Maintainer shows which keys are set, this month's runs and searches, and can run it now. The scout only gets an area and dates; picks are HMAC codes the connector can match but not read.
11. **🧭 Plan an outing:** uses Claude only (the same `ANTHROPIC_API_KEY` and `SCOUT_MODEL`), never Gemini. Each plan is one Claude turn with up to 8 web searches; swapping a stop is a small one with 3. `OUTING_MAX_RUNS` caps plans per family per month (20; swaps get three times that). Only the place, day, chips and the family's home town are sent, plus the taste line when 💞 Use our taste is on.
12. **🔗 Links:** links Claude finds (places, events, theatre pages, outing stops) are opened once by the connector before they're saved; a page that's gone becomes a Google search for the place. Me › Maintainer › 🔗 Check links re-opens every link in this week's ideas. On GitHub, the **Check** workflow (`.github/workflows/check.yml`) runs the tests and opens a sample of every kind of link the app builds (OpenTable, Google Maps, Fandango, Ticketmaster, TMDB) plus the app's own pages in a real browser on every push — wait for its green ✓ before you deploy. Screenshots are in the run's *link-report* artifact.
13. **📖 Threads:** stored as `thread:<fid>:<id>` with an index `threads:<fid>` (one KV write per new thread, reply, vote or pin, and one when someone opens a thread with something new in it). ✨ Tidy it up uses `ANTHROPIC_API_KEY` without web search (`TIDY_MODEL`, Haiku by default; `TIDY_MAX_RUNS`, 60 per family a month).
14. **🤖 AI requests** all go through `aiGateway.js` (allowed fields only, personal content to Anthropic only, a 30-day audit list `aiaudit:<day>` with no values — one KV write per request, plus one for the per-person daily count where a purpose has one). 💬 Describe it / 📷 From a photo use `ANTHROPIC_API_KEY` with `PARSE_MODEL` (optional `[vars]`; Sonnet by default); without the key the app reads typed workouts on the phone only.
14. **📰 News (hidden in 2.0):** the app doesn't show news, and the edition runs only when the plain var `NEWS_ON` is set — e.g. `npx wrangler deploy --var NEWS_ON:1`, or `NEWS_ON = "1"` under `[vars]` in `wrangler.toml`. The code and stored editions are kept. When on: at about 6:45 AM and 3:45 PM Pacific (from the 15-minute cron) the connector reads public RSS feeds — Politics (NPR, PBS NewsHour, CalMatters), Tech (The Verge, Ars Technica, TechCrunch, Hacker News) and Bay Area (KQED, SF Standard, SFGate, San José Spotlight, ABC7) — keeps the newest stories from the last 36 hours, and has Gemini (or Claude Haiku without `GEMINI_API_KEY`; `NEWS_MODEL` picks it) choose six per topic and sum each up in a line. Once a day it also looks up 🐶 California Doodle Rescue's adoptable dogs and events with a search, and opens those links before saving them. One shared copy (`news:latest`, two KV writes a day); about 20 outside requests an edition. Without any AI key the feeds' own blurbs are used and there's no rescue news. Me › Maintainer shows the last edition and can make one now; `node scripts/check-links.mjs` checks the feeds.
15. **📷 Albums:** each family's albums live in one KV record (`albums:<fid>`); photos copied in are stored like other photos (locked on the phone, two sizes in R2, counted in the family's photo space). Titles and Google Photos links are end-to-end encrypted in an encrypted family. **📥 From Google Photos** uses Google's Photos Picker on the phone (apps can't read your library or shared albums any more, only photos you pick): in Google Cloud console, for the same project as `GOOGLE_CLIENT_ID`, open APIs & Services › Library › **Google Photos Picker API** › Enable, then OAuth consent screen › Data access › Add scope `.../auth/photospicker.mediaitems.readonly`. No connector change or secret is needed; the photos go from Google straight to the phone, then up locked.
16. **💬 Chats:** each family's chats live in a Cloudflare **Durable Object** (`ChatHub` in `chatHub.js`), SQLite-backed so it's on the free plan. `wrangler.toml` already binds it as `CHAT` with its migration (`chat-v1`); the first `npx wrangler deploy` (or `pawdeploy`) after pulling creates it — nothing to set up by hand. Messages are stored there, sealed on the phone; phones keep a live connection while the app is open (it sleeps between messages, so idle costs nothing), and chat messages cost no KV writes. Without the binding (the demo), chats are kept in the family's own storage and phones check every few seconds.
9. **Nightly check:** the `[triggers]` cron in `wrangler.toml` deploys with the connector. Every night it repairs what a half-finished change can leave behind: people whose account is gone, accounts that lost their family link, a family without a creator (the next grown-up takes over), empty families, links to deleted families, and expired sign-ins. It lists every fix in the report.

Open `/family/` and **Continue with Google** appears. Accounts are protected by Google's own sign-in, including 2-Step Verification (turn it on at <https://myaccount.google.com/security> — that's the "two-factor" for the app).

**How it's kept private:**
- Sign-in sessions are random 32-character tokens kept for 30 days, and signing out deletes the session.
- An invite works only for the Google account it was sent to, only once, and only for 14 days.
- Each person's diet & fitness data is visible only to the family members they turn sharing on for.
- Sign-in needs an email Google has verified, and a token issued in the future is refused.
- Connected families see only the threads (and older posts) shared with them, can fetch a file only by naming the shared thread or post it's on (never one tagging someone kept private, nothing after disconnecting), and never see anyone's email address.

