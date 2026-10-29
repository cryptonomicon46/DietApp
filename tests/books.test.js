// 📚 Read (2.0 Phase 4 amendment): one book per title, each person's own state and format, series,
// authors and genres kept as structure, and per-person signals a later Scout can explain — plus the
// connector's rules for who sees which book and what Open Library is (and isn't) told.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/books.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const fw = B.normalizeBook({ title: 'Fourth Wing', authors: [{ name: 'Rebecca Yarros', key: 'OL1A' }], series: { name: 'The Empyrean', n: 1 }, genres: ['fantasy', 'romance', 'romantasy'], ol: '/works/OL1W', pages: 500, audio: { narrator: 'A Narrator', minutes: 1260 } });
const iflame = B.normalizeBook({ title: 'Iron Flame', authors: [{ name: 'Rebecca Yarros', key: 'OL1A' }], series: { name: 'Empyrean', n: 2 }, genres: ['fantasy', 'romantasy'], ol: '/works/OL2W' });
const phm = B.normalizeBook({ title: 'Project Hail Mary', authors: [{ name: 'Andy Weir', key: 'OL9A' }], genres: ['science fiction'], ol: '/works/OL3W' });
const books = [{ id: 'b1', ...fw }, { id: 'b2', ...iflame }, { id: 'b3', ...phm }];
const sam = { id: 'sam', name: 'Sam' }, pat = { id: 'pat', name: 'Pat' };

test('public metadata: Open Library results, series spellings, genres from noisy subjects', () => {
  const doc = { key: '/works/OL27479W', title: 'Fourth Wing', author_name: ['Rebecca Yarros'], author_key: ['OL7929034A'], first_publish_year: 2023, cover_i: 13183711, isbn: ['1649374046', '9781649374042'], subject: ['Fiction, fantasy, general', 'Dragons', 'Romance fiction', 'New York Times bestseller'], number_of_pages_median: 512 };
  const b = B.fromOpenLibrary(doc, { series: ['The Empyrean ; 1'] });
  assert.deepEqual(b.authors, [{ name: 'Rebecca Yarros', key: 'OL7929034A' }]);
  assert.deepEqual([b.year, b.cover, b.isbn, b.pages, b.ol], [2023, 13183711, '9781649374042', 512, '/works/OL27479W']);
  assert.deepEqual(b.series, { name: 'The Empyrean', n: 1 });
  assert.deepEqual(b.genres, ['fantasy', 'romance', 'romantasy']);
  for (const [raw, want] of [['The Empyrean ; 1', 1], ['Empyrean, #2', 2], ['The Empyrean (3)', 3], ['Empyrean series, book 4', 4], ['Book 5 of The Empyrean', 5]]) {
    const s = B.parseSeries(raw);
    assert.equal(s.n, want, raw); assert.equal(B.seriesKey(s.name), 'empyrean', raw);
  }
  assert.deepEqual(B.genresOf(['Biography', 'Computer scientists', 'History of technology']), ['biography', 'history', 'technology', 'nonfiction']);
  assert.equal(B.sameBook(fw, { ...fw, ol: '/works/OL99W' }), false, 'an Open Library id wins when both have one');
  assert.ok(B.sameBook({ title: 'Fourth Wing!', authors: [{ name: 'rebecca yarros' }] }, { title: 'fourth wing', authors: [{ name: 'Rebecca Yarros' }] }));
  // Junk never becomes metadata.
  const junk = B.normalizeBook({ title: '<b>x</b>'.repeat(60), cover: 'abc', isbn: 'nope', ol: 'http://evil', year: 99999, series: { name: 'S', n: -1 } });
  assert.deepEqual([junk.title.length <= 160, junk.cover, junk.isbn, junk.ol, junk.year, junk.series], [true, undefined, undefined, undefined, undefined, { name: 'S' }]);
});

