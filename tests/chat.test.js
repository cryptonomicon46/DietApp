// 💬 Chats: only grown-ups with accounts, one to one and the Grown-ups group; sending, paging,
// reactions, read receipts, unsend, and what happens when someone leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { grownUp, chatsFor, dmId, GROUP, PAGE, ChatCore, cleanMessage, ageOn } from '../server/chat.js';

test('chat: who counts as a grown-up', () => {
  const today = '2026-10-27';
  assert.equal(ageOn('2008-10-28', today), 17);
  assert.equal(ageOn('2008-10-27', today), 18);
  const p = (x) => ({ kind: 'person', uid: 'u1', relation: 'spouse', ...x });
  assert.equal(grownUp(p({}), today), true);
  assert.equal(grownUp(p({ uid: '' }), today), false, 'needs an account');
  assert.equal(grownUp({ kind: 'pet', uid: 'u1' }, today), false, 'never pets');
  assert.equal(grownUp(p({ relation: 'child' }), today), false, 'never someone added as a child');
  assert.equal(grownUp(p({ relation: 'child', born: '1990-01-01' }), today), false, "a birthday can't let a child in");
  assert.equal(grownUp(p({ relation: 'sibling', born: '2010-05-01' }), today), false, 'under 18 by birthday');
  assert.equal(grownUp(p({ relation: 'sibling', born: '2000-05-01' }), today), true);
});

test('chat: one-to-one chats, and the group from three grown-ups', () => {
  const fam = { members: [
    { id: 'aaa', kind: 'person', uid: 'ua', relation: 'self' }, { id: 'bbb', kind: 'person', uid: 'ub', relation: 'spouse' },
    { id: 'ccc', kind: 'person', uid: 'uc', relation: 'child' }, { id: 'ddd', kind: 'pet', relation: 'pet' },
  ] };
  assert.deepEqual(chatsFor(fam, fam.members[0]).map((c) => c.id), [dmId('aaa', 'bbb')], 'two grown-ups: no group');
  assert.deepEqual(chatsFor(fam, fam.members[2]), [], 'kids have no chats');
  fam.members.push({ id: 'eee', kind: 'person', uid: 'ue', relation: 'parent' });
  assert.deepEqual(chatsFor(fam, fam.members[0]).map((c) => c.id), [dmId('aaa', 'bbb'), dmId('aaa', 'eee'), GROUP]);
  assert.deepEqual(chatsFor(fam, fam.members[0], { blocked: new Set(['ub']) }).map((c) => c.id), [dmId('aaa', 'eee'), GROUP], 'blocked people drop out');
  assert.equal(dmId('bbb', 'aaa'), dmId('aaa', 'bbb'));
});

test('chat: paging, the group only from when you joined, unsend, forget', async () => {
  const m = new Map(), core = new ChatCore({ get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => { m.delete(k); } });
  const g = { id: GROUP, kind: 'group', with: ['aaa', 'bbb', 'eee'] };
  for (let i = 1; i <= PAGE + 5; i++) await core.send(g, 'aaa', { cid: `cid${String(i).padStart(6, '0')}`, t: `hi ${i}`, p: [] });
  const latest = await core.page(g, 'bbb');
  assert.equal(latest.messages.length, PAGE);
  assert.deepEqual([latest.messages[0].s, latest.messages.at(-1).s, latest.more], [6, PAGE + 5, true]);
  const older = await core.page(g, 'bbb', latest.messages[0].s);
  assert.deepEqual([older.messages.map((x) => x.s), older.more], [[1, 2, 3, 4, 5], false]);
  // The same message sent twice (a retry) is saved once.
  assert.equal((await core.send(g, 'aaa', { cid: 'cid000001', t: 'hi 1', p: [] })).dup, true);
  // Someone new joins the group: they see what's said from now on.
  const g2 = { ...g, with: [...g.with, 'fff'] };
  assert.deepEqual((await core.list([g2], 'fff'))[0].unread, 0);
  await core.send(g2, 'bbb', { t: 'welcome', p: [{ id: 'photo123', a: 1 }] });
  const fresh = await core.page(g2, 'fff');
  assert.deepEqual(fresh.messages.map((x) => x.t), ['welcome']);
  assert.equal(fresh.more, false);
  assert.equal((await core.list([g2], 'eee'))[0].unread, PAGE + 6);
  assert.equal(await core.read(g2, 'eee', 999), PAGE + 6, 'reads stop at the last message');
  assert.equal((await core.list([g2], 'eee'))[0].unread, 0);
  // Reactions: one each, the same again takes it off.
  const s = fresh.messages[0].s;
  await core.react(g2, 'aaa', s, '❤️');
  await core.react(g2, 'eee', s, '❤️');
  assert.deepEqual((await core.react(g2, 'aaa', s, '😂')).x, { '❤️': ['eee'], '😂': ['aaa'] });
  assert.deepEqual((await core.react(g2, 'aaa', s, '😂')).x, { '❤️': ['eee'] });
  // Only your own messages can be unsent; its files come back to be removed.
  assert.equal(await core.remove(g2, 'aaa', s), null);
  const gone = await core.remove(g2, 'bbb', s);
  assert.deepEqual([gone.files, gone.message.d, gone.message.t], [['photo123'], 1, null]);
  assert.equal((await core.list([g2], 'aaa'))[0].lastT, null);
  // Leaving: one-to-one chats go; with their account gone, their group messages too.
  const d = { id: dmId('aaa', 'bbb'), kind: 'dm', with: ['aaa', 'bbb'] };
  await core.send(d, 'bbb', { t: 'just us', p: [{ id: 'photo999', a: 1 }] });
  const f = await core.forget('bbb', { all: true });
  assert.deepEqual(f.files, ['photo999']);
  assert.equal((await core.page(d, 'aaa')).messages.length, 0);
  assert.equal(m.has(`m:${d.id}:0`), false);
  assert.equal((await core.page(g2, 'aaa')).messages.filter((x) => x.by === 'bbb' && !x.d).length, 0, 'their group messages are blanked');
});

