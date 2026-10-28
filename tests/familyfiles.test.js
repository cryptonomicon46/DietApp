// 📎 Dog documents and adoption photos (2.0 Phase 2): signed in, they're locked with the family key
// and kept in the family's file store — never under a household code. Files shared before through
// a code are still read there, and a phone without an account that still shares that way keeps it.
import test from 'node:test';
import assert from 'node:assert/strict';

const ls = new Map();
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k), key: () => null, get length() { return ls.size; } };
const { useKeyStore, newKey, makeCheck, openBytes } = await import('../family/crypto.js');
const K = newKey();
useKeyStore({ get: async () => ({ fam1: K }), set: async () => {} });
const { uploadFile, getFile, deleteFile } = await import('../js/dogs.js');

const asked = [], stored = new Map();
globalThis.fetch = async (u, o = {}) => {
  const url = new URL(String(u)), method = o.method || 'GET';
  asked.push(`${method} ${url.pathname}${url.search}`);
  if (method === 'PUT') { stored.set(url.pathname, new Uint8Array(await new Response(o.body).arrayBuffer())); return new Response('{"ok":true}'); }
  if (method === 'DELETE') { stored.delete(url.pathname); return new Response('{}'); }
  const b = stored.get(url.pathname);
  return b ? new Response(b) : new Response('{}', { status: 404 });
};
const signIn = async () => {
  ls.set('fam.token.live', 'tok');
  ls.set('lp.g.account', JSON.stringify({ fid: 'fam1', me: 'm1', e2ee: true, keyCheck: await makeCheck(K) }));
};
const pdf = new Blob([new TextEncoder().encode('%PDF-1.4 vaccine record')], { type: 'application/pdf' });

test('signed in: a dog document goes to the family store, locked, and comes back', async () => {
  await signIn();
  ls.set('lp.g.sync', JSON.stringify({ url: 'https://c.test', code: 'oldoldoldold' })); // a phone that used a code before
  asked.length = 0;
  assert.equal(await uploadFile('doc1234567', pdf), true);
  assert.deepEqual(asked, ['PUT /v2/families/fam1/photos/doc1234567?size=doc']);
  const kept = stored.get('/v2/families/fam1/photos/doc1234567');
  assert.ok(!new TextDecoder().decode(kept).includes('vaccine'), 'only locked bytes leave the phone');
  assert.equal(new TextDecoder().decode(await openBytes(K, kept)), '%PDF-1.4 vaccine record');
  const back = await getFile('doc1234567', 'application/pdf');
  assert.equal(back.type, 'application/pdf');
  assert.equal(await back.text(), '%PDF-1.4 vaccine record');
  await deleteFile('doc1234567');
  assert.ok(!stored.has('/v2/families/fam1/photos/doc1234567'));
  assert.ok(!asked.some((x) => /\/household\/.*PUT|PUT \/household/.test(x)), 'nothing is uploaded under a household code');
});

test('a file shared before through a household code is still read there', async () => {
  await signIn();
  stored.set('/household/oldoldoldold/file/olddoc0001', new TextEncoder().encode('old photo'));
  assert.equal(await (await getFile('olddoc0001', 'image/jpeg')).text(), 'old photo');
});

test('not signed in: no household code means nothing is uploaded anywhere', async () => {
  ls.clear();
  asked.length = 0;
  assert.equal(await uploadFile('doc7654321', pdf), false);
  assert.deepEqual(asked, []);
});
