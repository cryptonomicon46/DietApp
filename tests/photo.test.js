// 📷 Checkpoint D — a photo or screenshot of a workout → the one workout model. Claude's reading is
// synthetic here (each case is the answer shape Claude's structured output returns); what's tested is
// that every kind of workout lands in the model exactly, that unsure readings stay visibly unsure and
// nothing missing is filled in, and that only the one redrawn picture is sent — and nothing is kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toWorkout, readWorkout, INSTRUCTIONS } from '../server/workoutAi.js';
import { uncertain, describe, problems } from '../js/workout.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const S = (o = {}) => ({ reps: null, weight: null, unit: 'lb', bodyweight: false, seconds: null, distance: null, distance_unit: 'mi', unsure: [], ...o });
const item = (name, sets, name_unsure = false) => ({ name, name_unsure, sets });
const block = (kind, rounds, items, rounds_unsure = false) => ({ kind, rounds, rounds_unsure, items });
const read = (blocks, unread = []) => toWorkout({ title: 'From a photo', blocks, unread }, { source: 'photo', today: '2026-10-28' });
const flags = (w) => uncertain(w).map((u) => `${u.block}.${u.item ?? '-'}.${u.set ?? '-'}:${u.field}`);

test('conventional straight sets (a typed screenshot)', () => {
  const { workout: w } = read([block('straight', 3, [item('Bench Press', [135, 145, 155].map((x) => S({ reps: 8, weight: x })))]), block('straight', 3, [item('Barbell Row', [1, 2, 3].map(() => S({ reps: 10, weight: 95 })))])]);
  assert.deepEqual(describe(w), ['Bench Press 8 / 8 / 8 @ 135 / 145 / 155 lb', 'Barbell Row 10 / 10 / 10 @ 95 lb']);
  assert.deepEqual(flags(w), []); assert.equal(w.source, 'photo');
});

test('the 4-round circuit and the 3-round superset from a whiteboard, rep for rep', () => {
  const reps = (...r) => r.map((n) => S({ reps: n, unsure: ['weight'] }));
  const { workout: w } = read([
    block('circuit', 4, [item('Overhead Press', reps(12, 12, 11, 11)), item('Bent-over Row', reps(12, 13, 14, 13)), item('Squat', reps(10, 11, 11, 11)), item('Chest Press', reps(12, 11, 11, 11)), item('Bicycle Crunch', [26, 24, 22, 24].map((n) => S({ reps: n, bodyweight: true })))]),
    block('superset', 3, [item('Alternating Reverse Lunge', [14, 14, 14].map((n) => S({ reps: n, weight: 40 }))), item('Lateral Raise', [11, 12, 9].map((n) => S({ reps: n, weight: 20 })))]),
  ]);
  assert.deepEqual(w.blocks.map((b) => [b.kind, b.rounds, b.items.length]), [['circuit', 4, 5], ['superset', 3, 2]]);
  assert.deepEqual(w.blocks[0].items.map((i) => i.sets.map((s) => s.reps)), [[12, 12, 11, 11], [12, 13, 14, 13], [10, 11, 11, 11], [12, 11, 11, 11], [26, 24, 22, 24]]);
  assert.deepEqual(w.blocks[1].items.map((i) => i.sets.map((s) => [s.reps, s.weight])), [[[14, 40], [14, 40], [14, 40]], [[11, 20], [12, 20], [9, 20]]]);
  // No weights on the whiteboard for the circuit: 16 weight fields to check, none for the crunches.
  assert.equal(flags(w).filter((f) => f.endsWith(':weight')).length, 16);
});

test('supersets with a different weight for each exercise', () => {
  const { workout: w } = read([block('superset', 3, [item('Squat', [1, 2, 3].map(() => S({ reps: 8, weight: 165 }))), item('Romanian Deadlift', [1, 2, 3].map(() => S({ reps: 10, weight: 55 })))])]);
  assert.deepEqual(describe(w), ['3 rounds (superset): Squat 8 / 8 / 8 @ 165 lb · Romanian Deadlift 10 / 10 / 10 @ 55 lb']);
});

test('handwriting: a name read with doubt stays flagged until corrected; unclear numbers stay flagged', () => {
  const { workout: w, unread } = read([block('straight', 3, [item('Goblet Squat', [S({ reps: 12, weight: 35 }), S({ reps: 12, weight: 35, unsure: ['reps'] }), S({ reps: 15, weight: 35, unsure: ['reps', 'weight'] })], true)], true)], ['scribble in the corner']);
  assert.deepEqual(flags(w), ['0.-.-:rounds', '0.0.-:name', '0.0.1:reps', '0.0.2:reps', '0.0.2:weight']);
  assert.deepEqual(unread, ['scribble in the corner']);
  // A flagged reading is still the best reading — shown, highlighted, editable; never blank.
  assert.equal(w.blocks[0].items[0].name, 'Goblet Squat');
});

