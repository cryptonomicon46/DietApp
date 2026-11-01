// 🧭 Sending a long date plan: it must fit what the connector keeps (a sealed plan up to 8,000
// characters), and sealedLength must match what family/crypto.js seal() really makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { shareable, sealedLength, MAX } from '../js/outingShare.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { seal, newKey } = await import('../family/crypto.js');

const long = (n, w = 'Easy waterfront stroll with Golden Gate Bridge views as the light turns golden — ') => w.repeat(Math.ceil(n / w.length)).slice(0, n);
const stop = (i, kind = 'walk') => ({ time: `1${6 + i}:00`, kind, name: `Stop number ${i} with a fairly long name`, price: '$$', note: long(90, 'Walk-in, free. Bring a jacket because it’s windy. '),
  why: long(260), where: '3659 Buchanan St (Marina), San Francisco', url: `https://example.com/place/${i}?utm=a-long-tracking-string`, map: `https://www.google.com/maps/search/?api=1&query=Stop+${i}+Marina+San+Francisco`, reserve: kind === 'dinner' ? 'https://www.opentable.com/r/marina-beach-san-francisco?dateTime=2026-12-05T17:30&covers=2' : '' });
const big = () => ({
  title: 'Golden hour in the Marina', area: 'Marina, San Francisco', day: '2026-12-05', from: 'Sunnyvale', directions: 'https://www.google.com/maps/dir/?api=1&origin=Sunnyvale&destination=Marina+Green',
  getting: [{ mode: 'car', depart: '14:45', text: long(220, 'Drive up 101 and park once at Marina Green; Saturday traffic can be slow. ') }, { mode: 'train', text: long(200, 'Or Caltrain to 4th & King, then a rideshare. ') }],
  back: long(150, 'Drive home after the Palace of Fine Arts. '), parking: long(150, 'Free lot at Marina Green fills by 3 PM. '),
  stops: [stop(0), stop(1), stop(2, 'dinner'), stop(3, 'drinks'), stop(4)],
  options: { eat: [stop(5, 'dinner'), stop(6, 'dinner'), stop(7, 'dinner'), stop(8, 'dinner')], do: [stop(9), stop(10), stop(11)] },
  tips: Array.from({ length: 5 }, (_, i) => long(170, `Tip ${i}: Sunset is around 16:50, so arrive by 16:00 for the best views. `)),
});
const wrap = (o) => ({ kind: 'outing', what: o.title, where: o.area, when: 'date', time: '14:45', note: '', outing: o });

test('sealedLength is exactly the length seal() makes', async () => {
  const key = newKey();
  for (const v of [{ a: 1 }, wrap(big()), { t: 'é — “quotes” 🍽' }]) assert.equal((await seal(key, v)).length, sealedLength(v));
});

test('a full five-stop plan used to be over the limit; now the fullest version that fits is sent', () => {
  const o = big();
  assert.ok(sealedLength(wrap({ ...o, options: { eat: o.options.eat.slice(0, 3), do: o.options.do.slice(0, 2) } })) > MAX, 'the old payload is too big (the bug)');
  const r = shareable(o, wrap);
  assert.ok(r, 'something fits');
  assert.ok(sealedLength(r.value) <= MAX);
  assert.equal(r.value.outing.stops.length, 5, 'every stop is kept');
  assert.deepEqual(r.value.outing.stops.map((x) => x.name), o.stops.map((x) => x.name));
  assert.ok(r.value.outing.stops.every((x) => x.map && x.time), 'links and times stay');
  assert.equal(o.options.eat.length, 4, "the planner's own copy isn't changed");
});

test('a small plan goes as before (level 0, options kept)', () => {
  const o = { ...big(), stops: [stop(0)], tips: [], options: { eat: [stop(1, 'dinner')], do: [] }, getting: [], back: '', parking: '' };
  o.stops[0].why = 'Short.';
  const r = shareable(o, wrap);
  assert.equal(r.level, 0);
  assert.equal(r.value.outing.options.eat.length, 1);
});

test('missing options or tips do not break it', () => {
  const o = big(); delete o.options; delete o.tips;
  assert.ok(shareable(o, wrap));
});

test('null when even the shortest version cannot fit', () => {
  const o = { ...big(), stops: Array.from({ length: 60 }, (_, i) => stop(i)) };
  assert.equal(shareable(o, wrap), null);
});

test('Save to a thread: title and body keep every stop, its time and links', async () => {
  const { outingThread } = await import('../js/outingShare.js');
  const o = big(), t = outingThread(o);
  assert.match(t.title, /^🧭 Golden hour in the Marina · Sat, Dec 5$/);
  for (const x of o.stops) { assert.ok(t.body.includes(x.name)); assert.ok(t.body.includes(x.map)); }
  assert.match(t.body, /## The plan\n\n### 4:00 PM · Stop number 0 with a fairly long name \(\$\$\)\nWalk-in/);
  assert.ok(!t.body.includes('**'), 'Threads has no bold');
  assert.match(t.body, /OpenTable: https:\/\/www\.opentable\.com/);
  assert.match(t.body, /## Getting there\n- Leave 2:45 PM · /);
  assert.match(t.body, /## Tips\n- Tip 0/);
  assert.ok(t.body.length <= 11000);
  assert.ok(!t.body.includes('Stop number 5'), "the other options aren't part of the plan");
});
