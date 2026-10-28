// 🏋️ One workout model for OurPawmily. A workout built by hand, described in words or read from a
// photo is always this shape, so Today's Workout, logging and history only ever handle one thing.
//
//   Workout { v: 1, id, title, date, status: 'planned' | 'active' | 'done',
//             source: 'manual' | 'text' | 'photo' | 'repeat' | 'lift' | 'device',
//             notes, blocks: [Block], activity?: { kind, minutes, distance, distUnit, kcal },
//             startedAt?, doneAt? }
//   Block   { id, kind: 'straight' | 'superset' | 'circuit', rounds, rest?, note?, items: [Item],
//             uncertain?: ['rounds' | 'kind'] }
//   Item    { id, name, note?, sets: [Set] (one per round), uncertain?: ['name'] }
//   Set     { reps, weight, unit: 'lb' | 'kg', bw, time, distance, distUnit, done, got?, uncertain? }
//
// A block is done in rounds: each round does every item once, in order. Straight sets are a block
// with one item (rounds = sets); a superset alternates two; a circuit goes through three or more.
// Every set holds its own target, so 12 / 12 / 11 / 11 reps or 40 / 45 / 50 lb are just four sets.
// Nothing here guesses: a value nobody gave stays null, and a parser marks what it isn't sure of.
export const KINDS = { straight: 'Straight sets', superset: 'Superset', circuit: 'Circuit' };
const UNITS = ['lb', 'kg'], DIST = ['mi', 'km', 'm'];
const MAX = { blocks: 30, items: 12, rounds: 20, reps: 999, weight: 2000, time: 4 * 3600, distance: 1000 };

export const newId = () => Math.random().toString(36).slice(2, 10);
const num = (v, max) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n * 100) / 100) : null; };
const int = (v, max) => { const n = num(v, max); return n == null ? null : Math.round(n); };
const text = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const okFields = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((f) => allowed.includes(f)))] : []);

export function makeSet(o = {}) {
  const s = {
    reps: int(o.reps, MAX.reps), weight: num(o.weight, MAX.weight), unit: UNITS.includes(o.unit) ? o.unit : 'lb',
    bw: !!o.bw, time: int(o.time, MAX.time), distance: num(o.distance, MAX.distance), distUnit: DIST.includes(o.distUnit) ? o.distUnit : 'mi', done: !!o.done,
  };
  if (o.got && typeof o.got === 'object') s.got = { reps: int(o.got.reps, MAX.reps), weight: num(o.got.weight, MAX.weight), time: int(o.got.time, MAX.time), distance: num(o.got.distance, MAX.distance) };
  const u = okFields(o.uncertain, ['reps', 'weight', 'time', 'distance']);
  if (u.length) s.uncertain = u;
  return s;
}
export function makeItem(o = {}, rounds = null) {
  let sets = (Array.isArray(o.sets) ? o.sets : []).slice(0, MAX.rounds).map(makeSet);
  // Fewer sets than rounds: the missing ones are blank and marked unsure — never copied or invented.
  if (rounds) while (sets.length < rounds) sets.push(makeSet({ uncertain: ['reps'] }));
  if (rounds) sets = sets.slice(0, rounds);
  const item = { id: text(o.id, 12) || newId(), name: text(o.name), sets };
  if (o.note) item.note = text(o.note, 200);
  const u = okFields(o.uncertain, ['name']);
  if (!item.name) u.push('name');
  if (u.length) item.uncertain = [...new Set(u)];
  return item;
}
export const kindFor = (n) => (n <= 1 ? 'straight' : n === 2 ? 'superset' : 'circuit');
export function makeBlock(o = {}) {
  const raw = (Array.isArray(o.items) ? o.items : []).slice(0, MAX.items);
  const given = int(o.rounds, MAX.rounds);
  const rounds = Math.max(1, given || Math.max(1, ...raw.map((x) => (Array.isArray(x?.sets) ? x.sets.length : 0))));
  const items = raw.map((x) => makeItem(x, rounds));
  const b = { id: text(o.id, 12) || newId(), kind: KINDS[o.kind] && !(o.kind === 'straight' && items.length > 1) ? o.kind : kindFor(items.length), rounds, items };
  if (o.rest != null) b.rest = int(o.rest, 3600);
  if (o.note) b.note = text(o.note, 200);
  const u = okFields(o.uncertain, ['rounds', 'kind']);
  if (!given && raw.length > 1) u.push('rounds'); // a superset or circuit with no round count given
  if (u.length) b.uncertain = [...new Set(u)];
  return b;
}
// Anything shaped roughly like a workout (saved, typed in, from a parser) → the model.
export function normalize(raw = {}) {
  const w = {
    v: 1, id: text(raw.id, 16) || newId(), title: text(raw.title, 80) || 'Workout', date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : '',
    status: ['planned', 'active', 'done'].includes(raw.status) ? raw.status : 'planned',
    source: ['manual', 'text', 'photo', 'repeat', 'lift', 'device'].includes(raw.source) ? raw.source : 'manual',
    notes: text(raw.notes, 500), blocks: (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, MAX.blocks).map(makeBlock),
  };
  if (raw.activity && typeof raw.activity === 'object') w.activity = { kind: text(raw.activity.kind, 40) || 'Activity', minutes: int(raw.activity.minutes, 24 * 60), distance: num(raw.activity.distance, MAX.distance), distUnit: DIST.includes(raw.activity.distUnit) ? raw.activity.distUnit : 'mi', kcal: int(raw.activity.kcal, 20000) };
  for (const k of ['startedAt', 'doneAt']) if (Number.isFinite(raw[k])) w[k] = raw[k];
  return w;
}

