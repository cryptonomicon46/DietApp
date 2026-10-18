// 💞 The 2-2-2-2 rhythm for a close relationship: a date every 2 weeks, intimacy twice a week,
// an overnight trip twice a year and a multi-night getaway every 2 years — just the two of you.
// Either phone logs "we did it"; each phone keeps its own entries and both are combined. Home
// and the top of the Calendar tab show where you are, a gentle love note when one is coming up, and can
// suggest it to your partner for the coming weekend (as a "Feeling like" plan).
import { PROFILES, ownerId, profileStore } from './storage.js';
import { pushNow } from './sync.js';

export const RHYTHMS = {
  date:      { icon: '🍷', label: 'Date night', every: 'every 2 weeks', days: 14, soon: 3 },
  close:     { icon: '💗', label: 'Intimacy', every: 'twice a week', perWeek: 2 },
  overnight: { icon: '🧳', label: 'Overnight trip', every: 'twice a year', days: 182, soon: 30 },
  getaway:   { icon: '🌴', label: 'Multi-night getaway', every: 'every 2 years', days: 730, soon: 60 },
};
const ORDER = ['date', 'close', 'overnight', 'getaway'];
// Kinds older date logs were saved with (new ones are typed in freely as `what`).
export const DATE_TYPES = {
  dinner: { icon: '🍷', label: 'Drinks & dinner' },
  lunch:  { icon: '🥗', label: 'Lunch date' },
  coffee: { icon: '☕', label: 'Coffee shop' },
  books:  { icon: '📚', label: 'Bookshop' },
  day:    { icon: '☀️', label: 'Day date' },
  other:  { icon: '✨', label: 'Something else' },
};
// How a moment reads on the calendar and in the log.
export function momentText(e) {
  if (e.kind !== 'date') return RHYTHMS[e.kind]?.label || e.kind;
  const what = e.what || DATE_TYPES[e.type]?.label || 'Date night';
  return `${what}${e.place ? ` · ${e.place}` : ''}`;
}
// Icon for a moment: your own dates are simply ❤️ (older ones kept their kind's icon).
export const momentIcon = (e) => (e.kind === 'date' ? (!e.what && DATE_TYPES[e.type]?.icon) || '❤️' : RHYTHMS[e.kind]?.icon || '💞');

export const LOVE = {
  date: [
    'Two weeks fly by — time to take each other out on a date 🍷',
    'Date night is calling: dress up, phones away, just the two of you 💕',
    'Pick a spot you both love (or one you have never tried) and make it a date ✨',
    'A little romance goes a long way — plan a date this weekend 🌹',
  ],
  close: [
    'Make some unhurried time for each other this week 💗',
    'Slow down tonight: a candle, some music, and each other 🕯️',
    'Closeness keeps the spark — save an evening just for you two 💞',
  ],
  overnight: [
    'Time for a night away together — book the dog sitter and go 🧳🐾',
    'A change of scenery, one night, just you two: plan an overnight escape 🌙',
    'Wine country, the coast or a cozy cabin — where shall you two spend the night? 🍇',
  ],
  getaway: [
    'It has been a while since a real getaway — dream up a few nights away together 🌴',
    'Pick a place on your list and give yourselves a few nights, just the two of you ✈️',
  ],
};

// ---------- pure (tested) ----------
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const atNoon = (s) => new Date(`${s}T12:00:00`);
const addDays = (s, n) => { const d = atNoon(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / 864e5);
// This week, Monday to Sunday.
export function weekOf(today) {
  const d = atNoon(today);
  const mon = addDays(today, -((d.getDay() + 6) % 7));
  return { from: mon, to: addDays(mon, 6) };
}
// The coming weekend: this one on Saturday, next one from Sunday on.
export function weekendOf(today) {
  const dow = atNoon(today).getDay();
  const sat = addDays(today, dow === 6 ? 0 : 6 - dow); // on Sunday that's next weekend
  return { sat, sun: addDays(sat, 1) };
}

// records: [{ person, rhythm: { entries: [{id, kind, date}], removed: [id] } }] → all entries, oldest first.
export function mergeRhythm(records) {
  const removed = new Set(records.flatMap((r) => r.rhythm?.removed || []));
  const byId = new Map();
  for (const r of records) for (const e of r.rhythm?.entries || []) if (!removed.has(e.id)) byId.set(e.id, { ...e, by: e.by || r.person });
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.at || 0) - (b.at || 0));
}

