import test from 'node:test';
import assert from 'node:assert/strict';
import { programOn, programNext, programWorkout, toLiftSession, programSessions } from '../js/programWorkout.js';
import * as W from '../js/workout.js';
import { DAYS } from '../js/lifting.js';

test('no program until you have used it or chose it', () => {
  assert.equal(programOn(undefined), false);
  assert.equal(programOn({}), false);
  assert.equal(programOn({ on: true }), true);
  assert.equal(programOn({ sessions: [{ date: '2026-10-01', block: 1, week: 1, day: 'A', entries: [] }] }), true);
});

test('the next program day becomes an ordinary workout', () => {
  const w = programWorkout({ on: true }, [], { date: '2026-10-29' });
  assert.equal(w.source, 'program');
  assert.deepEqual(w.program, { block: 1, day: 'A', week: 1 });
  assert.equal(w.blocks.length, DAYS.A.slots.length);
  assert.ok(w.blocks.every((b) => b.kind === 'straight' && b.items.length === 1 && b.items[0].ref));
  assert.equal(w.blocks[0].items[0].name, 'Barbell back squat');
  assert.equal(w.blocks[0].rounds, 3);
  assert.equal(w.blocks[0].rest, 180);
  assert.match(w.blocks[0].note, /4–6 reps/);
  assert.deepEqual(W.problems(w), []);
  // Round-trips through the model unchanged.
  assert.deepEqual(W.normalize(JSON.parse(JSON.stringify(w))), w);
});

test('a finished program workout moves the program on and sets next time\'s load', () => {
  let w = programWorkout({ on: true }, [], { date: '2026-10-27' });
  // Every squat set at 185 × 6 (the top of 4–6): next time adds weight.
  for (let si = 0; si < w.blocks[0].rounds; si++) w = W.logSet(w, 0, 0, si, { reps: 6, weight: 185 });
  const done = W.complete(w);
  const s = toLiftSession(done);
  assert.equal(s.day, 'A');
  assert.equal(s.entries.length, 1);
  assert.deepEqual(s.entries[0].sets[0], { w: 185, r: 6 });
  assert.equal(programNext({ on: true }, [done]).day, 'B');
  // Three days later (A, B, C) the next A uses the logged squat.
  const b = W.complete(programWorkout({ on: true }, [done], { date: '2026-10-28' }));
  const c = W.complete(programWorkout({ on: true }, [b, done], { date: '2026-10-29' }));
  const next = programWorkout({ on: true }, [c, b, done], { date: '2026-10-31' });
  assert.equal(next.program.day, 'A');
  assert.equal(next.program.week, 2);
  assert.equal(next.blocks[0].items[0].sets[0].weight, 195);
});

test('older sessions from the trackers still count', () => {
  const lift = { sessions: [{ date: '2026-10-01', block: 1, week: 1, day: 'A', entries: [{ exercise: 'backSquat', sets: [{ w: 135, r: 5 }] }] }] };
  assert.equal(programNext(lift, []).day, 'B');
  assert.equal(programSessions(lift, []).length, 1);
});

test('your exercise swaps and kept extras are used', () => {
  const w = programWorkout({ on: true, choices: { A1: 'legPress' } }, [], {});
  assert.equal(w.blocks[0].items[0].name, 'Leg press');
});

test('bodyweight moves are bodyweight sets', () => {
  const w = programWorkout({ on: true }, [], { day: 'B' });
  const pull = w.blocks.find((b) => b.items[0].ref === 'pullUp');
  assert.ok(pull.items[0].sets.every((s) => s.bw && s.weight == null));
});
