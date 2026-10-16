import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDogs, vaccineStatus, dogAlerts, ageText } from '../js/dogs.js';

test('dog profiles merge across phones: newest edit wins, removals stick', () => {
  const dogs = mergeDogs([
    { person: 'sandman', dogs: { j: { name: 'Junior', breed: 'Lab', updatedAt: 5, createdAt: 1 }, b: { name: 'Bay', updatedAt: 9, createdAt: 2 } } },
    { person: 'amani', dogs: { j: { name: 'Junior', breed: 'Lab mix', updatedAt: 7, createdAt: 1 }, b: { name: 'Bay', deleted: true, updatedAt: 3, createdAt: 2 }, x: { name: 'Gone', deleted: true, updatedAt: 4 } } },
  ]);
  assert.deepEqual(dogs.map((d) => d.name), ['Junior', 'Bay']);
  assert.equal(dogs[0].breed, 'Lab mix');
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
