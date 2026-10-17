// 📅 Shared calendar: events either partner adds, merged from both phones, plus the
// calendar-file (.ics) and Google Calendar links that put them in Apple or Google Calendar.
// No browser APIs here: the household connector imports this to serve the subscription feed.

export const REMINDERS = { '': 'No reminder', 0: 'At start', 10: '10 min before', 30: '30 min before', 60: '1 hour before', 120: '2 hours before', 1440: '1 day before' };
export const WHO_BOTH = 'both';
// How an event repeats: e.repeat = { kind, every?, day2?, until? }; e.skip = [dates left out].
export const REPEATS = {
  '': 'Does not repeat', daily: 'Every day', weekly: 'Every week', biweekly: 'Every 2 weeks',
  monthly: 'Monthly, same date', monthlyNth: 'Monthly, same weekday', monthlyLast: 'Monthly, last day',
  twiceMonthly: 'Twice a month', quarterly: 'Every 3 months', yearly: 'Every year',
};
const UNIT = { daily: 'day', weekly: 'week', monthly: 'month', monthlyNth: 'month', monthlyLast: 'month', yearly: 'year' };
// biweekly / quarterly are weekly / monthly with a fixed interval.
function rule(e) {
  const r = e.repeat;
  if (!r?.kind || !REPEATS[r.kind]) return null;
  if (r.kind === 'biweekly') return { ...r, kind: 'weekly', every: 2 };
  if (r.kind === 'quarterly') return { ...r, kind: 'monthly', every: 3 };
  return { ...r, every: Math.max(1, Math.min(99, +r.every || 1)) };
}
const parts = (d) => { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd }; };
const dayNum = (d) => Date.UTC(...Object.values(parts(d)).map((v, i) => (i === 1 ? v - 1 : v))) / 864e5;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const nthOf = (dom) => Math.ceil(dom / 7); // 1–5; 5 = last
// Does event e (a series) happen on day d?
export function occursOn(e, d) {
  if (d < e.date || (e.skip || []).includes(d)) return false;
  const r = rule(e);
  if (!r) return d === e.date;
  if (r.until && d > r.until) return false;
  const a = parts(e.date), b = parts(d);
  const months = (b.y - a.y) * 12 + (b.m - a.m);
  switch (r.kind) {
    case 'daily': return (dayNum(d) - dayNum(e.date)) % r.every === 0;
    case 'weekly': return (dayNum(d) - dayNum(e.date)) % (7 * r.every) === 0;
    case 'monthly': return months % r.every === 0 && b.d === a.d;
    case 'monthlyLast': return months % r.every === 0 && b.d === daysInMonth(b.y, b.m);
    case 'monthlyNth': {
      if (months % r.every !== 0 || weekday(d) !== weekday(e.date)) return false;
      const n = nthOf(a.d);
      return n === 5 || a.d + 7 > daysInMonth(a.y, a.m) ? b.d + 7 > daysInMonth(b.y, b.m) : nthOf(b.d) === n;
    }
    case 'twiceMonthly': {
      const d2 = +r.day2 === -1 ? daysInMonth(b.y, b.m) : +r.day2;
      return b.d === a.d || b.d === d2;
    }
    case 'yearly': return (b.y - a.y) % r.every === 0 && b.m === a.m && b.d === a.d;
    default: return d === e.date;
  }
}
const ORD = ['', '1st', '2nd', '3rd', '4th', 'last'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ordDay = (n) => (n === -1 ? 'last day' : `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`);
// "Every 2 weeks on Fri", "1st & 15th of every month", "until Dec 31"…
export function repeatText(e) {
  const r = rule(e);
  if (!r) return '';
  const a = parts(e.date);
  const every = (unit) => (r.every > 1 ? `Every ${r.every} ${unit}s` : `Every ${unit}`);
  const t = {
    daily: () => every('day'),
    weekly: () => `${every('week')} on ${WD[weekday(e.date)]}`,
    monthly: () => `${every('month')} on the ${ordDay(a.d)}`,
    monthlyLast: () => `Last day of ${r.every > 1 ? `every ${r.every} months` : 'every month'}`,
    monthlyNth: () => `${ORD[a.d + 7 > daysInMonth(a.y, a.m) ? 5 : nthOf(a.d)]} ${WD[weekday(e.date)]} of ${r.every > 1 ? `every ${r.every} months` : 'every month'}`,
    twiceMonthly: () => `${ordDay(a.d)} & ${ordDay(+r.day2)} of every month`,
    yearly: () => `${every('year')} on ${new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`,
  }[r.kind]();
  return r.until ? `${t}, until ${new Date(`${r.until}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : t;
}
export const repeatUnit = (kind) => UNIT[kind] || '';
// The calendar-file rule for a series (RRULE value), or ''.
export function rrule(e) {
  const r = rule(e);
  if (!r) return '';
  const a = parts(e.date);
  const iv = r.every > 1 ? `;INTERVAL=${r.every}` : '';
  const body = {
    daily: `FREQ=DAILY${iv}`,
    weekly: `FREQ=WEEKLY${iv}`,
    monthly: `FREQ=MONTHLY${iv};BYMONTHDAY=${a.d}`,
    monthlyLast: `FREQ=MONTHLY${iv};BYMONTHDAY=-1`,
    monthlyNth: `FREQ=MONTHLY${iv};BYDAY=${a.d + 7 > daysInMonth(a.y, a.m) ? -1 : nthOf(a.d)}${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][weekday(e.date)]}`,
    twiceMonthly: `FREQ=MONTHLY;BYMONTHDAY=${[a.d, +r.day2].sort((x, y) => (x === -1 ? 1 : y === -1 ? -1 : x - y)).join(',')}`,
    yearly: `FREQ=YEARLY${iv}`,
  }[r.kind];
  // UNTIL in UTC: the morning after the last day covers any US time zone.
  const until = r.until ? `;UNTIL=${e.allDay || !e.start ? ymd(r.until) : `${ymd(nextDay(r.until))}T115959Z`}` : '';
  return body + until;
}

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
// A series appears on each day it occurs, as a copy dated that day (same id, series: true).
const onDay = (e, day) => (e.repeat?.kind ? (occursOn(e, day) ? { ...e, date: day, seriesStart: e.date, series: true } : null) : e.date === day ? e : null);
export const eventsOn = (events, day) => events.map((e) => onDay(e, day)).filter(Boolean).sort(byTime);
// Still to come: today's events that haven't ended, then later days.
export function upcoming(events, today, nowHHMM = '00:00', limit = 5, days = 120) {
  const out = [];
  for (let i = 0, d = today; i < days && out.length < limit; i++, d = nextDay(d)) {
    for (const e of eventsOn(events, d)) if (d > today || e.allDay || (e.end || e.start || '23:59') >= nowHHMM) out.push(e);
  }
  return out.slice(0, limit);
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

export function icsEvent(ev, { names = {}, alarms = true, stamp = new Date() } = {}) {
  const e = ev.seriesStart ? { ...ev, date: ev.seriesStart } : ev;
  const tz = e.tz || 'America/Los_Angeles';
  const who = e.who === WHO_BOTH || !e.who ? 'Both of us' : names[e.who] || e.who;
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@pawmily`, `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (e.allDay || !e.start) lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
  else { const end = endOf(e); lines.push(`DTSTART;TZID=${tz}:${ymd(e.date)}T${hms(e.start)}`, `DTEND;TZID=${tz}:${ymd(end.date)}T${hms(end.time)}`); }
  const rr = rrule(e);
  if (rr) {
    lines.push(`RRULE:${rr}`);
    for (const d of e.skip || []) lines.push(e.allDay || !e.start ? `EXDATE;VALUE=DATE:${ymd(d)}` : `EXDATE;TZID=${tz}:${ymd(d)}T${hms(e.start)}`);
  }
  lines.push(`SUMMARY:${icsText(e.title)}`);
  if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
  lines.push(`DESCRIPTION:${icsText([`For: ${who}`, e.notes, 'From OurPawMili'].filter(Boolean).join('\n'))}`);
  if (alarms && e.remind !== '' && e.remind != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${+e.remind}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}
export function icsCalendar(events, opts = {}) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OurPawMili//Shared calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(opts.name || 'OurPawMili')}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...events.map((e) => icsEvent(e, opts)), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
// Google Calendar's "add event" page, filled in (Google sets its own default reminder).
export function googleUrl(ev, names = {}) {
  const e = ev.seriesStart ? { ...ev, date: ev.seriesStart } : ev;
  const who = e.who === WHO_BOTH || !e.who ? 'Both of us' : names[e.who] || e.who;
  const dates = e.allDay || !e.start ? `${ymd(e.date)}/${ymd(nextDay(e.date))}` : (() => { const end = endOf(e); return `${ymd(e.date)}T${hms(e.start)}/${ymd(end.date)}T${hms(end.time)}`; })();
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: [`For: ${who}`, e.notes].filter(Boolean).join('\n') });
  if (e.place) q.set('location', e.place);
  if (!e.allDay && e.start) q.set('ctz', e.tz || 'America/Los_Angeles');
  if (rrule(e)) q.set('recur', `RRULE:${rrule(e)}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------- reading calendar files (.ics) from Apple / Google Calendar ----------
// Times become this phone's local time; repeat rules map onto ours where they can (weekly on
// several days becomes one series per day); anything we can't repeat keeps its next date.
const unescapeIcs = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function icsLines(text) {
  return text.replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/).filter(Boolean).map((line) => {
    const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const head = line.slice(0, colon), value = line.slice(colon + 1);
    const [name, ...ps] = head.split(';');
    const params = Object.fromEntries(ps.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), (v || '').replace(/"/g, '')]));
    return { name: name.toUpperCase(), params, value };
  });
}
// Offset (ms) of a time zone from UTC at a given instant.
function tzOffset(tz, ms) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
  } catch { return 0; }
}
// An .ics date/time → { date, time? } in local time (or the event's own day for all-day).
function icsWhen(prop, localTz) {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h == null || prop.params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, allDay: true };
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  if (z) { /* already UTC */ } else if (prop.params.TZID) { const guess = ms; ms = guess - tzOffset(prop.params.TZID, guess); ms = guess - tzOffset(prop.params.TZID, ms); } else { return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }; }
  const local = new Date(ms + tzOffset(localTz, ms));
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
const WD2 = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// RRULE → our repeat (one or more series, by start date), or null when we can't express it.
function mapRule(rr, start) {
  const r = Object.fromEntries(rr.split(';').map((x) => x.split('=')));
  const every = Math.max(1, +r.INTERVAL || 1);
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : undefined;
  const base = (kind, extra = {}) => ({ kind, ...(every > 1 ? { every } : {}), ...(until ? { until } : {}), ...extra });
  const days = (r.BYDAY || '').split(',').filter(Boolean);
  switch (r.FREQ) {
    case 'DAILY': return [{ start, repeat: base('daily') }];
    case 'WEEKLY': {
      const wds = days.length ? days.map((x) => WD2.indexOf(x.slice(-2))) : [weekday(start)];
      return wds.map((wd) => { let s = start; while (weekday(s) !== wd) s = addDays(s, 1); return { start: s, repeat: base('weekly') }; });
    }
    case 'MONTHLY': {
      if (r.BYMONTHDAY === '-1') return [{ start, repeat: base('monthlyLast') }];
      if (r.BYMONTHDAY && r.BYMONTHDAY.includes(',')) {
        const [d1, d2] = r.BYMONTHDAY.split(',').map(Number);
        return every === 1 && parts(start).d === d1 ? [{ start, repeat: base('twiceMonthly', { day2: d2 }) }] : null;
      }
      if (days.length === 1 && /^-?\d/.test(days[0])) return [{ start, repeat: base('monthlyNth') }];
      return days.length ? null : [{ start, repeat: base('monthly') }];
    }
    case 'YEARLY': return [{ start, repeat: base('yearly') }];
    default: return null;
  }
}
// The whole file → events in our shape. `from`: drop one-off events that ended before it.
export function parseIcs(text, { localTz = 'America/Los_Angeles', from = '0000', who = WHO_BOTH, source = '' } = {}) {
  const out = [];
  const moved = [];   // one date of a repeating event that was moved or cancelled: {uid, was}
  let cur = null;
  let nested = 0;     // inside an event's alarm (VALARM) — its lines aren't the event's
  for (const l of icsLines(text)) {
    if (cur && l.name === 'BEGIN' && l.value !== 'VEVENT') { nested++; continue; }
    if (cur && nested && l.name === 'END') { nested--; continue; }
    if (nested) continue;
    if (l.name === 'BEGIN' && l.value === 'VEVENT') cur = { props: {}, exdates: [] };
    else if (l.name === 'END' && l.value === 'VEVENT' && cur) {
      const p = cur.props;
      const st = icsWhen(p.DTSTART, localTz);
      const rawUid = (p.UID?.value || '').replace(/[^\w@.-]+/g, '');
      // A moved / changed single date of a series: hide that date on the series, show this copy instead.
      if (p['RECURRENCE-ID']) {
        const was = icsWhen(p['RECURRENCE-ID'], localTz)?.date;
        if (was && rawUid) moved.push({ uid: rawUid, was });
      }
      if (st && (p.STATUS?.value || '').toUpperCase() !== 'CANCELLED') {
        const en = icsWhen(p.DTEND, localTz);
        const uid = (p['RECURRENCE-ID'] ? `${rawUid}-${st.date}` : p.UID?.value || `${st.date}-${p.SUMMARY?.value || ''}`).replace(/[^\w@.-]+/g, '');
        const ev = {
          title: unescapeIcs(p.SUMMARY?.value || '(No title)').slice(0, 80), date: st.date, allDay: !!st.allDay,
          start: st.time || '', end: en && !st.allDay && en.date === st.date ? en.time : '',
          place: unescapeIcs(p.LOCATION?.value || '').replace(/\s*\n+\s*/g, ', ').slice(0, 80), notes: unescapeIcs(p.DESCRIPTION?.value || '').slice(0, 300),
          who, remind: '', tz: localTz, source,
        };
        let series = [{ start: st.date, repeat: null }];
        let unsupported = false;
        if (p.RRULE && !p['RECURRENCE-ID']) {
          const m = mapRule(p.RRULE.value, st.date);
          if (m) series = m; else unsupported = true;
          // COUNT → an end date, by walking the occurrences.
          const count = +(p.RRULE.value.match(/COUNT=(\d+)/)?.[1] || 0);
          if (m && count) for (const s of series) {
            let n = 0, d = s.start;
            for (let i = 0; i < 3 * 366 && n < count; i++, d = addDays(d, 1)) if (occursOn({ date: s.start, repeat: s.repeat }, d) && ++n === count) s.repeat.until = d;
          }
        }
        const skip = cur.exdates.map((x) => icsWhen(x, localTz)?.date).filter(Boolean);
        series.forEach((s, i) => {
          const e = { ...ev, id: `ics-${uid}${series.length > 1 ? `-${i}` : ''}`.slice(0, 120), date: s.start, ...(s.repeat ? { repeat: s.repeat } : {}), ...(skip.length ? { skip } : {}), ...(unsupported ? { notes: [ev.notes, '(Repeats in your calendar app; only the first date shown here.)'].filter(Boolean).join('\n') } : {}) };
          const ended = e.repeat ? (e.repeat.until && e.repeat.until < from) : e.date < from;
          if (!ended) out.push(e);
        });
      }
      cur = null;
    } else if (cur) {
      if (l.name === 'EXDATE') for (const v of l.value.split(',')) cur.exdates.push({ value: v, params: l.params });
      else if (!cur.props[l.name]) cur.props[l.name] = l;
    }
  }
  // Leave the moved dates out of their series.
  for (const m of moved) {
    for (const e of out) {
      if (e.repeat && (e.id === `ics-${m.uid}` || e.id.startsWith(`ics-${m.uid}-`))) e.skip = [...new Set([...(e.skip || []), m.was])];
    }
  }
  return out;
}
