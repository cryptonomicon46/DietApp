// 🛒 Market: listings for the family and (by default) friends' families, sealed in an encrypted
// family; interest, lending, finishing, and who may change what.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marketRoutes, dueBack, KINDS } from '../server/market.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const S = (c) => `e1:${c.repeat(30)}`;
const sealed = (v, max) => (typeof v === 'string' && v.length <= max && /^e1:[A-Za-z0-9_-]+$/.test(v) ? v : null);
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const A = { fid: 'fa', name: 'Family A', e2ee: true, connections: ['fb'], members: [{ id: 'a1', uid: 'uA1', kind: 'person', name: 'Sam', relation: 'self', role: 'owner' }, { id: 'a2', uid: 'uA2', kind: 'person', name: 'Pat', relation: 'partner', role: 'member' }, { id: 'a3', uid: 'uKid', kind: 'person', name: 'Kid', relation: 'child' }] };
const B = { fid: 'fb', name: 'Family B', e2ee: false, connections: ['fa'], members: [{ id: 'b1', uid: 'uB1', kind: 'person', name: 'Alex', relation: 'self', role: 'owner' }] };
const C = { fid: 'fc', name: 'Strangers', e2ee: false, connections: [], members: [{ id: 'c1', uid: 'uC1', kind: 'person', name: 'Lee', relation: 'self', role: 'owner' }] };
const all = { fa: A, fb: B, fc: C };
let n = 0;
const call = async (db, uid, path, method = 'GET', body = {}) => {
  const told = [];
  const mine = Object.values(all).filter((f) => f.members.some((m) => m.uid === uid));
  const r = await marketRoutes({ path, method, body, db, user: { uid, name: `G-${uid}` }, families: async () => mine,
    loadFamily: async (fid) => mine.find((f) => f.fid === fid) || null, meIn: (f) => f.members.find((m) => m.uid === uid),
    sealed, clean, randomId: () => `it${++n}x`, json: (data, status = 200) => ({ status, data }), blobs: null,
    tell: async (uids, kind, msg) => told.push({ uids, kind, msg }) });
  return { ...r, told };
};
const fresh = () => { const db = kv(); for (const f of Object.values(all)) db.m.set(`family:${f.fid}`, f); return db; };

test('an encrypted family lists sealed boxes only; for friends it needs the listing key', async () => {
  const db = fresh();
  assert.equal((await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'sale', box: { title: 'Bike' } })).status, 400);
  assert.equal((await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'sale', box: S('a') })).status, 400, 'friends by default: needs pk');
  assert.equal((await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'nope', box: S('a'), aud: 'family' })).status, 400);
  assert.equal((await call(db, 'uKid', '/families/fa/market', 'POST', { kind: 'free', box: S('a'), aud: 'family' })).status, 403);
  const r = await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'lend', box: S('b'), pk: { fam: S('k'), conns: { fb: S('c'), fc: S('d') } } });
  assert.equal(r.data.item.aud, 'connections');
  assert.deepEqual(Object.keys(r.data.item.pk.conns), ['fb'], 'only connected families get a key');
  assert.deepEqual(r.told[0].uids.sort(), ['uA2', 'uB1'], 'grown-ups here and in friends\' families, not the kid or me');
  assert.equal(r.told[0].kind, 'market');
});

test('who sees what: family-only stays in the family; strangers see nothing', async () => {
  const db = fresh();
  await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'free', box: S('e'), aud: 'family' });
  await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'sale', box: S('f'), pk: { fam: S('k'), conns: { fb: S('c') } } });
  await call(db, 'uB1', '/families/fb/market', 'POST', { kind: 'wanted', box: { title: '  Tent ', body: 'for 4', price: '' } });
  const a = (await call(db, 'uA2', '/market')).data.items;
  assert.equal(a.length, 3);
  assert.equal(a.find((x) => x.fid === 'fb').box.title, 'Tent', 'a plain family\'s box is cleaned');
  const b = (await call(db, 'uB1', '/market')).data.items;
  assert.deepEqual(b.map((x) => [x.fid, x.kind]).sort(), [['fa', 'sale'], ['fb', 'wanted']]);
  assert.equal((await call(db, 'uC1', '/market')).data.items.length, 0);
  const famOnly = a.find((x) => x.kind === 'free');
  assert.equal((await call(db, 'uB1', `/families/fa/market/${famOnly.id}/interest`, 'POST')).status, 404, 'a friend can\'t reach a family-only listing');
  assert.equal((await call(db, 'uC1', `/families/fa/market/${famOnly.id}/interest`, 'POST')).status, 404);
});

