// 🤖 Phase 8 — the AI privacy gateway: a named purpose, only its allowed fields (capped), only its
// provider, a daily cap, and an audit line with field names and sizes — never the values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSES, minimize, aiCall, GatewayError } from '../server/aiGateway.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { toWorkout, SCHEMA } from '../server/workoutAi.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } }; };
const SECRET = 'Pat benched 135 on Tuesday';

test('only the purpose\'s fields go out; extra fields are dropped and named; too long is refused', () => {
  const { payload, sizes, dropped } = minimize('workout.text', { text: SECRET, unit: 'lb', familyKey: 'k', notes: 'x', history: [1] });
  assert.deepEqual(payload, { text: SECRET, unit: 'lb' });
  assert.deepEqual(sizes, { text: SECRET.length, unit: 2 });
  assert.deepEqual(dropped.sort(), ['familyKey', 'history', 'notes']);
  assert.throws(() => minimize('workout.text', { text: 'x'.repeat(1501) }), (e) => e instanceof GatewayError && e.status === 413);
  assert.throws(() => minimize('anything.else', {}), /unknown AI purpose/);
  // Personal content never goes to a provider other than its own.
  for (const [k, p] of Object.entries(PURPOSES)) if (p.payload !== 'public') assert.equal(p.provider, 'anthropic', k);
});

test('the call sees only the minimized payload; the audit line has names and sizes, never values', async () => {
  const db = kv();
  let seen;
  const out = await aiCall({ db, purpose: 'workout.text', input: { text: SECRET, unit: 'lb', member: 'Pat' }, now: Date.UTC(2026, 9, 28) }, async (p, provider) => { seen = { p, provider }; return 'ok'; });
  assert.equal(out, 'ok');
  assert.deepEqual(seen, { p: { text: SECRET, unit: 'lb' }, provider: 'anthropic' });
  const auditLines = () => [...db.m.entries()].filter(([k]) => k.startsWith('aiaudit:2026-10-28:')).map(([, v]) => v);
  const lines = auditLines();
  assert.equal(lines.length, 1);
  assert.deepEqual({ ...lines[0], ms: 0 }, { at: Date.UTC(2026, 9, 28), purpose: 'workout.text', provider: 'anthropic', payload: 'personal-text', fields: ['text', 'unit'], sizes: { text: SECRET.length, unit: 2 }, dropped: 1, ok: true, ms: 0 });
  assert.ok(!JSON.stringify([...db.m.values()]).includes('benched'), 'no value in storage');
  // A failure is audited too, still without values.
  await assert.rejects(aiCall({ db, purpose: 'workout.text', input: { text: SECRET }, now: Date.UTC(2026, 9, 28) }, async () => { throw Object.assign(new Error(SECRET), { status: 529 }); }));
  const fail = auditLines().find((l) => !l.ok);
  assert.equal(fail.ok, false); assert.equal(fail.error, '529');
  assert.ok(!JSON.stringify(fail).includes('benched'));
});

