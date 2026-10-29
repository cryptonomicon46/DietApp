// 👔 Look: the record, the flat-lay, colours, today's context, recommendations, swaps, learning,
// wearing, deleting, same-piece suggestions — and the on-phone background removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/look.js';
import { cutout, gray8, borderModel } from '../js/cutout.js';

const today = '2026-10-29';
const item = (o) => L.makeItem({ at: 1, ...o });
const closet = () => [
  item({ id: 'blazer01', name: 'Navy blazer', cat: 'outer', color: 'navy' }),
  item({ id: 'oxford01', name: 'Light-blue Oxford', cat: 'top', color: 'light blue' }),
  item({ id: 'white001', name: 'White dress shirt', cat: 'top', color: 'white' }),
  item({ id: 'tee00001', name: 'Grey tee', cat: 'top', color: 'grey' }),
  item({ id: 'trouser1', name: 'Charcoal trousers', cat: 'bottom', color: 'charcoal' }),
  item({ id: 'chinos01', name: 'Khaki chinos', cat: 'bottom', color: 'khaki' }),
  item({ id: 'jeans001', name: 'Dark jeans', cat: 'bottom', color: 'denim' }),
  item({ id: 'loafer01', name: 'Brown loafers', cat: 'shoes', color: 'brown' }),
  item({ id: 'sneaker1', name: 'White sneakers', cat: 'shoes', color: 'white' }),
  item({ id: 'ranger01', name: 'Tudor Ranger', cat: 'watch', color: 'black' }),
  item({ id: 'hydro001', name: 'Longines HydroConquest', cat: 'watch', color: 'blue' }),
  item({ id: 'coat0001', name: 'Charcoal wool overcoat', cat: 'outer', color: 'charcoal' }),
];
const rec = (o = {}) => L.normalize({ items: closet(), ...o });

test('defaults from a name: kind, formality, warmth', () => {
  assert.deepEqual(L.guessFrom('Brown loafers'), { cat: 'shoes', sub: 'loafers', formality: 4, warmth: 0 });
  assert.equal(L.guessFrom('Navy blazer').cat, 'outer');
  assert.equal(L.guessFrom('Light-blue Oxford').sub, 'oxford');
  assert.equal(L.guessFrom('Tudor Ranger').cat, 'watch');
  assert.equal(L.guessFrom('Grey hoodie').formality, 1);
  assert.equal(L.guessFrom('Wool overcoat').warmth, 3);
  assert.equal(L.suggestName('light blue', 'oxford', 'top'), 'Light-blue oxford');
});

test('the record: bounded, optional fields only when given, junk dropped', () => {
  const r = L.normalize({ items: [{ id: 'a1b2c3d4', name: 'x'.repeat(200), cat: 'nope', formality: 9, url: 'javascript:alert(1)', brand: 'Brand', price: 120 }], looks: [{ name: 'Navy Dinner', items: ['a1b2c3d4', 'BAD ID'], tags: ['dinner', 'party'] }], wears: [{ d: 'yesterday' }], prefs: { item: { a1b2c3d4: 9 } } });
  const it = r.items[0];
  assert.equal(it.name.length, 80);
  assert.equal(it.formality, 5);
  assert.equal(it.url, undefined);
  assert.equal(it.brand, 'Brand'); assert.equal(it.price, 120);
  assert.equal(it.model, undefined, 'optional fields stay absent');
  assert.deepEqual(r.looks[0].items, ['a1b2c3d4']);
  assert.deepEqual(r.looks[0].tags, ['dinner']);
  assert.equal(r.wears.length, 0);
  assert.equal(r.prefs.item.a1b2c3d4, 3);
});

test('colours: names and the main colours of a piece', () => {
  assert.equal(L.nameColor([28, 38, 70]), 'navy');
  assert.equal(L.nameColor([163, 192, 226]), 'light blue');
  assert.equal(L.nameColor([112, 72, 44]), 'brown');
  assert.equal(L.nameColor([60, 62, 68]), 'charcoal');
  const px = new Uint8ClampedArray(400 * 4);
  for (let i = 0; i < 400; i++) { const navy = i < 300; px.set(navy ? [30, 40, 72, 255] : [240, 240, 236, i < 380 ? 255 : 0], i * 4); }
  const d = L.dominantColors(px, 1);
  assert.equal(d[0].name, 'navy');
  assert.equal(d[1].name, 'white');
  assert.ok(d[0].share > 0.75);
});

