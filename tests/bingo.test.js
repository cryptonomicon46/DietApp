// 🎲 Show bingo: card sets from anywhere, a card per player, bingo on a full line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { parseSquares, makeCard, bingoLines, FREE } from '../server/bingo.js';

const thirty = Array.from({ length: 30 }, (_, i) => `Moment number ${i + 1}`);

test('squares come from pasted text, chatbot lists or JSON files', () => {
  assert.deepEqual(parseSquares('1. Someone cries\n- “I love you” too soon\n• Slow-motion walk\n\n[ ] Dramatic exit\nSquares:'), ['Someone cries', '“I love you” too soon', 'Slow-motion walk', 'Dramatic exit']);
  assert.deepEqual(parseSquares(JSON.stringify(['a b', 'a b', 'c d'])), ['a b', 'c d']);
  assert.deepEqual(parseSquares('"Quoted whole square",\n"Another one"'), ['Quoted whole square', 'Another one']);
  assert.deepEqual(parseSquares(JSON.stringify({ squares: [{ text: 'x y' }] })), ['x y']);
  assert.equal(parseSquares(thirty.join(', ')).length, 30, 'one long comma-separated line');
});

test('each card has 24 different squares around a free middle; lines include the middle', () => {
  const card = makeCard(30);
  assert.equal(card.length, 25);
  assert.equal(card[FREE], -1);
  assert.equal(new Set(card.filter((i) => i >= 0)).size, 24);
  assert.throws(() => makeCard(20), /at least 24/);
  const marks = Array(25).fill(false);
  assert.equal(bingoLines(marks).length, 0);
  for (const i of [10, 11, 13, 14]) marks[i] = true; // the middle row, free square in the middle
  assert.equal(bingoLines(marks).length, 1);
  for (const i of [0, 6, 18, 24]) marks[i] = true; // and a diagonal
  assert.equal(bingoLines(marks).length, 2);
});

test('a game: a set, everyone\'s own card, bingo goes on the feed once, nobody outside sees it', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), out = await signIn('out@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const B = `/families/${family.fid}/bingo`;

  assert.equal((await call(`${B}/packs`, sam, 'POST', { title: 'Show', text: 'a\nb' })).status, 400, 'too few squares');
  const { pack } = await call(`${B}/packs`, sam, 'POST', { title: 'Reality Show', text: thirty.join('\n') });
  assert.equal(pack.count, 30);
  const gen = await call(`${B}/generate`, sam, 'POST', { show: 'Reality Show' });
  assert.equal(gen.status, 501);
  assert.match(gen.prompt, /Reality Show/, 'without Claude you get a prompt to use anywhere');

  const { game } = await call(`${B}/games`, pat, 'POST', { packId: pack.id });
  const samCard = await call(`${B}/games/${game.id}`, sam);
  const patCard = await call(`${B}/games/${game.id}`, pat);
  assert.notDeepEqual(samCard.card.squares, patCard.card.squares, 'shuffled per player');
  assert.equal(samCard.card.squares[12], '');
  assert.equal((await call(`${B}/games/${game.id}`, out)).status, 404);
  assert.equal((await call(B, out)).status, 404);

  let r;
  for (const i of [10, 11, 13]) r = await call(`${B}/games/${game.id}/mark`, sam, 'POST', { i });
  assert.equal(r.bingo, null);
  r = await call(`${B}/games/${game.id}/mark`, sam, 'POST', { i: 14 });
  assert.deepEqual(r.bingo, { first: true });
  assert.equal(r.game.winners[0].name, 'sam');
  assert.equal(r.players.find((p) => p.name === 'Pat').marked, 0);
  // Unmark and mark again: still one win, one post.
  await call(`${B}/games/${game.id}/mark`, sam, 'POST', { i: 14 });
  assert.equal((await call(`${B}/games/${game.id}/mark`, sam, 'POST', { i: 14 })).bingo, null);
  const feed = await call('/feed', pat);
  assert.equal(feed.posts.filter((p) => /BINGO/.test(p.text)).length, 1);
  assert.equal((await call(`${B}/games/${game.id}/mark`, sam, 'POST', { i: 12 })).status, 400, 'the free square is always on');

  // The family's creator (or whoever started it) can end it; then nobody can mark.
  assert.equal((await call(`${B}/games/${game.id}/end`, sam, 'POST')).status, 200);
  assert.equal((await call(`${B}/games/${game.id}/mark`, pat, 'POST', { i: 0 })).status, 400);
});
