// ❤️ The health meter: a fighting-game face-off for checking in, under the Gold Card. Each
// Monday–Sunday week is a round: the meter fills with that week's check-ins — a morning weigh-in
// (+5) and each main meal logged (+3), never what the scale says — and starts empty each Monday.
// Whoever has more on Sunday night wins the round (a tie: a ★ each); whoever wins the most rounds
// in a month is the month's champion (a tie: the most points). A week that spans two months counts
// for the month most of its days are in. Your partner's meter shows only when they share diet &
// fitness with you (their data is then on this phone). Everything is worked out here, on the phone.

import { healthDay, strongStreak } from './cheer.js';

export const POINTS = { weigh: 5, meal: 3 };
const DAY_MAX = POINTS.weigh + 3 * POINTS.meal; // 14
export const WEEK_MAX = 7 * DAY_MAX; // 98
// Who you look like on the meter: a face and something to fight in.
export const FACES = ['👱🏻‍♂️', '👩🏾‍🦱', '🧔🏽', '👩🏻‍🦰', '🧑🏿', '👨🏻‍🦲', '👩🏽', '🧑🏻', '🥷', '👸🏾', '🦸🏻‍♂️', '🦸🏽‍♀️', '🧙🏼', '🐶'];
export const KITS = { gi: '🥋', gloves: '🥊', kicks: '🦵', none: '' };

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long' });

