// 🏋️ Checkpoint C — one workout model for every real workout: straight sets, supersets, circuits,
// rounds, different reps or weights per set, bodyweight, timed and cardio — and nothing invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, makeBlock, uncertain, problems, setRounds, editSet, renameItem, logSet, unlogSet, complete, repeatOf, summary, describe, itemText, fromLiftSession, fromDeviceWorkout } from '../js/workout.js';
import * as W from '../js/workout.js';

const reps = (...r) => r.map((n) => ({ reps: n }));

test('a conventional strength workout: straight sets, a different weight on each set', () => {
  const w = normalize({ title: 'Lower', blocks: [
    { items: [{ name: 'Squat', sets: [{ reps: 5, weight: 165 }, { reps: 5, weight: 175 }, { reps: 5, weight: 185 }] }] },
    { items: [{ name: 'Romanian deadlift', sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 8, weight: 135 }] }] },
  ] });
  assert.equal(w.blocks[0].kind, 'straight'); assert.equal(w.blocks[0].rounds, 3);
  assert.deepEqual(w.blocks[0].items[0].sets.map((s) => s.weight), [165, 175, 185]);
  assert.equal(itemText(w.blocks[0].items[0]), 'Squat 5 / 5 / 5 @ 165 / 175 / 185 lb');
  assert.equal(itemText(w.blocks[1].items[0]), 'Romanian deadlift 8 / 8 / 8 @ 135 lb');
  assert.deepEqual(uncertain(w), []); assert.deepEqual(problems(w), []);
});

test('the 4-round circuit and the 3-round superset, rep for rep', () => {
  const w = normalize({ blocks: [
    { rounds: 4, items: [
      { name: 'Overhead Press', sets: reps(12, 12, 11, 11) }, { name: 'Bent-over Row', sets: reps(12, 13, 14, 13) },
      { name: 'Squat', sets: reps(10, 11, 11, 11) }, { name: 'Chest Press', sets: reps(12, 11, 11, 11) }, { name: 'Bicycle Crunch', sets: reps(26, 24, 22, 24).map((s) => ({ ...s, bw: true })) },
    ] },
    { rounds: 3, items: [
      { name: 'Alternating Reverse Lunge', sets: reps(14, 14, 14).map((s) => ({ ...s, weight: 40 })) },
      { name: 'Lateral Raise', sets: reps(11, 12, 9).map((s) => ({ ...s, weight: 20 })) },
    ] },
  ] });
  const [a, b] = w.blocks;
  assert.deepEqual([a.kind, a.rounds, a.items.length], ['circuit', 4, 5]);
  assert.deepEqual(a.items.map((it) => it.sets.map((s) => s.reps)), [[12, 12, 11, 11], [12, 13, 14, 13], [10, 11, 11, 11], [12, 11, 11, 11], [26, 24, 22, 24]]);
  assert.deepEqual([b.kind, b.rounds], ['superset', 3]);
  assert.deepEqual(b.items.map((it) => it.sets.map((s) => [s.reps, s.weight])), [[[14, 40], [14, 40], [14, 40]], [[11, 20], [12, 20], [9, 20]]]);
  assert.deepEqual(describe(w), [
    '4 rounds (circuit): Overhead Press 12 / 12 / 11 / 11 · Bent-over Row 12 / 13 / 14 / 13 · Squat 10 / 11 / 11 / 11 · Chest Press 12 / 11 / 11 / 11 · Bicycle Crunch 26 / 24 / 22 / 24 @ bodyweight',
    '3 rounds (superset): Alternating Reverse Lunge 14 / 14 / 14 @ 40 lb · Lateral Raise 11 / 12 / 9 @ 20 lb',
  ]);
});

