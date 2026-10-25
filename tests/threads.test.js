// 📖 Threads: just us, the family, or friends' families; replies, reads, polls, best answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

test('threads: who sees what, replies and read receipts, polls, best answers, pins', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), kid = await signIn('kid@example.com'), friend = await signIn('friend@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  const finv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'family', email: 'friend@example.com' });
  await call(`/invites/${finv.invite.code}/accept`, friend, 'POST', { familyName: 'Friends' });
  const T = `/families/${family.fid}/threads`;

  const us = (await call(T, sam, 'POST', { aud: 'us', cat: 'learned', title: 'Joint supplements', body: 'Green-lipped mussel looked best.\n\nAsk the vet.', mins: 2 })).thread;
  const fam = (await call(T, pat, 'POST', { aud: 'family', board: 'dogs', cat: 'poll', title: 'Thanksgiving: where?', body: '', poll: { opts: ['We host', "Mom's", ''] } })).thread;
  const ask = (await call(T, sam, 'POST', { aud: 'connections', cat: 'ask', title: 'Good dog sitter?', body: 'In Milpitas' })).thread;
  assert.equal((await call(T, sam, 'POST', { aud: 'family', cat: 'poll', title: 'x', body: '', poll: { opts: ['one'] } })).status, 400, 'a poll needs two choices');
  assert.equal((await call(T, kid, 'POST', { aud: 'us', title: 'x', body: 'y' })).status, 400, 'just-us is for the couple');

  const titles = async (t) => (await call('/threads', t)).threads.map((x) => x.title).sort();
  assert.deepEqual(await titles(pat), ['Good dog sitter?', 'Joint supplements', 'Thanksgiving: where?']);
  assert.deepEqual(await titles(kid), ['Good dog sitter?', 'Thanksgiving: where?'], 'the kid never sees just-us');
  assert.deepEqual(await titles(friend), ['Good dog sitter?'], 'friends see only what was shared with friends');
  assert.equal((await call(`${T}/${us.id}`, kid)).status, 404);
  assert.equal((await call(`${T}/${fam.id}`, friend)).status, 404);

  // Unread until opened; opening it is the read receipt.
  assert.equal((await call('/threads', pat)).threads.find((x) => x.id === us.id).unread, true);
  await call(`${T}/${us.id}`, pat);
  assert.equal((await call('/threads', pat)).threads.find((x) => x.id === us.id).unread, false);
  assert.equal((await call(`${T}/${us.id}`, sam)).thread.readers.length, 1, 'Sam sees Pat read it');
  // A reply (quoting the second paragraph) makes it new again for Sam.
  await call(`${T}/${us.id}/replies`, pat, 'POST', { text: "Let's ask Dr K", quote: 1 });
  const su = (await call('/threads', sam)).threads.find((x) => x.id === us.id);
  assert.deepEqual([su.unread, su.replies, su.lastByName], [true, 1, 'Pat']);
  assert.equal((await call(`${T}/${us.id}`, sam)).thread.replies[0].quote, 1);

  // Polls: one vote each, changeable; counts for everyone.
  await call(`${T}/${fam.id}/vote`, sam, 'POST', { i: 0 });
  await call(`${T}/${fam.id}/vote`, kid, 'POST', { i: 1 });
  await call(`${T}/${fam.id}/vote`, kid, 'POST', { i: 0 });
  assert.deepEqual((await call(`${T}/${fam.id}`, pat)).thread.poll.counts, [2, 0]);

  // Ask: a friend answers, it's upvoted, and the asker marks it best.
  const fr = (await call(`${T}/${ask.id}/replies`, friend, 'POST', { text: 'Jamie at Bark Buddies' })).thread.replies[0];
  await call(`${T}/${ask.id}/up/${fr.id}`, pat, 'POST');
  assert.equal((await call(`${T}/${ask.id}/best`, pat, 'POST', { reply: fr.id })).status, 403, 'only who asked');
  const best = (await call(`${T}/${ask.id}/best`, sam, 'POST', { reply: fr.id })).thread;
  assert.deepEqual([best.bestId, best.replies[0].ups], [fr.id, 1]);

  // Pins (the family's creator), edits and deletes (who wrote it).
  assert.equal((await call(`${T}/${fam.id}`, sam, 'PATCH', { pinned: true })).thread.pinned, true);
  assert.equal((await call(`${T}/${fam.id}`, kid, 'PATCH', { title: 'mine now' })).status, 403);
  assert.equal((await call('/threads', pat)).threads[0].id, fam.id, 'pinned first');
  assert.equal((await call(`${T}/${ask.id}`, friend, 'DELETE')).status, 403);
  assert.equal((await call(`${T}/${ask.id}`, sam, 'DELETE')).status, 200);
  assert.deepEqual(await titles(friend), []);
});

test('✨ Tidy it up turns notes into headings and bullets (the demo does a simple version)', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  assert.equal((await call(`/families/${family.fid}/tidy`, token, 'POST', { text: 'short' })).status, 400);
  const r = await call(`/families/${family.fid}/tidy`, token, 'POST', { text: 'vet said dose by weight. brand A has 2x the dose. ask Dr K' });
  assert.match(r.text, /^## Notes\n- vet said dose by weight\./);
});
