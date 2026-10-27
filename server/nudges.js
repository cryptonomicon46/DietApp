// 📞 Check-in reminders: "call Mom every two weeks", "run every 2 days", "ride every 3",
// "hot yoga every 3". You tick it off when it's done (runs and rides tick themselves from WHOOP /
// Strava), and the next one comes that many days later. Nothing nags until it's due; then one
// notification a day until it's ticked — for Mom at the start of a good time to call, for the
// workouts one morning note (7 AM) listing what's due.
// Kept per account as { id: { every, last, prev, notified } } — dates only.

import { callWindows } from '../js/brief.js';

export const NUDGES = {
  callmom: { label: 'Call Mom', icon: '📞', every: 14 },
  run: { label: 'Run', icon: '🏃', every: 2, sport: 'running' },
  bike: { label: 'Ride', icon: '🚴', every: 3, sport: 'cycling' },
  hotyoga: { label: 'Hot yoga', icon: '🧘', every: 3, sport: 'hotYoga' },
};
export const MORNING = 7; // the workout note, local time
const day = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
export const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export function nudgeState(n, today) {
  const next = n.last ? addDays(n.last, n.every) : today;
  return { every: n.every, last: n.last || null, next, due: next <= today, overdue: Math.max(0, Math.round((Date.parse(today) - Date.parse(next)) / 864e5)), canUndo: n.prev !== undefined };
}

// GET /account/nudges · PUT /account/nudges/:id {every} (sets it up) · POST …/:id/done {date} ·
// POST …/:id/undo · DELETE …/:id (turns it off).
export async function nudgeRoutes({ path, method, body, db, user, json, today }) {
  const m = path.match(/^\/account\/nudges(?:\/([a-z]+)(\/done|\/undo)?)?$/);
  if (!m) return null;
  const key = `nudges:${user.uid}`;
  const all = (await db.get(key)) || {};
  const out = () => json({ nudges: Object.fromEntries(Object.entries(all).map(([k, n]) => [k, { ...NUDGES[k], ...nudgeState(n, today) }])) });
  if (!m[1] && method === 'GET') return out();
  const id = m[1];
  if (!NUDGES[id]) return json({ error: 'not found' }, 404);
  if (!m[2] && method === 'PUT') {
    const every = Math.max(1, Math.min(60, Math.round(+body.every || NUDGES[id].every)));
    all[id] = { ...(all[id] || {}), every, ...(day(body.last) ? { last: body.last } : {}) };
  } else if (!m[2] && method === 'DELETE') {
    delete all[id];
  } else if (m[2] === '/done' && method === 'POST' && all[id]) {
    const date = day(body.date) && body.date <= today ? body.date : today;
    all[id] = { ...all[id], prev: all[id].last ?? null, last: date, notified: null };
  } else if (m[2] === '/undo' && method === 'POST' && all[id] && all[id].prev !== undefined) {
    const { prev, ...rest } = all[id];
    all[id] = { ...rest, last: prev };
  } else return json({ error: 'not found' }, 404);
  await db.put(key, all);
  return out();
}

// For the 15-minute reminder run: the notifications due for this account in [from, to).
export function nudgesDue(all, { today, from, to, hour = null }) {
  const out = [];
  // 🏃 One morning note for the workouts that are due ("Run (3 days) · Hot yoga").
  const moves = Object.entries(all || {}).filter(([k, n]) => NUDGES[k]?.sport && nudgeState(n, today).due && n.notified !== today);
  if (moves.length && hour === MORNING) {
    const line = moves.map(([k, n]) => { const st = nudgeState(n, today); return `${NUDGES[k].icon} ${NUDGES[k].label}${n.last ? ` (${st.overdue + n.every} days)` : ''}`; }).join(' · ');
    out.push({ ids: moves.map(([k]) => k), kind: 'nudges', msg: { title: moves.length === 1 ? `${NUDGES[moves[0][0]].icon} Time for a ${NUDGES[moves[0][0]].label.toLowerCase()}` : '💪 Due today', body: `${line} — the app has the best time today. Tick it off when it's done.`, url: 'family/#feed', tag: 'moves' }, ttl: 6 * 3600 });
  }
  const n = all?.callmom;
  if (!n) return out;
  const s = nudgeState(n, today);
  if (!s.due || n.notified === today) return out;
  // At the start of a good time to call (her morning or evening); once a day until it's ticked.
  const w = callWindows(today).find((x) => x.start.getTime() >= from && x.start.getTime() < to);
  if (!w) return out;
  const last = n.last ? `last call ${s.overdue + n.every} days ago` : 'every two weeks';
  out.push({ ids: ['callmom'], kind: 'nudges', msg: { title: '📞 Time to call Mom', body: `Good time now until ${w.end.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })} · ${last}. Tick it off in the app when you've called.`, url: 'family/#feed', tag: 'callmom' }, ttl: 3 * 3600 });
  return out;
}
