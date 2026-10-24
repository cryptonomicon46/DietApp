// 🐾 Dog appointments, vaccines on the dog's record, spending, and dog stats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { nextDue, shiftWeeks, spending } from '../server/appts.js';

test('vaccine due dates, repeats and spending', () => {
  assert.equal(nextDue('Rabies', '2026-10-31'), '2029-10-31');
  assert.equal(nextDue('Bordetella', '2026-10-31'), '2027-10-31');
  assert.equal(nextDue('Something new', '2026-10-31'), '2027-10-31');
  assert.equal(shiftWeeks('2026-10-27T09:00', 6), '2026-12-08T09:00');
  assert.deepEqual(spending([{ status: 'done', type: 'vet', cost: 120, doneAt: '2026-03-01' }, { status: 'done', type: 'groom', cost: 80.5, doneAt: '2026-05-01' }, { status: 'done', type: 'vet', cost: 99, doneAt: '2025-12-01' }, { status: 'upcoming', type: 'vet', cost: 50, dropAt: '2026-11-01T09:00' }], '2026'),
    { total: 200.5, byType: { vet: 120, groom: 80.5 } });
});

test('an appointment: on the feed, drivers claim legs, a vaccination updates the dog, grooming repeats', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split("?")[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), out = await signIn('out@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const pip = (await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'pet', name: 'Pip', species: 'dog' })).member;
  await call(`/families/${family.fid}/members/${pip.id}/data`, sam, 'PUT', { data: { profile: { name: 'Pip', vaccines: [{ name: 'Bordetella', given: '2025-11-01', due: '2026-11-02' }], food: { brand: 'Kibble' } } } });
  const A = `/families/${family.fid}/appts`;
  const me = family.members[0].id;

  assert.equal((await call(A, sam, 'POST', { type: 'groom', pets: [], dropAt: '2026-10-27T09:00' })).status, 400);
  const g = (await call(A, sam, 'POST', { type: 'groom', pets: [pip.id], place: "Wag N' Wash", dropAt: '2026-10-27T09:00', dropBy: me, pickAt: '2026-10-27T13:00', repeatWeeks: 6 })).appt;
  assert.equal(g.dropBy, me);
  assert.equal(g.pickBy, '');
  const feed = await call('/feed', pat);
  assert.equal(feed.posts[0].appt, g.id, 'the appointment is on the feed');
  // Pat takes the pick-up from the feed.
  const claimed = (await call(`${A}/${g.id}`, pat, 'PATCH', { claim: 'pick' })).appt;
  assert.equal(claimed.pickBy, add.member.id);
  // Done: the next one six weeks later, with nobody driving yet.
  const done = await call(`${A}/${g.id}`, sam, 'PATCH', { done: true, cost: 140 });
  assert.equal(done.next.dropAt, '2026-12-08T09:00');
  assert.equal(done.next.pickBy, '');
  // A vaccination updates the dog's record (and the trackers see it as the newest edit).
  const v = (await call(A, pat, 'POST', { type: 'vaccine', vaccine: 'Bordetella', pets: [pip.id], dropAt: '2026-10-31T10:30' })).appt;
  await call(`${A}/${v.id}`, pat, 'PATCH', { done: true, date: '2026-10-31', cost: 45.5 });
  const prof = (await call(`/families/${family.fid}/members/${pip.id}/data`, sam)).data.profile;
  assert.deepEqual(prof.vaccines, [{ name: 'Bordetella', given: '2026-10-31', due: '2027-10-31' }]);
  assert.equal(prof.food.brand, 'Kibble', 'the rest of the record stays');
  assert.ok(prof.times.vaccines > 0);
  const list = await call(`${A}?today=2026-11-01`, sam);
  assert.equal(list.spending.total, 185.5);
  assert.equal(list.appts.filter((a) => a.status === 'upcoming').length, 1);
  assert.equal((await call(A, out)).status, 404, 'nobody outside the family');
});

test('dog stats: golden days this month, the streak, and twelve months', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split("?")[0]); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const log = (date, kind) => call(`/families/${family.fid}/care`, token, 'POST', { date, kind });
  for (const d of ['2026-10-22', '2026-10-23', '2026-10-24']) { await log(d, 'walk'); await log(d, 'park'); }
  await log('2026-10-20', 'walk');
  await log('2026-09-10', 'walk'); await log('2026-09-10', 'treat');
  const s = await call(`/families/${family.fid}/dogstats?today=2026-10-24`, token);
  assert.equal(s.streak, 3);
  assert.equal(s.month.golden, 3);
  assert.equal(s.month.walks, 7);
  assert.equal(s.months.length, 12);
  assert.equal(s.months.find((x) => x.ym === '2026-09').golden, 1);
});