// Where each of the four stands today. level: 'ok' | 'soon' | 'due'.
export function rhythmStatus(entries, today) {
  const out = {};
  const wk = weekOf(today);
  const weekend = weekendOf(today);
  const last = (kinds) => entries.filter((e) => kinds.includes(e.kind) && e.date <= today).map((e) => e.date).sort().pop() || null;
  for (const kind of ['date', 'overnight', 'getaway']) {
    const r = RHYTHMS[kind];
    // A multi-night getaway is an overnight trip too.
    const l = last(kind === 'overnight' ? ['overnight', 'getaway'] : [kind]);
    const due = l ? addDays(l, r.days) : today;
    const daysLeft = daysBetween(today, due);
    // Trips you haven't logged yet are a gentle "coming up", not overdue.
    const level = !l && kind !== 'date' ? 'soon' : daysLeft <= 0 ? 'due' : (daysLeft <= r.soon || due <= weekend.sun && kind === 'date') ? 'soon' : 'ok';
    out[kind] = { kind, last: l, due, daysLeft, level };
  }
  const year = today.slice(0, 4);
  out.overnight.thisYear = entries.filter((e) => (e.kind === 'overnight' || e.kind === 'getaway') && e.date.startsWith(year)).length;
  const count = entries.filter((e) => e.kind === 'close' && e.date >= wk.from && e.date <= wk.to).length;
  const dow = (atNoon(today).getDay() + 6) % 7; // Mon 0 … Sun 6
  // A gentle nudge from Thursday on if the week isn't there yet (not a nag on Monday).
  out.close = { kind: 'close', count, last: last(['close']), level: count >= 2 ? 'ok' : dow >= 3 ? 'soon' : 'ok', left: Math.max(0, 2 - count) };
  return out;
}

// The one to mention on Home: anything due first, then coming up, in rule order.
export function nextNudge(status) {
  for (const lvl of ['due', 'soon']) for (const k of ORDER) if (status[k].level === lvl) return status[k];
  return null;
}
export const loveLine = (kind, today) => { const l = LOVE[kind]; return l[(+today.slice(8, 10) + kind.length) % l.length]; };

