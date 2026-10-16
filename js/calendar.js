// 📅 Shared calendar: events either partner adds, merged from both phones, plus the
// calendar-file (.ics) and Google Calendar links that put them in Apple or Google Calendar.
// No browser APIs here: the household connector imports this to serve the subscription feed.

export const REMINDERS = { '': 'No reminder', 0: 'At start', 10: '10 min before', 30: '30 min before', 60: '1 hour before', 120: '2 hours before', 1440: '1 day before' };
export const WHO_BOTH = 'both';

// records: [{ person, events: [{ id, title, date, start?, end?, allDay?, place?, who, notes?, remind?, tz?, updatedAt, deleted? }] }]
// The newest edit of each event wins, whoever made it; a deleted event stays deleted.
export function mergeEvents(records) {
  const best = new Map();
  for (const r of records) {
    for (const e of r.events || []) {
      const cur = best.get(e.id);
      if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) best.set(e.id, { ...e, by: e.by || r.person });
    }
  }
  return [...best.values()].filter((e) => !e.deleted && e.title && e.date).sort(byTime);
}
const byTime = (a, b) => a.date.localeCompare(b.date) || (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || (a.start || '').localeCompare(b.start || '');
export const eventsOn = (events, day) => events.filter((e) => e.date === day).sort(byTime);
// Still to come: today's events that haven't ended, then later days.
export function upcoming(events, today, nowHHMM = '00:00', limit = 5) {
  return events.filter((e) => e.date > today || (e.date === today && (e.allDay || (e.end || e.start || '23:59') >= nowHHMM))).sort(byTime).slice(0, limit);
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.replaceAll('-', '');
const hms = (t) => `${t.replace(':', '')}00`;
const nextDay = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
// An hour after the start (or the given end), on the right day.
function endOf(e) {
  if (e.end && e.end > e.start) return { date: e.date, time: e.end };
  const [h, m] = e.start.split(':').map(Number);
  return h >= 23 ? { date: nextDay(e.date), time: `${pad(h - 23)}:${pad(m)}` } : { date: e.date, time: `${pad(h + 1)}:${pad(m)}` };
}
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines longer than 75 octets are folded, as the format requires.
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; } out.push(s); return out.join('\r\n'); };

export function icsEvent(e, { names = {}, alarms = true, stamp = new Date() } = {}) {
  const tz = e.tz || 'America/Los_Angeles';
  const who = e.who === WHO_BOTH || !e.who ? 'Both of us' : names[e.who] || e.who;
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@pawmily`, `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (e.allDay || !e.start) lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
  else { const end = endOf(e); lines.push(`DTSTART;TZID=${tz}:${ymd(e.date)}T${hms(e.start)}`, `DTEND;TZID=${tz}:${ymd(end.date)}T${hms(end.time)}`); }
  lines.push(`SUMMARY:${icsText(e.title)}`);
  if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
  lines.push(`DESCRIPTION:${icsText([`For: ${who}`, e.notes, 'From Our PawMily'].filter(Boolean).join('\n'))}`);
  if (alarms && e.remind !== '' && e.remind != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${+e.remind}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}
export function icsCalendar(events, opts = {}) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Our PawMily//Shared calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(opts.name || 'Our PawMily')}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...events.map((e) => icsEvent(e, opts)), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
// Google Calendar's "add event" page, filled in (Google sets its own default reminder).
export function googleUrl(e, names = {}) {
  const who = e.who === WHO_BOTH || !e.who ? 'Both of us' : names[e.who] || e.who;
  const dates = e.allDay || !e.start ? `${ymd(e.date)}/${ymd(nextDay(e.date))}` : (() => { const end = endOf(e); return `${ymd(e.date)}T${hms(e.start)}/${ymd(end.date)}T${hms(end.time)}`; })();
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: [`For: ${who}`, e.notes].filter(Boolean).join('\n') });
  if (e.place) q.set('location', e.place);
  if (!e.allDay && e.start) q.set('ctz', e.tz || 'America/Los_Angeles');
  return `https://calendar.google.com/calendar/render?${q}`;
}
