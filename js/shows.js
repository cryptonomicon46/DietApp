// "📺 Watching": the shows and movies we watch together, by month, with a year-end recap.
// Each person's additions, watch nights, ratings and status changes live in their own
// profile, so household sync carries them both ways; the lists below merge both phones.
import { PROFILES, ownerId, profileStore } from './storage.js';
import { pushNow } from './sync.js';

export const SERVICES = {
  netflix:   { name: 'Netflix',     bg: '#e50914', fg: '#fff' },
  hulu:      { name: 'Hulu',        bg: '#1ce783', fg: '#04260f' },
  max:       { name: 'HBO Max',     bg: '#5822b4', fg: '#fff' },
  prime:     { name: 'Prime Video', bg: '#00a8e1', fg: '#fff' },
  appletv:   { name: 'Apple TV+',   bg: '#222',    fg: '#fff' },
  disney:    { name: 'Disney+',     bg: '#113ccf', fg: '#fff' },
  peacock:   { name: 'Peacock',     bg: '#f7c600', fg: '#222' },
  paramount: { name: 'Paramount+',  bg: '#0064ff', fg: '#fff' },
  youtube:   { name: 'YouTube',     bg: '#ff0033', fg: '#fff' },
  theater:   { name: 'Theater',     bg: '#8a5a00', fg: '#fff' },
  other:     { name: 'Other',       bg: '#6b7280', fg: '#fff' },
};
export const STATUS = { watching: '▶️ Watching', finished: '🎉 Finished', dropped: '✋ Dropped' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const me = () => ownerId();
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const monthName = (ym, month = 'long') => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month, year: 'numeric' });

// ---------- pure merging + stats (tested) ----------
// records: [{ person, shows: [{id, title, service, kind, date, at}], nights: [{show, date, at}],
//             status: {showId: {s, at, date}}, ratings: {showId: 1–5} }]
export function mergeShows(records) {
  const byId = new Map();
  for (const r of records) for (const s of r.shows || []) if (!byId.has(s.id)) byId.set(s.id, { ...s, by: r.person });
  const shows = [...byId.values()].map((s) => {
    // A night watched together counts once, whoever logged it.
    const nights = new Map();
    for (const r of records) for (const n of r.nights || []) if (n.show === s.id && !nights.has(n.date)) nights.set(n.date, { ...n, by: r.person });
    // The latest status change from either phone wins.
    const st = records.map((r) => r.status?.[s.id]).filter(Boolean).sort((a, b) => b.at - a.at)[0];
    const ratings = Object.fromEntries(records.filter((r) => r.ratings?.[s.id]).map((r) => [r.person, r.ratings[s.id]]));
    const vals = Object.values(ratings);
    return {
      ...s, nights: [...nights.values()].sort((a, b) => a.date.localeCompare(b.date)),
      status: st?.s || (s.kind === 'movie' ? 'finished' : 'watching'), statusDate: st?.date || (s.kind === 'movie' ? s.date : null),
      ratings, rating: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
    };
  }).filter((s) => s.status !== 'deleted');
  return shows.sort((a, b) => lastActive(b).localeCompare(lastActive(a)));
}
export const lastActive = (s) => [s.date, s.statusDate || '', ...s.nights.map((n) => n.date)].sort().pop();

