import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeShows, showMonths, monthShows, yearRecap } from '../js/shows.js';

const recs = [
  { person: 'sandman',
    shows: [{ id: 'bear', title: 'The Bear', service: 'hulu', kind: 'show', date: '2026-09-28', at: 1 },
      { id: 'dune', title: 'Dune', service: 'max', kind: 'movie', date: '2026-10-04', at: 2 }],
    nights: [{ show: 'bear', date: '2026-09-28', at: 1 }, { show: 'bear', date: '2026-10-01', at: 2 }],
    status: { bear: { s: 'watching', at: 5, date: '2026-10-01' } }, ratings: { bear: 5 } },
  { person: 'amani',
    shows: [{ id: 'wed', title: 'Wednesday', service: 'netflix', kind: 'show', date: '2026-10-02', at: 3 }],
    nights: [{ show: 'bear', date: '2026-10-01', at: 3 }, { show: 'bear', date: '2026-10-03', at: 4 }, { show: 'wed', date: '2026-10-02', at: 3 }],
    status: { bear: { s: 'finished', at: 9, date: '2026-10-03' } }, ratings: { bear: 4, dune: 3 } },
];

test('shows merge across both phones', () => {
  const shows = mergeShows(recs);
  const bear = shows.find((s) => s.id === 'bear');
  assert.equal(bear.nights.length, 3, 'the night both logged counts once');
  assert.equal(bear.status, 'finished', 'latest status wins');
  assert.equal(bear.rating, 4.5);
  assert.equal(shows.find((s) => s.id === 'dune').status, 'finished', 'a movie is watched once');
  assert.deepEqual(showMonths(bear), ['2026-09', '2026-10']);
  assert.equal(monthShows(shows, '2026-10').find((s) => s.id === 'bear').monthNights, 2);
});

test('deleted shows disappear for both', () => {
  const r = structuredClone(recs);
  r[0].status.wed = { s: 'deleted', at: 99, date: '2026-10-05' };
  assert.equal(mergeShows(r).some((s) => s.id === 'wed'), false);
});

test('year recap', () => {
  const r = yearRecap(mergeShows(recs), '2026');
  assert.equal(r.titles, 3);
  assert.equal(r.nights, 4);
  assert.equal(r.shows, 2);
  assert.equal(r.movies, 1);
  assert.equal(r.finished, 2);
  assert.equal(r.mostWatched.id, 'bear');
  assert.equal(r.topRated.id, 'bear');
  assert.equal(r.topService, 'hulu');
  assert.deepEqual(r.months.map((m) => m.month), ['2026-09', '2026-10']);
});
