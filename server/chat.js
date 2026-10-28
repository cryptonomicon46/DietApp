// 💬 Chats: direct messages between the grown-ups in a family — one to one, and one group with all
// of them ("👨‍👩‍👧 Grown-ups", when there are three or more). Never pets, and never anyone under 18:
// a person needs their own account, and is left out when they were added as a child or their
// birthday says they're under 18. The connector checks this on every request.
//
// Messages are sealed on the phone with the family key like everything else; the connector keeps
// who wrote, when, reactions and who's read up to where. Each family's chats live in one
// Durable Object (chatHub.js), which also holds the live connections that make messages
// arrive instantly; the on-phone demo runs the same ChatCore over its own storage.
//
// Stored per family (in its Durable Object, or "chat:<fid>:" keys in the demo):
//   index            [chatId]
//   c:<chatId>       {seq, lastAt, lastBy, lastT, lastP, reads: {memberId: seq}, joined: {memberId: seq}, cids: [[cid, seq]]}
//   m:<chatId>:<n>   [message] for seqs n*PAGE+1 … (n+1)*PAGE
//   message          {s, c, by, at, t (sealed text), r (seq it answers), p: [{id, a (aspect)} | {id, k: 'doc', size, meta}], x: {emoji: [memberId]}, d (deleted)}

export const REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
export const GROUP = 'g';
export const PAGE = 20;
export const MAX_FILES = 6;
const SEALED_RE = /^e1:[A-Za-z0-9_-]+$/;
const okId = (s) => /^[a-z0-9]{6,40}$/.test(String(s || ''));

export const dmId = (a, b) => `d_${[a, b].sort().join('_')}`;
export const okChatId = (s) => s === GROUP || /^d_[a-z0-9]{3,24}_[a-z0-9]{3,24}$/.test(String(s || ''));

