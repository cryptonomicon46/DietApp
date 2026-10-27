// 📖 The tour: every page complete, "Show me" goes somewhere real, "This screen" lands on a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLIDES, TOUR, WHATS_NEW, SCREEN, slide } from '../family/tour.js';

const VIEWS = ['feed', 'threads', 'chats', 'pets', 'us', 'calendar', 'me'];

test('every tour page has a title and its cards, and ids are unique', () => {
  assert.equal(new Set(SLIDES.map((s) => s.id)).size, SLIDES.length);
  assert.equal(TOUR[0], 'welcome');
  for (const s of SLIDES) {
    assert.ok(s.title, s.id);
    if (s.welcome) continue;
    assert.ok(s.cards.length >= 2 && s.cards.length <= 5, `${s.id}: 2-5 cards fit a phone`);
    for (const c of s.cards) assert.equal(c.length, 3, `${s.id}: [icon, title, text]`);
    if (s.go) assert.ok(VIEWS.includes(s.go), `${s.id}: Show me → ${s.go}`);
  }
});

test('"This screen" and "What\'s new" point at real pages', () => {
  for (const [view, id] of Object.entries(SCREEN)) assert.ok(TOUR.includes(id), `${view} → ${id}`);
  for (const id of WHATS_NEW.slides) assert.ok(slide(id), id);
  assert.ok(!TOUR.includes('new'), 'what\'s new isn\'t part of the tour itself');
});
