import test from 'node:test';
import assert from 'node:assert/strict';

// Two phones in one process: each has its own localStorage, swapped in as it "acts".
function phoneStorage() {
  const st = {};
  Object.defineProperties(st, {
    getItem: { value: (k) => (Object.hasOwn(st, k) ? st[k] : null) },
    setItem: { value: (k, v) => { st[k] = String(v); } },
    removeItem: { value: (k) => { delete st[k]; } },
  });
  return st;
}
const sandmanPhone = phoneStorage();
const amaniPhone = phoneStorage();
const as = (phone) => { globalThis.localStorage = phone; };
as(sandmanPhone);

// The connector's KV, behind a fake fetch.
const kv = new Map();
globalThis.fetch = async (url, opts = {}) => {
  const key = decodeURIComponent(new URL(url).pathname.replace(/^\/household\//, '').replace(/\//g, ':'));
  const method = opts.method || 'GET';
  if (method === 'PUT') { kv.set(key, { body: await new Response(opts.body).arrayBuffer(), type: opts.headers?.['Content-Type'] }); return new Response('{}'); }
  if (method === 'DELETE') { kv.delete(key); return new Response('{}'); }
  const v = kv.get(key);
  return v ? new Response(v.body, { headers: { 'Content-Type': v.type || 'application/json' } }) : new Response('{"error":"not found"}', { status: 404 });
};
const read = (key) => JSON.parse(new TextDecoder().decode(kv.get(key).body));

const { sync } = await import('../js/sync.js');
const { profileStore, global } = await import('../js/storage.js');
const URL_ = 'https://connector.test';

test('changing the household code moves everything and locks out the old code', async () => {
  const old = 'abcdefghjkmn';
  // Both phones on the old code, with data and a shared file.
  as(amaniPhone); global.set('owner', 'amani'); global.set('sync', { url: URL_, code: old, linkedAt: 1 });
  profileStore('amani').set('notes', [{ text: 'hi from Amani' }]); await sync.push();
  as(sandmanPhone); global.set('owner', 'sandman'); global.set('sync', { url: URL_, code: old, linkedAt: 1 });
  profileStore('sandman').set('notes', [{ text: 'hi from Sandman' }]); await sync.push();
  kv.set(`${old}:file:doc123`, { body: new TextEncoder().encode('%PDF').buffer, type: 'application/pdf' });

  const { code, files } = await sync.rotate(['doc123']);
  assert.notEqual(code, old);
  assert.match(code, /^[a-z0-9]{12}$/);
  assert.equal(files, 1);
  // New code holds both people's data and the file; the old one holds nothing useful.
  assert.equal(read(`${code}:sandman`).data.notes[0].text, 'hi from Sandman');
  assert.equal(read(`${code}:amani`).data.notes[0].text, 'hi from Amani');
  assert.equal(new TextDecoder().decode(kv.get(`${code}:file:doc123`).body), '%PDF');
  assert.equal(kv.has(`${old}:file:doc123`), false);
  assert.deepEqual(read(`${old}:sandman`), { moved: true, savedAt: 0 });
  assert.deepEqual(read(`${old}:amani`), { moved: true, savedAt: 0 });
  const note = read(`${old}:link`);
  assert.equal(note.moved, true);
  assert.equal(JSON.stringify(note).includes(code), false, 'the old code never points to the new one');
  assert.equal(sync.settings().code, code);

  // Amani's phone notices, pauses sharing, and keeps her copy of Sandman's data.
  as(amaniPhone);
  profileStore('sandman').set('notes', [{ text: 'hi from Sandman' }]);
  assert.equal(await sync.pull(), true);
  assert.deepEqual(sync.settings().moved.by, 'sandman');
  assert.equal(sync.enabled(), false);
  await sync.push(); // paused: writes nothing to the old code
  assert.deepEqual(read(`${old}:amani`), { moved: true, savedAt: 0 });
  assert.equal(profileStore('sandman').get('notes', [])[0].text, 'hi from Sandman', 'nothing wiped');

  // A wrong code or the old one is refused; the new one links her back up.
  await assert.rejects(sync.join(old), /old code/);
  await assert.rejects(sync.join('zzzzzzzzzzzz'), /doesn't match/);
  assert.equal(sync.settings().code, old);
  await sync.join(code.replace(/(.{4})(?=.)/g, '$1-'));
  assert.equal(sync.settings().code, code);
  assert.equal(sync.enabled(), true);
  assert.equal(sync.settings().moved, undefined);
  assert.ok(sync.settings().changedAt);
  assert.equal(JSON.stringify(read(`${old}:link`)).includes(code), false, 'joining leaves no forwarding note');
  assert.equal(read(`${code}:amani`).data.notes[0].text, 'hi from Amani');
});
