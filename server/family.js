// 👨‍👩‍👧 OurPawmily Families (v2): accounts, families, invites, a private feed and per-member data.
// Mounted by worker.js at /v2/*; also runs inside the browser for the on-phone demo (any KV-like
// store works: get / put / delete). Nothing here holds secrets.
//
// Sign-in is with Google (an ID token from Google Identity Services, verified here), so Google's
// own 2-Step Verification protects every account. A family is created by one person; everyone
// else joins through an invite sent to their email address, and only that Google account can
// accept it. Families can connect to friends' families the same way.
//
// KV keys (prefix v2:):
//   user:<uid>                 {uid, email, name, picture, families: [fid]}
//   session:<token>            {uid}                      (30 days)
//   family:<fid>               {fid, name, createdBy, members: [...], connections: [fid]}
//   invite:<code>              {code, kind: 'member'|'family', fid, memberId?, email, by, byName}
//   feed:<fid>                 [postId] newest first (last 300)
//   post:<fid>:<postId>        {id, fid, by, byName, text, photo, tags, audience, likes, comments, at}
//   data:<fid>:<memberId>      {savedAt, data}            a member's tracker data (diet, dogs…)
//   dataprev:<fid>:<memberId>  the bigger copy, kept 90 days when a much smaller one replaced it (Recover)
//   care:<fid>:<date>          [{id, kind, pets, by, byName, at}]   the family's dog-care log
//   careidx:<fid>              [date]                     days that have a care log
//   gold:<fid>                 [{month, winners, points}] Gold Card hall of fame
//   report:<fid>:<postId>      [{uid, reason, at}]        posts someone reported
//   rate:<uid>:<minute>        count of changes (limits runaway clients and abuse)
//   appts:<fid>                [{id, type, pets, place, dropAt, dropBy, pickAt, pickBy, repeatWeeks, vaccine, status, cost…}]  dog appointments
//   dogmonths:<fid>            {YYYY-MM: {golden, walks}}  finished months of dog stats (cache)
//   bingopacks:<fid>           [{id, title, squares, by, byName, at}]  show bingo card sets
//   bingogames:<fid>           [{id, packId, title, squares, status, winners, by, at}]
//   bingocard:<fid>:<gid>:<memberId>  {card: [25 square indexes, -1 free], marks: [25]}  one player's card
//   picks:<fid>                [{id, title, couples, events, happened, outcome, status}]  💑 couples picks seasons
//   pickcard:<fid>:<sid>:<memberId>  {coupleId: {events, outcome}}  one player's predictions
//   ticket:<id>                a problem filed through Help (180 days)   tickets: [id] newest first
//   glitch:<date>              {key: {message, where, n}} app errors phones reported that day (30 days)
//   helprate:<who>:<minute|day> help-chat use per account or address
//   admin:report / admin:history  the nightly maintenance report (runMaintenance)
//
// Store rules this follows (Apple App Store 5.1.1, Google Play User Data): people can delete
// their account and everything tied to it from inside the app, download a copy of their data,
// and accept the terms (13+) before using it; shared posts can be reported, hidden, and their
// authors blocked (Apple 1.2).

import { isGolden, dayHighlights, goldenMessage } from './goldenPost.js';
import { APPT_TYPES, cleanAppt, nextDue, shiftWeeks, startOf, spending } from './appts.js';
import { parseSquares, makeCard, bingoLines, bingoPrompt, NEED, FREE } from './bingo.js';
import { EVENTS as PICK_EVENTS, OUTCOMES, locked as pickLocked, score as pickScore, parseCouples } from './picks.js';
import { ACCOUNT_TOOLS, GUEST_TOOLS, helpSystem, toMessages, runHelpAgent, offlineAnswer } from './helpAgent.js';

const SESSION_TTL = 30 * 86400;
const INVITE_TTL = 14 * 86400;
const RELATIONS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'relative', 'friend', 'other'];
const SPECIES = ['dog', 'cat', 'other'];
export const TERMS_VERSION = '2026-10';
// Dog care and house chores, with points by effort; the month's top scorer gets the Gold Card.
export const POINTS = { breakfast: 1, dinner: 1, walk: 2, park: 2, treat: 0, meds: 1, poop: 2, trash: 1, laundry: 3, groceries: 3, cleaning: 4, dishes: 1 };
const CARE = Object.keys(POINTS);
const MAX_WRITES_PER_MIN = 120;

const HELP_PER_MIN = 10, HELP_PER_DAY = 80;
const TICKET_TTL = 180 * 86400;

const enc = new TextEncoder();
const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
export const randomId = (bytes = 9) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
// A member's picture: an emoji, or a small photo (data URL, resized on the phone). No outside
// links, so a picture can't be used to track who's looking.
const avatarOf = (v) => (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 120_000 ? v : /[:/]/.test(String(v ?? '')) ? '' : clean(v, 8));
const emailOf = (s) => { const e = clean(s, 120).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ''; };

// ---------- Google ID token ----------
let certCache = null;
export async function verifyGoogle(idToken, clientId, keys = null) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [h, p, s] = parts;
  const header = b64urlJson(h), payload = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('bad token');
  if (!keys) {
    if (!certCache || Date.now() - certCache.at > 3600e3) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      certCache = { at: Date.now(), keys: (await res.json()).keys || [] };
    }
    keys = certCache.keys;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('bad issuer');
  if (payload.aud !== clientId) throw new Error('token is for another app');
  if (!(payload.exp * 1000 > Date.now())) throw new Error('token expired');
  if (!payload.email || payload.email_verified === false) throw new Error('email not verified');
  return { uid: `g${payload.sub}`, email: payload.email.toLowerCase(), name: clean(payload.name || payload.email.split('@')[0], 60), picture: clean(payload.picture, 300) };
}

// ---------- storage helpers ----------
const store = (kv) => ({
  get: async (k) => { const v = await kv.get(`v2:${k}`); return v ? JSON.parse(v) : null; },
  put: (k, v, ttl) => kv.put(`v2:${k}`, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined),
  del: (k) => kv.delete(`v2:${k}`),
});

// What a member looks like to someone else (no emails for people outside the family).
const memberView = (m, inside) => ({
  id: m.id, kind: m.kind, name: m.name, relation: m.relation, species: m.species, breed: m.breed, born: m.born,
  avatar: m.avatar, status: m.uid ? 'active' : m.email ? 'invited' : 'managed', role: m.role,
  ...(inside ? { email: m.email || '', shareWith: m.shareWith || [], legacyId: m.legacyId || '', petCalls: m.petCalls || '', ...(m.kind === 'pet' ? { editedAt: m.editedAt || m.addedAt || 0 } : {}) } : {}),
});

