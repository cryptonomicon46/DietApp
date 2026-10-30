// Saves the trackers to your OurPawmily account (the family app's Google sign-in) instead of only
// this phone. Both apps live on the same site, so when you're signed in to the family app the
// trackers find the sign-in here and use it:
//   - your profile is your member's data in your family (GET/PUT /v2/families/<fid>/members/<id>/data),
//     so it's the same on every phone or computer you sign in on;
//   - your partner's profile comes from their member's data, but only if they turned sharing on
//     for you (Me › Who can see my diet & fitness). Friends' families never get it — the server
//     only answers members of the family.
// The household code keeps working alongside while a partner hasn't moved over yet.
import { serverUrl } from './server.js';
import { PROFILES, global, ownerId, setOwner, exportProfile, importProfile } from './storage.js';
import { keys, seal, tryOpen, checkKey, sealBytes, openBytes } from '../family/crypto.js';
import { splitHealth, joinParts, sigOf, PART_NAMES } from './healthParts.js';

// 🔐 An end-to-end encrypted family: this device's family key (the family app keeps it), checked.
// Locked copies are {enc: "e1:…"}; without the key they can't be read, so they're left alone.
async function familyKey(a) {
  const k = await keys.get(a.fid);
  return k && (!a.keyCheck || await checkKey(k, a.keyCheck)) ? k : null;
}
const lockData = async (a, data) => { const k = await familyKey(a); if (a.e2ee && !k) throw new Error('This device needs the family key — open OurPawmily › Me › 🔐 Encryption'); return k ? { enc: await seal(k, data) } : data; };
const openData = async (a, data) => (data?.enc == null ? data || {} : tryOpen(await familyKey(a), data.enc, null));

// A short fingerprint of some text (to tell whether anything changed).
const hashOf = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + str.length.toString(36); };
const LS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const connector = () => serverUrl();
const token = () => (LS('fam.mode') === 'demo' ? null : LS('fam.token.live'));

async function call(method, path, body, timeout = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`${connector()}/v2${path}`, { method, signal: ctl.signal, headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) global.set('account', null);
    return { status: res.status, data };
  } finally { clearTimeout(t); }
}

