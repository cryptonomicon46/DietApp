// 👔 Look: what should I wear today? From clothes you actually own — complete outfits you already
// wear count from the first photo; pieces can be pulled out of them later. Today (three Looks for
// today's plans and weather), Closet (your pieces) and Saved (combinations you like).
// Loaded only when Look (or its small card on Calendar) is opened.
//
// Private: your Closet is one record and its pictures, yours alone on the connector, locked with
// the family key in an encrypted family. Recommendations are worked out on this phone (js/look.js)
// — nothing about your day or your clothes is sent anywhere to make them. Claude is used only
// when you tap for it (naming a piece from its photo, finding the pieces in an outfit photo),
// with just that one picture. A Fit Check shares one Look, on purpose, with your partner.
import * as L from '../js/look.js';
import { cutout, gray8 } from '../js/cutout.js';

const lk = { c: null, rec: null, at: 0, loaded: false, tab: 'today', view: null, timer: null, urls: new Map(), loading: new Map(), day: null, sel: 0, undo: null, refine: {}, draft: null, fcs: null, fcOpen: null, ai: null, filter: 'All', q: '' };
export const state = lk;
const E = (s) => lk.c.esc(s);
const P = () => `/families/${lk.c.fid}/members/${lk.c.me}/look`;
const today = () => lk.c.iso();

// ctx: { api, fid, me, esc, toast, openSheet, closeSheet, confirm, iso, el, show, lock, unlock,
//        sealBytes, openBytes, key, partner, name, dayEntries, discuss, aiReady, prev }
export async function load(c) {
  lk.c = c;
  const r = await c.api.get(P());
  const data = r?.data ? await c.unlock(r.data.enc ?? r.data) : null;
  if (r?.data && !data) throw Object.assign(new Error('🔒 This device needs the family key first — Me › 🔐 Encryption'), { locked: true });
  lk.rec = L.normalize(data || {});
  lk.at = r?.savedAt || 0; lk.loaded = true;
}
export function save(now = false) {
  clearTimeout(lk.timer);
  const go = async () => {
    try { const r = await lk.c.api.put(P(), { data: await lk.c.lock(lk.rec), base: lk.at }); lk.at = r.savedAt; }
    catch (e) {
      if (e.status !== 409) return lk.c.toast(`Couldn't save — ${e.message}`);
      await load(lk.c); lk.c.toast('Updated from your other device'); render();
    }
  };
  if (now) return go();
  lk.timer = setTimeout(go, 800);
  return null;
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lk.timer) save(true); });

// ---------- pictures (yours only; thumbnails in grids, the larger size only where it's big) ----------
const sniff = (b) => (b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : b[8] === 0x57 ? 'image/webp' : 'image/jpeg');
async function putImage(id, sizes) {
  const k = lk.c.key();
  for (const [size, bytes] of Object.entries(sizes)) await lk.c.api.bytes('PUT', `${P()}/img/${id}?size=${size}`, k ? await lk.c.sealBytes(k, bytes) : bytes);
}
async function loadImg(id, size) {
  const key = `${id}:${size}`;
  if (lk.urls.has(key)) return lk.urls.get(key);
  if (!lk.loading.has(key)) {
    lk.loading.set(key, (async () => {
      const k = lk.c.key();
      const locked = await lk.c.api.bytes('GET', `${P()}/img/${id}?size=${size}`);
      const bytes = k ? await lk.c.openBytes(k, locked) : locked;
      const url = URL.createObjectURL(new Blob([bytes], { type: sniff(bytes) }));
      lk.urls.set(key, url);
      return url;
    })().finally(() => lk.loading.delete(key)));
  }
  return lk.loading.get(key);
}
// <img data-lkimg="id:size"> fill in when they come on screen.
let io = null;
function hydrate(root = document) {
  const imgs = root.querySelectorAll('img[data-lkimg]:not([src])');
  const fill = (img) => { const [id, size] = img.dataset.lkimg.split(':'); loadImg(id, size).then((u) => { img.src = u; }).catch(() => img.classList.add('lk-noimg')); };
  if (typeof IntersectionObserver === 'undefined') return imgs.forEach(fill);
  io ||= new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: '200px' });
  imgs.forEach((i) => { const u = lk.urls.get(i.dataset.lkimg); if (u) i.src = u; else io.observe(i); });
}
const img = (id, size, alt = '', cls = '') => (id ? `<img data-lkimg="${id}:${size}" alt="${E(alt)}" class="${cls}" decoding="async">` : `<span class="lk-noimg ${cls}" aria-hidden="true">👕</span>`);

