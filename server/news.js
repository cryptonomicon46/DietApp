// 📰 The news: two editions a day (about 6:45 AM and 3:45 PM Pacific) of Politics, Tech and Bay
// Area headlines from public RSS feeds, each with a one-line summary, plus 🐶 rescue news (dogs up
// for adoption and events) looked up once a day. One shared copy for everyone; nothing about
// anyone is sent anywhere, so it can use Gemini's free tier.

import { askGemini, askSearch, searchReady } from './search.js';
import { askClaude, parseScout, clean, okUrl, okDay } from './scout.js';
import { checkLinks } from './links.js';

export const TOPICS = {
  politics: { label: 'Politics', feeds: [['NPR', 'https://feeds.npr.org/1014/rss.xml'], ['PBS NewsHour', 'https://www.pbs.org/newshour/feeds/rss/politics'], ['CalMatters', 'https://calmatters.org/feed/']] },
  tech: { label: 'Tech', feeds: [['The Verge', 'https://www.theverge.com/rss/index.xml'], ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'], ['TechCrunch', 'https://techcrunch.com/feed/'], ['Hacker News', 'https://news.ycombinator.com/rss']] },
  bay: { label: 'Bay Area', feeds: [['Mercury News', 'https://www.mercurynews.com/feed/'], ['KQED ww2', 'https://ww2.kqed.org/news/feed/'], ['SF Standard', 'https://sfstandard.com/feed/'], ['SFGate', 'https://www.sfgate.com/bayarea/feed/Bay-Area-News-429.php'], ['Mission Local', 'https://missionlocal.org/feed/'], ['San José Spotlight', 'https://sanjosespotlight.com/feed/'], ['NBC Bay Area', 'https://www.nbcbayarea.com/feed/'], ['ABC7', 'https://abc7news.com/feed/'], ['Berkeleyside', 'https://www.berkeleyside.org/feed'], ['Oaklandside', 'https://oaklandside.org/feed/'], ['KQED rss', 'https://www.kqed.org/rss/news']] },
};
export const RESCUE = 'California Doodle Rescue';
const PER_TOPIC = 6, FRESH = 36 * 3600e3;

const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // escaped HTML in a blurb, too
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

// RSS <item>s or Atom <entry>s → [{ title, url, at, about }].
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const x = m[0];
    const link = decode(tag(x, 'link')) || (x.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || x.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const at = Date.parse(decode(tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated') || tag(x, 'dc:date')));
    const title = decode(tag(x, 'title'));
    if (title && okUrl(link.replace(/&amp;/g, '&'))) out.push({ title: title.slice(0, 160), url: link.replace(/&amp;/g, '&'), at: Number.isFinite(at) ? at : 0, about: decode(tag(x, 'description') || tag(x, 'summary') || tag(x, 'content')).slice(0, 300) });
  }
  return out;
}

const key = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3 || /\d/.test(w)).slice(0, 7).join(' ');
// Newest first, within 36 hours, one copy of a story that several feeds carry.
export function pick(items, now = Date.now(), n = PER_TOPIC * 2) {
  const seen = new Set();
  return items.filter((x) => x.at && now - x.at < FRESH && x.at < now + 3600e3).sort((a, b) => b.at - a.at)
    .filter((x) => { const k = key(x.title); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
}

// One model turn for every headline: the ones worth reading, each with a plain one-line summary.
export function summaryPrompt(topics) {
  return `Here are today's headlines, by topic, with each feed's own blurb. For each topic, pick the ${PER_TOPIC} most important or interesting for a California family (skip duplicates, ads, deals and quizzes) and write a plain, neutral one-line summary (under 20 words) of each from its blurb — no opinions, nothing that isn't in the blurb.
Answer with only this JSON: {"politics":[{"i":0,"line":""}],"tech":[…],"bay":[…]} (i is the headline's number in that topic).

${Object.entries(topics).map(([t, list]) => `## ${t}\n${list.map((x, i) => `${i}. ${x.title} — ${x.about.slice(0, 200)}`).join('\n')}`).join('\n\n')}`;
}
async function summarize(env, topics) {
  if (!Object.values(topics).some((l) => l.length)) return null;
  const prompt = summaryPrompt(topics);
  try {
    if (env.GEMINI_API_KEY) return parseScout((await askGemini(env, prompt, { search: false })).text);
  } catch { /* Claude's turn */ }
  if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) return null;
  return parseScout((await askClaude(env, prompt, { search: false, maxTokens: 3000, model: env.NEWS_MODEL || 'claude-haiku-5-5' })).text);
}

export function rescuePrompt(name, today) {
  return `Search the web for ${name} (a dog rescue in California) and find, as of ${today}: dogs currently up for adoption, and upcoming adoption or fundraising events. Use only their own site and listings (Petfinder, Adopt-a-Pet, their social pages).
Answer with only this JSON: {"dogs":[{"name":"","about":"one line: age, size, temperament","url":"https://…"}],"events":[{"title":"","day":"YYYY-MM-DD","where":"","url":"https://…"}],"site":"https://… their home page"}. Up to 6 dogs and 4 events; an empty list if you can't find any.`;
}
export function shapeRescue(j, today) {
  if (!j) return null;
  return {
    dogs: (Array.isArray(j.dogs) ? j.dogs : []).map((d) => ({ name: clean(d.name, 40), about: clean(d.about, 140), url: okUrl(d.url) })).filter((d) => d.name).slice(0, 6),
    events: (Array.isArray(j.events) ? j.events : []).map((e) => ({ title: clean(e.title, 100), day: okDay(e.day), where: clean(e.where, 80), url: okUrl(e.url) })).filter((e) => e.title && e.day && e.day >= today).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 4),
    site: okUrl(j.site),
  };
}

// Pacific time pieces for an instant.
const pacific = (now) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
// The 15-minute cron: an edition at the 6:45 and 15:45 Pacific quarters.
export function editionDue(at) {
  const p = pacific(new Date(at));
  return (p.hour === '06' || p.hour === '15') && +p.minute >= 45;
}

// Makes an edition: about 9 feeds, one summary turn, and (mornings, or if it's missing) the rescue
// lookup with its links opened — well under the free plan's 50 outside requests.
export async function runNews(env, db, { now = new Date(), fetcher = env.__fetch || fetch, force = false } = {}) {
  const prev = (await db.get('news:latest')) || null;
  if (!force && prev && now - prev.at < 3600e3) return { skipped: true };
  const problems = [];
  const topics = {};
  await Promise.all(Object.entries(TOPICS).map(async ([t, { feeds }]) => {
    const got = await Promise.all(feeds.map(async ([src, url]) => {
      try {
        // A feed that doesn't answer in 8 seconds is skipped this edition.
        const r = await fetcher(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'OurPawmily news (family app)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return parseFeed(await r.text()).map((x) => ({ ...x, src }));
      } catch (e) { problems.push(`${src}: ${e.message}`); return []; }
    }));
    topics[t] = pick(got.flat(), +now);
  }));
  let sums = null;
  try { sums = await summarize(env, topics); } catch (e) { problems.push(`Summaries: ${e.message}`); }
  const out = {};
  for (const [t, list] of Object.entries(topics)) {
    const chosen = Array.isArray(sums?.[t]) ? sums[t].filter((s) => list[s.i]).map((s) => ({ ...list[s.i], line: clean(s.line, 160) })) : [];
    const rows = chosen.length ? chosen : list.map((x) => ({ ...x, line: clean(x.about, 160) }));
    out[t] = rows.slice(0, PER_TOPIC).map(({ title, url, at, src, line }) => ({ title, url, at, src, line: line === title ? '' : line }));
  }
  const today = `${pacific(now).year}-${pacific(now).month}-${pacific(now).day}`;
  let rescue = prev?.rescue || null;
  if (searchReady(env) && (force || !rescue || rescue.day !== today)) {
    try {
      const r = shapeRescue(parseScout((await askSearch(env, rescuePrompt(RESCUE, today), { search: true, maxUses: 4, maxTokens: 3000, model: env.NEWS_MODEL || 'claude-haiku-5-5', db })).text), today);
      if (r) {
        const checks = await checkLinks([...r.dogs.map((d) => d.url), ...r.events.map((e) => e.url), r.site].filter(Boolean), fetcher, { max: 12 }).catch(() => ({}));
        const live = (u) => (u && checks[u]?.ok !== false ? u : '');
        rescue = { day: today, at: +now, name: RESCUE, site: live(r.site), dogs: r.dogs.map((d) => ({ ...d, url: live(d.url) })), events: r.events.map((e) => ({ ...e, url: live(e.url) })) };
      }
    } catch (e) { problems.push(`Rescue: ${e.message}`); }
  }
  const edition = { at: +now, topics: out, rescue, problems };
  await db.put('news:latest', edition, 4 * 86400);
  return { at: edition.at, stories: Object.values(out).reduce((n, l) => n + l.length, 0), rescue: !!rescue, problems };
}

export async function newsRoutes({ path, method, db, json }) {
  if (path !== '/news' || method !== 'GET') return null;
  const n = await db.get('news:latest');
  if (!n) return json({ news: null });
  const { problems, ...rest } = n;
  return json({ news: { ...rest, labels: Object.fromEntries(Object.entries(TOPICS).map(([k, v]) => [k, v.label])) } });
}
