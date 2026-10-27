// 📰 The news: feeds read, fresh stories picked, one summary turn, rescue news once a day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, pick, runNews, editionDue, shapeRescue, newsRoutes, TOPICS } from '../server/news.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const now = new Date('2026-10-27T14:00:00Z');
const rss = (items) => `<?xml version="1.0"?><rss><channel><title>Feed</title>${items.map(([t, h]) => `<item><title><![CDATA[${t}]]></title><link>https://news.example/${encodeURIComponent(t)}</link><pubDate>${new Date(now - h * 3600e3).toUTCString()}</pubDate><description>&lt;p&gt;About ${t} &amp; more&lt;/p&gt;</description></item>`).join('')}</channel></rss>`;
const atom = `<feed><entry><title>Atom story</title><link rel="alternate" href="https://a.example/1"/><updated>2026-10-27T12:00:00Z</updated><summary>Short</summary></entry></feed>`;

test('RSS and Atom are read; HTML and entities are cleaned', () => {
  const r = parseFeed(rss([['Budget deal reached', 2]]));
  assert.equal(r[0].title, 'Budget deal reached');
  assert.equal(r[0].about, 'About Budget deal reached & more');
  assert.match(r[0].url, /^https:\/\/news\.example\//);
  const a = parseFeed(atom);
  assert.deepEqual([a[0].title, a[0].url], ['Atom story', 'https://a.example/1']);
  assert.equal(parseFeed('<item><title>x</title><link>javascript:alert(1)</link></item>').length, 0);
});

test('only fresh stories, newest first, one copy of each', () => {
  const items = [{ title: 'Senate passes budget deal tonight', at: +now - 3600e3 }, { title: 'Senate passes budget deal tonight!', at: +now - 7200e3 }, { title: 'Old news story here', at: +now - 50 * 3600e3 }, { title: 'Newest thing happened today', at: +now - 600e3 }];
  assert.deepEqual(pick(items, +now).map((x) => x.title), ['Newest thing happened today', 'Senate passes budget deal tonight']);
});

test('editions at 6:45 and 3:45 Pacific', () => {
  assert.equal(editionDue(Date.parse('2026-10-27T13:45:00Z')), true, '6:45 AM PDT');
  assert.equal(editionDue(Date.parse('2026-10-27T22:45:00Z')), true, '3:45 PM PDT');
  assert.equal(editionDue(Date.parse('2026-12-01T14:45:00Z')), true, '6:45 AM PST');
  assert.equal(editionDue(Date.parse('2026-10-27T13:30:00Z')), false);
  assert.equal(editionDue(Date.parse('2026-10-27T18:45:00Z')), false);
});

test('an edition: summaries from Gemini, rescue news once a day with dead links dropped', async () => {
  const calls = { gemini: 0, search: 0, feeds: 0 };
  const fetcher = async (url, init) => {
    if (url.includes('generativelanguage')) {
      const body = JSON.parse(init.body);
      const searching = !!body.tools;
      calls[searching ? 'search' : 'gemini']++;
      const text = searching ? JSON.stringify({ dogs: [{ name: 'Biscuit', about: '2 yrs, mini', url: 'https://rescue.example/biscuit' }, { name: 'Gone', url: 'https://rescue.example/dead' }], events: [{ title: 'Adoption day', day: '2026-11-01', where: 'Los Gatos', url: 'https://rescue.example/e' }, { title: 'Past', day: '2026-10-01' }], site: 'https://rescue.example' })
        : JSON.stringify({ politics: [{ i: 1, line: 'The second one matters most.' }, { i: 9, line: 'no such story' }] });
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
    }
    if (url.includes('rescue.example')) return { ok: !url.includes('dead'), status: url.includes('dead') ? 404 : 200 };
    calls.feeds++;
    if (url.includes('kqed')) return { ok: false, status: 503 };
    return { ok: true, status: 200, text: async () => rss([[`Story A from ${url.length}`, 1], [`Second story ${url.length} today`, 3]]) };
  };
  const db = kv(), env = { GEMINI_API_KEY: 'g', __fetch: fetcher };
  const r = await runNews(env, db, { now, fetcher });
  assert.equal(calls.feeds, Object.values(TOPICS).reduce((n, t) => n + t.feeds.length, 0));
  assert.equal(calls.gemini, 1, 'one summary turn');
  assert.equal(calls.search, 1, 'one rescue search');
  assert.ok(r.problems.some((p) => /KQED/.test(p)));
  const ed = db.m.get('news:latest');
  assert.equal(ed.topics.politics.length, 1);
  assert.equal(ed.topics.politics[0].line, 'The second one matters most.');
  assert.ok(ed.topics.tech.length > 0, 'no summary for tech: the feeds\' own blurbs');
  assert.match(ed.topics.tech[0].line, /^About/);
  assert.deepEqual(ed.rescue.dogs.map((d) => [d.name, d.url]), [['Biscuit', 'https://rescue.example/biscuit'], ['Gone', '']]);
  assert.deepEqual(ed.rescue.events.map((e) => e.title), ['Adoption day']);
  // An hour later: nothing; the afternoon edition keeps today's rescue news.
  assert.equal((await runNews(env, db, { now: new Date(+now + 600e3), fetcher })).skipped, true);
  await runNews(env, db, { now: new Date(+now + 9 * 3600e3), fetcher });
  assert.equal(calls.search, 1);
  const res = await newsRoutes({ path: '/news', method: 'GET', db, json: (x) => x });
  assert.equal(res.news.problems, undefined, 'problems are for the maintainer');
  assert.equal(res.news.labels.bay, 'Bay Area');
});

test('without any key: the feeds\' own blurbs, no rescue lookup', async () => {
  const db = kv();
  const fetcher = async () => ({ ok: true, status: 200, text: async () => rss([['Something happened today in town', 1]]) });
  const r = await runNews({}, db, { now, fetcher });
  assert.equal(r.rescue, false);
  assert.equal(db.m.get('news:latest').topics.bay[0].title, 'Something happened today in town');
  assert.equal(shapeRescue(null, '2026-10-27'), null);
});
