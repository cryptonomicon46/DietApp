// 🛒 Market: things to sell, give away, lend, or ask for, between your family and (by default)
// friends' families. What a listing says (title, details, price) is one sealed box — with the
// family key, or for friends' families with the listing's own key (like a post) — so the
// connector keeps only the kind, who listed it, its status, who's interested, who borrowed it
// and until when. One KV record per family: `market:<fid>`.

import { okPhotoId, deletePhoto } from './photos.js';
import { adultsOf } from './push.js';

export const KINDS = { sale: '🏷️ For sale', free: '🎁 Free', lend: '📚 To lend', wanted: '🙋 Wanted' };
const STATUSES = ['open', 'pending', 'done'];
const MAX_ITEMS = 100;
const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');

export async function marketRoutes(c) {
  const { path, method, body, db, user, families, loadFamily, meIn, sealed, clean, randomId, tell, json, blobs } = c;
  const owns = c.owns || (async () => true);
  // The listing's box: sealed, or (a family not yet encrypted) plain fields, cleaned.
  const boxOf = (fam, v) => sealed(v, 6000) ?? (fam.e2ee || !v || typeof v !== 'object' ? null
    : { title: clean(v.title, 80), body: clean(v.body, 600), price: Number.isFinite(+v.price) && v.price !== '' ? Math.max(0, Math.round(+v.price)) : null });
  const out = (x, fam, own) => {
    const mine = x.byUid === user.uid;
    return { id: x.id, fid: fam.fid, familyName: fam.name, own, mine, kind: x.kind, aud: x.aud, box: x.box, ...(x.pk ? { pk: x.pk } : {}),
      photoId: x.photoId || '', aspect: x.aspect || 1, status: x.status, byName: x.byName, at: x.at, updatedAt: x.updatedAt || x.at,
      lend: x.lend || null, interested: x.interest.some((i) => i.uid === user.uid), interestCount: x.interest.length,
      // Only the one who listed it sees who's interested.
      interest: mine ? x.interest.map((i) => ({ name: i.name, family: i.family, at: i.at })) : [] };
  };

  if (path === '/market' && method === 'GET') {
    const mine = await families();
    const seen = new Set(mine.map((f) => f.fid));
    const items = [];
    for (const f of mine) for (const x of (await db.get(`market:${f.fid}`)) || []) items.push(out(x, f, true));
    // Friends' families: only what they listed for friends too.
    for (const fid of [...new Set(mine.flatMap((f) => f.connections || []))].filter((x) => !seen.has(x))) {
      const fam = await db.get(`family:${fid}`);
      if (fam) for (const x of (await db.get(`market:${fid}`)) || []) if (x.aud === 'connections') items.push(out(x, fam, false));
    }
    items.sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.at - a.at);
    return json({ items });
  }

  const m = path.match(/^\/families\/([a-z0-9]+)\/market(?:\/([a-z0-9]+)(\/interest)?)?$/);
  if (!m) return null;
  let fam = await loadFamily(m[1]), own = !!fam;
  // A friends' family can show interest in what was listed for friends; nothing else.
  if (!fam && m[3] && method === 'POST' && (await families()).some((f) => (f.connections || []).includes(m[1]))) fam = await db.get(`family:${m[1]}`);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = own ? meIn(fam) : null;
  const key = `market:${fam.fid}`;
  const list = (await db.get(key)) || [];

  if (!m[2]) {
    if (method !== 'POST') return json({ error: 'not found' }, 404);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (!KINDS[body.kind]) return json({ error: 'what kind of listing?' }, 400);
    const box = boxOf(fam, body.box);
    if (!box || (typeof box === 'object' && !box.title)) return json({ error: fam.e2ee && body.box ? 'this family is end-to-end encrypted — update the app and try again' : 'give it a title' }, 400);
    const aud = body.aud === 'family' ? 'family' : 'connections';
    const pk = aud === 'connections' && body.pk && sealed(body.pk.fam, 300) ? { fam: body.pk.fam, conns: Object.fromEntries(Object.entries(body.pk.conns || {}).filter(([f, v]) => (fam.connections || []).includes(f) && sealed(v, 300))) } : null;
    if (fam.e2ee && aud === 'connections' && !pk) return json({ error: 'missing the listing\'s key' }, 400);
    if (okPhotoId(body.photoId) && !(await owns(fam.fid, [body.photoId], me.id))) return json({ error: 'that photo isn\'t yours to list' }, 403);
    // Full: the oldest finished listings make room; a market of only open ones is full.
    const keep = [...list];
    while (keep.length >= MAX_ITEMS) {
      const i = keep.map((x) => x.status).lastIndexOf('done');
      if (i < 0) return json({ error: `that's ${MAX_ITEMS} listings — mark some done or remove them first` }, 400);
      const [gone] = keep.splice(i, 1);
      if (gone.photoId) await deletePhoto(blobs, fam.fid, gone.photoId, db).catch(() => {});
    }
    const item = { id: randomId(8), kind: body.kind, aud, box, ...(pk ? { pk } : {}), ...(okPhotoId(body.photoId) && blobs ? { photoId: body.photoId, aspect: Math.min(3, Math.max(0.3, +body.aspect || 1)) } : {}),
      status: 'open', by: me.id, byUid: user.uid, byName: me.name, at: Date.now(), lend: null, interest: [] };
    await db.put(key, [item, ...keep]);
    // Who hears about it: the family's grown-ups, and friends' families' grown-ups if it's for them.
    const uids = adultsOf(fam, user.uid);
    if (aud === 'connections') for (const fid of fam.connections || []) { const o = await db.get(`family:${fid}`); if (o) uids.push(...adultsOf(o, user.uid)); }
    if (uids.length) await tell([...new Set(uids)], 'market', { title: `🛒 ${me.name} ${body.kind === 'wanted' ? 'is looking for something' : body.kind === 'lend' ? 'has something to lend' : body.kind === 'free' ? 'is giving something away' : 'listed something'}`, body: aud === 'connections' ? `In the Market (${fam.name})` : 'In the Market', url: 'family/#feed', tag: `market-${item.id}` });
    return json({ item: out(item, fam, true) });
  }

  const item = list.find((x) => x.id === m[2]);
  if (!item || (!own && item.aud !== 'connections')) return json({ error: 'not found' }, 404);

  if (m[3]) {
    // 🙋 Interested (or "I have one" for a wanted listing), or not any more.
    if (method !== 'POST') return json({ error: 'not found' }, 404);
    if (item.byUid === user.uid) return json({ error: 'that\'s your own listing' }, 400);
    const had = item.interest.some((i) => i.uid === user.uid);
    const myFam = own ? fam : (await families()).find((f) => (f.connections || []).includes(fam.fid));
    const name = own ? me.name : (myFam && meIn(myFam)?.name) || user.name;
    item.interest = had ? item.interest.filter((i) => i.uid !== user.uid) : [...item.interest, { uid: user.uid, name: clean(name, 40), family: own ? '' : clean(myFam?.name, 40), at: Date.now() }].slice(-30);
    await db.put(key, list);
    if (!had) await tell([item.byUid], 'market', { title: item.kind === 'wanted' ? `🙋 ${name} can help with what you're looking for` : `🛒 ${name} is interested in your listing`, body: 'Open the Market to see', url: 'family/#feed', tag: `market-${item.id}` });
    return json({ item: out(item, fam, own) });
  }

  // Changing or removing it: whoever listed it, or the family's creator.
  if (item.byUid !== user.uid && me?.role !== 'owner') return json({ error: 'not allowed' }, 403);
  if (method === 'PATCH') {
    if (STATUSES.includes(body.status)) item.status = body.status;
    if (body.box != null) { const b = boxOf(fam, body.box); if (!b) return json({ error: 'expected a sealed listing' }, 400); item.box = b; }
    // 📚 Lent out (to whom, back by when), or back home.
    if (item.kind === 'lend' && body.lend !== undefined) {
      if (body.lend === null) item.lend = null;
      else {
        const to = clean(body.lend?.to, 40), due = day(body.lend?.due);
        if (!to) return json({ error: 'who is borrowing it?' }, 400);
        item.lend = { to, due, at: Date.now() };
        item.interest = item.interest.filter((i) => i.name !== to);
      }
    }
    item.updatedAt = Date.now();
    await db.put(key, list);
    return json({ item: out(item, fam, own) });
  }
  if (method === 'DELETE') {
    if (item.photoId) await deletePhoto(blobs, fam.fid, item.photoId, db).catch(() => {});
    await db.put(key, list.filter((x) => x !== item));
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// 📚 What's due back: lent items whose day has come (for the phone's reminders).
export const dueBack = (items, today) => items.filter((x) => x.kind === 'lend' && x.lend?.due && x.lend.due <= today && x.status !== 'done');
