import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { rhythmStatus, nextNudge, mergeRhythm, weekOf, weekendOf, loveLine } = await import('../js/rhythm.js');

test('2-2-2-2: weeks run Monday–Sunday; the coming weekend is the next Saturday', () => {
  assert.deepEqual(weekOf('2026-10-15'), { from: '2026-10-12', to: '2026-10-18' }); // Thursday
  assert.deepEqual(weekOf('2026-10-18'), { from: '2026-10-12', to: '2026-10-18' }); // Sunday
  assert.deepEqual(weekendOf('2026-10-15'), { sat: '2026-10-17', sun: '2026-10-18' });
  assert.deepEqual(weekendOf('2026-10-18'), { sat: '2026-10-24', sun: '2026-10-25' }, 'Sunday looks ahead');
  assert.deepEqual(weekendOf('2026-10-17'), { sat: '2026-10-17', sun: '2026-10-18' });
});

test('2-2-2-2: both phones combine, removals stick', () => {
  const all = mergeRhythm([
    { person: 'sandman', rhythm: { entries: [{ id: 'a', kind: 'date', date: '2026-10-03' }, { id: 'b', kind: 'close', date: '2026-10-13' }] } },
    { person: 'amani', rhythm: { entries: [{ id: 'c', kind: 'close', date: '2026-10-14' }], removed: ['b'] } },
  ]);
  assert.deepEqual(all.map((e) => e.id), ['a', 'c']);
  assert.equal(all[1].by, 'amani');
});

test('2-2-2-2: date every 2 weeks, intimacy twice a week, trips by the calendar', () => {
  const entries = [
    { id: '1', kind: 'date', date: '2026-10-03' },
    { id: '2', kind: 'close', date: '2026-10-13' },
    { id: '3', kind: 'getaway', date: '2025-06-01' },
    { id: '4', kind: 'overnight', date: '2026-03-14' },
  ];
  const st = rhythmStatus(entries, '2026-10-15'); // a Thursday
  assert.equal(st.date.due, '2026-10-17');
  assert.equal(st.date.level, 'soon', 'due this weekend');
  assert.deepEqual([st.close.count, st.close.left, st.close.level], [1, 1, 'soon']);
  assert.equal(st.overnight.last, '2026-03-14');
  assert.equal(st.overnight.due, '2026-09-12');
  assert.equal(st.overnight.level, 'due');
  assert.equal(st.overnight.thisYear, 1);
  assert.equal(st.getaway.due, '2027-06-01');
  assert.equal(st.getaway.level, 'ok');
  assert.equal(nextNudge(st).kind, 'overnight', 'overdue comes before coming up');
  // Early in the week a missing second time isn't a nudge yet.
  assert.equal(rhythmStatus(entries, '2026-10-13').close.level, 'ok');
  assert.equal(rhythmStatus([...entries, { id: '5', kind: 'close', date: '2026-10-15' }], '2026-10-15').close.level, 'ok');
  // Nothing logged: gently start with a date.
  const fresh = rhythmStatus([], '2026-10-15');
  assert.equal(nextNudge(fresh).kind, 'date');
  assert.deepEqual([fresh.overnight.level, fresh.getaway.level], ['soon', 'soon']);
  assert.ok(loveLine('date', '2026-10-15').length > 10);
});

test('2-2-2-2: a date reads as its kind and place', async () => {
  const { momentText } = await import('../js/rhythm.js');
  assert.equal(momentText({ kind: 'date', type: 'books', place: "Kepler's Books" }), "Bookshop · Kepler's Books");
  assert.equal(momentText({ kind: 'date' }), 'Date night');
  assert.equal(momentText({ kind: 'overnight' }), 'Overnight trip');
});