export async function familyApi(req, env, path) {
  const db = store(env.HOUSEHOLD);
  const json = (data, status = 200) => ({ status, data });
  const method = req.method;
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const text = await req.text();
    if (text.length > 6_000_000) return json({ error: 'too large' }, 413);
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'not JSON' }, 400); }
  }

  if (path === '/config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || '', ready: !!env.GOOGLE_CLIENT_ID, supportEmail: env.SUPPORT_EMAIL || '', termsVersion: TERMS_VERSION });

  // ---- sign in ----
  if (path === '/auth/google' && method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in is not set up on the connector yet' }, 501);
    let who;
    try { who = await verifyGoogle(body.credential, env.GOOGLE_CLIENT_ID, env.__googleKeys || null); } catch (err) { return json({ error: `sign-in failed: ${err.message}` }, 401); }
    return json(await startSession(db, { ...who, device: body.device }));
  }
  // The on-phone demo signs in without Google (never enabled on the real connector).
  if (path === '/auth/demo' && method === 'POST') {
    if (!env.DEMO) return json({ error: 'not found' }, 404);
    const email = emailOf(body.email);
    if (!email) return json({ error: 'enter an email address' }, 400);
    return json(await startSession(db, { uid: `d${email.replace(/[^a-z0-9]/g, '')}`, email, name: clean(body.name || email.split('@')[0], 60), picture: '', device: body.device }));
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const session = /^[a-z0-9]{20,64}$/.test(token) ? await db.get(`session:${token}`) : null;
  const user = session ? await db.get(`user:${session.uid}`) : null;

  // ---- help: the assistant, problem reports and glitch reports work signed in or not ----
  if (path.startsWith('/help/') && method === 'POST') {
    const who = user ? user.uid : `ip:${clean(req.headers.get('cf-connecting-ip') || 'anon', 64)}`;
    if (path === '/help/glitch') {
      if (!(await underLimit(db, `helprate:${who}:g${Math.floor(Date.now() / 60000)}`, 5, 120))) return json({ ok: true });
      await noteGlitch(db, body);
      return json({ ok: true });
    }
    const minute = await underLimit(db, `helprate:${who}:${Math.floor(Date.now() / 60000)}`, HELP_PER_MIN, 120);
    const day = minute && await underLimit(db, `helprate:${who}:d${new Date().toISOString().slice(0, 10)}`, HELP_PER_DAY, 86400 * 2);
    if (!day) return json({ error: 'lots of questions — give it a minute and try again' }, 429);
    const transcript = (Array.isArray(body.messages) ? body.messages : []).slice(-8);
    if (path === '/help/report') {
      if (!clean(body.summary, 120)) return json({ error: 'say what went wrong' }, 400);
      return json(await fileTicket(db, { user, input: { category: body.category, summary: body.summary, details: body.details, contact_email: body.contact }, app: body.app, transcript }));
    }
    if (path === '/help/chat') {
      const messages = toMessages(body.messages);
      if (!messages.length) return json({ error: 'ask a question' }, 400);
      const supportEmail = env.SUPPORT_EMAIL || '';
      if (env.DEMO || !(env.ANTHROPIC_API_KEY || env.__anthropic)) return json(offlineAnswer(messages.at(-1).content, { supportEmail }));
      const extra = {};
      const run = (name, input) => helpTool(db, env, { user, token, name, input, app: body.app, transcript, extra });
      let client = env.__anthropic;
      if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); }
      try {
        const r = await runHelpAgent({ client, messages, run, tools: user ? ACCOUNT_TOOLS : GUEST_TOOLS, system: helpSystem({ signedIn: !!user, name: user?.name, supportEmail }) });
        return json({ reply: r.reply, ...extra });
      } catch {
        return json({ ...offlineAnswer(messages.at(-1).content, { supportEmail }), note: 'The assistant is unavailable right now, so here is the guide.' });
      }
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- everything else needs a session ----
  if (!user) return json({ error: 'sign in first' }, 401);
  const saveUser = () => db.put(`user:${user.uid}`, user);
  let m;

  if (path === '/auth/logout' && method === 'POST') {
    await db.del(`session:${token}`);
    user.sessions = (user.sessions || []).filter((x) => x.t !== token); await saveUser();
    return json({ ok: true });
  }
  if (path === '/auth/logout-all' && method === 'POST') {
    for (const x of user.sessions || []) await db.del(`session:${x.t}`);
    await db.del(`session:${token}`);
    user.sessions = []; await saveUser();
    return json({ ok: true });
  }
  if (path === '/account/consent' && method === 'POST') {
    if (body.version !== TERMS_VERSION || body.age13 !== true) return json({ error: 'please confirm you are 13 or older and accept the terms' }, 400);
    user.consent = { version: TERMS_VERSION, at: Date.now() }; await saveUser();
    return json({ ok: true });
  }
  const consented = user.consent?.version === TERMS_VERSION;
  if (!consented && !['/me', '/account/export', '/account/delete'].includes(path)) return json({ error: 'accept the terms first', consent: true }, 403);
  // A steady stream of changes from one account is a bug or abuse: slow it down.
  if (method !== 'GET' && !(await underLimit(db, `rate:${user.uid}:${Math.floor(Date.now() / 60000)}`, MAX_WRITES_PER_MIN, 120))) {
    return json({ error: 'too many changes — try again in a minute' }, 429);
  }

  const families = async () => (await Promise.all(user.families.map((f) => db.get(`family:${f}`)))).filter(Boolean);
  const meIn = (fam) => fam.members.find((m) => m.uid === user.uid);
  const loadFamily = async (fid) => {
    const fam = /^[a-z0-9]{6,24}$/.test(fid) ? await db.get(`family:${fid}`) : null;
    return fam && meIn(fam) ? fam : null;
  };

  if (path === '/me' && method === 'GET') {
    const fams = await families();
    return json({ user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture, needsConsent: !consented, termsVersion: TERMS_VERSION, blocked: blockedOut(user), isAdmin: isAdmin(env, user) }, families: fams.map((f) => familyOut(f, user)) });
  }

  // ---- the maintainer's desk: problems people filed, app glitches, the nightly check ----
  if (path.startsWith('/admin/')) {
    if (!isAdmin(env, user)) return json({ error: 'not found' }, 404);
    if (path === '/admin/overview' && method === 'GET') {
      const ids = (await db.get('tickets')) || [];
      const tickets = (await Promise.all(ids.slice(0, 60).map((id) => db.get(`ticket:${id}`)))).filter(Boolean);
      const glitches = {};
      for (let i = 0; i < 7; i++) {
        for (const [k, g] of Object.entries((await db.get(`glitch:${shiftDay(new Date().toISOString().slice(0, 10), -i)}`)) || {})) {
          glitches[k] = { ...g, n: (glitches[k]?.n || 0) + g.n, last: Math.max(glitches[k]?.last || 0, g.last) };
        }
      }
      return json({ tickets, glitches: Object.values(glitches).sort((a, b) => b.n - a.n).slice(0, 20), report: await db.get('admin:report'), history: (await db.get('admin:history')) || [] });
    }
    m = path.match(/^\/admin\/tickets\/([a-z0-9]+)$/);
    if (m && method === 'PATCH') {
      const t = await db.get(`ticket:${m[1]}`);
      if (!t) return json({ error: 'not found' }, 404);
      if (['open', 'done'].includes(body.status)) t.status = body.status;
      if (body.note != null) t.note = clean(body.note, 500);
      await db.put(`ticket:${t.id}`, t, TICKET_TTL);
      return json({ ticket: t });
    }
    if (path === '/admin/maintenance' && method === 'POST') {
      if (!env.HOUSEHOLD.list) return json({ error: 'not available in the demo' }, 400);
      return json({ report: await runMaintenance(env) });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- your account: devices, a copy of your data, deleting it ----
  if (path === '/account/sessions' && method === 'GET') {
    return json({ sessions: (user.sessions || []).map((x) => ({ at: x.at, device: x.device || '', current: x.t === token })) });
  }
  if (path === '/account/export' && method === 'GET') {
    const fams = await families();
    const out = { app: 'OurPawmily', exportedAt: new Date().toISOString(), account: { email: user.email, name: user.name, createdAt: user.createdAt, consent: user.consent || null }, families: [] };
    for (const f of fams) {
      const mine = meIn(f);
      const posts = [], comments = [];
      for (const id of (await db.get(`feed:${f.fid}`)) || []) {
        const p = await db.get(`post:${f.fid}:${id}`);
        if (!p) continue;
        if (p.by === mine.id) posts.push({ text: p.text, photo: p.photo, at: new Date(p.at).toISOString(), audience: p.audience, likes: p.likes.length, comments: p.comments.length });
        for (const c of p.comments) if (c.uid === user.uid) comments.push({ text: c.text, at: new Date(c.at).toISOString() });
      }
      out.families.push({ name: f.name, role: mine.role, me: memberView(mine, true), myData: (await db.get(`data:${f.fid}:${mine.id}`))?.data || {}, posts, comments,
        members: f.members.map((x) => ({ name: x.name, kind: x.kind, relation: x.relation })) });
    }
    return json(out);
  }
  if (path === '/account/delete' && method === 'POST') {
    if (body.confirm !== 'DELETE') return json({ error: 'type DELETE to confirm' }, 400);
    return json(await deleteAccount(db, user));
  }
  m = path.match(/^\/account\/blocks\/([a-z0-9]+)$/);
  if (m && method === 'DELETE') {
    user.blocked = (user.blocked || []).filter((b) => b.id !== m[1] && b.uid !== m[1]); await saveUser();
    return json({ blocked: blockedOut(user) });
  }

  // ---- families ----
  if (path === '/families' && method === 'POST') {
    const name = clean(body.name, 40);
    if (!name) return json({ error: 'name your family' }, 400);
    if (user.families.length >= 5) return json({ error: 'up to 5 families per account' }, 400);
    const fam = { fid: randomId(), name, createdBy: user.uid, createdAt: Date.now(), connections: [], members: [
      { id: randomId(6), kind: 'person', uid: user.uid, email: user.email, name: clean(body.myName || user.name, 40), relation: 'self', role: 'owner', avatar: user.picture || '', shareWith: [] },
    ] };
    await db.put(`family:${fam.fid}`, fam);
    user.families.push(fam.fid); await saveUser();
    return json({ family: familyOut(fam, user) });
  }
  m = path.match(/^\/families\/([a-z0-9]+)$/);
  if (m && method === 'GET') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const connected = (await Promise.all(fam.connections.map((f) => db.get(`family:${f}`)))).filter(Boolean)
      .map((f) => ({ fid: f.fid, name: f.name, members: f.members.filter((x) => sharedWithFriends(f, x)).map((x) => memberView(x, false)) }));
    return json({ family: familyOut(fam, user), connected });
  }

  m = path.match(/^\/families\/([a-z0-9]+)(\/leave|\/owner|\/disconnect)?$/);
  if (m && (method === 'PATCH' || method === 'DELETE' || (method === 'POST' && m[2]))) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const owner = me.role === 'owner';
    if (method === 'PATCH') {
      if (!owner) return json({ error: "only the family's creator can change that" }, 403);
      if (body.name != null) fam.name = clean(body.name, 40) || fam.name;
      if (Array.isArray(body.modules)) fam.modules = body.modules.filter((x) => MODULES.includes(x));
      if (body.goldPrize != null) fam.goldPrize = clean(body.goldPrize, 80);
      if (typeof body.goldenPosts === 'boolean') fam.goldenPosts = body.goldenPosts;
      if (body.share && typeof body.share === 'object') fam.share = { kids: !!body.share.kids, pets: body.share.pets !== false };
      await db.put(`family:${fam.fid}`, fam);
      return json({ family: familyOut(fam, user) });
    }
    if (method === 'DELETE') {
      if (!owner) return json({ error: "only the family's creator can delete it" }, 403);
      if (clean(body.confirm || '', 40) !== fam.name) return json({ error: `type the family's name (${fam.name}) to confirm` }, 400);
      await deleteFamily(db, fam);
      user.families = user.families.filter((f) => f !== fam.fid); await saveUser();
      return json({ ok: true });
    }
    if (m[2] === '/leave') {
      if (owner) return json({ error: 'hand the family to someone else first (or delete it)' }, 400);
      await removeMember(db, fam, me, { keepPosts: false });
      user.families = user.families.filter((f) => f !== fam.fid); await saveUser();
      return json({ ok: true });
    }
    if (m[2] === '/owner') {
      if (!owner) return json({ error: 'not allowed' }, 403);
      const t = fam.members.find((x) => x.id === body.memberId && x.kind === 'person' && x.uid && x.relation !== 'child');
      if (!t) return json({ error: 'pick a grown-up who has joined' }, 400);
      me.role = 'member'; t.role = 'owner';
      await db.put(`family:${fam.fid}`, fam);
      return json({ family: familyOut(fam, user) });
    }
    if (m[2] === '/disconnect') {
      if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
      const other = await db.get(`family:${clean(body.fid, 24)}`);
      fam.connections = (fam.connections || []).filter((f) => f !== body.fid);
      await db.put(`family:${fam.fid}`, fam);
      if (other) { other.connections = (other.connections || []).filter((f) => f !== fam.fid); await db.put(`family:${other.fid}`, other); }
      return json({ ok: true });
    }
  }

  // ---- 🐾 the family's dog-care log: fed, walks, park, treats, meds ----
  m = path.match(/^\/families\/([a-z0-9]+)\/care(?:\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]+))?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    if (method === 'GET') {
      const to = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('to') || '') ? url(req).searchParams.get('to') : null;
      const days = Math.min(31, Math.max(1, +url(req).searchParams.get('days') || 1));
      if (!to) return json({ error: 'which day?' }, 400);
      const out = {};
      for (let i = 0; i < days; i++) { const d = shiftDay(to, -i); out[d] = (await db.get(`care:${fam.fid}:${d}`)) || []; }
      return json({ days: out });
    }
    if (method === 'POST' && !m[2]) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
      if (!date || !CARE.includes(body.kind)) return json({ error: 'what and which day?' }, 400);
      const pets = (Array.isArray(body.pets) ? body.pets : []).filter((id) => fam.members.some((x) => x.id === id && x.kind === 'pet'));
      const who = body.by === 'both' ? fam.members.filter((x) => x.kind === 'person' && x.uid && x.relation !== 'child').map((x) => x.id).slice(0, 2) : [me.id];
      const entry = { id: randomId(6), kind: body.kind, pets, by: who, byName: who.map((id) => fam.members.find((x) => x.id === id)?.name).join(' & '), note: clean(body.note, 80), at: Date.now() };
      const list = [...((await db.get(`care:${fam.fid}:${date}`)) || []), entry].slice(-100);
      await db.put(`care:${fam.fid}:${date}`, list);
      const idx = (await db.get(`careidx:${fam.fid}`)) || [];
      if (!idx.includes(date)) await db.put(`careidx:${fam.fid}`, [...idx, date].slice(-800));
      // ⭐ The day just turned golden: the dogs say thank you on the feed.
      const golden = ['walk', 'park', 'treat'].includes(entry.kind) && !isGolden(list.slice(0, -1)) && isGolden(list) ? await goldenDayPost(db, fam, date, list) : null;
      return json({ entry, ...(golden ? { golden: postOut(golden, user, { own: true, familyName: fam.name }) } : {}) });
    }
    // Bringing over the current app's history: replaces what an earlier import added, day by day.
    if (method === 'PUT' && !m[2]) {
      if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
      const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, 5000);
      const byDay = {};
      for (const e of entries) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !CARE.includes(e.kind)) continue;
        const by = (Array.isArray(e.by) ? e.by : []).filter((id) => fam.members.some((x) => x.id === id && x.kind === 'person'));
        (byDay[e.date] ||= []).push({ id: randomId(6), kind: e.kind, pets: [], by, byName: by.map((id) => fam.members.find((x) => x.id === id).name).join(' & '), note: '', at: +e.at || Date.parse(`${e.date}T12:00:00Z`), src: 'import' });
      }
      const idx = new Set((await db.get(`careidx:${fam.fid}`)) || []);
      await db.del(`dogmonths:${fam.fid}`); // history changed: recount the months
      for (const [d, list] of Object.entries(byDay)) {
        const kept = ((await db.get(`care:${fam.fid}:${d}`)) || []).filter((x) => x.src !== 'import');
        await db.put(`care:${fam.fid}:${d}`, [...kept, ...list].sort((a, b) => a.at - b.at).slice(-100));
        idx.add(d);
      }
      await db.put(`careidx:${fam.fid}`, [...idx].sort().slice(-800));
      return json({ days: Object.keys(byDay).length, entries: Object.values(byDay).flat().length });
    }
    // 👫 After the fact: an entry becomes "both of us" (or back to just you); points follow.
    if (method === 'PATCH' && m[2]) {
      const list = (await db.get(`care:${fam.fid}:${m[2]}`)) || [];
      const e = list.find((x) => x.id === m[3]);
      if (!e) return json({ error: 'not found' }, 404);
      if (!(e.by.includes(me.id) || me.role === 'owner')) return json({ error: 'only who logged it can change it' }, 403);
      const adults = fam.members.filter((x) => x.kind === 'person' && x.uid && x.relation !== 'child').map((x) => x.id).slice(0, 2);
      e.by = body.both ? [...new Set([...e.by, ...adults])].slice(0, 2) : [e.by.includes(me.id) ? me.id : e.by[0]];
      e.byName = e.by.map((id) => fam.members.find((x) => x.id === id)?.name).filter(Boolean).join(' & ');
      await db.put(`care:${fam.fid}:${m[2]}`, list);
      return json({ entry: e });
    }
    if (method === 'DELETE' && m[2]) {
      const list = (await db.get(`care:${fam.fid}:${m[2]}`)) || [];
      const e = list.find((x) => x.id === m[3]);
      if (!e) return json({ error: 'not found' }, 404);
      if (!(e.by.includes(me.id) || me.role === 'owner')) return json({ error: 'only who logged it can undo it' }, 403);
      await db.put(`care:${fam.fid}:${m[2]}`, list.filter((x) => x !== e));
      return json({ ok: true });
    }
  }

  // ---- 🏆 the month's chores race: points per person, and the Gold Card ----
  // ---- 🐾 dog appointments: grooming, vet, vaccines… with drop-off and pick-up drivers ----
  m = path.match(/^\/families\/([a-z0-9]+)\/appts(?:\/([a-z0-9]+))?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const key = `appts:${fam.fid}`;
    const list = (await db.get(key)) || [];
    const save = (l) => db.put(key, l.sort((a, b) => startOf(a).localeCompare(startOf(b))).slice(-300));
    const ctx = { petIds: fam.members.filter((x) => x.kind === 'pet').map((x) => x.id), memberIds: fam.members.filter((x) => x.kind === 'person').map((x) => x.id), clean };
    if (!m[2] && method === 'GET') {
      const today = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('today') || '') ? url(req).searchParams.get('today') : new Date().toISOString().slice(0, 10);
      const recent = shiftDay(today, -60);
      return json({
        appts: list.filter((a) => a.status !== 'done' || startOf(a).slice(0, 10) >= recent),
        spending: spending(list, today.slice(0, 4)), types: APPT_TYPES,
      });
    }
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (!m[2] && method === 'POST') {
      const a = { id: randomId(8), ...cleanAppt(body, ctx), status: 'upcoming', by: me.id, at: Date.now() };
      if (!a.pets.length) return json({ error: 'which dog is going?' }, 400);
      if (!a.dropAt && !a.pickAt) return json({ error: 'when is it?' }, 400);
      await save([...list, a]);
      // It goes on the feed, so the other driver can take the open leg from there.
      const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '',
        text: '', photo: '', appt: a.id, tags: a.pets, tagNames: Object.fromEntries(a.pets.map((id) => [id, fam.members.find((x) => x.id === id)?.name || ''])), tagKinds: Object.fromEntries(a.pets.map((id) => [id, 'pet'])),
        audience: 'family', likes: [], comments: [], at: Date.now() };
      await db.put(`post:${fam.fid}:${post.id}`, post);
      await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
      return json({ appt: a });
    }
    const a = list.find((x) => x.id === m[2]);
    if (!a) return json({ error: 'that appointment is gone' }, 404);
    if (method === 'DELETE') { await save(list.filter((x) => x.id !== a.id)); return json({ ok: true }); }
    if (method === 'PATCH') {
      // I'll take it: the drop-off or the pick-up (or let it go again).
      if (body.claim === 'drop' || body.claim === 'pick') a[`${body.claim}By`] = body.release ? '' : me.id;
      if (body.edit) Object.assign(a, cleanAppt({ ...a, ...body.edit }, ctx));
      let next = null;
      if (body.done) {
        a.status = 'done';
        a.doneAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : startOf(a).slice(0, 10);
        a.cost = Math.max(0, Math.min(100000, Math.round((+body.cost || 0) * 100) / 100));
        a.outcome = clean(body.outcome, 300);
        // A vaccination updates each dog's record: given today, next due in a year or three.
        if (a.type === 'vaccine' && a.vaccine) {
          const due = /^\d{4}-\d{2}-\d{2}$/.test(body.nextDue || '') ? body.nextDue : nextDue(a.vaccine, a.doneAt);
          for (const pid of a.pets) {
            const rec = (await db.get(`data:${fam.fid}:${pid}`)) || { data: {} };
            const prof = { ...(rec.data?.profile || {}) };
            const vax = [...(prof.vaccines || [])];
            const i = vax.findIndex((v) => v.name?.trim().toLowerCase() === a.vaccine.toLowerCase());
            const v = { ...(i >= 0 ? vax[i] : { name: a.vaccine }), given: a.doneAt, due };
            if (i >= 0) vax[i] = v; else vax.push(v);
            const now = Date.now();
            prof.vaccines = vax; prof.times = { ...(prof.times || {}), vaccines: now }; prof.updatedAt = now;
            await db.put(`data:${fam.fid}:${pid}`, { savedAt: now, data: { ...(rec.data || {}), profile: prof } });
          }
        }
        if (a.repeatWeeks && !list.some((x) => x.from === a.id)) {
          next = { ...a, id: randomId(8), from: a.id, status: 'upcoming', dropAt: shiftWeeks(a.dropAt, a.repeatWeeks), pickAt: shiftWeeks(a.pickAt, a.repeatWeeks), dropBy: '', pickBy: '', cost: 0, outcome: '', doneAt: '', at: Date.now() };
          delete next.doneAt; list.push(next);
        }
      }
      if (body.undone) { a.status = 'upcoming'; delete a.doneAt; }
      await save(list);
      return json({ appt: a, next });
    }
  }
  // 🐾 How happy are the dogs: golden days, walks, the streak, and the last 12 months.
  m = path.match(/^\/families\/([a-z0-9]+)\/dogstats$/);
  if (m && method === 'GET') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const today = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('today') || '') ? url(req).searchParams.get('today') : new Date().toISOString().slice(0, 10);
    const days = new Set((await db.get(`careidx:${fam.fid}`)) || []);
    const dayStat = async (d) => { const l = days.has(d) ? (await db.get(`care:${fam.fid}:${d}`)) || [] : []; return { golden: isGolden(l), walks: l.filter((e) => e.kind === 'walk' || e.kind === 'park').length }; };
    const ym = today.slice(0, 7);
    // This month and last, day by day (for the streak); earlier months from the cache.
    const recent = {};
    for (let d = shiftDay(`${ym}-01`, -31); d <= today; d = shiftDay(d, 1)) recent[d] = await dayStat(d);
    let streak = 0;
    for (let d = recent[today]?.golden ? today : shiftDay(today, -1); recent[d]?.golden; d = shiftDay(d, -1)) streak++;
    const cache = (await db.get(`dogmonths:${fam.fid}`)) || {};
    const months = [];
    let changed = false;
    for (let i = 11; i >= 0; i--) {
      const first = new Date(`${ym}-15T12:00:00Z`); first.setUTCMonth(first.getUTCMonth() - i);
      const mo = first.toISOString().slice(0, 7);
      if (mo === ym) { const v = Object.entries(recent).filter(([d]) => d.startsWith(mo)).map(([, s]) => s); months.push({ ym: mo, golden: v.filter((s) => s.golden).length, walks: v.reduce((n, s) => n + s.walks, 0) }); continue; }
      if (!cache[mo]) {
        let golden = 0, walks = 0;
        for (const d of [...days].filter((x) => x.startsWith(mo))) { const s = await dayStat(d); golden += s.golden ? 1 : 0; walks += s.walks; }
        cache[mo] = { golden, walks }; changed = true;
      }
      months.push({ ym: mo, ...cache[mo] });
    }
    if (changed) await db.put(`dogmonths:${fam.fid}`, cache);
    return json({ month: months.at(-1), streak, months });
  }

  // ---- 🎲 show bingo ----
  m = path.match(/^\/families\/([a-z0-9]+)\/bingo(?:\/(packs|games|generate)(?:\/([a-z0-9]+)(\/mark|\/end)?)?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const [, , what, id, act] = m;
    const packs = (await db.get(`bingopacks:${fam.fid}`)) || [];
    const games = (await db.get(`bingogames:${fam.fid}`)) || [];
    const players = fam.members.filter((x) => x.kind === 'person' && (x.uid || x.id === me.id));
    const gameOut = (g) => ({ id: g.id, packId: g.packId, title: g.title, status: g.status, at: g.at, byName: g.byName, winners: g.winners });
    if (!what && method === 'GET') {
      return json({ packs: packs.map((p) => ({ id: p.id, title: p.title, count: p.squares.length, byName: p.byName, at: p.at, mine: p.by === me.id })), games: games.map(gameOut) });
    }
    if (what === 'generate' && method === 'POST') {
      const show = clean(body.show, 80);
      if (!show) return json({ error: 'which show?' }, 400);
      if (env.DEMO || !(env.ANTHROPIC_API_KEY || env.__anthropic)) return json({ error: 'Claude isn\'t set up on the connector — copy the prompt into any chatbot instead', prompt: bingoPrompt(show) }, 501);
      let client = env.__anthropic;
      if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); }
      try {
        const res = await client.beta.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' },
          system: 'You write playful, family-friendly bingo squares for couples watching TV together.', messages: [{ role: 'user', content: bingoPrompt(show) }] });
        const squares = parseSquares((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
        if (squares.length < NEED) return json({ error: 'Claude came back with too few squares — try again', prompt: bingoPrompt(show) }, 502);
        return json({ squares });
      } catch { return json({ error: 'Claude is unavailable right now — copy the prompt into any chatbot instead', prompt: bingoPrompt(show) }, 502); }
    }
    if (what === 'packs' && !id && method === 'POST') {
      const title = clean(body.title, 60);
      const squares = parseSquares(Array.isArray(body.squares) ? JSON.stringify(body.squares) : body.text);
      if (!title) return json({ error: 'name the show' }, 400);
      if (squares.length < NEED) return json({ error: `that's ${squares.length} squares — a card needs at least ${NEED} (30 or more is best)` }, 400);
      const pack = { id: randomId(8), title, squares, by: me.id, byName: me.name, at: Date.now() };
      await db.put(`bingopacks:${fam.fid}`, [pack, ...packs].slice(0, 40));
      return json({ pack: { id: pack.id, title, count: squares.length } });
    }
    if (what === 'packs' && id && method === 'DELETE') {
      const p = packs.find((x) => x.id === id);
      if (!p) return json({ error: 'not found' }, 404);
      if (p.by !== me.id && me.role !== 'owner') return json({ error: 'only who added it can remove it' }, 403);
      await db.put(`bingopacks:${fam.fid}`, packs.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    if (what === 'games' && !id && method === 'POST') {
      const p = packs.find((x) => x.id === body.packId);
      if (!p) return json({ error: 'pick a card set' }, 400);
      const g = { id: randomId(8), packId: p.id, title: p.title, squares: p.squares, status: 'live', winners: [], by: me.id, byName: me.name, at: Date.now() };
      // One live game at a time per set: starting again ends the old one.
      const rest = games.map((x) => (x.packId === p.id && x.status === 'live' ? { ...x, status: 'done' } : x));
      await db.put(`bingogames:${fam.fid}`, [g, ...rest].slice(0, 20));
      return json({ game: gameOut(g) });
    }
    const g = what === 'games' && id ? games.find((x) => x.id === id) : null;
    if (what === 'games' && id && !g) return json({ error: 'that game has ended' }, 404);
    const cardOf = async (memberId, create) => {
      let c = await db.get(`bingocard:${fam.fid}:${g.id}:${memberId}`);
      if (!c && create) { c = { card: makeCard(g.squares.length), marks: Array(25).fill(false), at: Date.now() }; await db.put(`bingocard:${fam.fid}:${g.id}:${memberId}`, c, 60 * 86400); }
      return c;
    };
    const view = async (c) => ({
      game: gameOut(g),
      card: { squares: c.card.map((i) => (i === -1 ? '' : g.squares[i])), marks: c.marks.map((x, i) => i === FREE || !!x), lines: bingoLines(c.marks).length },
      players: await Promise.all(players.map(async (x) => { const pc = await cardOf(x.id, false); return { id: x.id, name: x.name, marked: pc ? pc.marks.filter(Boolean).length : 0, lines: pc ? bingoLines(pc.marks).length : 0, playing: !!pc }; })),
    });
    if (g && !act && method === 'GET') return json(await view(await cardOf(me.id, g.status === 'live')) );
    if (g && act === '/mark' && method === 'POST') {
      if (g.status !== 'live') return json({ error: 'this game has ended' }, 400);
      const i = Number(body.i);
      if (!Number.isInteger(i) || i < 0 || i > 24 || i === FREE) return json({ error: 'which square?' }, 400);
      const c = await cardOf(me.id, true);
      const had = bingoLines(c.marks).length;
      c.marks[i] = !c.marks[i];
      await db.put(`bingocard:${fam.fid}:${g.id}:${me.id}`, c, 60 * 86400);
      const now = bingoLines(c.marks).length;
      let bingo = null;
      if (now > had && !g.winners.some((w) => w.id === me.id)) {
        // BINGO: you're on the winners list, and it goes on the feed.
        const fresh = (await db.get(`bingogames:${fam.fid}`)) || [];
        const live = fresh.find((x) => x.id === g.id);
        if (live) {
          const first = !live.winners.length;
          live.winners.push({ id: me.id, name: me.name, at: Date.now() });
          g.winners = live.winners;
          await db.put(`bingogames:${fam.fid}`, fresh);
          const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '',
            text: `🎉 BINGO! ${first ? 'First to win' : `Bingo #${live.winners.length}`} at ${g.title} bingo 🎲`, photo: '', tags: [], tagNames: {}, tagKinds: {}, audience: 'family', likes: [], comments: [], at: Date.now(), bingo: g.id };
          await db.put(`post:${fam.fid}:${post.id}`, post);
          await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
          bingo = { first };
        }
      }
      return json({ ...(await view(c)), bingo });
    }
    if (g && act === '/end' && method === 'POST') {
      if (g.by !== me.id && me.role !== 'owner') return json({ error: 'only who started it can end it' }, 403);
      await db.put(`bingogames:${fam.fid}`, games.map((x) => (x.id === g.id ? { ...x, status: 'done' } : x)));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- 💑 couples picks (predictions for dating shows) ----
  m = path.match(/^\/families\/([a-z0-9]+)\/picks(?:\/([a-z0-9]+)(\/mine|\/happened|\/outcome)?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const [, , sid, act] = m;
    const key = `picks:${fam.fid}`;
    const seasons = (await db.get(key)) || [];
    const save = (list) => db.put(key, list.slice(0, 10));
    if (!sid && method === 'GET') return json({ seasons: seasons.map((s) => ({ id: s.id, title: s.title, status: s.status, couples: s.couples.length, at: s.at, byName: s.byName })) });
    if (!sid && method === 'POST') {
      const couples = (Array.isArray(body.couples) ? body.couples.map((c) => ({ a: clean(c.a, 30), b: clean(c.b, 30) })) : parseCouples(body.text)).filter((c) => c.a).slice(0, 16);
      if (!couples.length) return json({ error: 'add the couples, one per line (e.g. "Sam & Pat")' }, 400);
      const extra = (Array.isArray(body.events) ? body.events : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 8);
      const s = { id: randomId(8), title: clean(body.title, 60) || 'Love Is Blind', couples: couples.map((c) => ({ id: randomId(5), ...c })),
        events: [...PICK_EVENTS, ...extra.map((label) => ({ id: randomId(5), label }))], happened: {}, outcome: {}, status: 'live', by: me.id, byName: me.name, at: Date.now() };
      await save([s, ...seasons]);
      return json({ season: { id: s.id } });
    }
    const s = seasons.find((x) => x.id === sid);
    if (!s) return json({ error: 'not found' }, 404);
    const cardKey = (memberId) => `pickcard:${fam.fid}:${s.id}:${memberId}`;
    const players = fam.members.filter((x) => x.kind === 'person' && (x.uid || x.id === me.id));
    const view = async () => {
      const cards = Object.fromEntries(await Promise.all(players.map(async (x) => [x.id, (await db.get(cardKey(x.id))) || {}])));
      return {
        season: { id: s.id, title: s.title, status: s.status, couples: s.couples.map((c) => ({ ...c, locked: pickLocked(s, c.id) })), events: s.events, happened: s.happened, outcome: s.outcome, outcomes: OUTCOMES, byName: s.byName, mine: s.by === me.id },
        mine: cards[me.id],
        // Everyone's picks for a couple show once that couple is locked.
        revealed: Object.fromEntries(s.couples.filter((c) => pickLocked(s, c.id)).map((c) => [c.id, players.filter((x) => x.id !== me.id && cards[x.id][c.id]).map((x) => ({ name: x.name, ...cards[x.id][c.id] }))])),
        board: players.map((x) => ({ id: x.id, name: x.name, ...pickScore(s, cards[x.id]), picked: Object.keys(cards[x.id]).length })).sort((a, b) => b.points - a.points),
      };
    };
    if (!act && method === 'GET') return json(await view());
    if (!act && method === 'PATCH') {
      if (body.addCouple) { const [c] = parseCouples(`${clean(body.addCouple.a, 30)} & ${clean(body.addCouple.b, 30)}`); if (c && s.couples.length < 16) s.couples.push({ id: randomId(5), ...c }); }
      if (body.addEvent && s.events.length < 20) s.events.push({ id: randomId(5), label: clean(body.addEvent, 40) });
      if (body.status === 'done' || body.status === 'live') s.status = body.status;
      await save(seasons);
      return json(await view());
    }
    const c = s.couples.find((x) => x.id === body.couple);
    if (!c) return json({ error: 'which couple?' }, 400);
    if (act === '/mine' && method === 'PUT') {
      if (pickLocked(s, c.id)) return json({ error: `${c.a} & ${c.b}'s picks are locked — something already happened` }, 400);
      const card = (await db.get(cardKey(me.id))) || {};
      const ids = new Set(s.events.map((e) => e.id));
      card[c.id] = { events: (Array.isArray(body.events) ? body.events : []).filter((e) => ids.has(e)), outcome: OUTCOMES[body.outcome] ? body.outcome : null };
      await db.put(cardKey(me.id), card, 365 * 86400);
      return json(await view());
    }
    if (act === '/happened' && method === 'POST') {
      if (!s.events.some((e) => e.id === body.event)) return json({ error: 'what happened?' }, 400);
      const list = new Set(s.happened[c.id] || []);
      if (body.on === false) list.delete(body.event); else list.add(body.event);
      s.happened[c.id] = [...list];
      await save(seasons);
      return json(await view());
    }
    if (act === '/outcome' && method === 'POST') {
      const had = s.outcome[c.id];
      if (body.outcome && !OUTCOMES[body.outcome]) return json({ error: 'how did it end?' }, 400);
      if (body.outcome) s.outcome[c.id] = body.outcome; else delete s.outcome[c.id];
      await save(seasons);
      // The ending goes on the feed, with who called it.
      if (body.outcome && body.outcome !== had) {
        const called = [];
        for (const x of players) if (((await db.get(cardKey(x.id))) || {})[c.id]?.outcome === body.outcome) called.push(x.name);
        const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '',
          text: `${OUTCOMES[body.outcome]} — ${c.a} & ${c.b} (${s.title}). ${called.length ? `🔮 Called it: ${called.join(', ')}!` : 'Nobody saw that coming! 😱'}`,
          photo: '', tags: [], tagNames: {}, tagKinds: {}, audience: 'family', likes: [], comments: [], at: Date.now() };
        await db.put(`post:${fam.fid}:${post.id}`, post);
        await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
      }
      return json(await view());
    }
    return json({ error: 'not found' }, 404);
  }

  m = path.match(/^\/families\/([a-z0-9]+)\/chores$/);
  if (m && method === 'GET') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const month = /^\d{4}-\d{2}$/.test(url(req).searchParams.get('month') || '') ? url(req).searchParams.get('month') : null;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('today') || '') ? url(req).searchParams.get('today') : null;
    if (!month || !today) return json({ error: 'which month?' }, 400);
    const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
    const logs = {};
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      if (date > today) break;
      logs[date] = (await db.get(`care:${fam.fid}:${date}`)) || [];
    }
    const race = choresRace(logs, fam.members.filter((x) => x.kind === 'person'));
    let gold = (await db.get(`gold:${fam.fid}`)) || [];
    // A finished month crowns its winner once (shared on a tie).
    const ended = today.slice(0, 7) > month;
    if (ended && race.leaders.length && race.top > 0 && !gold.some((g) => g.month === month)) {
      gold = [{ month, winners: race.leaders.map((id) => ({ id, name: fam.members.find((x) => x.id === id)?.name || '' })), points: race.top, prize: fam.goldPrize || '' }, ...gold].slice(0, 36);
      await db.put(`gold:${fam.fid}`, gold);
    }
    return json({ month, ended, ...race, gold, prize: fam.goldPrize || '', points: POINTS });
  }

  // ---- members ----
  m = path.match(/^\/families\/([a-z0-9]+)\/members$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (fam.members.length >= 30) return json({ error: 'family is full' }, 400);
    const kind = body.kind === 'pet' ? 'pet' : 'person';
    const name = clean(body.name, 40);
    if (!name) return json({ error: 'add a name' }, 400);
    const email = kind === 'person' ? emailOf(body.email) : '';
    if (email && fam.members.some((x) => x.email === email)) return json({ error: 'already in the family' }, 409);
    const member = {
      id: randomId(6), kind, name, role: kind === 'pet' ? 'pet' : 'member',
      relation: kind === 'pet' ? 'pet' : RELATIONS.includes(body.relation) ? body.relation : 'other',
      ...(kind === 'pet' ? { species: SPECIES.includes(body.species) ? body.species : 'dog', breed: clean(body.breed, 40), born: /^\d{4}-\d{2}-\d{2}$/.test(body.born || '') ? body.born : '' } : {}),
      ...(email ? { email } : {}), legacyId: clean(body.legacyId, 40), avatar: avatarOf(body.avatar), shareWith: [], addedBy: me.id, addedAt: Date.now(),
    };
    fam.members.push(member);
    await db.put(`family:${fam.fid}`, fam);
    const invite = email ? await makeInvite(db, { kind: 'member', fid: fam.fid, memberId: member.id, email, by: me.id, byName: me.name, familyName: fam.name }) : null;
    return json({ member: memberView(member, true), invite });
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)$/);
  if (m && (method === 'PATCH' || method === 'DELETE')) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const t = fam.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    const self = t.id === me.id;
    // You edit yourself; grown-ups edit pets, kids and people who haven't joined yet.
    const canEdit = self || (me.relation !== 'child' && (t.kind === 'pet' || !t.uid));
    if (!canEdit) return json({ error: 'only they can change that' }, 403);
    if (method === 'DELETE') {
      if (t.role === 'owner') return json({ error: "the family's creator can't be removed" }, 400);
      if (!(me.role === 'owner' || self || !t.uid)) return json({ error: 'not allowed' }, 403);
      fam.members = fam.members.filter((x) => x.id !== t.id);
      for (const x of fam.members) x.shareWith = (x.shareWith || []).filter((id) => id !== t.id);
      await db.put(`family:${fam.fid}`, fam);
      await db.del(`data:${fam.fid}:${t.id}`);
      await db.del(`dataprev:${fam.fid}:${t.id}`);
      if (t.uid) { const u = await db.get(`user:${t.uid}`); if (u) { u.families = u.families.filter((f) => f !== fam.fid); await db.put(`user:${u.uid}`, u); } }
      return json({ ok: true });
    }
    if (body.name != null) t.name = clean(body.name, 40) || t.name;
    if (body.avatar != null) t.avatar = avatarOf(body.avatar);
    if (t.kind === 'pet') t.editedAt = Date.now(); // the trackers use it to tell whose edit is newer
    if (body.petCalls != null && t.kind === 'person') t.petCalls = clean(body.petCalls, 20); // what the pets call them, e.g. Dad
    if (body.legacyId != null) t.legacyId = clean(body.legacyId, 40); // who they were in the current app
    if (t.kind === 'pet') {
      if (body.breed != null) t.breed = clean(body.breed, 40);
      if (body.born != null && /^(\d{4}-\d{2}-\d{2})?$/.test(body.born)) t.born = body.born;
    } else if (body.relation != null && !self && RELATIONS.includes(body.relation)) t.relation = body.relation;
    // Only you decide who sees your diet & fitness.
    if (self && Array.isArray(body.shareWith)) t.shareWith = body.shareWith.filter((id) => fam.members.some((x) => x.id === id && x.kind === 'person' && x.id !== me.id));
    await db.put(`family:${fam.fid}`, fam);
    return json({ member: memberView(t, true) });
  }

  // ---- a member's tracker data (diet, training, dogs) ----
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/data\/prev$/);
  if (m && method === 'GET') {
    // The bigger copy kept when a much smaller one replaced it (see the PUT below): yours, or one
    // you're holding for someone who hasn't joined.
    const fam = await loadFamily(m[1]);
    const t = fam?.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    if (!(t.id === meIn(fam).id || (!t.uid && t.addedBy === meIn(fam).id))) return json({ error: 'not allowed' }, 403);
    return json((await db.get(`dataprev:${fam.fid}:${t.id}`)) || { savedAt: 0, data: {} });
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/data$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const t = fam.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    const self = t.id === me.id;
    if (method === 'GET') {
      // Not joined yet: whoever added them (and brought their data over) holds it until they do.
      const can = self || t.kind === 'pet' || (t.shareWith || []).includes(me.id) || (!t.uid && t.addedBy === me.id);
      if (!can) return json({ error: `${t.name} hasn't shared this with you`, locked: true }, 403);
      return json((await db.get(`data:${fam.fid}:${t.id}`)) || { savedAt: 0, data: {} });
    }
    if (method === 'PUT') {
      // Yours, a pet's, or (bringing data over) someone who hasn't joined yet.
      if (!(self || t.kind === 'pet' || (!t.uid && t.addedBy === me.id))) return json({ error: 'not allowed' }, 403);
      if (!body || typeof body.data !== 'object') return json({ error: 'expected {data}' }, 400);
      const savedAt = Date.now();
      const old = await db.get(`data:${fam.fid}:${t.id}`);
      const size = (x) => JSON.stringify(x || {}).length;
      if (old && size(old.data) > 500 && size(body.data) < size(old.data) * 0.7) await db.put(`dataprev:${fam.fid}:${t.id}`, old, 90 * 86400);
      await db.put(`data:${fam.fid}:${t.id}`, { savedAt, data: body.data });
      return json({ ok: true, savedAt });
    }
  }

  // ---- invites ----
  m = path.match(/^\/families\/([a-z0-9]+)\/invites$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (body.kind === 'member') {
      const t = fam.members.find((x) => x.id === body.memberId && x.kind === 'person' && !x.uid);
      if (!t) return json({ error: 'not found' }, 404);
      const email = emailOf(body.email) || t.email;
      if (!email) return json({ error: 'add their email' }, 400);
      t.email = email; await db.put(`family:${fam.fid}`, fam);
      return json({ invite: await makeInvite(db, { kind: 'member', fid: fam.fid, memberId: t.id, email, by: me.id, byName: me.name, familyName: fam.name }) });
    }
    const email = emailOf(body.email);
    if (!email) return json({ error: 'add their email' }, 400);
    return json({ invite: await makeInvite(db, { kind: 'family', fid: fam.fid, email, by: me.id, byName: me.name, familyName: fam.name, note: clean(body.note, 140) }) });
  }
  m = path.match(/^\/invites\/([a-z0-9]{12,40})(\/accept)?$/);
  if (m) {
    const inv = await db.get(`invite:${m[1]}`);
    if (!inv) return json({ error: 'this invite has expired or was already used' }, 404);
    const mine = inv.email === user.email;
    if (!m[2] && method === 'GET') return json({ invite: { kind: inv.kind, familyName: inv.familyName, byName: inv.byName, email: inv.email, forYou: mine, note: inv.note || '' } });
    if (m[2] && method === 'POST') {
      if (!mine) return json({ error: `this invite is for ${inv.email} — sign in with that Google account` }, 403);
      const fam = await db.get(`family:${inv.fid}`);
      if (!fam) return json({ error: 'that family no longer exists' }, 404);
      if (inv.kind === 'member') {
        const t = fam.members.find((x) => x.id === inv.memberId);
        if (!t) return json({ error: 'that spot was removed' }, 404);
        if (fam.members.some((x) => x.uid === user.uid)) { await db.del(`invite:${m[1]}`); return json({ family: familyOut(fam, user) }); }
        t.uid = user.uid; t.email = user.email; if (!t.avatar && user.picture) t.avatar = user.picture;
        await db.put(`family:${fam.fid}`, fam);
        if (!user.families.includes(fam.fid)) { user.families.push(fam.fid); await saveUser(); }
        await db.del(`invite:${m[1]}`);
        return json({ family: familyOut(fam, user) });
      }
      // A friend's family: theirs (new, or one they already run) connects to the inviter's.
      let own = null;
      if (body.fid) own = (await families()).find((f) => f.fid === body.fid && meIn(f)?.role === 'owner');
      if (!own) {
        const name = clean(body.familyName, 40);
        if (!name) return json({ error: 'name your family' }, 400);
        own = { fid: randomId(), name, createdBy: user.uid, createdAt: Date.now(), connections: [], members: [
          { id: randomId(6), kind: 'person', uid: user.uid, email: user.email, name: clean(body.myName || user.name, 40), relation: 'self', role: 'owner', avatar: user.picture || '', shareWith: [] },
        ] };
        user.families.push(own.fid); await saveUser();
      }
      if (!own.connections.includes(fam.fid)) own.connections.push(fam.fid);
      if (!fam.connections.includes(own.fid)) fam.connections.push(own.fid);
      await db.put(`family:${own.fid}`, own);
      await db.put(`family:${fam.fid}`, fam);
      await db.del(`invite:${m[1]}`);
      return json({ family: familyOut(own, user), connectedTo: fam.name });
    }
  }

  // ---- the feed ----
  if (path === '/feed' && method === 'GET') {
    const fams = await families();
    const mineIds = new Set(fams.map((f) => f.fid));
    const sources = [...fams.map((f) => ({ fid: f.fid, own: true }))];
    for (const f of fams) for (const c of f.connections || []) if (!mineIds.has(c) && !sources.some((s) => s.fid === c)) sources.push({ fid: c, own: false });
    const posts = [];
    const blocked = new Set((user.blocked || []).map((b) => b.uid)), hidden = new Set(user.hidden || []);
    for (const s of sources) {
      const ids = ((await db.get(`feed:${s.fid}`)) || []).slice(0, 40);
      const fam = s.own ? fams.find((f) => f.fid === s.fid) : await db.get(`family:${s.fid}`);
      for (const id of ids) {
        const p = await db.get(`post:${s.fid}:${id}`);
        if (!p || (!s.own && p.audience !== 'connections')) continue;
        // A friends' family never sees posts about the kids (or pets) that family keeps private.
        if (!s.own && (p.tags || []).some((id) => { const x = fam?.members.find((y) => y.id === id); return x && !sharedWithFriends(fam, x); })) continue;
        if (blocked.has(p.byUid) || hidden.has(p.id)) continue;
        const owner = s.own && meIn(fam)?.role === 'owner';
        posts.push(postOut(p, user, { own: s.own, familyName: fam?.name || '', reported: owner ? (p.reports || 0) : 0, blocked }));
      }
    }
    posts.sort((a, b) => b.at - a.at);
    return json({ posts: posts.slice(0, 60) });
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/posts$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const text = clean(body.text, 2000).replace(/ {2,}/g, ' ');
    const photo = typeof body.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length < 2_500_000 ? body.photo : '';
    // 🙋 A request for help: pet sitting, babysitting, a ride… with the dates it's for.
    let help = null;
    if (body.help) {
      const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');
      help = { type: HELP[body.help.type] ? body.help.type : 'other', from: day(body.help.from), to: day(body.help.to) || day(body.help.from), time: clean(body.help.time, 40), offers: [], status: 'open' };
      if (!help.from) return json({ error: 'which day do you need help?' }, 400);
    }
    if (!text && !photo && !help) return json({ error: 'write something or add a photo' }, 400);
    const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '', text, photo,
      tags: (Array.isArray(body.tags) ? body.tags : []).filter((id) => fam.members.some((x) => x.id === id)).slice(0, 10),
      tagNames: {}, audience: body.audience === 'connections' ? 'connections' : 'family', likes: [], comments: [], at: Date.now(), ...(help ? { help } : {}) };
    post.tagKinds = {};
    for (const id of post.tags) { const x = fam.members.find((y) => y.id === id); post.tagNames[id] = x.name; post.tagKinds[id] = x.kind; }
    // Tagging a kid (or pet) the family keeps private keeps the post in the family.
    let note = '';
    if (post.audience === 'connections' && post.tags.some((id) => !sharedWithFriends(fam, fam.members.find((x) => x.id === id)))) {
      post.audience = 'family'; note = 'Kept in the family: it tags someone your family keeps private from friends.';
    }
    await db.put(`post:${fam.fid}:${post.id}`, post);
    await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
    return json({ post: postOut(post, user, { own: true, familyName: fam.name }), note });
  }
  m = path.match(/^\/posts\/([a-z0-9]+)\/([a-z0-9]+)(\/like|\/comments|\/report|\/hide|\/block|\/offer|\/accept)?$/);
  if (m) {
    const [, fid, id, action] = m;
    const p = await db.get(`post:${fid}:${id}`);
    if (!p) return json({ error: 'not found' }, 404);
    const fams = await families();
    const own = fams.find((f) => f.fid === fid);
    const viaConnection = !own && p.audience === 'connections' && fams.some((f) => (f.connections || []).includes(fid));
    if (!own && !viaConnection) return json({ error: 'not found' }, 404);
    const myName = own ? meIn(own).name : user.name;
    if (action === '/like' && method === 'POST') {
      p.likes = p.likes.includes(user.uid) ? p.likes.filter((u) => u !== user.uid) : [...p.likes, user.uid];
      await db.put(`post:${fid}:${id}`, p);
      return json({ liked: p.likes.includes(user.uid), likes: p.likes.length });
    }
    if (action === '/comments' && method === 'POST') {
      const text = clean(body.text, 500);
      if (!text) return json({ error: 'empty comment' }, 400);
      const c = { id: randomId(5), uid: user.uid, name: myName, text, at: Date.now() };
      p.comments = [...p.comments, c].slice(-200);
      await db.put(`post:${fid}:${id}`, p);
      return json({ comment: { id: c.id, name: c.name, text: c.text, at: c.at, mine: true } });
    }
    // Reporting hides it for you and flags it to the family's creator.
    if (action === '/report' && method === 'POST') {
      const list = (await db.get(`report:${fid}:${id}`)) || [];
      if (!list.some((r) => r.uid === user.uid)) list.push({ uid: user.uid, reason: clean(body.reason, 200), at: Date.now() });
      await db.put(`report:${fid}:${id}`, list);
      p.reports = list.length; await db.put(`post:${fid}:${id}`, p);
      user.hidden = [...new Set([id, ...(user.hidden || [])])].slice(0, 500); await saveUser();
      return json({ ok: true });
    }
    // Offering to help, and the one who asked picking who helps (which closes the request).
    if (action === '/offer' && method === 'POST' && p.help) {
      if (p.byUid === user.uid) return json({ error: "that's your own request" }, 400);
      const others = p.help.offers.filter((o) => o.uid !== user.uid);
      const myFam = own || fams.find((f) => (f.connections || []).includes(fid));
      p.help.offers = body.withdraw ? others : [...others, { id: randomId(6), uid: user.uid, name: myName, family: myFam?.name || '', msg: clean(body.msg, 140), at: Date.now() }].slice(-30);
      await db.put(`post:${fid}:${id}`, p);
      return json({ help: postOut(p, user, {}).help });
    }
    if (action === '/accept' && method === 'POST' && p.help) {
      if (p.byUid !== user.uid) return json({ error: 'only who asked can choose' }, 403);
      const o = p.help.offers.find((x) => (body.offer && x.id === body.offer) || (body.uid && x.uid === body.uid));
      p.help.status = o ? 'filled' : 'open'; p.help.helper = o ? { uid: o.uid, name: o.name, family: o.family } : null;
      await db.put(`post:${fid}:${id}`, p);
      return json({ help: postOut(p, user, {}).help });
    }
    if (action === '/hide' && method === 'POST') {
      user.hidden = [...new Set([id, ...(user.hidden || [])])].slice(0, 500); await saveUser();
      return json({ ok: true });
    }
    if (action === '/block' && method === 'POST') {
      if (!p.byUid || p.byUid === user.uid) return json({ error: "can't block that" }, 400);
      user.blocked = [...(user.blocked || []).filter((b) => b.uid !== p.byUid), { id: randomId(8), uid: p.byUid, name: p.byName }].slice(-200); await saveUser();
      return json({ blocked: blockedOut(user) });
    }
    if (!action && method === 'DELETE') {
      const mine = own && meIn(own).id === p.by;
      if (!(mine || (own && meIn(own).role === 'owner'))) return json({ error: 'not allowed' }, 403);
      await db.del(`post:${fid}:${id}`);
      await db.del(`report:${fid}:${id}`);
      await db.put(`feed:${fid}`, ((await db.get(`feed:${fid}`)) || []).filter((x) => x !== id));
      return json({ ok: true });
    }
  }
  return json({ error: 'not found' }, 404);
}

