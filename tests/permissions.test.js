// 🔑 Checkpoint B — the permission matrix: Google account → Family → Membership → Permissions.
// Household areas (Home, Calendar, Threads) are chosen by the family's creator per member; Diet and
// Fitness are each person's own to share, separately. Every check is the server's, not the UI's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION, hasArea, shareOf, canSeePart } from '../server/family.js';

async function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const t = { sam: await signIn('sam@example.com'), pat: await signIn('pat@example.com'), mom: await signIn('mom@example.com'), kid: await signIn('kid@example.com'), out: await signIn('stranger@example.com') };
  const { family } = await call('/families', t.sam, 'POST', { name: 'Fam' });
  const id = { sam: family.members[0].id };
  for (const [who, name, relation] of [['pat', 'Pat', 'spouse'], ['mom', 'Mom', 'parent'], ['kid', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, t.sam, 'POST', { kind: 'person', name, relation, email: `${who}@example.com` });
    id[who] = add.member.id;
    const inv = await call(`/families/${family.fid}/invites`, t.sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, t[who], 'POST');
  }
  const { family: other } = await call('/families', t.out, 'POST', { name: 'Other' });
  const F = `/families/${family.fid}`;
  // Every person saves their parts once (the 2.0 app does this on first open).
  for (const who of ['sam', 'pat', 'mom', 'kid']) for (const part of ['diet', 'fitness', 'us']) await call(`${F}/members/${id[who]}/health/${part}`, t[who], 'PUT', { data: { [part]: who } });
  return { m, call, t, id, F, fid: family.fid, otherF: `/families/${other.fid}` };
}
const can = async (call, F, owner, viewerTok, part) => (await call(`${F}/members/${owner}/health/${part}`, viewerTok)).status;

test('Diet only, Fitness only, both, neither — each part on its own', async () => {
  const { call, t, id, F } = await setup();
  const S = `${F}/members/${id.sam}`;
  const set = (diet, fitness) => call(S, t.sam, 'PATCH', { share: { diet, fitness } });
  const grid = async () => Object.fromEntries(await Promise.all(['pat', 'mom', 'kid'].map(async (w) => [w, `${await can(call, F, id.sam, t[w], 'diet')}/${await can(call, F, id.sam, t[w], 'fitness')}`])));
  assert.deepEqual(await grid(), { pat: '403/403', mom: '403/403', kid: '403/403' }, 'private by default');
  await set([id.pat], []);
  assert.deepEqual(await grid(), { pat: '200/403', mom: '403/403', kid: '403/403' }, 'Diet only');
  await set([], [id.mom]);
  assert.deepEqual(await grid(), { pat: '403/403', mom: '403/200', kid: '403/403' }, 'Fitness only');
  await set([id.pat, id.kid], [id.pat, id.kid]);
  assert.deepEqual(await grid(), { pat: '200/200', mom: '403/403', kid: '200/200' }, 'both (a kid too, when the person chooses)');
  await set([], []);
  assert.deepEqual(await grid(), { pat: '403/403', mom: '403/403', kid: '403/403' }, 'neither');
  // The full copy is the person's alone once parts exist, whatever they share.
  await set([id.pat], [id.pat]);
  assert.equal((await call(`${S}/data`, t.pat)).status, 403);
  assert.equal((await call(`${S}/data`, t.sam)).status, 200);
});

test('nobody grants themselves Health: not the creator, not the inviter, not the partner', async () => {
  const { call, t, id, F } = await setup();
  const P = `${F}/members/${id.pat}`;
  assert.equal((await call(P, t.sam, 'PATCH', { share: { diet: [id.sam], fitness: [id.sam] } })).status, 403, 'the creator (who invited Pat) cannot');
  assert.equal((await call(P, t.mom, 'PATCH', { shareWith: [id.mom] })).status, 403, 'an older app cannot either');
  assert.equal((await call(P, t.pat, 'PATCH', { share: { diet: [id.pat, 'nobody1'], fitness: [] } })).member.share.diet.length, 0, 'yourself and strangers are dropped');
  assert.equal(await can(call, F, id.pat, t.sam, 'diet'), 403);
  // Us: only the partner, never the rest of the family, whatever the lists say.
  assert.equal(await can(call, F, id.pat, t.sam, 'us'), 200);
  assert.equal(await can(call, F, id.pat, t.mom, 'us'), 403);
  assert.equal(await can(call, F, id.sam, t.kid, 'us'), 403);
  // Nobody writes someone else's parts.
  for (const w of ['sam', 'mom', 'kid']) assert.equal((await call(`${P}/health/diet`, t[w], 'PUT', { data: {} })).status, 403);
});

