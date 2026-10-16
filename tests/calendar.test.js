import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvents, eventsOn, upcoming, icsEvent, icsCalendar, googleUrl } from '../js/calendar.js';

const recs = [
  { person: 'sandman', events: [
    { id: 'vet', title: 'Vet: Junior', date: '2026-10-20', start: '09:30', who: 'both', remind: '60', updatedAt: 5 },
    { id: 'din', title: 'Dinner, Patels', date: '2026-10-18', start: '19:00', end: '21:00', place: 'Rangoli, San Jose', who: 'both', updatedAt: 1 },
    { id: 'old', title: 'Gone', date: '2026-10-18', updatedAt: 1 },
  ] },
  { person: 'amani', events: [
    { id: 'din', title: 'Dinner with the Patels', date: '2026-10-18', start: '19:30', end: '21:00', place: 'Rangoli, San Jose', who: 'both', updatedAt: 9, by: 'amani' },
    { id: 'old', title: 'Gone', date: '2026-10-18', deleted: true, updatedAt: 2 },
    { id: 'bday', title: "Mom's birthday", date: '2026-10-18', allDay: true, who: 'amani', updatedAt: 3 },
  ] },
];

test('events from both phones merge: newest edit wins, deletes stick, sorted by day and time', () => {
  const ev = mergeEvents(recs);
  assert.deepEqual(ev.map((e) => e.id), ['bday', 'din', 'vet']);
  assert.equal(ev[1].start, '19:30', "Amani's later edit");
  assert.equal(ev[1].by, 'amani');
  assert.deepEqual(eventsOn(ev, '2026-10-18').map((e) => e.id), ['bday', 'din']);
  assert.deepEqual(upcoming(ev, '2026-10-18', '21:30').map((e) => e.id), ['bday', 'vet'], 'dinner is over; all-day still counts');
});

test('calendar file: timed event with reminder, all-day event, escaping', () => {
  const ev = mergeEvents(recs);
  const vet = icsEvent(ev.find((e) => e.id === 'vet'), { stamp: new Date('2026-10-16T00:00:00Z') });
  assert.match(vet, /DTSTART;TZID=America\/Los_Angeles:20261020T093000/);
  assert.match(vet, /DTEND;TZID=America\/Los_Angeles:20261020T103000/, 'an hour by default');
  assert.match(vet, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Vet: Junior\r\nTRIGGER:-PT60M/);
  const din = icsEvent(ev.find((e) => e.id === 'din'));
  assert.match(din, /LOCATION:Rangoli\\, San Jose/);
  const bday = icsEvent(ev.find((e) => e.id === 'bday'), { names: { amani: 'Amani' } });
  assert.match(bday, /DTSTART;VALUE=DATE:20261018\r\nDTEND;VALUE=DATE:20261019/);
  assert.match(bday, /For: Amani/);
  const cal = icsCalendar(ev, { alarms: false });
  assert.ok(cal.startsWith('BEGIN:VCALENDAR\r\n') && cal.endsWith('END:VCALENDAR\r\n'));
  assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(!cal.includes('VALARM'), 'subscriptions carry no alarms');
  assert.ok(cal.split('\r\n').every((l) => l.length <= 75), 'lines folded');
});

test('Google Calendar link', () => {
  const ev = mergeEvents(recs);
  const u = new URL(googleUrl(ev.find((e) => e.id === 'din')));
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('dates'), '20261018T193000/20261018T210000');
  assert.equal(u.searchParams.get('ctz'), 'America/Los_Angeles');
  assert.equal(u.searchParams.get('location'), 'Rangoli, San Jose');
  assert.equal(new URL(googleUrl(ev.find((e) => e.id === 'bday'))).searchParams.get('dates'), '20261018/20261019');
});
