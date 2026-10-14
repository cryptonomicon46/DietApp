import { PROFILES, global, onChange, exportProfile, importProfile, activeProfile, ownerId } from './storage.js';

// Household sync through the connector worker (server/worker.js, KV storage).
// Each phone uploads its owner's data and downloads everyone else's to view.
// settings = {url, code}: connector URL and shared household code. The phone's owner
// (storage.ownerId) is the one whose data this phone uploads.

// Your Cloudflare connector. Not secret: data there can only be read with the household code.
export const DEFAULT_CONNECTOR = 'https://lean-plate-connect.sandman-amani.workers.dev';

export const sync = {
  settings: () => global.get('sync', null),
  // Sharing is on by default: each phone starts its own private household code, and
  // linking the two phones is typing one phone's code into the other (join).
  ensure() {
    if (this.settings() || !ownerId() || global.get('shareOff', false)) return false;
    this.save({ url: DEFAULT_CONNECTOR, code: newHouseholdCode() });
    return true;
  },
  async join(code) {
    code = code.trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9-]{12,64}$/.test(code)) throw new Error('That code doesn\'t look right — it\'s 3 groups of 4 letters/numbers.');
    global.set('shareOff', false);
    this.save({ url: this.settings()?.url || DEFAULT_CONNECTOR, code });
    await this.push();
    return this.pull();
  },
  save(s) { global.set('sync', s); },
  enabled() { const s = this.settings(); return !!(s?.url && s?.code && ownerId()); },
  // Only the phone's owner can edit; anyone else's profile is view-only.
  readOnly() { return !!ownerId() && activeProfile().id !== ownerId(); },

  async push() {
    const s = this.settings();
    if (!this.enabled()) return;
    const res = await fetch(`${s.url}/household/${encodeURIComponent(s.code)}/${ownerId()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedAt: Date.now(), data: exportProfile(ownerId()) }),
    });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    global.set('pushedAt', Date.now());
  },

  // Returns true when someone else's data changed.
  async pull() {
    const s = this.settings();
    if (!this.enabled()) return false;
    let changed = false;
    for (const p of PROFILES.filter((x) => x.id !== ownerId())) {
      const res = await fetch(`${s.url}/household/${encodeURIComponent(s.code)}/${p.id}`);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const body = await res.json();
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

// Upload a few seconds after the owner changes anything.
let timer = null;
onChange((id) => {
  if (!sync.enabled() || id !== ownerId()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync.push().catch(() => {}), 3000);
});

export function newHouseholdCode() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
