// 🎤 Patient listening (js/listen.js) with a fake recogniser and a fake clock: pauses don't cut you
// off, restarts keep every word, Done keeps what's still being heard, a refused restart holds
// (Tap to keep talking) instead of looping, and nothing is kept after Cancel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeListener, LISTEN, finishMsOf } from '../js/listen.js';

function clock() {
  let at = 0, id = 0;
  const q = new Map();
  return {
    now: () => at,
    setTimeout: (fn, ms) => { q.set(++id, { fn, at: at + ms }); return id; },
    clearTimeout: (i) => q.delete(i),
    // Move time on, running timers in order.
    tick(ms) {
      const end = at + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]); at = next[1].at; next[1].fn();
      }
      at = end;
    },
  };
}
function phone({ refuseRestart = false } = {}) {
  const made = [];
  const create = () => {
    if (refuseRestart && made.length) throw new Error('needs a tap');
    const r = { started: 0, aborted: 0, results: [], start() { this.started++; }, stop() {}, abort() { this.aborted++; } };
    // Speech: `final` pieces and an interim tail, as the browser reports them (the whole list each time).
    r.say = (finals, interimText = '') => {
      r.results = [...finals.map((x) => Object.assign([{ transcript: x }], { isFinal: true })), ...(interimText ? [Object.assign([{ transcript: interimText }], { isFinal: false })] : [])];
      r.onresult({ resultIndex: 0, results: r.results });
    };
    r.end = () => r.onend();
    made.push(r);
    return r;
  };
  return { create, made, get r() { return made[made.length - 1]; } };
}
const setup = (o) => { const c = clock(), p = phone(o), s = makeListener({ create: p.create, timers: c, now: c.now }); return { c, p, s }; };

test('a short pause does not finish; "Still listening…" at about 2 s; finish at 3.5 s', () => {
  const { c, p, s } = setup();
  p.r.say([], 'two eggs');
  c.tick(1500);
  assert.equal(s.state, 'listening');
  p.r.say(['two eggs and toast'], '');
  c.tick(LISTEN.hintMs + 10);
  assert.equal(s.state, 'pausing');
  assert.equal(s.ended, false);
  p.r.say(['two eggs and toast'], 'and coffee');
  assert.equal(s.state, 'listening', 'speaking again resets it');
  c.tick(LISTEN.finishMs + 10);
  assert.equal(s.ended, true);
  assert.equal(s.reason, 'pause');
  assert.equal(s.text, 'two eggs and toast and coffee');
});

test('the phone ends on its own: restarted, every word kept', () => {
  const { c, p, s } = setup();
  p.r.say(['I had two eggs'], '');
  const first = p.r;
  first.end();
  c.tick(LISTEN.restartMs + 1);
  assert.equal(p.made.length, 2, 'started again');
  assert.equal(s.ended, false);
  p.r.say(['and a slice of toast'], '');
  assert.equal(s.text, 'I had two eggs and a slice of toast');
  first.say(['ghost words'], ''); // a late event from the old recogniser is ignored
  assert.equal(s.text, 'I had two eggs and a slice of toast');
});

test('finals are kept once, and an engine that resends everything keeps only the newest whole', () => {
  const { p, s } = setup();
  p.r.say(['two eggs'], '');
  p.r.say(['two eggs'], 'and');
  assert.equal(s.text, 'two eggs and');
  // One session's results arrive as separate finals, then all over again as one.
  p.r.onresult({ resultIndex: 1, results: [Object.assign([{ transcript: 'two eggs' }], { isFinal: true }), Object.assign([{ transcript: 'two eggs and toast' }], { isFinal: true })] });
  assert.equal(s.text, 'two eggs and toast');
});

test('Done finishes at once and keeps the words still being heard', () => {
  const { p, s } = setup();
  p.r.say(['log lunch'], 'chicken and rice');
  s.stop();
  assert.equal(s.ended, true);
  assert.equal(s.reason, 'done');
  assert.equal(s.text, 'log lunch chicken and rice');
  assert.equal(p.r.aborted, 1, 'the microphone is off');
});

test('a refused restart holds with the words (Tap to keep talking), never loops; the tap adds on', () => {
  const { c, p, s } = setup({ refuseRestart: true });
  p.r.say(['two eggs'], '');
  p.r.end();
  c.tick(LISTEN.restartMs + 1);
  assert.equal(s.state, 'held');
  assert.equal(s.text, 'two eggs');
  c.tick(LISTEN.finishMs * 3);
  assert.equal(s.ended, false, 'held: waits for you');
  assert.equal(p.made.length, 1);
});

