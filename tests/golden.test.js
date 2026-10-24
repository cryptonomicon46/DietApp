// ⭐ Golden-day thank-you posts from the dogs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION, petNames } from '../server/family.js';
import { isGolden, dayHighlights, goldenMessage, GREETINGS } from '../server/goldenPost.js';

test('golden days and what the dogs say about them', () => {
  assert.equal(isGolden([{ kind: 'walk' }]), false);
  assert.equal(isGolden([{ kind: 'walk' }, { kind: 'park' }]), true);
  assert.equal(isGolden([{ kind: 'walk' }, { kind: 'treat' }]), true);
  assert.equal(isGolden([{ kind: 'treat' }, { kind: 'breakfast' }]), false);
  assert.equal(dayHighlights([{ kind: 'walk' }, { kind: 'walk' }]), 'two walks');
  assert.equal(dayHighlights([{ kind: 'walk' }, { kind: 'treat' }]), 'a walk and a treat');
  assert.equal(dayHighlights([{ kind: 'walk' }, { kind: 'park' }, { kind: 'treat' }]), 'a walk and the dog park, plus a treat');
  const one = goldenMessage({ pets: ['Pip'], people: ['Mom'], day: 'two walks', rnd: () => 0 });
  assert.match(one.text, /Pip/);
  assert.doesNotMatch(one.text, /\{|\bwe\b|\bour\b/i, 'one dog speaks as "I", and nothing is left unfilled');
  const two = goldenMessage({ pets: ['Pip', 'Bo'], people: ['Mom', 'Dad'], day: 'two walks', rnd: () => 0.5 });
  assert.match(two.text, /Mom & Dad/);
  assert.match(two.text, /Pip & Bo/);
  assert.ok(GREETINGS.every((g) => g.includes('{people}')), 'every note says who it thanks');
  // Recent lines aren't reused, so posts in a row differ.
  let recent = [];
  const texts = new Set();
  for (let i = 0; i < 4; i++) { const r = goldenMessage({ pets: ['Pip', 'Bo'], people: ['Dad'], day: 'two walks', recent }); recent = [r.used, ...recent].slice(0, 4); texts.add(r.text.split('\n')[1]); }
  assert.equal(texts.size, 4);
});

test('the dogs call people Mom & Dad unless told otherwise', () => {
  assert.deepEqual(petNames([{ name: 'Sam' }]), ['Mom', 'Dad']);
  assert.deepEqual(petNames([{ name: 'Sam' }, { name: 'Pat' }]), ['Mom', 'Dad']);
  assert.deepEqual(petNames([{ name: 'Sam', petCalls: 'Dad' }]), ['Dad']);
  assert.deepEqual(petNames([{ name: 'Sam', petCalls: 'Dad' }, { name: 'Pat' }]), ['Dad', 'Mom']);
  assert.deepEqual(petNames([{ name: 'Sam', petCalls: 'Mom' }, { name: 'Pat' }]), ['Mom', 'Dad']);
  assert.deepEqual(petNames([{ name: 'Sam', petCalls: 'Auntie' }]), ['Auntie']);
});

test('the day turning golden posts once, thanking whoever took the dogs out, by their pet name', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com', name: 'Sam Person' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  await call(`/families/${family.fid}/members`, token, 'POST', { kind: 'pet', name: 'Pip', species: 'dog' });
  await call(`/families/${family.fid}/members`, token, 'POST', { kind: 'pet', name: 'Bo', species: 'dog' });
  await call(`/families/${family.fid}/members/${family.members[0].id}`, token, 'PATCH', { petCalls: 'Dad' });
  const log = (kind, date = '2026-10-24') => call(`/families/${family.fid}/care`, token, 'POST', { kind, date });

  assert.equal((await log('breakfast')).golden, undefined);
  assert.equal((await log('walk')).golden, undefined);
  const r = await log('park');
  assert.equal(r.golden.byName, 'Pip & Bo');
  assert.ok(r.golden.fromPets.length === 2 && r.golden.golden === '2026-10-24');
  assert.match(r.golden.text, /Dad/);
  assert.match(r.golden.text, /a walk and the dog park/i);
  assert.equal((await log('walk')).golden, undefined, 'once a day');
  const feed = await call('/feed', token);
  assert.equal(feed.posts.filter((p) => p.golden).length, 1);
  assert.ok(!JSON.stringify(feed).includes('byUid'));

  // The family can turn it off.
  await call(`/families/${family.fid}`, token, 'PATCH', { goldenPosts: false });
  await log('walk', '2026-10-25');
  assert.equal((await log('treat', '2026-10-25')).golden, undefined);
  assert.equal((await call(`/families/${family.fid}`, token)).family.goldenPosts, false);
});
