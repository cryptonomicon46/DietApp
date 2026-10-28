// 🔌 The family app's own server setting: never re-pointed by the trackers' sync settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serverUrl, CONNECTOR } from '../js/server.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('the built-in connector, decided once', () => {
  const s = store();
  assert.equal(serverUrl(s), CONNECTOR);
  assert.equal(s.m.get('fam.server'), 'default');
  s.m.set('lp.g.sync', JSON.stringify({ url: 'https://other.example.workers.dev', code: 'x' }));
  assert.equal(serverUrl(s), CONNECTOR, 'changing the trackers’ sharing settings later changes nothing');
});

test('a phone that used another connector before keeps it', () => {
  const s = store({ 'lp.g.sync': JSON.stringify({ url: 'https://mine.example.workers.dev/', code: 'abc' }) });
  assert.equal(serverUrl(s), 'https://mine.example.workers.dev');
  s.m.delete('lp.g.sync');
  assert.equal(serverUrl(s), 'https://mine.example.workers.dev', 'even once the old settings are gone');
  assert.equal(serverUrl(store({ 'lp.g.sync': JSON.stringify({ url: `${CONNECTOR}/` }) })), CONNECTOR);
  assert.equal(serverUrl(store({ 'lp.g.sync': JSON.stringify({ url: 'javascript:alert(1)' }) })), CONNECTOR, 'only a web address');
  assert.equal(serverUrl(store({ 'lp.g.sync': 'not json' })), CONNECTOR);
  assert.equal(serverUrl(store({ 'fam.server': 'http://localhost:8787' })), 'http://localhost:8787');
});
