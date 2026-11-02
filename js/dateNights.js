// ❤️ Date nights from your calendars (💞 Us › Dates). A movie, a dinner reservation or a show on
// the calendar for both of you is a date night: it shows under Coming up, the 2-2-2-2 says it's
// booked, and the day after it's counted (with Undo). One that only might be a date (on one
// calendar, or with no clear sign) is asked about once. Everything here runs on the phone, from
// what its Calendar tab already shows; your answers ("marks") and what's been counted are kept in
// your own trackers. Pure: no storage, no network.
//   item: { date, time, title, place, who: 'both' | memberId, feed, id }
export const DAYS_AHEAD = 21;
export const COUNT_BACK = 3;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']+/g, ' ').trim();
const MOVIE = /\b(movie|movies|film|cinema|cinemas|cinemark|amc|regal|century|alamo drafthouse|imax|fandango|atom tickets|screening)\b/;
const FOOD = /\b(dinner|brunch|reservation|opentable|open table|resy|tock|restaurant|bistro|steakhouse|omakase|tasting menu|wine bar|cocktails|drinks)\b/;
const SHOW = /\b(concert|tickets|ticketmaster|comedy|musical|symphony|opera|ballet|jazz|broadway|live music)\b/;
const DATE = /\b(date night|date|anniversary|valentine'?s?)\b/;
// Never a date night, whatever else it says.
const NOT = /\b(kids?|children'?s|toddler|school|pta|daycare|play ?date|due date|dentist|doctor|vet|appointment|meeting|standup|interview|birthday party|team|work)\b/;
export const ICONS = { movie: '🎬', food: '🍽️', show: '🎵', date: '❤️' };
// The core of a theatre's name ("Century at Great Mall, Milpitas" → "century at great mall").
const theatreCore = (n) => norm(String(n || '').split(',')[0]);

// What kind of date it looks like: { kind: 'movie' | 'food' | 'show' | 'date' | null, idea? }.
// `movies`: the week's scouted movies (a title match is a movie, and links to its showtimes).
export function classify(item, { theatres = [], movies = [] } = {}) {
  const t = norm(`${item.title} ${item.place || ''}`), title = norm(item.title);
  if (!t || NOT.test(t)) return { kind: null };
  const idea = movies.find((m) => { const n = norm(m.title); return n.length >= 4 && (` ${title} `).includes(` ${n} `); });
  if (idea) return { kind: 'movie', idea };
  if (theatres.some((th) => { const c = theatreCore(th); return c.length >= 4 && t.includes(c); }) || MOVIE.test(t)) return { kind: 'movie' };
  if (FOOD.test(t)) return { kind: 'food' };
  if (SHOW.test(t)) return { kind: 'show' };
  if (DATE.test(t)) return { kind: 'date' };
  return { kind: null };
}
// The same event on any phone and in any calendar: its day, time and title.
export const eventKey = (item) => `${item.date}|${item.time || 'all'}|${norm(item.title).replace(/ /g, '').slice(0, 40)}`;
// 'yes' (a date night), 'ask' (might be: ask once) or 'no'. Your answer always wins.
export function verdict(item, marks = {}, opts = {}) {
  const m = marks[eventKey(item)];
  if (m === 'yes') return 'yes';
  if (m === 'no') return 'no';
  const c = classify(item, opts);
  if (!c.kind) return 'no';
  return item.who === 'both' && c.kind !== 'date' ? 'yes' : 'ask';
}
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const decorate = (x, marks, opts) => { const c = classify(x, opts); return { ...x, key: eventKey(x), kind: c.kind || 'date', icon: ICONS[c.kind] || ICONS.date, idea: c.idea || null, verdict: verdict(x, marks, opts) }; };
const byWhen = (a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99');

// Coming up: the next three weeks' date nights and might-be's (soonest first).
export function comingUp(items, { marks = {}, today, days = DAYS_AHEAD, ...opts } = {}) {
  const end = addDays(today, days);
  return items.filter((x) => x.date >= today && x.date <= end).map((x) => decorate(x, marks, opts)).filter((x) => x.verdict !== 'no').sort(byWhen);
}
// Date nights in the last few days that haven't been counted yet (nor un-counted with Undo).
export function toCount(items, { marks = {}, counted = {}, today, back = COUNT_BACK, ...opts } = {}) {
  const from = addDays(today, -back);
  return items.filter((x) => x.date < today && x.date >= from).map((x) => decorate(x, marks, opts)).filter((x) => x.verdict === 'yes' && !counted[x.key]).sort(byWhen);
}
// The 2-2-2-2 moment for a date night from the calendar (it remembers which event it was).
export function entryFor(x, at = Date.now()) {
  const what = String(x.title || '').replace(/^\P{L}+/u, '').trim().slice(0, 60) || 'Date night';
  return { id: `c${at.toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: 'date', date: x.date, at, what, ...(x.place ? { place: String(x.place).slice(0, 60) } : {}), cal: x.key };
}
// Movies from the scout already booked on the calendar: idea id → the day.
export function bookedIdeas(items, opts = {}) {
  const out = {};
  for (const x of items) { const c = classify(x, opts); if (c.idea && !out[c.idea.id]) out[c.idea.id] = x.date; }
  return out;
}
