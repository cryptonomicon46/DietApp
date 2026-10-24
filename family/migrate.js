// Bringing the current app's data into a family: each profile becomes a person in the family
// (yours becomes you), each dog a pet, and everything each person tracked (meals, weigh-ins,
// training, dog duties, calendar, notes…) goes with them. Nothing is removed from the current
// app; running it again updates the copies instead of adding duplicates.

// ---------- pure (tested) ----------
// legacy: {owner, people: [{legacyId, name, data}], pets: [{legacyId, name, breed, born, emoji, data}]}
// family: as the API returns it ({me, members}). → [{op, ...}] in order.
export function planImport(legacy, family) {
  const ops = [];
  const byLegacy = (id) => family.members.find((m) => m.legacyId === id);
  for (const p of legacy.people) {
    if (!p.data || !Object.keys(p.data).length) continue;
    const mine = p.legacyId === legacy.owner;
    const existing = byLegacy(p.legacyId) || (mine ? family.members.find((m) => m.id === family.me) : null);
    // Someone who has joined keeps their own data: only they bring it over, from their phone.
    if (existing && !mine && existing.id !== family.me && existing.status === 'active') continue;
    if (existing) {
      if (mine && !existing.legacyId) ops.push({ op: 'tag', memberId: existing.id, legacyId: p.legacyId });
      ops.push({ op: 'data', memberId: existing.id, name: existing.name, data: p.data });
    } else ops.push({ op: 'add', kind: 'person', name: p.name, relation: 'spouse', legacyId: p.legacyId, data: p.data });
  }
  for (const d of legacy.pets) {
    const existing = byLegacy(d.legacyId) || family.members.find((m) => m.kind === 'pet' && m.name.toLowerCase() === d.name.toLowerCase());
    if (existing) ops.push({ op: 'data', memberId: existing.id, name: existing.name, data: d.data });
    else ops.push({ op: 'add', kind: 'pet', name: d.name, species: 'dog', breed: d.breed || '', born: d.born || '', avatar: d.emoji || '', legacyId: d.legacyId, data: d.data });
  }
  return ops;
}

// The current app's dog duties (each phone's own taps: feedings, walks, park trips, treats)
// as one care log. memberOf(legacyId) → the family member id. Feedings count once per meal
// (the first tap), walks and park trips each tap, treats once a day when on.
export function careFromLegacy(people, memberOf) {
  const out = [];
  const who = (w, person) => (w === 'both' ? people.map((p) => memberOf(p.legacyId)) : [memberOf(w || person)]).filter(Boolean);
  const fed = {};
  for (const p of people) for (const [key, v] of Object.entries(p.data.dogFed || {})) {
    const [date, meal] = key.split(':');
    if (!v?.at || !['breakfast', 'dinner'].includes(meal)) continue;
    if (!fed[key] || v.at < fed[key].at) fed[key] = { date, kind: meal, by: who(v.who, p.legacyId), at: v.at };
  }
  out.push(...Object.values(fed));
  for (const p of people) for (const [field, kind] of [['dogWalked', 'walk'], ['dogPark', 'park']]) {
    for (const [date, v] of Object.entries(p.data[field] || {})) {
      for (const e of Array.isArray(v) ? v : v?.at ? [v] : []) {
        const at = typeof e === 'number' ? e : e.at;
        if (at) out.push({ date, kind, by: who(typeof e === 'object' ? e.who : null, p.legacyId), at });
      }
    }
  }
  const treats = {};
  for (const p of people) for (const [date, t] of Object.entries(p.data.dogTreats || {})) if (t?.at && (!treats[date] || t.at > treats[date].t.at)) treats[date] = { t, person: p.legacyId };
  for (const [date, { t, person }] of Object.entries(treats)) if (t.on !== false) out.push({ date, kind: 'treat', by: who(t.who, person), at: t.at });
  return out.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => a.at - b.at);
}

