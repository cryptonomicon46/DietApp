// 💡 Date ideas on the phone: the deck takes turns between kinds, drops passed and past ideas,
// and pick tokens match only within the same family key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deck, ideaToken, againIdeas, STARTERS, pickBox } from '../family/ideas.js';
import { newKey } from '../family/crypto.js';

const week = { ideas: [
  { id: 'mv1', kind: 'movie', title: 'Great Film', scores: { critic: 94 } },
  { id: 'tm1', kind: 'event', title: 'Late show', day: '2026-10-31' }, { id: 'tm0', kind: 'event', title: 'Early show', day: '2026-10-29' },
  { id: 'tmold', kind: 'event', title: 'Gone', day: '2026-10-01' },
  { id: 'pl1', kind: 'food', title: 'Ember & Vine', reserve: 'https://www.opentable.com/s?term=x' },
] };

test('the deck takes turns, soonest first, and leaves out what you passed', () => {
  const all = deck({ week, rhythm: [], today: '2026-10-25' });
  assert.deepEqual(all.slice(0, 5).map((x) => x.id), ['mv1', 'tm0', 'pl1', 'stpicnic', 'tm1']);
  assert.ok(!all.some((x) => x.id === 'tmold'), 'past days are gone');
  const later = deck({ week, rhythm: [], today: '2026-10-25', passed: { mv1: Date.now() + 1e6, stpicnic: Date.now() - 1 } });
  assert.equal(later[0].id, 'tm0');
  assert.ok(later.some((x) => x.id === 'stpicnic'), '"later" comes back');
  assert.deepEqual(deck({ week, today: '2026-10-25', tab: 'event' }).map((x) => x.id), ['tm0', 'tm1']);
  assert.equal(deck({ week: null, today: '2026-10-25', tab: 'starter' }).length, STARTERS.length);
});

test('your own dates come back as "again?" ideas', () => {
  const r = [{ kind: 'date', date: '2026-09-01', place: 'Orchard City', what: 'Dinner' }, { kind: 'close', date: '2026-09-02' }, { kind: 'date', date: '2026-10-01', place: 'orchard city' }];
  const a = againIdeas(r);
  assert.equal(a.length, 1);
  assert.equal(a[0].title, 'Back to orchard city');
});

test('pick tokens: the same for both of you, different in another family, nothing readable', async () => {
  const k = newKey();
  const a = await ideaToken(k, 'f1', 'mv1');
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(await ideaToken(k, 'f1', 'mv1'), a);
  assert.notEqual(await ideaToken(newKey(), 'f1', 'mv1'), a);
  assert.notEqual(await ideaToken(null, 'f1', 'mv1'), await ideaToken(null, 'f2', 'mv1'));
  assert.deepEqual(Object.keys(pickBox(week.ideas[4])).sort(), ['day', 'icon', 'id', 'img', 'kind', 'reserve', 'time', 'title', 'url', 'where']);
});

test('ratings become a taste: what fits, why, what to hide, and the line an outing can carry', async () => {
  const { tasteOf, fit, tasteLine } = await import('../family/ideas.js');
  const t = tasteOf([
    { overall: 3, stops: [{ name: 'Omakase counter', kind: 'dinner', tags: ['sushi'], price: '$$$', r: 2 }], tags: ['food'] },
    { overall: 1, stops: [{ name: 'Loud Tapas', kind: 'dinner', tags: ['tapas'], price: '$$', r: -1 }], tags: ['loud', 'wait'] },
    { overall: 2, stops: [{ name: 'Another Sushi', kind: 'dinner', tags: ['japanese'], r: 1 }], tags: ['loud', 'wait'] },
    { skip: true },
  ]);
  assert.equal(t.n, 3);
  const sushi = fit({ kind: 'food', title: 'New sushi bar', tags: ['food', 'sushi'], price: '$$$' }, t);
  const tapas = fit({ kind: 'food', title: 'Tapas place', tags: ['tapas'] }, t);
  assert.ok(sushi.score > 0 && tapas.score < 0);
  assert.equal(sushi.why, 'Because you ❤️ sushi');
  assert.ok(fit({ kind: 'food', title: 'Loud Tapas' }, t).hide, "a place you didn't like is hidden");
  const line = tasteLine(t);
  assert.match(line, /love sushi/);
  assert.match(line, /not keen on tapas/);
  assert.match(line, /avoid loud places, long waits/);
  assert.match(line, /loved Omakase counter/);
  assert.equal(tasteLine(tasteOf([])), '');
});
