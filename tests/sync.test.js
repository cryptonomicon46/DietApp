import test from 'node:test';
import assert from 'node:assert/strict';

// sync.js touches localStorage when loaded; give it a stub before importing.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { householdCode, newHouseholdCode } = await import('../js/sync.js');

test('the same phrase typed any way gives the same household code', () => {
  const want = 'purplekitesoverthebay';
  for (const typed of ['Purple Kites Over The Bay', 'purple-kites-over-the-bay', 'purplekitesoverthebay', '  PURPLE kites  over_the bay ']) {
    assert.equal(householdCode(typed), want, typed);
  }
  assert.equal(householdCode('bluekites'), 'householdbluekites');
  assert.equal(householdCode('household-bluekites'), 'householdbluekites', 'old short-phrase form matches');
  assert.equal(householdCode('householdbluekites'), 'householdbluekites', 'stable when entered again');
  assert.equal(householdCode('9BZX-femy-btmk'), '9bzxfemybtmk');
  assert.equal(householdCode('abc'), null);
  for (let i = 0; i < 20; i++) assert.match(householdCode(newHouseholdCode()), /^[a-z0-9]{12,64}$/);
});
