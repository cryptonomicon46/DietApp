// 🥗 Calm Diet feedback, shared by Health (family app) and the trackers: is a day on target, and
// how many of the last 7 were. No coins, cookies or streaks to lose.
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// A day "on target": its meals logged, and calories within ±10% of the day's target (at least
// ±150 kcal). Calm and simple: no coins, no streaks to lose.
export function onTarget(day) {
  if (!day || !(day.eaten > 0) || !(day.target > 0)) return null; // nothing logged: not counted
  const logged = (day.meals ?? 3) >= 3 || day.eaten >= day.target * 0.6;
  if (!logged) return null;
  return Math.abs(day.eaten - day.target) <= Math.max(150, day.target * 0.1);
}
// "5 of the last 7 days on target" — the 7 days before today (today isn't over yet).
export function consistency(days = {}, today, n = 7) {
  const marks = [];
  for (let i = n; i >= 1; i--) { const date = shift(today, -i); const r = onTarget(days[date]); marks.push({ date, state: r == null ? 'none' : r ? 'on' : 'off' }); }
  return { on: marks.filter((m) => m.state === 'on').length, logged: marks.filter((m) => m.state !== 'none').length, of: n, marks };
}


// 🔥 Eaten against burned today, for the header. The plan's target already has the deficit built in,
// so being over the plan can still be a deficit — this says which. `source` as js/dayPlan.js burnedOf
// gives it (WHOOP so far, a WHOOP total you typed, or an estimate). The header prefers WHOOP's own
// number when there is one, so it matches the WHOOP app.
export function burnSummary({ burned, source = '', eaten }) {
  if (!(burned > 0) || !(eaten > 0)) return null;
  const diff = Math.round(burned - eaten);
  const from = /so far/i.test(source) ? 'WHOOP, so far' : /whoop/i.test(source) ? 'WHOOP' : 'estimate for today';
  return { burned: Math.round(burned), from, deficit: diff >= 0, kcal: Math.abs(diff) };
}
