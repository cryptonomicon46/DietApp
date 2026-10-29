// 👔 Look on the connector: a Closet is its owner's alone (record and pictures, whatever id or
// route is tried); a Fit Check shares exactly one Look with the partner; leaving takes it all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';

async function setup() {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, raw: r.raw, ...(r.data || {}) }; };
  const bin = async (path, token, method = 'GET', bytes) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: bytes }), env, path.split('?')[0]); return { status: r.status, raw: r.raw, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const t = { sam: await signIn('sam@example.com'), pat: await signIn('pat@example.com'), mom: await signIn('mom@example.com'), kid: await signIn('kid@example.com'), ally: await signIn('ally@example.com') };
  const { family } = await call('/families', t.sam, 'POST', { name: 'Fam' });
  const id = { sam: family.members[0].id };
  for (const [who, name, relation] of [['pat', 'Pat', 'spouse'], ['mom', 'Mom', 'parent'], ['kid', 'Kid', 'child']]) {
    const add = await call(`/families/${family.fid}/members`, t.sam, 'POST', { kind: 'person', name, relation, email: `${who}@example.com` });
    id[who] = add.member.id;
    const inv = await call(`/families/${family.fid}/invites`, t.sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, t[who], 'POST');
  }
  // A friends' family, connected to this one.
  const inv = (await call(`/families/${family.fid}/invites`, t.sam, 'POST', { kind: 'family', email: 'ally@example.com' })).invite;
  await call(`/invites/${inv.code}/accept`, t.ally, 'POST', { familyName: 'Friends' });
  const other = (await call('/me', t.ally)).families.find((f) => f.fid !== family.fid);
  return { m, call, bin, t, id, F: `/families/${family.fid}`, fid: family.fid, O: `/families/${other.fid}`, ofid: other.fid };
}
const pic = (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 251));

test("a Closet is its owner's alone: the record", async () => {
  const { call, t, id, F, O } = await setup();
  const S = `${F}/members/${id.sam}/look`;
  assert.equal((await call(S, t.sam, 'PUT', { data: { items: [{ name: 'Navy blazer' }] } })).ok, true);
  assert.equal((await call(S, t.sam)).data.items[0].name, 'Navy blazer');
  for (const who of ['pat', 'mom', 'kid']) {
    assert.equal((await call(S, t[who])).status, 404, `${who} can't read it`);
    assert.equal((await call(S, t[who], 'PUT', { data: {} })).status, 404, `${who} can't write it`);
  }
  assert.equal((await call(S, t.ally)).status, 404, 'connected family');
  assert.equal((await call(`${O}/members/${id.sam}/look`, t.ally)).status, 404, 'through their own family');
  assert.equal((await call(S)).status, 401, 'signed out');
  // Two phones: an older copy can't overwrite a newer one.
  const { savedAt } = await call(S, t.sam);
  await call(S, t.sam, 'PUT', { data: { items: [] }, base: savedAt });
  assert.equal((await call(S, t.sam, 'PUT', { data: { items: [1] }, base: savedAt - 1 })).status, 409);
});

test("a Closet is its owner's alone: pictures, by any id or route", async () => {
  const { call, bin, t, id, F, O, m } = await setup();
  const I = `${F}/members/${id.sam}/look/img/abc123def4`;
  assert.equal((await bin(`${I}?size=thumb`, t.sam, 'PUT', pic(1000))).ok, true);
  assert.equal((await bin(I, t.sam, 'PUT', pic(5000))).ok, true);
  const got = await bin(`${I}?size=thumb`, t.sam);
  assert.equal(got.status, 200); assert.equal(got.raw.length, 1000);
  for (const who of ['pat', 'mom', 'kid', 'ally']) assert.equal((await bin(I, t[who])).status, 404, who);
  assert.equal((await bin(`${F}/members/${id.pat}/look/img/abc123def4`, t.pat)).status, 404, 'same id under someone else\'s Closet');
  assert.equal((await bin(`${F}/photos/abc123def4`, t.pat)).status, 404, 'the family photo route can\'t reach it');
  assert.equal((await bin(`${F}/photos/abc123def4?in=post:x`, t.ally)).status, 404);
  assert.equal((await bin(`${O}/members/${id.sam}/look/img/abc123def4`, t.ally)).status, 404);
  assert.equal((await bin(`${F}/members/${id.sam}/look/img/abc123def4`, t.pat, 'PUT', pic(10))).status, 404, 'nobody else can replace it');
  assert.equal((await bin(`${F}/members/${id.sam}/look/img/abc123def4`, t.pat, 'DELETE')).status, 404);
  assert.equal((await bin(`${F}/members/${id.sam}/look/img/x`, t.sam)).status, 404, 'bad id');
  assert.equal((await bin(I, t.sam, 'PUT', pic(2_700_000))).status, 413);
  // Deleting removes both sizes and the count.
  assert.ok([...m.keys()].some((k) => k.includes('look/') || k === 'v2:blobidx'));
  assert.equal((await bin(I, t.sam, 'DELETE')).ok, true);
  assert.equal((await bin(`${I}?size=thumb`, t.sam)).status, 404);
  assert.equal((await call(`${F}/members/${id.sam}/look`, t.sam)).status, 200);
});

