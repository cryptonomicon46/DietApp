// 📷 Albums: family only, sealed titles and links in an encrypted family, photos added and removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { albumRoutes, albumPhotoIds } from '../server/albums.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const SEALED = 'e1:' + 'A'.repeat(40);
const sealed = (v, max) => (typeof v === 'string' && v.length <= max && /^e1:[A-Za-z0-9_-]+$/.test(v) ? v : null);
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
let n = 0;
const ctx = (db, fam, me, path, method = 'GET', body = {}, blobs = { del: async (keys) => { blobs.deleted.push(...keys); } }) => {
  blobs.deleted ||= [];
  return { path, method, body, db, sealed, clean, randomId: () => `a${++n}xyz`, json: (data, status = 200) => ({ status, data }), blobs,
    loadFamily: async (fid) => (fid === fam.fid ? fam : null), meIn: () => me };
};
const plain = { fid: 'f1', e2ee: false }, locked = { fid: 'f2', e2ee: true };
const adult = { id: 'm1', relation: 'self' }, kid = { id: 'k1', relation: 'child' };

test('make an album with a Google Photos link; other links and other families are refused', async () => {
  const db = kv();
  const r = await albumRoutes(ctx(db, plain, adult, '/families/f1/albums', 'POST', { title: 'Tahoe 2026', link: 'https://photos.app.goo.gl/abc123' }));
  assert.equal(r.data.album.title, 'Tahoe 2026');
  assert.equal(r.data.album.link, 'https://photos.app.goo.gl/abc123');
  assert.equal((await albumRoutes(ctx(db, plain, adult, '/families/f1/albums', 'POST', { title: 'x', link: 'https://evil.example/a' }))).status, 400);
  assert.equal((await albumRoutes(ctx(db, plain, adult, '/families/f9/albums'))).status, 404, 'not your family');
  assert.equal((await albumRoutes(ctx(db, plain, kid, '/families/f1/albums', 'POST', { title: 'x' }))).status, 403);
  assert.equal(await albumRoutes(ctx(db, plain, adult, '/families/f1/feed')), null, 'other paths pass through');
});

test('an encrypted family only takes sealed titles and links', async () => {
  const db = kv();
  assert.equal((await albumRoutes(ctx(db, locked, adult, '/families/f2/albums', 'POST', { title: 'Tahoe' }))).status, 400);
  assert.equal((await albumRoutes(ctx(db, locked, adult, '/families/f2/albums', 'POST', { title: SEALED, link: 'https://photos.app.goo.gl/x' }))).status, 400, 'plain link refused');
  const r = await albumRoutes(ctx(db, locked, adult, '/families/f2/albums', 'POST', { title: SEALED, link: SEALED }));
  assert.equal(r.data.album.title, SEALED);
});

test('photos: added (kids too), cover, removed with their files, album deleted with its files', async () => {
  const db = kv();
  const { data: { album } } = await albumRoutes(ctx(db, plain, adult, '/families/f1/albums', 'POST', { title: 'Dogs' }));
  const p = `/families/f1/albums/${album.id}`;
  let r = await albumRoutes(ctx(db, plain, kid, p, 'PATCH', { add: [{ id: 'photo0001', aspect: 1.5 }, { id: 'bad id' }], title: 'renamed by kid' }));
  assert.deepEqual(r.data.album.photos.map((x) => x.id), ['photo0001']);
  assert.equal(r.data.album.title, 'Dogs', 'kids can add but not rename');
  r = await albumRoutes(ctx(db, plain, adult, p, 'PATCH', { add: [{ id: 'photo0002' }, { id: 'photo0001' }], cover: 'photo0002' }));
  assert.equal(r.data.album.count, 2, 'no duplicates');
  assert.equal(r.data.album.cover, 'photo0002');
  const blobs = { del: async (keys) => blobs.deleted.push(...keys), deleted: [] };
  r = await albumRoutes(ctx(db, plain, adult, p, 'PATCH', { remove: ['photo0002'] }, blobs));
  assert.equal(r.data.album.cover, 'photo0001', 'falls back to the first photo');
  assert.deepEqual(blobs.deleted, ['f/f1/photo0002-full', 'f/f1/photo0002-thumb']);
  assert.deepEqual(await albumPhotoIds(db, 'f1'), ['photo0001']);
  assert.equal((await albumRoutes(ctx(db, plain, kid, p, 'DELETE'))).status, 403);
  const b2 = { del: async (keys) => b2.deleted.push(...keys), deleted: [] };
  assert.equal((await albumRoutes(ctx(db, plain, adult, p, 'DELETE', {}, b2))).data.ok, true);
  assert.equal(b2.deleted.length, 2);
  assert.deepEqual((await albumRoutes(ctx(db, plain, adult, '/families/f1/albums'))).data.albums, []);
});
