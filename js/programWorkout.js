// 📋 The trackers' lifting program (js/lifting.js: full body, 3 days a week, a 6-week block) as an
// input to Today's Workout. It makes an ordinary workout (js/workout.js) for the next program day;
// you do it in Train like any other, and the finished workout remembers which program day it was,
// so the program moves on and next time's weights come from what you actually lifted.
// Older sessions logged in the trackers' own logger still count (they're read, never rewritten).
import { DAYS, WEEKS, EXERCISES, setsFor, blockPosition, suggestLoad, mergeSlots, applyOrder } from './lifting.js';
import { normalize } from './workout.js';

// Set up = you've used the program before, or chose it (Fitness › Set up a lifting program).
export const programOn = (lift) => !!(lift && (lift.on || (lift.sessions || []).length));

// A finished program workout, read the way the program's own sessions are (for loads and position).
export function toLiftSession(w) {
  if (!w.program) return null;
  return {
    date: w.date, block: w.program.block, day: w.program.day, week: w.program.week,
    entries: w.blocks.flatMap((b) => b.items).filter((it) => it.ref && EXERCISES[it.ref]).map((it) => ({
      exercise: it.ref,
      // Bodyweight sets carry a token load of 1: the program reads only their reps.
      sets: it.sets.filter((s) => s.done).map((s) => ({ w: s.bw ? 1 : (s.got?.weight ?? s.weight) || 0, r: s.got?.reps ?? s.reps ?? 0, ...(s.bw ? { bw: true } : {}) })),
    })).filter((e) => e.sets.length),
  };
}
// Everything done in the program, oldest first: the trackers' sessions and finished program workouts.
export function programSessions(lift = {}, log = []) {
  const fromLog = log.filter((w) => w.status === 'done' && w.program).map(toLiftSession).filter(Boolean);
  return [...(lift.sessions || []), ...fromLog].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
// Where you are: the next day and week of this block.
export function programNext(lift = {}, log = []) {
  const block = +lift.block || 1;
  const pos = blockPosition(programSessions(lift, log).filter((s) => (+s.block || 1) === block).length);
  return { block, ...pos, title: DAYS[pos.day].title, weekLabel: WEEKS[pos.week - 1].label, rir: WEEKS[pos.week - 1].rir };
}
const restSec = (txt) => { const n = String(txt || '').match(/\d+/g)?.map(Number) || []; return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 60) : null; };

// The next program day as a workout. bodyWeight: for bodyweight moves' notes (optional).
export function programWorkout(lift = {}, log = [], { date = '', day, week } = {}) {
  const next = programNext(lift, log);
  const d = day && DAYS[day] ? day : next.day, wk = week || next.week, wkInfo = WEEKS[wk - 1];
  const history = programSessions(lift, log);
  const slots = applyOrder(mergeSlots(DAYS[d].slots, lift.kept?.[d] || []), lift.order?.[d]);
  const blocks = slots.map((slot, i) => {
    const ex = (lift.choices || {})[slot.id] && EXERCISES[lift.choices[slot.id]] ? lift.choices[slot.id] : slot.default;
    const e = EXERCISES[ex];
    const load = suggestLoad(ex, slot, history, wk);
    const n = setsFor(slot, wk, slot.added ? 99 : i, (lift.extraSets || {})[slot.id] || 0);
    const [lo, hi] = slot.reps;
    return {
      rounds: n, rest: restSec(slot.rest), note: `${lo}–${hi} reps · ${wkInfo.rir} reps in reserve · rest ${slot.rest}`,
      items: [{ name: e.name, ref: ex, note: load.text, sets: Array.from({ length: n }, () => (e.bw ? { reps: hi, bw: true } : { reps: hi, weight: load.weight })) }],
    };
  });
  return normalize({
    title: `Full body · ${DAYS[d].title}`, date, status: 'planned', source: 'program',
    notes: `${wkInfo.label}. ${wkInfo.note}`, program: { block: next.block, day: d, week: wk }, blocks,
  });
}
