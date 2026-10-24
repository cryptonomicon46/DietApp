// The trackers saved to the OurPawmily account (js/account.js): a second device picks them up,
// a partner's come through only when they share, and friends' families never see them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

// One browser's localStorage, swappable to play different devices.
let cur = new Map();
globalThis.localStorage = new Proxy({}, {
  get: (_, k) => ({ getItem: (x) => (cur.has(x) ? cur.get(x) : null), setItem: (x, v) => cur.set(x, String(v)), removeItem: (x) => cur.delete(x), clear: () => cur.clear() })[k],
  ownKeys: () => [...cur.keys()],
  getOwnPropertyDescriptor: (_, k) => (cur.has(k) ? { enumerable: true, configurable: true, value: cur.get(k) } : undefined),
});
const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const env = { HOUSEHOLD: kv(), DEMO: true };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const r = await familyApi(new Request(url, init), env, u.pathname.replace(/^\/v2/, ''));
  return new Response(JSON.stringify(r.data), { status: r.status });
};
const api = async (path, token, method = 'GET', body) => (await (await fetch(`https://c.test/v2${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })).json());
const signIn = async (email) => {
  const { token } = await (await fetch('https://c.test/v2/auth/demo', { method: 'POST', body: JSON.stringify({ email }) })).json();
  await api('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  return token;
};
const device = (entries) => { cur = new Map(Object.entries(entries).map(([k, v]) => [k, k.startsWith('fam.') ? v : JSON.stringify(v)])); };
const J = (k) => JSON.parse(cur.get(k));

const { account } = await import('../js/account.js');
const { sync } = await import('../js/sync.js');

test('trackers follow your account to a new device, and partners see them only when shared', async () => {
  const sam = await signIn('sam@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Fam' });
  const conn = { 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': sam, 'fam.fid': family.fid };

  // Phone A: the one Sam has been using, with weigh-ins on it.
  device({ ...conn, 'lp.g.owner': 'sandman', 'lp.p.sandman.weights': [{ date: '2026-10-01', weight: 160 }], 'lp.p.sandman.devices': { whoop: 'secret' } });
  assert.ok(await account.connect());
  assert.equal(account.get().profile, 'sandman');
  await sync.pull();
  let remote = await api(`/families/${family.fid}/members/${family.members[0].id}/data`, sam);
  assert.deepEqual(remote.data.weights, [{ date: '2026-10-01', weight: 160 }], "this device's copy went up");
  assert.equal(remote.data.devices, undefined, 'WHOOP/Strava sign-ins never leave the device');
  const phoneA = new Map(cur);

  // A Mac with nothing on it: signing in brings the trackers down, and it becomes Sam's.
  device(conn);
  const { accountBoot } = await import('../js/account.js');
  await accountBoot();
  assert.equal(J('lp.g.owner'), 'sandman');
  assert.deepEqual(J('lp.p.sandman.weights'), [{ date: '2026-10-01', weight: 160 }]);
  // A weigh-in on the Mac reaches the phone, which keeps its own WHOOP sign-in.
  cur.set('lp.p.sandman.weights', JSON.stringify([{ date: '2026-10-01', weight: 160 }, { date: '2026-10-02', weight: 159 }]));
  await sync.push();
  cur = phoneA;
  let mine = 0; globalThis.window = { dispatchEvent: (e) => { if (e.type === 'lp:mine') mine++; } };
  await sync.pull();
  assert.equal(J('lp.p.sandman.weights').length, 2);
  assert.deepEqual(J('lp.p.sandman.devices'), { whoop: 'secret' });
  assert.equal(mine, 1, 'the open app is told to show the new copy');
  delete globalThis.window;

  // Pat joins as the other tracker profile; nothing comes through until Pat shares with Sam.
  const pat = await signIn('pat@example.com');
  const add = await api(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await api(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await api(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  device({ 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': pat, 'fam.fid': family.fid, 'lp.g.owner': 'amani', 'lp.p.amani.weights': [{ date: '2026-10-01', weight: 130 }] });
  assert.equal((await account.connect()).profile, 'amani');
  await sync.pull();
  const patPhone = new Map(cur);

  cur = phoneA;
  await account.connect();
  await sync.pull();
  assert.equal(cur.get('lp.p.amani.weights'), undefined, "not shared yet: Sam doesn't get Pat's trackers");
  cur = patPhone;
  await api(`/families/${family.fid}/members/${add.member.id}`, pat, 'PATCH', { shareWith: [family.members[0].id] });
  cur = phoneA;
  await sync.pull();
  assert.deepEqual(J('lp.p.amani.weights'), [{ date: '2026-10-01', weight: 130 }]);

  // A friend's family (connected) and a kid's profile: no tracker data, ever.
  const friend = await signIn('friend@example.com');
  const finv = await api(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'family', email: 'friend@example.com' });
  await api(`/invites/${finv.invite.code}/accept`, friend, 'POST', { familyName: 'Friends' });
  for (const id of [family.members[0].id, add.member.id]) {
    const r = await fetch(`https://c.test/v2/families/${family.fid}/members/${id}/data`, { headers: { Authorization: `Bearer ${friend}` } });
    assert.equal(r.status, 404, "a friend's family can't read anyone's trackers");
  }
  const kid = await api(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Kiddo', relation: 'child' });
  await api(`/families/${family.fid}/members/${kid.member.id}/data`, sam, 'PUT', { data: { weights: [{ date: '2026-10-01', weight: 60 }] } });
  assert.equal((await fetch(`https://c.test/v2/families/${family.fid}/members/${kid.member.id}/data`, { headers: { Authorization: `Bearer ${friend}` } })).status, 404);
  const seen = JSON.stringify(await api('/feed', friend)) + JSON.stringify(await api(`/families/${family.fid}`, friend));
  assert.ok(!seen.includes('Kiddo') && !seen.includes('160') && !seen.includes('pat@example.com'));
});

test('a device signed in as someone else never takes over this tracker profile', async () => {
  const x = await signIn('x@example.com');
  await api('/families', x, 'POST', { name: 'X' });
  device({ 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': x, 'lp.g.owner': 'amani', 'lp.p.amani.weights': [1] });
  // Their own family: the free profile is this device's owner, so it's fine…
  assert.equal((await account.connect()).profile, 'amani');
  // …but signed out, nothing syncs to the account.
  cur.delete('fam.token.live');
  assert.equal(account.active(), false);
});

test('two copies are combined, so a nearly empty device never wipes a full one', async () => {
  const { mergeData } = await import('../js/account.js');
  assert.deepEqual(mergeData({ weights: [{ date: '2026-10-01', weight: 160 }], profile: { name: 'Sam', goal: 'cut' } },
    { weights: [{ date: '2026-10-01', weight: 161 }, { date: '2026-10-02', weight: 159 }], profile: { name: 'Sam' }, dogProfiles: { d1: { name: 'Rex' } } }, true),
  { weights: [{ date: '2026-10-01', weight: 161 }, { date: '2026-10-02', weight: 159 }], profile: { name: 'Sam', goal: 'cut' }, dogProfiles: { d1: { name: 'Rex' } } });
  // Several workouts on one day are all kept.
  assert.equal(mergeData({ activities: [{ date: '2026-10-01', type: 'run' }] }, { activities: [{ date: '2026-10-01', type: 'run' }, { date: '2026-10-01', type: 'lift' }] }).activities.length, 2);

  const sam = await signIn('sam2@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Fam2' });
  const conn = { 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': sam, 'fam.fid': family.fid };
  const full = { 'lp.p.sandman.mealLog': { '2026-10-01': { meals: ['eggs'] } }, 'lp.p.sandman.dogProfiles': { d1: { name: 'Rex' } }, 'lp.p.sandman.weights': [{ date: '2026-10-01', weight: 160 }] };
  // The phone connects first and uploads everything.
  device({ ...conn, 'lp.g.owner': 'sandman', ...full });
  await account.connect(); await sync.pull();
  const phone = new Map(cur);
  // The Mac had opened the trackers before and has just a profile on it.
  device({ ...conn, 'lp.g.owner': 'sandman', 'lp.p.sandman.profile': { name: 'Sam' } });
  await account.connect(); await sync.pull();
  assert.deepEqual(J('lp.p.sandman.dogProfiles'), { d1: { name: 'Rex' } }, 'the Mac gets the dogs and meals');
  assert.deepEqual(J('lp.p.sandman.mealLog'), { '2026-10-01': { meals: ['eggs'] } });
  cur.set('lp.p.sandman.weights', JSON.stringify([{ date: '2026-10-01', weight: 160 }, { date: '2026-10-03', weight: 158 }]));
  await sync.push();
  // Back on the phone: nothing lost, and the Mac's weigh-in and profile arrive.
  cur = phone;
  globalThis.window = { dispatchEvent: () => {} };
  await sync.pull();
  delete globalThis.window;
  assert.deepEqual(J('lp.p.sandman.dogProfiles'), { d1: { name: 'Rex' } });
  assert.deepEqual(J('lp.p.sandman.mealLog'), { '2026-10-01': { meals: ['eggs'] } });
  assert.equal(J('lp.p.sandman.weights').length, 2);
  assert.deepEqual(J('lp.p.sandman.profile'), { name: 'Sam' });
});
