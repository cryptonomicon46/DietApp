// 🔐 Who may touch a file: only whoever uploaded it (or the family's creator) replaces or deletes
// it; only the uploader attaches it to a post, thread, album, chat or listing; and a friends'
// family only fetches one on something shared with them, naming it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { dmId } from '../server/chat.js';

function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const send = (path, token, method, body) => familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body }), env, path.split('?')[0]);
  const call = async (path, token, method = 'GET', body) => { const r = await send(path, token, method, body ? JSON.stringify(body) : undefined); return { status: r.status, ...(r.data || {}) }; };
  const put = async (path, token) => (await send(path, token, 'PUT', new Uint8Array([1, 2, 3]))).status;
  const get = async (path, token) => (await send(path, token, 'GET')).status;
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  return { m, call, put, get, signIn };
}

async function family(t) {
  const sam = await t.signIn('sam@example.com'), pat = await t.signIn('pat@example.com'), kid = await t.signIn('kid@example.com');
  const { family } = await t.call('/families', sam, 'POST', { name: 'Fam' });
  const ids = {};
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child']]) {
    const add = await t.call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    ids[name] = add.member.id;
    const inv = await t.call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await t.call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  ids.Sam = (await t.call('/me', sam)).families[0].me;
  return { sam, pat, kid, fid: family.fid, F: `/families/${family.fid}`, ids };
}

test('files: only the uploader (or the family creator) replaces or deletes one', async () => {
  const t = setup(), { sam, pat, kid, F } = await family(t);
  assert.equal(await t.put(`${F}/photos/patfile0001?size=full`, pat), 200);
  assert.equal(await t.put(`${F}/photos/patfile0001?size=thumb`, pat), 200, 'the uploader adds the second size');
  assert.equal(await t.put(`${F}/photos/samfile0001?size=full`, sam), 200);
  assert.equal(await t.put(`${F}/photos/samfile0001?size=full`, pat), 403, "Pat can't replace Sam's file");
  assert.equal(await t.put(`${F}/photos/samfile0001?size=doc`, pat), 403, '…or add another size to it');
  assert.equal((await t.call(`${F}/photos/samfile0001`, pat, 'DELETE')).status, 403, "…or delete it");
  assert.equal((await t.call(`${F}/photos/samfile0001`, kid, 'DELETE')).status, 403);
  assert.equal(await t.get(`${F}/photos/samfile0001?size=full`, pat), 200, 'family members can still look');
  assert.equal((await t.call(`${F}/photos/patfile0001`, sam, 'DELETE')).ok, true, "the family's creator can remove anyone's");
  assert.equal(await t.get(`${F}/photos/patfile0001?size=full`, pat), 404);
  assert.equal((await t.call(`${F}/photos/samfile0001`, sam, 'DELETE')).ok, true);
  assert.ok(![...t.m.keys()].some((k) => k.includes('samfile0001') || k.includes('patfile0001')), 'files and their records are gone');
});

test('files: one from before uploads were recorded can be replaced only by the creator', async () => {
  const t = setup(), { sam, pat, fid, F } = await family(t);
  // A file saved by an older connector: bytes, but no record of who uploaded it.
  const idx = JSON.parse((await t.m.get('blobidx')) || '{}');
  t.m.set(`blob:f/${fid}/oldfile0001-full`, 'AQID'); idx[`f/${fid}/oldfile0001-full`] = 3; t.m.set('blobidx', JSON.stringify(idx));
  assert.equal(await t.put(`${F}/photos/oldfile0001?size=full`, pat), 403);
  assert.equal(await t.put(`${F}/photos/oldfile0001?size=thumb`, pat), 403, 'not even a new size');
  assert.equal((await t.call(`${F}/photos/oldfile0001`, pat, 'DELETE')).status, 403);
  assert.equal(await t.put(`${F}/photos/oldfile0001?size=full`, sam), 200, 'the creator re-locks it when turning on encryption');
});