// Whole years between a birthday and a day (both YYYY-MM-DD).
export function ageOn(born, today) {
  const [y, m, d] = born.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
export function grownUp(m, today = new Date().toISOString().slice(0, 10)) {
  // Someone added as a child stays out (they can't change that themselves); a birthday can only
  // keep someone out, never let a child in.
  if (m?.kind !== 'person' || !m.uid || m.relation === 'child') return false;
  return !/^\d{4}-\d{2}-\d{2}$/.test(m.born || '') || ageOn(m.born, today) >= 18;
}
export const grownUps = (fam, today) => fam.members.filter((m) => grownUp(m, today));

// The chats one grown-up has: one with each other grown-up (except people they blocked), and
// the group when there are three or more of them.
export function chatsFor(fam, me, { blocked = new Set(), today } = {}) {
  const adults = grownUps(fam, today);
  if (!me || !adults.some((x) => x.id === me.id)) return [];
  const list = adults.filter((x) => x.id !== me.id && !blocked.has(x.uid)).map((x) => ({ id: dmId(me.id, x.id), kind: 'dm', with: [me.id, x.id].sort() }));
  if (adults.length >= 3) list.push({ id: GROUP, kind: 'group', with: adults.map((x) => x.id) });
  return list;
}

// ---------- one family's chats, over any get / put / delete store ----------
export class ChatCore {
  constructor(store, now = () => Date.now()) { this.store = store; this.now = now; }
  async meta(id) { return (await this.store.get(`c:${id}`)) || { seq: 0, lastAt: 0, lastBy: '', lastT: null, lastP: 0, reads: {}, joined: {}, cids: [] }; }
  saveMeta(id, c) { return this.store.put(`c:${id}`, c); }
  async index() { return (await this.store.get('index')) || []; }
  async bucket(id, n) { return (await this.store.get(`m:${id}:${n}`)) || []; }
  // The group shows each grown-up only what was said after they joined it.
  async ensure(chat, c) {
    if (chat.kind !== 'group') return c;
    let changed = false;
    for (const m of chat.with) if (c.joined[m] == null) { c.joined[m] = c.seq; changed = true; }
    if (changed) await this.saveMeta(chat.id, c);
    return c;
  }
  since(c, me) { return c.joined?.[me] || 0; }

  async list(chats, me) {
    const out = [];
    for (const chat of chats) {
      const c = await this.ensure(chat, await this.meta(chat.id));
      const seen = Math.max(c.reads[me] || 0, this.since(c, me));
      const fresh = c.seq > this.since(c, me);
      out.push({ id: chat.id, kind: chat.kind, with: chat.with, seq: c.seq, lastAt: fresh ? c.lastAt : 0, lastBy: fresh ? c.lastBy : '', lastT: fresh ? c.lastT : null, lastP: fresh ? c.lastP : 0, unread: Math.max(0, c.seq - seen) });
    }
    return out;
  }
  // A page of messages, newest last: the PAGE before `before` (default: the latest).
  async page(chat, me, before = null) {
    const c = await this.ensure(chat, await this.meta(chat.id));
    const from = this.since(c, me);
    const top = Math.min(c.seq, before == null ? c.seq : before - 1);
    const out = [];
    for (let n = Math.floor((top - 1) / PAGE); n >= 0 && out.length < PAGE; n--) {
      const b = (await this.bucket(chat.id, n)).filter((x) => x.s <= top && x.s > from);
      out.unshift(...b.slice(-(PAGE - out.length)));
    }
    const reads = Object.fromEntries(chat.with.map((m) => [m, c.reads[m] || 0]));
    return { messages: out, seq: c.seq, reads, more: out.length > 0 && out[0].s > from + 1 };
  }
  async send(chat, me, { cid, t, r = null, p = [] }) {
    const c = await this.ensure(chat, await this.meta(chat.id));
    const had = cid && c.cids.find(([x]) => x === cid);
    if (had) { const b = await this.bucket(chat.id, Math.floor((had[1] - 1) / PAGE)); const m = b.find((x) => x.s === had[1]); if (m) return { message: m, dup: true }; }
    const s = c.seq + 1, at = this.now();
    const message = { s, c: cid || '', by: me, at, t, r: Number.isInteger(r) && r > 0 && r < s ? r : null, p, x: {}, d: 0 };
    const n = Math.floor((s - 1) / PAGE);
    await this.store.put(`m:${chat.id}:${n}`, [...await this.bucket(chat.id, n), message]);
    Object.assign(c, { seq: s, lastAt: at, lastBy: me, lastT: t, lastP: p.length });
    c.reads = { ...c.reads, [me]: s };
    if (cid) c.cids = [...c.cids, [cid, s]].slice(-30);
    await this.saveMeta(chat.id, c);
    const idx = await this.index();
    if (!idx.includes(chat.id)) await this.store.put('index', [...idx, chat.id]);
    return { message };
  }
  async edit(chat, s, fn) {
    const n = Math.floor((s - 1) / PAGE), b = await this.bucket(chat.id, n);
    const m = b.find((x) => x.s === s);
    if (!m || m.d) return null;
    const res = fn(m);
    if (res === false) return null;
    await this.store.put(`m:${chat.id}:${n}`, b);
    return m;
  }
  // One reaction per person per message: the same one again takes it off.
  react(chat, me, s, e) {
    return this.edit(chat, s, (m) => {
      const had = Object.keys(m.x).find((k) => m.x[k].includes(me));
      for (const k of Object.keys(m.x)) { m.x[k] = m.x[k].filter((x) => x !== me); if (!m.x[k].length) delete m.x[k]; }
      if (had !== e) m.x[e] = [...(m.x[e] || []), me];
    });
  }
  // Unsend: your own message becomes "deleted"; its files are returned so they can be removed.
  async remove(chat, me, s) {
    let files = [];
    const m = await this.edit(chat, s, (x) => { if (x.by !== me) return false; files = x.p.map((f) => f.id); Object.assign(x, { t: null, p: [], x: {}, d: 1 }); });
    if (!m) return null;
    const c = await this.meta(chat.id);
    if (c.seq === s) { c.lastT = null; c.lastP = 0; await this.saveMeta(chat.id, c); }
    return { message: m, files };
  }
  async read(chat, me, s) {
    const c = await this.meta(chat.id);
    const to = Math.min(c.seq, Math.max(0, Math.round(+s || 0)));
    if (to <= (c.reads[me] || 0)) return false;
    c.reads = { ...c.reads, [me]: to };
    await this.saveMeta(chat.id, c);
    return to;
  }
  // Someone leaves the family: their one-to-one chats go; with `all`, their group messages too.
  async forget(member, { all = false } = {}) {
    const files = [];
    const idx = await this.index();
    for (const id of idx) {
      const c = await this.meta(id);
      const buckets = Math.ceil(c.seq / PAGE);
      if (id !== GROUP && id.split('_').includes(member)) {
        for (let n = 0; n < buckets; n++) { for (const m of await this.bucket(id, n)) files.push(...m.p.map((f) => f.id)); await this.store.delete(`m:${id}:${n}`); }
        await this.store.delete(`c:${id}`);
        continue;
      }
      if (id === GROUP) {
        if (all) for (let n = 0; n < buckets; n++) {
          const b = await this.bucket(id, n);
          if (!b.some((m) => m.by === member && !m.d)) continue;
          for (const m of b) if (m.by === member && !m.d) { files.push(...m.p.map((f) => f.id)); Object.assign(m, { t: null, p: [], x: {}, d: 1 }); }
          await this.store.put(`m:${id}:${n}`, b);
        }
        delete c.reads[member]; delete c.joined[member];
        await this.saveMeta(id, c);
      }
    }
    await this.store.put('index', idx.filter((id) => id === GROUP || !id.split('_').includes(member)));
    return { files };
  }
}

// What a phone may send: sealed text (or plain text in a family that isn't encrypted yet), the
// message it answers, and up to six files already uploaded (photos and screenshots, PDFs).
export function cleanMessage(fam, body) {
  const t = typeof body.t === 'string' && body.t.length <= 12000 && SEALED_RE.test(body.t) ? body.t
    : !fam.e2ee && typeof body.t === 'string' ? body.t.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 4000) : null;
  const p = (Array.isArray(body.p) ? body.p : []).filter((f) => okId(f?.id)).slice(0, MAX_FILES).map((f) => (f.k === 'doc'
    ? { id: f.id, k: 'doc', size: Math.max(0, Math.min(20_100_000, Math.round(+f.size || 0))), meta: typeof f.meta === 'string' && f.meta.length <= 600 && (SEALED_RE.test(f.meta) || !fam.e2ee) ? f.meta : '' }
    : { id: f.id, a: Math.min(4, Math.max(0.2, Math.round((+f.a || 1) * 1000) / 1000)) }));
  if (t == null && !p.length) return null;
  if (t != null && !p.length && !String(t).trim()) return null;
  return { cid: /^[a-z0-9]{8,24}$/.test(body.cid || '') ? body.cid : '', t: t ?? '', r: Number.isInteger(body.r) ? body.r : null, p };
}

