import test from 'node:test';
import assert from 'node:assert/strict';
import { words, matchWanted } from '../js/marketMatch.js';

test('words: lowercased, plurals folded, filler dropped', () => {
  assert.deepEqual(words('Looking for TENTS, a kids bike!'), ['tent', 'kid', 'bike']);
});

test('your open wanted listings light up matching listings from others', () => {
  const items = [
    { id: 'w1', mine: true, kind: 'wanted', status: 'open', d: { title: 'Camping tent', body: 'for 4 people' } },
    { id: 'w2', mine: true, kind: 'wanted', status: 'done', d: { title: 'Stroller' } },
    { id: 'a', mine: false, kind: 'lend', status: 'open', d: { title: '4-person tents', body: '' } },
    { id: 'b', mine: false, kind: 'sale', status: 'open', d: { title: 'Stroller, barely used' } },
    { id: 'c', mine: false, kind: 'sale', status: 'done', d: { title: 'Tent' } },
    { id: 'd', mine: false, kind: 'wanted', status: 'open', d: { title: 'Tent' } },
    { id: 'e', mine: true, kind: 'sale', status: 'open', d: { title: 'Tent' } },
  ];
  assert.deepEqual(matchWanted(items), { a: 'Camping tent' });
});
