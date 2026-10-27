// 🎬 Movies: lists, one movie's details, and release alerts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { movieLists, movieDetail, movieAlertsDue, movieRoutes } from '../server/movies.js';

const ok = (j) => ({ ok: true, json: async () => j });
const env = { TMDB_KEY: 'k', OMDB_KEY: 'o', __fetch: async (u) => {
  if (u.includes('now_playing')) return ok({ results: [{ id: 1, title: 'Great Film', release_date: '2026-10-09', vote_average: 8, vote_count: 900 }] });
  if (u.includes('omdbapi')) return ok({ Ratings: [{ Source: 'Rotten Tomatoes', Value: '94%' }], imdbRating: '8.1', Genre: 'Drama', Runtime: '124 min' });
  if (u.includes('/movie/upcoming')) return ok({ results: [{ id: 2, title: 'Later Film', release_date: '2099-01-01' }, { id: 3, title: 'Old', release_date: '2000-01-01' }] });
  if (u.includes('/release_dates')) return ok({ results: [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2026-10-24T00:00:00.000Z' }, { type: 4, release_date: '2026-12-01T00:00:00.000Z' }] }] });
  if (u.includes('/watch/providers')) return ok({ results: { US: { flatrate: [{ provider_name: 'Netflix' }], link: 'https://tmdb/x' } } });
  return ok({ id: 2, title: 'Later Film', overview: 'A story.', runtime: 101, genres: [{ name: 'Comedy' }], release_date: '2026-10-24' });
} };

test('in theaters with scores, coming soon, and one movie', async () => {
  const l = await movieLists(env);
  assert.deepEqual(l.now.map((m) => [m.title, m.scores.rt, m.pick]), [['Great Film', 94, true]]);
  assert.deepEqual(l.soon.map((m) => m.title), ['Later Film'], 'only future releases');
  const d = await movieDetail(env, 2);
  assert.deepEqual([d.theaters, d.digital, d.stream, d.runtime], ['2026-10-24', '2026-12-01', ['Netflix'], 101]);
});

test('alerts: on, add (already in theaters → streaming only), due, and shared lookups', async () => {
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const call = (path, method = 'GET', body = {}) => movieRoutes({ path, method, body, req: new Request('https://x'), env, db, user: { uid: 'u' }, json: (data, status = 200) => ({ status, data }) });
  await call('/account/movies', 'PUT', { on: true });
  await call('/account/movies/alerts/2', 'PUT', { title: 'Later Film' });
  await call('/account/movies/alerts/1', 'PUT', { title: 'Great Film', inTheaters: true });
  const prefs = (await call('/account/movies')).data.movies;
  assert.deepEqual([prefs.on, prefs.list.length, prefs.list[1].told], [true, 2, { theaters: true }]);
  const seen = new Map(), budget = { left: 12 };
  const due = await movieAlertsDue(env, prefs, '2026-10-27', seen, budget);
  assert.deepEqual(due.map((d) => `${d.id}:${d.what}`), ['2:theaters', '2:streaming', '1:streaming']);
  assert.equal(budget.left, 10);
  await movieAlertsDue(env, prefs, '2026-10-27', seen, budget);
  assert.equal(budget.left, 10, 'looked up once per run, for everyone');
  assert.equal((await movieAlertsDue(env, prefs, '2026-10-01', new Map())).filter((d) => d.what === 'theaters').length, 0, 'not out yet');
  await call('/account/movies/alerts/2', 'DELETE');
  assert.equal((await call('/account/movies')).data.movies.list.length, 1);
});