// ---------- data ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const todayIso = () => iso(new Date());
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const short = (s) => atNoon(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(s.slice(0, 4) !== todayIso().slice(0, 4) ? { year: 'numeric' } : {}) });
const inDays = (n) => (n <= 0 ? 'now' : n === 1 ? 'tomorrow' : n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`);

export const allRhythm = () => mergeRhythm(PROFILES.map((p) => ({ person: p.id, rhythm: profileStore(p.id).get('rhythm', {}) })));
function logIt(kind, date = todayIso(), extra = {}) {
  const s = profileStore(ownerId());
  const r = s.get('rhythm', {});
  const at = Date.now();
  s.set('rhythm', { ...r, entries: [...(r.entries || []), { id: at.toString(36) + Math.random().toString(36).slice(2, 5), kind, date, at, ...extra }].slice(-400) });
  pushNow().catch(() => {});
}
function removeIt(id) {
  const s = profileStore(ownerId());
  const r = s.get('rhythm', {});
  s.set('rhythm', { entries: (r.entries || []).filter((e) => e.id !== id), removed: [...(r.removed || []), id].slice(-400) });
  pushNow().catch(() => {});
}
// Suggest it to your partner for the coming weekend, as a "Feeling like" plan they can answer.
const SUGGEST = { date: 'Date night 🍷', overnight: 'An overnight trip, just us 🧳', getaway: 'Plan a few nights away together 🌴', close: 'An evening just for us 💗' };
function suggested(kind) {
  const { sat } = weekendOf(todayIso());
  return PROFILES.flatMap((p) => profileStore(p.id).get('plans', [])).some((pl) => pl.rhythm === kind && (pl.weekOf || '') === sat && !pl.done);
}
function suggest(kind) {
  const now = Date.now();
  const today = todayIso();
  const { sat } = weekendOf(today);
  const s = profileStore(ownerId());
  const plan = { id: now.toString(36), kind: kind === 'date' ? 'dinner' : 'other', what: SUGGEST[kind], where: '', when: 'weekend', time: '', note: '', at: now, date: today, rhythm: kind, weekOf: sat };
  s.set('plans', [...s.get('plans', []), plan].slice(-100));
  pushNow().catch(() => {});
}

// ---------- UI ----------
let showAll = false;
// While logging or editing a moment: {kind, date, what, place, editId?, where: 'home' | 'us' | 'cal'}.
let dateForm = null;
let detailsOpen = false; // keep "Log it" open across redraws
function rowStatus(st) {
  const r = RHYTHMS[st.kind];
  if (st.kind === 'close') return `${'💗'.repeat(Math.min(st.count, 4))}${'🤍'.repeat(st.left)} <span class="muted">${st.count} this week</span>`;
  const extra = st.kind === 'overnight' ? ` · ${st.thisYear}/2 this year` : '';
  if (!st.last) return `<span class="muted">Not logged yet${extra}</span>`;
  return `Last ${short(st.last)} · <span class="${st.level === 'ok' ? 'muted' : st.level === 'due' ? 'tone-warn' : 'tone-good'}">${st.level === 'due' ? 'time for the next one' : `next ${inDays(st.daysLeft)}`}</span>${extra}`;
}

// Log a date (what, where, when — typed in) or edit / delete any logged moment.
export function momentFormHtml() {
  const f = dateForm;
  if (!f) return '';
  const entries = allRhythm();
  const past = (k) => [...new Set(entries.filter((e) => e.kind === 'date' && e[k]).reverse().map((e) => e[k]))].slice(0, 15);
  const isDate = f.kind === 'date';
  return `<div class="r-dateform r-form">
    <div class="small"><b>${f.editId ? `✎ Edit ${isDate ? 'date' : esc(RHYTHMS[f.kind]?.label.toLowerCase() || 'moment')}` : '❤️ Log a date'}</b> <span class="muted">— shows as a ❤️ on the calendar</span></div>
    ${isDate ? `<input data-rwhat list="rWhats" maxlength="60" placeholder="What did you do? e.g. Movie, drinks & dinner" value="${esc(f.what || '')}" aria-label="What">
    <input data-rplace list="rPlaces" maxlength="60" placeholder="Where? e.g. Santana Row" value="${esc(f.place || '')}" aria-label="Where">
    <datalist id="rWhats">${past('what').map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>
    <datalist id="rPlaces">${past('place').map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>` : ''}
    <div class="row wrap"><input type="date" data-rdateform value="${f.date}" max="${todayIso()}" aria-label="When">${f.editId ? '<button type="button" class="ghost small danger" data-rformdel>Delete</button>' : ''}<button type="button" class="ghost small" data-rdatecancel>Cancel</button><button type="button" class="small" data-rdatesave>Save ❤️</button></div>
  </div>`;
}
// Open the form: a new date (on `date`), or an existing moment by id. where: which card shows it.
export function openMoment({ id, date, where }) {
  const e = id && allRhythm().find((x) => x.id === id);
  dateForm = e ? { kind: e.kind, date: e.date, what: e.what || (DATE_TYPES[e.type]?.label ?? ''), place: e.place || '', editId: e.id, where }
    : { kind: 'date', date: date || todayIso(), what: '', place: '', where };
}
export const momentFormOpen = (where) => dateForm?.where === where;
export function closeMoment(where) { if (dateForm?.where === where) dateForm = null; }

export function rhythmCard({ home = false } = {}) {
  if (!ownerId()) return '';
  const today = todayIso();
  const entries = allRhythm();
  const st = rhythmStatus(entries, today);
  const nudge = nextNudge(st);
  const { sat } = weekendOf(today);
  const satText = atNoon(sat).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const suggestBtn = (k) => (k === 'close' ? '' : suggested(k)
    ? '<span class="small tone-good">✓ Suggested for the weekend</span>'
    : `<button type="button" class="ghost small" data-rsuggest="${k}">💡 Suggest for ${satText}</button>`);
  const form = momentFormOpen(home ? 'home' : 'us') ? momentFormHtml() : '';
  const nudgeBlock = form || (nudge ? `<div class="r-nudge r-${nudge.kind}">
      <p class="r-love">${esc(loveLine(nudge.kind, today))}</p>
      <div class="row wrap" style="margin-top:6px"><button type="button" class="small" data-rdid="${nudge.kind}">✓ We did it</button>${suggestBtn(nudge.kind)}</div>
    </div>` : '<p class="small muted">All four are on track — enjoy each other 💞</p>');
  const chips = `<div class="r-chips">${ORDER.map((k) => `<span class="r-chip ${st[k].level}" title="${RHYTHMS[k].label}, ${RHYTHMS[k].every}">${RHYTHMS[k].icon} ${k === 'close' ? `${st.close.count}/2` : st[k].level === 'ok' ? '✓' : st[k].level === 'due' ? 'due' : 'soon'}</span>`).join('')}</div>`;
  if (home) {
    return `<div class="card rhythm-card home-rhythm">
      <div class="row between" style="margin-top:0"><div class="eyebrow">💞 Just the two of you</div><button type="button" class="linkish small" data-goto="calendar">2-2-2-2 ›</button></div>
      ${nudgeBlock}${chips}
    </div>`;
  }
  const recent = [...entries].reverse().slice(0, showAll ? 40 : 6);
  return `<div class="card rhythm-card">
    <div class="row between" style="margin-top:0"><div class="eyebrow">💞 The 2-2-2-2 rhythm</div>${form ? '' : '<button type="button" class="small" data-rdid="date">❤️ Log a date</button>'}</div>
    ${nudgeBlock}${chips}
    <details class="r-more" ${detailsOpen ? 'open' : ''}><summary class="small">Log it · how you're doing</summary>
    <p class="small muted">A date every 2 weeks, intimacy twice a week, an overnight trip twice a year and a few nights away every 2 years — just the two of you. Either of you can log it.</p>
    <ul class="r-rows">${ORDER.map((k) => `<li class="r-row ${st[k].level}">
      <span class="r-ico">${RHYTHMS[k].icon}</span>
      <span class="r-main"><b>${RHYTHMS[k].label}</b> <small class="muted">· ${RHYTHMS[k].every}</small><br><small>${rowStatus(st[k])}</small></span>
      <span class="r-act">${k === 'close' ? `<button type="button" class="small ghost" data-rdid="close">💗 +1</button>`
        : `<input type="date" data-rdate="${k}" value="${today}" max="${today}" aria-label="When"><button type="button" class="small ghost" data-rdid="${k}">✓ Log</button>`}</span>
    </li>`).join('')}</ul>
    ${recent.length ? `<details class="r-log" ${showAll ? 'open' : ''}><summary class="small muted">Logged moments · tap one to edit</summary><ul>${recent.map((e) => `<li><button type="button" class="linkish r-edit" data-redit="${e.id}" title="Edit">${momentIcon(e)} ${esc(momentText(e))} · ${short(e.date)} ✎</button><small class="muted">${e.by === ownerId() ? 'you' : esc(nameOf(e.by))}</small><button type="button" class="x" data-rdel="${e.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>
      ${entries.length > 6 && !showAll ? '<button type="button" class="linkish small" data-rmore>Show more</button>' : ''}</details>` : ''}
    </details>
  </div>`;
}

export function renderRhythm() {
  if ($('#calRhythm')) $('#calRhythm').innerHTML = rhythmCard(); // top of the Calendar tab
  if ($('#homeRhythm')) $('#homeRhythm').innerHTML = rhythmCard({ home: true });
}

export function initRhythm(root) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('.rhythm-card, .r-cal')) return;
    const ds = t.dataset;
    const card = t.closest('.rhythm-card, .r-cal');
    const where = card.classList.contains('r-cal') ? 'cal' : card.classList.contains('home-rhythm') ? 'home' : 'us';
    if (where === 'us') detailsOpen = !!t.closest('.r-more');
    const keep = () => { if (dateForm) { dateForm.what = card.querySelector('[data-rwhat]')?.value ?? dateForm.what ?? ''; dateForm.place = card.querySelector('[data-rplace]')?.value ?? dateForm.place ?? ''; } };
    if (ds.rdid) {
      const input = card.querySelector(`[data-rdate="${ds.rdid}"]`);
      const date = ds.rday || (input?.value && input.value <= todayIso() ? input.value : todayIso());
      // A date gets what and where; everything else logs in one tap.
      if (ds.rdid === 'date') openMoment({ date, where });
      else logIt(ds.rdid, date);
    } else if (ds.redit) openMoment({ id: ds.redit, where });
    else if (ds.rdatecancel != null) dateForm = null;
    else if (ds.rformdel != null) {
      if (!confirm('Delete this moment?')) return;
      removeIt(dateForm.editId);
      dateForm = null;
    } else if (ds.rdatesave != null) {
      keep();
      const d = card.querySelector('[data-rdateform]')?.value;
      const date = d && d <= todayIso() ? d : dateForm.date;
      const what = dateForm.what.trim().slice(0, 60), place = dateForm.place.trim().slice(0, 60);
      // An edit replaces the old moment (whichever phone logged it) with the corrected one.
      if (dateForm.editId) removeIt(dateForm.editId);
      logIt(dateForm.kind, date, dateForm.kind === 'date' ? { ...(what ? { what } : {}), ...(place ? { place } : {}) } : {});
      dateForm = null;
    } else if (ds.rsuggest) suggest(ds.rsuggest);
    else if (ds.rdel) { if (!confirm('Remove this moment?')) return; removeIt(ds.rdel); }
    else if (ds.rmore != null) showAll = true;
    else return;
    renderRhythm();
    window.dispatchEvent(new Event('lp:rhythm')); // the calendar shows these too
  });
}