// ---------- photos: reading, shrinking, cutting out ----------
async function bitmap(file) { return createImageBitmap(file, { imageOrientation: 'from-image' }); }
function canvasOf(src, max, box = null) {
  const sw = box ? box.w : src.width, sh = box ? box.h : src.height;
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d', { willReadFrequently: true });
  if (box) g.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height); else g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function encode(canvas, alpha, q = 0.82) {
  let blob = await new Promise((r) => canvas.toBlob(r, alpha ? 'image/webp' : 'image/jpeg', q));
  if (alpha && blob?.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('no picture');
  return new Uint8Array(await blob.arrayBuffer());
}
// A whole-outfit photo: kept as it is (shrunk, location and camera details gone with the redraw).
async function outfitPhoto(file) {
  const b = await bitmap(file);
  const full = canvasOf(b, 1600), thumb = canvasOf(b, 560);
  const out = { full: await encode(full, false), thumb: await encode(thumb, false, 0.74), aspect: b.width / b.height };
  out.preview = URL.createObjectURL(new Blob([out.thumb], { type: 'image/jpeg' }));
  b.close?.();
  return out;
}
// One piece: cut out on the phone (js/cutout.js), its colours and fingerprint worked out.
// src: an ImageBitmap (or canvas); box: part of it (a piece found in an outfit photo).
async function piece(src, { tolerance = 1, box = null, original = false } = {}) {
  const small = canvasOf(src, 360, box);
  const g = small.getContext('2d', { willReadFrequently: true });
  const pix = g.getImageData(0, 0, small.width, small.height);
  const cut = original ? { ok: true, alpha: null, box: { x: 0, y: 0, w: small.width, h: small.height }, reason: '' } : cutout(pix, { tolerance });
  const big = canvasOf(src, 1100, box);
  if (cut.alpha) {
    const m = document.createElement('canvas'); m.width = small.width; m.height = small.height;
    const mg = m.getContext('2d'), md = mg.createImageData(m.width, m.height);
    for (let i = 0; i < cut.alpha.length; i++) md.data[i * 4 + 3] = cut.alpha[i];
    mg.putImageData(md, 0, 0);
    const bg = big.getContext('2d');
    bg.globalCompositeOperation = 'destination-in'; bg.imageSmoothingQuality = 'high';
    bg.drawImage(m, 0, 0, big.width, big.height);
  }
  const k = big.width / small.width;
  const bx = { x: Math.round(cut.box.x * k), y: Math.round(cut.box.y * k), w: Math.round(cut.box.w * k), h: Math.round(cut.box.h * k) };
  const full = canvasOf(big, 1100, bx), thumb = canvasOf(big, 360, bx);
  // Colours and the fingerprint from the kept pixels.
  const masked = new Uint8ClampedArray(pix.data);
  if (cut.alpha) for (let i = 0; i < cut.alpha.length; i++) masked[i * 4 + 3] = cut.alpha[i];
  const colors = L.dominantColors(masked);
  const hash = L.aHash(gray8(pix, cut.alpha, cut.box));
  const alpha = !!cut.alpha;
  const out = { ok: cut.ok, reason: cut.reason, alpha, full: await encode(full, alpha), thumb: await encode(thumb, alpha, 0.8), aspect: full.width / full.height, colors, hash };
  out.preview = URL.createObjectURL(new Blob([out.thumb], { type: sniff(out.thumb) }));
  return out;
}

// ---------- today's plans and weather (on the phone; only a short label is shown) ----------
const LS = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } } };
async function dressHours(place, date) {
  const B = await import('../js/brief.js');
  const cache = LS.get('fam.dressWx') || {};
  let c = cache[place.id];
  if (!c || Date.now() - c.at > 60 * 60000) {
    const r = await fetch(B.weatherUrls(place, 7).forecast);
    if (!r.ok) throw new Error(`weather ${r.status}`);
    c = { at: Date.now(), forecast: await r.json() };
    cache[place.id] = c; LS.set('fam.dressWx', cache);
  }
  return B.parseWeather(c.forecast, null).filter((h) => lk.c.iso(h.time) === date);
}
// Towns from the day's event addresses, looked up once with Open-Meteo's free place search.
async function eventPlaces(D, entries) {
  const geo = LS.get('fam.geo') || {};
  const out = [];
  for (const town of [...new Set(entries.map((e) => D.townOf(e.place)).filter(Boolean))]) {
    if (D.matchPlace(town)) continue;
    const k = town.toLowerCase();
    if (!(k in geo)) {
      const j = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: town, count: '5', language: 'en' })}`).then((r) => r.json()).catch(() => null);
      const hit = (j?.results || []).find((x) => x.country_code === 'US' && x.admin1 === 'California') || (j?.results || []).find((x) => x.country_code === 'US') || j?.results?.[0];
      geo[k] = hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null;
      LS.set('fam.geo', geo);
    }
    if (geo[k]) out.push({ id: `g-${k.replace(/[^a-z0-9]+/g, '')}`, name: geo[k].name || town, lat: geo[k].lat, lon: geo[k].lon, keys: [k] });
  }
  return out;
}
export async function context(date = today()) {
  const me = lk.c.me;
  const entries = (await lk.c.dayEntries(date).catch(() => [])).filter((e) => e.cls === 'fam' && (e.who === me || e.who === 'both' || e.who === 'nobody'));
  const evs = entries.map((e) => ({ title: e.title, place: e.place, time: e.time, end: e.end, allDay: e.allDay || !e.time, who: e.who === 'both' ? me : e.who }));
  const d = L.dayContext(evs, new Date(`${date}T12:00:00`).getDay());
  let wx = null, place = '';
  try {
    const D = await import('../js/dress.js');
    const places = [...D.PLACES, ...(await eventPlaces(D, entries).catch(() => []))];
    const where = D.whereOn(evs, me, places, null);
    place = where.place.name;
    wx = D.dressFor(await dressHours(where.place, date), where.leave, Math.max(where.back, d.time ? +d.time.split(':')[0] + 3 : 0));
  } catch { /* no weather: still works */ }
  const w = L.weatherNeed(wx, d.evening);
  return { ...d, f: L.OCCASIONS[d.occ].f, need: w.need, rain: w.rain, cool: w.cool, range: w.range, place, date };
}

// ---------- today ----------
async function computeToday(fresh = false) {
  if (!lk.day || fresh || lk.day.date !== today()) lk.day = { date: today(), ctx: await context(), worn: null };
  const r = L.recommend(lk.rec, lk.day.ctx, today(), lk.refine);
  lk.day.ctx2 = r.ctx; lk.day.looks = r.looks;
  if (lk.sel >= r.looks.length) lk.sel = 0;
  lk.day.worn = lk.rec.wears.find((w) => w.d === today()) || null;
  summary();
  return lk.day;
}
// What Home and Calendar show without loading anything (kept on this phone).
function summary() {
  const d = lk.day;
  if (!d) return;
  const top = d.looks[0];
  LS.set(`fam.look.${lk.c.fid}.${lk.c.me}`, { date: d.date, label: d.ctx.label, range: d.ctx.range, n: d.looks.length, worn: d.worn?.name || '', name: top?.name || '', thumbs: top ? (top.items.length ? top.items.slice(0, 4).map((i) => i.img).filter(Boolean) : [top.look?.photo].filter(Boolean)) : [] });
}
const current = () => lk.day?.looks?.[lk.sel] || null;
const partnerName = () => lk.c.partner()?.name || '';

// ---------- boards ----------
// The flat-lay of a Look's own pieces (or the outfit photo when it's just a photo).
function board(look, size = 'thumb', cls = '') {
  const items = look.items || [];
  const photo = look.look?.photo || look.photo;
  if (!items.length && photo) return `<div class="lk-board photo ${cls}">${img(photo, size, look.name || 'Look')}</div>`;
  if (!items.length) return `<div class="lk-board empty ${cls}"><span aria-hidden="true">👔</span></div>`;
  const lay = L.boardLayout(items);
  return `<div class="lk-board ${cls}" role="img" aria-label="${E(`${look.name || 'Look'}: ${items.map((i) => i.name).join(', ')}`)}">${lay.map((s) => { const it = items.find((i) => i.id === s.id); return `<span class="lk-slot" style="left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%;z-index:${s.z}">${img(it.img, size, '')}</span>`; }).join('')}</div>`;
}
const date = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// ---------- screens ----------
export function render() {
  const el = lk.c?.el();
  if (!el) return;
  if (lk.view === 'addlook') el.innerHTML = addLookHtml();
  else if (lk.view === 'additem') el.innerHTML = addItemHtml();
  else if (lk.view === 'pieces') el.innerHTML = piecesHtml();
  else if (lk.view === 'fit') el.innerHTML = fitHtml();
  else el.innerHTML = `${head()}${lk.tab === 'closet' ? closetHtml() : lk.tab === 'saved' ? savedHtml() : todayHtml()}`;
  hydrate(el);
}
function head() {
  const back = lk.c.prev();
  return `<section class="lk-head"><button type="button" class="linkish lk-back" data-view="${back.view}">‹ ${E(back.label)}</button><h2>👔 Look</h2>
    <div class="seg lk-tabs" role="tablist" aria-label="Look">${[['today', 'Today'], ['closet', 'Closet'], ['saved', 'Saved']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${lk.tab === k}" class="${lk.tab === k ? 'on' : ''}" data-lk="tab:${k}">${l}</button>`).join('')}</div></section>`;
}
function onboardHtml() {
  if (!lk.rec.looks.length && !L.closet(lk.rec).length) {
    return `<section class="card lk-welcome"><h3>Build your Work Closet</h3><p>Start with outfits you already wear. You don't need to catalog everything.</p>
      <button type="button" class="wide" data-lk="addlook">Add your first Look</button>
      <p class="small center"><button type="button" class="linkish small" data-lk="additem">Add an individual piece</button></p></section>`;
  }
  return '';
}
function contextHtml(c) {
  const day = new Date(`${c.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const style = c.f >= 5 ? 'Dressed up' : c.f >= 4 ? 'Business' : c.f >= 3 ? (['work', 'bizcasual', 'meeting'].includes(c.occ) ? 'Business casual' : 'Smart casual') : 'Casual';
  return `<section class="lk-ctx" aria-label="Today"><b>${E(day)} · ${E(c.label)}</b>${c.place || c.range ? `<span class="small muted">${E([c.place, c.range].filter(Boolean).join(' · '))}${c.rain ? ' · rain' : ''}</span>` : '<span class="small muted">No forecast right now</span>'}
    <span class="lk-chips"><span class="chip">${E(L.OCCASIONS[c.occ].label)}</span><span class="chip">${E(style)}</span></span></section>`;
}
function todayHtml() {
  const welcome = onboardHtml();
  if (!lk.day) { computeToday().then(() => lk.tab === 'today' && !lk.view && render()).catch((e) => lk.c.toast(e.message)); return `${welcome}<div class="skeleton card lk-skel"></div>`; }
  const d = lk.day, l = current(), others = d.looks.filter((_, i) => i !== lk.sel);
  const fcs = fitCards();
  if (!l) {
    return `${fcs}${welcome || `<section class="card"><p>Add a few more pieces — a top, trousers and shoes — or a complete Look, and today's Looks show here.</p><div class="row"><button type="button" class="grow" data-lk="addlook">Add a Look</button><button type="button" class="ghost grow" data-lk="additem">Add an item</button></div></section>`}${contextHtml(d.ctx2 || d.ctx)}`;
  }
  const worn = d.worn;
  const hero = `<section class="lk-hero" aria-label="Look ${lk.sel + 1}">
      <div class="eyebrow">${worn ? '✓ Today\'s Look' : `Look ${lk.sel + 1}`}</div>
      ${board(worn ? wornLook(worn) : l, 'full', 'hero')}
      <h3 class="lk-name">${E(worn ? worn.name : l.name)}</h3>
      ${worn ? `<p class="small">${new Date().getHours() >= 15 ? 'Have a good night.' : 'Have a good day.'}</p><p class="small"><button type="button" class="linkish small" data-lk="unwear">Change today's Look</button></p>`
        : `<p class="lk-why"><span class="muted small">Why this works</span><br>${E(l.why)}</p>
      ${lk.undo ? `<p class="small center"><button type="button" class="linkish small" data-lk="undo">↶ Undo ${E(lk.undo.label)}</button></p>` : ''}
      <button type="button" class="wide lk-wear" data-lk="wear">Wear this</button>
      <div class="lk-acts"><button type="button" class="ghost" data-lk="swap">⇄ Swap</button><button type="button" class="ghost" data-lk="save">☆ Save</button>${partnerName() ? `<button type="button" class="ghost" data-lk="ask">❤️ Ask ${E(partnerName())}</button>` : ''}</div>`}
    </section>`;
  const alts = worn ? '' : others.length ? `<section class="lk-alts"><h3 class="wl-h">Other good options</h3><div class="lk-row" role="list">${others.map((o) => { const i = d.looks.indexOf(o); return `<button type="button" class="lk-alt" role="listitem" data-lk="sel:${i}">${board(o, 'thumb', 'mini')}<b>${E(o.name)}</b><small class="muted">${E(o.why)}</small></button>`; }).join('')}</div></section>` : '';
  const side = `<aside class="lk-side"><div class="lk-wideonly">${contextHtml(d.ctx2 || d.ctx)}</div>${fcs}<button type="button" class="ghost wide" data-lk="tab:closet">Closet · ${L.closet(lk.rec).length} piece${L.closet(lk.rec).length === 1 ? '' : 's'} ›</button></aside>`;
  return `<div class="lk-today"><div class="lk-mainc">${welcome}<div class="lk-narrowonly">${contextHtml(d.ctx2 || d.ctx)}</div>${hero}${alts}</div>${side}</div>`;
}
const wornLook = (w) => ({ name: w.name, items: w.items.map((id) => L.itemById(lk.rec, id)).filter(Boolean), look: lk.rec.looks.find((x) => x.id === w.look) });

function closetHtml() {
  const all = L.closet(lk.rec);
  const filters = L.filtersFor(all);
  if (!filters.includes(lk.filter)) lk.filter = 'All';
  const q = lk.q.trim().toLowerCase();
  const list = all.filter((i) => (lk.filter === 'All' || L.CATS[i.cat].filter === lk.filter) && (!q || `${i.name} ${i.color} ${i.sub} ${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(q))).sort((a, b) => b.at - a.at);
  return `<section class="lk-closet-top"><div class="row between"><h3>Closet</h3><button type="button" data-lk="add">＋ Add</button></div>
    ${all.length > 6 ? `<label class="lk-search"><span class="visually-hidden">Search your Closet</span><input type="search" data-lke="q" value="${E(lk.q)}" placeholder="Search"></label>` : ''}
    ${filters.length > 2 ? `<div class="lk-filters" role="group" aria-label="Show">${filters.map((f) => `<button type="button" class="chip${lk.filter === f ? ' on' : ''}" aria-pressed="${lk.filter === f}" data-lk="filter:${f}">${f}</button>`).join('')}</div>` : ''}</section>
    ${list.length ? `<div class="lk-grid">${list.map((i) => `<button type="button" class="lk-tile" data-lk="item:${i.id}">${img(i.img, 'thumb', i.name)}<span>${E(i.name)}</span></button>`).join('')}</div>`
      : all.length ? '<p class="small muted pad">Nothing matches.</p>' : `<section class="card lk-welcome"><p>Your Closet fills up from Looks you add (Find pieces) or one piece at a time.</p><div class="row"><button type="button" class="grow" data-lk="addlook">Add a Look</button><button type="button" class="ghost grow" data-lk="additem">Add an item</button></div></section>`}`;
}
function savedHtml() {
  const looks = lk.rec.looks.filter((l) => l.saved).sort((a, b) => (b.lastWorn || '').localeCompare(a.lastWorn || '') || b.at - a.at);
  if (!looks.length) return `<section class="card lk-welcome"><p>Looks you save show here, ready to wear again.</p><button type="button" class="wide" data-lk="addlook">Add a Look</button></section>`;
  return `<div class="lk-saved">${looks.map((l) => { const items = l.items.map((id) => L.itemById(lk.rec, id)).filter(Boolean); return `<section class="card lk-savedcard">
    <button type="button" class="lk-savedopen" data-lk="look:${l.id}" aria-label="${E(l.name)}">${board({ ...l, items }, 'thumb')}</button>
    <div><b>${E(l.name)}</b><small class="muted">${l.lastWorn ? `Last worn ${E(date(l.lastWorn))}` : 'Not worn yet'}${l.verdict === 'hit' ? ' · 🔥 Hit' : ''}</small>
    <button type="button" class="ghost small" data-lk="again:${l.id}">Wear again</button></div></section>`; }).join('')}</div>`;
}

// ---------- add a Look (a complete outfit you already wear) ----------
const nameGuess = () => `${L.OCCASIONS[lk.day?.ctx?.occ || 'work'].word.replace('Weekend', 'Weekend').replace('Smart', 'Smart')} Look`;
function addLookHtml() {
  const d = lk.draft || {};
  const backTo = `<section class="lk-head"><button type="button" class="linkish lk-back" data-lk="cancel">‹ ${lk.tab === 'closet' ? 'Closet' : 'Look'}</button><h2>Add a Look</h2></section>`;
  if (d.step === 'saved') {
    const l = lk.rec.looks.find((x) => x.id === d.lookId), first = lk.rec.looks.filter((x) => x.saved).length === 1;
    return `${backTo}<section class="card"><p class="lk-ok">Look saved ✓</p>${board({ ...l, items: [] }, 'thumb')}<h3>${E(l.name)}</h3>
      ${first ? '<p>Great — you can already use this Look.</p>' : ''}
      <p><b>Build your Closet from this?</b><br><span class="small muted">We can find the individual pieces in this outfit.</span></p>
      <button type="button" class="wide" data-lk="pieces:${l.id}">Find pieces</button>
      <div class="row"><button type="button" class="ghost grow" data-lk="addlook">Add another Look</button><button type="button" class="ghost grow" data-lk="cancel">Not now</button></div></section>`;
  }
  if (!d.photo) {
    return `${backTo}<section class="card"><p>Add a photo of an outfit you already wear — a mirror photo, a full-length one, an outfit laid flat, or one you already have.</p>
      <input type="file" accept="image/*" capture="environment" data-lkpick="look" id="lkCam" hidden><input type="file" accept="image/*" data-lkpick="look" id="lkLib" hidden>
      <div class="row"><button type="button" class="grow" data-lk="pick:lkCam">📷 Take photo</button><button type="button" class="ghost grow" data-lk="pick:lkLib">🖼 Choose photo</button></div>
      ${d.error ? `<p class="small" role="alert">${E(d.error)}</p>` : ''}${d.busy ? '<p class="small muted">Getting it ready…</p>' : ''}</section>`;
  }
  return `${backTo}<section class="card lk-addlook"><img class="lk-preview" src="${d.photo.preview}" alt="Your outfit">
    <label>Name<input data-lke="lookname" value="${E(d.name ?? nameGuess())}" maxlength="60"></label>
    <div class="small">For <span class="muted">(optional)</span></div>
    <div class="lk-chips" role="group" aria-label="What it's for">${L.LOOK_CHIPS.map((k) => `<button type="button" class="chip${(d.tags || []).includes(k) ? ' on' : ''}" aria-pressed="${(d.tags || []).includes(k)}" data-lk="tag:${k}">${E(L.OCCASIONS[k].label)}</button>`).join('')}</div>
    <button type="button" class="wide" data-lk="savelook" ${d.busy ? 'disabled' : ''}>${d.busy ? 'Saving…' : 'Save Look'}</button>
    <p class="small center"><button type="button" class="linkish small" data-lk="pick:lkLib2">Use a different photo</button></p><input type="file" accept="image/*" data-lkpick="look" id="lkLib2" hidden></section>`;
}
async function saveLook() {
  const d = lk.draft;
  if (!d?.photo || d.busy) return;
  d.busy = true; render();
  try {
    const id = L.newId();
    await putImage(id, { full: d.photo.full, thumb: d.photo.thumb });
    lk.urls.set(`${id}:thumb`, d.photo.preview);
    const look = L.makeLook({ name: (d.name ?? nameGuess()).trim() || nameGuess(), tags: d.tags || [], photo: id, photoAspect: d.photo.aspect, saved: true, source: 'photo', at: Date.now() });
    lk.rec = { ...lk.rec, looks: [...lk.rec.looks, look], ob: { ...lk.rec.ob, welcomed: true } };
    await save(true);
    lk.draft = { step: 'saved', lookId: look.id }; lk.day = null;
  } catch (e) { d.busy = false; d.error = e.message; lk.c.toast(`Couldn't save — ${e.message}`); }
  render();
}

// ---------- add an item (one piece) ----------
function addItemHtml() {
  const d = lk.draft || {};
  const backTo = `<section class="lk-head"><button type="button" class="linkish lk-back" data-lk="cancel">‹ ${lk.tab === 'closet' ? 'Closet' : 'Look'}</button><h2>Add an item</h2></section>`;
  const pickers = `<input type="file" accept="image/*" capture="environment" data-lkpick="item" id="lkCam" hidden><input type="file" accept="image/*" data-lkpick="item" id="lkLib" hidden>`;
  if (!d.pic) {
    return `${backTo}<section class="card"><p>Photograph one piece — laid flat or hung against a plain wall works best.</p>${pickers}
      <div class="row"><button type="button" class="grow" data-lk="pick:lkCam">📷 Take photo</button><button type="button" class="ghost grow" data-lk="pick:lkLib">🖼 Choose photo</button></div>
      ${d.busy ? '<p class="small muted" role="status">Cleaning up the background…</p>' : ''}${d.error ? `<p class="small" role="alert">${E(d.error)}</p>` : ''}</section>`;
  }
  const p = d.pic, it = d.item;
  const failed = !p.ok && !d.useOriginal;
  const dup = !d.dupDone && L.likelySame({ ...it, hash: p.hash }, lk.rec.items);
  return `${backTo}<section class="card lk-additem">${pickers}
    <div class="lk-cut${p.alpha ? ' alpha' : ''}"><img src="${p.preview}" alt="${E(it.name)}"></div>
    ${failed ? `<p role="alert"><b>Couldn't clean this image perfectly.</b></p><div class="row wrap"><button type="button" class="ghost grow" data-lk="original">Use original</button><button type="button" class="ghost grow" data-lk="retry">Try again</button><button type="button" class="ghost grow" data-lk="pick:lkCam">Retake</button></div>` : ''}
    ${d.reading ? '<p class="small muted" role="status">Naming it…</p>' : ''}
    <div role="group" aria-label="What is it?"><p class="small muted">What is it?</p><div class="lk-chips">${['top', 'bottom', 'outer', 'shoes', 'watch', 'accessory', 'dress'].map((k) => `<button type="button" class="chip${it.cat === k ? ' on' : ''}" aria-pressed="${it.cat === k}" data-lk="icat:${k}">${E(L.CATS[k].label)}</button>`).join('')}</div></div>
    <p class="small muted">Looks like</p><h3>${E(it.name)}</h3>
    <div class="lk-chips">${it.color ? `<span class="chip">${E(cap(it.color))}</span>` : ''}<span class="chip">${E(cap(it.sub || L.CATS[it.cat].label))}</span><span class="chip">${E(FORMAL[it.formality - 1])}</span></div>
    ${dup ? `<div class="note" role="status">Looks like your <b>${E(dup.item.name)}</b>${dup.sure ? '' : ' (maybe)'}.<div class="row"><button type="button" class="ghost grow" data-lk="usedup:${dup.item.id}">Use existing</button><button type="button" class="ghost grow" data-lk="adddup">Add new</button></div></div>` : ''}
    ${d.edit ? itemForm(it, 'new') : `<div class="row"><button type="button" class="grow" data-lk="itemok" ${failed || dup ? 'disabled' : ''}>Looks right</button><button type="button" class="ghost" data-lk="itemedit">Edit</button></div>`}
    ${lk.ai === true && !d.named && !d.reading ? `<p class="small center"><button type="button" class="linkish small" data-lk="nameai">✨ Name it with Claude</button></p><p class="tiny muted center">Sends only this cut-out picture to Claude (Anthropic) to name the piece. Not kept.</p>` : ''}
    ${d.byClaude ? '<p class="tiny muted center">Named by Claude from this picture only. Not kept.</p>' : ''}</section>`;
}
const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
const FORMAL = ['Casual', 'Relaxed', 'Smart casual', 'Business', 'Formal'];
const WARM = ['Light', 'Mid-weight', 'Warm', 'Heavy'];
function itemForm(it, mode) {
  const sel = (name, opts, cur) => `<select data-lke="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${E(l)}</option>`).join('')}</select>`;
  return `<div class="lk-form" data-lkform="${mode}">
    <label>Name<input data-lke="name" value="${E(it.name)}" maxlength="80"></label>
    <div class="row wrap"><label class="grow">Kind${sel('cat', Object.entries(L.CATS).map(([k, v]) => [k, v.label]), it.cat)}</label><label class="grow">Colour<input data-lke="color" value="${E(it.color)}" maxlength="20"></label></div>
    <div class="row wrap"><label class="grow">How dressy${sel('formality', FORMAL.map((l, i) => [i + 1, l]), it.formality)}</label><label class="grow">Warmth${sel('warmth', WARM.map((l, i) => [i, l]), it.warmth)}</label></div>
    <details><summary class="small">More (optional): brand, model, material, size, notes</summary>
      ${['brand', 'model', 'material', 'size'].map((k) => `<label>${cap(k)}<input data-lke="${k}" value="${E(it[k] || '')}" maxlength="60"></label>`).join('')}
      <label>Notes<textarea data-lke="notes" rows="2" maxlength="300">${E(it.notes || '')}</textarea></label></details>
    ${mode === 'new' ? '<button type="button" class="wide" data-lk="itemok">Add to Closet</button>' : ''}</div>`;
}
async function itemPicked(file) {
  const d = lk.draft = { busy: true };
  render();
  try {
    d.bmp = await bitmap(file);
    await cutItem(1);
  } catch (e) { d.busy = false; d.error = "Couldn't open that picture — try another, or a screenshot."; render(); }
}
async function cutItem(tolerance, original = false) {
  const d = lk.draft;
  d.busy = true;
  const p = await piece(d.bmp, { tolerance, original });
  const color = p.colors[0]?.name || '';
  const g = L.guessFrom(d.item?.name || '', d.item?.cat || L.catFromShape(p.aspect));
  d.pic = p; d.useOriginal = original; d.busy = false;
  d.item = L.makeItem({ ...(d.item || {}), name: d.named ? d.item.name : L.suggestName(color, d.item?.sub || g.sub, d.item?.cat || g.cat), cat: d.item?.cat || g.cat, color: d.named ? d.item.color : color, hex: p.colors[0]?.hex, colors: p.colors.map((c) => c.name), hash: p.hash });
  if (lk.ai == null) lk.ai = await lk.c.aiReady().catch(() => null);
  render();
  // Once you've had Claude name a piece, it names the next ones too (just their picture goes).
  if (lk.ai === true && !d.named && !original && LS.get('fam.look.aiName')) nameWithClaude();
}
async function addItem(dupOf = null) {
  const d = lk.draft;
  if (!d?.pic) return;
  if (dupOf) { lk.c.toast(`Kept your ${dupOf.name}`); lk.draft = null; lk.view = null; return render(); }
  const id = L.newId();
  try {
    await putImage(id, { full: d.pic.full, thumb: d.pic.thumb });
    lk.urls.set(`${id}:thumb`, d.pic.preview);
    const item = L.makeItem({ ...d.item, img: id, aspect: d.pic.aspect, hash: d.pic.hash, at: Date.now() });
    lk.rec = { ...lk.rec, items: [...lk.rec.items, item] };
    await save(true);
    lk.draft = null; lk.view = null; lk.tab = 'closet'; lk.day = null;
    lk.c.toast(`Added ${item.name}`);
  } catch (e) { lk.c.toast(`Couldn't add it — ${e.message}`); }
  render();
}

// ---------- find the pieces in a Look ----------
function piecesHtml() {
  const p = lk.draft || {};
  const look = lk.rec.looks.find((l) => l.id === p.lookId);
  const backTo = `<section class="lk-head"><button type="button" class="linkish lk-back" data-lk="cancel">‹ Look</button><h2>Find pieces</h2></section>`;
  if (!look) return `${backTo}<p class="pad">That Look is gone.</p>`;
  if (p.status === 'consent') {
    return `${backTo}<section class="card">${board({ ...look, items: [] }, 'thumb')}<p><b>Sends only this photo to Claude to find the pieces.</b> Nothing else from your Closet goes with it, and it isn't kept. You check every piece before anything is added.</p>
      <button type="button" class="wide" data-lk="findai">Find pieces</button><p class="small center"><button type="button" class="linkish small" data-lk="manual">Mark them myself instead</button></p></section>`;
  }
  if (p.status === 'reading') return `${backTo}<section class="card"><p role="status">Finding the pieces… usually 5–20 seconds.</p></section>`;
  if (p.status === 'manual') return `${backTo}${manualHtml(look)}`;
  const list = p.list || [];
  return `${backTo}<section class="card"><p>${list.length ? 'We found' : 'No pieces found.'}</p>
    ${list.map((c, i) => { const dup = c.dupOf && L.itemById(lk.rec, c.dupOf); return `<div class="lk-cand${c.skip ? ' skip' : ''}">
      <div class="lk-cut small${c.pic?.alpha ? ' alpha' : ''}">${c.pic ? `<img src="${c.pic.preview}" alt="">` : '<span aria-hidden="true">…</span>'}</div>
      <div class="grow">${c.sure ? '' : `<small class="lk-unsure">Possible ${E((c.item.sub || L.CATS[c.item.cat].label).toLowerCase())} — check it</small>`}<input data-lke="cand:${i}" value="${E(c.name)}" aria-label="Name of piece ${i + 1}" maxlength="80">
        ${dup && !c.decided ? `<div class="small">Looks like your <b>${E(dup.name)}</b><div class="row"><button type="button" class="ghost small" data-lk="cuse:${i}">Use existing</button><button type="button" class="ghost small" data-lk="cnew:${i}">Add new</button></div></div>` : c.use ? `<small>Using your ${E(L.itemById(lk.rec, c.use)?.name || '')}</small>` : ''}</div>
      <label class="lk-inc"><input type="checkbox" data-lke="inc:${i}" ${c.skip ? '' : 'checked'}> <span class="visually-hidden">Include</span></label></div>`; }).join('')}
    <button type="button" class="wide" data-lk="addpieces" ${list.some((c) => !c.skip && c.dupOf && !c.decided) || !list.some((c) => !c.skip) ? 'disabled' : ''}>Add selected to Closet</button>
    <p class="small center"><button type="button" class="linkish small" data-lk="manual">Mark a piece myself</button></p></section>`;
}
// Mark a piece by hand: drag a box over it on the photo, say what it is.
function manualHtml(look) {
  const m = lk.draft.mark || {};
  return `<section class="card"><p class="small">Drag a box around one piece, then say what it is.</p>
    <div class="lk-mark" data-lkmark><img data-lkimg="${look.photo}:full" alt="Your outfit" draggable="false">${m.box ? `<i class="lk-box" style="left:${m.box.x * 100}%;top:${m.box.y * 100}%;width:${m.box.w * 100}%;height:${m.box.h * 100}%"></i>` : ''}</div>
    <div class="lk-chips" role="group" aria-label="What is it">${Object.entries(L.CATS).map(([k, v]) => `<button type="button" class="chip${m.cat === k ? ' on' : ''}" data-lk="mcat:${k}">${E(v.label)}</button>`).join('')}</div>
    <div class="row"><button type="button" class="grow" data-lk="markadd" ${m.box && m.cat ? '' : 'disabled'}>Add this piece</button><button type="button" class="ghost" data-lk="markdone">Done</button></div></section>`;
}
async function lookBitmap(look) {
  const url = await loadImg(look.photo, 'full');
  const b = await fetch(url).then((r) => r.blob());
  return bitmap(b);
}
async function findPieces() {
  const p = lk.draft, look = lk.rec.looks.find((l) => l.id === p.lookId);
  p.status = 'reading'; render();
  try {
    const bmp = await lookBitmap(look);
    const jpg = await encode(canvasOf(bmp, 1400), false, 0.85);
    let s = ''; for (let i = 0; i < jpg.length; i += 0x8000) s += String.fromCharCode(...jpg.subarray(i, i + 0x8000));
    const r = await lk.c.api.post('/ai/look/pieces', { image: btoa(s), mime: 'image/jpeg' });
    p.bmp = bmp;
    p.list = [];
    for (const c of (r.pieces || []).slice(0, 10)) {
      const box = { x: Math.round(c.box.x * bmp.width), y: Math.round(c.box.y * bmp.height), w: Math.max(8, Math.round(c.box.w * bmp.width)), h: Math.max(8, Math.round(c.box.h * bmp.height)) };
      const pic = await piece(bmp, { box }).catch(() => null);
      const item = L.makeItem({ name: c.name, cat: c.cat, sub: c.sub, color: c.color || pic?.colors[0]?.name, formality: c.formality, warmth: c.warmth });
      const dup = L.likelySame({ ...item, hash: pic?.hash }, lk.rec.items);
      p.list.push({ name: item.name, item, pic, sure: !!c.sure, dupOf: dup?.item.id || null });
    }
    p.status = 'list';
  } catch (e) {
    p.status = 'manual';
    lk.c.toast(e.status === 501 ? 'Finding pieces needs Claude on the connector — mark them yourself' : e.status === 429 ? e.message : "Couldn't find the pieces just now — mark them yourself");
  }
  render();
}
async function addPieces() {
  const p = lk.draft, look = lk.rec.looks.find((l) => l.id === p.lookId);
  const ids = [];
  const items = [...lk.rec.items];
  for (const c of p.list.filter((x) => !x.skip)) {
    if (c.use) { ids.push(c.use); continue; }
    const id = L.newId();
    if (c.pic) await putImage(id, { full: c.pic.full, thumb: c.pic.thumb });
    if (c.pic) lk.urls.set(`${id}:thumb`, c.pic.preview);
    const item = L.makeItem({ ...c.item, name: c.name, img: c.pic ? id : null, aspect: c.pic?.aspect, hash: c.pic?.hash, from: look.id, at: Date.now() });
    items.push(item); ids.push(item.id);
  }
  lk.rec = { ...lk.rec, items, looks: lk.rec.looks.map((l) => (l.id === look.id ? { ...l, items: [...new Set([...l.items, ...ids])], source: 'pieces' } : l)) };
  await save(true);
  lk.c.toast(`${ids.length} piece${ids.length === 1 ? '' : 's'} in your Closet`);
  lk.draft = null; lk.view = null; lk.tab = 'closet'; lk.day = null;
  render();
}

// ---------- item details ----------
function itemSheet(id) {
  const it = L.itemById(lk.rec, id);
  if (!it) return;
  lk.edit = { ...it };
  lk.c.openSheet(`<div class="row between"><h2>${E(it.name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="lk-cut${it.img ? ' alpha' : ''}">${img(it.img, 'full', it.name)}</div>
    <p class="small muted">${it.wearCount ? `Worn ${it.wearCount} time${it.wearCount === 1 ? '' : 's'}${it.lastWorn ? ` · last ${E(date(it.lastWorn))}` : ''}` : 'Not worn yet'}</p>
    ${itemForm(it, 'edit')}
    <label class="check"><input type="checkbox" data-lke="available" ${it.available ? 'checked' : ''}><span>Available (not at the cleaner's)</span></label>
    <label class="check"><input type="checkbox" data-lke="fav" ${it.fav ? 'checked' : ''}><span>Favourite</span></label>
    <div class="row between"><button type="button" class="ghost danger" data-lk="itemdel:${it.id}">Delete</button><button type="button" data-lk="itemsave:${it.id}">Save</button></div>`);
  hydrate(document.getElementById('sheetBody') || document);
}
function lookSheet(id) {
  const l = lk.rec.looks.find((x) => x.id === id);
  if (!l) return;
  const items = l.items.map((i) => L.itemById(lk.rec, i)).filter(Boolean);
  lk.c.openSheet(`<div class="row between"><h2>${E(l.name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${board({ ...l, items }, 'full')}
    ${items.length ? `<p class="small">${items.map((i) => E(i.name)).join(' · ')}</p>` : '<p class="small muted">Just the photo so far.</p>'}
    <label>Name<input data-lke="lookrename" value="${E(l.name)}" maxlength="60"></label>
    <div class="row wrap"><button type="button" class="grow" data-lk="again:${l.id}">Wear again</button>${l.photo ? `<button type="button" class="ghost grow" data-lk="pieces:${l.id}">Find pieces</button>` : ''}</div>
    <div class="row between"><button type="button" class="ghost danger" data-lk="lookdel:${l.id}">Delete Look</button><button type="button" class="ghost" data-lk="looksave:${l.id}">Save name</button></div>`);
  hydrate(document.getElementById('sheetBody') || document);
}

// ---------- swap and refine ----------
function swapSheet(cat = null) {
  const l = current();
  if (!l) return;
  const cats = [...new Set(l.items.map((i) => i.cat))];
  const ctx = lk.day.ctx2 || lk.day.ctx;
  const on = cat || (cats.includes('watch') ? 'watch' : cats[0]);
  const s = on ? L.swapOptions(lk.rec, l.items, on, ctx, today()) : null;
  const label = (c) => (c === 'top' ? cap(l.items.find((i) => i.cat === 'top')?.sub || 'Top') : L.CATS[c].label);
  lk.c.openSheet(`<div class="row between"><h2>${on ? `Swap ${E(label(on).toLowerCase())}` : 'Refine'}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${cats.length ? `<div class="seg lk-swapcats">${cats.map((c) => `<button type="button" class="${c === on ? 'on' : ''}" data-lk="swapcat:${c}">${E(label(c))}</button>`).join('')}</div>` : '<p class="small muted">This Look is a photo — refine it instead, or Find pieces in Saved.</p>'}
    ${s ? `<div class="lk-swapgrid">${s.current ? `<button type="button" class="lk-tile on" aria-pressed="true" disabled>${img(s.current.img, 'thumb', s.current.name)}<span>${E(s.current.name)}</span></button>` : ''}${s.options.map((i) => `<button type="button" class="lk-tile" data-lk="swapto:${on}:${i.id}">${img(i.img, 'thumb', i.name)}<span>${E(i.name)}</span></button>`).join('')}${s.none && s.current ? `<button type="button" class="lk-tile" data-lk="swapto:${on}:none"><span class="lk-noimg" aria-hidden="true">∅</span><span>No ${E(label(on).toLowerCase())}</span></button>` : ''}</div>${!s.options.length && !s.none ? '<p class="small muted">Nothing else of this kind yet.</p>' : ''}` : ''}
    <h3 class="small">Or</h3><div class="lk-chips">${[['warmer', 'Warmer'], ['cooler', 'Cooler'], ['casual', 'More casual'], ['formal', 'More formal'], ['shoes', 'Different shoes'], ['watch', 'Different watch'], ['surprise', 'Surprise me']].map(([k, t]) => `<button type="button" class="chip" data-lk="refine:${k}">${t}</button>`).join('')}</div>
    <p class="small"><button type="button" class="linkish small" data-lk="nottoday">Not today</button> · <button type="button" class="linkish small" data-lk="notmystyle">Not my style</button></p>`);
  hydrate(document.getElementById('sheetBody') || document);
}
function swapTo(cat, id) {
  const l = current();
  const from = l.items.find((i) => i.cat === cat);
  const to = id === 'none' ? null : L.itemById(lk.rec, id);
  const before = { ...l, items: [...l.items] };
  const items = [...l.items.filter((i) => i.cat !== cat), ...(to ? [to] : [])];
  lk.day.looks[lk.sel] = { ...l, look: null, key: `n:${items.map((i) => i.id).sort().join('.')}`, items, name: L.nameFor(items, lk.day.ctx2 || lk.day.ctx), why: L.reasonFor(items, lk.day.ctx2 || lk.day.ctx) };
  lk.undo = { label: `${L.CATS[cat].label.toLowerCase()} swap`, look: before };
  lk.rec = { ...lk.rec, prefs: L.learn(lk.rec.prefs, 'swap', { from: from?.id, to: to?.id }) };
  save();
  lk.c.closeSheet(); render();
}
function refine(k) {
  const l = current(), occ = lk.day.ctx.occ;
  const r = { ...lk.refine };
  if (k === 'warmer') { r.warmer = !r.cooler; r.cooler = false; }
  if (k === 'cooler') { r.cooler = !r.warmer; r.warmer = false; }
  if (k === 'casual') { r.casual = !r.formal; r.formal = false; lk.rec = { ...lk.rec, prefs: L.learn(lk.rec.prefs, 'casual', { occ }) }; }
  if (k === 'formal') { r.formal = !r.casual; r.casual = false; lk.rec = { ...lk.rec, prefs: L.learn(lk.rec.prefs, 'formal', { occ }) }; }
  if (k === 'shoes' || k === 'watch') { const c = l?.items.find((i) => i.cat === k); if (c) r.avoid = [...(r.avoid || []), c.id]; }
  if (k === 'surprise') r.seed = 1 + Math.floor(Math.random() * 997);
  lk.refine = r; lk.sel = 0; lk.undo = null;
  save();
  computeToday().then(() => { lk.c.closeSheet(); render(); });
}
function judge(kind) {
  const l = current();
  if (!l) return;
  lk.rec = { ...lk.rec, prefs: L.learn(lk.rec.prefs, kind, { items: l.items.map((i) => i.id) }) };
  save();
  lk.refine = { ...lk.refine, avoid: [...(lk.refine.avoid || []), ...(kind === 'notmystyle' ? l.items.map((i) => i.id).slice(0, 2) : [])] };
  lk.day.looks.splice(lk.sel, 1); lk.sel = 0;
  lk.c.closeSheet();
  if (!lk.day.looks.length) computeToday().then(render); else render();
  lk.c.toast(kind === 'notmystyle' ? 'Got it — fewer like that' : 'Something else today');
}

// ---------- wear, save ----------
function wearNow(l) {
  const ctx = lk.day?.ctx2 || lk.day?.ctx || { occ: 'work', f: 3 };
  const items = l.items.length ? l.items : [];
  const { rec } = L.wear(lk.rec, { items, look: l.look || null, name: l.name, ctx, today: today() });
  lk.rec = rec; lk.undo = null;
  save(true);
  if (lk.day) lk.day.worn = lk.rec.wears.find((w) => w.d === today());
  summary();
}
function saveCurrent() {
  const l = current();
  if (!l) return;
  if (l.look?.saved) return lk.c.toast(`${l.name} is already saved`);
  const ids = l.items.map((i) => i.id);
  const had = lk.rec.looks.find((x) => x.items.length === ids.length && x.items.every((i) => ids.includes(i)));
  const look = had ? { ...had, saved: true } : L.makeLook({ name: l.name, items: ids, saved: true, source: 'rec', at: Date.now(), tags: [lk.day.ctx.occ] });
  lk.rec = { ...lk.rec, looks: had ? lk.rec.looks.map((x) => (x.id === had.id ? look : x)) : [...lk.rec.looks, look], prefs: L.learn(lk.rec.prefs, 'save', { items: ids }) };
  lk.day.looks[lk.sel] = { ...l, look };
  save();
  lk.c.toast(`☆ Saved ${l.name}`);
  render();
}

// ---------- Fit Check: one Look, to your partner ----------
async function fitchecks(fresh = false) {
  if (!lk.fcs || fresh) lk.fcs = (await lk.c.api.get(`/families/${lk.c.fid}/fitchecks`).catch(() => ({ fitchecks: [] }))).fitchecks;
  for (const f of lk.fcs) { f.name = await lk.c.open(f.names[0]); f.name2 = f.names[1] ? await lk.c.open(f.names[1]) : ''; f.note = f.msg ? await lk.c.open(f.msg) : ''; }
  return lk.fcs;
}
function fitCards() {
  if (!lk.fcs) { fitchecks().then(() => lk.tab === 'today' && !lk.view && render()).catch(() => {}); return ''; }
  const day = (f) => Date.now() - f.at < 18 * 36e5;
  const mine = lk.fcs.filter((f) => f.by === lk.c.me && day(f)).slice(0, 2), theirs = lk.fcs.filter((f) => f.to === lk.c.me && f.status === 'open');
  const who = (id) => lk.c.name(id) || 'Your partner';
  return [...theirs.map((f) => `<button type="button" class="card lk-fc in" data-lk="fit:${f.id}"><b>👔 Fit Check from ${E(who(f.by))}</b><span class="small">${E(f.kind === 'ab' ? 'Which one?' : f.name)} — tap to answer</span></button>`),
    ...mine.map((f) => `<button type="button" class="card lk-fc" data-lk="fit:${f.id}"><b>${f.status === 'answered' ? (f.verdict === 'hit' ? `🔥 ${E(who(f.to))} says HIT` : f.verdict === 'miss' ? `🙈 ${E(who(f.to))} says MISS` : `${E(who(f.to))} picked ${f.verdict === 'neither' ? 'neither 😬' : f.verdict.toUpperCase()}`) : `⏳ Waiting for ${E(who(f.to))}`}</b><span class="small">${E(f.kind === 'ab' ? `${f.name} vs ${f.name2}` : f.name)}${f.reasons?.length ? ` · ${f.reasons.map((r) => REASON[r]).join(', ')}` : ''}</span></button>`)].join('');
}
const REASON = { shoes: 'Shoes', jacket: 'Jacket', watch: 'Watch', colors: 'Colours', formal: 'Too formal', casual: 'Too casual', style: 'Not my style', other: 'Other' };
// The Look as one picture (the flat-lay drawn on the phone), to send.
async function boardJpeg(l) {
  const W = 800, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
  const draw = async (id, x, y, w, h, cover = false) => {
    const b = await bitmap(await fetch(await loadImg(id, 'full')).then((r) => r.blob()));
    const k = cover ? Math.max(w / b.width, h / b.height) : Math.min(w / b.width, h / b.height);
    const dw = b.width * k, dh = b.height * k;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.drawImage(b, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
  };
  if (!l.items.length && (l.look?.photo || l.photo)) await draw(l.look?.photo || l.photo, 0, 0, W, H, true);
  else for (const s of L.boardLayout(l.items).sort((a, b) => a.z - b.z)) { const it = l.items.find((i) => i.id === s.id); if (it?.img) await draw(it.img, (s.x / 100) * W, (s.y / 100) * H, (s.w / 100) * W, (s.h / 100) * H); }
  return encode(c, false, 0.85);
}
function askSheet() {
  const l = current(), alts = lk.day.looks.filter((_, i) => i !== lk.sel);
  lk.ask = { b: null };
  lk.c.openSheet(`<div class="row between"><h2>Ask ${E(partnerName())}?</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small">Send this Look for a quick Fit Check.</p>
    <div class="lk-askpre">${board(l, 'thumb', 'mini')}<b>${E(l.name)}</b></div>
    ${alts.length ? `<details><summary class="small">Or compare it with another (A vs B)</summary><div class="lk-row">${alts.map((o) => `<button type="button" class="lk-alt" data-lk="askb:${lk.day.looks.indexOf(o)}">${board(o, 'thumb', 'mini')}<b>${E(o.name)}</b></button>`).join('')}</div></details>` : ''}
    <label>Message <span class="muted small">(optional)</span><input data-lke="askmsg" maxlength="120" placeholder="${E(`${lk.day.ctx.label} — what do you think?`)}"></label>
    <p class="small muted">Only this Look will be shared — not your Closet.</p>
    <button type="button" class="wide" data-lk="sendfit">Send Fit Check</button>`);
  hydrate(document.getElementById('sheetBody') || document);
}
async function sendFit(btn) {
  const a = current(), b = lk.ask?.b != null ? lk.day.looks[lk.ask.b] : null;
  const msg = document.querySelector('[data-lke=askmsg]')?.value.trim() || '';
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const L2 = async (v) => lk.c.seal(v);
    const { fitcheck } = await lk.c.api.post(`/families/${lk.c.fid}/fitchecks`, { kind: b ? 'ab' : 'one', names: await Promise.all([a, b].filter(Boolean).map((x) => L2(x.name))), msg: msg ? await L2(msg) : '' });
    const k = lk.c.key();
    for (const [n, l] of [a, b].filter(Boolean).entries()) { const jpg = await boardJpeg(l); await lk.c.api.bytes('PUT', `/families/${lk.c.fid}/fitchecks/${fitcheck.id}/img/${n}`, k ? await lk.c.sealBytes(k, jpg) : jpg); }
    await lk.c.api.post(`/families/${lk.c.fid}/fitchecks/${fitcheck.id}/send`);
    // Which Look(s) it was about, kept in your own Closet record (so Fix it and Wear this work later).
    lk.rec = { ...lk.rec, fc: { ...lk.rec.fc, [fitcheck.id]: { look: a.look?.id || null, items: [a, b].filter(Boolean).map((x) => x.items.map((i) => i.id)) } } };
    save();
    lk.c.closeSheet(); lk.c.toast(`👔 Sent to ${partnerName()}`);
    await fitchecks(true); render();
  } catch (e) { btn.disabled = false; btn.textContent = 'Send Fit Check'; lk.c.toast(e.message); }
}
function fitHtml() {
  const f = (lk.fcs || []).find((x) => x.id === lk.fcOpen);
  const back = `<section class="lk-head"><button type="button" class="linkish lk-back" data-lk="fitback">‹ Look</button><h2>Fit Check</h2></section>`;
  if (!f) return `${back}<p class="pad small muted">${lk.fcs ? 'This Fit Check has gone (they last two weeks).' : 'Loading…'}</p>`;
  const who = (id) => lk.c.name(id) || 'Your partner';
  const pics = (f.kind === 'ab' ? [0, 1] : [0]).map((n) => `<figure class="lk-fcpic">${f.kind === 'ab' ? `<figcaption><b>${n ? 'B' : 'A'}</b> · ${E(n ? f.name2 : f.name)}</figcaption>` : ''}<img data-fcimg="${f.id}:${n}" alt="${E(n ? f.name2 : f.name)}"></figure>`).join('');
  if (f.to === lk.c.me) {
    const answered = f.status === 'answered';
    return `${back}<section class="card lk-fit"><p><b>${E(who(f.by))}</b> is considering ${f.kind === 'ab' ? 'these' : 'this'}${f.note ? ` — “${E(f.note)}”` : ''}</p>
      <div class="lk-fcpics ${f.kind}">${pics}</div>${f.kind === 'ab' ? '' : `<h3>${E(f.name)}</h3>`}
      ${answered ? `<p class="lk-ok">You said ${E({ hit: '🔥 Hit', miss: '🙈 Miss', a: 'A', b: 'B', neither: 'neither 😬' }[f.verdict])}${f.reasons?.length ? ` · ${f.reasons.map((r) => REASON[r]).join(', ')}` : ''}</p>`
        : f.kind === 'ab' ? '<div class="lk-verdict"><button type="button" data-lk="verdict:a">A</button><button type="button" data-lk="verdict:b">B</button><button type="button" class="ghost" data-lk="verdict:neither">Neither 😬</button></div>'
          : lk.missing ? `<p><b>What's off?</b> <span class="small muted">(optional)</span></p><div class="lk-chips">${Object.entries(REASON).map(([k, t]) => `<button type="button" class="chip${lk.missing.includes(k) ? ' on' : ''}" aria-pressed="${lk.missing.includes(k)}" data-lk="reason:${k}">${t}</button>`).join('')}</div><div class="row"><button type="button" class="grow" data-lk="verdict:miss">Send Miss</button><button type="button" class="ghost" data-lk="justmiss">Just Miss</button></div>`
            : '<div class="lk-verdict"><button type="button" class="hit" data-lk="verdict:hit">🔥 Hit</button><button type="button" class="miss" data-lk="missask">🙈 Miss</button></div>'}</section>`;
  }
  const verdict = f.status !== 'answered' ? `<p role="status">⏳ Waiting for ${E(who(f.to))}</p>`
    : f.verdict === 'hit' ? `<p class="lk-ok">🔥 ${E(who(f.to))} says HIT</p><button type="button" class="wide" data-lk="fitwear">Wear this</button>`
      : f.verdict === 'miss' ? `<p>🙈 ${E(who(f.to))} says MISS${f.reasons?.length ? ` — ${f.reasons.map((r) => REASON[r].toLowerCase()).join(', ')}` : ''}</p><button type="button" class="wide" data-lk="fixit">Fix it</button>`
        : `<p class="lk-ok">${E(who(f.to))} picked ${f.verdict === 'neither' ? 'neither 😬' : `${f.verdict.toUpperCase()} — ${E(f.verdict === 'a' ? f.name : f.name2)}`}</p>${f.verdict !== 'neither' ? '<button type="button" class="wide" data-lk="fitwear">Wear this</button>' : '<button type="button" class="wide" data-lk="fixit">Show me others</button>'}`;
  return `${back}<section class="card lk-fit"><div class="lk-fcpics ${f.kind}">${pics}</div>${f.kind === 'ab' ? '' : `<h3>${E(f.name)}</h3>`}${verdict}
    <p class="small center"><button type="button" class="linkish small" data-lk="discuss">💬 Discuss</button></p></section>`;
}
async function fillFitImgs() {
  for (const el of document.querySelectorAll('img[data-fcimg]:not([src])')) {
    const [id, n] = el.dataset.fcimg.split(':');
    const k = lk.c.key();
    lk.c.api.bytes('GET', `/families/${lk.c.fid}/fitchecks/${id}/img/${n}`).then(async (b) => { const bytes = k ? await lk.c.openBytes(k, b) : b; el.src = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })); }).catch(() => el.classList.add('lk-noimg'));
  }
}
export async function openFit(id) {
  lk.fcOpen = id; lk.view = 'fit'; lk.missing = null;
  await fitchecks(true);
  render(); fillFitImgs();
}
async function answer(verdict, reasons = []) {
  const f = lk.fcs.find((x) => x.id === lk.fcOpen);
  try {
    await lk.c.api.post(`/families/${lk.c.fid}/fitchecks/${f.id}/answer`, { verdict, reasons });
    lk.missing = null; await fitchecks(true); render(); fillFitImgs();
    lk.c.toast(verdict === 'hit' ? '🔥 Sent' : 'Sent');
  } catch (e) { lk.c.toast(e.message); }
}
// Miss → what was off becomes a structured nudge, and today's Looks re-rank around it.
// The Look(s) a Fit Check you sent was about, from your record.
function sentLooks(f) {
  const m = lk.rec.fc[f.id];
  if (!m) return null;
  return m.items.map((ids, n) => { const items = ids.map((id) => L.itemById(lk.rec, id)).filter((i) => i && !i.gone); const look = n === 0 && m.look ? lk.rec.looks.find((x) => x.id === m.look) : null; return { name: n ? f.name2 : f.name, items, look, why: '' }; });
}
async function fixIt() {
  const f = lk.fcs.find((x) => x.id === lk.fcOpen);
  const sent = sentLooks(f);
  const l = sent?.[0] || current();
  if (l) {
    const byCat = { shoes: l.items.filter((i) => i.cat === 'shoes').map((i) => i.id), outer: l.items.filter((i) => i.cat === 'outer').map((i) => i.id), watch: l.items.filter((i) => i.cat === 'watch').map((i) => i.id) };
    lk.rec = { ...lk.rec, prefs: L.learn(lk.rec.prefs, 'miss', { items: l.items.map((i) => i.id), reasons: f.reasons, byCat, occ: lk.day?.ctx.occ }) };
    const avoid = [...(f.reasons.includes('shoes') ? byCat.shoes : []), ...(f.reasons.includes('jacket') ? byCat.outer : []), ...(f.reasons.includes('watch') ? byCat.watch : [])];
    lk.refine = { ...lk.refine, avoid: [...(lk.refine.avoid || []), ...avoid], casual: f.reasons.includes('formal') || lk.refine.casual, formal: f.reasons.includes('casual') || lk.refine.formal, seed: f.reasons.includes('colors') || f.reasons.includes('style') || !f.reasons.length ? 1 + Math.floor(Math.random() * 997) : lk.refine.seed };
    save();
  }
  lk.view = null; lk.tab = 'today'; lk.sel = 0;
  await computeToday(); render();
  lk.c.toast('Here are some fixes');
}

// ---------- Calendar and Home ----------
// The small card on Calendar (today only): what today is, a small preview, how many Looks.
export async function calendarCard(dateIso) {
  if (dateIso !== today()) return '';
  const d = await computeToday();
  const top = d.looks[0];
  const n = d.looks.length;
  const preview = d.worn ? board(wornLook(d.worn), 'thumb', 'tiny') : top ? board(top, 'thumb', 'tiny') : '';
  return `<button type="button" class="card lk-calcard" data-view="look"><span class="grow"><span class="eyebrow">👔 Today's Look</span><b>${E(d.worn ? `✓ ${d.worn.name}` : d.ctx.label)}</b><small class="muted">${E([d.ctx.range && `${d.ctx.evening ? 'Cool evening · ' : ''}${d.ctx.range}`, d.worn ? '' : n ? `${n} look${n === 1 ? '' : 's'} ready` : 'Add a Look to start'].filter(Boolean).join(' · '))}</small></span>${preview}<span class="go">${n || d.worn ? 'View Looks →' : 'Start →'}</span></button>`;
}
export const hydrateIn = (el) => hydrate(el);

// ---------- events ----------
export async function onClick(t) {
  const [a, ...r] = t.dataset.lk.split(':');
  const c = lk.c;
  switch (a) {
    case 'tab': lk.tab = r[0]; lk.view = null; return render();
    case 'add': return c.openSheet(`<div class="row between"><h2>Add</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
      <button type="button" class="lk-addopt" data-lk="addlook"><b>Add a Look</b><span class="small muted">Start with a complete outfit you already wear.</span></button>
      <button type="button" class="lk-addopt" data-lk="additem"><b>Add an item</b><span class="small muted">Photograph one individual piece.</span></button>`);
    case 'addlook': c.closeSheet(); lk.view = 'addlook'; lk.draft = {}; return render();
    case 'additem': c.closeSheet(); lk.view = 'additem'; lk.draft = {}; return render();
    case 'pick': return document.getElementById(r[0])?.click();
    case 'cancel': lk.view = null; lk.draft = null; return render();
    case 'tag': { const d = lk.draft; d.tags = (d.tags || []).includes(r[0]) ? d.tags.filter((x) => x !== r[0]) : [...(d.tags || []), r[0]]; return render(); }
    case 'savelook': return saveLook();
    case 'original': return cutItem(1, true);
    case 'retry': return cutItem(lk.draft.tries = (lk.draft.tries || 0) % 2 ? 1.4 : 0.7);
    case 'itemedit': lk.draft.edit = true; return render();
    case 'icat': {
      const d = lk.draft, g = L.guessFrom('', r[0]);
      d.item = L.makeItem({ ...d.item, cat: r[0], sub: g.sub, formality: g.formality, warmth: g.warmth, name: d.named ? d.item.name : L.suggestName(d.item.color, g.sub, r[0]) });
      d.dupDone = false; return render();
    }
    case 'itemok': return addItem();
    case 'usedup': return addItem(L.itemById(lk.rec, r[0]));
    case 'adddup': lk.draft.dupDone = true; return render();
    case 'nameai': return nameWithClaude();
    case 'pieces': c.closeSheet(); lk.view = 'pieces'; lk.draft = { lookId: r[0], status: 'consent' }; if (lk.ai == null) lk.ai = await c.aiReady().catch(() => null); if (lk.ai === false) lk.draft.status = 'manual'; return render();
    case 'findai': return findPieces();
    case 'manual': lk.draft.status = 'manual'; lk.draft.list ||= []; lk.draft.mark = {}; return render();
    case 'mcat': lk.draft.mark.cat = r[0]; return render();
    case 'markadd': return markAdd();
    case 'markdone': lk.draft.status = 'list'; return render();
    case 'cuse': { const x = lk.draft.list[+r[0]]; x.use = x.dupOf; x.decided = true; return render(); }
    case 'cnew': { const x = lk.draft.list[+r[0]]; x.decided = true; return render(); }
    case 'addpieces': return addPieces();
    case 'filter': lk.filter = r.join(':'); return render();
    case 'item': return itemSheet(r[0]);
    case 'itemsave': return saveItemEdit(r[0]);
    case 'itemdel': return deleteItemNow(r[0]);
    case 'look': return lookSheet(r[0]);
    case 'looksave': { const v = document.querySelector('[data-lke=lookrename]')?.value.trim(); if (v) { lk.rec = { ...lk.rec, looks: lk.rec.looks.map((l) => (l.id === r[0] ? { ...l, name: v.slice(0, 60) } : l)) }; save(); } c.closeSheet(); return render(); }
    case 'lookdel': return deleteLookNow(r[0]);
    case 'again': {
      const l = lk.rec.looks.find((x) => x.id === r[0]);
      if (!l) return null;
      c.closeSheet();
      await computeToday();
      wearNow({ look: l, name: l.name, items: l.items.map((i) => L.itemById(lk.rec, i)).filter(Boolean) });
      lk.tab = 'today'; render();
      return c.toast(`✓ Today's Look: ${l.name}`);
    }
    case 'sel': lk.sel = +r[0]; lk.undo = null; render(); return window.scrollTo?.({ top: 0, behavior: 'smooth' });
    case 'wear': { const l = current(); wearNow(l); render(); return c.toast(`✓ Today's Look: ${l.name}`); }
    case 'unwear': lk.rec = { ...lk.rec, wears: lk.rec.wears.filter((w) => w.d !== today()) }; save(); lk.day.worn = null; summary(); return render();
    case 'save': return saveCurrent();
    case 'undo': if (lk.undo) { lk.day.looks[lk.sel] = lk.undo.look; lk.undo = null; } return render();
    case 'swap': return swapSheet();
    case 'swapcat': return swapSheet(r[0]);
    case 'swapto': return swapTo(r[0], r[1]);
    case 'refine': return refine(r[0]);
    case 'nottoday': return judge('nottoday');
    case 'notmystyle': return judge('notmystyle');
    case 'ask': return askSheet();
    case 'askb': { lk.ask.b = lk.ask.b === +r[0] ? null : +r[0]; t.closest('.lk-row')?.querySelectorAll('.lk-alt').forEach((b) => b.classList.toggle('on', b === t && lk.ask.b != null)); return null; }
    case 'sendfit': return sendFit(t);
    case 'fit': return openFit(r[0]);
    case 'fitback': lk.view = null; lk.fcOpen = null; return render();
    case 'missask': lk.missing = []; return render();
    case 'reason': lk.missing = lk.missing.includes(r[0]) ? lk.missing.filter((x) => x !== r[0]) : [...lk.missing, r[0]]; return render();
    case 'justmiss': return answer('miss', []);
    case 'verdict': return answer(r[0], r[0] === 'miss' ? lk.missing || [] : []);
    case 'fixit': return fixIt();
    case 'fitwear': {
      const f = lk.fcs.find((x) => x.id === lk.fcOpen);
      const pick = sentLooks(f)?.[f.verdict === 'b' ? 1 : 0] || current();
      lk.view = null; lk.tab = 'today';
      if (pick) { await computeToday(); wearNow(pick); }
      render(); return c.toast(pick ? `✓ Today's Look: ${pick.name}` : 'Pick it in Today');
    }
    case 'discuss': { const f = lk.fcs.find((x) => x.id === lk.fcOpen); return c.discuss(`lk:${f.id}`, `👔 ${f.kind === 'ab' ? `${f.name} or ${f.name2}` : f.name}`, f.note || 'Fit Check'); }
    default: return null;
  }
}
async function nameWithClaude() {
  const d = lk.draft;
  if (!d?.pic || d.reading) return;
  d.reading = true; render();
  try {
    let s = ''; const b = await encode(canvasOf(await bitmap(new Blob([d.pic.full], { type: sniff(d.pic.full) })), 800), false, 0.85);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    const r = await lk.c.api.post('/ai/look/item', { image: btoa(s), mime: 'image/jpeg' });
    if (r.item) { d.item = L.makeItem({ ...d.item, ...r.item, hash: d.pic.hash }); d.named = true; d.byClaude = true; LS.set('fam.look.aiName', 1); }
    else lk.c.toast("Claude couldn't see a piece of clothing in that");
  } catch (e) { lk.c.toast(e.status === 501 ? 'Naming with Claude isn\'t set up here' : e.message); if (e.status === 501) lk.ai = false; }
  d.reading = false; render();
}
async function markAdd() {
  const p = lk.draft, m = p.mark, look = lk.rec.looks.find((l) => l.id === p.lookId);
  p.bmp ||= await lookBitmap(look);
  const box = { x: Math.round(m.box.x * p.bmp.width), y: Math.round(m.box.y * p.bmp.height), w: Math.max(8, Math.round(m.box.w * p.bmp.width)), h: Math.max(8, Math.round(m.box.h * p.bmp.height)) };
  const pic = await piece(p.bmp, { box });
  const g = L.guessFrom('', m.cat);
  const item = L.makeItem({ cat: m.cat, sub: g.sub, color: pic.colors[0]?.name, name: L.suggestName(pic.colors[0]?.name, g.sub, m.cat) });
  const dup = L.likelySame({ ...item, hash: pic.hash }, lk.rec.items);
  p.list.push({ name: item.name, item, pic, sure: true, dupOf: dup?.item.id || null });
  p.mark = {};
  lk.c.toast(`Marked ${item.name} — mark another or tap Done`);
  render();
}
function saveItemEdit(id) {
  const e = lk.edit;
  lk.rec = { ...lk.rec, items: lk.rec.items.map((i) => (i.id === id ? L.makeItem({ ...i, ...e }) : i)) };
  save(); lk.day = null;
  lk.c.closeSheet(); render();
}
async function deleteItemNow(id) {
  const it = L.itemById(lk.rec, id);
  if (!it || !lk.c.confirm(`Delete ${it.name}? Looks you've worn keep showing it.`)) return;
  const r = L.deleteItem(lk.rec, id);
  const { dropImage, ...rec } = r;
  lk.rec = rec;
  await save(true);
  if (dropImage && it.img) lk.c.api.bytes('DELETE', `${P()}/img/${it.img}`).catch(() => {});
  lk.day = null; lk.c.closeSheet(); render();
}
async function deleteLookNow(id) {
  const l = lk.rec.looks.find((x) => x.id === id);
  if (!l || !lk.c.confirm(`Delete ${l.name}? The pieces stay in your Closet.`)) return;
  // A Look someone wore stays in the history (unsaved); one never worn goes, with its photo.
  const worn = lk.rec.wears.some((w) => w.look === id);
  lk.rec = { ...lk.rec, looks: worn ? lk.rec.looks.map((x) => (x.id === id ? { ...x, saved: false } : x)) : lk.rec.looks.filter((x) => x.id !== id) };
  // Pieces deleted earlier that only this Look kept: their pictures go now.
  const gone = lk.rec.items.filter((i) => i.gone && !lk.rec.looks.some((x) => x.items.includes(i.id)));
  lk.rec.items = lk.rec.items.filter((i) => !gone.includes(i));
  await save(true);
  for (const imgId of [...gone.map((i) => i.img), worn ? null : l.photo].filter(Boolean)) lk.c.api.bytes('DELETE', `${P()}/img/${imgId}`).catch(() => {});
  lk.day = null; lk.c.closeSheet(); render();
}
export function onInput(t) {
  const [f, n] = t.dataset.lke.split(':');
  if (f === 'q') { lk.q = t.value; const pos = t.selectionStart; render(); const s = document.querySelector('[data-lke=q]'); s?.focus(); s?.setSelectionRange(pos, pos); return; }
  if (f === 'lookname') { lk.draft.name = t.value; return; }
  if (f === 'cand') { lk.draft.list[+n].name = t.value; return; }
  if (f === 'inc') { lk.draft.list[+n].skip = !t.checked; t.closest('.lk-cand')?.classList.toggle('skip', !t.checked); const btn = document.querySelector('[data-lk=addpieces]'); if (btn) btn.disabled = lk.draft.list.some((c) => !c.skip && c.dupOf && !c.decided) || !lk.draft.list.some((c) => !c.skip); return; }
  if (['askmsg', 'lookrename'].includes(f)) return;
  // The item form: the new piece (Add an item) or the one being edited.
  const target = t.closest('[data-lkform]')?.dataset.lkform === 'new' ? lk.draft.item : lk.edit;
  if (!target) return;
  if (f === 'available' || f === 'fav') target[f] = t.checked;
  else if (f === 'formality' || f === 'warmth') target[f] = +t.value;
  else target[f] = t.value;
  if (f === 'name' && lk.draft?.item === target) lk.draft.named = true;
}
export async function onPick(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (input.dataset.lkpick === 'look') {
    const d = lk.draft ||= {};
    d.busy = true; render();
    try { d.photo = await outfitPhoto(file); d.error = ''; } catch { d.error = "Couldn't open that picture — try another, or a screenshot."; }
    d.busy = false; return render();
  }
  return itemPicked(file);
}
// Dragging a box over a piece (Mark a piece myself).
export function onPointer(e) {
  const box = e.target.closest('[data-lkmark]');
  if (!box || !lk.draft?.mark) return;
  const r = box.getBoundingClientRect();
  const at = (ev) => ({ x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) });
  const s = at(e);
  e.preventDefault();
  const move = (ev) => { const p = at(ev); lk.draft.mark.box = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }; let i = box.querySelector('.lk-box'); if (!i) { i = document.createElement('i'); i.className = 'lk-box'; box.appendChild(i); } Object.assign(i.style, { left: `${lk.draft.mark.box.x * 100}%`, top: `${lk.draft.mark.box.y * 100}%`, width: `${lk.draft.mark.box.w * 100}%`, height: `${lk.draft.mark.box.h * 100}%` }); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if ((lk.draft.mark.box?.w || 0) < 0.04) lk.draft.mark.box = null; render(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
