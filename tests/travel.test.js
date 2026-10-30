// 🚗 Drive times for day questions (T3): the phone picks the places and departures, the connector
// asks Google Maps (Places API (New) + Routes API), and only places, hours and minutes come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTravel, travel, TRAVEL_PER_DAY } from '../server/travel.js';
import { travelAsked, destinations, departures, travelFacts, dayContext } from '../js/talkDay.js';
import { DAY_INSTRUCTIONS } from '../server/talkAi.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const people = [{ id: 'sam', name: 'Sam', role: 'me' }, { id: 'pat', name: 'Pat', role: 'partner' }];
const known = [{ query: 'Movement Santa Clara, 801 Martin Ave, Santa Clara', all: ['movement', 'santa clara'] }, { query: 'Movement Sunnyvale, 815 Stewart Dr, Sunnyvale', all: ['movement', 'sunnyvale'] }];

test('only questions about going somewhere ask for drive times', () => {
  for (const q of ["What's the best time for the run and indoor rock climbing at Movement Santa Clara?", 'When should I leave for the dentist?', 'How is traffic to work?']) assert.ok(travelAsked(q), q);
  for (const q of ["What's my meal plan for the rest of the day?", "How's my recovery?"]) assert.ok(!travelAsked(q), q);
});

test('the places: known gyms (any case, as voice gives it), named places, your own calendar places — never people or times', () => {
  // The owner's spoken question: lowercase, "movement and Santa Clara".
  assert.deepEqual(destinations('I plan to run 4 miles and rock climb later this afternoon what\'s the best time for the run and indoor rock climbing and movement and Santa Clara', { known }), ['Movement Santa Clara, 801 Martin Ave, Santa Clara']);
  assert.deepEqual(destinations('When should I go to Trader Joe\'s on Hamilton at 4 PM?', { known }), ["Trader Joe's on Hamilton"]);
  assert.deepEqual(destinations('When should I leave for lunch at [partner]\'s office?', { known }), []);
  const items = [{ time: '15:00', title: 'Dentist', place: 'Main St Dental', who: 'sam' }, { time: '17:00', title: 'Yoga', place: 'Studio Nine', who: 'pat' }, { time: '18:00', title: 'Dinner', place: "Pat's parents", who: 'both' }, { allDay: true, title: 'Trip', place: 'Tahoe', who: 'sam' }];
  assert.deepEqual(destinations('When should I leave today?', { items, people, meId: 'sam', known }), ['Main St Dental']);
  assert.equal(destinations('to A, at B C, near D E, from F G, to H I', { max: 3 }).length, 3);
});

test('departures: now, then up to three even hours from 7 AM to 8 PM, at least an hour away', () => {
  const at = (h, m = 0) => new Date(2026, 9, 30, h, m);
  const hours = (list) => list.map((x) => (x ? new Date(x).getHours() : 'now'));
  assert.deepEqual(hours(departures(at(11, 30))), ['now', 14, 16, 18]);
  assert.deepEqual(hours(departures(at(19, 10))), ['now']);
  assert.deepEqual(hours(departures(at(5, 0))), ['now', 8, 10, 12]);
});

test('what the phone may send: position (rounded), up to 3 places, up to 4 departures in the next 36 hours', () => {
  const now = Date.parse('2026-10-30T18:30:00Z');
  const c = cleanTravel({ from: { lat: 37.33861234, lng: -121.88631 }, places: ['Movement Santa Clara', 'x', 'A', 'B', 'C D E', 'F G'], leaves: [null, '2026-10-30T21:00:00Z', '2026-10-30T10:00:00Z', 'soon', '2026-11-05T21:00:00Z'], dow: 5, name: 'Sam', calendar: ['secret'] }, now);
  assert.deepEqual(c, { from: { lat: 37.339, lng: -121.886 }, places: ['Movement Santa Clara', 'C D E', 'F G'], leaves: [null, '2026-10-30T21:00:00.000Z'], dow: 5 });
  assert.throws(() => cleanTravel({ from: { lat: 200, lng: 0 }, places: ['abc'] }), /starting/);
  assert.throws(() => cleanTravel({ from: { lat: 1, lng: 1 }, places: [] }), /which place/);
});

