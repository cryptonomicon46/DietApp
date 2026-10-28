// 🏠 Home's shared lists: requests for a hand and the household's grocery list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

async function setup() {
  const m = new Map(), told = [];
  const env = { DEMO: true, __push: (sub, msg) => { told.push({ to: sub.device, title: msg.title }); return 201; }, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), kid = await signIn('kid@example.com'), stranger = await signIn('x@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  for (const [t, d] of [[pat, 'pat-phone'], [kid, 'kid-phone'], [sam, 'sam-phone']]) await call('/push/subscribe', t, 'POST', { endpoint: `https://fcm.googleapis.com/fcm/send/${d}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }, device: d });
  return { m, told, call, sam, pat, kid, stranger, F: `/families/${family.fid}`, fid: family.fid };
}

test('requests: ask, someone claims it (one helper at a time), done; only the family sees them', async () => {
  const { told, call, sam, pat, kid, stranger, F } = await setup();
  const r = (await call(`${F}/requests`, sam, 'POST', { kind: 'ride', day: '2026-11-02', time: '9:00', box: 'Drop Rex at the groomer' })).request;
  assert.equal(r.status, 'open');
  assert.ok(told.some((x) => x.to === 'pat-phone' && /could use a hand/.test(x.title)), 'grown-ups are told');
  assert.ok(!told.some((x) => x.to === 'kid-phone'), 'kids are not');
  assert.ok(!told.some((x) => /Drop Rex/.test(x.title)), 'the notification never says what');
  assert.equal((await call(`${F}/requests/${r.id}/claim`, sam, 'POST')).status, 400, 'not your own');
  assert.equal((await call(`${F}/requests/${r.id}/claim`, pat, 'POST')).request.claimedName, 'Pat');
  assert.equal((await call(`${F}/requests/${r.id}/claim`, kid, 'POST')).status, 403, 'kids neither see nor take requests');
  assert.deepEqual((await call(`${F}/home`, kid)).requests, []);
  assert.equal((await call(`${F}/requests`, kid, 'POST', { kind: 'ride', box: 'x' })).status, 403);
  assert.ok(told.some((x) => x.to === 'sam-phone' && /Pat can help/.test(x.title)));
  assert.equal((await call(`${F}/requests/${r.id}/done`, kid, 'POST')).status, 403);
  assert.equal((await call(`${F}/requests/${r.id}/done`, pat, 'POST')).request.status, 'done');
  assert.equal((await call(`${F}/requests`, stranger)).status, 404, 'not for strangers');
  assert.equal((await call(`${F}/requests/${r.id}`, pat, 'DELETE')).status, 403, 'only who asked (or the creator) removes it');
  assert.equal((await call(`${F}/requests/${r.id}`, sam, 'DELETE')).ok, true);
  assert.equal((await call(`${F}/home`, pat)).requests.length, 0);
});

test('groceries: one list for the household; add, tick, clear ticked', async () => {
  const { call, sam, pat, kid, stranger, F } = await setup();
  await call(`${F}/groceries`, sam, 'POST', { items: ['Milk', 'Eggs', '  '] });
  const g = (await call(`${F}/groceries`, kid, 'POST', { box: 'Dog food' })).groceries;
  assert.equal(g.length, 3, 'blank items are skipped');
  const eggs = g.find((x) => x.box === 'Eggs');
  const ticked = (await call(`${F}/groceries/${eggs.id}`, pat, 'PATCH', { done: true })).groceries.find((x) => x.id === eggs.id);
  assert.equal(ticked.done, true);
  assert.equal((await call(`${F}/groceries/clear`, sam, 'POST')).groceries.map((x) => x.box).join(), 'Milk,Dog food');
  assert.equal((await call(`${F}/groceries`, stranger)).status, 404);
  const home = await call(`${F}/home`, kid);
  assert.equal(home.groceries.length, 2, 'Home gets both lists in one request');
});

test('in an encrypted family the lists only take sealed text', async () => {
  const { m, call, sam, F, fid } = await setup();
  const { makeCheck, newKey } = await import('../family/crypto.js');
  await call(F, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(newKey()) });
  assert.equal((await call(`${F}/groceries`, sam, 'POST', { box: 'Milk' })).status, 400);
  assert.equal((await call(`${F}/requests`, sam, 'POST', { kind: 'meal', box: 'Soup please' })).status, 400);
  assert.equal((await call(`${F}/groceries`, sam, 'POST', { box: 'e1:AAAABBBBCCCCDDDDEEEEFFFF' })).status, 200);
  assert.ok(!JSON.stringify(m.get(`v2:groceries:${fid}`)).includes('Milk'));
});

test('requests: when someone leaves, their requests go and what they took is open again', async () => {
  const { call, sam, pat, F, fid } = await setup();
  const mine = (await call(`${F}/requests`, sam, 'POST', { kind: 'meal', box: 'Soup on Tuesday?' })).request;
  await call(`${F}/requests`, pat, 'POST', { kind: 'walk', box: 'Walk Rex at noon' });
  await call(`${F}/requests/${mine.id}/claim`, pat, 'POST');
  const patId = (await call('/me', pat)).families.find((f) => f.fid === fid).me;
  assert.equal((await call(`${F}/members/${patId}`, pat, 'DELETE')).status, 200, 'Pat leaves');
  const left = (await call(`${F}/home`, sam)).requests;
  assert.deepEqual(left.map((x) => [x.id, x.status, x.claimedBy]), [[mine.id, 'open', '']]);
});
