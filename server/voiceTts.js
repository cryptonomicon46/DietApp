// 🔊 The Pawmily voice (ElevenLabs, Phase 1): privacy-first cloud text-to-speech.
//
// OurPawmily decides which sentence may be spoken by the cloud voice; ElevenLabs only renders it.
//   1. Talk builds its answer from the full context, as before (the visual answer).
//   2. The phone also sends each fact's provenance (domain, owner). Here, with each person's stored
//      cloud-voice preferences (all OFF by default), only the facts every owner allows are kept
//      (js/voicePolicy.js eligibleFacts) — someone else's data needs THEIR consent.
//   3. A short spoken summary is written from those facts only (server/talkAi.js spokenSummary),
//      people as roles, then checked for sensitive-looking text. If anything fails → no cloud speech
//      (the phone reads the answer on the device).
//   4. The connector signs a speakable ticket bound to the exact text (hash), the member, the family,
//      the voice (and its provider id), the policy version, the (owner, category) grants, a purpose,
//      a 2-minute expiry and a one-time nonce.
//   5. POST /voice/tts speaks only ticketed text (or one of the fixed PHRASES): it re-checks the
//      signature, hash, expiry, nonce, the voice and its owner's consent, and the grants against
//      today's preferences, then calls ElevenLabs. The client can never send arbitrary text.
// ElevenLabs is optional and replaceable: Talk, Calendar, Health… never depend on it. The master switch
// (cloudVoiceOn: the connector's CLOUD_VOICE ≠ 'off', the key present, the family's owner switched Cloud
// voice ON — it starts OFF — and no cost/quota pause) wins over every member setting; when it's off no
// ticket is issued and no request is made, and phones use their own voice (or none).
// Nothing is logged here: no text, no audio, no tickets. The key never leaves the connector.
import { POLICY_VERSION, CATEGORIES, cleanPrefs, eligibleFacts, grantsHold, rolesForSpeech, looksSensitive, PHRASES } from '../js/voicePolicy.js';
import { partnerOf } from './us.js';

