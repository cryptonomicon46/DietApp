// 💪 Health: your day's command centre. Today first — weight, the next meal and today's workout,
// always in that order, one of them emphasised for the time of day — then nutrition and the plan,
// then the rest (weight trend, devices). The full Meals, Weight and Fitness screens are a tap away.
// Private unless you share them (Me › 💪 Health sharing). Worked out on this phone from your own
// copy; loaded only when you open Health, so nothing here is start-up work.
import { dailyTargets, PHASES, weeklyTrend, rateText } from '../js/plan.js';
import { onTarget, consistency } from '../js/dietDays.js';
import { planProgress, STATUS } from '../js/planProgress.js';
import { planOf, logOf, dayEntry, nextMeal, MEAL_NAMES, MAIN_MEALS } from '../js/dayPlan.js';

export { onTarget, consistency };

const DAY = 864e5;
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const weightsOf = (data) => (data.weights || []).filter((w) => w?.date && +w.weight > 0).map((w) => ({ date: w.date, weight: +w.weight })).sort((a, b) => a.date.localeCompare(b.date));

// Everything the Diet card shows, from your own tracker copy.
export function dietSummary(data = {}, today) {
  const p = data.profile || {};
  const weights = weightsOf(data);
  const weightLb = Math.round((weights.at(-1)?.weight || +p.weight || +p.weightLb || 0) * 10) / 10;
  const phase = PHASES[p.phase] ? p.phase : 'cut';
  const set = !!(p.heightIn && p.age && weightLb);
  // Today's numbers: what the trackers recorded today, else the plan's base targets.
  const rec = (data.days || {})[today];
  let targets = null;
  if (set) {
    const t = dailyTargets(p, weightLb, +data.adjust || 0), a = data.macroAdjust || {};
    targets = { kcal: t.kcal, p: Math.max(t.p + (+a.p || 0), 60), c: Math.max(t.c + (+a.c || 0), 30), f: Math.max(t.f + (+a.f || 0), 25), lbPerWeek: t.lbPerWeek };
  }
  const todayNums = rec?.target ? { kcal: rec.eaten || 0, kcalTarget: rec.target, p: rec.protein || 0, pTarget: rec.proteinTarget || targets?.p || 0, left: rec.left || null, meals: rec.meals || 0, alc: rec.alc || 0 }
    : targets ? { kcal: 0, kcalTarget: targets.kcal, p: 0, pTarget: targets.p, left: { c: targets.c, f: targets.f }, meals: 0 } : null;
  const since = p.phaseStart || '';
  const phaseW = weights.filter((w) => w.date >= since);
  const trend = weeklyTrend(phaseW.length >= 2 ? phaseW : weights);
  const start = p.phaseStart && /^\d{4}-\d{2}-\d{2}$/.test(p.phaseStart) ? p.phaseStart : null;
  const week = start ? Math.max(1, Math.floor((Date.parse(today) - Date.parse(start)) / (7 * DAY)) + 1) : null;
  const weeks = +p.phaseWeeks || PHASES[phase].weeks;
  return {
    set, phase, phaseLabel: PHASES[phase].label, week, weeks,
    goalLb: +p.goalLb || null, toGoLb: p.goalLb && weightLb ? Math.round((weightLb - p.goalLb) * 10) / 10 : null,
    weightLb, weights: weights.filter((w) => w.date >= shift(today, -90)), trend,
    trendText: trend && trend.spanDays >= 7 ? rateText(-trend.lbPerWeek) : '',
    today: todayNums, consistency: consistency(data.days || {}, today),
    weighedToday: weights.find((w) => w.date === today)?.weight ?? null,
    completeDays: Object.entries(data.days || {}).filter(([day, x]) => day > shift(today, -7) && day <= today && x?.complete).length,
    progress: set ? planProgress({ profile: p, weights, days: data.days || {}, today, planned: targets?.lbPerWeek ?? null }) : null,
  };
}

