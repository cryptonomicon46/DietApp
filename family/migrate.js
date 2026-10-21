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
// Runs a plan against the API; reports each step.
export async function runImport(api, fid, ops, report = () => {}) {
  for (const o of ops) {
    if (o.op === 'tag') { await api.patch(`/families/${fid}/members/${o.memberId}`, { legacyId: o.legacyId }); continue; }
    let id = o.memberId;
    if (o.op === 'add') {
      const r = await api.post(`/families/${fid}/members`, { kind: o.kind, name: o.name, relation: o.relation, species: o.species, breed: o.breed, born: o.born, avatar: o.avatar, legacyId: o.legacyId });
      id = r.member.id;
      report(`Added ${o.name}`);
    }
    await api.put(`/families/${fid}/members/${id}/data`, { data: o.data });
    report(`Brought over ${o.name}'s data`);
  }
}
