import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPlace, whereOn, dressFor, warmthLevel, PLACES } from '../js/dress.js';

const day = (temps, extra = {}) => temps.map((f, i) => ({ time: new Date(2026, 9, 20, 6 + i), temp: f, feels: f, rain: 0, wind: 5, uv: 3, ...extra }));

test('place names in calendar text, whole words only', () => {
  assert.equal(matchPlace('Office — SF')?.id, 'sf');
  assert.equal(matchPlace('Team offsite, 1 Market St, San Francisco, CA')?.id, 'sf');
  assert.equal(matchPlace('Oakland office')?.id, 'oak');
  assert.equal(matchPlace('Bank transfer'), null);
  assert.equal(matchPlace('Lunch, 500 Market St, Oakland')?.id, 'oak');
  assert.equal(matchPlace('Dentist'), null);
  const mine = [...PLACES, { id: 'pa', name: 'Palo Alto, CA', lat: 37.44, lon: -122.14 }];
  assert.equal(matchPlace('Lunch in Palo Alto', mine)?.id, 'pa');
});

test('where each of you is: your own events, else home in San Jose; a pick wins', () => {
  const ev = [
    { title: 'Office', place: '415 Mission St, San Francisco', who: 'amani', start: '09:30', end: '17:00', date: '2026-10-20' },
    { title: 'Standup', who: 'sandman', start: '10:00', end: '10:30', date: '2026-10-20' },
  ];
  const a = whereOn(ev, 'amani');
  assert.equal(a.place.id, 'sf'); assert.equal(a.leave, 9); assert.equal(a.back, 18); assert.ok(a.fromCalendar);
  const s = whereOn(ev, 'sandman');
  assert.equal(s.place.id, 'sj'); assert.equal(s.fromCalendar, false);
  assert.equal(whereOn([], 'sandman').leave, 8);
  assert.equal(whereOn(ev, 'sandman', PLACES, 'oak').place.id, 'oak');
});

test('cold morning, warm midday, cold evening → layers with off / on times', () => {
  //            6  7  8  9 10 11 12  1  2  3  4  5  6  7
  const d = dressFor(day([44, 46, 49, 55, 62, 68, 72, 75, 76, 74, 69, 62, 55, 50]), 8, 18);
  assert.equal(d.shape, 'swing');
  assert.deepEqual(d.temps.leave, { hour: 8, f: 49 });
  assert.equal(d.temps.peak.f, 76);
  assert.ok(d.layers.some((l) => /sweater|fleece/i.test(l.text)));
  assert.ok(d.layers.some((l) => l.icon === '🧥'));
  assert.equal(d.when, 'Jacket off around 10 AM, back on by 6 PM; sweater off around 11 AM, back on by 5 PM.');
  assert.match(d.summary, /^T-shirt \+ warm sweater \+ warm but packable jacket · jacket off around 10 AM/);
});

test('hot all day, cold all day, and rain', () => {
  const hot = dressFor(day(Array(14).fill(84), { uv: 8 }));
  assert.equal(hot.shape, 'hot');
  assert.equal(hot.layers.length, 1);
  assert.ok(hot.extras.some((x) => x.includes('Sunglasses')));
  const cold = dressFor(day(Array(14).fill(42)));
  assert.equal(cold.shape, 'cold');
  assert.ok(cold.layers.some((l) => /coat/i.test(l.text)));
  const wet = dressFor(day(Array(14).fill(64), { rain: 70 }));
  assert.ok(wet.layers.some((l) => /rain jacket/i.test(l.text)));
  assert.ok(wet.extras.some((x) => x.startsWith('☔')));
  assert.equal(warmthLevel(59), 3);
});

test('a town from any address, and an event in a town we don\'t know still counts', async () => {
  const { townOf, whereOn, PLACES } = await import('../js/dress.js');
  assert.equal(townOf('31655 Chicoine Ave., Hayward CA, United States'), 'Hayward');
  assert.equal(townOf('123 Main St, Hayward, CA 94544'), 'Hayward');
  assert.equal(townOf('Bridgeway, Sausalito, CA'), 'Sausalito');
  assert.equal(townOf('Dinner'), '');
  assert.equal(townOf('Zoom'), '');
  const ev = [{ title: 'Early Friendsgiving', place: '31655 Chicoine Ave., Hayward CA, United States', start: '14:00', end: '', allDay: false, who: 'a' }];
  const unknown = whereOn(ev, 'a');
  assert.deepEqual([unknown.fromCalendar, unknown.placeFound, unknown.place.id], [true, false, 'sj'], 'the event, with home weather');
  const hayward = { id: 'g-hayward', name: 'Hayward', lat: 37.67, lon: -122.08, keys: ['hayward'] };
  const known = whereOn(ev, 'a', [...PLACES, hayward]);
  assert.deepEqual([known.fromCalendar, known.placeFound, known.place.id, known.event.title], [true, true, 'g-hayward', 'Early Friendsgiving']);
});
