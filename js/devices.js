import { fromWhoop, fromStrava } from './activity.js';
import { profileStore, ownerId } from './storage.js';
import { serverUrl } from './server.js';
import { dailyFrom, mergeDaily, cycleDay, hasDaily } from './whoopDay.js';

// 🔌 Devices: talks to the connector (server/worker.js), which only passes WHOOP's sign-in and data
// through. The sign-in (tokens) is kept on this device, under the phone owner's own trackers — never
// in the copy saved to your account, never shared with anyone in the family. What a sync brings in
// (workouts, each day's total burn) goes into your Fitness like anything you log, so it follows
// your Fitness sharing — connecting a device shares nothing by itself.
//
// Each connection: { access_token, refresh_token, expires_at, scope?, connectedAt, lastSync, count, problem? }
//   scope: what WHOOP granted. A connection made before Recovery and Sleep were asked for keeps
//   bringing in workouts; Health asks to reconnect for the rest (hasDaily).
// Recovery and Sleep (`whoopDaily`, js/whoopDay.js) are brought in only by OurPawmily signed in
// (syncOwner(…, { daily: true })), and kept in your own full copy — in no Health part, so they're
// shared with nobody, whatever your Fitness sharing.
//   problem: 'reconnect' (WHOOP said no: access removed or the sign-in ran out) or 'unavailable'
//   (WHOOP or the network didn't answer — kept connected, tried again next time).
const own = () => profileStore(ownerId() || 'sandman');
const load = () => own().get('devices', {});
const save = (d) => own().set('devices', d);
const server = (d = load()) => d.server || serverUrl();
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch { /* */ } } };
const randomState = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c])); };
export const NAMES = { whoop: 'WHOOP', strava: 'Garmin (through Strava)' };

class DeviceError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

