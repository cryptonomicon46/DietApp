// 📚 Read (2.0 Phase 4 amendment): the shared rules for books — used by the phone and the connector.
//
//   Book (one per title per family; its details are public metadata, kept sealed with the family key
//         because which books a household has is private)
//     { v: 1, title, subtitle?, authors: [{ name, key? }], year?, cover? (Open Library cover id),
//       isbn?, pages?, genres: [normalized], subjects: [a few raw], series?: { name, n? },
//       ol? (Open Library work key, e.g. "/works/OL123W"), audio?: { narrator?, minutes? } }
//   State (each person's own, per book — nobody's progress overwrites anyone else's)
//     { s: 'want' | 'reading' | 'finished' | 'dropped', f: 'read' | 'listen' | 'both',
//       p?: { pct?, page?, ch?, min? }, r?: 1–5, svc?, start?, done?, at }
//
// One book, two people, two formats: Pat 🎧 listening at 63%, Sam 📖 reading at 28% — same book.
// Nothing here talks to the network; the signals at the bottom are what a later Scout would read.

export const STATUSES = ['want', 'reading', 'finished', 'dropped'];
export const LIFE = { want: 'Want to Read', reading: 'Reading', finished: 'Finished', dropped: 'Dropped' };
export const FORMATS = { read: { icon: '📖', label: 'Reading', verb: 'Reading' }, listen: { icon: '🎧', label: 'Audiobook', verb: 'Listening' }, both: { icon: '📖🎧', label: 'Both', verb: 'Reading & listening' } };
export const SERVICES = { audible: 'Audible', libby: 'Libby', spotify: 'Spotify', apple: 'Apple Books', other: 'Other' };

