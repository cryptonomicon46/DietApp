// The Brief tab: today's best windows to run, ride and walk the dogs, plus Movement classes.
import { store, global, PROFILES, ownerId, profileStore } from './storage.js';
import { pushNow } from './sync.js';
import {
  PLACE, weatherUrls, parseWeather, scoreHour, bestWindow, dogWalks, hottestPavement, asphaltF, pawRisk,
  BOTH, GYMS, gymSchedule, gymMap, CLASS_TYPES, WEEKDAYS, classesOn, planRange, feedingSlot, whoFed, walkDay, choreTimes, choreEntries, choreTally, monthWinner, coinsForYear, dogDays, happyStats, happyMonths, treatOn, isGolden,
} from './brief.js';
import { renderDogs, initDogs, allDogs, dogAlerts, retryUploads } from './dogs.js';
import { renderAdopt, initAdopt, retryAdoptUploads, unseenAdopt } from './adopt.js';

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

function dogCard(hourly, from, late = false) {
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
    <div class="eyebrow">🐕 ${late ? "Tomorrow's dog walks" : 'Dog walks'}</div>
    <ul class="list">${slot('Morning', walks.morning)}${slot('Evening', walks.evening)}</ul>
    ${hot && hotRisk.level !== 'ok' ? `<p class="small tone-warn">Pavement peaks ~${hot.asphalt}°F around ${clock(hourly[hot.index].time)} — ${esc(hotRisk.label.toLowerCase())}. Back-of-hand test: if you can't hold it there 7 seconds, it's too hot for paws.</p>`
      : '<p class="small muted">Pavement estimate from air temperature, sunshine and wind. Back-of-hand test: 7 seconds on the pavement — too hot for you, too hot for paws.</p>'}
  </div>`;
}

function strip(hourly, from, activity = 'run') {
  // Start at the first waking hour (5 AM) when looking at the night.
  while (from < hourly.length - 1 && hourly[from].time.getHours() < 5) from++;
  return `<div class="hour-strip" role="list">${hourly.slice(from, from + 17).map((h) => {
    const pav = asphaltF(h.temp, h.radiation, h.wind);
    const run = scoreHour(h, activity).score;
    return `<div class="hr ${tone(run)}" role="listitem" title="${activity === 'dog' ? 'Dog walk' : 'Run'} score ${run}">
      <b>${clock(h.time)}</b><span>${Math.round(h.temp)}°</span><small>${h.rain}% 💧</small><small>${Math.round(h.wind)} mph</small><small class="paw-t ${pawRisk(pav).level}">${pav}° 🐾</small></div>`;
  }).join('')}</div>`;
}

// Air temperature across a window, e.g. "58–64°F" (one number when it barely moves).
function tempRange(hourly, start, hours) {
  const ts = hourly.slice(start, start + hours + 1).map((h) => Math.round(h.temp));
  const lo = Math.min(...ts), hi = Math.max(...ts);
  return hi - lo < 2 ? `${lo}°F` : `${lo}–${hi}°F`;
}

// The day in order: best run, ride, both dog walks and your classes.
function dayPlan(hourly, from, end, today, late = false) {
  const items = [];
  const run = bestWindow(hourly, 'run', 1, from, end);
  const bike = bestWindow(hourly, 'bike', 3, from, end);
  const walks = dogWalks(hourly, from);
  // A dog walk inside a run or ride window rides along: 🐾 on that line instead of its own.
  const acts = [];
  if (run?.score > 0) acts.push({ w: run, item: { t: hourly[run.start].time, label: '🏃 Run 4 mi', temp: tempRange(hourly, run.start, 1) } });
  if (bike?.score > 0) acts.push({ w: bike, item: { t: hourly[bike.start].time, label: '🚴 Ride 25–30 mi', temp: tempRange(hourly, bike.start, 3), note: `until ${clock(new Date(hourly[bike.start + 2].time.getTime() + 3600000))}` } });
  for (const walk of [walks.morning, walks.evening]) {
    if (!walk) continue;
    const with_ = acts.filter((a) => walk.index >= a.w.start && walk.index < a.w.start + a.w.hours);
    if (with_.length) for (const a of with_) a.paw = true;
    else items.push({ t: hourly[walk.index].time, label: '🐕 Walk the dogs', temp: tempRange(hourly, walk.index, 1) });
  }
  for (const a of acts) items.push(a.paw ? { ...a.item, label: `${a.item.label} 🐾` } : a.item);
  for (const c of classesOn(store.get('gymClasses', []), today)) {
    const [hh, mm] = c.time.split(':').map(Number);
    const t = new Date(today); t.setHours(hh, mm, 0, 0);
    items.push({ t, label: `${CLASS_TYPES[c.type]?.split(' ')[0] || '🧗'} ${c.name}`, note: GYMS[c.gym]?.short });
  }
  if (!items.length) return '';
  items.sort((a, b) => a.t - b.t);
  return `<div class="card brief-card"><div class="eyebrow">${late ? `Tomorrow · ${today.toLocaleDateString(undefined, { weekday: 'long' })}` : 'Your day'}</div>
    <ul class="list day-plan">${items.map((i) => `<li><span><b>${clock(i.t)}</b> ${esc(i.label)}${i.temp ? ` <span class="plan-temp">${i.temp}</span>` : ''}</span>${i.note ? `<small class="muted">${esc(i.note)}</small>` : ''}</li>`).join('')}</ul>
    <p class="small muted">Run and ride are alternatives — pick whichever fits the day.${items.some((i) => i.label.endsWith('🐾')) ? ' 🐾 = a good time to walk the dogs too.' : ''}</p></div>`;
}

// Live schedule links: yoga and fitness classes at each gym, and the map.
const gymLinks = (key) => `<span class="small gym-links"><a href="${gymSchedule(key, 'yoga')}" target="_blank" rel="noopener">🧘 Yoga ↗</a> <a href="${gymSchedule(key, 'fitness')}" target="_blank" rel="noopener">🏋️ Fitness ↗</a> <a href="${gymMap(key)}" target="_blank" rel="noopener">map</a></span>`;
// Home: both gyms' class schedules, and the classes you take today (added on Train).
export function homeGym(today = new Date()) {
  const todays = classesOn(store.get('gymClasses', []), today);
  return `<div class="card home-gym">
    <div class="row between" style="margin-top:0"><div class="eyebrow">🧗 Movement classes · ${WEEKDAYS[today.getDay()]}</div><button type="button" class="linkish small" data-goto="lift">My classes ›</button></div>
    ${Object.keys(GYMS).map((key) => {
      const mine = todays.filter((c) => c.gym === key);
      return `<div class="gym">
        <div class="row between" style="margin-top:0"><b>${GYMS[key].short}</b>${gymLinks(key)}</div>
        ${mine.length ? `<ul class="list">${mine.map((c) => `<li><span>${esc(CLASS_TYPES[c.type] || '')} ${esc(c.name)}</span><span>${esc(c.time12 || c.time)}</span></li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('')}
    <p class="small muted">Opens Movement's live schedule for today's yoga and fitness classes. Going regularly? Add the class under Train › Movement and it shows here on those days.</p>
  </div>`;
}
function classesCard(today) {
  const classes = store.get('gymClasses', []);
  const todays = classesOn(classes, today);
  const gymBlock = (key) => {
    const g = GYMS[key];
    const list = todays.filter((c) => c.gym === key);
    return `<div class="gym">
      <div class="row between" style="margin-top:0"><b>${g.short}</b>${gymLinks(key)}</div>
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

// ---- 🐕 the big feed / walk / dog-park buttons, shared by both phones ----
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
function feedRecords(key = 'dogFed') {
  return PROFILES.map((p) => ({ person: p.id, name: nameOf(p.id), fed: profileStore(p.id).get(key, {}) }));
}
// Everyone's dog duties, for the scoreboard.
// 🦴 Treat: one shared button per day (resets at 6 AM). Either phone can tap it on or off.
const treatToday = () => treatOn(PROFILES.map((p) => ({ treats: profileStore(p.id).get('dogTreats', {}) })), walkDay());
function lastTreat() {
  const day = walkDay();
  return PROFILES.map((p) => profileStore(p.id).get('dogTreats', {})[day]).filter((t) => t?.on !== false && t).sort((a, b) => b.at - a.at)[0] || null;
}
function toggleTreat() {
  const on = !treatToday();
  if (!on && !confirm('Undo — no treat today after all?')) return;
  const s = profileStore(ownerId());
  const all = s.get('dogTreats', {});
  all[walkDay()] = { at: Date.now(), on };
  const keep = Object.keys(all).sort().slice(-400);
  s.set('dogTreats', Object.fromEntries(keep.map((k) => [k, all[k]])));
  renderFeed();
  pushNow().then(renderFeed);
}
// Treats & toys: one oblong, treat on top (a shared once-a-day yes/no), new toy below.
function treatButton() {
  const on = treatToday();
  const t = on && lastTreat();
  const month = walkDay().slice(0, 7);
  const toys = allToys();
  const thisMonth = toys.filter((x) => x.date.startsWith(month)).length;
  const toyToday = toys.some((x) => x.date === walkDay());
  return `<div class="feed-col">
      <div class="btn-head">🍪 <b>Treats &amp; toys</b><small>${on ? 'Treat given today' : 'Anyone can tap'}</small></div>
      <div class="feed-btn oval hsplit ${on || toyToday ? 'fed' : 'notreat'}">
        <button type="button" class="hhalf ${on ? 'on' : ''}" data-treat aria-pressed="${on}"><span class="nm nt">${on ? '✓ Treat' : '🍪 Treat'}</span>${on && t ? `<small>${clock(new Date(t.at))}</small>` : ''}</button>
        <button type="button" class="hhalf ${toyToday ? 'on' : ''}" data-newtoy><span class="nm nt">🧸 ${on ? 'Toy' : 'New toy'}</span>${thisMonth ? `<small>${thisMonth} this mo.</small>` : ''}</button>
      </div>
      <p class="small muted center">${on ? 'Tap the treat again to undo.' : 'Treat resets at 6 AM.'}${toys[0] ? ` Last toy: ${esc(toys[0].toy)}.` : ''}</p>
    </div>`;
}
function logNewToy() {
  const name = prompt('New toy! What is it? (optional)', '');
  if (name === null) return;
  const now = Date.now();
  saveToys([...profileStore(ownerId()).get('dogToys', []), { id: now.toString(36), toy: name.trim().slice(0, 60) || 'New toy', emoji: '🧸', date: isoDay(), at: now }]);
  renderFeed();
}

// Dog days for the shared calendar: {date: {outings, treat, best}} — best = a ⭐ golden day.
export const goldenDays = () => dogDays(dutyRecords());
function dutyRecords() {
  return PROFILES.map((p) => {
    const s = profileStore(p.id);
    return { person: p.id, name: nameOf(p.id), fed: s.get('dogFed', {}), walks: s.get('dogWalked', {}), park: s.get('dogPark', {}), treats: s.get('dogTreats', {}) };
  });
}
// Walks and dog-park trips can happen more than once a day; each tap logs one for you.
const CHORES = {
  walk: { key: 'dogWalked', icon: '🐾', todo: 'Walk the dogs', done: 'Walked', cls: 'unwalked', one: 'walk' },
  park: { key: 'dogPark', icon: '🌳', todo: 'Dog park', done: 'Park trip', cls: 'nopark', one: 'park trip' },
};
function todaysChore(kind) {
  const day = walkDay();
  return PROFILES.flatMap((p) => (choreEntries(profileStore(p.id).get(CHORES[kind].key, {}))[day] || [])
    .map((e) => ({ person: e.who || p.id, by: p.id, name: e.who === BOTH ? 'Both of you' : nameOf(e.who || p.id), at: e.at })))
    .sort((a, b) => a.at - b.at);
}
const whoName = (person, name) => (person === ownerId() ? 'You' : esc(name));
// An oblong button split across the middle: the top half logs it for the first person, the
// bottom half for the second — from either phone. Each name has its own color.
const halves = (attr, counts = {}) => PROFILES.map((p, i) => `<button type="button" class="hhalf ${counts[p.id] ? 'on' : ''}" ${attr} data-who="${p.id}" aria-label="${esc(nameOf(p.id))}"><span class="nm n${i}">${esc(nameOf(p.id))}</span>${counts[p.id] ? `<small>×${counts[p.id]}</small>` : ''}</button>`).join('');
// The left/right split this replaced:
const halvesV = (attr, counts = {}) => `<span class="halves">${PROFILES.map((p) => `<button type="button" class="half" ${attr} data-who="${p.id}" aria-label="${esc(nameOf(p.id))}"><b>${esc(nameOf(p.id))}</b><small>${counts[p.id] ? `×${counts[p.id]}` : '&nbsp;'}</small></button>`).join('')}</span>`;
function choreButton(kind) {
  const c = CHORES[kind];
  const list = todaysChore(kind);
  const by = {};
  for (const x of list) for (const p of (x.person === BOTH ? PROFILES.map((q) => q.id) : [x.person])) by[p] = (by[p] || 0) + 1;
  const together = list.filter((x) => x.person === BOTH).length;
  const last = list[list.length - 1];
  const sub = !list.length ? 'Who went?' : list.length === 1 ? `${esc(last.name)} · ${clock(new Date(last.at))}` : `${list.length} today`;
  const mine = list.some((x) => x.by === ownerId());
  return `<div class="feed-col">
      <div class="btn-head">${list.length ? '✓' : c.icon} <b>${list.length ? c.done : c.todo}</b><small>${sub}</small></div>
      <div class="feed-btn oval hsplit ${list.length ? 'fed' : c.cls}">${halves(`data-chore="${kind}"`, by)}</div>
      <button type="button" class="both-btn ${together ? 'on' : ''}" data-chore="${kind}" data-who="${BOTH}">👫 Both${together ? ` ×${together}` : ''}</button>
      <p class="small muted center">${list.length ? 'Tap a name to log another.' : 'Tap who did it · resets 6 AM.'}${mine ? ` <button type="button" class="linkish small" data-undochore="${kind}">Undo last</button>` : ''}</p>
    </div>`;
}
function logChore(kind, who = ownerId()) {
  const c = CHORES[kind];
  const n = todaysChore(kind).length;
  const whoText = who === BOTH ? 'both of you' : who === ownerId() ? 'you' : nameOf(who);
  if (n && !confirm(`Log another ${c.one} for ${whoText} today? (${n + 1} today)`)) return;
  const s = profileStore(ownerId());
  const all = s.get(c.key, {});
  const day = walkDay();
  const list = Array.isArray(all[day]) ? all[day] : all[day]?.at ? [all[day].at] : [];
  all[day] = [...list, who === ownerId() ? Date.now() : { at: Date.now(), who }];
  saveChore(s, c.key, all);
}
// Undo the last one logged on this phone (for either of you).
function undoChore(kind) {
  const c = CHORES[kind];
  const s = profileStore(ownerId());
  const all = s.get(c.key, {});
  const day = walkDay();
  const list = Array.isArray(all[day]) ? all[day] : all[day]?.at ? [all[day].at] : [];
  if (!list.length) return;
  const last = list[list.length - 1];
  const who = typeof last === 'object' && last.who ? (last.who === BOTH ? 'both of you' : nameOf(last.who)) : 'you';
  if (!confirm(`Undo the last ${c.one} logged on this phone (${who})?`)) return;
  all[day] = list.slice(0, -1);
  if (!all[day].length) delete all[day];
  saveChore(s, c.key, all);
}
// Keep about 13 months, so this year's and last month's scores are always there.
function saveChore(s, key, all) {
  const keep = Object.keys(all).sort().slice(-400);
  s.set(key, Object.fromEntries(keep.map((k) => [k, all[k]])));
  renderFeed();
  pushNow().then(renderFeed);
}

export function renderFeed() {
  const el = $('#feedDogs');
  if (!el || !ownerId()) return;
  const slot = feedingSlot();
  const fed = whoFed(feedRecords(), slot.key);
  const outings = todaysChore('walk').length + todaysChore('park').length;
  const walked = outings > 0;
  const best = isGolden(outings, treatToday());
  // The 🐕 tab shows it from anywhere in the app: red = still to feed, green = fed but not
  // out yet, bright green = fed and walked, gold = fed and a golden day (2+ walks, or walk + park).
  const tab = document.querySelector('.tabs [data-tab="brief"]');
  if (tab) {
    tab.classList.toggle('dogs-hungry', !fed);
    tab.classList.toggle('dogs-fed', !!fed && !walked);
    tab.classList.toggle('dogs-done', !!fed && walked && !best);
    tab.classList.toggle('dogs-best', !!fed && best);
    tab.title = !fed ? `Dogs still need ${slot.meal}` : best ? `Golden day: fed, and ${outings >= 2 ? 'out twice' : 'a walk and a treat'} ⭐` : walked ? `Dogs fed (${slot.meal}) and walked` : `Dogs fed (${slot.meal}) — not walked yet`;
  }
  const other = slot.meal === 'breakfast' ? null : whoFed(feedRecords(), slot.key.replace('dinner', 'breakfast'));
  const meal = slot.meal === 'breakfast' ? 'Breakfast' : 'Dinner';
  el.innerHTML = `
    <div class="feed-pair">
      <div class="feed-col">
        <div class="btn-head">${fed ? '✓' : '🦴'} <b>${fed ? `${meal} done` : 'Feed the dogs'}</b><small>${fed ? `${esc(fed.name)} · ${clock(new Date(fed.at))}` : `${meal} · who fed?`}</small></div>
        ${fed ? `<button type="button" class="feed-btn oval fed single" data-feedundo aria-pressed="true">
          <span class="nm n${Math.max(0, PROFILES.findIndex((p) => p.id === fed.person))}">${esc(fed.name)}</span><small>fed them · tap to undo</small>
        </button>` : `<div class="feed-btn oval hsplit hungry">${halves('data-feed')}</div>`}
        <p class="small muted center">${fed ? `Resets ${slot.resets} for ${slot.meal === 'breakfast' ? 'dinner' : 'breakfast'}.` : `Resets ${slot.resets}.`}${other ? ` Breakfast: ${esc(other.person === ownerId() ? 'you' : other.name)} at ${clock(new Date(other.at))}.` : ''}</p>
      </div>
      ${choreButton('walk')}
      ${choreButton('park')}
      ${treatButton()}
    </div>`;
  renderDuty();
  renderDogs();
  renderAdopt();
  if ($('#homeDogs')) $('#homeDogs').innerHTML = homeDogs();
}
// Home: the same three check-ins as small buttons, and how close today is to golden.
export function homeDogs() {
  if (!ownerId()) return '';
  const slot = feedingSlot();
  const fed = whoFed(feedRecords(), slot.key);
  const walks = todaysChore('walk'), park = todaysChore('park');
  const outings = walks.length + park.length;
  const treat = treatToday();
  const meal = slot.meal === 'breakfast' ? 'Breakfast' : 'Dinner';
  const names = (list) => [...new Set(list.map((x) => x.name))].map(esc).join(' & ');
  const minis = (attr, both) => `<span class="mini-halves">${PROFILES.map((p) => `<button type="button" ${attr} data-who="${p.id}">${esc(nameOf(p.id))}</button>`).join('')}${both ? `<button type="button" class="mini-both" ${attr} data-who="${BOTH}">Both</button>` : ''}</span>`;
  const chip = (done, icon, title, sub, attr, both) => `<div class="home-dog ${done ? 'done' : ''}"><span>${done ? '✓' : icon}</span><b>${title}</b><small>${sub}</small>${attr ? minis(attr, both) : ''}</div>`;
  return `<div class="card home-dogs">
    <div class="row between" style="margin-top:0"><div class="eyebrow">🐕 Dogs</div><button type="button" class="linkish small" data-goto="brief">Scores & golden days ›</button></div>
    <div class="home-dog-row">
      ${fed ? `<button type="button" class="home-dog done" data-feedundo><span>✓</span><b>${meal} done</b><small>${esc(fed.name)} · ${clock(new Date(fed.at))}</small></button>`
        : chip(false, '🦴', `Feed ${meal.toLowerCase()}`, 'Who fed them?', 'data-feed')}
      ${chip(walks.length > 0, '🐾', walks.length ? `Walked${walks.length > 1 ? ` ×${walks.length}` : ''}` : 'Walk', walks.length ? names(walks) : 'Who walked?', 'data-chore="walk"', true)}
      ${chip(park.length > 0, '🌳', park.length ? `Park${park.length > 1 ? ` ×${park.length}` : ''}` : 'Dog park', park.length ? names(park) : 'Who went?', 'data-chore="park"', true)}
      <div class="home-dog ${treat ? 'done' : ''}"><span>${treat ? '✓' : '🍪'}</span><b>${treat ? 'Treat given' : 'Treats & toys'}</b><small>${treat ? 'Tap Treat to undo' : 'Anyone can tap'}</small>
        <span class="mini-halves"><button type="button" data-treat>🍪 Treat</button><button type="button" data-newtoy>🧸 Toy</button></span></div>
    </div>
    ${(() => { const n = unseenAdopt(); return n.length ? `<p class="small" data-goto="brief">🏡 ${esc(nameOf(n[0].addedBy))} found ${n.length > 1 ? `${n.length} dogs` : esc(n[0].name || 'a dog')} up for adoption — see the bottom of Dogs.</p>` : ''; })()}
    ${dogAlerts(allDogs(), isoDay()).slice(0, 2).map((a) => `<p class="small tone-warn" data-goto="brief">⚠ ${esc(a.dog)}: ${esc(a.text)}</p>`).join('')}
    <p class="small ${isGolden(outings, treat) ? 'golden-note' : 'muted'}">${isGolden(outings, treat) ? `⭐ Golden day — ${outings >= 2 ? 'out twice today' : 'a walk and a treat'}!` : outings === 1 ? 'One more outing or a treat makes it a ⭐ golden day.' : treat ? 'Treat given — a walk makes it a ⭐ golden day.' : 'Two outings, or an outing and a treat, make a ⭐ golden day.'}</p>
  </div>`;
}

function toggleFeed(who = ownerId()) {
  const slot = feedingSlot();
  const fed = whoFed(feedRecords(), slot.key);
  const s = profileStore(ownerId());
  const mineAll = s.get('dogFed', {});
  if (fed) {
    // Only the phone that logged it can take it back.
    if (fed.by !== ownerId()) { alert(`${fed.name} fed them at ${clock(new Date(fed.at))} — logged on ${nameOf(fed.by)}'s phone, so undo it there.`); return; }
    if (!confirm(`Undo — the dogs haven't had ${slot.meal} yet?`)) return;
    delete mineAll[slot.key];
  } else {
    mineAll[slot.key] = who === ownerId() ? { at: Date.now() } : { at: Date.now(), who };
  }
  // Keep about 13 months of feedings for the scoreboard.
  const keep = Object.keys(mineAll).sort().slice(-800);
  s.set('dogFed', Object.fromEntries(keep.map((k) => [k, mineAll[k]])));
  renderFeed();
  pushNow().then(renderFeed);
}

// ---- 🐶 happy dog days: a calendar of this month, golden days, and the happiest month ----
function renderHappy(recs) {
  const el = $('#dogHappy');
  if (!el) return;
  const days = dogDays(recs);
  const today = walkDay();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const m = happyStats(days, month, today);
  const y = happyStats(days, year, today);
  const { months, happiest } = happyMonths(days, year, month);
  const top = Math.max(1, ...months.map((x) => x.best));
  el.innerHTML = `
    <div class="eyebrow">⭐ Golden days</div>
    <p class="small muted">A ⭐ golden day: two outings (walks or the dog park), or one outing and a treat.</p>
    <div class="happy-stats">
      <div><b>${m.best}</b><small>golden days in ${monthName(month)}</small></div>
      <div><b>${m.out}</b><small>days out</small></div>
      <div><b>${m.streak}</b><small>⭐ streak</small></div>
    </div>
    <button type="button" class="ghost small" data-goto="calendar">📅 Golden days are on the shared calendar ›</button>
    <div class="happy-year">
      <div class="small"><b>${year}</b>: ${y.best} golden days · ${y.out} days out${happiest ? ` · happiest month <b>${monthName(happiest)}</b> 🏆` : ''}</div>
      <div class="month-bars">${months.map((x) => `<div class="mb${x.month === happiest ? ' mb-top' : ''}" title="${monthName(x.month)}: ${x.best} golden days"><span class="mb-n">${x.best || ''}</span><span class="mb-bar" style="height:${Math.round((x.best / top) * 100)}%"></span><span class="mb-l">${monthName(x.month, 'narrow')}</span></div>`).join('')}</div>
    </div>`;
}

// ---- 🧸 new toys: who brought one home, and how many this month / year ----
const TOY_EMOJI = ['🧸', '🎾', '🦴', '🥏', '🪢', '🐿️', '🦆', '🍩'];
let toyAdding = false;
let toyEmoji = '🧸';
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function allToys() {
  return PROFILES.flatMap((p) => profileStore(p.id).get('dogToys', []).map((t) => ({ ...t, person: p.id, name: nameOf(p.id) })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
}
function renderToys() {
  const el = $('#dogToys');
  if (!el) return;
  const toys = allToys();
  const today = walkDay();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const n = (prefix) => toys.filter((t) => t.date.startsWith(prefix)).length;
  const form = toyAdding ? `<form id="toyForm" class="toy-form">
      <div class="toy-emoji">${TOY_EMOJI.map((e) => `<button type="button" class="${e === toyEmoji ? 'on' : ''}" data-toyemoji="${e}">${e}</button>`).join('')}</div>
      <input id="toyName" maxlength="60" placeholder="What is it? e.g. squeaky duck" autocomplete="off" required>
      <label class="small">Got it on <input type="date" id="toyDate" value="${isoDay()}" max="${isoDay()}"></label>
      <div class="row"><button type="submit">Add toy</button><button type="button" class="ghost" data-toycancel>Cancel</button></div>
    </form>` : '<button type="button" class="ghost" data-toyadd>＋ New toy</button>';
  el.innerHTML = `
    <div class="eyebrow">🧸 New toys</div>
    <div class="happy-stats toy-stats"><div><b>${n(month)}</b><small>in ${monthName(month)}</small></div><div><b>${n(year)}</b><small>in ${year}</small></div><div><b>${toys.length}</b><small>all time</small></div></div>
    ${form}
    ${toys.length ? `<ul class="toy-list">${toys.slice(0, 8).map((t) => `<li><span class="toy-e">${esc(t.emoji || '🧸')}</span><span><b>${esc(t.toy)}</b><small class="muted"> · ${shortDate(t.date)} · from ${t.person === ownerId() ? 'you' : esc(t.name)}</small></span>${t.person === ownerId() ? `<button type="button" class="x" data-toydel="${t.id}" aria-label="Remove ${esc(t.toy)}">✕</button>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Log each new toy and see how spoiled the dogs get this year.</p>'}`;
}
const isoDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function saveToys(list) {
  profileStore(ownerId()).set('dogToys', list.slice(-500));
  renderToys();
  pushNow().then(renderToys);
}

// ---- 🏆 dog duty scoreboard: today / this month / this year, and a 🪙 gold coin each month ----
let dutyView = 'month';
const monthName = (ym, style = 'long') => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: style });
const prevMonth = (ym) => { const d = new Date(`${ym}-15T12:00:00`); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
function renderDuty() {
  const el = $('#dogDuty');
  if (!el || !ownerId()) return;
  const recs = dutyRecords();
  renderHappy(recs);
  renderToys();
  // Me first, then my partner.
  const people = [...recs].sort((a, b) => (a.person === ownerId() ? -1 : b.person === ownerId() ? 1 : 0));
  const today = walkDay();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const prefix = { today, month, year }[dutyView];
  const t = choreTally(recs, prefix);
  const top = Math.max(...people.map((p) => t[p.person].total));
  const leader = people.filter((p) => t[p.person].total === top).length === 1 && top > 0 ? people.find((p) => t[p.person].total === top).person : null;
  const row = (icon, label, k) => `<tr><th scope="row">${icon} ${label}</th>${people.map((p) => `<td>${t[p.person][k]}</td>`).join('')}</tr>`;
  const sum = people.reduce((a, p) => a + t[p.person].total, 0);
  const bar = sum ? `<div class="duty-bar" role="img" aria-label="${people.map((p) => `${esc(p.name)} ${t[p.person].total}`).join(', ')}">${people.map((p, i) => `<span class="p${i}" style="flex:${t[p.person].total || 0.0001}"></span>`).join('')}</div>` : '';
  // 🪙 one gold coin for each finished month's winner.
  const { months, coins } = coinsForYear(recs, year, month);
  const last = month.endsWith('-01') ? monthWinner(recs, prevMonth(month)) : months[months.length - 1];
  const lastLine = last ? (last.winner
    ? `🪙 <b>${monthName(last.month)}</b> goes to <b>${esc(nameOf(last.winner))}</b> (${people.map((p) => last.tally[p.person].total).join('–')})`
    : last.tie ? `${monthName(last.month)} was a tie — no coin` : '') : '';
  const label = { today: 'Today', month: `${monthName(month)} so far`, year: `${year} so far` }[dutyView];
  el.innerHTML = `
    <div class="duty-head"><div class="eyebrow">🏆 Dog duty</div>
      <div class="seg small">${['today', 'month', 'year'].map((v) => `<button type="button" data-dutyview="${v}" class="${dutyView === v ? 'on' : ''}">${{ today: 'Today', month: 'Month', year: 'Year' }[v]}</button>`).join('')}</div></div>
    <p class="small muted">${label}${leader ? ` · ${esc(people.find((p) => p.person === leader).person === ownerId() ? 'you lead' : `${nameOf(leader)} leads`)} 👑` : top ? ' · all square' : ''}</p>
    <table class="duty-table">
      <thead><tr><th></th>${people.map((p, i) => `<th class="p${i}">${esc(p.person === ownerId() ? `${p.name} (you)` : p.name)}${p.person === leader ? ' 👑' : ''}</th>`).join('')}</tr></thead>
      <tbody>${row('🦴', 'Feedings', 'feed')}${row('🐾', 'Walks', 'walk')}${row('🌳', 'Dog park', 'park')}</tbody>
      <tfoot><tr><th scope="row">Total</th>${people.map((p) => `<td class="${p.person === leader ? 'lead' : ''}">${t[p.person].total}</td>`).join('')}</tr></tfoot>
    </table>
    ${bar}
    <div class="coins">
      <div class="small"><b>Gold coins ${year}</b> · one a month for the most feedings + walks + park trips</div>
      <div class="coin-row">${people.map((p) => `<span>${esc(p.name)} ${coins[p.person] ? `<span class="coin-stack" aria-label="${coins[p.person]} gold coins">${'🪙'.repeat(Math.min(coins[p.person], 12))}</span>` : '<span class="muted">—</span>'}</span>`).join('')}</div>
      ${lastLine ? `<p class="small">${lastLine}</p>` : ''}
      ${dutyView === 'year' && months.some((m) => m.winner || m.tie) ? `<ul class="coin-months">${months.filter((m) => m.winner || m.tie).map((m) => `<li><span>${monthName(m.month, 'short')}</span><span>${m.winner ? `🪙 ${esc(nameOf(m.winner))}` : 'tie'}</span><span class="muted">${people.map((p) => m.tally[p.person].total).join('–')}</span></li>`).join('')}</ul>` : ''}
    </div>`;
}

// Weather-driven cards live in three places: dog walks and paw safety on Dogs, run / ride
// windows and Movement classes on Train, and the day in order on Home.
export async function renderBrief(force = false) {
  renderFeed();
  const dogEl = $('#briefBody'), fitEl = $('#fitBrief'), homeEl = $('#homePlan');
  if (!weather || force) {
    if ($('#dogWalkTop')) $('#dogWalkTop').innerHTML = `<p class="muted small">Getting ${PLACE.name} weather…</p>`;
    if (fitEl) fitEl.innerHTML = `<p class="muted small">Getting ${PLACE.name} weather…</p>`;
    try {
      loading ||= loadWeather(force);
      weather = await loading;
    } catch (err) {
      const fail = `<div class="card"><p class="tone-warn">Couldn't get the weather (${esc(err.message)}).</p><button type="button" data-briefrefresh>Try again</button></div>`;
      if (dogEl) dogEl.innerHTML = '';
      if ($('#dogWalkTop')) $('#dogWalkTop').innerHTML = fail;
      if (fitEl) fitEl.innerHTML = fail + classesCard(new Date());
      if (homeEl) homeEl.innerHTML = '';
      return;
    } finally { loading = null; }
  }
  const { hourly } = weather;
  const now = new Date();
  // Today's remaining hours; from 9 PM (home by then), plan tomorrow instead.
  const { from, end, late } = planRange(hourly, now);
  const cur = hourly[Math.max(0, hourly.findIndex((h) => h.time.getTime() + 3600000 > now.getTime()))];
  const target = hourly[from].time;
  const sunIdx = weather.sunrise.findIndex((d) => d.toDateString() === target.toDateString());
  const nowCard = `<div class="card brief-now">
      <div class="eyebrow">${late ? 'Tomorrow' : 'Today'} · ${PLACE.name}</div>
      <div class="big">${Math.round(cur.temp)}°F <small>${esc(hourLine(cur).split(' · ').slice(1).join(' · '))}</small></div>
      ${sunIdx >= 0 ? `<div class="small muted">Sunrise ${clock(weather.sunrise[sunIdx])} · sunset ${clock(weather.sunset[sunIdx])} · updated ${clock(new Date(weather.fetchedAt))} <button type="button" class="linkish" data-briefrefresh>Refresh</button></div>` : ''}
    </div>`;
  if ($('#dogWalkTop')) $('#dogWalkTop').innerHTML = dogCard(hourly, from, late);
  if (dogEl) dogEl.innerHTML = `<div class="card"><div class="eyebrow">🐾 Pavement, hour by hour</div>${strip(hourly, from, 'dog')}
      <p class="small muted">Color = how good each hour is for a dog walk. Weather: Open-Meteo.</p></div>`;
  if (fitEl) fitEl.innerHTML = `${nowCard}
    ${activityCard('🏃', `${late ? 'Tomorrow · ' : ''}Run 4 miles`, '~40 min', hourly, 'run', 1, from, end)}
    ${activityCard('🚴', `${late ? 'Tomorrow · ' : ''}Ride 25–30 miles`, '~2½ h, daylight', hourly, 'bike', 3, from, end)}
    ${classesCard(target)}
    <div class="card"><div class="eyebrow">Hour by hour</div>${strip(hourly, from)}
      <p class="small muted">Color = how good each hour is for a run. Weather and air quality: Open-Meteo.</p></div>`;
  if (homeEl) homeEl.innerHTML = dayPlan(hourly, from, end, target, late);
}

export function initBrief() {
  // Dog buttons (Dogs and Home), classes and weather (Train) — one listener for all tabs.
  const root = $('main');
  initDogs(root);
  initAdopt(root);
  setTimeout(() => { retryUploads().catch(() => {}); retryAdoptUploads().catch(() => {}); }, 8000);
  // Keep the tab's colour right as the 4 AM / 4 PM resets pass, on any tab.
  renderFeed();
  setInterval(renderFeed, 60000);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.feed != null) { toggleFeed(t.dataset.who || ownerId()); return; }
    if (t.dataset.feedundo != null) { toggleFeed(); return; }
    if (t.dataset.treat != null) { toggleTreat(); return; }
    if (t.dataset.newtoy != null) { logNewToy(); return; }
    if (t.dataset.chore) { logChore(t.dataset.chore, t.dataset.who || ownerId()); return; }
    if (t.dataset.undochore) { undoChore(t.dataset.undochore); return; }
    if (t.dataset.dutyview) { dutyView = t.dataset.dutyview; renderDuty(); return; }
    if (t.dataset.toyadd != null) { toyAdding = true; renderToys(); $('#toyName')?.focus(); return; }
    if (t.dataset.toycancel != null) { toyAdding = false; renderToys(); return; }
    if (t.dataset.toyemoji) { const v = $('#toyName')?.value || ''; toyEmoji = t.dataset.toyemoji; renderToys(); if ($('#toyName')) $('#toyName').value = v; return; }
    if (t.dataset.toydel) {
      if (!confirm('Remove this toy?')) return;
      saveToys(profileStore(ownerId()).get('dogToys', []).filter((x) => x.id !== t.dataset.toydel));
      return;
    }
    if (t.dataset.briefrefresh != null) { renderBrief(true); return; }
    if (t.dataset.addclass != null) { adding = true; renderBrief(); return; }
    if (t.dataset.cancelclass != null) { adding = false; renderBrief(); return; }
    if (t.dataset.delclass) {
      store.set('gymClasses', store.get('gymClasses', []).filter((c) => c.id !== t.dataset.delclass));
      renderBrief();
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'toyForm') return;
    e.preventDefault();
    const toy = ($('#toyName')?.value || '').trim();
    if (!toy) return;
    const now = Date.now();
    toyAdding = false;
    const emoji = toyEmoji;
    toyEmoji = '🧸';
    saveToys([...profileStore(ownerId()).get('dogToys', []), { id: now.toString(36), toy, emoji, date: $('#toyDate')?.value || isoDay(), at: now }]);
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
