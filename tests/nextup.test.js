// ✨ Next up: the right thing at the right time, and learning from what you do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, learn } from '../js/nextup.js';

// A Tuesday, 2 PM local; hourly weather for the next 30 hours.
const now = new Date(2026, 9, 27, 14, 0);
const hours = Array.from({ length: 30 }, (_, i) => {
  const time = new Date(now.getTime() + (i + 1) * 3600e3), hr = time.getHours();
  return { time, temp: 64, feels: hr >= 17 && hr <= 19 ? 60 : 74, rain: 0, wind: 4, gust: 6, uv: hr < 17 ? 4 : 0, aqi: 30, isDay: hr >= 7 && hr < 18, radiation: 300 };
});
const at = (h, d = 0) => new Date(2026, 9, 27 + d, h, 0);

test('a due run lands in a free, cool hour; busy hours and not-due things are skipped', () => {
  const r = plan({ now, hours, busy: [{ start: at(16), end: at(17) }], nudges: { run: { due: true, overdue: 1, every: 2, last: '2026-10-24' }, bike: { due: false, every: 3, last: '2026-10-26', next: '2026-10-29' } } });
  const top = r.picks[0];
  assert.equal(top.kind, 'run');
  assert.notEqual(top.at.getHours(), 16, 'not when you are busy');
  assert.ok(top.why.includes('3 days since your last run'));
  assert.ok(!r.all.some((p) => p.kind === 'bike'), 'a ride that is not due');
});

test('Mom at her window, a class 15 minutes early, new episodes when you are both free, and the dogs along on the run', () => {
  const r = plan({ now, hours,
    nudges: { callmom: { due: true, overdue: 2, every: 14, last: '2026-10-11' }, hotyoga: { due: true, overdue: 0, every: 3, last: '2026-10-24' }, run: { due: true, overdue: 0, every: 2, last: '2026-10-25' } },
    callWindows: [{ start: at(20), end: at(21) }], classes: [{ at: at(6, 1), label: 'Hot yoga' }],
    dogs: { enabled: true, walkedToday: false }, partnerBusy: [{ start: at(19), end: at(20) }],
    shows: [{ id: 's1', title: 'Love Is Blind', newCount: 3, from: 9, to: 11 }] });
  const by = Object.fromEntries(r.all.map((p) => [p.kind, p]));
  assert.equal(by.callmom.at.getHours(), 20);
  assert.match(by.callmom.why.join(), /16 days since you called/);
  assert.deepEqual([by.hotyoga.at.getDate(), by.hotyoga.at.getHours(), by.hotyoga.at.getMinutes()], [28, 5, 45]);
  assert.notEqual(by.show.at.getHours(), 19, 'Amani is busy at 7');
  assert.equal(by.show.title, 'Love Is Blind');
  assert.ok(by.run.withDogs && !by.walk, 'the walk rides along with the run');
});

test('not today, later, and a weekday you keep skipping', () => {
  const pick = { kind: 'run', at: at(17) };
  let l = learn({}, 'skip', pick, now);
  const nudges = { run: { due: true, overdue: 0, every: 2, last: '2026-10-25' } };
  const r = plan({ now, hours, nudges, learned: l });
  assert.equal(r.picks[0].at.getDate(), 28, 'tomorrow instead');
  l = learn({}, 'later', pick, now);
  assert.ok(plan({ now, hours, nudges, learned: l }).picks[0].at.getTime() >= now.getTime() + 2 * 3600e3);
  l = learn(learn(learn({}, 'skip', pick, now), 'skip', pick, now), 'skip', pick, now);
  assert.equal(l.skips.run[2], 3);
  const done = learn({}, 'done', pick, at(18));
  assert.deepEqual(done.done.map((d) => d.hour), [18]);
  // Your usual time pulls the pick toward it.
  const usual = { done: Array.from({ length: 6 }, () => ({ kind: 'run', hour: 7 })) };
  const u = plan({ now: at(21), hours: hours.slice(6), nudges, learned: usual });
  assert.equal(u.picks[0].at.getHours(), 7);
  assert.ok(u.picks[0].why.includes('your usual time'));
});