// Runs one operation → {out, event?, to?}: the answer, and what to tell the open phones in the chat.
export async function runOp(core, op, a) {
  const chat = a.chat;
  switch (op) {
    case 'list': return { out: { chats: await core.list(a.chats, a.me) } };
    case 'page': return { out: await core.page(chat, a.me, a.before) };
    case 'send': {
      const r = await core.send(chat, a.me, a.msg);
      return { out: r, ...(r.dup ? {} : { event: { type: 'msg', chat: chat.id, message: r.message }, to: chat.with }) };
    }
    case 'react': {
      const m = await core.react(chat, a.me, a.s, a.e);
      return m ? { out: { message: m }, event: { type: 'edit', chat: chat.id, message: m }, to: chat.with } : { out: { error: 'not found' } };
    }
    case 'remove': {
      const r = await core.remove(chat, a.me, a.s);
      return r ? { out: r, event: { type: 'edit', chat: chat.id, message: r.message }, to: chat.with } : { out: { error: 'not found' } };
    }
    case 'read': {
      const s = await core.read(chat, a.me, a.s);
      return { out: { ok: true }, ...(s ? { event: { type: 'read', chat: chat.id, m: a.me, s }, to: chat.with } : {}) };
    }
    case 'forget': return { out: await core.forget(a.member, { all: !!a.all }) };
    default: return { out: { error: 'unknown' } };
  }
}

