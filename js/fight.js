// ⚔️ The check-in fight: a fighting-game health bar under the Weight stats. Health is how
// regularly you checked in over the last 7 days — a morning weigh-in (+5) and each main meal
// logged (+3) — never how much the scale moved. Each Monday–Sunday week is a round with a ★ for
// whoever checked in more. Your partner's bar shows only when they share diet & fitness with
// you (their data is then on this phone). Everything is worked out here, on the phone.

import { healthDay, strongStreak } from './cheer.js';

export const POINTS = { weigh: 5, meal: 3 };
const DAY_MAX = POINTS.weigh + 3 * POINTS.meal; // 14
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

export function dayPoints(data, date) {
  const h = healthDay(data, date);
  return (h.weighed ? POINTS.weigh : 0) + h.meals.length * POINTS.meal;
}
// 0–100: the last 7 days, today included.
export function health(data, today) {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += dayPoints(data, shift(today, -i));
  return Math.round((sum / (7 * DAY_MAX)) * 100);
}
// The week a date falls in: Monday → Sunday.
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00`);
  const mon = shift(date, -((d.getDay() + 6) % 7));
  return { from: mon, to: shift(mon, 6) };
}
function weekScore(data, from, upTo) {
  let sum = 0, strong = 0;
  for (let i = 0; i < 7; i++) {
    const day = shift(from, i);
    if (day > upTo) break;
    sum += dayPoints(data, day);
    if (healthDay(data, day).strong) strong++;
  }
  return { score: Math.round((sum / (7 * DAY_MAX)) * 100), strong };
}
// The last few rounds, newest first: each player's score, and who won (finished weeks only).
export function rounds(me, rival, today, n = 4) {
  const out = [];
  let { from } = weekOf(today);
  for (let i = 0; i < n; i++) {
    const done = shift(from, 6) < today;
    const a = weekScore(me, from, today), b = rival ? weekScore(rival, from, today) : null;
    out.push({ from, done, me: a, rival: b, winner: !done || !b ? null : a.score > b.score ? 'me' : b.score > a.score ? 'rival' : 'tie' });
    from = shift(from, -7);
  }
  return out;
}
// What's still open today, for the line under the bar.
export function todayOpen(data, today) {
  const h = healthDay(data, today);
  return [...(h.weighed ? [] : [['⚖️ weigh in', POINTS.weigh]]), ...['breakfast', 'lunch', 'dinner'].filter((m) => !h.meals.includes(m)).map((m) => [m, POINTS.meal])];
}
export function fighter(data, today) {
  const hp = health(data, today), before = health(data, shift(today, -1));
  return { hp, drain: Math.max(hp, before), combo: strongStreak(data, today), danger: hp < 35 };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pips = (n, side) => `<div class="fg-pips ${side}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
const bar = (f, side) => `<div class="fg-bar ${side} ${f.danger ? 'low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${f.hp}"><i class="fg-drain" style="width:${f.drain}%"></i><i class="fg-hp" style="width:${f.hp}%"></i><i class="fg-shine"></i></div>`;

// The card: { me: {name, data}, rival: {name, data} | null, today, open (rules showing), prize }.
export function fightHtml({ me, rival, today, open = false, prize = '' }) {
  const a = fighter(me.data, today), b = rival ? fighter(rival.data, today) : null;
  const rs = rounds(me.data, rival?.data || null, today);
  const won = (who) => rs.filter((r) => r.winner === who).length;
  const weekNo = Math.ceil(+today.slice(8, 10) / 7);
  const left = todayOpen(me.data, today);
  const head = b
    ? `<div class="fg-hud">
        <div><div class="fg-name"><span>${esc(me.name)}</span><span>${a.hp}</span></div>${bar(a, 'l')}${pips(won('me'), 'l')}</div>
        <div class="fg-vs">WEEK<br>${weekNo}</div>
        <div><div class="fg-name r"><span>${esc(rival.name)}</span><span>${b.hp}</span></div>${bar(b, 'r')}${pips(won('rival'), 'r')}</div>
      </div>`
    : `<div class="fg-name"><span>${esc(me.name)} · health</span><span>${a.hp} / 100</span></div>${bar(a, 'r solo')}`;
  const tag = (f) => (f.combo >= 2 ? `<span class="fg-combo">🔥 ${f.combo}-DAY COMBO</span>` : f.danger ? '<span class="fg-warn">⚠️ DANGER</span>' : '<span></span>');
  const daysRow = b ? '' : `<div class="fg-days">${[6, 5, 4, 3, 2, 1, 0].map((i) => { const d = shift(today, -i); const p = dayPoints(me.data, d); return `<div class="fg-day ${p ? '' : i ? 'miss' : ''}" title="${d}"><i style="height:${Math.round((p / DAY_MAX) * 100)}%"></i><small>${i ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }) : 'Today'}</small></div>`; }).join('')}</div>`;
  return `<button type="button" class="fg-arena" data-fight="toggle" aria-expanded="${open}" aria-label="Check-in fight: ${esc(me.name)} ${a.hp}${b ? `, ${esc(rival.name)} ${b.hp}` : ''} out of 100. Tap for how it works.">
      ${head}
      <div class="fg-row">${tag(a)}${b ? tag(b) : `<span class="fg-best">${a.combo ? '' : 'Weigh in + 3 meals = a 💪 day'}</span>`}</div>
      ${daysRow}
    </button>
    <div class="fg-today small">${left.length ? `💪 <b>Today:</b> ${left.map(([w, p]) => `${esc(w)} <b class="good">+${p}</b>`).join(' · ')}` : '💪 <b>Today’s done</b> — a full check-in day.'}</div>
    ${!b ? '<p class="fg-note small muted">🤝 When your partner shares diet &amp; fitness with you, you’ll face off here.</p>' : ''}
    ${open ? `<div class="fg-rules">
      <b class="small">What fills your bar, each day</b>
      <ul class="fg-list"><li><span>⚖️ Morning weigh-in</span><b>+${POINTS.weigh}</b></li><li><span>🍳 Breakfast logged</span><b>+${POINTS.meal}</b></li><li><span>🥗 Lunch logged</span><b>+${POINTS.meal}</b></li><li><span>🍝 Dinner logged</span><b>+${POINTS.meal}</b></li><li><span>💪 All four in a day</span><b>combo</b></li><li><span>A day with nothing</span><b class="bad">drains</b></li></ul>
      <p class="tiny muted">Health is your last 7 days (14 a day). It’s about showing up — not about the scale. Each Monday–Sunday week is a round: whoever checks in more gets a ★.</p>
      ${b ? `<b class="small">Rounds</b><div class="fg-rounds">${rs.map((r) => `<span>${r.done ? new Date(`${r.from}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'This week'}</span><i><b style="width:${r.me.score}%"></b></i><i><b style="width:${r.rival.score}%"></b></i><em>${r.winner === 'me' ? `★ ${esc(me.name)}` : r.winner === 'rival' ? `★ ${esc(rival.name)}` : r.winner === 'tie' ? 'tie' : ''}</em>`).join('')}</div>
        <label class="fg-prize small">🎁 This month’s prize <input data-fightprize="1" maxlength="60" placeholder="e.g. loser plans date night" value="${esc(prize)}"></label>` : ''}
    </div>` : ''}`;
}
// A perfect week just finished (7 of 7 💪 days)? → that week's Monday, for a one-time "PERFECT!".
export function perfectWeek(data, today) {
  const { from } = weekOf(shift(weekOf(today).from, -1));
  return weekScore(data, from, shift(from, 6)).strong === 7 ? from : null;
}
