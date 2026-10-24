// 🔐 End-to-end encryption: what the server stores can't be read without the family key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { seal, open, tryOpen, newKey, makeCheck, checkKey, lockBackup, unlockBackup, newPhrase, keyFromHash, deviceLink, isSealed } from '../family/crypto.js';

test('sealing: only the right key opens it; phrases unlock backups', async () => {
  const k = newKey(), other = newKey();
  const s = await seal(k, { text: 'tacos tonight 🌮' });
  assert.ok(isSealed(s) && !s.includes('tacos'));
  assert.deepEqual(await open(k, s), { text: 'tacos tonight 🌮' });
  await assert.rejects(open(other, s));
  assert.equal(await tryOpen(other, s, 'locked'), 'locked');
  assert.equal(await tryOpen(k, 'plain old text'), 'plain old text', 'unencrypted data still reads');
  assert.ok(await checkKey(k, await makeCheck(k)));
  assert.equal(await checkKey(other, await makeCheck(k)), false);
  const phrase = newPhrase();
  const b = await lockBackup(phrase, { fam1: k });
  assert.ok(!JSON.stringify(b).includes(k));
  assert.deepEqual(await unlockBackup(phrase.toUpperCase().replace(/-/g, ' '), b), { fam1: k }, 'case and dashes don\'t matter');
  await assert.rejects(unlockBackup(newPhrase(), b), /doesn't match/);
  const link = deviceLink('https://x.test/family/', 'abc123', k);
  assert.deepEqual(keyFromHash(new URL(link).hash), { fid: 'abc123', key: k });
  // A big photo survives the round trip.
  const photo = `data:image/jpeg;base64,${'A'.repeat(2_000_000)}`;
  assert.equal(await open(k, await seal(k, photo)), photo);
});

test('an encrypted family: the server keeps only locked posts, comments and data', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (key) => m.get(key) ?? null, put: async (key, v) => { m.set(key, v); }, delete: async (key) => { m.delete(key); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), friend = await signIn('friend@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const F = family.fid, me = family.members[0].id;
  // An older, readable post from before encryption.
  const old = (await call(`/families/${F}/posts`, sam, 'POST', { text: 'old readable post' })).post;

  const FK = newKey();
  assert.equal((await call(`/families/${F}`, sam, 'PATCH', { e2ee: true })).status, 400, 'needs a key check');
  const fam = (await call(`/families/${F}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) })).family;
  assert.ok(fam.e2ee && await checkKey(FK, fam.keyCheck));

  // Readable writes are refused from now on; locked ones are kept as they are.
  assert.equal((await call(`/families/${F}/posts`, sam, 'POST', { text: 'secret plans' })).status, 400);
  assert.equal((await call(`/families/${F}/members/${me}/data`, sam, 'PUT', { data: { weights: [160] } })).status, 400);
  const p = (await call(`/families/${F}/posts`, sam, 'POST', { text: await seal(FK, 'Beach day 🌊'), photo: await seal(FK, 'data:image/jpeg;base64,AAAA') })).post;
  assert.equal(await open(FK, p.text), 'Beach day 🌊');
  await call(`/posts/${F}/${p.id}/comments`, sam, 'POST', { text: await seal(FK, 'so cute') });
  assert.equal((await call(`/posts/${F}/${p.id}/comments`, sam, 'POST', { text: 'plain comment' })).status, 400);
  await call(`/families/${F}/members/${me}/data`, sam, 'PUT', { data: { enc: await seal(FK, { weights: [160], mealLog: { x: 1 } }) } });
  const appt = (await call(`/families/${F}/appts`, sam, 'POST', { type: 'vet', pets: [], dropAt: '2026-11-01T09:00' }));
  // Locking the older post.
  assert.equal((await call(`/posts/${F}/${old.id}`, sam, 'PATCH', { text: 'still plain' })).status, 400, 'never back to readable');
  assert.equal((await call(`/posts/${F}/${old.id}`, sam, 'PATCH', { text: await seal(FK, 'old readable post') })).status, 200);

  // Nothing readable is stored anywhere on the server.
  const everything = JSON.stringify([...m.values()]);
  for (const secret of ['Beach day', 'so cute', 'weights', 'mealLog', 'old readable post', FK]) assert.ok(!everything.includes(secret), `the server holds "${secret}"`);
  assert.equal(appt.status, 400, 'an appointment still needs a dog');

  // A friend's family: a key per connection, parked with the invite, then theirs to read posts shared with them.
  const inv = (await call(`/families/${F}/invites`, sam, 'POST', { kind: 'family', email: 'friend@example.com' })).invite;
  const CK = newKey();
  assert.equal((await call(`/families/${F}/connkeys/pending/${inv.code}`, sam, 'PUT', { ck: await seal(FK, CK) })).status, 200);
  const acc = await call(`/invites/${inv.code}/accept`, friend, 'POST', { familyName: 'Friends' });
  assert.equal(acc.connectedFid, F);
  const FK2 = newKey();
  await call(`/families/${acc.family.fid}`, friend, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK2) });
  await call(`/families/${acc.family.fid}/connkeys/${F}`, friend, 'PUT', { ck: await seal(FK2, CK) });
  const mine = (await call(`/families/${F}`, sam)).family;
  assert.equal(await open(FK, mine.connkeys[acc.family.fid]), CK, 'our copy of the connection key');
  // A post for friends: its own key, locked for us and for them.
  const PK = newKey();
  await call(`/families/${F}/posts`, sam, 'POST', { audience: 'connections', text: await seal(PK, 'BBQ Saturday?'), pk: { fam: await seal(FK, PK), conns: { [acc.family.fid]: await seal(CK, PK) } } });
  const theirs = (await call('/feed', friend)).posts.find((x) => x.pk);
  const theirFam = (await call(`/families/${acc.family.fid}`, friend)).family;
  const ck = await open(FK2, theirFam.connkeys[F]);
  assert.equal(await open(await open(ck, theirs.pk.conns[acc.family.fid]), theirs.text), 'BBQ Saturday?');
  assert.ok(!JSON.stringify([...m.values()]).includes('BBQ'));

  // Recovery backup: stored, readable only with the phrase, gone with the account.
  const phrase = newPhrase();
  await call('/account/keybackup', sam, 'PUT', { backup: await lockBackup(phrase, { [F]: FK }) });
  assert.deepEqual(await unlockBackup(phrase, (await call('/account/keybackup', sam)).backup), { [F]: FK });
  assert.equal((await call('/account/keybackup', sam, 'PUT', { backup: { v: 1 } })).status, 400);
});
