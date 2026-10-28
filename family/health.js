// 💪 Health: your own Diet and Fitness, in one calm screen. Private unless you share them
// (Me › 💪 Health sharing). Worked out on this phone from your own copy; loaded only when you open
// Health, so nothing here is start-up work.
import { dailyTargets, PHASES, weeklyTrend, rateText } from '../js/plan.js';
import { onTarget, consistency } from '../js/dietDays.js';

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
  const todayNums = rec?.target ? { kcal: rec.eaten || 0, kcalTarget: rec.target, p: rec.protein || 0, pTarget: rec.proteinTarget || targets?.p || 0, left: rec.left || null, meals: rec.meals || 0 }
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
  };
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

// The Health screen. `ctx`: { esc, sharing (one line), today, fitness (HTML for the Fitness card,
// from Phase 7), devices (HTML) }.
export function healthHtml(data, ctx) {
  const { esc } = ctx, d = dietSummary(data, ctx.today), f = fitnessSummary(data, ctx.today);
  const c = d.consistency, t = d.today;
  const goal = d.goalLb && d.phase === 'cut' ? (d.toGoLb > 0 ? `goal ${d.goalLb} lb · ${d.toGoLb} lb to go` : `at your goal (${d.goalLb} lb)`) : '';
  const diet = !d.set
    ? `<p class="small muted">Set your goal and your plan works out calories and protein for each day.</p><a class="btn wide" href="../#weight">Set up Diet</a>`
    : `<p class="hl-phase"><b>${esc(d.phaseLabel)}</b>${d.week ? ` · week ${d.week} of ${d.weeks}` : ''}${goal ? ` · ${esc(goal)}` : ''}</p>
      ${t ? `<div class="hl-today"><div class="row between"><span class="small">Today</span><span class="small"><b>${t.kcal.toLocaleString()}</b> of ${t.kcalTarget.toLocaleString()} kcal</span></div>${bar(t.kcal, t.kcalTarget)}
        <div class="row between"><span class="small">Protein</span><span class="small"><b>${t.p}</b> of ${t.pTarget} g</span></div>${bar(t.p, t.pTarget)}
        ${t.left ? `<p class="tiny muted">${t.kcal ? `${Math.max(0, t.left.c ?? 0)} g carbs · ${Math.max(0, t.left.f ?? 0)} g fat left` : `Targets: ${t.left.c} g carbs · ${t.left.f} g fat`}</p>` : ''}</div>` : ''}
      <div class="hl-weight"><div class="row between"><span class="small">Weight</span><span class="small"><b>${d.weightLb ? `${d.weightLb} lb` : '—'}</b>${d.trendText ? ` · ${esc(d.trendText)}` : ''}</span></div>${spark(d.weights)}</div>
      <div class="hl-cons"><span class="small"><b>${c.on} of the last ${c.of} days</b> on target</span><span class="hl-dots" aria-hidden="true">${c.marks.map((m) => `<i class="${m.state}" title="${m.date}"></i>`).join('')}</span></div>
      <div class="row hl-acts"><a class="btn grow" href="../#today">Log food</a><a class="btn ghost" href="../#weight">Plan &amp; weight ›</a></div>`;
  return `<div class="hl-head"><h1 class="hl-h">💪 Health</h1><button type="button" class="linkish small" data-act="healthshare">${esc(ctx.sharing)} ›</button></div>
    <section class="card hl-card" aria-labelledby="hlDiet"><h2 class="card-h" id="hlDiet">🥗 Diet</h2>${diet}</section>
    <section class="card hl-card" aria-labelledby="hlFit"><h2 class="card-h" id="hlFit">🏋️ Fitness</h2>${ctx.fitness ?? `<p class="small">${f.week ? `<b>${f.week}</b> workout${f.week === 1 ? '' : 's'} in the last 7 days` : 'No workouts in the last 7 days.'}</p><a class="btn ghost wide" href="../#lift">Training ›</a>`}</section>
    ${ctx.devices ? `<section class="card hl-card" aria-labelledby="hlDev"><h2 class="card-h" id="hlDev">⌚ Activity &amp; devices</h2>${ctx.devices}</section>` : ''}
    <p class="tiny muted center">🔒 Your Diet and Fitness are private unless you share them. Worked out on your phone.</p>`;
}
