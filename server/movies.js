// 🎬 Movies, for whoever switches them on: what's in theaters (with critic and audience scores),
// what's coming, where a movie is streaming (JustWatch data through TMDB), and 🔔 alerts when one
// you're waiting for reaches theaters or a streaming service. TMDB and OMDb are free; lists are
// kept in Cloudflare's cache for 6 hours. Alerts are kept per account: { on, list: [{ id, title,
// theaters, streaming, told: { theaters, streaming } }] }.

import { movies as nowPlaying } from './scout.js';

const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);
async function tmdb(env, path, params = {}) {
  const key = env.TMDB_KEY, bearer = key.length > 60;
  const r = await (env.__fetch || fetch)(`https://api.themoviedb.org/3${path}?${new URLSearchParams({ language: 'en-US', ...params, ...(bearer ? {} : { api_key: key }) })}`, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
  if (!r.ok) throw new Error(`tmdb ${r.status}`);
  return r.json();
}
const poster = (p) => (p ? `https://image.tmdb.org/t/p/w185${p}` : '');

export async function movieLists(env, area = {}) {
  const [now, soon] = await Promise.all([
    nowPlaying(env, { critic: area.critic ?? 85, audience: area.audience ?? 75 }, env.__fetch || fetch, 12).catch(() => []),
    tmdb(env, '/movie/upcoming', { region: 'US', page: '1' }).then((j) => j.results || []).catch(() => []),
  ]);
  const t = today();
  return {
    now: now.map((m) => ({ id: +m.id.slice(2), title: m.title, img: m.img, scores: m.scores, pick: m.pick, why: m.why, released: m.released })),
    soon: soon.filter((m) => (m.release_date || '') > t).sort((a, b) => a.release_date.localeCompare(b.release_date)).slice(0, 12)
      .map((m) => ({ id: m.id, title: m.title, img: poster(m.poster_path), released: m.release_date, why: clean(m.overview, 120) })),
  };
}
// One movie: overview, US release dates (theaters / digital), and where it's streaming.
export async function movieDetail(env, id) {
  const [m, rd, wp] = await Promise.all([tmdb(env, `/movie/${id}`), tmdb(env, `/movie/${id}/release_dates`).catch(() => ({})), tmdb(env, `/movie/${id}/watch/providers`).catch(() => ({}))]);
  const us = (rd.results || []).find((x) => x.iso_3166_1 === 'US')?.release_dates || [];
  const first = (types) => us.filter((x) => types.includes(x.type)).map((x) => x.release_date.slice(0, 10)).sort()[0] || '';
  const prov = wp.results?.US || {};
  const names = (k) => (prov[k] || []).map((x) => x.provider_name).slice(0, 6);
  return { id: m.id, title: m.title, img: poster(m.poster_path), overview: clean(m.overview, 600), runtime: m.runtime || null, genres: (m.genres || []).map((g) => g.name).slice(0, 3),
    theaters: first([2, 3]) || m.release_date || '', digital: first([4, 6]), stream: names('flatrate'), rent: names('rent'), buy: names('buy'), link: prov.link || '' };
}

// GET /movies · GET /movies/:id · GET /account/movies · PUT /account/movies {on} · PUT|DELETE /account/movies/alerts/:id
export async function movieRoutes({ path, method, body, req, env, db, user, json }) {
  const m = path.match(/^\/(?:movies(?:\/(\d{1,9}))?|account\/movies(?:\/alerts\/(\d{1,9}))?)$/);
  if (!m) return null;
  const key = `moviealerts:${user.uid}`;
  if (path.startsWith('/account/movies')) {
    const prefs = (await db.get(key)) || { on: false, list: [] };
    if (method === 'PUT' && !m[2]) prefs.on = !!body.on;
    else if (method === 'PUT' && m[2]) {
      // Already in theaters when you ask: only the streaming alert is left to send.
      if (!prefs.list.some((x) => x.id === +m[2])) prefs.list = [...prefs.list, { id: +m[2], title: clean(body.title, 80), told: body.inTheaters ? { theaters: true } : {} }].slice(-30);
    } else if (method === 'DELETE' && m[2]) prefs.list = prefs.list.filter((x) => x.id !== +m[2]);
    else if (method !== 'GET') return json({ error: 'not found' }, 404);
    if (method !== 'GET') await db.put(key, prefs);
    return json({ movies: prefs });
  }
  if (method !== 'GET') return json({ error: 'not found' }, 404);
  if (!env.TMDB_KEY) return json({ error: 'movies need the TMDB key on the connector (TMDB_KEY)' }, 501);
  const cache = typeof caches !== 'undefined' && !env.DEMO ? caches.default : null;
  const ck = new Request(`https://movies.cache/${m[1] || 'lists'}`);
  if (cache) { const hit = await cache.match(ck); if (hit) return json(await hit.json()); }
  try {
    const data = m[1] ? { movie: await movieDetail(env, m[1]) } : await movieLists(env);
    if (cache) await cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' } }));
    return json(data);
  } catch (e) { return json({ error: e.message }, 502); }
}

// Just the dates and the streaming services (two calls), for the morning alert check.
export async function movieStatus(env, id) {
  const [rd, wp] = await Promise.all([tmdb(env, `/movie/${id}/release_dates`), tmdb(env, `/movie/${id}/watch/providers`).catch(() => ({}))]);
  const us = (rd.results || []).find((x) => x.iso_3166_1 === 'US')?.release_dates || [];
  return { theaters: us.filter((x) => [2, 3].includes(x.type)).map((x) => x.release_date.slice(0, 10)).sort()[0] || '', stream: (wp.results?.US?.flatrate || []).map((x) => x.provider_name).slice(0, 3) };
}
// For the morning reminder run: alerts that came true (in theaters, or streaming). `seen` shares
// lookups between everyone in the run; `budget` keeps the run under the free plan's 50 requests.
export async function movieAlertsDue(env, prefs, day, seen = new Map(), budget = { left: 12 }) {
  const out = [];
  for (const a of (prefs?.list || []).slice(0, 10)) {
    if (a.told?.theaters && a.told?.streaming) continue;
    if (!seen.has(a.id)) { if (budget.left-- <= 0) break; seen.set(a.id, await movieStatus(env, a.id).catch(() => null)); }
    const d = seen.get(a.id);
    if (!d) continue;
    if (!a.told?.theaters && d.theaters && d.theaters <= day) out.push({ id: a.id, what: 'theaters', msg: { title: `🎬 ${a.title || 'A movie you wanted'} is in theaters`, body: 'Want to make it a plan? Open the app for showtimes.', url: 'family/#feed', tag: `movie-${a.id}` } });
    if (!a.told?.streaming && d.stream.length) out.push({ id: a.id, what: 'streaming', msg: { title: `🍿 ${a.title || 'A movie you wanted'} is streaming`, body: `Now on ${d.stream.slice(0, 2).join(' and ')}.`, url: 'family/#feed', tag: `movie-${a.id}-s` } });
  }
  return out;
}
