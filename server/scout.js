// 💡 The weekly date scout: once a week, for each area families live in, gather what's on —
// concerts, comedy and shows (Ticketmaster, SeatGeek), movies in theatres that critics and
// audiences both rate highly (TMDB + OMDb), and, with Claude and web search, showtimes at the
// family's theatres and new, trendy places to eat and drink — and save one list per area.
// It only ever knows the area and the dates: matching ideas to a couple happens on their phones.
//
// Keys (all optional; each source is skipped without its key), set with `npx wrangler secret put`:
//   TICKETMASTER_KEY, SEATGEEK_CLIENT_ID, TMDB_KEY (v3 key or v4 read token), OMDB_KEY,
//   ANTHROPIC_API_KEY (already set for Help). SCOUT_MODEL picks the Claude model (Sonnet by default; claude-haiku-5-5 is cheaper but reads
//   showtimes less reliably),
//   SCOUT_MAX_RUNS (per area per month, default 6) caps what it can spend.

export const DEFAULT_AREA = { zip: '95131', lat: 37.3946, lon: -121.905, label: 'San Jose', theatres: ['Century at Great Mall, Milpitas', 'AMC Mercado 20, Santa Clara'], critic: 85, audience: 75, radius: 30 };
export const areaKey = (a) => `${Number(a.lat).toFixed(1)},${Number(a.lon).toFixed(1)}`;
const iso = (d) => d.toISOString().slice(0, 10);
const tmDate = (d) => `${d.toISOString().slice(0, 19)}Z`;

// The window ideas are for: the next 10 days from `now`.
export function windowFrom(now = new Date()) {
  const end = new Date(now.getTime() + 10 * 864e5);
  return { from: now, to: end };
}

