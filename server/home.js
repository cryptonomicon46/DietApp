// 🏠 Home's shared lists: 🙋 Requests (asking the family for a hand — a ride, pet sitting, a meal…)
// and 🛒 Groceries (one list the household shares). What each says is sealed on the phone in an
// encrypted family; the connector keeps who, when, the kind and day of a request, and done/claimed.
//   requests:<fid>   [{id, by, byName, kind, day, time, box, status: 'open'|'claimed'|'done', claimedBy, claimedName, at, doneAt}]
//   groceries:<fid>  [{id, box, by, at, done, doneBy, doneAt}]

export const REQUEST_KINDS = { ride: '🚗 A ride', petsit: '🐾 Pet sitting', walk: '🦮 A dog walk', babysit: '🧸 Babysitting', meal: '🍲 A meal', errand: '🛒 An errand', other: '🙋 A hand' };
const MAX_REQUESTS = 100, MAX_GROCERIES = 200, KEEP_DONE_DAYS = 7;
const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');

export async function homeRoutes(c) {
  const { path, method, body, db, user, loadFamily, meIn, sealed, clean, randomId, tell, json } = c;
  const m = path.match(/^\/families\/([a-z0-9]+)\/(home|requests|groceries)(?:\/([a-z0-9]+|clear)(?:\/(claim|done))?)?$/);
  if (!m) return null;
  const [, fid, what, id, action] = m;
  const fam = await loadFamily(fid);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  // 🙋 Requests are between the grown-ups: kids neither see, ask nor offer.
  const kid = me.relation === 'child';
  // A sealed box, or (a family not yet encrypted) plain text, cleaned.
  const boxOf = (v, max) => sealed(v, max * 3 + 200) ?? (fam.e2ee || typeof v !== 'string' ? null : clean(v, max) || null);
  const blocked = new Set((user.blocked || []).map((b) => b.uid));
  const uidOf = (memberId) => fam.members.find((x) => x.id === memberId)?.uid;
  const recent = (x) => x.status !== 'done' || Date.now() - (x.doneAt || 0) < KEEP_DONE_DAYS * 864e5;
  const reqOut = (x) => ({ ...x, mine: x.by === me.id, claimedByMe: x.claimedBy === me.id });
  const requests = async () => ((await db.get(`requests:${fid}`)) || []).filter((x) => recent(x) && !blocked.has(uidOf(x.by)));
  const groceries = async () => (await db.get(`groceries:${fid}`)) || [];

  // Both lists in one round trip, for Home.
  if (what === 'home' && !id && method === 'GET') {
    const [r, g] = await Promise.all([kid ? [] : requests(), groceries()]);
    return json({ requests: r.map(reqOut), groceries: g });
  }

  if (what === 'requests') {
    if (kid) return json({ error: 'ask a grown-up' }, 403);
    const key = `requests:${fid}`;
    const all = (await db.get(key)) || [];
    if (!id && method === 'GET') return json({ requests: (await requests()).map(reqOut) });
    if (!id && method === 'POST') {
      const kind = REQUEST_KINDS[body.kind] ? body.kind : 'other';
      const box = boxOf(body.box, 300);
      if (!box) return json({ error: fam.e2ee && body.box ? 'this family is end-to-end encrypted — update the app and try again' : 'say what you need' }, 400);
      const r = { id: randomId(8), by: me.id, byName: me.name, kind, day: day(body.day), time: clean(body.time, 20), box, status: 'open', claimedBy: '', claimedName: '', at: Date.now() };
      // Done ones older than a week make room first.
      const keep = all.filter(recent).slice(-(MAX_REQUESTS - 1));
      await db.put(key, [...keep, r]);
      const to = fam.members.filter((x) => x.uid && x.uid !== user.uid && x.kind === 'person' && x.relation !== 'child').map((x) => x.uid);
      if (to.length) await tell(to, 'requests', { title: `🙋 ${me.name} could use a hand`, body: `${REQUEST_KINDS[kind]}${r.day ? ` · ${r.day}` : ''}`, url: 'family/#home', tag: `req-${r.id}` });
      return json({ request: reqOut(r) });
    }
    const r = all.find((x) => x.id === id);
    if (!r) return json({ error: 'not found' }, 404);
    if (action === 'claim' && method === 'POST') {
      if (r.by === me.id) return json({ error: "that's your own request" }, 400);
      if (r.status === 'done') return json({ error: 'already done' }, 400);
      if (r.status === 'claimed' && r.claimedBy !== me.id) return json({ error: `${r.claimedName} is already on it` }, 409);
      const take = r.claimedBy !== me.id;
      Object.assign(r, take ? { status: 'claimed', claimedBy: me.id, claimedName: me.name } : { status: 'open', claimedBy: '', claimedName: '' });
      await db.put(key, all);
      const author = uidOf(r.by);
      if (take && author) await tell([author], 'requests', { title: `✅ ${me.name} can help`, body: REQUEST_KINDS[r.kind], url: 'family/#home', tag: `req-${r.id}` });
      return json({ request: reqOut(r) });
    }
    if (action === 'done' && method === 'POST') {
      if (r.by !== me.id && r.claimedBy !== me.id) return json({ error: 'only who asked or who helps can close it' }, 403);
      Object.assign(r, { status: 'done', doneAt: Date.now() });
      await db.put(key, all);
      return json({ request: reqOut(r) });
    }
    if (!action && method === 'DELETE') {
      if (r.by !== me.id && me.role !== 'owner') return json({ error: 'only who asked can remove it' }, 403);
      await db.put(key, all.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- 🛒 groceries: anyone in the family adds, ticks and removes ----
  const key = `groceries:${fid}`;
  const list = await groceries();
  if (!id && method === 'GET') return json({ groceries: list });
  if (!id && method === 'POST') {
    const boxes = (Array.isArray(body.items) ? body.items : [body.box]).map((v) => boxOf(v, 120)).filter(Boolean).slice(0, 30);
    if (!boxes.length) return json({ error: fam.e2ee && (body.box || body.items) ? 'this family is end-to-end encrypted — update the app and try again' : 'what should go on the list?' }, 400);
    if (list.length + boxes.length > MAX_GROCERIES) return json({ error: `the list holds ${MAX_GROCERIES} things — clear the ticked ones first` }, 400);
    const now = Date.now();
    const added = boxes.map((box, i) => ({ id: randomId(8), box, by: me.id, at: now + i, done: false }));
    await db.put(key, [...list, ...added]);
    return json({ groceries: [...list, ...added] });
  }
  if (id === 'clear' && method === 'POST') {
    const left = list.filter((x) => !x.done);
    await db.put(key, left);
    return json({ groceries: left });
  }
  const g = list.find((x) => x.id === id);
  if (!g) return json({ error: 'not found' }, 404);
  if (!action && method === 'PATCH') {
    if (body.done != null) Object.assign(g, body.done ? { done: true, doneBy: me.id, doneAt: Date.now() } : { done: false, doneBy: '', doneAt: 0 });
    if (body.box != null) { const v = boxOf(body.box, 120); if (!v) return json({ error: 'expected sealed text' }, 400); g.box = v; }
    await db.put(key, list);
    return json({ groceries: list });
  }
  if (!action && method === 'DELETE') {
    const left = list.filter((x) => x.id !== id);
    await db.put(key, left);
    return json({ groceries: left });
  }
  return json({ error: 'not found' }, 404);
}