// 🌤 One calm line for today: the most useful thing, never a scold. Same inputs → same line.
export function nudgeFor(d, { hour = 9, workout = null } = {}) {
  if (workout === 'active') return "You're partway through today's workout — pick up where you left off.";
  if (!d.set) return 'Set up your plan and Health shows your day here: weight, food and training.';
  if (d.weighedToday == null && hour < 12) return 'Good morning — a quick weigh-in before breakfast keeps your trend honest.';
  const t = d.today, st = d.progress?.status;
  if (t && hour >= 16 && t.pTarget && t.p < t.pTarget * 0.7) return `Protein is the one to watch today — about ${Math.round(t.pTarget - t.p)} g to go.`;
  if (t && t.kcal > t.kcalTarget * 1.1) return "A bit over today, and that's fine — one day doesn't move the trend.";
  if (st === 'on-track') return `On track — ${d.consistency.on} of the last ${d.consistency.of} days near target. Keep it steady.`;
  if (st === 'ahead') return 'Ahead of plan — keep protein up and check in on how you feel.';
  if (st === 'behind') return "Slower than planned for now — your weekly check-in can suggest a small change. Nothing changes until you approve it.";
  if (d.weighedToday == null) return 'A weigh-in today helps — morning is best, but any time counts.';
  return 'Small steps count — log what you eat today and the rest follows.';
}

// Workouts in the last 7 days, from whatever the trackers have (logged or from a device).
export function fitnessSummary(data = {}, today) {
  const from = shift(today, -6);
  const dates = [...(data.workouts || []).map((w) => String(w.start || w.date || '').slice(0, 10)), ...(data.workoutHistory || []).map((w) => String(w.date || w.start || '').slice(0, 10))].filter((d) => d >= from && d <= today);
  return { week: dates.length, last: [...(data.workouts || []), ...(data.workoutHistory || [])].map((w) => String(w.start || w.date || '').slice(0, 10)).filter(Boolean).sort().pop() || '' };
}

