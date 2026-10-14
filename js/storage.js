// Per-person storage. Each profile's data lives under lp.p.<id>.<key>; settings shared
// by the phone (profile list, which profile is open, household sync) live under lp.g.*.

export const PROFILES = [
  { id: 'sandman', name: 'Sandman' },
  { id: 'amani', name: 'Amani' },
];

const raw = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

export const global = {
  get: (k, fallback) => raw.get(`lp.g.${k}`) ?? fallback,
  set: (k, v) => raw.set(`lp.g.${k}`, v),
};

// Data saved before profiles existed belongs to Sandman.
(function migrate() {
  const legacy = raw.keys().filter((k) => k.startsWith('lp.') && !k.startsWith('lp.p.') && !k.startsWith('lp.g.'));
  if (!legacy.length) return;
  for (const k of legacy) {
    const v = raw.get(k);
    raw.set(`lp.p.sandman.${k.slice(3)}`, v);
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
})();

// The person this phone belongs to. Only they can set up or edit a profile here;
// everyone else's day is view-only. Phones set up before this existed belong to Sandman.
export function ownerId() {
  let id = global.get('owner', null);
  if (!id) {
    id = global.get('sync', null)?.me || (raw.get('lp.p.sandman.profile') ? 'sandman' : null);
    if (id) global.set('owner', id);
  }
  return id;
}
export function setOwner(id) { global.set('owner', id); global.set('active', id); }

export function activeProfile() {
  const id = global.get('active', 'sandman');
  return PROFILES.find((p) => p.id === id) || PROFILES[0];
}

export function setActiveProfile(id) { global.set('active', id); }

const listeners = [];
export function onChange(fn) { listeners.push(fn); }

// Storage for the profile that's open right now.
export const store = {
  get(key, fallback) { return raw.get(`lp.p.${activeProfile().id}.${key}`) ?? fallback; },
  set(key, value) {
    raw.set(`lp.p.${activeProfile().id}.${key}`, value);
    listeners.forEach((fn) => fn(activeProfile().id, key));
  },
};

// Storage for one specific person, whichever profile is open (e.g. notes on the shared board).
export function profileStore(id) {
  return {
    get: (key, fallback) => raw.get(`lp.p.${id}.${key}`) ?? fallback,
    set(key, value) { raw.set(`lp.p.${id}.${key}`, value); listeners.forEach((fn) => fn(id, key)); },
  };
}

// Everything one person has saved, as a single object (for household sync).
export function exportProfile(id) {
  const prefix = `lp.p.${id}.`;
  const out = {};
  for (const k of raw.keys()) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = raw.get(k);
  return out;
}

export function importProfile(id, data) {
  const prefix = `lp.p.${id}.`;
  for (const k of raw.keys()) if (k.startsWith(prefix) && !(k.slice(prefix.length) in data)) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
  for (const [k, v] of Object.entries(data)) raw.set(prefix + k, v);
}
