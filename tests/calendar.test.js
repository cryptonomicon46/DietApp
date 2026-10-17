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

test('recurring events: bi-weekly paycheck, monthly by weekday, twice a month, last day, until and skipped dates', async () => {
  const { occursOn, repeatText, rrule } = await import('../js/calendar.js');
  const pay = { id: 'p', title: 'Paycheck', date: '2026-10-16', allDay: true, repeat: { kind: 'biweekly' } };
  assert.deepEqual(['2026-10-16', '2026-10-30', '2026-11-13', '2026-10-23', '2026-10-15'].map((d) => occursOn(pay, d)), [true, true, true, false, false]);
  assert.equal(repeatText(pay), 'Every 2 weeks on Fri');
  assert.equal(rrule(pay), 'FREQ=WEEKLY;INTERVAL=2');
  const gardener = { id: 'g', title: 'Gardener', date: '2026-10-13', start: '08:00', repeat: { kind: 'monthlyNth' }, skip: ['2026-12-08'] };
  assert.deepEqual(['2026-11-10', '2026-12-08', '2027-01-12', '2026-11-03'].map((d) => occursOn(gardener, d)), [true, false, true, false], '2nd Tuesday, December skipped');
  assert.equal(repeatText(gardener), '2nd Tue of every month');
  const lastFri = { id: 'f', title: 'Book club', date: '2026-10-30', repeat: { kind: 'monthlyNth' } };
  assert.equal(rrule(lastFri), 'FREQ=MONTHLY;BYDAY=-1FR');
  assert.equal(occursOn(lastFri, '2026-11-27'), true, 'last Friday of November');
  const twice = { id: 't', title: 'Payday', date: '2026-10-01', allDay: true, repeat: { kind: 'twiceMonthly', day2: 15 } };
  assert.deepEqual(['2026-11-01', '2026-11-15', '2026-11-16'].map((d) => occursOn(twice, d)), [true, true, false]);
  assert.equal(repeatText(twice), '1st & 15th of every month');
  assert.equal(rrule(twice), 'FREQ=MONTHLY;BYMONTHDAY=1,15');
  const rent = { id: 'r', title: 'Rent', date: '2026-10-31', allDay: true, repeat: { kind: 'monthlyLast', until: '2027-03-31' } };
  assert.deepEqual(['2026-11-30', '2027-02-28', '2027-03-31', '2027-04-30'].map((d) => occursOn(rent, d)), [true, true, true, false]);
  assert.equal(rrule(rent), 'FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20270331');
  const quarterly = { id: 'q', title: 'Pest control', date: '2026-10-05', repeat: { kind: 'quarterly' } };
  assert.deepEqual(['2027-01-05', '2026-11-05', '2027-04-05'].map((d) => occursOn(quarterly, d)), [true, false, true]);
  const every3w = { id: 'w', title: 'Haircut', date: '2026-10-17', start: '10:00', repeat: { kind: 'weekly', every: 3, until: '2026-12-31' } };
  assert.equal(repeatText(every3w), 'Every 3 weeks on Sat, until Dec 31, 2026');
  assert.equal(rrule(every3w), 'FREQ=WEEKLY;INTERVAL=3;UNTIL=20270101T115959Z');
});

test('recurring events in views, calendar files and Google links', async () => {
  const { eventsOn, upcoming, icsEvent, googleUrl } = await import('../js/calendar.js');
  const gardener = { id: 'g', title: 'Gardener', date: '2026-10-13', start: '08:00', repeat: { kind: 'monthlyNth' }, skip: ['2026-12-08'], updatedAt: 1 };
  const one = { id: 'x', title: 'Dentist', date: '2026-11-10', start: '13:00', updatedAt: 1 };
  const day = eventsOn([gardener, one], '2026-11-10');
  assert.deepEqual(day.map((e) => [e.id, e.date, !!e.series]), [['g', '2026-11-10', true], ['x', '2026-11-10', false]]);
  assert.deepEqual(upcoming([gardener], '2026-10-14', '09:00', 3).map((e) => e.date), ['2026-11-10', '2027-01-12', '2027-02-09']);
  const ics = icsEvent(day[0]);
  assert.match(ics, /DTSTART;TZID=America\/Los_Angeles:20261013T080000/, 'the series starts on its first day');
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYDAY=2TU/);
  assert.match(ics, /EXDATE;TZID=America\/Los_Angeles:20261208T080000/);
  assert.equal(new URL(googleUrl(day[0])).searchParams.get('recur'), 'RRULE:FREQ=MONTHLY;BYDAY=2TU');
});

test('reading an Apple / Google calendar file', async () => {
  const { parseIcs, eventsOn } = await import('../js/calendar.js');
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:yoga-1', 'DTSTART;TZID=America/Los_Angeles:20261020T183000', 'DTEND;TZID=America/Los_Angeles:20261020T193000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=America/Los_Angeles:20261022T183000', 'SUMMARY:Yoga\\, Movement', 'LOCATION:815 Stewart Dr\\, Sunnyv', ' ale', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:dentist', 'DTSTART:20261028T210000Z', 'DTEND:20261028T220000Z', 'SUMMARY:Dentist', 'DESCRIPTION:Bring card\\nDr. Kim', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:bday', 'DTSTART;VALUE=DATE:20261105', 'RRULE:FREQ=YEARLY', 'SUMMARY:Mom', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:class', 'DTSTART;TZID=America/Los_Angeles:20261019T070000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Class', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:old', 'DTSTART:20250101T170000Z', 'SUMMARY:Old', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x', 'DTSTART:20261101T170000Z', 'STATUS:CANCELLED', 'SUMMARY:Off', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const ev = parseIcs(ics, { from: '2026-10-17', who: 'amani', localTz: 'America/Los_Angeles' });
  assert.deepEqual(ev.map((e) => e.id), ['ics-yoga-1-0', 'ics-yoga-1-1', 'ics-dentist', 'ics-bday', 'ics-class'], 'old and cancelled dropped');
  assert.equal(ev[0].title, 'Yoga, Movement');
  assert.equal(ev[0].place, '815 Stewart Dr, Sunnyvale', 'folded line joined');
  assert.deepEqual([ev[1].date, ev[1].repeat.kind], ['2026-10-22', 'weekly'], 'Thursday series');
  assert.equal(eventsOn(ev, '2026-10-22').length, 0, 'skipped date');
  assert.equal(eventsOn(ev, '2026-10-27').length, 1);
  assert.deepEqual([ev[2].date, ev[2].start, ev[2].end], ['2026-10-28', '14:00', '15:00'], 'UTC → Pacific');
  assert.equal(ev[2].notes, 'Bring card\nDr. Kim');
  assert.deepEqual([ev[3].allDay, ev[3].repeat.kind], [true, 'yearly']);
  assert.equal(ev[4].repeat.until, '2026-11-02', 'COUNT=3 weekly from Oct 19');
  assert.ok(ev.every((e) => e.who === 'amani'));
});
