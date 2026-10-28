// 💑 Couples picks: private picks that lock and reveal, scoring, endings (no longer posted to the old feed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { score, parseCouples, locked } from '../server/picks.js';

test('couples from a pasted list; scoring rewards calls and punishes picking everything', () => {
  assert.deepEqual(parseCouples('1. Sam & Pat\n- Lee and Kim\nAl + Bo\nSolo'), [{ a: 'Sam', b: 'Pat' }, { a: 'Lee', b: 'Kim' }, { a: 'Al', b: 'Bo' }, { a: 'Solo', b: '' }]);
  const season = { couples: [{ id: 'c1' }, { id: 'c2' }], happened: { c1: ['fight', 'cry'] }, outcome: { c1: 'ido' } };
  assert.deepEqual(score(season, { c1: { events: ['fight', 'cry'], outcome: 'ido' } }), { points: 9, hits: 2, endings: 1 });
  assert.equal(score(season, { c1: { events: ['fight', 'cry', 'cheat', 'drunk', 'money'], outcome: 'altar' } }).points, 4 - 3);
  assert.equal(score(season, { c2: { events: ['cheat'], outcome: 'before' } }).points, 0, 'no penalty before the ending is in');
  assert.equal(locked(season, 'c1'), true);
  assert.equal(locked(season, 'c2'), false);
});

test('a season: picks stay private until something happens, then lock; the ending is not posted to the old feed', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), out = await signIn('out@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const P = `/families/${family.fid}/picks`;

  const { season } = await call(P, sam, 'POST', { title: 'Love Is Blind', text: 'Al & Bo\nCy & Di', events: ['Talks about their dog'] });
  let v = await call(`${P}/${season.id}`, sam);
  assert.equal(v.season.couples.length, 2);
  assert.equal(v.season.events.length, 9);
  const [c1] = v.season.couples;
  await call(`${P}/${season.id}/mine`, sam, 'PUT', { couple: c1.id, events: ['fight', 'cry'], outcome: 'ido' });
  await call(`${P}/${season.id}/mine`, pat, 'PUT', { couple: c1.id, events: ['cheat'], outcome: 'before' });
  v = await call(`${P}/${season.id}`, pat);
  assert.deepEqual(v.revealed, {}, "Pat can't see Sam's picks yet");
  assert.equal((await call(`${P}/${season.id}`, out)).status, 404);

  // A fight happens: picks for that couple lock and are revealed.
  v = await call(`${P}/${season.id}/happened`, pat, 'POST', { couple: c1.id, event: 'fight' });
  assert.equal(v.revealed[c1.id][0].name, 'sam');
  assert.equal((await call(`${P}/${season.id}/mine`, pat, 'PUT', { couple: c1.id, events: ['fight'], outcome: 'ido' })).status, 400, 'locked');
  v = await call(`${P}/${season.id}/outcome`, sam, 'POST', { couple: c1.id, outcome: 'ido' });
  const board = Object.fromEntries(v.board.map((b) => [b.name, b.points]));
  assert.equal(board.sam, 2 - 1 + 5, 'fight +2, cry never happened −1, called the ending +5');
  assert.equal(board.Pat, -1);
  const feed = await call('/feed', pat);
  assert.equal(feed.posts.length, 0, 'nothing goes on the old feed (2.0)');
});