// ---------- listings (no AI) ----------
export async function ticketmaster(env, area, win, fetcher = fetch) {
  if (!env.TICKETMASTER_KEY) return [];
  const q = new URLSearchParams({ apikey: env.TICKETMASTER_KEY, latlong: `${area.lat},${area.lon}`, radius: String(area.radius || 30), unit: 'miles', startDateTime: tmDate(win.from), endDateTime: tmDate(win.to), size: '80', sort: 'date,asc', segmentName: '' });
  q.delete('segmentName');
  const r = await fetcher(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`);
  if (!r.ok) throw new Error(`ticketmaster ${r.status}`);
  const j = await r.json();
  return (j._embedded?.events || []).map((e) => {
    const v = e._embedded?.venues?.[0] || {};
    const c = e.classifications?.[0] || {};
    const img = (e.images || []).filter((x) => x.ratio === '16_9').sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640))[0]?.url || '';
    return { id: `tm${e.id}`, kind: 'event', title: e.name, day: e.dates?.start?.localDate || '', time: (e.dates?.start?.localTime || '').slice(0, 5), where: [v.name, v.city?.name].filter(Boolean).join(', '),
      price: e.priceRanges?.[0]?.min ? Math.round(e.priceRanges[0].min) : null, url: e.url || '', img, tags: [c.segment?.name, c.genre?.name].filter((x) => x && x !== 'Undefined').map((x) => x.toLowerCase()), src: 'Ticketmaster' };
  }).filter((e) => e.title && e.day);
}

export async function seatgeek(env, area, win, fetcher = fetch) {
  if (!env.SEATGEEK_CLIENT_ID) return [];
  const q = new URLSearchParams({ client_id: env.SEATGEEK_CLIENT_ID, lat: String(area.lat), lon: String(area.lon), range: `${area.radius || 30}mi`, 'datetime_utc.gte': win.from.toISOString().slice(0, 19), 'datetime_utc.lte': win.to.toISOString().slice(0, 19), per_page: '60', sort: 'datetime_utc.asc' });
  const r = await fetcher(`https://api.seatgeek.com/2/events?${q}`);
  if (!r.ok) throw new Error(`seatgeek ${r.status}`);
  const j = await r.json();
  return (j.events || []).map((e) => ({ id: `sg${e.id}`, kind: 'event', title: e.title || e.short_title, day: (e.datetime_local || '').slice(0, 10), time: (e.datetime_local || '').slice(11, 16), where: [e.venue?.name, e.venue?.city].filter(Boolean).join(', '),
    price: e.stats?.lowest_price || null, url: e.url || '', img: e.performers?.[0]?.image || '', tags: [e.type?.replace(/_/g, ' ')].filter(Boolean), src: 'SeatGeek' })).filter((e) => e.title && e.day);
}

// Movies in US theatres now, with critics' (Rotten Tomatoes, else Metacritic) and audiences'
// (IMDb, else TMDB) scores, best first. One TMDB call, then one OMDb call per film (by title and
// year) — a run has to stay under Cloudflare's 50 outside requests. The family's bar doesn't hide
// a film: the ones over it are marked as a critics' pick.
export const scoreOf = (s) => { const v = [s.critic, s.audience].filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length - (v.length < 2 ? 10 : 0) : 0; };
export async function movies(env, area, fetcher = fetch, max = 16) {
  if (!env.TMDB_KEY) return [];
  const bearer = env.TMDB_KEY.length > 60; // a v4 read token; else a v3 key
  const r = await fetcher(`https://api.themoviedb.org/3/movie/now_playing?${new URLSearchParams({ region: 'US', language: 'en-US', page: '1', ...(bearer ? {} : { api_key: env.TMDB_KEY }) })}`, bearer ? { headers: { Authorization: `Bearer ${env.TMDB_KEY}` } } : undefined);
  if (!r.ok) throw new Error(`tmdb ${r.status}`);
  const list = ((await r.json()).results || []).slice(0, max);
  const out = await Promise.all(list.map(async (m) => {
    const year = (m.release_date || '').slice(0, 4);
    const o = env.OMDB_KEY ? await fetcher(`https://www.omdbapi.com/?${new URLSearchParams({ apikey: env.OMDB_KEY, t: m.title, type: 'movie', ...(year ? { y: year } : {}) })}`).then((x) => x.json()).then((j) => (j?.Response === 'False' ? null : j)).catch(() => null) : null;
    const rt = parseInt(o?.Ratings?.find((x) => x.Source === 'Rotten Tomatoes')?.Value || '', 10);
    const meta = parseInt(o?.Metascore || '', 10);
    const imdb = parseFloat(o?.imdbRating || '');
    const critic = Number.isFinite(rt) ? rt : Number.isFinite(meta) ? meta : null;
    const audience = Number.isFinite(imdb) ? Math.round(imdb * 10) : m.vote_count > 50 ? Math.round(m.vote_average * 10) : null;
    const scores = { critic, rt: Number.isFinite(rt) ? rt : null, meta: Number.isFinite(meta) ? meta : null, imdb: Number.isFinite(imdb) ? imdb : null, audience };
    return { id: `mv${m.id}`, kind: 'movie', title: m.title, released: m.release_date || '', img: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : '', scores,
      pick: critic != null && audience != null && critic >= (area.critic ?? 85) && audience >= (area.audience ?? 75), rank: Math.round(scoreOf(scores)),
      runtime: o?.Runtime && o.Runtime !== 'N/A' ? o.Runtime : '', rated: o?.Rated && o.Rated !== 'N/A' ? o.Rated : '', genre: o?.Genre && o.Genre !== 'N/A' ? o.Genre : '', tags: ['movie', ...(o?.Genre || '').toLowerCase().split(/,\s*/).filter((g) => g && g !== 'n/a')],
      why: [o?.Genre && o.Genre !== 'N/A' ? o.Genre.split(',')[0] : '', o?.Runtime && o.Runtime !== 'N/A' ? o.Runtime : '', o?.Rated && o.Rated !== 'N/A' ? o.Rated : ''].filter(Boolean).join(' · '),
      url: `https://www.fandango.com/search?q=${encodeURIComponent(m.title)}`, src: 'TMDB · OMDb' };
  }));
  return out.filter((x) => x.scores.critic != null || x.scores.audience != null).sort((a, b) => (b.pick - a.pick) || b.rank - a.rank);
}

// ---------- Claude: showtimes at your theatres, new and trendy places, a few hidden gems ----------
export function scoutPrompt(area, win, goodMovies) {
  return `You are a date-night scout for couples who live near ${area.label || 'their city'} (ZIP ${area.zip}). Today is ${iso(win.from)}. Use web search to find, for ${iso(win.from)} to ${iso(win.to)}:

1. Showtimes (Friday to Sunday) at these theatres: ${area.theatres.join('; ')} — only for these movies: ${goodMovies.slice(0, 6).map((m) => m.title).join('; ') || '(none — skip this part)'}. Use each theatre's own showtimes page (AMC, Cinemark) or Fandango. Include the page URL.
2. Up to 8 new (opened in roughly the last 6 months) or currently buzzy bars and restaurants within about 15 miles, from recent local food coverage (Eater SF, The Mercury News, San Jose Spotlight, SF Chronicle). Say whether it takes OpenTable reservations if you can tell.
3. Up to 6 other date ideas happening in that window that a listings site would miss: festivals, markets, special screenings, tastings, outdoor events.

Answer with only a JSON object, no prose, in exactly this shape:
{"showtimes":[{"movie":"","theater":"","url":"","times":[{"day":"YYYY-MM-DD","time":"HH:MM","format":""}]}],
 "places":[{"name":"","kind":"","area":"","price":"$$","why":"","opened":"","url":"","opentable":true}],
 "extras":[{"title":"","day":"YYYY-MM-DD","time":"HH:MM","where":"","price":null,"why":"","url":"","tags":[""]}]}
Leave out anything you can't verify. Times are 24-hour local time.`;
}
// The JSON object in Claude's answer (it can arrive after search results and citations).
export function parseScout(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
// One Claude turn with web search (resumed if a long search turn pauses); the text it wrote,
// and what it cost.
export async function askClaude(env, prompt, { city = '', maxUses = 6, maxTokens = 8000 } = {}) {
  let client = env.__anthropic;
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); }
  const model = env.SCOUT_MODEL || 'claude-sonnet-5-5';
  // Haiku gets the plain search tool; the filtering version is for Sonnet and Opus.
  const tools = [{ type: /haiku/.test(model) ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: maxUses, user_location: { type: 'approximate', city: city || undefined, region: 'California', country: 'US' } }];
  const messages = [{ role: 'user', content: prompt }];
  const usage = { input: 0, output: 0, searches: 0, model };
  let res;
  for (let i = 0; i < 4; i++) {
    res = await client.messages.create({ model, max_tokens: maxTokens, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, tools, messages });
    usage.input += res.usage?.input_tokens || 0;
    usage.output += res.usage?.output_tokens || 0;
    usage.searches += res.usage?.server_tool_use?.web_search_requests || 0;
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  return { text: (res?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'), usage };
}
export async function claudeScout(env, area, win, goodMovies) {
  if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) return { data: null, usage: null };
  const { text, usage } = await askClaude(env, scoutPrompt(area, win, goodMovies), { city: area.label });
  return { data: parseScout(text), usage };
}

// ---------- one week's ideas for an area ----------
export const clean = (s, n = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const okUrl = (u) => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '');
export const okDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '');
export const okTime = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? t : '');
// OpenTable with the evening filled in (Saturday 7:30 PM for two by default): the couple finishes booking there.
export const openTableUrl = (name, day, time = '19:30', covers = 2) => `https://www.opentable.com/s?${new URLSearchParams({ term: name, covers: String(covers), dateTime: `${day}T${time}` })}`;

