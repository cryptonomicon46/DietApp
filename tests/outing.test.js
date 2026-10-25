// 🧭 Plan an outing: Claude's plan, checked and given its links; the monthly cap; swapping one stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeOuting, planOuting, swapStop } from '../server/outing.js';

const answer = { title: 'Hayes Valley afternoon', area: 'Hayes Valley, San Francisco',
  getting: [{ mode: 'train', text: 'Caltrain 13:08 Santa Clara → 4th & King', depart: '13:08' }, { mode: 'rocket', text: 'x' }],
  back: 'Last good train 22:30',
  stops: [{ time: '19:30', kind: 'dinner', name: 'Bistro', price: '$$$', url: 'https://b.example' }, { time: '14:45', kind: 'coffee', name: 'Café', url: 'javascript:x' }, { kind: 'walk', name: 'No time' }],
  options: { eat: [{ kind: 'drinks', name: 'Wine bar' }], do: [] }, tips: ['Book ahead'] };
const fam = { fid: 'f1' };
const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const claude = (text) => ({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2 } } }) } });

test('the plan comes back in time order, https links only, OpenTable for the meals', () => {
  const o = shapeOuting(answer, { day: '2026-11-01', from: 'San Jose', text: 'Hayes Valley' });
  assert.deepEqual(o.stops.map((x) => x.name), ['Café', 'Bistro'], 'sorted, the one without a time dropped');
  assert.equal(o.stops[0].url, '');
  assert.equal(o.stops[0].reserve, '', 'no OpenTable for coffee');
  assert.match(o.stops[1].reserve, /dateTime=2026-11-01T19%3A30/);
  assert.match(o.stops[1].map, /google\.com\/maps/);
  assert.equal(o.getting[1].mode, 'transit');
  assert.match(o.directions, /origin=San%20Jose/);
  assert.equal(shapeOuting({ stops: [] }, { day: '2026-11-01' }), null);
});

test('planning: the request is checked, Claude is asked once, and the month has a cap', async () => {
  const db = kv(), env = { __anthropic: claude(JSON.stringify(answer)), OUTING_MAX_RUNS: 1, __fetch: async (u) => ({ status: u.includes('b.example') ? 404 : 200 }) };
  assert.ok((await planOuting(env, db, fam, { text: 'x', day: '2026-11-01' }, 'San Jose')).error);
  assert.ok((await planOuting(env, db, fam, { text: 'Hayes Valley', day: 'soon' }, 'San Jose')).error);
  const r = await planOuting(env, db, fam, { text: 'Hayes Valley', day: '2026-11-01', chips: ['thai', 'dinner', '<script>'] }, 'San Jose');
  assert.equal(r.outing.title, 'Hayes Valley afternoon');
  assert.equal(r.left, 0);
  assert.match(r.outing.stops.find((x) => x.name === 'Bistro').url, /google\.com\/search\?q=Bistro/, 'a dead website becomes a search');
  assert.match((await planOuting(env, db, fam, { text: 'Mission', day: '2026-11-01' }, 'San Jose')).error, /1 outings/);
  // A swap still works after the plans run out (it has its own, bigger allowance).
  const env2 = { ...env, __anthropic: claude('{"options":[{"name":"Sushi spot","price":"$$$","opentable":true},{"name":""}]}') };
  const s = await swapStop(env2, db, fam, { area: 'Hayes Valley, San Francisco', day: '2026-11-01', time: '19:30', kind: 'dinner', cuisine: 'sushi', avoid: 'Bistro' }, 'San Jose');
  assert.deepEqual(s.options.map((x) => x.name), ['Sushi spot']);
  assert.match(s.options[0].reserve, /T19%3A30/);
});

test('the on-phone demo plans a made-up example without Claude', async () => {
  const r = await planOuting({ DEMO: true }, kv(), fam, { text: 'Sausalito', day: '2026-11-01' }, 'San Jose');
  assert.ok(r.demo && r.outing.stops.length >= 3);
  assert.match(r.outing.title, /example/);
});

test('a plan is a job: kept a day under its name, a repeat is instant and free, and a phone that left can pick it up', async () => {
  const { familyApi, TERMS_VERSION } = await import('../server/family.js');
  const m = new Map();
  let calls = 0;
  const env = { DEMO: true, __fetch: async () => ({ status: 200 }), __anthropic: { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }], usage: {} }; } } },
    HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const waits = [];
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path, { waitUntil: (p) => waits.push(p) }); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const O = `/families/${family.fid}/outing`;
  assert.equal((await call(`${O}/job/abcdef123456`, token)).status, 404, 'not done yet');
  await call(`${O}/job/abcdef123456/notify`, token, 'POST');
  const r = await call(O, token, 'POST', { text: 'Hayes Valley', day: '2026-11-01', job: 'abcdef123456' });
  assert.equal(r.outing.title, 'Hayes Valley afternoon');
  assert.ok(waits.length >= 1, 'the work carries on if the phone goes away');
  const again = await call(O, token, 'POST', { text: 'Hayes Valley', day: '2026-11-01', job: 'abcdef123456' });
  assert.ok(again.cached);
  assert.equal(calls, 1, 'no second Claude call');
  assert.equal((await call(`${O}/job/abcdef123456`, token)).outing.title, 'Hayes Valley afternoon', 'picked up later');
});
