// ✅ Review before saving (Talk, Release 1 part E). What you tell Talk to log becomes a proposal —
// a draft held in memory only (never stored, never sent) — shown as a card: "Review meal · not
// logged yet" / "Review workout · not saved yet". It's saved only by ✓ Log meal / ✓ Create workout,
// or by saying "yes" / "log it" after 🎤 Change by voice on that card, and then exactly once.
// Corrections ("make the rice half a cup", "remove the salsa", "make it 4 sets") always change the
// current draft — they add up — and the phone reads them itself when it can (below); otherwise
// the current draft plus the correction is read again by the AI the area already uses.
// Pure: no storage, no network.
import { setRounds, editSet, makeBlock, normalize } from './workout.js';

export const TTL = 10 * 60 * 1000;
let seq = 0;
export function makeProposal(kind, payload, { now = Date.now() } = {}) {
  return { id: `p${now.toString(36)}${(seq++).toString(36)}`, kind, payload, version: 1, changed: [], createdAt: now, expiresAt: now + TTL, state: 'draft' };
}
export const isLive = (p, now = Date.now()) => !!p && p.state === 'draft' && now <= p.expiresAt;
// A corrected draft: the next version, with what changed (to highlight). An expired card can't change.
export function revise(p, payload, changed = [], { now = Date.now() } = {}) {
  if (!isLive(p, now)) return p;
  return { ...p, payload, version: p.version + 1, changed, expiresAt: now + TTL };
}
export function cancel(p) { if (p?.state === 'draft') p.state = 'cancelled'; return p; }
// The one way to save: from a live draft at its current version, once. The button and the voice
// both call it; a second call gets the first call's answer.
export function commitOnce(p, version, write, { now = Date.now() } = {}) {
  if (!p) return Promise.resolve({ error: 'none' });
  if (p.pending) return p.pending;
  if (p.state === 'committed') return Promise.resolve(p.result);
  if (p.state !== 'draft') return Promise.resolve({ error: p.state });
  if (now > p.expiresAt) { p.state = 'expired'; return Promise.resolve({ error: 'expired' }); }
  if (version !== p.version) return Promise.resolve({ error: 'stale' });
  p.state = 'committing';
  p.pending = Promise.resolve().then(write).then((result) => { p.state = 'committed'; p.result = { ok: true, result }; return p.result; },
    (e) => { p.state = 'draft'; p.pending = null; throw e; });
  return p.pending;
}