async function startSession(db, who) {
  let user = await db.get(`user:${who.uid}`);
  const oldPicture = user?.picture || '';
  user = { ...(user || { families: [], createdAt: Date.now() }), uid: who.uid, email: who.email, name: user?.name || who.name, picture: who.picture || user?.picture || '' };
  await db.put(`user:${user.uid}`, user);
  // A new Google profile picture replaces the old one in your families too (unless you chose
  // a different picture or emoji there).
  if (user.picture && user.picture !== oldPicture) {
    for (const fid of user.families) {
      const fam = await db.get(`family:${fid}`);
      const m = fam?.members.find((x) => x.uid === user.uid);
      if (m && (!m.avatar || m.avatar === oldPicture)) { m.avatar = user.picture; await db.put(`family:${fid}`, fam); }
    }
  }
  const token = randomId(32);
  await db.put(`session:${token}`, { uid: user.uid, at: Date.now() }, SESSION_TTL);
  // Remember the sign-ins (newest 10), so "sign out everywhere" can end them all.
  const live = [...(user.sessions || []).filter((x) => Date.now() - x.at < SESSION_TTL * 1000), { t: token, at: Date.now(), device: clean(who.device, 60) }];
  for (const x of live.slice(0, -10)) await db.del(`session:${x.t}`);
  user.sessions = live.slice(-10);
  await db.put(`user:${user.uid}`, user);
  return { token, user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture } };
}
async function makeInvite(db, inv) {
  const code = randomId(16);
  await db.put(`invite:${code}`, { ...inv, code, at: Date.now() }, INVITE_TTL);
  return { code, email: inv.email, kind: inv.kind, expires: Date.now() + INVITE_TTL * 1000 };
}
function familyOut(fam, user) {
  const me = fam.members.find((m) => m.uid === user.uid);
  return { fid: fam.fid, name: fam.name, me: me?.id || '', myRole: me?.role || '', modules: fam.modules || MODULES, goldPrize: fam.goldPrize || '', goldenPosts: fam.goldenPosts !== false, share: { kids: !!fam.share?.kids, pets: fam.share?.pets !== false }, connections: fam.connections || [], members: fam.members.map((m) => memberView(m, true)) };
}
const url = (req) => new URL(req.url);
// A post as one viewer sees it: no account ids (theirs or anyone else's), just "is it mine".
function postOut(p, user, { own = false, familyName = '', reported = 0, blocked = new Set() } = {}) {
  const { byUid, likes, comments, reports, help, ...rest } = p;
  return {
    ...rest, own, familyName, reported, mine: byUid === user.uid,
    liked: likes.includes(user.uid), likes: likes.length,
    comments: comments.filter((c) => !blocked.has(c.uid)).map((c) => ({ id: c.id, name: c.name, text: c.text, at: c.at, mine: c.uid === user.uid })),
    ...(help ? { help: {
      type: help.type, from: help.from, to: help.to, time: help.time, status: help.status,
      helper: help.helper ? { name: help.helper.name, family: help.helper.family, me: help.helper.uid === user.uid } : null,
      offered: help.offers.some((o) => o.uid === user.uid),
      // Only the one who asked sees who offered (and their notes); others just see how many.
      offers: byUid === user.uid ? help.offers.map((o) => ({ id: o.id || o.uid, name: o.name, family: o.family, msg: o.msg, at: o.at })) : [],
      offerCount: help.offers.length,
    } } : {}),
  };
}
const blockedOut = (user) => (user.blocked || []).map((b) => ({ id: b.id || b.uid, name: b.name }));
export const HELP = { petsit: '🐾 Pet sitting', babysit: '🧸 Babysitting', walk: '🦮 Dog walk', ride: '🚗 A ride', meal: '🍲 A meal', other: '🙋 A hand' };
// What a friends' family may see of someone: kids are private unless the family shares them,
// pets are shared unless the family keeps them private.
export function sharedWithFriends(fam, m) {
  if (!m) return true;
  const share = fam.share || {};
  if (m.kind === 'pet') return share.pets !== false;
  if (m.relation === 'child') return !!share.kids;
  return true;
}
// logs: {date: [care entries]}; people: family members. → per-person points and counts, the leaders.
export function choresRace(logs, people) {
  const by = Object.fromEntries(people.map((p) => [p.id, { id: p.id, name: p.name, points: 0, count: 0, kinds: {}, streak: 0 }]));
  const active = {};
  for (const [date, list] of Object.entries(logs)) for (const e of list) for (const id of e.by || []) {
    const r = by[id];
    if (!r) continue;
    r.points += POINTS[e.kind] ?? 0; r.count += 1; r.kinds[e.kind] = (r.kinds[e.kind] || 0) + 1;
    (active[id] ||= new Set()).add(date);
  }
  // Days in a row (ending on the last logged day of the month so far) each person did something.
  const dates = Object.keys(logs).sort();
  for (const r of Object.values(by)) {
    let n = 0;
    for (let i = dates.length - 1; i >= 0; i--) { if (active[r.id]?.has(dates[i])) n++; else if (i === dates.length - 1) continue; else break; }
    r.streak = n;
  }
  const board = Object.values(by).filter((r) => r.count || people.find((p) => p.id === r.id)?.uid).sort((a, b) => b.points - a.points || b.count - a.count);
  const top = board[0]?.points || 0;
  return { board, top, leaders: top > 0 ? board.filter((r) => r.points === top).map((r) => r.id) : [] };
}
// What the dogs call the people they're thanking. By default they're Mom & Dad: someone who
// hasn't set a name is the other of Mom / Dad when the rest have one, else it's "Mom & Dad".
export function petNames(people) {
  const set = people.filter((x) => x.petCalls).map((x) => x.petCalls);
  const unset = people.length - set.length;
  if (!unset) return set;
  const lower = set.map((x) => x.toLowerCase());
  const other = lower.includes('dad') && !lower.includes('mom') ? 'Mom' : lower.includes('mom') && !lower.includes('dad') ? 'Dad' : null;
  if (other && unset === 1) return [...set, other];
  return [...set.filter((x) => !['mom', 'dad'].includes(x.toLowerCase())), 'Mom', 'Dad'];
}
// The dogs' thank-you post for a golden day (once per day; the family can turn it off).
async function goldenDayPost(db, fam, date, list) {
  if (fam.goldenPosts === false || !(fam.modules || MODULES).includes('dogs')) return null;
  const dogs = fam.members.filter((x) => x.kind === 'pet' && x.species === 'dog');
  if (!dogs.length || (await db.get(`goldenpost:${fam.fid}:${date}`))) return null;
  await db.put(`goldenpost:${fam.fid}:${date}`, 1, 40 * 86400);
  // Thank whoever took them out or gave the treat, by what the dogs call them.
  const ids = [...new Set(list.filter((e) => ['walk', 'park', 'treat'].includes(e.kind)).flatMap((e) => e.by))];
  const people = petNames(ids.map((id) => fam.members.find((x) => x.id === id && x.kind === 'person')).filter(Boolean));
  const recent = (await db.get(`goldenmsg:${fam.fid}`)) || [];
  const { text, used } = goldenMessage({ pets: dogs.map((d) => d.name), people, day: dayHighlights(list), recent });
  await db.put(`goldenmsg:${fam.fid}`, [used, ...recent].slice(0, 4));
  const names = dogs.map((d) => d.name);
  const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: dogs[0].id, byUid: null, fromPets: dogs.map((d) => d.id), golden: date,
    byName: names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0], byAvatar: dogs[0].avatar || '', text, photo: '',
    tags: dogs.map((d) => d.id), tagNames: Object.fromEntries(dogs.map((d) => [d.id, d.name])), tagKinds: Object.fromEntries(dogs.map((d) => [d.id, 'pet'])),
    audience: 'family', likes: [], comments: [], at: Date.now() };
  await db.put(`post:${fam.fid}:${post.id}`, post);
  await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
  return post;
}
const shiftDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const MODULES = ['dogs', 'chores', 'feed', 'health', 'calendar'];