test('each person has their own state and format for the same book; progress is optional', () => {
  const state = { b1: { pat: B.normalizeState({ s: 'reading', f: 'listen', p: { pct: 63 } }), sam: B.normalizeState({ s: 'reading', f: 'read', p: { page: 140 } }) }, b3: { sam: B.normalizeState({ s: 'finished', done: '2026-10-01' }), pat: B.normalizeState({ s: 'reading', f: 'listen' }) } };
  assert.equal(B.stateLine(state.b1.pat, fw), '🎧 Listening · 63%');
  assert.equal(B.stateLine(state.b1.sam, fw), '📖 Reading · 28%', 'page 140 of 500');
  assert.equal(B.stateLine(state.b3.pat, phm), '🎧 Listening', 'no progress needed');
  assert.equal(B.stateLine(state.b3.sam, phm), '✓ Finished');
  assert.equal(B.progressText({ p: { min: 630 } }, fw), '50%', 'audiobook position against its length');
  assert.equal(B.progressText({ p: { ch: 12 } }, phm), 'ch. 12');
  assert.equal(B.normalizeState({ s: 'loving it' }), null);
  assert.deepEqual(Object.keys(B.normalizeState({ s: 'want', f: 'x', p: { pct: 400 }, r: 9, svc: 'pirate' })).sort(), ['at', 'f', 's']);
  // The Us card: each of you, what you're reading now, and your Want to Read count.
  const pv = B.usPreview(books, { b1: { pat: { ...state.b1.pat, at: 2 }, sam: { ...state.b1.sam, at: 1 } }, b3: { pat: { ...state.b3.pat, at: 3 }, sam: state.b3.sam }, b2: { sam: { s: 'want', at: 1 }, pat: { s: 'finished', at: 1 } } }, [pat, sam], 'sam');
  assert.deepEqual(pv.rows.map((r) => [r.member.name, r.items.map((i) => `${i.book.title}: ${B.stateLine(i.st, i.book)}`)]), [
    ['Pat', ['Project Hail Mary: 🎧 Listening', 'Fourth Wing: 🎧 Listening · 63%']],
    ['Sam', ['Fourth Wing: 📖 Reading · 28%']],
  ]);
  assert.equal(pv.want, 1);
  const L = B.lists(books, { ...state, b2: { sam: { s: 'want', at: 1 }, pat: { s: 'want', at: 2 } } }, [pat, sam], 'sam');
  assert.equal(L.want[0].member.id, 'sam', 'your Want to Read first');
  assert.deepEqual(L.finished.map((e) => [e.book.title, e.member.id]), [['Project Hail Mary', 'sam']]);
});

test('signals are per person: authors, series progress, genres — and reasons a later Scout can explain', () => {
  const state = { b1: { pat: { s: 'finished', r: 5 }, sam: { s: 'want' } }, b2: { pat: { s: 'finished' } }, b3: { sam: { s: 'finished', r: 4 } } };
  const p = B.signals(books, state, 'pat'), s = B.signals(books, state, 'sam');
  assert.deepEqual(p.series.map((x) => [x.key, x.finishedThrough, x.next]), [['empyrean', 2, 3]]);
  assert.equal(p.authors[0].name, 'Rebecca Yarros'); assert.equal(p.authors[0].finished, 2);
  assert.ok(p.genres.romantasy > 0 && !p.genres['science fiction'], 'Pat: romantasy, not sci-fi');
  assert.ok(s.genres['science fiction'] > 0 && s.genres.fantasy === 1, 'Sam: sci-fi; a want-to-read counts a little');
  // Book 3 announced → an update for Pat (who finished 1–2), nothing series-based for Sam.
  const onyx = { title: 'Onyx Storm', authors: [{ name: 'Rebecca Yarros', key: 'OL1A' }], series: { name: 'The Empyrean', n: 3 }, genres: ['fantasy', 'romantasy'] };
  const rp = B.reasonsFor(onyx, p, books);
  assert.deepEqual(rp.map((r) => r.type), ['series-new']);
  assert.equal(B.REASONS[rp[0].type].kind, 'update');
  assert.equal(B.explain(rp[0]), "New in The Empyrean — you've read books 1–2");
  assert.ok(!B.reasonsFor(onyx, s, books).some((r) => r.type === 'series-new'));
  // A new book from an author Sam read → an update; a sci-fi candidate for Sam → a recommendation.
  assert.equal(B.explain(B.reasonsFor({ title: 'New Weir', authors: [{ name: 'Andy Weir', key: 'OL9A' }] }, s, books)[0]), "New from Andy Weir, an author you've read");
  const rec = B.reasonsFor({ title: 'Some Space Book', authors: [{ name: 'X' }], genres: ['science fiction'] }, s, books);
  assert.deepEqual([rec[0].type, B.REASONS[rec[0].type].kind, B.explain(rec[0])], ['genre', 'recommendation', "Popular in science fiction you've been reading"]);
  assert.deepEqual(B.bookRef(fw), { type: 'book', title: 'Fourth Wing', authors: ['Rebecca Yarros'], ol: '/works/OL1W' }, 'enough to match a screen adaptation later');
});

