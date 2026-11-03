// 💪 Health: your day's command centre. Today first — weight, the next meal and today's workout,
// always in that order, one of them emphasised for the time of day — then nutrition and the plan,
// then the rest (weight trend, devices). The full Meals, Weight and Fitness screens are a tap away.
// Private unless you share them (Me › 💪 Health sharing). Worked out on this phone from your own
// copy; loaded only when you open Health, so nothing here is start-up work.
import { dailyTargets, PHASES, weeklyTrend, rateText } from '../js/plan.js';
import { onTarget, consistency } from '../js/dietDays.js';
import { planProgress, STATUS } from '../js/planProgress.js';
import { planOf, logOf, dayEntry, nextMeal, MEAL_NAMES, MAIN_MEALS } from '../js/dayPlan.js';
import { whoopHtml } from './whoopCard.js';
import { isSick, sickOf, targetsForDay, trendWeights, askStillSick, sickRun, FLUID_GOAL, easyFood, QUICK_EASY, FEEL_DRINKS, COMFORTS, CARE_LINE } from '../js/sickDay.js';

export { onTarget, consistency };
// The WHOOP card lives in ./whoopCard.js (shared with Home); re-exported for Health's callers.
export { WHOOP_COLORS, whoopHtml, whoopDaysHtml, recoveryDetailHtml, sleepDetailHtml, strainDetailHtml } from './whoopCard.js';

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
    targets = { kcal: t.kcal, p: Math.max(t.p + (+a.p || 0), 60), c: Math.max(t.c + (+a.c || 0), 30), f: Math.max(t.f + (+a.f || 0), 25), lbPerWeek: t.lbPerWeek, tdee: t.tdee };
    targets = targetsForDay(targets, data, today);
  }
  const todayNums = rec?.target ? { kcal: rec.eaten || 0, kcalTarget: rec.target, p: rec.protein || 0, pTarget: rec.proteinTarget || targets?.p || 0, left: rec.left || null, meals: rec.meals || 0, alc: rec.alc || 0 }
    : targets ? { kcal: 0, kcalTarget: targets.kcal, p: 0, pTarget: targets.p, left: { c: targets.c, f: targets.f }, meals: 0 } : null;
  const since = p.phaseStart || '';
  // 🤒 Sick days' weigh-ins don't count in the trend (fluids move the scale when you're ill).
  const tw = trendWeights(weights, data);
  const phaseW = tw.filter((w) => w.date >= since);
  const trend = weeklyTrend(phaseW.length >= 2 ? phaseW : tw);
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
    completeDays: Object.entries(data.days || {}).filter(([day, x]) => day > shift(today, -7) && day <= today && x?.complete && !x.sick).length,
    sick: isSick(data, today),
    progress: set ? planProgress({ profile: p, weights: tw, days: data.days || {}, today, planned: targets?.lbPerWeek ?? null }) : null,
  };
}

