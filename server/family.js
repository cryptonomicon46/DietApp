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
//   us:<fid>                   {plans: [{id, by, to, day, body, replies, done}], notes: [{id, by, to, body, at, hearts}], noteDays}  💞
//   events:<fid>               {events: [{id, by, date, start, end, allDay, repeat, skip, who, remind, body}], feeds: [{id, by, who, body}]}  📅
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
import { REPLIES, NOTE_DAYS, partnerOf, visibleTo, upcoming, agreed, streak } from './us.js';
import { APPT_TYPES, cleanAppt, nextDue, shiftWeeks, startOf, spending } from './appts.js';
import { parseSquares, makeCard, bingoLines, bingoPrompt, NEED, FREE } from './bingo.js';
import { EVENTS as PICK_EVENTS, OUTCOMES, locked as pickLocked, score as pickScore, parseCouples } from './picks.js';
import { blobStore, okPhotoId, photoKey, SIZES, quotaBytes, familyUsage, noteUsage, deletePhoto, deleteFamilyPhotos, blobMetaKey, ownsFiles } from './photos.js';
import { DEFAULT_AREA, areaKey, scoutArea } from './scout.js';
import { planOuting, swapStop } from './outing.js';
import { checkLinks } from './links.js';
import { threadRoutes } from './threads.js';
import { homeRoutes } from './home.js';
import { nudgeRoutes } from './nudges.js';
import { tvRoutes } from './tv.js';
import { movieRoutes } from './movies.js';
import { newsRoutes, runNews, editionDue } from './news.js';
import { albumRoutes } from './albums.js';
import { marketRoutes } from './market.js';
import { chatRoutes, ChatCore, runOp, PAGE as CHAT_PAGE } from './chat.js';
import { askClaude } from './scout.js';
import { aiCall, GatewayError } from './aiGateway.js';
import { readWorkout } from './workoutAi.js';
import { askPlan } from './planCoach.js';
import { lookRoutes, isLookBytes, forgetLooks, LOOK_IMG } from './look.js';
import { nameItem, findPieces } from './lookAi.js';
import { estimatePhoto, estimateText } from './dietAi.js';
import { routeTalk, answerDay, spokenSummary } from './talkAi.js';
import { cleanFacts, cleanTurns } from '../js/planCoach.js';
import { bookRoutes, bookLookupRoutes, bookCover, forgetReader } from './books.js';
import { travelRoutes } from './travel.js';
import { voiceRoutes, providerConfigured, spokenFor } from './voiceTts.js';
import { NOTIFY_KINDS, wants, okEndpoint, okSubKeys, vapidKeys, sendTo, uidsOf, adultsOf, runReminders } from './push.js';
import { ACCOUNT_TOOLS, GUEST_TOOLS, helpSystem, toMessages, runHelpAgent, offlineAnswer } from './helpAgent.js';

const SESSION_TTL = 30 * 86400;
const INVITE_TTL = 14 * 86400;
const RELATIONS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'relative', 'friend', 'other'];
const SPECIES = ['dog', 'cat', 'other'];
export const TERMS_VERSION = '2026-10';
// Dog care and house chores, with points by effort; the month's top scorer gets the Gold Card.
export const POINTS = { breakfast: 1, dinner: 1, walk: 2, park: 2, treat: 0, meds: 1, poop: 2, trash: 1, laundry: 3, groceries: 3, cleaning: 4, dishes: 1, cook_b: 2, cook_l: 2, cook_d: 3 };
const CARE = Object.keys(POINTS);
// The family's own chores ("x_<id>"), added in the app: [{id, icon, label, pts, section, gone?}].
export const customPoints = (fam) => Object.fromEntries((fam.chores || []).map((c) => [`x_${c.id}`, c.pts]));
// Built-in chores a family has removed are in fam.hiddenChores (their history stays).
const isChore = (fam, kind) => (CARE.includes(kind) && !(fam.hiddenChores || []).includes(kind)) || (fam.chores || []).some((c) => !c.gone && `x_${c.id}` === kind);
const MAX_WRITES_PER_MIN = 120;

const HELP_PER_MIN = 10, HELP_PER_DAY = 80;
const TICKET_TTL = 180 * 86400;

const enc = new TextEncoder();
const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
export const randomId = (bytes = 9) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
// 🔐 End-to-end encrypted text ("e1:…", sealed on a family member's device with the family key
// — see family/crypto.js). The server stores it as-is and can't read it. Once a family turns
// encryption on (fam.e2ee), the private fields only accept sealed text.
const SEALED_RE = /^e1:[A-Za-z0-9_-]+$/;
const sealed = (v, max) => (typeof v === 'string' && v.length <= max && SEALED_RE.test(v) ? v : null);
// A private text field: sealed text, or (families not yet encrypted) plain text.
const privText = (fam, v, max) => sealed(v, max * 2 + 200) ?? (fam?.e2ee ? '' : clean(v, max));
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
  // Invites are matched by email, so the address must be one Google has verified (older tokens
  // say "true" as a string). A token issued in the future (beyond 5 minutes of clock drift) is refused.
  if (!payload.email || !(payload.email_verified === true || payload.email_verified === 'true')) throw new Error('email not verified');
  if (payload.iat != null && !(payload.iat * 1000 <= Date.now() + 300e3)) throw new Error('token issued in the future');
  return { uid: `g${payload.sub}`, email: payload.email.toLowerCase(), name: clean(payload.name || payload.email.split('@')[0], 60), picture: clean(payload.picture, 300) };
}

// ---------- storage helpers ----------
const store = (kv) => ({
  get: async (k) => { const v = await kv.get(`v2:${k}`); return v ? JSON.parse(v) : null; },
  put: (k, v, ttl) => kv.put(`v2:${k}`, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined),
  del: (k) => kv.delete(`v2:${k}`),
});

// 💪 Who sees a person's Diet and Fitness: two lists they set themselves (private by default).
// Before 2.0 there was one list ("shareWith"); it counts for both until they change either.
export const shareOf = (m) => ({ diet: m.share?.diet ?? m.shareWith ?? [], fitness: m.share?.fitness ?? m.shareWith ?? [] });
// Can `viewer` read `owner`'s part ('diet' | 'fitness' | 'us')? 'us' is the partner's alone.
export function canSeePart(fam, owner, viewer, part) {
  if (!owner || !viewer || owner.kind !== 'person') return false;
  if (owner.id === viewer.id) return true;
  if (part === 'us') return isCouple(fam, owner, viewer);
  return (part === 'diet' || part === 'fitness') && shareOf(owner)[part].includes(viewer.id);
}
// The couple, strictly: the family's creator and their spouse or partner, each the other's partner
// (partnerOf alone falls back to "someone" — fine for showing Us, not for granting data). Never a child.
export function isCouple(fam, a, b) {
  if (!a || !b || a.id === b.id || a.relation === 'child' || b.relation === 'child') return false;
  const couple = (x, y) => x.relation === 'self' && ['spouse', 'partner'].includes(y.relation);
  return (couple(a, b) || couple(b, a)) && partnerOf(fam, a)?.id === b.id && partnerOf(fam, b)?.id === a.id;
}
const HEALTH_PARTS = ['diet', 'fitness', 'us'];
// 🔑 Household areas (2.0 Phase 6): which parts of the family each member can use, chosen by the
// family's creator. No list = all of them (everyone who joined before keeps what they had); the
// creator always has all. Us stays the couple's, Health stays each person's own (above).
export const AREAS = ['home', 'calendar', 'threads'];
export const hasArea = (m, area) => !!m && (m.role === 'owner' || !Array.isArray(m.access) || m.access.includes(area));
const accessOf = (v) => (Array.isArray(v) ? AREAS.filter((a) => v.includes(a)) : null);
// The family routes each area covers.
const AREA_OF = { home: 'home', requests: 'home', groceries: 'home', chores: 'home', care: 'home', appts: 'home', dogstats: 'home', vaxdue: 'home', tidy: 'home', posts: 'home', events: 'calendar', calfeeds: 'calendar', threads: 'threads', boards: 'threads', albums: 'threads' };
// What a member looks like to someone else (no emails for people outside the family).
const memberView = (m, inside) => ({
  id: m.id, kind: m.kind, name: m.name, relation: m.relation, species: m.species, breed: m.breed, born: m.born,
  avatar: m.avatar, status: m.uid ? 'active' : m.email ? 'invited' : 'managed', role: m.role,
  ...(inside ? { email: m.email || '', shareWith: m.shareWith || [], share: m.kind === 'person' ? shareOf(m) : undefined, access: m.kind === 'person' ? AREAS.filter((a) => hasArea(m, a)) : undefined, legacyId: m.legacyId || '', petCalls: m.petCalls || '', ...(m.kind === 'pet' ? { editedAt: m.editedAt || m.addedAt || 0 } : {}) } : {}),
});

