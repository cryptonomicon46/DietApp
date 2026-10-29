// 👔 Look: what to wear today, from clothes you actually own. Pure — no storage, no network — so
// the phone can work it all out on its own and it's tested. The screens are family/look.js.
//
//   Record { v: 1, items: [Item], looks: [Look], wears: [Wear], prefs: Prefs, ob: {} }
//   Item   { id, name, cat, sub, img, aspect, hash, color, hex, colors, pattern, formality 1–5,
//            warmth 0–3, occ: [occasion], available, fav, lastWorn, wearCount, gone?,
//            brand?, model?, material?, size?, price?, retailer?, url?, notes?, from?, at }
//   Look   { id, name, tags: [occasion], items: [itemId], photo?: imageId, saved, source, at,
//            lastWorn?, wearCount, verdict? }   — a Look can be just a photo of an outfit
//   Wear   { d, look?, items, name, occ, f }
//   Prefs  { item: {id: n}, pair: {"a|b": n}, occ: {occasion: shift} } — small, explainable
//
// The loop is Event → Look → Partner → Wear → Learn: a complete outfit you already wear is a
// usable Look straight away; pieces can be pulled out of it later, and recommendations get better
// as you wear things.
export const CATS = {
  outer: { label: 'Jacket', filter: 'Jackets' },
  top: { label: 'Top', filter: 'Tops' },
  bottom: { label: 'Bottoms', filter: 'Bottoms' },
  dress: { label: 'Dress', filter: 'Tops' },
  shoes: { label: 'Shoes', filter: 'Shoes' },
  watch: { label: 'Watch', filter: 'Watches' },
  accessory: { label: 'Accessory', filter: 'Accessories' },
};
export const FILTERS = ['Tops', 'Bottoms', 'Jackets', 'Shoes', 'Watches', 'Accessories'];
export const OCCASIONS = {
  work: { label: 'Work', f: 3, word: 'Office' },
  meeting: { label: 'Meeting', f: 4, word: 'Meeting' },
  bizcasual: { label: 'Business casual', f: 3, word: 'Office' },
  smart: { label: 'Smart casual', f: 3, word: 'Smart' },
  dinner: { label: 'Dinner', f: 3, word: 'Dinner' },
  date: { label: 'Date', f: 3, word: 'Date Night' },
  formal: { label: 'Formal', f: 5, word: 'Event' },
  travel: { label: 'Travel', f: 2, word: 'Travel Day' },
  casual: { label: 'Casual', f: 2, word: 'Weekend' },
  other: { label: 'Other', f: 2, word: 'Look' },
};
// What the Add a Look chips offer (no style questionnaire).
export const LOOK_CHIPS = ['work', 'meeting', 'bizcasual', 'smart', 'dinner', 'date', 'other'];