export const TTS_MAX = 600;
export const TTS_PER_DAY = 30;
export const TICKET_TTL = 2 * 60 * 1000;
export const FAMILY_DAILY_CHARS = 20000; // household budget a day (ELEVENLABS_FAMILY_DAILY_CHARS)
const PAUSE_TTL = 3600; // after a quota/billing/auth error: an hour on the device voice, no retry storm
export const voiceReady = (env) => !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID);

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const textHash = async (text) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
// The ticket key is derived for this one purpose (VOICE_TICKET_SECRET if set, else from the key).
async function ticketKey(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.VOICE_TICKET_SECRET || env.ELEVENLABS_API_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const k = await crypto.subtle.sign('HMAC', base, enc.encode('pawmily-voice-ticket-v1'));
  return crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function makeTicket(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64u(await crypto.subtle.sign('HMAC', await ticketKey(env), enc.encode(body)))}`;
}
export async function readTicket(env, ticket) {
  const [body, sig] = String(ticket || '').split('.');
  if (!body || !sig || body.length > 4000) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await ticketKey(env), fromB64u(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(fromB64u(body)));
  } catch { return null; }
}
const nonce = () => b64u(crypto.getRandomValues(new Uint8Array(12)));
const today = () => new Date().toISOString().slice(0, 10);

// ---------- the master switch and the cost switch ----------
export const providerConfigured = (env) => voiceReady(env) && String(env.CLOUD_VOICE || '').toLowerCase() !== 'off';
export async function cloudVoiceState(env, db, fam) {
  const admin = (await db.get(`voiceadmin:${fam.fid}`)) || {};
  const paused = providerConfigured(env) ? await db.get('voicepause') : null;
  const cap = Math.max(0, +env.ELEVENLABS_FAMILY_DAILY_CHARS || FAMILY_DAILY_CHARS);
  const used = +(await db.get(`ttschars:${fam.fid}:${today()}`)) || 0;
  const on = providerConfigured(env) && admin.cloud === true && !paused && used < cap;
  return { on, configured: providerConfigured(env), familyOn: admin.cloud === true, paused: !!paused, used, cap };
}
const pause = (db, why) => db.put('voicepause', { why, at: Date.now() }, { expirationTtl: PAUSE_TTL });

// ---------- who may hear what, in whose voice ----------
const adultsOf = (fam) => fam.members.filter((m) => m.kind === 'person' && m.relation !== 'child').map((m) => m.id);
export async function prefsMap(db, fam) {
  const out = {};
  for (const id of adultsOf(fam)) out[id] = cleanPrefs(await db.get(`voicepref:${fam.fid}:${id}`));
  return out;
}
// The household's voice (Phase 1: one, from the connector's secrets). With ELEVENLABS_VOICE_OWNER_EMAIL
// it's that member's own cloned voice — it speaks only for the purposes its owner allows (none at
// first); without it, it's a neutral Pawmily voice. A different voice id → the owner decides again.
export async function voiceProfile(env, db, fam) {
  if (!voiceReady(env)) return null;
  const ownerEmail = String(env.ELEVENLABS_VOICE_OWNER_EMAIL || '').trim().toLowerCase();
  const owner = ownerEmail ? fam.members.find((m) => m.uid && m.kind === 'person' && String(m.email || '').toLowerCase() === ownerEmail) : null;
  if (ownerEmail && !owner) return null; // someone else's voice: not for this family
  const vh = await textHash(env.ELEVENLABS_VOICE_ID);
  const saved = (await db.get(`voiceprofile:${fam.fid}:pawmily`)) || {};
  const s = saved.vh === vh ? saved : {};
  return { id: 'pawmily', provider: 'elevenlabs', ownerMemberId: owner?.id || null, vh, enabled: !s.revokedAt && s.enabled !== false, permittedPurposes: Array.isArray(s.purposes) ? s.purposes : owner ? [] : ['talk:self', 'talk:family'], revokedAt: s.revokedAt || null };
}
const purposeFor = (profile, me) => (profile.ownerMemberId && profile.ownerMemberId === me.id ? 'talk:self' : 'talk:family');

// After Talk answers: a cloud-safe spoken summary and its ticket, or { private: why }.
// `summarize(facts)` writes the sentence from the eligible facts only (Claude through the gateway).
export async function spokenFor({ env, db, fam, me, facts, summarize, now = Date.now() }) {
  if (!(await cloudVoiceState(env, db, fam)).on) return { private: 'off' }; // no summary, no ticket
  const profile = await voiceProfile(env, db, fam);
  if (!profile || !profile.enabled) return { private: 'voice' };
  const purpose = purposeFor(profile, me);
  if (!profile.permittedPurposes.includes(purpose)) return { private: 'voice-owner' };
  const prefs = await prefsMap(db, fam);
  const { ok, grants } = eligibleFacts(facts, { me: me.id, partner: partnerOf(fam, me)?.id || null, adults: adultsOf(fam), prefsOf: (m) => prefs[m] });
  if (!ok.length) return { private: 'policy' };
  const text = rolesForSpeech(await summarize(ok)).slice(0, TTS_MAX);
  if (text.length < 2) return { private: 'nothing' };
  if (looksSensitive(text)) return { private: 'sensitive' };
  const ticket = await makeTicket(env, { v: 1, h: await textHash(text), u: me.uid, f: fam.fid, m: me.id, p: profile.id, vh: profile.vh, pv: POLICY_VERSION, g: grants, pu: purpose, exp: now + TICKET_TTL, n: nonce() });
  return { text, ticket };
}

async function speak(env, text, ctx) {
  const r = await (env.__fetch || fetch)(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_64`, {
    method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let why = '';
    try { const j = JSON.parse(t); why = String(j.detail?.message || j.detail?.status || j.message || ''); } catch { /* not JSON */ }
    throw Object.assign(new Error(`ElevenLabs: ${(why || `HTTP ${r.status}`).slice(0, 160)}`), { status: r.status === 429 ? 429 : 502, pause: [401, 402, 403, 429].includes(r.status) || /quota|credit|limit|billing|subscription/i.test(why) });
  }
  const audio = await r.arrayBuffer();
  // Optional (ELEVENLABS_DELETE_HISTORY=1, and a key allowed to): remove the generation from the
  // account's history. That is NOT zero retention — ElevenLabs may still keep it under its own terms.
  const hid = r.headers.get('history-item-id');
  if (env.ELEVENLABS_DELETE_HISTORY === '1' && hid) {
    const del = (env.__fetch || fetch)(`https://api.elevenlabs.io/v1/history/${encodeURIComponent(hid)}`, { method: 'DELETE', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } }).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(del); else await del;
  }
  return audio;
}

