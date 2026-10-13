// Daily deficit game. Each logged day earns gold coins for a calorie deficit, a bonus
// for keeping that deficit sustainable, and a cookie for hitting protein. Streaks of
// deficit days unlock milestone bonuses. Huge deficits earn no bonus: the goal is a
// steady 0.5–1%/week loss, not starving (Helms et al. 2014; Garthe et al. 2011).

export const COINS = { deficit: 10, sustainable: 5 };
export const MILESTONES = [
  { days: 3, coins: 15, badge: 'Hat trick' },
  { days: 7, coins: 40, badge: 'Full week' },
  { days: 14, coins: 100, badge: 'Two-week streak' },
  { days: 30, coins: 250, badge: 'Month of discipline' },
];

// day = {eaten, burned, target, plannedDeficit, protein, proteinTarget, floor}
export function scoreDay(day) {
  if (!day || !(day.eaten > 0)) return { coins: 0, cookies: 0, deficit: 0, status: 'unlogged', notes: ['Log your meals to earn coins.'] };
  const deficit = Math.round(day.burned - day.eaten);
  const notes = [];
  let coins = 0, cookies = 0;
  let status = 'surplus';
  if (deficit > 0) {
    coins += COINS.deficit;
    status = 'deficit';
    notes.push(`Deficit day +${COINS.deficit}`);
    const cap = Math.max(750, (day.plannedDeficit || 500) * 1.5);
    if (deficit > cap || day.eaten < day.floor) {
      status = 'too-big';
      notes.push('Deficit too large for a bonus. Eat a bit more to protect muscle and energy.');
    } else {
      coins += COINS.sustainable;
      notes.push(`Sustainable pace +${COINS.sustainable}`);
    }
  }
  if (day.proteinTarget && day.protein >= day.proteinTarget * 0.9) {
    cookies += 1;
    notes.push('Protein goal 🍪');
  }
  return { coins, cookies, deficit, status, notes };
}

const prevDate = (iso) => {
  const d = new Date(iso + 'T12:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Totals over all recorded days, including streak milestones.
// `today` counts toward the streak only once it is already a deficit day.
export function tally(days, today) {
  const dates = Object.keys(days).sort();
  let coins = 0, cookies = 0, best = 0, run = 0, prev = null;
  const badges = [];
  for (const date of dates) {
    const s = scoreDay(days[date]);
    coins += s.coins;
    cookies += s.cookies;
    const ok = s.status === 'deficit' || s.status === 'too-big';
    run = ok ? (prev && prevDate(date) === prev ? run + 1 : 1) : 0;
    prev = ok ? date : null;
    best = Math.max(best, run);
    const m = MILESTONES.find((x) => x.days === run);
    if (m) { coins += m.coins; badges.push({ ...m, date }); }
  }
  // Current streak: count back from today (or yesterday if today isn't a deficit yet).
  let streak = 0;
  let cursor = scoreDay(days[today]).status.match(/deficit|too-big/) ? today : prevDate(today);
  while (days[cursor] && /deficit|too-big/.test(scoreDay(days[cursor]).status)) { streak++; cursor = prevDate(cursor); }
  const next = MILESTONES.find((m) => m.days > streak);
  return { coins, cookies, streak, best, badges, next };
}