// Sensible defaults by kind of piece — formality 1 (casual) to 5 (formal), warmth 0 (light) to 3.
const SUBS = [
  ['outer', 'suit jacket', /suit jacket|tuxedo|dinner jacket/, 5, 1], ['outer', 'blazer', /blazer|sport ?coat|sports jacket/, 4, 1],
  ['outer', 'overcoat', /overcoat|top ?coat|trench|wool coat|peacoat|pea coat|\bcoat\b/, 4, 3], ['outer', 'puffer', /puffer|down jacket|parka/, 1, 3],
  ['outer', 'rain jacket', /rain|shell|anorak/, 1, 1], ['outer', 'cardigan', /cardigan/, 2, 1], ['outer', 'overshirt', /overshirt|shacket|shirt jacket/, 2, 1],
  ['outer', 'jacket', /jacket|bomber|harrington|field jacket|denim jacket|leather jacket/, 2, 2],
  ['top', 'dress shirt', /dress shirt|french cuff|poplin/, 4, 1], ['top', 'oxford', /oxford(?! shoe)|button.?down|\bocbd\b/, 3, 1],
  ['top', 'shirt', /shirt(?!.*jacket)|chambray|linen shirt|flannel/, 3, 1], ['top', 'polo', /polo/, 2, 0], ['top', 'turtleneck', /turtleneck|roll ?neck/, 3, 2],
  ['top', 'sweater', /sweater|jumper|knit|crew ?neck|v.?neck|quarter.?zip|half.?zip/, 3, 2], ['top', 'hoodie', /hoodie|sweatshirt/, 1, 2],
  ['top', 'tee', /t.?shirt|\btee\b|henley|tank/, 1, 0], ['top', 'blouse', /blouse|top\b/, 3, 0],
  ['dress', 'dress', /dress(?! shirt| shoe| watch| trouser)|jumpsuit/, 3, 0],
  ['bottom', 'suit trousers', /suit trousers|suit pants/, 5, 1], ['bottom', 'trousers', /trouser|slacks|dress pants|wool pants/, 4, 1],
  ['bottom', 'chinos', /chino|khaki/, 3, 1], ['bottom', 'jeans', /jean|denim(?! jacket| shirt)/, 2, 1], ['bottom', 'skirt', /skirt/, 3, 0],
  ['bottom', 'shorts', /shorts/, 1, 0], ['bottom', 'joggers', /jogger|sweatpant|track ?pant/, 1, 1],
  ['shoes', 'oxfords', /oxford shoe|oxfords|derby|derbies|brogue|monk/, 5, 0], ['shoes', 'loafers', /loafer|moccasin/, 4, 0],
  ['shoes', 'boots', /boot|chelsea|chukka/, 3, 1], ['shoes', 'heels', /heel|pump/, 4, 0], ['shoes', 'flats', /flat|ballet/, 3, 0],
  ['shoes', 'leather sneakers', /leather sneaker|white sneaker|court/, 2, 0], ['shoes', 'sneakers', /sneaker|trainer|runner|running shoe/, 1, 0],
  ['shoes', 'sandals', /sandal|slide|flip/, 1, 0], ['shoes', 'shoes', /shoe/, 3, 0],
  ['watch', 'dress watch', /dress watch|calatrava|tank|reverso|seamaster aqua/, 4, 0], ['watch', 'smartwatch', /smart ?watch|apple watch|galaxy watch|whoop|fitbit/, 1, 0],
  ['watch', 'watch', /watch|ranger|submariner|hydroconquest|chronograph|diver|seiko|tudor|omega|rolex|longines|tissot|hamilton/, 3, 0],
  ['accessory', 'tie', /\btie\b|necktie|bow ?tie/, 5, 0], ['accessory', 'belt', /belt/, 3, 0], ['accessory', 'scarf', /scarf/, 3, 1],
  ['accessory', 'bag', /bag|briefcase|tote|backpack/, 3, 0], ['accessory', 'glasses', /glasses|sunglasses/, 3, 0], ['accessory', 'hat', /\bhat\b|cap|beanie/, 1, 1],
];
// Just the kind of piece, nothing more known: a plain name and middle-of-the-road defaults.
const GENERIC = { outer: ['jacket', 3, 1], top: ['shirt', 3, 1], bottom: ['trousers', 3, 1], dress: ['dress', 3, 0], shoes: ['shoes', 3, 0], watch: ['watch', 3, 0], accessory: ['accessory', 3, 0] };
// The category, kind, formality and warmth a name suggests ("Brown loafers" → shoes, loafers, 4, 0).
export function guessFrom(name, cat = null) {
  const t = String(name || '').toLowerCase();
  const hit = t.trim() && SUBS.find(([c, , re]) => (!cat || c === cat) && re.test(t));
  if (hit) return { cat: hit[0], sub: hit[1], formality: hit[3], warmth: hit[4] };
  const g = GENERIC[cat] || GENERIC.top;
  return { cat: cat || 'top', sub: g[0], formality: g[1], warmth: g[2] };
}

// ---------- colour ----------
const PALETTE = [
  ['black', [25, 25, 28]], ['charcoal', [62, 64, 70]], ['grey', [128, 128, 132]], ['light grey', [190, 190, 192]], ['white', [240, 240, 236]],
  ['cream', [236, 226, 204]], ['beige', [205, 186, 150]], ['khaki', [189, 175, 130]], ['tan', [190, 145, 100]], ['brown', [110, 72, 45]],
  ['dark brown', [62, 42, 30]], ['navy', [30, 40, 72]], ['blue', [50, 90, 170]], ['light blue', [160, 190, 225]], ['denim', [70, 100, 140]],
  ['olive', [100, 105, 60]], ['green', [50, 120, 70]], ['burgundy', [110, 30, 45]], ['red', [190, 40, 45]], ['pink', [230, 160, 175]],
  ['orange', [220, 120, 50]], ['yellow', [230, 200, 70]], ['purple', [100, 60, 130]], ['teal', [40, 120, 120]],
];
const NEUTRAL = new Set(['black', 'charcoal', 'grey', 'light grey', 'white', 'cream', 'beige', 'khaki', 'tan', 'brown', 'dark brown', 'navy', 'light blue', 'denim', 'olive']);
export const isNeutral = (c) => NEUTRAL.has(c);
const toLab = ([r, g, b]) => {
  const lin = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const LABS = PALETTE.map(([n, rgb]) => [n, toLab(rgb)]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function nameColor(rgb) {
  const l = toLab(rgb);
  return LABS.reduce((best, [n, x]) => (dist(l, x) < best.d ? { n, d: dist(l, x) } : best), { n: 'grey', d: Infinity }).n;
}
export const hexOf = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// The main colours of a garment from its pixels (RGBA; only opaque ones count): up to 3 names, the
// biggest first, each at least 12% of the piece.
export function dominantColors(data, step = 4) {
  const bins = new Map();
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 200) continue;
    const name = nameColor([data[i], data[i + 1], data[i + 2]]);
    const b = bins.get(name) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    bins.set(name, b); n++;
  }
  const out = [...bins.entries()].sort((a, b) => b[1].n - a[1].n).filter(([, b]) => b.n >= n * 0.12).slice(0, 3)
    .map(([name, b]) => ({ name, hex: hexOf([b.r / b.n, b.g / b.n, b.b / b.n]), share: Math.round((b.n / n) * 100) / 100 }));
  return out.length ? out : [{ name: 'grey', hex: '#808080', share: 1 }];
}
const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
// "Light-blue Oxford", "Navy blazer".
export const suggestName = (color, sub, cat) => cap(`${color ? `${color.replace(' ', '-')} ` : ''}${sub || CATS[cat]?.label.toLowerCase() || 'piece'}`);