export function assemble({ events = [], films = [], claude = null, win, area }) {
  const ideas = [];
  const seen = new Set();
  const add = (x) => { const k = `${x.kind}:${x.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}:${x.day || ''}`; if (seen.has(k)) return; seen.add(k); ideas.push(x); };
  for (const e of events) add(e);
  const sat = (() => { const d = new Date(win.from); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7)); return iso(d); })();
  for (const m of films) {
    const shows = (claude?.showtimes || []).filter((s) => clean(s.movie).toLowerCase() === m.title.toLowerCase());
    add({ ...m, theatres: shows.map((s) => ({ name: clean(s.theater, 60), url: okUrl(s.url), times: (s.times || []).filter((t) => okDay(t.day) && okTime(t.time)).slice(0, 12).map((t) => ({ day: t.day, time: t.time, format: clean(t.format, 20) })) })).filter((t) => t.times.length) });
  }
  for (const p of claude?.places || []) {
    const name = clean(p.name, 60);
    if (!name) continue;
    add({ id: `pl${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`, kind: 'food', title: name, where: clean(p.area, 60), price: clean(p.price, 4), why: clean(p.why, 140), opened: clean(p.opened, 30), url: okUrl(p.url),
      reserve: p.opentable !== false ? openTableUrl(name, sat) : '', tags: ['food', ...clean(p.kind, 40).toLowerCase().split(/[,/]\s*/).filter(Boolean)], src: 'Local food coverage' });
  }
  for (const x of claude?.extras || []) {
    const title = clean(x.title, 80);
    if (!title || !okDay(x.day)) continue;
    add({ id: `ex${title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30)}${x.day}`, kind: 'event', title, day: x.day, time: okTime(x.time), where: clean(x.where, 80), price: Number.isFinite(+x.price) && x.price !== null ? Math.round(+x.price) : null, why: clean(x.why, 140), url: okUrl(x.url),
      tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => clean(t, 20).toLowerCase()).filter(Boolean).slice(0, 4), src: 'Around town' });
  }
  return { area: { label: area.label, zip: area.zip, key: areaKey(area) }, from: iso(win.from), to: iso(win.to), at: Date.now(), ideas: ideas.slice(0, 120) };
}

