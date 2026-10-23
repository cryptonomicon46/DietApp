import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { verifyGoogle, TERMS_VERSION } from '../server/family.js';

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) }; };
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// A stand-in for Google: our own RSA key signs ID tokens the connector verifies.
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1' };
async function idToken(claims, kid = 'k1') {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid })), p = b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-1', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const env = { APP_ORIGIN: 'https://example.github.io/DietApp/', HOUSEHOLD: kv(), GOOGLE_CLIENT_ID: 'client-1', __googleKeys: [pub] };
const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await worker.fetch(new Request(`https://w.test/v2${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, ...(await res.json()) };
};
const signIn = async (sub, email, name, consent = true) => {
  const { token } = await api('/auth/google', { method: 'POST', body: { credential: await idToken({ sub, email, name }) } });
  if (consent) await api('/account/consent', { token, method: 'POST', body: { version: TERMS_VERSION, age13: true } });
  return token;
};

test('Google ID tokens: signature, audience and expiry are checked', async () => {
  const ok = await verifyGoogle(await idToken({ sub: '1', email: 'A@x.com' }), 'client-1', [pub]);
  assert.equal(ok.email, 'a@x.com');
  await assert.rejects(verifyGoogle(await idToken({ sub: '1', email: 'a@x.com', aud: 'other' }), 'client-1', [pub]), /another app/);
  await assert.rejects(verifyGoogle(await idToken({ sub: '1', email: 'a@x.com', exp: 1 }), 'client-1', [pub]), /expired/);
  const t = await idToken({ sub: '1', email: 'a@x.com' });
  await assert.rejects(verifyGoogle(`${t.split('.').slice(0, 2).join('.')}.${b64url(new Uint8Array(256))}`, 'client-1', [pub]), /signature/);
  assert.equal((await api('/me')).status, 401);
  assert.equal((await api('/auth/demo', { method: 'POST', body: { email: 'x@y.z' } })).status, 404, 'no demo sign-in on the real connector');
});

test('a family: create, invite a partner by email, add pets, share diet only by choice', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const { family } = await api('/families', { token: me, method: 'POST', body: { name: 'OurPawMily' } });
  assert.equal(family.members[0].role, 'owner');
  const add = await api(`/families/${family.fid}/members`, { token: me, method: 'POST', body: { kind: 'person', name: 'Partner', relation: 'spouse', email: 'partner@gmail.com' } });
  assert.equal(add.member.status, 'invited');
  const dog = await api(`/families/${family.fid}/members`, { token: me, method: 'POST', body: { kind: 'pet', name: 'Dog One', species: 'dog', breed: 'Mix' } });
  // Bring the partner's data over before they join; only the one who added them can.
  assert.equal((await api(`/families/${family.fid}/members/${add.member.id}/data`, { token: me, method: 'PUT', body: { data: { weights: [{ date: '2026-10-01', weight: 140 }] } } })).status, 200);

  // Someone else can't use the invite; the partner's Google account can.
  const stranger = await signIn('300', 'stranger@gmail.com', 'S');
  assert.equal((await api(`/invites/${add.invite.code}/accept`, { token: stranger, method: 'POST' })).status, 403);
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  assert.equal((await api(`/invites/${add.invite.code}`, { token: partner })).invite.forYou, true);
  const joined = await api(`/invites/${add.invite.code}/accept`, { token: partner, method: 'POST' });
  assert.equal(joined.family.me, add.member.id);
  assert.equal((await api(`/invites/${add.invite.code}/accept`, { token: partner, method: 'POST' })).status, 404, 'one use');
  assert.equal((await api(`/families/${family.fid}`, { token: stranger })).status, 404, 'outsiders see nothing');

  // Their data is theirs now: hidden from me until they share it.
  const theirs = `/families/${family.fid}/members/${add.member.id}/data`;
  assert.equal((await api(theirs, { token: partner })).data.weights[0].weight, 140);
  assert.equal((await api(theirs, { token: me })).status, 403);
  assert.equal((await api(`/families/${family.fid}/members/${add.member.id}`, { token: me, method: 'PATCH', body: { shareWith: [family.me] } })).status, 403, "can't share on their behalf");
  await api(`/families/${family.fid}/members/${add.member.id}`, { token: partner, method: 'PATCH', body: { shareWith: [family.me] } });
  assert.equal((await api(theirs, { token: me })).status, 200);
  // Pets are everyone's.
  assert.equal((await api(`/families/${family.fid}/members/${dog.member.id}/data`, { token: partner, method: 'PUT', body: { data: { fed: ['2026-10-20'] } } })).status, 200);
});

test('feed: family posts, friends\' families via invite, likes and comments', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const fam = (await api('/me', { token: me })).families[0];
  const p1 = await api(`/families/${fam.fid}/posts`, { token: me, method: 'POST', body: { text: 'Park day!', tags: [fam.members[2].id] } });
  const p2 = await api(`/families/${fam.fid}/posts`, { token: me, method: 'POST', body: { text: 'For friends too', audience: 'connections' } });
  assert.equal(p1.post.tagNames[fam.members[2].id], 'Dog One');
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  const feed = await api('/feed', { token: partner });
  assert.deepEqual(feed.posts.map((p) => p.text), ['For friends too', 'Park day!']);
  await api(`/posts/${fam.fid}/${p1.post.id}/like`, { token: partner, method: 'POST' });
  await api(`/posts/${fam.fid}/${p1.post.id}/comments`, { token: partner, method: 'POST', body: { text: 'So cute' } });
  const again = (await api('/feed', { token: me })).posts.find((p) => p.id === p1.post.id);
  assert.equal(again.likes, 1); assert.equal(again.comments[0].text, 'So cute');

  // The partner invites a friend; the friend's new family connects and sees only "connections" posts.
  const partnerFam = (await api('/me', { token: partner })).families[0];
  const inv = await api(`/families/${partnerFam.fid}/invites`, { token: partner, method: 'POST', body: { kind: 'family', email: 'friend@gmail.com' } });
  const friend = await signIn('400', 'friend@gmail.com', 'Friend');
  const acc = await api(`/invites/${inv.invite.code}/accept`, { token: friend, method: 'POST', body: { familyName: 'The Friends' } });
  assert.equal(acc.family.name, 'The Friends');
  const ff = await api('/feed', { token: friend });
  assert.deepEqual(ff.posts.map((p) => p.text), ['For friends too']);
  assert.equal((await api(`/posts/${fam.fid}/${p1.post.id}/like`, { token: friend, method: 'POST' })).status, 404, 'family-only posts stay in the family');
  const view = await api(`/families/${acc.family.fid}`, { token: friend });
  assert.equal(view.connected[0].name, 'OurPawMily');
  assert.equal(view.connected[0].members[0].email, undefined, "connected families don't see emails");
  assert.equal((await api(`/posts/${fam.fid}/${p2.post.id}`, { token: friend, method: 'DELETE' })).status, 403);
  assert.equal((await api(`/posts/${fam.fid}/${p2.post.id}`, { token: me, method: 'DELETE' })).status, 200);
});

test('bringing the current app over: you, your partner and the dogs, without duplicates', async () => {
  const { planImport } = await import('../family/migrate.js');
  const legacy = { owner: 'sandman', people: [
    { legacyId: 'sandman', name: 'Me', data: { weights: [1] } },
    { legacyId: 'amani', name: 'Partner', data: { mealLog: {} } },
  ], pets: [{ legacyId: 'dog-a', name: 'Dog One', breed: 'Mix', born: '2020-01-01', emoji: '🐶', data: { profile: {} } }] };
  const fresh = { me: 'm1', members: [{ id: 'm1', kind: 'person', name: 'Me', legacyId: '' }] };
  assert.deepEqual(planImport(legacy, fresh).map((o) => `${o.op}:${o.name || o.legacyId}`), ['tag:sandman', 'data:Me', 'add:Partner', 'add:Dog One']);
  const done = { me: 'm1', members: [{ id: 'm1', kind: 'person', name: 'Me', legacyId: 'sandman' }, { id: 'm2', kind: 'person', name: 'Partner', legacyId: 'amani' }, { id: 'm3', kind: 'pet', name: 'Dog One', legacyId: 'dog-a' }] };
  assert.deepEqual(planImport(legacy, done).map((o) => o.op), ['data', 'data', 'data'], 'running it again only refreshes the data');
  // On the partner's phone (after they joined), only their own data and the dogs are copied.
  const theirs = { me: 'm2', members: done.members.map((m) => ({ ...m, status: m.kind === 'person' ? 'active' : 'managed' })) };
  assert.deepEqual(planImport({ ...legacy, owner: 'amani' }, theirs).map((o) => `${o.op}:${o.memberId}`), ['data:m2', 'data:m3']);
});

test('terms first: 13+ and accepting the terms before anything else', async () => {
  const t = await signIn('500', 'new@gmail.com', 'New', false);
  assert.equal((await api('/me', { token: t })).user.needsConsent, true);
  assert.equal((await api('/families', { token: t, method: 'POST', body: { name: 'X' } })).status, 403);
  assert.equal((await api('/account/consent', { token: t, method: 'POST', body: { version: TERMS_VERSION } })).status, 400, 'must confirm 13+');
  await api('/account/consent', { token: t, method: 'POST', body: { version: TERMS_VERSION, age13: true } });
  assert.equal((await api('/families', { token: t, method: 'POST', body: { name: 'X' } })).status, 200);
});

test('report, hide and block on posts; dog-care log', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  const fam = (await api('/me', { token: me })).families[0];
  const { post } = await api(`/families/${fam.fid}/posts`, { token: partner, method: 'POST', body: { text: 'hello' } });
  await api(`/posts/${fam.fid}/${post.id}/report`, { token: me, method: 'POST', body: { reason: 'test' } });
  assert.ok(!(await api('/feed', { token: me })).posts.some((p) => p.id === post.id), 'hidden for the reporter');
  assert.equal((await api('/feed', { token: partner })).posts.find((p) => p.id === post.id).reported, 0, 'not the creator');
  const { post: p2 } = await api(`/families/${fam.fid}/posts`, { token: partner, method: 'POST', body: { text: 'again' } });
  await api(`/posts/${fam.fid}/${p2.id}/block`, { token: me, method: 'POST' });
  assert.ok(!(await api('/feed', { token: me })).posts.some((p) => p.byUid === 'g200'), "blocked person's posts are gone");
  assert.equal((await api('/me', { token: me })).user.blocked[0].name, 'Partner');
  await api('/account/blocks/g200', { token: me, method: 'DELETE' });

  const dog = fam.members.find((m) => m.kind === 'pet');
  const { entry } = await api(`/families/${fam.fid}/care`, { token: partner, method: 'POST', body: { kind: 'breakfast', date: '2026-10-21', pets: [dog.id] } });
  await api(`/families/${fam.fid}/care`, { token: me, method: 'POST', body: { kind: 'walk', date: '2026-10-21', by: 'both' } });
  const day = (await api(`/families/${fam.fid}/care?to=2026-10-21&days=2`, { token: me })).days;
  assert.deepEqual(day['2026-10-21'].map((e) => `${e.kind}:${e.byName}`), ['breakfast:Partner', 'walk:Me Person & Partner']);
  assert.deepEqual(day['2026-10-20'], []);
  assert.equal((await api(`/families/${fam.fid}/care/2026-10-21/${entry.id}`, { token: me, method: 'DELETE' })).status, 200, "the creator can undo anyone's");
});

test('export and delete an account: data, posts, comments and sign-ins go; the family passes on', async () => {
  const me = await signIn('100', 'me@gmail.com', 'Me Person');
  const partner = await signIn('200', 'partner@gmail.com', 'Partner');
  const fam = (await api('/me', { token: me })).families[0];
  const { post } = await api(`/families/${fam.fid}/posts`, { token: partner, method: 'POST', body: { text: 'mine' } });
  const { post: other } = await api(`/families/${fam.fid}/posts`, { token: me, method: 'POST', body: { text: 'theirs' } });
  await api(`/posts/${fam.fid}/${other.id}/comments`, { token: partner, method: 'POST', body: { text: 'a comment' } });
  await api(`/families/${fam.fid}/care`, { token: partner, method: 'POST', body: { kind: 'walk', date: '2026-10-22' } });
  const ex = await api('/account/export', { token: partner });
  assert.equal(ex.account.email, 'partner@gmail.com');
  assert.ok(ex.families[0].posts.some((p) => p.text === 'mine'));
  assert.ok(ex.families[0].comments.some((c) => c.text === 'a comment'));
  assert.equal(ex.families[0].myData.weights[0].weight, 140);

  assert.equal((await api('/account/delete', { token: partner, method: 'POST', body: {} })).status, 400, 'needs DELETE typed');
  const del = await api('/account/delete', { token: partner, method: 'POST', body: { confirm: 'DELETE' } });
  assert.deepEqual(del.familiesLeft, ['OurPawMily']);
  assert.equal((await api('/me', { token: partner })).status, 401, 'signed out everywhere');
  const after = await api(`/families/${fam.fid}`, { token: me });
  assert.ok(!after.family.members.some((m) => m.email === 'partner@gmail.com'));
  const feed = (await api('/feed', { token: me })).posts;
  assert.ok(!feed.some((p) => p.text === 'mine'));
  assert.equal(feed.find((p) => p.id === other.id).comments.length, 0);
  assert.equal(await env.HOUSEHOLD.get('v2:user:g200'), null);
  const care = (await api(`/families/${fam.fid}/care?to=2026-10-22`, { token: me })).days['2026-10-22'];
  assert.equal(care[0].byName, 'Former member', 'the care log stays, without their name');

  // The creator deleting their account with nobody else grown-up there deletes the family.
  const del2 = await api('/account/delete', { token: me, method: 'POST', body: { confirm: 'DELETE' } });
  assert.deepEqual(del2.familiesDeleted, ['OurPawMily']);
  assert.equal(await env.HOUSEHOLD.get(`v2:family:${fam.fid}`), null);
  assert.equal(await env.HOUSEHOLD.get(`v2:feed:${fam.fid}`), null);
  assert.equal(await env.HOUSEHOLD.get(`v2:careidx:${fam.fid}`), null);
});

test("the current app's dog duties become one care log", async () => {
  const { careFromLegacy } = await import('../family/migrate.js');
  const people = [
    { legacyId: 'a', data: { dogFed: { '2026-10-20:breakfast': { at: 10 }, '2026-10-20:dinner': { at: 50 } }, dogWalked: { '2026-10-20': [{ at: 20 }, { at: 30, who: 'both' }] }, dogTreats: { '2026-10-20': { at: 5, on: true } } } },
    { legacyId: 'b', data: { dogFed: { '2026-10-20:breakfast': { at: 12 } }, dogPark: { '2026-10-20': [40] }, dogTreats: { '2026-10-20': { at: 60, on: false } } } },
  ];
  const ids = { a: 'm1', b: 'm2' };
  const log = careFromLegacy(people, (id) => ids[id]);
  assert.deepEqual(log.map((e) => `${e.kind}:${e.by.join('+')}`), ['breakfast:m1', 'walk:m1', 'walk:m1+m2', 'park:m2', 'dinner:m1'], 'first feeding counts; a treat later undone is dropped');
});

test('chores race: points by effort, streaks, ties, and the Gold Card once a month ends', async () => {
  const { choresRace, POINTS } = await import('../server/family.js');
  const people = [{ id: 'a', name: 'A', uid: 'u1' }, { id: 'b', name: 'B', uid: 'u2' }];
  const logs = {
    '2026-10-01': [{ kind: 'laundry', by: ['a'] }, { kind: 'walk', by: ['a', 'b'] }],
    '2026-10-02': [{ kind: 'groceries', by: ['b'] }, { kind: 'trash', by: ['b'] }],
    '2026-10-03': [{ kind: 'cleaning', by: ['a'] }],
  };
  const r = choresRace(logs, people);
  assert.equal(POINTS.cleaning, 4);
  assert.deepEqual(r.board.map((x) => `${x.name}:${x.points}`), ['A:9', 'B:6']);
  assert.deepEqual(r.leaders, ['a']);
  assert.equal(r.board[1].streak, 2, 'B did something on the 1st and 2nd, then the 3rd is the last day and B skipped it');
  assert.deepEqual(choresRace({ '2026-10-01': [{ kind: 'walk', by: ['a', 'b'] }] }, people).leaders, ['a', 'b'], 'a tie shares the card');

  const me = await signIn('600', 'gold@gmail.com', 'Gold');
  const { family } = await api('/families', { token: me, method: 'POST', body: { name: 'Golds' } });
  await api(`/families/${family.fid}`, { token: me, method: 'PATCH', body: { goldPrize: 'Picks date night' } });
  await api(`/families/${family.fid}/care`, { token: me, method: 'POST', body: { kind: 'laundry', date: '2026-09-30' } });
  const now = await api(`/families/${family.fid}/chores?month=2026-09&today=2026-09-30`, { token: me });
  assert.equal(now.ended, false); assert.equal(now.gold.length, 0);
  const later = await api(`/families/${family.fid}/chores?month=2026-09&today=2026-10-01`, { token: me });
  assert.equal(later.gold[0].winners[0].name, 'Gold');
  assert.equal(later.gold[0].prize, 'Picks date night');
  const again = await api(`/families/${family.fid}/chores?month=2026-09&today=2026-10-02`, { token: me });
  assert.equal(again.gold.length, 1, 'crowned once');
});

test("privacy with friends' families: kids private by default, pets shareable; help requests", async () => {
  const a = await signIn('700', 'pa@gmail.com', 'Parent A');
  const { family: fa } = await api('/families', { token: a, method: 'POST', body: { name: 'Fam A' } });
  const kid = (await api(`/families/${fa.fid}/members`, { token: a, method: 'POST', body: { kind: 'person', name: 'Kiddo', relation: 'child' } })).member;
  const pup = (await api(`/families/${fa.fid}/members`, { token: a, method: 'POST', body: { kind: 'pet', name: 'Pup' } })).member;
  const inv = await api(`/families/${fa.fid}/invites`, { token: a, method: 'POST', body: { kind: 'family', email: 'pb@gmail.com' } });
  const b = await signIn('701', 'pb@gmail.com', 'Parent B');
  const { family: fb } = await api(`/invites/${inv.invite.code}/accept`, { token: b, method: 'POST', body: { familyName: 'Fam B' } });

  // What B sees of A: no kid by default; the pup, yes.
  let seen = (await api(`/families/${fb.fid}`, { token: b })).connected[0].members.map((x) => x.name);
  assert.ok(!seen.includes('Kiddo')); assert.ok(seen.includes('Pup'));
  const kidPost = await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'First day of school!', tags: [kid.id], audience: 'connections' } });
  assert.equal(kidPost.post.audience, 'family'); assert.match(kidPost.note, /private/);
  await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'Dog park!', tags: [pup.id], audience: 'connections' } });
  assert.deepEqual((await api('/feed', { token: b })).posts.map((x) => x.text), ['Dog park!']);
  // A keeps pets private too: the pup and the dog-park post disappear for B.
  await api(`/families/${fa.fid}`, { token: a, method: 'PATCH', body: { share: { kids: false, pets: false } } });
  seen = (await api(`/families/${fb.fid}`, { token: b })).connected[0].members.map((x) => x.name);
  assert.ok(!seen.includes('Pup'));
  assert.deepEqual((await api('/feed', { token: b })).posts.map((x) => x.text), []);

  // 🙋 A asks for pet sitting; B offers; A picks B.
  assert.equal((await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { help: { type: 'petsit' }, audience: 'connections' } })).status, 400, 'needs a day');
  const req = await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'Away for a wedding', help: { type: 'petsit', from: '2026-11-07', to: '2026-11-08' }, audience: 'connections' } });
  const r = (await api('/feed', { token: b })).posts.find((x) => x.help);
  assert.equal(r.help.type, 'petsit');
  const off = await api(`/posts/${fa.fid}/${req.post.id}/offer`, { token: b, method: 'POST', body: { msg: 'Happy to!' } });
  assert.equal(off.help.offered, true); assert.deepEqual(off.help.offers, [], "helpers don't see each other");
  const mineView = (await api('/feed', { token: a })).posts.find((x) => x.id === req.post.id);
  assert.equal(mineView.help.offers[0].family, 'Fam B');
  const offerId = mineView.help.offers[0].id;
  assert.equal((await api(`/posts/${fa.fid}/${req.post.id}/accept`, { token: b, method: 'POST', body: { offer: offerId } })).status, 403);
  const acc = await api(`/posts/${fa.fid}/${req.post.id}/accept`, { token: a, method: 'POST', body: { offer: offerId } });
  assert.equal(acc.help.status, 'filled'); assert.equal(acc.help.helper.name, 'Parent B');
});

test('no leaks: a friend\'s family and a stranger never see emails, account ids, private kids or diet data', async () => {
  const a = await signIn('800', 'secret-a@gmail.com', 'Ana');
  const { family: fa } = await api('/families', { token: a, method: 'POST', body: { name: 'Leak A' } });
  const partner = await api(`/families/${fa.fid}/members`, { token: a, method: 'POST', body: { kind: 'person', name: 'Paz', relation: 'spouse', email: 'secret-p@gmail.com' } });
  const kid = (await api(`/families/${fa.fid}/members`, { token: a, method: 'POST', body: { kind: 'person', name: 'Kidzilla', relation: 'child' } })).member;
  const pz = await signIn('801', 'secret-p@gmail.com', 'Paz');
  await api(`/invites/${partner.invite.code}/accept`, { token: pz, method: 'POST' });
  await api(`/families/${fa.fid}/members/${fa.me}/data`, { token: a, method: 'PUT', body: { data: { weights: [{ date: '2026-10-01', weight: 187.25 }] } } });
  const inv = await api(`/families/${fa.fid}/invites`, { token: a, method: 'POST', body: { kind: 'family', email: 'friend-b@gmail.com' } });
  const b = await signIn('802', 'friend-b@gmail.com', 'Bo');
  const { family: fb } = await api(`/invites/${inv.invite.code}/accept`, { token: b, method: 'POST', body: { familyName: 'Leak B' } });
  // A busy shared post: comments, likes, a tag of the kid on another, and a help request with an offer.
  const pub = await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'Shared with friends', audience: 'connections' } });
  await api(`/posts/${fa.fid}/${pub.post.id}/comments`, { token: pz, method: 'POST', body: { text: 'cute' } });
  await api(`/posts/${fa.fid}/${pub.post.id}/like`, { token: pz, method: 'POST' });
  await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'Family only' } });
  await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { text: 'Kid day', tags: [kid.id], audience: 'connections' } });
  const help = await api(`/families/${fa.fid}/posts`, { token: a, method: 'POST', body: { help: { type: 'babysit', from: '2026-11-01' }, audience: 'connections' } });
  await api(`/posts/${fa.fid}/${help.post.id}/offer`, { token: pz, method: 'POST', body: { msg: 'me!' } });

  const forbidden = ['secret-a@gmail.com', 'secret-p@gmail.com', 'g800', 'g801', 'Kidzilla', '187.25', 'Family only', 'Kid day'];
  const check = (label, obj) => { const j = JSON.stringify(obj); for (const f of forbidden) assert.ok(!j.includes(f), `${label} leaks ${f}`); };
  // What the friend's family can reach.
  check('feed', await api('/feed', { token: b }));
  check('family view', await api(`/families/${fb.fid}`, { token: b }));
  check('me', await api('/me', { token: b }));
  check('like', await api(`/posts/${fa.fid}/${pub.post.id}/like`, { token: b, method: 'POST' }));
  check('offer', await api(`/posts/${fa.fid}/${help.post.id}/offer`, { token: b, method: 'POST', body: { msg: 'also me' } }));
  for (const path of [`/families/${fa.fid}`, `/families/${fa.fid}/members/${fa.me}/data`, `/families/${fa.fid}/care?to=2026-10-01`, `/families/${fa.fid}/chores?month=2026-10&today=2026-10-02`]) {
    const r = await api(path, { token: b });
    assert.ok(r.status === 404 || r.status === 403, `friend reaches ${path}`); check(path, r);
  }
  // Inside the family, account ids still stay out.
  for (const g of ['g800', 'g801']) assert.ok(!JSON.stringify(await api(`/families/${fa.fid}`, { token: pz })).includes(g));
  assert.ok(!JSON.stringify(await api('/feed', { token: pz })).includes('g80'), 'no account ids in the family feed either');
  // A stranger sees nothing at all.
  const x = await signIn('803', 'stranger@gmail.com', 'X');
  check('stranger feed', await api('/feed', { token: x }));
  for (const path of [`/families/${fa.fid}`, `/families/${fa.fid}/members/${fa.me}/data`, `/posts/${fa.fid}/${pub.post.id}/like`]) {
    const r = await api(path, { token: x, method: path.endsWith('like') ? 'POST' : 'GET' });
    assert.equal(r.status, 404, `stranger reaches ${path}`);
  }
  assert.equal((await api('/feed')).status, 401, 'nothing without signing in');
});

test('bringing data over is checked section by section', async () => {
  const { compareData } = await import('../family/migrate.js');
  const local = { weights: [{ date: '2026-10-01', weight: 187 }], mealLog: { '2026-10-01': {} }, profile: { name: 'Me' } };
  assert.ok(compareData(local, JSON.parse(JSON.stringify(local))).every((x) => x.ok));
  const bad = compareData(local, { ...local, weights: [] });
  assert.deepEqual(bad.filter((x) => !x.ok).map((x) => x.label), ['weigh-ins']);
  assert.equal(bad.find((x) => x.key === 'mealLog').count, 1);
});
