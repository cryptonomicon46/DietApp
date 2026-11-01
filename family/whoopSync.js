// ⌚ One WHOOP sync for the whole app: 🏠 Home's SYNC WHOOP, 💪 Health's sync when it opens and
// its five-minute Strain refresh, and Health › Devices › Sync now all go through here, so there's
// only ever one sync running and every view gets the same answer.
//
// Pure apart from what's passed in (so it's tested with fakes):
//   read()        → { t: the WHOOP sign-in record on this phone, … } or null (not connected)
//   full()        → { added, errors: [{ provider, kind: 'reconnect' | 'unavailable', status? }] }
//                   the existing 3-day sync (family/deviceScreen.js syncNow → js/devices.js)
//   today()       → today so far only (2 WHOOP requests, kept on the phone; js/devices.js refreshToday)
//   fingerprint() → what the WHOOP card shows (js/whoopDay.js recoveryContext + today's WHOOP
//                   workouts), so "updated" means the card really changed
//   raw()         → everything a sync can change on the phone (for views other than the card)
//   onResult(res) → called once per finished sync
//
// sync(kind): 'auto' (opening Home or Health; at most every 20 min) · 'tick' (Health open; every
// 4.5 min, today only) · 'manual' (a tap: today only if the last full sync was under a minute ago).
// → { status, kind, added, dataChanged }, status ∈ updated · nochange · fresh (manual, synced a
// moment ago, nothing new) · error · busy (WHOOP said too many requests: manual taps wait 2 min) ·
// cooldown · reconnect · skipped · none (WHOOP isn't connected here).
export const AUTO_MS = 20 * 60000, TICK_MS = 4.5 * 60000, FRESH_MS = 60000, COOL_MS = 2 * 60000;

export function makeWhoopSync({ read, full, today, fingerprint, raw = () => '', onResult = () => {}, now = () => Date.now() }) {
  let running = null, coolUntil = 0, last = null;
  async function run(kind, light) {
    const before = fingerprint(), rawBefore = raw();
    let added = 0;
    try {
      if (light) {
        await today();
        if (read()?.t?.problem === 'reconnect') return { status: 'reconnect' };
      } else {
        const out = (await full()) || { added: 0, errors: [] };
        const e = (out.errors || []).find((x) => x.provider === 'whoop') || (out.errors || [])[0];
        if (e) {
          if (e.kind === 'reconnect') return { status: 'reconnect' };
          if (e.status === 429) { coolUntil = now() + COOL_MS; return { status: 'busy' }; }
          return { status: 'error' };
        }
        added = out.added || 0;
      }
    } catch (err) {
      if (err?.kind === 'reconnect') return { status: 'reconnect' };
      if (err?.status === 429) { coolUntil = now() + COOL_MS; return { status: 'busy' }; }
      return { status: 'error' };
    }
    const changed = fingerprint() !== before, dataChanged = changed || raw() !== rawBefore;
    return { status: changed ? 'updated' : light && kind === 'manual' ? 'fresh' : 'nochange', added, dataChanged };
  }
  function sync(kind = 'manual') {
    if (running) return running; // a sync is already running: everyone gets its answer
    const w = read();
    if (!w?.t) return Promise.resolve({ status: 'none', kind });
    const t = w.t, n = now(), since = n - (t.lastSync || 0);
    if (kind === 'auto' && (t.problem === 'reconnect' || since < AUTO_MS)) return Promise.resolve({ status: 'skipped', kind });
    if (kind === 'tick' && (t.problem === 'reconnect' || n - Math.max(t.lastSync || 0, t.todayAt || 0) < TICK_MS)) return Promise.resolve({ status: 'skipped', kind });
    if (kind === 'manual' && coolUntil > n) return Promise.resolve({ status: 'cooldown', kind, until: coolUntil });
    const light = kind === 'tick' || (kind === 'manual' && since < FRESH_MS);
    running = run(kind, light)
      .then((r) => { const res = { added: 0, dataChanged: false, ...r, kind }; last = { ...res, at: now() }; try { onResult(res); } catch { /* a view's problem, not the sync's */ } return res; })
      .finally(() => { running = null; });
    return running;
  }
  return { sync, busy: () => !!running, last: () => last, coolUntil: () => coolUntil };
}

// The words under SYNC WHOOP for a result (null: say nothing).
export function resultMessage(r) {
  switch (r?.status) {
    case 'updated': return { text: '✓ WHOOP updated', tone: 'ok' };
    case 'nochange': return { text: 'WHOOP synced — no newer scores yet.', tone: '' };
    case 'fresh': return { text: 'Up to date — synced a moment ago.', tone: '' };
    case 'error': return { text: "Couldn't refresh WHOOP. Showing your last synced data.", tone: 'warn' };
    case 'busy': case 'cooldown': return { text: 'WHOOP is busy — try again in a couple of minutes. Showing your last synced data.', tone: 'warn' };
    default: return null;
  }
}
