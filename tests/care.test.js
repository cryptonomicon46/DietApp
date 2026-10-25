// 👫 A chore logged by one of you can count for both afterwards (and back), and points follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

test('an entry becomes "both of us" after the fact', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const C = `/families/${family.fid}/care`;
  const walk = (await call(C, sam, 'POST', { date: '2026-10-24', kind: 'walk' })).entry;
  const board = async () => Object.fromEntries((await call(`/families/${family.fid}/chores?month=2026-10&today=2026-10-24`, sam)).board.map((b) => [b.name, b.points]));
  assert.deepEqual(await board(), { sam: 2, Pat: 0 });
  const both = (await call(`${C}/2026-10-24/${walk.id}`, sam, 'PATCH', { both: true })).entry;
  assert.equal(both.by.length, 2);
  assert.equal(both.byName, 'sam & Pat');
  assert.deepEqual(await board(), { sam: 2, Pat: 2 }, 'both get the points');
  assert.equal((await call(`${C}/2026-10-24/${walk.id}`, pat, 'PATCH', { both: false })).entry.byName, 'Pat', 'back to just whoever asked');
  const outsider = await signIn('out@example.com');
  assert.equal((await call(`${C}/2026-10-24/${walk.id}`, outsider, 'PATCH', { both: true })).status, 404);

  // Either of you logs for the other: Pat did the dishes, Sam taps it in.
  const dishes = (await call(C, sam, 'POST', { date: '2026-10-24', kind: 'dishes', by: add.member.id })).entry;
  assert.deepEqual(dishes.by, [add.member.id]);
  assert.equal(dishes.byName, 'Pat');
  assert.equal((await call(`${C}/2026-10-24/${dishes.id}`, sam, 'PATCH', { who: 'both' })).entry.byName, 'sam & Pat');
  assert.equal((await call(`${C}/2026-10-24/${dishes.id}`, pat, 'PATCH', { who: family.members[0].id })).entry.byName, 'sam', 'Pat moves it to Sam');
  const trash = (await call(C, pat, 'POST', { date: '2026-10-24', kind: 'trash', by: family.members[0].id })).entry;
  assert.equal((await call(`${C}/2026-10-24/${trash.id}`, pat, 'DELETE')).ok, true, 'who logged it can undo it');
  assert.equal((await call(C, sam, 'POST', { date: '2026-10-24', kind: 'trash', by: 'nobody' })).entry.byName, 'sam', 'unknown → you');
});

test('cooking counts, and a family can add (and retire) its own chores', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const C = `/families/${family.fid}/care`;
  await call(C, token, 'POST', { date: '2026-10-24', kind: 'cook_d' });
  assert.equal((await call(C, token, 'POST', { date: '2026-10-24', kind: 'x_nope' })).status, 400, 'not a chore yet');
  const { chores } = await call(`/families/${family.fid}/chores/custom`, token, 'PUT', { chores: [{ icon: '🪴', label: 'Water the plants', pts: 2, section: 'house' }] });
  const kind = `x_${chores[0].id}`;
  await call(C, token, 'POST', { date: '2026-10-24', kind });
  const board = async () => (await call(`/families/${family.fid}/chores?month=2026-10&today=2026-10-24`, token)).board[0].points;
  assert.equal(await board(), 5, 'dinner 3 + plants 2');
  // Removed: no new entries, but what was logged still counts.
  await call(`/families/${family.fid}/chores/custom`, token, 'PUT', { chores: [] });
  assert.equal((await call(C, token, 'POST', { date: '2026-10-24', kind })).status, 400);
  assert.equal(await board(), 5);
  assert.equal((await call(`/families/${family.fid}`, token)).family.chores[0].gone, true);
});