// account (saved per device): {fid, family, email, me, profile, members: {profileId: memberId}}
export const account = {
  get: () => (token() ? global.get('account', null) : null),
  active() { return !!this.get()?.me; },

  // Finds your family and which tracker profile is yours. Picks up a profile for a new device.
  async connect() {
    if (!token()) { global.set('account', null); return null; }
    const r = await call('GET', '/me');
    if (r.status !== 200) return r.status === 401 ? null : this.get();
    const fid = LS('fam.fid');
    const fam = r.data.families.find((f) => f.fid === fid) || r.data.families[0];
    if (!fam) { global.set('account', null); return null; }
    const me = fam.members.find((m) => m.id === fam.me);
    const ids = PROFILES.map((p) => p.id);
    let profile = ids.includes(me.legacyId) ? me.legacyId : null;
    if (!profile) {
      // A tracker profile nobody else in the family is using: this phone's, or the first free one.
      const taken = new Set(fam.members.filter((m) => m.id !== me.id).map((m) => m.legacyId));
      profile = [ownerId(), ...ids].find((id) => id && ids.includes(id) && !taken.has(id));
      if (!profile) return null;
      await call('PATCH', `/families/${fam.fid}/members/${me.id}`, { legacyId: profile });
    }
    if (!ownerId()) setOwner(profile);
    if (ownerId() !== profile) return null; // this device belongs to someone else's tracker profile
    const members = {};
    for (const m of fam.members) if (m.kind === 'person' && ids.includes(m.legacyId)) members[m.legacyId] = m.id;
    members[profile] = me.id;
    // Both of you on accounts, each sharing with the other: the household code has nothing left
    // to carry, so it stops (its last copies stay on the server for 🛟 Recover).
    const others = PROFILES.filter((p) => p.id !== profile).map((p) => fam.members.find((m) => m.id === members[p.id]));
    const householdOff = others.length > 0 && others.every((m) => m && m.status === 'active' && (m.shareWith || []).includes(me.id) && (me.shareWith || []).includes(m.id));
    const acct = { fid: fam.fid, family: fam.name, email: r.data.user.email, me: me.id, profile, members, e2ee: !!fam.e2ee, keyCheck: fam.keyCheck || '', householdOff };
    global.set('account', acct);
    return acct;
  },

  // Your profile → your account. Never before this device has read the account once, so a new
  // device can't overwrite your data with an empty profile.
  // One upload at a time: a second call waits, then finds nothing changed (no duplicate writes).
  push() { this._q = (this._q || Promise.resolve()).catch(() => {}).then(() => this._push()); return this._q; },
  async _push() {
    const a = this.get();
    if (a?.e2ee && !(await familyKey(a))) throw new Error('This device needs the family key — open OurPawmily › Me › 🔐 Encryption');
    if (!a || !global.get('account.pulled', false)) return;
    // Nothing changed since the last upload: no write (the free plan allows 1,000 a day).
    const mine = exportProfile(a.profile, { shared: true });
    const sig = `${a.fid}:${a.me}:${hashOf(JSON.stringify(mine))}`;
    if (sig === global.get('account.sentSig', '')) { await this.pushParts(a, mine).catch(() => {}); await this.pushDogs(a).catch(() => {}); return; }
    // WHOOP Recovery and Sleep ride only in your own full copy: the parts go up first, so the
    // connector already knows to keep that copy to you alone (healthSplit) before it holds them.
    if (mine.whoopDaily) await this.pushParts(a, mine).catch(() => {});
    const r = await call('PUT', `/families/${a.fid}/members/${a.me}/data`, { data: await lockData(a, mine) });
    if (r.status !== 200) throw new Error(r.data.error || `account upload failed (${r.status})`);
    global.set('account.sentSig', sig);
    global.set('account.mineAt', r.data.savedAt || Date.now());
    global.set('pushedAt', Date.now());
    await this.pushParts(a, mine).catch(() => {});
    await this.pushDogs(a).catch(() => {});
  },
  // 💪 The same profile as Diet, Fitness and Us parts — what the family can be given separately.
  // Each goes up only when it changed.
  async pushParts(a, mine) {
    const parts = splitHealth(mine);
    for (const part of PART_NAMES) {
      const sig = `${a.fid}:${a.me}:${sigOf(parts[part])}`;
      if (global.get(`account.partSig.${part}`, '') === sig) continue;
      const r = await call('PUT', `/families/${a.fid}/members/${a.me}/health/${part}`, { data: await lockData(a, parts[part]) });
      if (r.status === 200) global.set(`account.partSig.${part}`, sig);
    }
  },

  // 📎 Family files — dog documents and adoption photos: locked on this device with the family key
  // and kept in the family's file store, like thread files. Each returns false / null when there's
  // no account here (or an encrypted family without its key on this device), so callers can fall back.
  async putFile(id, blob) {
    const a = this.get();
    if (!a?.me) return false;
    const k = await familyKey(a);
    if (a.e2ee && !k) return false;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const res = await fetch(`${connector()}/v2/families/${a.fid}/photos/${id}?size=doc`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/octet-stream' }, body: k ? await sealBytes(k, bytes) : bytes }).catch(() => null);
    return !!res?.ok;
  },
  async getFile(id, type = '') {
    const a = this.get();
    if (!a?.me) return null;
    // Still locked on this device: nothing (never the locked bytes, which would then be kept as the file).
    const k = await familyKey(a);
    if (a.e2ee && !k) return null;
    const res = await fetch(`${connector()}/v2/families/${a.fid}/photos/${id}?size=doc`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null);
    if (!res?.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const plain = k ? await openBytes(k, bytes).catch(() => null) : bytes;
    return plain ? new Blob([plain], { type: type || 'application/octet-stream' }) : null;
  },
  async delFile(id) {
    const a = this.get();
    if (a?.me) await fetch(`${connector()}/v2/families/${a.fid}/photos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
  },

  // 📲 A linked calendar's events, fetched by the connector for you (the secret link goes in the body).
  async ics(url) {
    const r = await call('POST', '/ics', { url }, 20000);
    return { ok: r.status === 200, status: r.status, text: r.data.ics || '', error: r.data.error };
  },

  // 🤖 Ask Claude for a tracker command, through your account (no household code needed).
  async assist(text, context) {
    const r = await call('POST', '/assistant', { text, context }, 30000);
    return { ok: r.status === 200, status: r.status, ...r.data };
  },

  // 📈 Ask about my plan: the plan's numbers (js/planCoach.js), the question and this chat's
  // earlier turns — the connector rebuilds the numbers through the same allowlist.
  async askPlan(question, facts, turns) {
    const r = await call('POST', '/ai/plan', { question, facts, turns }, 30000);
    return { ok: r.status === 200, status: r.status, ...r.data };
  },

  // ---------- the dogs: one set for the family app and the trackers ----------
  // The family's dog pets become a third copy of each dog in the trackers (dogs.js merges it
  // with yours and your partner's, newest edit of each field winning). Their name, breed,
  // birthday and photo come from the pet; everything else (food, meds, vaccines, vet) from the
  // pet's data, which is where the trackers send their copy back.
  async pullDogs(a) {
    const r = await call('GET', `/families/${a.fid}`);
    if (r.status !== 200) return false;
    const { allDogs, DOG_FIELDS } = await import('./dogs.js');
    const local = allDogs().filter((d) => d.person !== 'family');
    const links = {}, out = {};
    for (const p of r.data.family.members.filter((m) => m.kind === 'pet' && m.species === 'dog')) {
      let id = p.legacyId?.startsWith('dog-') ? p.legacyId.slice(4) : null;
      if (!id) {
        // A dog added in the family app that the trackers already know by name: link the two.
        const same = local.find((d) => d.name?.trim().toLowerCase() === p.name.trim().toLowerCase() && !Object.keys(links).includes(d.id));
        id = same?.id || `fam${p.id}`;
        await call('PATCH', `/families/${a.fid}/members/${p.id}`, { legacyId: `dog-${id}` });
      }
      links[id] = p.id;
      const d = await call('GET', `/families/${a.fid}/members/${p.id}/data`);
      const prof = (d.status === 200 && (await openData(a, d.data.data))?.profile) || {};
      const photo = /^data:image\//.test(p.avatar || '') ? p.avatar : '';
      const ident = { name: p.name, breed: p.breed || prof.breed || '', birthday: p.born || prof.birthday || '', photo, emoji: photo ? prof.emoji || '🐕' : p.avatar || prof.emoji || '🐕' };
      const times = { ...(prof.times || {}) };
      for (const f of Object.keys(ident)) times[f] = Math.max(times[f] || 0, p.editedAt || 0);
      // Fields this copy doesn't hold count as old, so they never wipe the trackers' details.
      for (const f of DOG_FIELDS) times[f] ??= 0;
      const { person, editedBy, ...rest } = prof;
      out[id] = { ...rest, ...ident, id, times, updatedAt: Math.max(prof.updatedAt || 0, p.editedAt || 0), createdAt: prof.createdAt || p.editedAt || 0 };
    }
    const changed = JSON.stringify(out) !== JSON.stringify(global.get('famDogs', {}));
    global.set('famDogs', out);
    global.set('famDogLinks', links);
    global.set('famDogsPulled', true);
    return changed;
  },
  // Your trackers' dogs → the family app: new dogs become pets, changes update the pet and its data.
  async pushDogs(a) {
    if (!global.get('famDogsPulled', false)) return; // only once the family's dogs are known: no duplicates
    const links = global.get('famDogLinks', {}), sent = global.get('famDogSent', {}), fam = global.get('famDogs', {});
    for (const d of (await import('./dogs.js')).allDogs()) {
      const { person, editedBy, docs, removedDocs, ...profile } = d;
      const sig = JSON.stringify(profile);
      if (sent[d.id] === sig) continue;
      const avatar = d.photo || d.emoji || '';
      let pid = links[d.id];
      if (!pid) {
        const r = await call('POST', `/families/${a.fid}/members`, { kind: 'pet', species: 'dog', name: d.name || 'Dog', breed: d.breed || '', born: d.birthday || '', avatar, legacyId: `dog-${d.id}` });
        if (r.status !== 200) continue;
        pid = links[d.id] = r.data.member.id;
      } else {
        const f = fam[d.id] || {};
        if (f.name !== d.name || (f.breed || '') !== (d.breed || '') || (f.birthday || '') !== (d.birthday || '') || (f.photo || f.emoji || '') !== avatar) {
          await call('PATCH', `/families/${a.fid}/members/${pid}`, { name: d.name, breed: d.breed || '', born: d.birthday || '', avatar });
        }
      }
      if ((await call('PUT', `/families/${a.fid}/members/${pid}/data`, { data: await lockData(a, { profile }) })).status === 200) sent[d.id] = sig;
    }
    global.set('famDogLinks', links);
    global.set('famDogSent', sent);
  },

  // Your own data saved from another device, and your partner's if they share it with you.
  // → {changed, got: [profile ids that came from the account]}
  async pull() {
    const a = this.get();
    const out = { changed: false, got: [] };
    if (!a) return out;
    const mine = await call('GET', `/families/${a.fid}/members/${a.me}/data`);
    if (mine.status === 200) {
      const remote = { ...mine.data, data: await openData(a, mine.data.data) };
      const first = !global.get('account.pulled', false);
      // A locked copy this device can't open is left alone (and nothing is sent until it can).
      if (remote.data && (first || (remote.savedAt || 0) > global.get('account.mineAt', 0))) {
        // Another device saved since this one last looked: the two copies are combined, never
        // swapped, so a nearly empty device can't wipe a full one (or the other way round).
        const local = exportProfile(a.profile, { shared: true });
        const theirs = remote.data || {};
        const remoteWins = first ? Object.keys(local).length < Object.keys(theirs).length : true;
        const merged = mergeData(local, theirs, remoteWins);
        if (!same(merged, local)) {
          importProfile(a.profile, merged);
          out.changed = true;
          if (!first && typeof window !== 'undefined') window.dispatchEvent(new Event('lp:mine'));
        }
        global.set('account.mineAt', remote.savedAt || 0);
        global.set('account.pulled', true);
        if (!same(merged, theirs)) await this.push();
      }
    }
    if (await this.pullDogs(a).catch(() => false)) out.changed = true;
    await this.pushDogs(a).catch(() => {});
    for (const p of PROFILES.filter((x) => x.id !== a.profile)) {
      const id = a.members[p.id];
      if (!id) continue;
      // What they share with you: their Diet / Fitness parts (and Us, as their partner). Before
      // their phone has split them, their full copy — if you could see it before.
      const parts = await Promise.all(PART_NAMES.map((part) => call('GET', `/families/${a.fid}/members/${id}/health/${part}`)));
      const ok = parts.filter((r) => r.status === 200 && !r.data.none);
      let theirData = null, savedAt = 0;
      if (ok.length) {
        const opened = await Promise.all(ok.map((r) => openData(a, r.data.data)));
        if (opened.some((x) => x == null)) continue; // locked on this device
        theirData = joinParts(...opened); savedAt = Math.max(...ok.map((r) => r.data.savedAt || 0));
      } else {
        const r = await call('GET', `/families/${a.fid}/members/${id}/data`);
        if (r.status !== 200) continue; // not shared with you (or not there): the household code may still have it
        theirData = await openData(a, r.data.data); savedAt = r.data.savedAt || 0;
      }
      out.got.push(p.id);
      if (theirData && savedAt > global.get(`seen.${p.id}`, 0) && Object.keys(theirData).length) {
        importProfile(p.id, theirData);
        global.set(`seen.${p.id}`, savedAt);
        out.changed = true;
      }
    }
    global.set('pulledAt', Date.now());
    return out;
  },
};

// Before the trackers start on a device that hasn't read the account yet (a new phone or
// computer): find your profile and bring your data down first. Elsewhere it catches up later.
export async function accountBoot() {
  if (!token() || (ownerId() && global.get('account.pulled', false) && account.get())) return;
  try {
    await Promise.race([(async () => { if (await account.connect()) await account.pull(); })(), new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* offline: the trackers start from this device's copy */ }
}

// ---------- combining two copies of one person's trackers ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Lists keep everything from both copies. Entries with an id match by id; lists with one entry
// per date (weigh-ins) match by date; anything else matches only if identical.
function mergeList(x, y, yWins) {
  const all = [...x, ...y];
  const byDate = all.every((v) => plain(v) && v.date && v.id == null)
    && new Set(x.map((v) => v.date)).size === x.length && new Set(y.map((v) => v.date)).size === y.length;
  const key = (v) => (plain(v) && v.id != null ? `id:${v.id}` : byDate ? `d:${v.date}` : JSON.stringify(v));
  const out = [...x];
  const at = new Map(out.map((v, i) => [key(v), i]));
  for (const v of y) {
    const i = at.get(key(v));
    if (i == null) { at.set(key(v), out.length); out.push(v); } else if (yWins) out[i] = v;
  }
  return byDate ? out.sort((a, b) => String(a.date).localeCompare(String(b.date))) : out;
}
// Everything from both; where both have a different single value, yWins picks y's.
export function mergeData(x, y, yWins = true) {
  if (x === undefined) return y;
  if (y === undefined) return x;
  if (Array.isArray(x) && Array.isArray(y)) return mergeList(x, y, yWins);
  if (plain(x) && plain(y)) {
    const out = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) out[k] = mergeData(x[k], y[k], yWins);
    return out;
  }
  return yWins ? y : x;
}
