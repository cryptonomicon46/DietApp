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
// ⌚ WHOOP today (only when WHOOP is connected on this phone): Recovery, Sleep and Strain as WHOOP
// gives them, one calm line (js/whoopDay.js recoveryContext), and — only when Recovery is lower
// than your usual or the night was short, and there's a workout today — an offer to make it
// lighter, previewed first. WHOOP informs; it never changes your plan by itself. Private to you.
const BAND = { green: 'Green', yellow: 'Yellow', red: 'Red' };
export function whoopHtml(w, esc) {
  if (!w) return '';
  const head = `<div class="hl-sec"><h2 class="hl-sech">WHOOP</h2>${w.dailyMissing ? '' : '<button type="button" class="linkish small" data-act="whoopdays">Last 7 days ›</button>'}</div>`;
  if (w.dailyMissing) return `${head}<section class="card hl-whoop" aria-label="WHOOP"><p class="small">Reconnect WHOOP to see your Recovery and Sleep here. Your workouts keep syncing either way.</p><button type="button" class="ghost" data-act="devconnect">Reconnect WHOOP</button></section>`;
  const r = w.recovery, sl = w.sleep;
  const rec = r.state === 'scored' && r.score != null
    ? `<b class="wh-big"><span class="wh-dot ${r.band}" aria-hidden="true"></span>${r.score}%</b><small>${BAND[r.band] || ''}${r.relative ? ` · ${r.relative === 'usual' ? 'your usual' : `${r.relative} than usual`}` : ''}</small>`
    : `<b class="wh-big wh-none">—</b><small>${r.state === 'unscorable' ? 'Not scored' : 'Not scored yet'}</small>`;
  const sleep = sl.hours != null ? `<b class="wh-big">${sl.hours} h</b><small>${sl.neededHours ? `of ${sl.neededHours} h needed` : sl.performance != null ? `${sl.performance}%` : ''}</small>` : `<b class="wh-big wh-none">—</b><small>${sl.state === 'none' ? 'No sleep yet' : 'Not scored yet'}</small>`;
  const strain = w.strain.today != null ? `<b class="wh-big">${w.strain.today.toFixed(1)}</b><small>${w.strain.yesterday != null ? `yesterday ${w.strain.yesterday.toFixed(1)}` : 'so far today'}</small>` : `<b class="wh-big wh-none">—</b><small>${w.strain.yesterday != null ? `yesterday ${w.strain.yesterday.toFixed(1)}` : 'none yet'}</small>`;
  const lt = w.lighter || {};
  const lighter = lt.applied ? `<p class="small wh-applied">🪶 Today's workout is lighter · <button type="button" class="linkish small" data-fx="lighterundo">Undo</button></p>`
    : w.lighterHint && lt.can ? '<button type="button" class="ghost wh-lighter" data-fx="lighter">🪶 Make today\'s workout lighter</button>' : '';
  return `${head}<section class="card hl-whoop" aria-label="WHOOP today">
    <div class="wh-tiles"><div class="wh-tile"><span class="wh-lab">Recovery</span>${rec}</div><div class="wh-tile"><span class="wh-lab">Sleep</span>${sleep}</div><div class="wh-tile"><span class="wh-lab">Strain</span>${strain}</div></div>
    <p class="small wh-line">${esc(w.line)}</p>${lighter}</section>`;
}
// The last 7 days, WHOOP's numbers only, and your usual range once there's enough.
export function whoopDaysHtml(days, range, esc) {
  const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `<div class="row between"><h2>⌚ WHOOP · last 7 days</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <table class="wh-days"><thead><tr><th scope="col">Day</th><th scope="col">Recovery</th><th scope="col">Sleep</th><th scope="col">Strain</th></tr></thead><tbody>
    ${days.map((x) => `<tr><th scope="row">${esc(day(x.date))}</th><td>${x.recovery != null ? `<span class="wh-dot ${x.band}" aria-hidden="true"></span>${x.recovery}%` : `<span class="muted">${x.state === 'unscorable' ? 'not scored' : '—'}</span>`}</td><td>${x.sleepHours != null ? `${x.sleepHours} h` : '<span class="muted">—</span>'}</td><td>${x.strain != null ? x.strain.toFixed(1) : '<span class="muted">—</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p class="small">${range.ready ? `Your usual Recovery: ${range.low}–${range.high}% (the middle half of your last 30 days).` : `Building your usual range — ${range.have} of ${range.need} scored days so far. Until then, WHOOP's own colour is all that's shown.`}</p>
    <p class="tiny muted">🔒 Your Recovery and Sleep are yours alone — not shared with your family, whatever your Fitness sharing. Numbers are WHOOP's; "usual" and the sleep gap are worked out on your phone.</p>`;
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