// ---------- this phone ----------
// Everything the current app keeps on this phone (both profiles, since sharing keeps a copy of
// the partner's), read without changing anything.
export async function legacySnapshot() {
  const { PROFILES, ownerId, exportProfile } = await import('../js/storage.js');
  const { allDogs } = await import('../js/dogs.js');
  const owner = ownerId();
  const people = PROFILES.map((p) => {
    const data = exportProfile(p.id, { shared: true });
    return { legacyId: p.id, name: String(data.profile?.name || p.name).split(/\s+/)[0], data };
  });
  const pets = allDogs().map((d) => ({ legacyId: `dog-${d.id}`, name: d.name || 'Dog', breed: d.breed || '', born: d.birthday || '', emoji: d.emoji || '🐶', data: { profile: d } }));
  return { owner, people, pets };
}
// A full copy of the current app's storage on this phone, to keep as a backup file.
export function backupBlob() {
  const out = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith('lp.')) out[k] = localStorage.getItem(k);
  return new Blob([JSON.stringify({ app: 'OurPawmily', savedAt: new Date().toISOString(), localStorage: out })], { type: 'application/json' });
}
// Runs a plan against the API; reports each step. wrap locks each copy (end-to-end encryption).
export async function runImport(api, fid, ops, report = () => {}, wrap = async (d) => d) {
  const done = [];
  for (const o of ops) {
    if (o.op === 'tag') { await api.patch(`/families/${fid}/members/${o.memberId}`, { legacyId: o.legacyId }); continue; }
    let id = o.memberId;
    if (o.op === 'add') {
      const r = await api.post(`/families/${fid}/members`, { kind: o.kind, name: o.name, relation: o.relation, species: o.species, breed: o.breed, born: o.born, avatar: o.avatar, legacyId: o.legacyId });
      id = r.member.id;
      report(`Added ${o.name}`);
    }
    await api.put(`/families/${fid}/members/${id}/data`, { data: await wrap(o.data) });
    report(`Brought over ${o.name}'s data`);
    done.push({ memberId: id, name: o.name, data: o.data });
  }
  return done;
}

// ---------- checking it all arrived ----------
const LABELS = { weights: 'weigh-ins', mealLog: 'days of meals', workouts: 'workouts', activities: 'activities', liftSessions: 'lifting sessions',
  checkins: 'weekly check-ins', dexa: 'DEXA scans', events: 'calendar events', notes: 'notes', plans: 'plans', combos: 'meal combos',
  preparedMeals: 'packaged meals', myFoods: 'your foods', dailyMeals: 'daily meals', climbs: 'climbing sessions', dogFed: 'feedings',
  dogWalked: 'days of walks', dogPark: 'days at the park', dogTreats: 'treat days', profile: 'profile', rhythm: '2-2-2-2 moments', days: 'days' };
const count = (x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : x == null || x === '' ? 0 : 1);
// Each section of this phone's copy against what the server now holds. → [{key, label, count, ok}]
export function compareData(local = {}, remote = {}) {
  return Object.entries(local).map(([key, v]) => ({ key, label: LABELS[key] || key, count: count(v), ok: JSON.stringify(v) === JSON.stringify(remote?.[key]) }));
}
// Reads back every copy just brought over. → [{name, sections: [...], ok, missing: [...]}]
export async function verifyImport(api, fid, done, unwrap = async (rec) => rec.data) {
  const out = [];
  for (const d of done) {
    const remote = (await unwrap(await api.get(`/families/${fid}/members/${d.memberId}/data`))) || {};
    const sections = compareData(d.data, remote);
    out.push({ name: d.name, sections, ok: sections.every((x) => x.ok), missing: sections.filter((x) => !x.ok).map((x) => x.label) });
  }
  return out;
}
// After the people are in: their dog-duty history becomes the family's care log.
export async function importCare(api, fid, legacy, family, report = () => {}) {
  const memberOf = (legacyId) => family.members.find((m) => m.legacyId === legacyId)?.id || (legacyId === legacy.owner ? family.me : null);
  const entries = careFromLegacy(legacy.people, memberOf);
  if (!entries.length) return;
  const r = await api.put(`/families/${fid}/care`, { entries });
  report(`Brought over the dogs' feeding & walk history (${r.entries} entries over ${r.days} days)`);
}