// Takes someone out of a family: their spot, their data, and (unless kept) their posts,
// comments and likes there.
async function removeMember(db, fam, t, { keepPosts = true } = {}) {
  fam.members = fam.members.filter((x) => x.id !== t.id);
  for (const x of fam.members) x.shareWith = (x.shareWith || []).filter((id) => id !== t.id);
  await db.put(`family:${fam.fid}`, fam);
  await db.del(`data:${fam.fid}:${t.id}`);
  await db.del(`dataprev:${fam.fid}:${t.id}`);
  for (const g of (await db.get(`bingogames:${fam.fid}`)) || []) await db.del(`bingocard:${fam.fid}:${g.id}:${t.id}`);
  for (const s of (await db.get(`picks:${fam.fid}`)) || []) await db.del(`pickcard:${fam.fid}:${s.id}:${t.id}`);
  if (keepPosts || !t.uid) return;
  // The family keeps its dog-care log, without their name on it.
  for (const d of (await db.get(`careidx:${fam.fid}`)) || []) {
    const list = (await db.get(`care:${fam.fid}:${d}`)) || [];
    if (!list.some((e) => e.by.includes(t.id))) continue;
    await db.put(`care:${fam.fid}:${d}`, list.map((e) => {
      if (!e.by.includes(t.id)) return e;
      const by = e.by.filter((id) => id !== t.id);
      return { ...e, by, byName: by.map((id) => fam.members.find((x) => x.id === id)?.name).filter(Boolean).join(' & ') || 'Former member' };
    }));
  }
  await scrubPosts(db, fam.fid, t.uid, t.id);
  for (const c of fam.connections || []) await scrubPosts(db, c, t.uid, null);
}
// Removes one person's posts (by member id) and comments / likes (by account) from a family's feed.
async function scrubPosts(db, fid, uid, memberId) {
  const ids = (await db.get(`feed:${fid}`)) || [];
  const keep = [];
  for (const id of ids) {
    const p = await db.get(`post:${fid}:${id}`);
    if (!p) continue;
    if ((memberId && p.by === memberId) || p.byUid === uid) { await db.del(`post:${fid}:${id}`); await db.del(`report:${fid}:${id}`); continue; }
    keep.push(id);
    const comments = p.comments.filter((c) => c.uid !== uid), likes = p.likes.filter((u) => u !== uid);
    if (comments.length !== p.comments.length || likes.length !== p.likes.length) await db.put(`post:${fid}:${id}`, { ...p, comments, likes });
  }
  if (keep.length !== ids.length) await db.put(`feed:${fid}`, keep);
}
// Everything a family has: posts, member data, the care log, and its links to other families.
async function deleteFamily(db, fam) {
  for (const id of (await db.get(`feed:${fam.fid}`)) || []) { await db.del(`post:${fam.fid}:${id}`); await db.del(`report:${fam.fid}:${id}`); }
  await db.del(`feed:${fam.fid}`);
  for (const x of fam.members) { await db.del(`data:${fam.fid}:${x.id}`); await db.del(`dataprev:${fam.fid}:${x.id}`); }
  for (const d of (await db.get(`careidx:${fam.fid}`)) || []) await db.del(`care:${fam.fid}:${d}`);
  await db.del(`careidx:${fam.fid}`);
  await db.del(`goldenmsg:${fam.fid}`);
  await db.del(`appts:${fam.fid}`);
  await db.del(`dogmonths:${fam.fid}`);
  for (const g of (await db.get(`bingogames:${fam.fid}`)) || []) for (const x of fam.members) await db.del(`bingocard:${fam.fid}:${g.id}:${x.id}`);
  await db.del(`bingogames:${fam.fid}`);
  await db.del(`bingopacks:${fam.fid}`);
  for (const s of (await db.get(`picks:${fam.fid}`)) || []) for (const x of fam.members) await db.del(`pickcard:${fam.fid}:${s.id}:${x.id}`);
  await db.del(`picks:${fam.fid}`);
  for (const c of fam.connections || []) {
    const o = await db.get(`family:${c}`);
    if (o) { o.connections = (o.connections || []).filter((f) => f !== fam.fid); await db.put(`family:${o.fid}`, o); }
  }
  for (const x of fam.members) if (x.uid) {
    const u = await db.get(`user:${x.uid}`);
    if (u) { u.families = u.families.filter((f) => f !== fam.fid); await db.put(`user:${u.uid}`, u); }
  }
  await db.del(`family:${fam.fid}`);
}
// Deleting an account: families you run pass to another grown-up who has joined (or are deleted
// with everything in them if there's nobody), you leave the rest, and your posts, comments,
// likes, data, sign-ins and account record are removed.
export async function deleteAccount(db, user) {
  const summary = { familiesDeleted: [], familiesHandedOver: [], familiesLeft: [] };
  for (const fid of user.families) {
    const fam = await db.get(`family:${fid}`);
    const me = fam?.members.find((x) => x.uid === user.uid);
    if (!me) continue;
    if (me.role === 'owner') {
      const next = fam.members.find((x) => x.kind === 'person' && x.uid && x.uid !== user.uid && x.relation !== 'child');
      if (!next) { await deleteFamily(db, fam); summary.familiesDeleted.push(fam.name); continue; }
      next.role = 'owner'; summary.familiesHandedOver.push({ family: fam.name, to: next.name });
    } else summary.familiesLeft.push(fam.name);
    await removeMember(db, fam, me, { keepPosts: false });
  }
  for (const x of user.sessions || []) await db.del(`session:${x.t}`);
  await db.del(`user:${user.uid}`);
  return { deleted: true, ...summary };
}

