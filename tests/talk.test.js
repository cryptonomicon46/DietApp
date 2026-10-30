// 🗣️ Talk to Pawmily T0: the actions it may propose and the rules around them (nothing is wired to a
// screen or sent to Claude yet). docs/TALK_TO_PAWMILY.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../js/talkActions.js';
import { STATUSES as BOOK } from '../js/books.js';
import { PLAN_KINDS, REPLIES } from '../server/us.js';
import { REQUEST_KINDS } from '../server/home.js';
import { dayContextForPlanning } from '../js/whoopDay.js';

test('the vocabularies match the domains that own them', () => {
  assert.deepEqual(T.BOOK_STATES, BOOK);
  assert.deepEqual(T.PLAN_KINDS, PLAN_KINDS);
  assert.deepEqual(T.PLAN_REPLIES, REPLIES);
  assert.deepEqual(T.REQUEST_KINDS, Object.keys(REQUEST_KINDS));
  assert.ok(readFileSync(new URL('../server/family.js', import.meta.url), 'utf8').includes(`const STATUSES = ${JSON.stringify(T.WATCH_STATUSES).replace(/"/g, "'").replace(/,/g, ', ')};`));
});

test('every action: a domain that owns it, a kind, who it affects, and a strict schema', () => {
  for (const [name, d] of Object.entries(T.ACTIONS)) {
    assert.ok(d.domain && ['read', 'capture', 'coordinate'].includes(d.kind) && ['self', 'couple', 'household', 'shared'].includes(d.affects), name);
    assert.ok(d.via, `${name} says which existing code it reuses`);
    const s = T.jsonSchema(name);
    assert.equal(s.additionalProperties, false, name);
    if (d.kind !== 'read') assert.ok(d.undo, `${name} can be undone`);
  }
});

