// 📅 The family calendar: events locked, family only, the trackers' events brought over once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { newKey, makeCheck, seal, open } from '../family/crypto.js';

test('events: locked, repeat and who kept, imported once (newest copy wins), family only', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), out = await signIn('out@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const FK = newKey();
  await call(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  const E = `/families/${family.fid}/events`;
  assert.equal((await call(E, sam, 'POST', { date: '2026-11-08', body: { title: 'readable' } })).status, 400);
  const ev = (await call(E, sam, 'POST', { date: '2026-11-08', start: '18:00', end: '21:30', who: [family.members[0].id, 'nobody'], remind: 1440, repeat: { kind: 'yearly' }, body: await seal(FK, { title: 'Diwali dinner', place: "Mom's" }) })).event;
  assert.deepEqual(ev.who, [family.members[0].id]);
  assert.deepEqual(ev.repeat, { kind: 'yearly' });
  assert.equal(ev.remind, 1440);
  assert.ok(!JSON.stringify([...m.values()]).includes('Diwali'));
  assert.equal((await open(FK, (await call(E, sam)).events[0].body)).title, 'Diwali dinner');
  await call(`${E}/${ev.id}`, sam, 'PATCH', { start: '18:30' });
  assert.equal((await call(E, sam)).events[0].start, '18:30');
  // Bringing over the trackers' events.
  const imp = await call(`${E}/import`, sam, 'POST', { events: [{ id: 'abc', date: '2026-10-30', allDay: true, updatedAt: 5, body: await seal(FK, { title: 'Hot yoga' }) }] });
  assert.equal(imp.imported, 1);
  assert.equal((await call(`${E}/import`, sam, 'POST', { events: [{ id: 'abc', date: '2026-10-30', updatedAt: 5, body: await seal(FK, { title: 'old' }) }] })).imported, 0);
  assert.equal((await call(`${E}/import`, sam, 'POST', { events: [{ id: 'abc', date: '2026-10-31', updatedAt: 9, body: await seal(FK, { title: 'Hot yoga (moved)' }) }] })).imported, 1);
  // Linked calendars: sealed; only iCloud/Google/Outlook links are fetched.
  await call(`/families/${family.fid}/calfeeds`, sam, 'PUT', { feeds: [{ id: 'f1', who: 'both', body: await seal(FK, { name: 'Home', url: 'webcal://p01-caldav.icloud.com/x' }) }] });
  assert.equal((await call(E, sam)).feeds.length, 1);
  assert.equal((await call('/ics', sam, 'POST', { url: 'https://evil.example/cal.ics' })).status, 400);
  // Nobody outside the family; deleting.
  assert.equal((await call(E, out)).status, 404);
  await call(`${E}/${ev.id}`, sam, 'DELETE');
  assert.equal((await call(E, sam)).events.length, 1);
});
