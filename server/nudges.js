// 📞 Check-in reminders: "call Mom every two weeks". You tick it off when it's done, and the next
// one comes that many days later. Until then nothing nags; once it's due, one notification a day
// at the start of the best time to call (her morning or evening), until it's ticked.
// Kept per account as { callmom: { every, last, prev, notified } } — dates only.

import { callWindows } from '../js/brief.js';

export const NUDGES = { callmom: { label: 'Call Mom', icon: '📞', every: 14 } };
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
    const every = Math.max(3, Math.min(60, Math.round(+body.every || NUDGES[id].every)));
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
export function nudgesDue(all, { today, from, to }) {
  const out = [];
  const n = all?.callmom;
  if (!n) return out;
  const s = nudgeState(n, today);
  if (!s.due || n.notified === today) return out;
  // At the start of a good time to call (her morning or evening); once a day until it's ticked.
  const w = callWindows(today).find((x) => x.start.getTime() >= from && x.start.getTime() < to);
  if (!w) return out;
  const last = n.last ? `last call ${s.overdue + n.every} days ago` : 'every two weeks';
  out.push({ id: 'callmom', kind: 'nudges', msg: { title: '📞 Time to call Mom', body: `Good time now until ${w.end.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })} · ${last}. Tick it off in the app when you've called.`, url: 'family/#feed', tag: 'callmom' }, ttl: 3 * 3600 });
  return out;
}
