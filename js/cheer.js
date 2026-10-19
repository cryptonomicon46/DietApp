// 💪 Encouragement for checking in: a short line after the morning weigh-in and each logged
// meal (inline, never a pop-up), and a 💪 on days you weighed in and logged your meals.
import { PROFILES, profileStore } from './storage.js';

export const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'];

// ---------- pure (tested) ----------
// What got done on `date`: weigh-in, and which main meals were logged.
export function healthDay({ weights = [], eaten = {}, mealLog = {} }, date) {
  const log = eaten.date === date ? eaten : mealLog[date] || {};
  const meals = MAIN_MEALS.filter((m) => log.meals?.[m]);
  const weighed = weights.some((w) => w.date === date);
  return { weighed, meals, strong: weighed && meals.length === MAIN_MEALS.length };
}
// Days in a row (ending today, or yesterday while today is still open) marked 💪.
export function strongStreak(data, today) {
  const d = new Date(`${today}T12:00:00`);
  const iso = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (!healthDay(data, today).strong) d.setDate(d.getDate() - 1);
  let n = 0;
  while (healthDay(data, iso(d)).strong) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const LINES = {
  weigh: [
    'Weigh-in done — showing up is the habit that wins. ☀️',
    'Morning check-in ✓. Data, not drama: the trend tells the story.',
    'Up and on the scale — nice way to start the day. 💚',
    'Checked in before the day got busy. That consistency adds up.',
  ],
  breakfast: ['Breakfast logged — strong start. 🍳', 'Fuel in, day on track. Nice work.', 'First meal checked in. Keep it rolling.'],
  lunch: ['Lunch logged — halfway there. 🥗', 'Midday check-in ✓. Steady wins.', 'Lunch in the books. You\'re on it.'],
  dinner: ['Dinner logged — day nearly wrapped. 🌙', 'Evening check-in ✓. Proud of the follow-through.', 'Last meal logged. Rest well tonight.'],
  strong: ['💪 Weigh-in + every meal logged — you took care of yourself today.', '💪 Full check-in today. This is what progress is made of.', '💪 Everything logged. Future you says thanks.'],
};
const pick = (list, date) => list[(+date.slice(8, 10)) % list.length];
// A lower weigh-in than last time: a short "on track" plus a line to keep the momentum.
const WISDOM = ['Small steps, every day.', 'Consistency beats intensity.', 'Trust the trend, not the day.', 'Protein first, then the rest.', 'Progress, not perfection.', 'Keep showing up.', 'One good meal at a time.'];
export function lowerCheer(down, newLow, date) {
  if (!(down > 0)) return '';
  return `${newLow ? '🎉 New low' : '📉'} −${down.toFixed(1)} lb — you're on the right track. ${pick(WISDOM, date)}`;
}
// The line to show for what was just done (or the day so far).
export function cheerFor(day, date, just) {
  if (day.strong) return pick(LINES.strong, date);
  if (just && LINES[just]) return pick(LINES[just], date);
  return '';
}

// ---------- data ----------
export const personData = (id) => {
  const s = profileStore(id);
  return { weights: s.get('weights', []), eaten: s.get('eaten', {}), mealLog: s.get('mealLog', {}) };
};
// {date: [person ids]} — days each of you checked in fully, for the calendar.
export function strongDaysByPerson(from, to) {
  const out = {};
  for (const p of PROFILES) {
    const data = personData(p.id);
    const dates = new Set([...data.weights.map((w) => w.date), ...Object.keys(data.mealLog), data.eaten.date].filter((d) => d && d >= from && d <= to));
    for (const d of dates) if (healthDay(data, d).strong) (out[d] ||= []).push(p.id);
  }
  return out;
}
