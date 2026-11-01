// ⌚ One WHOOP card for Home and Health (family/whoopCard.js), and SYNC WHOOP's states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../family/whoopCard.js';
import * as H from '../family/health.js';
import { recoveryContext } from '../js/whoopDay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('Health renders the very same card functions as Home (one copy)', () => {
  for (const k of ['whoopHtml', 'whoopDaysHtml', 'recoveryDetailHtml', 'sleepDetailHtml', 'strainDetailHtml', 'WHOOP_COLORS']) assert.equal(H[k], C[k], k);
  const model = { ...recoveryContext({}, '2026-11-01'), dailyMissing: false, lighter: null };
  assert.equal(H.whoopHtml(model, esc), C.whoopHtml(model, esc));
  assert.match(C.whoopHtml(model, esc), /Data by/);
});

test('SYNC WHOOP: ready, syncing, synced, reconnect', () => {
  const now = Date.parse('2026-11-01T15:30:00Z');
  const ready = C.whoopSyncHtml({ lastSync: now - 600e3, sleepEnd: '6:41 AM' }, esc, now);
  assert.match(ready, /data-act="whoopsync"/);
  assert.match(ready, /Sync WHOOP/);
  assert.match(ready, /Last synced /);
  assert.match(ready, /Sleep ended 6:41 AM/);
  const busy = C.whoopSyncHtml({ busy: true, lastSync: now }, esc, now);
  assert.match(busy, /disabled aria-busy="true"/);
  assert.match(busy, /Syncing WHOOP…/);
  assert.ok(!/data-act="whoopsync"/.test(busy), 'no second tap while syncing');
  const done = C.whoopSyncHtml({ done: true, msg: { text: '✓ WHOOP updated', tone: 'ok' }, lastSync: now }, esc, now);
  assert.match(done, /WHOOP synced/);
  assert.match(done, /role="status">✓ WHOOP updated/);
  const re = C.whoopSyncHtml({ reconnect: true, lastSync: now }, esc, now);
  assert.match(re, /data-act="devconnect"/);
  assert.match(re, /WHOOP needs to reconnect/);
  assert.match(C.whoopSyncHtml({}, esc, now), /Not synced yet/);
});

test('stale: before today\'s midnight or more than 6 hours ago', () => {
  const now = new Date(2026, 10, 1, 9, 0).getTime();
  assert.equal(C.isStale(new Date(2026, 10, 1, 7, 12).getTime(), now), false);
  assert.equal(C.isStale(new Date(2026, 9, 31, 23, 50).getTime(), now), true, 'yesterday');
  assert.equal(C.isStale(new Date(2026, 10, 1, 2, 0).getTime(), new Date(2026, 10, 1, 8, 30).getTime()), true, 'over 6 hours');
  assert.equal(C.isStale(0, now), true);
  assert.match(C.staleHtml(new Date(2026, 9, 31, 21, 40).getTime(), esc, now), /WHOOP data may be out of date · Last synced \w+ /);
});