export function dayPoints(data, date) {
  const h = healthDay(data, date);
  return (h.weighed ? POINTS.weigh : 0) + h.meals.length * POINTS.meal;
}
// The week a date falls in: Monday → Sunday.
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00`);
  const mon = shift(date, -((d.getDay() + 6) % 7));
  return { from: mon, to: shift(mon, 6) };
}
// The month a round counts for: the one its Thursday is in (most of its days).
export const roundMonth = (from) => shift(from, 3).slice(0, 7);
// A month's rounds: the Mondays of the weeks that count for it (4 or 5).
export function monthRounds(month) {
  let { from } = weekOf(`${month}-01`);
  if (roundMonth(from) < month) from = shift(from, 7);
  const out = [];
  for (; roundMonth(from) === month; from = shift(from, 7)) out.push(from);
  return out;
}
// A week's points up to `upTo` (the whole week once it's over), and its full days.
export function weekPoints(data, from, upTo = shift(from, 6)) {
  let pts = 0, strong = 0;
  for (let i = 0; i < 7; i++) {
    const day = shift(from, i);
    if (day > upTo) break;
    pts += dayPoints(data, day);
    if (healthDay(data, day).strong) strong++;
  }
  return { pts, strong };
}
// Nobody checked in (0–0): no winner, no ★.
const winnerOf = (a, b) => (b == null || (!a && !b) ? null : a > b ? 'me' : b > a ? 'rival' : 'tie');
// Every round in a month: dates, both scores, and who won the finished ones.
export function roundsOf(me, rival, month, today) {
  return monthRounds(month).map((from, i) => {
    const to = shift(from, 6), done = to < today, started = from <= today;
    const a = started ? weekPoints(me, from, today).pts : null, b = started && rival ? weekPoints(rival, from, today).pts : null;
    return { n: i + 1, from, to, done, now: started && !done, me: a, rival: b, winner: done ? winnerOf(a, b) : null };
  });
}
// The month so far: rounds won (a tie gives both a ★), points, and — once its last round is
// over — the champion (most rounds, then most points; 'tie' if both are level).
export function monthResult(me, rival, month, today) {
  const rs = roundsOf(me, rival, month, today);
  const wins = (who) => rs.filter((r) => r.winner === who || r.winner === 'tie').length;
  const pts = (k) => rs.reduce((n, r) => n + (r[k] || 0), 0);
  const res = { month, rounds: rs, meWins: wins('me'), rivalWins: rival ? wins('rival') : 0, mePts: pts('me'), rivalPts: pts('rival'), over: rs.every((r) => r.done) };
  res.champion = !res.over || !rival ? null : res.meWins !== res.rivalWins ? (res.meWins > res.rivalWins ? 'me' : 'rival') : winnerOf(res.mePts, res.rivalPts);
  return res;
}
// The round today is in, and the month it counts for.
export function currentRound(today) {
  const { from } = weekOf(today), month = roundMonth(from);
  return { from, month, n: monthRounds(month).indexOf(from) + 1, daysLeft: Math.round((new Date(`${shift(from, 6)}T12:00:00`) - new Date(`${today}T12:00:00`)) / 864e5) + 1 };
}
// What's still open today, for the line under the meter.
export function todayOpen(data, today) {
  const h = healthDay(data, today);
  return [...(h.weighed ? [] : [['⚖️ weigh in', POINTS.weigh]]), ...['breakfast', 'lunch', 'dinner'].filter((m) => !h.meals.includes(m)).map((m) => [m, POINTS.meal])];
}
// A perfect week just finished (7 of 7 💪 days)? → that week's Monday, for a one-time "PERFECT!".
export function perfectWeek(data, today) {
  const from = shift(weekOf(today).from, -7);
  return weekPoints(data, from).strong === 7 ? from : null;
}
// The one-time moment to show over the stage, newest news first: the month's champion (after
// its last round), last round's K.O., then "ROUND n · FIGHT!" — each until it's been seen.
export function momentFor(me, rival, today, seen = {}) {
  const cur = currentRound(today), last = shift(cur.from, -7), lastMonth = roundMonth(last);
  if (rival && lastMonth !== cur.month && seen.champ !== lastMonth) return { kind: 'champ', key: lastMonth, ...monthResult(me, rival, lastMonth, today) };
  if (rival && seen.ko !== last) {
    const a = weekPoints(me, last).pts, b = weekPoints(rival, last).pts;
    if (a || b) return { kind: 'ko', key: last, n: monthRounds(lastMonth).indexOf(last) + 1, me: a, rival: b, winner: winnerOf(a, b) };
  }
  if (seen.fight !== cur.from) return { kind: 'fight', key: cur.from, n: cur.n };
  return null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const faceOf = (p) => `${esc(FACES.includes(p.face) ? p.face : '🧑')}${KITS[p.kit] ? `<i>${KITS[p.kit]}</i>` : ''}`;
const stars = (n, of) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');
const sideHtml = (p, pts, wins, of, side, mine) => `<div class="hm-side ${side}">
    <button type="button" class="hm-face" ${mine ? 'data-fighter="1" aria-label="Choose your fighter"' : 'tabindex="-1" aria-hidden="true"'}>${faceOf(p)}</button>
    <div class="hm-mid"><div class="hm-bar ${side}" role="meter" aria-label="${esc(p.name)}: ${pts} of ${WEEK_MAX}" aria-valuemin="0" aria-valuemax="${WEEK_MAX}" aria-valuenow="${pts}"><i style="width:${Math.round((pts / WEEK_MAX) * 100)}%"></i></div>
      <div class="hm-nm ${side}"><b>${esc(p.name)}</b><em>${pts}</em></div><span class="hm-stars ${side}" aria-label="${wins} round${wins === 1 ? '' : 's'} won">${stars(wins, of)}</span></div></div>`;
const who = (w, me, rival) => (w === 'me' ? esc(me.name) : w === 'rival' ? esc(rival.name) : '');
function momentHtml(m, me, rival, prize) {
  if (!m) return '';
  const tap = '<small class="hm-tap">tap to continue</small>';
  if (m.kind === 'fight') return `<button type="button" class="hm-moment fight" data-moment="fight:${m.key}">ROUND ${m.n}<span>FIGHT!</span>${tap}</button>`;
  if (m.kind === 'ko') return `<button type="button" class="hm-moment ko" data-moment="ko:${m.key}"><b class="hm-ko">${m.winner === 'tie' ? 'DRAW!' : 'K.O.!'}</b><b class="hm-win">${m.winner === 'tie' ? 'A ★ EACH' : m.winner === 'me' ? 'YOU WIN' : `${who(m.winner, me, rival)} WINS`}</b><span class="hm-sc">Round ${m.n} · ${esc(me.name)} <b>${m.me}</b> – <b>${m.rival}</b> ${esc(rival.name)}</span>${tap}</button>`;
  const champ = m.champion === 'me' ? me : m.champion === 'rival' ? rival : null, loser = m.champion === 'me' ? rival : me;
  return `<button type="button" class="hm-moment champ" data-moment="champ:${m.key}"><span class="hm-crown">🏆</span><b class="hm-flag">${esc(monthName(m.month).toUpperCase())} CHAMPION</b>
    ${champ ? `<span class="hm-cface">${faceOf(champ)}</span><b class="hm-win">${champ === me ? 'YOU' : esc(champ.name).toUpperCase()}</b>` : '<b class="hm-win">A DRAW</b>'}
    <span class="hm-sc">${Math.max(m.meWins, m.rivalWins)} round${Math.max(m.meWins, m.rivalWins) === 1 ? '' : 's'} to ${Math.min(m.meWins, m.rivalWins)}${m.meWins === m.rivalWins ? ` · ${m.mePts} – ${m.rivalPts} points` : ''}</span>
    ${champ && prize ? `<span class="hm-prize">🎁 ${champ === me ? `${esc(loser.name)} owes you` : 'You owe them'}: ${esc(prize)}</span>` : ''}${tap}</button>`;
}

// The card: { me: {name, face, kit, data}, rival: same | null, today, open, prize, moment, fame: [monthResult] }.
export function meterHtml({ me, rival, today, open = false, prize = '', moment = null, fame = [] }) {
  const cur = currentRound(today), res = monthResult(me.data, rival?.data || null, cur.month, today), of = res.rounds.length;
  const mine = weekPoints(me.data, cur.from, today).pts, theirs = rival ? weekPoints(rival.data, cur.from, today).pts : 0;
  const combo = strongStreak(me.data, today), left = todayOpen(me.data, today);
  const strip = res.rounds.map((r) => `<span class="${r.now ? 'now' : r.winner === 'me' ? 'y' : r.winner === 'rival' ? 'p' : r.winner === 'tie' ? 't' : ''}"><b>R${r.n}</b>${r.now ? 'NOW' : r.winner === 'tie' ? '★ BOTH' : r.winner ? `★ ${r.winner === 'me' ? 'YOU' : esc(rival.name).toUpperCase()}` : r.done && !rival ? r.me : ''}</span>`).join('');
  return `<div class="hm" aria-label="Health meter, round ${cur.n}">
    <button type="button" class="hm-title" data-fight="toggle" aria-expanded="${open}">HEALTH METER: <b>ROUND ${cur.n}</b></button>
    <div class="hm-hud ${rival ? '' : 'solo'}">
      ${sideHtml(me, mine, res.meWins, of, 'l', true)}
      <div class="hm-clock" aria-label="${cur.daysLeft} day${cur.daysLeft === 1 ? '' : 's'} left in the round"><b>${cur.daysLeft}</b><small>DAY${cur.daysLeft === 1 ? '' : 'S'}</small></div>
      ${rival ? sideHtml(rival, theirs, res.rivalWins, of, 'r', false) : '<div class="hm-side r"><div class="hm-wait">❔<small>waiting for a challenger</small></div></div>'}
    </div>
    <div class="hm-stage">${momentHtml(moment, me, rival, prize)}
      <button type="button" class="hm-fighters" data-fight="toggle" aria-label="How the health meter works"><span class="f1">${faceOf(me)}</span><span class="vs">VS</span><span class="f2">${rival ? faceOf(rival) : '❔'}</span></button>
    </div>
    <div class="hm-rounds">${strip}</div>
  </div>
  <div class="fg-today small">${left.length ? `💪 <b>Today:</b> ${left.map(([w, p]) => `${esc(w)} <b class="good">+${p}</b>`).join(' · ')}` : '💪 <b>Today’s done</b> — a full check-in day.'}${combo >= 2 ? ` <span class="muted">· 🔥 ${combo}-day combo</span>` : ''}</div>
  ${!rival ? '<p class="fg-note small muted">🤝 When your partner shares diet &amp; fitness with you, you’ll face off here.</p>' : ''}
  ${open ? `<div class="fg-rules">
    <b class="small">How a round works</b>
    <ul class="fg-list"><li><span>Each Monday – Sunday</span><b>1 round</b></li><li><span>⚖️ Morning weigh-in</span><b>+${POINTS.weigh}</b></li><li><span>🍳 🥗 🍝 Each meal logged</span><b>+${POINTS.meal}</b></li><li><span>Best possible week</span><b>${WEEK_MAX}</b></li><li><span>Most points on Sunday night</span><b>★ round</b></li><li><span>Most ★ when the month ends</span><b>🏆 month</b></li></ul>
    <p class="tiny muted">The meter starts empty each Monday. A week that crosses two months counts for the month with most of its days. A tied round gives you both a ★ (a week neither of you checked in gives none); a tied month goes to whoever has more points. It’s about showing up, never what the scale says. Tap your fighter to change how you look.</p>
    <b class="small">${esc(monthName(cur.month))} rounds</b>
    <div class="hm-table"><div class="hd"><span></span><span>${esc(me.name)}</span>${rival ? `<span>${esc(rival.name)}</span>` : '<span></span>'}<em></em></div>${res.rounds.map((r) => `<div class="${r.now ? 'now' : r.done ? '' : 'dim'}"><span>R${r.n} · ${short(r.from)}</span><span>${r.me ?? '–'}</span><span>${rival ? r.rival ?? '–' : ''}</span><em>${r.now ? 'so far' : r.winner === 'tie' ? '★ both' : r.winner ? `★ ${r.winner === 'me' ? esc(me.name) : esc(rival.name)}` : ''}</em></div>`).join('')}</div>
    ${fame.length ? `<p class="tiny muted">🏆 ${fame.map((f) => `${esc(monthName(f.month).slice(0, 3))}: ${f.champion === 'me' ? esc(me.name) : f.champion === 'rival' ? esc(rival.name) : 'a draw'} (${Math.max(f.meWins, f.rivalWins)}–${Math.min(f.meWins, f.rivalWins)})`).join(' · ')}</p>` : ''}
    ${rival ? `<label class="fg-prize small">🎁 ${esc(monthName(cur.month))}’s prize <input data-fightprize="1" maxlength="60" placeholder="e.g. loser plans date night" value="${esc(prize)}"></label>` : ''}
  </div>` : ''}`;
}