// What a person still needs to look at before saving (a parser's guesses, a missing name).
export function uncertain(w) {
  const out = [];
  w.blocks.forEach((b, bi) => {
    for (const f of b.uncertain || []) out.push({ block: bi, field: f });
    b.items.forEach((it, ii) => {
      for (const f of it.uncertain || []) out.push({ block: bi, item: ii, field: f });
      it.sets.forEach((s, si) => { for (const f of s.uncertain || []) out.push({ block: bi, item: ii, set: si, field: f }); });
    });
  });
  return out;
}
// Problems that stop a workout from being saved as it is.
export function problems(w) {
  const out = [];
  if (!w.blocks.length && !w.activity) out.push('Add at least one exercise.');
  w.blocks.forEach((b, bi) => {
    if (!b.items.length) out.push(`Part ${bi + 1} has no exercises.`);
    b.items.forEach((it) => { if (!it.name) out.push(`An exercise in part ${bi + 1} has no name.`); });
  });
  return out;
}

// Immutable edits (the screens re-render from the returned workout).
const clone = (w) => JSON.parse(JSON.stringify(w));
export function setRounds(w, bi, n) {
  const c = clone(w), b = c.blocks[bi], rounds = Math.max(1, Math.min(MAX.rounds, Math.round(n)));
  // More rounds: the new sets start as a copy of that item's last set (the person asked for them).
  for (const it of b.items) { while (it.sets.length < rounds) it.sets.push(makeSet({ ...it.sets[it.sets.length - 1], done: false, got: undefined, uncertain: [] })); it.sets.length = rounds; }
  b.rounds = rounds; b.uncertain = (b.uncertain || []).filter((f) => f !== 'rounds');
  if (!b.uncertain.length) delete b.uncertain;
  return c;
}
export function editSet(w, bi, ii, si, patch) {
  const c = clone(w), s = c.blocks[bi].items[ii].sets[si];
  const next = makeSet({ ...s, ...patch });
  // Whatever the person typed is no longer a guess.
  next.uncertain = (s.uncertain || []).filter((f) => !(f in patch));
  if (!next.uncertain.length) delete next.uncertain;
  c.blocks[bi].items[ii].sets[si] = next;
  return c;
}
export function renameItem(w, bi, ii, name) {
  const c = clone(w), it = c.blocks[bi].items[ii];
  it.name = text(name); it.uncertain = (it.uncertain || []).filter((f) => f !== 'name' || !it.name);
  if (!it.uncertain.length) delete it.uncertain;
  return c;
}
// Logging while training: what you actually did (blank = as planned), and the set is done.
export function logSet(w, bi, ii, si, got = {}) {
  const c = clone(w), s = c.blocks[bi].items[ii].sets[si];
  const g = makeSet({ reps: got.reps ?? s.reps, weight: got.weight ?? s.weight, time: got.time ?? s.time, distance: got.distance ?? s.distance });
  s.got = { reps: g.reps, weight: g.weight, time: g.time, distance: g.distance }; s.done = true;
  if (c.status === 'planned') { c.status = 'active'; c.startedAt ||= Date.now(); }
  return c;
}
export function unlogSet(w, bi, ii, si) { const c = clone(w), s = c.blocks[bi].items[ii].sets[si]; s.done = false; delete s.got; return c; }
export function complete(w, at = Date.now()) { const c = clone(w); c.status = 'done'; c.doneAt = at; c.startedAt ||= at; return c; }
// A finished or saved workout as a fresh plan for another day (Repeat): targets kept, logs cleared.
export function repeatOf(w, date) {
  const c = clone(w);
  Object.assign(c, { id: newId(), date, status: 'planned', source: 'repeat' }); delete c.startedAt; delete c.doneAt;
  for (const b of c.blocks) for (const it of b.items) for (const s of it.sets) { const g = s.got; s.done = false; delete s.got; if (g) { if (g.reps != null) s.reps = g.reps; if (g.weight != null) s.weight = g.weight; } }
  return normalize(c);
}

