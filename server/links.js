// 🔗 Link checks: before a link Claude found reaches the app, the connector opens it once. A page
// that's gone (404, 410, a server error, or a site that doesn't answer) is swapped for a search,
// so a tap never lands on a dead page. Sites that turn away robots (401, 403, 429) still exist, so
// those links stay. Each run has a budget: the free plan allows 50 outside requests per run.

export const searchUrl = (q) => `https://www.google.com/search?${new URLSearchParams({ q })}`;
const dead = (status) => status === 404 || status === 410 || status >= 500;

export async function checkLink(url, fetcher = fetch, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetcher(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OurPawmily link check)', Accept: 'text/html,*/*' } });
    r.body?.cancel?.().catch?.(() => {});
    return { url, status: r.status, ok: !dead(r.status) };
  } catch (e) {
    return { url, status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally { clearTimeout(t); }
}

// Check up to `max` distinct links, a few at a time; { url: result }.
export async function checkLinks(urls, fetcher = fetch, { max = 20, at = 6 } = {}) {
  const list = [...new Set(urls.filter((u) => /^https:\/\//.test(u || '')))].slice(0, max);
  const out = {};
  for (let i = 0; i < list.length; i += at) {
    for (const r of await Promise.all(list.slice(i, i + at).map((u) => checkLink(u, fetcher)))) out[r.url] = r;
  }
  return out;
}

// Apply the results: a dead link becomes a search for what it was; checked links are marked.
export function applyChecks(item, results, query) {
  const r = results[item.url];
  if (!item.url || !r) return item;
  return r.ok ? { ...item, checked: true } : { ...item, url: searchUrl(query), checked: true, wasDead: r.status || r.error };
}