test('filters: only the kinds you have', () => {
  assert.deepEqual(L.filtersFor([item({ name: 'Navy blazer' }), item({ name: 'Oxford shirt' })]), ['All', 'Tops', 'Jackets']);
  assert.deepEqual(L.filtersFor([]), ['All']);
});

test('flat-lay: jacket, shirt, trousers, shoes, watch placed inside the board; adapts', () => {
  const r = rec();
  const set = ['blazer01', 'oxford01', 'trouser1', 'loafer01', 'ranger01'].map((id) => L.itemById(r, id));
  const lay = L.boardLayout(set);
  assert.equal(lay.length, 5);
  for (const s of lay) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= 100 && s.y + s.h <= 100, s.cat);
  const at = (c) => lay.find((s) => s.cat === c);
  assert.ok(at('outer').x < at('top').x, 'jacket left of the shirt');
  assert.ok(at('bottom').y > at('outer').y, 'trousers below');
  assert.ok(at('shoes').y > 60, 'shoes at the bottom');
  // No jacket: the shirt moves to the middle. A dress. Seven pieces still fit.
  assert.ok(L.boardLayout(set.filter((i) => i.cat !== 'outer')).find((s) => s.cat === 'top').x < 30);
  assert.equal(L.boardLayout([item({ name: 'Black dress', cat: 'dress' }), item({ name: 'Heels', cat: 'shoes' })]).length, 2);
  const big = [...set, item({ name: 'Leather belt', cat: 'accessory' }), item({ name: 'Silk tie', cat: 'accessory' })];
  const lay7 = L.boardLayout(big);
  assert.equal(lay7.length, 7);
  for (const s of lay7) assert.ok(s.x + s.w <= 100 && s.y + s.h <= 100);
});

test("today's context: the main occasion from the calendar, a short label only", () => {
  const c = L.dayContext([{ title: 'Standup', time: '09:30' }, { title: 'Dinner with the Parkers at Rich Table', time: '17:30' }], 4);
  assert.deepEqual([c.occ, c.label, c.evening], ['dinner', 'Dinner at 5:30 PM', true]);
  assert.ok(!c.label.includes('Parkers'), 'never the event title');
  assert.equal(L.dayContext([{ title: 'Client pitch', time: '10:00' }, { title: 'Lunch', time: '12:30' }], 2).occ, 'meeting');
  assert.equal(L.dayContext([{ title: 'Anniversary 🥂', time: '19:00' }], 6).occ, 'date');
  assert.deepEqual([L.dayContext([], 3).occ, L.dayContext([], 3).label], ['work', 'Workday']);
  assert.equal(L.dayContext([], 0).occ, 'casual');
  assert.equal(L.dayContext([{ title: 'Dentist', time: '08:00' }], 2).occ, 'work', 'unknown events: an ordinary day');
});

test('weather: how warm to dress', () => {
  const wx = (low, leave, peak, back, rain = 0) => ({ temps: { low, leave: { f: leave }, peak: { f: peak }, back: { f: back } }, rain });
  assert.equal(L.weatherNeed(null).need, null);
  assert.equal(L.weatherNeed(wx(78, 78, 90, 82)).need, 0);
  assert.equal(L.weatherNeed(wx(58, 58, 66, 60)).need, 2);
  const cold = L.weatherNeed(wx(40, 41, 50, 42, 70));
  assert.deepEqual([cold.need, cold.rain, cold.range], [4, true, '40–50°F']);
  assert.equal(L.weatherNeed(wx(56, 58, 66, 57), true).cool, 'evening');
});

const ctx = (occ, need = 2, o = {}) => ({ occ, f: L.OCCASIONS[occ].f, need, rain: false, ...o });
const ids = (look) => look.items.map((i) => i.id).sort();

