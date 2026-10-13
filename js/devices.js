import { fromWhoop, fromStrava } from './activity.js';

// Talks to the connector worker (server/worker.js). Tokens live in localStorage.
const KEY = 'lp.devices';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* blocked */ } };

export const devices = {
  get() { return load(); },
  setServer(url) { const d = load(); d.server = url.replace(/\/+$/, ''); save(d); },
  connectUrl(provider) { return `${load().server}/${provider}/login`; },
  disconnect(provider) { const d = load(); delete d[provider]; save(d); },

  // Called on page load: the worker redirects back with #connect=<provider>:<base64 tokens>.
  takeRedirect() {
    const m = location.hash.match(/^#connect=(whoop|strava):(.+)$/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const d = load();
      d[m[1]] = JSON.parse(atob(decodeURIComponent(m[2])));
      save(d);
      return m[1];
    } catch { return null; }
  },

  // Workouts since `start` (Date) from every connected source.
  async sync(start) {
    const d = load();
    const out = [];
    const errors = [];
    const sources = [
      ['whoop', 'workouts', fromWhoop],
      ['strava', 'activities', fromStrava],
    ];
    for (const [provider, path, normalize] of sources) {
      if (!d[provider] || !d.server) continue;
      try {
        const token = await accessToken(provider);
        const res = await fetch(`${d.server}/${provider}/${path}?start=${encodeURIComponent(start.toISOString())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const body = await res.json();
        for (const r of body.records || []) {
          const w = normalize(r);
          if (w) out.push(w);
        }
      } catch (err) {
        errors.push(`${provider === 'strava' ? 'Garmin (Strava)' : 'WHOOP'}: ${err.message}`);
      }
    }
    return { workouts: out, errors };
  },
};

async function accessToken(provider) {
  const d = load();
  const t = d[provider];
  if (t.expires_at - Date.now() > 60_000) return t.access_token;
  const res = await fetch(`${d.server}/${provider}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  });
  if (!res.ok) throw new Error('sign-in expired — reconnect');
  const fresh = await res.json();
  d[provider] = { ...t, ...fresh, refresh_token: fresh.refresh_token || t.refresh_token };
  save(d);
  return d[provider].access_token;
}
