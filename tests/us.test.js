// 💞 Feeling-like plans and notes: just the two of you, locked, answered, imported once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { planDay, partnerOf, streak, agreed } from '../server/us.js';
import { newKey, makeCheck, seal, open } from '../family/crypto.js';

test('plan days, partners and streaks', () => {
  assert.equal(planDay('tonight', '2026-10-24'), '2026-10-24');
  assert.equal(planDay('tomorrow', '2026-10-24'), '2026-10-25');
  assert.equal(planDay('weekend', '2026-10-21'), '2026-10-24');
  assert.equal(planDay('date', '2026-10-24', '2026-11-02'), '2026-11-02');
  const fam = { members: [{ id: 'a', kind: 'person', relation: 'self' }, { id: 'b', kind: 'person', relation: 'spouse' }, { id: 'k', kind: 'person', relation: 'child' }] };
  assert.equal(partnerOf(fam, fam.members[0]).id, 'b');
  assert.equal(partnerOf(fam, fam.members[1]).id, 'a');
  assert.equal(streak(['2026-10-22', '2026-10-23'], '2026-10-24'), 2);
  assert.equal(agreed({ to: ['b'], replies: { b: { r: 'in' } } }), true);
});

test('a plan and a note between the two of you, locked, and nobody else sees them', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), kid = await signIn('kid@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const FK = newKey();
  await call(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  const U = `/families/${family.fid}/us`;
  assert.equal((await call(`${U}/plans`, sam, 'POST', { day: '2026-10-24', body: { kind: 'dinner' } })).status, 400, 'readable plans refused');
  const plan = (await call(`${U}/plans`, sam, 'POST', { day: '2026-10-24', audience: 'couple', body: await seal(FK, { kind: 'movie', what: 'Wicked', time: '19:15', note: 'Popcorn on me' }) })).plan;
  assert.ok(!JSON.stringify([...m.values()]).includes('Wicked'));
  const patView = await call(`${U}?today=2026-10-24`, pat);
  assert.equal((await open(FK, patView.plans[0].body)).what, 'Wicked');
  assert.equal((await call(`${U}?today=2026-10-24`, kid)).plans.length, 0, 'just the two of you');
  const yes = await call(`${U}/plans/${plan.id}/reply`, pat, 'POST', { r: 'in' });
  assert.equal(yes.plan.agreed, true);
  assert.equal((await call(`${U}/plans/${plan.id}/reply`, sam, 'POST', { r: 'in' })).status, 400, 'not your own');
  // Notes: hearts, the streak.
  const note = (await call(`${U}/notes`, pat, 'POST', { body: await seal(FK, { text: 'love you', color: 'pink' }) })).note;
  await call(`${U}/notes/${note.id}/heart`, sam, 'POST');
  const v = await call(`${U}?today=${new Date().toISOString().slice(0, 10)}`, sam);
  assert.equal(v.notes[0].hearts.length, 1);
  assert.equal(v.theirStreak, 1);
  assert.equal((await call(`${U}/notes/${note.id}`, sam, 'DELETE')).status, 403, "only who wrote it");
  // Bringing over the trackers' plans: once, with the partner's answers matched up later.
  await call(`${U}/import`, pat, 'POST', { replies: { abc123: { r: 'maybe', at: 1 } } });
  const imp = await call(`${U}/import`, sam, 'POST', { plans: [{ id: 'abc123', day: '2026-10-30', body: await seal(FK, { kind: 'brunch', where: 'Hobees' }) }], noteDays: ['2026-10-23'] });
  assert.equal(imp.imported, 1);
  assert.equal((await call(`${U}/import`, sam, 'POST', { plans: [{ id: 'abc123', day: '2026-10-30', body: await seal(FK, {}) }] })).imported, 0, 'not twice');
  const after = await call(`${U}?today=2026-10-24`, sam);
  assert.equal(after.plans.find((p) => p.id === 'tabc123').replies[after.partner.id].r, 'maybe');
});
