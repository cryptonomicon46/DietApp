import { PROFILES, global, onChange, exportProfile, importProfile, activeProfile, ownerId } from './storage.js';
import { account } from './account.js';

// Household sync through the connector worker (server/worker.js, KV storage).
// Each phone uploads its owner's data and downloads everyone else's to view.
// settings = {url, code}: connector URL and shared household code. The phone's owner
// (storage.ownerId) is the one whose data this phone uploads.
// Signed in to the family app (account.js)? Then your data is also saved to your OurPawmily
// account, and your partner's comes from there when they share it with you; the household code
// carries on alongside until both of you have moved over (and share with each other), then stops.

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
    const s = this.settings();
    const url = s?.url || DEFAULT_CONNECTOR;
    // After your partner changed the code, only their new code is accepted (it already holds
    // their data), and nothing is left on the old code pointing to it.
    if (s?.moved) {
      if (code === s.code) throw new Error('That\'s the old code. Use the new one from the other phone.');
      const res = await fetch(`${url}/household/${encodeURIComponent(code)}/${s.moved.by}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'That code doesn\'t match. Ask for the new code to be sent again.' : `Couldn't check the code (${res.status}).`);
    }
    global.set('shareOff', false);
    const old = s?.code;
    const at = Date.now();
    this.save({ url, code, linkedAt: at, ...(s?.moved ? { changedAt: s.moved.at } : {}) });
    if (old && old !== code && !s?.moved) await this.forward(old, code, at);
    await this.push();
    return this.pull();
  },
  // Change the household code (either phone, any time): everything moves to a new random
  // code, then the old code is emptied and marked "moved", without saying where to. The
  // partner's phone sees that, stops using the old code, and asks for the new one, which
  // you send it yourselves. fileIds: dog documents and adoption photos to carry over.
  async rotate(fileIds = []) {
    const s = this.settings();
    if (!this.household()) throw new Error('Turn on sharing first.');
    const old = s.code;
    const code = householdCode(newHouseholdCode());
    const at = Date.now();
    const rec = (c, k) => `${s.url}/household/${encodeURIComponent(c)}/${k}`;
    const put = (u, body, type = 'application/json') => fetch(u, { method: 'PUT', headers: { 'Content-Type': type }, body });
    // 1. Your partner's latest data, so the new code is complete before they switch.
    for (const p of PROFILES.filter((x) => x.id !== ownerId())) {
      const res = await fetch(rec(old, p.id));
      if (!res.ok) continue;
      const text = await res.text();
      if (JSON.parse(text)?.moved) continue;
      if (!(await put(rec(code, p.id), text)).ok) throw new Error('Couldn\'t copy to the new code. Nothing changed.');
    }
    // 2. Your own data, and this phone switches.
    this.save({ url: s.url, code, linkedAt: at, changedAt: at });
    try { await this.push(); } catch (err) { this.save(s); throw new Error(`Couldn't reach the connector. Nothing changed. (${err.message})`); }
    // 3. Files.
    let files = 0;
    for (const id of new Set(fileIds)) {
      const res = await fetch(rec(old, `file/${id}`)).catch(() => null);
      if (!res?.ok) continue;
      const blob = await res.blob();
      if ((await put(rec(code, `file/${id}`), blob, res.headers.get('Content-Type') || blob.type).catch(() => null))?.ok) {
        files++;
        await fetch(rec(old, `file/${id}`), { method: 'DELETE' }).catch(() => {});
      }
    }
    // 4. Empty the old code. savedAt 0 so an older app version never imports the empty record.
    await put(rec(old, 'link'), JSON.stringify({ moved: true, by: ownerId(), savedAt: at }));
    for (const p of PROFILES) await put(rec(old, p.id), JSON.stringify({ moved: true, savedAt: 0 })).catch(() => {});
    return { code, files };
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
  household() { const s = this.settings(); return !!(s?.url && s?.code && !s.moved && ownerId() && !account.get()?.householdOff); },
  enabled() { return this.household() || account.active(); },
  // Only the phone's owner can edit; anyone else's profile is view-only.
  readOnly() { return !!ownerId() && activeProfile().id !== ownerId(); },

  async push() {
    if (account.active()) await account.push();
    const s = this.settings();
    if (!this.household()) return;
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
    // Something waiting to upload goes first, so it isn't replaced by an older copy.
    if (timer) { clearTimeout(timer); timer = null; await this.push().catch(() => {}); }
    let changed = false, got = [];
    if (token() && !account.active()) await account.connect().catch(() => null);
    if (account.active()) ({ changed, got } = await account.pull());
    const s = this.settings();
    if (!this.household()) { global.set('pulledAt', Date.now()); return changed; }
    const followed = await this.follow();
    if (followed === 'moved') return true;
    if (followed) await this.push();
    for (const p of PROFILES.filter((x) => x.id !== ownerId() && !got.includes(x.id))) {
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

export function newHouseholdCode() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
