import test from 'node:test';
import assert from 'node:assert/strict';
import { asphaltF, pawRisk, scoreHour, bestWindow, dogWalks, hottestPavement, parseWeather, classesOn } from '../js/brief.js';

// A sunny October day in San Jose: 50°F at dawn, 84°F mid-afternoon, wind picking up after noon.
function day() {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const temp = 52 + 32 * Math.max(0, Math.sin(((h - 7) / 14) * Math.PI));
    const sun = h >= 7 && h < 19 ? 900 * Math.sin(((h - 7) / 12) * Math.PI) : 0;
    hours.push({ time: new Date(2026, 9, 15, h), temp, feels: temp, rain: 0, wind: h >= 13 ? 14 : 4, gust: h >= 13 ? 22 : 8, uv: sun / 110, radiation: sun, isDay: h >= 7 && h < 19, aqi: 35 });
  }
  return hours;
}

test('pavement runs far hotter than the air in sun', () => {
  assert.ok(Math.abs(asphaltF(77, 900, 3) - 125) <= 4, `77°F + full sun ≈ 125°F, got ${asphaltF(77, 900, 3)}`);
  assert.equal(asphaltF(60, 0, 5), 60, 'no sun, no extra heat');
  assert.equal(pawRisk(130).level, 'unsafe');
  assert.equal(pawRisk(118).level, 'caution');
  assert.equal(pawRisk(95).level, 'ok');
});

test('best windows land where you would expect', () => {
  const h = day();
  const run = bestWindow(h, 'run', 1, 5, 22);
  assert.ok(h[run.start].time.getHours() >= 7 && h[run.start].time.getHours() <= 9, `run in the cool morning, got ${h[run.start].time.getHours()}:00`);
  const bike = bestWindow(h, 'bike', 3, 5, 22);
  const bh = h[bike.start].time.getHours();
  assert.ok(bh >= 7 && bh <= 10, `ride in daylight before the afternoon wind, got ${bh}:00`);
  const walks = dogWalks(h, 0);
  assert.ok(h[walks.morning.index].time.getHours() <= 9);
  assert.ok(h[walks.evening.index].time.getHours() >= 16, 'evening walk once the pavement cools');
  assert.ok(asphaltF(h[walks.evening.index].temp, h[walks.evening.index].radiation, h[walks.evening.index].wind) < 115);
  const hot = hottestPavement(h, 0);
  assert.ok(hot.asphalt >= 125, 'afternoon pavement is unsafe for paws');
  assert.equal(scoreHour({ ...h[3] }, 'run').score, 0, '3 AM is not an option');
  assert.ok(scoreHour({ ...h[8], rain: 90 }, 'run').why.some((w) => /rain/.test(w)));
});

test('parses Open-Meteo responses, with or without radiation and air quality', () => {
  const forecast = { hourly: { time: ['2026-10-15T08:00', '2026-10-15T09:00'], temperature_2m: [55, 58], apparent_temperature: [54, 57], precipitation_probability: [0, 10], wind_speed_10m: [3, 5], uv_index: [1, 2], is_day: [1, 1], cloud_cover: [0, 50] } };
  const air = { hourly: { time: ['2026-10-15T08:00'], us_aqi: [42] } };
  const h = parseWeather(forecast, air);
  assert.equal(h.length, 2);
  assert.equal(h[0].aqi, 42);
  assert.equal(h[1].aqi, null);
  assert.equal(h[0].radiation, 700, 'radiation estimated from daylight when missing');
  assert.equal(h[1].radiation, 350, 'and from cloud cover');
});

test('your classes on a given day', () => {
  const classes = [{ id: 'a', gym: 'santaClara', type: 'yoga', name: 'Power Flow', time: '12:00', days: [1, 3] }, { id: 'b', gym: 'sunnyvale', type: 'fitness', name: 'Core Fit', time: '07:00', days: [3] }];
  const wed = new Date(2026, 9, 14);
  assert.deepEqual(classesOn(classes, wed).map((c) => c.name), ['Core Fit', 'Power Flow']);
  assert.equal(classesOn(classes, new Date(2026, 9, 15)).length, 0);
});

test('feeding slots follow Pacific time and reset at 4 PM and 4 AM', async () => {
  const { feedingSlot, whoFed } = await import('../js/brief.js');
  // October = PDT (UTC−7). 7 AM PT = 14:00 UTC.
  const at = (utc) => feedingSlot(new Date(utc));
  assert.deepEqual([at('2026-10-15T14:00:00Z').key, at('2026-10-15T14:00:00Z').meal], ['2026-10-15:breakfast', 'breakfast']);
  assert.equal(at('2026-10-15T22:59:00Z').meal, 'breakfast', '3:59 PM PT');
  assert.equal(at('2026-10-15T23:00:00Z').key, '2026-10-15:dinner', '4 PM PT resets for dinner');
  assert.equal(at('2026-10-16T09:30:00Z').key, '2026-10-15:dinner', '2:30 AM PT is still last night');
  assert.equal(at('2026-10-16T11:00:00Z').key, '2026-10-16:breakfast', '4 AM PT resets for breakfast');
  const recs = [{ person: 'sandman', name: 'Sandman', fed: { '2026-10-15:breakfast': { at: 200 } } }, { person: 'amani', name: 'Amani', fed: { '2026-10-15:breakfast': { at: 100 } } }];
  assert.equal(whoFed(recs, '2026-10-15:breakfast').name, 'Amani', 'first one counts');
  assert.equal(whoFed(recs, '2026-10-15:dinner'), null);
});

test('one walk a day, from 4 AM to 4 AM Pacific', async () => {
  const { walkDay } = await import('../js/brief.js');
  assert.equal(walkDay(new Date('2026-10-15T14:00:00Z')), '2026-10-15', '7 AM PT');
  assert.equal(walkDay(new Date('2026-10-16T04:00:00Z')), '2026-10-15', '9 PM PT');
  assert.equal(walkDay(new Date('2026-10-16T09:30:00Z')), '2026-10-15', '2:30 AM PT is still yesterday');
  assert.equal(walkDay(new Date('2026-10-16T11:00:00Z')), '2026-10-16', '4 AM PT starts a new day');
});
