// ⚑ Report and 🚫 block beyond the feed: a thread, one reply, a chat message, a family member.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { dmId } from '../server/chat.js';

async function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const ids = {};
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [mom, 'mom@example.com', 'Mom', 'parent']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    ids[name] = add.member.id;
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  ids.Sam = (await call('/me', sam)).families[0].me;
  return { m, call, sam, pat, mom, ids, F: `/families/${family.fid}` };
}

test('threads: report a thread or a reply (hidden for you, counted for the creator), block who wrote it', async () => {
  const { m, call, sam, pat, mom, F } = await setup();
  const t = (await call(`${F}/threads`, pat, 'POST', { aud: 'family', title: 'Pat’s', body: 'x' })).thread;
  const r1 = (await call(`${F}/threads/${t.id}/replies`, mom, 'POST', { text: 'from Mom' })).thread.replies[0];
  await call(`${F}/threads/${t.id}/replies`, sam, 'POST', { text: 'from Sam' });
  assert.equal((await call(`${F}/threads/${t.id}/report`, pat, 'POST', { reason: 'x' })).status, 400, "you can't report your own");
  // Sam reports Mom's reply: gone for Sam, still there for Pat.
  assert.equal((await call(`${F}/threads/${t.id}/report/${r1.id}`, sam, 'POST', { reason: 'rude' })).ok, true);
  const forSam = (await call(`${F}/threads/${t.id}`, sam)).thread;
  assert.deepEqual(forSam.replies.map((r) => r.text), ['from Sam']);
  assert.equal(forSam.reports, 1, 'the creator sees the count');
  assert.equal((await call(`${F}/threads/${t.id}`, pat)).thread.replies.length, 2);
  assert.equal((await call(`${F}/threads/${t.id}`, pat)).thread.reports, 0, 'only the creator');
  // Mom reports the whole thread: it leaves her list.
  await call(`${F}/threads/${t.id}/report`, mom, 'POST', { reason: 'spam' });
  await call(`${F}/threads/${t.id}/report`, mom, 'POST', { reason: 'again' });
  assert.equal((await call('/threads', mom)).threads.length, 0);
  assert.equal((await call(`${F}/threads/${t.id}`, sam)).thread.reports, 2, 'once per person and reply');
  const stored = m.get([...m.keys()].find((k) => k.includes(`report:`) && k.includes(':thread:')));
  assert.ok(!JSON.stringify(stored).includes('from Mom'), 'a report never carries what was said');
  // Sam blocks Pat from the thread: Pat's threads and replies disappear for Sam.
  assert.equal((await call(`${F}/threads/${t.id}/block`, sam, 'POST')).ok, true);
  assert.equal((await call('/threads', sam)).threads.length, 0);
  assert.equal((await call(`${F}/threads/${t.id}/block`, pat, 'POST')).status, 400, "you can't block yourself");
  // Deleting the thread deletes its reports.
  await call(`${F}/threads/${t.id}`, pat, 'DELETE');
  assert.ok(![...m.keys()].some((k) => k.includes(`:thread:${t.id}`)));
});

test('chats: report a message, block the person (the chat goes)', async () => {
  const { call, sam, pat, ids, F } = await setup();
  const C = `${F}/chats`, dm = dmId(ids.Sam, ids.Pat);
  const sent = await call(`${C}/${dm}`, pat, 'POST', { t: 'hello' });
  assert.equal((await call(`${C}/${dm}/report`, sam, 'POST', { s: sent.message.s, reason: 'rude' })).ok, true);
  assert.equal((await call(`${C}/${dm}/report`, sam, 'POST', {})).status, 400);
  assert.equal((await call(`${F}/members/${ids.Sam}/block`, sam, 'POST')).status, 400, 'not yourself');
  const b = await call(`${F}/members/${ids.Pat}/block`, sam, 'POST');
  assert.deepEqual(b.blocked.map((x) => x.name), ['Pat']);
  assert.ok(!(await call(C, sam)).chats.some((c) => c.id === dm), "Pat's chat is gone for Sam");
  assert.equal((await call(`${C}/${dm}`, sam)).status, 404);
  // Unblocking brings it back.
  await call(`/account/blocks/${b.blocked[0].id}`, sam, 'DELETE');
  assert.ok((await call(C, sam)).chats.some((c) => c.id === dm));
});