test('Fit Check: one Look to the partner only; Hit; nobody else sees it', async () => {
  const { call, bin, t, id, F } = await setup();
  const FC = `${F}/fitchecks`;
  const { fitcheck } = await call(FC, t.sam, 'POST', { names: ['Navy Dinner'], msg: 'Dinner tonight — what do you think?' });
  assert.equal(fitcheck.to, id.pat);
  assert.equal(fitcheck.status, 'draft');
  assert.equal((await call(FC, t.pat)).fitchecks.length, 0, 'not until it\'s sent');
  assert.equal((await bin(`${FC}/${fitcheck.id}/img/0`, t.sam, 'PUT', pic(3000))).ok, true);
  assert.equal((await bin(`${FC}/${fitcheck.id}/img/1`, t.sam, 'PUT', pic(3000))).status, 404, 'one picture for one Look');
  assert.equal((await call(`${FC}/${fitcheck.id}/send`, t.sam, 'POST')).fitcheck.status, 'open');
  const seen = (await call(FC, t.pat)).fitchecks[0];
  assert.deepEqual([seen.names[0], seen.msg, seen.imgs], ['Navy Dinner', 'Dinner tonight — what do you think?', 1]);
  assert.equal((await bin(`${FC}/${fitcheck.id}/img/0`, t.pat)).raw.length, 3000);
  for (const who of ['mom', 'kid', 'ally']) {
    assert.equal((await call(FC, t[who])).fitchecks?.length ?? 0, 0, who);
    assert.equal((await bin(`${FC}/${fitcheck.id}/img/0`, t[who])).status, 404, who);
    assert.equal((await call(`${FC}/${fitcheck.id}/answer`, t[who], 'POST', { verdict: 'hit' })).status, 404, who);
  }
  assert.equal((await call(`${FC}/${fitcheck.id}/answer`, t.sam, 'POST', { verdict: 'hit' })).status, 403, 'not your own');
  assert.equal((await call(`${FC}/${fitcheck.id}/answer`, t.pat, 'POST', { verdict: 'a' })).status, 400);
  assert.equal((await call(`${FC}/${fitcheck.id}/answer`, t.pat, 'POST', { verdict: 'hit' })).fitcheck.verdict, 'hit');
  assert.equal((await call(FC, t.sam)).fitchecks[0].verdict, 'hit');
  assert.equal((await bin(`${FC}/${fitcheck.id}/img/0`, t.sam, 'PUT', pic(10))).status, 403, 'no changing it once sent');
});

test('Fit Check: Miss with reasons, Miss without, A vs B, delete', async () => {
  const { call, bin, t, F } = await setup();
  const FC = `${F}/fitchecks`;
  const send = async (body) => { const { fitcheck } = await call(FC, t.sam, 'POST', body); await call(`${FC}/${fitcheck.id}/send`, t.sam, 'POST'); return fitcheck.id; };
  const a = await send({ names: ['Look'] });
  assert.deepEqual((await call(`${FC}/${a}/answer`, t.pat, 'POST', { verdict: 'miss', reasons: ['shoes', 'colors', 'nonsense', 'Sam is <b>'] })).fitcheck.reasons, ['shoes', 'colors']);
  const b = await send({ names: ['Look'] });
  assert.deepEqual((await call(`${FC}/${b}/answer`, t.pat, 'POST', { verdict: 'miss' })).fitcheck.reasons, [], 'just Miss');
  const ab = await call(FC, t.sam, 'POST', { kind: 'ab', names: ['Navy Dinner', 'Charcoal Dinner'] });
  for (const n of [0, 1]) assert.equal((await bin(`${FC}/${ab.fitcheck.id}/img/${n}`, t.sam, 'PUT', pic(100))).ok, true);
  await call(`${FC}/${ab.fitcheck.id}/send`, t.sam, 'POST');
  assert.equal((await call(`${FC}/${ab.fitcheck.id}/answer`, t.pat, 'POST', { verdict: 'hit' })).status, 400, 'A, B or neither');
  assert.equal((await call(`${FC}/${ab.fitcheck.id}/answer`, t.pat, 'POST', { verdict: 'neither' })).fitcheck.verdict, 'neither');
  assert.equal((await call(`${FC}/${a}`, t.pat, 'DELETE')).status, 403, 'only whoever asked');
  assert.equal((await call(`${FC}/${a}`, t.sam, 'DELETE')).ok, true);
  assert.equal((await call(FC, t.pat)).fitchecks.some((f) => f.id === a), false);
});

test('no partner, no Fit Check', async () => {
  const { call, t, F } = await setup();
  assert.equal((await call(`${F}/fitchecks`, t.mom, 'POST', { names: ['Look'] })).status, 400);
});

test('leaving the family: their Closet, pictures and Fit Checks go; they can\'t reach anything', async () => {
  const { call, bin, t, id, F, m } = await setup();
  await call(`${F}/members/${id.pat}/look`, t.pat, 'PUT', { data: { items: [] } });
  await bin(`${F}/members/${id.pat}/look/img/patpic0001`, t.pat, 'PUT', pic(100));
  const { fitcheck } = await call(`${F}/fitchecks`, t.sam, 'POST', { names: ['Look'] });
  await bin(`${F}/fitchecks/${fitcheck.id}/img/0`, t.sam, 'PUT', pic(100));
  await call(`${F}/fitchecks/${fitcheck.id}/send`, t.sam, 'POST');
  assert.equal((await call(`${F}/leave`, t.pat, 'POST')).ok, true);
  assert.equal((await call(`${F}/fitchecks`, t.pat)).status, 404);
  assert.equal((await bin(`${F}/fitchecks/${fitcheck.id}/img/0`, t.pat)).status, 404);
  assert.equal((await call(`${F}/fitchecks`, t.sam)).fitchecks.length, 0, 'checks with them are gone');
  const keys = [...m.keys()].join(' ');
  assert.ok(!keys.includes(`look:`) || !keys.includes(`:${id.pat}`), 'their record');
  const idx = JSON.parse(m.get('blobidx') || m.get('v2:blobidx') || '{}');
  assert.ok(!Object.keys(idx).some((k) => k.includes(`/look/${id.pat}/`) || k.includes(`/fc/${fitcheck.id}`)), 'their pictures and the check\'s picture');
});