test('supersets with their own weights, bodyweight, timed and cardio', () => {
  const w = normalize({ blocks: [
    { rounds: 3, items: [{ name: 'Squat', sets: Array(3).fill({ reps: 8, weight: 165 }) }, { name: 'RDL', sets: Array(3).fill({ reps: 10, weight: 55 }) }] },
    { rounds: 3, items: [{ name: 'Push-up', sets: Array(3).fill({ reps: 15, bw: true }) }, { name: 'Plank', sets: Array(3).fill({ time: 45 }) }] },
    { items: [{ name: 'Row erg', sets: [{ distance: 500, distUnit: 'm', time: 110 }] }] },
  ], activity: { kind: 'Run', minutes: 30, distance: 3.1, distUnit: 'mi' } });
  assert.equal(itemText(w.blocks[0].items[1]), 'RDL 10 / 10 / 10 @ 55 lb');
  assert.equal(itemText(w.blocks[1].items[0]), 'Push-up 15 / 15 / 15 @ bodyweight');
  assert.equal(itemText(w.blocks[1].items[1]), 'Plank 45s / 45s / 45s');
  assert.equal(itemText(w.blocks[2].items[0]), 'Row erg 1:50 · 500 m');
  assert.deepEqual(w.activity, { kind: 'Run', minutes: 30, distance: 3.1, distUnit: 'mi', kcal: null });
  assert.equal(normalize({ blocks: [{ kind: 'circuit', rounds: 2, items: [{ name: 'A', sets: reps(1, 1) }, { name: 'B', sets: reps(1, 1) }] }] }).blocks[0].kind, 'circuit', 'a two-exercise circuit stays a circuit');
});

test('nothing is invented: missing values stay empty and marked; problems block saving', () => {
  const w = normalize({ blocks: [{ items: [{ name: 'Lunge', sets: reps(12, 12) }, { name: '', sets: reps(10) }] }] });
  const b = w.blocks[0];
  assert.equal(b.rounds, 2);
  assert.ok(b.uncertain.includes('rounds'), 'a superset without a stated round count is unsure');
  assert.equal(b.items[1].sets[1].reps, null, 'a missing set is blank, not copied');
  assert.deepEqual(b.items[1].sets[1].uncertain, ['reps']);
  assert.deepEqual(uncertain(w).map((u) => u.field).sort(), ['name', 'reps', 'rounds']);
  assert.equal(problems(w).length, 1);
  assert.equal(b.items[0].sets[0].weight, null, 'no weight given: none');
  // Garbage in: clamped or dropped, never a crash.
  const g = normalize({ blocks: [{ items: [{ name: 'X'.repeat(500), sets: [{ reps: -3, weight: 'heavy', unit: 'stone' }] }] }], status: 'hacked' });
  assert.deepEqual([g.blocks[0].items[0].name.length, g.blocks[0].items[0].sets[0].reps, g.blocks[0].items[0].sets[0].weight, g.blocks[0].items[0].sets[0].unit, g.status], [80, null, null, 'lb', 'planned']);
});

test('editing settles what was unsure; rounds can grow; logging, completing, repeating', () => {
  let w = normalize({ blocks: [{ items: [{ name: '', sets: reps(10) }, { name: 'Row', sets: reps(12) }] }] });
  w = renameItem(w, 0, 0, 'Lunge');
  w = setRounds(w, 0, 3);
  assert.deepEqual(w.blocks[0].items[1].sets.map((s) => s.reps), [12, 12, 12]);
  assert.equal(w.blocks[0].uncertain, undefined);
  w = editSet(w, 0, 0, 0, { weight: 40 });
  assert.equal(uncertain(w).length, 0);
  w = logSet(w, 0, 0, 0, { reps: 9 });
  assert.equal(w.status, 'active');
  assert.deepEqual(w.blocks[0].items[0].sets[0].got, { reps: 9, weight: 40, time: null, distance: null });
  w = logSet(w, 0, 1, 0);
  w = unlogSet(w, 0, 1, 0);
  assert.equal(w.blocks[0].items[1].sets[0].done, false);
  w = logSet(w, 0, 1, 0, { weight: 50 });
  const s = summary(w);
  assert.deepEqual([s.exercises, s.sets, s.done, s.volume], [2, 6, 2, 9 * 40 + 12 * 50]);
  w = complete(w, 1000);
  assert.equal(w.status, 'done');
  const again = repeatOf(w, '2026-11-01');
  assert.equal(again.status, 'planned'); assert.equal(again.date, '2026-11-01'); assert.notEqual(again.id, w.id);
  assert.equal(again.blocks[0].items[0].sets[0].reps, 9, 'what you actually did becomes the next target');
  assert.ok(again.blocks.every((b) => b.items.every((it) => it.sets.every((x) => !x.done && !x.got))));
});

