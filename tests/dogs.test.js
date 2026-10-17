import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDogs, vaccineStatus, dogAlerts, ageText } from '../js/dogs.js';
import { cleanUrl, sourceOf, mergeAdopt } from '../js/adopt.js';

test('dog profiles merge across phones: newest edit wins, removals stick', () => {
  const dogs = mergeDogs([
    { person: 'sandman', dogs: { j: { name: 'Junior', breed: 'Lab', updatedAt: 5, createdAt: 1 }, b: { name: 'Bay', updatedAt: 9, createdAt: 2 } } },
    { person: 'amani', dogs: { j: { name: 'Junior', breed: 'Lab mix', updatedAt: 7, createdAt: 1 }, b: { name: 'Bay', deleted: true, updatedAt: 3, createdAt: 2 }, x: { name: 'Gone', deleted: true, updatedAt: 4 } } },
  ]);
  assert.deepEqual(dogs.map((d) => d.name), ['Junior', 'Bay']);
  assert.equal(dogs[0].breed, 'Lab mix');
});

test('both partners can edit the same dog: changes to different fields both survive', () => {
  const [dog] = mergeDogs([
    { person: 'sandman', dogs: { j: { name: 'Junior', food: { brand: 'Old' }, vaccines: [{ name: 'Rabies', due: '2027-10-30' }], times: { name: 1, food: 1, vaccines: 50 }, updatedAt: 50, by: 'sandman', docs: [{ id: 'a1', name: 'rabies.pdf' }] } } },
    { person: 'amani', dogs: { j: { name: 'Junior', food: { brand: 'Pro Plan' }, vaccines: [], times: { name: 1, food: 60, vaccines: 1 }, updatedAt: 60, by: 'amani', docs: [{ id: 'b2', name: 'dhpp.jpg', shared: true }], removedDocs: [] } } },
  ]);
  assert.equal(dog.food.brand, 'Pro Plan', "Amani's newer food edit");
  assert.equal(dog.vaccines[0].name, 'Rabies', "Sandman's newer vaccine edit");
  assert.deepEqual(dog.docs.map((d) => d.id), ['a1', 'b2'], 'documents from both phones');
  assert.equal(dog.editedBy, 'amani');
  const [after] = mergeDogs([
    { person: 'sandman', dogs: { j: { name: 'Junior', docs: [{ id: 'a1' }, { id: 'b2' }], updatedAt: 1 } } },
    { person: 'amani', dogs: { j: { name: 'Junior', docs: [{ id: 'b2' }], removedDocs: ['a1'], updatedAt: 2 } } },
  ]);
  assert.deepEqual(after.docs.map((d) => d.id), ['b2'], 'a removed document stays removed');
});

test('vaccine status and alerts', () => {
  const today = '2026-10-16';
  assert.equal(vaccineStatus({ due: '2027-03-01' }, today).level, 'ok');
  assert.deepEqual(vaccineStatus({ due: '2026-10-30' }, today), { level: 'soon', days: 14 });
  assert.deepEqual(vaccineStatus({ due: '2026-10-10' }, today), { level: 'overdue', days: -6 });
  assert.equal(vaccineStatus({}, today).level, 'unknown');
  const alerts = dogAlerts([{ name: 'Junior', vaccines: [{ name: 'Rabies', due: '2026-10-30' }, { name: 'DHPP', due: '2026-10-10' }], meds: [{ name: 'Apoquel', refill: '2026-10-19' }, { name: 'Heartgard', refill: '2026-12-01' }] }], today);
  assert.deepEqual(alerts.map((a) => a.text), ['DHPP overdue 6 days', 'Apoquel refill in 3 days', 'Rabies due in 14 days']);
  assert.equal(ageText('2024-04-16', today), '2 yr');
  assert.equal(ageText('2026-04-16', today), '6 mo');
});

test('adoption board: links are cleaned so both phones see one dog', () => {
  assert.equal(cleanUrl('Look at her! https://m.facebook.com/groups/123/posts/456/?mibextid=abc&fbclid=x'), 'https://www.facebook.com/groups/123/posts/456');
  assert.equal(cleanUrl('https://www.facebook.com/share/p/1AbC/?mibextid=WC7FNe'), 'https://www.facebook.com/share/p/1AbC');
  assert.equal(cleanUrl('https://www.petfinder.com/dog/biscuit-123/?referrer_id=9'), 'https://www.petfinder.com/dog/biscuit-123?referrer_id=9');
  assert.equal(cleanUrl('no link here'), '');
  assert.equal(sourceOf('https://www.facebook.com/share/p/1'), 'Facebook');
  assert.equal(sourceOf('https://sjshelter.org/dog/1'), 'sjshelter.org');
});

test('adoption board: edits from both phones merge, reactions are per person, past dogs sink', () => {
  const dogs = mergeAdopt([
    { person: 'sandman', dogs: {
      a: { url: 'u1', name: 'Biscuit', status: 'interested', addedAt: 10, addedBy: 'sandman', vote: 'love', times: { name: 10, status: 30 }, updatedAt: 30 },
      b: { name: 'Old', status: 'gone', addedAt: 50, addedBy: 'sandman', updatedAt: 50 },
      c: { name: 'Removed', deleted: true, addedAt: 5, updatedAt: 6 },
    } },
    { person: 'amani', dogs: {
      a: { url: 'u1', name: 'Biscuit', notes: 'Good with dogs', status: 'new', addedAt: 10, addedBy: 'sandman', vote: 'maybe', times: { name: 10, notes: 20, status: 10 }, updatedAt: 20 },
      d: { name: 'Pepper', addedAt: 40, addedBy: 'amani', updatedAt: 40 },
    } },
  ]);
  assert.deepEqual(dogs.map((d) => d.name), ['Pepper', 'Biscuit', 'Old']);
  const b = dogs[1];
  assert.equal(b.status, 'interested', "Sandman's newer status");
  assert.equal(b.notes, 'Good with dogs', "Amani's note");
  assert.deepEqual(b.votes, { sandman: 'love', amani: 'maybe' });
  assert.equal(dogs[0].status, 'new');
  assert.equal(dogs[0].addedBy, 'amani');
});
