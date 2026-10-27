// ❤️ The health meter: points per day, weekly rounds, month champions, the moments, and the card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPoints, weekOf, roundMonth, monthRounds, weekPoints, roundsOf, monthResult, currentRound, todayOpen, momentFor, meterHtml, perfectWeek, WEEK_MAX } from '../js/fight.js';

const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const week = (from) => [0, 1, 2, 3, 4, 5, 6].map((i) => shift(from, i));
// A person who weighs in and logs `meals` meals on each of the given days.
const person = (days, meals = 3, weigh = true) => ({
  weights: weigh ? days.map((date) => ({ date, weight: 170 })) : [],
  eaten: {},
  mealLog: Object.fromEntries(days.map((d) => [d, { meals: Object.fromEntries(['breakfast', 'lunch', 'dinner'].slice(0, meals).map((m) => [m, true])) }])),
});
const today = '2026-10-28'; // a Wednesday

test('points: +5 weigh-in, +3 a meal; a perfect week is 98', () => {
  assert.equal(dayPoints(person([today]), today), 14);
  assert.equal(dayPoints(person([today], 1), today), 8);
  assert.equal(dayPoints(person([today], 2, false), today), 6);
  assert.equal(weekPoints(person(week('2026-10-19')), '2026-10-19').pts, WEEK_MAX);
  assert.equal(WEEK_MAX, 98);
  // This week so far: only Monday to today count, so the meter starts empty each Monday.
  assert.equal(weekPoints(person([...week('2026-10-19'), '2026-10-26']), '2026-10-26', today).pts, 14);
});

test('rounds: Monday–Sunday weeks, counted for the month most of their days are in', () => {
  assert.deepEqual(weekOf(today), { from: '2026-10-26', to: '2026-11-01' });
  assert.equal(roundMonth('2026-10-26'), '2026-10', 'Oct 26 – Nov 1: Thursday is Oct 29');
  assert.equal(roundMonth('2026-09-28'), '2026-10', 'Sep 28 – Oct 4: Thursday is Oct 1');
  assert.deepEqual(monthRounds('2026-10'), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(monthRounds('2026-11'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  assert.deepEqual(currentRound(today), { from: '2026-10-26', month: '2026-10', n: 5, daysLeft: 5 });
  assert.equal(currentRound('2026-11-01').daysLeft, 1, 'Sunday is the last day');
});

test('a round is won on Sunday night; a tie gives both a ★', () => {
  const sam = person([...week('2026-10-05'), ...week('2026-10-12').slice(0, 3)]);
  const pat = person([...week('2026-10-05').slice(0, 4), ...week('2026-10-12').slice(0, 3), ...week('2026-10-19')]);
  const r = roundsOf(sam, pat, '2026-10', today);
  assert.deepEqual(r.map((x) => x.winner), [null, 'me', 'tie', 'rival', null]);
  assert.equal(r[0].winner, null, 'nobody checked in: no ★ for either');
  assert.equal(r[4].now, true);
  assert.equal(r[4].done, false);
  const m = monthResult(sam, pat, '2026-10', today);
  assert.deepEqual([m.meWins, m.rivalWins, m.over, m.champion], [2, 2, false, null], 'the tie gives a ★ each; the month isn\'t over');
});

test('the month champion: most rounds, then most points', () => {
  const after = '2026-11-03';
  const sam = person([...week('2026-10-05'), ...week('2026-10-12'), ...week('2026-10-19').slice(0, 2)]);
  const pat = person([...week('2026-10-19'), ...week('2026-10-26')]);
  const m = monthResult(sam, pat, '2026-10', after);
  assert.equal(m.over, true);
  assert.deepEqual([m.meWins, m.rivalWins], [2, 2]);
  assert.deepEqual([m.mePts, m.rivalPts], [224, 196]);
  assert.equal(m.champion, 'me', 'level on rounds: the most points wins');
  assert.equal(monthResult(pat, sam, '2026-10', after).champion, 'rival');
  const solo = monthResult(sam, null, '2026-10', after);
  assert.equal(solo.champion, null, 'no champion without a rival');
});

test('moments, once each: the champion, then the K.O., then ROUND n · FIGHT!', () => {
  const sam = person(week('2026-10-26')), pat = person(week('2026-10-26').slice(0, 3));
  const mon = '2026-11-02';
  const a = momentFor(sam, pat, mon, {});
  assert.deepEqual([a.kind, a.key, a.champion], ['champ', '2026-10', 'me']);
  const b = momentFor(sam, pat, mon, { champ: '2026-10' });
  assert.deepEqual([b.kind, b.key, b.n, b.me, b.rival, b.winner], ['ko', '2026-10-26', 5, 98, 42, 'me']);
  const c = momentFor(sam, pat, mon, { champ: '2026-10', ko: '2026-10-26' });
  assert.deepEqual([c.kind, c.n], ['fight', 1]);
  assert.equal(momentFor(sam, pat, mon, { champ: '2026-10', ko: '2026-10-26', fight: '2026-11-02' }), null);
  assert.equal(momentFor(sam, null, mon, {}).kind, 'fight', 'just you: only the round start');
});

test('today, perfect weeks, and the card', () => {
  assert.deepEqual(todayOpen(person([today], 1), today).map(([w]) => w), ['lunch', 'dinner']);
  const sam = person([...week('2026-10-19'), '2026-10-26', '2026-10-27']);
  assert.equal(perfectWeek(sam, today), '2026-10-19');
  assert.equal(perfectWeek(person(['2026-10-19']), today), null);
  const duo = meterHtml({ me: { name: 'You', face: '👱🏻‍♂️', kit: 'gi', data: sam }, rival: { name: 'Pat', face: '👩🏾‍🦱', data: person(['2026-10-26']) }, today, prize: 'date night' });
  assert.match(duo, /HEALTH METER: <b>ROUND 5<\/b>/);
  assert.match(duo, /aria-valuenow="28"/, 'two full days this week');
  assert.match(duo, /👱🏻‍♂️<i>🥋<\/i>/);
  assert.match(duo, /👩🏾‍🦱/);
  assert.match(duo, /R4<\/b>★ YOU/);
  assert.match(duo, /data-fighter/, 'you can change your fighter');
  assert.doesNotMatch(duo, /face off here/);
  const open = meterHtml({ me: { name: 'You', data: sam }, rival: { name: 'Pat', data: person([]) }, today, open: true, prize: 'date night' });
  assert.match(open, /How a round works/);
  assert.match(open, /October’s prize/);
  const solo = meterHtml({ me: { name: 'You', data: person([today], 1) }, rival: null, today });
  assert.match(solo, /face off here/);
  assert.match(solo, /waiting for a challenger/);
  assert.match(meterHtml({ me: { name: 'You', face: '<img>', data: person([]) }, rival: null, today }), /🧑/, 'only faces from the list');
  assert.doesNotMatch(meterHtml({ me: { name: 'You', data: person([]) }, rival: { name: '<b>x</b>', data: person([]) }, today }), /<b>x<\/b>/, 'names are escaped');
});
