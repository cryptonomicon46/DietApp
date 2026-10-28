// 📅 Linked calendars: the secret link travels in the request body, never in a URL (audit S1),
// and only calendar hosts are fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

test('linked calendars: POST with the link in the body; GET with ?url= is gone', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...(r.data || {}) }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const secret = 'https://p01-caldav.icloud.com/published/2/SECRET';
  assert.equal((await call(`/ics?url=${encodeURIComponent(secret)}`, token)).status, 404, 'no link in a URL');
  assert.match((await call('/ics', token, 'POST', { url: 'https://evil.example.com/cal.ics' })).error, /calendar/i, 'only calendar hosts');
  assert.equal((await call('/ics', token, 'POST', { url: 'not a link' })).status, 400);
  assert.match((await call('/ics', token, 'POST', { url: secret })).error, /live connector/, 'a calendar host passes the checks (the demo has no network)');
  assert.equal((await call('/ics', null, 'POST', { url: secret })).status, 401, 'signed in only');
});