async function family() {
  const m = new Map(), asked = [];
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } },
    __fetch: async (u, init) => {
      asked.push({ u: String(u), headers: init?.headers });
      if (String(u).includes('/search.json')) return Response.json({ docs: [{ key: '/works/OL27479W', title: 'Fourth Wing', author_name: ['Rebecca Yarros'], author_key: ['OL7929034A'], cover_i: 1318, subject: ['Fantasy fiction', 'Romance'], first_publish_year: 2023 }] });
      if (String(u).includes('/editions.json')) return Response.json({ entries: [{ number_of_pages: 498 }, { series: ['The Empyrean ; 1'], number_of_pages: 512 }] });
      if (String(u).includes('/works/OL27479W.json')) return Response.json({ subjects: ['Dragons', 'Fantasy fiction', 'Romance fiction'] });
      if (String(u).includes('covers.openlibrary.org')) return new Response(new Uint8Array([255, 216, 255, 1]), { status: String(u).includes('/1318-') ? 200 : 404 });
      return new Response('{}', { status: 404 });
    } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, raw: r.raw, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const t = { sam: await signIn('sam@example.com'), pat: await signIn('pat@example.com'), mom: await signIn('mom@example.com'), kid: await signIn('kid@example.com'), out: await signIn('out@example.com') };
  const { family: f } = await call('/families', t.sam, 'POST', { name: 'Fam' });
  const id = { sam: f.members[0].id };
  for (const [who, name, relation] of [['pat', 'Pat', 'spouse'], ['mom', 'Mom', 'parent'], ['kid', 'Kid', 'child']]) {
    const add = await call(`/families/${f.fid}/members`, t.sam, 'POST', { kind: 'person', name, relation, email: `${who}@example.com` });
    id[who] = add.member.id;
    const inv = await call(`/families/${f.fid}/invites`, t.sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, t[who], 'POST');
  }
  return { m, env, asked, call, t, id, F: `/families/${f.fid}`, fid: f.fid };
}

test('Open Library: only the typed words go out, results are public details, covers pass through', async () => {
  const { call, t, asked } = await family();
  const r = await call('/books/search?q=fourth%20wing', t.sam);
  assert.equal(r.results[0].title, 'Fourth Wing'); assert.deepEqual(r.results[0].genres, ['fantasy', 'romance', 'romantasy']);
  const q = new URL(asked.at(-1).u);
  assert.equal(q.searchParams.get('q'), 'fourth wing');
  assert.ok(!/sam|example|token/i.test(asked.at(-1).u + JSON.stringify(asked.at(-1).headers)), 'nothing about who asked');
  await call('/books/search?q=978-1649374042', t.sam);
  assert.equal(new URL(asked.at(-1).u).searchParams.get('isbn'), '9781649374042', 'an ISBN is looked up as an ISBN');
  const d = await call('/books/work/OL27479W', t.sam);
  assert.deepEqual([d.details.series, d.details.pages, d.details.genres], [{ name: 'The Empyrean', n: 1 }, 512, ['fantasy', 'romance', 'romantasy']]);
  assert.equal((await call('/books/search?q=x', null)).status, 401, 'signed in only');
  const cover = await call('/books/cover/1318-M.jpg', null);
  assert.equal(cover.status, 200); assert.equal(cover.raw[0], 255);
  assert.equal((await call('/books/cover/9999-M.jpg', null)).status, 404);
  for (const bad of ['1318-L.jpg', 'abc-M.jpg', '..%2F1-M.jpg']) assert.notEqual((await call(`/books/cover/${bad}`, null)).status, 200, `only small sizes, only numeric ids: ${bad}`);
});

