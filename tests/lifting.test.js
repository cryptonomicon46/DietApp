import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYS, EXERCISES, setsFor, weeklySets, blockPosition, suggestLoad, slotOptions } from '../js/lifting.js';

test('every slot has a valid default and options for its muscle', () => {
  for (const day of Object.values(DAYS)) {
    for (const s of day.slots) {
      assert.ok(EXERCISES[s.default], s.default);
      assert.equal(EXERCISES[s.default].muscle, s.muscle);
      assert.ok(slotOptions(s).length >= 3, s.id);
    }
  }
});

test('volume: ~10 sets/muscle/week for big muscles, rising, then deload', () => {
  const w1 = weeklySets(1), w5 = weeklySets(5), w6 = weeklySets(6);
  for (const m of ['quads', 'chest']) {
    assert.ok(w1[m] >= 8, `${m} w1 ${w1[m]}`);
    assert.ok(w5[m] > w1[m]);
    assert.ok(w6[m] <= w1[m] / 2 + 2);
  }
  const s = DAYS.A.slots[0];
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((w) => setsFor(s, w, 0)), [3, 3, 4, 4, 4, 2]);
  const iso = DAYS.A.slots[4];
  assert.deepEqual([1, 3, 5, 6].map((w) => setsFor(iso, w, 4)), [2, 2, 3, 1]);
});

test('block position: 3 sessions per week, 6 weeks', () => {
  assert.deepEqual(blockPosition(0), { week: 1, day: 'A', done: false });
  assert.deepEqual(blockPosition(4), { week: 2, day: 'B', done: false });
  assert.deepEqual(blockPosition(17), { week: 6, day: 'C', done: false });
  assert.equal(blockPosition(18).done, true);
});

test('double progression load suggestions', () => {
  const slot = DAYS.A.slots[0]; // squat 4–6
  const hist = (sets, week = 2) => [{ week, entries: [{ exercise: 'backSquat', sets }] }];
  assert.equal(suggestLoad('backSquat', slot, [], 1).weight, null);
  assert.equal(suggestLoad('backSquat', slot, hist([{ w: 225, r: 6 }, { w: 225, r: 6 }, { w: 225, r: 6 }]), 3).weight, 235);
  assert.equal(suggestLoad('backSquat', slot, hist([{ w: 225, r: 6 }, { w: 225, r: 5 }, { w: 225, r: 4 }]), 3).weight, 225);
  assert.equal(suggestLoad('backSquat', slot, hist([{ w: 225, r: 6 }, { w: 225, r: 6 }, { w: 225, r: 6 }]), 6).weight, 190);
  const curl = DAYS.A.slots[5];
  assert.equal(suggestLoad('dbCurl', curl, [{ week: 1, entries: [{ exercise: 'dbCurl', sets: [{ w: 30, r: 12 }, { w: 30, r: 12 }] }] }], 2).weight, 35);
});

test('after a deload, loads go back to the last working weights', () => {
  const slot = DAYS.A.slots[0];
  const hist = [
    { week: 5, entries: [{ exercise: 'backSquat', sets: [{ w: 225, r: 5 }, { w: 225, r: 5 }] }] },
    { week: 6, entries: [{ exercise: 'backSquat', sets: [{ w: 190, r: 5 }] }] },
  ];
  const s = suggestLoad('backSquat', slot, hist, 1);
  assert.equal(s.weight, 225);
  assert.match(s.text, /pre-deload/);
  assert.equal(suggestLoad('backSquat', slot, hist, 6).weight, 190, 'deload again → 85% of 225');
});

test('extra sets carry through progression and deload', () => {
  const squat = DAYS.A.slots[0]; // 3 sets, first lift of the day
  assert.deepEqual([1, 3, 5, 6].map((w) => setsFor(squat, w, 0, 2)), [5, 6, 6, 3]);
  assert.equal(setsFor(squat, 1, 0, -5), 1, 'never below one set');
  assert.ok(weeklySets(1, { A1: 2 }).quads === weeklySets(1).quads + 2);
});

test('plate math', async () => {
  const { plateTotal, platesFor, platesText } = await import('../js/lifting.js');
  assert.equal(plateTotal(45, { 45: 1, 25: 1, 10: 1 }), 205);
  assert.equal(plateTotal(45, { 45: 2, 5: 1 }), 235);
  assert.equal(plateTotal(45, {}), 45);
  assert.equal(plateTotal(35, { 15: 2 }), 95);
  assert.deepEqual(platesFor(225), { 45: 2 });
  assert.deepEqual(platesFor(185), { 45: 1, 25: 1 });
  assert.deepEqual(platesFor(155), { 45: 1, 10: 1 });
  assert.equal(platesFor(47), null);
  assert.equal(platesText({ 45: 2, 10: 1 }), '2×45 + 10');
});

test('plate hints without 35s', async () => {
  const { platesFor, PLATES } = await import('../js/lifting.js');
  assert.deepEqual(platesFor(215, 45, PLATES.filter((p) => p !== 35)), { 45: 1, 25: 1, 15: 1 });
  assert.deepEqual(platesFor(200, 45, PLATES.filter((p) => p !== 35)), { 45: 1, 25: 1, 5: 1, 2.5: 1 });
});
