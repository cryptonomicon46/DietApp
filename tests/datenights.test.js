// ❤️ Date nights from the calendar (js/dateNights.js): a movie or dinner booked for both of you is a
// date night; one that might be is asked about once; your answer wins; the day after it's counted
// once; a scouted movie on the calendar is "booked".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/dateNights.js';

const movies = [{ id: 'mv1', kind: 'movie', title: 'Clayface' }, { id: 'mv2', kind: 'movie', title: 'It' }];
const theatres = ['AMC Mercado 20, Santa Clara', 'Century at Great Mall, Milpitas'];
const opts = { movies, theatres };
const ev = (o) => ({ date: '2026-11-06', time: '19:30', title: 'x', place: '', who: 'both', ...o });

test('what looks like a date: movies, restaurants, shows; never the dentist or a play date', () => {
  assert.equal(N.classify(ev({ title: 'Clayface', place: 'AMC Mercado 20' }), opts).kind, 'movie');
  assert.equal(N.classify(ev({ title: 'Clayface' }), opts).idea.id, 'mv1', 'a scouted title links to its idea');
  assert.equal(N.classify(ev({ title: 'Tickets', place: 'Century at Great Mall' }), opts).kind, 'movie');
  assert.equal(N.classify(ev({ title: 'Reservation at Adega (OpenTable)' }), opts).kind, 'food');
  assert.equal(N.classify(ev({ title: 'Jazz night', place: 'SJZ Break Room' }), opts).kind, 'show');
  assert.equal(N.classify(ev({ title: 'Anniversary' }), opts).kind, 'date');
  for (const t of ['Dentist', 'Play date with Kai', 'Team dinner', 'Kids movie at school', 'Due date: taxes']) assert.equal(N.classify(ev({ title: t }), opts).kind, null, t);
  assert.equal(N.classify(ev({ title: 'Iterate on the plan' }), opts).kind, null, 'a short title like "It" never matches inside words');
});

test('both of you → a date night; one of you, or just "date" → ask; your answer wins', () => {
  assert.equal(N.verdict(ev({ title: 'Clayface' }), {}, opts), 'yes');
  assert.equal(N.verdict(ev({ title: 'Clayface', who: 'm1' }), {}, opts), 'ask');
  assert.equal(N.verdict(ev({ title: 'Date' }), {}, opts), 'ask');
  assert.equal(N.verdict(ev({ title: 'Groceries' }), {}, opts), 'no');
  const x = ev({ title: 'Clayface', who: 'm1' });
  assert.equal(N.verdict(x, { [N.eventKey(x)]: 'yes' }, opts), 'yes');
  assert.equal(N.verdict(ev({ title: 'Clayface' }), { [N.eventKey(ev({ title: 'Clayface' }))]: 'no' }, opts), 'no');
  assert.equal(N.verdict(ev({ title: 'Groceries' }), { [N.eventKey(ev({ title: 'Groceries' }))]: 'yes' }, opts), 'yes', 'marked by hand');
});

test('coming up: the next three weeks, soonest first, no "no"s', () => {
  const items = [ev({ title: 'Dinner at Adega', date: '2026-11-14', time: '19:00' }), ev({ title: 'Clayface' }), ev({ title: 'Dentist', date: '2026-11-04' }),
    ev({ title: 'Clayface', date: '2026-10-30' }), ev({ title: 'Concert', date: '2026-12-30' })];
  const up = N.comingUp(items, { today: '2026-11-02', ...opts });
  assert.deepEqual(up.map((x) => [x.date, x.kind, x.icon]), [['2026-11-06', 'movie', '🎬'], ['2026-11-14', 'food', '🍽️']]);
});

test('counted once, the day after; Undo ("undone") keeps it from counting again', () => {
  const items = [ev({ title: 'Clayface', date: '2026-11-06' }), ev({ title: 'Dinner at Adega', date: '2026-10-20' })];
  const due = N.toCount(items, { today: '2026-11-07', ...opts });
  assert.deepEqual(due.map((x) => x.title), ['Clayface'], 'only the last few days');
  assert.deepEqual(N.toCount(items, { today: '2026-11-06', ...opts }), [], 'not before it has happened');
  assert.deepEqual(N.toCount(items, { today: '2026-11-07', counted: { [due[0].key]: 'undone' }, ...opts }), []);
  const e = N.entryFor({ ...due[0], title: '🎬 Clayface', place: 'AMC Mercado 20' }, 1000);
  assert.deepEqual([e.kind, e.date, e.what, e.place, e.cal], ['date', '2026-11-06', 'Clayface', 'AMC Mercado 20', due[0].key]);
});

test('a scouted movie on the calendar is booked', () => {
  assert.deepEqual(N.bookedIdeas([ev({ title: 'Clayface' }), ev({ title: 'Dinner' })], opts), { mv1: '2026-11-06' });
});