// ---------- help desk ----------
// Counts one use against a limit; false once it's used up.
async function underLimit(db, key, max, ttl) {
  const n = ((await db.get(key)) || 0) + 1;
  if (n > max) return false;
  await db.put(key, n, ttl);
  return true;
}
const isAdmin = (env, user) => !!user?.email && String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(user.email);
const appInfo = (app) => ({ version: clean(app?.version, 20), device: clean(app?.device, 60), page: clean(app?.page, 40) });
const TICKET_KINDS = ['sign-in', 'invite', 'data', 'bug', 'feature', 'other'];

// A problem for the maintainer, with the chat that led to it (only admins can read tickets).
export async function fileTicket(db, { user, input, app, transcript = [] }) {
  const ticket = {
    id: randomId(8), at: Date.now(), status: 'open',
    category: TICKET_KINDS.includes(input.category) ? input.category : 'other',
    summary: clean(input.summary, 120), details: clean(input.details, 2000),
    from: user ? { name: user.name, email: user.email, signedIn: true } : { name: '', email: emailOf(input.contact_email), signedIn: false },
    app: appInfo(app),
    transcript: transcript.slice(-8).map((x) => ({ role: x?.role === 'assistant' ? 'assistant' : 'user', text: clean(x?.text, 600) })),
  };
  await db.put(`ticket:${ticket.id}`, ticket, TICKET_TTL);
  await db.put('tickets', [ticket.id, ...((await db.get('tickets')) || [])].slice(0, 300));
  return { filed: true, ticket: ticket.id };
}