test('cross-family and strangers get nothing; old records keep working', async () => {
  const { m, call, t, id, F, fid, otherF } = await setup();
  assert.equal(await can(call, F, id.sam, t.out, 'diet'), 404, 'a stranger: not found');
  assert.equal((await call(`${F}/members/${id.sam}/data`, t.out)).status, 404);
  assert.equal((await call(`${otherF}/members/${id.sam}/health/diet`, t.pat)).status, 404, "another family's address");
  assert.equal((await call(`${F}/home`, t.out)).status, 404);
  // An older family record: no access list (all areas) and a single shareWith (both parts).
  const fam = JSON.parse(m.get(`v2:family:${fid}`));
  const pat = fam.members.find((x) => x.id === id.pat);
  delete pat.access; delete pat.share; pat.shareWith = [id.sam]; delete pat.healthSplit;
  m.set(`v2:family:${fid}`, JSON.stringify(fam));
  assert.deepEqual(shareOf(pat), { diet: [id.sam], fitness: [id.sam] });
  assert.ok(['home', 'calendar', 'threads'].every((a) => hasArea(pat, a)));
  assert.equal((await call(`${F}/members/${id.pat}/data`, t.sam)).status, 200, 'before the split: the full copy, as before 2.0');
  assert.equal(await can(call, F, id.pat, t.sam, 'fitness'), 200);
  assert.equal(await can(call, F, id.pat, t.mom, 'fitness'), 403);
  assert.ok(canSeePart(fam, pat, fam.members.find((x) => x.id === id.sam), 'diet'));
});

test('household areas: the creator chooses; enforced on every route; Health is separate', async () => {
  const { call, t, id, F } = await setup();
  const P = `${F}/members/${id.pat}`;
  // Only the creator chooses, and never for themselves.
  assert.equal((await call(P, t.mom, 'PATCH', { access: ['home'] })).status, 403, 'an ordinary member cannot');
  assert.equal((await call(P, t.pat, 'PATCH', { access: ['home', 'calendar', 'threads'] })).status, 403, 'nor for yourself');
  assert.equal((await call(`${F}/members/${id.sam}`, t.sam, 'PATCH', { access: ['home'] })).status, 403, "the creator's own can't shrink");
  const r = await call(P, t.sam, 'PATCH', { access: ['calendar'] });
  assert.deepEqual(r.member.access, ['calendar']);
  // Pat: Calendar yes; Home and Threads no — on every route, not just the screens.
  await call(`${F}/threads`, t.sam, 'POST', { aud: 'family', title: 'Family thread', body: 'x' });
  for (const [path, method, body] of [[`${F}/home`, 'GET'], [`${F}/requests`, 'POST', { kind: 'ride', box: 'x' }], [`${F}/groceries`, 'POST', { items: ['milk'] }], [`${F}/chores?month=2026-10`, 'GET'], [`${F}/care?to=2026-10-28&days=1`, 'GET'], [`${F}/appts?today=2026-10-28`, 'GET'], [`${F}/dogstats?today=2026-10-28`, 'GET'], [`${F}/threads`, 'POST', { aud: 'family', title: 'x', body: 'x' }], [`${F}/albums`, 'GET']]) {
    assert.equal((await call(path, t.pat, method, body)).status, 403, `${method} ${path}`);
  }
  assert.equal((await call('/threads', t.pat)).threads.length, 0, 'the threads list skips the family');
  assert.equal((await call(`${F}/events`, t.pat)).status, 200, 'Calendar is allowed');
  // Areas never touch Health: Pat still shares (and reads what Sam shares) as before.
  await call(`${F}/members/${id.sam}`, t.sam, 'PATCH', { share: { diet: [id.pat], fitness: [] } });
  assert.equal(await can(call, F, id.sam, t.pat, 'diet'), 200);
  // Pat isn't taggable in threads, and doesn't get Home's request notifications (no Home).
  const tagged = (await call(`${F}/threads`, t.sam, 'POST', { aud: 'family', title: 'Tagging', body: 'x', tags: [id.pat, id.mom] })).thread;
  assert.deepEqual(tagged.tags, [id.mom]);
  // All back: the list disappears (= everything), as for everyone who joined before 2.0.
  assert.deepEqual((await call(P, t.sam, 'PATCH', { access: ['home', 'calendar', 'threads'] })).member.access, ['home', 'calendar', 'threads']);
  assert.equal((await call(`${F}/home`, t.pat)).status, 200);
  assert.ok((await call('/threads', t.pat)).threads.length >= 1);
  // Choosing areas when adding someone: the creator only.
  const add = await call(`${F}/members`, t.sam, 'POST', { kind: 'person', name: 'Gran', relation: 'parent', access: ['calendar', 'threads'] });
  assert.deepEqual(add.member.access, ['calendar', 'threads']);
  const add2 = await call(`${F}/members`, t.mom, 'POST', { kind: 'person', name: 'Aunt', relation: 'other', access: ['threads'] });
  assert.deepEqual(add2.member.access, ['home', 'calendar', 'threads'], 'an ordinary member adds with all');
});

