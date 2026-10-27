// 🔎 Search: Gemini first when its key is set (free), Claude as the backup; personal asks stay with Claude.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askSearch, askGemini, searchReady } from '../server/search.js';
import { planOuting } from '../server/outing.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const claude = (text, calls) => ({ messages: { create: async () => { calls.claude++; return { stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } }; } } });
const gemini = (text, calls, status = 200) => async (url, init) => {
  if (!url.includes('generativelanguage')) return { status: 200, ok: true };
  calls.gemini++; calls.last = { url, init };
  return { ok: status === 200, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }) };
};

test('Gemini answers with Google Search on, and the run is counted', async () => {
  const calls = { gemini: 0, claude: 0 }, db = kv();
  const env = { GEMINI_API_KEY: 'g', __fetch: gemini('hello', calls), __anthropic: claude('nope', calls) };
  const r = await askSearch(env, 'what\'s on', { db });
  assert.equal(r.text, 'hello');
  assert.equal(r.usage.provider, 'gemini');
  assert.equal(calls.claude, 0);
  assert.equal(calls.last.init.headers['x-goog-api-key'], 'g');
  assert.deepEqual(JSON.parse(calls.last.init.body).tools, [{ google_search: {} }]);
  assert.match(calls.last.url, /gemini-2\.5-flash:generateContent$/);
  const month = [...db.m.entries()].find(([k]) => k.startsWith('searchruns:'))[1];
  assert.equal(Object.values(month)[0].gemini, 1);
  const plain = await askGemini({ ...env, GEMINI_MODEL: 'gemini-3-flash' }, 'sum up', { search: false });
  assert.equal(JSON.parse(calls.last.init.body).tools, undefined);
  assert.equal(plain.usage.model, 'gemini-3-flash');
});

test('Claude takes over when Gemini fails, and for personal asks', async () => {
  const calls = { gemini: 0, claude: 0 }, db = kv();
  const env = { GEMINI_API_KEY: 'g', __fetch: gemini('x', calls, 429), __anthropic: claude('from claude', calls) };
  const r = await askSearch(env, 'q', { db });
  assert.equal(r.text, 'from claude');
  assert.equal(r.usage.provider, 'claude');
  const ok = { GEMINI_API_KEY: 'g', __fetch: gemini('gem', calls), __anthropic: claude('cl', calls) };
  assert.equal((await askSearch(ok, 'q', { claudeOnly: true })).text, 'cl');
  await assert.rejects(askSearch({ GEMINI_API_KEY: 'g', __fetch: gemini('x', calls, 500) }, 'q'), /gemini 500/);
  await assert.rejects(askSearch({}, 'q'), /no search provider/);
  assert.equal(searchReady({}), false);
  assert.equal(searchReady({ GEMINI_API_KEY: 'g' }), true);
});

test('an outing goes to Gemini unless it carries what you liked', async () => {
  const calls = { gemini: 0, claude: 0 };
  const plan = JSON.stringify({ area: 'Hayes Valley', stops: [{ time: '19:30', kind: 'dinner', name: 'Bistro' }] });
  const env = { GEMINI_API_KEY: 'g', __fetch: gemini(plan, calls), __anthropic: claude(plan, calls) };
  assert.ok((await planOuting(env, kv(), { fid: 'f' }, { text: 'Hayes Valley', day: '2026-11-01' }, 'San Jose')).outing);
  assert.deepEqual([calls.gemini, calls.claude], [1, 0]);
  await planOuting(env, kv(), { fid: 'f' }, { text: 'Hayes Valley', day: '2026-11-01', taste: 'loved the ramen' }, 'San Jose');
  assert.deepEqual([calls.gemini, calls.claude], [1, 1]);
});
