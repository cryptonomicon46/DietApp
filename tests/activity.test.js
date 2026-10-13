import test from 'node:test';
import assert from 'node:assert/strict';
import { intraWorkoutCarbs, trainingDay, applyTraining, fromWhoop, fromStrava, parseGarminCsv, classify } from '../js/activity.js';
import { dailyTargets, mealTargets } from '../js/plan.js';

const profile = { sex: 'male', age: 35, heightIn: 70, activity: 'tracked', pace: 'steady', goalLb: 180 };
const ctx = { bmr: 1900, weightKg: 95, tracked: true };

test('intra-workout carbs follow Jeukendrup duration bands', () => {
  assert.equal(intraWorkoutCarbs('hard', 40), null, 'under 45 min: none');
  assert.equal(intraWorkoutCarbs('strength', 120), null, 'not for lifting');
  assert.equal(intraWorkoutCarbs('easy', 60), null);
  assert.equal(intraWorkoutCarbs('hard', 60).perHour, 30);
  assert.equal(intraWorkoutCarbs('moderate', 120).grams, 80);
  assert.equal(intraWorkoutCarbs('hard', 120).perHour, 60);
  const ultra = intraWorkoutCarbs('hard', 180);
  assert.equal(ultra.perHour, 90);
  assert.equal(ultra.grams, 270);
  assert.ok(ultra.mixed);
});

test('rest day adds nothing; heavy cardio adds carbs and intra fuel', () => {
  const rest = trainingDay([], null, ctx);
  assert.equal(rest.label, 'Rest day');
  assert.equal(rest.extraKcal, 0);

  const heavy = trainingDay([], { type: 'hard', minutes: 120 }, ctx);
  assert.equal(heavy.label, 'Heavy cardio day');
  assert.ok(heavy.extraKcal > 800 && heavy.extraKcal < 1300, `${heavy.extraKcal}`);
  const base = dailyTargets(profile, 210);
  const t = applyTraining(base, heavy);
  assert.equal(t.p, base.p);
  assert.equal(t.f, base.f);
  assert.equal(t.c - base.c, Math.round(heavy.extraKcal / 4));
  assert.equal(t.intraC, 60 * 2);
  // Intra carbs are removed from the meals.
  const meals = mealTargets(t);
  const mealC = meals.breakfast.c + meals.lunch.c + meals.dinner.c;
  assert.ok(Math.abs(mealC + t.intraC - t.c) <= 3);
});

test('untracked profiles keep calories but still get fuel advice', () => {
  const d = trainingDay([], { type: 'hard', minutes: 120 }, { ...ctx, tracked: false });
  assert.equal(d.extraKcal, 0);
  assert.ok(d.intra);
});

test('wearable calories are discounted', () => {
  const d = trainingDay([{ id: 'x', start: '2026-10-13T07:00', minutes: 60, kcal: 800, name: 'Running' }], null, ctx);
  const net = (800 - 1900 / 1440 * 60) * 0.75;
  assert.ok(Math.abs(d.extraKcal - net) <= 5);
});

test('classify intensity', () => {
  assert.equal(classify({ name: 'Weightlifting', minutes: 60 }, 90), 'strength');
  assert.equal(classify({ name: 'Running', strain: 15.2, minutes: 60 }, 90), 'hard');
  assert.equal(classify({ name: 'Cycling', strain: 8, minutes: 60 }, 90), 'easy');
  assert.equal(classify({ name: 'Run', kcal: 900, minutes: 60 }, 90), 'hard');
});

test('normalize WHOOP, Strava and Garmin CSV', () => {
  const w = fromWhoop({ id: 'u1', start: '2026-10-13T12:00:00Z', end: '2026-10-13T13:30:00Z', sport_name: 'cycling', score_state: 'SCORED', score: { strain: 14.6, kilojoule: 4184, average_heart_rate: 150 } });
  assert.deepEqual([w.minutes, w.kcal, w.strain], [90, 1000, 14.6]);
  assert.equal(fromWhoop({ id: 'u2', score_state: 'PENDING_SCORE' }), null);

  const s = fromStrava({ id: 9, sport_type: 'Run', start_date_local: '2026-10-13T07:00:00Z', moving_time: 3600, calories: 712.4 });
  assert.deepEqual([s.minutes, s.kcal, s.source], [60, 712, 'Garmin via Strava']);

  const csv = '﻿Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR\r\n' +
    'Running,2026-10-13 07:01:00,false,"Morning, Run",6.2,"1,050",01:05:30,151\r\n' +
    'Strength Training,2026-10-12 18:00:00,false,Lift,0.00,320,45:00,110\r\n';
  const g = parseGarminCsv(csv);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].name, g[0].kcal, g[0].minutes, g[0].avgHr], ['Running', 1050, 66, 151]);
  assert.equal(g[1].minutes, 45);
  assert.throws(() => parseGarminCsv('a,b\n1,2\n'));
});

test('fuel advice drops once the planned cardio has synced', () => {
  const planned = { type: 'hard', minutes: 120 };
  assert.ok(trainingDay([], planned, ctx).intra);
  const synced = [{ id: 'w', start: '2026-10-13T07:00', minutes: 110, kcal: 1300, strain: 15, name: 'Cycling' }];
  assert.equal(trainingDay(synced, planned, ctx).intra, null);
  assert.equal(intraWorkoutCarbs('hard', 120).options[0].label, '4½ bananas');
});
