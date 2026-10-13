// Tiny OAuth + API proxy for WHOOP and Strava (Garmin auto-syncs to Strava).
// Deploy as a Cloudflare Worker — see server/README.md. It stores nothing:
// tokens are handed back to the app and kept on your phone.
//
// Also stores each household member's app data for sharing between phones (KV
// namespace bound as HOUSEHOLD), keyed by a private household code.
//
// Env vars: APP_ORIGIN (e.g. https://you.github.io/DietApp/),
//           WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
//           STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET

const WHOOP = {
  auth: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  token: 'https://api.prod.whoop.com/oauth/oauth2/token',
  api: 'https://api.prod.whoop.com/developer',
  scope: 'offline read:workout read:cycles read:recovery',
};
const STRAVA = {
  auth: 'https://www.strava.com/oauth/authorize',
  token: 'https://www.strava.com/oauth/token',
  api: 'https://www.strava.com/api/v3',
  scope: 'activity:read_all',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = new URL(env.APP_ORIGIN).origin;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const callback = `${url.origin}/${url.pathname.split('/')[1]}/callback`;

    try {
      // ---- Household sharing: /household/<code>/<person> ----
      const hh = url.pathname.match(/^\/household\/([a-z0-9-]{12,64})\/([a-z]{2,20})$/);
      if (hh) {
        if (!env.HOUSEHOLD) return json({ error: 'HOUSEHOLD storage not set up — see server/README.md' }, 501);
        const key = `${hh[1]}:${hh[2]}`;
        if (req.method === 'GET') {
          const v = await env.HOUSEHOLD.get(key);
          return v ? new Response(v, { headers: { ...cors, 'Content-Type': 'application/json' } }) : json({ error: 'not found' }, 404);
        }
        if (req.method === 'PUT') {
          const body = await req.text();
          if (body.length > 2_000_000) return json({ error: 'too large' }, 413);
          try { JSON.parse(body); } catch { return json({ error: 'expected JSON' }, 400); }
          await env.HOUSEHOLD.put(key, body);
          return json({ ok: true });
        }
        return json({ error: 'method not allowed' }, 405);
      }

      switch (url.pathname) {
        // ---- WHOOP ----
        case '/whoop/login':
          return Response.redirect(`${WHOOP.auth}?${new URLSearchParams({
            client_id: env.WHOOP_CLIENT_ID, redirect_uri: callback, response_type: 'code',
            scope: WHOOP.scope, state: crypto.randomUUID(),
          })}`, 302);
        case '/whoop/callback':
          return backToApp(env, 'whoop', await tokenRequest(WHOOP.token, {
            grant_type: 'authorization_code', code: url.searchParams.get('code'),
            client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET, redirect_uri: callback,
          }));
        case '/whoop/refresh':
          return json(await tokenRequest(WHOOP.token, {
            grant_type: 'refresh_token', refresh_token: (await req.json()).refresh_token,
            client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET, scope: 'offline',
          }));
        case '/whoop/workouts': {
          const q = new URLSearchParams({ start: url.searchParams.get('start'), limit: '25' });
          const res = await fetch(`${WHOOP.api}/v2/activity/workout?${q}`, { headers: { Authorization: req.headers.get('Authorization') } });
          return json(await res.json(), res.status);
        }

        // ---- STRAVA (Garmin) ----
        case '/strava/login':
          return Response.redirect(`${STRAVA.auth}?${new URLSearchParams({
            client_id: env.STRAVA_CLIENT_ID, redirect_uri: callback, response_type: 'code',
            scope: STRAVA.scope, approval_prompt: 'auto',
          })}`, 302);
        case '/strava/callback':
          return backToApp(env, 'strava', await tokenRequest(STRAVA.token, {
            grant_type: 'authorization_code', code: url.searchParams.get('code'),
            client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET,
          }));
        case '/strava/refresh':
          return json(await tokenRequest(STRAVA.token, {
            grant_type: 'refresh_token', refresh_token: (await req.json()).refresh_token,
            client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET,
          }));
        case '/strava/activities': {
          // The list endpoint has no calories, so fetch each activity's detail.
          const auth = { Authorization: req.headers.get('Authorization') };
          const after = Math.floor(new Date(url.searchParams.get('start')).getTime() / 1000);
          const list = await fetch(`${STRAVA.api}/athlete/activities?after=${after}&per_page=20`, { headers: auth });
          if (!list.ok) return json(await list.json(), list.status);
          const details = await Promise.all((await list.json()).map((a) =>
            fetch(`${STRAVA.api}/activities/${a.id}`, { headers: auth }).then((r) => (r.ok ? r.json() : a))));
          return json({ records: details });
        }
        default:
          return json({ error: 'not found' }, 404);
      }
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};

async function tokenRequest(endpoint, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.message || 'token request failed');
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// Send tokens back to the app in the URL fragment (never hits a server log).
function backToApp(env, provider, tokens) {
  const payload = btoa(JSON.stringify(tokens));
  return Response.redirect(`${env.APP_ORIGIN}#connect=${provider}:${payload}`, 302);
}