test('older records read as workouts, untouched', () => {
  const old = { date: '2026-09-01', block: 1, week: 2, day: 1, entries: [{ slot: 's1', exercise: 'backSquat', sets: [{ w: 185, r: 5 }, { w: 185, r: 5 }] }, { slot: 's2', exercise: 'pullup', sets: [{ w: 0, r: 8, bw: true }] }] };
  const copy = JSON.stringify(old);
  const w = fromLiftSession(old, { backSquat: 'Back squat', pullup: 'Pull-up' });
  assert.equal(JSON.stringify(old), copy, 'not modified');
  assert.deepEqual(describe(w), ['Back squat 5 / 5 @ 185 lb', 'Pull-up 8 @ bodyweight']);
  assert.equal(w.status, 'done');
  const d = fromDeviceWorkout({ id: 'whoop:1', name: 'Running', start: '2026-10-20T07:00:00Z', minutes: 32, kcal: 350 });
  assert.deepEqual([d.title, d.date, d.activity.minutes, d.blocks.length], ['Running', '2026-10-20', 32, 0]);
  assert.equal(makeBlock({ items: [] }).items.length, 0);
});

test("server: Today's Workout and history are yours to write, readable with Fitness sharing, never overwritten by an older copy", async () => {
  const { familyApi, TERMS_VERSION } = await import('../server/family.js');
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const P = `/families/${family.fid}/members/${add.member.id}/workouts`;
  const w = normalize({ title: 'Legs', blocks: [{ items: [{ name: 'Squat', sets: [{ reps: 5, weight: 185 }] }] }] });
  const r1 = await call(`${P}/today`, pat, 'PUT', { data: { today: w, templates: [] }, base: 0 });
  assert.equal(r1.ok, true);
  assert.equal((await call(`${P}/today`, sam, 'PUT', { data: {} })).status, 403, 'nobody writes yours');
  assert.equal((await call(`${P}/today`, sam)).status, 403, 'private until Fitness is shared');
  await call(`/families/${family.fid}/members/${add.member.id}`, pat, 'PATCH', { share: { diet: [], fitness: [family.members[0].id] } });
  assert.equal((await call(`${P}/today`, sam)).data.today.title, 'Legs');
  // An older copy (another phone that hadn't seen the last save) is refused, not merged blindly.
  assert.equal((await call(`${P}/today`, pat, 'PUT', { data: { today: null }, base: r1.savedAt - 1 })).status, 409);
  assert.equal((await call(`${P}/log`, pat, 'PUT', { data: { log: [w] }, base: 0 })).ok, true);
  await call(`/families/${family.fid}/leave`, pat, 'POST');
  assert.ok(![...m.keys()].some((k) => k.includes(`workouts:${family.fid}:${add.member.id}`)), 'leaving deletes them');
});

// ---------- H5 / H8 / H9: per side, progress, time, names, what counts as Fitness ----------
test('per-side exercises keep the flag and say so', () => {
  const w = W.normalize({ blocks: [{ items: [{ name: 'Walking lunge', perSide: true, sets: [{ reps: 10 }, { reps: 10 }] }] }] });
  assert.equal(w.blocks[0].items[0].perSide, true);
  assert.match(W.describe(w)[0], /10 \/ 10 each side/);
  assert.equal(W.normalize({ blocks: [{ items: [{ name: 'Row', sets: [{ reps: 8 }] }] }] }).blocks[0].items[0].perSide, undefined);
});

test('progress counts finished exercises and finds the next set, round by round', () => {
  let w = W.normalize({ blocks: [{ rounds: 2, items: [{ name: 'Press', sets: [{ reps: 8 }, { reps: 8 }] }, { name: 'Row', sets: [{ reps: 8 }, { reps: 8 }] }] }, { items: [{ name: 'Curl', sets: [{ reps: 12 }] }] }] });
  assert.deepEqual(W.progress(w), { exercises: 3, exDone: 0, next: { bi: 0, ii: 0, si: 0 } });
  w = W.logSet(w, 0, 0, 0); w = W.logSet(w, 0, 1, 0);
  assert.deepEqual(W.progress(w).next, { bi: 0, ii: 0, si: 1 });
  w = W.logSet(w, 0, 0, 1); w = W.logSet(w, 0, 1, 1, { reps: 6, weight: 95 });
  const p = W.progress(w);
  assert.equal(p.exDone, 2);
  assert.deepEqual(p.next, { bi: 1, ii: 0, si: 0 });
  // Planned and actual both kept.
  assert.equal(w.blocks[0].items[1].sets[1].reps, 8);
  assert.deepEqual(w.blocks[0].items[1].sets[1].got, { reps: 6, weight: 95, time: null, distance: null });
});

