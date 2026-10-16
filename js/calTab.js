// 📅 The Calendar tab: a shared calendar either partner can add to and edit, a month view,
// the chosen day's events, what's coming up, and buttons to put an event (with its reminder)
// into Apple or Google Calendar — or subscribe to the whole shared calendar there.
import { PROFILES, ownerId, profileStore, seenItems } from './storage.js';
import { sync, pushNow } from './sync.js';
import { REMINDERS, WHO_BOTH, mergeEvents, eventsOn, upcoming, icsCalendar, googleUrl } from './calendar.js';

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

export const allEvents = () => mergeEvents(PROFILES.map((p) => ({ person: p.id, events: profileStore(p.id).get('events', []) })));
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
export const unseenEvents = () => (me() ? allEvents().filter((e) => e.by !== me() && e.date >= isoDate() && !seenItems.has(seenKey(e))) : []);
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
let openId = null;    // event whose details are open
let note = '';

function monthGrid(events) {
  const first = new Date(`${month}-01T12:00:00`);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = isoDate();
  const cells = Array.from({ length: first.getDay() }, () => '<span class="cal-pad"></span>');
  for (let i = 1; i <= daysIn; i++) {
    const k = `${month}-${String(i).padStart(2, '0')}`;
    const evs = eventsOn(events, k);
    cells.push(`<button type="button" class="cd ${k === selected ? 'sel' : ''} ${k === today ? 'today' : ''}" data-calday="${k}" aria-label="${k}${evs.length ? `, ${evs.length} events` : ''}">
      <span>${i}</span><span class="dots">${evs.slice(0, 3).map((e) => `<i class="${whoClass(e.who)}"></i>`).join('')}</span></button>`);
  }
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="card">
    <div class="row between" style="margin-top:0"><button type="button" class="ghost small" data-calmonth="-1" aria-label="Previous month">‹</button><b>${title}</b><button type="button" class="ghost small" data-calmonth="1" aria-label="Next month">›</button></div>
    <div class="cal-grid month">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span class="cal-h">${x}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-key small muted"><i class="w-both"></i> Both <i class="w-p0"></i> ${esc(nameOf(PROFILES[0].id))} <i class="w-p1"></i> ${esc(nameOf(PROFILES[1].id))}</div>
  </div>`;
}

function eventRow(e, { showDay = false } = {}) {
  const open = openId === e.id;
  const added = PROFILES.filter((p) => profileStore(p.id).get('calAdded', {})[e.id]).map((p) => (p.id === me() ? 'you' : nameOf(p.id)));
  return `<li class="ev ${open ? 'open' : ''}">
    <button type="button" class="ev-main" data-calopen="${e.id}">
      <span class="ev-time">${showDay ? `${dayLabel(e.date)}<br>` : ''}${e.allDay || !e.start ? 'All day' : time12(e.start)}</span>
      <span class="ev-body"><b>${esc(e.title)}</b>${e.place ? `<small class="muted">📍 ${esc(e.place)}</small>` : ''}</span>
      <span class="who-chip ${whoClass(e.who)}">${esc(whoLabel(e.who))}</span>
    </button>
    ${open ? `<div class="ev-more">
      <p class="small">${e.allDay || !e.start ? 'All day' : `${time12(e.start)}${e.end ? `–${time12(e.end)}` : ''}`} · ${esc(dayLabel(e.date))}${e.remind !== '' && e.remind != null ? ` · 🔔 ${esc(REMINDERS[e.remind] || '')}` : ''}</p>
      ${e.notes ? `<p class="small">${esc(e.notes)}</p>` : ''}
      <p class="small muted">Added by ${e.by === me() ? 'you' : esc(nameOf(e.by))}${added.length ? ` · in ${added.map((n) => (n === 'you' ? 'your' : `${esc(n)}'s`)).join(' & ')} calendar${added.length > 1 ? 's' : ''} ✓` : ''}</p>
      <div class="row wrap">
        <button type="button" class="small" data-calics="${e.id}"> Apple Calendar</button>
        <a class="btn small ghost" href="${esc(googleUrl(e, names()))}" target="_blank" rel="noopener" data-calgoogle="${e.id}">Google Calendar</a>
        <button type="button" class="ghost small" data-caledit="${e.id}">Edit</button>
        <button type="button" class="ghost small danger" data-caldel="${e.id}">Delete</button>
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
  const el = $('#calBoard');
  if (!el || !me()) return;
  const events = allEvents();
  // Opening the tab marks the other person's new events as seen.
  if (document.querySelector('#tab-calendar.active')) { seenItems.add(unseenEvents().map(seenKey)); updateCalBadge(); }
  if (editing) { el.innerHTML = form(); return; }
  const dayEvents = eventsOn(events, selected);
  const next = upcoming(events, isoDate(), nowHHMM(), 6).filter((e) => e.date !== selected);
  el.innerHTML = `
    <button type="button" class="add-show" data-caladd>＋ Add an event</button>
    ${monthGrid(events)}
    <div class="card"><div class="eyebrow">${esc(dayLabel(selected))}${selected !== isoDate() ? ` · ${new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}` : ''}</div>
      ${dayEvents.length ? `<ul class="ev-list">${dayEvents.map((e) => eventRow(e)).join('')}</ul>` : '<p class="small muted">Nothing planned. Tap ＋ to add something.</p>'}</div>
    ${next.length ? `<div class="card"><div class="eyebrow">Coming up</div><ul class="ev-list">${next.map((e) => eventRow(e, { showDay: true })).join('')}</ul></div>` : ''}
    ${note ? `<p class="small">${esc(note)}</p>` : ''}
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
  editing = { ...editing, title: v('title'), date: v('date'), allDay: f.elements.allDay.checked, start: v('start'), end: v('end'), place: v('place'), remind: v('remind'), notes: v('notes') };
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
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, a');
    if (!t || !t.closest('#calBoard')) return;
    const d = t.dataset;
    if (d.caladd != null) { editing = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: selected, who: WHO_BOTH, remind: '30', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }; renderCal(); $('#calForm [name=title]')?.focus(); }
    else if (d.calcancel != null) { editing = null; renderCal(); }
    else if (d.calwho) { readForm(); editing.who = d.calwho; renderCal(); }
    else if (d.calmonth) { const m = new Date(`${month}-15T12:00:00`); m.setMonth(m.getMonth() + +d.calmonth); month = isoDate(m).slice(0, 7); renderCal(); }
    else if (d.calday) { selected = d.calday; openId = null; renderCal(); }
    else if (d.calopen) { openId = openId === d.calopen ? null : d.calopen; note = ''; renderCal(); }
    else if (d.caledit) { editing = { ...allEvents().find((e) => e.id === d.caledit) }; renderCal(); }
    else if (d.caldel) {
      const e = allEvents().find((x) => x.id === d.caldel);
      if (!e || !confirm(`Delete “${e.title}” for both of you?`)) return;
      saveEvent({ ...e, deleted: true }); openId = null; renderCal();
    } else if (d.calics) {
      const e = allEvents().find((x) => x.id === d.calics);
      if (!e) return;
      downloadIcs(e); markAdded(e.id);
      note = 'Opened the calendar file — tap Add to save it (with its reminder) to Apple Calendar.';
      renderCal();
    } else if (d.calgoogle) { markAdded(d.calgoogle); setTimeout(renderCal, 300); }
    else if (d.calcopy) { navigator.clipboard?.writeText(d.calcopy).then(() => { note = 'Calendar link copied.'; renderCal(); }).catch(() => {}); }
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.name === 'allDay' && ev.target.closest('#calForm')) { readForm(); renderCal(); }
  });
  root.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'calForm') return;
    ev.preventDefault();
    readForm();
    if (!editing.title || !editing.date) return;
    if (editing.allDay) { editing.start = ''; editing.end = ''; }
    const saved = { ...editing, createdAt: editing.createdAt || Date.now() };
    saveEvent(saved);
    selected = saved.date; month = saved.date.slice(0, 7); openId = saved.id; editing = null;
    note = 'Saved — Amani sees it too. Add it to your own calendar below.'.replace('Amani', nameOf(PROFILES.find((p) => p.id !== me())?.id || ''));
    renderCal();
  });
}
