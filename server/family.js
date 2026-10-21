// 👨‍👩‍👧 OurPawmily Families (v2): accounts, families, invites, a private feed and per-member data.
// Mounted by worker.js at /v2/*; also runs inside the browser for the on-phone demo (any KV-like
// store works: get / put / delete). Nothing here holds secrets.
//
// Sign-in is with Google (an ID token from Google Identity Services, verified here), so Google's
// own 2-Step Verification protects every account. A family is created by one person; everyone
// else joins through an invite sent to their email address, and only that Google account can
// accept it. Families can connect to friends' families the same way.
//
// KV keys (prefix v2:):
//   user:<uid>                 {uid, email, name, picture, families: [fid]}
//   session:<token>            {uid}                      (30 days)
//   family:<fid>               {fid, name, createdBy, members: [...], connections: [fid]}
//   invite:<code>              {code, kind: 'member'|'family', fid, memberId?, email, by, byName}
//   feed:<fid>                 [postId] newest first (last 300)
//   post:<fid>:<postId>        {id, fid, by, byName, text, photo, tags, audience, likes, comments, at}
//   data:<fid>:<memberId>      {savedAt, data}            a member's tracker data (diet, dogs…)

const SESSION_TTL = 30 * 86400;
const INVITE_TTL = 14 * 86400;
const RELATIONS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'relative', 'friend', 'other'];
const SPECIES = ['dog', 'cat', 'other'];

const enc = new TextEncoder();
const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
export const randomId = (bytes = 9) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const emailOf = (s) => { const e = clean(s, 120).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ''; };

// ---------- Google ID token ----------
let certCache = null;
export async function verifyGoogle(idToken, clientId, keys = null) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [h, p, s] = parts;
  const header = b64urlJson(h), payload = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('bad token');
  if (!keys) {
    if (!certCache || Date.now() - certCache.at > 3600e3) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      certCache = { at: Date.now(), keys: (await res.json()).keys || [] };
    }
    keys = certCache.keys;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('bad issuer');
  if (payload.aud !== clientId) throw new Error('token is for another app');
  if (!(payload.exp * 1000 > Date.now())) throw new Error('token expired');
  if (!payload.email || payload.email_verified === false) throw new Error('email not verified');
  return { uid: `g${payload.sub}`, email: payload.email.toLowerCase(), name: clean(payload.name || payload.email.split('@')[0], 60), picture: clean(payload.picture, 300) };
}

// ---------- storage helpers ----------
const store = (kv) => ({
  get: async (k) => { const v = await kv.get(`v2:${k}`); return v ? JSON.parse(v) : null; },
  put: (k, v, ttl) => kv.put(`v2:${k}`, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined),
  del: (k) => kv.delete(`v2:${k}`),
});

// What a member looks like to someone else (no emails for people outside the family).
const memberView = (m, inside) => ({
  id: m.id, kind: m.kind, name: m.name, relation: m.relation, species: m.species, breed: m.breed, born: m.born,
  avatar: m.avatar, status: m.uid ? 'active' : m.email ? 'invited' : 'managed', role: m.role,
  ...(inside ? { email: m.email || '', shareWith: m.shareWith || [], legacyId: m.legacyId || '', uid: m.uid || '' } : {}),
});

