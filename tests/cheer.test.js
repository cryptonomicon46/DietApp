import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { healthDay, strongStreak, cheerFor } = await import('../js/cheer.js');

test('💪 day: weigh-in plus breakfast, lunch and dinner logged; streak runs back from today', () => {
  const meals = { breakfast: {}, lunch: {}, dinner: {} };
  const data = {
    weights: [{ date: '2026-10-17' }, { date: '2026-10-18' }, { date: '2026-10-19' }],
    mealLog: { '2026-10-17': { meals }, '2026-10-18': { meals } },
    eaten: { date: '2026-10-19', meals: { breakfast: {} } },
  };
  assert.equal(healthDay(data, '2026-10-18').strong, true);
  assert.deepEqual(healthDay(data, '2026-10-19'), { weighed: true, meals: ['breakfast'], strong: false });
  assert.equal(strongStreak(data, '2026-10-19'), 2, 'today still open');
  assert.match(cheerFor({ strong: false }, '2026-10-19', 'weigh'), /./);
  assert.match(cheerFor({ strong: true }, '2026-10-19', 'dinner'), /^💪/);
  assert.equal(cheerFor({ strong: false }, '2026-10-19'), '');
});

test('a lower weigh-in gets a short congratulations', async () => {
  const { lowerCheer } = await import('../js/cheer.js');
  assert.match(lowerCheer(0.6, false, '2026-10-19'), /^📉 −0\.6 lb — you're on the right track\. \S/);
  assert.match(lowerCheer(1.2, true, '2026-10-19'), /^🎉 New low −1\.2 lb/);
  assert.equal(lowerCheer(0, false, '2026-10-19'), '');
});
