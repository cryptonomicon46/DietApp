// 🤒 Sick day (js/sickDay.js): turned on by you (Health or Talk), never guessed. No calorie cut
// (maintenance, same protein), left out of the weekly check-in, the on-target count and the weight
// trend; fluids, easy-to-eat foods and a Feel better list on Health. Ends with the day.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sickDay.js';
import { dailyTargets, weeklyReview } from '../js/plan.js';
import { onTarget, consistency } from '../js/dietDays.js';
import { PARTS, splitHealth } from '../js/healthParts.js';
import { sickAsk } from '../js/talkParse.js';
import { healthHtml, dietSummary, nextUp, nudgeFor } from '../family/health.js';

const D = await import('../js/dayPlan.js');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const today = '2026-11-03', yesterday = '2026-11-02';
const store = (d = {}) => ({ d, get: (k, f) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v; } });
const profile = { sex: 'male', age: 40, heightIn: 70, phase: 'cut', goalLb: 175, activity: 'light', pace: 'steady' };
const base = (extra = {}) => ({ profile, weights: [{ date: '2026-10-30', weight: 190 }], ...extra });

test('a sick day eats at maintenance: protein the same, the extra in the plan\'s carb : fat ratio', () => {
  const b = { ...dailyTargets(profile, 190) };
  assert.ok(b.tdee > b.kcal, 'a cut is below maintenance');
  const t = S.sickTargets(b);
  assert.equal(t.kcal, Math.round(b.tdee / 10) * 10);
  assert.equal(t.p, b.p, 'protein stays');
  assert.ok(t.c > b.c && t.f > b.f);
  const share = (b.c * 4) / (b.c * 4 + b.f * 9), extra = t.kcal - b.kcal;
  assert.ok(Math.abs(t.c - (b.c + (extra * share) / 4)) <= 1);
  // Already at or above maintenance (a lean gain): left as it is.
  const gain = { kcal: 3000, tdee: 2700, p: 180, c: 350, f: 90 };
  assert.equal(S.sickTargets(gain).kcal, 3000);
  // Only on the day it's on.
  const data = base({ sick: { [today]: { fluids: 0 } } });
  assert.equal(S.targetsForDay(b, data, today).kcal, t.kcal);
  assert.equal(S.targetsForDay(b, data, yesterday).kcal, b.kcal);
});

test('the day plan, the day summary and the check-in see it', () => {
  const off = base(), on = base({ sick: { [today]: { fluids: 2 } } });
  const tOff = D.targetsOf(off, today), tOn = D.targetsOf(on, today);
  assert.ok(tOn.kcal > tOff.kcal);
  assert.equal(tOn.p, tOff.p);
  const e = D.dayEntry(on, today);
  assert.equal(e.sick, true);
  assert.equal(e.plannedDeficit, 0, 'no deficit planned on a sick day');
  assert.equal(e.target, tOn.kcal);
  assert.equal(D.dayEntry(off, today).sick, undefined);
  // Not counted as on or off target, so being sick never reads as being off plan.
  assert.equal(onTarget({ eaten: 900, target: 2000, meals: 3, sick: true }), null);
  const days = { '2026-11-01': { eaten: 2000, target: 2000, meals: 3 }, [yesterday]: { eaten: 900, target: 2600, meals: 3, sick: true } };
  assert.deepEqual(consistency(days, today).marks.slice(-2).map((m) => m.state), ['on', 'none']);
});

test('the weekly check-in leaves sick days out of the food average and the weight trend', () => {
  const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  const days = week.map((date, i) => ({ date, eaten: i >= 5 ? 900 : 2000, target: 2000, ...(i >= 5 ? { sick: true } : {}) }));
  const weights = [['2026-10-19', 190], ['2026-10-22', 189.6], ['2026-10-26', 189.2], ['2026-10-29', 188.8], ['2026-10-31', 186.0], ['2026-11-01', 185.5]].map(([date, weight]) => ({ date, weight }));
  const o = { days, weights, targetKcal: 2000, targetRate: 1, floor: 1500, weightLb: 189, weeksIn: 3, plannedWeeks: 12, phase: 'cut' };
  const r = weeklyReview(o);
  assert.equal(r.logged, 5);
  assert.equal(r.avgIntake, 2000, 'the two sick days (900 kcal) are not averaged in');
  assert.equal(r.sickDays, 2);
  assert.match(r.notes.join(' '), /2 sick days left out/);
  // Without the sick days marked, the low-intake, water-loss days skew it.
  const plain = weeklyReview({ ...o, days: days.map(({ sick, ...d }) => d) });
  assert.ok(plain.avgIntake < 2000 && plain.lost > r.lost);
  // sickDates (from the trackers) count too.
  assert.equal(weeklyReview({ ...o, days: days.map(({ sick, ...d }) => d), sickDates: ['2026-10-31', '2026-11-01'] }).avgIntake, 2000);
  // Too few days left: it says why.
  const most = weeklyReview({ ...o, days: week.map((date, i) => ({ date, eaten: 2000, target: 2000, ...(i >= 3 ? { sick: true } : {}) })) });
  assert.match(most.why, /4 sick days this week/);
});

