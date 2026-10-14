import test from 'node:test';
import assert from 'node:assert/strict';

// sync.js touches localStorage only when called; give it a stub before importing.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
const { householdCode } = await import('../js/sync.js');

test('typed codes and phrases become the same household code on both phones', () => {
  assert.equal(householdCode('nallanis'), 'household-nallanis');
  assert.equal(householdCode('  Nallanis '), 'household-nallanis');
  assert.equal(householdCode('The Nallanis at Some Street'), 'the-nallanis-at-some-street');
  assert.equal(householdCode('9BZX-femy-btmk'), '9bzx-femy-btmk');
  assert.equal(householdCode('household-nallanis'), 'household-nallanis', 'entering the shown code again is stable');
  assert.equal(householdCode('abc'), null);
  assert.ok(/^[a-z0-9-]{12,64}$/.test(householdCode('nallanis')), 'meets the connector rule');
});
