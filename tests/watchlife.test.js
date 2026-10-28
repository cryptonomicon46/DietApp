// 📺 2.0 Watch: Want to Watch → Watching → Watched (Up Next is a priority, not a state), one action
// that logs an episode, and old data read exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { mergeShows, lifecycle, isUpNext, nextEpisode, isFinale, watchedOne, usPreview, watchlist } from '../js/showsCore.js';

const show = (id, status, extra = {}) => ({ id, title: id, kind: 'show', date: '2026-10-01', nights: [], status, ...extra });

test('stored statuses map onto three states; nothing is rewritten', () => {
  assert.equal(lifecycle(show('a', 'want')), 'want');
  assert.equal(lifecycle(show('b', 'upnext')), 'want', 'Up Next is Want to Watch with priority');
  assert.ok(isUpNext(show('b', 'upnext')));
  assert.equal(lifecycle(show('c', 'watching')), 'watching');
  assert.equal(lifecycle(show('d', 'finished')), 'watched');
  assert.equal(lifecycle(show('e', 'dropped')), 'dropped');
  // Old records with no status keep their old meaning (a show you'd started, a movie you'd seen).
  const merged = mergeShows([{ person: 'p', shows: [{ id: 's', title: 'S', kind: 'show', date: '2026-01-01' }, { id: 'm', title: 'M', kind: 'movie', date: '2026-01-02' }], nights: [], status: {}, ratings: {} }]);
  assert.deepEqual(merged.map((x) => [x.id, lifecycle(x)]).sort(), [['m', 'watched'], ['s', 'watching']]);
});

test('next episode: S1 E1 to start, rolls into the next season only when the season list says so', () => {
  assert.deepEqual(nextEpisode(null, null), { s: 1, e: 1 });
  assert.deepEqual(nextEpisode({ s: 2, e: 4 }, null), { s: 2, e: 5 });
  const tv = { status: 'Returning Series', seasons: [{ n: 1, eps: 8 }, { n: 2, eps: 10 }] };
  assert.deepEqual(nextEpisode({ s: 1, e: 8 }, tv), { s: 2, e: 1 });
  assert.deepEqual(nextEpisode({ s: 2, e: 10 }, tv), { s: 2, e: 11 }, 'no season 3 yet: no guessing');
  assert.equal(isFinale({ s: 2, e: 10 }, tv), false, 'still running: never "finished" by inference');
  assert.equal(isFinale({ s: 2, e: 10 }, { ...tv, status: 'Ended' }), true);
  assert.equal(isFinale({ s: 2, e: 9 }, { ...tv, status: 'Ended' }), false);
  assert.equal(isFinale({ s: 2, e: 10 }, null), false, 'no metadata: uncertain');
});

test('one action: a Want-to-Watch show becomes Watching, a movie becomes Watched, tonight logged once', () => {
  const today = '2026-10-28';
  assert.deepEqual(watchedOne(show('a', 'upnext'), today), { night: true, progress: { s: 1, e: 1 }, status: 'watching' });
  assert.deepEqual(watchedOne(show('b', 'watching', { progress: { s: 1, e: 3 }, nights: [{ date: today }] }), today), { night: false, progress: { s: 1, e: 4 } });
  assert.deepEqual(watchedOne({ ...show('m', 'want'), kind: 'movie' }, today), { night: true, status: 'finished' });
});

test('Us preview: counts, new episodes first, the Up Next; the watchlist keeps Dropped apart', () => {
  const shows = [show('old', 'watching', { date: '2026-09-01' }), show('new', 'watching', { ep: { newCount: 2 } }), show('later', 'want'), show('next', 'upnext'), show('done', 'finished'), show('gone', 'dropped')];
  const p = usPreview(shows);
  assert.equal(p.watching, 2); assert.equal(p.want, 2);
  assert.deepEqual(p.items.map((x) => x.id), ['new', 'old', 'next']);
  const l = watchlist(shows);
  assert.deepEqual(l.want.map((x) => x.id), ['next', 'later'], 'Up Next leads Want to Watch');
  assert.deepEqual([l.watched.map((x) => x.id), l.dropped.map((x) => x.id)], [['done'], ['gone']]);
});

test('server: a show can start as Want to Watch, and one PATCH logs an episode without un-logging tonight', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, ...r.data }; };
  const { token } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  const { family } = await call('/families', token, 'POST', { name: 'Fam' });
  const W = `/families/${family.fid}/watch`;
  const add = await call(`${W}/shows`, token, 'POST', { body: { title: 'Silo' }, status: 'want' });
  assert.equal(add.status.s, 'want');
  const id = add.show.id;
  let r = await call(`${W}/shows/${id}`, token, 'PATCH', { status: 'watching', progress: { s: 1, e: 1 }, night: '2026-10-28' });
  assert.equal(r.status.s, 'watching'); assert.equal(r.nights.length, 1);
  r = await call(`${W}/shows/${id}`, token, 'PATCH', { progress: { s: 1, e: 2 }, night: '2026-10-28' });
  assert.equal(r.nights.length, 1, 'a second episode the same night keeps the night');
  assert.equal(r.progress.e, 2);
  // Old statuses are still accepted; history is kept.
  r = await call(`${W}/shows/${id}`, token, 'PATCH', { status: 'upnext' });
  assert.equal(r.status.s, 'upnext');
  assert.equal((await call(W, token)).nights.length, 1);
});

test('💬 Discuss: one thread per show or idea for the couple, found again by either of you', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com'), mom = await signIn('mom@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  for (const [t, email, name, relation] of [[pat, 'pat@example.com', 'Pat', 'spouse'], [mom, 'mom@example.com', 'Mom', 'parent']]) {
    const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name, relation, email });
    const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
    await call(`/invites/${inv.invite.code}/accept`, t, 'POST');
  }
  const T = `/families/${family.fid}/threads`;
  const a = (await call(T, sam, 'POST', { aud: 'us', title: '🍿 Silo', body: '', ref: 'w:abc12345' })).thread;
  const b = await call(T, pat, 'POST', { aud: 'us', title: '🍿 Silo again', body: '', ref: 'w:abc12345' });
  assert.equal(b.thread.id, a.id); assert.equal(b.dup, true);
  assert.equal((await call('/threads', pat)).threads.find((t) => t.id === a.id).ref, 'w:abc12345');
  assert.ok(!(await call('/threads', mom)).threads.some((t) => t.id === a.id), 'just-us stays just us');
  // A ref that isn't an id is ignored (a title never goes in it).
  const c = (await call(T, sam, 'POST', { aud: 'us', title: 'x', body: '', ref: 'w:Silo season 2 thoughts' })).thread;
  assert.equal(c.ref, undefined);
});