test('changes: on, off (with Undo), fluids, comforts — and only the last 120 days are kept', () => {
  const s = store({});
  assert.equal(S.setSick(s, today, true), null);
  assert.ok(S.isSick(s.d, today));
  assert.equal(S.addFluid(s, today, 1), 1);
  assert.equal(S.addFluid(s, today, 2), 3);
  assert.equal(S.addFluid(s, today, -5), 0, 'never below 0');
  assert.equal(S.toggleComfort(s, today, 'gargle'), true);
  assert.equal(S.toggleComfort(s, today, 'gargle'), false);
  S.toggleComfort(s, today, 'rest');
  const before = S.setSick(s, today, false);
  assert.ok(!S.isSick(s.d, today));
  assert.deepEqual(before.comfort, ['rest']);
  S.setSick(s, today, before); // Undo puts it back as it was
  assert.deepEqual(S.sickOf(s.d, today).comfort, ['rest']);
  const old = store({ sick: Object.fromEntries(Array.from({ length: 130 }, (_, i) => [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), { fluids: 0 }])) });
  S.setSick(old, today, true);
  assert.equal(Object.keys(old.d.sick).length, S.KEEP_DAYS);
  assert.ok(old.d.sick[today]);
  // A run of sick days, and the next-morning question.
  const run = { sick: { '2026-11-01': {}, [yesterday]: {}, [today]: {} } };
  assert.equal(S.sickRun(run, today), 3);
  assert.equal(S.askStillSick({ sick: { [yesterday]: {} } }, today), true);
  assert.equal(S.askStillSick(run, today), false);
});

test('a sick day\'s weigh-in stays out of the trend; it lives in the Diet part', () => {
  const ws = [{ date: '2026-10-30', weight: 190 }, { date: yesterday, weight: 186 }, { date: today, weight: 187 }];
  assert.deepEqual(S.trendWeights(ws, { sick: { [yesterday]: {} } }).map((w) => w.date), ['2026-10-30', today]);
  assert.ok(PARTS.diet.includes('sick'));
  assert.deepEqual(Object.keys(splitHealth({ sick: { [today]: {} } }).diet), ['sick']);
  assert.equal(Object.keys(splitHealth({ sick: {} }).fitness).length, 0, 'not shared with Fitness-only viewers');
});

test('easy-to-eat foods: sensible macros, filters, and what a pick becomes', () => {
  for (const f of S.EASY_FOODS) {
    const kcal = f.p * 4 + f.c * 4 + f.f * 9;
    assert.ok(Math.abs(kcal - f.kcal) <= Math.max(25, f.kcal * 0.2), `${f.name}: ${kcal} vs ${f.kcal}`);
    assert.ok(f.tags.every((t) => t in S.EASY_TAGS), f.name);
  }
  assert.ok(S.easyFoods('stomach').every((f) => f.tags.includes('stomach')));
  assert.ok(S.easyFoods('stomach').some((f) => f.id === 'crackers'));
  assert.equal(S.easyFoods().length, S.EASY_FOODS.length);
  assert.ok(S.QUICK_EASY.every((id) => S.easyFood(id)));
  const e = S.easyEntry(S.easyFood('soup'));
  assert.deepEqual(e.prepared, { name: 'Chicken noodle soup', kcal: 190, p: 14, c: 20, f: 6, servings: 1, icon: '🥣' });
  // Logged into a meal like any fixed entry.
  const s = store(base());
  const m = D.logAs(s, today, 'lunch', e);
  assert.equal(m.kcal, 190);
  assert.equal(m.title.replace(/^\p{Extended_Pictographic}️?\s*/u, ''), 'Chicken noodle soup');
  // Feel better: drinks count as cups; ones with calories are logged; no medicines anywhere.
  assert.equal(S.drinkExtra(S.feelDrink('water')), null);
  assert.equal(S.drinkExtra(S.feelDrink('honeytea')).kcal, 25);
  assert.equal(S.feelDrink('electrolyte').cups, 2);
  const all = JSON.stringify([S.FEEL_DRINKS, S.COMFORTS, S.EASY_FOODS]);
  assert.ok(!/ibuprofen|acetaminophen|paracetamol|tylenol|advil|decongestant|zinc|antibiotic|tamiflu/i.test(all));
  assert.match(S.CARE_LINE, /pharmacist/);
  assert.match(S.FEEL_DRINKS[0].sub, /babies under 1/);
});

