// 💪 Diet, Fitness and Us parts: split on the phone, each shared on its own, and the full copy
// stays yours once the parts exist (older single "share" list counts for both until then).
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { splitHealth, joinParts, PARTS } from '../js/healthParts.js';

test('split: each tracker key goes to one part; device sign-ins and calendar links go nowhere', () => {
  const p = splitHealth({ profile: { goal: 'cut' }, weights: [1], workouts: [2], lift: {}, rhythm: {}, taste: {}, devices: { whoop: 'tok' }, calFeeds: ['webcal://secret'], lastSync: 1 });
  assert.deepEqual(Object.keys(p.diet).sort(), ['profile', 'weights']);
  assert.deepEqual(Object.keys(p.fitness).sort(), ['lift', 'workouts']);
  assert.deepEqual(Object.keys(p.us).sort(), ['rhythm', 'taste']);
  assert.ok(!JSON.stringify(p).includes('secret') && !JSON.stringify(p).includes('tok'));
  const all = Object.values(PARTS).flat();
  assert.equal(new Set(all).size, all.length, 'no key is in two parts');
  assert.deepEqual(joinParts(p.diet, null, p.fitness), { ...p.diet, ...p.fitness });
});

async function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const ids = { Sam: family.members[0].id };
  for (const [t, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [mom, 'mom@example.com', 'Mom', 'parent']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    ids[name] = add.member.id;
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, t, 'POST');
  }
  return { m, call, sam, pat, mom, ids, F: `/families/${family.fid}` };
}

test('an older single list keeps working until the phone splits; then each part follows its own list', async () => {
  const { call, sam, pat, mom, ids, F } = await setup();
  const S = `${F}/members/${ids.Sam}`;
  await call(`${S}/data`, sam, 'PUT', { data: { profile: { goal: 'cut' }, workouts: [1], calFeeds: ['x'] } });
  // An older app shares "diet & fitness" with Pat: Pat reads the full copy, as before.
  await call(S, sam, 'PATCH', { shareWith: [ids.Pat] });
  assert.equal((await call(`${S}/data`, pat)).status, 200);
  assert.equal((await call(`${S}/data`, mom)).status, 403);
  // Sam's phone splits: from now on Pat gets the parts, not the full copy.
  for (const [part, data] of Object.entries({ diet: { profile: { goal: 'cut' } }, fitness: { workouts: [1] }, us: { rhythm: {} } })) assert.equal((await call(`${S}/health/${part}`, sam, 'PUT', { data })).status, 200);
  const full = await call(`${S}/data`, pat);
  assert.equal(full.status, 403); assert.equal(full.parts, true);
  assert.equal((await call(`${S}/health/diet`, pat)).status, 200);
  assert.equal((await call(`${S}/health/fitness`, pat)).status, 200, 'the old list counts for both');
  // Sam narrows it: Diet yes, Fitness no.
  const r = await call(S, sam, 'PATCH', { share: { diet: [ids.Pat], fitness: [] } });
  assert.deepEqual(r.member.share, { diet: [ids.Pat], fitness: [] });
  assert.equal((await call(`${S}/health/diet`, pat)).status, 200);
  assert.equal((await call(`${S}/health/fitness`, pat)).status, 403);
  // Us is the partner's, whatever the lists say; Mom never gets it.
  assert.equal((await call(`${S}/health/us`, pat)).status, 200);
  assert.equal((await call(`${S}/health/us`, mom)).status, 403);
  // Nobody grants themselves someone else's, and nobody writes someone else's parts.
  assert.equal((await call(S, pat, 'PATCH', { share: { diet: [ids.Pat], fitness: [ids.Pat] } })).status, 403);
  assert.equal((await call(`${S}/health/diet`, pat, 'PUT', { data: {} })).status, 403);
  assert.equal((await call(`${S}/health/diet`, mom)).status, 403);
});
