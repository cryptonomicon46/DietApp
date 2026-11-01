// 🎁 Wishlist (js/wishlist.js): items are cleaned, links are https only, your partner's list carries
// only YOUR secret "I'm getting this", and the list itself rides in the "us" part (partners only)
// while your claims ride in no part at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../js/wishlist.js';
import { PARTS, splitHealth } from '../js/healthParts.js';

test('an item from a link: name, price, https link', () => {
  const x = W.itemOf({ name: '  Rolex   Submariner ', details: '41 mm, black dial', price: '$10,250', link: 'https://www.example.com/watch?x=1', love: 'really' }, 1000);
  assert.equal(x.name, 'Rolex Submariner');
  assert.equal(x.price, 10250);
  assert.equal(W.priceText(x.price), '$10,250');
  assert.equal(x.link, 'https://www.example.com/watch?x=1');
  assert.equal(x.love, 'really');
  assert.match(x.id, /^w[a-z0-9]+$/);
});

test('links: only https, never javascript: or data:', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com', 'not a link', '']) assert.equal(W.safeLink(bad), '', bad);
  assert.equal(W.safeLink(' https://shop.example/x '), 'https://shop.example/x');
});

test('an item from a screenshot + caption (no name needed); junk pictures are dropped', () => {
  const pic = 'data:image/jpeg;base64,AAAA';
  const x = W.itemOf({ pic, caption: 'The Submariner — black dial. Saw it on Santana Row.' });
  assert.equal(x.pic, pic);
  assert.equal(x.name, 'The Submariner — black dial. Saw it on Santana Row.'.slice(0, 80));
  assert.equal(W.itemOf({ pic: 'https://tracker.example/pixel.png', caption: 'x' }).pic, '', 'only a picture made on the phone');
  assert.equal(W.itemOf({ pic: `data:image/jpeg;base64,${'A'.repeat(W.MAX_PIC)}`, caption: 'big' }).pic, '', 'too big');
  assert.equal(W.itemOf({}), null);
});

test('lists: ❤️ first, newest first, got last; edit replaces by id; remove', () => {
  const a = W.itemOf({ name: 'A', love: 'nice', at: 1 }), b = W.itemOf({ name: 'B', love: 'really', at: 2 }), c = { ...W.itemOf({ name: 'C', love: 'really', at: 3 }), got: '2026-11-01' };
  let l = W.upsert(W.upsert(W.upsert([], a), b), c);
  assert.deepEqual(W.shown(l).map((x) => x.name), ['B', 'A', 'C']);
  l = W.upsert(l, { ...a, name: 'A2' });
  assert.equal(l.length, 3);
  assert.ok(l.some((x) => x.name === 'A2'));
  assert.deepEqual(W.remove(l, b.id).map((x) => x.name).sort(), ['A2', 'C']);
});

test('your partner never sees your claim: it lives in no part', () => {
  assert.ok(PARTS.us.includes('wishlist'), 'the list is in the partner-only part');
  for (const p of Object.values(PARTS)) assert.ok(!p.includes('wishClaims'), 'claims are in no part');
  const parts = splitHealth({ wishlist: [{ id: 'w1' }], wishClaims: { wTheirs: 1 } });
  assert.deepEqual(parts.us.wishlist, [{ id: 'w1' }]);
  assert.equal(JSON.stringify(parts).includes('wishClaims'), false);
  const claims = W.toggleClaim({}, 'w9', 5);
  assert.deepEqual(W.theirsWithClaims([{ id: 'w9', name: 'Boots', love: 'really', at: 1 }], claims).map((x) => x.mine), [true]);
  assert.deepEqual(W.toggleClaim(claims, 'w9'), {});
});