// Runs the scout for one area: listings, then Claude (within the monthly cap).
export async function scoutArea(env, db, area, { now = new Date(), fetcher = fetch, force = false, refresh = false } = {}) {
  const win = windowFrom(now);
  const month = iso(now).slice(0, 7), key = areaKey(area);
  const runs = (await db.get(`scoutruns:${key}:${month}`)) || [];
  const cap = Math.max(1, +env.SCOUT_MAX_RUNS || 6);
  const problems = [];
  const safe = (p, what) => p.catch((e) => { problems.push(`${what}: ${e.message}`); return []; });
  const [tm, sg, films] = await Promise.all([safe(ticketmaster(env, area, win, fetcher), 'Ticketmaster'), safe(seatgeek(env, area, win, fetcher), 'SeatGeek'), safe(movies(env, area, fetcher), 'Movies')]);
  let claude = null, usage = null;
  // Thursday's refresh: new films, scores and events (all free), keeping Wednesday's showtimes and places.
  const prev = refresh ? await db.get(`ideas:${key}`) : null;
  if (refresh) claude = prev?.claude || null;
  else if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) problems.push('Claude skipped: no ANTHROPIC_API_KEY');
  else if (runs.length < cap || force) {
    try { ({ data: claude, usage } = await claudeScout(env, area, win, films)); } catch (e) { problems.push(`Claude: ${e.message}`); }
  } else problems.push(`Claude skipped: ${cap} runs this month already`);
  const week = assemble({ events: [...tm, ...sg], films, claude, win, area });
  Object.assign(week, { problems, claude, refreshed: refresh ? Date.now() : null, at: refresh && prev?.at ? prev.at : week.at });
  await db.put(`ideas:${key}`, week, 30 * 86400);
  if (usage) await db.put(`scoutruns:${key}:${month}`, [...runs, { at: Date.now(), ...usage, ideas: week.ideas.length }], 62 * 86400);
  return { key, ideas: week.ideas.length, usage, problems };
}