export async function voiceRoutes({ path, method, env, json, body, user, underLimit, db, loadFamily, meIn, ctx }) {
  // ---- your cloud-voice settings in a family (only yours) ----
  const vm = path.match(/^\/families\/([a-z0-9]+)\/voice(?:\/(prefs|profile|admin))?$/);
  if (vm) {
    const fam = await loadFamily(vm[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam), profile = await voiceProfile(env, db, fam);
    const state = await cloudVoiceState(env, db, fam), owner = fam.createdBy === user.uid;
    if (vm[2] === 'admin' && method === 'PUT') {
      if (!owner) return json({ error: "only the family's creator can switch cloud voice" }, 403);
      await db.put(`voiceadmin:${fam.fid}`, { cloud: body?.cloud === true, at: Date.now() });
      return json({ cloud: body?.cloud === true });
    }
    if (!vm[2] && method === 'GET') {
      return json({ ready: !!profile && state.on, admin: { cloud: state.familyOn, configured: state.configured, paused: state.paused, used: state.used, cap: state.cap, provider: 'ElevenLabs', fallback: 'Device voice', canChange: owner }, prefs: cleanPrefs(await db.get(`voicepref:${fam.fid}:${me.id}`)), categories: CATEGORIES,
        voice: profile ? { mine: profile.ownerMemberId === me.id, personal: !!profile.ownerMemberId, owner: profile.ownerMemberId, enabled: profile.enabled, purposes: profile.permittedPurposes } : null });
    }
    if (vm[2] === 'prefs' && method === 'PUT') {
      const p = cleanPrefs(body?.prefs);
      await db.put(`voicepref:${fam.fid}:${me.id}`, p);
      return json({ prefs: p });
    }
    if (vm[2] === 'profile' && method === 'PUT') {
      if (!profile) return json({ error: 'no voice here' }, 404);
      // A personal voice: only its owner. The neutral voice: the family's creator.
      const may = profile.ownerMemberId ? profile.ownerMemberId === me.id : fam.createdBy === user.uid;
      if (!may) return json({ error: "only the voice's owner can change this" }, 403);
      const purposes = (Array.isArray(body?.purposes) ? body.purposes : []).filter((x) => x === 'talk:self' || x === 'talk:family');
      const revoke = body?.enabled === false;
      await db.put(`voiceprofile:${fam.fid}:pawmily`, { vh: profile.vh, purposes, enabled: !revoke, revokedAt: revoke ? Date.now() : null });
      return json({ ok: true, purposes, enabled: !revoke });
    }
    return null;
  }
  if (path !== '/voice/tts' || method !== 'POST') return null;
  // 1–2. Who's asking, and is the voice here at all.
  if (!voiceReady(env)) return json({ error: "the Pawmily voice isn't set up on the connector", off: true }, 501);
  const fam = await loadFamily(String(body?.fid || ''));
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  const state = await cloudVoiceState(env, db, fam);
  if (!state.on) return json({ error: 'Using device voice for now.', private: true, fallback: true }, 503);
  const profile = await voiceProfile(env, db, fam);
  if (!profile || !profile.enabled) return json({ error: 'this voice is switched off', private: true }, 403);
  const purpose = purposeFor(profile, me);
  if (!profile.permittedPurposes.includes(purpose)) return json({ error: "the voice's owner hasn't allowed this", private: true }, 403);
  const prefs = await prefsMap(db, fam);
  let text;
  if (body?.phrase) {
    // A fixed sentence the connector chooses: the listener must allow simple confirmations.
    text = PHRASES[body.phrase];
    if (!text) return json({ error: 'unknown phrase' }, 400);
    if (!grantsHold([[me.id, 'confirmations']], (m) => prefs[m])) return json({ error: 'not allowed for cloud voice', private: true }, 403);
  } else {
    // 3–9. The exact ticketed text, signed by us, for this member and family, unexpired, unused,
    // for this voice, and still allowed by everyone whose data it came from.
    text = String(body?.text || '');
    if (!text || text.length > TTS_MAX) return json({ error: 'nothing to say' }, 400);
    const t = await readTicket(env, body?.ticket);
    if (!t || t.v !== 1) return json({ error: 'not speakable', private: true }, 403);
    if (t.u !== user.uid || t.f !== fam.fid || t.m !== me.id) return json({ error: 'not speakable', private: true }, 403);
    if (t.h !== (await textHash(text))) return json({ error: 'not speakable', private: true }, 403);
    if (!(t.exp > Date.now())) return json({ error: 'this answer can no longer be spoken — ask again', private: true }, 403);
    if (t.p !== profile.id || t.vh !== profile.vh || t.pu !== purpose) return json({ error: 'not speakable', private: true }, 403);
    if (t.pv !== POLICY_VERSION || !grantsHold(t.g, (m) => prefs[m])) return json({ error: 'not allowed for cloud voice', private: true }, 403);
    if (await db.get(`ttsn:${t.n}`)) return json({ error: 'already spoken', private: true }, 409);
    await db.put(`ttsn:${t.n}`, 1, { expirationTtl: 300 });
  }
  // 10–11. Size and the day's limit.
  const perDay = Math.max(1, Math.min(500, +env.ELEVENLABS_PER_DAY || TTS_PER_DAY));
  if (!(await underLimit(db, `rate:${user.uid}:tts:${new Date().toISOString().slice(0, 10)}`, perDay, 86400 * 2))) return json({ error: "that's all the spoken answers for today", private: true }, 429);
  if (state.used + text.length > state.cap) return json({ error: 'Using device voice for now.', private: true, fallback: true }, 503);
  // 12. Only now, ElevenLabs.
  try {
    const audio = await speak(env, text, ctx);
    await db.put(`ttschars:${fam.fid}:${today()}`, state.used + text.length, { expirationTtl: 86400 * 2 });
    return { status: 200, audio };
  } catch (e) {
    if (e.pause) await pause(db, e.status);
    return json({ error: 'Using device voice for now.', private: true, fallback: true }, e.status === 429 ? 429 : 502);
  }
}