test('missing weights and reps stay empty and flagged — even if Claude forgot to flag them', () => {
  const { workout: w } = read([block('straight', 3, [item('Deadlift', [1, 2, 3].map(() => S({ reps: 5 })))]), block('straight', 2, [item('Pull-up', [S({ bodyweight: true }), S({ bodyweight: true })])])]);
  assert.deepEqual(w.blocks[0].items[0].sets.map((s) => [s.weight, s.uncertain]), [[null, ['weight']], [null, ['weight']], [null, ['weight']]]);
  assert.deepEqual(w.blocks[1].items[0].sets.map((s) => [s.reps, s.bw, s.uncertain]), [[null, true, ['reps']], [null, true, ['reps']]]);
});

test('bodyweight, timed and distance work; a weight on a bodyweight move is dropped', () => {
  const { workout: w } = read([block('circuit', 3, [item('Push-up', [1, 2, 3].map(() => S({ reps: 15, bodyweight: true, weight: 99 }))), item('Plank', [1, 2, 3].map(() => S({ seconds: 45, bodyweight: true }))), item('Row Erg', [1, 2, 3].map(() => S({ distance: 500, distance_unit: 'm' })))])]);
  assert.deepEqual(flags(w), []);
  assert.deepEqual(w.blocks[0].items.map((i) => [i.sets[0].weight, i.sets[0].bw, i.sets[0].time, i.sets[0].distance]), [[null, true, null, null], [null, true, 45, null], [null, false, null, 500]]);
});

test('mixed reps across rounds and a round missing from the picture', () => {
  const { workout: w } = read([block('superset', 4, [item('Curl', [S({ reps: 12, weight: 25 }), S({ reps: 10, weight: 25 }), S({ reps: 8, weight: 30 })]), item('Triceps Pushdown', [12, 12, 10, 10].map((n) => S({ reps: n, weight: 40 })))])]);
  // The fourth curl set wasn't in the picture: an empty set to fill, never a copy of the third.
  assert.deepEqual(w.blocks[0].items[0].sets.map((s) => [s.reps, s.weight]), [[12, 25], [10, 25], [8, 30], [null, null]]);
  assert.ok(flags(w).includes('0.0.3:reps'));
  assert.deepEqual(problems(w), []); // still addable once checked
});

test('nothing readable: an empty workout, so the phone says so instead of inventing one', () => {
  const { workout: w, unread } = read([], ['a photo of a dog']);
  assert.equal(w.blocks.length, 0); assert.deepEqual(unread, ['a photo of a dog']);
});

test('the request: one image block, the photo instructions, structured output — nothing else', async () => {
  let req;
  const client = { messages: { create: async (r) => { req = r; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Legs', blocks: [], unread: [] }) }] }; } } };
  await readWorkout(client, { image: 'QUJD', mime: 'image/jpeg', unit: 'kg' }, { model: 'm' });
  const [msg] = req.messages;
  assert.equal(req.messages.length, 1); assert.equal(req.system, undefined);
  assert.deepEqual(msg.content.map((c) => c.type), ['image', 'text']);
  assert.deepEqual(msg.content[0].source, { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
  assert.equal(msg.content[1].text, INSTRUCTIONS('kg', true));
  assert.match(INSTRUCTIONS('lb', true), /Never invent/); assert.match(INSTRUCTIONS('lb', true), /Don't describe people/);
  assert.equal(req.output_config.format.type, 'json_schema');
  // A refusal or a cut-off answer is a failure, not a half workout.
  client.messages.create = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"title":' }] });
  await assert.rejects(readWorkout(client, { image: 'QUJD', mime: 'image/jpeg' }), /max_tokens/);
});

test('the route: the picture passes through and is not kept; caps and sizes hold', async () => {
  const m = new Map();
  let calls = 0;
  const client = { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Board', unread: [], blocks: [block('straight', 1, [item('Squat', [S({ reps: 5, weight: 100 })])])] }) }] }; } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'pat@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const pic = Buffer.from('a synthetic picture').toString('base64');
  const r = await call('/ai/workout', token, 'POST', { image: pic, mime: 'image/jpeg', unit: 'lb' });
  assert.equal(r.status, 200); assert.equal(r.workout.source, 'photo');
  assert.ok(![...m.values()].some((v) => JSON.stringify(v).includes(pic)), 'the picture is not stored');
  const raw = [...m.entries()].find(([k]) => k.includes('aiaudit:'))[1], audit = typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.deepEqual(audit.fields, ['image', 'mime', 'unit']); assert.equal(audit.payload, 'personal-image');
  assert.equal((await call('/ai/workout', token, 'POST', { image: 'A'.repeat(3_500_004), mime: 'image/jpeg' })).status, 413);
  assert.equal((await call('/ai/workout', token, 'POST', { image: 'not base64!', mime: 'image/jpeg' })).status, 400);
  for (let i = 1; i < 20; i++) assert.equal((await call('/ai/workout', token, 'POST', { image: pic, mime: 'image/png' })).status, 200);
  assert.equal((await call('/ai/workout', token, 'POST', { image: pic, mime: 'image/png' })).status, 429, '20 photos a day');
  assert.equal(calls, 20);
});