test('estimated minutes', () => {
  assert.equal(W.estMinutes(W.normalize({ blocks: [] })), null);
  const straight = W.normalize({ blocks: [{ rounds: 3, rest: 120, items: [{ name: 'Squat', sets: [{ reps: 5 }] }] }] });
  assert.equal(W.estMinutes(straight), 10);
  assert.ok(W.estMinutes(W.normalize({ blocks: Array.from({ length: 7 }, () => ({ rounds: 3, items: [{ name: 'Press', sets: [{ reps: 8 }] }] })) })) >= 40);
});

test('suggested names', () => {
  const n = (blocks) => W.suggestName(W.normalize({ blocks }));
  assert.equal(n([{ rounds: 4, items: [{ name: 'Overhead press', sets: [{}] }, { name: 'Bent-over row', sets: [{}] }, { name: 'Push-ups', sets: [{}] }] }]), 'Upper body circuit · 4 rounds');
  assert.equal(n([{ items: [{ name: 'Back squat', sets: [{}] }] }, { items: [{ name: 'Romanian deadlift', sets: [{}] }] }, { items: [{ name: 'Calf raise', sets: [{}] }] }]), 'Lower body · 3 exercises');
  assert.equal(n([{ items: [{ name: 'Bench press', sets: [{}] }] }, { items: [{ name: 'Leg press', sets: [{}] }] }]), 'Full body · 2 exercises');
  assert.equal(n([{ rounds: 3, items: [{ name: 'Curl', sets: [{}] }, { name: 'Tricep pushdown', sets: [{}] }] }]), 'Upper body superset · 3 rounds');
  assert.equal(n([{ items: [{ name: 'goblet squat', sets: [{}] }] }]), 'Goblet squat');
  assert.equal(n([{ items: [{ name: 'Plank', sets: [{}] }] }, { items: [{ name: 'Dead bug', sets: [{}] }] }]), 'Core · 2 exercises');
  assert.equal(n([{ items: [{ name: 'Zercher thing', sets: [{}] }] }, { items: [{ name: 'Odd lift', sets: [{}] }] }]), 'Strength · 2 exercises');
  assert.equal(n([]), 'Workout');
  assert.ok(W.untitled('Workout') && W.untitled('') && !W.untitled('Upper body circuit'));
});

test('Fitness is strength and circuit work; other device activity is not', () => {
  assert.equal(W.isStrength(W.normalize({ blocks: [{ items: [{ name: 'Run', sets: [{ distance: 1 }] }] }] })), true);
  for (const k of ['Weightlifting', 'Functional fitness', 'Powerlifting', 'HIIT', 'Strength trainer', 'Crossfit']) assert.equal(W.isStrength(W.fromDeviceWorkout({ id: k, name: k, start: '2026-10-01T10:00:00Z', minutes: 40 })), true, k);
  for (const k of ['Running', 'Cycling', 'Rock climbing', 'Yoga', 'Walking', 'Swimming']) assert.equal(W.isStrength(W.fromDeviceWorkout({ id: k, name: k, start: '2026-10-01T10:00:00Z', minutes: 40 })), false, k);
});

test('a program workout keeps its program day and exercise ids', () => {
  const w = W.normalize({ source: 'program', program: { block: 2, day: 'B', week: 3 }, blocks: [{ items: [{ name: 'Overhead press', ref: 'ohp', sets: [{ reps: 10, weight: 65 }] }] }] });
  assert.deepEqual(w.program, { block: 2, day: 'B', week: 3 });
  assert.equal(w.blocks[0].items[0].ref, 'ohp');
  assert.equal(W.normalize({ program: { day: 'lowercase' } }).program, undefined);
});