// ---------- what you said back to a card ----------
const clean = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const YES = "yes|yep|yeah|yup|correct|looks good|look good|looks right|that's right|that is right|that's correct|perfect|go ahead|do it|log it|create it|save it|add it|sounds good|all good|that's it|confirm";
const NOPE = "cancel|cancel it|cancel that|never mind|nevermind|forget it|forget that|scrap that|scrap it|don't log it|don't save it|don't log that|do not log it|stop|no thanks|no thank you|discard it|delete it";
const POLITE = /\s*\b(please|thanks|thank you|pawmily)\b\s*/g;
const YES_RE = new RegExp(`^(?:${YES})(?: (?:${YES}))*$`), NOPE_RE = new RegExp(`^(?:${NOPE})(?: (?:${NOPE}))*$`);
// 'confirm' only for a standalone yes ("Yes, but add avocado" is a correction); a bare "okay",
// "sure" or "no" is 'unclear' (the card asks again), never a save.
export function replyKind(text) {
  const t = clean(text).replace(POLITE, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'unclear';
  if (YES_RE.test(t)) return 'confirm';
  if (NOPE_RE.test(t)) return 'cancel';
  if (/^(ok|okay|sure|no|nope|hmm|um|uh|wait|hold on|what)$/.test(t)) return 'unclear';
  return 'correct';
}

// ---------- meal corrections, on the phone ----------
const MEALS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack', 'a snack': 'snack' };
const norm = (s) => clean(s).replace(/^(the|a|an|my|some) /, '').replace(/\b(the|my)\b/g, ' ').replace(/\s+/g, ' ').trim();
const sing = (w) => w.replace(/ies$/, 'y').replace(/(ches|shes|xes|oes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1');
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2).map(sing);
// Corrections said together: "remove the salsa and add a coffee", "half the rice, it was dinner".
const VERB = '(?:remove|delete|drop|take|no|without|skip|add|also|plus|make|change|set|double|halve|half|it was|that was|it is|it\'s|log it as|put it)';
export const clauses = (said) => String(said || '').split(new RegExp(`[,;.]+|\\b(?:and then|then|also)\\b|\\band\\b(?=\\s+${VERB}\\b)|\\bbut\\b`, 'i')).map((x) => x.replace(/^\s*(and|oh|actually|um|uh|so|ok|okay|please|wait)\b\s*/i, '').trim()).filter(Boolean);
function findItem(items, name, { parsePart, FOODS } = {}) {
  const n = norm(name);
  if (!n) return -1;
  const hit = parsePart && FOODS ? parsePart(n, FOODS) : null;
  if (hit) { const i = items.findIndex((x) => x.food && x.food === hit.food); if (i >= 0) return i; }
  const q = words(n);
  let best = -1, score = 0;
  items.forEach((x, i) => {
    const w = words(x.name || '');
    const s = q.filter((y) => w.includes(y)).length;
    if (s > score) { best = i; score = s; }
  });
  return best;
}
const AMOUNT = /^(?:\d|½|¼|¾|a |an |one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|couple|few)/i;
/**
 * The draft meal changed by what you said, on the phone — or `ok: false` when it couldn't place
 * something (then the AI reads the draft plus your words).
 *   draft: { meal, items: [{ name, amount, kcal, p, c, f, food?, grams?, per?, n? }] }
 *   tools: { parseMeal, parsePart, resize, FOODS }
 * → { ok, draft, changed: [item indexes in the new draft], did: ['what changed', …] }
 */
export function amendMeal(draft, said, tools) {
  const { parseMeal, parsePart, resize, FOODS } = tools;
  let items = draft.items.map((x) => ({ ...x })), meal = draft.meal;
  const touched = new Set(), did = [];
  const touch = (x) => { touched.add(x); return x; };
  for (const c of clauses(said)) {
    let m;
    const low = clean(c);
    if ((m = /^(?:it was|that was|it is|it's|this was|make it|log it as|log it for|put it under|put it as|change it to|for) (?:for )?(breakfast|lunch|dinner|a snack|snack)$/.exec(low))) { meal = MEALS[m[1]]; did.push(`→ ${meal}`); continue; }
    if ((m = /^(?:make it|it was|it's) (half|double|twice|(\d+(?:\.\d+)?|two|three) (?:servings|portions|times))(?: as much)?$/.exec(low)) || (m = /^(half|double) (?:it|that|everything|the whole thing|all of it)$/.exec(low))) {
      const k = /half/.test(m[1]) ? 0.5 : /double|twice/.test(m[1]) ? 2 : +(m[2] === 'two' ? 2 : m[2] === 'three' ? 3 : parseFloat(m[1]));
      if (!(k > 0)) return { ok: false };
      items = items.map((x) => touch(resize(x, x.food ? x.grams * k : (x.n ?? 1) * k, FOODS)));
      did.push(k === 0.5 ? 'all halved' : `all × ${k}`); continue;
    }
    if ((m = /^(?:remove|delete|drop|take out|take off|take away|no|without|skip|minus|i didn't have|didn't have|there was no|there's no|get rid of) (.+)$/.exec(low))) {
      const i = findItem(items, m[1], tools);
      if (i < 0) return { ok: false };
      did.push(`− ${items[i].name}`); items.splice(i, 1); continue;
    }
    if ((m = /^(?:half|halve|double|twice) (?:of )?(.+)$/.exec(low)) && !/^(?:it|that)$/.test(m[1])) {
      const i = findItem(items, m[1], tools);
      if (i < 0) return { ok: false };
      const k = /^(half|halve)/.test(low) ? 0.5 : 2, x = items[i];
      items[i] = touch(resize(x, x.food ? x.grams * k : (x.n ?? 1) * k, FOODS)); did.push(`${x.name} ${k === 2 ? '× 2' : '½'}`); continue;
    }
    if ((m = /^(?:add|also|plus|and|with|i also had|also had|i had|add in) (.+?)(?: too| as well)?$/.exec(low))) {
      const got = parseMeal(m[1], FOODS);
      if (!got.items.length || got.unread.length) return { ok: false };
      for (const x of got.items) { items.push(touch(x)); did.push(`+ ${x.name}`); }
      continue;
    }
    // "make the rice half a cup", "change rice to 200 g", "the rice was half a cup", "3 eggs not 2".
    let name = null, amount = null;
    if ((m = /^(?:make|change|set) (.+?) (?:to |into |be )?((?:\d|½|¼|¾|a |an |one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|couple|few)[^]*)$/.exec(low))) [, name, amount] = m;
    else if ((m = /^(.+?) (?:was|were|is|should be) ((?:\d|½|¼|¾|a |an |one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|couple|few)[^]*)$/.exec(low))) [, name, amount] = m;
    else if (AMOUNT.test(low)) { amount = low.replace(/\s+not\s+.*$/, ''); }
    if (amount != null) {
      amount = amount.replace(/\s+(?:not|instead of)\s+.*$/, '').trim();
      const i = name ? findItem(items, name, tools) : -1;
      // "3 eggs" alone: the food it names. "make the rice half a cup": that food at that amount.
      const tryP = parsePart(name && !parsePart(amount, FOODS) ? `${amount} ${norm(name)}` : amount, FOODS);
      const j = i >= 0 ? i : tryP ? items.findIndex((x) => x.food === tryP.food) : -1;
      if (j < 0) return { ok: false };
      const x = items[j];
      if (tryP && x.food && tryP.food === x.food && !tryP.guess) { items[j] = touch({ ...tryP, name: x.name }); did.push(`${x.name} → ${tryP.amount}`); continue; }
      // A dish without a known food: "make the burrito 2" → servings.
      const n = parseFloat(amount);
      if (!x.food && n > 0 && !/[a-z]{2,}/.test(amount.replace(/\b(servings?|portions?)\b/, ''))) { items[j] = touch(resize(x, n, FOODS)); did.push(`${x.name} → ${n}`); continue; }
      return { ok: false };
    }
    return { ok: false };
  }
  return { ok: true, draft: { ...draft, meal, items }, changed: items.map((x, i) => (touched.has(x) ? i : -1)).filter((i) => i >= 0), did };
}
// The current draft in words, for the AI with your correction (the draft, not the first words).
export const mealDraftText = (draft, said) => `I had: ${draft.items.map((x) => `${x.amount ? `${x.amount} ` : ''}${x.name}`).join(', ')}. Change: ${String(said || '').trim()}`.slice(0, 600);

// ---------- workout corrections, on the phone ----------
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
const numOf = (s) => (s == null ? null : NUMW[s] ?? (Number.isFinite(+s) ? +s : null));
const N = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)';
function findEx(w, name) {
  const q = words(name);
  if (!q.length) return null;
  let best = null, score = 0;
  w.blocks.forEach((b, bi) => b.items.forEach((it, ii) => {
    const n = words(it.name);
    const s = q.filter((y) => n.includes(y) || n.some((z) => z.startsWith(y) || y.startsWith(z))).length;
    if (s > score) { best = { bi, ii }; score = s; }
  }));
  return best;
}
const allSets = (w, fn, where = null) => {
  let c = w;
  c.blocks.forEach((b, bi) => b.items.forEach((it, ii) => { if (where && (where.bi !== bi || where.ii !== ii)) return; it.sets.forEach((_, si) => { c = editSet(c, bi, ii, si, fn()); }); }));
  return c;
};
/**
 * The draft workout changed by what you said → { ok, workout, changed: [item ids], did }.
 * Sets, reps, weight, rounds, add (read with parseWorkout), remove, and superset two exercises.
 */
export function amendWorkout(workout, said, { parseWorkout, needsHelp, today = '' }) {
  let w = normalize(workout);
  const touched = new Set(), did = [];
  const mark = (bi, ii) => touched.add(w.blocks[bi]?.items[ii]?.id);
  const markAll = () => w.blocks.forEach((b, bi) => b.items.forEach((_, ii) => mark(bi, ii)));
  for (const c of clauses(said)) {
    const low = clean(c);
    let m;
    // Superset two: "superset the curls and the dips", "superset curls with dips".
    if ((m = /^(?:make |do )?(?:a )?superset (?:of )?(.+?) (?:and|with) (.+)$/.exec(low)) || (m = /^(?:put |pair )?(.+?) (?:and|with) (.+?) (?:together )?(?:as a|in a) superset$/.exec(low))) {
      const a = findEx(w, m[1]), b = findEx(w, m[2]);
      if (!a || !b || a.bi === b.bi) return { ok: false };
      const ia = w.blocks[a.bi].items[a.ii], ib = w.blocks[b.bi].items[b.ii];
      const rounds = Math.max(ia.sets.length, ib.sets.length);
      const merged = makeBlock({ kind: 'superset', rounds, items: [ia, ib] });
      const first = Math.min(a.bi, b.bi), other = Math.max(a.bi, b.bi);
      const blocks = w.blocks.slice();
      blocks[first] = merged;
      blocks[other] = { ...blocks[other], items: blocks[other].items.filter((x) => x.id !== (other === a.bi ? ia.id : ib.id)) };
      w = normalize({ ...w, blocks: blocks.filter((x) => x.items.length) });
      touched.add(ia.id); touched.add(ib.id); did.push(`${ia.name} + ${ib.name} superset`); continue;
    }
    if ((m = /^(?:remove|delete|drop|skip|take out|no|without|get rid of) (.+)$/.exec(low))) {
      const f = findEx(w, m[1]);
      if (!f) return { ok: false };
      const it = w.blocks[f.bi].items[f.ii];
      const blocks = w.blocks.map((b, bi) => (bi === f.bi ? { ...b, kind: undefined, items: b.items.filter((_, ii) => ii !== f.ii) } : b)).filter((b) => b.items.length);
      w = normalize({ ...w, blocks }); did.push(`− ${it.name}`); continue;
    }
    if ((m = /^(?:add|also|plus|and) (.+)$/.exec(low))) {
      const got = parseWorkout(m[1], { today });
      if (needsHelp(got)) return { ok: false };
      w = normalize({ ...w, blocks: [...w.blocks, ...got.workout.blocks] });
      for (const b of got.workout.blocks) for (const it of b.items) { touched.add(it.id); did.push(`+ ${it.name}`); }
      continue;
    }
    // "make it 4 sets" / "4 rounds" / "10 reps" / "at 135" — for everything, or "squats 4 sets of 8 at 135".
    const target = low.replace(/^(?:make|change|set|do)\s+/, '').replace(/^(?:it|everything|all of them|them|all)\s+(?:to\s+)?/, '');
    const sets = new RegExp(`\\b${N}\\s*(?:sets|set|x)\\b(?:\\s*of\\s*${N})?`).exec(target);
    const rounds = new RegExp(`\\b${N}\\s*rounds?\\b`).exec(target);
    const reps = new RegExp(`\\b${N}\\s*reps?\\b`).exec(target);
    const counts = target.replace(new RegExp(`\\b${N}\\s*(?:sets|set|x|rounds?|reps?)\\b(?:\\s*of\\s*${N})?`, 'g'), ' ');
    // A weight: "at 135", "135 lb", or one bare number of 20 or more once the counts are taken out ("make the bench 145").
    let weight = /(?:@|\bat\b|\bwith\b)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?)?|\b(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?)\b/.exec(counts);
    if (!weight) { const bare = counts.match(/\b\d+(?:\.\d+)?\b/g); if (bare?.length === 1 && +bare[0] >= 20) weight = [bare[0], null, null, bare[0], null]; }
    if (!sets && !rounds && !reps && !weight) return { ok: false };
    const name = counts.replace(/(?:@|\bat\b|\bwith\b)\s*\d+(?:\.\d+)?\s*(?:lbs?|pounds?|kgs?|kilos?)?|\b\d+(?:\.\d+)?\s*(?:lbs?|pounds?|kgs?|kilos?)?\b/g, ' ').replace(/\b(to|of|for|the|each|per|instead|should be|be)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const where = name ? findEx(w, name) : null;
    if (name && !where) return { ok: false };
    const nSets = numOf(sets?.[1]), nOf = numOf(sets?.[2]), nRounds = numOf(rounds?.[1]), nReps = numOf(reps?.[1]) ?? nOf;
    if (nSets || nRounds) {
      const n = nSets || nRounds;
      if (where) { w = setRounds(w, where.bi, n); w.blocks[where.bi].items.forEach((_, ii) => mark(where.bi, ii)); } else {
        // "4 rounds" changes the supersets and circuits; "4 sets" changes everything.
        w.blocks.forEach((b, bi) => { if (nSets || b.items.length > 1 || w.blocks.every((x) => x.items.length === 1)) { w = setRounds(w, bi, n); b.items.forEach((_, ii) => mark(bi, ii)); } });
      }
      did.push(`${where ? `${w.blocks[where.bi].items[where.ii].name}: ` : ''}${n} ${nRounds && !nSets ? 'rounds' : 'sets'}`);
    }
    if (nReps) { w = allSets(w, () => ({ reps: nReps }), where); if (where) mark(where.bi, where.ii); else markAll(); did.push(`${nReps} reps`); }
    if (weight) {
      // A weight for "everything" only when there's just one exercise; otherwise name it.
      const all = w.blocks.flatMap((b) => b.items);
      if (!where && all.length !== 1) return { ok: false };
      const v = +(weight[1] || weight[3]), u = /^k/.test(weight[2] || weight[4] || '') ? 'kg' : 'lb';
      w = allSets(w, () => ({ weight: v, unit: u, bw: false }), where || { bi: w.blocks.findIndex((b) => b.items.length), ii: 0 });
      if (where) mark(where.bi, where.ii); else markAll();
      did.push(`${v} ${u}`);
    }
  }
  const changed = w.blocks.flatMap((b) => b.items).filter((it) => touched.has(it.id)).map((it) => it.id);
  return { ok: true, workout: w, changed, did };
}
// The current draft in words for the AI, with the correction.
export function workoutDraftText(w, said) {
  const set = (s) => `${s.reps ?? '?'}${s.time ? ` ${s.time}s` : ''}${s.weight != null ? ` @ ${s.weight} ${s.unit}` : s.bw ? ' bodyweight' : ''}`;
  const lines = w.blocks.map((b) => (b.items.length > 1 ? `${b.rounds} rounds: ${b.items.map((it) => `${it.name} ${set(it.sets[0] || {})}`).join(' superset with ')}` : `${b.items[0].name} ${b.items[0].sets.length}x${set(b.items[0].sets[0] || {})}`));
  return `${lines.join('; ')}. Change: ${String(said || '').trim()}`.slice(0, 1500);
}
