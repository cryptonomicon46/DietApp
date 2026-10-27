// 🔔 Notifications for OurPawmily: standard Web Push (RFC 8030), with the message encrypted to
// each phone (RFC 8291, aes128gcm) and the connector identified by its own key pair (VAPID,
// RFC 8292), made the first time it's needed and kept in storage. Nothing here needs a
// secret from you. Messages say who did what ("Sam left you a note"), never what an
// end-to-end encrypted note, plan or event says: the connector can't read those.

import { occursOn } from '../js/calendar.js';
import { nudgesDue } from './nudges.js';
import { movieAlertsDue } from './movies.js';

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

// What you can turn on or off (Me › 🔔 Notifications). All on to start with.
export const NOTIFY_KINDS = {
  us: '💞 Plans, answers and notes',
  appts: '🐾 Dog appointments and vaccines',
  events: '📅 Calendar reminders',
  feed: '💬 Comments and help on your posts',
  fun: '⭐ Golden days and games',
  nudges: '📞 Reminders: calling Mom, workouts, movie releases',
};
export const wants = (user, kind) => user?.notify?.[kind] !== false;

// Push services phones use (Apple, Google/Chrome, Mozilla, Microsoft) — nowhere else.
export function okEndpoint(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/.test(u.hostname);
  } catch { return false; }
}
export const okSubKeys = (k) => /^[A-Za-z0-9_-]{86,88}$/.test(k?.p256dh || '') && /^[A-Za-z0-9_-]{21,24}$/.test(k?.auth || '');

// The connector's VAPID key pair: made once, then kept.
export async function vapidKeys(db) {
  const have = await db.get('push:vapid');
  if (have) return have;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const made = { publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  await db.put('push:vapid', made);
  return (await db.get('push:vapid')) || made; // two at once: everyone uses whichever was saved
}

async function vapidHeader(endpoint, keys, subject) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// RFC 8291: the message, readable only by the phone that subscribed. One record, no padding.
export async function encryptPayload(sub, text, { salt = crypto.getRandomValues(new Uint8Array(16)), local = null } = {}) {
  const uaPublic = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  const as = local || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// Sends one message to one phone → the push service's status (404/410: that phone unsubscribed).
export async function sendOne(db, env, sub, msg, ttl = 86400) {
  const text = JSON.stringify(msg);
  if (env.__push) return env.__push(sub, msg); // tests
  const keys = await vapidKeys(db);
  const subject = env.SUPPORT_EMAIL ? `mailto:${env.SUPPORT_EMAIL}` : new URL(env.APP_ORIGIN || 'https://example.com').origin;
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, keys, subject), TTL: String(ttl), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: 'normal' },
    body: await encryptPayload(sub, text),
  });
  return res.status;
}

// Sends to every phone of each account; forgets phones the push service says are gone.
export async function sendTo(db, env, uids, kind, msg, ttl) {
  if (env.DEMO && !env.__push) return 0;
  let sent = 0;
  for (const uid of [...new Set(uids)].filter(Boolean)) {
    const subs = (await db.get(`pushsub:${uid}`)) || [];
    if (!subs.length) continue;
    const user = await db.get(`user:${uid}`);
    if (!user || !wants(user, kind)) continue;
    const gone = [];
    await Promise.all(subs.map(async (s) => {
      try { const st = await sendOne(db, env, s, msg, ttl); if (st === 404 || st === 410) gone.push(s.endpoint); else if (st < 300) sent++; } catch { /* try next time */ }
    }));
    if (gone.length) {
      const left = subs.filter((s) => !gone.includes(s.endpoint));
      if (left.length) await db.put(`pushsub:${uid}`, left); else await db.del(`pushsub:${uid}`);
    }
  }
  return sent;
}

// Family members → their accounts (people with an account only, never `me`).
export const uidsOf = (fam, ids, notUid) => fam.members.filter((x) => ids.includes(x.id) && x.uid && x.uid !== notUid).map((x) => x.uid);
export const adultsOf = (fam, notUid) => fam.members.filter((x) => x.kind === 'person' && x.uid && x.relation !== 'child' && x.uid !== notUid).map((x) => x.uid);

// ---------- reminders (the 15-minute cron) ----------
// "YYYY-MM-DDTHH:MM" on the wall clock in `tz` → UTC milliseconds.
export function localToUtc(local, tz = 'America/Los_Angeles') {
  const [d, t = '09:00'] = local.split('T');
  const guess = Date.parse(`${d}T${t}:00Z`);
  const offset = (at) => {
    let p;
    try { p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at)).map((x) => [x.type, x.value])); } catch { return 0; }
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - at;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}
export const localDay = (at, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)); } catch { return new Date(at).toISOString().slice(0, 10); } };
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const shift = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const APPT_WORDS = { groom: '✂️ Grooming', vet: '🩺 Vet visit', vaccine: '💉 Vaccination', dental: '🦷 Dental', boarding: '🏨 Boarding', other: '📌 Appointment' };

