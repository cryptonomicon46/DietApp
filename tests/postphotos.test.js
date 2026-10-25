// 📸 Post photos as locked files in R2: uploaded, read back, counted against the family's space,
// moved out of older posts once, and deleted with their post or family.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { newKey, makeCheck, sealBytes, openBytes } from '../family/crypto.js';

// A stand-in for an R2 bucket.
function fakeR2() {
  const o = new Map();
  return {
    o,
    put: async (k, v) => { o.set(k, new Uint8Array(v)); },
    get: async (k) => (o.has(k) ? { arrayBuffer: async () => o.get(k).buffer.slice(0) } : null),
    delete: async (keys) => { for (const k of [].concat(keys)) o.delete(k); },
    list: async ({ prefix }) => ({ objects: [...o].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.length })), truncated: false }),
  };
}

test('photo files: locked, counted, shared with friends, moved once, deleted with the post', async () => {
  const m = new Map();
  const PHOTOS = fakeR2();
  const env = { DEMO: true, PHOTOS, PHOTO_QUOTA_MB: 50, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body, raw) => {
    const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: raw || (body ? JSON.stringify(body) : undefined) }), env, path.split('?')[0]);
    return r.raw ? { status: r.status, raw: r.raw } : { status: r.status, ...r.data };
  };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), friend = await signIn('friend@example.com'), stranger = await signIn('x@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const FK = newKey();
  await call(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  const F = `/families/${family.fid}`;

  // Up as locked bytes, back the same; the bucket never holds the picture itself.
  const jpeg = new Uint8Array(5000).map((_, i) => i % 251);
  const locked = await sealBytes(FK, jpeg);
  assert.equal((await call(`${F}/photos/abcdefgh1234?size=full`, sam, 'PUT', null, locked)).ok, true);
  await call(`${F}/photos/abcdefgh1234?size=thumb`, sam, 'PUT', null, await sealBytes(FK, jpeg.slice(0, 800)));
  assert.ok(![...PHOTOS.o.values()].some((v) => v.length === jpeg.length && v.every((b, i) => b === jpeg[i])), 'only locked bytes stored');
  const back = await call(`${F}/photos/abcdefgh1234?size=full`, sam);
  assert.deepEqual(await openBytes(FK, back.raw), jpeg);
  assert.equal((await call(`${F}/photos/abcdefgh1234?size=full`, stranger)).status, 404, 'not for strangers');
  assert.ok((await call(`${F}/photos`, sam)).used > 5000);

  // A post that names its photo; a friend's family can read the (locked) file of a shared post.
  const { post } = await call(`${F}/posts`, sam, 'POST', { text: '', photoId: 'abcdefgh1234', aspect: 1.5, audience: 'connections' });
  assert.equal(post.photoId, 'abcdefgh1234');
  assert.equal(post.photoLocked, true);
  const inv = await call(`${F}/invites`, sam, 'POST', { kind: 'family', email: 'friend@example.com' });
  await call(`/invites/${inv.invite.code}/accept`, friend, 'POST', { familyName: 'Friends' });
  assert.equal((await call(`${F}/photos/abcdefgh1234?size=thumb`, friend)).status, 200);
  assert.equal((await call(`${F}/photos/abcdefgh1234?size=thumb`, friend, 'PUT', null, locked)).status, 404, 'friends can look, not change');

  // The family's space is full: no more uploads.
  const big = new Uint8Array(3_900_000);
  for (let i = 0; i < 13; i++) await call(`${F}/photos/fill${String(i).padStart(8, '0')}?size=full`, sam, 'PUT', null, big);
  assert.equal((await call(`${F}/photos/onemore12345?size=full`, sam, 'PUT', null, big)).status, 413);
  for (let i = 0; i < 13; i++) await call(`${F}/photos/fill${String(i).padStart(8, '0')}`, sam, 'DELETE');

  // Moving an older inline photo out: once, the second phone gets "already moved".
  const { post: old } = await call(`${F}/posts`, sam, 'POST', { text: 'e1:AAAA', photo: 'e1:BBBB' });
  assert.equal((await call(`/posts/${family.fid}/${old.id}`, sam, 'PATCH', { photoId: 'moved0000001', aspect: 1 })).ok, true);
  assert.equal((await call(`/posts/${family.fid}/${old.id}`, sam, 'PATCH', { photoId: 'moved0000002', aspect: 1 })).status, 409);
  const page = await call(`${F}/posts`, sam);
  const moved = page.posts.find((p) => p.id === old.id);
  assert.equal(moved.photo, '');
  assert.equal(moved.photoId, 'moved0000001');

  // Deleting the post deletes its files.
  await call(`/posts/${family.fid}/${post.id}`, sam, 'DELETE');
  assert.equal(PHOTOS.o.has(`f/${family.fid}/abcdefgh1234-full`), false);
  assert.equal(PHOTOS.o.has(`f/${family.fid}/abcdefgh1234-thumb`), false);
});

test('without photo storage the connector says so, and posts keep photos inside', async () => {
  const m = new Map();
  const env = { HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }, DEMO: true };
  const r = await familyApi(new Request('https://x.test/config'), { ...env, DEMO: false }, '/config');
  assert.equal(r.data.photos, false);
  const d = await familyApi(new Request('https://x.test/config'), env, '/config');
  assert.equal(d.data.photos, true, 'the demo keeps photos on the phone');
});
