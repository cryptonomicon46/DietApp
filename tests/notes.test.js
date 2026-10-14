import test from 'node:test';
import assert from 'node:assert/strict';
import { noteStreak } from '../js/notes.js';

test('note streak counts consecutive days ending today or yesterday', () => {
  const n = (date) => ({ date });
  assert.equal(noteStreak([], '2026-10-14'), 0);
  assert.equal(noteStreak([n('2026-10-14'), n('2026-10-13'), n('2026-10-12'), n('2026-10-10')], '2026-10-14'), 3);
  assert.equal(noteStreak([n('2026-10-13'), n('2026-10-12')], '2026-10-14'), 2, 'not written yet today keeps the streak');
  assert.equal(noteStreak([n('2026-10-11')], '2026-10-14'), 0);
});

test('plan days and upcoming', async () => {
  const { planDay, isUpcoming, whenText } = await import('../js/plans.js');
  const made = '2026-10-14'; // a Wednesday
  assert.equal(planDay({ date: made, when: 'tonight' }), made);
  assert.equal(planDay({ date: made, when: 'tomorrow' }), '2026-10-15');
  assert.equal(planDay({ date: made, when: 'weekend' }), '2026-10-17');
  assert.equal(planDay({ date: made, when: 'date', day: '2026-10-20' }), '2026-10-20');
  assert.ok(isUpcoming({ date: made, when: 'weekend' }, '2026-10-18'), 'weekend plans last through Sunday');
  assert.ok(!isUpcoming({ date: made, when: 'tonight' }, '2026-10-15'));
  assert.ok(!isUpcoming({ date: made, when: 'tonight', done: true }, made));
  assert.match(whenText({ date: made, when: 'tonight', time: '19:30' }, made), /^Tonight at 7:30/);
});

test('board starts fresh at 5 AM', async () => {
  const { boardStart } = await import('../js/notes.js');
  const at = (h, m = 0) => new Date(2026, 9, 14, h, m);
  assert.equal(boardStart(at(8)), new Date(2026, 9, 14, 5).getTime());
  assert.equal(boardStart(at(23, 30)), new Date(2026, 9, 14, 5).getTime());
  assert.equal(boardStart(at(2)), new Date(2026, 9, 13, 5).getTime(), 'a 2 AM note still belongs to last night');
});
