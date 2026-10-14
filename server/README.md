# Connector: household sharing + WHOOP / Garmin sync

WHOOP and Strava both require a **client secret** to finish sign-in, which can't
live in a static web page. This folder is a ~100-line Cloudflare Worker that does
the sign-in handshake and proxies read-only workout requests. It stores nothing;
tokens are kept in the app on your phone.

Garmin's own Health/Activity API is only open to approved business developers,
so the app gets Garmin data two other ways:

1. **Strava bridge (automatic):** in the Garmin Connect app, turn on
   *Settings → Connected Apps → Strava*. Every Garmin activity then lands in
   Strava, and this worker reads it from there (including calories).
2. **CSV import (no setup):** Garmin Connect website → *Activities → All
   Activities → Export CSV*, then in Lean Plate tap *Devices → Import Garmin CSV*.

## Household sharing (Sandman ↔ Amani)

The same worker keeps a copy of each person's app data so the other phone can view it.
Data is stored in Cloudflare KV under your private household code; anyone without the
code can't read it. Treat the code like a password.

## Setup (≈10–15 minutes, free tiers)

1. **Create the apps**
   - WHOOP: <https://developer-dashboard.whoop.com> → create app. Scopes:
     `read:workout`, `read:cycles`, `read:recovery`, `offline`.
     Redirect URL: `https://<your-worker>.workers.dev/whoop/callback`
   - Strava: <https://www.strava.com/settings/api> → create app.
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
3. **Household sharing:** on Sandman's phone open **Devices → Share with your household**,
   paste the worker URL, tap **New code**, pick **Sandman**, and tap **Turn on sharing**.
   On Amani's phone enter the same URL and code, pick **Amani**, and turn it on.
4. **WHOOP / Garmin (optional):** in **Devices**, paste the worker URL and tap
   **Connect WHOOP** / **Connect Garmin (Strava)**. Sharing alone needs only `APP_ORIGIN`;
   the WHOOP/Strava secrets are only needed for those connections.

## Ask Claude (optional)

The Lift tab understands commands like "squats 3 sets of 5 at 185" on the phone itself.
When it can't parse a sentence ("after the squats I did the rear-foot-elevated thing, ten,
ten, eight with forties"), it sends the sentence and today's exercise list to this worker's
`/assistant` route, which asks Claude (`claude-opus-5-5`, low effort) to turn it into sets,
added exercises or a weigh-in. You get an **Undo** button as with any command.

```sh
cd server
npm install
npx wrangler secret put ANTHROPIC_API_KEY --name lean-plate-connect   # paste the key only into this prompt
npx wrangler deploy
```

- Get a key at <https://console.anthropic.com> → API keys. It lives only in Cloudflare's
  secret store, never in the app or the repo.
- Only phones with household sharing turned on can use it: the worker checks that your
  household code already has data, so strangers can't spend your credit.
- Cost: roughly 1–3¢ per command, and only for commands the phone couldn't parse itself.
  Set a monthly spend limit in the Anthropic console if you want a hard cap.
- Refusal fallback is on (`fallbacks: "default"`): if Claude's safety filters ever decline
  a request, the API retries it on Anthropic's recommended fallback model automatically.
- Without the key, everything else works; unparsed commands just show a hint.
