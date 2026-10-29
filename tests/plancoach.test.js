// 📈 H12 "Ask about my plan": only the allowlisted plan numbers and the question reach Claude;
// nothing is changed or kept; a suggested change routes to the approve-first check-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFacts, cleanTurns, planFacts, factsText } from '../js/planCoach.js';
import { SCHEMA, SYSTEM } from '../server/planCoach.js';
import { PURPOSES } from '../server/aiGateway.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const today = '2026-10-29';
const back = (n) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

test('the allowlist keeps plan numbers only and drops everything else', () => {
  const f = cleanFacts({
    phase: 'cut', week: 5, weeks: 8, daysLeft: 24, targets: { kcal: 1950, protein: 150, carbs: 180, fat: 60, name: 'Sam' },
    adherence: { daysLogged: 6, daysOnTarget: 5, avgKcal: 1990.4, avgProtein: 141, meals: ['Chicken bowl'] },
    trendLbPerWeek: 0.84, plannedLbPerWeek: 1, status: 'on-track', goalDate: '2026-12-13', estimateDate: 'soon', trainingDays7: 3,
    data: { weighIns: 12, spanDays: 20 }, name: 'Sam', partner: 'Pat', weights: [181.7, 179], notes: 'felt bad', meals: 'tacos', key: 'abc',
  });
  assert.deepEqual(Object.keys(f).sort(), ['adherence', 'data', 'daysLeft', 'estimateDate', 'goalDate', 'phase', 'plannedLbPerWeek', 'status', 'targets', 'trainingDays7', 'trendLbPerWeek', 'week', 'weeks']);
  const s = JSON.stringify(f);
  for (const bad of ['Sam', 'Pat', 'Chicken', 'tacos', 'felt', 'abc', '181.7', 'soon']) assert.ok(!s.includes(bad), bad);
  assert.equal(f.adherence.avgKcal, 1990);
  assert.equal(f.estimateDate, null);
  // Only fixed words and bounded numbers.
  assert.equal(cleanFacts({ phase: 'Sam\'s cut', status: 'great', week: 9e9 }).phase, null);
  assert.equal(cleanFacts({ week: 9e9 }).week, 104);
  assert.deepEqual(cleanFacts(null).targets, { kcal: null, protein: null, carbs: null, fat: null });
});

test('earlier turns: questions and answers only, a few, each short', () => {
  const t = cleanTurns([...Array(9).keys()].map((i) => ({ q: `q${i}`, a: 'x'.repeat(2000), name: 'Sam' })));
  assert.equal(t.length, 4);
  assert.deepEqual(Object.keys(t[0]), ['q', 'a']);
  assert.equal(t[0].a.length, 800);
  assert.deepEqual(cleanTurns('nope'), []);
});

test('the phone builds the facts from the plan without weights, meals or names', () => {
  const days = Object.fromEntries([0, 1, 2, 4, 5].map((n) => [back(n), { meals: 3, eaten: 1900 + n * 10, protein: 140, target: 1950, title: 'Chicken bowl' }]));
  const weights = [...Array(15).keys()].map((n) => ({ date: back(20 - n), weight: 182 - n * 0.15 }));
  const f = planFacts({ profile: { phase: 'cut', phaseStart: back(30), goalLb: 170, name: 'Sam' }, weights, days, today, targets: { kcal: 1950, p: 150, c: 180, f: 60 }, planned: 1, trainingDates: [back(1), back(1), back(3), back(9)] });
  assert.equal(f.phase, 'cut'); assert.equal(f.week, 5);
  assert.equal(f.adherence.daysLogged, 5);
  assert.equal(f.trainingDays7, 2);
  assert.equal(f.data.weighIns, 15);
  const s = JSON.stringify(f);
  assert.ok(!s.includes('182') && !s.includes('170') && !s.includes('Chicken') && !s.includes('Sam'));
  assert.ok(factsText(f).some((x) => /phase cut, week 5 of 8/.test(x)));
});

test('the gateway purpose and the instructions', () => {
  assert.deepEqual(Object.keys(PURPOSES['diet.coach'].fields).sort(), ['facts', 'question', 'turns']);
  assert.equal(PURPOSES['diet.coach'].provider, 'anthropic');
  assert.match(SYSTEM, /cannot change anything/);
  assert.match(SYSTEM, /weekly check-in/);
  assert.match(SYSTEM, /too early to tell/);
  assert.equal(SCHEMA.additionalProperties, false);
});

test('the /ai/plan route: signed in, allowlist rebuilt on the connector, nothing written or kept but the audit', async () => {
  const m = new Map();
  let asked;
  const client = { messages: { create: async (req) => { asked = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answer: 'You are a little behind; your weekly check-in could suggest 100 kcal less.', suggests_target_change: true }) }] }; } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  assert.equal((await call('/ai/plan', null, 'POST', { question: 'am I on track?' })).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const before = new Map(m);
  const r = await call('/ai/plan', token, 'POST', {
    question: 'Why is my weight not moving?', turns: [{ q: 'hi', a: 'hello' }],
    facts: { phase: 'cut', week: 5, weeks: 8, status: 'behind', trendLbPerWeek: 0.2, plannedLbPerWeek: 1, name: 'Sam', meals: ['Chicken bowl'], weights: [181.2] },
    family: 'The Smiths', threads: ['secret'],
  });
  assert.equal(r.status, 200);
  assert.equal(r.checkin, true);
  assert.match(r.answer, /check-in/);
  const sent = JSON.stringify(asked), prompt = asked.messages[0].content[0].text;
  assert.ok(prompt.includes('Why is my weight not moving?') && prompt.includes('"phase":"cut"') && prompt.includes('<earlier_question>\nhi'));
  for (const bad of ['Sam', 'Chicken', '181.2', 'Smiths', 'secret']) assert.ok(!sent.includes(bad), bad);
  assert.equal(asked.output_config.format.type, 'json_schema');
  // Nothing changed: only the audit line and the daily count were added; no values in them.
  const added = [...m.keys()].filter((k) => !before.has(k));
  assert.ok(added.every((k) => /^v2:(aiaudit:|ai:diet\.coach:|rate:)/.test(k)), added.join());
  const changed = [...before.keys()].filter((k) => JSON.stringify(before.get(k)) !== JSON.stringify(m.get(k)));
  assert.ok(changed.every((k) => /^v2:(rate:|user:|session)/.test(k)), changed.join());
  const raw = m.get(added.find((k) => k.includes('aiaudit'))), auditLine = typeof raw === 'string' ? JSON.parse(raw) : raw.value ?? raw;
  assert.deepEqual(auditLine.fields.sort(), ['facts', 'question', 'turns']);
  assert.ok(!JSON.stringify(auditLine).includes('weight not moving'));
  // Too long, empty, Claude down, Claude off.
  assert.equal((await call('/ai/plan', token, 'POST', { question: 'x'.repeat(501) })).status, 413);
  assert.equal((await call('/ai/plan', token, 'POST', { question: '' })).status, 400);
  client.messages.create = async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); };
  assert.equal((await call('/ai/plan', token, 'POST', { question: 'on track?' })).status, 502);
  delete env.__anthropic;
  assert.equal((await call('/ai/plan', token, 'POST', { question: 'on track?' })).status, 501);
});
