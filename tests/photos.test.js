import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCompare } from '../js/photos.js';

test('progress photos: first, middle and latest of the most common pose, or the starred ones', () => {
  const ph = (id, date, pose = 'front', star = false) => ({ id, date, pose, star, at: 0 });
  const list = [ph('a', '2026-09-01'), ph('b', '2026-09-08'), ph('s', '2026-09-08', 'side'), ph('c', '2026-09-15'), ph('d', '2026-09-22'), ph('e', '2026-09-29')];
  assert.deepEqual(pickCompare(list).map((p) => p.id), ['a', 'c', 'e']);
  assert.deepEqual(pickCompare(list, '2026-09-10').map((p) => p.id), ['c', 'd', 'e'], 'within the program');
  assert.deepEqual(pickCompare(list, '', '9999', 'side').map((p) => p.id), ['s']);
  const starred = list.map((p) => (p.id === 'b' || p.id === 'd' ? { ...p, star: true } : p));
  assert.deepEqual(pickCompare(starred).map((p) => p.id), ['b', 'd']);
});