const text = (v, n = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(+v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

// ---------- public metadata ----------
// Subjects from a metadata source → a few genres that mean something to a reader. Raw subjects are
// noisy ("Fiction, fantasy, general", "Dragons", "New York Times bestseller"), so only these count.
const GENRE_RULES = [
  ['fantasy', /fantasy|dragons?|magic|wizards?|elves|fae\b|sorcer/i],
  ['romance', /romance|love stories|romantic/i],
  ['science fiction', /science fiction|sci-fi|space opera|dystopi|aliens?\b|time travel/i],
  ['mystery', /mystery|detective|whodunit|crime fiction/i],
  ['thriller', /thriller|suspense/i],
  ['horror', /horror|ghost stories/i],
  ['historical fiction', /historical fiction|fiction, historical/i],
  ['literary fiction', /literary fiction|fiction, literary/i],
  ['young adult', /young adult|juvenile fiction|teen/i],
  ['biography', /biograph|memoir|autobiograph/i],
  ['history', /(^|[^a-z])history(?!.*fiction)/i],
  ['science', /(^|[^a-z])(science|physics|biology|astronomy|chemistry|cosmology|evolution)(?! fiction)/i],
  ['technology', /technolog|computer|software|programming|artificial intelligence|internet|engineering/i],
  ['business', /business|economics|management|finance|entrepreneur|leadership/i],
  ['self-help', /self-help|personal development|habits?\b|productivity|motivation/i],
  ['psychology', /psycholog/i],
  ['health', /health|nutrition|fitness|diet\b/i],
  ['philosophy', /philosoph/i],
  ['politics', /politic|government/i],
  ['cooking', /cook|recipes/i],
  ['travel', /travel/i],
  ['poetry', /poetry|poems/i],
  ['humor', /humou?r|comic/i],
];
const NONFICTION = new Set(['biography', 'history', 'science', 'technology', 'business', 'self-help', 'psychology', 'health', 'philosophy', 'politics', 'cooking', 'travel']);
export function genresOf(subjects = []) {
  const all = (Array.isArray(subjects) ? subjects : []).map((s) => text(s, 80));
  const hit = GENRE_RULES.filter(([, re]) => all.some((s) => re.test(s))).map(([g]) => g);
  const out = new Set(hit);
  if (out.has('fantasy') && out.has('romance')) out.add('romantasy');
  const fiction = all.some((s) => /fiction|novel/i.test(s) && !/nonfiction|non-fiction/i.test(s));
  if (!fiction && hit.some((g) => NONFICTION.has(g))) out.add('nonfiction');
  if (all.some((s) => /nonfiction|non-fiction/i.test(s))) out.add('nonfiction');
  return [...out].slice(0, 6);
}

// "The Empyrean ; 1", "Empyrean, #2", "The Empyrean (3)", "Empyrean series, book 4", "Book 1 of The Empyrean"
export function parseSeries(raw) {
  const s = text(raw, 120);
  if (!s) return null;
  let m = s.match(/^book\s+(\d+(?:\.\d+)?)\s+(?:of|in)\s+(?:the\s+)?(.+)$/i);
  if (m) return { name: tidySeries(m[2]), n: +m[1] };
  m = s.match(/^(.*?)[\s,;:(]+(?:#|no\.?|vol\.?|volume|book|bk\.?)?\s*(\d+(?:\.\d+)?)\)?\s*$/i);
  if (m && m[1].trim()) return { name: tidySeries(m[1]), n: +m[2] };
  return { name: tidySeries(s) };
}
const tidySeries = (s) => text(s, 80).replace(/[\s,;:(#–—-]+$/, '').replace(/\s+/g, ' ');
// Two spellings of one series ("The Empyrean", "Empyrean series") → one key.
export const seriesKey = (name) => text(name, 80).toLowerCase().replace(/^the\s+/, '').replace(/\b(series|trilogy|saga|cycle|novels?)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// An Open Library search result → a book (only public fields; nothing about anyone).
export function fromOpenLibrary(doc = {}, edition = null) {
  const authors = (doc.author_name || []).slice(0, 4).map((name, i) => ({ name: text(name, 80), ...(doc.author_key?.[i] ? { key: text(doc.author_key[i], 20) } : {}) })).filter((a) => a.name);
  const subjects = (doc.subject || doc.subjects || []).map((x) => text(typeof x === 'string' ? x : x?.name, 60)).filter(Boolean);
  const isbn = (doc.isbn || []).find((x) => /^97[89]\d{10}$/.test(x)) || (doc.isbn || [])[0] || '';
  const series = edition?.series?.length ? parseSeries(edition.series[0]) : doc.series?.length ? parseSeries(doc.series[0]) : null;
  return normalizeBook({
    title: doc.title, subtitle: doc.subtitle, authors, year: doc.first_publish_year, cover: doc.cover_i || edition?.covers?.[0],
    isbn, pages: doc.number_of_pages_median || edition?.number_of_pages, subjects: subjects.slice(0, 8), genres: genresOf(subjects), series, ol: doc.key,
  });
}
// Anything shaped roughly like a book (saved, typed in, from a source) → the book model.
export function normalizeBook(o = {}) {
  const b = { v: 1, title: text(o.title, 160) || 'Untitled', authors: (Array.isArray(o.authors) ? o.authors : []).slice(0, 4).map((a) => (typeof a === 'string' ? { name: text(a, 80) } : { name: text(a?.name, 80), ...(a?.key && /^OL\d+A$/.test(a.key) ? { key: a.key } : {}) })).filter((a) => a.name) };
  if (o.subtitle) b.subtitle = text(o.subtitle, 160);
  const y = int(o.year, 1000, 2100); if (y) b.year = y;
  const c = int(o.cover, 1, 1e9); if (c) b.cover = c;
  if (/^[0-9X]{10,13}$/i.test(o.isbn || '')) b.isbn = o.isbn;
  const pg = int(o.pages, 1, 20000); if (pg) b.pages = pg;
  b.genres = (Array.isArray(o.genres) ? o.genres : []).map((g) => text(g, 30).toLowerCase()).filter(Boolean).slice(0, 6);
  b.subjects = (Array.isArray(o.subjects) ? o.subjects : []).map((g) => text(g, 60)).filter(Boolean).slice(0, 8);
  if (o.series?.name) { b.series = { name: text(o.series.name, 80) }; const n = +o.series.n; if (Number.isFinite(n) && n > 0 && n < 1000) b.series.n = n; }
  if (/^\/works\/OL\d+W$/.test(o.ol || '')) b.ol = o.ol;
  // 💬 Who in the family recommended it (a member id), when someone said so — structured, not a note.
  if (/^[a-z0-9]{2,16}$/.test(o.recBy || '')) b.recBy = o.recBy;
  if (o.audio && (o.audio.narrator || o.audio.minutes)) { b.audio = {}; if (o.audio.narrator) b.audio.narrator = text(o.audio.narrator, 80); const mn = int(o.audio.minutes, 1, 10000); if (mn) b.audio.minutes = mn; }
  return b;
}
// The same book again? (same Open Library work, else same title and first author)
const norm = (s) => text(s, 160).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const sameBook = (a, b) => (a?.ol && b?.ol ? a.ol === b.ol : norm(a?.title) === norm(b?.title) && norm(a?.authors?.[0]?.name) === norm(b?.authors?.[0]?.name));
export const authorLine = (b) => (b?.authors || []).map((a) => a.name).join(', ');
export const seriesLine = (b) => (b?.series?.name ? `${b.series.name}${b.series.n ? ` #${b.series.n}` : ''}` : '');

// ---------- each person's state ----------
export function normalizeState(o = {}, now = Date.now()) {
  if (!STATUSES.includes(o.s)) return null;
  const st = { s: o.s, f: FORMATS[o.f] ? o.f : 'read', at: now };
  const p = {}, pct = int(o.p?.pct, 0, 100), page = int(o.p?.page, 1, 20000), ch = int(o.p?.ch, 1, 999), min = int(o.p?.min, 1, 10000);
  if (pct != null) p.pct = pct; if (page) p.page = page; if (ch) p.ch = ch; if (min) p.min = min;
  if (Object.keys(p).length) st.p = p;
  const r = int(o.r, 1, 5); if (r) st.r = r;
  if (SERVICES[o.svc]) st.svc = o.svc;
  for (const k of ['start', 'done']) if (/^\d{4}-\d{2}-\d{2}$/.test(o[k] || '')) st[k] = o[k];
  return st;
}
// How far along, in a few characters (or nothing — progress is never required).
export function progressText(st, book) {
  const p = st?.p;
  if (!p) return '';
  if (p.pct != null) return `${p.pct}%`;
  if (p.min && book?.audio?.minutes) return `${Math.min(100, Math.round((p.min / book.audio.minutes) * 100))}%`;
  if (p.page && book?.pages) return `${Math.min(100, Math.round((p.page / book.pages) * 100))}%`;
  if (p.page) return `p. ${p.page}`;
  if (p.ch) return `ch. ${p.ch}`;
  if (p.min) return `${Math.floor(p.min / 60)}h ${p.min % 60}m in`;
  return '';
}
// "🎧 Listening · 63%", "📖 Reading", "✓ Finished", "Want to Read"
export function stateLine(st, book) {
  if (!st) return '';
  if (st.s === 'reading') return `${FORMATS[st.f]?.icon || '📖'} ${FORMATS[st.f]?.verb || 'Reading'}${progressText(st, book) ? ` · ${progressText(st, book)}` : ''}`;
  if (st.s === 'finished') return `✓ Finished${st.f === 'listen' ? ' (🎧)' : ''}`;
  return LIFE[st.s];
}

// The Us card: for each of you, what you're reading right now (two at most), and your Want to Read count.
// people: [{ id, name }] in the order to show them.
export function usPreview(books, state, people, me) {
  const byId = new Map(books.map((b) => [b.id, b]));
  const rows = people.map((m) => ({
    member: m,
    items: Object.entries(state).filter(([id, s]) => byId.has(id) && s[m.id]?.s === 'reading').map(([id, s]) => ({ book: byId.get(id), st: s[m.id] })).sort((a, b) => (b.st.at || 0) - (a.st.at || 0)),
  }));
  const want = Object.entries(state).filter(([id, s]) => byId.has(id) && s[me]?.s === 'want').length;
  return { rows: rows.map((r) => ({ ...r, more: Math.max(0, r.items.length - 2), items: r.items.slice(0, 2) })), want, any: rows.some((r) => r.items.length) };
}
// The Books view's three lists. Reading Now and Finished show everyone (labelled); Want to Read is
// yours first, then the others'.
export function lists(books, state, people, me) {
  const byId = new Map(books.map((b) => [b.id, b]));
  const entries = (pred) => Object.entries(state).flatMap(([id, s]) => (byId.has(id) ? people.filter((m) => pred(s[m.id])).map((m) => ({ book: byId.get(id), member: m, st: s[m.id] })) : []));
  const reading = people.map((m) => ({ member: m, items: entries((x) => x?.s === 'reading').filter((e) => e.member.id === m.id).sort((a, b) => (b.st.at || 0) - (a.st.at || 0)) }));
  const want = entries((x) => x?.s === 'want').sort((a, b) => (a.member.id === me ? 0 : 1) - (b.member.id === me ? 0 : 1) || (b.st.at || 0) - (a.st.at || 0));
  const finished = entries((x) => x?.s === 'finished').sort((a, b) => String(b.st.done || '').localeCompare(String(a.st.done || '')) || (b.st.at || 0) - (a.st.at || 0));
  const dropped = entries((x) => x?.s === 'dropped');
  // A book someone added but nobody has a state for (e.g. after "Remove from my list"): still findable.
  const loose = books.filter((b) => !Object.values(state[b.id] || {}).some(Boolean));
  return { reading, want, finished, dropped, loose };
}

// ---------- signals for a later Scout (per person; never a household blend) ----------
// What someone's reading behaviour says, from their own state only. Nothing leaves the phone here.
const WEIGHT = { finished: 3, reading: 2, want: 1, dropped: -2 };
export function signals(books, state, memberId) {
  const authors = new Map(), series = new Map(), genres = {};
  let finished = 0;
  for (const b of books) {
    const st = state[b.id]?.[memberId];
    if (!st) continue;
    if (st.s === 'finished') finished++;
    const w = WEIGHT[st.s] + (st.r ? st.r - 3 : 0);
    for (const a of b.authors || []) {
      const k = a.key || norm(a.name);
      const x = authors.get(k) || { key: a.key, name: a.name, finished: 0, reading: 0, want: 0, dropped: 0, books: [] };
      x[st.s]++; x.books.push(b.id);
      authors.set(k, x);
    }
    if (b.series?.name) {
      const k = seriesKey(b.series.name);
      const x = series.get(k) || { key: k, name: b.series.name, finished: [], reading: [], want: [], dropped: [], books: [] };
      if (b.series.n) x[st.s].push(b.series.n);
      x.books.push(b.id);
      series.set(k, x);
    }
    for (const g of b.genres || []) genres[g] = (genres[g] || 0) + w;
  }
  const seriesOut = [...series.values()].map((x) => {
    const done = [...x.finished].sort((a, b) => a - b);
    let through = 0; for (const n of done) if (n === through + 1) through = n;
    return { ...x, finishedThrough: through, next: through ? through + 1 : null };
  });
  return {
    member: memberId, finished,
    authors: [...authors.values()].sort((a, b) => (b.finished * 3 + b.reading * 2 + b.want) - (a.finished * 3 + a.reading * 2 + a.want)),
    series: seriesOut,
    genres: Object.fromEntries(Object.entries(genres).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])),
  };
}
// Why something would be shown — a structured reason, never an opaque score. Updates (news about
// what you already follow by reading it) and recommendations (new things for you) are different.
export const REASONS = {
  'series-next': { kind: 'update', text: (r) => `Next in ${r.series}, which you're reading` },
  'series-new': { kind: 'update', text: (r) => `New in ${r.series} — you've read ${r.through === 1 ? 'book 1' : `books 1–${r.through}`}` },
  'author-new': { kind: 'update', text: (r) => `New from ${r.author}, an author you've read` },
  adaptation: { kind: 'update', text: (r) => `${r.book}, which you read, is becoming a ${r.screen || 'show'}` },
  'because-finished': { kind: 'recommendation', text: (r) => `Because you finished ${r.books.slice(0, 2).join(' and ')}` },
  genre: { kind: 'recommendation', text: (r) => `Popular in ${r.genre} you've been reading` },
};
export const explain = (reason) => REASONS[reason.type]?.text(reason) || '';
// A public candidate (a book from a list or an announcement) against one person's signals → the
// reasons it matters to them (empty = it doesn't). This is how ranking can stay on the phone.
export function reasonsFor(candidate, sig, books = []) {
  const out = [];
  const titleOf = (id) => books.find((b) => b.id === id)?.title;
  if (candidate.series?.name) {
    const s = sig.series.find((x) => x.key === seriesKey(candidate.series.name));
    if (s && candidate.series.n && s.finishedThrough && candidate.series.n > s.finishedThrough && !s.books.some((id) => books.find((b) => b.id === id)?.series?.n === candidate.series.n)) out.push({ type: 'series-new', series: s.name, through: s.finishedThrough, n: candidate.series.n });
    else if (s && candidate.series.n && s.reading.length && candidate.series.n === Math.max(...s.reading) + 1) out.push({ type: 'series-next', series: s.name, n: candidate.series.n });
  }
  for (const a of candidate.authors || []) {
    const x = sig.authors.find((y) => (a.key && y.key === a.key) || norm(y.name) === norm(a.name));
    if (x && x.finished + x.reading > 0 && !out.length) out.push({ type: 'author-new', author: x.name, finished: x.finished });
  }
  if (!out.length) {
    const g = (candidate.genres || []).find((x) => (sig.genres[x] || 0) >= 3);
    if (g) {
      const liked = books.filter((b) => (b.genres || []).includes(g)).map((b) => b.id);
      out.push({ type: 'genre', genre: g, books: liked.map(titleOf).filter(Boolean) });
    }
  }
  return out;
}
// What a Watch show or movie would need to say "this is based on a book you read" later.
export const bookRef = (b) => ({ type: 'book', title: b.title, authors: (b.authors || []).map((a) => a.name), ...(b.ol ? { ol: b.ol } : {}), ...(b.isbn ? { isbn: b.isbn } : {}) });
