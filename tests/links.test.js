// 🔗 Link checks: gone pages become a search, robot-shy sites stay, and there's a budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLinks, applyChecks, searchUrl } from '../server/links.js';

test('dead links are replaced, live and robot-shy ones kept, at most `max` checked', async () => {
  const seen = [];
  const fetcher = async (u) => { seen.push(u); if (u.includes('gone')) return { status: 404 }; if (u.includes('shy')) return { status: 403 }; if (u.includes('down')) throw new TypeError('fetch failed'); return { status: 200 }; };
  const r = await checkLinks(['https://ok.example', 'https://gone.example', 'https://shy.example', 'https://down.example', 'https://ok.example', 'http://insecure.example', ''], fetcher, { max: 4 });
  assert.equal(seen.length, 4, 'each link once, https only');
  assert.deepEqual(Object.values(r).map((x) => x.ok), [true, false, true, false]);
  assert.equal(applyChecks({ url: 'https://gone.example', title: 'X' }, r, 'Ember & Vine San Jose').url, searchUrl('Ember & Vine San Jose'));
  assert.equal(applyChecks({ url: 'https://shy.example' }, r, 'q').url, 'https://shy.example');
  assert.equal(applyChecks({ url: 'https://unchecked.example' }, r, 'q').checked, undefined);
  const capped = await checkLinks(Array.from({ length: 30 }, (_, i) => `https://s${i}.example`), async () => ({ status: 200 }), { max: 20 });
  assert.equal(Object.keys(capped).length, 20);
});