test('Health on a sick day: the banner, weigh-in skipped, fluids, easy picks, rest, Feel better', () => {
  const data = base({ sick: { [today]: { fluids: 3, comfort: ['gargle'] } } });
  const workout = { state: 'planned', title: 'Upper Body', html: () => '<div class="hl-row2">Upper Body · Start</div>' };
  const h = healthHtml(data, { esc, today, hour: 12, sharing: '', workout });
  assert.match(h, /🤒 Sick day<\/b>/);
  assert.match(h, /data-sick="off"/);
  assert.match(h, /Weigh-in skipped/);
  assert.ok(!h.includes('id="hlWeigh"'), 'no weigh-in form unless you ask');
  assert.match(h, /Fluids · 3 of 8 cups/);
  assert.match(h, /data-sick="easy:breakfast:soup"/);
  assert.match(h, /Rest today/);
  assert.ok(!h.includes('Upper Body · Start'));
  assert.match(h, /Feel better/);
  assert.match(h, /data-sick="comfort:gargle"[^>]*>|aria-pressed="true" data-sick="comfort:gargle"/);
  assert.match(h, /hl-pill">maintenance/);
  assert.match(h, /left out of your plan&#39;s progress|left out of your plan's progress/);
  assert.ok(!h.includes('data-sick="on"'), 'no Turn on while it is on');
  // Weigh anyway / Show workout.
  const h2 = healthHtml(data, { esc, today, hour: 12, sharing: '', workout, sickWeigh: true, sickWorkout: true });
  assert.ok(h2.includes('id="hlWeigh"') && h2.includes('Upper Body · Start'));
  // Nudges: no weigh-in or workout nudge, fluids instead.
  assert.equal(nextUp({ hour: 8, weighed: false, sick: true, food: {} }).anchor, null);
  assert.equal(nextUp({ hour: 8, weighed: false, sick: true, food: {} }).text, 'rest and fluids');
  assert.match(nudgeFor(dietSummary(data, today), { hour: 8 }), /fluids first/);
  // The calories shown are maintenance.
  assert.equal(dietSummary(data, today).today.kcalTarget, D.targetsOf(data, today).kcal);
});

test('Health on an ordinary day: a quiet Turn on in More, and the morning after asks', () => {
  const h = healthHtml(base(), { esc, today, hour: 9, sharing: '' });
  assert.match(h, /data-sick="on"><span>🤒 Sick day/);
  assert.ok(!h.includes('Feel better') && !h.includes('Still feeling sick'));
  const after = healthHtml(base({ sick: { [yesterday]: { fluids: 5 } } }), { esc, today, hour: 9, sharing: '' });
  assert.match(after, /Still feeling sick\?/);
  assert.match(after, /data-sick="better"/);
  assert.ok(!healthHtml(base({ sick: { [yesterday]: {} } }), { esc, today, hour: 9, sharing: '', sickAsked: true }).includes('Still feeling sick'));
  // Not set up yet: nothing about sick days.
  assert.ok(!healthHtml({}, { esc, today, hour: 9, sharing: '' }).includes('data-sick'));
});

test('Talk reads "I\'m sick today" and "I\'m feeling better" — only about you', () => {
  for (const t of ["I'm sick today", 'I have a cold', "I've got the flu", 'Not feeling well', 'feeling under the weather', 'Make today a sick day', 'I have a fever and a sore throat', 'I feel ill'])
    assert.deepEqual(sickAsk(t), { on: true }, t);
  for (const t of ["I'm feeling better", 'End my sick day', "I'm not sick anymore"]) assert.deepEqual(sickAsk(t), { on: false }, t);
  for (const t of ["I'm sick of chicken", 'Pat is sick', 'I have a cold brew', 'Log dinner: chicken soup', 'Add a cold drink to lunch', 'How do I log a meal']) assert.equal(sickAsk(t), null, t);
});