// Numbers for a card: exercises, sets done of planned, volume (reps × weight, in the set's unit → lb).
export function summary(w) {
  let sets = 0, done = 0, volume = 0;
  const names = new Set();
  for (const b of w.blocks) for (const it of b.items) {
    if (it.name) names.add(it.name.toLowerCase());
    for (const s of it.sets) {
      sets++; if (s.done) done++;
      const v = s.done ? s.got || s : null;
      if (v?.reps && v.weight && !s.bw) volume += v.reps * v.weight * (s.unit === 'kg' ? 2.20462 : 1);
    }
  }
  return { exercises: names.size, sets, done, volume: Math.round(volume), minutes: w.activity?.minutes ?? (w.startedAt && w.doneAt ? Math.round((w.doneAt - w.startedAt) / 60000) : null) };
}
// One line per item: "Overhead press 12/12/11/11 @ 35 lb" — previews, history, sharing.
export function setText(s) {
  const bits = [];
  if (s.reps != null) bits.push(String(s.reps));
  if (s.time != null) bits.push(s.time >= 60 ? `${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}` : `${s.time}s`);
  if (s.distance != null) bits.push(`${s.distance} ${s.distUnit}`);
  return bits.join(' · ') || '?';
}
export function itemText(it) {
  const reps = it.sets.map((s) => setText(s.done && s.got ? { ...s, ...s.got } : s)).join(' / ');
  const ws = [...new Set(it.sets.map((s) => (s.bw ? 'bodyweight' : s.weight != null ? `${s.weight} ${s.unit}` : '')).filter(Boolean))];
  return `${it.name || '?'} ${reps}${ws.length === 1 ? ` @ ${ws[0]}` : ws.length > 1 ? ` @ ${it.sets.map((s) => (s.bw ? 'bw' : s.weight ?? '?')).join(' / ')} ${it.sets[0].unit}` : ''}`;
}
export function describe(w) {
  return w.blocks.map((b) => `${b.items.length > 1 ? `${b.rounds} rounds (${KINDS[b.kind].toLowerCase()}): ` : ''}${b.items.map(itemText).join(' · ')}`);
}

// ---------- older records, read as workouts (never rewritten) ----------
// A session from the trackers' lifting program: each exercise is a straight-sets block.
export function fromLiftSession(s, names = {}) {
  return normalize({
    id: `lift${s.date}${s.day ?? ''}`.replace(/[^a-z0-9]/gi, ''), title: s.day != null ? `Lifting · day ${s.day}` : 'Lifting', date: s.date, status: 'done', source: 'lift',
    blocks: (s.entries || []).filter((e) => e.sets?.length).map((e) => ({ items: [{ name: names[e.exercise] || e.exercise, sets: e.sets.map((x) => ({ reps: x.r, weight: x.bw ? null : x.w, bw: !!x.bw, done: true })) }] })),
  });
}
// A workout from a device (WHOOP, Strava…): an activity, no sets.
// "functional-fitness" → "Functional fitness" (devices send their own sport ids).
const sportName = (n) => String(n || 'Workout').replace(/[-_]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const localDate = (iso) => { const d = new Date(iso); return Number.isNaN(+d) || !/T/.test(iso) ? String(iso || '').slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function fromDeviceWorkout(x) {
  return normalize({ id: `dev${String(x.id || x.start).replace(/[^a-z0-9]/gi, '')}`.slice(0, 16), title: sportName(x.name), date: localDate(String(x.start || x.date || '')), status: 'done', source: 'device', activity: { kind: sportName(x.name), minutes: x.minutes, kcal: x.kcal } });
}
