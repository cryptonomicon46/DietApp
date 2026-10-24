// 🛟 Recover: every copy is found, combining only ever adds, and both the phone and the
// server keep the bigger copy when a much smaller one replaces it.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { TERMS_VERSION } from '../server/family.js';

let cur = new Map();
globalThis.localStorage = new Proxy({}, {
  get: (_, k) => ({ getItem: (x) => (cur.has(x) ? cur.get(x) : null), setItem: (x, v) => cur.set(x, String(v)), removeItem: (x) => cur.delete(x) })[k],
  ownKeys: () => [...cur.keys()],
  getOwnPropertyDescriptor: (_, k) => (cur.has(k) ? { enumerable: true, configurable: true, value: cur.get(k) } : undefined),
});
const kvMap = new Map();
const env = { APP_ORIGIN: 'https://example.github.io/DietApp/', DEMO: true, HOUSEHOLD: { get: async (k) => kvMap.get(k) ?? null, put: async (k, v) => { kvMap.set(k, v); }, delete: async (k) => { kvMap.delete(k); }, list: async ({ prefix }) => ({ keys: [...kvMap.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) } };
globalThis.fetch = (url, init = {}) => worker.fetch(new Request(url, init), env);
const J = (k) => JSON.parse(cur.get(k));
const set = (k, v) => cur.set(k, JSON.stringify(v));

const { importProfile } = await import('../js/storage.js');
const { findCopies, combine, applyRecovery, readBackup, counts, partnerFile } = await import('../js/recover.js');

const FULL = { mealLog: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`2026-09-${String(i % 30 + 1).padStart(2, '0')}-${i}`, { meals: ['eggs', 'rice', 'chicken'] }])),
  weights: Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, weight: 160 - i / 10 })), dogProfiles: { d1: { name: 'Rex' }, d2: { name: 'Bo' } } };

test('backup files: the trackers\' own and the family app\'s full backup', () => {
  assert.deepEqual(readBackup(JSON.stringify({ app: 'lean-plate', profile: 'sandman', data: { weights: [1] } }), 'sandman'), { weights: [1] });
  assert.equal(readBackup(JSON.stringify({ app: 'lean-plate', profile: 'amani', data: { weights: [1] } }), 'sandman'), null);
  const fam = { app: 'OurPawmily', localStorage: { 'lp.p.sandman.weights': '[{"date":"2026-10-01","weight":160}]', 'lp.p.amani.weights': '[]', 'lp.g.owner': '"sandman"' } };
  assert.deepEqual(readBackup(JSON.stringify(fam), 'sandman'), { weights: [{ date: '2026-10-01', weight: 160 }] });
  assert.equal(readBackup('not json', 'sandman'), null);
});

test('replacing a profile with a much smaller copy keeps the old one on the device', () => {
  cur = new Map();
  for (const [k, v] of Object.entries(FULL)) set(`lp.p.amani.${k}`, v);
  importProfile('amani', { weights: [] });
  assert.equal(Object.keys(J('lp.s.amani').data.mealLog).length, 40);
  // …and that copy can go to the partner as a file.
  const f = partnerFile('amani');
  assert.equal(counts(f.data).meals, 40);
});

test('recover finds the household copies (and the bigger one the server kept) and only adds', async () => {
  cur = new Map();
  const code = 'abcdefghjkmn';
  set('lp.g.owner', 'sandman'); set('lp.g.sync', { url: 'https://c.test', code });
  const put = (body) => fetch(`https://c.test/household/${code}/sandman`, { method: 'PUT', body: JSON.stringify(body) });
  await put({ savedAt: 1, data: FULL });
  await put({ savedAt: 2, data: { weights: [{ date: '2026-10-05', weight: 158 }] } }); // a phone that lost its data
  assert.equal((await (await fetch(`https://c.test/household/${code}/sandman/prev`)).json()).data.dogProfiles.d2.name, 'Bo');
  assert.equal((await fetch(`https://c.test/household/${code}/sandman/prev`, { method: 'PUT', body: '{}' })).status, 405);

  // This device has today's weigh-in and a setting of its own.
  set('lp.p.sandman.weights', [{ date: '2026-10-06', weight: 157 }]); set('lp.p.sandman.profile', { name: 'Sam', goal: 'cut' });
  const copies = await findCopies('sandman');
  assert.deepEqual(copies.map((c) => c.id), ['device', 'household', 'household-prev']);
  const r = applyRecovery('sandman', combine(copies));
  assert.equal(r.before.meals, 0);
  assert.equal(r.after.meals, 40);
  assert.equal(r.after.dogs, 2);
  assert.equal(r.after.weighIns, 22, 'the old 20, the lost phone\'s one and this device\'s one');
  assert.deepEqual(J('lp.p.sandman.profile'), { name: 'Sam', goal: 'cut' });
});

test('the account keeps its bigger copy too, for you only, and deleting the account removes it', async () => {
  const call = async (path, token, method = 'GET', body) => { const r = await fetch(`https://c.test/v2${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...(await r.json()) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'F' });
  const me = family.members[0].id;
  await call(`/families/${family.fid}/members/${me}/data`, sam, 'PUT', { data: FULL });
  await call(`/families/${family.fid}/members/${me}/data`, sam, 'PUT', { data: { profile: { name: 'Sam' } } });
  assert.equal(Object.keys((await call(`/families/${family.fid}/members/${me}/data/prev`, sam)).data.mealLog).length, 40);
  const pat = await signIn('pat@example.com');
  assert.equal((await call(`/families/${family.fid}/members/${me}/data/prev`, pat)).status, 404);
  await call('/account/delete', sam, 'POST', { confirm: 'DELETE' });
  assert.ok(![...kvMap.keys()].some((k) => k.startsWith('v2:dataprev:')));
});
