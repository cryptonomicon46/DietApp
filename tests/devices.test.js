// ⌚ Checkpoint E — WHOOP, end to end: the phone's device code (js/devices.js) ↔ the connector
// (server/worker.js) ↔ a fake WHOOP. Connection, a sync, disconnect, access removed on WHOOP's side,
// an expired sign-in, WHOOP failing, no data, the same workout twice, reconnecting — and that a
// device never shares anything by itself: its data follows Fitness sharing, its sign-in goes nowhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

// One browser: localStorage, sessionStorage, the address bar.
const ls = new Map(), ss = new Map();
const mkStore = (m) => new Proxy({}, {
  get: (_, k) => ({ getItem: (x) => (m.has(x) ? m.get(x) : null), setItem: (x, v) => m.set(x, String(v)), removeItem: (x) => m.delete(x), clear: () => m.clear() })[k],
  ownKeys: () => [...m.keys()],
  getOwnPropertyDescriptor: (_, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : undefined),
});
globalThis.localStorage = mkStore(ls); globalThis.sessionStorage = mkStore(ss);
globalThis.location = { hash: '', pathname: '/DietApp/family/', search: '' };
globalThis.history = { replaceState: () => { location.hash = ''; } };

// WHOOP, played: workouts and cycles by page, tokens that can expire or be removed.
const whoop = { workouts: [], cycles: [], recovery: [], sleep: [], scope: null, dailyOk: true, valid: new Set(['A1']), refreshOk: true, down: false, revoked: [], calls: [] };
const W = (id, day, kj = 1255.2) => ({ id, sport_name: 'functional-fitness', start: `${day}T15:00:00.000Z`, end: `${day}T16:00:00.000Z`, score_state: 'SCORED', score: { kilojoule: kj, strain: 9.1, average_heart_rate: 120 } });
async function fakeWhoop(url, init = {}) {
  const u = new URL(url), auth = (init.headers?.Authorization || init.headers?.get?.('Authorization') || '').replace('Bearer ', '');
  whoop.calls.push(`${init.method || 'GET'} ${u.pathname}`);
  if (u.pathname === '/oauth/oauth2/token') {
    const p = new URLSearchParams(String(init.body));
    const sc = whoop.scope ? { scope: whoop.scope } : {};
    if (p.get('grant_type') === 'authorization_code') return Response.json({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600, ...sc });
    if (!whoop.refreshOk) return Response.json({ error: 'invalid_grant', error_description: 'refresh token revoked' }, { status: 400 });
    whoop.valid.add('A2'); return Response.json({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600, ...sc });
  }
  if (whoop.down) return Response.json({ message: 'unavailable' }, { status: 503 });
  if (u.pathname === '/developer/v2/user/access' && init.method === 'DELETE') { whoop.revoked.push(auth); whoop.valid.delete(auth); return new Response(null, { status: 204 }); }
  if (!whoop.valid.has(auth)) return Response.json({ message: 'unauthorized' }, { status: 401 });
  if (/\/(recovery|activity\/sleep)$/.test(u.pathname) && !whoop.dailyOk) return Response.json({ message: 'forbidden' }, { status: 403 });
  const list = u.pathname.endsWith('/cycle') ? whoop.cycles : u.pathname.endsWith('/recovery') ? whoop.recovery : u.pathname.endsWith('/activity/sleep') ? whoop.sleep : whoop.workouts;
  const at = +(u.searchParams.get('nextToken') || 0), page = list.slice(at, at + 2);
  return Response.json({ records: page, next_token: at + 2 < list.length ? String(at + 2) : null });
}
const env = { APP_ORIGIN: 'https://app.test/DietApp/', WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'csecret', DEMO: true, HOUSEHOLD: (() => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; })() };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname === 'api.prod.whoop.com') return fakeWhoop(String(url), init);
  if (u.hostname === 'w.test' && u.pathname.startsWith('/v2/')) { const r = await familyApi(new Request(url, init), env, u.pathname.slice(3)); return new Response(r.raw || JSON.stringify(r.data), { status: r.status }); }
  if (u.hostname === 'w.test') return worker.fetch(new Request(url, init), env);
  return realFetch(url, init);
};
ls.set('fam.server', 'https://w.test'); ls.set('lp.g.owner', '"sandman"');

const { devices, syncOwner, mergeSynced, hasDaily } = await import('../js/devices.js');
const { exportProfile, profileStore } = await import('../js/storage.js');
const { splitHealth } = await import('../js/healthParts.js');
const me = profileStore('sandman');

