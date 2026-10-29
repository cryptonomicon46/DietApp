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

  // 2.0 Phase 10: a signed-in phone never uploads to the household code — who sees your trackers
  // is only what you chose in the family — and never reads someone who moved to their account.
  cur.set('lp.g.sync', JSON.stringify({ url: 'https://c.test', code: 'household-test-code' }));
  assert.equal((await account.connect()).householdOff, false, "Sam doesn't share with Pat yet");
  assert.equal(sync.household(), false, 'signed in: no household uploads, whatever is shared');
  assert.equal(sync.householdReads(), true, 'a partner who has not moved could still be read');
  assert.equal(sync.movedToAccount('amani'), true, "Pat's trackers are on Pat's account: never read from the code");
  await api(`/families/${family.fid}/members/${family.members[0].id}`, sam, 'PATCH', { shareWith: [add.member.id] });
  assert.equal((await account.connect()).householdOff, true);
  assert.equal(sync.householdReads(), false, 'both moved and sharing: the code is not even read');
  // Ask Claude goes through the account, not the household code.
  env.__assist = async (_, { text }) => ({ actions: [{ type: 'note', text }], note: 'ok' });
  const out = await account.assist('bench 3x8 at 135', { today: '2026-10-24' });
  assert.equal(out.ok, true);
  assert.equal(out.actions[0].text, 'bench 3x8 at 135');
  delete env.__assist;
  assert.equal((await account.assist('bench', {})).status, 501, 'demo connector: no Claude');

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

test('one set of dogs: family pets show in the trackers, tracker details go back, no duplicates', async () => {
  const sam = await signIn('dogs@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Dogs' });
  const photo = `data:image/jpeg;base64,${'B'.repeat(200)}`;
  // Added in the family app: one the trackers know by name, and one they don't.
  const pip = (await api(`/families/${family.fid}/members`, sam, 'POST', { kind: 'pet', name: 'Pip', species: 'dog', breed: 'Mix', avatar: photo })).member;
  await api(`/families/${family.fid}/members`, sam, 'POST', { kind: 'pet', name: 'Bo', species: 'dog' });
  const t0 = Date.now() - 60000;
  device({ 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': sam, 'fam.fid': family.fid, 'lp.g.owner': 'sandman',
    'lp.p.sandman.dogProfiles': {
      d1: { id: 'd1', name: 'Pip', emoji: '🐕', vaccines: [{ name: 'Rabies', due: '2027-01-01' }], times: { name: t0, vaccines: t0 }, updatedAt: t0, createdAt: t0 },
      d2: { id: 'd2', name: 'Zed', emoji: '🐩', breed: 'Poodle', times: { name: t0 }, updatedAt: t0, createdAt: t0 },
    } });
  await account.connect();
  await sync.pull();
  const { allDogs } = await import('../js/dogs.js');
  const dogs = Object.fromEntries(allDogs().map((d) => [d.name, d]));
  assert.deepEqual(Object.keys(dogs).sort(), ['Bo', 'Pip', 'Zed'], 'the trackers now show the family\'s dogs, once each');
  assert.equal(dogs.Pip.photo, photo);
  assert.equal(dogs.Pip.breed, 'Mix');
  assert.equal(dogs.Pip.vaccines[0].name, 'Rabies');

  // Back in the family app: Zed became a pet, Pip carries the trackers' vaccines.
  const fam = (await api(`/families/${family.fid}`, sam)).family;
  const pets = fam.members.filter((m) => m.kind === 'pet');
  assert.deepEqual(pets.map((m) => m.name).sort(), ['Bo', 'Pip', 'Zed']);
  assert.equal(pets.find((m) => m.name === 'Zed').breed, 'Poodle');
  assert.equal((await api(`/families/${family.fid}/members/${pip.id}/data`, sam)).data.profile.vaccines[0].name, 'Rabies');

  // Renamed in the family app: the trackers follow, and nothing is duplicated on the way back.
  await api(`/families/${family.fid}/members/${pip.id}`, sam, 'PATCH', { name: 'Pippa' });
  await sync.pull();
  const names = allDogs().map((d) => d.name).sort();
  assert.deepEqual(names, ['Bo', 'Pippa', 'Zed']);
  assert.equal((await api(`/families/${family.fid}`, sam)).family.members.filter((m) => m.kind === 'pet').length, 3);
});

test('🔐 an encrypted family: the trackers send only locked data, and a device without the key reads nothing', async () => {
  const { newKey, makeCheck, keys, isSealed } = await import('../family/crypto.js');
  const sam = await signIn('lock@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Locked' });
  const FK = newKey();
  await api(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  const conn = { 'lp.g.sync': { url: 'https://c.test' }, 'fam.token.live': sam, 'fam.fid': family.fid };
  // The phone has the key (as the family app stores it) and full trackers.
  device({ ...conn, 'lp.g.owner': 'sandman', 'lp.p.sandman.weights': [{ date: '2026-10-01', weight: 160 }] });
  await keys.set(family.fid, FK);
  await account.connect(); await sync.pull();
  const stored = await api(`/families/${family.fid}/members/${family.members[0].id}/data`, sam);
  assert.ok(isSealed(stored.data.enc) && !JSON.stringify(stored).includes('weights'), 'only locked data on the server');
  // A second device with the key gets the trackers.
  device({ ...conn });
  await keys.set(family.fid, FK);
  const { accountBoot } = await import('../js/account.js');
  await accountBoot();
  assert.deepEqual(J('lp.p.sandman.weights'), [{ date: '2026-10-01', weight: 160 }]);
  // A device without the key: nothing is read, and nothing readable is sent.
  device({ ...conn, 'lp.g.owner': 'sandman', 'lp.p.sandman.weights': [{ date: '2026-10-09', weight: 158 }] });
  await account.connect();
  await sync.pull();
  assert.deepEqual(J('lp.p.sandman.weights'), [{ date: '2026-10-09', weight: 158 }], 'its own copy is untouched');
  await assert.rejects(account.push(), /family key/);
  const after = await api(`/families/${family.fid}/members/${family.members[0].id}/data`, sam);
  assert.equal(after.data.enc, stored.data.enc, 'the locked copy is unchanged');
});