test('the wrong provider is refused before anything is sent; the daily cap holds', async () => {
  const db = kv();
  let calls = 0;
  const run = async () => { calls++; return 1; };
  await assert.rejects(aiCall({ db, purpose: 'workout.photo', input: { image: 'AAAA', mime: 'image/png' }, provider: 'gemini' }, run), /can't go to gemini/);
  assert.equal(calls, 0);
  let n = 0;
  const underLimit = async (_db, _k, max) => ++n <= max;
  for (let i = 0; i < PURPOSES['workout.photo'].perDay; i++) await aiCall({ db, purpose: 'workout.photo', input: { image: 'AAAA', mime: 'image/png' }, who: 'u1', underLimit }, run);
  await assert.rejects(aiCall({ db, purpose: 'workout.photo', input: { image: 'AAAA', mime: 'image/png' }, who: 'u1', underLimit }, run), (e) => e.status === 429);
  assert.equal(calls, PURPOSES['workout.photo'].perDay);
});

test("Claude's answer becomes the one workout model, unsure marks kept, gaps flagged", () => {
  const S = (o) => ({ reps: null, weight: null, unit: 'lb', bodyweight: false, seconds: null, distance: null, distance_unit: 'mi', unsure: [], ...o });
  const { workout: w, unread } = toWorkout({ title: 'Upper', unread: ['coach note: smile'], blocks: [
    { kind: 'superset', rounds: 3, rounds_unsure: false, items: [
      { name: 'Alternating Reverse Lunge', name_unsure: false, sets: [S({ reps: 14, weight: 40 }), S({ reps: 14, weight: 40 }), S({ reps: 14, weight: 40 })] },
      { name: 'Lateral Raise', name_unsure: true, sets: [S({ reps: 11, weight: 20 }), S({ reps: 12, weight: 20, unsure: ['reps'] }), S({ reps: 9 })] },
    ] },
    { kind: 'straight', rounds: 2, rounds_unsure: true, items: [{ name: 'Plank', name_unsure: false, sets: [S({ bodyweight: true, seconds: 45 }), S({ bodyweight: true, seconds: 45 })] }] },
  ] }, { source: 'photo', today: '2026-10-28' });
  assert.equal(w.source, 'photo'); assert.equal(w.date, '2026-10-28'); assert.deepEqual(unread, ['coach note: smile']);
  assert.deepEqual(w.blocks.map((b) => [b.kind, b.rounds, b.uncertain || []]), [['superset', 3, []], ['straight', 2, ['rounds']]]);
  const raise = w.blocks[0].items[1];
  assert.deepEqual(raise.uncertain, ['name']);
  assert.deepEqual(raise.sets.map((s) => [s.reps, s.weight, s.uncertain || []]), [[11, 20, []], [12, 20, ['reps']], [9, null, ['weight']]]);
  assert.deepEqual(w.blocks[1].items[0].sets[0].uncertain, undefined);
  // The schema is one Claude's structured output accepts: every object closed.
  const objs = []; (function walk(x) { if (x && typeof x === 'object') { if (x.type === 'object') objs.push(x); Object.values(x).forEach(walk); } })(SCHEMA);
  assert.ok(objs.length >= 4 && objs.every((o) => o.additionalProperties === false && o.required.length === Object.keys(o.properties).length));
});

test('the /ai/workout route: signed in only, the gateway in between, nothing kept but the audit', async () => {
  const m = new Map();
  let asked;
  const client = { messages: { create: async (req) => { asked = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Legs', unread: [], blocks: [{ kind: 'straight', rounds: 3, rounds_unsure: false, items: [{ name: 'Squat', name_unsure: false, sets: [1, 2, 3].map(() => ({ reps: 5, weight: 165, unit: 'lb', bodyweight: false, seconds: null, distance: null, distance_unit: 'mi', unsure: [] })) }] }] }) }] }; } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  assert.equal((await call('/ai/workout', null, 'POST', { text: 'squat 3x5 165' })).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const before = new Set(m.keys());
  const r = await call('/ai/workout', token, 'POST', { text: 'Squat 3 by 5, 165 pounds, felt strong', unit: 'lb', today: '2026-10-28', family: 'secret', history: ['x'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.workout.blocks[0].items[0].sets.map((s) => [s.reps, s.weight]), [[5, 165], [5, 165], [5, 165]]);
  assert.equal(r.workout.source, 'text');
  // Only the typed words reached Claude (and the unit, in the instructions); not the extras.
  const sent = JSON.stringify(asked.messages);
  assert.ok(sent.includes('felt strong') && !sent.includes('secret') && !sent.includes('history'));
  assert.equal(asked.output_config.format.type, 'json_schema');
  // Nothing new stored except the audit line and the daily count.
  const added = [...m.keys()].filter((k) => !before.has(k));
  assert.ok(added.every((k) => /^v2:(aiaudit:|ai:workout\.text:|rate:)/.test(k)), added.join());
  assert.ok(!JSON.stringify(added.map((k) => m.get(k))).includes('felt strong'));
  // A photo: only JPEG/PNG/WebP; Claude down → a plain message, not a crash.
  assert.equal((await call('/ai/workout', token, 'POST', { image: 'AAAA', mime: 'image/gif' })).status, 400);
  client.messages.create = async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); };
  const down = await call('/ai/workout', token, 'POST', { image: 'AAAA', mime: 'image/jpeg' });
  assert.equal(down.status, 502); assert.match(down.error, /clearer one, or type it/);
  // Without Claude on the connector: an honest "off".
  delete env.__anthropic;
  assert.equal((await call('/ai/workout', token, 'POST', { text: 'squat 3x5' })).status, 501);
});

test('every personal-content route counts against the daily cap (bingo: 10 a day per person)', async () => {
  const m = new Map();
  let calls = 0;
  const client = { beta: { messages: { create: async () => { calls++; return { content: [{ type: 'text', text: Array.from({ length: 30 }, (_, i) => `Square ${i}`).join('\n') }] }; } } } };
  const env = { __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), { ...env, DEMO: true }, path); return { status: r.status, ...(r.data || {}) }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const live = async (path, body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, path); return r.status; };
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push(await live(`/families/${family.fid}/bingo/generate`, { show: 'Severance' }));
  assert.equal(calls, 10); assert.equal(statuses.at(-1), 429, 'the 11th is refused before Claude is called');
});