// Tap Connect → WHOOP (says yes) → the connector's callback → back in the app.
async function connect({ say = 'yes', tamper = false } = {}) {
  const go = await fetch(devices.connectUrl('whoop', { back: 'family' }), { redirect: 'manual' });
  const auth = new URL(go.headers.get('Location'));
  const state = tamper ? 'someone-elses-state-123456' : auth.searchParams.get('state');
  const cb = await fetch(`https://w.test/whoop/callback?${say === 'yes' ? 'code=c1&' : 'error=access_denied&'}state=${state}`, { redirect: 'manual' });
  const back = new URL(cb.headers.get('Location'));
  location.hash = back.hash;
  return { auth, back, result: devices.takeRedirect() };
}

test('connect: only the scopes it needs, the state checked, back to Health, the sign-in on this device only', async () => {
  const { auth, back, result } = await connect();
  assert.equal(auth.origin + auth.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(auth.searchParams.get('scope'), 'offline read:workout read:cycles read:recovery read:sleep');
  assert.equal(auth.searchParams.get('client_id'), 'cid'); assert.equal(auth.searchParams.get('client_secret'), null);
  assert.equal(back.pathname, '/DietApp/family/', 'returns to the family app');
  assert.equal(back.search, '', 'tokens only in the fragment, never in a URL a server logs');
  assert.deepEqual(result, { provider: 'whoop', ok: true });
  assert.equal(devices.get().whoop.access_token, 'A1');
  assert.equal(devices.status('whoop').text, 'Connected · syncing soon');
  // The sign-in never leaves the device: not in the shared copy, not in any part.
  const shared = exportProfile('sandman', { shared: true });
  assert.equal(shared.devices, undefined);
  assert.ok(!JSON.stringify(splitHealth(shared)).includes('A1'));
  // The connector's settings say only whether WHOOP is set up — never its keys.
  const cfg = await (await fetch('https://w.test/v2/config')).json();
  assert.deepEqual(cfg.devices, { whoop: true }); assert.ok(!JSON.stringify(cfg).includes('csecret'));
});

test('a sign-in that did not start here, or a "no" on WHOOP\'s page, connects nothing', async () => {
  const keep = devices.get().whoop;
  assert.deepEqual((await connect({ tamper: true })).result, { provider: 'whoop', error: 'state' });
  assert.deepEqual((await connect({ say: 'no' })).result, { provider: 'whoop', error: 'denied' });
  assert.deepEqual(devices.get().whoop, keep, 'the existing connection is untouched');
});

test('no data yet: connected, nothing brought in, said plainly', async () => {
  const r = await syncOwner(3);
  assert.deepEqual(r, { added: 0, errors: [] });
  assert.match(devices.status('whoop').text, /no new workouts/);
});

test('a sync: every page, each workout once, the day\'s total burn for Diet', async () => {
  whoop.workouts = [W('w1', '2026-10-26'), W('w2', '2026-10-27'), W('w2', '2026-10-27'), W('w3', '2026-10-28'), { ...W('w4', '2026-10-28'), score_state: 'PENDING_SCORE' }];
  // A WHOOP day starts when you fall asleep (here 11:30 PM the evening before, in UTC-7): it's the next day's.
  whoop.cycles = [{ start: '2026-10-27T06:30:00.000Z', score_state: 'SCORED', score: { kilojoule: 10460 } }, { start: '2026-10-28T06:30:00.000Z', score_state: 'SCORED', score: { kilojoule: 8368 } }];
  const r = await syncOwner(3);
  assert.equal(r.added, 3, 'w2 twice across pages is one workout; an unscored one waits');
  assert.deepEqual(me.get('workoutHistory').map((w) => w.id).sort(), ['whoop:w1', 'whoop:w2', 'whoop:w3']);
  assert.deepEqual(me.get('workoutHistory')[0], { id: 'whoop:w1', name: 'functional-fitness', start: '2026-10-26T15:00:00.000Z', minutes: 60, kcal: 300, strain: 9.1, avgHr: 120 });
  const dayOf = (iso) => new Date(Date.parse(iso) + 12 * 3600e3).toLocaleDateString('en-CA');
  assert.equal(me.get('deviceTotal')[dayOf('2026-10-28T06:30:00.000Z')], 2000);
  assert.equal(me.get('deviceTotal')[dayOf('2026-10-27T06:30:00.000Z')], 2500);
  // Again: nothing new, nothing doubled.
  assert.equal((await syncOwner(3)).added, 0);
  assert.equal(me.get('workoutHistory').length, 3);
  // Synced workouts and the day total are Fitness — nothing else.
  const parts = splitHealth(exportProfile('sandman', { shared: true }));
  assert.ok(parts.fitness.workoutHistory && parts.fitness.deviceTotal);
  assert.ok(!('workoutHistory' in parts.diet) && !('deviceTotal' in parts.diet) && !('workoutHistory' in parts.us));
});

test('an expired sign-in renews itself', async () => {
  const d = devices.get(); d.whoop.expires_at = Date.now() - 1000; me.set('devices', d);
  whoop.workouts.push(W('w5', '2026-10-28'));
  assert.equal((await syncOwner(3)).added, 1);
  assert.equal(devices.get().whoop.access_token, 'A2'); assert.equal(devices.get().whoop.refresh_token, 'R2');
});

test('WHOOP failing: still connected, said plainly, fine next time', async () => {
  whoop.down = true;
  const r = await syncOwner(3);
  assert.deepEqual(r.errors.map((e) => e.kind), ['unavailable']);
  assert.match(devices.status('whoop').text, /couldn't reach WHOOP/);
  assert.equal(devices.get().whoop.access_token, 'A2', 'kept');
  whoop.down = false;
  assert.deepEqual((await syncOwner(3)).errors, []);
  assert.doesNotMatch(devices.status('whoop').text, /couldn't/);
});

test('access removed on WHOOP\'s side: reconnect asked for; reconnecting brings it back without duplicates', async () => {
  whoop.valid.clear(); whoop.refreshOk = false;
  const r = await syncOwner(3);
  assert.deepEqual(r.errors.map((e) => e.kind), ['reconnect']);
  assert.equal(devices.status('whoop').needsReconnect, true);
  whoop.refreshOk = true; whoop.valid.add('A1');
  const before = devices.get().whoop.lastSync;
  assert.deepEqual((await connect()).result, { provider: 'whoop', ok: true });
  assert.equal(devices.get().whoop.lastSync, before, 'reconnecting keeps what was known');
  assert.equal(devices.status('whoop').needsReconnect, undefined);
  whoop.workouts.push(W('w1', '2026-10-26'));
  await syncOwner(3);
  assert.equal(me.get('workoutHistory').length, 4, 'the same workouts again are not added twice');
});

test('disconnect: WHOOP asked to remove access, the sign-in forgotten, the workouts kept', async () => {
  const token = devices.get().whoop.access_token;
  await devices.disconnect('whoop');
  assert.deepEqual(whoop.revoked, [token]);
  assert.equal(devices.get().whoop, undefined);
  assert.equal(devices.status('whoop').text, 'Not connected');
  assert.equal(me.get('workoutHistory').length, 4);
  assert.deepEqual(await syncOwner(3), { added: 0, errors: [] }, 'nothing to sync');
  // Disconnecting when WHOOP is down still forgets the sign-in here.
  await connect(); whoop.down = true;
  await devices.disconnect('whoop');
  assert.equal(devices.get().whoop, undefined); whoop.down = false;
});

test('the synced data follows Fitness sharing on the server: without permission, Diet-only, Fitness-only', async () => {
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const F = `/families/${family.fid}`, samId = family.members[0].id;
  for (const [tok, email, relation] of [[pat, 'pat@example.com', 'spouse'], [mom, 'mom@example.com', 'parent']]) {
    const add = await call(`${F}/members`, sam, 'POST', { kind: 'person', name: email.split('@')[0], relation, email });
    const inv = await call(`${F}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, tok, 'POST');
  }
  const ids = Object.fromEntries((await call(F, sam)).family.members.map((m) => [m.name, m.id]));
  const parts = splitHealth(exportProfile('sandman', { shared: true }));
  for (const part of ['diet', 'fitness']) await call(`${F}/members/${samId}/health/${part}`, sam, 'PUT', { data: parts[part] });
  const see = async (tok, part) => (await call(`${F}/members/${samId}/health/${part}`, tok)).status;
  assert.deepEqual([await see(pat, 'fitness'), await see(mom, 'fitness')], [403, 403], 'connecting shared nothing');
  await call(`${F}/members/${samId}`, sam, 'PATCH', { share: { diet: [ids.pat], fitness: [] } });
  assert.deepEqual([await see(pat, 'diet'), await see(pat, 'fitness')], [200, 403], 'Diet only: no workouts, no WHOOP burn');
  await call(`${F}/members/${samId}`, sam, 'PATCH', { share: { diet: [], fitness: [ids.mom] } });
  assert.deepEqual([await see(mom, 'diet'), await see(mom, 'fitness'), await see(pat, 'fitness')], [403, 200, 403], 'Fitness only, to Mom only');
  const got = await call(`${F}/members/${samId}/health/fitness`, mom);
  assert.equal(got.data.workoutHistory.length, 4);
  assert.ok(!JSON.stringify(got).match(/A1|A2|R1|R2|csecret/), 'no sign-in anywhere in what Mom gets');
});

test('Recovery and Sleep: only with WHOOP\'s permission, only when OurPawmily asks, kept private — and an older connection keeps syncing workouts', async () => {
  // An older connection (made before Recovery and Sleep were asked for): no scope known.
  whoop.scope = null; whoop.calls = [];
  await connect();
  assert.equal(hasDaily(devices.get().whoop), false);
  assert.equal(devices.status('whoop').dailyMissing, true);
  const r0 = await syncOwner(3, { daily: true });
  assert.deepEqual(r0.errors, []);
  assert.ok(!whoop.calls.some((c) => /recovery|sleep/.test(c)), 'not asked without permission');
  assert.equal(me.get('whoopDaily'), undefined);
  // Reconnected with the new scopes.
  whoop.scope = 'offline read:workout read:cycles read:recovery read:sleep';
  await connect();
  assert.equal(hasDaily(devices.get().whoop), true);
  assert.equal(devices.status('whoop').dailyMissing, undefined);
  const wake = new Date(); wake.setHours(6, 30, 0, 0);
  const today = wake.toLocaleDateString('en-CA'), tz = (() => { const m = -wake.getTimezoneOffset(); return `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`; })();
  whoop.sleep = [{ id: 'sl1', cycle_id: 77, start: new Date(wake - 8 * 3.6e6).toISOString(), end: wake.toISOString(), timezone_offset: tz, nap: false, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 8 * 3.6e6, total_light_sleep_time_milli: 4 * 3.6e6, total_slow_wave_sleep_time_milli: 1.5 * 3.6e6, total_rem_sleep_time_milli: 1.5 * 3.6e6 }, sleep_needed: { baseline_milli: 7.5 * 3.6e6 }, sleep_performance_percentage: 91 } }];
  whoop.recovery = [{ cycle_id: 77, sleep_id: 'sl1', score_state: 'SCORED', score: { user_calibrating: false, recovery_score: 58, resting_heart_rate: 52, hrv_rmssd_milli: 70.2 } }];
  whoop.calls = [];
  await syncOwner(3); // the trackers' sync: workouts only
  assert.ok(!whoop.calls.some((c) => /recovery|sleep/.test(c)));
  assert.equal(me.get('whoopDaily'), undefined);
  await syncOwner(3, { daily: true });
  assert.ok(whoop.calls.includes('GET /developer/v2/recovery') && whoop.calls.includes('GET /developer/v2/activity/sleep'));
  const daily = me.get('whoopDaily');
  assert.equal(daily[today].whoop.recovery.score.recovery_score, 58);
  assert.equal(daily[today].whoop.sleep.score.sleep_performance_percentage, 91);
  // Private: in your own full copy only, never in a part anyone can be given.
  const shared = exportProfile('sandman', { shared: true });
  assert.ok(shared.whoopDaily, 'in your own account copy');
  const parts = splitHealth(shared);
  assert.ok(!JSON.stringify(parts).includes('recovery_score') && !JSON.stringify(parts).includes('sl1'));
  // WHOOP stops allowing Recovery and Sleep: workouts keep coming, Health asks to reconnect.
  whoop.dailyOk = false; whoop.workouts.push(W('w9', '2026-10-29'));
  const r = await syncOwner(3, { daily: true });
  assert.deepEqual(r.errors, []); assert.equal(r.added, 1);
  assert.equal(devices.status('whoop').dailyMissing, true);
  assert.equal(devices.status('whoop').needsReconnect, undefined, 'workouts still connected');
  assert.equal(me.get('whoopDaily')[today].whoop.recovery.score.recovery_score, 58, 'what came in stays');
  whoop.dailyOk = true;
});
