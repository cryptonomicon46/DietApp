// 🔎 Thread search runs on the phone over unlocked threads in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchThreads, snippet } from '../family/search.js';

const threads = [
  { id: 'a', title: 'AAA membership', body: 'Renews in March. Card is in the glovebox.', replies: [], lastAt: 1 },
  { id: 'b', title: 'Anniversary dinner', body: 'Ideas for the restaurant', replies: [{ name: 'Pat', text: 'What about the AAA discount?' }], lastAt: 2 },
  { id: 'c', title: 'Locked', body: '🔒', replies: [], lastAt: 3 },
  { id: 'd', title: 'Dog insurance', body: 'x', docs: [{ name: 'Policy Café.pdf' }], shots: [{ cap: 'Premiums table' }], replies: [], lastAt: 4 },
];

test('title matches first, then write-ups and replies; every word must match', () => {
  const r = searchThreads('aaa', threads);
  assert.deepEqual(r.map((x) => [x.thread.id, x.where]), [['a', 'title'], ['b', 'reply']]);
  assert.equal(r[1].by, 'Pat');
  assert.deepEqual(searchThreads('aaa glovebox', threads).map((x) => x.thread.id), ['a']);
  assert.deepEqual(searchThreads('anniversary', threads).map((x) => x.thread.id), ['b']);
  assert.deepEqual(searchThreads('cafe', threads).map((x) => [x.thread.id, x.where]), [['d', 'pdf']], 'accents ignored, PDF names searched');
  assert.deepEqual(searchThreads('premiums', threads).map((x) => x.where), ['caption']);
  assert.deepEqual(searchThreads('🔒', threads), [], "locked text isn't searched");
  assert.deepEqual(searchThreads('  ', threads), []);
});

test('the snippet shows the text around the first match', () => {
  const s = snippet(`${'word '.repeat(40)}the glovebox is here ${'tail '.repeat(40)}`, ['glovebox']);
  assert.match(s, /^….*glovebox.*…$/);
  assert.ok(s.length < 130);
});