test('someone who leaves loses everything at once; kids keep their limits', async () => {
  const { call, t, id, F } = await setup();
  await call(`${F}/members/${id.sam}`, t.sam, 'PATCH', { share: { diet: [id.mom], fitness: [id.mom] } });
  assert.equal(await can(call, F, id.sam, t.mom, 'diet'), 200);
  assert.equal((await call(`${F}/leave`, t.mom, 'POST')).ok, true);
  assert.equal(await can(call, F, id.sam, t.mom, 'diet'), 404, 'no longer in the family');
  const sam = (await call('/me', t.sam)).families[0].members.find((x) => x.id === id.sam);
  assert.deepEqual(sam.share, { diet: [], fitness: [] }, 'and off the lists');
  assert.equal(await can(call, F, id.mom, t.sam, 'diet'), 404, 'their parts are gone');
  // A kid: no requests (Home's grown-up part), no chats, nothing of others' Health unless shared.
  assert.equal((await call(`${F}/requests`, t.kid, 'POST', { kind: 'ride', box: 'x' })).status, 403);
  assert.equal(await can(call, F, id.pat, t.kid, 'diet'), 403);
});

test('review fixes: Us is the couple only; the old posts need Home; notifications follow areas', async () => {
  const { call, t, id, F, fid } = await setup();
  // A spouse can't read anyone's Us but their partner's — not Mom's, not a kid's.
  assert.equal(await can(call, F, id.mom, t.pat, 'us'), 403);
  assert.equal(await can(call, F, id.kid, t.pat, 'us'), 403);
  assert.equal(await can(call, F, id.sam, t.pat, 'us'), 200);
  // The creator hands over and leaves: no "self" any more, so nobody gets anyone's Us.
  await call(`${F}/owner`, t.sam, 'POST', { memberId: id.pat });
  await call(`${F}/leave`, t.sam, 'POST');
  assert.equal(await can(call, F, id.pat, t.mom, 'us'), 403);
  assert.equal(await can(call, F, id.mom, t.pat, 'us'), 403);
  // The old feed's posts were on Home: without Home, none of them.
  const { adultsOf } = await import('../server/push.js');
  await call(`${F}/members/${id.mom}`, t.pat, 'PATCH', { access: ['calendar'] });
  assert.equal((await call(`${F}/posts`, t.mom)).status, 403);
  assert.equal((await call('/feed', t.mom)).posts.length, 0);
  // Notifications for an area skip people without it.
  const me = await call('/me', t.pat);
  const fam = me.families.find((f) => f.fid === fid);
  const full = { members: fam.members.map((x) => ({ ...x, uid: x.status === 'active' ? x.id : '' })) };
  const momUid = id.mom;
  assert.ok(!adultsOf(full, 'nobody', 'home').includes(momUid));
  assert.ok(adultsOf(full, 'nobody', 'calendar').includes(momUid));
});
