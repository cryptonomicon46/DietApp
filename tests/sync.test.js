import test from 'node:test';
import assert from 'node:assert/strict';

// sync.js touches localStorage when loaded; give it a stub before importing.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { householdCode, newHouseholdCode } = await import('../js/sync.js');

test('the same phrase typed any way gives the same household code', () => {
  const want = 'thenallanisatsomestreet';
  for (const typed of ['The Nallanis at Some Street', 'the-nallanis-at-some-street', 'thenallanisatsomestreet', '  THE nallanis  at some_street ']) {
    assert.equal(householdCode(typed), want, typed);
  }
  assert.equal(householdCode('nallanis'), 'householdnallanis');
  assert.equal(householdCode('household-nallanis'), 'householdnallanis', 'old short-phrase form matches');
  assert.equal(householdCode('householdnallanis'), 'householdnallanis', 'stable when entered again');
  assert.equal(householdCode('9BZX-femy-btmk'), '9bzxfemybtmk');
  assert.equal(householdCode('abc'), null);
  for (let i = 0; i < 20; i++) assert.match(householdCode(newHouseholdCode()), /^[a-z0-9]{12,64}$/);
});
