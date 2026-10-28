// 🗑 Deleting your account (or leaving a family) takes your threads and replies with it;
// deleting a family takes all its threads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

async function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const send = (path, token, method, body) => familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body }), env, path.split('?')[0]);
  const call = async (path, token, method = 'GET', body) => { const r = await send(path, token, method, body ? JSON.stringify(body) : undefined); return { status: r.status, ...(r.data || {}) }; };
  const put = async (path, token) => (await send(path, token, 'PUT', new Uint8Array([1, 2, 3]))).status;
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  return { m, call, put, sam, pat, patId: add.member.id, F: `/families/${family.fid}` };
}
const keysWith = (m, s) => [...m.keys()].filter((k) => k.includes(s));

test("deleting your account deletes your threads and replies, and only yours", async () => {
  const { m, call, put, sam, pat, patId, F } = await setup();
  await put(`${F}/photos/patshot0001?size=full`, pat);
  const patThread = (await call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'Pat’s', body: 'x', shots: [{ id: 'patshot0001' }] })).thread;
  const patUs = (await call(`${F}/threads`, pat, 'POST', { aud: 'us', title: 'For Sam', body: 'x' })).thread;
  await call(`${F}/threads/${patThread.id}/report`, sam, 'POST', { reason: 'test' });
  const samThread = (await call(`${F}/threads`, sam, 'POST', { aud: 'family', cat: 'poll', title: 'Sam’s', body: 'x', tags: [patId], poll: { opts: ['a', 'b'] } })).thread;
  await call(`${F}/threads/${samThread.id}/replies`, sam, 'POST', { text: 'from Sam' });
  const r = (await call(`${F}/threads/${samThread.id}/replies`, pat, 'POST', { text: 'from Pat' })).thread.replies.find((x) => x.mine);
  await call(`${F}/threads/${samThread.id}/vote`, pat, 'POST', { i: 1 });
  assert.ok(r);
  assert.equal((await call('/account/delete', pat, 'POST', { confirm: 'DELETE' })).deleted, true);
  const list = (await call('/threads', sam)).threads;
  assert.deepEqual(list.map((t) => t.title), ['Sam’s'], "Pat's family thread and just-us thread are gone");
  assert.equal((await call(`${F}/threads/${patUs.id}`, sam)).status, 404);
  const t = (await call(`${F}/threads/${samThread.id}`, sam)).thread;
  assert.deepEqual(t.replies.map((x) => x.text), ['from Sam'], "Pat's reply is gone, Sam's stays");
  assert.deepEqual(t.poll.counts, [0, 0], "Pat's vote is gone");
  assert.deepEqual(t.tags, [], "Pat's tag is gone");
  assert.equal(keysWith(m, 'patshot0001').length, 0, "Pat's screenshot and its uploader record are gone");
  assert.equal(keysWith(m, `:thread:${patThread.id}`).length, 0, 'reports on it are gone');
  assert.ok(!JSON.stringify(m.get(`v2:thread:${F.split('/')[2]}:${samThread.id}`) || '').includes('from Pat'));
});

test('deleting a family (its last grown-up deletes their account) deletes all its threads', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const send = (path, token, method, body) => familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body }), env, path.split('?')[0]);
  const call = async (path, token, method = 'GET', body) => { const r = await send(path, token, method, body ? JSON.stringify(body) : undefined); return { status: r.status, ...(r.data || {}) }; };
  const { token: sam } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', sam, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', sam, 'POST', { name: 'Solo' });
  const F = `/families/${family.fid}`;
  await send(`${F}/photos/samshot0001?size=full`, sam, 'PUT', new Uint8Array([1, 2, 3]));
  const one = (await call(`${F}/threads`, sam, 'POST', { aud: 'family', title: 'One', body: 'x', shots: [{ id: 'samshot0001' }] })).thread;
  await call(`${F}/threads/${one.id}/replies`, sam, 'POST', { text: 'r' });
  await call(`${F}/threads`, sam, 'POST', { aud: 'family', title: 'Two', body: 'x' });
  const del = await call('/account/delete', sam, 'POST', { confirm: 'DELETE' });
  assert.deepEqual(del.familiesDeleted, ['Solo']);
  assert.deepEqual(keysWith(m, `${family.fid}`).filter((k) => /thread|fileby|samshot/.test(k)), [], 'threads, the list, files and uploader records are gone');
});

test("leaving a family keeps what you wrote in your own other family, even when the two are connected", async () => {
  const { call, sam, pat, F } = await setup();
  // Pat also runs a family of their own, connected to Sam's.
  const inv = (await call(`${F}/invites`, sam, 'POST', { kind: 'family', email: 'pat@example.com' })).invite;
  const B = (await call(`/invites/${inv.code}/accept`, pat, 'POST', { familyName: 'Pat’s side' })).family?.fid
    || (await call('/me', pat)).families.find((f) => f.name === 'Pat’s side').fid;
  const mine = (await call(`/families/${B}/threads`, pat, 'POST', { aud: 'family', title: 'Pat’s own', body: 'x' })).thread;
  const shared = (await call(`/families/${B}/threads`, pat, 'POST', { aud: 'connections', title: 'For friends', body: 'x' })).thread;
  await call(`/families/${B}/threads/${shared.id}/replies`, pat, 'POST', { text: 'still mine' });
  assert.equal((await call(`${F}/leave`, pat, 'POST')).ok, true);
  assert.equal((await call(`/families/${B}/threads/${mine.id}`, pat)).thread?.title, 'Pat’s own', 'kept');
  assert.deepEqual((await call(`/families/${B}/threads/${shared.id}`, pat)).thread.replies.map((r) => r.text), ['still mine']);
});

test("deleting your account when your own family goes with it removes your replies in friends' families", async () => {
  const { call, sam, F } = await setup();
  const ally = await (async () => { const { token } = await call('/auth/demo', null, 'POST', { email: 'ally@example.com' }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; })();
  const inv = (await call(`${F}/invites`, sam, 'POST', { kind: 'family', email: 'ally@example.com' })).invite;
  await call(`/invites/${inv.code}/accept`, ally, 'POST', { familyName: 'Ally’s' });
  const t = (await call(`${F}/threads`, sam, 'POST', { aud: 'connections', title: 'For friends', body: 'x' })).thread;
  const r = await call(`${F}/threads/${t.id}/replies`, ally, 'POST', { text: 'from Ally' });
  assert.equal(r.status, 200);
  assert.equal((await call('/account/delete', ally, 'POST', { confirm: 'DELETE' })).deleted, true);
  const after = (await call(`${F}/threads/${t.id}`, sam)).thread;
  assert.deepEqual(after.replies.map((x) => x.text), [], "Ally's reply is gone");
  assert.notEqual(after.lastByName, 'Ally', 'and no longer named as the last reply');
});