// ---------- the record ----------
const txt = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const okId = (v) => (/^[a-z0-9]{6,24}$/.test(v || '') ? v : null);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
export function makeItem(o = {}) {
  const cat = CATS[o.cat] ? o.cat : guessFrom(o.name).cat;
  const g = guessFrom(`${o.sub || ''} ${o.name || ''}`, cat);
  const it = {
    id: okId(o.id) || newId(), name: txt(o.name) || suggestName(o.color, o.sub || g.sub, cat), cat, sub: txt(o.sub, 30) || g.sub,
    img: okId(o.img), aspect: num(o.aspect, 0.2, 5) || 1, hash: /^[0-9a-f]{16}$/.test(o.hash || '') ? o.hash : '',
    color: txt(o.color, 20).toLowerCase(), hex: /^#[0-9a-f]{6}$/i.test(o.hex || '') ? o.hex : '', colors: (Array.isArray(o.colors) ? o.colors : []).map((c) => txt(c, 20).toLowerCase()).filter(Boolean).slice(0, 3),
    pattern: ['solid', 'stripe', 'check', 'print', 'texture'].includes(o.pattern) ? o.pattern : 'solid',
    formality: num(o.formality, 1, 5) ?? g.formality, warmth: num(o.warmth, 0, 3) ?? g.warmth,
    occ: (Array.isArray(o.occ) ? o.occ : []).filter((x) => OCCASIONS[x]).slice(0, 6),
    available: o.available !== false, fav: !!o.fav, lastWorn: date(o.lastWorn), wearCount: num(o.wearCount, 0, 9999) || 0, at: num(o.at, 0, 9e15) || 0,
  };
  for (const k of ['brand', 'model', 'material', 'size', 'retailer', 'notes']) if (o[k]) it[k] = txt(o[k], k === 'notes' ? 300 : 60);
  if (o.price != null && num(o.price, 0, 1e6) != null) it.price = num(o.price, 0, 1e6);
  if (/^https:\/\/[^\s]{4,300}$/.test(o.url || '')) it.url = o.url;
  if (okId(o.from)) it.from = o.from;
  if (o.gone) it.gone = true;
  return it;
}
export function makeLook(o = {}) {
  const l = {
    id: okId(o.id) || newId(), name: txt(o.name, 60) || 'Look', tags: (Array.isArray(o.tags) ? o.tags : []).filter((x) => OCCASIONS[x]).slice(0, 4),
    items: [...new Set((Array.isArray(o.items) ? o.items : []).map(okId).filter(Boolean))].slice(0, 12), photo: okId(o.photo), saved: o.saved !== false,
    source: ['photo', 'pieces', 'built', 'rec'].includes(o.source) ? o.source : 'built', at: num(o.at, 0, 9e15) || 0,
    lastWorn: date(o.lastWorn), wearCount: num(o.wearCount, 0, 9999) || 0,
  };
  if (o.photoAspect) l.photoAspect = num(o.photoAspect, 0.2, 5);
  if (['hit', 'miss'].includes(o.verdict)) l.verdict = o.verdict;
  return l;
}
export function normalize(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const p = r.prefs && typeof r.prefs === 'object' ? r.prefs : {};
  const nums = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => Number.isFinite(+v)).map(([k, v]) => [k.slice(0, 60), Math.max(-3, Math.min(3, +v))]).slice(0, 2000));
  return {
    v: 1,
    items: (Array.isArray(r.items) ? r.items : []).slice(0, 600).map(makeItem),
    looks: (Array.isArray(r.looks) ? r.looks : []).slice(0, 400).map(makeLook),
    wears: (Array.isArray(r.wears) ? r.wears : []).slice(-500).filter((w) => date(w?.d)).map((w) => ({ d: w.d, look: okId(w.look), items: (w.items || []).map(okId).filter(Boolean).slice(0, 12), name: txt(w.name, 60), occ: OCCASIONS[w.occ] ? w.occ : 'other', f: num(w.f, 1, 5) || 3 })),
    prefs: { item: nums(p.item), pair: nums(p.pair), occ: nums(p.occ) },
    ob: r.ob && typeof r.ob === 'object' ? { welcomed: !!r.ob.welcomed } : {},
  };
}
// What's in the Closet now (deleted pieces stay only so old Looks still show them).
export const closet = (rec) => rec.items.filter((i) => !i.gone);
export const itemById = (rec, id) => rec.items.find((i) => i.id === id) || null;
// The Closet's filters, only the ones with something in them.
export function filtersFor(items) {
  const have = new Set(items.map((i) => CATS[i.cat].filter));
  return ['All', ...FILTERS.filter((f) => have.has(f))];
}
// Deleting a piece: gone from the Closet and from recommendations; Looks that used it keep it
// (and its picture) so your history still makes sense. It's removed for good once nothing uses it.
export function deleteItem(rec, id) {
  const used = rec.looks.some((l) => l.items.includes(id));
  return { ...rec, items: used ? rec.items.map((i) => (i.id === id ? { ...i, gone: true, available: false } : i)) : rec.items.filter((i) => i.id !== id), dropImage: !used };
}

