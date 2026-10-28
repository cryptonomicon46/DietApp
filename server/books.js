// 📚 Read (2.0 Phase 4 amendment): the family's books and each person's reading state, and public
// book details from Open Library (free, no key) looked up through the connector.
//
// What the connector keeps (one record, books:<fid>):
//   books: [{ id, by, at, body (the book's details — sealed in an encrypted family), aud, to }]
//   state: { bookId: { memberId: { s, f, p?, r?, svc?, start?, done?, at } } } — no titles in here
// Who sees a book: "us" (the default — the two of you), "me" (only whoever added it) or "family".
// Each person writes only their own state; nobody's progress overwrites anyone else's.
// Open Library gets only what was typed into search (or a book's public id) — never who asked,
// never anyone's list. Covers are passed through here too, so Open Library doesn't see which covers
// a household looks at. Answers are kept in Cloudflare's cache, not in storage.
import { fromOpenLibrary, normalizeState, genresOf, parseSeries } from '../js/books.js';

const OL = 'https://openlibrary.org';
const UA = { 'User-Agent': 'OurPawmily household app (book lookups)' };
const MAX_BOOKS = 2000;
const AUDS = ['us', 'me', 'family'];
const clean = (s, n = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function cached(env, key, ttl, make) {
  const cache = typeof caches !== 'undefined' && !env.DEMO ? caches.default : null;
  const ck = new Request(`https://books.cache/${key}`);
  if (cache) { const hit = await cache.match(ck); if (hit) return hit.json(); }
  const data = await make();
  if (cache) await cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` } }));
  return data;
}
const get = async (env, u) => {
  const r = await (env.__fetch || fetch)(u, { headers: UA });
  if (!r.ok) throw Object.assign(new Error(`open library ${r.status}`), { status: 502 });
  return r.json();
};

// Search: title, author or ISBN → up to 8 books (public details only).
export async function searchBooks(env, q) {
  const query = clean(q, 100);
  if (query.length < 2) return [];
  const isbn = query.replace(/[-\s]/g, '');
  const params = new URLSearchParams({ limit: '8', fields: 'key,title,subtitle,author_name,author_key,first_publish_year,cover_i,isbn,subject,number_of_pages_median' });
  params.set(/^(97[89])?\d{9}[\dX]$/i.test(isbn) ? 'isbn' : 'q', /^(97[89])?\d{9}[\dX]$/i.test(isbn) ? isbn : query);
  const j = await get(env, `${OL}/search.json?${params}`);
  return (j.docs || []).filter((d) => d.title && d.key).slice(0, 8).map((d) => fromOpenLibrary(d));
}
// One work's extra details, looked up when a book is added: subjects (→ genres), the series and its
// number from an edition that has one, the page count.
export async function workDetails(env, olid) {
  const [work, eds] = await Promise.all([get(env, `${OL}/works/${olid}.json`), get(env, `${OL}/works/${olid}/editions.json?limit=20`).catch(() => ({ entries: [] }))]);
  const subjects = (work.subjects || []).map((s) => clean(s, 60)).filter(Boolean).slice(0, 12);
  const withSeries = (eds.entries || []).find((e) => Array.isArray(e.series) && e.series.length);
  const series = withSeries ? parseSeries(withSeries.series[0]) : null;
  const pages = (eds.entries || []).map((e) => e.number_of_pages).filter((n) => n > 0).sort((a, b) => a - b);
  return { subjects: subjects.slice(0, 8), genres: genresOf(subjects), ...(series ? { series } : {}), ...(pages.length ? { pages: pages[Math.floor(pages.length / 2)] } : {}) };
}

// GET /books/search?q= · GET /books/work/OL…W — signed in (called after the sign-in check).
export async function bookLookupRoutes({ path, method, env, json, url, req, user, underLimit, db }) {
  const m = path.match(/^\/books\/(search|work\/(OL\d{1,12}W))$/);
  if (!m || method !== 'GET') return null;
  if (!(await underLimit(db, `rate:${user.uid}:books:${Math.floor(Date.now() / 60000)}`, 40, 120))) return json({ error: 'too many — try again in a minute' }, 429);
  try {
    if (m[1] === 'search') {
      const q = clean(url(req).searchParams.get('q'), 100);
      return json({ results: await cached(env, `s/${encodeURIComponent(q.toLowerCase())}`, 86400, () => searchBooks(env, q)) });
    }
    return json({ details: await cached(env, `w/${m[2]}`, 7 * 86400, () => workDetails(env, m[2])) });
  } catch (e) { return json({ error: "Couldn't reach the book catalogue — try again, or type the title and author" }, e.status || 502); }
}
// GET /books/cover/<id>-S.jpg | -M.jpg — a cover, passed through and cached (no sign-in: it's an
// image tag; only Open Library cover ids, only two small sizes).
export async function bookCover({ path, env }) {
  const m = path.match(/^\/books\/cover\/(\d{1,10})-([SM])\.jpg$/);
  if (!m) return null;
  const cache = typeof caches !== 'undefined' && !env.DEMO ? caches.default : null;
  const ck = new Request(`https://books.cache/c/${m[1]}-${m[2]}`);
  let res = cache && await cache.match(ck);
  if (!res) {
    const r = await (env.__fetch || fetch)(`https://covers.openlibrary.org/b/id/${m[1]}-${m[2]}.jpg?default=false`, { headers: UA });
    if (!r.ok) return { status: 404, data: { error: 'no cover' } };
    res = new Response(await r.arrayBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=2592000' } });
    if (cache) await cache.put(ck, res.clone());
  }
  return { status: 200, raw: new Uint8Array(await res.arrayBuffer()) };
}

// The family's books: /families/:fid/books[/:id[/me]]
export async function bookRoutes({ path, method, body, db, loadFamily, meIn, isCouple, sealed, randomId, json }) {
  const m = path.match(/^\/families\/([a-z0-9]+)\/books(?:\/([a-z0-9]{6,12})(\/me)?)?$/);
  if (!m) return null;
  const fam = await loadFamily(m[1]);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  const [, , id, mine] = m;
  const key = `books:${fam.fid}`;
  const rec = (await db.get(key)) || { books: [], state: {} };
  const save = () => db.put(key, rec);
  const partner = fam.members.find((p) => isCouple(fam, me, p));
  const toFor = (aud, by) => (aud === 'family' ? [] : aud === 'me' ? [by] : [by, ...(partner && by === me.id ? [partner.id] : [])]);
  const sees = (b) => b.aud === 'family' || (b.to || []).includes(me.id);
  const bodyOf = (v) => sealed(v, 6000) ?? (fam.e2ee ? null : (v && typeof v === 'object' ? JSON.stringify(v).slice(0, 3000) : null));
  const visibleState = (bid) => { const b = rec.books.find((x) => x.id === bid); const s = rec.state[bid] || {}; return Object.fromEntries(Object.entries(s).filter(([who]) => b.aud === 'family' || (b.to || []).includes(who))); };

  if (!id && method === 'GET') {
    const books = rec.books.filter(sees);
    return json({ books: books.map(({ id: bid, by, at, body: b, aud }) => ({ id: bid, by, at, body: b, aud })), state: Object.fromEntries(books.map((b) => [b.id, visibleState(b.id)])) });
  }
  if (!id && method === 'POST') {
    const b = bodyOf(body.body);
    if (!b) return json({ error: fam.e2ee ? 'this family is end-to-end encrypted — update the app and try again' : 'which book?' }, 400);
    if (rec.books.length >= MAX_BOOKS) return json({ error: 'that\'s a lot of books — remove some first' }, 400);
    const aud = AUDS.includes(body.aud) ? body.aud : 'us';
    const book = { id: randomId(8), by: me.id, at: Date.now(), body: b, aud, to: toFor(aud, me.id) };
    rec.books.push(book);
    const st = body.state ? normalizeState(body.state) : null;
    if (st) rec.state[book.id] = { [me.id]: st };
    await save();
    return json({ book: { id: book.id, by: book.by, at: book.at, body: book.body, aud }, state: rec.state[book.id] || {} });
  }
  const book = rec.books.find((x) => x.id === id);
  if (!book || !sees(book)) return json({ error: 'that book is gone' }, 404);
  // Your own state for this book (or null to take it off your lists).
  if (mine && method === 'PUT') {
    const st = body.state == null ? null : normalizeState(body.state);
    if (body.state != null && !st) return json({ error: 'reading, want to read, finished or dropped?' }, 400);
    const s = { ...(rec.state[id] || {}) };
    if (st) s[me.id] = st; else delete s[me.id];
    rec.state[id] = s;
    // Someone else now reads a book that was only the adder's: it becomes the two of you's.
    if (st && book.aud === 'me' && book.by !== me.id) { book.aud = 'us'; book.to = [book.by, me.id]; }
    else if (st && book.aud === 'us' && !book.to.includes(me.id)) book.to.push(me.id);
    await save();
    return json({ state: visibleState(id) });
  }
  if (!mine && method === 'PATCH') {
    if (body.body) { const b = bodyOf(body.body); if (!b) return json({ error: 'expected sealed details' }, 400); book.body = b; }
    if (AUDS.includes(body.aud) && body.aud !== book.aud) {
      // Who sees it changes only while nobody else has it on their list — so nobody's reading
      // status is ever shown to more (or fewer) people than when they added theirs.
      const others = Object.keys(rec.state[id] || {}).filter((w) => w !== me.id);
      if (others.length) return json({ error: 'someone else has this on their list' }, 409);
      if (body.aud === 'me' && book.by !== me.id) return json({ error: 'only whoever added it can keep it to themselves' }, 403);
      book.aud = body.aud; book.to = body.aud === 'family' ? [] : body.aud === 'me' ? [book.by] : [...new Set([book.by, ...others, ...(partner && book.by === me.id ? [partner.id] : [])])];
    }
    await save();
    return json({ book: { id: book.id, by: book.by, at: book.at, body: book.body, aud: book.aud } });
  }
  if (!mine && method === 'DELETE') {
    const others = Object.keys(rec.state[id] || {}).filter((w) => w !== me.id);
    if (book.by !== me.id) return json({ error: 'only whoever added it can delete it — take it off your list instead' }, 403);
    if (others.length) return json({ error: 'someone else has this on their list — taken off yours instead' }, 409);
    rec.books = rec.books.filter((x) => x !== book);
    delete rec.state[id];
    await save();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
// Leaving or deleting: a member's reading state goes with them (their books stay for the others).
export async function forgetReader(db, fid, memberId) {
  const key = `books:${fid}`, rec = await db.get(key);
  if (!rec) return;
  for (const s of Object.values(rec.state || {})) delete s[memberId];
  for (const b of rec.books) b.to = (b.to || []).filter((x) => x !== memberId);
  rec.books = rec.books.filter((b) => b.aud === 'family' || b.to.length);
  const left = new Set(rec.books.map((b) => b.id));
  for (const bid of Object.keys(rec.state || {})) if (!left.has(bid)) delete rec.state[bid];
  await db.put(key, rec);
}
