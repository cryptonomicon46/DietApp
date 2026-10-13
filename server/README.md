# Wearables connector (WHOOP + Garmin via Strava)

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

## Setup (≈10 minutes, free tiers)

1. **Create the apps**
   - WHOOP: <https://developer-dashboard.whoop.com> → create app. Scopes:
     `read:workout`, `read:cycles`, `read:recovery`, `offline`.
     Redirect URL: `https://<your-worker>.workers.dev/whoop/callback`
   - Strava: <https://www.strava.com/settings/api> → create app.
     Authorization Callback Domain: `<your-worker>.workers.dev`
2. **Deploy the worker**
   ```sh
   cd server
   npx wrangler deploy worker.js --name lean-plate-connect --compatibility-date 2026-01-01
   npx wrangler secret put WHOOP_CLIENT_ID      --name lean-plate-connect
   npx wrangler secret put WHOOP_CLIENT_SECRET  --name lean-plate-connect
   npx wrangler secret put STRAVA_CLIENT_ID     --name lean-plate-connect
   npx wrangler secret put STRAVA_CLIENT_SECRET --name lean-plate-connect
   npx wrangler secret put APP_ORIGIN           --name lean-plate-connect   # e.g. https://you.github.io/DietApp/
   ```
3. In Lean Plate open **Devices**, paste the worker URL, and tap **Connect WHOOP** /
   **Connect Garmin (Strava)**.
