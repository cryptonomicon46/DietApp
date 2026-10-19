// 👔 Dress for the day on the Calendar tab (both of you) and a row on Home (you): where the
// calendar puts you, that place's feels-like temperatures from leaving to getting home, and
// what to layer. Places and hand-picked days are shared between the two phones.
import { PROFILES, ownerId, profileStore, global } from './storage.js';
import { pushNow } from './sync.js';
import { allEvents } from './calTab.js';
import { eventsOn } from './calendar.js';
import { weatherUrls, parseWeather } from './brief.js';
import { PLACES, whereOn, dressFor, hourLabel } from './dress.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const DAYS_AHEAD = 7;

// ---------- shared places and picks (merged from both phones, newest wins) ----------
function merged(key) {
  const out = {};
  for (const p of PROFILES) for (const [k, v] of Object.entries(profileStore(p.id).get(key, {}) || {})) if (!out[k] || (v.at || 0) > (out[k].at || 0)) out[k] = v;
  return out;
}
export const allPlaces = () => [...PLACES, ...Object.values(merged('dressPlaces')).filter((p) => !p.deleted)];
const picks = () => merged('dressPicks');
function saveMine(key, id, value) {
  const s = profileStore(ownerId());
  s.set(key, { ...s.get(key, {}), [id]: { ...value, at: Date.now() } });
  pushNow().catch(() => {});
}

// ---------- weather per place (cached an hour) ----------
const loading = {};
async function hoursAt(place, date) {
  const cache = global.get('dressWx', {});
  let c = cache[place.id];
  if (!c || Date.now() - c.at > 60 * 60000 || c.lat !== place.lat) {
    loading[place.id] ||= fetch(weatherUrls(place, DAYS_AHEAD).forecast).then((r) => { if (!r.ok) throw new Error(`weather ${r.status}`); return r.json(); })
      .finally(() => { delete loading[place.id]; });
    const forecast = await loading[place.id];
    c = { at: Date.now(), lat: place.lat, forecast };
    global.set('dressWx', { ...global.get('dressWx', {}), [place.id]: c });
  }
  return parseWeather(c.forecast, null).filter((h) => isoDate(h.time) === date);
}

// Where `person` is on `date`, and the plan for it (null when there's no forecast yet).
export async function dressDay(person, date) {
  const where = whereOn(eventsOn(allEvents(), date), person, allPlaces(), picks()[`${person}|${date}`]?.place || null);
  const hours = await hoursAt(where.place, date);
  return { where, plan: dressFor(hours, where.leave, where.back) };
}

// ---------- Calendar card ----------
let placesOpen = false;
let msg = '';
const lastHtml = {};
const temps = (t) => `<div class="dress-temps"><span>🌅 ${hourLabel(t.leave.hour)} <b>${t.leave.f}°</b></span><i>→</i><span>☀️ ${hourLabel(t.peak.hour)} <b>${t.peak.f}°</b></span><i>→</i><span>🌆 ${hourLabel(t.back.hour)} <b>${t.back.f}°</b></span></div>`;
function personHtml(id, { where, plan }, date) {
  const opts = allPlaces().map((p) => `<option value="${esc(p.id)}" ${p.id === where.place.id ? 'selected' : ''}>${esc(p.name.split(',')[0])}</option>`).join('');
  const why = where.picked ? 'picked by hand' : where.fromCalendar ? `📅 from “${esc(where.event.title)}”` : 'nothing on the calendar — home';
  return `<div class="dress-person">
    <div class="row between dress-who"><b>${esc(nameOf(id))}</b>
      <select data-dresspick="${id}" data-dressdate="${date}" aria-label="Where ${esc(nameOf(id))} will be">${opts}${where.picked ? '<option value="">↺ Use the calendar</option>' : ''}</select></div>
    <small class="muted">${why} · out ${hourLabel(where.leave)}–${hourLabel(where.back)}</small>
    ${plan ? `${temps(plan.temps)}
      <div class="dress-shape">${esc(plan.label)}</div>
      <ul class="dress-layers">${plan.layers.map((l) => `<li><span>${l.icon}</span><span>${esc(l.text)}${l.carry ? ' <em class="dress-carry">take off later</em>' : ''}</span></li>`).join('')}</ul>
      ${plan.when ? `<p class="small dress-when">⏱ ${esc(plan.when)}</p>` : ''}
      ${plan.extras.length ? `<p class="small muted">${plan.extras.map(esc).join(' · ')}</p>` : ''}`
    : '<p class="small muted">No forecast for this day yet.</p>'}
  </div>`;
}
function placesHtml() {
  const custom = allPlaces().filter((p) => !PLACES.includes(p));
  return `<div class="dress-places">
    <div class="small muted">Places: ${PLACES.map((p) => esc(p.name)).join(', ')}${custom.length ? '' : ' — add more below.'}</div>
    ${custom.length ? `<div class="chips">${custom.map((p) => `<span class="chip">${esc(p.name)} <button type="button" class="linkish" data-dressdel="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button></span>`).join('')}</div>` : ''}
    <form class="row" id="dressPlaceForm"><input name="q" maxlength="60" placeholder="City or ZIP, e.g. Palo Alto or 94301" required><button type="submit">Add</button></form>
    <p class="small muted">A calendar event whose title or location names a place (“Office – SF”, “Oakland”) puts that person there for the day.</p>
  </div>`;
}
export function dressCard(date) {
  return `<div id="calDress" data-date="${date}">${lastHtml[date] || ''}</div>`;
}
export async function renderDress(date, force = false) {
  const el = $('#calDress');
  if (!el || !ownerId()) return;
  const today = isoDate();
  const last = isoDate(new Date(Date.now() + (DAYS_AHEAD - 1) * 864e5));
  const label = date === today ? 'today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  let body;
  if (date < today || date > last) body = `<p class="small muted">${date < today ? 'That day is past.' : 'Forecasts reach a week ahead — check back closer to the day.'}</p>`;
  else {
    if (!lastHtml[date]) el.innerHTML = '<div class="card dress-card"><div class="eyebrow">👔 Dress for the day</div><p class="small muted">Getting the weather…</p></div>';
    try {
      const people = [ownerId(), ...PROFILES.map((p) => p.id).filter((id) => id !== ownerId())];
      const days = await Promise.all(people.map((id) => dressDay(id, date)));
      body = people.map((id, i) => personHtml(id, days[i], date)).join('');
    } catch (err) { body = `<p class="small tone-warn">Couldn't get the weather (${esc(err.message)}).</p>`; }
  }
  const html = `<div class="card dress-card"><div class="row between" style="margin-top:0"><div class="eyebrow">👔 Dress for ${esc(label)}</div><button type="button" class="linkish small" data-dressplaces>📍 Places</button></div>
    ${body}
    ${placesOpen ? placesHtml() : ''}
    ${msg ? `<p class="small">${esc(msg)}</p>` : ''}
    <p class="small muted">Feels-like temperatures from when you leave to when you're home (from your calendar, else 8 AM–6 PM). Weather: Open-Meteo.</p></div>`;
  lastHtml[date] = html;
  const now = $('#calDress');
  // Don't wipe a place being typed, unless this render comes from that card's own buttons.
  const typing = document.activeElement?.matches?.('input') && now?.contains(document.activeElement);
  if (now && now.dataset.date === date && now.innerHTML !== html && (force || !typing)) now.innerHTML = html;
}

