// ⚔️ The check-in fight: points per day, 7-day health, weekly rounds, and the card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPoints, health, rounds, weekOf, todayOpen, fighter, fightHtml, perfectWeek } from '../js/fight.js';

const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// A person who weighs in and logs `meals` meals on each of the given days.
const person = (days, meals = 3, weigh = true) => ({
  weights: weigh ? days.map((date) => ({ date, weight: 170 })) : [],
  eaten: {},
  mealLog: Object.fromEntries(days.map((d) => [d, { meals: Object.fromEntries(['breakfast', 'lunch', 'dinner'].slice(0, meals).map((m) => [m, true])) }])),
});
const today = '2026-10-28'; // a Wednesday
const last7 = [0, 1, 2, 3, 4, 5, 6].map((i) => shift(today, -i));

test('points: +5 weigh-in, +3 a meal; health is the last 7 days out of 100', () => {
  assert.equal(dayPoints(person([today]), today), 14);
  assert.equal(dayPoints(person([today], 1), today), 8);
  assert.equal(dayPoints(person([today], 2, false), today), 6);
  assert.equal(health(person(last7), today), 100);
  assert.equal(health(person(last7.slice(0, 3)), today), 43);
  assert.equal(health(person([]), today), 0);
  assert.equal(fighter(person([]), today).danger, true);
});

test('the drain shows what was just lost; the combo counts full days in a row', () => {
  const p = person([...last7.slice(1), shift(today, -7)]); // full every day but today
  const f = fighter(p, today);
  assert.ok(f.drain > f.hp, 'yesterday\'s window was fuller');
  assert.equal(f.combo, 7, 'today is still open, so the streak counts from yesterday');
});

test('weeks run Monday to Sunday; finished rounds have a winner', () => {
  assert.deepEqual(weekOf(today), { from: '2026-10-26', to: '2026-11-01' });
  const lastWeek = [0, 1, 2, 3, 4, 5, 6].map((i) => shift('2026-10-19', i));
  const sam = person([...lastWeek, today]), pat = person(lastWeek.slice(0, 4));
  const r = rounds(sam, pat, today);
  assert.equal(r[0].done, false, 'this week is still going');
  assert.equal(r[0].winner, null);
  assert.equal(r[1].from, '2026-10-19');
  assert.equal(r[1].winner, 'me');
  assert.equal(r[1].me.strong, 7);
  assert.equal(perfectWeek(sam, today), '2026-10-19');
  assert.equal(perfectWeek(pat, today), null);
});

test('today\'s open items, and the card: head-to-head, or just you', () => {
  assert.deepEqual(todayOpen(person([today], 1), today).map(([w]) => w), ['lunch', 'dinner']);
  const duo = fightHtml({ me: { name: 'Sam', data: person(last7) }, rival: { name: 'Pat', data: person([today]) }, today });
  assert.match(duo, /WEEK<br>4/);
  assert.match(duo, /aria-valuenow="100"/);
  assert.match(duo, /7-DAY COMBO/);
  assert.doesNotMatch(duo, /face off here/);
  const solo = fightHtml({ me: { name: 'Sam', data: person([today], 1) }, rival: null, today, open: true });
  assert.match(solo, /face off here/);
  assert.match(solo, /fg-days/);
  assert.match(solo, /What fills your bar/);
  assert.doesNotMatch(solo, /Rounds/, 'rounds need a rival');
  assert.doesNotMatch(fightHtml({ me: { name: '<b>x</b>', data: person([]) }, rival: null, today }), /<b>x<\/b>/, 'names are escaped');
});
