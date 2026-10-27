// 🐾 Dog appointments spotted in linked calendars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dogEvent } from '../js/dogcal.js';

const dogs = [{ id: 'l', name: 'Layla' }, { id: 'n', name: 'Luna' }];
test('dog appointments in calendar events, and not people things', () => {
  assert.deepEqual(dogEvent({ title: 'Grooming – Layla', place: "Wag N' Wash" }, dogs), { type: 'groom', pets: ['l'] });
  assert.deepEqual(dogEvent({ title: 'Vet', place: 'VCA Animal Hospital' }, dogs), { type: 'vet', pets: [] });
  assert.deepEqual(dogEvent({ title: 'Luna rabies shot' }, dogs), { type: 'vaccine', pets: ['n'] });
  assert.deepEqual(dogEvent({ title: 'Drop dogs at daycare' }, dogs), { type: 'boarding', pets: [] });
  assert.deepEqual(dogEvent({ title: 'Layla & Luna playdate' }, dogs), { type: 'other', pets: ['l', 'n'] });
  assert.deepEqual(dogEvent({ title: 'Checkup', place: 'Happy Paws Clinic' }, dogs, ['Happy Paws']), { type: 'vet', pets: [] });
  assert.equal(dogEvent({ title: 'Dental cleaning', place: 'Dr. Smith DDS' }, dogs), null, 'people dentist');
  assert.equal(dogEvent({ title: 'Haircut', place: 'Supercuts' }, dogs), null);
  assert.equal(dogEvent({ title: 'Veterans Day parade' }, dogs), null);
  assert.equal(dogEvent({ title: 'Lunar new year' }, dogs), null, 'whole words only');
  assert.equal(dogEvent({ title: 'Early Friendsgiving', place: 'Hayward' }, dogs), null);
});
