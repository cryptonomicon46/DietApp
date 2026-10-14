import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
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