test("files: you can only attach files you uploaded, wherever they go", async () => {
  const t = setup(), { sam, pat, F, ids } = await family(t);
  for (const s of ['full', 'thumb']) await t.put(`${F}/photos/samfile0001?size=${s}`, sam);
  await t.put(`${F}/photos/samdoc00001?size=doc`, sam);
  await t.put(`${F}/photos/patfile0001?size=full`, pat);
  const no = (r, what) => assert.equal(r.status, 403, what);
  no(await t.call(`${F}/posts`, pat, 'POST', { text: 'hi', photoId: 'samfile0001' }), 'a post');
  no(await t.call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'T', body: 'x', shots: [{ id: 'samfile0001' }] }), 'a thread screenshot');
  no(await t.call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'T', body: 'x', docs: [{ id: 'samdoc00001', size: 3 }] }), 'a thread PDF');
  no(await t.call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'T', body: 'x', shots: [{ id: 'never000001' }] }), 'a file that was never uploaded');
  const th = (await t.call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'Mine', body: 'x', shots: [{ id: 'patfile0001' }] })).thread;
  assert.equal(th.shots.length, 1, 'your own file is fine');
  no(await t.call(`${F}/threads/${th.id}`, pat, 'PATCH', { shots: [{ id: 'patfile0001' }, { id: 'samfile0001' }] }), 'added on edit');
  assert.equal((await t.call(`${F}/threads/${th.id}`, pat, 'PATCH', { shots: [{ id: 'patfile0001' }] })).thread.shots.length, 1, 'keeping what was there');
  const album = (await t.call(`${F}/albums`, pat, 'POST', { title: 'Trip' })).album;
  no(await t.call(`${F}/albums/${album.id}`, pat, 'PATCH', { add: [{ id: 'samfile0001' }] }), 'an album');
  no(await t.call(`${F}/chats/${dmId(ids.Sam, ids.Pat)}`, pat, 'POST', { t: 'look', p: [{ id: 'samfile0001' }] }), 'a chat message');
  assert.equal((await t.call(`${F}/chats/${dmId(ids.Sam, ids.Pat)}`, sam, 'POST', { t: 'look', p: [{ id: 'samfile0001' }] })).status, 200, 'Sam can send their own');
  // Removing a thread's screenshot can't reach someone else's file: it was never attached.
  assert.equal(await t.get(`${F}/photos/samfile0001?size=full`, sam), 200);
});

test("files: a friends' family fetches only what was shared with them, naming it", async () => {
  const t = setup(), { sam, F, fid, ids } = await family(t);
  const friend = await t.signIn('friend@example.com');
  const inv = await t.call(`${F}/invites`, sam, 'POST', { kind: 'family', email: 'friend@example.com' });
  await t.call(`/invites/${inv.invite.code}/accept`, friend, 'POST', { familyName: 'Friends' });
  for (const id of ['shared00001', 'family00001', 'kidpost0001', 'thshot00001', 'thfam000001']) await t.put(`${F}/photos/${id}?size=thumb`, sam);
  const post = (photoId, extra = {}) => t.call(`${F}/posts`, sam, 'POST', { text: 'x', photoId, ...extra }).then((r) => r.post);
  const shared = await post('shared00001', { audience: 'connections' });
  const famPost = await post('family00001', { audience: 'family' });
  const kidPost = await post('kidpost0001', { audience: 'connections', tags: [ids.Kid] }); // kept in the family: tags a kid
  const shot = (id, aud) => t.call(`${F}/threads`, sam, 'POST', { aud, title: 'T', body: 'x', shots: [{ id }] }).then((r) => r.thread);
  const thShared = await shot('thshot00001', 'connections'), thFamily = await shot('thfam000001', 'family');
  const g = (id, ref) => t.get(`${F}/photos/${id}?size=thumb${ref ? `&in=${ref}` : ''}`, friend);
  assert.equal(await g('shared00001', `post:${shared.id}`), 200);
  assert.equal(await g('shared00001'), 404, 'without naming the post');
  assert.equal(await g('shared00001', `post:${famPost.id}`), 404, "another post's id doesn't help");
  assert.equal(await g('family00001', `post:${famPost.id}`), 404, 'a family-only post');
  assert.equal(await g('kidpost0001', `post:${kidPost.id}`), 404, 'a post about a kid the family keeps private');
  assert.equal(await g('thshot00001', `thread:${thShared.id}`), 200, 'a thread shared with friends');
  assert.equal(await g('thfam000001', `thread:${thFamily.id}`), 404, 'a family-only thread');
  assert.equal(await g('thfam000001', `thread:${thShared.id}`), 404, "a file that isn't on that thread");
  assert.equal(await t.put(`${F}/photos/shared00001?size=thumb`, friend), 404, 'friends can look, not change');
  await t.call(F + '/disconnect', sam, 'POST', { fid: (await t.call('/me', friend)).families[0].fid });
  assert.equal(await g('shared00001', `post:${shared.id}`), 404, 'nothing once disconnected');
  const stranger = await t.signIn('x@example.com');
  assert.equal(await t.get(`${F}/photos/shared00001?size=thumb&in=post:${shared.id}`, stranger), 404, 'nothing for strangers');
  assert.ok(fid);
});