// Months ('YYYY-MM') a show belongs to: when it was added, any night watched, when it finished.
export function showMonths(s) {
  return [...new Set([s.date, ...s.nights.map((n) => n.date), ...(s.status === 'finished' && s.statusDate ? [s.statusDate] : [])].map((d) => d.slice(0, 7)))].sort();
}
export function monthShows(shows, ym) {
  return shows.filter((s) => showMonths(s).includes(ym)).map((s) => ({ ...s, monthNights: s.nights.filter((n) => n.date.startsWith(ym)).length }));
}
export function yearRecap(shows, year) {
  const inYear = shows.filter((s) => showMonths(s).some((m) => m.startsWith(year)));
  const nights = inYear.reduce((a, s) => a + s.nights.filter((n) => n.date.startsWith(year)).length, 0);
  const perService = {};
  for (const s of inYear) perService[s.service] = (perService[s.service] || 0) + Math.max(1, s.nights.filter((n) => n.date.startsWith(year)).length);
  const topService = Object.entries(perService).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const most = [...inYear].sort((a, b) => b.nights.filter((n) => n.date.startsWith(year)).length - a.nights.filter((n) => n.date.startsWith(year)).length)[0];
  const rated = inYear.filter((s) => s.rating).sort((a, b) => b.rating - a.rating);
  const months = [...new Set(inYear.flatMap(showMonths))].filter((m) => m.startsWith(year)).sort();
  return {
    year, titles: inYear.length, nights,
    shows: inYear.filter((s) => s.kind !== 'movie').length, movies: inYear.filter((s) => s.kind === 'movie').length,
    finished: inYear.filter((s) => s.status === 'finished' && (s.statusDate || '').startsWith(year)).length,
    topService, perService,
    mostWatched: most && most.nights.some((n) => n.date.startsWith(year)) ? most : null,
    topRated: rated[0] || null,
    months: months.map((m) => ({ month: m, shows: monthShows(inYear, m) })),
  };
}

// ---------- this phone ----------
function records() {
  return PROFILES.map((p) => {
    const s = profileStore(p.id);
    return { person: p.id, shows: s.get('shows', []), nights: s.get('showNights', []), status: s.get('showStatus', {}), ratings: s.get('showRatings', {}) };
  });
}
let adding = false;
let addKind = 'show';
let addService = 'netflix';
let view = 'now'; // now | month | year
let openMonth = null;

const badge = (svc) => { const v = SERVICES[svc] || SERVICES.other; return `<span class="svc" style="background:${v.bg};color:${v.fg}">${esc(v.name)}</span>`; };
const stars = (n) => (n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '');

