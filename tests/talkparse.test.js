// 🗣️ Talk to Pawmily T1: the phone reads everyday requests itself; Claude only gets what it couldn't
// (the words, with people as roles), and its answer is cut down to the steps the app knows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTalk, tidySteps, DOS } from '../js/talkParse.js';
import { TALK_SCHEMA, TALK_INSTRUCTIONS } from '../server/talkAi.js';
import { PURPOSES, minimize } from '../server/aiGateway.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { ACTIONS } from '../js/talkActions.js';

const one = (t) => parseTalk(t)?.steps?.[0] ?? null;

test('the phone reads everyday requests itself', () => {
  assert.deepEqual(one('Add Dune: Part Two to our watchlist'), { do: 'watch.add', title: 'Dune: Part Two', kind: '', status: 'want' });
  assert.deepEqual(one('add the movie Conclave to my watch list.'), { do: 'watch.add', title: 'Conclave', kind: 'movie', status: 'want' });
  assert.deepEqual(one("We're watching Severance now"), { do: 'watch.status', title: 'Severance', status: 'watching' });
  assert.deepEqual(one('we finished The Bear'), { do: 'watch.status', title: 'The Bear', status: 'finished' });
  assert.deepEqual(one('Mark Silo as watched'), { do: 'watch.status', title: 'Silo', status: 'finished' });
  assert.deepEqual(one('Add Project Hail Mary to my reading list — [partner] recommended it'), { do: 'read.add', title: 'Project Hail Mary', author: '', state: 'want', recBy: 'partner' });
  assert.deepEqual(one("I'm starting Tomorrow, and Tomorrow, and Tomorrow"), { do: 'read.state', title: 'Tomorrow, and Tomorrow, and Tomorrow', state: 'reading' });
  assert.deepEqual(one('I finished reading Piranesi'), { do: 'read.state', title: 'Piranesi', state: 'finished' });
  assert.deepEqual(one('Log lunch: chicken bowl and an iced latte'), { do: 'diet.log', meal: 'lunch', text: 'chicken bowl and an iced latte' });
  assert.deepEqual(one('I had a snack: a protein bar'), { do: 'diet.log', meal: 'extra', text: 'a protein bar' });
  assert.deepEqual(one('two eggs and toast for breakfast'), { do: 'diet.log', meal: 'breakfast', text: 'two eggs and toast' });
  assert.deepEqual(one("make today's workout lighter"), { do: 'fitness.lighter' });
  assert.deepEqual(one('walked the dog'), { do: 'care.log', chore: 'walk' });
  assert.deepEqual(one('We took the dogs to the park'), { do: 'care.log', chore: 'park' });
  assert.deepEqual(one('fed the dogs dinner'), { do: 'care.log', chore: 'dinner' });
  // Anything else isn't guessed: it goes to Claude (or "I can't do that yet").
  for (const t of ['Plan a date Saturday', 'Book a table for two', 'add milk', '', 'x'.repeat(501)]) assert.equal(parseTalk(t), null, t);
});

test('whatever the source, only the steps the app knows, cleaned, at most 4', () => {
  const t = tidySteps([
    { do: 'calendar.add', title: 'x' }, { do: 'watch.add', title: '  "Dune"  ', kind: 'film', status: 'binge' },
    { do: 'read.add', title: '' }, { do: 'diet.log', meal: 'snack', text: 'an apple' }, { do: 'care.log', chore: 'walk' },
    { do: 'fitness.lighter', extra: 1 }, { do: 'watch.status', title: 'Silo' },
  ]);
  assert.deepEqual(t, [{ do: 'watch.add', title: 'Dune', kind: '', status: 'want' }, { do: 'diet.log', meal: 'extra', text: 'an apple' }, { do: 'care.log', chore: 'walk' }, { do: 'fitness.lighter' }]);
  assert.deepEqual(tidySteps('nonsense'), []);
  // Every step maps to an action in the T0 registry (none of them involves anyone else).
  const map = { 'watch.add': 'watch.add', 'watch.status': 'watch.setStatus', 'read.add': 'read.add', 'read.state': 'read.setState', 'diet.log': 'diet.log', 'fitness.describe': 'fitness.describe', 'fitness.lighter': 'fitness.variant', 'care.log': 'care.log', 'weight.log': 'weight.log', 'ask.day': 'calendar.freeBusy' };
  for (const d of DOS) { assert.ok(ACTIONS[map[d]], d); assert.notEqual(ACTIONS[map[d]].affects, 'shared', d); }
  assert.deepEqual(TALK_SCHEMA.properties.steps.items.properties.do.enum, DOS);
  assert.match(TALK_INSTRUCTIONS, /Never invent/); assert.match(TALK_INSTRUCTIONS, /\[partner\]/);
});