// ---------- Home: one row for you ----------
export async function homeDressRow(date) {
  const el = document.querySelector('[data-homedress]');
  const me = ownerId();
  if (!el || !me) return;
  try {
    const { where, plan } = await dressDay(me, date);
    if (!plan) { el.remove(); return; }
    const t = plan.temps;
    const weekday = ![0, 6].includes(new Date(`${date}T12:00:00`).getDay());
    el.innerHTML = `<span><b>👔 Dress for ${where.fromCalendar || weekday ? 'work' : 'the day'}</b> · ${esc(where.place.name.split(',')[0])} <span class="plan-temp">${t.leave.f}° → ${t.peak.f}° → ${t.back.f}°</span></span>
      <small class="muted">${esc(plan.summary)}${plan.rain >= 40 ? ' · ☔ umbrella' : ''}</small>`;
    el.hidden = false;
  } catch { el.remove(); }
}

export function initDress() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dressplaces], [data-dressdel]');
    if (!b) return;
    if (b.dataset.dressplaces != null) placesOpen = !placesOpen;
    else if (b.dataset.dressdel) {
      const p = allPlaces().find((x) => x.id === b.dataset.dressdel);
      if (!p || !confirm(`Remove ${p.name}?`)) return;
      saveMine('dressPlaces', p.id, { ...p, deleted: true });
    }
    renderDress($('#calDress')?.dataset.date || isoDate(), true);
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-dresspick]');
    if (!s) return;
    saveMine('dressPicks', `${s.dataset.dresspick}|${s.dataset.dressdate}`, { place: s.value });
    renderDress(s.dataset.dressdate, true);
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'dressPlaceForm') return;
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    msg = 'Looking it up…';
    renderDress($('#calDress')?.dataset.date || isoDate());
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.replace(/,.*$/, ''))}&count=5&language=en&format=json&countryCode=US`);
      const hits = (await res.json()).results || [];
      const state = (q.split(',')[1] || '').trim().toLowerCase();
      const r = hits.find((h) => state && (h.admin1 || '').toLowerCase().startsWith(state)) || hits[0];
      if (!r) throw new Error(`couldn't find “${q}”`);
      const zip = /^\d{5}$/.test(q) ? q : '';
      const name = `${r.name}${r.admin1 ? `, ${r.admin1}` : ''}`;
      if (allPlaces().some((p) => p.name.split(',')[0].toLowerCase() === r.name.toLowerCase())) throw new Error(`${r.name} is already a place`);
      const id = `pl${Date.now().toString(36)}`;
      saveMine('dressPlaces', id, { id, name, lat: +r.latitude.toFixed(4), lon: +r.longitude.toFixed(4), keys: [r.name.toLowerCase(), ...(zip ? [zip] : [])] });
      msg = `Added ${r.name}. Mention it in a calendar event, or pick it above.`;
    } catch (err) { msg = `Couldn't add it: ${err.message}`; }
    renderDress($('#calDress')?.dataset.date || isoDate(), true);
  });
}
