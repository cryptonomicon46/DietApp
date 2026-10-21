import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { verifyGoogle } from '../server/family.js';

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) }; };
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// A stand-in for Google: our own RSA key signs ID tokens the connector verifies.
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1' };
async function idToken(claims, kid = 'k1') {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid })), p = b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-1', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const env = { APP_ORIGIN: 'https://example.github.io/DietApp/', HOUSEHOLD: kv(), GOOGLE_CLIENT_ID: 'client-1', __googleKeys: [pub] };
const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await worker.fetch(new Request(`https://w.test/v2${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, ...(await res.json()) };
};
const signIn = async (sub, email, name) => (await api('/auth/google', { method: 'POST', body: { credential: await idToken({ sub, email, name }) } })).token;

test('Google ID tokens: signature, audience and expiry are checked', async () => {
  const ok = await verifyGoogle(await idToken({ sub: '1', email: 'A@x.com' }), 'client-1', [pub]);
  assert.equal(ok.email, 'a@x.com');
  await assert.rejects(verifyGoogle(await idToken({ sub: '1', email: 'a@x.com', aud: 'other' }), 'client-1', [pub]), /another app/);
  await assert.rejects(verifyGoogle(await idToken({ sub: '1', email: 'a@x.com', exp: 1 }), 'client-1', [pub]), /expired/);
  const t = await idToken({ sub: '1', email: 'a@x.com' });
  await assert.rejects(verifyGoogle(`${t.split('.').slice(0, 2).join('.')}.${b64url(new Uint8Array(256))}`, 'client-1', [pub]), /signature/);
  assert.equal((await api('/me')).status, 401);
  assert.equal((await api('/auth/demo', { method: 'POST', body: { email: 'x@y.z' } })).status, 404, 'no demo sign-in on the real connector');
});

test('a family: create, invite a partner by email, add pets, share diet only by choice', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const { family } = await api('/families', { token: me, method: 'POST', body: { name: 'OurPawMily' } });
  assert.equal(family.members[0].role, 'owner');
  const add = await api(`/families/${family.fid}/members`, { token: me, method: 'POST', body: { kind: 'person', name: 'Partner', relation: 'spouse', email: 'partner@gmail.com' } });
  assert.equal(add.member.status, 'invited');
  const dog = await api(`/families/${family.fid}/members`, { token: me, method: 'POST', body: { kind: 'pet', name: 'Dog One', species: 'dog', breed: 'Mix' } });
  // Bring the partner's data over before they join; only the one who added them can.
  assert.equal((await api(`/families/${family.fid}/members/${add.member.id}/data`, { token: me, method: 'PUT', body: { data: { weights: [{ date: '2026-10-01', weight: 140 }] } } })).status, 200);

  // Someone else can't use the invite; the partner's Google account can.
  const stranger = await signIn('300', 'stranger@gmail.com', 'S');
  assert.equal((await api(`/invites/${add.invite.code}/accept`, { token: stranger, method: 'POST' })).status, 403);
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  assert.equal((await api(`/invites/${add.invite.code}`, { token: partner })).invite.forYou, true);
  const joined = await api(`/invites/${add.invite.code}/accept`, { token: partner, method: 'POST' });
  assert.equal(joined.family.me, add.member.id);
  assert.equal((await api(`/invites/${add.invite.code}/accept`, { token: partner, method: 'POST' })).status, 404, 'one use');
  assert.equal((await api(`/families/${family.fid}`, { token: stranger })).status, 404, 'outsiders see nothing');

  // Their data is theirs now: hidden from me until they share it.
  const theirs = `/families/${family.fid}/members/${add.member.id}/data`;
  assert.equal((await api(theirs, { token: partner })).data.weights[0].weight, 140);
  assert.equal((await api(theirs, { token: me })).status, 403);
  assert.equal((await api(`/families/${family.fid}/members/${add.member.id}`, { token: me, method: 'PATCH', body: { shareWith: [family.me] } })).status, 403, "can't share on their behalf");
  await api(`/families/${family.fid}/members/${add.member.id}`, { token: partner, method: 'PATCH', body: { shareWith: [family.me] } });
  assert.equal((await api(theirs, { token: me })).status, 200);
  // Pets are everyone's.
  assert.equal((await api(`/families/${family.fid}/members/${dog.member.id}/data`, { token: partner, method: 'PUT', body: { data: { fed: ['2026-10-20'] } } })).status, 200);
});

test('feed: family posts, friends\' families via invite, likes and comments', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const fam = (await api('/me', { token: me })).families[0];
  const p1 = await api(`/families/${fam.fid}/posts`, { token: me, method: 'POST', body: { text: 'Park day!', tags: [fam.members[2].id] } });
  const p2 = await api(`/families/${fam.fid}/posts`, { token: me, method: 'POST', body: { text: 'For friends too', audience: 'connections' } });
  assert.equal(p1.post.tagNames[fam.members[2].id], 'Dog One');
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  const feed = await api('/feed', { token: partner });
  assert.deepEqual(feed.posts.map((p) => p.text), ['For friends too', 'Park day!']);
  await api(`/posts/${fam.fid}/${p1.post.id}/like`, { token: partner, method: 'POST' });
  await api(`/posts/${fam.fid}/${p1.post.id}/comments`, { token: partner, method: 'POST', body: { text: 'So cute' } });
  const again = (await api('/feed', { token: me })).posts.find((p) => p.id === p1.post.id);
  assert.equal(again.likes, 1); assert.equal(again.comments[0].text, 'So cute');

  // The partner invites a friend; the friend's new family connects and sees only "connections" posts.
  const partnerFam = (await api('/me', { token: partner })).families[0];
  const inv = await api(`/families/${partnerFam.fid}/invites`, { token: partner, method: 'POST', body: { kind: 'family', email: 'friend@gmail.com' } });
  const friend = await signIn('400', 'friend@gmail.com', 'Friend');
  const acc = await api(`/invites/${inv.invite.code}/accept`, { token: friend, method: 'POST', body: { familyName: 'The Friends' } });
  assert.equal(acc.family.name, 'The Friends');
  const ff = await api('/feed', { token: friend });
  assert.deepEqual(ff.posts.map((p) => p.text), ['For friends too']);
  assert.equal((await api(`/posts/${fam.fid}/${p1.post.id}/like`, { token: friend, method: 'POST' })).status, 404, 'family-only posts stay in the family');
  const view = await api(`/families/${acc.family.fid}`, { token: friend });
  assert.equal(view.connected[0].name, 'OurPawMily');
  assert.equal(view.connected[0].members[0].email, undefined, "connected families don't see emails");
  assert.equal((await api(`/posts/${fam.fid}/${p2.post.id}`, { token: friend, method: 'DELETE' })).status, 403);
  assert.equal((await api(`/posts/${fam.fid}/${p2.post.id}`, { token: me, method: 'DELETE' })).status, 200);
});

test('bringing the current app over: you, your partner and the dogs, without duplicates', async () => {
  const { planImport } = await import('../family/migrate.js');
  const legacy = { owner: 'sandman', people: [
    { legacyId: 'sandman', name: 'Me', data: { weights: [1] } },
    { legacyId: 'amani', name: 'Partner', data: { mealLog: {} } },
  ], pets: [{ legacyId: 'dog-a', name: 'Dog One', breed: 'Mix', born: '2020-01-01', emoji: '🐶', data: { profile: {} } }] };
  const fresh = { me: 'm1', members: [{ id: 'm1', kind: 'person', name: 'Me', legacyId: '' }] };
  assert.deepEqual(planImport(legacy, fresh).map((o) => `${o.op}:${o.name || o.legacyId}`), ['tag:sandman', 'data:Me', 'add:Partner', 'add:Dog One']);
  const done = { me: 'm1', members: [{ id: 'm1', kind: 'person', name: 'Me', legacyId: 'sandman' }, { id: 'm2', kind: 'person', name: 'Partner', legacyId: 'amani' }, { id: 'm3', kind: 'pet', name: 'Dog One', legacyId: 'dog-a' }] };
  assert.deepEqual(planImport(legacy, done).map((o) => o.op), ['data', 'data', 'data'], 'running it again only refreshes the data');
  // On the partner's phone (after they joined), only their own data and the dogs are copied.
  const theirs = { me: 'm2', members: done.members.map((m) => ({ ...m, status: m.kind === 'person' ? 'active' : 'managed' })) };
  assert.deepEqual(planImport({ ...legacy, owner: 'amani' }, theirs).map((o) => `${o.op}:${o.memberId}`), ['data:m2', 'data:m3']);
});
