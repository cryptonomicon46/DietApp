// 📺 What we watch: streaming services, statuses, and merging everyone's shows, nights, ratings and
// status changes into one list, by month and for the year. Shared by the trackers and the family
// app's 🍿 Watch hub (no storage here).
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
export const STATUS = { watching: '▶️ Watching', upnext: '🕐 Up next', finished: '🎉 Finished', dropped: '✋ Dropped' };

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