// What's due for one person (member id, their time zone) in [from, to): [{kind, msg, ttl}].
export function dueFor({ fam, memberId, tz, appts = [], events = [], vax = [] }, from, to) {
  const out = [];
  const inWindow = (at) => at >= from && at < to;
  const name = (id) => fam.members.find((x) => x.id === id)?.name || '';
  const today = localDay(from, tz);
  for (const a of appts) {
    if (a.status === 'done' || !(a.remind || []).length) continue;
    const start = a.dropAt || a.pickAt;
    if (!start) continue;
    const at = localToUtc(start.length === 10 ? `${start}T09:00` : start, tz);
    const pets = a.pets.map(name).filter(Boolean).join(' & ');
    const drop = a.dropAt ? (a.dropBy ? `${a.dropBy === memberId ? 'you are' : `${name(a.dropBy)} is`} dropping off` : 'nobody is dropping off yet') : '';
    const when = start.length === 10 ? '' : ` at ${clock(start.slice(11))}`;
    for (const r of a.remind) {
      const lead = r === 'day' ? 864e5 : 36e5;
      if (!inWindow(at - lead)) continue;
      out.push({ kind: 'appts', ttl: 3600, msg: { title: `${APPT_WORDS[a.type] || APPT_WORDS.other}${pets ? ` for ${pets}` : ''}`, body: `${r === 'day' ? 'Tomorrow' : 'In an hour'}${when}${drop ? ` — ${drop}` : ''}`, url: 'family/#dogs', tag: `appt-${a.id}-${r}` } });
    }
  }
  for (const e of events) {
    if (e.remind == null || (e.who?.length && !e.who.includes(memberId))) continue;
    for (const d of [today, shift(today, 1), shift(today, 2)]) {
      if (!occursOn(e, d)) continue;
      const t = e.allDay || !e.start ? '09:00' : e.start;
      if (!inWindow(localToUtc(`${d}T${t}`, tz) - e.remind * 60000)) continue;
      const when = e.allDay ? (e.remind >= 1440 ? 'Tomorrow' : 'Today') : `${e.remind >= 1440 ? 'Tomorrow' : e.remind ? 'Today' : 'Now'} at ${clock(t)}`;
      out.push({ kind: 'events', ttl: 3600, msg: { title: '📅 Calendar reminder', body: `${when} — open the calendar to see what`, url: 'family/#calendar', tag: `ev-${e.id}-${d}` } });
    }
  }
  // Vaccines due in a week, and on the day (9 AM).
  if (inWindow(localToUtc(`${today}T09:00`, tz))) {
    for (const v of vax) {
      const pet = name(v.pet);
      if (!pet) continue;
      if (v.due === shift(today, 7)) out.push({ kind: 'appts', ttl: 43200, msg: { title: `💉 ${pet}'s vaccine is due next week`, body: 'Book it from Dogs › appointments.', url: 'family/#dogs', tag: `vax-${v.pet}-${v.due}` } });
      if (v.due === today) out.push({ kind: 'appts', ttl: 43200, msg: { title: `💉 ${pet}'s vaccine is due today`, body: 'Book it, or mark it given on their profile.', url: 'family/#dogs', tag: `vax-${v.pet}-${v.due}` } });
    }
  }
  return out;
}

// Every 15 minutes: anyone with notifications on gets what falls in this quarter hour.
export async function runReminders(env, at = Date.now(), { db }) {
  const from = Math.floor(at / 9e5) * 9e5, to = from + 9e5;
  const kv = env.HOUSEHOLD;
  const uids = [];
  let cursor;
  do {
    const r = await kv.list({ prefix: 'v2:pushsub:', cursor });
    uids.push(...r.keys.map((k) => k.name.slice('v2:pushsub:'.length)));
    cursor = r.list_complete === false ? r.cursor : null;
  } while (cursor);
  const famCache = new Map();
  const famData = async (fid) => {
    if (!famCache.has(fid)) {
      famCache.set(fid, (async () => {
        const fam = await db.get(`family:${fid}`);
        if (!fam) return null;
        return { fam, appts: (await db.get(`appts:${fid}`)) || [], events: ((await db.get(`events:${fid}`)) || {}).events || [], vax: (await db.get(`vaxdue:${fid}`)) || [] };
      })());
    }
    return famCache.get(fid);
  };
  let sent = 0;
  const movieSeen = new Map(), movieBudget = { left: 12 };
  for (const uid of uids) {
    const user = await db.get(`user:${uid}`);
    if (!user) continue;
    // 📞 Check-in reminders (one read per phone owner a run; a write only when one goes out).
    const nudges = await db.get(`nudges:${uid}`);
    if (nudges) {
      const tz = user.tz || 'America/Los_Angeles';
      const today = localDay(from, tz);
      // The local hour, on the run that starts it (minute 0–14).
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(from)).map((x) => [x.type, x.value]));
      const hour = +parts.minute < 15 ? +parts.hour : null;
      const due = nudgesDue(nudges, { today, from, to, hour });
      for (const d of due) {
        sent += await sendTo(db, env, [uid], d.kind, d.msg, d.ttl);
        for (const id of d.ids) nudges[id] = { ...nudges[id], notified: today };
      }
      if (due.length) await db.put(`nudges:${uid}`, nudges);
    }
    // 🎬 Movie alerts, checked at 9 AM your time: in theaters, or now streaming.
    const mv = env.TMDB_KEY ? await db.get(`moviealerts:${uid}`) : null;
    if (mv?.on && mv.list?.length) {
      const tz = user.tz || 'America/Los_Angeles';
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(from)).map((x) => [x.type, x.value]));
      if (+parts.hour === 9 && +parts.minute < 15) {
        const due = await movieAlertsDue(env, mv, localDay(from, tz), movieSeen, movieBudget);
        for (const d of due) {
          sent += await sendTo(db, env, [uid], 'nudges', d.msg, 12 * 3600);
          const a = mv.list.find((x) => x.id === d.id); a.told = { ...(a.told || {}), [d.what]: true };
        }
        if (due.length) await db.put(`moviealerts:${uid}`, mv);
      }
    }
    for (const fid of user.families || []) {
      const f = await famData(fid);
      const me = f?.fam.members.find((x) => x.uid === uid);
      if (!me || me.relation === 'child') continue;
      for (const d of dueFor({ ...f, memberId: me.id, tz: user.tz || 'America/Los_Angeles' }, from, to)) sent += await sendTo(db, env, [uid], d.kind, d.msg, d.ttl);
    }
  }
  return sent;
}