// ---------- the same piece again? ----------
// Image fingerprints (average hash of the cut-out at 8×8, as 16 hex digits) plus category and colour.
export const hamming = (a, b) => { let d = 0; for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
export function aHash(gray) { // 64 grey values (0–255)
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  let out = '';
  for (let i = 0; i < 64; i += 4) out += (((gray[i] > avg) << 3) | ((gray[i + 1] > avg) << 2) | ((gray[i + 2] > avg) << 1) | (gray[i + 3] > avg)).toString(16);
  return out;
}
// Colours that can be the same piece in different light.
const FAMILY = [['navy', 'blue', 'denim'], ['black', 'charcoal', 'grey'], ['grey', 'light grey', 'white'], ['white', 'cream', 'light grey'], ['cream', 'beige', 'khaki'], ['beige', 'khaki', 'tan'], ['tan', 'brown'], ['brown', 'dark brown'], ['light blue', 'blue', 'white'], ['olive', 'green', 'khaki'], ['burgundy', 'red'], ['red', 'pink'], ['orange', 'tan'], ['teal', 'green', 'blue'], ['purple', 'navy']];
export const sameColorFamily = (a, b) => !a || !b || a === b || FAMILY.some((f) => f.includes(a) && f.includes(b));
// A first guess at what a cut-out is from its shape (wide → shoes, tall and narrow → trousers).
export const catFromShape = (aspect) => (aspect >= 1.45 ? 'shoes' : aspect <= 0.62 ? 'bottom' : 'top');
const words = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
// The piece in your Closet this probably is — only a suggestion; you choose Use existing or Add new.
export function likelySame(cand, items) {
  let best = null;
  for (const it of items) {
    if (it.gone || it.cat !== cand.cat || !sameColorFamily(cand.color, it.color)) continue;
    let s = 0;
    if (cand.color && it.color === cand.color) s += 2; else if (cand.color && it.color && isNeutral(cand.color) !== isNeutral(it.color)) s -= 2;
    if (cand.sub && it.sub === cand.sub) s += 2;
    const w = words(cand.name), shared = [...words(it.name)].filter((x) => w.has(x)).length;
    s += Math.min(2, shared);
    if (cand.hash && it.hash) { const d = hamming(cand.hash, it.hash); s += d <= 8 ? 3 : d <= 14 ? 1 : -1; }
    if (s >= 4 && (!best || s > best.s)) best = { item: it, s };
  }
  return best ? { item: best.item, sure: best.s >= 6 } : null;
}

// ---------- the flat-lay board ----------
// Where each piece sits on a 4:5 board (percentages), for whatever the Look has: a jacket top
// left with the shirt beside it, trousers below, shoes bottom right, the watch by the shirt,
// small accessories down the right. Adapts when there's no jacket, a dress, or no shoes.
export function boardLayout(items) {
  const by = (c) => items.filter((i) => i.cat === c);
  const outer = by('outer')[0], top = by('top')[0], bottom = by('bottom')[0], dress = by('dress')[0], shoes = by('shoes')[0], watch = by('watch')[0];
  const acc = [...by('accessory'), ...by('outer').slice(1), ...by('top').slice(1), ...by('watch').slice(1), ...by('shoes').slice(1), ...by('bottom').slice(1)];
  const out = [];
  const put = (it, x, y, w, h, z = 1) => it && out.push({ id: it.id, cat: it.cat, x, y, w, h, z });
  if (dress) {
    put(outer, 2, 4, 44, 46, 2);
    put(dress, outer ? 40 : 18, 3, outer ? 50 : 54, 72, 1);
  } else if (outer) {
    put(outer, 3, 3, 50, 50, 2);
    put(top, 50, 5, 44, 42, 1);
    put(bottom, 12, 47, 38, 51, 1);
  } else {
    put(top, 14, 3, 56, 46, 2);
    put(bottom, 18, 46, 40, 52, 1);
  }
  put(shoes, 58, 72, 38, 24, 3);
  put(watch, dress || !outer ? 72 : 60, dress ? 52 : 50, 22, 18, 4);
  const spots = [[74, 30], [74, 8], [4, 76], [4, 58], [60, 52], [80, 52]];
  acc.slice(0, spots.length).forEach((it, i) => put(it, spots[i][0], spots[i][1], 20, 18, 5));
  return out;
}

// ---------- today's context ----------
const RULES = [
  [/interview|pitch|board meeting|investor|client|presentation|keynote|conference/, 'meeting'],
  [/wedding|gala|black.?tie|funeral|ceremony|opera|ball\b/, 'formal'],
  [/\bdate\b|anniversary|date night/, 'date'],
  [/dinner|restaurant|reservation|supper|tasting|omakase/, 'dinner'],
  [/meeting|1:1|1on1|one.?on.?one|sync|standup|stand-up|review|office|offsite|all.?hands|workshop|training|work\b/, 'work'],
  [/flight|airport|travel|trip|drive to/, 'travel'],
  [/brunch|lunch|coffee|drinks|happy hour|party|birthday|bbq|picnic|game|concert|movie/, 'casual'],
];
export function occasionOf(text) {
  const t = String(text || '').toLowerCase();
  return RULES.find(([re]) => re.test(t))?.[1] || null;
}
const clock = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
// Which occasion decides what to wear when a day has several (a dinner after work is the dinner).
const RANK = { formal: 6, meeting: 5, date: 4, dinner: 3.5, work: 3, travel: 2, casual: 1 };
const LABEL = { meeting: 'Meeting', formal: 'Event', date: 'Date', dinner: 'Dinner', work: 'Work', travel: 'Travel', casual: 'Plans' };
// The day's main occasion from its events — the most dressed-up one — worked out on the phone.
// Only a short label leaves this function ("Dinner at 5:30 PM"), never an event's title.
// events: [{title, place, time 'HH:MM', allDay}]; weekday: 0–6.
export function dayContext(events = [], weekday = 1) {
  const found = events.map((e) => ({ e, occ: occasionOf(`${e.title || ''} ${e.place || ''}`) })).filter((x) => x.occ);
  const main = found.sort((a, b) => RANK[b.occ] - RANK[a.occ] || String(a.e.time || '99').localeCompare(String(b.e.time || '99')))[0];
  const workday = weekday >= 1 && weekday <= 5;
  if (!main) return { occ: workday ? 'work' : 'casual', label: workday ? 'Workday' : 'Day off', time: null, evening: false, fromCalendar: false };
  const t = main.e.allDay || !main.e.time ? null : main.e.time;
  const h = t ? +t.split(':')[0] : null;
  return { occ: main.occ, label: `${LABEL[main.occ]}${t ? ` at ${clock(t)}` : ''}`, time: t, evening: h != null && h >= 17, fromCalendar: true };
}
// How warm to dress from the weather (feels-like °F): `need` 0 (hot) – 4 (very cold); rain; and
// the range for the line on screen. wx: dress.js dressFor's temps (or null when there's no forecast).
export function weatherNeed(wx, evening = false) {
  if (!wx) return { need: null, rain: false, range: '' };
  const t = wx.temps;
  const low = evening ? Math.min(t.back.f, t.low) : t.low;
  const need = low >= 75 ? 0 : low >= 66 ? 1 : low >= 56 ? 2 : low >= 45 ? 3 : 4;
  return { need, rain: (wx.rain || 0) >= 40, range: `${Math.min(t.low, t.leave.f, t.back.f)}–${t.peak.f}°F`, cool: evening && t.back.f < t.peak.f - 6 ? 'evening' : '' };
}

// ---------- recommendations ----------
const daysSince = (d, today) => (d ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5) : 99);
const COLD_CLASH = [['navy', 'black'], ['brown', 'black'], ['dark brown', 'black']];
function colorScore(set) {
  let s = 0;
  const cs = set.map((i) => i.color).filter(Boolean);
  const loud = cs.filter((c) => !isNeutral(c));
  if (loud.length > 1) s -= 0.6 * (loud.length - 1);
  const top = set.find((i) => i.cat === 'top'), bottom = set.find((i) => i.cat === 'bottom'), outer = set.find((i) => i.cat === 'outer'), shoes = set.find((i) => i.cat === 'shoes');
  if (top && bottom && top.color === bottom.color && top.color !== 'denim') s -= 0.6;
  if (outer && bottom && outer.color === bottom.color && outer.formality >= 4 && bottom.formality >= 4) s += 0.4; // a suit
  for (const [a, b] of COLD_CLASH) if (cs.includes(a) && cs.includes(b) && !(shoes?.color === 'black' && a !== 'navy')) s -= 0.25;
  if (shoes && ['brown', 'dark brown', 'tan'].includes(shoes.color) && ['navy', 'charcoal', 'grey', 'khaki', 'beige', 'olive', 'denim'].includes(bottom?.color)) s += 0.25;
  if (top?.pattern !== 'solid' && outer && outer.pattern !== 'solid') s -= 0.4;
  return s;
}
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
// How good one set of pieces is for today: higher is better, with the reasons it won.
export function scoreSet(set, ctx, rec, today) {
  const target = Math.max(1, Math.min(5, ctx.f + (rec.prefs.occ[ctx.occ] || 0)));
  let s = 10;
  const core = set.filter((i) => ['outer', 'top', 'bottom', 'dress', 'shoes'].includes(i.cat));
  for (const i of core) s -= Math.max(0, Math.abs(i.formality - target) - 0.5) * (i.cat === 'shoes' ? 0.7 : 1);
  if (ctx.need != null) {
    const warm = set.filter((i) => ['outer', 'top', 'dress'].includes(i.cat)).reduce((a, i) => a + i.warmth, 0);
    const want = [0.5, 1, 2, 2.5, 3.5][ctx.need];
    s -= Math.abs(warm - want) * 0.8;
    if (ctx.need >= 3 && !set.some((i) => i.cat === 'outer')) s -= 1;
  }
  if (ctx.rain) { if (set.some((i) => /suede/i.test(i.material || i.name))) s -= 1; if (!set.some((i) => i.cat === 'outer')) s -= 0.4; }
  s += colorScore(set);
  for (const i of set) {
    const ago = daysSince(i.lastWorn, today);
    if (ago <= 2 && ['top', 'bottom', 'dress'].includes(i.cat)) s -= ago === 0 ? 1 : 0.6;
    s += (rec.prefs.item[i.id] || 0) * 0.25 + (i.fav ? 0.15 : 0);
  }
  for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++) s += (rec.prefs.pair[pairKey(set[a].id, set[b].id)] || 0) * 0.15;
  const watch = set.find((i) => i.cat === 'watch');
  if (watch) s += 0.2 - Math.max(0, Math.abs(watch.formality - target) - 1) * 0.4;
  return Math.round(s * 100) / 100;
}
const firstBy = (rec, c) => closet(rec).filter((i) => i.cat === c && i.available);
// A name for a new combination: its main colour and the day ("Navy Dinner", "Charcoal Office").
export function nameFor(set, ctx) {
  const lead = set.find((i) => i.cat === 'outer') || set.find((i) => i.cat === 'dress') || set.find((i) => i.cat === 'top');
  return `${cap(lead?.color?.split(' ').pop() || '')} ${OCCASIONS[ctx.occ]?.word || 'Look'}`.trim();
}
// One short line on why it works.
export function reasonFor(set, ctx) {
  const target = ctx.f;
  const style = target >= 5 ? 'Dressed up' : target >= 4 ? 'Sharp' : target >= 3 ? (ctx.occ === 'work' || ctx.occ === 'bizcasual' ? 'Business casual' : 'Smart casual') : 'Relaxed';
  const what = { meeting: 'for the meeting', formal: 'for the occasion', date: 'for date night', dinner: 'for dinner', work: 'for the office', bizcasual: 'for the office', smart: 'for the day', travel: 'for travelling', casual: 'for the day off', other: 'for today' }[ctx.occ] || 'for today';
  const outer = set.some((i) => i.cat === 'outer');
  const wx = ctx.rain && outer ? ', with a layer for the rain' : ctx.need >= 3 && outer ? `, warm enough for the cooler ${ctx.cool || 'day'}` : ctx.need != null && ctx.need <= 1 && !outer ? ', light enough for a warm day' : ctx.cool && outer ? ', with a layer for the cooler evening' : '';
  return `${style} ${what}${wx}.`;
}
// The candidates: your Saved Looks (whole photos too) and new combinations of your own pieces.
// refine: { warmer, cooler, casual, formal, avoid: [itemId], seed } from the Swap sheet.
export function recommend(rec, ctx0, today, refine = {}, n = 3) {
  const ctx = { ...ctx0, f: Math.max(1, Math.min(5, (OCCASIONS[ctx0.occ]?.f ?? 3) + (refine.formal ? 1 : 0) - (refine.casual ? 1 : 0))) };
  if (ctx.need != null) ctx.need = Math.max(0, Math.min(4, ctx.need + (refine.warmer ? 1 : 0) - (refine.cooler ? 1 : 0)));
  else if (refine.warmer) ctx.need = 3;
  const avoid = new Set(refine.avoid || []);
  const ok = (i) => i && !i.gone && i.available && !avoid.has(i.id);
  const live = closet(rec).filter(ok);
  const shuffle = refine.seed ? (x) => ((x * 9301 + refine.seed * 49297) % 233280) / 233280 : null;
  const cands = [];
  // Saved Looks: every piece still yours (a photo-only Look always is).
  for (const l of rec.looks) {
    if (!l.saved && !l.wearCount) continue;
    const set = l.items.map((id) => itemById(rec, id));
    if (set.some((i) => !ok(i))) continue;
    // A photo-only Look: as good as how well what it's for matches today.
    let s = set.length ? scoreSet(set, ctx, rec, today) : 8.6 + (l.tags.includes(ctx.occ) ? 0.6 : l.tags.some((t) => Math.abs(OCCASIONS[t].f - ctx.f) <= 0.5) ? 0.2 : l.tags.length ? -0.8 : 0);
    s += (l.saved ? 0.4 : 0) + Math.min(0.6, l.wearCount * 0.2) + (l.verdict === 'hit' ? 0.5 : l.verdict === 'miss' ? -0.6 : 0);
    if (l.tags.includes(ctx.occ)) s += 0.6;
    if (daysSince(l.lastWorn, today) <= 1) s -= 1.2;
    cands.push({ key: `l:${l.id}`, look: l, items: set, score: s });
  }
  // New combinations: the best few of each kind for today, then every mix of them.
  const pick = (c, k) => live.filter((i) => i.cat === c).map((i) => ({ i, s: -Math.abs(i.formality - ctx.f) + (rec.prefs.item[i.id] || 0) * 0.3 + (shuffle ? shuffle(i.id.charCodeAt(0) + i.id.charCodeAt(1)) : 0) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i);
  const tops = pick('top', 6), bottoms = pick('bottom', 5), dresses = pick('dress', 3), outers = [null, ...pick('outer', 4)], shoes = pick('shoes', 4), watches = [null, ...pick('watch', 3)];
  const bases = [...tops.flatMap((t) => bottoms.map((b) => [t, b])), ...dresses.map((d) => [d])];
  for (const base of bases) for (const o of outers) for (const sh of shoes.length ? shoes : [null]) for (const w of watches) {
    const set = [o, ...base, sh, w].filter(Boolean);
    cands.push({ key: `n:${set.map((i) => i.id).sort().join('.')}`, items: set, score: scoreSet(set, ctx, rec, today) + (shuffle ? shuffle(set.length * 7 + set[0].id.charCodeAt(2)) * 2 : 0) });
  }
  // Best first, each one different enough from the ones above it — two pieces at least, or one
  // when a small Closet can't do better.
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  // How many pieces differ (a photo-only Look differs from everything but itself).
  const differs = (c, o) => (c.look && o.look && c.look.id === o.look.id ? 0 : !c.items.length || !o.items.length ? 9 : c.items.filter((i) => !o.items.some((x) => x.id === i.id)).length);
  for (const need of [2, 1]) for (const c of cands) {
    if (out.length >= n) break;
    if (out.some((o) => o.key === c.key || differs(c, o) < need)) continue;
    out.push(c);
  }
  const used = new Set();
  out.forEach((c, i) => {
    // Two new combinations with the same lead colour get the trousers' colour too.
    let name = c.look?.name || nameFor(c.items, ctx);
    if (!c.look && used.has(name)) {
      const base = name;
      for (const cat of ['bottom', 'top', 'shoes']) {
        const b = c.items.find((x) => x.cat === cat);
        if (b?.color) name = base.replace(/^(\S+)/, `$1 & ${cap(b.color.split(' ').pop())}`);
        if (!used.has(name)) break;
      }
      for (let k = 2; used.has(name); k++) name = `${base} ${k}`;
    }
    used.add(name);
    out[i] = { ...c, name, why: c.look && !c.items.length ? `Your saved ${c.look.name}${c.look.lastWorn ? `, last worn ${new Date(`${c.look.lastWorn}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : ''}.` : reasonFor(c.items, ctx) };
  });
  return { ctx, looks: out };
}
// What can replace one piece of a Look, best for today first (and "No watch" for a watch).
export function swapOptions(rec, set, cat, ctx, today) {
  const cur = set.find((i) => i.cat === cat);
  const others = closet(rec).filter((i) => i.cat === cat && i.available && i.id !== cur?.id);
  const scored = others.map((i) => ({ item: i, score: scoreSet([...set.filter((x) => x.cat !== cat), i], ctx, rec, today) })).sort((a, b) => b.score - a.score);
  return { current: cur || null, options: scored.map((x) => x.item), none: cat === 'watch' || cat === 'accessory' || cat === 'outer' };
}

// ---------- learning (structured and explainable) ----------
const bump = (o, k, d) => { o[k] = Math.max(-3, Math.min(3, Math.round(((o[k] || 0) + d) * 100) / 100)); };
// event: wear | save | swap | casual | formal | nottoday | notmystyle | hit | miss
// detail: { items: [id], from, to, cat, occ, reasons: [] }
export function learn(prefs0, event, d = {}) {
  const prefs = { item: { ...prefs0.item }, pair: { ...prefs0.pair }, occ: { ...prefs0.occ } };
  const ids = d.items || [];
  const each = (w) => ids.forEach((id) => bump(prefs.item, id, w));
  const pairs = (w) => { for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) bump(prefs.pair, pairKey(ids[a], ids[b]), w); };
  if (event === 'wear') { each(1); pairs(0.5); }
  if (event === 'save') { each(0.5); pairs(0.3); }
  if (event === 'swap') { if (d.from) bump(prefs.item, d.from, -0.3); if (d.to) bump(prefs.item, d.to, 0.2); }
  if (event === 'casual' && d.occ) bump(prefs.occ, d.occ, -0.5);
  if (event === 'formal' && d.occ) bump(prefs.occ, d.occ, 0.5);
  if (event === 'nottoday') each(-0.1);
  if (event === 'notmystyle') { each(-0.6); pairs(-0.4); }
  if (event === 'hit') { each(0.8); pairs(0.5); }
  if (event === 'miss') {
    const r = d.reasons || [];
    if (!r.length) each(-0.2);
    for (const cat of ['shoes', 'outer', 'watch']) if (r.includes(cat === 'outer' ? 'jacket' : cat)) (d.byCat?.[cat] || []).forEach((id) => bump(prefs.item, id, -0.5));
    if (r.includes('colors')) pairs(-0.4);
    if (r.includes('formal') && d.occ) bump(prefs.occ, d.occ, -0.5);
    if (r.includes('casual') && d.occ) bump(prefs.occ, d.occ, 0.5);
    if (r.includes('style')) each(-0.6);
  }
  for (const o of [prefs.occ]) for (const k of Object.keys(o)) o[k] = Math.max(-1.5, Math.min(1.5, o[k]));
  return prefs;
}
// Wearing a Look: the wear is remembered, its pieces and Look updated, and it counts as a strong yes.
export function wear(rec, { items, look = null, name, ctx, today }) {
  const ids = items.map((i) => i.id);
  const out = { ...rec, prefs: learn(rec.prefs, 'wear', { items: ids }) };
  out.items = rec.items.map((i) => (ids.includes(i.id) ? { ...i, lastWorn: today, wearCount: i.lastWorn === today ? i.wearCount : i.wearCount + 1 } : i));
  let lk = look ? rec.looks.find((l) => l.id === look.id) : rec.looks.find((l) => l.items.length && l.items.length === ids.length && l.items.every((x) => ids.includes(x)));
  if (lk) out.looks = rec.looks.map((l) => (l.id === lk.id ? { ...l, lastWorn: today, wearCount: l.lastWorn === today ? l.wearCount : l.wearCount + 1 } : l));
  else { lk = makeLook({ name, items: ids, saved: false, source: 'rec', at: Date.now(), lastWorn: today, wearCount: 1, tags: [ctx.occ] }); out.looks = [...rec.looks, lk]; }
  out.wears = [...rec.wears.filter((w) => w.d !== today), { d: today, look: lk.id, items: ids, name: lk.name || name, occ: ctx.occ, f: ctx.f }].slice(-500);
  return { rec: out, look: out.looks.find((l) => l.id === lk.id) };
}
