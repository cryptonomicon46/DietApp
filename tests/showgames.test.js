// 🎲💑 A show's games are found by its name, ignoring region and season tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { showKey, sameShow, gamesFor } from '../js/showGames.js';

test('names match without region, season or year tags', () => {
  assert.equal(showKey('Love Is Blind - US'), 'love is blind');
  assert.equal(showKey('The Gentleman - Season 3'), 'gentleman');
  assert.ok(sameShow('Love Is Blind', 'Love Is Blind - US'));
  assert.ok(sameShow('The Office (US)', 'The Office'));
  assert.ok(sameShow('Squid Game: Season 2', 'squid game'));
  assert.ok(!sameShow('Love Is Blind', 'Love Island'));
  assert.ok(!sameShow('', ''), 'nothing matches nothing');
});

test('a show\'s games: the game being played, its card set, its couples picks (playing first)', () => {
  const all = {
    packs: [{ id: 'p1', title: 'Love Is Blind' }, { id: 'p2', title: 'War' }],
    games: [{ id: 'g1', title: 'War', status: 'live', at: 5 }, { id: 'g0', title: 'Love Is Blind', status: 'done', at: 9 }],
    seasons: [{ id: 's1', title: 'Love Is Blind', status: 'done', at: 1 }, { id: 's2', title: 'Love Is Blind', status: 'live', at: 2 }],
  };
  const lib = gamesFor('Love Is Blind - US', all);
  assert.equal(lib.live, null, 'a finished game isn\'t "playing now"');
  assert.equal(lib.pack.id, 'p1');
  assert.equal(lib.picks.id, 's2');
  assert.equal(gamesFor('War', all).live.id, 'g1');
  assert.deepEqual(gamesFor('The Gentleman - Season 3', all), { live: null, pack: null, picks: null });
});
