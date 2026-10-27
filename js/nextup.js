// ✨ Next up: what to do next, and when. Every candidate (a run that's due, the dog walk, calling
// Mom, a hot yoga class, new episodes to watch together) is tried in each free hour of today and
// tomorrow; each try is scored on how overdue it is, the weather, whether you're free, what you
// usually do, and what you've said "not today" to. The best three are the picks. Runs on the phone.

import { scoreHour } from './brief.js';

export const KINDS = {
  run: { icon: '🏃', label: 'Run', mins: 30, weather: 'run', nudge: true },
  bike: { icon: '🚴', label: 'Ride', mins: 120, weather: 'bike', nudge: true },
  hotyoga: { icon: '🧘', label: 'Hot yoga', mins: 75, nudge: true },
  callmom: { icon: '📞', label: 'Call Mom', mins: 20, nudge: true },
  walk: { icon: '🐕', label: 'Walk the dogs', mins: 30, weather: 'walk' },
  show: { icon: '📺', label: 'Watch together', mins: 60 },
};
const H = 3600e3;
const dayOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const overlaps = (a, b, list) => list.some((x) => x.start < b && x.end > a);

// The hours you usually do something (from what you've done and synced workouts): hour → count.
export function usualHours(learned = {}, workouts = {}) {
  const out = {};
  for (const d of learned.done || []) (out[d.kind] ||= {})[d.hour] = (out[d.kind]?.[d.hour] || 0) + 1;
  for (const [k, hours] of Object.entries(workouts)) for (const h of hours) (out[k] ||= {})[h] = (out[k]?.[h] || 0) + 1;
  return out;
}
const usualBonus = (hist, hour) => {
  if (!hist) return 0;
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  if (total < 2) return 0;
  const near = (hist[hour] || 0) + 0.5 * ((hist[hour - 1] || 0) + (hist[hour + 1] || 0));
  return Math.min(0.3, (near / total) * 0.45);
};

