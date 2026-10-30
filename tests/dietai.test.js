// 🍽 Health 2: a meal from a photo or from "Tell me". Only the picture (or the words) reach
// Claude, through the gateway; the answer is tidied and clamped; nothing is written or kept but
// the audit line (which never holds the values).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyItems, PHOTO_SCHEMA, TEXT_SCHEMA, PHOTO_INSTRUCTIONS } from '../server/dietAi.js';
import { PURPOSES, minimize } from '../server/aiGateway.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const IMG = Buffer.from('fake jpeg bytes for the test').toString('base64');

test('the gateway: diet.photo carries one picture (and its kind), diet.text only the words — never more', () => {
  assert.deepEqual(Object.keys(PURPOSES['diet.photo'].fields).sort(), ['hint', 'image', 'mime']);
  assert.deepEqual(Object.keys(PURPOSES['diet.text'].fields), ['text']);
  assert.equal(PURPOSES['diet.photo'].provider, 'anthropic');
  const m = minimize('diet.text', { text: 'two eggs', profile: { weight: 180 }, meals: ['x'], key: 'k' });
  assert.deepEqual(Object.keys(m.payload), ['text']);
  assert.deepEqual(m.dropped.sort(), ['key', 'meals', 'profile']);
  assert.throws(() => minimize('diet.text', { text: 'x'.repeat(601) }), /too long/);
  assert.ok(/Never describe a person/.test(PHOTO_INSTRUCTIONS));
  assert.equal(PHOTO_SCHEMA.additionalProperties, false); assert.equal(TEXT_SCHEMA.additionalProperties, false);
});

test('answers are tidied: names trimmed, numbers clamped, nothing extra', () => {
  const t = tidyItems([{ name: '  Grilled   salmon ', amount: '~6 oz', kcal: 360.4, p: 40, c: -5, f: 22, secret: 'x' }, { name: '', kcal: 10 }, { name: 'Huge', kcal: 99999, p: 9999, c: 9999, f: 9999 }]);
  assert.deepEqual(t[0], { name: 'Grilled salmon', amount: '~6 oz', kcal: 360, p: 40, c: 0, f: 22 });
  assert.equal(t.length, 2, 'unnamed dropped');
  assert.deepEqual([t[1].kcal, t[1].p, t[1].c, t[1].f], [3000, 300, 400, 250]);
});

test('the /ai/diet routes: signed in, one picture or the words, an estimate back, nothing kept', async () => {
  const m = new Map();
  let asked;
  const reply = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
  const client = { messages: { create: async (req) => { asked = req; return req.messages[0].content.some((c) => c.type === 'image')
    ? reply({ found: true, kind: 'plate', name: 'Salmon, rice & asparagus', serving: '', items: [{ name: 'Grilled salmon', amount: '~6 oz', kcal: 360, p: 40, c: 0, f: 22 }] })
    : reply({ items: [{ name: 'Pizza', amount: '3 slices', kcal: 900, p: 40, c: 105, f: 35 }] }); } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  assert.equal((await call('/ai/diet/photo', null, 'POST', { image: IMG, mime: 'image/jpeg' })).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const before = new Map(m);
  const r = await call('/ai/diet/photo', token, 'POST', { image: IMG, mime: 'image/jpeg', hint: 'restaurant', profile: { weight: 180 }, meals: ['Chicken bowl'] });
  assert.equal(r.status, 200);
  assert.equal(r.found, true); assert.equal(r.items[0].name, 'Grilled salmon');
  const sent = JSON.stringify(asked);
  assert.ok(sent.includes(IMG) && /restaurant dish/.test(sent));
  for (const bad of ['180', 'Chicken bowl']) assert.ok(!sent.includes(bad), bad);
  const t = await call('/ai/diet/text', token, 'POST', { text: '3 slices pizza', meals: ['secret'] });
  assert.equal(t.items[0].kcal, 900);
  assert.ok(!JSON.stringify(asked).includes('secret'));
  const added = [...m.keys()].filter((k) => !before.has(k));
  assert.ok(added.every((k) => /^v2:(aiaudit:|ai:diet\.(photo|text):|rate:)/.test(k)), added.join());
  const audits = added.filter((k) => k.includes('aiaudit')).map((k) => JSON.stringify(m.get(k)));
  assert.ok(audits.length >= 2 && audits.every((a) => !a.includes(IMG) && !a.includes('pizza')), 'no values in the audit');
  // Bad picture, empty words, Claude off.
  assert.equal((await call('/ai/diet/photo', token, 'POST', { image: IMG, mime: 'image/gif' })).status, 400);
  assert.equal((await call('/ai/diet/photo', token, 'POST', { image: 'not base64!!', mime: 'image/jpeg' })).status, 400);
  assert.equal((await call('/ai/diet/text', token, 'POST', { text: ' ' })).status, 400);
  delete env.__anthropic;
  assert.equal((await call('/ai/diet/photo', token, 'POST', { image: IMG, mime: 'image/jpeg' })).status, 501);
});
