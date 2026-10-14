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
    this.save({ url: DEFAULT_CONNECTOR, code: householdCode(newHouseholdCode()) });
    return true;
  },
  // Link with another phone's code: this phone switches to exactly that code, and its old
  // code gets a forwarding note so a phone still on it follows. If both phones enter each
  // other's code, the later link wins (notes older than this phone's own link are ignored).
  async join(code) {
    // Accepts the other phone's code or a private phrase you both type ("Sunset Tacos 4821").
    code = householdCode(code);
    if (!code) throw new Error('Use the code from the other phone, or a phrase of at least 6 letters/numbers (both phones type the same one).');
    global.set('shareOff', false);
    const url = this.settings()?.url || DEFAULT_CONNECTOR;
    const old = this.settings()?.code;
    const at = Date.now();
    this.save({ url, code, linkedAt: at });
    if (old && old !== code) await this.forward(old, code, at);
    await this.push();
    return this.pull();
  },
  async forward(from, to, at) {
    const res = await fetch(`${this.settings().url}/household/${encodeURIComponent(from)}/link`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ movedTo: to, savedAt: at }),
    });
    if (!res.ok) throw new Error(`link failed (${res.status})`);
  },
  // If the other phone moved our household (a newer link than ours), follow it. A phone you
  // linked yourself (code or phrase typed / link opened) stays put, so codes can't drift apart.
  async follow() {
    if (this.settings()?.linkedAt) return false;
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
  enabled() { const s = this.settings(); return !!(s?.url && s?.code && ownerId()); },
  // Only the phone's owner can edit; anyone else's profile is view-only.
  readOnly() { return !!ownerId() && activeProfile().id !== ownerId(); },

  async push() {
    const s = this.settings();
    if (!this.enabled()) return;
    const res = await fetch(`${s.url}/household/${encodeURIComponent(s.code)}/${ownerId()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedAt: Date.now(), data: exportProfile(ownerId(), { shared: true }) }),
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
// count, so "The Nallanis", "the-nallanis" and "thenallanis" are the same household. Short
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

export function newHouseholdCode() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
