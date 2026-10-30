// 🗣️ Talk T2a — "Ask about my day": free time worked out on the phone, the day sent with people as
// roles, suggestions kept only inside a free gap, and the route carrying only what it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDayQuestion, freeTime, dayContext, dayWeather, foodFacts, checkSuggestions, CONTEXT_MAX } from '../js/talkDay.js';
import { DAY_INSTRUCTIONS, TALK_INSTRUCTIONS } from '../server/talkAi.js';
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

test("the weather for a day question: every 2 hours, today from about now, tomorrow too, with sunrise and sunset", () => {
  const hourly = [];
  for (let i = 0; i < 48; i++) hourly.push({ time: new Date(2026, 9, 30, i), temp: 60.4 + (i % 24) / 2, rain: i > 40 ? 55 : 5, wind: 7.6 });
  const { hours, sun } = dayWeather(hourly, { dates: ['2026-10-30', '2026-10-31'], now: new Date(2026, 9, 30, 11, 30), daily: { sunrise: ['2026-10-30T07:24', '2026-10-31T07:25'], sunset: ['2026-10-30T18:08', '2026-10-31T18:07'] } });
  assert.deepEqual(hours.filter((h) => h.date === '2026-10-30').map((h) => h.at), ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']);
  assert.equal(hours.filter((h) => h.date === '2026-10-31').length, 8);
  assert.deepEqual(hours[0], { date: '2026-10-30', at: '10:00', tempF: 65, rainChance: 5, windMph: 8 });
  assert.equal(hours.at(-1).rainChance, 55);
  assert.deepEqual(sun, [{ date: '2026-10-30', sunrise: '07:24', sunset: '18:08' }, { date: '2026-10-31', sunrise: '07:25', sunset: '18:07' }]);
  assert.deepEqual(dayWeather(null, { dates: ['2026-10-30'] }), { hours: [], sun: [] });
  const ctx = dayContext({ today: '2026-10-30', now: '11:30', meId: 'sam', people, days: [{ date: '2026-10-30', items: [] }], weather: hours, sun });
  assert.equal(ctx.weather.length, 14); assert.equal(ctx.daylight[0].sunset, '18:08');
  assert.match(DAY_INSTRUCTIONS, /before sunset/); assert.match(DAY_INSTRUCTIONS, /don't estimate/);
});

test("a very full calendar still fits what the gateway takes: tomorrow's weather goes first, then the last items", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ time: `${String(7 + (i % 14)).padStart(2, '0')}:00`, title: `Meeting about the quarterly planning review number ${i} with the whole team`, place: 'Conference room on the third floor, north building', who: 'sam' }));
  const weather = ['2026-10-30', '2026-10-31'].flatMap((date) => Array.from({ length: 8 }, (_, i) => ({ date, at: `${String(6 + 2 * i).padStart(2, '0')}:00`, tempF: 60, rainChance: 5, windMph: 5 })));
  const ctx = dayContext({ today: '2026-10-30', now: '08:00', meId: 'sam', people, days: [{ date: '2026-10-30', items }, { date: '2026-10-31', items }], weather });
  assert.ok(JSON.stringify(ctx).length <= CONTEXT_MAX);
  assert.ok(ctx.weather.every((w) => w.date === '2026-10-30') && ctx.weather.length === 8);
  assert.ok(ctx.days.every((d) => d.items.length >= 3));
});

test("food and WHOOP questions go the day way; logging food still doesn't", () => {
  for (const q of ["What's my meal plan for the rest of the day and how is my sleep and recovery score for today", 'How many macros do I have left?', 'What should I eat for dinner?', "How's my recovery?", 'what is my strain'])
    assert.ok(isDayQuestion(q), q);
  for (const q of ['Log lunch: chicken bowl', 'I had a protein bar', 'two eggs and toast for breakfast', 'walked the dog']) assert.ok(!isDayQuestion(q), q);
});

test("your food today: targets, eaten, what's left, and each meal logged or still planned — names become roles", () => {
  const entry = { eaten: 1210, target: 2300, protein: 98, proteinTarget: 180, left: { kcal: 1090, p: 82, c: 120, f: 30 }, meals: 2 };
  const f = foodFacts({ entry, logged: { breakfast: { title: 'Oatmeal', kcal: 450, p: 30, c: 60, f: 10, foods: 'Oats 80g; Whey 30g' }, lunch: { title: 'Chicken bowl', kcal: 760, p: 68, c: 80, f: 18 } },
    planned: { breakfast: { title: 'Eggs', kcal: 400, p: 30, c: 10, f: 20 }, dinner: { title: "Pat's salmon and rice", kcal: 720, p: 55, c: 70, f: 22, foods: 'Salmon 170g; Rice 200g' } }, extras: 1 });
  assert.deepEqual(f.meals.map((m) => `${m.meal}:${m.status}`), ['breakfast:logged', 'lunch:logged', 'dinner:planned']);
  assert.deepEqual(f.left, { kcal: 1090, p: 82, c: 120, f: 30 }); assert.equal(f.extrasLogged, 1); assert.equal(f.target.protein, 180);
  assert.equal(foodFacts({ entry: null }), null); assert.equal(foodFacts({ entry: { target: 0 } }), null);
  const ctx = dayContext({ today: '2026-10-30', now: '11:30', meId: 'sam', people, days: [{ date: '2026-10-30', items: [] }], food: f,
    health: { recovery: { state: 'scored', score: 63, scoreBand: 'yellow' }, sleep: { performance: 76, hours: 6.3 }, strain: { today: 5.1 } } });
  assert.equal(ctx.yourFood.meals[2].title, "[partner]'s salmon and rice"); assert.ok(!/Pat|Sam/.test(JSON.stringify(ctx)));
  assert.equal(ctx.yourHealth.recovery.score, 63); assert.equal(ctx.yourHealth.sleep.performance, 76);
  assert.match(DAY_INSTRUCTIONS, /Sleep 76% · Recovery 63% · Strain 5\.1/); assert.match(DAY_INSTRUCTIONS, /rest of today/);
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

test("traffic, weather and drive-time questions go the day way however they're phrased (the owner's sentence)", () => {
  for (const q of ["I like to run later in the afternoon and go rock climb at movement Santa Clara how's the traffic and the weather",
    'Is it going to rain later?', 'How long will it take to get to Movement Sunnyvale', 'Traffic to work', 'Is the gym still open', 'When does Trader Joe\'s close'])
    assert.ok(isDayQuestion(q), q);
  for (const q of ['I had eggs in the morning for breakfast', 'Log lunch: chicken bowl', 'Walked the dogs', 'Add Dune to our watchlist']) assert.ok(!isDayQuestion(q), q);
  assert.match(TALK_INSTRUCTIONS, /traffic/); assert.doesNotMatch(TALK_INSTRUCTIONS, /booking, buying, places, questions/);
});
