// 📖 Threads: write-ups people read and answer in their own time — what you learned, something to
// talk through, a how-to, a question, a poll. Each is for just the two of you ('us'), the family,
// or friends' families too ('connections', with its own key like a post). Titles, bodies, replies
// and poll options are end-to-end encrypted in an encrypted family; the connector keeps who wrote
// what and when, the board, who's read it, and the votes.

import { okPhotoId, deletePhoto, SIZES } from './photos.js';

export const BOARDS = { family: '👨‍👩‍👧 Family', dogs: '🐾 Dogs', house: '🏠 House & money' };
export const CATS = { learned: '📚 Learned', talk: '💬 Talk', howto: '📌 How-to', ask: '❓ Ask', poll: '📊 Poll' };

// 📷 Screenshots on a thread (plan comparisons, tables…): photo files locked with the thread's key,
// with an optional sealed caption each. At most 12.
const MAX_SHOTS = 12, MAX_DOCS = 5;
// 🗂 A family's own boards ("🎓 School", "✈️ Trips"…), next to the built-in ones: [{id, label}].
export const MAX_BOARDS = 12;
const boardOk = (fam, b) => !!BOARDS[b] || (fam.boards || []).some((x) => x.id === b);

export async function threadRoutes(c) {
  const { path, method, body, db, user, families, loadFamily, meIn, partnerOf, sealed, clean, randomId, tell, json, url, blobs } = c;
  // 🏷️ Who's tagged: grown-ups and kids with accounts in your own family who can see the thread
  // (a just-us thread: only your partner). Stored as member ids; their accounts stay on the server.
  const tagsOf = (fam, me, aud, ids) => {
    const ok = fam.members.filter((x) => x.kind === 'person' && x.uid && x.id !== me.id && (aud !== 'us' || x.id === partnerOf(fam, me)?.id));
    const pick = [...new Set(Array.isArray(ids) ? ids : [])].map((id) => ok.find((x) => x.id === id)).filter(Boolean).slice(0, 20);
    return { tags: pick.map((x) => x.id), uids: pick.map((x) => x.uid) };
  };
  const tellTagged = (uids, me, t) => uids.length && tell(uids, t.aud === 'us' ? 'us' : 'feed', { title: `🏷️ ${me.name} tagged you in a thread`, body: `${BOARDS[t.board] || (t.aud === 'us' ? '💞 Just us' : 'Threads')} · tap to read`, url: 'family/#threads', tag: `thread-${t.id}` });
  // 📎 PDFs: a file each (locked like screenshots); its name and page count in one sealed `meta`.
  const docsOf = (fam, v) => (Array.isArray(v) ? v : []).filter((x) => okPhotoId(x?.id)).slice(0, MAX_DOCS)
    .map((x) => ({ id: x.id, size: Math.max(0, Math.min(SIZES.doc, Math.round(+x.size || 0))), meta: sealed(x.meta, 600) ?? (fam.e2ee ? '' : JSON.stringify({ name: clean(x.meta?.name ?? x.meta, 120) || 'Document.pdf', pages: Math.max(0, Math.min(5000, Math.round(+x.meta?.pages || 0))) })) }));
  const shotsOf = (fam, v) => (Array.isArray(v) ? v : []).filter((x) => okPhotoId(x?.id)).slice(0, MAX_SHOTS)
    .map((x) => ({ id: x.id, aspect: Math.min(4, Math.max(0.2, +x.aspect || 1)), cap: (x.cap && text(fam, x.cap, 80)) || '' }));
  const text = (fam, v, max) => sealed(v, max * 3 + 200) ?? (fam.e2ee ? null : typeof v === 'string' ? String(v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max) : null);
  const visible = (t, own) => (t.aud === 'us' ? (t.to || []).includes(user.uid) : own || t.aud === 'connections');
  const blocked = new Set((user.blocked || []).map((b) => b.uid));
  // A family's thread you can see: your own family's, or a friends' family's shared with friends.
  const access = async (fid) => {
    const fam = await loadFamily(fid);
    if (fam) return { fam, own: true };
    const fams = await families();
    if (fams.some((f) => (f.connections || []).includes(fid))) return { fam: await db.get(`family:${fid}`), own: false };
    return null;
  };
  const summary = (t, own, famName) => ({
    id: t.id, fid: t.fid, aud: t.aud, board: t.board, movedBy: t.movedBy || '', cat: t.cat, title: t.title, by: t.by, byName: t.byName, byAvatar: t.byAvatar, mine: t.byUid === user.uid,
    at: t.at, lastAt: t.lastAt, lastByName: t.lastByName, replies: t.replies.filter((r) => !blocked.has(r.uid)).length, mins: t.mins || 1, pinned: !!t.pinned, shotCount: (t.shots || []).length, docCount: (t.docs || []).length, tagged: (t.tagUids || []).includes(user.uid),
    unread: (t.reads?.[user.uid] || 0) < t.lastAt && t.lastByUid !== user.uid, following: (t.followers || []).includes(user.uid), own, familyName: famName,
    best: !!t.best, poll: t.poll ? { closes: t.poll.closes, voted: t.poll.votes?.[user.uid] != null, n: Object.keys(t.poll.votes || {}).length } : null, ...(t.pk ? { pk: t.pk } : {}),
  });
  const full = (t, own, fam) => ({
    ...summary(t, own, fam?.name || ''), body: t.body, editedAt: t.editedAt || null, shots: t.shots || [], docs: t.docs || [], tags: t.tags || [],
    replies: t.replies.filter((r) => !blocked.has(r.uid)).map((r) => ({ id: r.id, name: r.name, text: r.text, quote: r.quote ?? null, at: r.at, mine: r.uid === user.uid, ups: (r.ups || []).length, upped: (r.ups || []).includes(user.uid) })),
    bestId: t.best || null,
    poll: t.poll ? { opts: t.poll.opts, closes: t.poll.closes, counts: t.poll.opts.map((_, i) => Object.values(t.poll.votes || {}).filter((v) => v === i).length), mine: t.poll.votes?.[user.uid] ?? null } : null,
    // Who's read it (for a just-us thread, when; for others, how many).
    readers: t.aud === 'us' ? Object.entries(t.reads || {}).filter(([u]) => u !== t.byUid).map(([, at]) => at) : [],
    readCount: Object.keys(t.reads || {}).filter((u) => u !== t.byUid).length,
    // 👀 Who in your own family has opened it, and when (member ids; accounts stay here).
    seen: own && fam?.members ? fam.members.filter((m) => m.uid && m.uid !== t.byUid && t.reads?.[m.uid]).map((m) => ({ id: m.id, at: t.reads[m.uid] })) : [],
  });

  // The list: every family you're in, and threads friends' families shared with friends.
  if (path === '/threads' && method === 'GET') {
    const fams = await families();
    const mine = new Set(fams.map((f) => f.fid));
    const sources = fams.map((f) => ({ fid: f.fid, own: true, fam: f }));
    for (const f of fams) for (const x of f.connections || []) if (!mine.has(x) && !sources.some((s) => s.fid === x)) sources.push({ fid: x, own: false });
    const out = [];
    for (const s of sources) {
      const fam = s.fam || await db.get(`family:${s.fid}`);
      for (const id of ((await db.get(`threads:${s.fid}`)) || []).slice(0, 80)) {
        const t = await db.get(`thread:${s.fid}:${id}`);
        if (!t || !visible(t, s.own) || blocked.has(t.byUid)) continue;
        out.push(summary(t, s.own, fam?.name || ''));
      }
    }
    out.sort((a, b) => (b.pinned - a.pinned) || b.lastAt - a.lastAt);
    return json({ threads: out.slice(0, 120), boards: BOARDS, cats: CATS });
  }

  // 🗂 Adding or removing one of the family's own boards (grown-ups; its threads go back to Family).
  const bm = path.match(/^\/families\/([a-z0-9]+)\/boards(?:\/(b[a-z0-9]{4,12}))?$/);
  if (bm) {
    const fam = await loadFamily(bm[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    if (meIn(fam).relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (!bm[2] && method === 'POST') {
      const label = clean(body.label, 30);
      if (!label) return json({ error: 'name the board' }, 400);
      if ((fam.boards || []).length >= MAX_BOARDS) return json({ error: `up to ${MAX_BOARDS} boards of your own` }, 400);
      if ([...Object.values(BOARDS), ...(fam.boards || []).map((x) => x.label)].some((x) => x.toLowerCase() === label.toLowerCase())) return json({ error: 'there’s a board with that name' }, 400);
      const board = { id: `b${randomId(5)}`, label };
      fam.boards = [...(fam.boards || []), board];
      await db.put(`family:${fam.fid}`, fam);
      return json({ board, boards: fam.boards });
    }
    if (bm[2] && method === 'DELETE') {
      fam.boards = (fam.boards || []).filter((x) => x.id !== bm[2]);
      await db.put(`family:${fam.fid}`, fam);
      for (const id of ((await db.get(`threads:${fam.fid}`)) || [])) {
        const t = await db.get(`thread:${fam.fid}:${id}`);
        if (t?.board === bm[2]) { t.board = 'family'; await db.put(`thread:${fam.fid}:${id}`, t); }
      }
      return json({ boards: fam.boards });
    }
    return json({ error: 'not found' }, 404);
  }

  let m = path.match(/^\/families\/([a-z0-9]+)\/threads(?:\/([a-z0-9]+)(?:\/(replies|vote|best|follow|up|move)(?:\/([a-z0-9]+))?)?)?$/);
  if (!m) return null;
  const [, fid, id, action, sub] = m;
  if (!id && method === 'POST') {
    const fam = await loadFamily(fid);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const aud = ['us', 'family', 'connections'].includes(body.aud) ? body.aud : 'family';
    const partner = aud === 'us' ? partnerOf(fam, me) : null;
    if (aud === 'us' && (!partner?.uid || me.relation === 'child')) return json({ error: 'just-us threads are for a couple in the family' }, 400);
    const title = text(fam, body.title, 120), b = text(fam, body.body, 12000);
    if (!title || !String(title).trim()) return json({ error: fam.e2ee && body.title && !sealed(body.title, 600) ? 'this family is end-to-end encrypted — update the app and try again' : 'give it a title' }, 400);
    if (b == null) return json({ error: 'this family is end-to-end encrypted — update the app and try again' }, 400);
    const cat = CATS[body.cat] ? body.cat : 'talk';
    let poll = null;
    if (cat === 'poll') {
      const opts = (Array.isArray(body.poll?.opts) ? body.poll.opts : []).map((o) => text(fam, o, 80)).filter((o) => o && String(o).trim()).slice(0, 8);
      if (opts.length < 2) return json({ error: 'a poll needs at least two choices' }, 400);
      poll = { opts, votes: {}, closes: /^\d{4}-\d{2}-\d{2}$/.test(body.poll?.closes || '') ? body.poll.closes : '' };
    }
    const pk = aud === 'connections' && body.pk && sealed(body.pk.fam, 300) ? { fam: body.pk.fam, conns: Object.fromEntries(Object.entries(body.pk.conns || {}).filter(([f, v]) => (fam.connections || []).includes(f) && sealed(v, 300))) } : null;
    // The same thread sent again (a retry): the one already saved.
    const cid = /^[a-z0-9]{8,24}$/.test(body.cid || '') ? body.cid : null;
    if (cid) { const had = await db.get(`threadcid:${user.uid}:${cid}`); const t = had && await db.get(`thread:${fam.fid}:${had}`); if (t) return json({ thread: full(t, true, fam), dup: true }); }
    const now = Date.now();
    const t = { id: `${(1e13 - now).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byUid: user.uid, byName: me.name, byAvatar: me.avatar || '', aud, to: aud === 'us' ? [user.uid, partner.uid] : [],
      board: aud === 'us' ? 'us' : aud === 'connections' ? 'friends' : boardOk(fam, body.board) ? body.board : 'family', cat, title, body: b, mins: Math.max(1, Math.min(60, Math.round(+body.mins || 1))),
      at: now, lastAt: now, lastByUid: user.uid, lastByName: me.name, replies: [], reads: { [user.uid]: now }, followers: [user.uid], ...(poll ? { poll } : {}), ...(pk ? { pk } : {}) };
    const shots = blobs ? shotsOf(fam, body.shots) : [];
    if (shots.length) t.shots = shots;
    const docs = blobs ? docsOf(fam, body.docs) : [];
    if (docs.length) t.docs = docs;
    const tg = tagsOf(fam, me, aud, body.tags);
    if (tg.tags.length) { t.tags = tg.tags; t.tagUids = tg.uids; }
    await db.put(`thread:${fam.fid}:${t.id}`, t);
    await db.put(`threads:${fam.fid}`, [t.id, ...((await db.get(`threads:${fam.fid}`)) || [])].slice(0, 300));
    if (cid) await db.put(`threadcid:${user.uid}:${cid}`, t.id, 2 * 86400);
    // Read in your own time: a just-us write-up only pings when you ask it to.
    if (aud === 'us' && body.nudge && !tg.uids.includes(partner.uid)) await tell([partner.uid], 'us', { title: `📓 ${me.name} wrote you something`, body: 'Read it when you have a moment', url: 'family/#us', tag: `thread-${t.id}` });
    await tellTagged(tg.uids, me, t);
    return json({ thread: full(t, true, fam) });
  }
  if (!id) return json({ error: 'not found' }, 404);
  const a = await access(fid);
  if (!a?.fam) return json({ error: 'not found' }, 404);
  const key = `thread:${fid}:${id}`;
  const t = await db.get(key);
  if (!t || !visible(t, a.own) || blocked.has(t.byUid)) return json({ error: 'not found' }, 404);
  const myName = a.own ? meIn(a.fam).name : user.name;
  const save = () => db.put(key, t);

  if (!action && method === 'GET') {
    // Opening it counts as read — written only when there's something new, to keep writes down.
    if ((t.reads?.[user.uid] || 0) < t.lastAt) { t.reads = { ...(t.reads || {}), [user.uid]: Date.now() }; await save(); }
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (!action && method === 'PATCH') {
    const owner = a.own && meIn(a.fam).role === 'owner';
    if (t.byUid !== user.uid && !(owner && Object.keys(body).every((k) => k === 'pinned'))) return json({ error: 'only who wrote it can change it' }, 403);
    if (body.title != null) { const v = text(a.fam, body.title, 120); if (!v) return json({ error: 'give it a title' }, 400); t.title = v; }
    if (body.body != null) { const v = text(a.fam, body.body, 12000); if (v == null) return json({ error: 'expected sealed text' }, 400); t.body = v; t.editedAt = Date.now(); }
    if (body.mins != null) t.mins = Math.max(1, Math.min(60, Math.round(+body.mins || 1)));
    if (body.pinned != null) t.pinned = !!body.pinned;
    if (body.tags != null && a.own && t.byUid === user.uid) {
      const me = meIn(a.fam), tg = tagsOf(a.fam, me, t.aud, body.tags);
      const added = tg.uids.filter((u) => !(t.tagUids || []).includes(u));
      t.tags = tg.tags; t.tagUids = tg.uids;
      await tellTagged(added, me, t);
    }
    if (body.shots != null && blobs) {
      const next = shotsOf(a.fam, body.shots);
      for (const x of t.shots || []) if (!next.some((y) => y.id === x.id)) await deletePhoto(blobs, fid, x.id).catch(() => {});
      t.shots = next; t.editedAt = Date.now();
    }
    if (body.docs != null && blobs) {
      const next = docsOf(a.fam, body.docs);
      for (const x of t.docs || []) if (!next.some((y) => y.id === x.id)) await deletePhoto(blobs, fid, x.id).catch(() => {});
      t.docs = next; t.editedAt = Date.now();
    }
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (!action && method === 'DELETE') {
    const owner = a.own && meIn(a.fam).role === 'owner';
    if (t.byUid !== user.uid && !owner) return json({ error: 'only who wrote it can delete it' }, 403);
    for (const x of [...(t.shots || []), ...(t.docs || [])]) await deletePhoto(blobs, fid, x.id).catch(() => {});
    await db.del(key);
    await db.put(`threads:${fid}`, ((await db.get(`threads:${fid}`)) || []).filter((x) => x !== id));
    return json({ ok: true });
  }
  if (action === 'replies' && !sub && method === 'POST') {
    const v = text(a.fam, body.text, 4000);
    if (!v || !String(v).trim()) return json({ error: 'write a reply' }, 400);
    const quote = body.quote == null ? null : Number.isInteger(body.quote) ? Math.max(0, Math.min(200, body.quote)) : text(a.fam, body.quote, 300);
    const r = { id: randomId(5), uid: user.uid, name: myName, text: v, quote, at: Date.now(), ups: [] };
    t.replies = [...t.replies, r].slice(-300);
    Object.assign(t, { lastAt: r.at, lastByUid: user.uid, lastByName: myName });
    t.reads = { ...(t.reads || {}), [user.uid]: r.at };
    if (!(t.followers || []).includes(user.uid)) t.followers = [...(t.followers || []), user.uid];
    await save();
    const to = (t.followers || []).filter((u) => u !== user.uid && !blocked.has(u));
    if (to.length) await tell(to, t.aud === 'us' ? 'us' : 'feed', { title: `💬 ${myName} replied`, body: 'Tap to read it', url: t.aud === 'us' ? 'family/#us' : 'family/#threads', tag: `thread-${id}` });
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (action === 'replies' && sub && method === 'DELETE') {
    const r = t.replies.find((x) => x.id === sub);
    if (!r || r.uid !== user.uid) return json({ error: 'not found' }, 404);
    t.replies = t.replies.filter((x) => x.id !== sub);
    if (t.best === sub) t.best = null;
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (action === 'up' && sub && method === 'POST') {
    const r = t.replies.find((x) => x.id === sub);
    if (!r) return json({ error: 'not found' }, 404);
    r.ups = (r.ups || []).includes(user.uid) ? r.ups.filter((u) => u !== user.uid) : [...(r.ups || []), user.uid];
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (action === 'best' && method === 'POST') {
    if (t.byUid !== user.uid) return json({ error: 'only who asked can pick the best answer' }, 403);
    t.best = t.replies.some((r) => r.id === body.reply) && t.best !== body.reply ? body.reply : null;
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (action === 'vote' && method === 'POST') {
    if (!t.poll) return json({ error: 'not a poll' }, 400);
    if (t.poll.closes && t.poll.closes < new Date().toISOString().slice(0, 10)) return json({ error: 'this poll has closed' }, 400);
    const i = +body.i;
    if (!Number.isInteger(i) || i < 0 || i >= t.poll.opts.length) return json({ error: 'which one?' }, 400);
    t.poll.votes = { ...(t.poll.votes || {}), [user.uid]: i };
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  // 🗂 Moving a thread to another board, by anyone in the family. Out of 💞 Just us (the whole
  // family will see it) only by the two of you; into it only a thread one of you wrote.
  if (action === 'move' && method === 'POST') {
    if (!a.own || t.aud === 'connections') return json({ error: 'threads shared with friends’ families stay on Friends’' }, 400);
    const me = meIn(a.fam), to = body.board;
    if (to === 'us') {
      const partner = partnerOf(a.fam, me);
      const coupled = (x) => ['self', 'spouse', 'partner'].includes(x?.relation);
      if (!partner?.uid || !coupled(me) || !coupled(partner)) return json({ error: 'just-us is for a couple in the family' }, 400);
      if (![user.uid, partner.uid].includes(t.byUid)) return json({ error: 'only a thread one of you wrote can move to Just us' }, 403);
      const tg = tagsOf(a.fam, me, 'us', t.tags || []);
      Object.assign(t, { aud: 'us', board: 'us', to: [user.uid, partner.uid], tags: tg.tags, tagUids: tg.uids });
    } else {
      if (!boardOk(a.fam, to)) return json({ error: 'which board?' }, 400);
      if (t.aud === 'us' && body.share !== true) return json({ error: 'moving it out of Just us shows it to the whole family', confirm: true }, 400);
      Object.assign(t, { aud: 'family', board: to, to: [] });
    }
    t.movedBy = me.name;
    await save();
    return json({ thread: full(t, a.own, a.fam) });
  }
  if (action === 'follow' && method === 'POST') {
    t.followers = (t.followers || []).includes(user.uid) ? t.followers.filter((u) => u !== user.uid) : [...(t.followers || []), user.uid];
    await save();
    return json({ following: t.followers.includes(user.uid) });
  }
  return json({ error: 'not found' }, 404);
}
