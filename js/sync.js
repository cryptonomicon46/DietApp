import { PROFILES, global, onChange, exportProfile, importProfile, activeProfile, ownerId } from './storage.js';
import { account } from './account.js';

// Household sync through the connector worker (server/worker.js, KV storage).
// Each phone uploads its owner's data and downloads everyone else's to view.
// settings = {url, code}: connector URL and shared household code. The phone's owner
// (storage.ownerId) is the one whose data this phone uploads.
// Signed in to the family app (account.js)? Then your data is saved to your OurPawmily account
// only, and who sees it is what you chose there (Diet and Fitness, person by person) — this phone
// stops uploading to the household code (2.0 Phase 10). Until your partner moves over too, their
// copy is still read from the code; once they're in the family with their trackers, only what they
// share with you comes, from their account. Old copies stay on the connector for 🛟 Recover.

export const sync = {
  settings: () => global.get('sync', null),
  // 2.0: sharing is through your OurPawmily family, so this phone never makes, joins or changes a
  // household code any more. A phone that already has one keeps syncing it (and following a change
  // made from an older copy of the app) until it moves to its family.
  // If the other phone moved our household (a newer link than ours), follow it. A phone you
  // linked yourself (code or phrase typed / link opened) stays put, so codes can't drift apart.
  async follow() {
    // Your partner changed the code: stop using this one (and empty your record on it).
    const first = await fetch(`${this.settings().url}/household/${encodeURIComponent(this.settings().code)}/link`).catch(() => null);
    const note = first?.ok ? await first.json().catch(() => ({})) : {};
    const s0 = this.settings();
    if (note.moved && note.by !== ownerId() && (note.savedAt || 0) > (s0.linkedAt || 0)) {
      clearTimeout(timer); timer = null;
      this.save({ ...s0, moved: { by: note.by, at: note.savedAt } });
      await fetch(`${s0.url}/household/${encodeURIComponent(s0.code)}/${ownerId()}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moved: true, savedAt: 0 }),
      }).catch(() => {});
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('lp:household'));
      return 'moved';
    }
    if (s0.linkedAt) return false;
    let moved = false;
    for (let i = 0; i < 3; i++) {
      const s = this.settings();
      const res = await fetch(`${s.url}/household/${encodeURIComponent(s.code)}/link`);
      if (!res.ok) break;
      const note = await res.json().catch(() => ({}));
      if (!note.movedTo || note.movedTo === s.code || !/^[a-z0-9-]{12,64}$/.test(note.movedTo) || (note.savedAt || 0) <= (s.linkedAt || 0)) break;
      this.save({ ...s, code: note.movedTo, linkedAt: note.savedAt });
      moved = true;
    }
    return moved;
  },
  save(s) { global.set('sync', s); },
  // Reading partners who haven't moved yet.
  householdReads() { const s = this.settings(); return !!(s?.url && s?.code && !s.moved && ownerId() && !account.get()?.householdOff); },
  // Uploading this phone's copy: only a phone that isn't signed in to the family.
  // (Signed in = a family sign-in on this phone, even while its account record is being refreshed.)
  household() { return this.householdReads() && !account.active() && !token(); },
  // Someone in your family who has their trackers on their account: never read from the code.
  movedToAccount(profileId) { return !!(account.active() && account.get()?.members?.[profileId]); },
  enabled() { return this.household() || account.active(); },
  // Only the phone's owner can edit; anyone else's profile is view-only.
  readOnly() { return !!ownerId() && activeProfile().id !== ownerId(); },

  async push() {
    if (account.active()) await account.push();
    const s = this.settings();
    if (!this.household()) return;
    // Nothing changed since the last upload: no write (the free plan allows 1,000 a day).
    const data = exportProfile(ownerId(), { shared: true });
    const text = JSON.stringify(data);
    let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    const sig = `${s.code}:${ownerId()}:${(h >>> 0).toString(36)}${text.length.toString(36)}`;
    if (sig === global.get('householdSentSig', '')) return;
    const res = await fetch(`${s.url}/household/${encodeURIComponent(s.code)}/${ownerId()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedAt: Date.now(), data }),
    });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    global.set('householdSentSig', sig);
    global.set('pushedAt', Date.now());
  },

  // Returns true when someone else's data changed.
  async pull() {
    // Something waiting to upload goes first, so it isn't replaced by an older copy.
    if (timer) { clearTimeout(timer); timer = null; await this.push().catch(() => {}); }
    let changed = false, got = [];
    if (token() && !account.active()) await account.connect().catch(() => null);
    if (account.active()) ({ changed, got } = await account.pull());
    const s = this.settings();
    if (!this.householdReads()) { global.set('pulledAt', Date.now()); return changed; }
    if (this.household()) {
      const followed = await this.follow();
      if (followed === 'moved') return true;
      if (followed) await this.push();
    }
    for (const p of PROFILES.filter((x) => x.id !== ownerId() && !got.includes(x.id) && !this.movedToAccount(x.id))) {
      const res = await fetch(`${s.url}/household/${encodeURIComponent(this.settings().code)}/${p.id}`);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const body = await res.json();
      if (body.moved) continue;
      const seen = global.get(`seen.${p.id}`, 0);
      if (body.savedAt > seen) {
        importProfile(p.id, body.data || {});
        global.set(`seen.${p.id}`, body.savedAt);
        changed = true;
      }
    }
    global.set('pulledAt', Date.now());
    return changed;
  },
};

const token = () => { try { return localStorage.getItem('fam.mode') !== 'demo' && localStorage.getItem('fam.token.live'); } catch { return null; } };

// Upload a few seconds after the owner changes anything.
let timer = null;
onChange((id) => {
  if (!sync.enabled() || id !== ownerId()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; sync.push().catch(() => {}); }, 3000);
});
// Switching away pauses the page on phones, so send anything waiting right away.
if (typeof document !== 'undefined') {
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; sync.push().catch(() => {}); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}

// Upload now (notes, plans, replies): don't wait for the quiet period.
export async function pushNow() {
  clearTimeout(timer); timer = null;
  try { await sync.push(); global.set('pushError', null); return true; }
  catch (err) { global.set('pushError', err.message); return false; }
}

// A typed code or phrase → the household code both phones use. Only letters and digits
// count, so "Blue Kites", "blue-kites" and "bluekites" are the same household. Short
// phrases get a fixed prefix to meet the connector's 12-character minimum.
export function householdCode(input) {
  let code = String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.startsWith('household') && code.length > 'household'.length) code = code.slice('household'.length);
  if (code.length < 6) return null;
  if (code.length < 12) code = `household${code}`;
  return code.length <= 64 ? code : null;
}

// Codes saved by older versions (with hyphens) move to the same form, so two phones that
// typed the same phrase differently end up together.
(function normalizeSavedCode() {
  const s = global.get('sync', null);
  const code = s?.code && householdCode(s.code);
  if (code && code !== s.code) global.set('sync', { ...s, code });
})();