test('chat: what a phone may send', () => {
  assert.equal(cleanMessage({ e2ee: true }, { t: 'plain' }), null, 'encrypted families only take sealed text');
  assert.equal(cleanMessage({ e2ee: true }, { t: 'e1:abc' }).t, 'e1:abc');
  assert.equal(cleanMessage({}, { t: '   ' }), null);
  const m = cleanMessage({}, { t: '', p: [{ id: 'abcdef12', a: 9 }, { id: 'bad id' }, { id: 'pdf12345', k: 'doc', size: 5, meta: '{"name":"a.pdf"}' }] });
  assert.deepEqual(m.p, [{ id: 'abcdef12', a: 4 }, { id: 'pdf12345', k: 'doc', size: 5, meta: '{"name":"a.pdf"}' }]);
});

test('chat: the routes — grown-ups only, sending, notifications, reactions, reads, leaving', async () => {
  const m = new Map(), sent = [];
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }, __push: async (sub, msg) => { sent.push({ to: sub.device, ...msg }); return 201; } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), kid = await signIn('kid@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const ids = {};
  for (const [token, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [kid, 'kid@example.com', 'Kid', 'child'], [mom, 'mom@example.com', 'Mom', 'parent']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    ids[name] = add.member.id;
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, token, 'POST');
  }
  await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'pet', name: 'Rex', species: 'dog' });
  for (const [t, d] of [[pat, 'pat-phone'], [mom, 'mom-phone'], [kid, 'kid-phone']]) await call('/push/subscribe', t, 'POST', { endpoint: `https://fcm.googleapis.com/fcm/send/${d}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }, device: d });
  const C = `/families/${family.fid}/chats`;

  assert.equal((await call(C, kid)).status, 403, 'kids have no chats');
  const list = await call(C, sam);
  assert.equal(list.live, false, 'the demo has no live connection');
  assert.equal(list.chats.length, 3, 'Pat, Mom and the group — no pet, no kid');
  const samMe = (await call('/me', sam)).families[0].me;
  const dm = dmId(samMe, ids.Pat);
  assert.equal((await call(`${C}/${dmId(samMe, ids.Kid)}`, sam)).status, 404);
  assert.equal((await call(`${C}/${dm}`, mom)).status, 404, "Mom can't open Sam and Pat's chat");

  const r = await call(`${C}/${dm}`, sam, 'POST', { cid: 'aaaaaaaa1', t: 'Morning! Did the dogs eat? 🐕' });
  assert.equal(r.message.s, 1);
  assert.deepEqual(sent.map((x) => [x.to, x.title, x.body]), [['pat-phone', '💬 sam', 'New message']], 'who wrote, never what');
  await call(`${C}/${GROUP}`, mom, 'POST', { t: 'Diwali menu ideas?' });
  assert.deepEqual(sent.slice(1).map((x) => [x.to, x.title]), [['pat-phone', '💬 Mom in Grown-ups']]);

  const pl = (await call(C, pat)).chats;
  assert.deepEqual(pl.map((c) => [c.id === GROUP ? 'group' : c.with.includes(samMe) ? 'sam' : 'mom', c.unread]).sort(), [['group', 1], ['mom', 0], ['sam', 1]]);
  const page = await call(`${C}/${dm}`, pat);
  assert.equal(page.messages[0].t, 'Morning! Did the dogs eat? 🐕');
  assert.equal((await call(`${C}/${dm}/react`, pat, 'POST', { s: 1, e: '💩' })).status, 400, 'only the six reactions');
  assert.deepEqual((await call(`${C}/${dm}/react`, pat, 'POST', { s: 1, e: '❤️' })).message.x, { '❤️': [ids.Pat] });
  await call(`${C}/${dm}/read`, pat, 'POST', { s: 1 });
  assert.equal((await call(`${C}/${dm}`, sam)).reads[ids.Pat], 1, 'Sam sees Pat read it');
  assert.equal((await call(`${C}/${dm}/1`, pat, 'DELETE')).status, 404, "only who wrote it can unsend it");
  assert.equal((await call(`${C}/${dm}/1`, sam, 'DELETE')).message.d, 1);

  // Pat leaves the family: the one-to-one chat with Sam goes.
  await call(`/families/${family.fid}/members/${ids.Pat}`, pat, 'DELETE');
  assert.equal([...m.keys()].some((k) => k.includes(`chat:${family.fid}:c:${dm}`)), false);
  assert.equal((await call(C, sam)).chats.length, 1, 'just Mom now (no group with two)');
});