export const devices = {
  get() { return load(); },
  server: () => server(),
  // Where Connect goes. The state is remembered for this tab and checked when WHOOP sends you back.
  connectUrl(provider, { back } = {}) {
    const state = `${randomState()}${back === 'family' ? '.f' : ''}`;
    ss.set('lp.oauthState', state);
    return `${server()}/${provider}/login?state=${encodeURIComponent(state)}`;
  },
  // Called on page load: the connector sends you back with #connect=<provider>:<base64>:<state>.
  // → { provider, ok } | { provider, error } | null
  takeRedirect() {
    const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#connect=(whoop|strava):([^:]+)(?::([A-Za-z0-9_.-]+))?$/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    const expected = ss.get('lp.oauthState');
    ss.del('lp.oauthState');
    if (!m[3] || m[3] !== expected) return { provider: m[1], error: 'state' };
    let got;
    try { got = JSON.parse(atob(decodeURIComponent(m[2]))); } catch { return { provider: m[1], error: 'failed' }; }
    if (got.error || !got.access_token) return { provider: m[1], error: got.error || 'failed' };
    const d = load();
    const was = d[m[1]] || {};
    // Reconnecting keeps what's known (last sync); a new sign-in replaces the old one.
    d[m[1]] = { lastSync: was.lastSync, count: was.count, connectedAt: Date.now(), access_token: got.access_token, refresh_token: got.refresh_token, expires_at: got.expires_at, ...(typeof got.scope === 'string' ? { scope: got.scope } : {}) };
    save(d);
    return { provider: m[1], ok: true };
  },
  // Forget the sign-in here and ask WHOOP to drop this app's access (best effort). Synced workouts stay.
  async disconnect(provider) {
    // A fresh token first (they last about an hour), so WHOOP can actually be asked.
    const token = load()[provider] ? await accessToken(provider).catch(() => load()[provider]?.access_token) : null;
    const d = load();
    delete d[provider]; save(d);
    if (provider === 'whoop' && token) await fetch(`${server(d)}/whoop/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  },
  // A line for the Devices screen.
  status(provider) {
    const t = load()[provider];
    if (!t) return { connected: false, text: 'Not connected' };
    if (t.problem === 'reconnect') return { connected: true, needsReconnect: true, text: 'WHOOP stopped sharing with OurPawmily — reconnect to keep syncing' };
    const when = t.lastSync ? new Date(t.lastSync).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    if (t.problem === 'unavailable') return { connected: true, text: `Connected · couldn't reach WHOOP${when ? ` (last synced ${when})` : ''} — tries again next time` };
    const more = provider === 'whoop' && !hasDaily(t) ? { dailyMissing: true } : {};
    if (!t.lastSync) return { connected: true, text: 'Connected · syncing soon', ...more };
    return { connected: true, text: `Connected · last synced ${when}${t.count === 0 ? ' · no new workouts' : ''}`, ...more };
  },

  // Workouts and day totals since `start` (Date) from every connected source; with `daily` (a
  // Date), WHOOP's recoveries, sleeps and days since then too.
  // → { workouts, totals: {date: kcal}, daily?: {recoveries, sleeps, cycles}, errors: [{provider, kind, message}] }
  async sync(start, { daily = null } = {}) {
    const d = load();
    const out = [], totals = {}, errors = [];
    let days = null;
    for (const provider of ['whoop', 'strava']) {
      if (!d[provider]) continue;
      try {
        const got = provider === 'whoop' ? await whoopSince(start, daily && hasDaily(d.whoop) ? daily : null) : await stravaSince(start);
        out.push(...got.workouts); Object.assign(totals, got.totals || {});
        if (got.daily) days = got.daily;
        mark(provider, { problem: undefined, lastSync: Date.now(), count: got.workouts.length });
      } catch (err) {
        const kind = err.kind || 'unavailable';
        mark(provider, { problem: kind });
        errors.push({ provider, kind, message: kind === 'reconnect' ? `${NAMES[provider]}: reconnect to keep syncing` : `${NAMES[provider]}: couldn't sync right now` });
      }
    }
    return { workouts: out, totals, errors, ...(days ? { daily: days } : {}) };
  },
};
export { hasDaily };
const mark = (provider, patch) => { const d = load(); if (!d[provider]) return; d[provider] = { ...d[provider], ...patch }; if (!d[provider].problem) delete d[provider].problem; save(d); };

// A fresh access token (refreshed a minute before it runs out).
async function accessToken(provider, force = false) {
  const d = load(), t = d[provider];
  if (!force && t.expires_at - Date.now() > 60_000) return t.access_token;
  const res = await fetch(`${server(d)}/${provider}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }) }).catch(() => null);
  if (!res) throw new DeviceError('unavailable', 'offline');
  if (res.status === 401 || res.status === 400) {
    // The other app on this device (trackers / OurPawmily) may have just renewed it: use that one.
    const now = load()[provider];
    if (now?.refresh_token && now.refresh_token !== t.refresh_token) return now.expires_at - Date.now() > 60_000 ? now.access_token : accessToken(provider, true);
    throw new DeviceError('reconnect', 'sign-in removed or ran out');
  }
  if (!res.ok) throw new DeviceError('unavailable', `${res.status}`);
  const fresh = await res.json();
  const cur = load();
  cur[provider] = { ...cur[provider], ...fresh, refresh_token: fresh.refresh_token || t.refresh_token };
  save(cur);
  return cur[provider].access_token;
}
// GET through the connector; a 401 gets one refresh-and-retry, then means reconnect.
async function get(provider, path) {
  for (let i = 0; i < 2; i++) {
    const token = await accessToken(provider, i > 0);
    const res = await fetch(`${server()}/${provider}/${path}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res) throw new DeviceError('unavailable', 'offline');
    if (res.status === 401 && i === 0) continue;
    if (res.status === 401 || res.status === 403) throw new DeviceError('reconnect', `${res.status}`);
    if (!res.ok) throw new DeviceError('unavailable', `${res.status}`);
    return res.json();
  }
  return null;
}
// WHOOP: every page of workouts (and of days) since `start`, up to 8 pages each; with `daily`,
// recoveries, sleeps and days since then too (a sign-in WHOOP no longer lets read them keeps
// bringing in workouts).
async function whoopSince(start, daily = null) {
  const pages = async (path, from = start) => {
    const all = [];
    let next = '';
    for (let i = 0; i < 8; i++) {
      const body = await get('whoop', `${path}?start=${encodeURIComponent(from.toISOString())}${next ? `&nextToken=${encodeURIComponent(next)}` : ''}`);
      all.push(...(body?.records || []));
      next = body?.next_token || body?.nextToken || '';
      if (!next) break;
    }
    return all;
  };
  const workouts = dedupe((await pages('workouts')).map(fromWhoop).filter(Boolean));
  const totals = {};
  const cycles = await pages('cycles', daily && daily < start ? daily : start);
  for (const c of cycles) {
    if (c.score_state && c.score_state !== 'SCORED') continue;
    const kj = c.score?.kilojoule;
    if (!kj || !c.start) continue;
    // A WHOOP day starts when you fall asleep, often the evening before: it belongs to the next
    // day — on the calendar where you were (the cycle's own offset), see js/whoopDay.js.
    const day = cycleDay(c);
    totals[day] = Math.max(totals[day] || 0, Math.round(kj / 4.184));
  }
  if (!daily) return { workouts, totals, cycles };
  try {
    return { workouts, totals, daily: { recoveries: await pages('recovery', daily), sleeps: await pages('sleep', daily), cycles } };
  } catch (err) {
    if (err.kind !== 'reconnect') throw err;
    mark('whoop', { scope: (load().whoop?.scope || '').replace(/\s*read:(recovery|sleep)\b/g, '') });
    return { workouts, totals, cycles };
  }
}
async function stravaSince(start) {
  const body = await get('strava', `activities?start=${encodeURIComponent(start.toISOString())}`);
  return { workouts: dedupe((body?.records || []).map(fromStrava).filter(Boolean)) };
}
const dedupe = (list) => [...new Map(list.map((w) => [w.id, w])).values()];