// A small weight line (SVG), last 90 days.
function spark(weights) {
  if (weights.length < 2) return '';
  const w = 280, h = 48, xs = weights.map((p) => Date.parse(p.date)), ys = weights.map((p) => p.weight);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
  const pts = weights.map((p) => `${Math.round(((Date.parse(p.date) - x0) / Math.max(1, x1 - x0)) * w)},${Math.round(h - ((p.weight - y0) / (y1 - y0)) * h)}`).join(' ');
  return `<svg class="hl-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Weight over the last ${weights.length} weigh-ins"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
const bar = (n, of) => `<span class="hl-bar" aria-hidden="true"><i style="width:${Math.min(100, of ? Math.round((n / of) * 100) : 0)}%"></i></span>`;

// 🍽 The food anchor: the next meal (with its one-tap ways to log it), or — after a meal that
// wasn't the plan — what's left and how to adapt the rest of the day, or, once the day's meals are
// in, a quiet "done logging". Worked out on this phone with js/dayPlan.js (what the trackers use).
const MEAL_HOURS = { breakfast: [5, 11], lunch: [11, 15], dinner: [16, 22] };
const BIG = (e) => e && e.target && e.kcal > e.target.kcal + Math.max(150, e.target.kcal * 0.2);
export function foodState(data = {}, today, hour = 12) {
  const d = dietSummary(data, today);
  if (!d.set) return { set: false };
  const log = logOf(data, today), next = nextMeal(data, today);
  let plan = null;
  try { plan = planOf(data, today); } catch { plan = null; } // a food this phone doesn't know: the trackers show it
  let left = null;
  try { left = dayEntry(data, today).left; } catch { left = d.today?.left || null; }
  const last = [...MAIN_MEALS].reverse().find((m) => log.meals?.[m]);
  const lastBig = last && BIG(log.meals[last]);
  return {
    set: true, next, meal: next ? MEAL_NAMES[next] : null,
    title: next && plan?.[next] ? plan[next].title : '', kcal: next && plan?.[next] ? plan[next].totals.kcal : null,
    logged: MAIN_MEALS.filter((m) => log.meals?.[m]).length, done: !!log.done, left,
    eaten: d.today?.kcal || 0, protein: d.today?.p || 0,
    // A bigger meal than planned, with meals still to come: until the next meal's time comes,
    // the rest of today can adapt; then it's the next meal again (already re-fitted).
    off: lastBig && next && hour < (MEAL_HOURS[next]?.[0] ?? 24) - 1 ? { meal: last, title: log.meals[last].title, kcal: log.meals[last].kcal } : null,
    refit: !!(lastBig && next && plan?.[next]?.balanced),
  };
}
// What's left, said kindly: never "over", never "~0".
export function leftText(left, esc = (x) => x) {
  if (!left) return '';
  const k = Math.round(left.kcal), p = Math.max(0, Math.round(left.p));
  if (k <= 60) return `Today is at its calorie target${p >= 15 ? ` · about <b>${p} g protein</b> to go` : ''}.`;
  return `You have <b>~${esc(k.toLocaleString())} kcal</b>${p >= 5 ? ` and <b>~${p} g protein</b>` : ''} left today.`;
}
// One quiet "Next: …" for the time of day, and which anchor it belongs to. Never a list.
export function nextUp({ hour = 12, weighed = false, set = true, food = {}, workout = 'none', title = '' } = {}) {
  if (workout === 'active') return { anchor: 'workout', text: `resume ${title && title.length <= 18 ? title : 'your workout'}` };
  if (set && !weighed && hour < 11) return { anchor: 'weight', text: "log today's weight" };
  if (food.off) return { anchor: 'food', text: 'adjust the rest of today' };
  const [a, b] = MEAL_HOURS[food.next] || [];
  if (food.next && hour >= a - 1 && hour < b) return { anchor: 'food', text: food.meal.toLowerCase() };
  if (food.set && !food.next && !food.done && hour >= 18) return { anchor: 'food', text: 'finish today\'s log' };
  if (workout === 'planned' && hour >= 5 && hour < 21) return { anchor: 'workout', text: "today's workout" };
  if (!set) return { anchor: 'food', text: 'set up your plan' };
  return { anchor: null, text: '' };
}

const r0 = (n) => Math.round(n || 0);
function foodRow(f, esc, hot) {
  const cls = `hl-row2${hot ? ' hot' : ''}`;
  if (!f.set) return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>Your food plan</b><small>Set your goal and Health shows each meal here.</small></div><div class="hl-acts"><a class="btn grow" href="../#weight">Set up Diet</a></div></div>`;
  const acts = (m) => `<div class="hl-acts"><button type="button" class="grow" data-ml="plan:${m}">✓ As planned</button><button type="button" class="ghost hl-ico" data-ml="photo:${m}" aria-label="Log ${esc(MEAL_NAMES[m].toLowerCase())} with a photo">📷</button><button type="button" class="ghost hl-ico" data-ml="tell:${m}" aria-label="Tell me what you had for ${esc(MEAL_NAMES[m].toLowerCase())}">🎙️</button><button type="button" class="ghost hl-ico" data-ml="out:${m}" aria-label="Ate out for ${esc(MEAL_NAMES[m].toLowerCase())}">🍴</button></div>`;
  if (f.off) {
    return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>${esc(MEAL_NAMES[f.off.meal])} logged ✓</b><small>${esc(f.off.title)} · ${r0(f.off.kcal)} kcal</small></div>
      <p class="hl-ctx">Plans change. ${leftText(f.left)}</p>
      <div class="hl-acts"><button type="button" class="grow" data-ml="adjust">Adjust the rest of today</button><button type="button" class="ghost" data-ml="fits">What fits?</button></div></div>`;
  }
  if (f.next) {
    return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><button type="button" class="hl-what" data-ml="open:${f.next}"><b>${esc(f.meal)} is next</b><small>${f.title ? `${esc(f.title)} · ${r0(f.kcal)} kcal` : 'See it in Today\'s plan'}${f.refit ? ' · re-fitted to what\'s left' : f.logged ? ` · ${f.logged} of 3 logged` : ''} ›</small></button>${acts(f.next)}</div>`;
  }
  if (f.done) return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div class="hl-mini"><span><b>Food</b> <span class="good">✓ done for today</span></span><button type="button" class="linkish small" data-ml="undone">Undo</button></div></div>`;
  return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>${f.logged} meals logged</b><small>${r0(f.eaten).toLocaleString()} kcal · ${r0(f.protein)} g protein${f.left && f.left.kcal > 60 ? ` · ~${r0(f.left.kcal)} kcal left` : ''}</small></div>
    <div class="hl-acts"><button type="button" class="grow" data-ml="done">✓ Done logging today</button><button type="button" class="ghost" data-ml="extra">＋ Add</button></div></div>`;
}

