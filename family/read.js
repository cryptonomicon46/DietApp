// 📚 Read (2.0 Phase 4 amendment): the Read card on 💞 Us, the Books view (Reading Now · Want to
// Read · Finished), adding a book in a few taps, and a book's details. Loaded when Us or Books
// needs it. Book details are sealed with the family key; each person's state is their own.
// The rules (state, progress, previews, signals) are js/books.js, shared with the connector.
import * as B from '../js/books.js';

let $, api, state, fam, me, member, partnerMember, esc, openSheet, closeSheet, toast, act, show, unlock, lock, discuss, isoLocal, demoBanner, lockedHere, LOCKED_MSG;
export function init(c) { ({ $, api, state, fam, me, member, partnerMember, esc, openSheet, closeSheet, toast, act, show, unlock, lock, discuss, isoLocal, demoBanner, lockedHere, LOCKED_MSG } = c); }
// A cover that can't load (offline, or Open Library has none after all): the 📚 placeholder instead.
if (typeof document !== 'undefined') document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG' && /^bk-cov/.test(t.className)) { const s = document.createElement('span'); s.className = `${t.className} bk-none`; s.setAttribute('aria-hidden', 'true'); s.textContent = '📚'; t.replaceWith(s); } }, true);

export const rd = { books: [], state: {}, at: 0, fid: null, tab: 'reading', q: '', results: null, searching: false, pick: null, timer: null, manual: false };
const P = () => `/families/${state.fid}/books`;
// The two of you, partner first (as on the Us card), or just you.
const people = () => [partnerMember(), me()].filter(Boolean).map((m) => ({ id: m.id, name: m.name }));
const mine = (id) => rd.state[id]?.[fam().me] || null;
const cover = (b, size = 'S') => (b?.cover ? `${api.base()}/v2/books/cover/${b.cover}-${size}.jpg` : '');
const coverImg = (b, size = 'S', cls = 'bk-cov') => (b?.cover ? `<img class="${cls}" src="${esc(cover(b, size))}" alt="" loading="lazy" width="${size === 'M' ? 72 : 36}" height="${size === 'M' ? 108 : 54}">` : `<span class="${cls} bk-none" aria-hidden="true">📚</span>`);
const firstName = (n) => String(n || '').split(/\s+/)[0];

export async function loadBooks(force = false) {
  if (!force && rd.fid === state.fid && Date.now() - rd.at < 20000) return rd;
  const r = await api.get(P());
  const open = async (v) => { const o = await unlock(v); if (o == null) return null; if (typeof o === 'string') { try { return JSON.parse(o); } catch { return null; } } return o; };
  rd.books = (await Promise.all(r.books.map(async (x) => { const b = await open(x.body); return b ? { ...B.normalizeBook(b), id: x.id, by: x.by, at: x.at, aud: x.aud } : { id: x.id, by: x.by, at: x.at, aud: x.aud, title: '🔒 Locked', authors: [], genres: [], subjects: [], locked: true }; })));
  rd.state = r.state || {};
  rd.at = Date.now(); rd.fid = state.fid;
  return rd;
}
const byId = (id) => rd.books.find((b) => b.id === id);

// ---------- 💞 the Us card ----------
export function renderUsRead() {
  const el = $('#usRead');
  if (!el) return;
  const pv = B.usPreview(rd.books, rd.state, people(), fam().me);
  const row = (r) => `<div class="ur-row"><span class="ur-who">${esc(firstName(r.member.name))}</span><span class="ur-books">${r.items.length ? r.items.map((i) => `<button type="button" class="ur-book" data-rd="open:${i.book.id}">${esc(B.FORMATS[i.st.f]?.icon || '📖')} <b>${esc(i.book.title)}</b>${B.progressText(i.st, i.book) ? ` <small class="muted">· ${esc(B.progressText(i.st, i.book))}</small>` : ''}</button>`).join('') : '<small class="muted">Nothing on the go</small>'}${r.more ? `<small class="muted">+${r.more} more</small>` : ''}</span></div>`;
  el.innerHTML = `<div class="row between"><h2 class="card-h" id="usReadH">📚 Read</h2>${pv.want ? `<button type="button" class="linkish small" data-rd="tab:want">Want to Read · ${pv.want}</button>` : ''}</div>
    <div class="ur-list">${pv.rows.map(row).join('')}</div>
    <div class="row uw-foot"><button type="button" class="grow" data-view="read">Open Books →</button><button type="button" class="ghost" data-rd="add" aria-label="Add a book">＋ Book</button></div>`;
}