test('restarts that keep failing hold instead of looping', () => {
  const { c, p, s } = setup();
  p.r.say(['walked the dogs'], '');
  for (let i = 0; i < 5 && s.state !== 'held'; i++) { p.r.end(); c.tick(LISTEN.restartMs + 1); }
  assert.equal(s.state, 'held');
  assert.ok(p.made.length <= 4, `${p.made.length} starts`);
  s.resume();
  assert.equal(s.state, 'listening');
  p.r.say(['in the park'], '');
  assert.equal(s.text, 'walked the dogs in the park');
  s.stop();
  assert.equal(s.text, 'walked the dogs in the park');
});

test('no words at all: "I didn\'t hear anything" after 9 s; 90 s in all finishes', () => {
  const a = setup();
  a.c.tick(LISTEN.noWordsMs + 1);
  assert.equal(a.s.ended, true);
  assert.equal(a.s.reason, 'nowords');
  assert.equal(a.s.error, 'no-speech');
  const b = setup();
  for (let i = 0; i < 40 && !b.s.ended; i++) { b.p.r.say([`word ${i}`], ''); b.c.tick(2400); }
  assert.equal(b.s.reason, 'max');
  assert.ok(b.c.now() <= LISTEN.maxMs + 2400);
});

test('blocked microphone on the first start is an error, not a hold; Cancel keeps nothing', () => {
  const a = setup();
  a.p.r.onerror({ error: 'not-allowed' });
  assert.equal(a.s.ended, true);
  assert.equal(a.s.error, 'not-allowed');
  const b = setup();
  b.p.r.say(['add dune'], '');
  b.s.abort();
  assert.equal(b.s.reason, 'cancel');
  assert.equal(b.s.text, '');
});

test('the finish time can be tuned between 1.5 and 6 s', () => {
  assert.equal(finishMsOf('2500'), 2500);
  assert.equal(finishMsOf(500), LISTEN.finishMs);
  assert.equal(finishMsOf('x'), LISTEN.finishMs);
});

// A real recogniser says when its microphone started (onaudiostart); iPhone sometimes never does.
function realPhone({ deadFirst = 0 } = {}) {
  const made = [];
  const create = (o = {}) => {
    const dead = made.length < deadFirst;
    const r = { onaudiostart: null, onstart: null, started: 0, aborted: 0, fresh: !!o.fresh, start() { this.started++; if (!dead) queueMicrotask(() => this.onaudiostart?.call(this)); }, stop() {}, abort() { this.aborted++; } };
    r.say = (finals) => r.onresult({ resultIndex: 0, results: finals.map((x) => Object.assign([{ transcript: x }], { isFinal: true })) });
    made.push(r);
    return r;
  };
  return { create, made, get r() { return made[made.length - 1]; } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('🎤 a microphone that never starts: one fresh recogniser, then "didn\'t start" — no app restart needed', async () => {
  const c = clock(), p = realPhone({ deadFirst: 1 }), s = makeListener({ create: p.create, timers: c, now: c.now });
  await settle();
  c.tick(LISTEN.bootMs + 10);
  assert.equal(p.made.length, 2, 'a fresh one is tried');
  assert.equal(p.made[0].aborted, 1);
  assert.equal(p.made[1].fresh, true);
  await settle();
  c.tick(LISTEN.bootMs + 10);
  assert.equal(s.ended, false, 'the fresh one started: still listening');
  p.r.say(['log my weight 160']);
  c.tick(LISTEN.finishMs + 10);
  assert.equal(s.text, 'log my weight 160');

  const c2 = clock(), p2 = realPhone({ deadFirst: 9 }), s2 = makeListener({ create: p2.create, timers: c2, now: c2.now });
  await settle(); c2.tick(LISTEN.bootMs + 10); await settle(); c2.tick(LISTEN.bootMs + 10);
  assert.deepEqual([s2.ended, s2.reason, s2.error, p2.made.length], [true, 'error', 'no-start', 2], 'two silent ones: say so, once');
});

test('🎤 a microphone that starts normally is never second-guessed', async () => {
  const c = clock(), p = realPhone(), s = makeListener({ create: p.create, timers: c, now: c.now });
  await settle();
  c.tick(LISTEN.bootMs * 2);
  assert.equal(p.made.length, 1);
  assert.equal(s.ended, false);
});