// The Health screen. `ctx`: { esc, sharing (one line), today, hour, workout: { state: 'planned' |
// 'active' | 'done' | 'none', html: (hot) => the Workout row } from family/fitness.js, devices
// (HTML), reminder (true | false | null: the morning weigh-in reminder, null when unknown) }.
// ⌚ WHOOP today (only when WHOOP is connected on this phone): Sleep, Recovery and Strain — in
// WHOOP's own order — as WHOOP gives them, one calm line (js/whoopDay.js recoveryContext), and — only when Recovery is lower
// than your usual or the night was short, and there's a workout today — an offer to make it
// lighter, previewed first. WHOOP informs; it never changes your plan by itself. Private to you.
// WHOOP's own palette (WHOOP Brand & Design Guidelines): its scores keep its colours.
export const WHOOP_COLORS = { sleep: '#7BA1BB', strain: '#0093E7', green: '#16EC06', yellow: '#FFDE00', red: '#FF0026' };
const BY = '<div class="wh-by">Data by <img src="whoop-logo-white.svg" alt="WHOOP" width="100" height="16"></div>';
// A ring that fills clockwise from 12 o'clock (null: an empty track).
function ring(frac, color, inner, { big = false } = {}) {
  const r = 42, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac ?? 0));
  return `<span class="wh-ring${big ? ' big' : ''}"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="wh-trk" cx="50" cy="50" r="${r}" fill="none" stroke-width="${big ? 6 : 7}"/>${frac == null ? '' : `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="${big ? 6 : 7}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}"/>`}</svg><span class="wh-val${frac == null ? ' none' : ''}">${inner}</span></span>`;
}
const pct = (n) => `${Math.round(n)}<small>%</small>`;
const close = '<button type="button" class="wh-x" data-act="close" aria-label="Close">✕</button>';
export function whoopHtml(w, esc) {
  if (!w) return '';
  const head = `<div class="hl-sec"><h2 class="hl-sech">WHOOP</h2>${w.dailyMissing ? '' : '<button type="button" class="linkish small" data-act="whoopdays">Last 7 days ›</button>'}</div>`;
  if (w.dailyMissing) return `${head}<section class="hl-whoop" aria-label="WHOOP">${BY}<p class="wh-line">Reconnect WHOOP to see your Sleep, Recovery and Strain here. Your workouts keep syncing either way.</p><button type="button" class="wh-btn" data-act="devconnect">Reconnect WHOOP</button></section>`;
  const r = w.recovery, sl = w.sleep, st = w.strain;
  // In WHOOP's own order: Sleep (its sleep performance %), Recovery (its band colour), Strain (0–21).
  const tile = (which, label, frac, color, inner, sub, aria) => `<button type="button" class="wh-tile" data-act="whoopdetail" data-wd="${which}" aria-label="${esc(aria)}">${ring(frac, color, inner)}<span class="wh-lab">${label}<i aria-hidden="true">›</i></span>${sub ? `<span class="wh-sub">${esc(sub)}</span>` : ''}</button>`;
  const hrs = sl.hours != null ? `${sl.hours} h${sl.neededHours ? ` of ${sl.neededHours} h` : ''}` : '';
  const sleep = sl.performance != null ? tile('sleep', 'Sleep', sl.performance / 100, WHOOP_COLORS.sleep, pct(sl.performance), hrs, `Sleep ${Math.round(sl.performance)}%${hrs ? `, ${hrs}` : ''}`)
    : sl.hours != null ? tile('sleep', 'Sleep', null, '', `${sl.hours}<small>h</small>`, sl.neededHours ? `of ${sl.neededHours} h` : '', `Sleep ${sl.hours} hours`)
      : tile('sleep', 'Sleep', null, '', '—', sl.state === 'none' ? 'no sleep yet' : 'not scored yet', 'Sleep not scored yet');
  const scored = r.state === 'scored' && r.score != null;
  const relText = r.relative ? (r.relative === 'usual' ? 'your usual' : `${r.relative} than usual`) : '';
  const rec = scored ? tile('recovery', 'Recovery', r.score / 100, WHOOP_COLORS[r.band], pct(r.score), relText, `Recovery ${r.score}%${relText ? `, ${relText}` : ''}`)
    : tile('recovery', 'Recovery', null, '', '—', r.state === 'unscorable' ? 'not scored' : 'not scored yet', 'Recovery not scored yet');
  const ys = st.yesterday != null ? `yesterday ${st.yesterday.toFixed(1)}` : '';
  const strain = tile('strain', 'Strain', st.today != null ? st.today / 21 : null, WHOOP_COLORS.strain, st.today != null ? st.today.toFixed(1) : '—', st.today != null ? ys || 'so far today' : ys || 'none yet', `Strain ${st.today != null ? st.today.toFixed(1) : 'none yet'}${ys ? `, ${ys}` : ''}`);
  const lt = w.lighter || {};
  const lighter = lt.applied ? '<p class="wh-applied">🪶 Today\'s workout is lighter · <button type="button" class="wh-link" data-fx="lighterundo">Undo</button></p>'
    : w.lighterHint && lt.can ? '<button type="button" class="wh-btn" data-fx="lighter">🪶 Make today\'s workout lighter</button>' : '';
  return `${head}<section class="hl-whoop" aria-label="WHOOP today">${BY}
    <div class="wh-rings">${sleep}${rec}${strain}</div>
    <p class="wh-line">${esc(w.line)}</p>${lighter}</section>`;
}
// The last 7 days, WHOOP's numbers only, and your usual range once there's enough.
export function whoopDaysHtml(days, range, esc) {
  const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bar = (n, band) => `<span class="wh-bar" aria-hidden="true"><i style="width:${Math.round(n)}%;background:${WHOOP_COLORS[band]}"></i></span>`;
  return `<div class="whd"><div class="wh-top"><h2>Last 7 days</h2>${close}</div>
    <table class="wh-days"><thead><tr><th scope="col">Day</th><th scope="col">Sleep</th><th scope="col">Recovery</th><th scope="col">Strain</th></tr></thead><tbody>
    ${days.map((x) => `<tr><th scope="row">${esc(day(x.date))}</th><td>${x.sleepPerf != null ? `${x.sleepPerf}%` : x.sleepHours != null ? `${x.sleepHours} h` : '<span class="wh-dim">—</span>'}</td><td>${x.recovery != null ? `${bar(x.recovery, x.band)}${x.recovery}%` : `<span class="wh-dim">${x.state === 'unscorable' ? 'not scored' : '—'}</span>`}</td><td>${x.strain != null ? x.strain.toFixed(1) : '<span class="wh-dim">—</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p class="wh-say">${range.ready ? `Your usual Recovery: ${range.low}–${range.high}% (the middle half of your last 30 days).` : `Building your usual range — ${range.have} of ${range.need} scored days so far. Until then, WHOOP's own colour is all that's shown.`}</p>
    <p class="wh-fine">🔒 Your Recovery and Sleep are yours alone — not shared with your family, whatever your Fitness sharing. Numbers are WHOOP's; "usual" and the sleep gap are worked out on your phone.</p>${BY}</div>`;
}
// The three detail sheets (tap a ring). Numbers are WHOOP's, under WHOOP's names; "your usual" is ours.
const stat = (esc, label, value, unit, note) => `<div class="wh-stat"><span class="k">${esc(label)}</span><span class="v">${value}${unit ? `<small>${esc(unit)}</small>` : ''}</span>${note ? `<span class="u">${esc(note)}</span>` : ''}</div>`;
const dec = (unit) => unit === 'rpm' || unit === '°C';
const num = (v, unit) => (dec(unit) ? Number(v).toFixed(1) : v);
const usualText = (u, unit) => (u ? `Your usual ${u.low === u.high ? num(u.low, unit) : `${num(u.low, unit)}–${num(u.high, unit)}`}${unit === '%' ? '%' : ` ${unit}`}` : '');
const notYet = (esc, title, text) => `<div class="whd"><div class="wh-top"><h2>${esc(title)}</h2>${close}</div><p class="wh-say">${esc(text)}</p>${BY}</div>`;
export function recoveryDetailHtml(d, esc, when = '') {
  if (d.state !== 'scored' || d.score == null) return notYet(esc, 'Recovery', d.state === 'unscorable' ? 'WHOOP couldn\'t score last night.' : 'Recovery isn\'t scored yet — it comes after you wake and WHOOP has scored your sleep.');
  const sl = d.sleep;
  return `<div class="whd"><div class="wh-top"><h2>Recovery</h2>${close}</div>
    ${ring(d.score / 100, WHOOP_COLORS[d.band], pct(d.score), { big: true })}<p class="wh-when">${esc(when)}${when ? ' · ' : ''}from last night's sleep</p>
    <p class="wh-say">${esc(d.line)}</p>
    ${d.rows.map((x) => stat(esc, x.label, num(x.value, x.unit), x.unit, x.key === 'sleep' ? (sl?.neededHours ? `${sl.hours} h of the ${sl.neededHours} h you needed` : '') : usualText(x.usual, x.unit))).join('')}
    <p class="wh-fine">Numbers are WHOOP's. "Your usual" is the middle half of your last 30 days, worked out on your phone once there are 14.</p>${BY}</div>`;
}
const SLEEP_TONES = ['#E8EDF0', '#B9CAD5', '#7BA1BB', '#4D7A99'];
export function sleepDetailHtml(d, esc) {
  if (d.state !== 'scored') return notYet(esc, 'Sleep', d.state === 'unscorable' ? 'WHOOP couldn\'t score last night\'s sleep.' : d.state === 'none' ? 'No sleep from WHOOP for last night yet.' : 'Sleep isn\'t scored yet.');
  const total = d.stages.reduce((a, [, h]) => a + h, 0) || 1, n = d.need;
  const why = [n.baseline ? `${n.baseline} baseline` : '', n.debt ? `${n.debt} sleep debt` : '', n.strain ? `${n.strain} from strain` : '', n.nap ? `${n.nap > 0 ? '+' : '−'}${Math.abs(n.nap)} nap` : ''].filter(Boolean).join(' + ').replace('+ −', '− ');
  return `<div class="whd"><div class="wh-top"><h2>Sleep</h2>${close}</div>
    ${d.performance != null ? ring(d.performance / 100, WHOOP_COLORS.sleep, pct(d.performance), { big: true }) : ''}<p class="wh-when">${esc(d.from)} – ${esc(d.to)} · ${d.hours} h asleep</p>
    <p class="wh-k">Stages</p>
    <div class="wh-stages" role="img" aria-label="${esc(d.stages.map(([k, h]) => `${k} ${h} hours`).join(', '))}">${d.stages.map(([, h], i) => (h ? `<i style="flex:${h / total};background:${SLEEP_TONES[i]}"></i>` : '')).join('')}</div>
    <div class="wh-legend">${d.stages.map(([k, h], i) => `<span style="--c:${SLEEP_TONES[i]}">${esc(k)} · ${h} h</span>`).join('')}</div>
    ${d.neededHours ? stat(esc, 'Hours vs. needed', d.hours, 'h', `You needed ${d.neededHours} h${why ? `: ${why}` : ''}`) : ''}
    ${d.consistency != null ? stat(esc, 'Sleep consistency', d.consistency, '%', 'How close to your usual bed and wake times') : ''}
    ${d.efficiency != null ? stat(esc, 'Sleep efficiency', d.efficiency, '%', 'Time asleep of time in bed') : ''}
    ${d.respiratory != null ? stat(esc, 'Respiratory rate', num(d.respiratory, 'rpm'), 'rpm', usualText(d.respiratoryUsual, 'rpm')) : ''}
    ${d.disturbances != null ? stat(esc, 'Disturbances', d.disturbances, '', d.cycles != null ? `${d.cycles} sleep cycle${d.cycles === 1 ? '' : 's'}` : '') : ''}${BY}</div>`;
}
const ZONE_TONES = ['#AEB9C0', '#67AEE6', '#16EC06', '#FFDE00', '#FF8A00', '#FF0026'];
export function strainDetailHtml(d, esc, { updated = '', logged = () => '' } = {}) {
  const zmax = d.zones ? Math.max(...d.zones) || 1 : 1;
  return `<div class="whd"><div class="wh-top"><h2>Strain</h2>${close}</div>
    ${ring(d.strain != null ? d.strain / 21 : null, WHOOP_COLORS.strain, d.strain != null ? d.strain.toFixed(1) : '—', { big: true })}<p class="wh-when">Today so far${updated ? ` · updated ${esc(updated)}` : ''}${d.yesterday != null ? ` · yesterday ${d.yesterday.toFixed(1)}` : ''}</p>
    ${d.kcal != null ? stat(esc, 'Calories', d.kcal.toLocaleString(), 'kcal', 'Today so far') : ''}
    ${d.avgHr != null ? stat(esc, 'Average heart rate', d.avgHr, 'bpm', d.maxHr ? `Max ${d.maxHr} bpm` : '') : ''}
    ${d.steps != null ? stat(esc, 'Steps', d.steps.toLocaleString(), '', 'Today so far') : ''}
    ${d.zones ? `<p class="wh-k">Heart-rate zones · today's workouts</p>${d.zones.map((m, i) => `<div class="wh-zone"><span>Zone ${i}</span><span class="t"><i style="width:${Math.round((m / zmax) * 100)}%;background:${ZONE_TONES[i]}"></i></span><span class="m">${m} min</span></div>`).join('')}` : ''}
    ${d.workouts.map((x) => { const l = logged(x.id); return `<div class="wh-wk"><div class="h"><span>${esc(x.name ? x.name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Workout')} · ${esc(x.at)}</span>${x.strain != null ? `<b>${x.strain.toFixed(1)}</b>` : ''}</div><div class="s">${[x.minutes ? `${x.minutes} min` : '', x.kcal ? `${x.kcal} kcal` : '', x.avgHr ? `avg ${x.avgHr}${x.maxHr ? ` / max ${x.maxHr}` : ''} bpm` : '', l ? `✓ ${l} in Fitness` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`; }).join('') || '<p class="wh-say">No WHOOP workouts today yet.</p>'}
    ${d.zones ? '<p class="wh-fine">WHOOP gives heart-rate zones for each workout, so the zones are for your workouts today, not the whole day.</p>' : ''}${BY}</div>`;
}
export function healthHtml(data, ctx) {
  const { esc } = ctx, d = dietSummary(data, ctx.today);
  const pr = d.progress, hour = ctx.hour ?? 9;
  const lb = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const food = foodState(data, ctx.today, hour);
  const wk = ctx.workout || { state: 'none', html: () => '' };
  const up = nextUp({ hour, weighed: d.weighedToday != null, set: d.set, food, workout: wk.state, title: wk.title });
  const weight = d.weighedToday != null
    ? `<div class="hl-row2"><span class="hl-ic" aria-hidden="true">⚖️</span><div class="hl-mini"><span><b>Weight</b> <span class="good">✓ ${lb(d.weighedToday)} lb</span></span>${d.trendText ? `<small class="hl-trend">${esc(d.trendText)}</small>` : ''}</div></div>`
    : `<div class="hl-row2${up.anchor === 'weight' ? ' hot' : ''}"><span class="hl-ic" aria-hidden="true">⚖️</span><div><b>Today's weight</b><small>${hour < 11 ? 'Morning is best' : 'Any time counts'}${d.weightLb ? ` · last ${lb(d.weightLb)} lb` : ''}</small></div>
      <form class="hl-weigh" data-weigh><label for="hlWeigh" class="visually-hidden">Today's weight in pounds</label><span class="hl-weigh-in"><input id="hlWeigh" name="lb" type="number" step="0.1" min="60" max="700" inputmode="decimal" placeholder="${d.weightLb ? lb(d.weightLb) : 'lb'}" required aria-describedby="hlWeighU"><span id="hlWeighU" class="small">lb</span></span><button>Save</button></form></div>`;
  const status = pr ? `<span class="hl-status ${pr.status}">${STATUS[pr.status].icon} ${STATUS[pr.status].label}</span>` : '';
  const t = d.today;
  const nutrition = !d.set
    ? '<p class="small muted">Set your goal and your plan works out calories and protein for each day.</p><a class="btn wide" href="../#weight">Set up Diet</a>'
    : `${t ? `<div class="hl-today"><div class="row between"><span class="small">Calories</span><span class="small"><b>${t.kcal.toLocaleString()}</b> / ${t.kcalTarget.toLocaleString()} kcal</span></div>${bar(t.kcal, t.kcalTarget)}
        <div class="row between"><span class="small">Protein</span><span class="small"><b>${t.p}</b> / ${t.pTarget} g</span></div>${bar(t.p, t.pTarget)}</div>` : ''}
      ${t?.alc ? `<p class="tiny muted">Includes ${t.alc} kcal from alcohol (counted apart from protein, carbs and fat).</p>` : ''}
      ${pr ? `<a class="hl-plan" href="../#today"><span class="small">${esc(pr.phaseLabel)}${pr.week ? ` · week ${pr.week} of ${pr.weeks}` : ''}</span>${status}</a>` : ''}
      ${d.completeDays ? `<p class="tiny muted">${d.completeDays} complete day${d.completeDays === 1 ? '' : 's'} logged this week${d.completeDays >= 4 ? ' — enough for a useful weekly check-in' : ''}.</p>` : ''}
      <div class="hl-mini"><button type="button" class="linkish small" data-ml="fits">🔎 What fits?</button><a class="hl-go" href="../#today">Today's plan ›</a></div>`;
  const reminder = ctx.reminder == null ? '' : `<button type="button" class="hl-line2" data-act="weighremind"><span>🔔 Morning weigh-in reminder</span><span class="go">${ctx.reminder ? 'On · turn off' : 'Off · turn on'}</span></button>`;
  return `<div class="hl-head"><h1 class="hl-h">💪 Health</h1><button type="button" class="linkish small" data-act="healthshare">${esc(ctx.sharing)} ›</button></div>
    <div class="hl-sec"><h2 class="hl-sech">Today</h2>${up.text ? `<span class="hl-next" role="status">Next: ${esc(up.text)}</span>` : ''}</div>
    <section class="card hl-anchors" aria-label="Today">${weight}${foodRow(food, esc, up.anchor === 'food')}${wk.html(up.anchor === 'workout')}</section>
    ${whoopHtml(ctx.whoop, esc)}
    <div class="hl-sec"><h2 class="hl-sech">Nutrition &amp; plan</h2></div>
    <section class="card hl-card" aria-label="Nutrition and plan">${nutrition}</section>
    <div class="hl-sec"><h2 class="hl-sech">More</h2></div>
    <section class="card hl-more">
      <a class="hl-line2" href="../#weight"><span>⚖️ Weight trend${d.trendText ? ` <small class="muted">· ${esc(d.trendText)}</small>` : ''}</span>${spark(d.weights) || '<span class="go">›</span>'}</a>
      ${reminder}
      ${ctx.devices || ''}
    </section>
    <p class="tiny muted center">🔒 Your Diet and Fitness are private unless you share them. Worked out on your phone.</p>`;
}