// A stand-in for Google: Places (New) Text Search and the Routes API route matrix.
function fakeGoogle(log) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    log.push({ url, body, key: init.headers['X-Goog-Api-Key'], mask: init.headers['X-Goog-FieldMask'] });
    if (url.includes('places:searchText')) {
      if (/nowhere/i.test(body.textQuery)) return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ places: [{ displayName: { text: 'Movement Santa Clara' }, formattedAddress: '801 Martin Ave, Santa Clara, CA 95050', location: { latitude: 37.37, longitude: -121.95 },
        currentOpeningHours: { openNow: true, weekdayDescriptions: ['Monday: 6:00 AM – 11:00 PM', 'Tuesday: 6:00 AM – 11:00 PM', 'Wednesday: 6:00 AM – 11:00 PM', 'Thursday: 6:00 AM – 11:00 PM', 'Friday: 6:00 AM – 10:00 PM', 'Saturday: 8:00 AM – 8:00 PM', 'Sunday: 8:00 AM – 8:00 PM'] } }] }), { status: 200 });
    }
    if (url.includes('computeRouteMatrix')) return new Response(JSON.stringify([{ originIndex: 0, destinationIndex: 0, duration: body.departureTime ? '1500s' : '1083s', distanceMeters: 12500, condition: 'ROUTE_EXISTS', status: {} }]), { status: 200 });
    return new Response('{}', { status: 404 });
  };
}

test('the connector asks Google for the place, its hours today and drive times with traffic — and returns only those', async () => {
  const log = [];
  const env = { GOOGLE_MAPS_KEY: 'k-test', __fetch: fakeGoogle(log) };
  const r = await travel(env, { from: { lat: 37.339, lng: -121.886 }, places: ['Movement Santa Clara', 'Nowhere Place'], leaves: [null, '2026-10-30T21:00:00.000Z'], dow: 5 });
  assert.deepEqual(r.places[0], { q: 'Movement Santa Clara', found: true, name: 'Movement Santa Clara', address: '801 Martin Ave, Santa Clara, CA 95050', openNow: true, hoursToday: '6:00 AM – 10:00 PM',
    drives: [{ leave: 'now', minutes: 18, miles: 7.8 }, { leave: '2026-10-30T21:00:00.000Z', minutes: 25, miles: 7.8 }] });
  assert.deepEqual(r.places[1], { q: 'Nowhere Place', found: false });
  const search = log.find((x) => x.url.includes('searchText')), matrix = log.filter((x) => x.url.includes('computeRouteMatrix'));
  assert.equal(search.key, 'k-test'); assert.match(search.mask, /currentOpeningHours/); assert.deepEqual(search.body.locationBias.circle.center, { latitude: 37.339, longitude: -121.886 });
  assert.equal(matrix.length, 2); assert.equal(matrix[0].body.routingPreference, 'TRAFFIC_AWARE'); assert.equal(matrix[0].body.departureTime, undefined); assert.equal(matrix[1].body.departureTime, '2026-10-30T21:00:00.000Z');
  assert.equal(matrix[0].body.destinations.length, 1, 'only places that were found');
  // → facts for Claude: local leave times, hours, minutes.
  const f = travelFacts(r);
  assert.equal(f.places[0].drives[0].leave, 'now'); assert.match(f.places[0].drives[1].leave, /^\d{2}:\d{2}$/); assert.equal(f.places[0].hoursToday, '6:00 AM – 10:00 PM');
  assert.deepEqual(f.places[1], { place: 'Nowhere Place', found: false });
  const ctx = dayContext({ today: '2026-10-30', now: '11:30', meId: 'sam', people, days: [{ date: '2026-10-30', items: [] }], travel: f });
  assert.equal(ctx.travel.places[0].place, 'Movement Santa Clara');
  assert.match(DAY_INSTRUCTIONS, /leave by/); assert.match(DAY_INSTRUCTIONS, /opening hours/);
});

test('the /travel route: signed in, needs the key, a daily limit, Google errors passed on plainly', async () => {
  const m = new Map(), log = [];
  const env = { DEMO: true, __fetch: fakeGoogle(log), HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  const ask = { from: { lat: 37.339, lng: -121.886 }, places: ['Movement Santa Clara'], leaves: [null], dow: 5 };
  assert.equal((await call('/travel', null, 'POST', ask)).status, 401);
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  assert.equal((await call('/travel', token, 'POST', ask)).status, 501, 'no key → not set up');
  env.GOOGLE_MAPS_KEY = 'k-test';
  const before = new Set(m.keys());
  const r = await call('/travel', token, 'POST', ask);
  assert.equal(r.status, 200); assert.equal(r.places[0].drives[0].minutes, 18);
  assert.ok([...m.keys()].filter((k) => !before.has(k)).every((k) => /^v2:rate:/.test(k)), 'nothing kept but the rate counter');
  assert.equal((await call('/travel', token, 'POST', { ...ask, places: [] })).status, 400);
  for (let i = 1; i < TRAVEL_PER_DAY; i++) await call('/travel', token, 'POST', ask);
  assert.equal((await call('/travel', token, 'POST', ask)).status, 429);
  env.__fetch = async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 });
  m.clear();
  const { token: t2 } = await call('/auth/demo', null, 'POST', { email: 'pat@example.com' });
  await call('/account/consent', t2, 'POST', { version: TERMS_VERSION, age13: true });
  const bad = await call('/travel', t2, 'POST', ask);
  assert.equal(bad.status, 502); assert.match(bad.error, /Google Maps: API key not valid/);
});
