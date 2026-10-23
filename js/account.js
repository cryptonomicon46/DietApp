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
      const local = Object.keys(exportProfile(a.profile, { shared: true })).length > 0;
      if (first && local) {
        // The device you've been using: its copy is the latest, so it goes up.
        global.set('account.pulled', true);
        await this.push();
      } else if ((remote.savedAt || 0) > global.get('account.mineAt', 0) && Object.keys(remote.data || {}).length) {
        importProfile(a.profile, remote.data);
        global.set('account.mineAt', remote.savedAt);
        out.changed = true;
        if (!first && typeof window !== 'undefined') window.dispatchEvent(new Event('lp:mine'));
      }
      global.set('account.pulled', true);
    }
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
