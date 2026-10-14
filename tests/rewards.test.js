import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDay, tally } from '../js/rewards.js';

const day = (eaten, burned, protein = 150) => ({ eaten, burned, target: 1650, plannedDeficit: 550, protein, proteinTarget: 156, floor: 1500 });

test('daily scoring', () => {
  assert.equal(scoreDay(null).status, 'unlogged');
  assert.equal(scoreDay(day(0, 2200)).coins, 0);
  const good = scoreDay(day(1700, 2250));
  assert.deepEqual([good.status, good.coins, good.cookies, good.deficit], ['deficit', 15, 1, 550]);
  const big = scoreDay(day(1100, 2300, 100));
  assert.deepEqual([big.status, big.coins, big.cookies], ['too-big', 10, 0]);
  const over = scoreDay(day(2500, 2200));
  assert.deepEqual([over.status, over.coins], ['surplus', 0]);
});

test('streaks and milestones', () => {
  const days = {};
  for (let i = 1; i <= 7; i++) days[`2026-10-0${i}`] = day(1700, 2250);
  days['2026-10-08'] = day(2600, 2200);
  days['2026-10-09'] = day(1700, 2250);
  const t = tally(days, '2026-10-09');
  assert.equal(t.streak, 1);
  assert.equal(t.best, 7);
  assert.deepEqual(t.badges.map((b) => b.days), [3, 7]);
  assert.equal(t.coins, 8 * 15 + 15 + 40);
  assert.equal(t.cookies, 9);
  // Today not yet in deficit: streak counts through yesterday.
  const t2 = tally({ ...days, '2026-10-10': day(2400, 2200) }, '2026-10-10');
  assert.equal(t2.streak, 1, 'streak stays alive until today is over');
  const t3 = tally(Object.fromEntries(Object.entries(days).slice(0, 7)), '2026-10-08');
  assert.equal(t3.streak, 7);
  assert.equal(t3.next.days, 14);
});

test('incomplete logging earns nothing; at goal, holding steady earns coins', () => {
  const partial = scoreDay({ eaten: 500, burned: 2300, target: 1650, plannedDeficit: 550, protein: 40, proteinTarget: 156, floor: 1500, meals: 1 });
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.coins, 0);
  const allMeals = scoreDay({ eaten: 1000, burned: 2300, target: 1650, plannedDeficit: 550, protein: 140, proteinTarget: 156, floor: 1500, meals: 3 });
  assert.equal(allMeals.status, 'too-big');
  const steady = scoreDay({ eaten: 2050, burned: 2150, target: 2100, plannedDeficit: 0, protein: 140, proteinTarget: 132, floor: 1200, meals: 3 });
  assert.deepEqual([steady.status, steady.coins], ['maintained', 15]);
  const overAtGoal = scoreDay({ eaten: 2600, burned: 2150, target: 2100, plannedDeficit: 0, protein: 140, proteinTarget: 132, floor: 1200, meals: 3 });
  assert.equal(overAtGoal.coins, 0);
});
