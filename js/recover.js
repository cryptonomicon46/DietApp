// 🛟 Recover (🔐 Privacy): finds every copy of your trackers it can reach and adds back anything
// this device is missing. It only ever adds: nothing on this device is removed or replaced.
// Where copies live: this device (and a snapshot it keeps before a big shrink), your OurPawmily
// account (and the bigger copy the server keeps when a much smaller one replaced it), the
// household code (same), and backup files — including one your partner saves from their phone,
// which keeps a copy of your data from household sharing.
import { PROFILES, global, ownerId, exportProfile, importProfile } from './storage.js';
import { account, mergeData } from './account.js';
import { keys, tryOpen } from '../family/crypto.js';

const n = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
// What a copy holds, in words people recognise.
export function counts(data = {}) {
  return {
    meals: n(data.mealLog), weighIns: n(data.weights), dogs: n(data.dogProfiles),
    workouts: n(data.workouts) + n(data.liftSessions) + n(data.activities),
    notes: n(data.notes) + n(data.plans), sections: Object.keys(data).length,
  };
}
export const describe = (c) => `${c.meals} days of meals · ${c.weighIns} weigh-ins · ${c.dogs} dogs · ${c.workouts} workouts${c.notes ? ` · ${c.notes} notes & plans` : ''}`;
const size = (data) => JSON.stringify(data || {}).length;

// A backup file → one person's tracker data, or null. Understands the trackers' own backup
// ({app: 'lean-plate', profile, data}) and the family app's full backup ({localStorage: {...}}).
export function readBackup(text, person) {
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (b?.app === 'lean-plate' && b.data && typeof b.data === 'object') return b.profile === person ? b.data : null;
  if (b?.localStorage && typeof b.localStorage === 'object') {
    const prefix = `lp.p.${person}.`, out = {};
    for (const [k, v] of Object.entries(b.localStorage)) {
      if (!k.startsWith(prefix)) continue;
      try { out[k.slice(prefix.length)] = JSON.parse(v); } catch { /* skip a damaged entry */ }
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

async function getJson(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Every copy of `person`'s trackers this device can reach. → [{id, label, data, at}]
export async function findCopies(person = ownerId()) {
  const copies = [{ id: 'device', label: 'This device', data: exportProfile(person, { shared: true }), at: Date.now() }];
  try {
    const s = JSON.parse(localStorage.getItem(`lp.s.${person}`) || 'null');
    if (s?.data) copies.push({ id: 'snapshot', label: 'Saved on this device before a big change', data: s.data, at: s.at });
  } catch { /* none */ }
  const a = account.get();
  if (a && person === a.profile) {
    const url = (() => { try { return JSON.parse(localStorage.getItem('lp.g.sync'))?.url; } catch { return null; } })() || 'https://lean-plate-connect.sandman-amani.workers.dev';
    const auth = { Authorization: `Bearer ${localStorage.getItem('fam.token.live')}` };
    // 🔐 Locked copies open with this device's family key (or are skipped without it).
    const k = await keys.get(a.fid);
    const unlocked = async (d) => (d?.enc == null ? d : tryOpen(k, d.enc, null));
    const cur = await getJson(`${url}/v2/families/${a.fid}/members/${a.me}/data`, auth);
    const curData = await unlocked(cur?.data);
    if (curData) copies.push({ id: 'account', label: 'Your OurPawmily account', data: curData, at: cur.savedAt });
    const prev = await getJson(`${url}/v2/families/${a.fid}/members/${a.me}/data/prev`, auth);
    const prevData = await unlocked(prev?.data);
    if (prevData && n(prevData)) copies.push({ id: 'account-prev', label: 'An earlier, bigger copy in your account', data: prevData, at: prev.savedAt });
  }
  const s = global.get('sync', null);
  if (s?.url && s?.code) {
    const base = `${s.url}/household/${encodeURIComponent(s.code)}/${person}`;
    const cur = await getJson(base);
    if (cur?.data) copies.push({ id: 'household', label: 'The household code', data: cur.data, at: cur.savedAt });
    const prev = await getJson(`${base}/prev`);
    if (prev?.data) copies.push({ id: 'household-prev', label: 'An earlier, bigger copy on the household code', data: prev.data, at: prev.savedAt });
  }
  return copies.filter((c) => c.data && n(c.data));
}

// This device's copy with everything the others have that it doesn't. This device's own
// settings win where both have a value; lists and days are combined.
export function combine(copies) {
  const [mine, ...others] = copies;
  // Biggest first, so where two other copies disagree the fuller one counts.
  return others.sort((a, b) => size(b.data) - size(a.data)).reduce((acc, c) => mergeData(acc, c.data, false), mine?.data || {});
}

// Adds what's missing to this device's copy of `person`. → {before, after} counts.
export function applyRecovery(person, merged) {
  const before = counts(exportProfile(person, { shared: true }));
  importProfile(person, mergeData(exportProfile(person, { shared: true }), merged, false));
  return { before, after: counts(exportProfile(person, { shared: true })) };
}

// Your partner's data as this device holds it (from household sharing), as a backup file they
// can load on their own phone. Uses the fuller of the current copy and the snapshot.
export function partnerFile(person) {
  let data = exportProfile(person, { shared: true });
  try {
    const s = JSON.parse(localStorage.getItem(`lp.s.${person}`) || 'null');
    if (s?.data && size(s.data) > size(data)) data = mergeData(data, s.data, false);
  } catch { /* none */ }
  if (!n(data)) return null;
  const name = PROFILES.find((p) => p.id === person)?.name || person;
  return { name, data, blob: new Blob([JSON.stringify({ app: 'lean-plate', profile: person, savedAt: new Date().toISOString(), data })], { type: 'application/json' }) };
}
