// 🍿 Watch: shows locked, nights once per evening, progress, ratings, and the trackers' list
// brought over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { mergeShows, yearRecap } from '../js/showsCore.js';
import { newKey, makeCheck, seal, open } from '../family/crypto.js';

test('a show, watched together, rated and recapped', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const FK = newKey();
  await call(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const W = `/families/${family.fid}/watch`;

  assert.equal((await call(`${W}/shows`, sam, 'POST', { body: { title: 'The Bear' } })).status, 400, 'readable titles refused');
  const { show } = await call(`${W}/shows`, sam, 'POST', { body: await seal(FK, { title: 'The Bear', service: 'hulu', kind: 'show', date: '2026-10-01' }) });
  assert.ok(!JSON.stringify([...m.values()]).includes('Bear'));
  await call(`${W}/shows/${show.id}/night`, pat, 'POST', { date: '2026-10-02' });
  assert.equal((await call(`${W}/shows/${show.id}/night`, sam, 'POST', { date: '2026-10-02' })).status, 400, 'Pat already logged that night');
  await call(`${W}/shows/${show.id}/night`, sam, 'POST', { date: '2026-10-03' });
  await call(`${W}/shows/${show.id}`, sam, 'PATCH', { rating: 5, progress: { s: 2, e: 4 } });
  await call(`${W}/shows/${show.id}`, pat, 'PATCH', { rating: 4, status: 'finished', date: '2026-10-20' });
  const w = await call(W, pat);
  assert.deepEqual(w.progress[show.id].e, 4);
  assert.equal(w.nights.length, 2);
  // The client merges it with the trackers' own code.
  const body = await open(FK, w.shows[0].body);
  const people = [add.member.id, w.shows[0].by];
  const merged = mergeShows(people.map((p) => ({ person: p, shows: w.shows.filter((x) => x.by === p).map((x) => ({ id: x.id, ...body, at: x.at })), nights: w.nights.filter((n) => n.by === p), status: Object.fromEntries(Object.entries(w.status).filter(([, v]) => v.by === p)), ratings: Object.fromEntries(Object.entries(w.ratings).map(([k, r]) => [k, r[p]]).filter(([, r]) => r)) })));
  assert.equal(merged[0].status, 'finished');
  assert.equal(merged[0].rating, 4.5);
  assert.equal(yearRecap(merged, '2026').nights, 2);
  assert.equal((await call(`${W}/shows/${show.id}`, pat, 'DELETE')).status, 403, 'only who added it');

  // The trackers' list: once, with nights and ratings by whoever brings theirs.
  const imp = { shows: [{ id: 'abc', at: 1, body: await seal(FK, { title: 'Severance', service: 'appletv', kind: 'show', date: '2026-01-05' }) }], nights: [{ show: 'abc', date: '2026-01-05' }], status: { abc: { s: 'watching', at: 5 } }, ratings: { abc: 5 } };
  assert.equal((await call(`${W}/import`, sam, 'POST', imp)).imported, 1);
  assert.equal((await call(`${W}/import`, sam, 'POST', imp)).imported, 0, 'not twice');
  await call(`${W}/import`, pat, 'POST', { nights: [{ show: 'abc', date: '2026-01-12' }], ratings: { abc: 3 } });
  const after = await call(W, sam);
  assert.equal(after.nights.filter((n) => n.show === 'tabc').length, 2);
  assert.deepEqual(Object.values(after.ratings.tabc).sort(), [3, 5]);
  await call(`${W}/shows/${show.id}`, sam, 'DELETE');
  assert.equal((await call(W, sam)).nights.filter((n) => n.show === show.id).length, 0);
});

test('a show is just the couple\'s by default, and can be shared with the family', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), kid = await signIn('kid@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  const W = `/families/${family.fid}/watch`;
  const { show } = await call(`${W}/shows`, sam, 'POST', { body: { title: 'Love Is Blind' } });
  assert.equal(show.aud, 'us');
  assert.equal((await call(W, pat)).shows.length, 1, 'Pat sees it');
  assert.equal((await call(W, kid)).shows.length, 0, 'the kid does not');
  assert.equal((await call(`${W}/shows/${show.id}`, kid, 'PATCH', { rating: 5 })).status, 404);
  await call(`${W}/shows/${show.id}`, pat, 'PATCH', { aud: 'family' });
  assert.equal((await call(W, kid)).shows.length, 1, 'shared with the family');
});
