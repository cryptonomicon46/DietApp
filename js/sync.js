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
  // Link with another phone's code. Both phones settle on the alphabetically first of the
  // two codes, and the other code gets a forwarding note, so it doesn't matter which phone
  // enters which code (or if both do).
  async join(code) {
    code = code.trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9-]{12,64}$/.test(code)) throw new Error('That code doesn\'t look right — it\'s 3 groups of 4 letters/numbers.');
    global.set('shareOff', false);
    const url = this.settings()?.url || DEFAULT_CONNECTOR;
    const mine = this.settings()?.code;
    const target = mine && mine < code ? mine : code;
    const other = target === code ? mine : code;
    this.save({ url, code: target });
    if (other && other !== target) await this.forward(other, target);
    await this.push();
    return this.pull();
  },
  async forward(from, to) {
    const res = await fetch(`${this.settings().url}/household/${encodeURIComponent(from)}/link`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ movedTo: to, savedAt: Date.now() }),
    });
    if (!res.ok) throw new Error(`link failed (${res.status})`);
  },
  // If the other phone linked us into its household, follow the forwarding note.
  async follow() {
    const s = this.settings();
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${s.url}/household/${encodeURIComponent(this.settings().code)}/link`);
      if (!res.ok) return i > 0;
      const { movedTo } = await res.json().catch(() => ({}));
      if (!movedTo || movedTo === this.settings().code || !/^[a-z0-9-]{12,64}$/.test(movedTo)) return i > 0;
      this.save({ ...this.settings(), code: movedTo });
    }
    return true;
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
    if (await this.follow()) await this.push();
    let changed = false;
    for (const p of PROFILES.filter((x) => x.id !== ownerId())) {
      const res = await fetch(`${s.url}/household/${encodeURIComponent(this.settings().code)}/${p.id}`);
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
