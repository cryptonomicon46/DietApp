// 📺 TV episode dates from TMDB (free; the key is the one the scout uses): find a show, and for one
// show its next episode, the last one out, and every episode date of the season that matters (a
// Netflix batch drop shows as several episodes on one date). Looked up for a phone and kept in
// Cloudflare's cache for 6 hours — nothing is stored about who asked.

const clean = (s, n = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ep = (x) => (x ? { s: x.season_number, e: x.episode_number, date: x.air_date || '', name: clean(x.name, 80) } : null);

async function tmdb(env, path, params = {}) {
  const key = env.TMDB_KEY;
  const bearer = key.length > 60;
  const u = `https://api.themoviedb.org/3${path}?${new URLSearchParams({ language: 'en-US', ...params, ...(bearer ? {} : { api_key: key }) })}`;
  const r = await (env.__fetch || fetch)(u, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
  if (!r.ok) throw new Error(`tmdb ${r.status}`);
  return r.json();
}

export async function tvSearch(env, q) {
  const j = await tmdb(env, '/search/tv', { query: clean(q, 80), include_adult: 'false' });
  return (j.results || []).slice(0, 6).map((x) => ({ id: x.id, name: x.name, year: (x.first_air_date || '').slice(0, 4), poster: x.poster_path ? `https://image.tmdb.org/t/p/w154${x.poster_path}` : '' }));
}

export async function tvShow(env, id) {
  const j = await tmdb(env, `/tv/${id}`);
  const next = ep(j.next_episode_to_air), last = ep(j.last_episode_to_air);
  // The season worth listing: the one with the next episode, else the latest that aired.
  const season = next?.s ?? last?.s ?? null;
  let episodes = [];
  if (season != null) {
    const s = await tmdb(env, `/tv/${id}/season/${season}`).catch(() => null);
    episodes = (s?.episodes || []).map((x) => ({ e: x.episode_number, date: x.air_date || '', name: clean(x.name, 80) }));
  }
  return {
    id: j.id, name: j.name, status: j.status || '', poster: j.poster_path ? `https://image.tmdb.org/t/p/w154${j.poster_path}` : '',
    next, last, season, episodes,
    seasons: (j.seasons || []).filter((x) => x.season_number > 0).map((x) => ({ n: x.season_number, eps: x.episode_count, date: x.air_date || '' })),
    networks: (j.networks || []).map((x) => x.name).slice(0, 3),
  };
}

// GET /tv/search?q=… · GET /tv/:id — for signed-in people, cached 6 hours.
export async function tvRoutes({ path, method, req, env, json, url }) {
  const m = path.match(/^\/tv\/(search|\d{1,9})$/);
  if (!m || method !== 'GET') return null;
  if (!env.TMDB_KEY) return json({ error: 'episode dates need the TMDB key on the connector (TMDB_KEY)' }, 501);
  const cache = typeof caches !== 'undefined' && !env.DEMO ? caches.default : null;
  const ck = new Request(`https://tv.cache/${m[1]}?q=${encodeURIComponent(url(req).searchParams.get('q') || '')}`);
  if (cache) { const hit = await cache.match(ck); if (hit) return json(await hit.json()); }
  try {
    const data = m[1] === 'search' ? { results: await tvSearch(env, url(req).searchParams.get('q') || '') } : { show: await tvShow(env, m[1]) };
    if (cache) await cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' } }));
    return json(data);
  } catch (e) { return json({ error: e.message }, 502); }
}

// Where you are vs what's out: new episodes since your progress, the next drop, a new season.
export function episodeStatus(show, progress, today) {
  if (!show) return null;
  const pg = { s: progress?.s || 0, e: progress?.e || 0 };
  const out = (x) => x.date && x.date <= today;
  const aired = show.episodes.filter(out);
  let fresh = [];
  if (show.season != null && (pg.s === show.season || (pg.s === 0 && show.season === 1))) fresh = aired.filter((x) => x.e > pg.e);
  const newSeason = show.season != null && pg.s > 0 && show.season > pg.s && aired.length ? show.season : null;
  const upcoming = show.episodes.filter((x) => x.date > today);
  const nextDrop = upcoming[0]?.date || (show.next?.date > today ? show.next.date : '');
  const nextBatch = upcoming.filter((x) => x.date === nextDrop).map((x) => x.e);
  const latest = aired.length ? aired[aired.length - 1].date : '';
  return { newCount: fresh.length, from: fresh[0]?.e || null, to: fresh[fresh.length - 1]?.e || null, newSeason, nextDrop, nextBatch, latest, season: show.season, ended: /ended|canceled/i.test(show.status) && !upcoming.length };
}
