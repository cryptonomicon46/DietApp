// Saves the trackers to your OurPawmily account (the family app's Google sign-in) instead of only
// this phone. Both apps live on the same site, so when you're signed in to the family app the
// trackers find the sign-in here and use it:
//   - your profile is your member's data in your family (GET/PUT /v2/families/<fid>/members/<id>/data),
//     so it's the same on every phone or computer you sign in on;
//   - your partner's profile comes from their member's data, but only if they turned sharing on
//     for you (Me › Who can see my diet & fitness). Friends' families never get it — the server
//     only answers members of the family.
// The household code keeps working alongside while a partner hasn't moved over yet.
import { PROFILES, global, ownerId, setOwner, exportProfile, importProfile } from './storage.js';

const LS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const CONNECTOR = 'https://lean-plate-connect.sandman-amani.workers.dev';
const connector = () => { try { return JSON.parse(LS('lp.g.sync'))?.url || CONNECTOR; } catch { return CONNECTOR; } };
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
    const acct = { fid: fam.fid, family: fam.name, email: r.data.user.email, me: me.id, profile, members };
    global.set('account', acct);
    return acct;
  },

  // Your profile → your account. Never before this device has read the account once, so a new
  // device can't overwrite your data with an empty profile.
  async push() {
    const a = this.get();
    if (!a || !global.get('account.pulled', false)) return;
    const r = await call('PUT', `/families/${a.fid}/members/${a.me}/data`, { data: exportProfile(a.profile, { shared: true }) });
    if (r.status !== 200) throw new Error(r.data.error || `account upload failed (${r.status})`);
    global.set('account.mineAt', r.data.savedAt || Date.now());
    global.set('pushedAt', Date.now());
    await this.pushDogs(a).catch(() => {});
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
      const prof = (d.status === 200 && d.data.data?.profile) || {};
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
      if ((await call('PUT', `/families/${a.fid}/members/${pid}/data`, { data: { profile } })).status === 200) sent[d.id] = sig;
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
      const remote = mine.data;
      const first = !global.get('account.pulled', false);
      if (first || (remote.savedAt || 0) > global.get('account.mineAt', 0)) {
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
      const r = await call('GET', `/families/${a.fid}/members/${id}/data`);
      if (r.status !== 200) continue; // not shared with you (or not there): the household code may still have it
      out.got.push(p.id);
      if ((r.data.savedAt || 0) > global.get(`seen.${p.id}`, 0) && Object.keys(r.data.data || {}).length) {
        importProfile(p.id, r.data.data);
        global.set(`seen.${p.id}`, r.data.savedAt);
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
