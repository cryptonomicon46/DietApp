// 📈 Week / month progress for lifting, cardio and climbing. Pure (no storage), so it's tested.

// Climbing grades. Bouldering V-scale, roped routes on the Yosemite Decimal System.
export const BOULDER_GRADES = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10'];
export const ROPE_GRADES = ['5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d'];
// Shown by default; the rest sit behind "Other grades" (and appear once they have a count).
export const DEFAULT_GRADES = { boulder: ['V4', 'V5', 'V6'], toprope: ['5.10a', '5.10b', '5.10c', '5.10d', '5.11a'], lead: ['5.10a', '5.10b', '5.10c', '5.10d', '5.11a'] };
export const DISCIPLINES = { boulder: { icon: '🪨', label: 'Bouldering', grades: BOULDER_GRADES }, toprope: { icon: '🧗', label: 'Top rope', grades: ROPE_GRADES }, lead: { icon: '🪢', label: 'Lead', grades: ROPE_GRADES } };
export const gradeRank = (disc, g) => DISCIPLINES[disc].grades.indexOf(g);

// ---------- periods ----------
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const atNoon = (s) => new Date(`${s}T12:00:00`);
const add = (s, n) => { const d = atNoon(s); d.setDate(d.getDate() + n); return iso(d); };
// kind 'week' (Monday–Sunday) or 'month'; the previous one of the same kind to compare with.
export function periodOf(kind, today) {
  if (kind === 'month') {
    const from = `${today.slice(0, 7)}-01`;
    const d = atNoon(from); d.setMonth(d.getMonth() + 1); d.setDate(0);
    const prevTo = add(from, -1);
    return { from, to: iso(d), prevFrom: `${prevTo.slice(0, 7)}-01`, prevTo,
      label: atNoon(from).toLocaleDateString('en-US', { month: 'long' }), prevLabel: atNoon(prevTo).toLocaleDateString('en-US', { month: 'long' }) };
  }
  const dow = (atNoon(today).getDay() + 6) % 7;
  const from = add(today, -dow);
  return { from, to: add(from, 6), prevFrom: add(from, -7), prevTo: add(from, -1), label: 'This week', prevLabel: 'last week' };
}
const inRange = (d, from, to) => d >= from && d <= to;

// ---------- lifting ----------
export const e1rm = (w, r) => (r > 0 && w > 0 ? w * (1 + r / 30) : 0); // Epley
export const KEY_LIFTS = { backSquat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
export function liftStats(sessions = [], from, to) {
  const list = sessions.filter((s) => inRange(s.date, from, to));
  let sets = 0, volume = 0;
  const best = {};
  for (const s of list) for (const e of s.entries || []) for (const x of e.sets || []) {
    sets++;
    if (!x.bw) volume += (+x.w || 0) * (+x.r || 0);
    const v = e1rm(+x.w, +x.r);
    if (v > (best[e.exercise] || 0)) best[e.exercise] = v;
  }
  return { sessions: list.length, sets, volume: Math.round(volume), best };
}
// Best estimated 1RM per exercise before `from` (to count new PRs).
export function bestBefore(sessions = [], from) {
  const best = {};
  for (const s of sessions) if (s.date < from) for (const e of s.entries || []) for (const x of e.sets || []) {
    const v = e1rm(+x.w, +x.r);
    if (v > (best[e.exercise] || 0)) best[e.exercise] = v;
  }
  return best;
}
export const prCount = (cur, before) => Object.entries(cur.best).filter(([ex, v]) => before[ex] && v > before[ex] + 0.5).length;

// ---------- cardio ----------
// activities: added in the app ({date, sport, minutes, miles?}); history: synced WHOOP / Garmin workouts ({start, minutes}, sport by name).
export function cardioStats(activities = [], history = [], sportOf, from, to) {
  const out = { running: { n: 0, miles: 0, minutes: 0, pacedMin: 0 }, cycling: { n: 0, miles: 0, minutes: 0 }, hotYoga: { n: 0, minutes: 0 }, sessions: 0 };
  const take = (sport, minutes, miles) => {
    const o = out[sport];
    if (!o) return;
    o.n++; o.minutes += +minutes || 0; out.sessions++;
    if (miles > 0 && 'miles' in o) { o.miles += +miles; if (sport === 'running') o.pacedMin += +minutes || 0; }
  };
  for (const a of activities) if (inRange(a.date, from, to)) take(a.sport, a.minutes, a.miles);
  // Synced workouts the app didn't already have as an added activity that day.
  const added = new Set(activities.map((a) => `${a.date}:${a.sport}`));
  for (const w of history) {
    const date = String(w.start).slice(0, 10);
    const sport = sportOf(w.name);
    if (!inRange(date, from, to) || added.has(`${date}:${sport}`)) continue;
    take(sport, w.minutes, w.miles);
  }
  out.running.pace = out.running.miles ? out.running.pacedMin / out.running.miles : null; // min per mile
  for (const k of ['running', 'cycling']) out[k].miles = Math.round(out[k].miles * 10) / 10;
  return out;
}
export const paceText = (p) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} /mi` : '');

// ---------- climbing ----------
// climbs: [{date, minutes, grades: {boulder: {V5: {a, s}}, toprope: {...}, lead: {...}}}]
export function climbStats(climbs = [], from, to) {
  const list = climbs.filter((c) => inRange(c.date, from, to));
  const by = {};
  for (const d of Object.keys(DISCIPLINES)) by[d] = { attempts: 0, sends: 0, grades: {}, top: null };
  for (const c of list) for (const [d, gs] of Object.entries(c.grades || {})) {
    if (!by[d]) continue;
    for (const [g, v] of Object.entries(gs)) {
      const s = +v.s || 0, a = Math.max(+v.a || 0, s); // a send is an attempt too
      if (!a) continue;
      const row = (by[d].grades[g] ||= { a: 0, s: 0 });
      row.a += a; row.s += s;
      by[d].attempts += a; by[d].sends += s;
      if (s && (by[d].top == null || gradeRank(d, g) > gradeRank(d, by[d].top))) by[d].top = g;
    }
  }
  return { sessions: list.length, minutes: list.reduce((t, c) => t + (+c.minutes || 0), 0), by };
}
// A couple of encouraging lines comparing this period with the last one.
export function climbHighlights(cur, prev) {
  const out = [];
  for (const [d, x] of Object.entries(cur.by)) {
    const p = prev.by[d];
    if (x.top && p.top && gradeRank(d, x.top) > gradeRank(d, p.top)) out.push(`${DISCIPLINES[d].label} top send up: ${p.top} → ${x.top} 🎉`);
    for (const [g, r] of Object.entries(x.grades)) {
      const q = p.grades[g];
      if (r.a >= 3 && q?.a >= 3) {
        const now = Math.round((r.s / r.a) * 100), was = Math.round((q.s / q.a) * 100);
        if (now >= was + 10) out.push(`${g} send rate up from ${was}% to ${now}%`);
      }
    }
  }
  return out.slice(0, 3);
}
