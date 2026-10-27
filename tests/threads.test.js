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

test('threads: screenshots with captions, kept in step on edit, removed with the thread', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const put = (path, token) => familyApi(new Request(`https://x.test${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: new Uint8Array([1, 2, 3]) }), env, path.split('?')[0]);
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const F = `/families/${family.fid}`;
  for (const id of ['shotaaaa1', 'shotbbbb2', 'shotcccc3']) for (const size of ['full', 'thumb']) await put(`${F}/photos/${id}?size=${size}`, sam);
  const blobs = () => [...m.keys()].filter((k) => k.startsWith('blob:')).map((k) => k.split('/')[2]).sort();
  assert.equal(blobs().length, 6);
  const shots = [{ id: 'shotaaaa1', aspect: 0.46, cap: '  Premiums ' }, { id: 'shotbbbb2', cap: 'Deductibles' }, { id: 'shotcccc3' }, { id: 'bad id!' }];
  const t = (await call(`${F}/threads`, sam, 'POST', { aud: 'family', board: 'house', cat: 'talk', title: 'Health plans', body: 'Which one?', shots })).thread;
  assert.deepEqual(t.shots.map((x) => [x.id, x.cap]), [['shotaaaa1', 'Premiums'], ['shotbbbb2', 'Deductibles'], ['shotcccc3', '']], 'bad ids dropped, captions cleaned');
  assert.equal(t.shots[0].aspect, 0.46);
  assert.equal((await call('/threads', sam)).threads[0].shotCount, 3);
  // Edit: one removed (its files go), the rest kept.
  const e = (await call(`${F}/threads/${t.id}`, sam, 'PATCH', { shots: t.shots.filter((x) => x.id !== 'shotbbbb2') })).thread;
  assert.deepEqual(e.shots.map((x) => x.id), ['shotaaaa1', 'shotcccc3']);
  assert.deepEqual(blobs(), ['shotaaaa1-full', 'shotaaaa1-thumb', 'shotcccc3-full', 'shotcccc3-thumb']);
  assert.equal((await call(`${F}/threads`, sam, 'POST', { aud: 'family', title: 'Lots', body: 'x', shots: Array.from({ length: 20 }, (_, i) => ({ id: `many${String(i).padStart(5, '0')}` })) })).thread.shots.length, 12, 'at most 12');
  await call(`${F}/threads/${t.id}`, sam, 'DELETE');
  assert.deepEqual(blobs(), [], 'deleting the thread deletes its screenshots');
});

test('threads: tagging people who can see it, with a nudge for the newly tagged only', async () => {
  const m = new Map(), told = [];
  const env = { DEMO: true, __push: (sub, msg) => { told.push(msg.title); return 201; }, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const ids = {};
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [mom, 'mom@example.com', 'Mom', 'parent']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
    ids[name] = add.member.id;
  }
  const kidOnly = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Baby', relation: 'child' });
  // Notifications are only sent to phones that subscribed: give Pat's and Mom's accounts one each.
  for (const t of [pat, mom]) await call('/push/subscribe', t, 'POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' + Math.random().toString(36).slice(2), keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });
  const T = `/families/${family.fid}/threads`;
  const meId = family.me;
  const t = (await call(T, sam, 'POST', { aud: 'family', board: 'house', title: 'Health plans', body: '@Pat can you check?', tags: [ids.Pat, meId, kidOnly.member.id, 'nobody'] })).thread;
  assert.deepEqual(t.tags, [ids.Pat], 'not yourself, not someone without an account, not a stranger');
  assert.equal(told.filter((x) => /tagged you/.test(x)).length, 1);
  const forPat = (await call('/threads', pat)).threads.find((x) => x.id === t.id);
  assert.equal(forPat.tagged, true);
  assert.equal(forPat.tagUids, undefined, 'account ids stay on the server');
  assert.equal((await call('/threads', mom)).threads.find((x) => x.id === t.id).tagged, false);
  told.length = 0;
  await call(`${T}/${t.id}`, sam, 'PATCH', { tags: [ids.Pat, ids.Mom] });
  assert.equal(told.filter((x) => /tagged you/.test(x)).length, 1, 'only Mom, newly tagged, is told');
  assert.equal((await call(`${T}/${t.id}`, pat, 'PATCH', { tags: [] })).status, 403, 'only who wrote it changes tags');
  const us = (await call(T, sam, 'POST', { aud: 'us', title: 'Just us', body: 'x', tags: [ids.Pat, ids.Mom] })).thread;
  assert.deepEqual(us.tags, [ids.Pat], 'a just-us thread can only tag your partner');
});
