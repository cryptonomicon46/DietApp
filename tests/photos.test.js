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

test('photos for a shared summary: the period, else the program, flagged as outside', async () => {
  const { photosFor } = await import('../js/photos.js');
  const ph = (date, pose = 'front') => ({ id: date, date, pose, at: 0 });
  const all = [ph('2026-07-01'), ph('2026-08-01'), ph('2026-09-01'), ph('2026-10-13'), ph('2026-10-16')];
  const week = photosFor(all, '2026-10-12', '2026-10-18', '2026-07-01');
  assert.deepEqual(week.list.map((p) => p.date), ['2026-10-13', '2026-10-16']);
  assert.equal(week.outside, false);
  const day = photosFor(all, '2026-10-16', '2026-10-16', '2026-07-01');
  assert.deepEqual(day.list.map((p) => p.date), ['2026-07-01', '2026-09-01', '2026-10-16']);
  assert.equal(day.outside, true);
  assert.deepEqual(photosFor([], '2026-10-01', '2026-10-18').list, []);
});