test('✓ All sets and "log remaining sets as planned": the plan is recorded as done, marked as planned, undo-able', async () => {
  const W = await import('../js/workout.js');
  let w = W.normalize({ title: 'Lower body', blocks: [{ items: [{ name: 'Leg curl', sets: [{ reps: 10, weight: 90 }, { reps: 10, weight: 90 }, { reps: 10, weight: 90 }] }] }, { items: [{ name: 'Bulgarian split squat', sets: [{ reps: 8, weight: 40 }, { reps: 8, weight: 40 }] }] }] });
  w = W.logSet(w, 0, 0, 0, { reps: 9 });
  assert.equal(W.remaining(w).length, 4);
  const one = W.logAll(w, 0, 0);
  assert.deepEqual(one.blocks[0].items[0].sets.map((s) => [s.done, s.asPlanned || false, s.got.reps]), [[true, false, 9], [true, true, 10], [true, true, 10]], 'what you typed stays; the rest as planned');
  const all = W.logRemaining(w);
  assert.equal(W.remaining(all).length, 0);
  assert.equal(W.summary(all).done, 5);
  assert.equal(W.normalize(all).blocks[1].items[0].sets[0].asPlanned, true, 'kept when saved and loaded');
  assert.equal(W.unlogSet(all, 1, 0, 0).blocks[1].items[0].sets[0].asPlanned, undefined);
});

test('last time: the most recent finished workout with the same exercise, in one short line', async () => {
  const W = await import('../js/workout.js');
  const done = (id, date, sets) => W.normalize({ id, date, status: 'done', title: 't', blocks: [{ items: [{ name: 'Bench press', sets: sets.map(([r, wt]) => ({ reps: r, weight: wt, done: true, got: { reps: r, weight: wt } })) }] }] });
  const hist = [done('b', '2026-10-28', [[10, 135], [10, 135], [8, 135]]), done('a', '2026-10-21', [[10, 130], [10, 130], [10, 130]])];
  const l = W.lastTime(hist, 'bench  Press');
  assert.equal(l.date, '2026-10-28');
  assert.equal(W.lastText(l), '135 × 10, 135 × 10, 135 × 8');
  assert.equal(W.lastText(W.lastTime(hist, 'Bench press', 'b')), '130 × 10 ×3', 'not the workout itself');
  assert.equal(W.lastTime(hist, 'Squat'), null);
});

test('progression: only when every planned set was done at the planned weight and reps — and never from "as planned" ticks', async () => {
  const W = await import('../js/workout.js');
  const mk = (name, sets, extra = {}) => W.normalize({ blocks: [{ items: [{ name, sets: sets.map(([r, wt, gr]) => ({ reps: r, weight: wt, done: true, got: { reps: gr ?? r, weight: wt }, ...extra })) }] }] });
  assert.deepEqual(W.progression(mk('Bench press', [[10, 135], [10, 135], [10, 135]])).map((p) => [p.from, p.to]), [[135, 140]]);
  assert.deepEqual(W.progression(mk('Romanian deadlift', [[8, 185], [8, 185], [8, 185]])).map((p) => p.to), [195], 'lower-body compound: +10');
  assert.deepEqual(W.progression(mk('Bench press', [[10, 135], [10, 135], [10, 135, 8]])), [], 'a set short: no');
  assert.deepEqual(W.progression(mk('Bench press', [[10, 135], [10, 135]], { asPlanned: true })), [], 'ticked as planned: no evidence');
  assert.deepEqual(W.progression(mk('Push-ups', [[15, null]])), []);
});

// 🪶 Health 2 Phase B: a today-only variant, previewed before anything changes.
const upper = () => normalize({ id: 'u1', title: 'Upper Body', date: '2026-10-30', blocks: [
  { items: [{ name: 'Bench Press', sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 8, weight: 135 }] }] },
  { items: [{ name: 'Rows', sets: [{ reps: 10, weight: 60 }, { reps: 10, weight: 60 }, { reps: 10, weight: 60 }] }] },
  { kind: 'superset', rounds: 4, items: [{ name: 'Curls', sets: [{ reps: 12 }] }, { name: 'Dips', sets: [{ reps: 10, bw: true }] }] },
  { items: [{ name: 'Plank', sets: [{ time: 45 }] }] },
] });

