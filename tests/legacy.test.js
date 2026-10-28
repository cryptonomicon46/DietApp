// 🧳 2.0 Phase 10 — moving off the household code without losing anything: a signed-in phone stops
// uploading to the code (so only the family sharing choices decide who sees the trackers), still reads
// a partner who hasn't moved, never reads one who has, copies old dog files into the family store,
// and refreshes linked calendars through the account. Nothing old is deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

let cur = new Map();
globalThis.localStorage = new Proxy({}, {
  get: (_, k) => ({ getItem: (x) => (cur.has(x) ? cur.get(x) : null), setItem: (x, v) => cur.set(x, String(v)), removeItem: (x) => cur.delete(x), clear: () => cur.clear() })[k],
  ownKeys: () => [...cur.keys()],
  getOwnPropertyDescriptor: (_, k) => (cur.has(k) ? { enumerable: true, configurable: true, value: cur.get(k) } : undefined),
});
const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const env = { HOUSEHOLD: kv(), DEMO: true };
// The old household store (server/worker.js), played here: records by code and person, and files.
const old = new Map(), hits = [], files = new Map();
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), method = init.method || 'GET';
  const h = u.pathname.match(/^\/household\/([^/]+)\/(.+)$/);
  if (h) {
    hits.push(`${method} ${h[2]}`);
    const key = `${h[1]}:${h[2]}`;
    if (method === 'PUT') { old.set(key, h[2].startsWith('file/') ? init.body : JSON.parse(init.body)); return new Response('{}'); }
    if (method === 'DELETE') { old.delete(key); return new Response('{}'); }
    if (!old.has(key)) return new Response('{}', { status: 404 });
    const v = old.get(key);
    return v instanceof Blob ? new Response(v) : new Response(JSON.stringify(v));
  }
  // The family file store (R2 on the real connector), played here.
  if (/^\/v2\/families\/[a-z0-9]+\/photos\/[a-z0-9]+$/.test(u.pathname)) {
    if (method === 'PUT') { files.set(u.pathname, new Uint8Array(await new Response(init.body).arrayBuffer())); return new Response('{"ok":true}'); }
    return files.has(u.pathname) ? new Response(files.get(u.pathname)) : new Response('{}', { status: 404 });
  }
  const r = await familyApi(new Request(url, init), env, u.pathname.replace(/^\/v2/, ''));
  return r.raw ? new Response(r.raw, { status: r.status }) : new Response(JSON.stringify(r.data), { status: r.status });
};
const api = async (path, token, method = 'GET', body) => (await (await fetch(`https://c.test/v2${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })).json());
const signIn = async (email) => {
  const { token } = await (await fetch('https://c.test/v2/auth/demo', { method: 'POST', body: JSON.stringify({ email }) })).json();
  await api('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  return token;
};
const device = (entries) => { cur = new Map(Object.entries(entries).map(([k, v]) => [k, k.startsWith('fam.') ? v : JSON.stringify(v)])); };
const J = (k) => JSON.parse(cur.get(k));
const CODE = 'householdtestcode42';

const { account } = await import('../js/account.js');
const { sync } = await import('../js/sync.js');
const { getFile } = await import('../js/dogs.js');

test('not signed in: the old way carries on, unchanged', async () => {
  device({ 'lp.g.sync': { url: 'https://c.test', code: CODE }, 'lp.g.owner': 'sandman', 'lp.p.sandman.weights': [{ date: '2026-10-01', weight: 160 }] });
  hits.length = 0;
  assert.equal(sync.household(), true);
  await sync.push();
  assert.deepEqual(hits, ['PUT sandman']);
  assert.deepEqual(old.get(`${CODE}:sandman`).data.weights, [{ date: '2026-10-01', weight: 160 }]);
});

test('signed in: no upload to the code; an unmoved partner is still read, a moved one never', async () => {
  // Pat's phone, not moved yet, put Pat's copy on the code earlier.
  old.set(`${CODE}:amani`, { savedAt: Date.now(), data: { weights: [{ date: '2026-10-01', weight: 130 }] } });
  const sam = await signIn('sam@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Fam' });
  device({ 'lp.g.sync': { url: 'https://c.test', code: CODE }, 'fam.token.live': sam, 'fam.fid': family.fid, 'lp.g.owner': 'sandman', 'lp.p.sandman.weights': [{ date: '2026-10-01', weight: 160 }, { date: '2026-10-05', weight: 158 }] });
  await account.connect();
  const before = old.get(`${CODE}:sandman`);
  hits.length = 0;
  await sync.push(); await sync.pull();
  assert.ok(!hits.some((x) => x.startsWith('PUT')), `no household writes: ${hits}`);
  assert.equal(old.get(`${CODE}:sandman`), before, "the old copy is left as it was (🛟 Recover can read it)");
  const mine = await api(`/families/${family.fid}/members/${family.members[0].id}/data`, sam);
  assert.equal(mine.data.weights.length, 2, 'the account got the new weigh-in');
  assert.deepEqual(J('lp.p.amani.weights'), [{ date: '2026-10-01', weight: 130 }], "Pat hasn't moved: still read the old way");

  // Pat moves: joins the family and connects the trackers, sharing nothing with Sam.
  const pat = await signIn('pat@example.com');
  const add = await api(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await api(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await api(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const samPhone = new Map(cur);
  device({ 'fam.token.live': pat, 'fam.fid': family.fid, 'lp.g.owner': 'amani', 'lp.p.amani.weights': [{ date: '2026-10-01', weight: 130 }, { date: '2026-10-06', weight: 129 }] });
  await account.connect(); await sync.push();
  cur = samPhone;
  old.set(`${CODE}:amani`, { savedAt: Date.now() + 1000, data: { weights: [{ date: '2026-10-01', weight: 999 }] } }); // a stale old-way copy
  await account.connect();
  hits.length = 0;
  await sync.pull();
  assert.ok(!hits.includes('GET amani'), 'a partner on their account is never read from the code');
  assert.notEqual(J('lp.p.amani.weights')[0].weight, 999);
});

test('a dog file shared the old way moves into the family file store when a signed-in phone opens it', async () => {
  const sam = await signIn('sam2@example.com');
  const { family } = await api('/families', sam, 'POST', { name: 'Dogs' });
  device({ 'lp.g.sync': { url: 'https://c.test', code: CODE }, 'fam.token.live': sam, 'fam.fid': family.fid, 'lp.g.owner': 'sandman' });
  await account.connect();
  old.set(`${CODE}:file/vax1`, new Blob(['rabies certificate'], { type: 'application/pdf' }));
  const blob = await getFile('vax1', 'application/pdf');
  assert.equal(await blob.text(), 'rabies certificate');
  const moved = await account.getFile('vax1', 'application/pdf');
  assert.equal(await moved.text(), 'rabies certificate', 'now in the family file store');
  assert.ok(old.has(`${CODE}:file/vax1`), 'the old copy is not deleted by moving');
});

test('linked calendars refresh through the account: the secret link in the body, no code', async () => {
  const sam = await signIn('sam3@example.com');
  device({ 'fam.token.live': sam, 'lp.g.owner': 'sandman' });
  let seen;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { if (String(url).endsWith('/v2/ics')) seen = { url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization }; return real(url, init); };
  try {
    const r = await account.ics('https://p01-caldav.icloud.com/published/2/secret');
    assert.deepEqual(seen.body, { url: 'https://p01-caldav.icloud.com/published/2/secret' });
    assert.equal(seen.auth, `Bearer ${sam}`);
    assert.equal(r.ok, false); assert.match(r.error, /live connector/); // the demo connector doesn't fetch
  } finally { globalThis.fetch = real; }
});