// What a sync brought in → the owner's trackers (the same records Fitness and Diet read). The same
// workout coming twice (a re-sync, a reconnect, two pages) is kept once, by its device id.
export function mergeSynced(st, { workouts = [], totals = {}, daily = null }, now = Date.now()) {
  const history = new Map(st.get('workoutHistory', []).map((w) => [w.id, w]));
  // Heart rate and zones (when WHOOP has them) go with the workout: they're Fitness, like its strain.
  const hr = (w) => Object.fromEntries(['avgHr', 'maxHr', 'zones', 'tz'].filter((k) => w[k] != null).map((k) => [k, w[k]]));
  for (const w of workouts) history.set(w.id, { id: w.id, name: w.name, start: w.start, minutes: w.minutes, kcal: w.kcal, strain: w.strain ?? null, ...hr(w) });
  st.set('workoutHistory', [...history.values()]);
  const cutoff = now - 14 * 86400000;
  const recent = new Map(st.get('workouts', []).map((w) => [w.id, w]));
  for (const w of workouts) recent.set(w.id, w);
  st.set('workouts', [...recent.values()].filter((w) => new Date(w.start).getTime() > cutoff).sort((a, b) => a.start.localeCompare(b.start)));
  if (Object.keys(totals).length) {
    const keep = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
    st.set('deviceTotal', Object.fromEntries(Object.entries({ ...st.get('deviceTotal', {}), ...totals }).filter(([k]) => k >= keep)));
  }
  if (daily) {
    const d = new Date(now), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stored = st.get('whoopDaily', {}) || {};
    st.set('whoopDaily', mergeDaily(stored, dailyFrom(daily, stored), today, now));
  }
  st.set('lastSync', now);
}
// ⌚ Today's Strain while 💪 Health is open (every few minutes): just the day so far — the current
// cycle and the last day and a half of workouts (2 WHOOP requests), kept on this phone. Nothing is
// saved to your account here; the next full sync does that. → whether anything changed.
export async function refreshToday(now = Date.now()) {
  const d = load();
  if (!ownerId() || !d.whoop || d.whoop.problem === 'reconnect') return false;
  const st = own(), key = () => JSON.stringify([Object.entries(st.get('whoopDaily', {}) || {}).map(([k, e]) => [k, e.whoop]), st.get('workoutHistory', []).filter((w) => /^whoop:/.test(w.id)).slice(-20)]);
  const before = key();
  const got = await whoopSince(new Date(now - 36 * 3600e3));
  mergeSynced(st, { workouts: got.workouts, totals: got.totals, daily: { cycles: got.cycles } }, now);
  mark('whoop', { todayAt: now });
  return key() !== before;
}
// Sync the phone owner's devices into their trackers. → { added, errors }
// `daily`: also WHOOP's Recovery and Sleep (OurPawmily only) — a month the first time, so your
// usual range can be worked out at once.
export async function syncOwner(days = 3, { daily = false } = {}) {
  if (!ownerId() || !Object.keys(load()).some((k) => k === 'whoop' || k === 'strava')) return { added: 0, errors: [] };
  const start = new Date(); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
  const st = own();
  const before = new Set(st.get('workoutHistory', []).map((w) => w.id));
  let from = null;
  if (daily) { from = new Date(start); if (Object.keys(st.get('whoopDaily', {}) || {}).length < 25) from.setDate(from.getDate() - 28); else from.setDate(from.getDate() - 1); }
  const got = await devices.sync(start, { daily: from });
  mergeSynced(st, got);
  return { added: got.workouts.filter((w) => !before.has(w.id)).length, errors: got.errors };
}