test('lighter: a third fewer sets (at least one fewer, never below one), weights kept, original untouched', () => {
  const w = upper(), before = JSON.stringify(w);
  const v = W.proposeVariant(w, 'lighter');
  assert.equal(JSON.stringify(w), before, 'the original is never changed');
  assert.deepEqual(v.changes.map(W.changeText), ['Bench Press 3 sets → 2', 'Rows 3 sets → 2', 'Curls + Dips 4 rounds → 3']);
  assert.deepEqual(v.workout.blocks.map((b) => b.rounds), [2, 2, 3, 1]);
  assert.ok(v.workout.blocks.every((b) => b.items.every((it) => it.sets.length === b.rounds)));
  assert.equal(v.workout.blocks[0].items[0].sets[1].weight, 135);
  assert.equal(v.workout.id, w.id, 'still today\'s workout');
  assert.ok(v.minutes.to < v.minutes.from);
  assert.equal(W.proposeVariant(normalize(v.workout), 'lighter').workout.blocks[0].rounds, 1);
});

test('lighter never removes a ticked set; nothing to change → null; unknown intent or a finished workout → null', () => {
  let w = upper();
  w = logSet(w, 0, 0, 0); w = logSet(w, 0, 0, 1); w = logSet(w, 0, 0, 2);
  w = logSet(w, 1, 0, 0); w = logSet(w, 1, 0, 1);
  const v = W.proposeVariant(w, 'lighter');
  assert.deepEqual(v.workout.blocks.map((b) => b.rounds), [3, 2, 3, 1]);
  assert.ok(!v.changes.some((c) => c.name === 'Bench Press'));
  assert.equal(W.proposeVariant(normalize({ blocks: [{ items: [{ name: 'Plank', sets: [{ time: 60 }] }] }] }), 'lighter'), null);
  assert.equal(W.proposeVariant(upper(), 'express'), null);
  assert.equal(W.proposeVariant(complete(upper()), 'lighter'), null);
  const run = W.proposeVariant(normalize({ activity: { kind: 'Run', minutes: 45 } }), 'lighter');
  assert.equal(W.changeText(run.changes[0]), 'Run 45 minutes → 30');
});

test('shorter: leaves out the last unstarted parts until it takes about two thirds of the time', () => {
  const w = upper(), v = W.proposeVariant(w, 'shorter');
  assert.ok(v.workout.blocks.length < w.blocks.length && v.workout.blocks.length >= 1);
  assert.ok(v.minutes.to <= Math.ceil(v.minutes.from * (2 / 3)) + 5);
  assert.ok(v.changes.every((c) => c.what === 'part'));
  assert.match(W.changeText(v.changes.at(-1)), /^Plank left out$/);
  let started = upper(); started = logSet(started, 3, 0, 0);
  assert.equal(W.proposeVariant(started, 'shorter'), null, 'a part you started stays');
});

test('duration: the middle of your recent finished times for the same workout, else the estimate', () => {
  const w = upper(), at = (m) => ({ startedAt: 1e12, doneAt: 1e12 + m * 60000 });
  const done = (m, title = 'Upper body') => ({ ...complete(normalize({ title })), ...at(m), status: 'done' });
  assert.equal(W.durationFor(w, []).from, 'estimate');
  assert.equal(W.durationFor(w, []).minutes, W.estMinutes(w));
  assert.equal(W.durationFor(w, [done(40)]).from, 'estimate', 'one time is not enough');
  assert.deepEqual(W.durationFor(w, [done(40), done(55), done(48), done(1), done(70, 'Legs')]), { minutes: 48, from: 'history' });
  assert.deepEqual(W.durationFor(normalize({ activity: { kind: 'Run', minutes: 30 } }), []), { minutes: 30, from: 'plan' });
});

test('undo a variant: the original plan back, with every set ticked since', () => {
  const w = upper(), v = W.proposeVariant(w, 'lighter').workout;
  let cur = logSet({ ...v, status: 'active', startedAt: 5 }, 0, 0, 0); cur = logSet(cur, 0, 0, 1);
  const back = W.undoVariant(w, cur);
  assert.deepEqual(back.blocks.map((b) => b.rounds), [3, 3, 4, 1]);
  assert.deepEqual(back.blocks[0].items[0].sets.map((x) => x.done), [true, true, false]);
  assert.equal(back.status, 'active'); assert.equal(back.startedAt, 5);
  const sh = W.proposeVariant(w, 'shorter').workout;
  assert.equal(W.undoVariant(w, sh).blocks.length, 4);
});