// ---------- the connector's routes (family.js hands over what it knows) ----------
// hub(fid) → {call(op, args) → out, live}: the family's Durable Object, or ChatCore right here.
export async function chatRoutes(c) {
  const { path, method, body, user, loadFamily, meIn, tell, json, url, hub, blobs, deletePhoto } = c;
  const owns = c.owns || (async () => true);
  const m = path.match(/^\/families\/([a-z0-9]+)\/chats(?:\/(ticket|[a-z0-9_]+)(?:\/(react|read|report|\d+))?)?$/);
  if (!m) return null;
  const [, fid, cid, action] = m;
  const fam = await loadFamily(fid);
  if (!fam) return json({ error: 'not found' }, 404);
  const me = meIn(fam);
  const blocked = new Set((user.blocked || []).map((b) => b.uid));
  const chats = chatsFor(fam, me, { blocked });
  if (!chats.length) return json({ error: grownUp(me) ? 'chats need another grown-up with an account in the family' : 'chats are for grown-ups' }, 403);
  const h = hub(fid);
  const adults = grownUps(fam).map((x) => x.id);
  const call = (op, args = {}) => h.call(op, { ...args, me: me.id, adults });

  if (!cid && method === 'GET') return json({ ...(await call('list', { chats })), live: h.live });
  // A one-time pass for the live connection (a socket can't carry the sign-in header).
  if (cid === 'ticket' && !action && method === 'POST') {
    if (!h.live) return json({ ticket: null });
    return json(await call('ticket', { chats: chats.map((x) => x.id) }));
  }
  const chat = chats.find((x) => x.id === cid);
  if (!chat) return json({ error: 'not found' }, 404);

  if (!action && method === 'GET') {
    const before = +url().searchParams.get('before') || null;
    return json(await call('page', { chat, before }));
  }
  if (!action && method === 'POST') {
    const msg = cleanMessage(fam, body);
    if (!msg) return json({ error: fam.e2ee && typeof body.t === 'string' && !SEALED_RE.test(body.t) ? 'this family is end-to-end encrypted — update the app and try again' : 'write a message' }, 400);
    if (!(await owns(fid, msg.p.map((f) => f.id), me.id))) return json({ error: 'that file isn\'t yours to send' }, 403);
    const r = await call('send', { chat, msg });
    // 🔔 Who it's for and isn't looking at this chat right now: who wrote, never what.
    const to = (r.notify || chat.with).filter((x) => x !== me.id);
    const uids = to.map((id) => fam.members.find((x) => x.id === id)?.uid).filter((u) => u && !blocked.has(u));
    if (!r.dup && uids.length) await tell(uids, 'chat', { title: chat.kind === 'group' ? `💬 ${me.name} in Grown-ups` : `💬 ${me.name}`, body: msg.p.length && !msg.t ? 'Sent a photo' : 'New message', url: `family/#chat=${chat.id}`, tag: `chat-${chat.id}` });
    delete r.notify;
    return json(r);
  }
  if (action === 'react' && method === 'POST') {
    if (!REACTIONS.includes(body.e)) return json({ error: 'pick a reaction' }, 400);
    const r = await call('react', { chat, s: Math.round(+body.s || 0), e: body.e });
    return r.error ? json(r, 404) : json(r);
  }
  if (action === 'read' && method === 'POST') return json(await call('read', { chat, s: body.s }));
  // ⚑ Reporting a message: kept with who reported which message and why (the message itself stays
  // end-to-end encrypted and isn't sent anywhere). Blocking is /families/:fid/members/:id/block.
  if (action === 'report' && method === 'POST') {
    const s = Math.round(+body.s || 0);
    if (!(s > 0) || !c.db) return json({ error: 'which message?' }, 400);
    const rk = `report:${fid}:chat:${chat.id}`, list = (await c.db.get(rk)) || [];
    if (!list.some((x) => x.uid === user.uid && x.s === s)) list.push({ uid: user.uid, s, reason: String(body.reason || '').slice(0, 200), at: Date.now() });
    await c.db.put(rk, list.slice(-100));
    return json({ ok: true });
  }
  if (/^\d+$/.test(action || '') && method === 'DELETE') {
    const r = await call('remove', { chat, s: +action });
    if (r.error) return json(r, 404);
    for (const id of r.files || []) await deletePhoto(blobs, fid, id).catch(() => {});
    return json({ message: r.message });
  }
  return json({ error: 'not found' }, 404);
}