test('a step is checked, never guessed: unknown actions, fields and bad values are refused', () => {
  assert.deepEqual(T.validate({ action: 'watch.add', args: { title: '  Dune:  Part Two ', media: 'movie', status: 'want' } }), { ok: true, step: { action: 'watch.add', args: { title: 'Dune: Part Two', media: 'movie', status: 'want' } }, errors: [] });
  assert.equal(T.validate({ action: 'watch.delete', args: {} }).ok, false);
  assert.match(T.validate({ action: 'watch.add', args: { title: 'Dune', secret: 1 } }).errors.join(), /secret isn't allowed/);
  assert.match(T.validate({ action: 'watch.add', args: {} }).errors.join(), /title is needed/);
  assert.match(T.validate({ action: 'watch.setStatus', args: { showId: 'a1', status: 'binged' } }).errors.join(), /isn't one of/);
  assert.match(T.validate({ action: 'us.plan.propose', args: { kind: 'dinner', day: 'Saturday' } }).errors.join(), /day isn't valid/);
  assert.match(T.validate({ action: 'diet.log', args: { meal: 'lunch', text: 'x'.repeat(601) } }).errors.join(), /too long/);
  assert.equal(T.validate({ action: 'read.add', args: { title: 'Project Hail Mary', olWorkId: 'OL24384034W', state: 'want', recBy: 'partner' } }).ok, true);
});

test('the shared-person rule: anything that involves someone else is proposed, never written for them', () => {
  const modes = Object.fromEntries(Object.keys(T.ACTIONS).map((a) => [a, T.modeOf(a)]));
  for (const [a, d] of Object.entries(T.ACTIONS)) if (d.affects === 'shared' && a !== 'us.plan.reply') assert.equal(modes[a], 'propose', a);
  assert.equal(modes['us.plan.propose'], 'propose');
  assert.equal(modes['home.request'], 'propose');
  assert.equal(modes['us.plan.reply'], 'apply', 'answering your own invitation');
  assert.equal(modes['threads.draft'], 'open', 'opens the composer, never posts');
  assert.equal(modes['calendar.addMine'], 'apply'); assert.deepEqual(T.ACTIONS['calendar.addMine'].affects, 'self', 'only your own calendar, ever');
  assert.equal(modes['ideas.save'], 'unavailable', 'no saved-ideas list yet');
  assert.equal(modes['calendar.freeBusy'], 'read');
  assert.ok(!Object.keys(T.ACTIONS).some((a) => /calendar\.(add|propose)Shared|calendar\.addFor/.test(a)), 'no way to put an event on someone else\'s calendar');
});

test('one card for a compound request; every place or time it shows comes from a lookup, never invented', () => {
  const facts = { p1: { name: 'Pasta Place', area: 'Santana Row', open: '17:00', closes: '22:00', source: 'places' } };
  const plan = { steps: [
    { action: 'watch.add', args: { title: 'Dune: Part Two', media: 'movie', status: 'want' } },
    { action: 'calendar.freeBusy', args: { from: '2026-10-31', to: '2026-10-31', who: 'both' } },
    { action: 'us.plan.propose', args: { kind: 'dinner', day: '2026-10-31', time: '18:30', stops: [{ at: '18:30', what: 'Dinner', place: 'Pasta Place', factId: 'p1', source: 'fact' }, { at: '20:15', what: 'Movie', source: 'you' }] } },
  ] };
  const ok = T.checkPlan(plan, facts);
  assert.equal(ok.ok, true, ok.errors.join());
  assert.deepEqual(ok.steps.map((s) => s.mode), ['apply', 'read', 'propose']);
  // A restaurant no lookup returned is refused.
  const made = T.checkPlan({ steps: [{ action: 'us.plan.propose', args: { kind: 'dinner', day: '2026-10-31', stops: [{ at: '18:30', place: 'Imaginary Bistro', source: 'fact' }] } }] }, facts);
  assert.equal(made.ok, false); assert.match(made.errors.join(), /no lookup gave/);
  assert.equal(T.checkPlan({ steps: [{ action: 'us.plan.propose', args: { kind: 'dinner', day: '2026-10-31', stops: [{ place: 'Other Place', factId: 'p1' }] } }] }, facts).ok, false);
  assert.equal(T.checkPlan({ steps: [] }).ok, false);
  assert.equal(T.checkPlan({ steps: Array(9).fill({ action: 'look.today', args: {} }) }).ok, false);
});

test('names never leave the phone: people become roles going out, and names again coming back', () => {
  const people = [{ id: 'm1', name: 'Sam', role: 'me' }, { id: 'm2', name: 'Pat', role: 'partner' }, { id: 'm3', name: 'Jo', role: 'member' }, { id: 'm4', name: 'Jordan', role: 'member' }];
  const out = T.toTokens("Dinner with Pat Saturday, and ask Jordan and Jo to walk the dogs. Pat's idea.", people);
  assert.equal(out.text, 'Dinner with [partner] Saturday, and ask [member:1] and [member:2] to walk the dogs. [partner]\'s idea.');
  assert.ok(!/Pat|Jordan|\bJo\b/.test(out.text));
  assert.equal(T.fromTokens('Propose dinner to [partner]; [member:2] can walk them.', out.map, people), 'Propose dinner to Pat; Jo can walk them.');
  assert.equal(T.toTokens('Patio dinner', people).text, 'Patio dinner', 'whole names only');
});

test('what each lookup may tell the assistant: allowlisted fields only (no event titles, notes or history)', () => {
  const busy = T.minimizeFacts('calendar.freeBusy', [{ date: '2026-10-31', start: '17:00', end: '18:00', busy: true, title: 'Therapy', notes: 'private', who: 'me' }]);
  assert.deepEqual(busy, [{ date: '2026-10-31', start: '17:00', end: '18:00', busy: true, who: 'me' }]);
  assert.equal(T.minimizeFacts('health.history', {}), null, 'no adapter, nothing');
  const day = dayContextForPlanning({ daily: {}, today: '2026-10-30' });
  assert.deepEqual(T.minimizeFacts('fitness.day', day), day, 'the Phase B planning facts fit as they are');
  assert.deepEqual(Object.keys(T.minimizeFacts('travel', { from: 'Willow Glen', to: 'Santana Row', minutes: 14, home: '123 Real St' })), ['from', 'to', 'minutes']);
});

test('the examples under the Talk box only offer what is built', () => {
  for (const list of Object.values(T.EXAMPLES)) for (const [, a] of list) assert.ok(T.ACTIONS[a], a);
  assert.deepEqual(T.examplesFor('us', new Set(['watch.add', 'read.add'])), ['Add a movie', 'Add a book']);
  assert.deepEqual(T.examplesFor('health', new Set()), []);
  assert.deepEqual(T.examplesFor('nowhere', new Set(['calendar.freeBusy'])), ['Plan my day']);
});
