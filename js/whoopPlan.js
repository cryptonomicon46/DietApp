// ⌚ WHOOP facts for planning a day (Talk's fitness.day, js/talkActions.js). Kept apart from
// js/whoopDay.js so the WHOOP card on Home doesn't load the workout model (js/workout.js) with it.
import { recoveryContext } from './whoopDay.js';
import { durationFor } from './workout.js';

// 🧭 The one read-only interface a future planner gets (docs/TALK_TO_PAWMILY.md): structured
// facts only — no prose, no names, notes, history, raw stages, calendar, family, Threads, meals or
// location. Not sent anywhere in Health 2 Phase B.
export function dayContextForPlanning({ daily = {}, today, workout = null, history = [] } = {}) {
  const c = recoveryContext(daily, today);
  const dur = workout ? durationFor(workout, history) : null;
  return {
    date: today,
    recovery: { state: c.recovery.state, scoreBand: c.recovery.band, relativeToUsual: c.recovery.relative },
    sleep: { hours: c.sleep.hours ?? null, neededHours: c.sleep.neededHours ?? null, deficitMinutes: c.sleep.deficitMinutes ?? null },
    strain: { yesterday: c.strain.yesterday, today: c.strain.today },
    plannedWorkout: workout ? { id: workout.id, name: workout.title, estimatedMinutes: dur?.minutes ?? null, status: workout.status } : null,
  };
}