export function plan(ctx) {
  const { now, hours = [], busy = [], partnerBusy = [], nudges = {}, classes = [], callWindows = [], dogs = null, shows = [], learned = {}, workouts = {} } = ctx;
  const today = dayOf(now), tomorrow = dayOf(new Date(now.getTime() + 24 * H));
  const usual = usualHours(learned, workouts);
  const dow = (d) => d.getDay();
  const cands = [];
  const consider = (kind, at, fit, why, extra = {}) => {
    const k = KINDS[kind], end = new Date(at.getTime() + k.mins * 60000);
    if (at < now || overlaps(at, end, busy)) return;
    const day = dayOf(at);
    if (learned.notToday?.[kind] === today && day === today) return;
    if ((learned.later?.[kind] || 0) > at.getTime()) return;
    const n = nudges[kind];
    const due = extra.due ?? (n ? (n.due ? 1 + Math.min(n.overdue || 0, 5) * 0.2 : (n.next === tomorrow && day === tomorrow ? 0.8 : 0)) : 0.6);
    if (due <= 0) return;
    const skips = learned.skips?.[kind]?.[dow(at)] || 0;
    const u = usualBonus(usual[kind], at.getHours());
    const soon = day === today ? 0.12 - Math.min((at - now) / H, 12) * 0.006 : -0.4;
    const score = due * (0.45 + 0.55 * fit) + u + soon - (skips >= 3 ? 0.35 : skips * 0.05);
    const whys = [...why];
    if (u >= 0.12) whys.push('your usual time');
    cands.push({ kind, at, end, score, why: whys, fit, ...extra });
  };
  const dueWhy = (kind) => {
    const n = nudges[kind];
    if (!n) return [];
    if (!n.last) return [`every ${n.every} day${n.every === 1 ? '' : 's'}`];
    const days = Math.round((Date.parse(today) - Date.parse(n.last)) / 864e5);
    return [kind === 'callmom' ? `${days} days since you called` : `${days} day${days === 1 ? '' : 's'} since your last ${KINDS[kind].label.toLowerCase()}`];
  };
  // Outdoor things: each hour that's left today and tomorrow (5 AM–9 PM), scored on the weather.
  const outdoor = (kind, needs) => {
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const span = hours.slice(i, i + Math.ceil(KINDS[kind].mins / 60));
      if (span.length < Math.ceil(KINDS[kind].mins / 60)) break;
      const sc = span.map((x) => scoreHour(x, KINDS[kind].weather));
      const fit = Math.min(...sc.map((x) => x.score)) / 100;
      if (fit < 0.35 || !needs(h)) continue;
      const w = sc.flatMap((x) => x.why)[0];
      consider(kind, h.time, fit, [...dueWhy(kind), w ? `heads-up: ${w}` : `${Math.round(h.feels)}° and ${h.rain >= 30 ? `${h.rain}% rain` : 'dry'}`]);
    }
  };
  if (nudges.run) outdoor('run', () => true);
  if (nudges.bike) outdoor('bike', (h) => h.time.getDay() === 0 || h.time.getDay() === 6 || h.time.getHours() >= 16 || h.time.getHours() <= 8);
  if (dogs?.enabled && !dogs.walkedToday) outdoor('walk', (h) => dayOf(h.time) === today);
  // Classes: at their times.
  if (nudges.hotyoga) for (const c of classes) consider('hotyoga', new Date(c.at.getTime() - 15 * 60000), 1, [...dueWhy('hotyoga'), `${c.label} at ${clock(c.at)}`], { place: c.place || '' });
  // Mom: at the start of each good time to call.
  if (nudges.callmom) for (const w of callWindows) consider('callmom', w.start > now ? w.start : new Date(Math.ceil(now / (15 * 60000)) * 15 * 60000), 1, [...dueWhy('callmom'), `she's free until ${clock(w.end)} your time`]);
  // New episodes: tonight, when you're both free.
  for (const s of shows.filter((x) => x.newCount)) {
    for (const hr of [19, 20, 21]) {
      const at = new Date(now); at.setHours(hr, 0, 0, 0);
      if (overlaps(at, new Date(at.getTime() + H), partnerBusy)) continue;
      consider('show', at, 1, [`${s.newCount} new episode${s.newCount === 1 ? '' : 's'}${s.from ? ` (E${s.from}${s.to && s.to !== s.from ? `–${s.to}` : ''})` : ''}`, 'you\'re both free'], { due: 0.75 + Math.min(s.newCount, 4) * 0.08, show: s.id, title: s.title });
    }
  }
  // The best time for each thing; a dog walk inside a run's hour rides along instead.
  const best = {};
  for (const c of cands) { const key = c.show ? `show:${c.show}` : c.kind; if (!best[key] || c.score > best[key].score) best[key] = c; }
  // The dogs can come on the run if a walk would be fine within an hour of it (pavement, heat).
  const run = best.run;
  if (run && best.walk && dayOf(run.at) === today && cands.some((c) => c.kind === 'walk' && Math.abs(c.at - run.at) <= H && c.fit >= 0.5)) { run.why.push('🐾 bring the dogs'); run.withDogs = true; delete best.walk; }
  const picks = Object.values(best).sort((a, b) => b.score - a.score).map((c) => ({
    ...c, icon: KINDS[c.kind].icon, title: c.kind === 'show' ? c.title : KINDS[c.kind].label,
    when: `${dayOf(c.at) === today ? '' : 'Tomorrow '}${clock(c.at)}`, sure: Math.max(0.2, Math.min(0.95, c.score / 1.6)),
  }));
  return { picks: picks.slice(0, 3), all: picks, considered: cands.length };
}

// A tap on a pick teaches it: ✓ done (when you like to), ⏰ later (not for 2 hours), ✕ not today
// (and a weekday you keep skipping counts against that day).
export function learn(learned = {}, action, pick, now = new Date()) {
  const l = { done: [...(learned.done || [])], skips: { ...(learned.skips || {}) }, notToday: { ...(learned.notToday || {}) }, later: { ...(learned.later || {}) } };
  if (action === 'done') l.done = [...l.done, { kind: pick.kind, hour: now.getHours(), dow: now.getDay(), at: now.getTime() }].slice(-200);
  if (action === 'later') l.later[pick.kind] = now.getTime() + 2 * H;
  if (action === 'skip') {
    l.notToday[pick.kind] = dayOf(now);
    const d = pick.at.getDay();
    l.skips[pick.kind] = { ...(l.skips[pick.kind] || {}), [d]: (l.skips[pick.kind]?.[d] || 0) + 1 };
  }
  return l;
}
