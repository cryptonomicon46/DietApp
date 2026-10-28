// 📷 Albums: a family's own photo albums. Each one can link to a shared Google Photos album
// (opens there) and/or hold photos copied in (from the phone, or picked in Google Photos on the
// phone) — stored like post photos: locked on the phone with the family key, two sizes in R2.
// Titles and links are end-to-end encrypted in an encrypted family. Family only (not shared with
// friends' families). One KV record per family: `albums:<fid>`.

import { okPhotoId, deletePhoto } from './photos.js';

const MAX_ALBUMS = 30, MAX_PHOTOS = 300;
const GOOGLE_PHOTOS = /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\/[^\s"'<>]+$/;

export async function albumRoutes(c) {
  const { path, method, body, db, loadFamily, meIn, sealed, clean, randomId, json, blobs } = c;
  const owns = c.owns || (async () => true);
  const m = path.match(/^\/families\/([a-z0-9]+)\/albums(?:\/([a-z0-9]+))?$/);
  if (!m) return null;
  const fam = await loadFamily(m[1]);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  const key = `albums:${fam.fid}`;
  const list = (await db.get(key)) || [];
  // Sealed text in an encrypted family; plain (checked) text otherwise.
  const title = (v) => sealed(v, 600) ?? (fam.e2ee ? null : clean(v, 60) || null);
  const link = (v) => (!v ? '' : sealed(v, 1200) ?? (fam.e2ee ? null : GOOGLE_PHOTOS.test(v) ? v.slice(0, 300) : null));
  const out = (a) => ({ id: a.id, title: a.title, link: a.link, cover: a.cover || a.photos[0]?.id || '', count: a.photos.length, by: a.by, at: a.at, updatedAt: a.updatedAt || a.at, mine: a.by === me.id });
  const save = () => db.put(key, list);

  if (!m[2]) {
    if (method === 'GET') return json({ albums: list.map(out) });
    if (method !== 'POST') return json({ error: 'not found' }, 404);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (list.length >= MAX_ALBUMS) return json({ error: `that's ${MAX_ALBUMS} albums — remove one first` }, 400);
    const t = title(body.title), l = link(body.link);
    if (!t) return json({ error: fam.e2ee && body.title ? 'this family is end-to-end encrypted — update the app and try again' : 'name the album' }, 400);
    if (l === null) return json({ error: 'that isn\'t a Google Photos album link' }, 400);
    const a = { id: randomId(8), title: t, link: l, cover: '', photos: [], by: me.id, at: Date.now() };
    list.unshift(a); await save();
    return json({ album: out(a) });
  }

  const a = list.find((x) => x.id === m[2]);
  if (!a) return json({ error: 'not found' }, 404);
  if (method === 'GET') return json({ album: { ...out(a), photos: a.photos } });
  if (me.relation === 'child' && method !== 'PATCH') return json({ error: 'ask a grown-up' }, 403);
  if (method === 'PATCH') {
    // Kids can add photos; renaming, relinking and removing are for grown-ups.
    const adult = me.relation !== 'child';
    if (adult && body.title != null) { const t = title(body.title); if (!t) return json({ error: 'name the album' }, 400); a.title = t; }
    if (adult && body.link != null) { const l = link(body.link); if (l === null) return json({ error: 'that isn\'t a Google Photos album link' }, 400); a.link = l; }
    const add = (Array.isArray(body.add) ? body.add : []).filter((p) => okPhotoId(p?.id) && !a.photos.some((x) => x.id === p.id));
    if (!(await owns(fam.fid, add.map((p) => p.id), me.id))) return json({ error: 'that photo isn\'t yours to add' }, 403);
    if (a.photos.length + add.length > MAX_PHOTOS) return json({ error: `an album holds ${MAX_PHOTOS} photos — start another one` }, 400);
    a.photos.push(...add.map((p) => ({ id: p.id, aspect: Math.min(3, Math.max(0.3, +p.aspect || 1)), by: me.id, at: Date.now() })));
    const remove = adult && Array.isArray(body.remove) ? body.remove.filter((id) => a.photos.some((x) => x.id === id)) : [];
    for (const id of remove) await deletePhoto(blobs, fam.fid, id, db).catch(() => {});
    a.photos = a.photos.filter((x) => !remove.includes(x.id));
    if (adult && body.cover != null) a.cover = a.photos.some((x) => x.id === body.cover) ? body.cover : '';
    if (remove.includes(a.cover)) a.cover = '';
    a.updatedAt = Date.now();
    await save();
    return json({ album: { ...out(a), photos: a.photos } });
  }
  if (method === 'DELETE') {
    for (const p of a.photos) await deletePhoto(blobs, fam.fid, p.id, db).catch(() => {});
    await db.put(key, list.filter((x) => x !== a));
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// Every album photo of a family (so deleting the family, or a member's photos, can find them).
export async function albumPhotoIds(db, fid) {
  return ((await db.get(`albums:${fid}`)) || []).flatMap((a) => a.photos.map((p) => p.id));
}
