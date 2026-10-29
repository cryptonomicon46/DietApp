// 💪 Health: your day's command centre — weight, nutrition and today's workout, each with its
// status and the one next thing to do (the full Meals, Weight and Fitness screens are a tap away).
// Private unless you share them (Me › 💪 Health sharing). Worked out on this phone from your own
// copy; loaded only when you open Health, so nothing here is start-up work.
import { dailyTargets, PHASES, weeklyTrend, rateText } from '../js/plan.js';
import { onTarget, consistency } from '../js/dietDays.js';
import { planProgress, STATUS } from '../js/planProgress.js';

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
    weighedToday: weights.find((w) => w.date === today)?.weight ?? null,
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
  if (st === 'on-track') return `On track — ${d.consistency.on} of the last ${d.consistency.of} days on target. Keep it steady.`;
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

// The Health screen. `ctx`: { esc, sharing (one line), today, hour, fitness (HTML for the Fitness
// card, family/fitness.js), workout ('active' | 'planned' | null), devices (HTML),
// reminder (true | false | null: the morning weigh-in reminder, null when unknown) }.
export function healthHtml(data, ctx) {
  const { esc } = ctx, d = dietSummary(data, ctx.today), f = fitnessSummary(data, ctx.today);
  const t = d.today, pr = d.progress;
  const lb = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const weight = d.weighedToday != null
    ? `<div class="hl-line"><span class="grow">✓ <b>${lb(d.weighedToday)} lb</b> today</span><a class="hl-go" href="../#weight">Weight trend →</a></div>`
    : `<form class="hl-weigh" data-weigh><label for="hlWeigh" class="small">Today's weight</label><span class="hl-weigh-in"><input id="hlWeigh" name="lb" type="number" step="0.1" min="60" max="700" inputmode="decimal" placeholder="${d.weightLb ? lb(d.weightLb) : 'lb'}" required aria-describedby="hlWeighU"><span id="hlWeighU" class="small">lb</span></span><button>Save</button></form>
      ${d.weightLb ? `<p class="tiny muted"><a href="../#weight">Last: ${lb(d.weightLb)} lb${d.trendText ? ` · ${esc(d.trendText)}` : ''} · Weight trend →</a></p>` : ''}`;
  const reminder = ctx.reminder == null ? '' : `<p class="tiny muted">${ctx.reminder ? '🔔 Morning reminder on · ' : ''}<button type="button" class="linkish tiny" data-act="weighremind">${ctx.reminder ? 'Turn off' : '🔔 Remind me each morning'}</button></p>`;
  const plan = pr ? `<a class="hl-plan" href="../#today"><span>${esc(pr.phaseLabel)}${pr.week ? ` · week ${pr.week} of ${pr.weeks}` : ''}${pr.daysLeft != null ? ` · ${pr.daysLeft} day${pr.daysLeft === 1 ? '' : 's'} left` : ''}</span><b class="hl-status ${pr.status}">${STATUS[pr.status].icon} ${STATUS[pr.status].label}</b></a>` : '';
  const nutrition = !d.set
    ? `<p class="small muted">Set your goal and your plan works out calories and protein for each day.</p><a class="btn wide" href="../#weight">Set up Diet</a>`
    : `${t ? `<div class="hl-today"><div class="row between"><span class="small">Calories</span><span class="small"><b>${t.kcal.toLocaleString()}</b> / ${t.kcalTarget.toLocaleString()} kcal</span></div>${bar(t.kcal, t.kcalTarget)}
        <div class="row between"><span class="small">Protein</span><span class="small"><b>${t.p}</b> / ${t.pTarget} g protein</span></div>${bar(t.p, t.pTarget)}</div>` : ''}
      ${plan}
      <a class="btn wide" href="../#today">Today's plan →</a>`;
  return `<div class="hl-head"><h1 class="hl-h">💪 Health</h1><button type="button" class="linkish small" data-act="healthshare">${esc(ctx.sharing)} ›</button></div>
    <p class="hl-nudge" role="status">${esc(nudgeFor(d, { hour: ctx.hour ?? 9, workout: ctx.workout }))}</p>
    <section class="card hl-card" aria-labelledby="hlWt"><h2 class="card-h" id="hlWt">⚖️ Weight</h2>${weight}${spark(d.weights) ? `<a href="../#weight" class="hl-sparkl" aria-label="Weight trend">${spark(d.weights)}</a>` : ''}${reminder}</section>
    <section class="card hl-card" aria-labelledby="hlDiet"><h2 class="card-h" id="hlDiet">🥗 Nutrition</h2>${nutrition}</section>
    <section class="card hl-card" aria-labelledby="hlFit"><h2 class="card-h" id="hlFit">🏋️ Fitness</h2>${ctx.fitness ?? `<p class="small">${f.week ? `<b>${f.week}</b> workout${f.week === 1 ? '' : 's'} in the last 7 days` : 'No workouts in the last 7 days.'}</p><a class="btn ghost wide" href="../#lift">Training ›</a>`}</section>
    ${ctx.devices ? `<section class="card hl-card" aria-labelledby="hlDev"><h2 class="card-h" id="hlDev">⌚ Activity &amp; devices</h2>${ctx.devices}</section>` : ''}
    <p class="tiny muted center">🔒 Your Diet and Fitness are private unless you share them. Worked out on your phone.</p>`;
}
