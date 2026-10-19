// 📅 The Calendar tab: a shared calendar either partner can add to and edit, a month view,
// the chosen day's events, what's coming up, and buttons to put an event (with its reminder)
// into Apple or Google Calendar — or subscribe to the whole shared calendar there.
import { PROFILES, ownerId, profileStore, seenItems, global } from './storage.js';
import { sync, pushNow } from './sync.js';
import { goldenDays } from './briefTab.js';
import { strongDaysByPerson } from './cheer.js';
import { allRhythm, momentText, momentIcon, momentFormHtml, momentFormOpen, closeMoment } from './rhythm.js';
import { REMINDERS, REPEATS, WHO_BOTH, mergeEvents, eventsOn, upcoming, icsCalendar, googleUrl, repeatText, repeatUnit, parseIcs } from './calendar.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const me = () => ownerId();
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const names = () => Object.fromEntries(PROFILES.map((p) => [p.id, nameOf(p.id)]));
const time12 = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '') : '');
const dayLabel = (d, today = isoDate()) => {
  const t = new Date(`${today}T12:00:00`); t.setDate(t.getDate() + 1);
  if (d === today) return 'Today';
  if (d === isoDate(t)) return 'Tomorrow';
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
const whoClass = (who) => (who === WHO_BOTH || !who ? 'w-both' : `w-p${Math.max(0, PROFILES.findIndex((p) => p.id === who))}`);
const whoLabel = (who) => (who === WHO_BOTH || !who ? 'Both' : nameOf(who));

// Shared events (editable by both) — the ones that live in the app.
export const sharedEvents = () => mergeEvents(PROFILES.map((p) => ({ person: p.id, events: profileStore(p.id).get('events', []) })));
// Plus events from linked calendars (Apple / Google), read-only, refreshed from the source.
export const allEvents = () => [...sharedEvents(), ...feedEvents()];

// ---------- linked calendars (Apple iCloud public link, Google secret iCal address) ----------
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
const allFeeds = () => PROFILES.flatMap((p) => profileStore(p.id).get('calFeeds', []).map((f) => ({ ...f, owner: p.id })));
const feedCache = () => global.get('calFeedCache', {});
function feedEvents() {
  const cache = feedCache();
  return allFeeds().flatMap((f) => (cache[f.id]?.events || []).map((e) => ({ ...e, id: `${f.id}:${e.id}`, readonly: true, feed: f.name, by: f.owner })));
}
const fresh = (f) => Date.now() - (feedCache()[f.id]?.fetchedAt || 0) < 30 * 60000;
let refreshing = false;
export async function refreshFeeds(force = false) {
  const s = sync.settings();
  if (refreshing || !s?.url || !s?.code) return;
  const due = allFeeds().filter((f) => force || !fresh(f));
  if (!due.length) return;
  refreshing = true;
  const from = isoDate(new Date(Date.now() - 30 * 864e5));
  try {
    for (const f of due) {
      const cache = feedCache();
      try {
        const res = await fetch(`${s.url}/ics?code=${encodeURIComponent(s.code)}&url=${encodeURIComponent(f.url)}`);
        if (!res.ok) {
          const msg = (await res.json().catch(() => ({}))).error || `error ${res.status}`;
          // An older connector doesn't know /ics yet.
          throw new Error(res.status === 404 && msg === 'not found' ? 'connector needs the one-time update — run “npx wrangler deploy” in server/' : msg);
        }
        const events = parseIcs(await res.text(), { localTz: localTz(), from, who: f.who, source: f.name }).slice(0, 1500);
        cache[f.id] = { fetchedAt: Date.now(), events };
      } catch (err) {
        cache[f.id] = { ...(cache[f.id] || {}), fetchedAt: Date.now(), error: /fetch/i.test(err.message) ? 'connector needs the update (server/README.md)' : err.message };
      }
      global.set('calFeedCache', cache);
    }
  } finally { refreshing = false; }
  renderCal();
  updateCalBadge();
}
let linkWho = null;
function bringInCard() {
  const feeds = allFeeds();
  const cache = feedCache();
  const who = linkWho || me();
  const whoSeg = (attr) => `<div class="seg who-pick">${[[WHO_BOTH, 'Both'], ...PROFILES.map((p) => [p.id, nameOf(p.id)])].map(([k, l]) => `<button type="button" class="${who === k ? 'on' : ''}" ${attr}="${k}">${esc(l)}</button>`).join('')}</div>`;
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  return `${feeds.length ? `<div class="card"><div class="eyebrow">📲 Linked calendars</div><ul class="list feed-list">${feeds.map((f) => {
      const c = cache[f.id];
      return `<li><span><b>${esc(f.name)}</b> <span class="who-chip ${whoClass(f.who)}">${esc(whoLabel(f.who))}</span><br><small class="${c?.error ? 'tone-warn' : 'muted'}">${c?.error ? esc(c.error) : c?.events ? `${c.events.length} events · updated ${ago(c.fetchedAt)}` : 'Not loaded yet'}</small></span>
        <span><button type="button" class="ghost small" data-feedrefresh="${f.id}" aria-label="Refresh">↻</button>${f.owner === me() ? ` <button type="button" class="x" data-feeddel="${f.id}" aria-label="Unlink ${esc(f.name)}">✕</button>` : ''}</span></li>`;
    }).join('')}</ul></div>` : ''}
  <details class="card cal-sub" ${feeds.length ? '' : 'open'}><summary><b>📲 ${feeds.length ? 'Link another calendar' : 'Bring in your iPhone calendar'}</b> <span class="small muted">— so you don't retype events</span></summary>
    <form id="feedForm" class="cal-form">
      <div class="small"><b>Link your iPhone calendar</b> — do this once on each phone; events then keep themselves up to date.</div>
      <ol class="small iphone-steps">
        <li>Open the <b>Calendar</b> app and tap <b>Calendars</b> at the bottom.</li>
        <li>Under <b>iCloud</b>, tap <b>ⓘ</b> next to the calendar you use (e.g. Home).</li>
        <li>Scroll down, turn on <b>Public Calendar</b>, tap <b>Share Link…</b> → <b>Copy</b>.</li>
        <li>Come back here, tap <b>Paste link</b>, then <b>Link calendar</b>.</li>
      </ol>
      <div class="row"><input name="url" inputmode="url" autocomplete="off" autocapitalize="none" placeholder="webcal://p…-caldav.icloud.com/published/2/…" required>
        <button type="button" class="ghost small" data-feedpaste>Paste link</button></div>
      <input name="name" maxlength="40" placeholder="Name, e.g. ${esc(nameOf(me()))}'s iPhone">
      <div class="small">Whose events are these?</div>${whoSeg('data-linkwho')}
      <button type="submit">Link calendar</button>
      <details class="small help"><summary>Good to know</summary>
        <p>Only <b>iCloud</b> calendars have Public Calendar. Events from an Exchange/work or Google account on the iPhone can't be published from the Calendar app — for Google, use its <b>Secret address in iCal format</b> (Google Calendar settings on a computer) instead.</p>
        <p>Anyone who has the public link can see that calendar, so keep it between the two of you. Turning Public Calendar off later stops it here too.</p>
        <p>Events show here read-only and refresh every half hour (↻ to refresh now); edit them in the Calendar app. Want a calendar just for things you share? Make a new iCloud calendar (e.g. “Us”), publish that one, and keep work events out.</p>
      </details>
    </form>
    <div class="cal-form" style="margin-top:12px">
      <div class="small"><b>Or import a calendar file once (.ics)</b> — e.g. exported from Calendar on a Mac (File → Export). Imported events become shared events you can both edit.</div>
      <label class="filebtn ghost">Choose .ics file<input type="file" accept=".ics,text/calendar" data-icsimport hidden></label>
    </div>
  </details>`;
}
function saveEvent(ev) {
  const s = profileStore(me());
  const list = s.get('events', []).filter((e) => e.id !== ev.id);
  list.push({ ...ev, updatedAt: Date.now(), by: me() });
  // Keep this year's and next year's; drop old ones.
  const cutoff = isoDate(new Date(Date.now() - 400 * 864e5));
  s.set('events', list.filter((e) => e.date >= cutoff || e.deleted).slice(-1000));
  pushNow().catch(() => {});
}

// New or changed events from the other person, for the tab's badge.
const seenKey = (e) => `ev:${e.id}:${e.updatedAt}`;
export const unseenEvents = () => (me() ? sharedEvents().filter((e) => e.by !== me() && e.date >= isoDate() && !seenItems.has(seenKey(e))) : []);
export function updateCalBadge() {
  const b = $('#calBadge');
  if (!b) return;
  const n = unseenEvents().length;
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : String(n);
}

let month = isoDate().slice(0, 7);
let selected = isoDate();
let editing = null;   // event being added / edited (a copy)
let openId = null;    // "<id>:<date>" of the event (or one date of a series) whose details are open
let note = '';

// ❤️ moments from the 2-2-2-2 rhythm and the dogs' ⭐ golden days, by date, for the calendar.
function marksByDay() {
  const hearts = {};
  for (const e of allRhythm()) (hearts[e.date] ||= []).push(e);
  return { hearts, dogs: goldenDays(), strong: strongDaysByPerson(`${month}-01`, `${month}-31`) };
}

function monthGrid(events, marks) {
  const first = new Date(`${month}-01T12:00:00`);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = isoDate();
  const cells = Array.from({ length: first.getDay() }, () => '<span class="cal-pad"></span>');
  for (let i = 1; i <= daysIn; i++) {
    const k = `${month}-${String(i).padStart(2, '0')}`;
    const evs = eventsOn(events, k);
    cells.push(`<button type="button" class="cd ${k === selected ? 'sel' : ''} ${k === today ? 'today' : ''}" data-calday="${k}" aria-label="${k}${evs.length ? `, ${evs.length} events` : ''}">
      <span>${i}</span><span class="dots">${evs.slice(0, 3).map((e) => `<i class="${whoClass(e.who)}"></i>`).join('')}</span>${marks.hearts[k] || marks.dogs[k]?.best || marks.strong[k] ? `<span class="marks">${marks.strong[k] ? '💪' : ''}${marks.dogs[k]?.best ? '⭐' : ''}${marks.hearts[k] ? '❤️' : ''}</span>` : ''}</button>`);
  }
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="card">
    <div class="row between" style="margin-top:0"><button type="button" class="ghost small" data-calmonth="-1" aria-label="Previous month">‹</button><b>${title}</b><button type="button" class="ghost small" data-calmonth="1" aria-label="Next month">›</button></div>
    <div class="cal-grid month">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span class="cal-h">${x}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-key small muted"><i class="w-both"></i> Both <i class="w-p0"></i> ${esc(nameOf(PROFILES[0].id))} <i class="w-p1"></i> ${esc(nameOf(PROFILES[1].id))} <span class="mk">❤️ Us time</span> <span class="mk">⭐ Dogs' golden day</span> <span class="mk">💪 Weigh-in + meals logged</span></div>
    ${(() => { const hearts = Object.entries(marks.hearts).filter(([d]) => d.startsWith(month)); const dates = hearts.flatMap(([, l]) => l).filter((e) => e.kind === 'date').length; const gold = Object.entries(marks.dogs).filter(([d, x]) => d.startsWith(month) && x.best).length;
      return hearts.length || gold ? `<p class="small cal-month-sum">This month: ${dates ? `❤️ ${dates} date${dates === 1 ? '' : 's'}` : ''}${dates && gold ? ' · ' : ''}${gold ? `⭐ ${gold} golden day${gold === 1 ? '' : 's'} for the dogs` : ''}</p>` : ''; })()}
  </div>`;
}

function eventRow(e, { showDay = false } = {}) {
  const key = `${e.id}:${e.date}`;
  const open = openId === key;
  const rpt = repeatText(e);
  if (e.readonly) {
    return `<li class="ev ${open ? 'open' : ''} feed">
    <button type="button" class="ev-main" data-calopen="${key}">
      <span class="ev-time">${showDay ? `${dayLabel(e.date)}<br>` : ''}${e.allDay || !e.start ? 'All day' : time12(e.start)}</span>
      <span class="ev-body"><b>${esc(e.title)}</b>${e.place ? `<small class="muted">📍 ${esc(e.place)}</small>` : ''}<small class="muted">📲 ${esc(e.feed)}</small></span>
      <span class="who-chip ${whoClass(e.who)}">${esc(whoLabel(e.who))}</span>
    </button>
    ${open ? `<div class="ev-more"><p class="small">${e.allDay || !e.start ? 'All day' : `${time12(e.start)}${e.end ? `–${time12(e.end)}` : ''}`} · ${esc(dayLabel(e.date))}${rpt ? ` · 🔁 ${esc(rpt)}` : ''}</p>${e.notes ? `<p class="small">${esc(e.notes)}</p>` : ''}<p class="small muted">From ${esc(e.feed)} — change it in that calendar app.</p></div>` : ''}
  </li>`;
  }
  const added = PROFILES.filter((p) => profileStore(p.id).get('calAdded', {})[e.id]).map((p) => (p.id === me() ? 'you' : nameOf(p.id)));
  return `<li class="ev ${open ? 'open' : ''}">
    <button type="button" class="ev-main" data-calopen="${key}">
      <span class="ev-time">${showDay ? `${dayLabel(e.date)}<br>` : ''}${e.allDay || !e.start ? 'All day' : time12(e.start)}</span>
      <span class="ev-body"><b>${esc(e.title)}</b>${rpt ? `<small class="muted">🔁 ${esc(rpt)}</small>` : ''}${e.place ? `<small class="muted">📍 ${esc(e.place)}</small>` : ''}</span>
      <span class="who-chip ${whoClass(e.who)}">${esc(whoLabel(e.who))}</span>
    </button>
    ${open ? `<div class="ev-more">
      <p class="small">${e.allDay || !e.start ? 'All day' : `${time12(e.start)}${e.end ? `–${time12(e.end)}` : ''}`} · ${esc(dayLabel(e.date))}${e.remind !== '' && e.remind != null ? ` · 🔔 ${esc(REMINDERS[e.remind] || '')}` : ''}</p>
      ${e.notes ? `<p class="small">${esc(e.notes)}</p>` : ''}
      <p class="small muted">Added by ${e.by === me() ? 'you' : esc(nameOf(e.by))}${added.length ? ` · in ${added.map((n) => (n === 'you' ? 'your' : `${esc(n)}'s`)).join(' & ')} calendar${added.length > 1 ? 's' : ''} ✓` : ''}</p>
      <div class="row wrap">
        <button type="button" class="small" data-calics="${e.id}"> Apple Calendar</button>
        <a class="btn small ghost" href="${esc(googleUrl(e, names()))}" target="_blank" rel="noopener" data-calgoogle="${e.id}">Google Calendar</a>
        <button type="button" class="ghost small" data-caledit="${e.id}">${rpt ? 'Edit series' : 'Edit'}</button>
        ${rpt ? `<button type="button" class="ghost small" data-calskip="${e.id}:${e.date}">Skip ${esc(dayLabel(e.date))}</button>` : ''}
        <button type="button" class="ghost small danger" data-caldel="${e.id}">${rpt ? 'Delete series' : 'Delete'}</button>
      </div>
    </div>` : ''}
  </li>`;
}

function form() {
  const e = editing;
  const whoOpts = [[WHO_BOTH, 'Both'], ...PROFILES.map((p) => [p.id, nameOf(p.id)])];
  return `<form id="calForm" class="card cal-form">
    <div class="eyebrow">${e.createdAt ? 'Edit event' : 'New event'}</div>
    <input name="title" value="${esc(e.title || '')}" maxlength="80" placeholder="What? e.g. Vet visit, dinner with the Patels" required>
    <div class="row"><input type="date" name="date" value="${esc(e.date)}" required aria-label="Date">
      <label class="small check"><input type="checkbox" name="allDay" ${e.allDay ? 'checked' : ''}> All day</label></div>
    <div class="row times" ${e.allDay ? 'hidden' : ''}><label class="small">Starts <input type="time" name="start" value="${esc(e.start || '')}"></label><label class="small">Ends <input type="time" name="end" value="${esc(e.end || '')}"></label></div>
    <input name="place" value="${esc(e.place || '')}" maxlength="80" placeholder="Where? (optional)">
    <div class="seg who-pick">${whoOpts.map(([k, l]) => `<button type="button" class="${(e.who || WHO_BOTH) === k ? 'on' : ''}" data-calwho="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="repeat-box">
      <label class="small">Repeats <select name="repeat">${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}" ${(e.repeat?.kind || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${repeatUnit(e.repeat?.kind) ? `<label class="small every">Every <input type="number" name="every" min="1" max="99" inputmode="numeric" value="${esc(e.repeat?.every || 1)}"> ${repeatUnit(e.repeat.kind)}(s)</label>` : ''}
      ${e.repeat?.kind === 'twiceMonthly' ? `<label class="small">and on the <select name="day2">${[...Array.from({ length: 28 }, (_, i) => [String(i + 1), `${i + 1}`]), ['-1', 'last day']].map(([k, l]) => `<option value="${k}" ${String(e.repeat?.day2 ?? 15) === k ? 'selected' : ''}>${l}</option>`).join('')}</select> of each month (first date is the event's day)</label>` : ''}
      ${e.repeat?.kind ? `<label class="small">Ends <input type="date" name="until" value="${esc(e.repeat?.until || '')}" min="${esc(e.date)}"> <span class="muted">(leave empty for never)</span></label>` : ''}
    </div>
    <label class="small">Reminder <select name="remind">${Object.entries(REMINDERS).map(([k, l]) => `<option value="${k}" ${String(e.remind ?? 30) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <textarea name="notes" rows="2" maxlength="500" placeholder="Notes (optional)">${esc(e.notes || '')}</textarea>
    <div class="row end"><button type="button" class="ghost" data-calcancel>Cancel</button><button type="submit">Save</button></div>
  </form>`;
}

function subscribeCard() {
  const s = sync.settings();
  if (!s?.url || !s?.code) return '';
  const https = `${s.url}/household/${encodeURIComponent(s.code)}/calendar.ics`;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return `<details class="card cal-sub"><summary><b>Show this calendar in Apple or Google Calendar</b></summary>
    <p class="small">Subscribe once on each phone and every shared event appears in your own calendar app, updating on its own.</p>
    <div class="row wrap"><a class="btn small" href="${esc(webcal)}"> Subscribe in Apple Calendar</a>
      <a class="btn small ghost" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <button type="button" class="ghost small" data-calcopy="${esc(https)}">Copy link</button></div>
    <p class="small muted">Subscribed calendars don't carry reminders — use “ Apple Calendar” on an event for one with its reminder. Needs the updated connector (server/README.md). The link includes your household code, so share it only with each other.</p>
  </details>`;
}

export function renderCal() {
  if (me() && allFeeds().some((f) => !fresh(f))) setTimeout(() => refreshFeeds().catch(() => {}), 0);
  const el = $('#calBoard');
  if (!el || !me()) return;
  const events = allEvents();
  // Opening the tab marks the other person's new events as seen.
  if (document.querySelector('#tab-calendar.active')) { seenItems.add(unseenEvents().map(seenKey)); updateCalBadge(); }
  if (editing) { el.innerHTML = form(); return; }
  const dayEvents = eventsOn(events, selected);
  const marks = marksByDay();
  const dayHearts = marks.hearts[selected] || [];
  const dayDogs = marks.dogs[selected];
  const dayMarks = [
    ...dayHearts.map((e) => `<li class="mark-row">❤️ <span>${momentIcon(e) === '❤️' ? '' : `${momentIcon(e)} `}${esc(momentText(e))}</span>${e.kind === 'date' && e.place ? ` <a class="small" href="https://maps.apple.com/?q=${encodeURIComponent(e.place)}" target="_blank" rel="noopener">map</a>` : ''}<button type="button" class="linkish small" data-redit="${e.id}">✎ Edit</button></li>`),
    ...((marks.strong[selected] || []).length ? [`<li class="mark-row">💪 <span>${marks.strong[selected].map((id) => esc(nameOf(id))).join(' & ')} checked in: weigh-in and all meals logged</span></li>`] : []),
    ...(dayDogs?.best ? [`<li class="mark-row">⭐ <span>Golden day for the dogs · ${dayDogs.outings} outing${dayDogs.outings === 1 ? '' : 's'}${dayDogs.treat ? ' + a treat' : ''}</span></li>`]
      : dayDogs?.outings ? [`<li class="mark-row muted">🐾 <span>Dogs out ${dayDogs.outings}×${dayDogs.treat ? ' + a treat' : ''}</span></li>`] : []),
  ];
  const next = upcoming(events, isoDate(), nowHHMM(), 6).filter((e) => e.date !== selected);
  el.innerHTML = `
    <button type="button" class="add-show" data-caladd>＋ Add an event</button>
    ${monthGrid(events, marks)}
    <div class="card"><div class="eyebrow">${esc(dayLabel(selected))}${selected !== isoDate() ? ` · ${new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}` : ''}</div>
      <div class="r-cal">
        ${dayMarks.length ? `<ul class="mark-list">${dayMarks.join('')}</ul>` : ''}
        ${momentFormOpen('cal') ? momentFormHtml() : selected <= isoDate() ? `<button type="button" class="ghost small" data-rdid="date" data-rday="${selected}">❤️ Log a date on this day</button>` : ''}
      </div>
      ${dayEvents.length ? `<ul class="ev-list">${dayEvents.map((e) => eventRow(e)).join('')}</ul>` : dayMarks.length ? '' : '<p class="small muted">Nothing planned. Tap ＋ to add something.</p>'}</div>
    ${next.length ? `<div class="card"><div class="eyebrow">Coming up</div><ul class="ev-list">${next.map((e) => eventRow(e, { showDay: true })).join('')}</ul></div>` : ''}
    ${note ? `<p class="small">${esc(note)}</p>` : ''}
    ${bringInCard()}
    ${subscribeCard()}`;
}

// Home: today's events (or the next one) in one card.
export function homeCal() {
  if (!me()) return '';
  const events = allEvents();
  const today = isoDate();
  const todays = eventsOn(events, today);
  const next = upcoming(events, today, nowHHMM(), 3).filter((e) => e.date !== today);
  return `<button type="button" class="card home-card home-cal" data-goto="calendar">
    <span class="home-ico">📅</span>
    <span class="home-main"><b>${todays.length ? `Today · ${todays.length} event${todays.length === 1 ? '' : 's'}` : 'Nothing on the calendar today'}</b>
      ${todays.slice(0, 4).map((e) => `<small><span class="who-dot ${whoClass(e.who)}"></span>${e.allDay || !e.start ? 'All day' : time12(e.start)} · ${esc(e.title)}${e.who && e.who !== WHO_BOTH ? ` <span class="muted">(${esc(nameOf(e.who))})</span>` : ''}</small>`).join('')}
      ${!todays.length && next[0] ? `<small class="muted">Next: ${esc(dayLabel(next[0].date))}${next[0].start && !next[0].allDay ? ` ${time12(next[0].start)}` : ''} · ${esc(next[0].title)}</small>` : ''}</span>
    <span class="home-go">›</span></button>`;
}

function readForm() {
  const f = $('#calForm');
  const v = (n) => f.elements[n]?.value?.trim() || '';
  const kind = v('repeat');
  const repeat = kind ? { kind, ...(repeatUnit(kind) && f.elements.every ? { every: Math.max(1, +v('every') || 1) } : {}), ...(kind === 'twiceMonthly' ? { day2: +(f.elements.day2 ? v('day2') : 15) } : {}), ...(f.elements.until && v('until') ? { until: v('until') } : {}) } : null;
  editing = { ...editing, title: v('title'), date: v('date'), allDay: f.elements.allDay.checked, start: v('start'), end: v('end'), place: v('place'), remind: v('remind'), notes: v('notes'), repeat };
}
function downloadIcs(e) {
  const blob = new Blob([icsCalendar([e], { names: names(), name: e.title })], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${e.title.replace(/[^\w -]+/g, '').slice(0, 40) || 'event'}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function markAdded(id) {
  const s = profileStore(me());
  s.set('calAdded', { ...s.get('calAdded', {}), [id]: Date.now() });
  pushNow().catch(() => {});
}

export function initCal(root) {
  // Logged / edited ❤️ moments redraw the calendar.
  window.addEventListener('lp:rhythm', () => { if (document.querySelector('#tab-calendar.active')) renderCal(); });
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, a');
    if (!t || !t.closest('#calBoard')) return;
    const d = t.dataset;
    if (d.linkwho) { linkWho = d.linkwho; const f = $('#feedForm'); const keep = f ? [f.elements.name.value, f.elements.url.value] : null; renderCal(); if (keep && $('#feedForm')) { $('#feedForm').elements.name.value = keep[0]; $('#feedForm').elements.url.value = keep[1]; } return; }
    if (d.feedpaste != null) {
      navigator.clipboard?.readText?.().then((txt) => { const u = $('#feedForm [name=url]'); if (u && txt) { u.value = txt.trim(); note = ''; } }).catch(() => { note = 'Long-press the box and choose Paste.'; renderCal(); });
      return;
    }
    if (d.feedrefresh) { refreshFeeds(true); note = 'Refreshing…'; renderCal(); return; }
    if (d.feeddel) {
      if (!confirm('Unlink this calendar? Its events leave this app (nothing changes in the calendar itself).')) return;
      const s = profileStore(me()); s.set('calFeeds', s.get('calFeeds', []).filter((f) => f.id !== d.feeddel)); pushNow().catch(() => {});
      const c = feedCache(); delete c[d.feeddel]; global.set('calFeedCache', c); renderCal(); return;
    }
    if (d.caladd != null) { editing = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: selected, who: WHO_BOTH, remind: '30', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }; renderCal(); $('#calForm [name=title]')?.focus(); }
    else if (d.calcancel != null) { editing = null; renderCal(); }
    else if (d.calwho) { readForm(); editing.who = d.calwho; renderCal(); }
    else if (d.calmonth) { const m = new Date(`${month}-15T12:00:00`); m.setMonth(m.getMonth() + +d.calmonth); month = isoDate(m).slice(0, 7); renderCal(); }
    else if (d.calday) { selected = d.calday; openId = null; closeMoment('cal'); renderCal(); }
    else if (d.calopen) { openId = openId === d.calopen ? null : d.calopen; note = ''; renderCal(); }
    else if (d.caledit) { editing = { ...allEvents().find((e) => e.id === d.caledit) }; renderCal(); }
    else if (d.caldel) {
      const e = allEvents().find((x) => x.id === d.caldel);
      if (!e || !confirm(e.repeat?.kind ? `Delete every “${e.title}” (the whole series) for both of you?` : `Delete “${e.title}” for both of you?`)) return;
      saveEvent({ ...e, deleted: true }); openId = null; renderCal();
    } else if (d.calskip) {
      const [id, day] = d.calskip.split(':');
      const e = allEvents().find((x) => x.id === id);
      if (!e || !confirm(`Skip “${e.title}” on ${dayLabel(day)} only?`)) return;
      saveEvent({ ...e, skip: [...new Set([...(e.skip || []), day])] }); openId = null; renderCal();
    } else if (d.calics) {
      const e = allEvents().find((x) => x.id === d.calics);
      if (!e) return;
      downloadIcs(e); markAdded(e.id);
      note = 'Opened the calendar file — tap Add to save it (with its reminder) to Apple Calendar.';
      renderCal();
    } else if (d.calgoogle) { markAdded(d.calgoogle); setTimeout(renderCal, 300); }
    else if (d.calcopy) { navigator.clipboard?.writeText(d.calcopy).then(() => { note = 'Calendar link copied.'; renderCal(); }).catch(() => {}); }
  });
  root.addEventListener('change', async (ev) => {
    if (ev.target.dataset?.icsimport != null) {
      const file = ev.target.files?.[0];
      if (!file) return;
      const events = parseIcs(await file.text(), { localTz: localTz(), from: isoDate(new Date(Date.now() - 30 * 864e5)), who: linkWho || me() });
      const s = profileStore(me());
      const have = new Set(sharedEvents().map((e) => e.id));
      const fresh = events.filter((e) => !have.has(e.id)).map((e) => ({ ...e, remind: '', updatedAt: Date.now(), by: me(), createdAt: Date.now() }));
      s.set('events', [...s.get('events', []), ...fresh].slice(-1500));
      pushNow().catch(() => {});
      note = fresh.length ? `Imported ${fresh.length} event${fresh.length === 1 ? '' : 's'}${events.length > fresh.length ? ` (${events.length - fresh.length} already here)` : ''}.` : 'Nothing new in that file.';
      renderCal();
      return;
    }
    if (['allDay', 'repeat'].includes(ev.target.name) && ev.target.closest('#calForm')) { readForm(); renderCal(); }
  });
  root.addEventListener('submit', (ev) => {
    if (ev.target.id === 'feedForm') {
      ev.preventDefault();
      const f = ev.target;
      const url = f.elements.url.value.trim();
      if (!/^(webcals?|https):\/\//i.test(url)) { note = 'Paste the calendar link (it starts with webcal://).'; renderCal(); return; }
      // The iPhone's "Share Link" under Public Calendar is …icloud.com/published/…; an invitation
      // link (www.icloud.com/calendar/…) only works for people you invite in the Calendar app.
      if (/icloud\.com/i.test(url) && !/\/published\//i.test(url)) { note = 'That looks like an invitation link. Use the Public Calendar link instead: Calendar → Calendars → ⓘ → Public Calendar → Share Link → Copy.'; renderCal(); return; }
      const s = profileStore(me());
      const feed = { id: `f${Date.now().toString(36)}`, name: f.elements.name.value.trim() || `${nameOf(me())}'s calendar`, url, who: linkWho || me(), addedAt: Date.now() };
      s.set('calFeeds', [...s.get('calFeeds', []), feed]);
      pushNow().catch(() => {});
      note = 'Linked — loading its events…';
      renderCal();
      refreshFeeds(true);
      return;
    }
    if (ev.target.id !== 'calForm') return;
    ev.preventDefault();
    readForm();
    if (!editing.title || !editing.date) return;
    if (editing.allDay) { editing.start = ''; editing.end = ''; }
    const saved = { ...editing, createdAt: editing.createdAt || Date.now() };
    saveEvent(saved);
    if (!saved.repeat) delete saved.repeat;
    selected = saved.date; month = saved.date.slice(0, 7); openId = `${saved.id}:${saved.date}`; editing = null;
    note = 'Saved — Amani sees it too. Add it to your own calendar below.'.replace('Amani', nameOf(PROFILES.find((p) => p.id !== me())?.id || ''));
    renderCal();
  });
}