export async function familyApi(req, env, path, ctx = null) {
  const db = store(env.HOUSEHOLD);
  db.blobs = blobStore(env); // photo files go with the posts they belong to
  db.chat = env.CHAT || null; // 💬 each family's chats (chatHub.js)
  const json = (data, status = 200) => ({ status, data });
  const method = req.method;
  let body = {}, bytes = null;
  // 📸 A photo file (already locked on the phone): raw bytes, not JSON.
  if (method === 'PUT' && isLookBytes(path)) {
    // 👔 A Closet or Fit Check picture (locked on the phone in an encrypted family).
    bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > LOOK_IMG.full) return json({ error: 'that picture is too large' }, 413);
  } else if (method === 'PUT' && /^\/families\/[a-z0-9]+\/photos\/[a-z0-9]+$/.test(path)) {
    bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > (/[?&]size=doc\b/.test(req.url) ? SIZES.doc : SIZES.full)) return json({ error: /[?&]size=doc\b/.test(req.url) ? 'that PDF is too large (20 MB at most)' : 'that photo is too large' }, 413);
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const text = await req.text();
    if (text.length > 6_000_000) return json({ error: 'too large' }, 413);
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'not JSON' }, 400); }
  }

  if (path === '/config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || '', ready: !!env.GOOGLE_CLIENT_ID, supportEmail: env.SUPPORT_EMAIL || '', termsVersion: TERMS_VERSION, photos: !!blobStore(env),
    // 🔌 Which device connections are set up here (only whether; never the keys), so the app never offers a Connect that can't work.
    devices: { whoop: !!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET) }, ai: aiReady(env), voice: providerConfigured(env) });

  // 📚 A book cover (an image tag, so no sign-in): passed through from Open Library and cached.
  if (path.startsWith('/books/cover/') && method === 'GET') { const r = await bookCover({ path, env }); if (r) return r; }

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
        const r = await aiCall({ db, purpose: 'help.chat', input: { messages } }, (p) => runHelpAgent({ client, messages: p.messages, run, tools: user ? ACCOUNT_TOOLS : GUEST_TOOLS, system: helpSystem({ signedIn: !!user, name: user?.name, supportEmail }) }));
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
  // 🔔 A notification to other people's phones: sent after the answer when the connector can.
  const tell = (uids, kind, msg) => {
    const p = sendTo(db, env, uids, kind, msg).catch(() => 0);
    if (ctx?.waitUntil) { ctx.waitUntil(p); return null; }
    return p;
  };
  const dayWords = (d, today) => (d === today ? 'today' : d === shiftDay(today, 1) ? 'tomorrow' : `on ${new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`);

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
  // A friends' family's file: only one on a post or thread they shared with friends, while the
  // families are still connected, not from someone you blocked, and not tagging anyone kept private.
  const sharedFile = async (fid, pid, ref) => {
    const [, kind, id] = /^(post|thread):([a-z0-9]{4,40})$/.exec(ref || '') || [];
    // Reached through one of your families where you have Threads (the old feed's posts: any of them).
    if (!kind || !/^[a-z0-9]{6,24}$/.test(fid) || !(await families()).some((f) => (f.connections || []).includes(fid) && (kind === 'post' || hasArea(meIn(f), 'threads')))) return false;
    const blocked = new Set((user.blocked || []).map((b) => b.uid));
    if (kind === 'post') {
      const [p, owner] = await Promise.all([db.get(`post:${fid}:${id}`), db.get(`family:${fid}`)]);
      return !!p && !!owner && p.audience === 'connections' && p.photoId === pid && !blocked.has(p.byUid)
        && !(p.tags || []).some((t) => !sharedWithFriends(owner, owner.members.find((x) => x.id === t)));
    }
    const t = await db.get(`thread:${fid}:${id}`);
    return !!t && t.aud === 'connections' && !blocked.has(t.byUid) && [...(t.shots || []), ...(t.docs || []), ...t.replies.filter((r) => !blocked.has(r.uid)).flatMap((r) => r.shots || [])].some((x) => x.id === pid);
  };
  const loadFamily = async (fid) => {
    const fam = /^[a-z0-9]{6,24}$/.test(fid) ? await db.get(`family:${fid}`) : null;
    return fam && meIn(fam) ? fam : null;
  };
  // 🔑 One check for every route of a household area (not just hidden buttons).
  {
    const am = path.match(/^\/families\/([a-z0-9]+)\/([a-z]+)/);
    if (am && AREA_OF[am[2]]) {
      const fam = await loadFamily(am[1]);
      if (fam && !hasArea(meIn(fam), AREA_OF[am[2]])) return json({ error: "The family's creator hasn't given you this part of the family.", area: AREA_OF[am[2]] }, 403);
    }
  }

  if (path === '/me' && method === 'GET') {
    const fams = await families();
    return json({ user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture, needsConsent: !consented, termsVersion: TERMS_VERSION, blocked: blockedOut(user), isAdmin: isAdmin(env, user) }, families: fams.map((f) => familyOut(f, user)) });
  }

  // ---- 🔔 notifications: this account's phones, and what to send them ----
  if (path === '/push' && method === 'GET') {
    return json({ live: !env.DEMO, publicKey: env.DEMO ? '' : (await vapidKeys(db)).publicKey, devices: ((await db.get(`pushsub:${user.uid}`)) || []).map((x) => ({ device: x.device, at: x.at, endpoint: x.endpoint })),
      kinds: NOTIFY_KINDS, prefs: Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, wants(user, k)])) });
  }
  if (path === '/push/subscribe' && method === 'POST') {
    if (env.DEMO && !env.__push) return json({ error: 'notifications need the live connector' }, 400);
    if (!okEndpoint(body.endpoint) || !okSubKeys(body.keys)) return json({ error: "this phone's notification address doesn't look right" }, 400);
    const subs = ((await db.get(`pushsub:${user.uid}`)) || []).filter((x) => x.endpoint !== body.endpoint);
    subs.push({ endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, device: clean(body.device, 60), at: Date.now() });
    await db.put(`pushsub:${user.uid}`, subs.slice(-10));
    if (validTz(body.tz) && user.tz !== body.tz) { user.tz = body.tz; await saveUser(); }
    return json({ ok: true });
  }
  if (path === '/push/unsubscribe' && method === 'POST') {
    const subs = ((await db.get(`pushsub:${user.uid}`)) || []).filter((x) => x.endpoint !== body.endpoint);
    if (subs.length) await db.put(`pushsub:${user.uid}`, subs); else await db.del(`pushsub:${user.uid}`);
    return json({ ok: true });
  }
  if (path === '/push/prefs' && method === 'PUT') {
    user.notify = Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, body[k] !== false]));
    await saveUser();
    return json({ prefs: user.notify });
  }
  if (path === '/push/test' && method === 'POST') {
    if (!(await underLimit(db, `rate:${user.uid}:pushtest:${Math.floor(Date.now() / 60000)}`, 3, 120))) return json({ error: 'give it a minute' }, 429);
    const sent = await sendTo(db, env, [user.uid], null, { title: '🔔 OurPawmily', body: 'Notifications are working on this phone.', url: 'family/#me', tag: 'test' });
    return json({ sent });
  }

  // ---- 🤖 Ask Claude for a tracker command ("bench 3 sets of 8 at 135"), signed in ----
  if (path === '/assistant' && method === 'POST') {
    if ((env.DEMO && !env.__assist) || !(env.ANTHROPIC_API_KEY || env.__assist)) return json({ error: 'Claude is not set up on your connector — see server/README.md' }, 501);
    const text = String(body.text || '').trim();
    if (!text || text.length > 500) return json({ error: 'say a short command' }, 400);
    if (!(await underLimit(db, `rate:${user.uid}:assist:${new Date().toISOString().slice(0, 10)}`, 150, 86400 * 2))) return json({ error: "that's a lot of commands today — try again tomorrow" }, 429);
    const assist = env.__assist || (await import('./assistant.js')).assist;
    const context = body.context && typeof body.context === 'object' ? { day: body.context.day, exercises: body.context.exercises } : {};
    return json(await aiCall({ db, purpose: 'tracker.command', input: { text, context } }, (p) => assist(env, { text: p.text, context: p.context || {} })));
  }

  // ---- 📚 Read: book lookups (public details) and the family's books ----
  { const r = await bookLookupRoutes({ path, method, env, json, url, req, user, underLimit, db }); if (r) return r; }
  // ---- 🚗 Drive times with live traffic for day questions (Google Maps) ----
  { const r = await travelRoutes({ path, method, env, json, body, user, underLimit, db }); if (r) return r; }
  // ---- 🔊 The Pawmily voice (ElevenLabs pilot): answer text → audio, off unless the key is set ----
  { const r = await voiceRoutes({ path, method, env, json, body, user, underLimit, db, loadFamily, meIn, ctx }); if (r) return r; }
  { const r = await bookRoutes({ path, method, body, db, loadFamily, meIn, isCouple, sealed, randomId, json }); if (r) return r; }
  // ---- 👔 Look: your own Closet (yours alone), its pictures, and Fit Checks with your partner ----
  if (/^\/families\/[a-z0-9]+\/(members\/[a-z0-9]+\/look|fitchecks)/.test(path)) {
    const blobs = blobStore(env);
    const r = await lookRoutes({ path, method, body, bytes, db, user, loadFamily, meIn, partnerOf, isCouple, sealed, randomId, tell, json, url: () => url(req), blobs, usage: () => familyUsage(blobs, path.split('/')[2]), quota: quotaBytes(env) });
    if (r) return r;
  }

  // ---- 👔 Look with Claude: name one piece, or find the pieces in an outfit photo ----
  // Only that one picture goes, through the gateway; nothing is kept; the phone confirms each piece.
  if ((path === '/ai/look/item' || path === '/ai/look/pieces') && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'this needs Claude on the connector', off: true }, 501);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(body.mime)) return json({ error: 'a JPEG, PNG or WebP picture' }, 400);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(body.image || '').slice(-4096))) return json({ error: 'that picture didn\'t arrive whole' }, 400);
    const pieces = path.endsWith('pieces');
    try {
      return json(await aiCall({ db, purpose: pieces ? 'look.pieces' : 'look.item', input: { image: String(body.image), mime: body.mime }, who: user.uid, underLimit },
        async (payload) => (pieces ? findPieces : nameItem)(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' })));
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? 'that picture is too large' : e.message }, e.status);
      return json({ error: "Claude couldn't read that picture just now" }, 502);
    }
  }

  // ---- 🍽 Health: a meal from a photo or from "Tell me" (an estimate; nothing kept) ----
  if (path === '/ai/diet/photo' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'this needs Claude on the connector', off: true }, 501);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(body.mime)) return json({ error: 'a JPEG, PNG or WebP picture' }, 400);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(body.image || '').slice(-4096))) return json({ error: 'that picture didn\'t arrive whole' }, 400);
    const hint = ['plate', 'label', 'menu', 'restaurant'].includes(body.hint) ? body.hint : undefined;
    try {
      return json(await aiCall({ db, purpose: 'diet.photo', input: { image: String(body.image), mime: body.mime, hint }, who: user.uid, underLimit },
        async (payload) => estimatePhoto(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' })));
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? 'that picture is too large' : e.message }, e.status);
      return json({ error: "Claude couldn't read that picture just now" }, 502);
    }
  }
  // 🗣️ Talk to Pawmily (T1): one request the phone couldn't read itself → steps it knows, or a line.
  if (path === '/ai/talk' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'this needs Claude on the connector', off: true }, 501);
    const text = String(body.text || '').trim();
    if (text.length < 2) return json({ error: 'say what you need first' }, 400);
    const tab = ['home', 'us', 'calendar', 'threads', 'health', 'fitness', 'watch', 'read', 'me'].includes(body.tab) ? body.tab : 'home';
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : '';
    try {
      return json(await aiCall({ db, purpose: 'talk.route', input: { text, tab, today }, who: user.uid, underLimit },
        async (payload) => routeTalk(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' })));
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? "that's a lot at once — try one thing" : e.message }, e.status);
      return json({ error: "Pawmily couldn't read that just now" }, 502);
    }
  }
  // 🗣️ "Ask about my day" (T2a): the question and the day as the phone put it together → an answer.
  if (path === '/ai/talk/day' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'this needs Claude on the connector', off: true }, 501);
    const text = String(body.text || '').trim(), context = typeof body.context === 'string' ? body.context : JSON.stringify(body.context || {});
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : '';
    if (text.length < 2 || !today) return json({ error: 'ask a question first' }, 400);
    const now = /^\d{2}:\d{2}$/.test(body.now || '') ? body.now : '';
    try {
      const out = await aiCall({ db, purpose: 'talk.day', input: { text, today, now, context }, who: user.uid, underLimit },
        async (payload) => answerDay(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' }));
      // 🔊 Pawmily Voice (optional): a cloud-safe spoken summary + ticket, only from facts every owner
      // allowed. Any failure leaves the answer as it is — the phone reads it on the device.
      if (Array.isArray(body.voice?.facts) && body.voice.facts.length) {
        try {
          const fam = await loadFamily(String(body.fid || ''));
          if (fam) {
            const facts = body.voice.facts.slice(0, 60);
            const sp = await spokenFor({ env, db, fam, me: meIn(fam), facts, summarize: async (ok) => (await aiCall({ db, purpose: 'talk.spoken', input: { text, facts: JSON.stringify(ok.map((f) => ({ about: f.d, fact: f.v }))).slice(0, 6000) }, who: user.uid, underLimit },
              async (payload) => spokenSummary(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' }))) });
            out.spoken = sp.ticket ? { text: sp.text, ticket: sp.ticket } : null;
            out.voicePrivate = sp.private || null;
          }
        } catch { out.spoken = null; out.voicePrivate = 'error'; }
      }
      return json(out);
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? 'that day is too full to send at once' : e.message }, e.status);
      return json({ error: "Pawmily couldn't answer that just now" }, 502);
    }
  }
  if (path === '/ai/diet/text' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'this needs Claude on the connector', off: true }, 501);
    const text = String(body.text || '').trim();
    if (text.length < 2) return json({ error: 'say what you had first' }, 400);
    try {
      return json(await aiCall({ db, purpose: 'diet.text', input: { text }, who: user.uid, underLimit },
        async (payload) => estimateText(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' })));
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? 'that\'s a lot at once — try a shorter list' : e.message }, e.status);
      return json({ error: "Claude couldn't read that just now" }, 502);
    }
  }

  // ---- 📈 Ask about my plan (Claude explains; nothing is changed or kept) ----
  // The plan's numbers are rebuilt through the allowlist here, whatever the phone sent.
  if (path === '/ai/plan' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'Ask about my plan needs Claude on the connector', off: true }, 501);
    const question = String(body.question || '').trim();
    if (question.length < 2) return json({ error: 'ask a question first' }, 400);
    if (question.length > 500) return json({ error: 'that\'s a long question — try a shorter one' }, 413);
    const input = { facts: cleanFacts(body.facts), question, turns: cleanTurns(body.turns) };
    try {
      return json(await aiCall({ db, purpose: 'diet.coach', input, who: user.uid, underLimit },
        async (payload) => askPlan(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5' })));
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.message }, e.status);
      return json({ error: "Claude couldn't answer just now — try again in a moment" }, 502);
    }
  }

  // ---- 💬📷 Read a workout with Claude ("Describe it" when the phone couldn't, "From a photo") ----
  // Through the AI gateway: only the words or the one image and the weight unit go out; nothing is
  // kept here — the answer goes back to the phone's "Review Workout", which saves only when asked.
  if (path === '/ai/workout' && method === 'POST') {
    if (!aiReady(env)) return json({ error: 'reading workouts needs Claude on the connector', off: true }, 501);
    const photo = body.image != null;
    if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(body.mime)) return json({ error: 'a JPEG, PNG or WebP photo' }, 400);
    if (photo && !/^[A-Za-z0-9+/]+={0,2}$/.test(String(body.image).slice(-4096))) return json({ error: 'that photo didn\'t arrive whole' }, 400);
    if (!photo && String(body.text || '').trim().length < 3) return json({ error: 'describe the workout first' }, 400);
    const unit = body.unit === 'kg' ? 'kg' : 'lb';
    const input = photo ? { image: String(body.image), mime: body.mime, unit } : { text: String(body.text).trim(), unit };
    try {
      const out = await aiCall({ db, purpose: photo ? 'workout.photo' : 'workout.text', input, who: user.uid, underLimit },
        async (payload) => readWorkout(await claude(env), payload, { model: env.PARSE_MODEL || 'claude-sonnet-5-5', today: /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : '' }));
      return json(out);
    } catch (e) {
      if (e instanceof GatewayError) return json({ error: e.status === 413 ? (photo ? 'that photo is too large' : 'that\'s a lot of words — try a shorter description') : e.message }, e.status);
      return json({ error: photo ? "Couldn't read that photo — try a clearer one, or type it" : "Couldn't read that — try saying it another way" }, 502);
    }
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
    if (path === '/admin/scout' && method === 'GET') {
      const month = new Date().toISOString().slice(0, 7), key = areaKey(DEFAULT_AREA);
      return json({ runs: (await db.get(`scoutruns:${key}:${month}`)) || [], week: await db.get(`ideas:${key}`), keys: { ticketmaster: !!env.TICKETMASTER_KEY, seatgeek: !!env.SEATGEEK_CLIENT_ID, tmdb: !!env.TMDB_KEY, omdb: !!env.OMDB_KEY, gemini: !!env.GEMINI_API_KEY, claude: !!env.ANTHROPIC_API_KEY }, model: env.GEMINI_API_KEY ? `${env.GEMINI_MODEL || 'gemini-2.5-flash'} (Claude as backup)` : env.SCOUT_MODEL || 'claude-sonnet-5-5', searches: (await db.get(`searchruns:${month}`)) || {}, news: await db.get('news:latest').then((n) => n && { at: n.at, problems: n.problems, stories: Object.values(n.topics).reduce((k, l) => k + l.length, 0), rescue: n.rescue ? `${n.rescue.dogs.length} dogs, ${n.rescue.events.length} events (${n.rescue.day})` : '' }) });
    }
    // 🔗 Every link in this week's ideas, opened now (up to 40 — the free plan allows 50 a run).
    if (path === '/admin/links' && method === 'POST') {
      const week = await db.get(`ideas:${areaKey(DEFAULT_AREA)}`);
      if (!week) return json({ error: 'the scout hasn\'t run yet' }, 400);
      const links = week.ideas.flatMap((x) => [[x.url, x.title], [x.reserve, `${x.title} (OpenTable)`], ...(x.theatres || []).map((t) => [t.url, `${t.name} showtimes`])]).filter(([u]) => u);
      const r = await checkLinks(links.map(([u]) => u), env.__fetch || fetch, { max: 40 });
      const named = Object.values(r).map((x) => ({ ...x, title: links.find(([u]) => u === x.url)?.[1] || '' }));
      return json({ checked: named.length, total: new Set(links.map(([u]) => u)).size, broken: named.filter((x) => !x.ok), shy: named.filter((x) => x.ok && x.status >= 400) });
    }
    if (path === '/admin/scout/run' && method === 'POST') {
      if (env.DEMO && !env.__anthropic) return json({ error: 'the scout runs on the live connector' }, 400);
      return json(await runScout(env, { db, force: body.force !== false, refresh: !!body.refresh }));
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
    if (path === '/admin/news/run' && method === 'POST') {
      if (env.DEMO && !env.__anthropic && !env.GEMINI_API_KEY) return json({ error: 'the news runs on the live connector' }, 400);
      return json(await runNews(env, db, { force: true }));
    }
    if (path === '/admin/maintenance' && method === 'POST') {
      if (!env.HOUSEHOLD.list) return json({ error: 'not available in the demo' }, 400);
      return json({ report: await runMaintenance(env) });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- your account: devices, a copy of your data, deleting it ----
  // 🎬 Movies (for whoever switches them on) and release alerts.
  { const r = await movieRoutes({ path, method, body, req, env, db, user, json }); if (r) return r; }
  // 📺 Episode dates (TMDB) for the shows you're watching.
  { const r = await tvRoutes({ path, method, req, env, json, url }); if (r) return r; }
  // 📰 Today's headlines and rescue news (one shared copy).
  { const r = await newsRoutes({ path, method, db, json }); if (r) return r; }
  // 📞 Check-in reminders ("call Mom every two weeks").
  { const today = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('today') || '') ? url(req).searchParams.get('today') : new Date().toISOString().slice(0, 10);
    const r = await nudgeRoutes({ path, method, body, db, user, json, today }); if (r) return r; }
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
        if (p.by === mine.id) posts.push({ text: p.text, photo: p.photo, ...(p.photoId ? { photoId: p.photoId } : {}), at: new Date(p.at).toISOString(), audience: p.audience, likes: p.likes.length, comments: p.comments.length, ...(p.pk ? { pk: p.pk } : {}) });
        for (const c of p.comments) if (c.uid === user.uid) comments.push({ text: c.text, at: new Date(c.at).toISOString(), ...(p.pk ? { pk: p.pk } : {}) });
      }
      out.families.push({ fid: f.fid, name: f.name, role: mine.role, me: memberView(mine, true), myData: (await db.get(`data:${f.fid}:${mine.id}`))?.data || {}, posts, comments,
        members: f.members.map((x) => ({ name: x.name, kind: x.kind, relation: x.relation })) });
    }
    return json(out);
  }
  if (path === '/account/delete' && method === 'POST') {
    if (body.confirm !== 'DELETE') return json({ error: 'type DELETE to confirm' }, 400);
    return json(await deleteAccount(db, user));
  }
  // 🔐 Your recovery backup: your family keys locked with your recovery phrase (on the phone).
  // The server keeps it so a new device can unlock it; without the phrase it's unreadable.
  if (path === '/account/keybackup') {
    if (method === 'GET') return json({ backup: (await db.get(`keybackup:${user.uid}`)) || null });
    if (method === 'PUT') {
      const b = body.backup;
      const ok = b && b.v === 1 && [b.salt, b.iv, b.ct].every((x) => typeof x === 'string' && /^[A-Za-z0-9_-]+$/.test(x)) && b.ct.length < 20000 && Number.isInteger(b.iter) && b.iter >= 100000;
      if (!ok) return json({ error: 'not a backup' }, 400);
      await db.put(`keybackup:${user.uid}`, { v: 1, salt: b.salt, iv: b.iv, ct: b.ct, iter: b.iter, at: Date.now() });
      return json({ ok: true });
    }
  }
  // 🚫 Blocking someone in your family (from a chat): their chats, threads and replies disappear for you.
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/block$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    const t = fam?.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    if (!t.uid || t.uid === user.uid) return json({ error: "can't block that" }, 400);
    user.blocked = [...(user.blocked || []).filter((b) => b.uid !== t.uid), { id: randomId(8), uid: t.uid, name: t.name }].slice(-200); await saveUser();
    return json({ blocked: blockedOut(user) });
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
      // 🔐 Turning on end-to-end encryption (one way): the key check proves which key is right.
      if (body.e2ee === true && !fam.e2ee) {
        if (!sealed(body.keyCheck, 300)) return json({ error: 'missing key check' }, 400);
        fam.e2ee = true; fam.keyCheck = body.keyCheck; fam.e2eeAt = Date.now();
      }
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
      if (fam.connkeys) delete fam.connkeys[body.fid];
      await db.put(`family:${fam.fid}`, fam);
      if (other) { other.connections = (other.connections || []).filter((f) => f !== fam.fid); if (other.connkeys) delete other.connkeys[fam.fid]; await db.put(`family:${other.fid}`, other); }
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
      if (!date || !isChore(fam, body.kind)) return json({ error: 'what and which day?' }, 400);
      const pets = (Array.isArray(body.pets) ? body.pets : []).filter((id) => fam.members.some((x) => x.id === id && x.kind === 'pet'));
      // Who did it: you, both of you, or the other one (either of you can log for the other).
      const adults = fam.members.filter((x) => x.kind === 'person' && x.uid && x.relation !== 'child').map((x) => x.id).slice(0, 2);
      const who = body.by === 'both' ? adults : adults.includes(body.by) && me.relation !== 'child' ? [body.by] : [me.id];
      const entry = { id: randomId(6), kind: body.kind, pets, by: who, byName: who.map((id) => fam.members.find((x) => x.id === id)?.name).join(' & '), loggedBy: me.id, note: clean(body.note, 80), at: Date.now() };
      const list = [...((await db.get(`care:${fam.fid}:${date}`)) || []), entry].slice(-100);
      await db.put(`care:${fam.fid}:${date}`, list);
      const idx = (await db.get(`careidx:${fam.fid}`)) || [];
      if (!idx.includes(date)) await db.put(`careidx:${fam.fid}`, [...idx, date].slice(-800));
      // ⭐ The day just turned golden: the dogs say thank you.
      const golden = ['walk', 'park', 'treat'].includes(entry.kind) && !isGolden(list.slice(0, -1)) && isGolden(list) ? await goldenDay(db, fam, date, list) : null;
      if (golden) await tell(adultsOf(fam, user.uid, 'home'), 'fun', { title: `⭐ A golden day! — ${golden.byName}`, body: golden.text, url: 'family/#home', tag: `golden-${date}` });
      return json({ entry, ...(golden ? { golden } : {}) });
    }
    // Bringing over the current app's history: replaces what an earlier import added, day by day.
    if (method === 'PUT' && !m[2]) {
      if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
      const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, 5000);
      const byDay = {};
      for (const e of entries) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !isChore(fam, e.kind)) continue;
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
    // 👫 After the fact: who did it changes (you, both of you, or the other one); points follow.
    if (method === 'PATCH' && m[2]) {
      const list = (await db.get(`care:${fam.fid}:${m[2]}`)) || [];
      const e = list.find((x) => x.id === m[3]);
      if (!e) return json({ error: 'not found' }, 404);
      const adults = fam.members.filter((x) => x.kind === 'person' && x.uid && x.relation !== 'child').map((x) => x.id).slice(0, 2);
      if (!(adults.includes(me.id) || e.by.includes(me.id) || me.role === 'owner')) return json({ error: 'ask a grown-up' }, 403);
      if (body.who === 'both' || body.both === true) e.by = adults; // family order, so it always reads the same
      else if (adults.includes(body.who)) e.by = [body.who];
      else e.by = [e.by.includes(me.id) ? me.id : e.by[0]];
      e.byName = e.by.map((id) => fam.members.find((x) => x.id === id)?.name).filter(Boolean).join(' & ');
      await db.put(`care:${fam.fid}:${m[2]}`, list);
      return json({ entry: e });
    }
    if (method === 'DELETE' && m[2]) {
      const list = (await db.get(`care:${fam.fid}:${m[2]}`)) || [];
      const e = list.find((x) => x.id === m[3]);
      if (!e) return json({ error: 'not found' }, 404);
      if (!(e.by.includes(me.id) || e.loggedBy === me.id || me.role === 'owner')) return json({ error: 'only who logged it can undo it' }, 403);
      await db.put(`care:${fam.fid}:${m[2]}`, list.filter((x) => x !== e));
      return json({ ok: true });
    }
  }

  // ---- 🏆 the month's chores race: points per person, and the Gold Card ----
  // ---- 📅 the family calendar: events (title, place and notes sealed in body) and linked calendars ----
  m = path.match(/^\/families\/([a-z0-9]+)\/(events|calfeeds)(?:\/(import|[a-z0-9]+))?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const key = `events:${fam.fid}`;
    const cal = (await db.get(key)) || { events: [], feeds: [] };
    const save = () => db.put(key, { events: cal.events.slice(-1000), feeds: cal.feeds.slice(-40) });
    const bodyOf = (v) => sealed(v, 6000) ?? (fam.e2ee ? null : (typeof v === 'object' && v ? JSON.stringify(v).slice(0, 3000) : null));
    const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');
    const hhmm = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? t : '');
    const who = (list) => (Array.isArray(list) ? list : []).filter((id) => fam.members.some((x) => x.id === id)).slice(0, 20);
    const REPEAT = ['', 'daily', 'weekly', 'biweekly', 'monthly', 'monthlyNth', 'monthlyLast', 'twiceMonthly', 'quarterly', 'yearly'];
    const fields = (b) => ({
      date: day(b.date), start: b.allDay ? '' : hhmm(b.start), end: b.allDay ? '' : hhmm(b.end), allDay: !!b.allDay,
      repeat: b.repeat && REPEAT.includes(b.repeat.kind) && b.repeat.kind ? { kind: b.repeat.kind, ...(day(b.repeat.until) ? { until: b.repeat.until } : {}), ...(Number.isInteger(+b.repeat.day2) && b.repeat.day2 ? { day2: +b.repeat.day2 } : {}) } : null,
      skip: (Array.isArray(b.skip) ? b.skip : []).filter(day).slice(-100), who: who(b.who), remind: [0, 10, 30, 60, 120, 1440].includes(+b.remind) && b.remind !== '' && b.remind != null ? +b.remind : null,
    });
    if (m[2] === 'events' && !m[3] && method === 'GET') return json(cal);
    if (me.relation === 'child' && method !== 'GET') return json({ error: 'ask a grown-up' }, 403);
    if (m[2] === 'events' && !m[3] && method === 'POST') {
      const b = bodyOf(body.body);
      const f = fields(body);
      if (!b) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      if (!f.date) return json({ error: 'which day?' }, 400);
      const ev = { id: randomId(8), by: me.id, ...f, body: b, at: Date.now(), updatedAt: Date.now() };
      cal.events.push(ev); await save();
      return json({ event: ev });
    }
    // The trackers' calendar events (each person brings theirs; a newer copy of the same event wins).
    if (m[2] === 'events' && m[3] === 'import' && method === 'POST') {
      let n = 0;
      for (const e of (Array.isArray(body.events) ? body.events : []).slice(0, 500)) {
        const b = bodyOf(e.body), f = fields(e), id = `t${String(e.id || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24)}`;
        if (!b || !f.date || id === 't') continue;
        const cur = cal.events.find((x) => x.id === id);
        if (cur && (cur.updatedAt || 0) >= (+e.updatedAt || 0)) continue;
        const ev = { id, by: me.id, ...f, body: b, at: +e.at || Date.now(), updatedAt: +e.updatedAt || Date.now(), src: 'import' };
        if (cur) Object.assign(cur, ev); else cal.events.push(ev);
        n++;
      }
      await save();
      return json({ imported: n });
    }
    if (m[2] === 'events' && m[3]) {
      const ev = cal.events.find((x) => x.id === m[3]);
      if (!ev) return json({ error: 'that event is gone' }, 404);
      if (method === 'PATCH') {
        Object.assign(ev, fields({ ...ev, ...body }), body.body ? { body: bodyOf(body.body) || ev.body } : {}, { updatedAt: Date.now() });
        await save();
        return json({ event: ev });
      }
      if (method === 'DELETE') { cal.events = cal.events.filter((x) => x !== ev); await save(); return json({ ok: true }); }
    }
    // Linked calendars (iCloud / Google links, sealed): your list replaces your old one.
    if (m[2] === 'calfeeds' && !m[3] && method === 'PUT') {
      const mine = (Array.isArray(body.feeds) ? body.feeds : []).slice(0, 10).map((f) => ({ id: String(f.id || randomId(6)).replace(/[^a-z0-9]/gi, '').slice(0, 24) || randomId(6), by: me.id, who: f.who === 'both' ? 'both' : me.id, body: bodyOf(f.body) })).filter((f) => f.body);
      cal.feeds = [...cal.feeds.filter((f) => f.by !== me.id), ...mine];
      await save();
      return json({ feeds: cal.feeds });
    }
    return json({ error: 'not found' }, 404);
  }
  // A linked calendar's events: fetched here (phones can't read other sites), from calendar hosts only.
  // The secret link comes in the request body (POST), never in a URL that could end up in logs.
  if (path === '/ics' && method === 'POST') {
    if (!(await underLimit(db, `rate:${user.uid}:ics:${Math.floor(Date.now() / 60000)}`, 30, 120))) return json({ error: 'too many — try again in a minute' }, 429);
    let target;
    try { target = new URL(String(body.url || '').trim().replace(/^webcals?:/i, 'https:')); } catch { return json({ error: 'not a link' }, 400); }
    const host = target.hostname.toLowerCase();
    if (!(target.protocol === 'https:' && (host.endsWith('.icloud.com') || host === 'calendar.google.com' || host === 'outlook.live.com' || host === 'outlook.office365.com'))) return json({ error: 'only iCloud, Google or Outlook calendar links' }, 400);
    if (env.DEMO) return json({ error: 'linked calendars need the live connector' }, 400);
    const res = await fetch(target.toString(), { headers: { Accept: 'text/calendar' }, redirect: 'follow' });
    if (!res.ok) return json({ error: `calendar link answered ${res.status}` }, 502);
    const text = await res.text();
    if (text.length > 5_000_000) return json({ error: 'calendar too large' }, 413);
    if (!text.includes('BEGIN:VCALENDAR')) return json({ error: 'that link is not a calendar' }, 422);
    return json({ ics: text });
  }

  // ---- 💞 just us: feeling-like plans and post-it notes ----
  m = path.match(/^\/families\/([a-z0-9]+)\/us(?:\/(plans|notes|import)(?:\/([a-z0-9]+)(\/reply|\/heart)?)?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const [, , what, id, act] = m;
    const key = `us:${fam.fid}`;
    const us = (await db.get(key)) || { plans: [], notes: [], noteDays: {} };
    const today = /^\d{4}-\d{2}-\d{2}$/.test(url(req).searchParams.get('today') || '') ? url(req).searchParams.get('today') : new Date().toISOString().slice(0, 10);
    const save = () => { const cut = Date.now() - NOTE_DAYS * 864e5; us.notes = us.notes.filter((n) => n.at >= cut || n.hearts?.length).slice(-200); us.plans = us.plans.slice(-300); return db.put(key, us); };
    const partner = partnerOf(fam, me);
    const recipients = (aud) => (aud === 'family' ? fam.members.filter((x) => x.kind === 'person' && x.id !== me.id).map((x) => x.id) : partner ? [partner.id] : []);
    const bodyOf = (v) => sealed(v, 8000) ?? (fam.e2ee ? null : (typeof v === 'object' && v ? JSON.stringify(v).slice(0, 4000) : null));
    if (!what && method === 'GET') {
      const mine = (x) => visibleTo(x, me.id);
      const plans = us.plans.filter(mine).filter((p) => upcoming(p, today) || p.day >= shiftDay(today, -21)).map((p) => ({ ...p, agreed: agreed(p) }));
      return json({ plans, notes: us.notes.filter(mine), streak: streak(us.noteDays?.[me.id] || [], today), theirStreak: partner ? streak(us.noteDays?.[partner.id] || [], today) : 0, partner: partner ? { id: partner.id, name: partner.name } : null });
    }
    if (what === 'plans' && !id && method === 'POST') {
      const b = bodyOf(body.body);
      if (!b) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day || '')) return json({ error: 'which day?' }, 400);
      const to = recipients(body.audience);
      if (!to.length) return json({ error: 'add your partner to the family first' }, 400);
      const plan = { id: randomId(8), by: me.id, to, audience: body.audience === 'family' ? 'family' : 'couple', day: body.day, weekend: !!body.weekend, body: b, replies: {}, done: false, at: Date.now() };
      us.plans.push(plan); await save();
      await tell(uidsOf(fam, to, user.uid), 'us', { title: `💞 ${me.name} is feeling like something`, body: `For ${plan.weekend ? 'this weekend' : dayWords(plan.day, today)} — tap to answer`, url: 'family/#us', tag: `plan-${plan.id}` });
      return json({ plan });
    }
    if (what === 'notes' && !id && method === 'POST') {
      const b = bodyOf(body.body);
      if (!b) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      const to = recipients('couple');
      const note = { id: randomId(8), by: me.id, to, body: b, at: Date.now(), hearts: [] };
      us.notes.push(note);
      us.noteDays = { ...(us.noteDays || {}), [me.id]: [...new Set([...(us.noteDays?.[me.id] || []), today])].slice(-400) };
      await save();
      await tell(uidsOf(fam, to, user.uid), 'us', { title: `💌 ${me.name} left you a note`, body: 'Tap to read it', url: 'family/#us', tag: `note-${note.id}` });
      return json({ note });
    }
    // Bringing over the trackers' "Feeling like" plans, replies and notes (each person their own).
    if (what === 'import' && method === 'POST') {
      const to = recipients('couple');
      let n = 0;
      for (const p of (Array.isArray(body.plans) ? body.plans : []).slice(0, 200)) {
        const b = bodyOf(p.body), pid = `t${String(p.id || '').replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
        if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(p.day || '') || us.plans.some((x) => x.id === pid)) continue;
        us.plans.push({ id: pid, by: me.id, to, audience: 'couple', day: p.day, weekend: !!p.weekend, body: b, replies: us.pending?.[pid] || {}, done: !!p.done, at: +p.at || Date.now(), src: 'import' }); n++;
      }
      // My answers to my partner's plans: on their plan if it's here, else kept until it arrives.
      for (const [pid0, r] of Object.entries(body.replies || {})) {
        if (!REPLIES.includes(r?.r)) continue;
        const pid = `t${String(pid0).replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
        const plan = us.plans.find((x) => x.id === pid);
        if (plan) plan.replies = { ...plan.replies, [me.id]: { r: r.r, at: +r.at || Date.now() } };
        else us.pending = { ...(us.pending || {}), [pid]: { ...(us.pending?.[pid] || {}), [me.id]: { r: r.r, at: +r.at || Date.now() } } };
      }
      for (const nt of (Array.isArray(body.notes) ? body.notes : []).slice(0, 100)) {
        const b = bodyOf(nt.body), nid = `t${String(nt.id || '').replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
        if (!b || us.notes.some((x) => x.id === nid) || !(+nt.at > Date.now() - NOTE_DAYS * 864e5)) continue;
        us.notes.push({ id: nid, by: me.id, to, body: b, at: +nt.at, hearts: [] }); n++;
      }
      const days = (Array.isArray(body.noteDays) ? body.noteDays : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      us.noteDays = { ...(us.noteDays || {}), [me.id]: [...new Set([...(us.noteDays?.[me.id] || []), ...days])].sort().slice(-400) };
      await save();
      return json({ imported: n });
    }
    const list = what === 'plans' ? us.plans : us.notes;
    const item = list.find((x) => x.id === id);
    if (!item || !visibleTo(item, me.id)) return json({ error: 'not found' }, 404);
    if (what === 'plans' && act === '/reply' && method === 'POST') {
      if (!item.to.includes(me.id)) return json({ error: "it's your own plan" }, 400);
      if (item.replies[me.id]?.r === body.r || !REPLIES.includes(body.r)) delete item.replies[me.id];
      else item.replies[me.id] = { r: body.r, at: Date.now() };
      await save();
      if (item.replies[me.id]) {
        const said = { in: "🙌 is in", maybe: '🤔 says maybe', later: '⏰ says another time' }[body.r];
        await tell(uidsOf(fam, [item.by], user.uid), 'us', agreed(item) ? { title: "🎉 It's a plan!", body: `${me.name} is in`, url: 'family/#us', tag: `plan-${item.id}` } : { title: `${me.name} ${said}`, body: 'About your plan', url: 'family/#us', tag: `plan-${item.id}` });
      }
      return json({ plan: { ...item, agreed: agreed(item) } });
    }
    if (what === 'notes' && act === '/heart' && method === 'POST') {
      item.hearts = item.hearts.includes(me.id) ? item.hearts.filter((x) => x !== me.id) : [...item.hearts, me.id];
      await save();
      return json({ note: item });
    }
    if (item.by !== me.id) return json({ error: 'only who made it can change it' }, 403);
    if (method === 'PATCH') {
      if (body.done != null) item.done = !!body.done;
      if (body.body) { const b = bodyOf(body.body); if (b) item.body = b; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.day || '')) { item.day = body.day; item.replies = {}; }
      await save();
      return json({ [what === 'plans' ? 'plan' : 'note']: item });
    }
    if (method === 'DELETE') { const i = list.indexOf(item); list.splice(i, 1); await save(); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  }

  // ---- 🍿 what we watch: shows and movies (title and service sealed), nights, progress, ratings ----
  m = path.match(/^\/families\/([a-z0-9]+)\/watch(?:\/(shows|import)(?:\/([a-z0-9]+)(\/night)?)?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const [, , what, id, act] = m;
    const key = `watch:${fam.fid}`;
    const w = (await db.get(key)) || { shows: [], nights: [], status: {}, ratings: {}, progress: {} };
    const save = () => db.put(key, { ...w, shows: w.shows.slice(-500), nights: w.nights.slice(-3000) });
    const bodyOf = (v) => sealed(v, 4000) ?? (fam.e2ee ? null : (typeof v === 'object' && v ? JSON.stringify(v).slice(0, 2000) : null));
    const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');
    // 2.0: Want to Watch ('want'; 'upnext' is its ⭐ Up Next) → Watching → Watched ('finished'); 'dropped' kept apart.
    const STATUSES = ['want', 'watching', 'upnext', 'finished', 'dropped'];
    // 🔒 A show is the couple's own unless it's shared with the family ("aud": "family"). Older
    // shows (no aud) stay as they were: the family's.
    const couple = [me.id, partnerOf(fam, me)?.id].filter(Boolean);
    const sees = (x) => !x.aud || x.aud === 'family' || (x.to || []).includes(me.id);
    if (!what && method === 'GET') {
      const ids = new Set(w.shows.filter(sees).map((x) => x.id));
      const only = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => ids.has(k)));
      return json({ shows: w.shows.filter(sees), nights: w.nights.filter((n) => ids.has(n.show)), status: only(w.status), ratings: only(w.ratings), progress: only(w.progress) });
    }
    if (what === 'shows' && !id && method === 'POST') {
      const b = bodyOf(body.body);
      if (!b) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      const show = { id: randomId(8), by: me.id, body: b, at: Date.now(), aud: body.aud === 'family' ? 'family' : 'us', to: body.aud === 'family' ? [] : couple };
      w.shows.push(show);
      // Where it starts: Want to Watch, Watching or Watched (older apps send nothing).
      if (STATUSES.includes(body.status)) w.status[show.id] = { s: body.status, at: Date.now(), date: day(body.date) || new Date().toISOString().slice(0, 10), by: me.id };
      await save();
      return json({ show, status: w.status[show.id] || null });
    }
    // Bringing over the trackers' 📺 Watching: your shows, your nights, your ratings and status changes.
    if (what === 'import' && method === 'POST') {
      const tid = (x) => `t${String(x || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}`;
      let n = 0;
      for (const sh of (Array.isArray(body.shows) ? body.shows : []).slice(0, 500)) {
        const b = bodyOf(sh.body), sid = tid(sh.id);
        if (!b || sid === 't' || w.shows.some((x) => x.id === sid)) continue;
        w.shows.push({ id: sid, by: me.id, body: b, at: +sh.at || Date.now(), src: 'import', aud: 'us', to: couple }); n++;
      }
      for (const nt of (Array.isArray(body.nights) ? body.nights : []).slice(0, 3000)) {
        const sid = tid(nt.show), d = day(nt.date);
        if (!d || w.nights.some((x) => x.show === sid && x.date === d)) continue;
        w.nights.push({ show: sid, date: d, by: me.id, at: +nt.at || Date.now() });
      }
      for (const [k, st] of Object.entries(body.status || {})) {
        const sid = tid(k);
        if (![...STATUSES, 'deleted'].includes(st?.s) || (w.status[sid]?.at || 0) >= (+st.at || 0)) continue;
        w.status[sid] = { s: st.s, at: +st.at || Date.now(), date: day(st.date), by: me.id };
      }
      for (const [k, r] of Object.entries(body.ratings || {})) if (Number.isInteger(+r) && +r >= 1 && +r <= 5) w.ratings[tid(k)] = { ...(w.ratings[tid(k)] || {}), [me.id]: +r };
      await save();
      return json({ imported: n });
    }
    const show = w.shows.find((x) => x.id === id);
    if (!show || !sees(show)) return json({ error: 'that show is gone' }, 404);
    if (act === '/night' && method === 'POST') {
      const d = day(body.date);
      if (!d) return json({ error: 'which night?' }, 400);
      const had = w.nights.find((x) => x.show === id && x.date === d);
      if (had && had.by !== me.id) return json({ error: `${fam.members.find((x) => x.id === had.by)?.name || 'Someone'} already logged that night` }, 400);
      w.nights = had ? w.nights.filter((x) => x !== had) : [...w.nights, { show: id, date: d, by: me.id, at: Date.now() }];
      await save();
      return json({ nights: w.nights.filter((x) => x.show === id) });
    }
    if (!act && method === 'PATCH') {
      if (body.body) { const b = bodyOf(body.body); if (b) show.body = b; }
      // Share with the family, or keep it just the two of you (either of you can change it).
      if (body.aud === 'family') { show.aud = 'family'; show.to = []; }
      if (body.aud === 'us') { show.aud = 'us'; show.to = couple; }
      if (STATUSES.includes(body.status)) w.status[id] = { s: body.status, at: Date.now(), date: day(body.date) || new Date().toISOString().slice(0, 10), by: me.id };
      if (body.rating !== undefined) {
        const r = { ...(w.ratings[id] || {}) };
        if (Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5) r[me.id] = body.rating; else delete r[me.id];
        w.ratings[id] = r;
      }
      if (body.progress) {
        const se = Math.max(0, Math.min(99, Math.round(+body.progress.s || 0))), ep = Math.max(0, Math.min(999, Math.round(+body.progress.e || 0)));
        w.progress[id] = { s: se, e: ep, at: Date.now(), by: me.id };
      }
      // "＋ Watched an episode": tonight is logged once (never un-logged by a second episode).
      const night = day(body.night);
      if (night && !w.nights.some((x) => x.show === id && x.date === night)) w.nights.push({ show: id, date: night, by: me.id, at: Date.now() });
      await save();
      return json({ show, status: w.status[id] || null, ratings: w.ratings[id] || {}, progress: w.progress[id] || null, nights: w.nights.filter((x) => x.show === id) });
    }
    if (!act && method === 'DELETE') {
      if (show.by !== me.id && me.role !== 'owner') return json({ error: 'only who added it can delete it' }, 403);
      w.shows = w.shows.filter((x) => x !== show); w.nights = w.nights.filter((x) => x.show !== id);
      delete w.status[id]; delete w.ratings[id]; delete w.progress[id];
      await save();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- 🧭 plan an outing (Claude with web search; only the place, day, chips and home town go out) ----
  // A plan runs as a job: the phone names it (a hash of what was asked), the result is kept a day
  // under that name — so a repeat is instant and free, and a phone that left can pick it up — and
  // the work carries on (ctx.waitUntil) if the phone goes away. If it did go away (it says so with
  // /notify), a notification says when it's ready.
  m = path.match(/^\/families\/([a-z0-9]+)\/outing(?:\/(swap)|\/job\/([a-z0-9]{8,40})(\/notify)?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    if (meIn(fam).relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    const [, , swap, jobId, notify] = m;
    const jkey = (id) => `job:${fam.fid}:${id}`;
    if (jobId && notify && method === 'POST') { await db.put(`jobnotify:${fam.fid}:${jobId}`, { uid: user.uid }, 3600); return json({ ok: true }); }
    if (jobId && method === 'GET') { const r = await db.get(jkey(jobId)); return r ? json(r) : json({ pending: true }, 404); }
    if (method !== 'POST' || jobId) return json({ error: 'not found' }, 404);
    const job = /^[a-z0-9]{8,40}$/.test(body.job || '') ? body.job : null;
    if (job) { const done = await db.get(jkey(job)); if (done) return json({ ...done, cached: true }); }
    const work = (async () => {
      const { job: _, ...asked } = body;
      const r = await aiCall({ db, purpose: swap ? 'outing.swap' : 'outing.plan', input: asked, who: user.uid, underLimit }, (p) => (swap ? swapStop : planOuting)(env, db, fam, p, (fam.ideas?.label || DEFAULT_AREA.label)));
      if (job && !r.error && !r.demo) {
        await db.put(jkey(job), { ...r, at: Date.now() }, 86400);
        const n = await db.get(`jobnotify:${fam.fid}:${job}`);
        if (n) await sendTo(db, env, [n.uid], 'us', { title: swap ? '🍽 Your picks are ready' : `🧭 Your ${r.outing?.title || 'outing'} plan is ready`, body: 'Tap to open it', url: 'family/#us', tag: `job-${job.slice(0, 12)}` }).catch(() => 0);
      }
      return r;
    })();
    ctx?.waitUntil?.(work.catch(() => {}));
    const r = await work.catch((e) => { if (e instanceof GatewayError) return { error: e.status === 413 ? 'that\'s a lot — say it more briefly' : e.message }; throw e; });
    return json(r, r.error ? 400 : 200);
  }

  // ---- 💡 date ideas: this week's for the family's area, settings, and private 💗 picks ----
  // A pick is a token the phones make from the idea (keyed with the family key in an encrypted
  // family), so the server can tell two picks match without knowing what was picked.
  m = path.match(/^\/families\/([a-z0-9]+)\/ideas(?:\/(settings|picks|matches)(?:\/([a-z0-9]{8,64}))?)?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam), partner = partnerOf(fam, me);
    const [, , what, tok] = m;
    const area = { ...DEFAULT_AREA, ...(fam.ideas || {}) };
    const pkey = `ideapicks:${fam.fid}`;
    const picks = (await db.get(pkey)) || { members: {}, matches: [] };
    const mineOnly = () => ({ mine: (picks.members[me.id] || []).map((x) => x.t), matches: picks.matches.filter((x) => x.who.includes(me.id) && !x.done) });
    if (!what && method === 'GET') {
      const week = await db.get(`ideas:${areaKey(area)}`);
      return json({ week: week ? { ...week, claude: undefined } : null, settings: { zip: area.zip, label: area.label, theatres: area.theatres, critic: area.critic, audience: area.audience }, ...mineOnly() });
    }
    if (me.relation === 'child' || !partner) return json({ error: 'date ideas are for a couple in the family' }, 403);
    if (what === 'settings' && method === 'PUT') {
      const next = { ...(fam.ideas || {}) };
      if (Array.isArray(body.theatres)) next.theatres = body.theatres.map((x) => clean(x, 60)).filter(Boolean).slice(0, 4);
      if (body.critic != null) next.critic = Math.max(0, Math.min(100, Math.round(+body.critic || 0)));
      if (body.audience != null) next.audience = Math.max(0, Math.min(100, Math.round(+body.audience || 0)));
      if (/^\d{5}$/.test(body.zip || '') && body.zip !== (next.zip || DEFAULT_AREA.zip)) {
        // Where that ZIP is (Open-Meteo's free place search) — the scout only ever gets this.
        const place = env.__geocode ? await env.__geocode(body.zip) : await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: body.zip, count: '1', country: 'US' })}`).then((r) => r.json()).then((j) => j.results?.[0]).catch(() => null);
        if (!place) return json({ error: "couldn't find that ZIP code" }, 400);
        Object.assign(next, { zip: body.zip, lat: place.latitude, lon: place.longitude, label: place.name || body.zip });
      }
      fam.ideas = next;
      await db.put(`family:${fam.fid}`, fam);
      return json({ settings: { ...DEFAULT_AREA, ...next } });
    }
    if (what === 'picks' && tok) {
      const list = (picks.members[me.id] || []).filter((x) => x.t !== tok);
      let match = null;
      if (method === 'POST') {
        const box = sealed(body.box, 3000) ?? (fam.e2ee ? null : (typeof body.box === 'object' && body.box ? JSON.stringify(body.box).slice(0, 2000) : null));
        if (!box) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
        list.push({ t: tok, box, at: Date.now() });
        const theirs = (picks.members[partner.id] || []).find((x) => x.t === tok);
        if (theirs && !picks.matches.some((x) => x.t === tok)) {
          match = { t: tok, who: [me.id, partner.id], boxes: { [me.id]: box, [partner.id]: theirs.box }, at: Date.now(), done: false };
          picks.matches = [match, ...picks.matches].slice(0, 60);
          await tell(uidsOf(fam, [partner.id], user.uid), 'us', { title: "💞 It's a match!", body: `You and ${me.name} both picked the same date idea — open Us to make it a plan`, url: 'family/#us', tag: `match-${tok.slice(0, 12)}` });
        }
      }
      picks.members[me.id] = list.slice(-200);
      await db.put(pkey, picks);
      return json({ ...mineOnly(), match });
    }
    if (what === 'matches' && tok && method === 'PATCH') {
      const x = picks.matches.find((y) => y.t === tok && y.who.includes(me.id));
      if (!x) return json({ error: 'not found' }, 404);
      if (body.done) x.done = true;
      await db.put(pkey, picks);
      return json(mineOnly());
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- 🐾 dog appointments: grooming, vet, vaccines… with drop-off and pick-up drivers ----
  m = path.match(/^\/families\/([a-z0-9]+)\/appts(?:\/([a-z0-9]+))?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const key = `appts:${fam.fid}`;
    const list = (await db.get(key)) || [];
    const save = (l) => db.put(key, l.sort((a, b) => startOf(a).localeCompare(startOf(b))).slice(-300));
    const ctx = { petIds: fam.members.filter((x) => x.kind === 'pet').map((x) => x.id), memberIds: fam.members.filter((x) => x.kind === 'person').map((x) => x.id), clean, text: (v, max) => privText(fam, v, max) };
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
      const open = (a.dropAt && !a.dropBy) || (a.pickAt && !a.pickBy);
      const start = startOf(a);
      await tell(adultsOf(fam, user.uid, 'home'), 'appts', { title: `${APPT_TYPES[a.type].icon} ${me.name} booked ${APPT_TYPES[a.type].label.toLowerCase()} for ${a.pets.map((id) => fam.members.find((x) => x.id === id)?.name).filter(Boolean).join(' & ')}`,
        body: `${new Date(`${start.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}${open ? ' — can you drive?' : ''}`, url: 'family/#home', tag: `appt-${a.id}` });
      return json({ appt: a });
    }
    const a = list.find((x) => x.id === m[2]);
    if (!a) return json({ error: 'that appointment is gone' }, 404);
    if (method === 'DELETE') { await save(list.filter((x) => x.id !== a.id)); return json({ ok: true }); }
    if (method === 'PATCH') {
      // I'll take it: the drop-off or the pick-up (or let it go again).
      if (body.claim === 'drop' || body.claim === 'pick') {
        a[`${body.claim}By`] = body.release ? '' : me.id;
        await tell(adultsOf(fam, user.uid, 'home'), 'appts', { title: body.release ? `🚗 ${me.name} can't do the ${body.claim === 'drop' ? 'drop-off' : 'pick-up'} after all` : `🚗 ${me.name} will do the ${body.claim === 'drop' ? 'drop-off' : 'pick-up'}`,
          body: `${APPT_TYPES[a.type].label} for ${a.pets.map((id) => fam.members.find((x) => x.id === id)?.name).filter(Boolean).join(' & ')}`, url: 'family/#home', tag: `appt-${a.id}` });
      }
      if (body.edit) Object.assign(a, cleanAppt({ ...a, ...body.edit }, ctx));
      let next = null;
      if (body.done) {
        a.status = 'done';
        a.doneAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : startOf(a).slice(0, 10);
        a.cost = Math.max(0, Math.min(100000, Math.round((+body.cost || 0) * 100) / 100));
        a.outcome = privText(fam, body.outcome, 300);
        // A vaccination updates each dog's record: given today, next due in a year or three.
        // (In an encrypted family the record is locked, so the phone that marks it done does this.)
        if (a.type === 'vaccine' && a.vaccine && !fam.e2ee) {
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
  // 💉 Vaccines coming due, for the 9 AM reminders: the phone works these out (the records can be
  // locked) and sends just which pet and the date.
  m = path.match(/^\/families\/([a-z0-9]+)\/vaxdue$/);
  if (m && method === 'PUT') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const pets = new Set(fam.members.filter((x) => x.kind === 'pet').map((x) => x.id));
    const due = (Array.isArray(body.due) ? body.due : []).filter((v) => pets.has(v?.pet) && /^\d{4}-\d{2}-\d{2}$/.test(v.due || '')).slice(0, 100).map((v) => ({ pet: v.pet, due: v.due }));
    await db.put(`vaxdue:${fam.fid}`, due);
    return json({ ok: true });
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
    return json({ month: months.at(-1), streak, months, goldenDays: Object.entries(recent).filter(([, s]) => s.golden).map(([d]) => d) });
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
        const res = await aiCall({ db, purpose: 'bingo.squares', input: { show }, who: user.uid, underLimit }, (p) => client.beta.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' },
          system: 'You write playful, family-friendly bingo squares for couples watching TV together.', messages: [{ role: 'user', content: bingoPrompt(p.show) }] }));
        const squares = parseSquares((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
        if (squares.length < NEED) return json({ error: 'Claude came back with too few squares — try again', prompt: bingoPrompt(show) }, 502);
        return json({ squares });
      } catch (e) { return json({ error: e instanceof GatewayError ? e.message : 'Claude is unavailable right now — copy the prompt into any chatbot instead', prompt: bingoPrompt(show) }, e instanceof GatewayError ? e.status : 502); }
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
      await tell(adultsOf(fam, user.uid), 'fun', { title: `🎲 ${me.name} started ${g.title} bingo`, body: 'Grab your card', url: 'family/#bingo', tag: `bingo-${g.id}` });
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
        // BINGO: you're on the winners list, and the grown-ups hear about it.
        const fresh = (await db.get(`bingogames:${fam.fid}`)) || [];
        const live = fresh.find((x) => x.id === g.id);
        if (live) {
          const first = !live.winners.length;
          live.winners.push({ id: me.id, name: me.name, at: Date.now() });
          g.winners = live.winners;
          await db.put(`bingogames:${fam.fid}`, fresh);
          bingo = { first };
          await tell(adultsOf(fam, user.uid), 'fun', { title: `🎉 BINGO! ${me.name} ${first ? 'won' : 'got one too'}`, body: `${g.title} bingo`, url: 'family/#bingo', tag: `bingo-${g.id}` });
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
      if (body.outcome && !OUTCOMES[body.outcome]) return json({ error: 'how did it end?' }, 400);
      if (body.outcome) s.outcome[c.id] = body.outcome; else delete s.outcome[c.id];
      await save(seasons);
      return json(await view());
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- 🧺 the family's own chores: added by any grown-up; removing one keeps its history ----
  m = path.match(/^\/families\/([a-z0-9]+)\/chores\/custom$/);
  if (m && method === 'PUT') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    if (meIn(fam).relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    const old = fam.chores || [];
    const sent = (Array.isArray(body.chores) ? body.chores : []).slice(0, 30).map((c) => ({
      id: /^[a-z0-9]{4,12}$/.test(c.id || '') ? c.id : randomId(6),
      icon: [...String(c.icon || '✅').trim()].slice(0, 2).join('') || '✅',
      label: clean(c.label, 24),
      pts: Math.max(0, Math.min(5, Math.round(+c.pts || 0))),
      section: c.section === 'dogs' ? 'dogs' : 'house',
    })).filter((c) => c.label);
    // A chore left out is marked gone (its entries keep their name and points), not deleted.
    fam.chores = [...sent, ...old.filter((c) => !sent.some((x) => x.id === c.id)).map((c) => ({ ...c, gone: true }))].slice(-60);
    if (Array.isArray(body.hidden)) fam.hiddenChores = [...new Set(body.hidden.filter((k) => CARE.includes(k)))];
    await db.put(`family:${fam.fid}`, fam);
    return json({ chores: fam.chores, hidden: fam.hiddenChores || [] });
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
    const race = choresRace(logs, fam.members.filter((x) => x.kind === 'person'), customPoints(fam));
    let gold = (await db.get(`gold:${fam.fid}`)) || [];
    // A finished month crowns its winner once (shared on a tie).
    const ended = today.slice(0, 7) > month;
    if (ended && race.leaders.length && race.top > 0 && !gold.some((g) => g.month === month)) {
      gold = [{ month, winners: race.leaders.map((id) => ({ id, name: fam.members.find((x) => x.id === id)?.name || '' })), points: race.top, prize: fam.goldPrize || '' }, ...gold].slice(0, 36);
      await db.put(`gold:${fam.fid}`, gold);
    }
    return json({ month, ended, ...race, gold, prize: fam.goldPrize || '', points: { ...POINTS, ...customPoints(fam) } });
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
      // Only the family's creator chooses areas when adding someone (everyone else adds with all).
      ...(kind === 'person' && me.role === 'owner' && accessOf(body.access) && accessOf(body.access).length < AREAS.length ? { access: accessOf(body.access) } : {}),
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
    // 🔑 The family's creator chooses each person's household areas (never their own, never the
    // creator's); nobody else can, and it changes nothing about their Health sharing.
    if (method === 'PATCH' && body.access !== undefined) {
      if (me.role !== 'owner' || t.kind !== 'person' || t.role === 'owner') return json({ error: "only the family's creator chooses this" }, 403);
      const a = accessOf(body.access);
      if (!a) return json({ error: 'expected a list of areas' }, 400);
      if (a.length === AREAS.length) delete t.access; else t.access = a;
      await db.put(`family:${fam.fid}`, fam);
      return json({ member: memberView(t, true) });
    }
    // You edit yourself; grown-ups edit pets, kids and people who haven't joined yet.
    const canEdit = self || (me.relation !== 'child' && (t.kind === 'pet' || !t.uid));
    if (!canEdit) return json({ error: 'only they can change that' }, 403);
    if (method === 'DELETE') {
      if (t.role === 'owner') return json({ error: "the family's creator can't be removed" }, 400);
      if (!(me.role === 'owner' || self || !t.uid)) return json({ error: 'not allowed' }, 403);
      // Removing yourself is leaving: the same clean-up as /leave.
      await removeMember(db, fam, t, { keepPosts: !self });
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
    // Only you decide who sees your Diet and your Fitness — separately. (Nobody can grant
    // themselves someone else's: only the person's own PATCH changes these lists.)
    const people = (ids) => (Array.isArray(ids) ? [...new Set(ids)].filter((id) => fam.members.some((x) => x.id === id && x.kind === 'person' && x.id !== t.id)) : null);
    if (self && body.share && typeof body.share === 'object') {
      const cur = shareOf(t), diet = people(body.share.diet) ?? cur.diet, fitness = people(body.share.fitness) ?? cur.fitness;
      t.share = { diet, fitness };
      t.shareWith = diet.filter((id) => fitness.includes(id)); // older apps: "both" is what they understand
    } else if (self && Array.isArray(body.shareWith)) {
      // An older app's single list: both parts, as before.
      t.shareWith = people(body.shareWith); t.share = { diet: t.shareWith, fitness: t.shareWith };
    }
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
      // Someone else's full copy only until their phone has split it into Diet / Fitness / Us
      // (then those parts are what's shared), and only for who could see both before.
      const sh = shareOf(t);
      const legacy = !t.healthSplit && sh.diet.includes(me.id) && sh.fitness.includes(me.id);
      const can = self || t.kind === 'pet' || legacy || (!t.uid && t.addedBy === me.id);
      if (!can) return json({ error: `${t.name} hasn't shared this with you`, locked: true, ...(t.healthSplit ? { parts: true } : {}) }, 403);
      return json((await db.get(`data:${fam.fid}:${t.id}`)) || { savedAt: 0, data: {} });
    }
    if (method === 'PUT') {
      // Yours, a pet's, or (bringing data over) someone who hasn't joined yet.
      if (!(self || t.kind === 'pet' || (!t.uid && t.addedBy === me.id))) return json({ error: 'not allowed' }, 403);
      if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'expected {data}' }, 400);
      // 🔐 Encrypted families keep only locked data: {enc: "e1:…"}.
      if (body.data.enc != null && (!sealed(body.data.enc, 8_000_000) || Object.keys(body.data).length !== 1)) return json({ error: 'expected {data: {enc}}' }, 400);
      if (fam.e2ee && body.data.enc == null) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      const savedAt = Date.now();
      const old = await db.get(`data:${fam.fid}:${t.id}`);
      const size = (x) => JSON.stringify(x || {}).length;
      if (old && size(old.data) > 500 && size(body.data) < size(old.data) * 0.7) await db.put(`dataprev:${fam.fid}:${t.id}`, old, 90 * 86400);
      await db.put(`data:${fam.fid}:${t.id}`, { savedAt, data: body.data });
      return json({ ok: true, savedAt });
    }
  }

  // ---- 💪 a person's Diet, Fitness and Us parts, each shared on its own ----
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/health\/(diet|fitness|us)$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam), part = m[3];
    const t = fam.members.find((x) => x.id === m[2] && x.kind === 'person');
    if (!t) return json({ error: 'not found' }, 404);
    const key = `health:${fam.fid}:${t.id}:${part}`;
    const holder = !t.uid && t.addedBy === me.id;
    if (method === 'GET') {
      if (!canSeePart(fam, t, me, part) && !holder) return json({ error: part === 'us' ? 'just for their partner' : `${t.name} hasn't shared their ${part === 'diet' ? 'Diet' : 'Fitness'} with you`, locked: true }, 403);
      return json((await db.get(key)) || { savedAt: 0, data: {}, none: true });
    }
    if (method === 'PUT') {
      if (!(t.id === me.id || holder)) return json({ error: 'not allowed' }, 403);
      if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'expected {data}' }, 400);
      if (body.data.enc != null && (!sealed(body.data.enc, 6_000_000) || Object.keys(body.data).length !== 1)) return json({ error: 'expected {data: {enc}}' }, 400);
      if (fam.e2ee && body.data.enc == null) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
      if (body.data.enc == null && JSON.stringify(body.data).length > 4_000_000) return json({ error: 'too big' }, 413);
      const savedAt = Date.now();
      await db.put(key, { savedAt, data: body.data });
      // From now on others read these parts, never the full copy.
      if (!t.healthSplit) { t.healthSplit = savedAt; await db.put(`family:${fam.fid}`, fam); }
      return json({ ok: true, savedAt });
    }
  }

  // ---- 🏋️ workouts: Today's Workout (with saved templates) and the history, each sealed ----
  // Yours to write; read by you and whoever you share your Fitness with.
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/workouts\/(today|log)$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam), t = fam.members.find((x) => x.id === m[2] && x.kind === 'person');
    if (!t) return json({ error: 'not found' }, 404);
    const key = `workouts:${fam.fid}:${t.id}:${m[3]}`;
    if (method === 'GET') {
      if (!canSeePart(fam, t, me, 'fitness')) return json({ error: `${t.name} hasn't shared their Fitness with you`, locked: true }, 403);
      return json((await db.get(key)) || { savedAt: 0, data: null });
    }
    if (method === 'PUT') {
      if (t.id !== me.id) return json({ error: 'not allowed' }, 403);
      const max = m[3] === 'today' ? 600_000 : 6_000_000;
      if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'expected {data}' }, 400);
      if (body.data.enc != null ? !sealed(body.data.enc, max) || Object.keys(body.data).length !== 1 : fam.e2ee || JSON.stringify(body.data).length > max) return json({ error: fam.e2ee ? 'this family is end-to-end encrypted — update the app and try again' : 'too big' }, 400);
      const savedAt = Date.now();
      // Two phones saving at once: the older copy can't overwrite a newer one.
      const old = await db.get(key);
      if (old && Number.isFinite(body.base) && old.savedAt > body.base) return json({ error: 'changed on another device', savedAt: old.savedAt }, 409);
      await db.put(key, { savedAt, data: body.data });
      return json({ ok: true, savedAt });
    }
  }

  // 🔐 Keys for friends' families: one per connection, locked with each family's own key. The
  // inviting family parks theirs under the invite until it's accepted.
  m = path.match(/^\/families\/([a-z0-9]+)\/connkeys\/(pending\/)?([a-z0-9]{6,40})$/);
  if (m && method === 'PUT') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    if (meIn(fam).relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    const ck = sealed(body.ck, 300);
    if (!ck) return json({ error: 'expected a sealed key' }, 400);
    if (m[2]) {
      const inv = await db.get(`invite:${m[3]}`);
      if (!inv || inv.fid !== fam.fid || inv.kind !== 'family') return json({ error: 'not found' }, 404);
      fam.connpend = { ...(fam.connpend || {}), [m[3]]: ck };
    } else {
      if (!(fam.connections || []).includes(m[3])) return json({ error: 'not connected' }, 404);
      fam.connkeys = { ...(fam.connkeys || {}), [m[3]]: ck };
    }
    await db.put(`family:${fam.fid}`, fam);
    return json({ ok: true });
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
      // The inviter's key for this connection, parked under the invite, now belongs to it.
      if (fam.connpend?.[m[1]]) { fam.connkeys = { ...(fam.connkeys || {}), [own.fid]: fam.connpend[m[1]] }; delete fam.connpend[m[1]]; }
      await db.put(`family:${own.fid}`, own);
      await db.put(`family:${fam.fid}`, fam);
      await db.del(`invite:${m[1]}`);
      return json({ family: familyOut(own, user), connectedTo: fam.name, connectedFid: fam.fid });
    }
  }

  // ---- 🏠 Home: requests and groceries ----
  { const r = await homeRoutes({ path, method, body, db, user, loadFamily, meIn, sealed, clean, randomId, tell, json, hasArea }); if (r) return r; }
  // ---- 📖 threads ----
  { const r = await threadRoutes({ path, method, body, db, user, saveUser, families, loadFamily, meIn, partnerOf, hasArea, sealed, clean, randomId, tell, json, url: () => url(req), blobs: blobStore(env), owns: (fid, ids, memberId) => ownsFiles(db, fid, ids, memberId) }); if (r) return r; }
  // ---- 📷 albums (family only) ----
  { const r = await albumRoutes({ path, method, body, db, loadFamily, meIn, sealed, clean, randomId, json, blobs: blobStore(env), owns: (fid, ids, memberId) => ownsFiles(db, fid, ids, memberId) }); if (r) return r; }
  // ---- 🛒 the Market (family, and friends' families by default) ----
  // ---- 💬 chats between the grown-ups ----
  { const r = await chatRoutes({ path, method, body, db, user, loadFamily, meIn, tell, json, url: () => url(req), hub: (fid) => chatHub(db, fid), blobs: blobStore(env), deletePhoto: (b, f, id) => deletePhoto(b, f, id, db), owns: (fid, ids, memberId) => ownsFiles(db, fid, ids, memberId) }); if (r) return r; }
  { const r = await marketRoutes({ path, method, body, db, user, families, loadFamily, meIn, sealed, clean, randomId, tell, json, blobs: blobStore(env), owns: (fid, ids, memberId) => ownsFiles(db, fid, ids, memberId) }); if (r) return r; }
  // ✨ Tidy it up: rough notes into headings and bullets. Only the text you tap it on is sent.
  m = path.match(/^\/families\/([a-z0-9]+)\/tidy$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const raw = String(body.text || '').slice(0, 8000).trim();
    if (raw.length < 20) return json({ error: 'write a little more first' }, 400);
    if (env.DEMO && !env.__anthropic) return json({ text: `## Notes\n${raw.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).map((x) => `- ${x.trim()}`).join('\n')}`, demo: true });
    if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) return json({ error: 'Tidy it up needs the Anthropic key on the connector (ANTHROPIC_API_KEY)' }, 400);
    const month = new Date().toISOString().slice(0, 7), key = `tidyruns:${fam.fid}:${month}`;
    const n = (await db.get(key)) || 0;
    if (n >= Math.max(1, +env.TIDY_MAX_RUNS || 60)) return json({ error: "that's a lot of tidying this month — more next month" }, 400);
    let text;
    try {
      ({ text } = await aiCall({ db, purpose: 'thread.tidy', input: { text: raw }, who: user.uid, underLimit }, (p) => askClaude(env, `Tidy up these rough notes someone wrote to share with their family. Keep their words, facts, numbers and links exactly; don't add anything new or give advice. Fix typos, group related points under short "## " headings, and use "- " bullets. Plain text only (no bold, no tables). Answer with only the tidied notes.\n\n${p.text}`, { search: false, maxTokens: 3000, model: env.TIDY_MODEL || 'claude-haiku-5-5' })));
    } catch (e) { if (e instanceof GatewayError) return json({ error: e.status === 413 ? 'that\'s a lot of text — tidy part of it' : e.message }, e.status); throw e; }
    await db.put(key, n + 1, 62 * 86400);
    return json({ text: String(text || '').trim().slice(0, 12000) });
  }
  // ---- the feed ----
  if (path === '/feed' && method === 'GET') {
    // The old feed showed on Home: only families where you have Home (and friends' through them).
    const fams = (await families()).filter((f) => hasArea(meIn(f), 'home'));
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
  // ---- 📸 photo files: a thumbnail and the full photo per post, locked on the phone ----
  m = path.match(/^\/families\/([a-z0-9]+)\/photos(?:\/([a-z0-9]+))?$/);
  if (m) {
    const blobs = blobStore(env);
    if (!blobs) return json({ error: 'photo storage is not set up on the connector yet — see server/README.md' }, 501);
    const size = ({ thumb: 'thumb', doc: 'doc' })[url(req).searchParams.get('size')] || 'full';
    let fam = await loadFamily(m[1]);
    if (!fam && !(method === 'GET' && m[2])) return json({ error: 'not found' }, 404);
    if (!m[2] && method === 'GET') return json({ used: await familyUsage(blobs, fam.fid, true), quota: quotaBytes(env) });
    if (!okPhotoId(m[2])) return json({ error: 'not found' }, 404);
    const key = photoKey(m[1], m[2], size);
    if (method === 'GET') {
      // Friends' families: only a photo on something shared with them, which the phone names
      // (?in=post:<id> or thread:<id>), and never one that tags someone kept private.
      if (!fam && !(await sharedFile(m[1], m[2], url(req).searchParams.get('in')))) return json({ error: 'not found' }, 404);
      const b = await blobs.get(key);
      return b ? { status: 200, raw: b } : json({ error: 'not found' }, 404);
    }
    const me = meIn(fam);
    if (me.relation === 'child' && method === 'DELETE') return json({ error: 'ask a grown-up' }, 403);
    // Only whoever uploaded a file (or the family's creator) may replace or delete it. A file from
    // before uploads were recorded can be replaced only by the creator (turning on encryption).
    const meta = await db.get(blobMetaKey(fam.fid, m[2]));
    const mine = meta ? meta.by === me.id : false;
    if (method === 'PUT') {
      if (!bytes?.length || bytes.length > SIZES[size]) return json({ error: size === 'doc' ? 'that PDF is too large (20 MB at most)' : 'that photo is too large' }, 413);
      if (!mine && me.role !== 'owner') {
        if (meta) return json({ error: 'not yours to replace' }, 403);
        for (const s of ['full', 'thumb', 'doc']) if (await blobs.has(photoKey(fam.fid, m[2], s))) return json({ error: 'not yours to replace' }, 403);
      }
      if ((await familyUsage(blobs, fam.fid)) + bytes.length > quotaBytes(env)) return json({ error: `${fam.name}'s photo space is full (${Math.round(quotaBytes(env) / 1048576 / 1024 * 10) / 10} GB). Delete some older photo posts to make room.` }, 413);
      await blobs.put(key, bytes);
      if (!meta) await db.put(blobMetaKey(fam.fid, m[2]), { by: me.id, at: Date.now() });
      noteUsage(fam.fid, bytes.length);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (!mine && me.role !== 'owner') return json({ error: 'not yours to delete' }, 403);
      await deletePhoto(blobs, fam.fid, m[2], db);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/posts$/);
  // All of one family's posts, a page at a time (turning on encryption locks the older ones).
  if (m && method === 'GET') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const ids = (await db.get(`feed:${fam.fid}`)) || [];
    const from = Math.max(0, +url(req).searchParams.get('from') || 0);
    const posts = [];
    for (const id of ids.slice(from, from + 12)) {
      const p = await db.get(`post:${fam.fid}:${id}`);
      if (p) posts.push(postOut(p, user, { own: true, familyName: fam.name }));
    }
    return json({ posts, next: from + 12 < ids.length ? from + 12 : null });
  }
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const text = sealed(body.text, 6000) ?? (fam.e2ee ? '' : clean(body.text, 2000).replace(/ {2,}/g, ' '));
    const photo = sealed(body.photo, 3_600_000) ?? (!fam.e2ee && typeof body.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length < 2_500_000 ? body.photo : '');
    if (fam.e2ee && ((body.text && !sealed(body.text, 6000)) || (body.photo && !sealed(body.photo, 3_600_000)))) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
    // A post shared with friends' families has its own key, locked for the family and for each connection.
    const pk = body.pk && sealed(body.pk.fam, 300) ? { fam: body.pk.fam, conns: Object.fromEntries(Object.entries(body.pk.conns || {}).filter(([f, v]) => (fam.connections || []).includes(f) && sealed(v, 300))) } : null;
    // 🙋 A request for help: pet sitting, babysitting, a ride… with the dates it's for.
    let help = null;
    if (body.help) {
      const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');
      help = { type: HELP[body.help.type] ? body.help.type : 'other', from: day(body.help.from), to: day(body.help.to) || day(body.help.from), time: clean(body.help.time, 40), offers: [], status: 'open' };
      if (!help.from) return json({ error: 'which day do you need help?' }, 400);
    }
    const photoId = okPhotoId(body.photoId) && blobStore(env) ? body.photoId : '';
    if (photoId && !(await ownsFiles(db, fam.fid, [photoId], me.id))) return json({ error: 'that photo isn\'t yours to post' }, 403);
    const aspect = Math.min(3, Math.max(0.3, +body.aspect || 1));
    if (!text && !photo && !photoId && !help) return json({ error: 'write something or add a photo' }, 400);
    // The same post sent again (a retry, a second tap): the one already saved, not a copy.
    const cid = /^[a-z0-9]{8,24}$/.test(body.cid || '') ? body.cid : null;
    if (cid) {
      const had = await db.get(`postcid:${user.uid}:${cid}`);
      const p = had && await db.get(`post:${fam.fid}:${had}`);
      if (p) return json({ post: postOut(p, user, { own: true, familyName: fam.name }), note: '', dup: true });
    }
    const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '', text, photo,
      tags: (Array.isArray(body.tags) ? body.tags : []).filter((id) => fam.members.some((x) => x.id === id)).slice(0, 10),
      tagNames: {}, audience: body.audience === 'connections' ? 'connections' : 'family', likes: [], comments: [], at: Date.now(), ...(photoId ? { photoId, aspect, photoLocked: !!fam.e2ee } : {}), ...(help ? { help } : {}), ...(pk ? { pk } : {}) };
    post.tagKinds = {};
    for (const id of post.tags) { const x = fam.members.find((y) => y.id === id); post.tagNames[id] = x.name; post.tagKinds[id] = x.kind; }
    // Tagging a kid (or pet) the family keeps private keeps the post in the family.
    let note = '';
    if (post.audience === 'connections' && post.tags.some((id) => !sharedWithFriends(fam, fam.members.find((x) => x.id === id)))) {
      post.audience = 'family'; note = 'Kept in the family: it tags someone your family keeps private from friends.';
    }
    await db.put(`post:${fam.fid}:${post.id}`, post);
    await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
    if (cid) await db.put(`postcid:${user.uid}:${cid}`, post.id, 2 * 86400);
    return json({ post: postOut(post, user, { own: true, familyName: fam.name }), note });
  }
  m = path.match(/^\/posts\/([a-z0-9]+)\/([a-z0-9]+)(\/like|\/comments|\/report|\/hide|\/block|\/offer|\/accept)?$/);
  if (m) {
    const [, fid, id, action] = m;
    const p = await db.get(`post:${fid}:${id}`);
    if (!p) return json({ error: 'not found' }, 404);
    const fams = (await families()).filter((f) => hasArea(meIn(f), 'home'));
    const own = fams.find((f) => f.fid === fid);
    const viaConnection = !own && p.audience === 'connections' && fams.some((f) => (f.connections || []).includes(fid));
    if (!own && !viaConnection) return json({ error: 'not found' }, 404);
    const myName = own ? meIn(own).name : user.name;
    // 🔐 Locking an older post when the family turns on encryption: only sealed values are taken,
    // so a post can only ever go from readable to locked, never back.
    if (!action && method === 'PATCH') {
      if (!own) return json({ error: 'not found' }, 404);
      if (body.text != null) { const v = sealed(body.text, 6000); if (!v) return json({ error: 'expected sealed text' }, 400); p.text = v; }
      if (body.photo != null) { const v = sealed(body.photo, 3_600_000); if (!v) return json({ error: 'expected a sealed photo' }, 400); p.photo = v; }
      for (const c of Array.isArray(body.comments) ? body.comments : []) { const t = p.comments.find((x) => x.id === c.id); const v = sealed(c.text, 2000); if (t && v) t.text = v; }
      for (const o of Array.isArray(body.offers) ? body.offers : []) { const t = p.help?.offers.find((x) => x.id === o.id); const v = sealed(o.msg, 600); if (t && v) t.msg = v; }
      // 📸 Moving an older photo out of the post into its own files (first device to do it wins).
      if (okPhotoId(body.photoId) && blobStore(env)) {
        if (!p.photo || p.photoId) return json({ error: 'already moved', photoId: p.photoId || '' }, 409);
        if (!(await ownsFiles(db, fid, [body.photoId], meIn(own).id))) return json({ error: 'not yours' }, 403);
        p.photoId = body.photoId; p.aspect = Math.min(3, Math.max(0.3, +body.aspect || 1)); p.photo = ''; p.photoLocked = !!own.e2ee;
      }
      // Turning on encryption: the phone re-sent this post's photo files locked (one way only).
      if (body.photoLocked === true && p.photoId) p.photoLocked = true;
      if (body.pk && sealed(body.pk.fam, 300)) p.pk = { fam: body.pk.fam, conns: Object.fromEntries(Object.entries(body.pk.conns || {}).filter(([f, v]) => (own.connections || []).includes(f) && sealed(v, 300))) };
      await db.put(`post:${fid}:${id}`, p);
      return json({ ok: true });
    }
    if (action === '/like' && method === 'POST') {
      p.likes = p.likes.includes(user.uid) ? p.likes.filter((u) => u !== user.uid) : [...p.likes, user.uid];
      await db.put(`post:${fid}:${id}`, p);
      return json({ liked: p.likes.includes(user.uid), likes: p.likes.length });
    }
    if (action === '/comments' && method === 'POST') {
      const text = sealed(body.text, 2000) ?? ((await db.get(`family:${fid}`))?.e2ee ? '' : clean(body.text, 500));
      if (!text) return json({ error: 'empty comment' }, 400);
      const c = { id: randomId(5), uid: user.uid, name: myName, text, at: Date.now() };
      p.comments = [...p.comments, c].slice(-200);
      await db.put(`post:${fid}:${id}`, p);
      if (p.byUid && p.byUid !== user.uid) await tell([p.byUid], 'feed', { title: `💬 ${myName} commented on your post`, body: 'Tap to see it', url: 'family/#feed', tag: `post-${id}` });
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
      if (!body.withdraw) await tell([p.byUid], 'feed', { title: `🙋 ${myName} can help`, body: 'Pick who helps from the feed', url: 'family/#feed', tag: `help-${id}` });
      p.help.offers = body.withdraw ? others : [...others, { id: randomId(6), uid: user.uid, name: myName, family: myFam?.name || '', msg: sealed(body.msg, 600) ?? clean(body.msg, 140), at: Date.now() }].slice(-30);
      await db.put(`post:${fid}:${id}`, p);
      return json({ help: postOut(p, user, {}).help });
    }
    if (action === '/accept' && method === 'POST' && p.help) {
      if (p.byUid !== user.uid) return json({ error: 'only who asked can choose' }, 403);
      const o = p.help.offers.find((x) => (body.offer && x.id === body.offer) || (body.uid && x.uid === body.uid));
      p.help.status = o ? 'filled' : 'open'; p.help.helper = o ? { uid: o.uid, name: o.name, family: o.family } : null;
      await db.put(`post:${fid}:${id}`, p);
      if (o && o.uid !== user.uid) await tell([o.uid], 'feed', { title: `✅ ${myName} picked you to help`, body: 'Thank you!', url: 'family/#feed', tag: `help-${id}` });
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
      if (p.photoId) await deletePhoto(blobStore(env), fid, p.photoId, db).catch(() => {});
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
  return { fid: fam.fid, name: fam.name, me: me?.id || '', myRole: me?.role || '', modules: fam.modules || MODULES, goldPrize: fam.goldPrize || '', chores: fam.chores || [], hiddenChores: fam.hiddenChores || [], boards: fam.boards || [], goldenPosts: fam.goldenPosts !== false, e2ee: !!fam.e2ee, keyCheck: fam.keyCheck || '', connkeys: fam.connkeys || {}, share: { kids: !!fam.share?.kids, pets: fam.share?.pets !== false }, connections: fam.connections || [], members: fam.members.map((m) => memberView(m, true)) };
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
export function choresRace(logs, people, extra = {}) {
  const by = Object.fromEntries(people.map((p) => [p.id, { id: p.id, name: p.name, points: 0, count: 0, kinds: {}, streak: 0 }]));
  const active = {};
  for (const [date, list] of Object.entries(logs)) for (const e of list) for (const id of e.by || []) {
    const r = by[id];
    if (!r) continue;
    r.points += POINTS[e.kind] ?? extra[e.kind] ?? 0; r.count += 1; r.kinds[e.kind] = (r.kinds[e.kind] || 0) + 1;
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
// The dogs' thank-you for a golden day (once per day; the family can turn it off). It's the
// notification and the cheer on the phone that logged it; since 2.0 nothing goes on the old feed.
async function goldenDay(db, fam, date, list) {
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
  return { golden: date, byName: names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0], fromPets: dogs.map((d) => d.id), text };
}
const shiftDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const validTz = (tz) => { if (typeof tz !== 'string' || tz.length > 64) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
// The 15-minute reminders (appointments, calendar events, vaccines due) — see push.js.
// 💡 Thursday morning: the date scout for every area a couple lives in (at most 10 areas).
export async function runScout(env, { db = store(env.HOUSEHOLD), force = false, refresh = false, now = new Date() } = {}) {
  const areas = new Map([[areaKey(DEFAULT_AREA), DEFAULT_AREA]]);
  let cursor;
  do {
    const r = await env.HOUSEHOLD.list({ prefix: 'v2:family:', cursor });
    for (const k of r.keys) {
      const fam = await db.get(k.name.slice(3));
      if (!fam || !fam.members?.some((x) => x.relation === 'spouse' || x.relation === 'partner')) continue;
      const a = { ...DEFAULT_AREA, ...(fam.ideas || {}) };
      if (fam.ideas || !areas.has(areaKey(a))) areas.set(areaKey(a), a);
    }
    cursor = r.list_complete === false ? r.cursor : null;
  } while (cursor && areas.size < 10);
  // One area per run (each run gets 50 outside requests on the free plan); the cron fires every
  // hour that morning, so each run takes the next area not done yet.
  const list = [...areas.values()].slice(0, 10);
  const fresh = refresh ? 20 * 3600e3 : 5 * 864e5;
  const todo = [];
  for (const a of list) {
    const w = await db.get(`ideas:${areaKey(a)}`);
    if (!w || now.getTime() - ((refresh ? w.refreshed || w.at : w.at) || 0) > fresh) todo.push(a);
  }
  const a = todo[0] || (force ? list[0] : null);
  if (!a) return { areas: [], remaining: 0 };
  const r = await scoutArea(env, db, a, { now, force, refresh }).catch((e) => ({ key: areaKey(a), problems: [e.message] }));
  return { areas: [r], remaining: Math.max(0, todo.length - 1) };
}
export const runFamilyReminders = (env, at) => runReminders(env, at, { db: store(env.HOUSEHOLD) });
// 📰 The 6:45 and 3:45 editions (from the 15-minute cron, as its own job).
export const runNewsEdition = (env, at) => (editionDue(at) ? runNews(env, store(env.HOUSEHOLD), { now: new Date(at) }) : null);
export const MODULES = ['dogs', 'chores', 'feed', 'health', 'calendar'];

// Takes someone out of a family: their spot, their data, and (unless kept) their posts,
// comments and likes there.
// 💬 A family's chats: its Durable Object on the connector, or (the demo) the same code over this store.
function chatHub(db, fid) {
  if (db.chat) {
    const stub = db.chat.get(db.chat.idFromName(fid));
    return { live: true, call: (op, args = {}) => stub.fetch('https://chat/op', { method: 'POST', body: JSON.stringify({ op, ...args }) }).then((r) => r.json()) };
  }
  const core = new ChatCore({ get: (k) => db.get(`chat:${fid}:${k}`), put: (k, v) => db.put(`chat:${fid}:${k}`, v), delete: (k) => db.del(`chat:${fid}:${k}`) });
  return { live: false, call: async (op, args = {}) => {
    if (op === 'wipe') { for (const id of await core.index()) { const c = await core.meta(id); for (let n = 0; n * CHAT_PAGE < c.seq; n++) await db.del(`chat:${fid}:m:${id}:${n}`); await db.del(`chat:${fid}:c:${id}`); } await db.del(`chat:${fid}:index`); return { ok: true }; }
    return (await runOp(core, op, args)).out;
  } };
}
// Someone leaving: their one-to-one chats go (and, when their account goes, their group messages).
async function forgetInChats(db, fid, memberId, all) {
  const r = await chatHub(db, fid).call('forget', { member: memberId, all }).catch(() => null);
  for (const id of r?.files || []) await deletePhoto(db.blobs, fid, id, db).catch(() => {});
}
// The families someone can still reach after leaving one: those they're in, and the families
// those are connected to. What they wrote there stays.
async function stillReaches(db, uid, leaving) {
  const out = new Set();
  for (const f of ((await db.get(`user:${uid}`))?.families || [])) {
    if (f === leaving) continue;
    out.add(f);
    for (const c of (await db.get(`family:${f}`))?.connections || []) out.add(c);
  }
  return out;
}
async function removeMember(db, fam, t, { keepPosts = true, reach = null } = {}) {
  fam.members = fam.members.filter((x) => x.id !== t.id);
  for (const x of fam.members) {
    x.shareWith = (x.shareWith || []).filter((id) => id !== t.id);
    if (x.share) x.share = { diet: x.share.diet.filter((id) => id !== t.id), fitness: x.share.fitness.filter((id) => id !== t.id) };
  }
  await db.put(`family:${fam.fid}`, fam);
  await db.del(`data:${fam.fid}:${t.id}`);
  for (const part of HEALTH_PARTS) await db.del(`health:${fam.fid}:${t.id}:${part}`);
  for (const w of ['today', 'log']) await db.del(`workouts:${fam.fid}:${t.id}:${w}`);
  await forgetReader(db, fam.fid, t.id);
  await forgetLooks(db, db.blobs, fam.fid, t.id).catch(() => {});
  await db.del(`dataprev:${fam.fid}:${t.id}`);
  for (const g of (await db.get(`bingogames:${fam.fid}`)) || []) await db.del(`bingocard:${fam.fid}:${g.id}:${t.id}`);
  for (const s of (await db.get(`picks:${fam.fid}`)) || []) await db.del(`pickcard:${fam.fid}:${s.id}:${t.id}`);
  if (t.uid) await forgetInChats(db, fam.fid, t.id, !keepPosts);
  // However they leave, their requests go and what they'd taken is open again; things they put on the shared grocery list stay (the household's list).
  const reqs = (await db.get(`requests:${fam.fid}`)) || [];
  if (reqs.some((r) => r.by === t.id || r.claimedBy === t.id)) await db.put(`requests:${fam.fid}`, reqs.filter((r) => r.by !== t.id).map((r) => (r.claimedBy === t.id ? { ...r, status: r.status === 'claimed' ? 'open' : r.status, claimedBy: '', claimedName: '' } : r)));
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
  await scrubThreads(db, fam.fid, t.uid, t.id);
  // Friends' families: their comments and replies there go — unless they can still reach that
  // family another way (they're in it, or in another family connected to it).
  const reached = reach || (await stillReaches(db, t.uid, fam.fid));
  for (const c of fam.connections || []) if (!reached.has(c)) { await scrubPosts(db, c, t.uid, null); await scrubThreads(db, c, t.uid, null); }
}
// Removes one person's threads (with their screenshots, PDFs and reports) and their replies,
// votes, ▲s, tags, reads and follows from a family's threads.
async function scrubThreads(db, fid, uid, memberId) {
  const ids = (await db.get(`threads:${fid}`)) || [];
  const keep = [];
  for (const id of ids) {
    const t = await db.get(`thread:${fid}:${id}`);
    if (!t) continue;
    if (t.byUid === uid) {
      for (const x of [...(t.shots || []), ...(t.docs || []), ...t.replies.flatMap((r) => r.shots || [])]) await deletePhoto(db.blobs, fid, x.id, db).catch(() => {});
      await db.del(`thread:${fid}:${id}`);
      await db.del(`report:${fid}:thread:${id}`);
      continue;
    }
    keep.push(id);
    const before = JSON.stringify(t);
    const gone = new Set(t.replies.filter((r) => r.uid === uid).map((r) => r.id));
    for (const r of t.replies) if (gone.has(r.id)) for (const x of r.shots || []) await deletePhoto(db.blobs, fid, x.id, db).catch(() => {});
    t.replies = t.replies.filter((r) => !gone.has(r.id)).map((r) => ((r.ups || []).includes(uid) ? { ...r, ups: r.ups.filter((u) => u !== uid) } : r));
    if (gone.has(t.best)) t.best = null;
    if (t.reads?.[uid]) { t.reads = { ...t.reads }; delete t.reads[uid]; }
    t.followers = (t.followers || []).filter((u) => u !== uid);
    t.to = (t.to || []).filter((u) => u !== uid);
    if (t.tagUids?.includes(uid)) { t.tagUids = t.tagUids.filter((u) => u !== uid); t.tags = (t.tags || []).filter((m) => m !== memberId); }
    if (t.poll?.votes?.[uid] != null) { t.poll = { ...t.poll, votes: { ...t.poll.votes } }; delete t.poll.votes[uid]; }
    // "Last reply by" no longer names them.
    if (gone.size && t.lastByUid === uid) { const last = t.replies.at(-1); Object.assign(t, last ? { lastAt: last.at, lastByUid: last.uid, lastByName: last.name } : { lastAt: t.at, lastByUid: t.byUid, lastByName: t.byName }); }
    if (JSON.stringify(t) !== before) await db.put(`thread:${fid}:${id}`, t);
  }
  if (keep.length !== ids.length) await db.put(`threads:${fid}`, keep);
}
// Removes one person's posts (by member id) and comments / likes (by account) from a family's feed.
async function scrubPosts(db, fid, uid, memberId) {
  const ids = (await db.get(`feed:${fid}`)) || [];
  const keep = [];
  for (const id of ids) {
    const p = await db.get(`post:${fid}:${id}`);
    if (!p) continue;
    if ((memberId && p.by === memberId) || p.byUid === uid) { await db.del(`post:${fid}:${id}`); await db.del(`report:${fid}:${id}`); if (p.photoId) await deletePhoto(db.blobs, fid, p.photoId, db).catch(() => {}); continue; }
    keep.push(id);
    const comments = p.comments.filter((c) => c.uid !== uid), likes = p.likes.filter((u) => u !== uid);
    if (comments.length !== p.comments.length || likes.length !== p.likes.length) await db.put(`post:${fid}:${id}`, { ...p, comments, likes });
  }
  if (keep.length !== ids.length) await db.put(`feed:${fid}`, keep);
}
// Everything a family has: posts, threads, member data, the care log, and its links to other families.
async function deleteFamily(db, fam) {
  for (const id of (await db.get(`feed:${fam.fid}`)) || []) { await db.del(`post:${fam.fid}:${id}`); await db.del(`report:${fam.fid}:${id}`); }
  await db.del(`feed:${fam.fid}`);
  for (const id of (await db.get(`threads:${fam.fid}`)) || []) { await db.del(`thread:${fam.fid}:${id}`); await db.del(`report:${fam.fid}:thread:${id}`); }
  await db.del(`requests:${fam.fid}`);
  await db.del(`groceries:${fam.fid}`);
  await db.del(`threads:${fam.fid}`);
  // Who uploaded each file goes with the files.
  for (const o of (await db.blobs?.list(`f/${fam.fid}/`).catch(() => [])) || []) { const pid = o.key.split('/')[2]?.replace(/-(full|thumb|doc)$/, ''); if (pid) await db.del(blobMetaKey(fam.fid, pid)); }
  await deleteFamilyPhotos(db.blobs, fam.fid).catch(() => {});
  for (const x of fam.members) { await db.del(`data:${fam.fid}:${x.id}`); await db.del(`dataprev:${fam.fid}:${x.id}`); for (const part of HEALTH_PARTS) await db.del(`health:${fam.fid}:${x.id}:${part}`); for (const w of ['today', 'log']) await db.del(`workouts:${fam.fid}:${x.id}:${w}`); }
  await db.del(`books:${fam.fid}`);
  for (const x of fam.members) { await db.del(`look:${fam.fid}:${x.id}`); await db.del(`lookimgs:${fam.fid}:${x.id}`); } // their pictures went with deleteFamilyPhotos
  await db.del(`fitchecks:${fam.fid}`);
  for (const d of (await db.get(`careidx:${fam.fid}`)) || []) await db.del(`care:${fam.fid}:${d}`);
  await db.del(`careidx:${fam.fid}`);
  await db.del(`goldenmsg:${fam.fid}`);
  await db.del(`appts:${fam.fid}`);
  await db.del(`us:${fam.fid}`);
  await db.del(`events:${fam.fid}`);
  await db.del(`watch:${fam.fid}`);
  await db.del(`vaxdue:${fam.fid}`);
  await db.del(`dogmonths:${fam.fid}`);
  for (const g of (await db.get(`bingogames:${fam.fid}`)) || []) for (const x of fam.members) await db.del(`bingocard:${fam.fid}:${g.id}:${x.id}`);
  await db.del(`bingogames:${fam.fid}`);
  await db.del(`bingopacks:${fam.fid}`);
  for (const s of (await db.get(`picks:${fam.fid}`)) || []) for (const x of fam.members) await db.del(`pickcard:${fam.fid}:${s.id}:${x.id}`);
  await db.del(`picks:${fam.fid}`);
  await db.del(`albums:${fam.fid}`); // their photos went with deleteFamilyPhotos
  await db.del(`market:${fam.fid}`);
  await chatHub(db, fam.fid).call('wipe').catch(() => {});
  for (const c of fam.connections || []) {
    const o = await db.get(`family:${c}`);
    if (o) { o.connections = (o.connections || []).filter((f) => f !== fam.fid); if (o.connkeys) delete o.connkeys[fam.fid]; await db.put(`family:${o.fid}`, o); }
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
      if (!next) {
        // The family goes; what they wrote in friends' families goes too.
        for (const c of fam.connections || []) { await scrubPosts(db, c, user.uid, null); await scrubThreads(db, c, user.uid, null); }
        await deleteFamily(db, fam); summary.familiesDeleted.push(fam.name); continue;
      }
      next.role = 'owner'; summary.familiesHandedOver.push({ family: fam.name, to: next.name });
    } else summary.familiesLeft.push(fam.name);
    await removeMember(db, fam, me, { keepPosts: false, reach: new Set() }); // the whole account goes
  }
  for (const x of user.sessions || []) await db.del(`session:${x.t}`);
  await db.del(`keybackup:${user.uid}`);
  await db.del(`pushsub:${user.uid}`);
  await db.del(`user:${user.uid}`);
  return { deleted: true, ...summary };
}

// ---------- 🤖 Claude ----------
const aiReady = (env) => !!(env.__anthropic || (env.ANTHROPIC_API_KEY && !env.DEMO));
async function claude(env) {
  if (env.__anthropic) return env.__anthropic;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

// ---------- help desk ----------
// Counts one use against a limit; false once it's used up.
// Short counters (per minute) live in this connector instance's memory: slowing down a burst
// doesn't need to cost a storage write per change. Daily ones are stored.
const shortCounts = new Map();
async function underLimit(db, key, max, ttl) {
  if (ttl <= 300) {
    const now = Date.now();
    if (shortCounts.size > 5000) for (const [k, v] of shortCounts) if (v.until < now) shortCounts.delete(k);
    const c = shortCounts.get(key);
    const n = (c && c.until > now ? c.n : 0) + 1;
    if (n > max) return false;
    shortCounts.set(key, { n, until: now + ttl * 1000 });
    return true;
  }
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
  db.blobs = blobStore(env);
  db.chat = env.CHAT || null;
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
