// 📺 Episode dates: what's new since where you are, the next drop, a new season.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tvShow, tvSearch, episodeStatus } from '../server/tv.js';

// Love Is Blind S11, released in batches on Wednesdays.
const lib = { id: 1, name: 'Love Is Blind', status: 'Returning Series', season: 11, next: { s: 11, e: 12, date: '2026-11-04' },
  episodes: [...[1, 2, 3, 4, 5].map((e) => ({ e, date: '2026-10-14' })), ...[6, 7, 8].map((e) => ({ e, date: '2026-10-21' })), ...[9, 10, 11].map((e) => ({ e, date: '2026-10-28' })), { e: 12, date: '2026-11-04' }, { e: 13, date: '2026-11-08' }] };

test('new episodes since where you are, and the next drop', () => {
  const wed = episodeStatus(lib, { s: 11, e: 8 }, '2026-10-28');
  assert.deepEqual([wed.newCount, wed.from, wed.to, wed.nextDrop, wed.nextBatch], [3, 9, 11, '2026-11-04', [12]]);
  const tue = episodeStatus(lib, { s: 11, e: 8 }, '2026-10-27');
  assert.deepEqual([tue.newCount, tue.nextDrop, tue.nextBatch], [0, '2026-10-28', [9, 10, 11]]);
  assert.equal(episodeStatus(lib, null, '2026-10-28').newCount, 0, 'not started this season, and it is season 11');
  assert.equal(episodeStatus(lib, { s: 10, e: 12 }, '2026-10-28').newSeason, 11);
  const s1 = { ...lib, season: 1, episodes: [{ e: 1, date: '2026-10-01' }, { e: 2, date: '2026-10-08' }] };
  assert.equal(episodeStatus(s1, null, '2026-10-28').newCount, 2, 'a brand-new show: everything out is new');
});

test('TMDB lookups (search, then the show with its season)', async () => {
  const calls = [];
  const env = { TMDB_KEY: 'shortv3key', __fetch: async (u) => { calls.push(u); const ok = (j) => ({ ok: true, json: async () => j });
    if (u.includes('/search/tv')) return ok({ results: [{ id: 7, name: 'Love Is Blind', first_air_date: '2020-02-13' }] });
    if (u.includes('/season/11')) return ok({ episodes: [{ episode_number: 9, air_date: '2026-10-28', name: 'Nine' }] });
    return ok({ id: 7, name: 'Love Is Blind', status: 'Returning Series', next_episode_to_air: { season_number: 11, episode_number: 12, air_date: '2026-11-04' }, last_episode_to_air: { season_number: 11, episode_number: 11, air_date: '2026-10-28' }, seasons: [{ season_number: 0 }, { season_number: 11, episode_count: 13, air_date: '2026-10-14' }] }); } };
  assert.deepEqual(await tvSearch(env, 'love is blind'), [{ id: 7, name: 'Love Is Blind', year: '2020', poster: '' }]);
  const s = await tvShow(env, 7);
  assert.deepEqual([s.season, s.next.e, s.episodes[0].e, s.seasons.length], [11, 12, 9, 1]);
  assert.ok(calls.every((u) => u.includes('api_key=shortv3key')));
});
