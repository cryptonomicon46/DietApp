// ⌚↔🏋️ Which WHOOP workout was which logged workout (Health 2 Phase B). Pure, so it's tested.
//
// Device workouts (`workoutHistory` entries from js/devices.js: id, name, start, minutes, kcal,
// strain, avgHr, maxHr, zones, tz) and the workouts you logged in Fitness are matched on the
// phone each time they're shown; only your own choices are saved (on the logged workout:
// `match: {id}` for "this one", `match: {none: true}` for "not this one"), so nothing is copied.
//   1. Your choice wins.
//   2. Overlap: a workout you started and finished in the app takes the WHOOP workout it overlaps
//      most (at least 5 minutes, or a third of the shorter one).
//   3. Nearest: a workout logged as done (no real start and finish) takes the WHOOP workout of the
//      same day that ended closest to when you logged it.
// Always the same calendar day (WHOOP's in its own time-zone offset), never across days; each
// WHOOP workout goes with one logged workout at most.
//
// Calories: matching only shows WHOOP's numbers on the logged workout. Diet counts the burn from
// the device's own workouts and day totals (js/dayPlan.js); a logged workout never adds calories,
// so a matched pair is counted once.

// '+09:00' / '-05:00' / 'Z' → minutes east of UTC (null when missing or malformed).
export function offsetMin(tz) {
  if (tz === 'Z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tz || ''));
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null;
}
const pad = (n) => String(n).padStart(2, '0');
// The calendar date of an instant where a device record says you were (WHOOP gives each record
// its time-zone offset; without one, this phone's zone). js/whoopDay.js files its days by it too.
export function localDate(iso, tz, shiftMs = 0) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const off = offsetMin(tz);
  if (off == null) { const d = new Date(t + shiftMs); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return new Date(t + shiftMs + off * 60000).toISOString().slice(0, 10);
}

const MIN = 60000;
export const deviceDay = (x) => localDate(x.start, x.tz);
const span = (x) => { const s = Date.parse(x.start); return [s, s + (x.minutes || 0) * MIN]; };
const timed = (w) => w.startedAt && w.doneAt && w.doneAt - w.startedAt >= 5 * MIN;

// → Map(loggedId → { device, method: 'manual' | 'overlap' | 'nearest' })
export function matchAll(logged = [], device = []) {
  const out = new Map(), used = new Set();
  const done = logged.filter((w) => w?.status === 'done' && w.date);
  const byId = new Map(device.filter((x) => x?.id && x.start).map((x) => [x.id, x]));
  const sameDay = (w, x) => deviceDay(x) === w.date;
  for (const w of done) {
    const x = w.match?.id && byId.get(w.match.id);
    if (x && sameDay(w, x)) { out.set(w.id, { device: x, method: 'manual' }); used.add(x.id); }
  }
  const open = (w) => !out.has(w.id) && !w.match?.none;
  const pairs = [];
  for (const w of done.filter((w) => open(w) && timed(w))) {
    for (const x of byId.values()) {
      if (!sameDay(w, x)) continue;
      const [a, b] = span(x), ov = Math.min(b, w.doneAt) - Math.max(a, w.startedAt);
      const shorter = Math.min(b - a, w.doneAt - w.startedAt);
      if (ov >= 5 * MIN || (shorter > 0 && ov >= shorter / 3)) pairs.push({ w, x, score: ov });
    }
  }
  pairs.sort((p, q) => q.score - p.score);
  for (const { w, x } of pairs) if (!out.has(w.id) && !used.has(x.id)) { out.set(w.id, { device: x, method: 'overlap' }); used.add(x.id); }
  for (const w of done.filter((w) => open(w) && !timed(w))) {
    const at = w.doneAt || w.startedAt;
    if (!at) continue;
    const best = [...byId.values()].filter((x) => !used.has(x.id) && sameDay(w, x)).sort((p, q) => Math.abs(span(p)[1] - at) - Math.abs(span(q)[1] - at))[0];
    if (best) { out.set(w.id, { device: best, method: 'nearest' }); used.add(best.id); }
  }
  return out;
}
// The WHOOP numbers shown on a logged workout (they come from the device, as they are).
export function deviceFacts(m) {
  if (!m) return null;
  const x = m.device;
  return { id: x.id, method: m.method, strain: x.strain ?? null, kcal: x.kcal ?? null, avgHr: x.avgHr ?? null, maxHr: x.maxHr ?? null, zones: x.zones ?? null, minutes: x.minutes ?? null, name: x.name || '' };
}
// Same-day WHOOP workouts you could pick instead ("Not this one?").
export function candidatesFor(w, device = []) { return device.filter((x) => x?.start && deviceDay(x) === w.date).sort((a, b) => a.start.localeCompare(b.start)); }
// A logged workout finished today with no WHOOP workout yet, while WHOOP is connected: say
// "Waiting for WHOOP…" for a while instead of nothing (WHOOP scores a workout after it ends).
export function waitingForDevice(w, matched, { connected = false, now = Date.now(), today = '' } = {}) {
  return !!connected && !matched && !w.match?.none && w.status === 'done' && w.date === today && now - (w.doneAt || 0) < 6 * 3600e3;
}
