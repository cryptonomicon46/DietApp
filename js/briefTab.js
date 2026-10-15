// The Brief tab: today's best windows to run, ride and walk the dogs, plus Movement classes.
import { store, global, PROFILES, ownerId, profileStore } from './storage.js';
import { pushNow } from './sync.js';
import {
  PLACE, weatherUrls, parseWeather, scoreHour, bestWindow, dogWalks, hottestPavement, asphaltF, pawRisk,
  GYMS, CLASS_TYPES, WEEKDAYS, classesOn, feedingSlot, whoFed,
} from './brief.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const range = (a, b) => `${clock(a)}–${clock(b)}`;
const CACHE_MIN = 30;

let weather = null;      // { hourly, sunrise, sunset, fetchedAt }
let loading = null;
let adding = false;

async function loadWeather(force = false) {
  const cached = global.get('weather', null);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MIN * 60000) return revive(cached);
  const urls = weatherUrls(PLACE);
  const [f, a] = await Promise.all([
    fetch(urls.forecast).then((r) => { if (!r.ok) throw new Error(`weather ${r.status}`); return r.json(); }),
    fetch(urls.air).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const data = { forecast: f, air: a, fetchedAt: Date.now() };
  global.set('weather', data);
  return revive(data);
}
function revive(data) {
  return {
    hourly: parseWeather(data.forecast, data.air),
    sunrise: data.forecast.daily?.sunrise?.map((t) => new Date(t)) || [],
    sunset: data.forecast.daily?.sunset?.map((t) => new Date(t)) || [],
    fetchedAt: data.fetchedAt,
  };
}

const tone = (score) => (score >= 75 ? 'good' : score >= 50 ? 'ok' : 'bad');
function hourLine(h) {
  return `${Math.round(h.temp)}°F${Math.abs(h.feels - h.temp) >= 3 ? ` (feels ${Math.round(h.feels)}°)` : ''} · ${h.rain}% rain · wind ${Math.round(h.wind)} mph${h.aqi != null ? ` · AQI ${h.aqi}` : ''}`;
}

function activityCard(icon, title, sub, hourly, activity, hours, from, until) {
  const w = bestWindow(hourly, activity, hours, from, until);
  if (!w || w.score <= 0) return `<div class="card brief-card"><div class="eyebrow">${icon} ${title}</div><p class="small muted">No good window left today — check tomorrow's.</p></div>`;
  const a = hourly[w.start], b = new Date(hourly[w.start + w.hours - 1].time.getTime() + 3600000);
  return `<div class="card brief-card">
    <div class="row between" style="margin-top:0"><div class="eyebrow">${icon} ${title} <small class="muted">· ${sub}</small></div><span class="score ${tone(w.score)}">${w.score}</span></div>
    <div class="brief-when">${range(a.time, b)}</div>
    <div class="small">${hourLine(a)}</div>
    ${w.why.length ? `<div class="small muted">Watch: ${esc(w.why.slice(0, 3).join(', '))}</div>` : '<div class="small tone-good">Great conditions</div>'}
  </div>`;
}

function dogCard(hourly, from) {
  const walks = dogWalks(hourly, from);
  const hot = hottestPavement(hourly, from);
  const slot = (label, w) => {
    if (!w) return `<li><span>${label}</span><span class="muted">—</span></li>`;
    const h = hourly[w.index];
    const pav = asphaltF(h.temp, h.radiation, h.wind);
    const risk = pawRisk(pav);
    return `<li><span><b>${label}: ${clock(h.time)}</b><small class="muted"> · ${Math.round(h.temp)}°F air · pavement ~${pav}°F</small></span><span class="paw ${risk.level}">${esc(risk.label)}</span></li>`;
  };
  const hotRisk = hot && pawRisk(hot.asphalt);
  return `<div class="card brief-card">
    <div class="eyebrow">🐕 Dog walks</div>
    <ul class="list">${slot('Morning', walks.morning)}${slot('Evening', walks.evening)}</ul>
    ${hot && hotRisk.level !== 'ok' ? `<p class="small tone-warn">Pavement peaks ~${hot.asphalt}°F around ${clock(hourly[hot.index].time)} — ${esc(hotRisk.label.toLowerCase())}. Back-of-hand test: if you can't hold it there 7 seconds, it's too hot for paws.</p>`
      : '<p class="small muted">Pavement estimate from air temperature, sunshine and wind. Back-of-hand test: 7 seconds on the pavement — too hot for you, too hot for paws.</p>'}
  </div>`;
}

function strip(hourly, from) {
  // Start at the first waking hour (5 AM) when looking at the night.
  while (from < hourly.length - 1 && hourly[from].time.getHours() < 5) from++;
  return `<div class="hour-strip" role="list">${hourly.slice(from, from + 17).map((h) => {
    const pav = asphaltF(h.temp, h.radiation, h.wind);
    const run = scoreHour(h, 'run').score;
    return `<div class="hr ${tone(run)}" role="listitem" title="Run score ${run}">
      <b>${clock(h.time)}</b><span>${Math.round(h.temp)}°</span><small>${h.rain}% 💧</small><small>${Math.round(h.wind)} mph</small><small class="paw-t ${pawRisk(pav).level}">${pav}° 🐾</small></div>`;
  }).join('')}</div>`;
}

// The day in order: best run, ride, both dog walks and your classes.
function dayPlan(hourly, from, end, today) {
  const items = [];
  const run = bestWindow(hourly, 'run', 1, from, end);
  if (run?.score > 0) items.push({ t: hourly[run.start].time, label: '🏃 Run 4 mi' });
  const bike = bestWindow(hourly, 'bike', 3, from, end);
  if (bike?.score > 0) items.push({ t: hourly[bike.start].time, label: '🚴 Ride 25–30 mi', note: `until ${clock(new Date(hourly[bike.start + 2].time.getTime() + 3600000))}` });
  const walks = dogWalks(hourly, from);
  for (const w of [walks.morning, walks.evening]) if (w) items.push({ t: hourly[w.index].time, label: '🐕 Walk the dogs' });
  for (const c of classesOn(store.get('gymClasses', []), today)) {
    const [hh, mm] = c.time.split(':').map(Number);
    const t = new Date(today); t.setHours(hh, mm, 0, 0);
    items.push({ t, label: `${CLASS_TYPES[c.type]?.split(' ')[0] || '🧗'} ${c.name}`, note: GYMS[c.gym]?.short });
  }
  if (!items.length) return '';
  items.sort((a, b) => a.t - b.t);
  return `<div class="card brief-card"><div class="eyebrow">Your day</div>
    <ul class="list day-plan">${items.map((i) => `<li><span><b>${clock(i.t)}</b> ${esc(i.label)}</span>${i.note ? `<small class="muted">${esc(i.note)}</small>` : ''}</li>`).join('')}</ul>
    <p class="small muted">Run and ride are alternatives — pick whichever fits the day.</p></div>`;
}

function classesCard(today) {
  const classes = store.get('gymClasses', []);
  const todays = classesOn(classes, today);
  const gymBlock = (key) => {
    const g = GYMS[key];
    const list = todays.filter((c) => c.gym === key);
    return `<div class="gym">
      <div class="row between" style="margin-top:0"><b>${g.short}</b><span class="small"><a href="${g.url}" target="_blank" rel="noopener">Live schedule ↗</a> · <a href="https://maps.apple.com/?q=${encodeURIComponent(g.name + ', ' + g.address)}" target="_blank" rel="noopener">map</a></span></div>
      ${list.length ? `<ul class="list">${list.map((c) => `<li><span>${esc(CLASS_TYPES[c.type] || '')} ${esc(c.name)}</span><span>${esc(c.time12 || c.time)} <button class="x" data-delclass="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">✕</button></span></li>`).join('')}</ul>`
        : '<p class="small muted">None of your classes here today.</p>'}
    </div>`;
  };
  return `<div class="card brief-card">
    <div class="eyebrow">🧗 Movement · ${WEEKDAYS[today.getDay()]}</div>
    ${gymBlock('santaClara')}${gymBlock('sunnyvale')}
    ${adding ? `<form id="classForm" class="class-form">
        <div class="row"><select name="gym">${Object.entries(GYMS).map(([k, g]) => `<option value="${k}">${g.short}</option>`).join('')}</select>
          <select name="type">${Object.entries(CLASS_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <input name="name" maxlength="40" placeholder="Class, e.g. Power Flow, Core Fit" required>
        <div class="row"><input name="time" type="time" required aria-label="Start time">
          <div class="day-picks">${WEEKDAYS.map((d, i) => `<label><input type="checkbox" name="day" value="${i}" ${i === today.getDay() ? 'checked' : ''}><span>${d[0]}</span></label>`).join('')}</div></div>
        <div class="row end"><button type="button" class="ghost small" data-cancelclass>Cancel</button><button type="submit" class="small">Add class</button></div>
      </form>` : `<button type="button" class="ghost small" data-addclass>＋ Add a class I take</button>
      <p class="small muted">Add the yoga, fitness or climbing classes you go to (from the live schedule) and they'll show up here on those days.</p>`}
  </div>`;
}

// ---- 🐕 the big "dogs fed?" button, shared by both phones ----
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
function feedRecords() {
  return PROFILES.map((p) => ({ person: p.id, name: nameOf(p.id), fed: profileStore(p.id).get('dogFed', {}) }));
}
export function renderFeed() {
  const el = $('#feedDogs');
  if (!el || !ownerId()) return;
  const slot = feedingSlot();
  const fed = whoFed(feedRecords(), slot.key);
  // The 🐕 tab itself shows it from anywhere in the app: orange = still to feed, green = fed.
  const tab = document.querySelector('.tabs [data-tab="brief"]');
  if (tab) {
    tab.classList.toggle('dogs-hungry', !fed);
    tab.classList.toggle('dogs-fed', !!fed);
    tab.title = fed ? `Dogs fed (${slot.meal})` : `Dogs still need ${slot.meal}`;
  }
  const other = slot.meal === 'breakfast' ? null : whoFed(feedRecords(), slot.key.replace('dinner', 'breakfast'));
  const meal = slot.meal === 'breakfast' ? 'Breakfast' : 'Dinner';
  const mine = fed?.person === ownerId();
  el.innerHTML = `
    <button type="button" class="feed-btn ${fed ? 'fed' : 'hungry'}" data-feed aria-pressed="${!!fed}">
      <span class="feed-icon">${fed ? '✓' : '🦴'}</span>
      <span class="feed-title">${fed ? `${meal} done` : `Feed the dogs`}</span>
      <span class="feed-sub">${fed ? `${esc(mine ? 'You' : fed.name)} · ${clock(new Date(fed.at))}` : `${meal} · tap when fed`}</span>
    </button>
    <p class="small muted center">${fed ? `Resets ${slot.resets} for ${slot.meal === 'breakfast' ? 'dinner' : 'breakfast'}.` : `Resets ${slot.resets}.`}${other ? ` Breakfast: ${esc(other.person === ownerId() ? 'you' : other.name)} at ${clock(new Date(other.at))}.` : ''}${fed && !mine ? '' : ''}</p>`;
}
function toggleFeed() {
  const slot = feedingSlot();
  const fed = whoFed(feedRecords(), slot.key);
  const s = profileStore(ownerId());
  const mineAll = s.get('dogFed', {});
  if (fed) {
    if (fed.person !== ownerId()) { alert(`${fed.name} already fed them at ${clock(new Date(fed.at))}.`); return; }
    if (!confirm(`Undo — the dogs haven't had ${slot.meal} yet?`)) return;
    delete mineAll[slot.key];
  } else {
    mineAll[slot.key] = { at: Date.now() };
  }
  // Keep about two weeks of feedings.
  const keep = Object.keys(mineAll).sort().slice(-28);
  s.set('dogFed', Object.fromEntries(keep.map((k) => [k, mineAll[k]])));
  renderFeed();
  pushNow().then(renderFeed);
}

export async function renderBrief(force = false) {
  const el = $('#briefBody');
  if (!el) return;
  renderFeed();
  if (!weather || force) {
    el.innerHTML = `<p class="muted small">Getting San Jose weather…</p>`;
    try {
      loading ||= loadWeather(force);
      weather = await loading;
    } catch (err) {
      el.innerHTML = `<div class="card"><p class="tone-warn">Couldn't get the weather (${esc(err.message)}).</p><button type="button" data-briefrefresh>Try again</button></div>${classesCard(new Date())}`;
      return;
    } finally { loading = null; }
  }
  const { hourly } = weather;
  const now = new Date();
  let from = hourly.findIndex((h) => h.time.getTime() + 3600000 > now.getTime());
  if (from < 0) from = 0;
  // Today's remaining hours; after 8 PM, plan tomorrow instead.
  const late = now.getHours() >= 20;
  const dayOf = (i) => hourly[i].time.toDateString();
  if (late) from = hourly.findIndex((h) => h.time.toDateString() !== now.toDateString() && h.time.getHours() >= 5);
  const until = hourly.findIndex((h, i) => i > from && h.time.toDateString() !== dayOf(from));
  const end = until < 0 ? hourly.length : until;
  const cur = hourly[Math.max(0, hourly.findIndex((h) => h.time.getTime() + 3600000 > now.getTime()))];
  const target = hourly[from].time;
  const sunIdx = weather.sunrise.findIndex((d) => d.toDateString() === target.toDateString());
  el.innerHTML = `
    <div class="card brief-now">
      <div class="eyebrow">${late ? 'Tomorrow' : 'Today'} · ${PLACE.name}</div>
      <div class="big">${Math.round(cur.temp)}°F <small>${esc(hourLine(cur).split(' · ').slice(1).join(' · '))}</small></div>
      ${sunIdx >= 0 ? `<div class="small muted">Sunrise ${clock(weather.sunrise[sunIdx])} · sunset ${clock(weather.sunset[sunIdx])} · updated ${clock(new Date(weather.fetchedAt))} <button type="button" class="linkish" data-briefrefresh>Refresh</button></div>` : ''}
    </div>
    ${dayPlan(hourly, from, end, target)}
    ${activityCard('🏃', 'Run 4 miles', '~40 min', hourly, 'run', 1, from, end)}
    ${activityCard('🚴', 'Ride 25–30 miles', '~2½ h, daylight', hourly, 'bike', 3, from, end)}
    ${dogCard(hourly, from)}
    ${classesCard(target)}
    <div class="card"><div class="eyebrow">Hour by hour</div>${strip(hourly, from)}
      <p class="small muted">Color = how good each hour is for a run. 🐾 = estimated pavement temperature. Weather and air quality: Open-Meteo.</p></div>`;
}

export function initBrief() {
  const root = $('#tab-brief');
  // Keep the tab's colour right as the 4 AM / 4 PM resets pass, on any tab.
  renderFeed();
  setInterval(renderFeed, 60000);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.feed != null) { toggleFeed(); return; }
    if (t.dataset.briefrefresh != null) { renderBrief(true); return; }
    if (t.dataset.addclass != null) { adding = true; renderBrief(); return; }
    if (t.dataset.cancelclass != null) { adding = false; renderBrief(); return; }
    if (t.dataset.delclass) {
      store.set('gymClasses', store.get('gymClasses', []).filter((c) => c.id !== t.dataset.delclass));
      renderBrief();
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'classForm') return;
    e.preventDefault();
    const f = e.target;
    const days = [...f.querySelectorAll('[name=day]:checked')].map((x) => +x.value);
    if (!days.length) return;
    const time = f.time.value;
    const time12 = new Date(`2000-01-01T${time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    store.set('gymClasses', [...store.get('gymClasses', []), { id: Date.now().toString(36), gym: f.gym.value, type: f.type.value, name: f.name.value.trim(), time, time12, days }]);
    adding = false;
    renderBrief();
  });
}
