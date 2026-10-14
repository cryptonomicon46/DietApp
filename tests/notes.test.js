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
