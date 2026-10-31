// 🎉 The pure part of logging encouragement, shared by the trackers (js/cheer.js) and Health
// (family/meals.js, family/app.js) without the trackers' storage: what got done today, the
// encouraging lines, and what to say (and how big the confetti is) right after logging.
export const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'];

// ---------- pure (tested) ----------
// What got done on `date`: weigh-in, and which main meals were logged.
export function healthDay({ weights = [], eaten = {}, mealLog = {} }, date) {
  const log = eaten.date === date ? eaten : mealLog[date] || {};
  const meals = MAIN_MEALS.filter((m) => log.meals?.[m]);
  const weighed = weights.some((w) => w.date === date);
  return { weighed, meals, strong: weighed && meals.length === MAIN_MEALS.length };
}
export const LINES = {
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
export const pick = (list, date) => list[(+date.slice(8, 10)) % list.length];
// 🎉 What to say (and how big the confetti is) right after logging: a meal → how many of today's
// three, all three (or weigh-in + all three) → a milestone; a weigh-in → the mornings in a row.
export function weighStreak(weights = [], today) {
  const have = new Set(weights.map((w) => w.date));
  const d = new Date(`${today}T12:00:00`);
  const iso = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let n = 0;
  while (have.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function logCheer(day, date, { meal = null, weighStreak: streak = 0 } = {}) {
  if (day.strong) return { line: pick(LINES.strong, date), big: true };
  if (meal) {
    const n = day.meals.length;
    if (!MAIN_MEALS.includes(meal)) return { line: `🎉 Logged — ${n} of 3 meals so far today`, big: false };
    if (n === MAIN_MEALS.length) return { line: '🎉 All three meals logged today — that\'s the habit.', big: true };
    return { line: `🎉 ${n} of 3 meals logged today`, big: false };
  }
  const big = streak >= 7 && streak % 7 === 0;
  return { line: streak >= 2 ? `🎉 ${streak} mornings in a row${big ? ` — ${streak === 7 ? 'a full week' : `${streak / 7} weeks`}!` : ''}` : pick(LINES.weigh, date), big };
}

