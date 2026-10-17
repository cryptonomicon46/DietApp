import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

const kv = () => { const m = new Map(); const meta = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v, o) => { m.set(k, v); meta.set(k, o?.metadata ?? null); }, getWithMetadata: async (k) => ({ value: m.get(k) ?? null, metadata: meta.get(k) ?? null }), delete: async (k) => { m.delete(k); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) }; };
const env = { APP_ORIGIN: 'https://example.github.io/DietApp/', HOUSEHOLD: kv() };
const call = (path, init) => worker.fetch(new Request(`https://w.test${path}`, init), env);

test('household sharing: put, get, isolation by code', async () => {
  const code = 'abcd-efgh-jkmn';
  assert.equal((await call(`/household/${code}/amani`)).status, 404);
  const body = JSON.stringify({ savedAt: 1, data: { profile: { name: 'Amani' } } });
  assert.equal((await call(`/household/${code}/amani`, { method: 'PUT', body })).status, 200);
  const got = await (await call(`/household/${code}/amani`)).json();
  assert.equal(got.data.profile.name, 'Amani');
  assert.equal((await call('/household/zzzz-zzzz-zzzz/amani')).status, 404, 'other codes see nothing');
  assert.equal((await call('/household/short/amani')).status, 404, 'codes must be long');
  assert.equal((await call(`/household/${code}/amani`, { method: 'PUT', body: 'not json' })).status, 400);
  const pre = await call(`/household/${code}/amani`, { method: 'OPTIONS' });
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /PUT/);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://example.github.io');
});

test('assistant: needs a key and a known household code', async () => {
  const store = new Map([['abcd-efgh-jkmn:sandman', '{}']]);
  const hh = { get: async (k) => store.get(k) ?? null, put: async () => {}, list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) };
  const post = (e, body) => worker.fetch(new Request('https://w.test/assistant', { method: 'POST', body: JSON.stringify(body) }), { ...env, HOUSEHOLD: hh, ...e });
  assert.equal((await post({}, { code: 'abcd-efgh-jkmn', text: 'hi' })).status, 501, 'no key configured');
  const keyed = { ANTHROPIC_API_KEY: 'test' };
  assert.equal((await post(keyed, { code: 'zzzz-zzzz-zzzz', text: 'squats' })).status, 403, 'unknown household');
  assert.equal((await post(keyed, { code: 'abcd-efgh-jkmn', text: '' })).status, 400);
  assert.equal((await post(keyed, { code: 'abcd-efgh-jkmn', text: 'x'.repeat(501) })).status, 400);
});

test('household files: PDFs and images up to 10 MB, readable with the code, deletable', async () => {
  const path = '/household/abcd-efgh-jkmn/file/vax123abc';
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]); // %PDF-1
  assert.equal((await call(path)).status, 404);
  assert.equal((await call(path, { method: 'PUT', body: pdf, headers: { 'Content-Type': 'text/html' } })).status, 415, 'no web pages');
  assert.equal((await call(path, { method: 'PUT', body: new Uint8Array(0), headers: { 'Content-Type': 'application/pdf' } })).status, 400);
  assert.equal((await call(path, { method: 'PUT', body: new Uint8Array(10 * 1024 * 1024 + 1), headers: { 'Content-Type': 'application/pdf' } })).status, 413);
  assert.equal((await call(path, { method: 'PUT', body: pdf, headers: { 'Content-Type': 'application/pdf' } })).status, 200);
  const got = await call(path);
  assert.equal(got.headers.get('Content-Type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), pdf);
  assert.equal((await call('/household/zzzz-zzzz-zzzz/file/vax123abc')).status, 404, 'other codes see nothing');
  assert.equal((await call(path, { method: 'DELETE' })).status, 200);
  assert.equal((await call(path)).status, 404);
  assert.match((await call(path, { method: 'OPTIONS' })).headers.get('Access-Control-Allow-Methods'), /DELETE/);
});

test('shared calendar feed: both people\'s events as one subscribable calendar', async () => {
  const code = 'cal1-cal2-cal3';
  const put = (who, data) => call(`/household/${code}/${who}`, { method: 'PUT', body: JSON.stringify({ savedAt: 1, data }) });
  assert.equal((await call(`/household/${code}/calendar.ics`)).status, 404);
  await put('sandman', { profile: { name: 'Sandman' }, events: [{ id: 'a1', title: 'Vet', date: '2026-10-20', start: '09:30', who: 'both', remind: '30', updatedAt: 1 }] });
  await put('amani', { profile: { name: 'Amani' }, events: [{ id: 'b2', title: 'Yoga', date: '2026-10-21', start: '18:00', who: 'amani', updatedAt: 1 }] });
  const res = await call(`/household/${code}/calendar.ics`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/calendar/);
  const body = await res.text();
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(body, /SUMMARY:Yoga/);
  assert.match(body, /For: Amani/);
  assert.ok(!body.includes('VALARM'));
});

test('linked calendars: fetched for a known household from calendar hosts only', async () => {
  const code = 'ics1-ics2-ics3';
  await call(`/household/${code}/amani`, { method: 'PUT', body: JSON.stringify({ savedAt: 1, data: {} }) });
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', { status: 200 }); };
  try {
    const link = encodeURIComponent('webcal://p52-caldav.icloud.com/published/2/abc');
    assert.equal((await call(`/ics?code=zzzz-zzzz-zzzz&url=${link}`)).status, 403, 'unknown household');
    const ok = await call(`/ics?code=${code}&url=${link}`);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /BEGIN:VCALENDAR/);
    assert.equal(asked[0], 'https://p52-caldav.icloud.com/published/2/abc', 'webcal becomes https');
    assert.equal((await call(`/ics?code=${code}&url=${encodeURIComponent('https://evil.example.com/x.ics')}`)).status, 400, 'other hosts refused');
    assert.equal((await call(`/ics?code=${code}&url=${encodeURIComponent('http://p52-caldav.icloud.com/x')}`)).status, 400, 'https only');
    globalThis.fetch = async () => new Response('<html>nope</html>', { status: 200 });
    assert.equal((await call(`/ics?code=${code}&url=${link}`)).status, 422);
  } finally { globalThis.fetch = realFetch; }
});
