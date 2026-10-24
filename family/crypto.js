// 🔐 End-to-end encryption for OurPawmily. Each family has one secret key (AES-256-GCM) that
// lives only on its members' devices: the server stores locked text ("e1:…") it can't read.
// Devices get the key by creating the family, from an invite link, from "Add a device", or by
// unlocking a recovery backup with your recovery phrase. Used by the family app and the
// trackers (same site, same key store).

export const SEALED = 'e1:';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
// Big buffers (photos) in chunks, so String.fromCharCode doesn't overflow the stack.
const b64uBig = (bytes) => { const u = new Uint8Array(bytes); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

export const isSealed = (v) => typeof v === 'string' && v.startsWith(SEALED);
export const newKey = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export const validKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);

const cache = new Map();
async function cryptoKey(k) {
  if (!validKey(k)) throw new Error('not a family key');
  if (!cache.has(k)) cache.set(k, crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return cache.get(k);
}

// Any JSON value → "e1:<iv><ciphertext>" that only this key opens.
export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(key), enc.encode(JSON.stringify(value)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return SEALED + b64uBig(out);
}
// Opens what seal() made. Anything not sealed (older, unencrypted data) comes back as it is.
export async function open(key, v) {
  if (!isSealed(v)) return v;
  const bytes = unb64u(v.slice(SEALED.length));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await cryptoKey(key), bytes.slice(12));
  return JSON.parse(dec.decode(pt));
}
// open() that never throws: a wrong or missing key gives `fallback`.
export async function tryOpen(key, v, fallback = null) {
  if (!isSealed(v)) return v;
  if (!key) return fallback;
  try { return await open(key, v); } catch { return fallback; }
}

// A key check stored with the family, to tell whether a key on this device is the right one.
export const CHECK = 'ourpawmily';
export const makeCheck = (key) => seal(key, CHECK);
export const checkKey = async (key, check) => (await tryOpen(key, check)) === CHECK;

// ---------- recovery phrase: your keys, locked with words only you have ----------
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
// 5 groups of 5 from 31 letters/digits ≈ 124 bits: e.g. "k7mq2-rxw9a-…".
export const newPhrase = () => Array.from({ length: 5 }, () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHA[b % 31]).join('')).join('-');
export const normPhrase = (p) => String(p || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ITER = 310000;
async function phraseKey(phrase, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normPhrase(phrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// {fid: key} → a backup the server can keep but can't open.
export async function lockBackup(phrase, keys) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await phraseKey(phrase, salt, ITER), enc.encode(JSON.stringify(keys)));
  return { v: 1, salt: b64u(salt), iv: b64u(iv), iter: ITER, ct: b64uBig(ct) };
}
export async function unlockBackup(phrase, b) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(b.iv) }, await phraseKey(phrase, unb64u(b.salt), b.iter), unb64u(b.ct));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error("That recovery phrase doesn't match"); }
}

// ---------- this device's keys: {familyId: key} ----------
// IndexedDB in the browser (localStorage if that's blocked); tests pass their own store.
let backend = null;
function browserBackend() {
  const LS = 'fam.keys';
  const ls = { get: async () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }, set: async (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* blocked */ } } };
  if (typeof indexedDB === 'undefined') return ls;
  const db = () => new Promise((res, rej) => { const r = indexedDB.open('pawmily-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const run = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('k', mode); const q = fn(tx.objectStore('k')); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); }); };
  return {
    get: async () => { try { return (await run('readonly', (s) => s.get('keys'))) || (await ls.get()); } catch { return ls.get(); } },
    set: async (v) => { try { await run('readwrite', (s) => s.put(v, 'keys')); } catch { await ls.set(v); } },
  };
}
export function useKeyStore(store) { backend = store; }
const store = () => (backend ||= browserBackend());
export const keys = {
  all: async () => ({ ...(await store().get()) }),
  get: async (fid) => (await store().get())[fid] || null,
  async set(fid, key) { if (!validKey(key)) throw new Error('not a family key'); const all = await store().get(); await store().set({ ...all, [fid]: key }); },
  async remove(fid) { const all = await store().get(); delete all[fid]; await store().set(all); },
};

// "#k=<fid>.<key>" (Add a device) and "…&k=<key>" (invites): keys travel after the "#",
// which browsers never send to a server.
export const deviceLink = (base, fid, key) => `${base}#k=${fid}.${key}`;
export function keyFromHash(hash) {
  const m = String(hash || '').match(/[#&]k=([a-z0-9]{6,24})\.([A-Za-z0-9_-]{43})/);
  return m ? { fid: m[1], key: m[2] } : null;
}
