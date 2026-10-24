// 📸 A post sent twice (a retry, a second tap) is saved once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

test('the same post sent again comes back as the one already saved', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const P = `/families/${family.fid}/posts`;
  const a = await call(P, token, 'POST', { text: 'Walkies!', cid: 'abc123def456' });
  const b = await call(P, token, 'POST', { text: 'Walkies!', cid: 'abc123def456' });
  assert.equal(b.dup, true);
  assert.equal(a.post.id, b.post.id);
  assert.equal((await call(P, token)).posts.length, 1, 'saved once');
  await call(P, token, 'POST', { text: 'Walkies!', cid: 'zzz999yyy888' });
  await call(P, token, 'POST', { text: 'No id: a new post every time' });
  assert.equal((await call(P, token)).posts.length, 3);
});