test('recommendations: Top 3, different from each other, each with a name and one-line reason', () => {
  const { looks } = L.recommend(rec(), ctx('dinner', 3, { cool: 'evening' }), today);
  assert.equal(looks.length, 3);
  for (const l of looks) { assert.ok(l.name && l.why && l.why.length < 140, l.why); assert.ok(l.items.some((i) => i.cat === 'top') && l.items.some((i) => i.cat === 'bottom')); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.notDeepEqual(ids(looks[a]), ids(looks[b]));
  assert.ok(looks[0].items.some((i) => i.cat === 'outer'), 'a layer for the cool evening');
  assert.match(looks[0].why, /dinner/);
});

test('recommendations follow the day: meeting vs warm casual day vs rain', () => {
  const meet = L.recommend(rec(), ctx('meeting', 2), today).looks[0];
  assert.ok(!meet.items.some((i) => i.id === 'tee00001' || i.id === 'sneaker1'), 'no tee or sneakers to a meeting');
  const warm = L.recommend(rec(), ctx('casual', 0), today).looks[0];
  assert.ok(!warm.items.some((i) => i.id === 'coat0001'), 'no overcoat on a hot day');
  assert.ok(warm.items.some((i) => ['tee00001', 'jeans001', 'chinos01', 'sneaker1'].includes(i.id)));
  const cold = L.recommend(rec(), ctx('work', 4, { rain: true }), today).looks[0];
  assert.ok(cold.items.some((i) => i.cat === 'outer'));
  // No weather at all still works.
  assert.equal(L.recommend(rec(), ctx('work', null), today).looks.length, 3);
});

test('only complete Looks (photos), and a mix of Looks and pieces', () => {
  const photoOnly = L.normalize({ looks: [{ id: 'look0001', name: 'Navy Dinner', photo: 'img00001', tags: ['dinner'], saved: true }, { id: 'look0002', name: 'Friday Office', photo: 'img00002', tags: ['work'], saved: true }] });
  const r1 = L.recommend(photoOnly, ctx('dinner'), today);
  assert.equal(r1.looks[0].look.id, 'look0001', 'the dinner Look first for dinner');
  assert.equal(r1.looks.length, 2);
  assert.match(r1.looks[0].why, /Your saved Navy Dinner/);
  const mixed = rec({ looks: photoOnly.looks });
  const r2 = L.recommend(mixed, ctx('dinner'), today);
  assert.equal(r2.looks.length, 3);
  assert.ok(r2.looks.some((l) => l.look), 'a saved Look among them');
});

test('empty Closet: nothing to recommend, no crash', () => {
  assert.deepEqual(L.recommend(L.normalize({}), ctx('work'), today).looks, []);
});

test('recently worn tops and trousers rest; a deleted piece never comes back', () => {
  let r = rec();
  r = { ...r, items: r.items.map((i) => (i.id === 'oxford01' ? { ...i, lastWorn: today } : i)) };
  assert.ok(!L.recommend(r, ctx('work'), today).looks[0].items.some((i) => i.id === 'oxford01'));
  const d = L.deleteItem(r, 'loafer01');
  assert.equal(d.dropImage, true);
  assert.ok(!d.items.some((i) => i.id === 'loafer01'));
  for (const l of L.recommend(d, ctx('dinner'), today).looks) assert.ok(!l.items.some((i) => i.id === 'loafer01'));
  // Used by an old Look: kept (hidden) so the Look still shows it.
  const withLook = { ...rec(), looks: [L.makeLook({ id: 'look0001', items: ['loafer01', 'oxford01'], saved: true })] };
  const d2 = L.deleteItem(withLook, 'loafer01');
  assert.equal(d2.dropImage, false);
  assert.equal(L.itemById(d2, 'loafer01').gone, true);
  assert.ok(!L.closet(d2).some((i) => i.id === 'loafer01'));
  assert.ok(!L.recommend(d2, ctx('dinner'), today).looks.some((l) => l.look?.id === 'look0001'), 'a Look with a deleted piece isn\'t suggested');
});

test('swap: the alternatives for one piece, and No watch', () => {
  const r = rec(), set = ['blazer01', 'oxford01', 'trouser1', 'loafer01', 'ranger01'].map((id) => L.itemById(r, id));
  const w = L.swapOptions(r, set, 'watch', ctx('dinner'), today);
  assert.equal(w.current.id, 'ranger01');
  assert.deepEqual(w.options.map((i) => i.id), ['hydro001']);
  assert.equal(w.none, true);
  const s = L.swapOptions(r, set, 'shoes', ctx('dinner'), today);
  assert.equal(s.options[0].id, 'sneaker1');
  assert.equal(s.none, false);
});

test('refinements: more casual, warmer, different shoes, surprise me', () => {
  const r = rec();
  const base = L.recommend(r, ctx('meeting'), today).looks[0];
  const casual = L.recommend(r, ctx('meeting'), today, { casual: true }).ctx;
  assert.equal(casual.f, 3);
  const warmer = L.recommend(r, ctx('work', 1), today, { warmer: true }).ctx;
  assert.equal(warmer.need, 2);
  const shoes = base.items.find((i) => i.cat === 'shoes');
  const other = L.recommend(r, ctx('meeting'), today, { avoid: [shoes.id] }).looks[0];
  assert.ok(!other.items.some((i) => i.id === shoes.id));
  const a = L.recommend(r, ctx('work'), today, { seed: 3 }).looks.map(ids), b = L.recommend(r, ctx('work'), today, { seed: 3 }).looks.map(ids);
  assert.deepEqual(a, b, 'Surprise me is repeatable for the same seed');
});

test('learning: wear, swap, casual, hit, miss with and without reasons — bounded', () => {
  let p = L.normalize({}).prefs;
  p = L.learn(p, 'wear', { items: ['a00001', 'b00001'] });
  assert.equal(p.item.a00001, 1); assert.equal(p.pair['a00001|b00001'], 0.5);
  p = L.learn(p, 'swap', { from: 'a00001', to: 'c00001' });
  assert.equal(p.item.a00001, 0.7); assert.equal(p.item.c00001, 0.2);
  p = L.learn(p, 'casual', { occ: 'dinner' });
  assert.equal(p.occ.dinner, -0.5);
  for (let i = 0; i < 9; i++) p = L.learn(p, 'casual', { occ: 'dinner' });
  assert.equal(p.occ.dinner, -1.5, 'bounded');
  const miss = L.learn(L.normalize({}).prefs, 'miss', { items: ['a00001', 'shoe0001'], reasons: ['shoes'], byCat: { shoes: ['shoe0001'] } });
  assert.equal(miss.item.shoe0001, -0.5); assert.equal(miss.item.a00001, undefined);
  assert.equal(L.learn(L.normalize({}).prefs, 'miss', { items: ['a00001'] }).item.a00001, -0.2, 'just Miss is a small nudge');
  const learnt = L.learn(L.normalize({}).prefs, 'notmystyle', { items: ['oxford01'] });
  assert.ok(!L.recommend(rec({ prefs: { ...learnt, item: { oxford01: -3 } } }), ctx('work'), today).looks[0].items.some((i) => i.id === 'oxford01'));
});

test('Wear This: the wear, the pieces and the Look remembered (once a day)', () => {
  const r = rec();
  const set = ['blazer01', 'oxford01', 'trouser1', 'loafer01', 'ranger01'].map((id) => L.itemById(r, id));
  const { rec: r2, look } = L.wear(r, { items: set, name: 'Navy Dinner', ctx: ctx('dinner'), today });
  assert.equal(look.name, 'Navy Dinner'); assert.equal(look.wearCount, 1); assert.equal(look.saved, false);
  assert.equal(L.itemById(r2, 'blazer01').lastWorn, today); assert.equal(L.itemById(r2, 'blazer01').wearCount, 1);
  assert.equal(r2.wears.length, 1); assert.equal(r2.prefs.item.blazer01, 1);
  const { rec: r3 } = L.wear(r2, { items: set, look, name: 'Navy Dinner', ctx: ctx('dinner'), today });
  assert.equal(L.itemById(r3, 'blazer01').wearCount, 1, 'wearing it again the same day doesn\'t double count');
  assert.equal(r3.wears.length, 1);
  assert.equal(r3.looks.length, 1, 'the same combination is the same Look');
  // Wear Again from Saved: the saved Look's own record is updated.
  const saved = rec({ looks: [L.makeLook({ id: 'look0001', name: 'Client Meeting', items: ['blazer01', 'white001', 'trouser1'], saved: true })] });
  const w = L.wear(saved, { items: ['blazer01', 'white001', 'trouser1'].map((id) => L.itemById(saved, id)), look: saved.looks[0], ctx: ctx('meeting'), today });
  assert.equal(w.look.id, 'look0001'); assert.equal(w.look.lastWorn, today);
});

test('the same piece again: a suggestion, never a merge', () => {
  const items = closet();
  const s = L.likelySame({ cat: 'outer', sub: 'blazer', color: 'navy', name: 'Navy blazer' }, items);
  assert.equal(s.item.id, 'blazer01');
  assert.equal(L.likelySame({ cat: 'outer', sub: 'blazer', color: 'olive', name: 'Olive blazer' }, items), null);
  assert.equal(L.likelySame({ cat: 'top', sub: 'blazer', color: 'navy', name: 'Navy blazer' }, items), null, 'other category');
  const h = L.aHash(Array.from({ length: 64 }, (_, i) => (i % 3 ? 200 : 20)));
  assert.equal(h.length, 16); assert.equal(L.hamming(h, h), 0);
  const withHash = items.map((i) => (i.id === 'blazer01' ? { ...i, hash: h } : i));
  assert.equal(L.likelySame({ cat: 'outer', sub: 'jacket', color: 'navy', name: 'Jacket', hash: h }, withHash).item.id, 'blazer01');
});

// ---------- background removal ----------
// A W×H "photo": a background (with a little noise, maybe a floor and a wall) and a garment shape.
function photo(w, h, { bg = [222, 210, 190], bg2 = null, fg = [30, 40, 72], shape = (x, y) => x > w * 0.25 && x < w * 0.75 && y > h * 0.15 && y < h * 0.85, noise = 6 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2 * noise; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = shape(x, y) ? fg : bg2 && y > h * 0.6 ? bg2 : bg;
    data.set([c[0] + rnd(), c[1] + rnd(), c[2] + rnd(), 255], (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}

test('cut-out: a piece on a plain background', () => {
  const img = photo(120, 150);
  const r = cutout(img);
  assert.equal(r.ok, true);
  assert.ok(r.ratio > 0.3 && r.ratio < 0.4, String(r.ratio));
  assert.equal(r.alpha[5 * 120 + 5], 0, 'corner removed');
  assert.equal(r.alpha[75 * 120 + 60], 255, 'middle kept');
  assert.ok(r.box.x <= 30 && r.box.x + r.box.w >= 90);
  const g = gray8(img, r.alpha, r.box);
  assert.equal(g.length, 64);
});

test('cut-out: floor and wall, a light shirt on a light bed, holes inside the piece kept', () => {
  assert.equal(cutout(photo(120, 150, { bg2: [120, 90, 70] })).ok, true, 'two background colours');
  const r = cutout(photo(120, 150, { bg: [235, 235, 232], fg: [160, 190, 225] }));
  assert.equal(r.ok, true, 'light blue on white');
  // A ring-shaped piece (a belt): its middle is background-coloured but not connected to the edges.
  const ring = photo(100, 100, { shape: (x, y) => { const d = Math.hypot(x - 50, y - 50); return d > 20 && d < 32; } });
  const rr = cutout(ring);
  assert.equal(rr.alpha[50 * 100 + 50], 255, 'enclosed middle stays (no guessing)');
});

test('cut-out: says when it can\'t do it cleanly', () => {
  const busy = { data: new Uint8ClampedArray(80 * 80 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7919) % 256)), width: 80, height: 80 };
  assert.equal(cutout(busy).ok, false);
  assert.equal(cutout(photo(100, 100, { shape: () => false })).reason, 'empty');
  assert.equal(cutout(photo(100, 100, { shape: (x, y) => x > 0 && y > 0 && x < 99 && y < 99, fg: [30, 40, 72], bg: [30, 40, 72] })).ok, false);
  // Try again with a different tolerance is a different answer, not an error.
  assert.ok(cutout(photo(120, 150), { tolerance: 0.7 }).ok);
  assert.ok(borderModel(photo(60, 60)).length >= 1);
});

test('which Look a Fit Check was about stays in your own record, bounded', () => {
  const r = L.normalize({ fc: { fc00000001: { look: 'look0001', items: [['blazer01', 'BAD'], ['oxford01'], ['x']] }, 'BAD KEY': {} } });
  assert.deepEqual(r.fc, { fc00000001: { look: 'look0001', items: [['blazer01'], ['oxford01']] } });
});
