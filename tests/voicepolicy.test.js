// 🔊 Pawmily Voice (Phase 1) — the pure policy: provenance, owners' consent, the sensitive-text
// backstop and the one router that decides who speaks. Adversarial and positive cases both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY_VERSION, CATEGORIES, defaultPrefs, cleanPrefs, ownersOf, eligibleFacts, grantsHold, rolesForSpeech, looksSensitive, categoryOf, PHRASES } from '../js/voicePolicy.js';
import { routeVoice } from '../family/voice.js';
import { voiceFacts } from '../js/talkDay.js';

const on = (...cats) => ({ v: POLICY_VERSION, cats: Object.fromEntries(CATEGORIES.map((c) => [c, cats.includes(c)])), namesOut: true });
const who = { me: 'sam', partner: 'pat', adults: ['sam', 'pat', 'mom'] };
const W = { d: 'weather', o: 'public', v: { time: '14:00', f: 62 } };
const CAL = (o, title = 'Book club') => ({ d: 'calendar', o, v: { date: '2026-11-01', time: '18:00', title } });
const H = { d: 'health', o: 'sam', v: { recovery: { score: 63 } } };

test('every category starts OFF; names always stay out; junk preferences clean to OFF', () => {
  assert.deepEqual(Object.values(defaultPrefs().cats), CATEGORIES.map(() => false));
  assert.equal(defaultPrefs().namesOut, true);
  assert.deepEqual(CATEGORIES, ['confirmations', 'watchread', 'weather', 'travel', 'calendar', 'health']);
  const p = cleanPrefs({ cats: { weather: 'yes', calendar: 1, health: true, bogus: true }, namesOut: false });
  assert.deepEqual(p.cats, { ...defaultPrefs().cats, health: true }, 'only a real true counts; unknown categories dropped');
  assert.equal(p.namesOut, true, 'cannot be turned off in Phase 1');
  assert.deepEqual(cleanPrefs(null), defaultPrefs());
});

test('owners: public needs only the listener; both = me + partner; family = every grown-up; unknown → never', () => {
  assert.deepEqual(ownersOf(W, who), []);
  assert.deepEqual(ownersOf(CAL('both'), who), ['sam', 'pat']);
  assert.deepEqual(ownersOf(CAL('family'), who), ['sam', 'pat', 'mom']);
  assert.deepEqual(ownersOf(CAL('pat'), who), ['pat']);
  assert.equal(ownersOf({ d: 'calendar' }, who), null);
  assert.equal(ownersOf({ d: 'calendar', o: 'public' }, who), null, 'adversarial: a calendar item labelled public is never eligible');
  assert.equal(ownersOf({ d: 'health', o: 'public' }, who), null);
  assert.equal(categoryOf('threads'), null); assert.equal(categoryOf('notes'), null);
  const prefs = { sam: on(...CATEGORIES), pat: on(...CATEGORIES), mom: on(...CATEGORIES) };
  const r = eligibleFacts([{ d: 'threads', o: 'sam', v: 'bank stuff' }, { d: 'calendar', o: '', v: {} }, { d: 'calendar' }, null], { ...who, prefsOf: (m) => prefs[m] });
  assert.equal(r.ok.length, 0, 'unknown domain or owner is never eligible, even with everything on');
});

test('public-only: eligible once the listener allows weather; not before', () => {
  const prefs = { sam: on() };
  assert.equal(eligibleFacts([W], { ...who, prefsOf: (m) => prefs[m] }).ok.length, 0, 'the listener chooses too');
  prefs.sam = on('weather');
  const r = eligibleFacts([W], { ...who, prefsOf: (m) => prefs[m] });
  assert.deepEqual(r.ok, [W]); assert.deepEqual(r.grants, [['sam', 'weather']]);
});

test("Health denied → nothing; another member's calendar needs THEIR consent; all owners allow → eligible", () => {
  const prefs = { sam: on('weather', 'calendar'), pat: on() };
  const p = (m) => prefs[m];
  assert.equal(eligibleFacts([H], { ...who, prefsOf: p }).ok.length, 0, 'health off');
  assert.equal(eligibleFacts([CAL('pat')], { ...who, prefsOf: p }).ok.length, 0, "Sam can't waive Pat's privacy");
  assert.equal(eligibleFacts([CAL('both')], { ...who, prefsOf: p }).ok.length, 0, 'a shared event needs both');
  prefs.pat = on('calendar');
  const r = eligibleFacts([CAL('pat'), CAL('both')], { ...who, prefsOf: p });
  assert.equal(r.ok.length, 2);
  assert.deepEqual(r.grants.map((g) => g.join(':')).sort(), ['pat:calendar', 'sam:calendar']);
  assert.equal(eligibleFacts([CAL('family')], { ...who, prefsOf: p }).ok.length, 0, 'a family event needs every grown-up (Mom has not allowed)');
  // Pat allowing calendar does NOT let Pat's health through.
  assert.equal(eligibleFacts([{ d: 'health', o: 'pat', v: {} }], { ...who, prefsOf: p }).ok.length, 0);
});