// ---------- 📚 the Books view ----------
export async function readView() {
  $('#view').innerHTML = `${demoBanner()}<div class="skeleton card"></div>`;
  await act(() => loadBooks());
  if (state.view !== 'read') return;
  renderRead();
}
const TABS = [['reading', 'Reading'], ['want', 'Want to Read'], ['finished', 'Finished']];
function entryRow(e, showWho = true) {
  const sub = [B.authorLine(e.book), B.seriesLine(e.book)].filter(Boolean).join(' · ');
  return `<button type="button" class="card bk-row" data-rd="open:${e.book.id}">${coverImg(e.book)}<span class="grow"><b>${esc(e.book.title)}</b><small class="muted">${esc(sub)}</small><small>${showWho ? `${esc(firstName(e.member.name))} · ` : ''}${esc(B.stateLine(e.st, e.book))}${e.st.done ? ` <span class="muted">· ${esc(e.st.done)}</span>` : ''}</small></span><span class="go">›</span></button>`;
}
export function renderRead() {
  const el = $('#view');
  if (!el || state.view !== 'read') return;
  const L = B.lists(rd.books, rd.state, people(), fam().me);
  const count = { reading: L.reading.reduce((n, r) => n + r.items.length, 0), want: L.want.length, finished: L.finished.length };
  let body = '';
  if (rd.tab === 'reading') {
    body = L.reading.map((r) => `<h3 class="wl-h">${esc(r.member.id === fam().me ? 'You' : r.member.name)}</h3>${r.items.length ? r.items.map((e) => entryRow(e, false)).join('') : `<p class="small muted pad">${r.member.id === fam().me ? 'Nothing right now — ＋ Book to add what you\'re reading or listening to.' : 'Nothing right now.'}</p>`}`).join('');
  } else if (rd.tab === 'want') {
    body = L.want.length ? L.want.map((e) => entryRow(e, e.member.id !== fam().me)).join('') : '<p class="small muted pad">Books you want to read go here. ＋ Book, then Want to Read.</p>';
  } else {
    const years = {};
    for (const e of L.finished) (years[(e.st.done || '').slice(0, 4) || 'Earlier'] ||= []).push(e);
    body = L.finished.length ? Object.entries(years).map(([y, list]) => `<h3 class="wl-h">${esc(y)} · ${list.length}</h3>${list.map((e) => entryRow(e)).join('')}`).join('') : '<p class="small muted pad">Finished books show here.</p>';
    if (L.dropped.length) body += `<details class="pad"><summary class="small muted">✋ Dropped · ${L.dropped.length}</summary>${L.dropped.map((e) => entryRow(e)).join('')}</details>`;
  }
  el.innerHTML = `${demoBanner()}<section class="fx-head"><h2><button type="button" class="linkish" data-view="us" aria-label="Back to Us">‹</button> 📚 Books</h2><button type="button" data-rd="add">＋ Book</button></section>
    <div class="seg bk-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${rd.tab === k}" class="${rd.tab === k ? 'on' : ''}" data-rd="tab:${k}">${l}${count[k] ? ` <small>${count[k]}</small>` : ''}</button>`).join('')}</div>
    <div class="bk-list">${body}</div>`;
}

// ---------- ＋ Book: search, pick, Reading / Listening / Want to Read ----------
export function addSheet() {
  if (lockedHere()) return toast(LOCKED_MSG);
  rd.q = ''; rd.results = null; rd.pick = null; rd.manual = false;
  drawAdd();
  setTimeout(() => $('#rdQ')?.focus(), 50);
}
function drawAdd() {
  const p = rd.pick;
  const head = `<div class="row between"><h2>${p ? '📚 Add' : '＋ Book'}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>`;
  if (p) {
    const have = rd.books.find((b) => B.sameBook(b, p));
    const st = have && mine(have.id);
    return openSheet(`${head}<div class="bk-pick">${coverImg(p, 'M', 'bk-cov-m')}<div><b>${esc(p.title)}</b><p class="small muted">${esc([B.authorLine(p), B.seriesLine(p), p.year].filter(Boolean).join(' · '))}</p>${have ? `<p class="small">Already in your books${st ? ` — you: ${esc(B.stateLine(st, have))}` : ''}.</p>` : ''}</div></div>
      <div class="bk-choose"><button type="button" data-rd="addas:reading:read">📖 Reading</button><button type="button" data-rd="addas:reading:listen">🎧 Listening</button><button type="button" class="ghost" data-rd="addas:want:read">Want to Read</button></div>
      <p class="small"><button type="button" class="linkish small" data-rd="addas:finished:read">✓ Already finished it</button> · <button type="button" class="linkish small" data-rd="back">‹ Another book</button></p>`);
  }
  if (rd.manual) {
    return openSheet(`${head}<form id="rdManual" class="stack"><label>Title<input name="title" required maxlength="160" autocomplete="off"></label><label>Author<input name="author" maxlength="80" autocomplete="off"></label>
      <div class="row"><label class="grow">Series <span class="muted">(optional)</span><input name="series" maxlength="80"></label><label style="width:5.5rem">#<input name="n" inputmode="numeric" maxlength="4"></label></div>
      <button type="submit">Next</button></form><p class="small"><button type="button" class="linkish small" data-rd="back">‹ Search instead</button></p>`);
  }
  const res = rd.results;
  openSheet(`${head}<label for="rdQ" class="small">Title, author or ISBN</label><input id="rdQ" type="search" data-rdq value="${esc(rd.q)}" autocomplete="off" enterkeyhint="search" placeholder="e.g. Project Hail Mary">
    <div id="rdRes" class="bk-res" role="status">${rd.searching ? '<p class="small muted">Looking…</p>' : res == null ? '' : res.error ? `<p class="small">${esc(res.error)}</p>` : res.length ? res.map((b, i) => `<button type="button" class="bk-hit" data-rd="pick:${i}">${coverImg(b)}<span class="grow"><b>${esc(b.title)}</b><small class="muted">${esc([B.authorLine(b), b.year].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<p class="small muted">Nothing found.</p>'}</div>
    <p class="small"><button type="button" class="linkish small" data-rd="manual">Can't find it? Add it by hand</button></p>
    <p class="tiny muted">Book details come from Open Library. Only what you type here is looked up — never who you are or what's on your list.</p>`);
}
export function onInput(t) {
  if (t.dataset.rdq == null) return;
  rd.q = t.value;
  clearTimeout(rd.timer);
  rd.timer = setTimeout(search, 350);
}
async function search() {
  const q = rd.q.trim();
  if (q.length < 2) { rd.results = null; return drawResults(); }
  rd.searching = true; drawResults();
  const asked = q;
  try { const r = await api.get(`/books/search?q=${encodeURIComponent(q)}`); if (rd.q.trim() !== asked) return; rd.results = r.results; }
  catch (e) { if (rd.q.trim() !== asked) return; rd.results = { error: !navigator.onLine ? "You're offline — add it by hand, or try again when you're connected." : e.message }; }
  finally { if (rd.q.trim() === asked) { rd.searching = false; drawResults(); } }
}
// Only the results list redraws while typing (the box keeps its focus and cursor).
function drawResults() {
  const box = $('#rdRes');
  if (!box) return;
  const res = rd.results;
  box.innerHTML = rd.searching ? '<p class="small muted">Looking…</p>' : res == null ? '' : res.error ? `<p class="small">${esc(res.error)}</p>` : res.length ? res.map((b, i) => `<button type="button" class="bk-hit" data-rd="pick:${i}">${coverImg(b)}<span class="grow"><b>${esc(b.title)}</b><small class="muted">${esc([B.authorLine(b), b.year].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<p class="small muted">Nothing found.</p>';
}
export function onSubmit(f) {
  if (f.id !== 'rdManual') return false;
  const v = Object.fromEntries(new FormData(f));
  rd.pick = B.normalizeBook({ title: v.title, authors: v.author ? [v.author] : [], series: v.series ? { name: v.series, n: +v.n || undefined } : null });
  rd.manual = false; drawAdd();
  return true;
}
// Add (or, if it's already in the family's books, just put it on your list) with your state.
async function addAs(s, f) {
  const p = rd.pick;
  if (!p) return;
  const st = { s, f, ...(s === 'reading' ? { start: isoLocal() } : s === 'finished' ? { done: isoLocal() } : {}) };
  const have = rd.books.find((b) => B.sameBook(b, p));
  if (have) {
    await api.put(`${P()}/${have.id}/me`, { state: st });
  } else {
    // The work's series, genres and length, if Open Library has them (a moment at most; never required).
    let extra = {};
    if (p.ol) extra = await Promise.race([api.get(`/books/work/${p.ol.split('/').pop()}`).then((r) => r.details).catch(() => ({})), new Promise((r) => setTimeout(() => r({}), 2500))]);
    const book = B.normalizeBook({ ...p, ...(extra.series && !p.series ? { series: extra.series } : {}), genres: [...new Set([...(p.genres || []), ...(extra.genres || [])])], subjects: p.subjects?.length ? p.subjects : extra.subjects, pages: p.pages || extra.pages });
    await api.post(P(), { body: await lock(book), state: st });
  }
  closeSheet();
  toast(`📚 ${p.title} — ${s === 'reading' ? (f === 'listen' ? '🎧 Listening' : '📖 Reading') : B.LIFE[s]}`);
  await loadBooks(true);
  refresh();
}
function refresh() { if (state.view === 'read') renderRead(); else if (state.view === 'us') renderUsRead(); }
// 🗣️ For Talk to Pawmily: find a book (yours first, then Open Library), add one, change your state,
// and undo — the same records and calls as the screens above.
const norm = (t) => String(t || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export async function talkFind(title) {
  await loadBooks();
  const q = norm(title), have = rd.books.filter((b) => !b.locked && (norm(b.title) === q || (q.length > 3 && norm(b.title).startsWith(q))));
  if (have.length) return { have: have.map((b) => ({ id: b.id, title: b.title, author: B.authorLine(b), state: mine(b.id)?.s || null })) };
  const r = await api.get(`/books/search?q=${encodeURIComponent(title)}`).catch(() => ({ results: [] }));
  return { results: (r.results || []).slice(0, 3) };
}
export async function talkAdd(pick, s, recBy = '') {
  const book = B.normalizeBook({ ...pick, ...(recBy ? { recBy } : {}) });
  const st = { s, f: 'read', ...(s === 'reading' ? { start: isoLocal() } : s === 'finished' ? { done: isoLocal() } : {}) };
  const r = await api.post(P(), { body: await lock(book), state: st });
  await loadBooks(true); refresh();
  return r.book?.id || null;
}
export async function talkSetState(id, s) { const before = mine(id)?.s || null; await setMine(id, { s }); refresh(); return before; }
export async function talkUndoAdd(id) { await api.del(`${P()}/${id}`); await loadBooks(true); refresh(); }

// ---------- a book's details ----------
export function detail(id) {
  const b = byId(id);
  if (!b) return;
  const st = mine(id), ppl = people(), E = esc;
  const others = ppl.filter((m) => m.id !== fam().me && rd.state[id]?.[m.id]);
  const seg = (k, l) => `<button type="button" class="${st?.s === k ? 'on' : ''}" aria-pressed="${st?.s === k}" data-rd="set:${id}:${k}">${l}</button>`;
  const fmt = (k) => `<button type="button" class="${st?.f === k ? 'on' : ''}" aria-pressed="${st?.f === k}" data-rd="fmt:${id}:${k}">${B.FORMATS[k].icon} ${B.FORMATS[k].label}</button>`;
  const prog = st?.p || {};
  const unit = prog.page ? 'page' : prog.ch ? 'ch' : prog.min ? 'min' : 'pct';
  openSheet(`<div class="row between"><h2>${E(b.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="bk-pick">${coverImg(b, 'M', 'bk-cov-m')}<div><p class="small">${E(B.authorLine(b))}${b.year ? ` · ${b.year}` : ''}</p>${B.seriesLine(b) ? `<p class="small">📚 ${E(B.seriesLine(b))}</p>` : ''}${b.genres?.length ? `<p class="tiny muted">${E(b.genres.join(' · '))}</p>` : ''}${b.audio?.narrator ? `<p class="tiny muted">🎧 Narrated by ${E(b.audio.narrator)}</p>` : ''}${b.recBy && member(b.recBy) ? `<p class="tiny muted">💬 Recommended by ${E(firstName(member(b.recBy).name))}</p>` : ''}</div></div>
    ${others.map((m) => `<p class="small">${E(firstName(m.name))}: ${E(B.stateLine(rd.state[id][m.id], b))}</p>`).join('')}
    <h3 class="card-h">You</h3>
    <div class="seg" role="group" aria-label="Your status">${seg('want', 'Want to Read')}${seg('reading', 'Reading')}${seg('finished', 'Finished')}</div>
    ${st && st.s !== 'want' ? `<div class="seg" role="group" aria-label="How">${fmt('read')}${fmt('listen')}${fmt('both')}</div>` : ''}
    ${st?.s === 'reading' ? `<form id="rdProg" data-id="${id}" class="row bk-prog"><label class="vh" for="rdProgN">How far</label><input id="rdProgN" name="n" inputmode="numeric" maxlength="5" placeholder="optional" value="${prog[unit] ?? ''}"><select name="unit" aria-label="Measured in"><option value="pct" ${unit === 'pct' ? 'selected' : ''}>%</option><option value="page" ${unit === 'page' ? 'selected' : ''}>page</option><option value="ch" ${unit === 'ch' ? 'selected' : ''}>chapter</option>${st.f !== 'read' ? `<option value="min" ${unit === 'min' ? 'selected' : ''}>minutes in</option>` : ''}</select><button type="submit" class="ghost">Save</button></form>` : ''}
    ${st?.s === 'finished' ? `<div class="row bk-stars" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="icon-btn ${st.r >= n ? 'on' : ''}" aria-label="${n} star${n === 1 ? '' : 's'}" aria-pressed="${st.r === n}" data-rd="rate:${id}:${n}">${st.r >= n ? '★' : '☆'}</button>`).join('')}</div>` : ''}
    <div class="row wrap" style="margin-top:10px"><button type="button" class="grow" data-rd="discuss:${id}">💬 Discuss</button><button type="button" class="ghost" data-rd="more:${id}" aria-label="More">⋯</button></div>`);
}
function moreSheet(id) {
  const b = byId(id), st = mine(id), mineBook = b.by === fam().me;
  const others = Object.keys(rd.state[id] || {}).filter((w) => w !== fam().me);
  const aud = (k, l) => `<button type="button" class="${b.aud === k ? 'on' : ''}" aria-pressed="${b.aud === k}" data-rd="aud:${id}:${k}" ${b.aud !== k && (others.length || (k === 'me' && !mineBook)) ? 'disabled' : ''}>${l}</button>`;
  openSheet(`<div class="row between"><h2>${esc(b.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small">Who sees it</p><div class="seg" role="group" aria-label="Who sees it">${aud('me', 'Only me')}${aud('us', 'Us two')}${aud('family', 'Family')}</div>${others.length ? '<p class="tiny muted">It\'s on someone else\'s list too, so who sees it stays as it is.</p>' : ''}
    <div class="stack" style="margin-top:12px">
      ${st?.s !== 'dropped' ? `<button type="button" class="ghost" data-rd="set:${id}:dropped">✋ Dropped it</button>` : ''}
      <button type="button" class="ghost" data-rd="edit:${id}">✏️ Series, narrator, length</button>
      ${st ? `<button type="button" class="ghost" data-rd="off:${id}">Take off my list</button>` : ''}
      ${mineBook && !others.length ? `<button type="button" class="ghost danger" data-rd="del:${id}">Delete this book</button>` : ''}
    </div>`);
}
function editSheet(id) {
  const b = byId(id);
  openSheet(`<div class="row between"><h2>${esc(b.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <form id="rdEdit" data-id="${id}" class="stack"><div class="row"><label class="grow">Series<input name="series" maxlength="80" value="${esc(b.series?.name || '')}"></label><label style="width:5.5rem">#<input name="n" inputmode="numeric" maxlength="4" value="${esc(b.series?.n ?? '')}"></label></div>
      <label>Audiobook narrator<input name="narrator" maxlength="80" value="${esc(b.audio?.narrator || '')}"></label>
      <label>Audiobook length (hours)<input name="hours" inputmode="decimal" maxlength="5" value="${b.audio?.minutes ? Math.round(b.audio.minutes / 6) / 10 : ''}"></label>
      <button type="submit">Save</button></form>`);
}
async function setMine(id, patch) {
  const cur = mine(id) || { s: 'want', f: 'read' };
  const next = { ...cur, ...patch };
  if (patch.s === 'reading' && cur.s !== 'reading') next.start = isoLocal();
  if (patch.s === 'finished' && cur.s !== 'finished') { next.done = isoLocal(); if (next.p) delete next.p; }
  if (patch.s && patch.s !== 'reading') delete next.p;
  const r = await api.put(`${P()}/${id}/me`, { state: next });
  rd.state[id] = r.state;
}
async function saveBody(id, change) {
  const b = byId(id);
  const { id: _i, by: _b, at: _a, aud: _au, locked, ...pub } = b;
  if (locked) return toast(LOCKED_MSG);
  const next = B.normalizeBook({ ...pub, ...change });
  await api.patch(`${P()}/${id}`, { body: await lock(next) });
  Object.assign(b, next);
}
export async function onSubmitAsync(f) {
  if (f.id === 'rdProg') {
    const v = Object.fromEntries(new FormData(f)), id = f.dataset.id, n = v.n === '' ? null : +v.n;
    await setMine(id, { p: n == null || !Number.isFinite(n) ? undefined : { [v.unit]: n } });
    toast('Saved'); detail(id); return refresh();
  }
  if (f.id === 'rdEdit') {
    const v = Object.fromEntries(new FormData(f)), id = f.dataset.id;
    await saveBody(id, { series: v.series ? { name: v.series, n: +v.n || undefined } : null, audio: { narrator: v.narrator, minutes: +v.hours > 0 ? Math.round(+v.hours * 60) : undefined } });
    toast('Saved'); detail(id); return refresh();
  }
  return null;
}
export async function onClick(t) {
  const [a, id, x, y] = t.dataset.rd.split(':');
  switch (a) {
    case 'add': return addSheet();
    case 'tab': rd.tab = id; if (state.view !== 'read') return show('read'); return renderRead();
    case 'open': return detail(id);
    case 'manual': rd.manual = true; return drawAdd();
    case 'back': rd.pick = null; rd.manual = false; drawAdd(); return setTimeout(() => $('#rdQ')?.focus(), 50);
    case 'pick': rd.pick = rd.results?.[+id] || null; return drawAdd();
    case 'addas': t.disabled = true; return addAs(id, x);
    case 'set': await setMine(id, { s: x }); detail(id); return refresh();
    case 'fmt': await setMine(id, { f: x }); detail(id); return refresh();
    case 'rate': await setMine(id, { r: mine(id)?.r === +x ? undefined : +x }); detail(id); return refresh();
    case 'more': return moreSheet(id);
    case 'edit': return editSheet(id);
    case 'aud': await api.patch(`${P()}/${id}`, { aud: x }); byId(id).aud = x; toast(x === 'me' ? 'Only you see it' : x === 'us' ? 'The two of you see it' : 'The family sees it'); return moreSheet(id);
    case 'off': { const r = await api.put(`${P()}/${id}/me`, { state: null }); rd.state[id] = r.state; closeSheet(); toast('Taken off your list'); return refresh(); }
    case 'del': if (!confirm('Delete this book?')) return null; await api.del(`${P()}/${id}`); closeSheet(); await loadBooks(true); toast('Deleted'); return refresh();
    case 'discuss': { const b = byId(id); return discuss(`b:${id}`, `📚 ${b.title}`, [B.authorLine(b), B.seriesLine(b)].filter(Boolean).join(' · ')); }
    default: return y;
  }
}