// 🌤 One calm line for today: the most useful thing, never a scold. Same inputs → same line.
export function nudgeFor(d, { hour = 9, workout = null } = {}) {
  if (workout === 'active') return "You're partway through today's workout — pick up where you left off.";
  if (!d.set) return 'Set up your plan and Health shows your day here: weight, food and training.';
  if (d.sick) return 'Rest up — fluids first, then whatever easy food you can manage.';
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
// When a meal was logged (ms): its timestamp, or — for meals logged before it was kept — its
// "8:15 AM" read on today's date. null when it can't tell.
export function loggedMs(e, today) {
  if (Number.isFinite(e?.ts)) return e.ts;
  const m = /(\d{1,2}):(\d{2})\s*([ap])?\.?\s*m?/i.exec(String(e?.at || ''));
  if (!m || !today) return null;
  let h = +m[1] % 12;
  if (m[3] ? m[3].toLowerCase() === 'p' : +m[1] >= 12) h += 12;
  if (!m[3] && +m[1] === 12) h = 12;
  const d = new Date(`${today}T00:00:00`); d.setHours(h, +m[2], 0, 0);
  return d.getTime();
}
export const JUST_LOGGED_MS = 60 * 60 * 1000;
export function foodState(data = {}, today, hour = 12, now = Date.now()) {
  const d = dietSummary(data, today);
  if (!d.set) return { set: false };
  const log = logOf(data, today), next = nextMeal(data, today);
  let plan = null;
  try { plan = planOf(data, today); } catch { plan = null; } // a food this phone doesn't know: the trackers show it
  let left = null;
  try { left = dayEntry(data, today).left; } catch { left = d.today?.left || null; }
  const last = [...MAIN_MEALS].reverse().find((m) => log.meals?.[m]);
  const lastBig = last && BIG(log.meals[last]);
  // ✓ Just logged: the meal you logged (or updated) in the last hour, with its macros — until the
  // next meal's time comes, when that meal's preview takes over again.
  const recent = MAIN_MEALS.map((m) => ({ m, e: log.meals?.[m], t: loggedMs(log.meals?.[m], today) })).filter((x) => x.e && x.t != null && now - x.t >= -5 * 60e3 && now - x.t < JUST_LOGGED_MS).sort((a, b) => b.t - a.t)[0];
  const nextStarts = next ? (MEAL_HOURS[next]?.[0] ?? 24) : 24;
  // (Logged late, with the next meal's time already here: still 15 minutes to see what it came to.)
  const just = recent && !log.done && (hour < nextStarts || now - recent.t < 15 * 60e3) ? { meal: recent.m, title: recent.e.title, kcal: recent.e.kcal, p: recent.e.p, c: recent.e.c, f: recent.e.f, target: recent.e.target || null, at: recent.e.at || '' } : null;
  const nt = next && plan?.[next]?.totals;
  return {
    set: true, next, meal: next ? MEAL_NAMES[next] : null,
    title: next && plan?.[next] ? plan[next].title : '', kcal: next && plan?.[next] ? plan[next].totals.kcal : null,
    macros: nt ? { p: nt.p, c: nt.c, f: nt.f } : null, just,
    logged: MAIN_MEALS.filter((m) => log.meals?.[m]).length, done: !!log.done, left,
    // Every meal today, one tap from Health: what you logged, else what's planned (yours if you
    // described it — a meal from Talk or Tell me becomes that meal's plan).
    meals: ['breakfast', 'lunch', 'snack', 'dinner'].map((m) => {
      const l = log.meals?.[m], p = plan?.[m];
      return l ? { meal: m, logged: true, title: l.title, kcal: l.kcal } : p?.totals ? { meal: m, logged: false, title: p.title, kcal: p.totals.kcal } : null;
    }).filter(Boolean),
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
export function nextUp({ hour = 12, weighed = false, set = true, food = {}, workout = 'none', title = '', sick = false } = {}) {
  if (workout === 'active') return { anchor: 'workout', text: `resume ${title && title.length <= 18 ? title : 'your workout'}` };
  // 🤒 A sick day: no weigh-in or workout nudges — fluids and something easy to eat.
  if (sick) return food.next && hour >= (MEAL_HOURS[food.next]?.[0] ?? 24) - 1 && hour < (MEAL_HOURS[food.next]?.[1] ?? 0) ? { anchor: 'food', text: `something easy for ${food.meal.toLowerCase()}` } : { anchor: null, text: 'rest and fluids' };
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
const mealList = (f, esc) => (f.meals?.length ? `<div class="hl-meals" role="list" aria-label="Today's meals">${f.meals.map((m) => `<button type="button" role="listitem" class="hl-meal${m.logged ? ' on' : ''}${m.meal === f.next ? ' next' : ''}" data-ml="open:${m.meal}" aria-label="${esc(MEAL_NAMES[m.meal])}: ${esc(m.title)}, ${r0(m.kcal)} kcal, ${m.logged ? 'logged' : 'planned'} — open to change">${m.logged ? '✓ ' : ''}<b>${esc(MEAL_NAMES[m.meal])}</b><small>${r0(m.kcal)} kcal</small></button>`).join('')}<a class="hl-meal all" href="../#today">All meals ›</a></div>` : '');
// 🥣 On a sick day, the next meal offers three easy-to-eat picks (one tap logs it) and the rest in its sheet.
function easyPicks(meal, esc) {
  const picks = QUICK_EASY.map(easyFood).filter(Boolean);
  return `<div class="hl-easy" role="group" aria-label="Easy to eat for ${esc(MEAL_NAMES[meal])}"><small class="muted">Easy to eat — tap to log it as ${esc(MEAL_NAMES[meal].toLowerCase())}:</small><div class="hl-easyrow">${picks.map((x) => `<button type="button" class="ghost hl-easyb" data-sick="easy:${meal}:${x.id}"><b>${esc(x.name)}</b><small>${x.kcal} kcal · ${x.p} g protein</small></button>`).join('')}</div><button type="button" class="linkish small" data-ml="open:${meal}">More easy foods ›</button></div>`;
}
function foodRow(f, esc, hot, sick = false) {
  const cls = `hl-row2${hot ? ' hot' : ''}`;
  if (!f.set) return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>Your food plan</b><small>Set your goal and Health shows each meal here.</small></div><div class="hl-acts"><a class="btn grow" href="../#weight">Set up Diet</a></div></div>`;
  // ✓ As planned, or 🍴 Ate out. Anything else (another breakfast, a combo, a bar, packaged, Fit
  // to N kcal) is in the meal's own sheet: tap the meal's name or its chip.
  // Protein · carbs · fat, as small chips.
  const mac = (x) => (x && x.p != null ? `<span class="hl-mac"><span class="ml-p"><b>${r0(x.p)}</b> P</span><span class="ml-c"><b>${r0(x.c)}</b> C</span><span class="ml-f"><b>${r0(x.f)}</b> F</span></span>` : '');
  const acts = (m) => `<div class="hl-acts"><button type="button" class="grow" data-ml="plan:${m}">✓ As planned</button><button type="button" class="ghost grow" data-ml="out:${m}">🍴 Ate out</button></div>`;
  if (f.off) {
    return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>${esc(MEAL_NAMES[f.off.meal])} logged ✓</b><small>${esc(f.off.title)} · ${r0(f.off.kcal)} kcal</small>${f.just?.meal === f.off.meal ? mac(f.just) : ''}</div>
      <p class="hl-ctx">Plans change. ${leftText(f.left)}</p>
      <div class="hl-acts"><button type="button" class="grow" data-ml="adjust">Adjust the rest of today</button><button type="button" class="ghost" data-ml="fits">What fits?</button></div>${mealList(f, esc)}</div>`;
  }
  // ✓ Just logged (for an hour, or until the next meal's time): what it came to, then what's next.
  if (f.just) {
    const j = f.just, vs = j.target?.kcal ? r0(j.kcal - j.target.kcal) : null;
    const plan = vs == null ? '' : Math.abs(vs) <= 40 ? ' · on plan' : ` · ${vs > 0 ? '+' : '−'}${Math.abs(vs)} kcal vs plan`;
    const nextLine = f.next ? `<button type="button" class="hl-what hl-nextup" data-ml="open:${f.next}"><small><b>${esc(f.meal)} next</b>${f.title ? ` · ${esc(f.title)} · ${r0(f.kcal)} kcal` : ''}${f.refit ? ' · re-fitted to what\'s left' : ''} ›</small>${mac(f.macros)}</button>` : '';
    return `<div class="${cls} hl-just" role="status"><span class="hl-ic" aria-hidden="true">🍽</span><button type="button" class="hl-what" data-ml="open:${j.meal}"><b>✓ ${esc(MEAL_NAMES[j.meal])} logged${j.at ? ` · ${esc(j.at)}` : ''}</b><small>${esc(j.title)} · ${r0(j.kcal)} kcal${plan} ›</small>${mac(j)}</button>${nextLine}${mealList(f, esc)}</div>`;
  }
  if (f.next) {
    return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><button type="button" class="hl-what" data-ml="open:${f.next}"><b>${esc(f.meal)} is next</b><small>${f.title ? `${esc(f.title)} · ${r0(f.kcal)} kcal` : 'See it in Today\'s plan'}${f.refit ? ' · re-fitted to what\'s left' : f.logged ? ` · ${f.logged} of 3 logged` : ''} ›</small>${mac(f.macros)}</button>${sick ? easyPicks(f.next, esc) : ''}${acts(f.next)}${mealList(f, esc)}</div>`;
  }
  if (f.done) return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div class="hl-mini"><span><b>Food</b> <span class="good">✓ done for today</span></span><button type="button" class="linkish small" data-ml="undone">Undo</button></div></div>`;
  return `<div class="${cls}"><span class="hl-ic" aria-hidden="true">🍽</span><div><b>${f.logged} meals logged</b><small>${r0(f.eaten).toLocaleString()} kcal · ${r0(f.protein)} g protein${f.left && f.left.kcal > 60 ? ` · ~${r0(f.left.kcal)} kcal left` : ''}</small></div>
    <div class="hl-acts"><button type="button" class="grow" data-ml="done">✓ Done logging today</button><button type="button" class="ghost" data-ml="extra">＋ Add</button></div>${mealList(f, esc)}</div>`;
}

// The Health screen. `ctx`: { esc, sharing (one line), today, hour, workout: { state: 'planned' |
// 'active' | 'done' | 'none', html: (hot) => the Workout row } from family/fitness.js, devices
// (HTML), reminder (true | false | null: the morning weigh-in reminder, null when unknown) }.
// ⌚ WHOOP today (only when WHOOP is connected on this phone): Sleep, Recovery and Strain — in
// WHOOP's own order — as WHOOP gives them, one calm line (js/whoopDay.js recoveryContext), and — only when Recovery is lower
// than your usual or the night was short, and there's a workout today — an offer to make it
// lighter, previewed first. WHOOP informs; it never changes your plan by itself. Private to you.
// WHOOP's own palette (WHOOP Brand & Design Guidelines): its scores keep its colours.
// 🔥 Burned today, from WHOOP (only with WHOOP connected on this phone): resting plus activity so far.
const burnedRow = (kcal) => (Number.isFinite(kcal) && kcal > 0 ? `<div class="row between hl-burned"><span class="small">🔥 Burned · WHOOP</span><span class="small"><b>${Math.round(kcal).toLocaleString()}</b> kcal so far</span></div><p class="tiny muted hl-burned-note">Resting plus activity today, as WHOOP counts it.</p>` : '');
// 🤒 Sick day (js/sickDay.js): only when you turn it on (here or by telling Talk). It ends with the day.
function sickBanner(data, today, esc) {
  const n = sickRun(data, today);
  return `<section class="card hl-sick" aria-label="Sick day"><div class="row between"><b>🤒 Sick day${n > 1 ? ` · day ${n}` : ''}</b><button type="button" class="linkish small" data-sick="off">I'm better · turn off</button></div><p class="small">No calorie cut today: eat what you can, keep protein up, and drink plenty. It ends tonight, and tomorrow Health asks how you feel.</p></section>`;
}
const stillSick = () => '<section class="card hl-sick" aria-label="Still feeling sick?"><b>🤒 Still feeling sick?</b><p class="small muted">Yesterday was a sick day.</p><div class="hl-acts"><button type="button" class="grow" data-sick="on">Yes, sick day today</button><button type="button" class="ghost grow" data-sick="better">I\'m better</button></div></section>';
function fluidsRow(e) {
  const n = e?.fluids || 0;
  return `<div class="hl-row2 hl-fluids"><span class="hl-ic" aria-hidden="true">💧</span><div><b>Fluids · ${n} of ${FLUID_GOAL} cups</b><small>Water, tea, broth, an electrolyte drink</small>${bar(n, FLUID_GOAL)}</div><div class="hl-acts"><button type="button" class="ghost hl-less" data-sick="fluid:-1" aria-label="One cup less" ${n ? '' : 'disabled'}>−</button><button type="button" class="grow" data-sick="fluid:1">＋1 cup</button></div></div>`;
}
const restRow = () => '<div class="hl-row2"><span class="hl-ic" aria-hidden="true">😴</span><div class="hl-mini"><span><b>Rest today</b><small>Your workout will wait. Rest helps you get better.</small></span><button type="button" class="linkish small hl-tap" data-sick="workout">Show workout</button></div></div>';
function feelBetter(e, esc) {
  const done = new Set(e?.comfort || []);
  const drinks = FEEL_DRINKS.map((d) => `<button type="button" class="hl-feel" data-sick="drink:${d.id}" aria-label="${esc(d.name)}: add ${d.cups === 1 ? 'a cup' : `${d.cups} cups`} to your fluids${d.kcal ? ` and log ${d.kcal} kcal` : ''}"><span><b>${esc(d.name)}</b><small>${esc([d.cups > 1 ? `${d.cups} cups` : '', d.kcal ? `${d.kcal} kcal` : '', d.sub].filter(Boolean).join(' · '))}</small></span><span class="go" aria-hidden="true">＋</span></button>`).join('');
  const comforts = COMFORTS.map((x) => { const on = done.has(x.id); return `<button type="button" class="hl-feel${on ? ' on' : ''}" aria-pressed="${on}" data-sick="comfort:${x.id}"><span><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><span class="go" aria-hidden="true">${on ? '✓' : '○'}</span></button>`; }).join('');
  return `<div class="hl-sec"><h2 class="hl-sech">Feel better</h2></div>
    <section class="card hl-feelc" aria-label="Feel better"><div class="ml-label small">Drinks <span class="muted">· each one counts toward your fluids</span></div>${drinks}
    <div class="ml-label small">Comforts <span class="muted">· tick what you've done today</span></div>${comforts}
    <p class="tiny muted hl-care">${esc(CARE_LINE)}</p></section>`;
}
export function healthHtml(data, ctx) {
  const { esc } = ctx, d = dietSummary(data, ctx.today);
  const pr = d.progress, hour = ctx.hour ?? 9;
  const lb = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const food = foodState(data, ctx.today, hour, ctx.now ?? Date.now());
  const wk = ctx.workout || { state: 'none', html: () => '' };
  const sick = d.sick, sickE = sick ? sickOf(data, ctx.today) : null;
  const up = nextUp({ hour, weighed: d.weighedToday != null, set: d.set, food, workout: wk.state, title: wk.title, sick });
  // 📸 Today's progress photos already on this phone (ctx.photosToday: their poses): no asking again.
  const photosToday = ctx.photosToday || [], photosDone = photosToday.length > 0;
  const POSE = { front: 'Front', side: 'Side', back: 'Back' };
  const photoLine = photosDone ? `<small class="hl-phdone">📸 ✓ ${esc(photosToday.map((p) => POSE[p] || p).join(' · '))} photo${photosToday.length === 1 ? '' : 's'} today</small>`
    : '<button type="button" class="ghost small hl-phbtn" data-wi="photos">📸 Progress photos</button>';
  const weight = d.weighedToday != null
    ? `<div class="hl-row2"><span class="hl-ic" aria-hidden="true">⚖️</span><div class="hl-mini"><span><b>Weight</b> <span class="good">✓ ${lb(d.weighedToday)} lb</span></span>${sick ? '<small class="hl-trend">Sick day: not in your trend</small>' : d.trendText ? `<small class="hl-trend">${esc(d.trendText)}</small>` : ''}</div>${photoLine}</div>`
    : sick && !ctx.sickWeigh ? '<div class="hl-row2"><span class="hl-ic" aria-hidden="true">⚖️</span><div class="hl-mini"><span><b>Weigh-in skipped</b><small>Fluids move the scale when you\'re ill. Today stays out of your trend.</small></span><button type="button" class="linkish small hl-tap" data-sick="weigh">Weigh anyway</button></div></div>'
    : `<div class="hl-row2${up.anchor === 'weight' ? ' hot' : ''}"><span class="hl-ic" aria-hidden="true">⚖️</span><div><b>Today's weight</b><small>${hour < 11 ? 'Morning is best' : 'Any time counts'}${d.weightLb ? ` · last ${lb(d.weightLb)} lb` : ''}</small></div>
      <form class="hl-weigh" data-weigh><label for="hlWeigh" class="visually-hidden">Today's weight in pounds</label><span class="hl-weigh-in"><input id="hlWeigh" name="lb" type="number" step="0.1" min="60" max="700" inputmode="decimal" placeholder="${d.weightLb ? lb(d.weightLb) : 'lb'}" required aria-describedby="hlWeighU"><span id="hlWeighU" class="small">lb</span></span><button>Save</button></form><small class="hl-phnote">You check it before it saves${photosDone ? '' : ' · 📸 photos optional'}</small></div>`;
  const status = pr ? `<span class="hl-status ${pr.status}">${STATUS[pr.status].icon} ${STATUS[pr.status].label}</span>` : '';
  const t = d.today;
  const nutrition = !d.set
    ? '<p class="small muted">Set your goal and your plan works out calories and protein for each day.</p><a class="btn wide" href="../#weight">Set up Diet</a>'
    : `${t ? `<div class="hl-today"><div class="row between"><span class="small">Calories${sick ? ' <span class="hl-pill">maintenance</span>' : ''}</span><span class="small"><b>${t.kcal.toLocaleString()}</b> / ${t.kcalTarget.toLocaleString()} kcal</span></div>${bar(t.kcal, t.kcalTarget)}
        <div class="row between"><span class="small">Protein</span><span class="small"><b>${t.p}</b> / ${t.pTarget} g</span></div>${bar(t.p, t.pTarget)}
        ${burnedRow(ctx.whoop?.burned)}</div>` : ''}
      ${sick ? '<p class="tiny muted">🤒 Sick day: no calorie cut, and today is left out of your plan\'s progress and weekly check-in.</p>' : ''}
      ${t?.alc ? `<p class="tiny muted">Includes ${t.alc} kcal from alcohol (counted apart from protein, carbs and fat).</p>` : ''}
      ${pr ? `<a class="hl-plan" href="../#today"><span class="small">${esc(pr.phaseLabel)}${pr.week ? ` · week ${pr.week} of ${pr.weeks}` : ''}</span>${status}</a>` : ''}
      ${d.completeDays ? `<p class="tiny muted">${d.completeDays} complete day${d.completeDays === 1 ? '' : 's'} logged this week${d.completeDays >= 4 ? ' — enough for a useful weekly check-in' : ''}.</p>` : ''}
      <div class="hl-mini"><button type="button" class="linkish small" data-ml="fits">🔎 What fits?</button><a class="hl-go" href="../#today">Today's plan ›</a></div>`;
  const reminder = ctx.reminder == null ? '' : `<button type="button" class="hl-line2" data-act="weighremind"><span>🔔 Morning weigh-in reminder</span><span class="go">${ctx.reminder ? 'On · turn off' : 'Off · turn on'}</span></button>`;
  const workoutRow = sick && wk.state === 'planned' && !ctx.sickWorkout ? restRow() : wk.html(up.anchor === 'workout');
  const sickTop = sick ? sickBanner(data, ctx.today, esc) : d.set && askStillSick(data, ctx.today) && !ctx.sickAsked ? stillSick() : '';
  const sickOn = sick || !d.set ? '' : '<button type="button" class="hl-line2" data-sick="on"><span>🤒 Sick day <small class="muted">· no calorie cut, fluids and easy food, for today</small></span><span class="go">Turn on</span></button>';
  return `<div class="hl-head"><h1 class="hl-h">💪 Health</h1><button type="button" class="linkish small" data-act="healthshare">${esc(ctx.sharing)} ›</button></div>
    ${sickTop}
    <div class="hl-sec"><h2 class="hl-sech">Today</h2>${up.text ? `<span class="hl-next" role="status">Next: ${esc(up.text)}</span>` : ''}</div>
    <section class="card hl-anchors" aria-label="Today">${weight}${sick ? fluidsRow(sickE) : ''}${foodRow(food, esc, up.anchor === 'food', sick)}${workoutRow}</section>
    ${sick ? feelBetter(sickE, esc) : ''}
    ${whoopHtml(ctx.whoop, esc)}
    <div class="hl-sec"><h2 class="hl-sech">Nutrition &amp; plan</h2></div>
    <section class="card hl-card" aria-label="Nutrition and plan">${nutrition}</section>
    <div class="hl-sec"><h2 class="hl-sech">More</h2></div>
    <section class="card hl-more">
      <a class="hl-line2" href="../#weight"><span>⚖️ Weight trend${d.trendText ? ` <small class="muted">· ${esc(d.trendText)}</small>` : ''}</span>${spark(d.weights) || '<span class="go">›</span>'}</a>
      ${sickOn}
      ${reminder}
      ${ctx.devices || ''}
    </section>
    <p class="tiny muted center">🔒 Your Diet and Fitness are private unless you share them. Worked out on your phone.</p>`;
}
