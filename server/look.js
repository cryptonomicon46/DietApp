// 👔 Look on the connector: each person's Closet (their pieces, Saved Looks, wear history and
// what they like — one record, sealed on their phone), its pictures, and Fit Checks.
//
// The Closet is its owner's alone: nobody else in the family — not their partner, not the
// family's creator — can read the record or fetch a picture, whatever id they try. A Fit Check is
// the one exception, and it's on purpose: one Look (a picture of it and its name, sealed) sent to
// your partner, who answers Hit or Miss. Nothing else of the Closet goes with it.
//
// In an end-to-end encrypted family everything here is locked with the family key before it
// leaves the phone. Every grown-up in a family holds that key, so it's these checks — not
// separate keys — that keep one person's Closet from another (documented on the privacy page).
export const LOOK_IMG = { full: 2_600_000, thumb: 450_000 };
export const MAX_IMAGES = 900; // per person (pieces have two sizes)
export const okId = (id) => /^[a-z0-9]{8,24}$/.test(id || '');
// Pictures live in the family's file store (so they count toward its space and go when the
// family does), under paths the ordinary photo route can't reach.
export const lookImgKey = (fid, mid, id, size) => `f/${fid}/look/${mid}/${id}-${size === 'thumb' ? 'thumb' : 'full'}`;
export const fcImgKey = (fid, fcid, n) => `f/${fid}/fc/${fcid}-${n}`;
// Raw-byte uploads this module accepts (the request body isn't JSON).
export const isLookBytes = (path) => /^\/families\/[a-z0-9]+\/(members\/[a-z0-9]+\/look\/img\/[a-z0-9]+|fitchecks\/[a-z0-9]+\/img\/[01])$/.test(path);

const FC_DAYS = 14;
const VERDICTS = ['hit', 'miss', 'a', 'b', 'neither'];
const REASONS = ['shoes', 'jacket', 'watch', 'colors', 'formal', 'casual', 'style', 'other'];

