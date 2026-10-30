// 🗣️ Talk T2a — "Ask about my day": free time worked out on the phone, the day sent with people as
// roles, suggestions kept only inside a free gap, and the route carrying only what it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDayQuestion, freeTime, dayContext, checkSuggestions } from '../js/talkDay.js';
import { PURPOSES } from '../server/aiGateway.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const people = [{ id: 'sam', name: 'Sam', role: 'me' }, { id: 'pat', name: 'Pat', role: 'partner' }, { id: 'jo', name: 'Jo', role: 'member' }];

test('day questions are recognised; requests to add or log are not', () => {
  for (const q of ["What's on today?", "What's my agenda for today and when is the best time to go run or indoor rock climb?", 'What is [partner] up to today?', 'When should I go for a run?', 'Am I free tonight?', 'plan my day']) assert.equal(isDayQuestion(q), true, q);
  for (const q of ['Add Dune to our watchlist', 'Log lunch: chicken bowl', 'walked the dog', 'We finished Severance']) assert.equal(isDayQuestion(q), false, q);
});

test("free time: between your own and shared items, from now on today; others' items don't block you", () => {
  const items = [{ time: '09:00', end: '10:30', who: 'sam' }, { time: '12:00', end: '13:00', who: 'both' }, { time: '15:00', end: '17:00', who: 'pat' }, { time: '18:30', who: 'family' }, { allDay: true, who: 'sam' }];
  assert.deepEqual(freeTime(items, { meId: 'sam' }), [{ from: '07:00', to: '09:00' }, { from: '10:30', to: '12:00' }, { from: '13:00', to: '18:30' }, { from: '19:30', to: '22:00' }]);
  assert.deepEqual(freeTime(items, { meId: 'sam', now: '13:20' }), [{ from: '13:30', to: '18:30' }, { from: '19:30', to: '22:00' }]);
});

test('what goes to Claude: items with roles (titles too), your free gaps, weather and your health summary — no names', () => {
  const ctx = dayContext({ today: '2026-10-30', now: '10:26', meId: 'sam', people,
    days: [{ date: '2026-10-30', items: [{ time: '17:00', end: '18:00', title: 'Pat dentist', place: 'Main St Dental', who: 'pat' }, { time: '12:00', end: '13:00', title: 'Lunch with Jo', who: 'sam', kind: 'event' }, { time: '19:00', title: 'Date night', who: 'both', kind: 'plan' }] }],
    weather: [{ at: '17:00', tempF: 64, rainChance: 10 }], health: { recovery: { state: 'scored', scoreBand: 'yellow', relativeToUsual: 'usual' } } });
  const s = JSON.stringify(ctx);
  assert.ok(!/Pat|\bJo\b|Sam/.test(s), s);
  assert.equal(ctx.days[0].items[0].who, '[partner]'); assert.equal(ctx.days[0].items[0].title, '[partner] dentist');
  assert.equal(ctx.days[0].items[1].title, 'Lunch with [member:1]'); assert.equal(ctx.days[0].items[2].who, 'you and [partner]');
  assert.deepEqual(ctx.days[0].yourFreeTime, [{ from: '10:30', to: '12:00' }, { from: '13:00', to: '19:00' }, { from: '20:00', to: '22:00' }]);
  assert.equal(ctx.weather[0].tempF, 64); assert.equal(ctx.yourHealth.recovery.relativeToUsual, 'usual');
});

test('suggestions are kept only inside a free gap the phone found', () => {
  const ctx = { days: [{ date: '2026-10-30', yourFreeTime: [{ from: '13:00', to: '19:00' }] }] };
  const out = checkSuggestions([
    { date: '2026-10-30', start: '16:30', end: '17:30', title: 'Run', why: 'Dry and 64°F' },
    { date: '2026-10-30', start: '18:30', end: '19:30', title: 'Climb', why: 'overlaps dinner' },
    { date: '2026-10-31', start: '10:00', end: '11:00', title: 'Run', why: 'no facts for that day' },
    { date: '2026-10-30', start: 'soon', end: '17:00', title: 'x' },
  ], ctx);
  assert.deepEqual(out, [{ date: '2026-10-30', start: '16:30', end: '17:30', title: 'Run', why: 'Dry and 64°F' }]);
});

test('the /ai/talk/day route: signed in, the question and the day only, an answer back, nothing kept but the audit line', async () => {
  assert.deepEqual(Object.keys(PURPOSES['talk.day'].fields).sort(), ['context', 'now', 'text', 'today']);
  const m = new Map();
  let asked;
  const client = { messages: { create: async (req) => { asked = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answer: 'You have lunch at noon. [partner] has the dentist at 5.', suggestions: [{ date: '2026-10-30', start: '16:30', end: '17:30', title: 'Run', why: 'free and dry' }, { date: 'bad', start: '1', end: '2', title: 'x', why: '' }] }) }] }; } } };
  const env = { DEMO: true, __anthropic: client, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  assert.equal((await call('/ai/talk/day', null, 'POST', { text: 'what is on', today: '2026-10-30' })).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const before = new Set(m.keys());
  const context = JSON.stringify({ days: [{ date: '2026-10-30', items: [{ time: '17:00', title: '[partner] dentist', who: '[partner]' }] }] });
  const r = await call('/ai/talk/day', token, 'POST', { text: "What's on today?", today: '2026-10-30', now: '10:26', context, watchlist: ['Silo'] });
  assert.equal(r.status, 200); assert.match(r.answer, /\[partner\] has the dentist/); assert.equal(r.suggestions.length, 1);
  const sent = JSON.stringify(asked);
  assert.ok(sent.includes('[partner] dentist') && sent.includes('10:26') && !sent.includes('Silo'));
  const added = [...m.keys()].filter((k) => !before.has(k));
  assert.ok(added.every((k) => /^v2:(aiaudit:|ai:talk\.day:|rate:)/.test(k)), added.join());
  assert.ok(added.filter((k) => k.includes('aiaudit')).every((k) => !JSON.stringify(m.get(k)).includes('dentist')));
  assert.equal((await call('/ai/talk/day', token, 'POST', { text: 'x', today: '2026-10-30' })).status, 400);
  delete env.__anthropic;
  assert.equal((await call('/ai/talk/day', token, 'POST', { text: "What's on?", today: '2026-10-30' })).status, 501);
});
