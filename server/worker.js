// Tiny OAuth + API proxy for WHOOP and Strava (Garmin auto-syncs to Strava).
// Deploy as a Cloudflare Worker — see server/README.md. It stores nothing:
// tokens are handed back to the app and kept on your phone.
//
// Also stores each household member's app data for sharing between phones (KV
// namespace bound as HOUSEHOLD), keyed by a private household code.
//
// Env vars: APP_ORIGIN (e.g. https://you.github.io/DietApp/),
//           WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
//           STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
//           ANTHROPIC_API_KEY (optional: "Ask Claude" for workout commands)
//           GOOGLE_CLIENT_ID (OurPawmily Families: Google sign-in, see family.js)
//           ADMIN_EMAILS (Google emails that see Me › Maintainer: problems filed through Help)
//           SUPPORT_EMAIL (shown to people who need a human)
// The nightly cron in wrangler.toml runs the families' maintenance check (runMaintenance); the
// 15-minute one sends notification reminders (push.js).

import { assist } from './assistant.js';
import { familyApi, runMaintenance, runFamilyReminders } from './family.js';
import { mergeEvents, icsCalendar } from '../js/calendar.js';

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
  async scheduled(event, env, ctx) {
    if (!env.HOUSEHOLD) return;
    if (event.cron === '13 10 * * *') ctx.waitUntil(runMaintenance(env));
    else ctx.waitUntil(runFamilyReminders(env, event.scheduledTime));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = new URL(env.APP_ORIGIN).origin;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const callback = `${url.origin}/${url.pathname.split('/')[1]}/callback`;

    try {
      // ---- OurPawmily Families (v2): Google sign-in, families, invites, feed — see family.js ----
      if (url.pathname.startsWith('/v2/')) {
        if (!env.HOUSEHOLD) return json({ error: 'HOUSEHOLD storage not set up — see server/README.md' }, 501);
        const r = await familyApi(req, env, url.pathname.slice(3), ctx);
        return json(r.data, r.status);
      }

      // ---- Linked calendars: GET /ics?code=<household>&url=<public iCloud / Google calendar link> ----
      // The phone can't fetch another site's calendar directly (browsers block it), so the
      // connector does — only for a known household, and only from calendar hosts.
      if (url.pathname === '/ics') {
        if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        const code = url.searchParams.get('code') || '';
        const known = /^[a-z0-9-]{12,64}$/.test(code) && env.HOUSEHOLD
          && (await env.HOUSEHOLD.list({ prefix: `${code}:`, limit: 1 })).keys.length > 0;
        if (!known) return json({ error: 'turn on household sharing first' }, 403);
        let target;
        try { target = new URL((url.searchParams.get('url') || '').trim().replace(/^webcals?:/i, 'https:')); } catch { return json({ error: 'not a link' }, 400); }
        const host = target.hostname.toLowerCase();
        const allowed = target.protocol === 'https:' && (host.endsWith('.icloud.com') || host === 'calendar.google.com' || host === 'outlook.live.com' || host === 'outlook.office365.com');
        if (!allowed) return json({ error: 'only iCloud, Google or Outlook calendar links' }, 400);
        const res = await fetch(target.toString(), { headers: { Accept: 'text/calendar' }, redirect: 'follow' });
        if (!res.ok) return json({ error: `calendar link answered ${res.status}` }, 502);
        const text = await res.text();
        if (text.length > 5_000_000) return json({ error: 'calendar too large' }, 413);
        if (!text.includes('BEGIN:VCALENDAR')) return json({ error: 'that link is not a calendar' }, 422);
        return new Response(text, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=600' } });
      }

      // ---- Shared calendar feed: /household/<code>/calendar.ics (subscribe in Apple / Google) ----
      const hc = url.pathname.match(/^\/household\/([a-z0-9-]{12,64})\/calendar\.ics$/);
      if (hc) {
        if (!env.HOUSEHOLD) return json({ error: 'HOUSEHOLD storage not set up — see server/README.md' }, 501);
        if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method not allowed' }, 405);
        const { keys } = await env.HOUSEHOLD.list({ prefix: `${hc[1]}:` });
        const records = [];
        const names = {};
        for (const { name } of keys) {
          const person = name.slice(hc[1].length + 1);
          if (!/^[a-z]{2,20}$/.test(person) || person === 'link') continue;
          try {
            const data = JSON.parse(await env.HOUSEHOLD.get(name))?.data || {};
            records.push({ person, events: data.events || [] });
            if (data.profile?.name) names[person] = String(data.profile.name).split(/\s+/)[0];
          } catch { /* skip a bad record */ }
        }
        if (!records.length) return json({ error: 'not found' }, 404);
        // Subscribed calendars ignore alarms, so none are sent.
        const body = icsCalendar(mergeEvents(records), { names, alarms: false, name: 'OurPawmily' });
        return new Response(req.method === 'HEAD' ? null : body, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
      }

      // ---- Household files (dog vaccine records etc.): /household/<code>/file/<id> ----
      // Raw bytes in KV with their type; anyone with the household code can read them,
      // exactly like the household's data.
      const hf = url.pathname.match(/^\/household\/([a-z0-9-]{12,64})\/file\/([a-z0-9]{6,40})$/);
      if (hf) {
        if (!env.HOUSEHOLD) return json({ error: 'HOUSEHOLD storage not set up — see server/README.md' }, 501);
        const key = `${hf[1]}:file:${hf[2]}`;
        if (req.method === 'GET') {
          const { value, metadata } = await env.HOUSEHOLD.getWithMetadata(key, 'arrayBuffer');
          if (!value) return json({ error: 'not found' }, 404);
          return new Response(value, { headers: { ...cors, 'Content-Type': metadata?.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' } });
        }
        if (req.method === 'PUT') {
          const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
          if (type !== 'application/pdf' && !/^image\/(jpeg|png|heic|heif|webp|gif)$/.test(type)) return json({ error: 'PDF or image only' }, 415);
          const buf = await req.arrayBuffer();
          if (!buf.byteLength) return json({ error: 'empty' }, 400);
          if (buf.byteLength > 10 * 1024 * 1024) return json({ error: 'too large (10 MB max)' }, 413);
          await env.HOUSEHOLD.put(key, buf, { metadata: { type, size: buf.byteLength } });
          return json({ ok: true });
        }
        if (req.method === 'DELETE') {
          await env.HOUSEHOLD.delete(key);
          return json({ ok: true });
        }
        return json({ error: 'method not allowed' }, 405);
      }

      // ---- Household sharing: /household/<code>/<person> ----
      const hh = url.pathname.match(/^\/household\/([a-z0-9-]{12,64})\/([a-z]{2,20})(\/prev)?$/);
      if (hh) {
        if (!env.HOUSEHOLD) return json({ error: 'HOUSEHOLD storage not set up — see server/README.md' }, 501);
        const key = `${hh[1]}:${hh[2]}${hh[3] ? ':prev' : ''}`;
        if (hh[3] && req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        if (req.method === 'GET') {
          const v = await env.HOUSEHOLD.get(key);
          return v ? new Response(v, { headers: { ...cors, 'Content-Type': 'application/json' } }) : json({ error: 'not found' }, 404);
        }
        if (req.method === 'PUT') {
          const body = await req.text();
          if (body.length > 2_000_000) return json({ error: 'too large' }, 413);
          try { JSON.parse(body); } catch { return json({ error: 'expected JSON' }, 400); }
          // A much smaller copy replacing a big one is usually a phone that lost its data: keep the
          // big one at …/prev so Recover can bring it back.
          const old = await env.HOUSEHOLD.get(key);
          if (old && old.length > 500 && body.length < old.length * 0.7) await env.HOUSEHOLD.put(`${key}:prev`, old);
          await env.HOUSEHOLD.put(key, body);
          return json({ ok: true });
        }
        return json({ error: 'method not allowed' }, 405);
      }

      // ---- Ask Claude: POST /assistant {code, text, context} ----
      // Only households that already share data can use it, so a stranger can't spend your API credit.
      if (url.pathname === '/assistant') {
        if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
        if (!env.ANTHROPIC_API_KEY) return json({ error: 'Claude is not set up on your connector — see server/README.md' }, 501);
        const body = await req.json().catch(() => ({}));
        const code = String(body.code || '');
        const text = String(body.text || '').trim();
        if (!text || text.length > 500) return json({ error: 'say a short command' }, 400);
        const known = /^[a-z0-9-]{12,64}$/.test(code) && env.HOUSEHOLD
          && (await env.HOUSEHOLD.list({ prefix: `${code}:`, limit: 1 })).keys.length > 0;
        if (!known) return json({ error: 'turn on household sharing first' }, 403);
        return json(await assist(env, { text, context: body.context || {} }));
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
