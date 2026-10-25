// 💡 The weekly date scout: listings and well-rated movies, Claude's showtimes and new places,
// one list per area; and private picks that only show up when both of you pick the same idea.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketmaster, movies, assemble, scoutArea, parseScout, openTableUrl, DEFAULT_AREA, areaKey } from '../server/scout.js';
import { familyApi, TERMS_VERSION } from '../server/family.js';

const res = (j, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => j });
const fakeFetch = async (url) => {
  if (url.includes('ticketmaster')) return res({ _embedded: { events: [{ id: 'A1', name: 'Khruangbin', url: 'https://tm/k', dates: { start: { localDate: '2026-10-31', localTime: '20:00:00' } }, priceRanges: [{ min: 45.5 }], classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }], _embedded: { venues: [{ name: 'The Warfield', city: { name: 'San Francisco' } }] } }] } });
  if (url.includes('now_playing')) return res({ results: [{ id: 1, title: 'Great Film', vote_average: 8, vote_count: 900, poster_path: '/p.jpg' }, { id: 2, title: 'Meh Film', vote_average: 6, vote_count: 900 }] });
  if (url.includes('/movie/1/external_ids')) return res({ imdb_id: 'tt1' });
  if (url.includes('/movie/2/external_ids')) return res({ imdb_id: 'tt2' });
  if (url.includes('omdbapi') && url.includes('tt1')) return res({ Ratings: [{ Source: 'Rotten Tomatoes', Value: '94%' }], imdbRating: '8.1', Runtime: '124 min', Rated: 'PG-13', Genre: 'Drama' });
  if (url.includes('omdbapi')) return res({ Ratings: [{ Source: 'Rotten Tomatoes', Value: '40%' }], imdbRating: '6.0' });
  throw new Error(`unexpected ${url}`);
};
const env0 = { TICKETMASTER_KEY: 'k', TMDB_KEY: 'shortv3key', OMDB_KEY: 'o' };
const win = { from: new Date('2026-10-29T13:00:00Z'), to: new Date('2026-11-08T13:00:00Z') };

test('listings: events, and only movies both critics and audiences rate highly', async () => {
  const ev = await ticketmaster(env0, DEFAULT_AREA, win, fakeFetch);
  assert.equal(ev[0].title, 'Khruangbin');
  assert.equal(ev[0].time, '20:00');
  assert.equal(ev[0].price, 46);
  assert.deepEqual(ev[0].tags, ['music', 'rock']);
  const films = await movies(env0, DEFAULT_AREA, fakeFetch);
  assert.deepEqual(films.map((f) => f.title), ['Great Film']);
  assert.deepEqual([films[0].scores.rt, films[0].scores.audience], [94, 81]);
  assert.deepEqual(await ticketmaster({}, DEFAULT_AREA, win, fakeFetch), [], 'no key: skipped');
});

test("Claude's answer becomes showtimes, places with OpenTable links, and extras", () => {
  const claude = parseScout(`Here you go: {"showtimes":[{"movie":"Great Film","theater":"AMC Mercado 20","url":"https://amc/x","times":[{"day":"2026-10-31","time":"19:10","format":"Dolby"},{"day":"bad","time":"x"}]}],
    "places":[{"name":"Ember & Vine","kind":"wine bar, small plates","area":"Santana Row","price":"$$$","why":"new rooftop","opened":"Oct 2026","url":"https://e/v","opentable":true}],
    "extras":[{"title":"Night market","day":"2026-10-31","time":"18:00","where":"SoFA","price":0,"why":"food trucks","url":"javascript:alert(1)","tags":["Food"]}]} Enjoy!`);
  const week = assemble({ films: [{ id: 'mv1', kind: 'movie', title: 'Great Film', scores: {}, tags: ['movie'] }], claude, win, area: DEFAULT_AREA });
  const film = week.ideas.find((x) => x.kind === 'movie');
  assert.deepEqual(film.theatres[0].times, [{ day: '2026-10-31', time: '19:10', format: 'Dolby' }]);
  const place = week.ideas.find((x) => x.kind === 'food');
  assert.equal(place.reserve, openTableUrl('Ember & Vine', '2026-10-31'));
  assert.match(place.reserve, /covers=2/);
  const extra = week.ideas.find((x) => x.title === 'Night market');
  assert.equal(extra.url, '', 'only https links');
  assert.equal(parseScout('no json here'), null);
});

test('one run per area saves the week, counts Claude runs, and stops Claude at the cap', async () => {
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  let calls = 0;
  const anthropic = { messages: { create: async () => { calls++; return calls === 1
    ? { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use' }], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } }
    : { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"showtimes":[],"places":[{"name":"Taqueria X","opentable":false}],"extras":[]}' }], usage: { input_tokens: 200, output_tokens: 300, server_tool_use: { web_search_requests: 3 } } }; } } };
  const env = { ...env0, __anthropic: anthropic, SCOUT_MAX_RUNS: 1 };
  const r = await scoutArea(env, db, DEFAULT_AREA, { now: win.from, fetcher: fakeFetch });
  assert.equal(calls, 2, 'a paused search turn is resumed');
  assert.deepEqual([r.usage.input, r.usage.output, r.usage.searches], [300, 310, 5]);
  const week = m.get(`ideas:${areaKey(DEFAULT_AREA)}`);
  assert.ok(week.ideas.some((x) => x.title === 'Taqueria X' && !x.reserve));
  const again = await scoutArea(env, db, DEFAULT_AREA, { now: win.from, fetcher: fakeFetch });
  assert.equal(calls, 2, 'over the monthly cap: no more Claude');
  assert.match(again.problems.join(), /skipped/);
});

test('picks are private until you both pick the same idea', async () => {
  const m = new Map();
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam' });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const I = `/families/${family.fid}/ideas`;
  const t1 = 'a'.repeat(32), t2 = 'b'.repeat(32);
  assert.equal((await call(`${I}/picks/${t1}`, sam, 'POST', { box: { title: 'Sunset walk' } })).match, null);
  await call(`${I}/picks/${t2}`, pat, 'POST', { box: { title: 'Omakase' } });
  assert.equal((await call(I, pat)).matches.length, 0, "Pat can't see Sam's pick");
  const r = await call(`${I}/picks/${t1}`, pat, 'POST', { box: { title: 'Sunset walk' } });
  assert.ok(r.match, "it's a match");
  assert.equal((await call(I, sam)).matches.length, 1);
  await call(`${I}/matches/${t1}`, sam, 'PATCH', { done: true });
  assert.equal((await call(I, pat)).matches.length, 0, 'made into a plan');
  // Settings: theatres and score minimums.
  const s = await call(`${I}/settings`, sam, 'PUT', { theatres: ['AMC Mercado 20, Santa Clara'], critic: 90 });
  assert.deepEqual([s.settings.theatres, s.settings.critic], [['AMC Mercado 20, Santa Clara'], 90]);
});