export async function lookRoutes({ path, method, body, bytes, db, user, loadFamily, meIn, partnerOf, isCouple, sealed, randomId, tell, json, url, blobs, usage, quota }) {
  let m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/look(?:\/img\/([a-z0-9]+))?$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    // Yours alone: the same answer for anyone else as for something that isn't there.
    if (m[2] !== me.id) return json({ error: 'not found' }, 404);
    if (!m[3]) {
      const key = `look:${fam.fid}:${me.id}`;
      if (method === 'GET') return json((await db.get(key)) || { savedAt: 0, data: null });
      if (method !== 'PUT') return json({ error: 'not found' }, 404);
      if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'expected {data}' }, 400);
      const max = 3_000_000;
      if (body.data.enc != null ? !sealed(body.data.enc, max) || Object.keys(body.data).length !== 1 : fam.e2ee || JSON.stringify(body.data).length > max) return json({ error: fam.e2ee ? 'this family is end-to-end encrypted — update the app and try again' : 'too big' }, 400);
      const old = await db.get(key);
      if (old && Number.isFinite(body.base) && old.savedAt > body.base) return json({ error: 'changed on another device', savedAt: old.savedAt }, 409);
      const savedAt = Date.now();
      await db.put(key, { savedAt, data: body.data });
      return json({ ok: true, savedAt });
    }
    if (!blobs) return json({ error: 'photo storage is not set up on the connector yet' }, 501);
    if (!okId(m[3])) return json({ error: 'not found' }, 404);
    const size = url().searchParams.get('size') === 'thumb' ? 'thumb' : 'full';
    const key = lookImgKey(fam.fid, me.id, m[3], size);
    if (method === 'GET') { const b = await blobs.get(key); return b ? { status: 200, raw: b } : json({ error: 'not found' }, 404); }
    const countKey = `lookimgs:${fam.fid}:${me.id}`;
    if (method === 'PUT') {
      if (!bytes?.length || bytes.length > LOOK_IMG[size]) return json({ error: 'that picture is too large' }, 413);
      const had = await blobs.has(key);
      const count = (await db.get(countKey)) || { n: 0 };
      if (!had && count.n >= MAX_IMAGES) return json({ error: 'your Closet is full — delete some pieces first' }, 413);
      if ((await usage()) + bytes.length > quota) return json({ error: `${fam.name}'s photo space is full` }, 413);
      await blobs.put(key, bytes);
      if (!had) await db.put(countKey, { n: count.n + 1 });
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      const keys = ['full', 'thumb'].map((s) => lookImgKey(fam.fid, me.id, m[3], s));
      let gone = 0;
      for (const k of keys) if (await blobs.has(k)) gone++;
      await blobs.del(keys);
      const count = (await db.get(countKey)) || { n: 0 };
      if (gone) await db.put(countKey, { n: Math.max(0, count.n - gone) });
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }

  // ---- Fit Checks: /families/:fid/fitchecks[/:id[/send|/answer|/img/:n]] ----
  m = path.match(/^\/families\/([a-z0-9]+)\/fitchecks(?:\/([a-z0-9]+)(?:\/(send|answer|img\/([01])))?)?$/);
  if (!m) return null;
  const fam = await loadFamily(m[1]);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  const key = `fitchecks:${fam.fid}`;
  const now = Date.now();
  // Only checks between people still in the family, from the last two weeks.
  const ids = new Set(fam.members.map((x) => x.id));
  const all = ((await db.get(key)) || []).filter((f) => now - f.at < FC_DAYS * 864e5 && ids.has(f.by) && ids.has(f.to));
  const save = () => db.put(key, all);
  const sees = (f) => f.by === me.id || (f.to === me.id && f.status !== 'draft');
  const out = (f) => ({ id: f.id, by: f.by, to: f.to, at: f.at, kind: f.kind, names: f.names, msg: f.msg, status: f.status, verdict: f.verdict || null, reasons: f.reasons || [], answeredAt: f.answeredAt || null, imgs: f.kind === 'ab' ? 2 : 1 });
  if (!m[2] && method === 'GET') return json({ fitchecks: all.filter(sees).sort((a, b) => b.at - a.at).slice(0, 30).map(out) });
  if (!m[2] && method === 'POST') {
    // Your other half only (a parent or a grown-up child in the family isn't).
    const partner = partnerOf(fam, me);
    if (!partner?.uid || !isCouple(fam, me, partner)) return json({ error: 'Fit Check is for the two of you — your partner needs to have joined the family' }, 400);
    const kind = body.kind === 'ab' ? 'ab' : 'one';
    const names = (Array.isArray(body.names) ? body.names : []).slice(0, kind === 'ab' ? 2 : 1).map((n) => sealed(n, 400) ?? (fam.e2ee ? null : String(n || '').slice(0, 60)));
    if (names.length !== (kind === 'ab' ? 2 : 1) || names.some((n) => n == null)) return json({ error: fam.e2ee ? 'this family is end-to-end encrypted — update the app and try again' : 'which Look?' }, 400);
    const msg = body.msg ? sealed(body.msg, 800) ?? (fam.e2ee ? null : String(body.msg).slice(0, 140)) : '';
    if (msg == null) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
    const f = { id: randomId(10), by: me.id, to: partner.id, at: now, kind, names, msg, status: 'draft' };
    all.push(f);
    while (all.filter((x) => x.by === me.id).length > 40) all.splice(all.findIndex((x) => x.by === me.id), 1);
    await save();
    return json({ fitcheck: out(f) });
  }
  const f = all.find((x) => x.id === m[2]);
  if (!f || !sees(f)) return json({ error: 'not found' }, 404);
  if (m[4] != null) {
    const n = +m[4];
    if (n >= (f.kind === 'ab' ? 2 : 1) || !blobs) return json({ error: 'not found' }, 404);
    const k = fcImgKey(fam.fid, f.id, n);
    if (method === 'GET') { const b = await blobs.get(k); return b ? { status: 200, raw: b } : json({ error: 'not found' }, 404); }
    if (method === 'PUT') {
      if (f.by !== me.id || f.status !== 'draft') return json({ error: 'not allowed' }, 403);
      if (!bytes?.length || bytes.length > LOOK_IMG.full) return json({ error: 'that picture is too large' }, 413);
      await blobs.put(k, bytes);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
  if (m[3] === 'send' && method === 'POST') {
    if (f.by !== me.id || f.status !== 'draft') return json({ error: 'not allowed' }, 403);
    f.status = 'open'; f.at = now;
    await save();
    const to = fam.members.find((x) => x.id === f.to);
    // The notification says who's asking, never what the Look is.
    if (to?.uid) tell([to.uid], 'us', { title: '👔 Fit Check', body: `${me.name} wants your take on a Look`, url: `family/#fitcheck=${f.id}`, tag: `fc${f.id}` });
    return json({ fitcheck: out(f) });
  }
  if (m[3] === 'answer' && method === 'POST') {
    if (f.to !== me.id) return json({ error: 'not allowed' }, 403);
    if (f.status === 'draft') return json({ error: 'not found' }, 404);
    const verdict = VERDICTS.includes(body.verdict) && (f.kind === 'ab' ? ['a', 'b', 'neither'] : ['hit', 'miss']).includes(body.verdict) ? body.verdict : null;
    if (!verdict) return json({ error: f.kind === 'ab' ? 'A, B or neither?' : 'Hit or Miss?' }, 400);
    f.verdict = verdict; f.reasons = verdict === 'miss' ? (Array.isArray(body.reasons) ? body.reasons : []).filter((r) => REASONS.includes(r)).slice(0, 6) : [];
    f.status = 'answered'; f.answeredAt = now;
    await save();
    const by = fam.members.find((x) => x.id === f.by);
    const said = { hit: '🔥 Hit', miss: '🙈 Miss', a: 'A', b: 'B', neither: 'Neither' }[verdict];
    if (by?.uid) tell([by.uid], 'us', { title: `👔 ${me.name} says ${said}`, body: 'Your Fit Check has an answer', url: `family/#fitcheck=${f.id}`, tag: `fc${f.id}` });
    return json({ fitcheck: out(f) });
  }
  if (!m[3] && method === 'DELETE') {
    if (f.by !== me.id) return json({ error: 'not allowed' }, 403);
    all.splice(all.indexOf(f), 1);
    await save();
    if (blobs) await blobs.del([0, 1].map((n) => fcImgKey(fam.fid, f.id, n)));
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// Someone leaving the family (or their account going): their Closet, its pictures and every Fit
// Check they sent or were sent go with them.
export async function forgetLooks(db, blobs, fid, memberId) {
  await db.del(`look:${fid}:${memberId}`);
  await db.del(`lookimgs:${fid}:${memberId}`);
  const all = (await db.get(`fitchecks:${fid}`)) || [];
  const gone = all.filter((f) => f.by === memberId || f.to === memberId);
  if (gone.length) await db.put(`fitchecks:${fid}`, all.filter((f) => !gone.includes(f)));
  if (!blobs) return;
  const keys = [...(await blobs.list(`f/${fid}/look/${memberId}/`)).map((o) => o.key), ...gone.flatMap((f) => [0, 1].map((n) => fcImgKey(fid, f.id, n)))];
  for (let i = 0; i < keys.length; i += 1000) await blobs.del(keys.slice(i, i + 1000));
}