// Errors phones hit, counted per day by message and place — no account, no data, just the error.
async function noteGlitch(db, body) {
  const message = clean(body.message, 160), where = clean(body.where, 120);
  if (!message) return;
  const key = `glitch:${new Date().toISOString().slice(0, 10)}`;
  const day = (await db.get(key)) || {};
  const id = `${message}|${where}`.slice(0, 200);
  if (!day[id] && Object.keys(day).length >= 100) return;
  day[id] = { message, where, version: clean(body.version, 20), n: (day[id]?.n || 0) + 1, last: Date.now() };
  await db.put(key, day, 30 * 86400);
}

// What the help assistant's tools do — always for the person asking, never anyone else.
async function helpTool(db, env, { user, token, name, input, app, transcript, extra }) {
  if (name === 'report_problem') {
    const r = await fileTicket(db, { user, input, app, transcript });
    extra.filed = r.ticket;
    return r;
  }
  if (!user) return { error: 'not signed in' };
  const fams = (await Promise.all(user.families.map((f) => db.get(`family:${f}`)))).filter(Boolean);
  if (name === 'get_my_account') {
    return { name: user.name, google_email: user.email, devices_signed_in: (user.sessions || []).filter((x) => Date.now() - x.at < SESSION_TTL * 1000).length,
      terms_accepted: user.consent?.version === TERMS_VERSION, families: fams.length, blocked_people: (user.blocked || []).length };
  }
  if (name === 'list_my_families') {
    return { families: fams.map((f) => ({ family_id: f.fid, name: f.name, my_role: f.members.find((x) => x.uid === user.uid)?.role, sections: f.modules || MODULES,
      members: f.members.map((x) => { const v = memberView(x, true); return { member_id: v.id, name: v.name, kind: v.kind, relation: v.relation, status: v.status, ...(v.status === 'invited' ? { invite_email: v.email } : {}) }; }) })) };
  }
  if (name === 'resend_invite') {
    const fam = fams.find((f) => f.fid === input.family_id);
    const me = fam?.members.find((x) => x.uid === user.uid);
    if (!me) return { error: 'not one of your families' };
    if (me.relation === 'child') return { error: 'ask a grown-up in the family to send it' };
    const t = fam.members.find((x) => x.id === input.member_id && x.kind === 'person');
    if (!t) return { error: 'no such person in that family' };
    if (t.uid) return { error: `${t.name} has already joined` };
    const email = emailOf(input.email) || t.email;
    if (!email) return { error: 'they need a Google email first' };
    if (email !== t.email) { t.email = email; await db.put(`family:${fam.fid}`, fam); }
    const invite = await makeInvite(db, { kind: 'member', fid: fam.fid, memberId: t.id, email, by: me.id, byName: me.name, familyName: fam.name });
    const link = env.APP_ORIGIN ? `${new URL('family/', env.APP_ORIGIN)}#invite=${invite.code}` : '';
    extra.invite = { ...invite, name: t.name };
    return { sent_to: email, link, expires_in_days: 14, note: 'Share the link with them; it only works for that Google account.' };
  }
  if (name === 'sign_out_other_devices') {
    if (input.confirmed !== true) return { needs_confirmation: true, message: 'Ask them to confirm first.' };
    const others = (user.sessions || []).filter((x) => x.t !== token);
    for (const x of others) await db.del(`session:${x.t}`);
    user.sessions = (user.sessions || []).filter((x) => x.t === token);
    await db.put(`user:${user.uid}`, user);
    extra.signedOutOthers = true;
    return { signed_out_devices: others.length };
  }
  return { error: `unknown tool ${name}` };
}