export async function familyApi(req, env, path) {
  const db = store(env.HOUSEHOLD);
  const json = (data, status = 200) => ({ status, data });
  const method = req.method;
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const text = await req.text();
    if (text.length > 6_000_000) return json({ error: 'too large' }, 413);
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'not JSON' }, 400); }
  }

  if (path === '/config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || '', ready: !!env.GOOGLE_CLIENT_ID });

  // ---- sign in ----
  if (path === '/auth/google' && method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in is not set up on the connector yet' }, 501);
    let who;
    try { who = await verifyGoogle(body.credential, env.GOOGLE_CLIENT_ID, env.__googleKeys || null); } catch (err) { return json({ error: `sign-in failed: ${err.message}` }, 401); }
    return json(await startSession(db, who));
  }
  // The on-phone demo signs in without Google (never enabled on the real connector).
  if (path === '/auth/demo' && method === 'POST') {
    if (!env.DEMO) return json({ error: 'not found' }, 404);
    const email = emailOf(body.email);
    if (!email) return json({ error: 'enter an email address' }, 400);
    return json(await startSession(db, { uid: `d${email.replace(/[^a-z0-9]/g, '')}`, email, name: clean(body.name || email.split('@')[0], 60), picture: '' }));
  }

  // ---- everything else needs a session ----
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const session = /^[a-z0-9]{20,64}$/.test(token) ? await db.get(`session:${token}`) : null;
  if (!session) return json({ error: 'sign in first' }, 401);
  const user = await db.get(`user:${session.uid}`);
  if (!user) return json({ error: 'sign in first' }, 401);
  const saveUser = () => db.put(`user:${user.uid}`, user);

  if (path === '/auth/logout' && method === 'POST') { await db.del(`session:${token}`); return json({ ok: true }); }

  const families = async () => (await Promise.all(user.families.map((f) => db.get(`family:${f}`)))).filter(Boolean);
  const meIn = (fam) => fam.members.find((m) => m.uid === user.uid);
  const loadFamily = async (fid) => {
    const fam = /^[a-z0-9]{6,24}$/.test(fid) ? await db.get(`family:${fid}`) : null;
    return fam && meIn(fam) ? fam : null;
  };

  if (path === '/me' && method === 'GET') {
    const fams = await families();
    return json({ user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture }, families: fams.map((f) => familyOut(f, user)) });
  }

  // ---- families ----
  if (path === '/families' && method === 'POST') {
    const name = clean(body.name, 40);
    if (!name) return json({ error: 'name your family' }, 400);
    if (user.families.length >= 5) return json({ error: 'up to 5 families per account' }, 400);
    const fam = { fid: randomId(), name, createdBy: user.uid, createdAt: Date.now(), connections: [], members: [
      { id: randomId(6), kind: 'person', uid: user.uid, email: user.email, name: clean(body.myName || user.name, 40), relation: 'self', role: 'owner', avatar: user.picture || '', shareWith: [] },
    ] };
    await db.put(`family:${fam.fid}`, fam);
    user.families.push(fam.fid); await saveUser();
    return json({ family: familyOut(fam, user) });
  }
  let m = path.match(/^\/families\/([a-z0-9]+)$/);
  if (m && method === 'GET') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const connected = (await Promise.all(fam.connections.map((f) => db.get(`family:${f}`)))).filter(Boolean)
      .map((f) => ({ fid: f.fid, name: f.name, members: f.members.map((x) => memberView(x, false)) }));
    return json({ family: familyOut(fam, user), connected });
  }

  // ---- members ----
  m = path.match(/^\/families\/([a-z0-9]+)\/members$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (fam.members.length >= 30) return json({ error: 'family is full' }, 400);
    const kind = body.kind === 'pet' ? 'pet' : 'person';
    const name = clean(body.name, 40);
    if (!name) return json({ error: 'add a name' }, 400);
    const email = kind === 'person' ? emailOf(body.email) : '';
    if (email && fam.members.some((x) => x.email === email)) return json({ error: 'already in the family' }, 409);
    const member = {
      id: randomId(6), kind, name, role: kind === 'pet' ? 'pet' : 'member',
      relation: kind === 'pet' ? 'pet' : RELATIONS.includes(body.relation) ? body.relation : 'other',
      ...(kind === 'pet' ? { species: SPECIES.includes(body.species) ? body.species : 'dog', breed: clean(body.breed, 40), born: /^\d{4}-\d{2}-\d{2}$/.test(body.born || '') ? body.born : '' } : {}),
      ...(email ? { email } : {}), legacyId: clean(body.legacyId, 40), avatar: clean(body.avatar, 8), shareWith: [], addedBy: me.id, addedAt: Date.now(),
    };
    fam.members.push(member);
    await db.put(`family:${fam.fid}`, fam);
    const invite = email ? await makeInvite(db, { kind: 'member', fid: fam.fid, memberId: member.id, email, by: me.id, byName: me.name, familyName: fam.name }) : null;
    return json({ member: memberView(member, true), invite });
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)$/);
  if (m && (method === 'PATCH' || method === 'DELETE')) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const t = fam.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    const self = t.id === me.id;
    // You edit yourself; grown-ups edit pets, kids and people who haven't joined yet.
    const canEdit = self || (me.relation !== 'child' && (t.kind === 'pet' || !t.uid));
    if (!canEdit) return json({ error: 'only they can change that' }, 403);
    if (method === 'DELETE') {
      if (t.role === 'owner') return json({ error: "the family's creator can't be removed" }, 400);
      if (!(me.role === 'owner' || self || !t.uid)) return json({ error: 'not allowed' }, 403);
      fam.members = fam.members.filter((x) => x.id !== t.id);
      for (const x of fam.members) x.shareWith = (x.shareWith || []).filter((id) => id !== t.id);
      await db.put(`family:${fam.fid}`, fam);
      await db.del(`data:${fam.fid}:${t.id}`);
      if (t.uid) { const u = await db.get(`user:${t.uid}`); if (u) { u.families = u.families.filter((f) => f !== fam.fid); await db.put(`user:${u.uid}`, u); } }
      return json({ ok: true });
    }
    if (body.name != null) t.name = clean(body.name, 40) || t.name;
    if (body.avatar != null) t.avatar = clean(body.avatar, 8);
    if (body.legacyId != null) t.legacyId = clean(body.legacyId, 40); // who they were in the current app
    if (t.kind === 'pet') {
      if (body.breed != null) t.breed = clean(body.breed, 40);
      if (body.born != null && /^(\d{4}-\d{2}-\d{2})?$/.test(body.born)) t.born = body.born;
    } else if (body.relation != null && !self && RELATIONS.includes(body.relation)) t.relation = body.relation;
    // Only you decide who sees your diet & fitness.
    if (self && Array.isArray(body.shareWith)) t.shareWith = body.shareWith.filter((id) => fam.members.some((x) => x.id === id && x.kind === 'person' && x.id !== me.id));
    await db.put(`family:${fam.fid}`, fam);
    return json({ member: memberView(t, true) });
  }

  // ---- a member's tracker data (diet, training, dogs) ----
  m = path.match(/^\/families\/([a-z0-9]+)\/members\/([a-z0-9]+)\/data$/);
  if (m) {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const t = fam.members.find((x) => x.id === m[2]);
    if (!t) return json({ error: 'not found' }, 404);
    const self = t.id === me.id;
    if (method === 'GET') {
      // Not joined yet: whoever added them (and brought their data over) holds it until they do.
      const can = self || t.kind === 'pet' || (t.shareWith || []).includes(me.id) || (!t.uid && t.addedBy === me.id);
      if (!can) return json({ error: `${t.name} hasn't shared this with you`, locked: true }, 403);
      return json((await db.get(`data:${fam.fid}:${t.id}`)) || { savedAt: 0, data: {} });
    }
    if (method === 'PUT') {
      // Yours, a pet's, or (bringing data over) someone who hasn't joined yet.
      if (!(self || t.kind === 'pet' || (!t.uid && t.addedBy === me.id))) return json({ error: 'not allowed' }, 403);
      if (!body || typeof body.data !== 'object') return json({ error: 'expected {data}' }, 400);
      await db.put(`data:${fam.fid}:${t.id}`, { savedAt: Date.now(), data: body.data });
      return json({ ok: true });
    }
  }

  // ---- invites ----
  m = path.match(/^\/families\/([a-z0-9]+)\/invites$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    if (me.relation === 'child') return json({ error: 'ask a grown-up' }, 403);
    if (body.kind === 'member') {
      const t = fam.members.find((x) => x.id === body.memberId && x.kind === 'person' && !x.uid);
      if (!t) return json({ error: 'not found' }, 404);
      const email = emailOf(body.email) || t.email;
      if (!email) return json({ error: 'add their email' }, 400);
      t.email = email; await db.put(`family:${fam.fid}`, fam);
      return json({ invite: await makeInvite(db, { kind: 'member', fid: fam.fid, memberId: t.id, email, by: me.id, byName: me.name, familyName: fam.name }) });
    }
    const email = emailOf(body.email);
    if (!email) return json({ error: 'add their email' }, 400);
    return json({ invite: await makeInvite(db, { kind: 'family', fid: fam.fid, email, by: me.id, byName: me.name, familyName: fam.name, note: clean(body.note, 140) }) });
  }
  m = path.match(/^\/invites\/([a-z0-9]{12,40})(\/accept)?$/);
  if (m) {
    const inv = await db.get(`invite:${m[1]}`);
    if (!inv) return json({ error: 'this invite has expired or was already used' }, 404);
    const mine = inv.email === user.email;
    if (!m[2] && method === 'GET') return json({ invite: { kind: inv.kind, familyName: inv.familyName, byName: inv.byName, email: inv.email, forYou: mine, note: inv.note || '' } });
    if (m[2] && method === 'POST') {
      if (!mine) return json({ error: `this invite is for ${inv.email} — sign in with that Google account` }, 403);
      const fam = await db.get(`family:${inv.fid}`);
      if (!fam) return json({ error: 'that family no longer exists' }, 404);
      if (inv.kind === 'member') {
        const t = fam.members.find((x) => x.id === inv.memberId);
        if (!t) return json({ error: 'that spot was removed' }, 404);
        if (fam.members.some((x) => x.uid === user.uid)) { await db.del(`invite:${m[1]}`); return json({ family: familyOut(fam, user) }); }
        t.uid = user.uid; t.email = user.email; if (!t.avatar && user.picture) t.avatar = user.picture;
        await db.put(`family:${fam.fid}`, fam);
        if (!user.families.includes(fam.fid)) { user.families.push(fam.fid); await saveUser(); }
        await db.del(`invite:${m[1]}`);
        return json({ family: familyOut(fam, user) });
      }
      // A friend's family: theirs (new, or one they already run) connects to the inviter's.
      let own = null;
      if (body.fid) own = (await families()).find((f) => f.fid === body.fid && meIn(f)?.role === 'owner');
      if (!own) {
        const name = clean(body.familyName, 40);
        if (!name) return json({ error: 'name your family' }, 400);
        own = { fid: randomId(), name, createdBy: user.uid, createdAt: Date.now(), connections: [], members: [
          { id: randomId(6), kind: 'person', uid: user.uid, email: user.email, name: clean(body.myName || user.name, 40), relation: 'self', role: 'owner', avatar: user.picture || '', shareWith: [] },
        ] };
        user.families.push(own.fid); await saveUser();
      }
      if (!own.connections.includes(fam.fid)) own.connections.push(fam.fid);
      if (!fam.connections.includes(own.fid)) fam.connections.push(own.fid);
      await db.put(`family:${own.fid}`, own);
      await db.put(`family:${fam.fid}`, fam);
      await db.del(`invite:${m[1]}`);
      return json({ family: familyOut(own, user), connectedTo: fam.name });
    }
  }

  // ---- the feed ----
  if (path === '/feed' && method === 'GET') {
    const fams = await families();
    const mineIds = new Set(fams.map((f) => f.fid));
    const sources = [...fams.map((f) => ({ fid: f.fid, own: true }))];
    for (const f of fams) for (const c of f.connections || []) if (!mineIds.has(c) && !sources.some((s) => s.fid === c)) sources.push({ fid: c, own: false });
    const posts = [];
    for (const s of sources) {
      const ids = ((await db.get(`feed:${s.fid}`)) || []).slice(0, 40);
      const fam = s.own ? fams.find((f) => f.fid === s.fid) : await db.get(`family:${s.fid}`);
      for (const id of ids) {
        const p = await db.get(`post:${s.fid}:${id}`);
        if (!p || (!s.own && p.audience !== 'connections')) continue;
        posts.push({ ...p, familyName: fam?.name || '', own: s.own, liked: p.likes.includes(user.uid), likes: p.likes.length });
      }
    }
    posts.sort((a, b) => b.at - a.at);
    return json({ posts: posts.slice(0, 60) });
  }
  m = path.match(/^\/families\/([a-z0-9]+)\/posts$/);
  if (m && method === 'POST') {
    const fam = await loadFamily(m[1]);
    if (!fam) return json({ error: 'not found' }, 404);
    const me = meIn(fam);
    const text = clean(body.text, 2000).replace(/ {2,}/g, ' ');
    const photo = typeof body.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length < 2_500_000 ? body.photo : '';
    if (!text && !photo) return json({ error: 'write something or add a photo' }, 400);
    const post = { id: `${(1e13 - Date.now()).toString(36)}${randomId(3)}`, fid: fam.fid, by: me.id, byName: me.name, byAvatar: me.avatar || '', text, photo,
      tags: (Array.isArray(body.tags) ? body.tags : []).filter((id) => fam.members.some((x) => x.id === id)).slice(0, 10),
      tagNames: {}, audience: body.audience === 'connections' ? 'connections' : 'family', likes: [], comments: [], at: Date.now() };
    for (const id of post.tags) post.tagNames[id] = fam.members.find((x) => x.id === id).name;
    await db.put(`post:${fam.fid}:${post.id}`, post);
    await db.put(`feed:${fam.fid}`, [post.id, ...((await db.get(`feed:${fam.fid}`)) || [])].slice(0, 300));
    return json({ post: { ...post, familyName: fam.name, own: true, liked: false, likes: 0 } });
  }
  m = path.match(/^\/posts\/([a-z0-9]+)\/([a-z0-9]+)(\/like|\/comments)?$/);
  if (m) {
    const [, fid, id, action] = m;
    const p = await db.get(`post:${fid}:${id}`);
    if (!p) return json({ error: 'not found' }, 404);
    const fams = await families();
    const own = fams.find((f) => f.fid === fid);
    const viaConnection = !own && p.audience === 'connections' && fams.some((f) => (f.connections || []).includes(fid));
    if (!own && !viaConnection) return json({ error: 'not found' }, 404);
    const myName = own ? meIn(own).name : user.name;
    if (action === '/like' && method === 'POST') {
      p.likes = p.likes.includes(user.uid) ? p.likes.filter((u) => u !== user.uid) : [...p.likes, user.uid];
      await db.put(`post:${fid}:${id}`, p);
      return json({ liked: p.likes.includes(user.uid), likes: p.likes.length });
    }
    if (action === '/comments' && method === 'POST') {
      const text = clean(body.text, 500);
      if (!text) return json({ error: 'empty comment' }, 400);
      const c = { id: randomId(5), uid: user.uid, name: myName, text, at: Date.now() };
      p.comments = [...p.comments, c].slice(-200);
      await db.put(`post:${fid}:${id}`, p);
      return json({ comment: c });
    }
    if (!action && method === 'DELETE') {
      const mine = own && meIn(own).id === p.by;
      if (!(mine || (own && meIn(own).role === 'owner'))) return json({ error: 'not allowed' }, 403);
      await db.del(`post:${fid}:${id}`);
      await db.put(`feed:${fid}`, ((await db.get(`feed:${fid}`)) || []).filter((x) => x !== id));
      return json({ ok: true });
    }
  }
  return json({ error: 'not found' }, 404);
}

async function startSession(db, who) {
  let user = await db.get(`user:${who.uid}`);
  user = { ...(user || { families: [], createdAt: Date.now() }), uid: who.uid, email: who.email, name: user?.name || who.name, picture: who.picture || user?.picture || '' };
  await db.put(`user:${user.uid}`, user);
  const token = randomId(32);
  await db.put(`session:${token}`, { uid: user.uid, at: Date.now() }, SESSION_TTL);
  return { token, user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture } };
}
async function makeInvite(db, inv) {
  const code = randomId(16);
  await db.put(`invite:${code}`, { ...inv, code, at: Date.now() }, INVITE_TTL);
  return { code, email: inv.email, kind: inv.kind, expires: Date.now() + INVITE_TTL * 1000 };
}
function familyOut(fam, user) {
  const me = fam.members.find((m) => m.uid === user.uid);
  return { fid: fam.fid, name: fam.name, createdBy: fam.createdBy, me: me?.id || '', myRole: me?.role || '', connections: fam.connections || [], members: fam.members.map((m) => memberView(m, true)) };
}