test('the gateway: talk.route carries only the words, the tab and the date', () => {
  assert.deepEqual(Object.keys(PURPOSES['talk.route'].fields).sort(), ['tab', 'text', 'today']);
  const m = minimize('talk.route', { text: 'add Dune', tab: 'us', today: '2026-10-30', watchlist: ['Silo'], name: 'Sam', key: 'k' });
  assert.deepEqual(Object.keys(m.payload).sort(), ['tab', 'text', 'today']);
  assert.throws(() => minimize('talk.route', { text: 'x'.repeat(501) }), /too long/);
});

test('the /ai/talk route: signed in, the words only, steps back, nothing kept but a value-free audit line', async () => {
  const m = new Map();
  let asked;
  const client = { messages: { create: async (req) => { asked = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ steps: [{ do: 'watch.add', title: 'Dune: Part Two', kind: 'movie', status: 'want' }, { do: 'calendar.add', title: 'nope' }], say: '' }) }] }; } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  assert.equal((await call('/ai/talk', null, 'POST', { text: 'add dune' })).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const before = new Set(m.keys());
  const r = await call('/ai/talk', token, 'POST', { text: 'put the new Dune on our list for [partner] and me', tab: 'us', today: '2026-10-30', watchlist: ['Silo', 'Severance'], name: 'Sam' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.steps, [{ do: 'watch.add', title: 'Dune: Part Two', kind: 'movie', status: 'want' }], 'only steps it knows');
  const sent = JSON.stringify(asked);
  assert.ok(sent.includes('[partner]') && sent.includes('us tab') && sent.includes('2026-10-30'));
  for (const bad of ['Silo', 'Severance', 'Sam']) assert.ok(!sent.includes(bad), bad);
  const added = [...m.keys()].filter((k) => !before.has(k));
  assert.ok(added.every((k) => /^v2:(aiaudit:|ai:talk\.route:|rate:)/.test(k)), added.join());
  assert.ok(added.filter((k) => k.includes('aiaudit')).every((k) => !JSON.stringify(m.get(k)).includes('Dune')), 'no values in the audit');
  assert.equal((await call('/ai/talk', token, 'POST', { text: ' ' })).status, 400);
  delete env.__anthropic;
  assert.equal((await call('/ai/talk', token, 'POST', { text: 'add dune' })).status, 501);
});

test('a book can say who recommended it (a member id, structured — not a note)', async () => {
  const { normalizeBook } = await import('../js/books.js');
  assert.equal(normalizeBook({ title: 'Project Hail Mary', recBy: 'm2pat' }).recBy, 'm2pat');
  assert.equal(normalizeBook({ title: 'X', recBy: 'Pat said so!' }).recBy, undefined);
  assert.equal(normalizeBook({ title: 'X' }).recBy, undefined);
});

test("today's weight, said any common way (lb or kg) → one weight.log step; nonsense numbers aren't weights", async () => {
  const lb = (t) => parseTalk(t)?.steps?.[0];
  for (const [said, want] of [['Log my weight for today 160.6 pounds', 160.6], ['log weight 160.6', 160.6], ['Record my weigh-in as 160.6 lb', 160.6], ['log my weight: 160.6', 160.6],
    ['I weigh 72.5 kg', 159.8], ['Weighed in at 160.6 this morning', 160.6], ['my weight today is 161', 161], ['weight 160.6', 160.6], ['I weigh 160.6 lbs today', 160.6]]) {
    assert.deepEqual(lb(said), { do: 'weight.log', lb: want }, said);
  }
  for (const no of ['Log weight 12', 'log my weight 9999', 'I weigh a lot', 'weight loss tips']) assert.equal(lb(no)?.do === 'weight.log', false, no);
  // Claude's steps are cleaned the same way; kg come only through the phone's reader.
  assert.deepEqual(tidySteps([{ do: 'weight.log', lb: 160.64 }, { do: 'weight.log', lb: 20 }, { do: 'weight.log', lb: 'x' }]), [{ do: 'weight.log', lb: 160.6 }]);
  const { validate } = await import('../js/talkActions.js');
  assert.equal(validate({ action: 'weight.log', args: { lb: 160.6 } }).ok, true);
  assert.equal(validate({ action: 'weight.log', args: { lb: 1000 } }).ok, false);
  assert.equal(validate({ action: 'weight.log', args: {} }).ok, false);
});