// ---------- nightly maintenance (worker.js scheduled(), or Me › Maintainer › Run the check now) ----------
// Finds and repairs what a half-finished request can leave behind: people whose account is gone,
// accounts that lost the link to their family, families with no creator or nobody left, links to
// deleted families, expired sign-ins and filed problems. Writes a report for the maintainer.
export async function runMaintenance(env) {
  const kv = env.HOUSEHOLD, db = store(kv);
  const report = { at: Date.now(), counts: { families: 0, accounts: 0, people: 0, pets: 0, openTickets: 0 }, fixes: [], problems: [] };
  const fix = (s) => report.fixes.push(s);
  const keys = async (prefix) => {
    const out = [];
    let cursor;
    do {
      const r = await kv.list({ prefix, cursor });
      out.push(...r.keys.map((k) => k.name.slice(prefix.length)));
      cursor = r.list_complete === false ? r.cursor : null;
    } while (cursor);
    return out;
  };
  for (const fid of await keys('v2:family:')) {
    try {
      const fam = await db.get(`family:${fid}`);
      if (!fam) continue;
      for (const x of fam.members.filter((y) => y.uid)) {
        const u = await db.get(`user:${x.uid}`);
        if (!u) { await removeMember(db, fam, x, { keepPosts: false }); fix(`${fam.name}: removed ${x.name}, whose account was deleted`); continue; }
        if (!u.families.includes(fid)) { u.families.push(fid); await db.put(`user:${u.uid}`, u); fix(`${fam.name}: relinked ${x.name}'s account to the family`); }
      }
      const joined = fam.members.filter((y) => y.uid);
      if (!joined.length) { await deleteFamily(db, fam); fix(`deleted ${fam.name}: nobody with an account was left in it`); continue; }
      let changed = false;
      if (!fam.members.some((y) => y.role === 'owner' && y.uid)) {
        const next = joined.find((y) => y.kind === 'person' && y.relation !== 'child') || joined[0];
        for (const y of fam.members) if (y.role === 'owner') y.role = 'member';
        next.role = 'owner'; changed = true;
        fix(`${fam.name}: had no creator, ${next.name} is now in charge`);
      }
      const links = [];
      for (const c of fam.connections || []) if (await db.get(`family:${c}`)) links.push(c);
      if (links.length !== (fam.connections || []).length) { fam.connections = links; changed = true; fix(`${fam.name}: dropped links to deleted families`); }
      if (changed) await db.put(`family:${fam.fid}`, fam);
      report.counts.families++;
      report.counts.people += fam.members.filter((y) => y.kind === 'person').length;
      report.counts.pets += fam.members.filter((y) => y.kind === 'pet').length;
    } catch (err) { report.problems.push(`family ${fid}: ${err.message}`); }
  }
  for (const uid of await keys('v2:user:')) {
    try {
      const u = await db.get(`user:${uid}`);
      if (!u) continue;
      report.counts.accounts++;
      const keep = [];
      for (const f of u.families || []) if ((await db.get(`family:${f}`))?.members.some((y) => y.uid === uid)) keep.push(f);
      const live = (u.sessions || []).filter((x) => Date.now() - x.at < SESSION_TTL * 1000);
      if (keep.length !== (u.families || []).length || live.length !== (u.sessions || []).length) {
        if (keep.length !== (u.families || []).length) fix(`${u.name}: removed links to families they're no longer in`);
        u.families = keep; u.sessions = live;
        await db.put(`user:${uid}`, u);
      }
    } catch (err) { report.problems.push(`account: ${err.message}`); }
  }
  const ids = (await db.get('tickets')) || [];
  const tickets = (await Promise.all(ids.map((id) => db.get(`ticket:${id}`))));
  if (tickets.some((t) => !t)) await db.put('tickets', ids.filter((_, i) => tickets[i]));
  report.counts.openTickets = tickets.filter((t) => t?.status === 'open').length;
  await db.put('admin:report', report);
  await db.put('admin:history', [{ at: report.at, fixes: report.fixes.length, problems: report.problems.length, ...report.counts }, ...((await db.get('admin:history')) || [])].slice(0, 30));
  return report;
}