test('mixed facts: only the allowed ones are kept (the summary is written from those alone)', () => {
  const prefs = { sam: on('weather') };
  const r = eligibleFacts([W, H, CAL('pat'), CAL('sam')], { ...who, prefsOf: (m) => prefs[m] });
  assert.deepEqual(r.ok, [W]); assert.equal(r.denied.length, 3);
  assert.deepEqual(r.grants, [['sam', 'weather']]);
});

test('grants are re-checked against today: revoking after issuance counts; unknown categories never hold', () => {
  const prefs = { sam: on('weather'), pat: on('calendar') };
  const g = [['sam', 'weather'], ['pat', 'calendar']];
  assert.equal(grantsHold(g, (m) => prefs[m]), true);
  prefs.pat = on();
  assert.equal(grantsHold(g, (m) => prefs[m]), false);
  assert.equal(grantsHold([['sam', 'threads']], () => on(...CATEGORIES)), false);
});

test('roles become plain words for speech — never names or ids', () => {
  assert.equal(rolesForSpeech('[partner] has the dentist at 5; [member:2] too.'), 'your partner has the dentist at 5; a family member too.');
});

test('sensitive-text backstop — adversarial: codes, accounts, cards, emails, phones, addresses stay on the device', () => {
  for (const s of ['Your code is 482913', 'The verification code is 4 8 2 9 1 3 — wait, 482913', 'Card 4111 1111 1111 1111', 'SSN 123-45-6789', 'your password is hunter2', 'Your PIN is 1234', 'routing number 021000021',
    'Pay the bank 450 dollars', 'IBAN GB29NWBK60161331926819', 'email sam@example.com', 'Call (555) 123-4567', 'Meet at 1600 Amphitheatre Parkway Drive', 'Meet at 12 Main St', 'the api key is abc', 'one-time code inside', 'Your OTP expires']) {
    assert.equal(looksSensitive(s), true, s);
  }
});
test('sensitive-text backstop — positive: ordinary answers pass', () => {
  for (const s of ["It'll be 62°F and dry at 2 PM.", 'Leave by 4:05 PM — about 18 minutes with traffic.', 'You have book club at 6 PM.', 'Recovery 63% and sleep 76%: an easier day.', 'Here it is. Check it and tap to confirm.', 'You have 1,240 kcal and 92 g of protein left.', 'Sunset is at 5:58 PM.']) {
    assert.equal(looksSensitive(s), false, s);
  }
  for (const p of Object.values(PHRASES)) assert.equal(looksSensitive(p), false);
});

test('the router: one decision point; cloud only when the family is on, you chose it, and the sentence is speakable', () => {
  assert.equal(routeVoice({ cloudOn: true, mode: 'cloud', speakable: true }), 'cloud');
  assert.equal(routeVoice({ cloudOn: false, mode: 'cloud', speakable: true }), 'device', 'the master switch wins over member settings');
  assert.equal(routeVoice({ cloudOn: true, mode: 'cloud', speakable: false }), 'device', 'no ticket → the phone');
  assert.equal(routeVoice({ cloudOn: true, mode: 'device', speakable: true }), 'device');
  assert.equal(routeVoice({ cloudOn: true, mode: 'off', speakable: true }), 'none');
  assert.equal(routeVoice({ cloudOn: false, mode: 'cloud', speakable: true, deviceOk: false }), 'none', 'text only when the phone cannot speak');
  assert.equal(routeVoice(), 'device');
});

test('provenance is built by code: owners from whose item it is, people as roles, no places or addresses', () => {
  const people = [{ id: 'sam', name: 'Sam', role: 'me' }, { id: 'pat', name: 'Pat', role: 'partner' }];
  const f = voiceFacts({ meId: 'sam', partnerId: 'pat', people,
    days: [{ date: '2026-11-01', items: [{ time: '18:00', title: 'Dinner with Pat', place: '12 Main St', who: 'sam' }, { time: '09:00', title: 'Dentist', who: 'pat' }, { time: '12:00', title: 'Lunch', who: ['sam', 'pat'] }, { allDay: true, title: 'Trash day', who: 'family' }] }],
    weather: [{ time: '14:00', f: 62 }], sun: [{ date: '2026-11-01', sunset: '17:58' }], travel: { places: [{ place: 'Movement', address: '1 Gym Way', drives: [{ leave: 'now', minutes: 18 }] }, { place: 'Nowhere', found: false }] },
    health: { recovery: { score: 63 } }, food: { left: { kcal: 900 }, meals: [{ meal: 'dinner', status: 'planned', title: 'Salmon', kcal: 600, foods: 'salmon 150 g' }] } });
  const by = (d) => f.filter((x) => x.d === d);
  assert.deepEqual(by('calendar').map((x) => x.o), ['sam', 'pat', 'both', 'family']);
  assert.equal(by('calendar')[0].v.title, 'Dinner with [partner]', 'names become roles');
  assert.ok(!JSON.stringify(f).includes('Main St') && !JSON.stringify(f).includes('Gym Way'), 'no places or addresses');
  assert.deepEqual([by('weather')[0].o, by('daylight')[0].o, by('travel')[0].o, by('health')[0].o, by('food')[0].o], ['public', 'public', 'sam', 'sam', 'sam']);
  assert.equal(by('travel').length, 1, 'a place not found is left out');
  assert.equal(by('food')[0].v.meals[0].foods, undefined, 'meal names only, not the foods');
});