test('interest: toggled, owner told and sees names, others only a count', async () => {
  const db = fresh();
  const { data: { item } } = await call(db, 'uA1', '/families/fa/market', 'POST', { kind: 'sale', box: S('g'), pk: { fam: S('k'), conns: { fb: S('c') } } });
  const p = `/families/fa/market/${item.id}/interest`;
  assert.equal((await call(db, 'uA1', p, 'POST')).status, 400, 'not on your own');
  const r = await call(db, 'uB1', p, 'POST');
  assert.equal(r.data.item.interested, true);
  assert.deepEqual(r.told[0].uids, ['uA1']);
  assert.match(r.told[0].msg.title, /Alex is interested/);
  assert.deepEqual(r.data.item.interest, [], 'the interested person doesn\'t see the list');
  const own = (await call(db, 'uA1', '/market')).data.items[0];
  assert.deepEqual(own.interest.map((x) => [x.name, x.family]), [['Alex', 'Family B']]);
  assert.equal((await call(db, 'uB1', p, 'POST')).data.item.interestCount, 0, 'toggled off');
});

test('lending, finishing and removing: the lister or the family\'s creator', async () => {
  const db = fresh();
  const { data: { item } } = await call(db, 'uA2', '/families/fa/market', 'POST', { kind: 'lend', box: S('h'), aud: 'family' });
  const p = `/families/fa/market/${item.id}`;
  assert.equal((await call(db, 'uKid', p, 'PATCH', { status: 'done' })).status, 403);
  assert.equal((await call(db, 'uA2', p, 'PATCH', { lend: { due: '2026-11-01' } })).status, 400, 'who?');
  let r = await call(db, 'uA2', p, 'PATCH', { lend: { to: 'Alex', due: '2026-11-01' } });
  assert.deepEqual([r.data.item.lend.to, r.data.item.lend.due], ['Alex', '2026-11-01']);
  assert.equal(dueBack(db.m.get('market:fa'), '2026-10-31').length, 0);
  assert.equal(dueBack(db.m.get('market:fa'), '2026-11-01').length, 1);
  r = await call(db, 'uA1', p, 'PATCH', { lend: null, status: 'pending' });
  assert.equal(r.data.item.lend, null, 'the family\'s creator can mark it back');
  assert.equal((await call(db, 'uA2', p, 'PATCH', { box: 'plain text' })).status, 400, 'sealed only');
  assert.equal((await call(db, 'uA2', p, 'DELETE')).data.ok, true);
  assert.equal(db.m.get('market:fa').length, 0);
  assert.ok(KINDS.wanted);
});

test('a full market makes room from finished listings, and refuses when all are open', async () => {
  const db = fresh();
  db.m.set('market:fb', Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, kind: 'free', aud: 'family', box: { title: 't' }, status: i === 50 ? 'done' : 'open', byUid: 'uB1', at: i, interest: [] })));
  assert.equal((await call(db, 'uB1', '/families/fb/market', 'POST', { kind: 'free', box: { title: 'new' }, aud: 'family' })).status, 200);
  assert.equal(db.m.get('market:fb').length, 100);
  assert.ok(!db.m.get('market:fb').some((x) => x.id === 'x50'));
  assert.equal((await call(db, 'uB1', '/families/fb/market', 'POST', { kind: 'free', box: { title: 'more' }, aud: 'family' })).status, 400);
});