test('who sees a book: the two of you by default, only you, or the family; each person writes only their own state', async () => {
  const { call, t, id, F, m, fid } = await family();
  const add = await call(`${F}/books`, t.sam, 'POST', { body: { title: 'Fourth Wing' }, state: { s: 'reading', f: 'read' } });
  const bid = add.book.id;
  assert.equal(add.book.aud, 'us');
  const seen = async (who) => (await call(`${F}/books`, t[who])).books.map((b) => b.id);
  assert.deepEqual([await seen('pat'), await seen('mom'), await seen('kid')], [[bid], [], []], 'just the two of you');
  // Pat listens to the same book: Pat's own state, Sam's untouched.
  await call(`${F}/books/${bid}/me`, t.pat, 'PUT', { state: { s: 'reading', f: 'listen', p: { pct: 63 } } });
  await call(`${F}/books/${bid}/me`, t.sam, 'PUT', { state: { s: 'reading', f: 'read', p: { pct: 28 } } });
  const st = (await call(`${F}/books`, t.pat)).state[bid];
  assert.deepEqual([st[id.pat].f, st[id.pat].p.pct, st[id.sam].f, st[id.sam].p.pct], ['listen', 63, 'read', 28]);
  // Nobody else can write someone's state, delete someone's book, or make a shared book private.
  assert.equal((await call(`${F}/books/${bid}`, t.pat, 'DELETE')).status, 403);
  assert.equal((await call(`${F}/books/${bid}`, t.sam, 'DELETE')).status, 409, 'Pat still has it');
  assert.equal((await call(`${F}/books/${bid}`, t.sam, 'PATCH', { aud: 'me' })).status, 409);
  assert.equal((await call(`${F}/books/${bid}/me`, t.mom, 'PUT', { state: { s: 'want' } })).status, 404, 'Mom can\'t see it, so can\'t touch it');
  // Neither of you can widen who sees it while the other has it on their list (Sam's status would go with it).
  assert.equal((await call(`${F}/books/${bid}`, t.pat, 'PATCH', { aud: 'family' })).status, 409);
  // A book only Pat has, shared with the family: Mom and the kids see it.
  const fam2 = (await call(`${F}/books`, t.pat, 'POST', { body: { title: 'For Everyone' }, state: { s: 'reading' } })).book.id;
  assert.equal((await call(`${F}/books/${fam2}`, t.pat, 'PATCH', { aud: 'family' })).status, 200);
  assert.deepEqual([(await seen('mom')).includes(fam2), (await seen('kid')).includes(fam2), (await seen('mom')).includes(bid)], [true, true, false]);
  // "Only me": Pat's private book stays Pat's.
  const mine = (await call(`${F}/books`, t.pat, 'POST', { body: { title: 'Private Read' }, aud: 'me', state: { s: 'reading' } })).book.id;
  assert.ok(!(await seen('sam')).includes(mine));
  // Strangers: nothing.
  assert.equal((await call(`${F}/books`, t.out)).status, 404);
  // Leaving: Pat's state goes; the book stays for Sam.
  assert.equal((await call(`${F}/leave`, t.pat, 'POST')).ok, true);
  const rec = JSON.parse(m.get(`v2:books:${fid}`));
  assert.ok(!rec.books.some((b) => b.id === mine), "Pat's private book went with Pat");
  assert.equal(rec.state[bid][id.pat], undefined); assert.equal(rec.state[bid][id.sam].f, 'read');
});

test('an encrypted family stores only sealed book details; one book → one Discuss thread', async () => {
  const { call, t, F } = await family();
  await call(F, t.sam, 'PATCH', { e2ee: true, keyCheck: 'e1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal((await call(`${F}/books`, t.sam, 'POST', { body: { title: 'Plain Title' } })).status, 400);
  const ok = await call(`${F}/books`, t.sam, 'POST', { body: 'e1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', state: { s: 'want' } });
  assert.equal(ok.status, 200);
  const T = `${F}/threads`, ref = `b:${ok.book.id}`;
  const a = (await call(T, t.sam, 'POST', { aud: 'us', title: 'e1:cccccccccccccccccccccccccccccc', body: 'e1:eeeeeeeeeeeeeeeeeeee', ref })).thread;
  const b = await call(T, t.pat, 'POST', { aud: 'us', title: 'e1:dddddddddddddddddddddddddddddd', body: 'e1:ffffffffffffffffffff', ref });
  assert.equal(b.thread.id, a.id, 'Discuss reopens the same thread');
});
