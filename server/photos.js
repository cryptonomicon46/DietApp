// 📸 Post photos as files in Cloudflare R2 (bound as PHOTOS), not inside the post: the feed
// loads tiny posts, and each photo — a small thumbnail for scrolling, the full one when tapped —
// downloads only when it's on screen. In an end-to-end encrypted family the phone locks each
// file before it's sent, so R2 holds bytes nobody else can read. The on-phone demo keeps them in
// its own storage instead. Each family has a fair-use limit (PHOTO_QUOTA_MB, 2 GB by default).

// bytes, after locking; `doc` is a 📎 PDF attached to a thread (same storage, same quota)
export const SIZES = { full: 4_000_000, thumb: 400_000, doc: 20_100_000 };
export const okPhotoId = (id) => /^[a-z0-9]{8,24}$/.test(id || '');
export const photoKey = (fid, pid, size) => `f/${fid}/${pid}-${size === 'thumb' ? 'thumb' : size === 'doc' ? 'doc' : 'full'}`;
// Who uploaded each file (KV `fileby:<fid>:<pid>` → {by: memberId, at}): only they, or the family's
// creator, may replace or delete it, and only they may attach it to a post, thread, album or chat.
export const blobMetaKey = (fid, pid) => `fileby:${fid}:${pid}`;
export async function ownsFiles(db, fid, ids, memberId) {
  for (const id of ids) if ((await db.get(blobMetaKey(fid, id)))?.by !== memberId) return false;
  return true;
}
export const quotaBytes = (env) => Math.max(50, +env.PHOTO_QUOTA_MB || 2048) * 1024 * 1024;

const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// R2 on the connector; the demo's own storage on the phone; nothing on a connector without R2.
export function blobStore(env) {
  if (env.PHOTOS) {
    return {
      put: (k, bytes) => env.PHOTOS.put(k, bytes, { httpMetadata: { contentType: 'application/octet-stream' } }),
      get: async (k) => { const o = await env.PHOTOS.get(k); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
      has: async (k) => !!(await env.PHOTOS.head(k)),
      del: (keys) => env.PHOTOS.delete(keys),
      async list(prefix) {
        const out = [];
        let cursor;
        do {
          const r = await env.PHOTOS.list({ prefix, cursor, limit: 1000 });
          out.push(...r.objects.map((o) => ({ key: o.key, size: o.size })));
          cursor = r.truncated ? r.cursor : null;
        } while (cursor);
        return out;
      },
    };
  }
  if (env.DEMO) {
    const kv = env.HOUSEHOLD;
    const idx = async () => JSON.parse((await kv.get('blobidx')) || '{}');
    return {
      put: async (k, bytes) => { await kv.put(`blob:${k}`, b64(bytes)); const i = await idx(); i[k] = bytes.length; await kv.put('blobidx', JSON.stringify(i)); },
      get: async (k) => { const v = await kv.get(`blob:${k}`); return v ? unb64(v) : null; },
      has: async (k) => k in (await idx()),
      del: async (keys) => { const i = await idx(); for (const k of [].concat(keys)) { await kv.delete(`blob:${k}`); delete i[k]; } await kv.put('blobidx', JSON.stringify(i)); },
      list: async (prefix) => Object.entries(await idx()).filter(([k]) => k.startsWith(prefix)).map(([key, size]) => ({ key, size })),
    };
  }
  return null;
}

// How much a family's photos take (cached a few minutes per connector instance, so an upload
// doesn't have to count every file).
const usageCache = new Map();
export async function familyUsage(blobs, fid, fresh = false) {
  const c = usageCache.get(fid);
  if (c && !fresh && Date.now() - c.at < 5 * 60000) return c.bytes;
  const bytes = (await blobs.list(`f/${fid}/`)).reduce((n, o) => n + o.size, 0);
  usageCache.set(fid, { at: Date.now(), bytes });
  return bytes;
}
export function noteUsage(fid, delta) {
  const c = usageCache.get(fid);
  if (c) c.bytes = Math.max(0, c.bytes + delta);
}
// A post's photo files, both sizes.
export async function deletePhoto(blobs, fid, pid, db = null) {
  if (!blobs || !okPhotoId(pid)) return;
  await blobs.del([photoKey(fid, pid, 'full'), photoKey(fid, pid, 'thumb'), photoKey(fid, pid, 'doc')]);
  if (db) await db.del(blobMetaKey(fid, pid));
  usageCache.delete(fid);
}
// Everything a family has (when the family is deleted).
export async function deleteFamilyPhotos(blobs, fid) {
  if (!blobs) return;
  const keys = (await blobs.list(`f/${fid}/`)).map((o) => o.key);
  for (let i = 0; i < keys.length; i += 1000) await blobs.del(keys.slice(i, i + 1000));
  usageCache.delete(fid);
}