function showCard(s, opts = {}) {
  const today = isoDate();
  const tonight = s.nights.find((n) => n.date === today);
  const mineRating = s.ratings[me()] || 0;
  const partnerRatings = Object.entries(s.ratings).filter(([p]) => p !== me());
  const nightsText = s.kind === 'movie' ? `🍿 Movie${s.statusDate ? ` · ${new Date(`${s.statusDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
    : `${s.nights.length} night${s.nights.length === 1 ? '' : 's'} together${opts.monthNights != null ? ` · ${opts.monthNights} this month` : ''}`;
  return `<div class="show-card ${s.status}" data-show="${s.id}">
    <div class="show-top">${badge(s.service)}<span class="show-status">${STATUS[s.status] || ''}</span></div>
    <div class="show-title">${esc(s.title)}</div>
    <div class="small muted">${nightsText}${s.rating ? ` · ${s.rating}★ avg` : ''}</div>
    ${s.kind !== 'movie' && s.status === 'watching' ? `<button type="button" class="${tonight ? 'tonight on' : 'tonight'}" data-tonight="${s.id}">${tonight ? `✓ Watched tonight${tonight.by === me() ? '' : ` (${esc(nameOf(tonight.by))})`}` : '📺 We watched tonight'}</button>` : ''}
    <div class="show-rate"><span class="small muted">You</span>${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${n <= mineRating ? 'on' : ''}" data-rate="${s.id}:${n}" aria-label="Rate ${n} of 5">★</button>`).join('')}
      ${partnerRatings.map(([p, r]) => `<span class="small muted">· ${esc(nameOf(p))} <span class="stars">${stars(r)}</span></span>`).join('')}</div>
    <div class="show-actions">
      ${s.kind !== 'movie' ? Object.entries(STATUS).filter(([k]) => k !== s.status).map(([k, label]) => `<button type="button" class="linkish small" data-status="${s.id}:${k}">${label}</button>`).join('') : ''}
      ${s.by === me() ? `<button type="button" class="linkish small muted" data-delshow="${s.id}">Delete</button>` : ''}
    </div>
  </div>`;
}

function addForm() {
  if (!adding) return `<button type="button" class="add-show" data-addshow>＋ Add a show or movie</button>`;
  return `<form id="showForm" class="card show-form">
    <div class="seg">${[['show', '📺 Show'], ['movie', '🍿 Movie']].map(([k, l]) => `<button type="button" class="${addKind === k ? 'on' : ''}" data-addkind="${k}">${l}</button>`).join('')}</div>
    <input id="showTitle" maxlength="80" placeholder="${addKind === 'movie' ? 'Movie title' : 'Show title, e.g. The Bear'}" autocomplete="off" required>
    <div class="svc-pick">${Object.entries(SERVICES).map(([k, v]) => `<button type="button" class="svc-opt ${addService === k ? 'on' : ''}" data-addsvc="${k}" style="--svc:${v.bg}">${esc(v.name)}</button>`).join('')}</div>
    ${addKind === 'movie' ? '<label class="small">Watched on <input type="date" id="showDate"></label>' : ''}
    <div class="row"><button type="submit">Add</button><button type="button" class="ghost" data-canceladd>Cancel</button></div>
  </form>`;
}

export function renderShows(el) {
  const shows = mergeShows(records());
  const ym = isoDate().slice(0, 7);
  const year = ym.slice(0, 4);
  const views = [['now', 'Now'], ['month', 'By month'], ['year', `${year} recap`]];
  let body = '';
  if (view === 'now') {
    const watching = shows.filter((s) => s.status === 'watching');
    const thisMonth = monthShows(shows, ym).filter((s) => s.status !== 'watching');
    body = `${addForm()}
      <h3 class="note-day">Watching now</h3>
      ${watching.length ? watching.map((s) => showCard(s)).join('') : '<p class="small muted">Nothing on the go. Add what you\'re watching together.</p>'}
      ${thisMonth.length ? `<h3 class="note-day">Also in ${monthName(ym, 'long').split(' ')[0]}</h3>${thisMonth.map((s) => showCard(s, { monthNights: s.monthNights })).join('')}` : ''}`;
  } else if (view === 'month') {
    const months = [...new Set(shows.flatMap(showMonths))].sort().reverse();
    body = months.length ? months.map((m) => {
      const list = monthShows(shows, m);
      const nights = list.reduce((a, s) => a + s.monthNights, 0);
      return `<details class="month-shows" ${m === (openMonth || ym) ? 'open' : ''} data-month="${m}"><summary><b>${monthName(m)}</b><span class="small muted">${list.length} title${list.length === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}</span></summary>
        <ul class="month-list">${list.map((s) => `<li>${badge(s.service)}<span class="t">${esc(s.title)}${s.status === 'finished' && (s.statusDate || '').startsWith(m) ? ' 🎉' : ''}</span><span class="small muted">${s.kind === 'movie' ? '🍿' : `${s.monthNights}×`}${s.rating ? ` · ${s.rating}★` : ''}</span></li>`).join('')}</ul></details>`;
    }).join('') : '<p class="small muted">Nothing logged yet.</p>';
  } else {
    const r = yearRecap(shows, year);
    const svcRows = Object.entries(r.perService).sort((a, b) => b[1] - a[1]);
    const maxSvc = svcRows[0]?.[1] || 1;
    body = r.titles ? `<div class="card recap">
        <div class="eyebrow">📺 ${year} together</div>
        <div class="recap-stats"><div><b>${r.nights}</b><small>nights</small></div><div><b>${r.shows}</b><small>shows</small></div><div><b>${r.movies}</b><small>movies</small></div><div><b>${r.finished}</b><small>finished</small></div></div>
        ${r.mostWatched ? `<p>🏆 Most watched: <b>${esc(r.mostWatched.title)}</b> (${r.mostWatched.nights.filter((n) => n.date.startsWith(year)).length} nights)</p>` : ''}
        ${r.topRated ? `<p>⭐ Our favourite: <b>${esc(r.topRated.title)}</b> (${r.topRated.rating}★)</p>` : ''}
        ${r.topService ? `<p>Most of it on ${badge(r.topService)}</p>` : ''}
        <div class="svc-bars">${svcRows.map(([k, n]) => `<div class="svc-bar"><span class="small">${esc((SERVICES[k] || SERVICES.other).name)}</span><span class="bar"><span style="width:${Math.round((n / maxSvc) * 100)}%;background:${(SERVICES[k] || SERVICES.other).bg}"></span></span><span class="small muted">${n}</span></div>`).join('')}</div>
      </div>
      <h3 class="note-day">Month by month</h3>
      <ul class="year-months">${r.months.map((m) => `<li><b>${monthName(m.month, 'short').split(' ')[0]}</b><span>${m.shows.map((s) => esc(s.title)).join(', ')}</span></li>`).join('')}</ul>`
      : '<p class="small muted">Nothing logged this year yet.</p>';
  }
  el.innerHTML = `<div class="seg show-views">${views.map(([k, l]) => `<button type="button" class="${view === k ? 'on' : ''}" data-showview="${k}">${l}</button>`).join('')}</div>${body}`;
}

export function initShows(root, rerender) {
  const save = (key, value) => { profileStore(me()).set(key, value); rerender(); pushNow().then(rerender); };
  root.addEventListener('toggle', (e) => { if (e.target.dataset?.month && e.target.open) openMonth = e.target.dataset.month; }, true);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const s = profileStore(me());
    if (t.dataset.showview) { view = t.dataset.showview; rerender(); }
    else if (t.dataset.addshow != null) { adding = true; rerender(); $('#showTitle')?.focus(); }
    else if (t.dataset.canceladd != null) { adding = false; rerender(); }
    else if (t.dataset.addkind || t.dataset.addsvc) {
      const title = $('#showTitle')?.value || '';
      if (t.dataset.addkind) addKind = t.dataset.addkind; else addService = t.dataset.addsvc;
      rerender();
      if ($('#showTitle')) $('#showTitle').value = title;
    } else if (t.dataset.tonight) {
      const id = t.dataset.tonight;
      const today = isoDate();
      const mine = s.get('showNights', []);
      const show = mergeShows(records()).find((x) => x.id === id);
      const logged = show?.nights.find((n) => n.date === today);
      if (logged && logged.by !== me()) return; // your partner already logged tonight
      save('showNights', logged ? mine.filter((n) => !(n.show === id && n.date === today)) : [...mine, { show: id, date: today, at: Date.now() }].slice(-2000));
    } else if (t.dataset.rate) {
      const [id, n] = t.dataset.rate.split(':');
      const r = s.get('showRatings', {});
      if (r[id] === +n) delete r[id]; else r[id] = +n;
      save('showRatings', r);
    } else if (t.dataset.status) {
      const [id, st] = t.dataset.status.split(':');
      save('showStatus', { ...s.get('showStatus', {}), [id]: { s: st, at: Date.now(), date: isoDate() } });
    } else if (t.dataset.delshow) {
      if (!confirm('Delete this from your list?')) return;
      const id = t.dataset.delshow;
      s.set('shows', s.get('shows', []).filter((x) => x.id !== id));
      // Also hide it on the other phone, which may have logged nights against it.
      save('showStatus', { ...s.get('showStatus', {}), [id]: { s: 'deleted', at: Date.now(), date: isoDate() } });
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'showForm') return;
    e.preventDefault();
    const title = ($('#showTitle')?.value || '').trim();
    if (!title) { $('#showTitle')?.focus(); return; }
    const now = Date.now();
    const date = (addKind === 'movie' && $('#showDate')?.value) || isoDate();
    const show = { id: now.toString(36), title, service: addService, kind: addKind, date, at: now };
    adding = false;
    save('shows', [...profileStore(me()).get('shows', []), show].slice(-500));
  });
}
