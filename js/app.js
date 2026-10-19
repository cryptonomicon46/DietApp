import { FOODS, STORES, FOOD_GROUPS, addScannedFoods, addMyFoods, makeMyFood, guessCategory, MY_CATS } from './foods.js';
import {
  ACTIVITY, PACE, PHASES, dailyTargets, goalProjection, planForDay, groceryList,
  weeklyTrend, suggestAdjustment, fitScore,
  FEELINGS, CHECKIN_OPTIONS, deltaKcal, recommendCheckin, weekOverWeek, checkinWindow, isCheckinDue, weeklyReview, deltaMacros,
  EAT_OUT, EAT_OUT_SIZE, EAT_OUT_ATE, DRINKS, drinksTotals, fitItems, labelKcal,
} from './plan.js';
import {
  SESSION_TYPES, SPORTS, INTENSITY, trainingDay, applyTraining, parseGarminCsv, parseWhoopCsv,
  sportStats, estimateActivity, sessionType,
} from './activity.js';
import { devices } from './devices.js';
import { RESEARCH } from './research.js';
import { initNotes, renderNotes, updateNotesBadge, openUs, homeUs } from './notes.js';
import { syncLine } from './plans.js';
import { initCal, renderCal, homeCal, updateCalBadge } from './calTab.js';
import { initBrief, renderBrief, renderFeed, homeDogs, homeGym } from './briefTab.js';
import { initLift, renderLift, applyAssistantActions, setCommandFeedback } from './lift.js';
import { scoreDay, tally, MILESTONES } from './rewards.js';
import { store, global, PROFILES, activeProfile, setActiveProfile, ownerId, setOwner, exportProfile, importProfile, profileStore } from './storage.js';
import { sync, newHouseholdCode, DEFAULT_CONNECTOR } from './sync.js';
import { renderHousehold, initHousehold } from './household.js';
import { renderRhythm, initRhythm } from './rhythm.js';
import { renderDexa, initDexa, allScans } from './dexa.js';
import { healthDay, strongStreak, cheerFor, personData } from './cheer.js';
import { renderClimb, initClimb, openClimb, climbSummary, renderProgress, initProgress, openProgress } from './climb.js';
import { buildTables, toCsv, summary, weekRows } from './analytics.js';
import { icsCalendar } from './calendar.js';
import { makeZip } from './zip.js';
import { drawPoster, planCsvRows, drawReportPoster } from './poster.js';
import { RANGES, PHASE_NAMES, buildReport, reportText, reportCsvRows, weeklyRows, rangeTitle, combosText, combosCsvRows } from './share.js';
import { programReview } from './review.js';

// ---------- storage ----------
// Each person's data is kept separately (see storage.js); `store` reads/writes the open profile.
addScannedFoods(store.get('scannedFoods', {}));
// Foods either of you entered with their own macros (shared: both phones' lists combined).
function registerMyFoods() {
  const list = {};
  // Deleted ones stay known (meals that used them still add up) but leave the lists.
  for (const p of PROFILES) for (const [id, e] of Object.entries(profileStore(p.id).get('myFoods', {}))) list[id] = { ...makeMyFood(e), by: p.id, ...(e.deleted ? { hidden: true } : {}) };
  addMyFoods(list);
}
registerMyFoods();

const state = {
  profile: store.get('profile', null),
  weights: store.get('weights', []),   // [{date: 'YYYY-MM-DD', weight}]
  adjust: store.get('adjust', 0),      // kcal tweak from check-ins
  custom: store.get('custom', {}),     // today's meal edits: {date, meals: {breakfast: {template, picks, grams}}}
  planned: store.get('planned', {}),
  combos: store.get('combos', []),     // saved meal combos: [{id, name, kind: 'breakfast'|'main', items: [{food, grams}], manual?}]   // meal edits made ahead for future days: {date: {breakfast: {...}}}
  viewDate: null,                      // the day shown on Today (null = today)
  prefs: store.get('prefs', {}),       // sticky swaps: {oatmeal: {fat: 'almondButter'}, main: {carb: 'quinoa'}}
  macroAdjust: store.get('macroAdjust', { p: 0, f: 0, c: 0 }), // grams, from weekly check-ins
  checkins: store.get('checkins', []), // [{date, feeling, note, change}]
  eaten: store.get('eaten', {}),       // today's log: {date, meals: {breakfast: {kcal,p,f,c,title,target}}, fuel, extras: []}
  mealLog: store.get('mealLog', {}),   // past days' logs, kept for history and export: {date: {meals, fuel, extras}}
  checked: store.get('checked', {}),   // grocery checkboxes
  workouts: store.get('workouts', []), // synced/imported workouts, last 14 days
  days: store.get('days', {}),          // daily summary for the deficit game: {date: {eaten, burned, ...}}
  whoopTotal: store.get('whoopTotal', {}), // {date: kcal} total burned today, typed from WHOOP
  history: store.get('workoutHistory', []), // every imported workout (compact) → personal burn rates
  // Activities you add yourself: [{id, date, type, minutes}] (older single 'planned' entry migrated).
  activities: store.get('activities', null) ?? (store.get('planned', null) ? [{ id: 'p1', ...store.get('planned', null) }] : []),
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

function currentWeight() {
  const last = state.weights[state.weights.length - 1];
  return last ? last.weight : state.profile.weight;
}

function baseTargets() {
  const t = dailyTargets(state.profile, currentWeight(), state.adjust);
  const a = state.macroAdjust;
  const p = Math.max(t.p + a.p, 60), f = Math.max(t.f + a.f, 25);
  let c = Math.max(t.c + a.c, 30);
  // Check-in changes never push calories below the safe minimum (1500 men / 1200 women).
  const floor = state.profile.sex === 'male' ? 1500 : 1200;
  const kcalWith = (cc) => t.kcal + (p - t.p) * 4 + (f - t.f) * 9 + (cc - t.c) * 4;
  if (kcalWith(c) < floor) c += Math.ceil((floor - kcalWith(c)) / 4);
  return { ...t, p, f, c, kcal: Math.round(kcalWith(c)), atFloor: kcalWith(c) <= floor + 20 };
}

const firstName = () => (state.profile?.name || '').trim().split(/\s+/)[0];

// ---------- eaten today ----------
function todaysLog() {
  if (state.eaten.date !== isoDate()) {
    // New day: file yesterday's log in the history before starting fresh.
    if (state.eaten.date) {
      const { date, ...log } = state.eaten;
      state.mealLog[date] = log;
      store.set('mealLog', state.mealLog);
    }
    state.eaten = { date: isoDate(), meals: {}, fuel: null, extras: [] };
  }
  return state.eaten;
}
function saveLog() { store.set('eaten', state.eaten); }

function consumed() {
  const log = todaysLog();
  const items = [...Object.values(log.meals), ...(log.fuel ? [log.fuel] : []), ...log.extras];
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const it of items) for (const k in t) t[k] += it[k] || 0;
  return t;
}

// Calories burned today: your WHOOP total if you typed it, otherwise resting + daily
// life + the full net burn of each activity (the plan only eats back 75% of it).
function burnedToday() {
  const today = isoDate();
  const typed = state.whoopTotal[today];
  if (typed) return { kcal: typed, source: 'WHOOP (you entered)' };
  const base = baseTargets();
  if (!ACTIVITY[state.profile.activity].tracked) return { kcal: base.tdee, source: 'estimate from your activity level' };
  const day = todaysTraining();
  const exercise = day.sessions.reduce((a, w) => a + Math.max((w.kcal || 0) - (base.bmr / 1440) * w.minutes, 0), 0);
  return { kcal: Math.round(base.tdee + exercise), source: 'estimate: daily life + your activities' };
}

// Positive while cutting, 0 at maintenance or on a diet break, negative on a lean gain.
function plannedDeficitFor(base, burned, t) {
  if (base.lbPerWeek < 0) return base.tdee - base.kcal;
  if (base.lbPerWeek === 0) return 0;
  return Math.max(base.tdee - base.kcal, burned - t.kcal);
}

// Weigh-ins since the current phase started (trends shouldn't mix a cut with a gain).
function phaseWeights() {
  const start = state.profile.phaseStart || '';
  const w = state.weights.filter((x) => x.date >= start);
  return w.length >= 2 ? w : state.weights;
}

function recordDay() {
  const t = targets(), base = baseTargets(), ate = consumed();
  const burned = burnedToday().kcal;
  state.days[isoDate()] = {
    eaten: Math.round(ate.kcal), burned, target: t.kcal,
    // The plan's deficit for today includes the share of training calories it doesn't
    // add back to food, so eating to target on a big training day isn't "too big".
    plannedDeficit: plannedDeficitFor(base, burned, t), protein: Math.round(ate.p), proteinTarget: t.p,
    floor: state.profile.sex === 'male' ? 1500 : 1200,
    meals: Object.keys(todaysLog().meals).length,
  };
  store.set('days', state.days);
}

function pastTally() {
  const today = isoDate();
  const past = Object.fromEntries(Object.entries(state.days).filter(([d]) => d < today));
  return tally(past, today);
}

// Quick reference in the header on every tab: eaten vs left for today.
function renderDayBar() {
  if (state.profile) recordDay();
  const bar = $('#dayBar');
  if (!state.profile) { bar.hidden = true; return; }
  const t = targets();
  const ate = consumed();
  const left = t.kcal - Math.round(ate.kcal);
  const pct = Math.min(100, Math.round((ate.kcal / t.kcal) * 100));
  // Over a macro shows as "+12 over" in the warning color instead of a negative number.
  const mLeft = (k) => { const v = Math.round(t[k] - ate[k]); return v >= 0 ? `${v}` : `<span class="over">+${-v}</span>`; };
  bar.hidden = false;
  const g = pastTally();
  bar.innerHTML = `
    <div class="daybar-game"><span title="Gold coins">🪙 ${g.coins}</span><span title="Protein cookies">🍪 ${g.cookies}</span><span title="Deficit streak">🔥 ${g.streak}</span></div>
    <div class="daybar-nums">
      <span><small>Eaten</small><b>${Math.round(ate.kcal)}</b></span>
      <span class="${left < 0 ? 'over' : ''}"><small>${left < 0 ? 'Over' : 'Left'}</small><b>${Math.abs(left)}</b></span>
      <span class="daybar-macros"><small>Macros left</small><span><em class="p">${mLeft('p')}P</em> <em class="f">${mLeft('f')}F</em> <em class="c">${mLeft('c')}C</em></span></span>
    </div>
    <div class="daybar-track" role="progressbar" aria-valuemin="0" aria-valuemax="${t.kcal}" aria-valuenow="${Math.round(ate.kcal)}" aria-label="Calories eaten today"><i style="width:${pct}%"></i></div>`;
}

// The day shown on the Today tab: today, a past day (review) or a future day (plan ahead).
const viewDay = () => state.viewDate || isoDate();
const viewingToday = () => viewDay() === isoDate();
const viewingFuture = () => viewDay() > isoDate();
const dateOf = (iso) => new Date(`${iso}T12:00:00`);

// Meal edits for the day being shown. Today's reset each day, starting from anything you
// planned ahead for it; future days keep what you plan for them.
function todaysCustom() {
  if (!viewingToday()) return (state.planned[viewDay()] ||= {});
  if (state.custom.date !== isoDate()) {
    state.custom = { date: isoDate(), meals: state.planned[isoDate()] || {} };
    delete state.planned[isoDate()];
    for (const d of Object.keys(state.planned)) if (d < isoDate()) delete state.planned[d];
    store.set('planned', state.planned);
  }
  return state.custom.meals;
}
function saveCustom() {
  if (viewingToday()) store.set('custom', state.custom);
  else store.set('planned', state.planned);
}
// Future days use your base targets (no workouts known yet).
function todayPlan(t = viewingToday() ? targets() : baseTargets()) {
  return planForDay(t, dateOf(viewDay()), todaysCustom(), state.prefs);
}
// What you've logged for the day being shown (nothing for future days).
function viewLog() {
  return viewingToday() ? todaysLog() : { meals: {}, fuel: null, extras: [] };
}

function todaysTraining() {
  const base = baseTargets();
  const today = isoDate();
  const workouts = state.workouts.filter((w) => isoDate(new Date(w.start)) === today);
  const manual = state.activities.filter((a) => a.date === today);
  return trainingDay(workouts, manual, {
    bmr: base.bmr,
    weightKg: currentWeight() / 2.20462,
    tracked: !!ACTIVITY[state.profile.activity].tracked,
  });
}

// Today's targets, including workout calories and intra-workout carbs.
function targets() {
  return applyTraining(baseTargets(), todaysTraining());
}

// ---------- formatting ----------
// Weighing raw/dry vs cooked. Meals are stored in each food's base weight — cooked (or as
// eaten), except oats, which are dry. Each item in each meal can be switched to the other
// way (raw/dry, or cooked for oats); the grams you see and type are then converted.
function weighWays(food) {
  const d = FOODS[food];
  const r = d?.raw ?? d?.yield; // cooked ÷ raw
  if (r) return { base: 'cooked', alt: r > 1.5 ? 'dry' : 'raw', k: 1 / r };
  if (d?.cooked) return { base: 'dry', alt: 'cooked', k: d.cooked }; // cooked ÷ dry
  return null;
}
function weighAlt(food, meal) {
  return !!weighWays(food) && ['alt', 'raw'].includes(store.get('weighModes', {})[`${meal}:${food}`]);
}
const weighWord = (food, meal) => { const w = weighWays(food); return w ? (weighAlt(food, meal) ? w.alt : w.base) : ''; };
function shownG(food, stored, meal) { return weighAlt(food, meal) ? Math.round(stored * weighWays(food).k) : stored; }
function cookedG(food, shown, meal) { return weighAlt(food, meal) ? shown / weighWays(food).k : shown; }
// The unit next to a grams box; for foods that change weight when cooked it's a two-way switch.
function gramsUnit(food, meal) {
  const w = weighWays(food);
  if (!w) return '<span class="small muted">g</span>';
  const alt = weighAlt(food, meal);
  const btn = (mode, label, on) => `<button type="button" class="${on ? 'on' : ''}" data-weighfood="${food}" data-weighmeal="${meal}" data-mode="${mode}" aria-pressed="${on}">${label}</button>`;
  return `<span class="wseg" role="group" aria-label="Weighed ${w.base} or ${w.alt}">${btn('base', w.base, !alt)}${btn('alt', w.alt, alt)}</span>`;
}

function amountLabel(food, grams, meal) {
  const d = FOODS[food];
  if (!grams) return { main: 'none', sub: '0 g' };
  const w = weighWays(food);
  if (weighAlt(food, meal)) {
    const g = Math.round(grams * w.k);
    return { main: d.oz ? `${Math.round(g / 28.35 * 10) / 10} oz ${w.alt}` : `${g} g ${w.alt}`, sub: `${Math.round(grams)} g ${w.base}` };
  }
  if (d.oz) return { main: `${Math.round(grams / 28.35 * 10) / 10} oz`, sub: `${grams} g cooked` };
  const u = d.unit;
  if (!u) return { main: `${Math.round(grams)} g`, sub: '' };
  const n = grams / u.grams;
  const plural = Math.round(n * 4) / 4 > 1 ? 's' : '';
  let main;
  if (u.label === 'egg') main = `${Math.round(n)} egg${Math.round(n) === 1 ? '' : 's'}`;
  else if (u.label === 'avocado') main = `${fraction(n)} avocado`;
  else if (u.label === 'scoop') main = `${fraction(n)} scoop${plural}`;
  else if (u.label === 'slice') main = `${fraction(n)} slice${plural}`;
  else main = `${fraction(n)} ${u.label}${u.label === 'tsp' || u.label === 'tbsp' ? '' : plural}`;
  return { main, sub: `${Math.round(grams)} g${w?.base === 'dry' ? ' dry' : ''}` };
}

function fraction(n) {
  const quarters = Math.round(n * 4) / 4;
  if (quarters === 0) return n < 0.2 ? 'a sliver of' : '¼';
  const whole = Math.floor(quarters);
  const rest = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[quarters - whole];
  return whole ? `${whole}${rest}` : rest;
}

const macroLine = (m) =>
  `${m.kcal} kcal · <span class="p">${m.p}P</span> · <span class="f">${m.f}F</span> · <span class="c">${m.c}C</span>`;

// ---------- TODAY ----------
// ‹ previous day · Today · next day ›, plus a date picker. Past days back to your first
// log; up to two weeks ahead.
const PLAN_AHEAD_DAYS = 14;
function shiftDay(iso, n) { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoDate(d); }
function firstLoggedDay() {
  const days = [...Object.keys(state.mealLog), ...Object.keys(state.days)].filter((d) => d < isoDate()).sort();
  return days[0] || shiftDay(isoDate(), -1);
}
function renderDayNav() {
  const d = viewDay(), today = isoDate();
  const min = firstLoggedDay(), max = shiftDay(today, PLAN_AHEAD_DAYS);
  const label = d === today ? 'Today' : d === shiftDay(today, -1) ? 'Yesterday' : d === shiftDay(today, 1) ? 'Tomorrow'
    : dateOf(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $('#dayNav').innerHTML = `
    <button type="button" class="ghost small" data-day="${shiftDay(d, -1)}" ${d <= min ? 'disabled' : ''} aria-label="Previous day">‹</button>
    <label class="day-pick"><span>${esc(label)}${healthDay(personData(activeProfile().id), d).strong ? ' 💪' : ''}</span><small>${d < today ? 'Review' : d > today ? 'Plan ahead' : 'Log your day'}</small>
      <input type="date" id="dayPick" value="${d}" min="${min}" max="${max}" aria-label="Pick a day"></label>
    <button type="button" class="ghost small" data-day="${shiftDay(d, 1)}" ${d >= max ? 'disabled' : ''} aria-label="Next day">›</button>
    ${d !== today ? `<button type="button" class="small today-btn" data-day="${today}">Today</button>` : ''}`;
}
$('#dayNav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (!b || b.disabled) return;
  state.viewDate = b.dataset.day === isoDate() ? null : b.dataset.day;
  renderToday();
});
$('#dayNav').addEventListener('change', (e) => {
  if (e.target.id !== 'dayPick' || !e.target.value) return;
  state.viewDate = e.target.value === isoDate() ? null : e.target.value;
  renderToday();
});

// ---- share the day's meals as a poster or CSV ----
function shareRow() {
  return `<div class="card share-plan">
    <button type="button" data-openshare>📤 Share…</button>
    <p class="small muted">This day's meals, your combos, or your progress over a day, a week, two weeks or the whole program — as text, a poster or a CSV.</p>
  </div>`;
}
const foodRow = (food, grams, meal) => {
  const f = FOODS[food];
  const a = amountLabel(food, grams, meal);
  const r = (k) => Math.round((f[k] * grams) / 100);
  return { name: f.name, amount: a.main, grams: Math.round(grams), kcal: r('kcal'), p: r('p'), f: r('f'), c: r('c') };
};
// The day being shown, in the poster/CSV shape.
function dayForSharing() {
  const day = viewDay();
  const label = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Afternoon snack', dinner: 'Dinner' };
  let meals, target;
  if (day < isoDate()) {
    const log = state.mealLog[day] || { meals: {} };
    meals = ['breakfast', 'lunch', 'snack', 'dinner'].filter((k) => log.meals?.[k]).map((k) => {
      const m = log.meals[k];
      return { key: k, label: label[k], title: m.title, totals: { kcal: Math.round(m.kcal), p: Math.round(m.p), f: Math.round(m.f), c: Math.round(m.c) },
        items: (m.foods || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const g = x.match(/^(.*?)\s+([\d.]+)g$/); return g ? { name: g[1], grams: +g[2] } : { name: x }; }) };
    });
    const rec = state.days[day];
    const sum = (k) => meals.reduce((a, m) => a + m.totals[k], 0);
    target = { kcal: rec?.target || sum('kcal'), p: rec?.proteinTarget || sum('p'), f: sum('f'), c: sum('c') };
  } else {
    const plan = todayPlan();
    meals = mealOrder(plan).filter((k) => k !== 'snack' || plan.snack.portions.length).map((k) => {
      const m = plan[k];
      return { key: k, label: label[k], title: m.title, totals: m.totals, items: m.portions.filter((x) => x.grams > 0).map((x) => foodRow(x.food, x.grams, k)) };
    });
    const t = viewingToday() ? targets() : baseTargets();
    target = { kcal: t.kcal, p: t.p, f: t.f, c: t.c };
  }
  const total = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const m of meals) for (const k in total) total[k] += m.totals[k] || 0;
  const name = firstName();
  const dateLabel = dateOf(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return { date: day, dateLabel, heading: name ? `${name}'s meal plan` : 'My meal plan', target, total, meals };
}
// ---- the Share panel ----
const SHARE_WHAT = { day: "This day's meals", combos: 'My combos', progress: 'My progress' };
const SHARE_FORMAT = { text: 'Text', poster: 'Poster', csv: 'CSV' };
const share = { what: 'day', range: 'week', format: 'text' };
const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

function comboGroups() {
  return ['breakfast', 'lunch', 'snack', 'dinner'].map((meal) => ({
    meal,
    combos: state.combos.filter((c) => comboMeal(c) === meal).map((c) => {
      const items = c.items.filter((x) => FOODS[x.food]).map((x) => foodRow(x.food, x.grams, meal));
      const sum = (k) => items.reduce((a, x) => a + x[k], 0);
      const totals = c.manual?.kcal ? { kcal: Math.round(+c.manual.kcal), p: Math.round(+c.manual.p || 0), f: Math.round(+c.manual.f || 0), c: Math.round(+c.manual.c || 0) }
        : { kcal: sum('kcal'), p: sum('p'), f: sum('f'), c: sum('c') };
      return { name: c.name, totals, items };
    }),
  }));
}
function progressReport() {
  const p = state.profile;
  return buildReport({
    today: isoDate(), mealLog: state.mealLog, todayLog: todaysLog(), days: state.days, weights: state.weights,
    programStart: p.phaseStart || p.createdOn || firstLoggedDay(), phase: PHASES[p.phase] ? p.phase : 'cut',
  }, share.range);
}
function dayText(d) {
  const lines = [`🍽️ ${d.heading} · ${d.dateLabel}`, `Target: ${d.target.kcal} kcal · ${d.target.p}P ${d.target.f}F ${d.target.c}C`, ''];
  for (const m of d.meals) {
    lines.push(`${{ breakfast: '☀️', lunch: '🥗', snack: '🍎', dinner: '🍽️' }[m.key]} ${m.label.toUpperCase()}: ${m.title} (${m.totals.kcal} kcal · ${m.totals.p}P ${m.totals.f}F ${m.totals.c}C)`);
    for (const it of m.items) lines.push(`  – ${it.name}${it.amount ? `: ${it.amount}` : ''}${it.grams != null ? ` (${it.grams} g)` : ''}`);
  }
  lines.push('', `Day total: ${d.total.kcal} kcal · ${d.total.p}P ${d.total.f}F ${d.total.c}C`, 'Oats weighed dry; meat, fish, rice and veggies cooked.', '— OurPawmily');
  return lines.join('\n');
}
// What the panel would share right now: {text?, blob?, filename}.
async function shareContent(preview = false) {
  const name = firstName();
  const stamp = isoDate();
  if (share.what === 'day') {
    const d = dayForSharing();
    if (share.format === 'text') return { text: dayText(d) };
    if (share.format === 'csv') return { blob: new Blob([toCsv(planCsvRows(d))], { type: 'text/csv' }), filename: `meal-plan-${d.date}.csv`, text: `${d.meals.length} meals, one row per food.` };
    return { blob: preview ? null : await drawPoster(d), filename: `meal-plan-${d.date}.png`, text: `A poster of ${d.dateLabel}: each meal with its foods, amounts and macros.` };
  }
  if (share.what === 'combos') {
    const groups = comboGroups();
    const count = groups.reduce((a, g) => a + g.combos.length, 0);
    if (!count) return { text: 'No saved combos yet. Tap ☆ Save combo on a meal first.', empty: true };
    if (share.format === 'text') return { text: combosText(groups, name) };
    if (share.format === 'csv') return { blob: new Blob([toCsv(combosCsvRows(groups))], { type: 'text/csv' }), filename: `meal-combos-${stamp}.csv`, text: `${count} combos, one row per food.` };
    const poster = {
      date: stamp, dateLabel: `${count} saved combo${count > 1 ? 's' : ''}`, heading: name ? `${name}'s meal combos` : 'My meal combos',
      subtitle: 'Breakfast, lunch and dinner combos with amounts', target: { kcal: 0, p: 0, f: 0, c: 0 }, total: null,
      meals: groups.flatMap((g) => g.combos.map((c) => ({ key: g.meal, label: `${MEAL_NAMES[g.meal]} combo`, title: c.name, totals: c.totals, items: c.items }))),
    };
    return { blob: preview ? null : await drawPoster(poster), filename: `meal-combos-${stamp}.png`, text: `A poster of your ${count} combos.` };
  }
  const r = progressReport();
  if (share.format === 'text') return { text: reportText(r, name) };
  if (share.format === 'csv') return { blob: new Blob([toCsv(reportCsvRows(r))], { type: 'text/csv' }), filename: `progress-${r.from}-to-${r.to}.csv`, text: `${r.totalDays} days, one row each: macros eaten, targets, weigh-ins and meals.` };
  const weekly = r.totalDays > 14;
  const fmt = (d) => dateOf(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const rows = weekly
    ? weeklyRows(r).map((w) => ({ label: w.label, kcal: w.logged ? w.kcal : null, p: w.p, f: w.f, c: w.c, note: w.logged ? `${w.logged} of ${w.of} days logged` : '' }))
    : r.days.map((d) => ({ label: fmt(d.date), kcal: d.logged ? d.kcal : null, p: d.p, f: d.f, c: d.c, note: d.meals.map((m) => m.title).concat(d.extras).join(' · ') }));
  const heading = `${name ? `${name}'s ` : 'My '}${(PHASE_NAMES[r.phase] || 'Cut').toLowerCase()}`;
  return { blob: preview ? null : await drawReportPoster({ heading, period: rangeTitle(r), report: r, rows, weekly }), filename: `progress-${r.from}-to-${r.to}.png`,
    text: `A poster of ${rangeTitle(r)}: average macros, your weight chart and ${weekly ? 'week-by-week' : 'day-by-day'} totals.` };
}
function renderSharePanel() {
  const seg = (el, options, value, field) => { $(el).innerHTML = Object.entries(options).map(([k, v]) => `<button type="button" class="${k === value ? 'on' : ''}" data-${field}="${k}">${esc(v.label || v)}</button>`).join(''); };
  seg('#shareWhat', SHARE_WHAT, share.what, 'what');
  seg('#shareRange', RANGES, share.range, 'range');
  seg('#shareFormat', SHARE_FORMAT, share.format, 'format');
  $('#shareRangeWrap').hidden = share.what !== 'progress';
  $('#shareMsg').textContent = '';
  shareContent(true).then((c) => { $('#sharePreview').textContent = c.text || ''; $('#shareGo').disabled = !!c.empty; });
  $('#shareGo').textContent = share.format === 'text' ? 'Share text' : share.format === 'poster' ? 'Share poster' : 'Download CSV';
}
$('#shareDialog').addEventListener('click', (e) => {
  const b = e.target.closest('[data-what], [data-range], [data-format]');
  if (!b) return;
  if (b.dataset.what) share.what = b.dataset.what;
  if (b.dataset.range) share.range = b.dataset.range;
  if (b.dataset.format) share.format = b.dataset.format;
  renderSharePanel();
});
$('#shareClose').onclick = () => $('#shareDialog').close();
$('#shareGo').onclick = async () => {
  const msg = $('#shareMsg');
  msg.textContent = 'Preparing…';
  try {
    const c = await shareContent();
    if (c.blob) { msg.textContent = await deliver(c.blob, c.filename); return; }
    if (navigator.share && /iphone|ipad|android/i.test(navigator.userAgent)) {
      try { await navigator.share({ text: c.text }); msg.textContent = 'Shared.'; return; } catch (err) { if (err.name === 'AbortError') { msg.textContent = 'Cancelled.'; return; } }
    }
    await navigator.clipboard.writeText(c.text);
    msg.textContent = 'Copied. Paste it into a message.';
  } catch (err) {
    msg.textContent = `Couldn't share: ${err.message}`;
  }
};
$('#meals').addEventListener('click', (e) => {
  if (!e.target.closest('[data-openshare]')) return;
  renderSharePanel();
  $('#shareDialog').showModal();
});

// A past day: what you logged against that day's targets.
function renderPastDay(day) {
  const log = state.mealLog[day] || { meals: {}, extras: [] };
  const rec = state.days[day];
  const items = [...Object.entries(log.meals || {}).map(([k, m]) => ({ ...m, slot: k })), ...(log.fuel ? [{ ...log.fuel, slot: 'fuel' }] : []), ...(log.extras || []).map((x) => ({ ...x, slot: 'extra' }))];
  const ate = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const it of items) for (const k in ate) ate[k] += it[k] || 0;
  // Day targets: the meal targets you had that day add up to the day's food target.
  const target = { kcal: rec?.target || 0, p: rec?.proteinTarget || 0, f: 0, c: 0 };
  for (const m of Object.values(log.meals || {})) if (m.target) { target.f += m.target.f || 0; target.c += m.target.c || 0; }
  const weigh = state.weights.find((w) => w.date === day);
  const burned = rec?.burned;
  const cell = (k, label) => `<div class="macro ${k}"><b>${Math.round(ate[k])}${k === 'kcal' ? '' : 'g'}</b><span>${label}</span>${target[k] ? `<small>of ${Math.round(target[k])}${k === 'kcal' ? '' : 'g'}</small>` : ''}</div>`;
  const status = rec ? scoreDay(rec) : null;
  const order = { breakfast: 0, lunch: 1, snack: 2, dinner: 3, fuel: 4, extra: 5 };
  return `
    <div class="card past-day">
      <div class="macros">${cell('kcal', 'kcal')}${cell('p', 'Protein')}${cell('f', 'Fat')}${cell('c', 'Carbs')}</div>
      <p class="small">${[
        burned ? `Burned ~${burned} kcal → ${burned - Math.round(ate.kcal) >= 0 ? `${burned - Math.round(ate.kcal)} kcal deficit` : `${Math.round(ate.kcal) - burned} kcal over`}` : '',
        weigh ? `Weigh-in ${weigh.weight} lb` : '',
        status?.coins ? `Earned 🪙 ${status.coins}${status.cookies ? ' + 🍪' : ''}` : '',
      ].filter(Boolean).join(' · ') || '<span class="muted">No totals saved for this day.</span>'}</p>
    </div>
    ${items.length ? items.sort((a, b) => order[a.slot] - order[b.slot]).map((m) => `
      <div class="card meal past">
        <div class="eyebrow">${m.slot === 'extra' ? 'Snack / extra' : m.slot === 'fuel' ? 'Workout fuel' : m.slot === 'snack' ? 'Afternoon snack' : m.slot}${m.at ? ` · ${esc(m.at)}` : ''}</div>
        <h3>${esc(m.title || 'Meal')}</h3>
        <div class="meal-macros">${macroLine({ kcal: Math.round(m.kcal || 0), p: Math.round(m.p || 0), f: Math.round(m.f || 0), c: Math.round(m.c || 0) })}${m.target ? ` <small class="muted">· target ${m.target.kcal} kcal</small>` : ''}</div>
        ${m.foods ? `<p class="small muted">${esc(m.foods)}</p>` : ''}
      </div>`).join('') : '<div class="card"><p class="muted small">Nothing was logged on this day.</p></div>'}`;
}

function renderToday() {
  renderDayNav();
  const day = viewDay(), today = isoDate();
  const isToday = day === today, past = day < today;
  // Today-only cards.
  for (const id of ['#deficit', '#checkin', '#adjustBanner']) $(id).hidden = !isToday;
  if (!isToday) {
    const t = past ? null : baseTargets();
    $('#todayDate').textContent = dateOf(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    $('#greeting').textContent = past ? 'Looking back' : 'Planning ahead';
    $('#todayKcal').textContent = past ? `${state.days[day]?.target ?? '—'} kcal target` : `${t.kcal} kcal`;
    $('#paceNote').textContent = past ? 'Logged' : 'Planned · workouts not included';
    $('#todayMacros').innerHTML = past ? '' : [['p', 'Protein', t.p], ['f', 'Fat', t.f], ['c', 'Carbs', t.c]]
      .map(([k, label, g]) => `<div class="macro ${k}"><b>${g} g</b><span>${label}</span></div>`).join('');
    renderDayBar();
    if (past) { $('#meals').innerHTML = renderPastDay(day) + shareRow(); return; }
    const plan = todayPlan(t);
    $('#meals').innerHTML = mealCardsWithAdd(plan) + (editingMeal ? ''
      : shareRow() + `<p class="muted small">Changes here are saved for ${esc(dateOf(day).toLocaleDateString(undefined, { weekday: 'long' }))} and show up on Today when the day comes. Tap a meal to change it.</p>`);
    return;
  }
  const t = targets();
  $('#todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('#todayKcal').textContent = `${t.kcal} kcal`;
  const rate = baseTargets().lbPerWeek;
  const proj = goalProjection(state.profile, currentWeight(), new Date(), rate);
  const by = proj.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const phase = state.profile.phase || 'cut';
  $('#paceNote').textContent = phase === 'break' ? 'Diet break · eating at maintenance'
    : phase === 'maintain' ? 'Maintenance · holding steady'
      : phase === 'gain' ? `Lean gain · +${-rate} lb/wk${proj.reached ? '' : ` · ${state.profile.goalLb} lb by ${by}`}`
        : proj.reached ? 'Goal reached · maintenance' : `−${rate} lb/wk · ${state.profile.goalLb} lb by ${by}`;
  renderProgram();
  $('#todayMacros').innerHTML = [
    ['p', 'Protein', t.p], ['f', 'Fat', t.f], ['c', 'Carbs', t.c],
  ].map(([k, label, g]) => `<div class="macro ${k}"><b>${g} g</b><span>${label}</span></div>`).join('');

  const name = firstName();
  $('#greeting').textContent = name ? `${greetingWord()}, ${name}` : '';
  renderWeighStatus();
  renderDayBar();
  renderDeficit();
  renderCheckin();
  renderAdjustBanner(t);
  renderTraining(t);

  const plan = todayPlan(t);
  $('#meals').innerHTML = mealCardsWithAdd(plan) + (editingMeal ? ''
    : extrasCard()
    + shareRow()
    + `<details class="help small muted"><summary>How this works</summary>Tap a meal to customize it on its own page: pick a food from any menu to swap it, add or swipe away foods, use a saved combo, or enter macros. Use − / + or type grams to set a portion yourself (🔒) — the other items re-balance to keep the meal on target. A logged meal is locked so it can't change by accident — tap Unlog to edit.</details>`);
  renderHome();
}

function extrasCard() {
  const extras = todaysLog().extras;
  return `<div class="card"><div class="eyebrow">Snacks & extras</div>
    ${extras.length ? `<ul class="list">${extras.map((x, i) => `<li><span>${esc(x.title)}<small class="muted"> · ${x.p}P ${x.f}F ${x.c}C</small></span>
      <span>${x.kcal} kcal <button class="x" data-unextra="${i}" aria-label="Remove">✕</button></span></li>`).join('')}</ul>` : ''}
    ${quickPicker('data-quicksnack', '➕ Add a snack: fruit, nuts, yogurt, bar…', true)}
  </div>`;
}
$('#meals').addEventListener('change', (e) => {
  const food = e.target.dataset.quicksnack != null && e.target.value;
  if (!food) return;
  const f = FOODS[food], g = f.unit?.grams || 100;
  const r = (k) => Math.round((f[k] * g) / 100);
  todaysLog().extras.push({ title: `${f.name}${f.unit ? ` (1 ${f.unit.label})` : ''}`, kcal: r('kcal'), p: r('p'), f: r('f'), c: r('c') });
  saveLog();
  renderToday();
});
$('#meals').addEventListener('click', (e) => {
  const i = e.target.closest('[data-unextra]')?.dataset.unextra;
  if (i == null) return;
  todaysLog().extras.splice(+i, 1);
  saveLog();
  renderToday();
});

const MEAL_TEMPLATES = { eggs: 'Switch: eggs', oatmeal: 'Switch: oatmeal' };

// Order of the day's cards; the afternoon snack sits between lunch and dinner when it's on.
const mealOrder = (plan) => ['breakfast', 'lunch', ...(plan.snack ? ['snack'] : []), 'dinner'];
const SNACK_PICKS = [['apple', '🍎'], ['banana', '🍌'], ['orange', '🍊'], ['grapes', '🍇'], ['strawberries', '🍓'], ['berries', '🫐'], ['mixedNuts', '🥜'], ['cashews', '🥜'], ['almonds', '🌰'], ['greekYogurt', '🥛'], ['premierShake', '🥤'], ['barebells', '🍫'], ['latte', '☕'], ['cappuccino', '☕'], ['cortado', '☕'], ['chocCookie', '🍪']];
$('#meals').addEventListener('click', (e) => {
  const b = e.target.closest('[data-weighfood]');
  if (!b) return;
  const key = `${b.dataset.weighmeal}:${b.dataset.weighfood}`;
  const modes = { ...store.get('weighModes', {}) };
  if (b.dataset.mode === 'alt') modes[key] = 'alt'; else delete modes[key];
  store.set('weighModes', modes);
  renderToday();
});
// The daily plan shows each meal as a short summary; tapping one opens it on its own page
// (editingMeal) to swap foods, add or remove items, use a combo, or enter macros.
let editingMeal = null;
const MEAL_NUM = { breakfast: 'Meal 1', lunch: 'Meal 2', dinner: 'Meal 3' };
function mealCardsWithAdd(plan) {
  document.body.classList.toggle('meal-editing', !!(editingMeal && plan[editingMeal]));
  if (editingMeal && plan[editingMeal]) return mealEditor(editingMeal, plan[editingMeal]);
  editingMeal = null;
  return mealOrder(plan).map((meal) => cardFor(meal, plan[meal]) + (meal === 'lunch' && !plan.snack ? addSnackCard() : '')).join('');
}
const cardFor = (meal, m) => (meal === 'snack' || editingMeal === meal ? mealCard(meal, m) : mealSummary(meal, m));
function mealSummary(meal, m) {
  const locked = !!viewLog().meals[meal];
  const items = m.portions.filter((x) => x.grams > 0);
  return `<div class="card meal meal-sum ${locked ? 'eaten' : ''}" data-meal="${meal}">
    <div class="meal-open" data-openmeal="${meal}" role="button" tabindex="0" aria-label="Customize ${MEAL_NUM[meal] || meal}">
      <div class="row between" style="margin-top:0;align-items:flex-start">
        <div><div class="eyebrow">${MEAL_NUM[meal] || ''} · ${MEAL_NAMES[meal]}</div><h3 data-role="title">${esc(m.title)}</h3></div>
        <span class="open-go">${locked ? 'View' : 'Customize'} ›</span>
      </div>
      <div class="meal-macros" data-role="totals">${totalsLine(m)}</div>
      ${items.length ? `<ul class="sum-items">${items.map((x) => `<li><span>${esc(FOODS[x.food]?.name || x.food)}</span><span class="muted">${esc(amountLabel(x.food, x.grams, meal).main)}</span></li>`).join('')}</ul>` : ''}
    </div>
    ${eatButton(meal)}
  </div>`;
}
function mealEditor(meal, m) {
  return `<div class="meal-editor">
    <div class="row between editor-bar" style="margin-top:0">
      <button type="button" class="ghost small" data-closemeal>‹ Back to today's plan</button>
      ${todaysCustom()[meal] && !viewLog().meals[meal] ? `<button type="button" class="linkish small" data-startover="${meal}">↺ Start over</button>` : ''}
    </div>
    <h2 class="editor-title">${MEAL_NUM[meal] || ''} · ${MEAL_NAMES[meal]}</h2>
    <p class="small muted" style="margin:0 0 8px">Swap or add foods, pick a saved combo, or enter the macros yourself. Changes save as you go.</p>
    ${mealCard(meal, m)}
    <button type="button" class="ghost back-bottom" data-closemeal>‹ Back to today's plan</button>
  </div>`;
}
$('#meals').addEventListener('click', (e) => {
  const open = e.target.closest('[data-openmeal]');
  if (open && !e.target.closest('button, select, input, a')) { editingMeal = open.dataset.openmeal; renderToday(); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-closemeal]')) {
    const was = editingMeal;
    editingMeal = null; renderToday();
    document.querySelector(`.meal[data-meal="${was}"]`)?.scrollIntoView({ block: 'center' });
    return;
  }
  const so = e.target.closest('[data-startover]');
  if (so) {
    if (!confirm('Start this meal over with the suggested foods?')) return;
    delete todaysCustom()[so.dataset.startover]; saveCustom(); renderToday();
  }
});
$('#meals').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-openmeal]')) e.target.click(); });
function addSnackCard() {
  return `<div class="card add-snack"><button type="button" class="ghost" data-addsnack>＋ Add an afternoon snack</button>
    <span class="small muted">Fruit, nuts, yogurt, a shake… lunch and dinner shrink to make room.</span></div>`;
}
$('#meals').addEventListener('click', (e) => {
  if (!e.target.closest('[data-addsnack]')) return;
  editMeal('snack', (c) => { c.on = true; c.items ||= []; });
  renderToday();
});
function snackCard(m) {
  return `
    <div class="card meal snack ${viewLog().meals.snack ? 'eaten' : ''}" data-meal="snack">
      <div class="meal-lock" ${viewLog().meals.snack ? 'inert' : ''}>
      <div class="meal-head">
        <div>
          <div class="eyebrow">Afternoon snack · ~3 PM</div>
          <h3 data-role="title">${esc(m.title)}</h3>
        </div>
        <button class="ghost small" data-reset>✕ No snack</button>
      </div>
      <div class="meal-macros" data-role="totals">${macroLine(m.totals)}${m.portions.length ? ` <small class="muted">· lunch & dinner make room</small>` : ''}</div>
      <div class="snack-picks" role="group" aria-label="Add to your snack">
        ${SNACK_PICKS.filter(([k]) => FOODS[k]).map(([k, icon]) => `<button type="button" class="chip" data-snackadd="${k}">${icon} ${esc(FOODS[k].name.replace(' (unsalted)', ', unsalted').replace(/ \(.*\)/, '').replace(' protein bar', '').replace(' Protein shake', ' shake'))}</button>`).join('')}
      </div>
      ${comboRow('snack', m)}
      ${m.portions.length ? customBody('snack', m) : '<p class="small muted">Tap what you had. Tap again for another one, or use the slider.</p>'}
      </div>
      ${m.portions.length ? eatButton('snack') : ''}
    </div>`;
}

function mealCard(meal, m) {
  if (meal === 'snack') return snackCard(m);
  const locked = !!viewLog().meals[meal];
  return `
    <div class="card meal ${locked ? 'eaten' : ''}" data-meal="${meal}">
      <div class="meal-lock" ${locked ? 'inert' : ''}>
      <div class="meal-head">
        <div>
          <div class="eyebrow">${meal}</div>
          <h3 data-role="title">${esc(m.title)}</h3>
        </div>
        <div class="row" style="margin-top:0">
          ${meal === 'breakfast' ? `<select class="small-select" data-template aria-label="Breakfast type">
            ${Object.entries(MEAL_TEMPLATES).map(([k, v]) => `<option value="${k}" ${m.template === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>` : ''}
          ${m.custom ? '' : '<button class="ghost small" data-prepared title="A pre-packaged or catered meal with its macros on the label">📦 Prepared</button><button class="ghost small" data-eatout title="Log a restaurant meal">🍴 Ate out</button>'}
        </div>
      </div>
      <div class="meal-macros" data-role="totals">${totalsLine(m)}${m.manual ? ' <small class="muted">(your numbers)</small>' : ''}</div>
      ${comboRow(meal, m)}
      ${m.prepared ? preparedBody(meal, m) : m.eatout ? eatOutBody(meal, m) : m.custom ? customBody(meal, m) : `<ul class="portions editable">${m.portions.map((x) => itemRow(x, meal)).join('')}</ul>
      <div class="row" style="margin-top:6px"><select data-cadd aria-label="Add a food">${foodOptions('', '+ Add a food…')}</select></div>
      <p class="small muted swipe-hint">Swipe a food left (or tap ✕) to remove it.</p>`}
      </div>
      ${eatButton(meal)}
    </div>`;
}

// ---- 📦 prepared / catered meals: type the label's macros once, pick it from the list after ----
const preparedList = () => store.get('preparedMeals', []);
const partnerPrepared = () => (sync.readOnly() ? [] : profileStore(partnerId()).get('preparedMeals', []));
const sameMeal = (a, b) => a.name.trim().toLowerCase() === (b.name || '').trim().toLowerCase() && (a.kitchen || '').trim().toLowerCase() === (b.kitchen || '').trim().toLowerCase();
function preparedBody(meal, m) {
  const e = todaysCustom()[meal]?.prepared || {};
  const mine = preparedList();
  const theirs = partnerPrepared().filter((x) => !mine.some((y) => sameMeal(y, x)));
  const saved = e.name && mine.some((x) => sameMeal(x, e));
  const opt = (x, pre = '') => `<option value="${pre}${esc(x.id)}">${esc(x.name)}${x.kitchen ? ` · ${esc(x.kitchen)}` : ''} — ${x.kcal || labelKcal(x.p, x.c, x.f)} kcal, ${x.p}P ${x.c}C ${x.f}F</option>`;
  const auto = labelKcal(e.p, e.c, e.f);
  const over = m.totals.kcal - m.target.kcal;
  return `
    <div class="eatout prepared">
      ${mine.length || theirs.length ? `<select data-pmpick aria-label="Pick a saved prepared meal"><option value="">📦 Pick one of your prepared meals…</option>
        ${mine.length ? `<optgroup label="Your prepared meals">${mine.map((x) => opt(x)).join('')}</optgroup>` : ''}
        ${theirs.length ? `<optgroup label="${esc(partnerName())}'s prepared meals">${theirs.map((x) => opt(x, 'p:')).join('')}</optgroup>` : ''}
      </select>` : ''}
      <input data-pm="name" maxlength="60" placeholder="Meal name, e.g. Chicken teriyaki bowl" value="${esc(e.name || '')}" aria-label="Meal name">
      <input data-pm="kitchen" maxlength="40" placeholder="Kitchen / brand (optional)" value="${esc(e.kitchen || '')}" aria-label="Kitchen">
      <div class="manual-grid">
        ${[['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['kcal', 'Calories']].map(([k, label]) =>
          `<label>${label}<input type="number" min="0" step="0.5" inputmode="decimal" data-pm="${k}" value="${e[k] ?? ''}" placeholder="${k === 'kcal' ? (auto ? `${auto} (from macros)` : 'from label') : 'from label'}"></label>`).join('')}
      </div>
      <div class="small muted" style="margin-top:6px">How much you ate</div>
      <div class="seg eo-seg">${[0.5, 1, 1.5, 2].map((v) => `<button type="button" class="${(+e.servings || 1) === v ? 'on' : ''}" data-pmserv="${v}">${v === 0.5 ? '½' : v === 1.5 ? '1½' : v} ${v > 1 ? 'meals' : 'meal'}</button>`).join('')}</div>
      <div class="row wrap">${saved ? `<span class="small tone-good">✓ In your prepared meals</span><button type="button" class="linkish small" data-pmdel>Remove from list</button>` : '<button type="button" class="ghost small" data-pmsave>☆ Save to my prepared meals</button>'}</div>
      <p class="small muted">Use the numbers printed on the meal's label (per container). No calories listed? They're worked out from the macros (4 per g protein and carbs, 9 per g fat).</p>
      ${over > 100 ? `<p class="small">About <b>${over} kcal</b> over this meal's target — keep the other meals a little lighter.</p>` : ''}
    </div>`;
}
function savePrepared(e) {
  const list = preparedList().filter((x) => !sameMeal(x, e));
  const item = { id: Date.now().toString(36), name: e.name.trim(), kitchen: (e.kitchen || '').trim(), p: +e.p || 0, c: +e.c || 0, f: +e.f || 0, kcal: +e.kcal || 0 };
  store.set('preparedMeals', [...list, item].sort((a, b) => a.name.localeCompare(b.name)).slice(-100));
}

// ---- eating out ----
function eatOutBody(meal, m) {
  const e = todaysCustom()[meal]?.eatout || {};
  const menu = e.mode === 'menu';
  const seg = (field, options, value) => `<div class="seg eo-seg">${Object.entries(options).map(([k, v]) =>
    `<button type="button" class="${String(k) === String(value) ? 'on' : ''}" data-eoset="${field}:${k}">${esc(v.label || v)}</button>`).join('')}</div>`;
  const over = m.totals.kcal - m.target.kcal;
  return `
    <div class="eatout">
      <input data-eo="place" maxlength="60" placeholder="Restaurant (optional)" value="${esc(e.place || '')}" aria-label="Restaurant">
      ${seg('mode', { estimate: 'Estimate it', menu: 'Menu lists calories' }, e.mode || 'estimate')}
      ${menu ? `
        <input data-eo="dishName" maxlength="60" placeholder="What you ordered (optional)" value="${esc(e.dishName || '')}" aria-label="Dish">
        <div class="manual-grid">
          ${[['kcal', 'Calories'], ['p', 'Protein g'], ['f', 'Fat g'], ['c', 'Carbs g']].map(([k, label]) =>
            `<label>${label}<input type="number" min="0" inputmode="decimal" data-eomenu="${k}" value="${e.menu?.[k] ?? ''}" placeholder="${k === 'kcal' ? 'e.g. 850' : 'optional'}"></label>`).join('')}
        </div>
        <p class="small muted">Chains post calories on the menu or their website. Only know calories? The macros are filled in with a typical restaurant split.</p>`
      : `
        <select data-eo="dish" aria-label="What you had">${Object.entries(EAT_OUT).map(([k, v]) => `<option value="${k}" ${k === (e.dish || 'plate') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <div class="small muted" style="margin-top:6px">Portion</div>${seg('size', EAT_OUT_SIZE, e.size || 'regular')}
        <div class="small muted" style="margin-top:6px">How much you ate</div>${seg('ate', EAT_OUT_ATE, e.ate || 1)}
        <p class="small muted">Restaurant food usually has more oil and butter than it looks, so these estimates lean generous.</p>`}
      ${drinksBlock(e)}
      ${over > 100 ? `<p class="small">That's about <b>${over} kcal</b> over this meal's target. No stress: one meal doesn't make or break a week. Keep the rest of today light and protein-first.</p>` : ''}
    </div>`;
}

// 🍷 Wine, beer or cocktails with a restaurant meal: tap to add a glass, − to take one back.
const DRINK_ROWS = [['Wine & beer', ['redWine', 'whiteWine', 'rose', 'bubbly', 'beer', 'lightBeer']], ['Cocktails & spirits', ['margarita', 'oldFashioned', 'martini', 'espressoMartini', 'mojito', 'ginTonic', 'vodkaSoda', 'moscowMule', 'spritz', 'whiskey']]];
function drinksBlock(e) {
  const drinks = e.drinks || {};
  const t = drinksTotals(drinks);
  return `<details class="eo-drinks" ${t.count ? 'open' : ''}><summary>🍷 Drinks with the meal${t.count ? ` · <b>${t.count}</b> · ${Math.round(t.kcal)} kcal` : ''}</summary>
    ${DRINK_ROWS.map(([title, keys]) => `<div class="small muted" style="margin-top:6px">${title}</div>
      <div class="drink-chips">${keys.map((k) => { const d = DRINKS[k], n = drinks[k] || 0; return `<span class="drink ${n ? 'on' : ''}">
        <button type="button" class="drink-add" data-eodrink="${k}:1" title="${esc(d.serving)} · ${d.kcal} kcal">${d.icon} ${esc(d.label)}${n ? ` <b>×${n}</b>` : ''}</button>${n ? `<button type="button" class="drink-less" data-eodrink="${k}:-1" aria-label="One less ${esc(d.label)}">−</button>` : ''}</span>`; }).join('')}</div>`).join('')}
    <p class="small muted">Wine is a 5 oz glass (~120 kcal), beer 12 oz, cocktails a typical bar pour. Alcohol counts in your calories but isn't protein, fat or carbs.</p>
  </details>`;
}

// ---- saved combos: Breakfast / Lunch / Dinner combos. Lunch and dinner offer each other's
// combos too, and the other person's combos show up as well (copied in when you pick one). ----
const comboKind = (meal) => (meal === 'breakfast' || meal === 'snack' ? meal : 'main');
// Combos saved before they remembered their meal count as lunch ones.
const comboMeal = (c) => c.meal || (c.kind === 'breakfast' || c.kind === 'snack' ? c.kind : 'lunch');
const partnerId = () => PROFILES.find((p) => p.id !== ownerId())?.id;
const partnerName = () => { const id = partnerId(); return profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || ''; };
const partnerCombos = () => (sync.readOnly() ? [] : profileStore(partnerId()).get('combos', []));
let managingCombos = null; // meal whose combo list is open for deleting
function comboRow(meal, m) {
  const label = MEAL_NAMES[meal];
  const mine = state.combos.filter((c) => c.kind === comboKind(meal));
  const theirs = partnerCombos().filter((c) => c.kind === comboKind(meal));
  const opt = (c, prefix = '') => `<option value="${prefix}${esc(c.id)}">${esc(c.name)} · ${comboKcal(c)} kcal</option>`;
  const here = mine.filter((c) => comboMeal(c) === meal), other = mine.filter((c) => comboMeal(c) !== meal);
  const pName = partnerName();
  const total = mine.length + theirs.length;
  const pick = total ? `<select data-combo aria-label="Use a saved ${label.toLowerCase()} combo">
      <option value="">⭐ ${label} combos (${here.length + other.length})${theirs.length ? ` · ${esc(pName)}'s (${theirs.length})` : ''}</option>
      ${here.length ? `<optgroup label="Your ${label.toLowerCase()} combos">${here.map((c) => opt(c)).join('')}</optgroup>` : ''}
      ${other.length ? `<optgroup label="From your ${meal === 'lunch' ? 'dinner' : 'lunch'} combos">${other.map((c) => opt(c)).join('')}</optgroup>` : ''}
      ${theirs.length ? `<optgroup label="${esc(pName)}'s ${meal === 'breakfast' || meal === 'snack' ? meal : 'lunch & dinner'} combos">${theirs.map((c) => opt(c, 'p:')).join('')}</optgroup>` : ''}
    </select>` : '';
  return `<div class="combo-row">
      ${pick}
      ${meal === 'snack' ? '' : quickPicker('data-quick', '⚡ Quick swap: bar or shake')}
      ${m.eatout || m.prepared || viewLog().meals[meal] ? '' : `<button type="button" class="ghost small" data-savecombo>☆ Save ${label.toLowerCase()} combo</button>`}
      ${mine.length ? `<button type="button" class="linkish small" data-managecombos>${managingCombos === meal ? 'Done' : 'Edit list'}</button>` : ''}
    </div>
    ${managingCombos === meal ? `<ul class="list combo-list">${mine.map((c) => `<li><span>${esc(c.name)} <small class="muted">${MEAL_NAMES[comboMeal(c)]} · ${c.items.map((x) => FOODS[x.food]?.name).filter(Boolean).join(', ')}</small></span>
      <button type="button" class="x" data-delcombo="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">✕</button></li>`).join('')}</ul>` : ''}`;
}
// Bars and shakes, for swapping out a meal or adding a snack in one tap.
const QUICK = () => Object.keys(FOODS).filter((k) => FOODS[k].quick);
function quickPicker(attr, label, withSnacks = false) {
  const opt = (k) => {
    const f = FOODS[k], g = f.unit?.grams || 100;
    const unit = f.unit ? `1 ${f.unit.label}` : '100 g';
    return `<option value="${k}">${esc(f.name)} · ${unit} · ${Math.round(f.kcal * g / 100)} kcal · ${Math.round(f.p * g / 100)}g protein</option>`;
  };
  const snacks = withSnacks ? (FOOD_GROUPS.Snacks || []).filter((k) => FOODS[k]) : [];
  return `<select ${attr} aria-label="${esc(label)}"><option value="">${esc(label)}</option>
    ${snacks.length ? `<optgroup label="Fruit, nuts & yogurt">${snacks.map(opt).join('')}</optgroup><optgroup label="Coffee shop">${(FOOD_GROUPS['Coffee shop'] || []).filter((k) => FOODS[k]).map(opt).join('')}</optgroup><optgroup label="Bars & shakes">${QUICK().map(opt).join('')}</optgroup>` : QUICK().map(opt).join('')}
  </select>`;
}
function useQuick(meal, food) {
  const m = todayPlan()[meal];
  editMeal(meal, (c) => {
    for (const k of ['eatout', 'prepared', 'picks', 'grams', 'manual']) delete c[k];
    if (meal === 'breakfast') c.template = m.template;
    c.items = [{ food, grams: FOODS[food].unit.grams }];
    c.title = FOODS[food].name;
  });
  resnap(meal);
  renderToday();
}

function comboKcal(c) {
  if (c.manual?.kcal) return Math.round(+c.manual.kcal);
  return Math.round(c.items.reduce((a, x) => a + (FOODS[x.food]?.kcal || 0) * x.grams / 100, 0));
}
function saveCombo(meal) {
  const m = todayPlan()[meal];
  const c = todaysCustom()[meal] || {};
  const items = (c.items && m.custom ? c.items : m.portions).filter((x) => x.grams > 0 && FOODS[x.food]).map((x) => ({ food: x.food, grams: x.grams }));
  if (!items.length && !c.manual) { alert('Add some foods to this meal first.'); return; }
  const name = (prompt(`Name this ${MEAL_NAMES[meal].toLowerCase()} combo`, c.title || m.title) || '').trim().slice(0, 60);
  if (!name) return;
  const kind = comboKind(meal);
  const same = state.combos.find((x) => x.kind === kind && comboMeal(x) === meal && x.name.toLowerCase() === name.toLowerCase());
  if (same && !confirm(`Replace your combo “${same.name}”?`)) return;
  const combo = { id: same?.id || `c${Date.now().toString(36)}`, name, kind, meal, items, ...(c.manual && Object.values(c.manual).some((v) => v !== '' && v != null) ? { manual: { ...c.manual } } : {}) };
  state.combos = [...state.combos.filter((x) => x.id !== combo.id), combo];
  store.set('combos', state.combos);
  renderToday();
}
function useCombo(meal, id) {
  const combo = id.startsWith('p:') ? partnerCombos().find((x) => x.id === id.slice(2)) : state.combos.find((x) => x.id === id);
  if (!combo) return;
  const m = todayPlan()[meal];
  editMeal(meal, (c) => {
    for (const k of ['eatout', 'prepared', 'picks', 'grams', 'manual']) delete c[k];
    if (meal === 'breakfast') c.template = m.template;
    c.items = combo.items.map((x) => ({ ...x }));
    if (combo.manual) c.manual = { ...combo.manual };
    c.title = combo.name;
  });
  resnap(meal);
  renderToday();
}

// ---- meals you build yourself ----
const NEW_FOOD_OPTION = '<option value="__new">＋ New food (enter its macros)…</option>';
function foodOptions(selected, placeholder) {
  return (placeholder ? `<option value="">${placeholder}</option>` : '')
    + Object.entries(FOOD_GROUPS).map(([g, keys]) => `<optgroup label="${g}">${keys.map((k) =>
      `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(FOODS[k].name)}</option>`).join('')}</optgroup>`).join('')
    + NEW_FOOD_OPTION;
}

function customBody(meal, m) {
  const man = todaysCustom()[meal]?.manual || {};
  return `
    <ul class="portions editable custom">
      ${m.portions.map((x, i) => {
        const a = amountLabel(x.food, x.grams, meal);
        return `<li data-ci="${i}">
          <div class="item-top">
            <select data-cfood="${i}" aria-label="Food">${foodOptions(x.food)}</select>
            <button class="x" data-cremove="${i}" aria-label="Remove ${esc(FOODS[x.food].name)}">✕</button>
          </div>
          <div class="item-slider stepper">
            <span class="amt" data-role="amt">${a.main}</span>
            <span class="gfield">${weighWays(x.food) ? gramsUnit(x.food, meal) : ''}<input type="number" class="grams gbox" data-cgrams="${i}" data-food="${x.food}" min="0" max="2000" step="any" inputmode="decimal" value="${shownG(x.food, x.grams, meal)}" aria-label="${esc(FOODS[x.food].name)} grams ${weighWord(x.food, meal)}"><span class="g">g</span></span>
            ${stepButtons(x, meal)}
          </div>
        </li>`;
      }).join('')}
    </ul>
    <div class="row" style="margin-top:6px">
      <select data-cadd aria-label="Add a food">${foodOptions('', '+ Add a food…')}</select>
      ${meal !== 'snack' && m.portions.length && !m.manual ? `<button type="button" class="ghost small" data-fit title="Scale every food so the meal hits its calorie target">⚖️ Fit to ${m.target.kcal} kcal</button>` : ''}
    </div>
    <details class="manual" ${m.manual ? 'open' : ''}>
      <summary>Enter macros yourself</summary>
      <p class="small muted">Use numbers from a label or another app. Leave a box blank to use the foods above.</p>
      <div class="manual-grid">
        ${[['kcal', 'Calories'], ['p', 'Protein g'], ['f', 'Fat g'], ['c', 'Carbs g']].map(([k, label]) =>
          `<label>${label}<input type="number" min="0" inputmode="decimal" data-manual="${k}" value="${man[k] ?? ''}" placeholder="${m.portions.length ? Math.round(sumOf(m.portions)[k]) : ''}"></label>`).join('')}
      </div>
    </details>`;
}

function sumOf(portions) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const x of portions) for (const k in t) t[k] += (FOODS[x.food][k] * x.grams) / 100;
  return t;
}

// Update totals and amounts in place while typing, keeping the cursor where it is.
function refreshCustom(meal) {
  const m = todayPlan()[meal];
  const card = document.querySelector(`.meal[data-meal="${meal}"]`);
  card.querySelector('[data-role="title"]').textContent = m.title;
  card.querySelector('[data-role="totals"]').innerHTML = meal === 'snack' ? macroLine(m.totals) : totalsLine(m) + (m.manual ? ' <small class="muted">(your numbers)</small>' : '');
  // Lunch and dinner resize around the snack.
  if (meal === 'snack') {
    const plan = todayPlan();
    for (const other of ['lunch', 'dinner']) {
      const el = document.querySelector(`.meal[data-meal="${other}"]`);
      if (el) el.outerHTML = cardFor(other, plan[other]);
    }
  }
  m.portions.forEach((x, i) => {
    const el = card.querySelector(`li[data-ci="${i}"] [data-role="amt"]`);
    if (el) el.textContent = amountLabel(x.food, x.grams, meal).main;
  });
  const log = viewLog();
  if (log.meals[meal]) {
    log.meals[meal] = { ...snapshot(m), at: log.meals[meal].at };
    saveLog();
    card.querySelector('.eat-row').outerHTML = eatButton(meal);
    renderDayBar();
    renderDeficit();
  }
}

function editCustom(meal, fn) {
  editMeal(meal, (c) => { c.items = c.items || []; fn(c); });
}

// Add a food to a meal: a planned meal turns into your own version (its current foods
// plus this one), so nothing you were going to eat disappears.
// Remove a food: from your own meal by index, or from a planned meal by slot (the meal turns
// into your own with the other foods kept). Undo puts it back.
function removeFood(meal, { index, slot }) {
  const before = todaysCustom()[meal] ? JSON.parse(JSON.stringify(todaysCustom()[meal])) : null;
  const m = todayPlan()[meal];
  let name = '';
  editMeal(meal, (c) => {
    if (!c.items) {
      if (meal === 'breakfast') c.template = m.template;
      const kept = m.portions.filter((x) => x.grams > 0);
      name = FOODS[kept.find((x) => x.slot === slot)?.food]?.name || '';
      c.items = kept.filter((x) => x.slot !== slot).map((x) => ({ food: x.food, grams: x.grams }));
    } else {
      name = FOODS[c.items[index]?.food]?.name || '';
      c.items.splice(index, 1);
    }
  });
  resnap(meal);
  renderToday();
  undoToast(`Removed ${name || 'it'}`, () => {
    const meals = todaysCustom();
    if (before) meals[meal] = before; else delete meals[meal];
    saveCustom(); resnap(meal); renderToday();
  });
}
let toastTimer = null;
function undoToast(text, undo) {
  let el = $('#undoToast');
  if (!el) { el = document.createElement('div'); el.id = 'undoToast'; el.className = 'undo-toast'; document.body.append(el); }
  el.innerHTML = `<span>${esc(text)}</span><button type="button" class="linkish">Undo</button>`;
  el.hidden = false;
  el.querySelector('button').onclick = () => { el.hidden = true; clearTimeout(toastTimer); undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}
// Swipe a food row left to remove it (touch or mouse); a short drag springs back.
(function swipeToRemove() {
  const root = $('#meals');
  let drag = null;
  root.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.portions.editable > li');
    // Start anywhere on the row except a grams box; a drag that becomes a swipe doesn't count as a tap.
    if (!li || e.target.closest('input') || li.closest('[inert]')) return;
    drag = { li, x: e.clientX, y: e.clientY, dx: 0, on: false, id: e.pointerId };
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // scrolling
      if (dx > -10) return;
      drag.on = true;
      drag.li.classList.add('swiping');
    }
    drag.dx = Math.min(0, dx);
    drag.li.style.transform = `translateX(${drag.dx}px)`;
    drag.li.classList.toggle('swipe-go', drag.dx < -90);
  });
  const end = () => {
    if (!drag) return;
    const { li, dx, on } = drag;
    drag = null;
    if (!on) return;
    root.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    li.classList.remove('swiping');
    if (dx < -90) {
      li.style.transform = 'translateX(-110%)';
      const meal = li.closest('.meal').dataset.meal;
      setTimeout(() => (li.dataset.ci != null ? removeFood(meal, { index: +li.dataset.ci }) : removeFood(meal, { slot: li.dataset.slot })), 150);
    } else { li.style.transform = ''; li.classList.remove('swipe-go'); }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
})();

function addToMeal(meal, food, grams) {
  const m = todayPlan()[meal];
  editMeal(meal, (c) => {
    if (!c.items) {
      if (meal === 'breakfast') c.template = m.template;
      c.items = m.portions.filter((x) => x.grams > 0).map((x) => ({ food: x.food, grams: x.grams }));
    }
    c.items.push({ food, grams });
  });
  resnap(meal);
}

$('#meals').addEventListener('click', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.closest('[data-snackadd]')) {
    const food = e.target.closest('[data-snackadd]').dataset.snackadd;
    const unit = FOODS[food].unit?.grams || 100;
    editMeal('snack', (c) => {
      c.on = true; c.items ||= [];
      const same = c.items.find((x) => x.food === food);
      if (same) same.grams += unit; else c.items.push({ food, grams: unit });
      delete c.title;
    });
    resnap('snack');
    renderToday();
    return;
  }
  if (e.target.closest('[data-savecombo]')) {
    saveCombo(meal);
  } else if (e.target.closest('[data-managecombos]')) {
    managingCombos = managingCombos === meal ? null : meal;
    renderToday();
  } else if (e.target.closest('[data-delcombo]')) {
    const id = e.target.closest('[data-delcombo]').dataset.delcombo;
    const c = state.combos.find((x) => x.id === id);
    if (c && confirm(`Delete the combo “${c.name}”?`)) {
      state.combos = state.combos.filter((x) => x.id !== id);
      store.set('combos', state.combos);
      if (!state.combos.some((x) => x.kind === comboKind(meal))) managingCombos = null;
      renderToday();
    }
  } else if (e.target.closest('[data-fit]')) {
    const m = todayPlan()[meal];
    editCustom(meal, (c) => { c.items = fitItems(c.items, m.target.kcal); });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-prepared]')) {
    editMeal(meal, (c) => { delete c.items; delete c.manual; delete c.eatout; c.prepared = { servings: 1 }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-pmserv]')) {
    editMeal(meal, (c) => { c.prepared = { ...c.prepared, servings: +e.target.closest('[data-pmserv]').dataset.pmserv }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-pmsave]')) {
    const p = todaysCustom()[meal]?.prepared;
    if (!p?.name?.trim()) { alert('Give the meal a name first, so you can find it in the list.'); return; }
    savePrepared(p);
    renderToday();
  } else if (e.target.closest('[data-pmdel]')) {
    const p = todaysCustom()[meal]?.prepared;
    if (p?.name && confirm(`Remove “${p.name}” from your prepared meals?`)) store.set('preparedMeals', preparedList().filter((x) => !sameMeal(x, p)));
    renderToday();
  } else if (e.target.closest('[data-eatout]')) {
    editMeal(meal, (c) => { delete c.items; delete c.manual; c.eatout = { mode: 'estimate', dish: meal === 'breakfast' ? 'brunch' : 'plate', size: 'regular', ate: 1 }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-eodrink]')) {
    const [k, delta] = e.target.closest('[data-eodrink]').dataset.eodrink.split(':');
    editMeal(meal, (c) => {
      const drinks = { ...(c.eatout?.drinks || {}) };
      drinks[k] = Math.max(0, (drinks[k] || 0) + +delta);
      if (!drinks[k]) delete drinks[k];
      c.eatout = { ...c.eatout, drinks };
    });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-eoset]')) {
    const [field, value] = e.target.closest('[data-eoset]').dataset.eoset.split(':');
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, [field]: field === 'ate' ? +value : value }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-cremove]')) {
    removeFood(meal, { index: +e.target.closest('[data-cremove]').dataset.cremove });
  } else if (e.target.closest('[data-premove]')) {
    removeFood(meal, { slot: e.target.closest('[data-premove]').dataset.premove });
  }
});

$('#meals').addEventListener('change', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.dataset.combo != null) {
    if (e.target.value) useCombo(meal, e.target.value);
    return;
  } else if (e.target.dataset.quick != null) {
    if (e.target.value) useQuick(meal, e.target.value);
    return;
  } else if (e.target.dataset.pmpick != null) {
    const id = e.target.value;
    const x = id.startsWith('p:') ? partnerPrepared().find((y) => y.id === id.slice(2)) : preparedList().find((y) => y.id === id);
    if (!x) return;
    editMeal(meal, (c) => { c.prepared = { name: x.name, kitchen: x.kitchen, p: x.p, c: x.c, f: x.f, kcal: x.kcal || '', servings: 1 }; });
    if (id.startsWith('p:') && !preparedList().some((y) => sameMeal(y, x))) savePrepared(x);
  } else if (e.target.dataset.eo === 'dish') {
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, dish: e.target.value }; });
  } else if (e.target.dataset.cfood != null) {
    const i = +e.target.dataset.cfood;
    editCustom(meal, (c) => { c.items[i].food = e.target.value; });
  } else if (e.target.dataset.cadd != null) {
    const food = e.target.value;
    if (!food) return;
    addToMeal(meal, food, FOODS[food].unit?.grams || 100); // a planned meal becomes your own, foods kept
  } else return;
  resnap(meal);
  renderToday();
});

$('#meals').addEventListener('input', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.dataset.eo === 'place' || e.target.dataset.eo === 'dishName') {
    const k = e.target.dataset.eo;
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, [k]: e.target.value }; });
  } else if (e.target.dataset.pm) {
    const k = e.target.dataset.pm;
    const num = !['name', 'kitchen'].includes(k);
    editMeal(meal, (c) => { c.prepared = { ...c.prepared, [k]: num ? (e.target.value === '' ? '' : +e.target.value) : e.target.value }; });
  } else if (e.target.dataset.eomenu) {
    const k = e.target.dataset.eomenu;
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, menu: { ...c.eatout.menu, [k]: e.target.value === '' ? '' : +e.target.value } }; });
  } else if (e.target.dataset.cgrams != null) {
    const i = +e.target.dataset.cgrams;
    const food = e.target.dataset.food;
    // The box may be in raw/dry (or cooked oats) grams; the meal stores base grams.
    const grams = cookedG(food, Math.max(0, +e.target.value || 0), meal);
    editCustom(meal, (c) => { c.items[i].grams = grams; });
  } else if (e.target.dataset.manual) {
    const k = e.target.dataset.manual;
    editCustom(meal, (c) => { c.manual = { ...c.manual, [k]: e.target.value === '' ? '' : +e.target.value }; });
  } else return;
  refreshCustom(meal);
});

// Keep an already-logged meal in step with edits.
function resnap(meal) {
  const log = viewLog();
  if (log.meals[meal]) { log.meals[meal] = { ...snapshot(todayPlan()[meal]), at: log.meals[meal].at }; saveLog(); }
}

function eatButton(meal) {
  if (viewingFuture()) return '<div class="eat-row"><span class="small muted">Planned · you can log it on the day</span></div>';
  const e = todaysLog().meals[meal];
  // The most recent main meal logged gets a cheer (the whole day's 💪 once all three and the weigh-in are in).
  const day = healthDay(personData(activeProfile().id), isoDate());
  const cheer = e && !sync.readOnly() && day.meals[day.meals.length - 1] === meal ? `<div class="cheer">${cheerFor(day, isoDate(), meal)}</div>` : '';
  return e
    ? `${cheer}<div class="eat-row"><span class="tone-good">🔒 Logged at ${e.at} · ${e.kcal} kcal</span><span class="row" style="margin-top:0">${todaysCustom()[meal]?.eatout || todaysCustom()[meal]?.prepared ? '' : `<button class="ghost small" data-savecombo>☆ Save combo</button>`}<button class="ghost small" data-uneat title="Unlock this meal to change it">Unlog to edit</button></span></div>`
    : `<div class="eat-row"><button class="eat" data-eat>${meal === 'snack' ? '✓ Log snack' : '✓ I ate this'}</button></div>`;
}

function snapshot(m) {
  return { title: m.title, kcal: m.totals.kcal, p: m.totals.p, f: m.totals.f, c: m.totals.c, target: m.target,
    foods: m.portions.filter((x) => x.grams > 0).map((x) => `${FOODS[x.food].name} ${x.grams}g`).join('; '),
    at: new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) };
}

function totalsLine(m) {
  const cell = (k, label) => {
    const d = m.totals[k] - m.target[k];
    const off = Math.abs(d) > (k === 'kcal' ? 40 : 5);
    return `<span class="${k}${off ? ' off' : ''}">${m.totals[k]}${label}<small>/${m.target[k]}</small></span>`;
  };
  return `${cell('kcal', ' kcal')} · ${cell('p', 'P')} · ${cell('f', 'F')} · ${cell('c', 'C')}`;
}

function itemRow(x, meal) {
  const a = amountLabel(x.food, x.grams, meal);
  const name = x.options.length > 1
    ? `<select data-pick="${x.slot}" aria-label="Swap ${esc(FOODS[x.food].name)}">${x.options.map((o) => `<option value="${o}" ${o === x.food ? 'selected' : ''}>${esc(FOODS[o].name)}</option>`).join('')}${NEW_FOOD_OPTION}</select>`
    : `<span>${esc(FOODS[x.food].name)}</span>`;
  return `
    <li data-slot="${x.slot}" class="${x.locked ? 'locked' : ''}">
      <div class="item-top">${name}<span class="amt" data-role="amt">${a.main}<small>${a.sub}</small></span><button type="button" class="x" data-premove="${x.slot}" aria-label="Remove ${esc(FOODS[x.food].name)}">✕</button></div>
      <div class="item-slider stepper">
        <button class="lock" data-unlock="${x.slot}" title="${x.locked ? 'Locked — tap to let the app size this' : 'Auto-sized'}">${x.locked ? '🔒' : 'auto'}</button>
        <span class="gfield">${weighWays(x.food) ? gramsUnit(x.food, meal) : ''}<input type="number" class="grams gbox" data-gbox="${x.slot}" data-food="${x.food}" min="0" step="any" inputmode="decimal" value="${shownG(x.food, x.grams, meal)}" aria-label="${esc(FOODS[x.food].name)} grams ${weighWord(x.food, meal)}"><span class="g">g</span></span>
        ${stepButtons(x, meal)}
      </div>
    </li>`;
}

// − / + next to the grams box: one step is the food's usual increment (5 g meat, 10 g rice,
// 25 g veggies…), converted to the weight shown, so it nudges by a sensible amount either way.
function stepSize(x, meal) {
  const base = x.range?.[2] ?? 5;
  if (!weighAlt(x.food, meal)) return base; // e.g. ½ apple = 91 g, 12.5 g of some foods
  const s = base * weighWays(x.food).k;
  return s >= 5 ? Math.round(s / 5) * 5 : Math.max(1, Math.round(s));
}
function stepButtons(x, meal) {
  const n = esc(FOODS[x.food].name);
  return `<span class="steps"><button type="button" data-step="-1" data-size="${stepSize(x, meal)}" aria-label="Less ${n}">−</button><button type="button" data-step="1" data-size="${stepSize(x, meal)}" aria-label="More ${n}">+</button></span>`;
}
// A step snaps to the step grid, then goes through the grams box's own input handling.
function stepGrams(btn) {
  const box = btn.closest('.stepper').querySelector('input.grams');
  const size = +btn.dataset.size;
  const cur = +box.value || 0;
  const next = +btn.dataset.step > 0 ? Math.floor(cur / size + 1e-9) * size + size : Math.ceil(cur / size - 1e-9) * size - size;
  box.value = Math.max(0, Math.round(next * 10) / 10);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}
// Tap to step once; press and hold to keep going.
let stepHold = null;
const stopHold = () => { clearTimeout(stepHold?.t); clearInterval(stepHold?.i); };
$('#meals').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  stopHold();
  stepHold = { b, held: false };
  stepHold.t = setTimeout(() => { stepHold.held = true; stepHold.i = setInterval(() => stepGrams(b), 110); }, 450);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('#meals').addEventListener(ev, stopHold, true);
$('#meals').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const held = stepHold?.b === b && stepHold.held;
  stopHold();
  stepHold = null;
  if (!held) stepGrams(b);
});

// Live-update one meal card while you type or step, without re-rendering the box being edited.
function refreshMeal(meal, active) {
  const m = todayPlan()[meal];
  const card = document.querySelector(`.meal[data-meal="${meal}"]`);
  // Editing a meal you already logged corrects what you ate.
  const log = viewLog();
  if (log.meals[meal]) {
    log.meals[meal] = { ...snapshot(m), at: log.meals[meal].at };
    saveLog();
    card.querySelector('.eat-row').outerHTML = eatButton(meal);
    renderDayBar();
  }
  card.querySelector('[data-role="title"]').textContent = m.title;
  card.querySelector('[data-role="totals"]').innerHTML = totalsLine(m);
  card.querySelector('[data-reset]')?.toggleAttribute('hidden', !todaysCustom()[meal]);
  for (const x of m.portions) {
    const li = card.querySelector(`li[data-slot="${x.slot}"]`);
    const a = amountLabel(x.food, x.grams, meal);
    li.querySelector('[data-role="amt"]').innerHTML = `${a.main}<small>${a.sub}</small>`;
    li.classList.toggle('locked', x.locked);
    const lock = li.querySelector('.lock');
    lock.textContent = x.locked ? '🔒' : 'auto';
    const g = li.querySelector('[data-gbox]');
    if (g && g !== active) g.value = shownG(x.food, x.grams, meal);
  }
}

function editMeal(meal, fn) {
  const meals = todaysCustom();
  meals[meal] = meals[meal] || {};
  fn(meals[meal]);
  saveCustom();
}

// The grams box (typed or stepped with − / +) sets that food's amount (and locks it 🔒).
$('#meals').addEventListener('input', (e) => {
  const slot = e.target.dataset.gbox;
  if (!slot) return;
  if (e.target.value === '') return; // still typing
  const meal = e.target.closest('.meal').dataset.meal;
  const plan = todayPlan()[meal];
  // The box may be in raw/dry (or cooked oats) grams; the meal stores base grams.
  const grams = cookedG(e.target.dataset.food, Math.max(+e.target.value || 0, 0), meal);
  editMeal(meal, (c) => {
    if (meal === 'breakfast') c.template = plan.template;
    c.grams = { ...c.grams, [slot]: grams };
  });
  refreshMeal(meal, e.target);
});
// Show the real amount once you leave the box (e.g. it was above the slider's range).
$('#meals').addEventListener('change', (e) => {
  if (!e.target.dataset.gbox) return;
  const meal = e.target.closest('.meal').dataset.meal;
  const x = todayPlan()[meal].portions.find((p) => p.slot === e.target.dataset.gbox);
  if (x) e.target.value = shownG(x.food, x.grams, meal);
});

$('#meals').addEventListener('change', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.dataset.template != null) {
    editMeal(meal, (c) => { c.template = e.target.value; delete c.picks; delete c.grams; delete c.items; delete c.manual; });
  } else if (e.target.dataset.pick) {
    const slot = e.target.dataset.pick;
    const food = e.target.value;
    const plan = todayPlan()[meal];
    editMeal(meal, (c) => {
      if (meal === 'breakfast') c.template = plan.template;
      c.picks = { ...c.picks, [slot]: food };
      if (c.grams) delete c.grams[slot];
    });
    // Remember swaps for next time (proteins at lunch/dinner stay day-by-day).
    if (!(meal !== 'breakfast' && slot === 'protein')) {
      const key = meal === 'breakfast' ? plan.template : 'main';
      state.prefs[key] = { ...state.prefs[key], [slot]: food };
      store.set('prefs', state.prefs);
    }
  } else return;
  const log = viewLog();
  if (log.meals[meal]) { log.meals[meal] = { ...snapshot(todayPlan()[meal]), at: log.meals[meal].at }; saveLog(); }
  renderToday();
  renderGroceries();
});

$('#meals').addEventListener('click', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  const unlock = e.target.closest('[data-unlock]')?.dataset.unlock;
  if (unlock) {
    editMeal(meal, (c) => { if (c.grams) delete c.grams[unlock]; });
    refreshMeal(meal);
  } else if (e.target.closest('[data-eat]')) {
    todaysLog().meals[meal] = snapshot(todayPlan()[meal]);
    saveLog();
    renderToday();
  } else if (e.target.closest('[data-uneat]')) {
    delete todaysLog().meals[meal];
    saveLog();
    renderToday();
  } else if (e.target.closest('[data-reset]')) {
    if (meal === 'snack' && viewLog().meals.snack) {
      if (!confirm('Remove the snack you logged today?')) return;
      delete todaysLog().meals.snack;
      saveLog();
    }
    delete todaysCustom()[meal];
    saveCustom();
    renderToday();
  }
});

function renderAdjustBanner(t) {
  const s = suggestAdjustment(phaseWeights(), baseTargets().lbPerWeek);
  const el = $('#adjustBanner');
  const lastApplied = store.get('adjustAppliedOn', null);
  const recentlyApplied = lastApplied && (Date.now() - new Date(lastApplied).getTime()) < 7 * 86400000;
  if (!s) {
    el.innerHTML = state.weights.length < 2
      ? `<div class="banner">Weigh in a few times a week. After 2 weeks I'll check your trend and fine-tune calories.</div>`
      : '';
    return;
  }
  if (s.delta === 0 || recentlyApplied) {
    el.innerHTML = `<div class="banner">Trend: <b>${s.lost >= 0 ? '−' : '+'}${Math.abs(s.lost).toFixed(1)} lb/wk</b> — ${s.delta === 0 ? 'right on track 👍' : 'adjusted recently, give it a week'}.</div>`;
    return;
  }
  // Changes are offered in the weekly check-in, so this is just the heads-up.
  el.innerHTML = `
    <div class="banner">
      ${firstName() ? `${esc(firstName())}, your trend` : 'Trend'}: <b>${s.lost >= 0 ? '−' : '+'}${Math.abs(s.lost).toFixed(1)} lb/wk</b>, ${s.reason}.
      ${checkinDue() || draft ? 'See your check-in below.' : '<button class="linkish" id="bannerCheckin">Check in now</button> to adjust your macros.'}
    </div>`;
  if ($('#bannerCheckin')) $('#bannerCheckin').onclick = openCheckin;
}

// ---------- PROGRAM: 8-week phases and what to do next ----------
function renderProgram() {
  const today = isoDate();
  const phase = PHASES[state.profile.phase] ? state.profile.phase : 'cut';
  const start = state.profile.phaseStart || state.profile.createdOn || today;
  const weeks = state.profile.phaseWeeks || PHASES[phase].weeks;
  const dayN = Math.max(1, Math.round((new Date(today + 'T12:00') - new Date(start + 'T12:00')) / DAY) + 1);
  const done = dayN > weeks * 7;
  const week = Math.min(Math.ceil(dayN / 7), weeks);
  const pct = Math.min(100, Math.round((dayN / (weeks * 7)) * 100));
  $('#program').innerHTML = done
    ? `<div class="card program done">
        <div class="eyebrow">${PHASES[phase].label} complete</div>
        <h3>🎉 Your ${weeks}-week ${PHASES[phase].label.toLowerCase()} is done${firstName() ? `, ${esc(firstName())}` : ''}!</h3>
        <p class="small">See your results and pick what to do next.</p>
        <button type="button" class="eat" id="openReview">See results & next step</button>
      </div>`
    : `<button type="button" class="program-strip" id="openReview" aria-label="See progress">
        <span><b>${PHASES[phase].label}</b> · week ${week} of ${weeks}</span>
        <span class="prog-track"><i style="width:${pct}%"></i></span>
        <span class="small muted">Progress ›</span>
      </button>`;
  $('#openReview').onclick = openReview;
}

const signed = (n, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}${unit}`;

function openReview() {
  const today = isoDate();
  const b = baseTargets();
  const r = programReview(exportProfile(activeProfile().id), today, { rate: b.lbPerWeek, atFloor: b.atFloor });
  const name = state.profile.name || activeProfile().name;
  const w = r.weight, n = r.nutrition, tr = r.training;
  const ro = sync.readOnly();
  const fmt = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  $('#reviewBody').innerHTML = `
    <div class="eyebrow">${PHASES[r.phase].label} · ${fmt(r.start)} – ${fmt(r.today)}</div>
    <h2>${r.done ? `${esc(name)}'s ${r.weeksPlanned}-week results` : `${esc(name)}'s progress · week ${Math.min(Math.ceil(r.weeksDone), r.weeksPlanned)} of ${r.weeksPlanned}`}</h2>
    <div class="stat-grid">
      <div class="stat"><b>${w.change != null ? signed(w.change, ' lb') : '—'}</b><span>weight (${w.start ?? '—'} → ${w.end ?? '—'}, 7-day avg)</span></div>
      <div class="stat"><b>${w.ratePerWeek != null ? signed(-w.ratePerWeek, ' lb/wk') : '—'}</b><span>average rate${w.pctBody != null ? ` · ${signed(w.pctBody, '%')} body weight` : ''}</span></div>
      <div class="stat"><b>${n.daysLogged}/${n.days}</b><span>days fully logged</span></div>
      <div class="stat"><b>${n.onTargetPct ?? '—'}${n.onTargetPct != null ? '%' : ''}</b><span>meals on target (${n.mealsLogged} logged)</span></div>
      <div class="stat"><b>${n.daysOnTrack}</b><span>days on track · 🪙 ${n.coins}</span></div>
      <div class="stat"><b>${n.proteinDays}</b><span>days protein goal hit</span></div>
      <div class="stat"><b>${tr.workouts}</b><span>lifting workouts</span></div>
      <div class="stat"><b>${tr.activities}</b><span>activities · ${tr.activityHours} h</span></div>
    </div>
    ${tr.strength.length ? `<h3>Strength (estimated 1-rep max, first vs last 2 weeks)</h3>
      <ul class="list">${tr.strength.map((x) => `<li><span>${esc(x.exercise)}</span><span class="small"><b>${x.from} → ${x.to} lb</b> <span class="${x.pct >= 0 ? 'tone-good' : 'tone-warn'}">${signed(x.pct, '%')}</span></span></li>`).join('')}</ul>` : ''}
    <h3>${r.done ? 'What to do next' : 'When this phase ends'}</h3>
    <div class="next-opts">
      ${r.next.options.map((o) => `<div class="next-opt ${o.recommended ? 'rec' : ''}">
        <div><b>${esc(o.title)}</b>${o.recommended ? ' <em class="badge">Recommended</em>' : ''}</div>
        <p class="small">${esc(o.why)}</p>
        ${r.done && !ro ? `<button type="button" class="small ${o.recommended ? '' : 'ghost'}" data-phase="${o.id}" data-adjust="${o.adjust || 0}" data-weeks="${o.weeks || ''}">Choose this</button>` : ''}
      </div>`).join('')}
    </div>
    <p class="small">${esc(r.next.tip)}</p>
    <p class="small muted">Why: diet breaks of 1–2 weeks at maintenance (Byrne 2018; Peos 2021), slowing loss after weeks of dieting (Trexler 2014), lean gain at ~0.25–0.5% body weight a week (Iraki 2019). See ⓘ Science.</p>`;
  $('#reviewBody').querySelectorAll('[data-phase]').forEach((b) => b.onclick = () => startPhase(b.dataset.phase, +b.dataset.adjust, +b.dataset.weeks || 0));
  $('#reviewDialog').showModal();
}
$('#reviewClose').onclick = () => $('#reviewDialog').close();
$('#openReview2').onclick = openReview;

function startPhase(phase, adjust = 0, weeks = 0) {
  const now = currentWeight();
  const p = state.profile;
  p.phase = phase;
  p.phaseStart = isoDate();
  p.phaseWeeks = weeks || PHASES[phase].weeks;
  if (phase === 'maintain') p.goalLb = Math.round(now);
  if (phase === 'gain') p.goalLb = Math.round(now * 1.03);
  // A new cut when already at the goal aims ~3% lower.
  if (phase === 'cut' && now <= (p.goalLb || 0) + 0.5) p.goalLb = Math.round(now * 0.97);
  store.set('profile', p);
  if (adjust) { state.macroAdjust.c += Math.round(adjust / 4); store.set('macroAdjust', state.macroAdjust); }
  // Check-ins restart with the new phase.
  state.checkins.push({ date: isoDate(), feeling: null, note: `Started ${PHASES[phase].label.toLowerCase()}`, change: 'phase', delta: { p: 0, f: 0, c: adjust ? Math.round(adjust / 4) : 0 }, kcal: adjust });
  store.set('checkins', state.checkins);
  $('#reviewDialog').close();
  renderAll();
}

// ---------- DAILY DEFICIT GAME ----------
function renderDeficit() {
  const today = isoDate();
  const t = targets();
  const burned = burnedToday();
  const ate = consumed();
  const eaten = Math.round(ate.kcal);
  const now = burned.kcal - eaten;
  const d = state.days[today];
  const projected = scoreDay({ ...d, eaten: Math.max(eaten, t.kcal), protein: Math.max(d.protein, t.p) });
  const actual = scoreDay(d);
  const g = pastTally();
  const name = firstName();
  const pct = Math.max(0, Math.min(100, Math.round((eaten / burned.kcal) * 100)));

  let kudos;
  if (g.streak >= 1) kudos = `${name ? `${esc(name)}, ` : ''}${g.streak}-day deficit streak 🔥${g.next ? ` — ${g.next.days - g.streak} more for “${g.next.badge}” (+${g.next.coins} 🪙)` : ''}`;
  else kudos = `${name ? `${esc(name)}, s` : 'S'}tart a streak today: finish in a deficit to earn 🪙 ${projected.coins || 15}.`;

  const atGoal = d.plannedDeficit === 0;
  const gaining = d.plannedDeficit < 0;
  const loggedMeals = Object.keys(todaysLog().meals).length;
  const status = gaining
    ? `Lean gain: eat about ${-d.plannedDeficit} kcal more than you burn (now ${burned.kcal}). Finish within 100 under to ${Math.max(400, Math.round(-d.plannedDeficit * 1.5))} over for 🪙 15.`
    : atGoal
    ? `${(state.profile.phase || 'cut') === 'break' ? 'Diet break' : 'Maintenance'}: today's aim is holding steady. Finish within 200 kcal of what you burn (now ${burned.kcal}) for 🪙 15.`
    : !eaten
    ? `Log your meals as you eat. Finish at your target (${t.kcal}) for about a <b>${burned.kcal - t.kcal} kcal</b> deficit and 🪙 ${projected.coins}${projected.cookies ? ' + 🍪' : ''}.`
    : now <= 0
      ? `You're <b>${-now} kcal over</b> what you've burned today. Some extra activity could still flip it to a deficit.`
      : eaten < t.kcal
        ? `${t.kcal - eaten} kcal left in your plan. Finish there for a <b>${burned.kcal - t.kcal} kcal</b> deficit → 🪙 ${projected.coins}${projected.cookies ? ' + 🍪' : ''}.`
        : loggedMeals < 3
          ? `Log the rest of your meals to lock in today's coins.`
          : `Deficit locked in so far: 🪙 ${actual.coins}${actual.cookies ? ' + 🍪' : ''} if you stop here.`;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
    const key = isoDate(dt);
    const s = key === today ? null : scoreDay(state.days[key]);
    const icon = key === today ? '⏳' : s.status === 'deficit' || s.status === 'maintained' ? '🪙' : s.status === 'too-big' ? '⚠️' : s.status === 'surplus' ? '▲' : s.status === 'incomplete' ? '½' : '·';
    return `<span class="d7 ${s?.status || 'today'}" title="${key}"><b>${icon}</b><small>${dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></span>`;
  }).join('');

  $('#deficit').innerHTML = `
    <div class="card deficit-card">
      <div class="row between" style="margin-top:0">
        <div><div class="eyebrow">${gaining ? "Today's balance so far" : "Today's deficit so far"}</div>
          <div class="big ${now < 0 ? 'neg' : ''}">${now >= 0 ? '' : '+'}${Math.abs(now)} <small>kcal ${now >= 0 ? 'under' : 'over'}</small></div></div>
        <div class="coins-total"><b>🪙 ${g.coins}</b><small>🍪 ${g.cookies} · best 🔥 ${g.best}</small></div>
      </div>
      <div class="def-track"><i style="width:${pct}%"></i></div>
      <div class="def-nums small"><span>Eaten <b>${eaten}</b></span><span>Burned <b>${burned.kcal}</b> <span class="muted">(${esc(burned.source)})</span></span></div>
      <p class="small">${status}</p>
      <label for="whoopTotalInput" class="small">Total calories burned today (from the WHOOP app)</label>
      <form id="whoopTotalForm" class="row" style="margin-top:4px">
        <input id="whoopTotalInput" type="number" inputmode="numeric" min="0" max="10000" placeholder="e.g. 2650 — optional" value="${state.whoopTotal[today] ?? ''}">
        <button class="small" type="submit">Save</button>
        ${state.whoopTotal[today] ? '<button class="ghost small" type="button" id="clearWhoopTotal">Use estimate</button>' : ''}
      </form>
      <p class="kudos">${kudos}</p>
      <div class="d7row" aria-label="Last 7 days">${last7}</div>
      ${g.badges.length ? `<p class="small muted">Badges: ${[...new Set(g.badges.map((b) => b.badge))].map(esc).join(' · ')}</p>` : ''}
      <details class="small"><summary>How scoring works</summary>
        <p>A day counts once all three meals are logged. Each counted day that finishes under the calories you burned earns 🪙 10, plus 🪙 5 if the deficit stays sustainable (under ~${Math.max(750, Math.round((d.plannedDeficit || 500) * 1.5))} kcal and not below ${d.floor} kcal eaten). Hitting 90% of your protein earns a 🍪. Streaks of ${MILESTONES.map((m) => `${m.days}`).join(', ')} days pay ${MILESTONES.map((m) => `+${m.coins}`).join(', ')} 🪙. Once you reach your goal weight, finishing within 200 kcal of what you burned earns 🪙 15 instead. Today's coins are added after midnight. Legend: 🪙 earned · ▲ over · ⚠️ too big · ½ not fully logged.</p>
      </details>
    </div>`;

  $('#whoopTotalForm').onsubmit = (e) => {
    e.preventDefault();
    const v = parseInt($('#whoopTotalInput').value, 10);
    if (!v) return;
    state.whoopTotal = { ...Object.fromEntries(Object.entries(state.whoopTotal).filter(([k]) => k >= isoDate(new Date(Date.now() - 60 * DAY)))), [today]: v };
    store.set('whoopTotal', state.whoopTotal);
    renderToday();
  };
  if ($('#clearWhoopTotal')) $('#clearWhoopTotal').onclick = () => {
    delete state.whoopTotal[today];
    store.set('whoopTotal', state.whoopTotal);
    renderToday();
  };
}

// ---------- WEEKLY CHECK-IN ----------
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const DAY = 86400000;
// Check-ins fall every 7 days from the day this phase (the diet) started — start on a Monday,
// check in every Monday — and stay up until done.
const programStartDay = () => state.profile.phaseStart || state.profile.createdOn || state.weights[0]?.date;
function checkinDue() {
  return isCheckinDue(programStartDay(), isoDate(), state.checkins, store.get('checkinSnooze', null));
}

let draft = null; // in-progress check-in: {feeling, note, choice, custom: {p, f, c}, open}

function renderCheckin() {
  const el = $('#checkin');
  if (!draft && !checkinDue()) { el.innerHTML = ''; return; }
  draft = draft || { feeling: null, note: '', choice: null, custom: { p: 0, f: 0, c: 0 } };
  const name = firstName();
  const base = baseTargets();
  const today = isoDate();
  const win = checkinWindow(programStartDay(), today) || { week: 1, due: today };
  const phase = PHASES[state.profile.phase] ? state.profile.phase : 'cut';
  const plannedWeeks = state.profile.phaseWeeks || PHASES[phase].weeks;
  // The week just finished: the 7 days before this check-in's day.
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${win.due}T12:00:00`); d.setDate(d.getDate() - 7 + i); return isoDate(d); });
  const r = weeklyReview({
    days: weekDays.map((d) => ({ date: d, ...(state.days[d] || {}) })), weights: phaseWeights(),
    targetKcal: base.kcal, targetRate: phase === 'cut' ? base.lbPerWeek : 0, floor: state.profile.sex === 'male' ? 1500 : 1200,
    weightLb: currentWeight(), weeksIn: win.week, plannedWeeks, phase, feeling: draft.feeling,
  });
  const wow = weekOverWeek(state.weights);
  const suggested = r.id === 'suggested' ? { id: 'suggested', label: `${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)} kcal`, detail: (() => { const m = deltaMacros(r.delta); return `${m.c > 0 ? '+' : '−'}${Math.abs(m.c)} g carbs, ${m.f > 0 ? '+' : '−'}${Math.abs(m.f)} g fat · protein stays`; })(), delta: deltaMacros(r.delta) } : null;
  const maintenance = { id: 'maintenance', label: 'Maintenance for 2 weeks (diet break)', detail: 'Eat at maintenance, then pick the next phase', delta: { p: 0, f: 0, c: 0 } };
  const all = [...(suggested ? [suggested] : []), ...CHECKIN_OPTIONS, ...(phase === 'cut' ? [maintenance] : [])];
  const recId = r.id === 'suggested' ? 'suggested' : r.id;
  const choice = draft.choice || recId;
  const options = [...all].sort((a, b) => (a.id === recId ? -1 : b.id === recId ? 1 : 0));
  const delta = choice === 'custom' ? draft.custom : (all.find((o) => o.id === choice) || all[0]).delta;
  const after = { p: base.p + (delta.p || 0), f: base.f + (delta.f || 0), c: base.c + (delta.c || 0) };
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const fmtD = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const stat = (big, label) => `<div><b>${big}</b><small>${label}</small></div>`;

  el.innerHTML = `
    <div class="card checkin">
      <div class="eyebrow">Week ${win.week} check-in · ${fmtD(win.due)}</div>
      <h3>${name ? `Hi ${esc(name)}, how` : 'How'} did week ${win.week} go?</h3>
      <div class="ck-stats">
        ${stat(wow ? `${wow.change <= 0 ? '−' : '+'}${Math.abs(wow.change).toFixed(1)} lb` : (r.lost != null ? `${r.lost >= 0 ? '−' : '+'}${Math.abs(r.lost).toFixed(1)} lb` : '—'), wow ? `7-day avg ${wow.before.toFixed(1)} → ${wow.now.toFixed(1)}` : 'weight trend')}
        ${stat(r.avgIntake != null ? `${r.avgIntake}` : '—', `avg kcal eaten · target ${r.avgTarget}`)}
        ${stat(`${r.logged}/7`, 'days logged')}
        ${stat(r.tdee ? `~${r.tdee}` : '—', 'your real maintenance')}
      </div>
      <div class="row wrap ck-tools"><button type="button" class="ghost small" id="ckCsv">⇩ Week as CSV</button><button type="button" class="ghost small" id="ckClaude">📋 Copy for Claude</button><button type="button" class="ghost small" id="ckRemind">🔔 Weekly reminder</button></div>
      <p class="small muted" id="ckToolsNote"></p>
      ${phase === 'cut' ? `<p class="small muted">Week ${win.week} of a planned ${plannedWeeks}-week cut. Cuts work best at 0.5–1% of body weight a week for about 8–12 weeks, followed by 1–2 weeks at maintenance before the next block.</p>` : ''}
      <div class="chips" role="group" aria-label="How the week felt">
        ${Object.entries(FEELINGS).map(([k, v]) => `<button type="button" class="chip ${draft.feeling === k ? 'on' : ''}" data-feel="${k}">${v}</button>`).join('')}
      </div>
      <textarea id="checkinNote" rows="2" placeholder="Anything else? (optional — sleep, stress, travel…)">${esc(draft.note)}</textarea>

      <h3 class="q">${name ? `${esc(name)}, would` : 'Would'} you like to change your macros?</h3>
      <p class="small"><b>Suggested:</b> ${esc(r.why)}</p>
      <div class="options">
        ${options.map((o) => `
          <label class="opt ${choice === o.id ? 'on' : ''}">
            <input type="radio" name="checkinChoice" value="${o.id}" ${choice === o.id ? 'checked' : ''}>
            <span><b>${o.label}</b>${o.id === recId ? ' <em class="badge">Suggested</em>' : ''}<small>${o.detail}</small></span>
          </label>`).join('')}
        <label class="opt ${choice === 'custom' ? 'on' : ''}">
          <input type="radio" name="checkinChoice" value="custom" ${choice === 'custom' ? 'checked' : ''}>
          <span><b>Custom</b><small>Set your own protein, fat and carb change</small></span>
        </label>
        ${choice === 'custom' ? `<div class="custom-macros">
          ${[['p', 'Protein'], ['f', 'Fat'], ['c', 'Carbs']].map(([k, label]) => `
            <div class="stepper"><span>${label}</span>
              <button type="button" class="ghost small" data-step="${k}" data-by="-5" aria-label="Less ${label}">−</button>
              <b>${sign(draft.custom[k])} g</b>
              <button type="button" class="ghost small" data-step="${k}" data-by="5" aria-label="More ${label}">+</button>
            </div>`).join('')}
          <div class="small muted">${sign(deltaKcal(draft.custom))} kcal/day</div>
        </div>` : ''}
      </div>
      <p class="small">${choice === 'maintenance' ? 'For the next 2 weeks: <b>maintenance calories</b> (about your current burn); then the app asks what\'s next.' : `New daily targets: <b>${base.kcal + deltaKcal(delta)} kcal</b> · ${after.p}P · ${after.f}F · ${after.c}C`}</p>
      <div class="row">
        <button type="button" id="saveCheckin">Save check-in</button>
        <button type="button" class="ghost" id="snoozeCheckin">Not now</button>
      </div>
    </div>`;

  el.querySelectorAll('[data-feel]').forEach((b) => b.onclick = () => { draft.feeling = b.dataset.feel; draft.choice = null; renderCheckin(); });
  $('#checkinNote').oninput = (e) => { draft.note = e.target.value; };
  el.querySelectorAll('input[name=checkinChoice]').forEach((x) => x.onchange = () => { draft.choice = x.value; renderCheckin(); });
  el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { draft.custom[b.dataset.step] += +b.dataset.by; renderCheckin(); });
  const toolNote = (msg) => { const n = $('#ckToolsNote'); if (n) n.textContent = msg; };
  $('#ckCsv').onclick = async () => toolNote(await exportWeek());
  $('#ckClaude').onclick = async () => toolNote(await copyWeekForClaude());
  $('#ckRemind').onclick = async () => toolNote(`${await checkinReminder()} Tap Add to put a repeating reminder in your calendar.`);
  $('#snoozeCheckin').onclick = () => { store.set('checkinSnooze', isoDate()); draft = null; renderCheckin(); };
  $('#saveCheckin').onclick = () => {
    const entry = { date: isoDate(), week: win.week, feeling: draft.feeling, note: draft.note.trim(), change: choice, delta, kcal: deltaKcal(delta),
      review: { lost: r.lost, avgIntake: r.avgIntake, tdee: r.tdee, logged: r.logged } };
    state.checkins.push(entry);
    store.set('checkins', state.checkins);
    draft = null;
    if (choice === 'maintenance') { startPhase('break', 0, 2); $('#checkin').innerHTML = `<div class="banner">Saved${name ? `, ${esc(name)}` : ''}. Two weeks at maintenance start today — enjoy the break.</div>`; return; }
    for (const k of ['p', 'f', 'c']) state.macroAdjust[k] += delta[k] || 0;
    store.set('macroAdjust', state.macroAdjust);
    store.set('adjustAppliedOn', isoDate());
    renderAll();
    $('#checkin').innerHTML = `<div class="banner">Saved${name ? `, ${esc(name)}` : ''}. ${deltaKcal(delta) || delta.p ? 'Your new targets start now.' : 'Same targets — keep it up.'} Next check-in ${fmtD(win.next || today)}.</div>`;
  };
}

// ---- the week, for a spreadsheet or the Claude app ----
// The week a check-in covers (the 7 days before it), or the last 7 days.
function exportWeekStart() {
  const w = checkinWindow(programStartDay(), isoDate());
  const d = new Date(`${w ? w.due : isoDate()}T12:00:00`);
  d.setDate(d.getDate() - (w ? 7 : 6));
  return isoDate(d);
}
function weekReview(from) {
  const base = baseTargets();
  const phase = PHASES[state.profile.phase] ? state.profile.phase : 'cut';
  const win = checkinWindow(programStartDay(), isoDate());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + i); return isoDate(d); });
  return weeklyReview({
    days: days.map((d) => ({ date: d, ...(state.days[d] || {}) })), weights: phaseWeights(), targetKcal: base.kcal,
    targetRate: phase === 'cut' ? base.lbPerWeek : 0, floor: state.profile.sex === 'male' ? 1500 : 1200, weightLb: currentWeight(),
    weeksIn: win?.week || 1, plannedWeeks: state.profile.phaseWeeks || PHASES[phase].weeks, phase, feeling: draft?.feeling,
  });
}
function weekCsv(from) { return toCsv(weekRows(exportProfile(activeProfile().id), from)); }
async function exportWeek() {
  const from = exportWeekStart();
  return deliver(new Blob([weekCsv(from)], { type: 'text/csv' }), `${fileSlug().replace(/-\d{4}-\d{2}-\d{2}$/, '')}-week-of-${from}.csv`);
}
// A summary plus the CSV, ready to paste into the Claude app for a deeper look.
async function copyWeekForClaude() {
  const from = exportWeekStart();
  const p = state.profile, base = baseTargets(), r = weekReview(from);
  const phase = PHASES[p.phase] ? p.phase : 'cut';
  const win = checkinWindow(programStartDay(), isoDate());
  const ft = Math.floor((p.heightIn || 0) / 12), inch = Math.round((p.heightIn || 0) % 12);
  const text = [
    `Here is my week from my diet & training tracker (week of ${from}). Please review it like a coach: is my calorie target right for my goal, how is my protein and adherence, and what one or two changes would help most next week? Keep it evidence-based.`,
    '',
    `Me: ${p.sex || ''}, ${p.age || '?'} years, ${ft ? `${ft}'${inch}"` : ''}, now ${currentWeight().toFixed(1)} lb, goal ${p.goalLb || '?'} lb.`,
    `Phase: ${PHASES[phase].label.toLowerCase()}, week ${win?.week || 1} of ${p.phaseWeeks || PHASES[phase].weeks}; planned pace ${phase === 'cut' ? `−${(+base.lbPerWeek).toFixed(1)} lb/week` : 'hold steady'}.`,
    `Daily targets: ${base.kcal} kcal · ${base.p} g protein · ${base.f} g fat · ${base.c} g carbs.`,
    `This week: ${r.logged}/7 days logged, average ${r.avgIntake ?? '?'} kcal eaten vs ${r.avgTarget} target${r.lost != null ? `, weight trend ${r.lost >= 0 ? '−' : '+'}${Math.abs(r.lost).toFixed(1)} lb/week` : ''}${r.tdee ? `, estimated maintenance ~${r.tdee} kcal` : ''}.`,
    `The app suggests: ${r.why}`,
    '',
    'Daily data (CSV):',
    weekCsv(from),
  ].join('\n');
  try { await navigator.clipboard.writeText(text); return 'Copied — open the Claude app and paste.'; }
  catch { return 'Couldn\'t copy here — use “Week as CSV” and share the file to Claude instead.'; }
}
// A repeating calendar reminder on check-in day, for the iPhone's Calendar.
async function checkinReminder() {
  const w = checkinWindow(programStartDay(), isoDate());
  const start = programStartDay();
  if (!start) return 'Set up your profile first.';
  // Always on the check-in weekday: today if today is check-in day, else the next one.
  const d = new Date(`${w ? (w.due === isoDate() ? w.due : w.next) : start}T12:00:00`);
  if (!w) d.setDate(d.getDate() + 7);
  const ev = { id: `checkin-${start}`, title: 'OurPawmily weekly check-in 📋', date: isoDate(d), start: '08:00', end: '08:15', repeat: { kind: 'weekly' }, remind: '0',
    notes: 'Open OurPawmily → Home → check-in: see the week and adjust macros.', who: 'both', tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  return deliver(new Blob([icsCalendar([ev], { name: 'Weekly check-in' })], { type: 'text/calendar' }), 'weekly-check-in.ics');
}

function openCheckin() {
  draft = draft || { feeling: null, note: '', choice: null, custom: { p: 0, f: 0, c: 0 } };
  document.querySelector('[data-tab=today]').click();
  renderCheckin();
  $('#checkin').scrollIntoView({ behavior: 'smooth' });
}

function renderCheckinHistory() {
  const list = [...state.checkins].reverse();
  $('#checkinList').innerHTML = list.length ? list.map((c) => `
    <li><span>${new Date(c.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      <small class="muted">· ${esc(FEELINGS[c.feeling] || '—')}${c.note ? ` · ${esc(c.note)}` : ''}</small></span>
      <span class="small">${c.change === 'keep' ? 'No change' : `${c.kcal > 0 ? '+' : c.kcal < 0 ? '−' : ''}${Math.abs(c.kcal)} kcal`}</span></li>`).join('')
    : '<li class="muted">Your first check-in arrives a week after you start.</li>';
}
$('#checkinNow').onclick = openCheckin;

// ---------- TRAINING ----------
function renderTraining(t) {
  const day = todaysTraining();
  const tracked = ACTIVITY[state.profile.activity].tracked;
  const today = isoDate();
  const connected = ['whoop', 'strava'].filter((p) => devices.get()[p]);
  const short = (type) => SESSION_TYPES[type]?.label.split(' (')[0] || '';
  const stats = sportStats(state.history);
  const mySports = Object.entries(stats).sort((a, b) => b[1].sessions - a[1].sessions);
  const weightKg = currentWeight() / 2.20462;

  const sessions = day.sessions.map((w) => `
    <li><span class="cap">${esc(w.source === 'added' ? (SPORTS[w.sport]?.name || short(w.type)) : w.name)}<small class="muted"> · ${esc(w.climb ? w.climb : w.source === 'added' ? `${INTENSITY[w.intensity]?.label.toLowerCase() || 'added'} · added by you` : w.source)}</small></span>
    <span class="amt">${w.miles ? `${w.miles} mi · ` : ''}${w.minutes} min<small>${w.kcal ? `${w.source === 'added' && !w.kcalFromYou ? '≈ ' : ''}${w.kcal} kcal` : 'estimated'}${w.strain != null ? ` · strain ${w.strain.toFixed(1)}` : ''}</small></span>
    ${w.source === 'added' ? `<button class="x" data-rmact="${w.id}" aria-label="Remove activity">✕</button>` : ''}</li>`).join('');
  const hidden = state.activities.filter((a) => a.date === today).length - day.sessions.filter((w) => w.source === 'added').length;

  const extra = day.extraKcal
    ? `<p class="small">+${day.extraKcal} kcal added back as carbs for today's training (75% of the estimated net burn, since calorie estimates tend to run high).</p>`
    : !tracked && day.sessions.length
      ? `<p class="small muted">Your profile's activity level already includes exercise. Choose “Count my workouts” in Profile to adjust calories per day.</p>`
      : '';

  const intra = day.fuel.length && t.intraC ? `
    <div class="banner fuel">
      <b>Intra-workout fuel: ~${t.intraC} g carbs</b> today.
      ${day.fuel.map((f) => `
        <div class="fuel-item"><b class="small">${f.session.minutes}-min ${(SPORTS[f.session.sport]?.name || short(f.session.type)).toLowerCase()}${f.session.intensity === 'hard' ? ' (hard)' : ''}: ~${f.grams} g</b>
        <div class="small muted">${esc(f.note)}${f.mixed ? ' Above 60 g/h, mix glucose + fructose sources (sports drink + fruit) so your gut can absorb it.' : ''}</div>
        <div class="small">e.g. ${f.options.slice(0, 3).map((o) => esc(o.label)).join(' · ')}</div></div>`).join('')}
      <div class="small muted">These carbs are already taken out of your meals below.</div>
      <div class="eat-row">${todaysLog().fuel
        ? `<span class="tone-good">✓ Fuel logged · ${todaysLog().fuel.kcal} kcal</span><button class="ghost small" id="unfuel">Undo</button>`
        : `<button class="eat" id="ateFuel">✓ I had my fuel</button>`}</div>
    </div>` : '';

  $('#training').innerHTML = `
    <div class="card">
      <div class="row between" style="margin-top:0">
        <div><div class="eyebrow">Training</div><h3>${day.label}</h3></div>
        <div class="row" style="margin-top:0">
          <button class="ghost small" id="openProgress">📈 Progress</button>
          ${connected.length ? '<button class="ghost small" id="syncNow">⟳ Sync</button>' : ''}
          <button class="ghost small" id="openDevices">Devices</button>
        </div>
      </div>
      ${sessions ? `<ul class="portions activities">${sessions}</ul>` : ''}
      ${hidden > 0 ? `<p class="small muted">${hidden} activit${hidden === 1 ? 'y you added was' : 'ies you added were'} matched to synced workouts, so ${hidden === 1 ? 'it isn\'t' : 'they aren\'t'} counted twice.</p>` : ''}
      ${extra}
      ${intra}
      <div class="act-picks" role="group" aria-label="Log a workout">
        ${[['lift', '🏋️', 'Lifting'], ['hotYoga', '🔥', 'Hot yoga'], ['running', '🏃', 'Run'], ['cycling', '🚴', 'Bike'], ['climb', '🧗', 'Climbing'], ['other', '✨', 'Other']].map(([k, i, l]) => `<button type="button" class="act-pick" data-actpick="${k}"><span>${i}</span>${l}</button>`).join('')}
      </div>
      <form id="planForm" class="add-activity">
        <select id="planSport" aria-label="Activity">
          <option value="">Add an activity…</option>
          ${mySports.length ? `<optgroup label="Your sports (from WHOOP / Garmin)">${mySports.map(([k, st]) => `<option value="${k}">${SPORTS[k].name} · ${st.sessions} sessions</option>`).join('')}</optgroup>` : ''}
          <optgroup label="${mySports.length ? 'Other activities' : 'Activities'}">${Object.keys(SPORTS).filter((k) => !stats[k]).map((k) => `<option value="${k}">${SPORTS[k].name}</option>`).join('')}</optgroup>
        </select>
        <div class="row" style="margin-top:0">
          <select id="planIntensity" aria-label="Intensity">${Object.entries(INTENSITY).map(([k, v]) => `<option value="${k}" ${k === 'moderate' ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          <input id="planMin" type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="min" style="flex:0 0 72px" aria-label="Minutes">
          <input id="planMiles" type="number" min="0" max="300" step="0.1" inputmode="decimal" placeholder="mi" style="flex:0 0 64px" aria-label="Distance (miles)" hidden>
          <input id="planKcal" type="number" min="0" max="5000" inputmode="numeric" placeholder="kcal" style="flex:0 0 84px" aria-label="Calories burned (from WHOOP)">
          <button type="submit" class="small">Add</button>
        </div>
        <p class="small muted" id="planEstimate"></p>
      </form>
      <p class="small muted" id="syncStatus">${connected.length
        ? `Connected: ${connected.map((c) => (c === 'strava' ? 'Garmin (Strava)' : 'WHOOP')).join(', ')}. Add planned sessions here to get fuel advice — they're replaced by the synced workout once it arrives.`
        : 'Add as many activities as you did or plan to do today, or connect WHOOP / Garmin under Devices.'}</p>
    </div>`;

  $('#openDevices').onclick = openDevices;
  $('#openProgress').onclick = openProgress;
  const showMiles = () => { const k = $('#planSport').value; $('#planMiles').hidden = !(k === 'running' || k === 'cycling'); };
  $('#training').querySelectorAll('[data-actpick]').forEach((b) => b.onclick = () => {
    const k = b.dataset.actpick;
    if (k === 'lift') { $('#liftSession')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (k === 'climb') { openClimb(); return; }
    if (k === 'other') { $('#planSport').value = ''; $('#planSport').focus(); showMiles(); return; }
    $('#planSport').value = k;
    $('#planSport').onchange();
    $(k === 'hotYoga' ? '#planMin' : '#planMiles').focus();
  });
  if ($('#ateFuel')) $('#ateFuel').onclick = () => {
    todaysLog().fuel = { title: 'Intra-workout fuel', kcal: t.intraC * 4, p: 0, f: 0, c: t.intraC };
    saveLog(); renderToday();
  };
  if ($('#unfuel')) $('#unfuel').onclick = () => { todaysLog().fuel = null; saveLog(); renderToday(); };
  if ($('#syncNow')) $('#syncNow').onclick = () => syncDevices(true);
  $('#training').querySelectorAll('[data-rmact]').forEach((b) => b.onclick = () => {
    state.activities = state.activities.filter((a) => a.id !== b.dataset.rmact);
    store.set('activities', state.activities);
    renderAll();
  });
  const showEstimate = () => {
    const sport = $('#planSport').value;
    const minutes = parseInt($('#planMin').value, 10);
    if (!sport || !minutes) { $('#planEstimate').textContent = sport ? 'Enter minutes to see the estimate.' : ''; return; }
    const est = estimateActivity(sport, minutes, $('#planIntensity').value, { weightKg, stats });
    const st = stats[sport];
    $('#planKcal').placeholder = `≈${est.kcal}`;
    $('#planEstimate').innerHTML = $('#planKcal').value
      ? `Using your <b>${$('#planKcal').value} kcal</b> (e.g. from the WHOOP app).`
      : `≈ <b>${est.kcal} kcal</b> burned, based on ${esc(est.basis)}${st?.strain != null && st.sessions >= 3 ? ` (typical strain ${st.strain})` : ''}. Type WHOOP's number in “kcal” to use it instead.`;
  };
  $('#planSport').onchange = () => {
    showMiles();
    const st = stats[$('#planSport').value];
    if ($('#planSport').value && !$('#planMin').value) $('#planMin').value = st?.typicalMin || 60;
    showEstimate();
  };
  $('#planIntensity').onchange = showEstimate;
  $('#planMin').oninput = showEstimate;
  $('#planKcal').oninput = showEstimate;
  $('#planForm').onsubmit = (e) => {
    e.preventDefault();
    const sport = $('#planSport').value;
    const intensity = $('#planIntensity').value;
    const minutes = parseInt($('#planMin').value, 10);
    if (!sport || !minutes) return;
    const typed = parseInt($('#planKcal').value, 10);
    const est = typed > 0 ? { kcal: typed } : estimateActivity(sport, minutes, intensity, { weightKg, stats });
    // Keep a year of activities for history and export.
    const cutoff = isoDate(new Date(Date.now() - 366 * DAY));
    state.activities = state.activities.filter((a) => a.date >= cutoff)
      .concat({ id: `a${Date.now()}`, date: today, sport, intensity, minutes, type: sessionType(sport, intensity), kcal: est.kcal, kcalFromYou: typed > 0,
        ...(+$('#planMiles').value > 0 && !$('#planMiles').hidden ? { miles: +$('#planMiles').value } : {}) });
    store.set('activities', state.activities);
    renderAll();
  };
}

// Keep a compact copy of every imported workout to learn your burn rate per sport.
function addHistory(list) {
  const byId = new Map(state.history.map((w) => [w.id, w]));
  for (const w of list) byId.set(w.id, { id: w.id, name: w.name, start: w.start, minutes: w.minutes, kcal: w.kcal, strain: w.strain ?? null });
  state.history = [...byId.values()];
  store.set('workoutHistory', state.history);
}

function mergeWorkouts(list) {
  addHistory(list);
  const cutoff = Date.now() - 14 * 86400000;
  const byId = new Map(state.workouts.map((w) => [w.id, w]));
  for (const w of list) byId.set(w.id, w);
  state.workouts = [...byId.values()].filter((w) => new Date(w.start).getTime() > cutoff)
    .sort((a, b) => a.start.localeCompare(b.start));
  store.set('workouts', state.workouts);
}

async function syncDevices(manual = false) {
  const d = devices.get();
  if (!d.server || (!d.whoop && !d.strava)) return;
  const status = $('#syncStatus');
  if (manual && status) status.textContent = 'Syncing…';
  const start = new Date(); start.setDate(start.getDate() - 2); start.setHours(0, 0, 0, 0);
  const { workouts, errors } = await devices.sync(start);
  mergeWorkouts(workouts);
  store.set('lastSync', Date.now());
  renderAll();
  if (errors.length) $('#syncStatus').textContent = `Sync problem — ${errors.join('; ')}`;
}

// ---------- DEVICES ----------
const devDialog = $('#devicesDialog');
function openDevices() {
  const d = devices.get();
  $('#serverUrl').value = d.server || '';
  for (const p of ['whoop', 'strava']) {
    $(`#${p}Status`).textContent = d[p] ? 'Connected' : 'Not connected';
    $(`#${p}Connect`).textContent = d[p] ? 'Disconnect' : 'Connect';
  }
  $('#csvStatus').textContent = '';
  renderSharing();
  $('#whoopCsvStatus').textContent = '';
  devDialog.showModal();
}
for (const p of ['whoop', 'strava']) {
  $(`#${p}Connect`).onclick = () => {
    if (devices.get()[p]) { devices.disconnect(p); openDevices(); renderAll(); return; }
    const url = $('#serverUrl').value.trim();
    if (!/^https:\/\//.test(url)) { $(`#${p}Status`).textContent = 'Add your connector URL first (see server/README.md).'; return; }
    devices.setServer(url);
    location.href = devices.connectUrl(p);
  };
}
$('#serverUrl').onchange = (e) => devices.setServer(e.target.value.trim());
$('#whoopCsv').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const list = parseWhoopCsv(await file.text());
    mergeWorkouts(list);
    const st = sportStats(list);
    const top = Object.entries(st).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 4)
      .map(([k, v]) => `${SPORTS[k].name} ${Math.round(v.kcalPerMin * 60)} kcal/h`).join(' · ');
    $('#whoopCsvStatus').textContent = `Read ${list.length} workouts. Your burn rates: ${top || 'no matching sports found'}.`;
    renderAll();
  } catch (err) {
    $('#whoopCsvStatus').textContent = err.message;
  }
  e.target.value = '';
};
$('#garminCsv').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const list = parseGarminCsv(await file.text());
    mergeWorkouts(list);
    const recent = list.filter((w) => Date.now() - new Date(w.start).getTime() < 14 * 86400000).length;
    $('#csvStatus').textContent = `Imported ${recent} recent activit${recent === 1 ? 'y' : 'ies'}.`;
    renderAll();
  } catch (err) {
    $('#csvStatus').textContent = err.message;
  }
  e.target.value = '';
};

// ---------- SCIENCE ----------
$('#openScience').onclick = () => {
  const item = (r) => `
    <li><b>${esc(r.topic)}</b><div class="small">${esc(r.used)}</div>
    <div class="small muted"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.cite)}</a></div></li>`;
  $('#scienceList').innerHTML = [['nutrition', 'Nutrition'], ['training', 'Training']].map(([area, title]) =>
    `<li class="science-head"><h3>${title}</h3></li>${RESEARCH.filter((r) => (r.area || 'nutrition') === area).map(item).join('')}`).join('');
  $('#scienceDialog').showModal();
};

// ---------- WEIGHT ----------
function renderWeight() {
  const w = state.weights;
  $('#weighList').innerHTML = w.length
    ? [...w].reverse().map((e) => `
        <li><span>${new Date(e.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span><b>${e.weight.toFixed(1)}</b> lb <button class="x" data-del="${e.date}" aria-label="Delete">✕</button></span></li>`).join('')
    : '<li class="muted">No weigh-ins yet.</li>';

  const start = w[0]?.weight ?? state.profile.weight;
  const now = currentWeight();
  const trend = weeklyTrend(w);
  $('#trendNote').textContent = trend ? `${trend.lbPerWeek <= 0 ? '−' : '+'}${Math.abs(trend.lbPerWeek).toFixed(1)} lb/wk (3-wk trend)` : '';
  $('#weightStats').innerHTML = `
    <div><b>${Math.abs(start - now).toFixed(1)}</b><span>lb ${start - now >= 0 ? 'lost' : 'gained'}</span></div>
    <div><b>${now.toFixed(1)}</b><span>current</span></div>
    <div><b>${Math.max(now - state.profile.goalLb, 0).toFixed(1)}</b><span>lb to goal</span></div>`;
  drawChart();
  renderDexa(state.weights);
}

let chartRange = '90';
$('#chartRange').onclick = (e) => {
  const b = e.target.closest('[data-range]');
  if (!b) return;
  chartRange = b.dataset.range;
  $('#chartRange').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  drawChart();
};

// Weight line graph: daily weigh-ins, 7-day average, goal, and the planned path.
function drawChart() {
  const svg = $('#chart');
  const all = state.weights;
  const cutoff = chartRange === 'all' ? '' : isoDate(new Date(Date.now() - (+chartRange - 1) * DAY));
  const w = all.filter((e) => e.date >= cutoff);
  $('#chartTip').hidden = true;
  if (w.length < 2) {
    svg.innerHTML = `<text class="empty" x="170" y="110" text-anchor="middle">Log 2+ weigh-ins to see your graph</text>`;
    return;
  }
  const W = 340, H = 220, pad = { l: 36, r: 46, t: 12, b: 24 };
  const day = (d) => new Date(d + 'T12:00').getTime();
  const t0 = day(w[0].date), t1 = Math.max(day(w[w.length - 1].date), t0 + DAY);
  const goal = state.profile.goalLb;
  // 7-day moving average smooths out water-weight noise.
  const avg = w.map((e) => {
    const t = day(e.date);
    const win = all.filter((o) => day(o.date) <= t && day(o.date) > t - 7 * DAY);
    return { date: e.date, v: win.reduce((a, o) => a + o.weight, 0) / win.length };
  });
  // Planned path from the first point in view at the plan's weekly rate.
  const rate = baseTargets().lbPerWeek;
  const planEnd = Math.max(goal, w[0].weight - rate * ((t1 - t0) / (7 * DAY)));
  const ys = [...w.map((e) => e.weight), planEnd];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (goal >= lo - 4) lo = Math.min(lo, goal);
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const step = hi - lo > 12 ? 5 : hi - lo > 5 ? 2 : 1;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = (d) => pad.l + ((day(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const xt = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = []; for (let v = lo; v <= hi; v += step) ticks.push(v);
  const fmt = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const mid = w[Math.floor(w.length / 2)].date;
  const last = avg[avg.length - 1];
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

  svg.innerHTML = `
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${pad.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}
    ${goal >= lo && goal <= hi ? `<line class="goal" x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}"/><text class="lbl" x="${W - pad.r + 4}" y="${y(goal) + 3.5}">Goal ${goal}</text>` : ''}
    <line class="plan" x1="${xt(t0)}" y1="${y(w[0].weight)}" x2="${xt(t1)}" y2="${y(planEnd)}"/>
    <path class="raw-line" d="${path(w.map((e) => [x(e.date), y(e.weight)]))}"/>
    ${w.map((e) => `<circle class="raw" r="3" cx="${x(e.date)}" cy="${y(e.weight)}"/>`).join('')}
    <path class="trend" d="${path(avg.map((a) => [x(a.date), y(a.v)]))}"/>
    ${allScans().filter((sc) => sc.date >= w[0].date && sc.date <= w[w.length - 1].date).map((sc) => `<g class="dexa-mark"><line x1="${x(sc.date)}" x2="${x(sc.date)}" y1="${pad.t}" y2="${H - pad.b}"/><text x="${x(sc.date)}" y="${pad.t + 8}" text-anchor="middle">DEXA</text></g>`).join('')}
    <circle class="trend-end" r="4.5" cx="${x(last.date)}" cy="${y(last.v)}"/>
    <text class="lbl strong" x="${W - pad.r + 4}" y="${y(last.v) + (Math.abs(y(last.v) - y(goal)) < 12 ? -8 : 3.5)}">${last.v.toFixed(1)}</text>
    <text class="tick" x="${pad.l}" y="${H - 6}">${fmt(w[0].date)}</text>
    ${w.length > 6 ? `<text class="tick" x="${x(mid)}" y="${H - 6}" text-anchor="middle">${fmt(mid)}</text>` : ''}
    <text class="tick" x="${W - pad.r}" y="${H - 6}" text-anchor="end">${fmt(w[w.length - 1].date)}</text>
    <line class="cross" id="cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/>`;

  // Hover / tap: nearest day's weigh-in and average.
  const tip = $('#chartTip');
  const hit = svg.querySelector('.hit');
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    w.forEach((e, i) => { if (Math.abs(x(e.date) - px) < Math.abs(x(w[best].date) - px)) best = i; });
    const e = w[best];
    const cx = x(e.date);
    const cross = svg.querySelector('#cross');
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${fmt(e.date)}</b><span><i class="key key-raw"></i>${e.weight.toFixed(1)} lb</span><span><i class="key key-avg"></i>${avg[best].v.toFixed(1)} avg</span>`;
    tip.hidden = false;
    const left = (cx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left - 60, 0), r.width - 124)}px`;
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; svg.querySelector('#cross').setAttribute('visibility', 'hidden'); });
}

function renderWeighStatus() {
  const today = isoDate();
  const t = state.weights.find((x) => x.date === today);
  const prev = [...state.weights].reverse().find((x) => x.date < today);
  $('#weighStatus').innerHTML = t
    ? `✓ <b>${t.weight.toFixed(1)} lb</b> today${prev ? ` · ${t.weight <= prev.weight ? '−' : '+'}${Math.abs(t.weight - prev.weight).toFixed(1)} since ${fmtShort(prev.date)}` : ''}`
    : `Not logged yet today${prev ? ` · last ${prev.weight.toFixed(1)} lb on ${fmtShort(prev.date)}` : ''}`;
  // Once today's weight is in, the card folds to one line; Change opens it again.
  if (t) $('#weighStatus').innerHTML += ' <button type="button" class="linkish small" data-weighedit>Change</button>';
  // A word of encouragement for checking in (inline, never a pop-up).
  if (t && !sync.readOnly()) $('#weighStatus').innerHTML += `<div class="cheer">${cheerFor({ strong: false }, today, 'weigh')}</div>`;
  $('#weighForm').classList.toggle('done', !!t);
  $('#weighForm').classList.remove('editing');
}
const fmtShort = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

$('#weighForm').addEventListener('click', (e) => {
  if (!e.target.closest('[data-weighedit]')) return;
  $('#weighForm').classList.add('editing');
  $('#weighValue').focus();
});
$('#weighForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = $('#weighDate').value;
  const weight = parseFloat($('#weighValue').value);
  if (!date || !weight) return;
  state.weights = state.weights.filter((x) => x.date !== date).concat({ date, weight })
    .sort((a, b) => a.date.localeCompare(b.date));
  store.set('weights', state.weights);
  $('#weighValue').value = '';
  renderAll();
});

$('#weighList').addEventListener('click', (e) => {
  const date = e.target.closest('[data-del]')?.dataset.del;
  if (!date) return;
  state.weights = state.weights.filter((x) => x.date !== date);
  store.set('weights', state.weights);
  renderAll();
});

// ---------- ＋ NEW FOOD (your own macros) ----------
let newFoodFor = null; // {meal, slot} for a swap menu, {meal, add: true} or {meal, ci} on your own meal
let mfCat = '';
function mfRender() {
  const p = $('#mfP').value, c = $('#mfC').value, f = $('#mfF').value;
  const guess = guessCategory(p, c, f);
  const cat = mfCat || guess;
  $('#mfCats').innerHTML = Object.entries(MY_CATS).map(([k, v]) => `<button type="button" class="${k === cat ? 'on' : ''}" data-mfcat="${k}">${esc(v.replace(' (protein, carbs & fat)', ''))}</button>`).join('');
  const kcal = (+p || 0) * 4 + (+c || 0) * 4 + (+f || 0) * 9;
  $('#mfKcal').placeholder = kcal ? `${Math.round(kcal)} (from macros)` : 'from macros';
  $('#mfHint').textContent = cat === 'mixed' ? 'Mixed foods (like breaded tenders) show up with the proteins and in “+ Add a food”.'
    : `Shows up as a ${MY_CATS[cat].toLowerCase()} choice in the meal lists and in “+ Add a food”.`;
  const mine = profileStore(ownerId()).get('myFoods', {});
  const all = Object.entries(FOODS).filter(([, x]) => x.mine && !x.hidden);
  $('#mfList').innerHTML = all.length ? all.map(([id, x]) => `<li><span>${esc(x.name)} <small class="muted">${MY_CATS[x.cat] ? MY_CATS[x.cat].split(' ')[0] : ''} · 1 ${esc(x.unit.label)}: ${Math.round(x.p * x.unit.grams / 100)}P ${Math.round(x.c * x.unit.grams / 100)}C ${Math.round(x.f * x.unit.grams / 100)}F</small></span>${mine[id] ? `<button type="button" class="x" data-mfdel="${id}" aria-label="Delete ${esc(x.name)}">✕</button>` : ''}</li>`).join('') : '<li class="muted">None yet.</li>';
}
function openNewFood(ctx) {
  newFoodFor = ctx; mfCat = '';
  $('#myFoodForm').reset();
  mfRender();
  $('#myFoodDialog').showModal();
  $('#mfName').focus();
}
$('#myFoodForm').addEventListener('input', (e) => { if (['mfP', 'mfC', 'mfF'].includes(e.target.id)) mfRender(); });
$('#myFoodForm').addEventListener('click', (e) => {
  const cat = e.target.closest('[data-mfcat]');
  if (cat) { mfCat = cat.dataset.mfcat; mfRender(); return; }
  const del = e.target.closest('[data-mfdel]');
  if (del) {
    const s2 = profileStore(ownerId());
    const mine = s2.get('myFoods', {});
    if (!confirm(`Delete “${mine[del.dataset.mfdel]?.name}” from your foods? Meals that use it keep their numbers until you change them.`)) return;
    mine[del.dataset.mfdel] = { ...mine[del.dataset.mfdel], deleted: true };
    s2.set('myFoods', mine);
    registerMyFoods(); mfRender(); renderToday();
  }
});
$('#mfCancel').onclick = () => $('#myFoodDialog').close();
$('#myFoodForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const entry = { name: $('#mfName').value.trim(), serving: $('#mfServing').value.trim() || 'serving', grams: $('#mfGrams').value, p: $('#mfP').value, c: $('#mfC').value, f: $('#mfF').value, kcal: $('#mfKcal').value };
  if (!entry.name) return;
  entry.cat = mfCat || guessCategory(entry.p, entry.c, entry.f);
  for (const k of ['grams', 'p', 'c', 'f', 'kcal']) entry[k] = entry[k] === '' ? '' : +entry[k];
  const id = `my_${Date.now().toString(36)}`;
  const s2 = profileStore(ownerId());
  s2.set('myFoods', { ...s2.get('myFoods', {}), [id]: { ...entry, at: Date.now() } });
  registerMyFoods();
  $('#myFoodDialog').close();
  const ctx = newFoodFor;
  newFoodFor = null;
  if (ctx?.meal) {
    const grams = FOODS[id].unit.grams;
    if (ctx.slot) {
      const plan = todayPlan()[ctx.meal];
      const fits = plan.portions?.find((x) => x.slot === ctx.slot)?.options?.includes(id);
      if (fits) editMeal(ctx.meal, (c) => { if (ctx.meal === 'breakfast') c.template = plan.template; c.picks = { ...c.picks, [ctx.slot]: id }; if (c.grams) delete c.grams[ctx.slot]; });
      else addToMeal(ctx.meal, id, grams);
    } else if (ctx.ci != null) editCustom(ctx.meal, (c) => { c.items[ctx.ci].food = id; });
    else editCustom(ctx.meal, (c) => c.items.push({ food: id, grams }));
    resnap(ctx.meal);
  }
  renderToday();
});
// "＋ New food…" in any food menu opens the form instead of picking.
$('#meals').addEventListener('change', (e) => {
  if (e.target.value !== '__new') return;
  e.stopPropagation();
  const meal = e.target.closest('.meal')?.dataset.meal;
  const ds = e.target.dataset;
  const ctx = ds.pick ? { meal, slot: ds.pick } : ds.cfood != null ? { meal, ci: +ds.cfood } : { meal, add: true };
  renderToday(); // puts the menu back on what it was
  openNewFood(ctx);
}, true);

// ---------- GROCERIES ----------
function renderGroceries() {
  const totals = groceryList(baseTargets(), new Date(), 7, state.prefs);
  const byStore = {};
  for (const [food, grams] of Object.entries(totals)) {
    const s = STORES[food];
    if (!s) continue;
    (byStore[s.store] ||= []).push({ food, grams, s });
  }
  const custom = store.get('customGrocery', []);
  if (custom.length) byStore['Scanned items'] = custom.map((c) => ({ custom: c }));

  $('#groceryList').innerHTML = ['Costco', 'Sprouts', 'Safeway', 'My foods', 'Scanned items'].filter((k) => byStore[k]).map((name) => `
    <div class="store">
      <h3>${name}</h3>
      ${byStore[name].map((it) => {
        const key = it.custom ? `c:${it.custom.code}` : it.food;
        const done = state.checked[key];
        if (it.custom) {
          return `<label class="gitem ${done ? 'done' : ''}"><input type="checkbox" data-key="${esc(key)}" ${done ? 'checked' : ''}>
            <span class="gtext">${esc(it.custom.name)}<small>${esc(it.custom.brand)}</small></span>
            <button class="x" data-rm="${esc(it.custom.code)}" aria-label="Remove">✕</button></label>`;
        }
        return `<label class="gitem ${done ? 'done' : ''}"><input type="checkbox" data-key="${key}" ${done ? 'checked' : ''}>
          <span class="gtext">${esc(FOODS[it.food].name.replace(/ \((raw|cooked|dry)\)/, ''))}<small>${esc(it.s.tip)}</small></span>
          <span class="gqty">${qty(it.food, it.grams)}</span></label>`;
      }).join('')}
    </div>`).join('');
}

function qty(food, grams) {
  const s = STORES[food];
  if (s.packLabel === 'lb') return `${(Math.ceil(grams / 453.6 * 4) / 4).toFixed(2).replace(/\.?0+$/, '')} lb`;
  if (food === 'egg') return `${Math.ceil(grams / 50)} eggs`;
  if (food === 'avocado') return `${Math.ceil(grams / 136)} avocado${grams > 136 ? 's' : ''}`;
  if (food === 'rice') return `${(Math.ceil(grams / 2.8 / 453.6 * 4) / 4).toFixed(2).replace(/\.?0+$/, '')} lb dry`;
  const packs = grams / s.packGrams;
  return packs <= 1 ? `1 × ${s.packLabel}` : `${Math.ceil(packs)} × ${s.packLabel}`;
}

$('#groceryList').addEventListener('change', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  state.checked[key] = e.target.checked;
  store.set('checked', state.checked);
  e.target.closest('.gitem').classList.toggle('done', e.target.checked);
});
$('#groceryList').addEventListener('click', (e) => {
  const code = e.target.closest('[data-rm]')?.dataset.rm;
  if (!code) return;
  e.preventDefault();
  store.set('customGrocery', store.get('customGrocery', []).filter((c) => c.code !== code));
  renderGroceries();
});
$('#clearChecks').onclick = () => { state.checked = {}; store.set('checked', {}); renderGroceries(); };

// ---------- SCAN ----------
let scanner = null;

async function loadScannerLib() {
  if (window.Html5Qrcode) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the scanner. Check your connection.'));
    document.head.appendChild(s);
  });
}

$('#startScan').onclick = async () => {
  try {
    await loadScannerLib();
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode('reader', {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 320), height: Math.min(h * 0.45, 160) }) },
      async (code) => { await stopScan(); lookup(code); },
      () => {},
    );
    $('#startScan').hidden = true;
    $('#stopScan').hidden = false;
  } catch (err) {
    showScanError(err.message || 'Camera unavailable. Allow camera access, or type the barcode below.');
    await stopScan();
  }
};

async function stopScan() {
  if (scanner) {
    try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch { /* already stopped */ }
    scanner = null;
  }
  $('#startScan').hidden = false;
  $('#stopScan').hidden = true;
}
$('#stopScan').onclick = stopScan;

$('#manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#manualCode').value.replace(/\D/g, '');
  if (code) lookup(code);
});

function showScanError(msg) {
  $('#scanResult').innerHTML = `<div class="card"><p class="tone-warn">${esc(msg)}</p></div>`;
}

async function fetchProduct(code) {
  const fields = 'product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`);
  if (!res.ok && res.status !== 404) throw new Error('Lookup failed. Try again in a moment.');
  const data = await res.json();
  return data.status === 1 ? data.product : null;
}

async function lookup(code) {
  $('#scanResult').innerHTML = `<div class="card muted">Looking up ${esc(code)}…</div>`;
  try {
    // UPC-A (12 digits) is often stored as EAN-13 with a leading 0, and vice versa.
    let product = await fetchProduct(code);
    if (!product && code.length === 12) product = await fetchProduct('0' + code);
    if (!product && code.length === 13 && code.startsWith('0')) product = await fetchProduct(code.slice(1));
    if (!product) {
      showScanError(`No nutrition info found for ${code}. Many store-made items (bakery, meat counter) don't have one — check the label.`);
      return;
    }
    renderProduct(code, product);
  } catch (err) {
    showScanError(err.message);
  }
}

function renderProduct(code, p) {
  const n = p.nutriments || {};
  const per100 = {
    kcal: Math.round(n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : 0)),
    p: +(n.proteins_100g ?? 0).toFixed(1),
    f: +(n.fat_100g ?? 0).toFixed(1),
    c: +(n.carbohydrates_100g ?? 0).toFixed(1),
  };
  const sq = parseFloat(p.serving_quantity);
  const serving = sq > 0 ? {
    kcal: Math.round(per100.kcal * sq / 100),
    p: Math.round(per100.p * sq / 10) / 10,
    f: Math.round(per100.f * sq / 10) / 10,
    c: Math.round(per100.c * sq / 10) / 10,
  } : null;
  const fit = fitScore(per100);
  const meals = todayPlan();
  const name = p.product_name || 'Unnamed product';

  const fmt = (m) => `${m.kcal} kcal · <span class="p">${m.p}P</span> · <span class="f">${m.f}F</span> · <span class="c">${m.c}C</span>`;
  const proteinNote = serving && serving.p > 0
    ? `One serving covers <b>${Math.round(serving.p / meals.lunch.target.p * 100)}%</b> of a lunch's protein and <b>${Math.round(serving.kcal / targets().kcal * 100)}%</b> of today's calories.`
    : '';

  $('#scanResult').innerHTML = `
    <div class="card">
      <div class="product">
        ${p.image_front_small_url ? `<img src="${esc(p.image_front_small_url)}" alt="">` : ''}
        <div>
          <h3>${esc(name)}</h3>
          <div class="muted small">${esc(p.brands || '')} · ${esc(code)}</div>
          <div class="tone-${fit.tone}" style="margin-top:6px">${fit.label}</div>
        </div>
      </div>
      <ul class="portions">
        ${serving ? `<li><span>Per serving (${esc(p.serving_size || sq + ' g')})</span><span class="amt meal-macros">${fmt(serving)}</span></li>` : ''}
        <li><span>Per 100 g</span><span class="amt meal-macros">${fmt(per100)}</span></li>
      </ul>
      ${proteinNote ? `<p class="small">${proteinNote}</p>` : ''}
      <div class="add-to-meal">
        <label class="small">How much
          <div class="row" style="margin-top:4px">
            <input id="scanAmount" type="number" inputmode="decimal" step="any" min="0" value="${serving ? 1 : 100}">
            <select id="scanUnit">${serving ? `<option value="${sq}">serving${p.serving_size ? ` (${esc(p.serving_size)})` : ''}</option>` : ''}<option value="1">g</option></select>
          </div>
        </label>
        <div class="small" style="margin-top:8px">Add to</div>
        <div class="row" style="margin-top:4px">
          ${['breakfast', 'lunch', 'dinner'].map((m) => `<button type="button" class="small" data-addto="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          <button type="button" class="ghost small" data-addto="snack">Snack</button>
        </div>
        <p class="small" id="addToStatus"></p>
      </div>
      <div class="row">
        <button id="addGrocery" class="ghost">+ Add to grocery list</button>
      </div>
    </div>`;

  $('#scanResult').querySelectorAll('[data-addto]').forEach((b) => b.onclick = () => {
    const grams = Math.round((+$('#scanAmount').value || 0) * +$('#scanUnit').value);
    if (!grams) { $('#addToStatus').textContent = 'Enter how much you had.'; return; }
    const meal = b.dataset.addto;
    if (meal === 'snack') {
      const m = { kcal: Math.round(per100.kcal * grams / 100), p: Math.round(per100.p * grams / 100), f: Math.round(per100.f * grams / 100), c: Math.round(per100.c * grams / 100) };
      todaysLog().extras.push({ title: `${name} (${grams} g)`, ...m });
      saveLog();
    } else {
      // Save the product as a food so it can sit in a meal (and be picked again later).
      const id = `sc${code}`;
      const foods = { ...store.get('scannedFoods', {}), [id]: { name: name.slice(0, 60), ...per100, ...(sq > 0 ? { unit: { label: 'serving', grams: sq } } : {}), range: [0, Math.max(500, Math.ceil((sq || 100) * 4)), 1], scanned: true } };
      store.set('scannedFoods', foods);
      addScannedFoods(foods);
      state.viewDate = null; // scanned food goes into today's meal
      addToMeal(meal, id, grams);
    }
    renderToday();
    $('#addToStatus').innerHTML = `<span class="tone-good">✓ Added ${grams} g to ${meal === 'snack' ? 'snacks' : meal}.</span> <button type="button" class="linkish" id="scanSeeToday">See Today</button>`;
    $('#scanSeeToday').onclick = () => document.querySelector('[data-tab=today]').click();
  });
  $('#addGrocery').onclick = () => {
    const list = store.get('customGrocery', []).filter((c) => c.code !== code);
    list.push({ code, name, brand: p.brands || '' });
    store.set('customGrocery', list);
    $('#addGrocery').textContent = '✓ Added';
    $('#addGrocery').disabled = true;
  };
}

// ---------- PROFILE ----------
const dialog = $('#profileDialog');
const form = $('#profileForm');
form.activity.innerHTML = Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
form.pace.innerHTML = Object.entries(PACE).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

function updatePlanPreview() {
  const weight = parseFloat(form.weight.value), goalLb = parseFloat(form.goalLb.value);
  const el = $('#planPreview');
  if (!weight || !goalLb) { el.textContent = ''; return; }
  const age = +form.age.value, heightIn = +form.ft.value * 12 + +form.in.value;
  const draftProfile = { sex: form.sex.value, age, heightIn, activity: form.activity.value, pace: form.pace.value, goalLb };
  // With age and height we know the real (capped) rate; otherwise use the pace setting.
  const perWeek = age && heightIn ? dailyTargets(draftProfile, weight).lbPerWeek : Math.min(weight * PACE[form.pace.value].pct, 2);
  const proj = goalProjection(draftProfile, weight, new Date(), perWeek);
  el.textContent = proj.reached
    ? 'You\'re at or below your goal, so calories are set for maintenance.'
    : `Plan: about −${perWeek.toFixed(1)} lb/week → ${goalLb} lb in ~${proj.weeks} week${proj.weeks === 1 ? '' : 's'} (${proj.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}). Then you switch to maintenance.`;
}
form.addEventListener('input', updatePlanPreview);
form.addEventListener('change', updatePlanPreview);

// First launch starts from a ready-to-go default profile: tap Continue, or edit first.
// Amani's starting profile leaves body stats blank for her to fill in.
const DEFAULT_PROFILES = {
  sandman: { name: 'Sandman', sex: 'male', age: 43, heightIn: 71, weight: 162, goalLb: 156, activity: 'tracked', pace: 'steady' },
  amani: { name: 'Amani', sex: 'female', activity: 'tracked', pace: 'steady' },
};

function openProfile() {
  if (sync.readOnly()) {
    if (!state.profile) { openPartnerNotice(); return; }
    return openProfileView();
  }
  setProfileEditable(true);
  const first = !state.profile;
  const p = state.profile || DEFAULT_PROFILES[activeProfile().id] || { sex: 'male', activity: 'tracked', pace: 'steady' };
  $('#profileTitle').textContent = first ? `Welcome${p.name ? `, ${p.name}` : ''}` : `${state.profile.name || 'Your'} profile`;
  $('#profileIntro').textContent = first
    ? 'We filled in a starting profile. Change anything you like, or tap Continue to start.'
    : 'Used to estimate your calories. Everything stays on this device.';
  $('#profileSubmit').textContent = first ? 'Continue' : 'Save';
  $('#profileClose').hidden = first;
  $('#profileName').value = p.name ?? '';
  form.sex.value = p.sex;
  form.age.value = p.age ?? '';
  form.ft.value = p.heightIn ? Math.floor(p.heightIn / 12) : '';
  form.in.value = p.heightIn ? Math.round(p.heightIn % 12) : '';
  form.weight.value = first ? (p.weight ?? '') : currentWeight();
  form.goalLb.value = p.goalLb ?? '';
  form.activity.value = p.activity;
  form.pace.value = p.pace;
  updatePlanPreview();
  dialog.showModal();
}
// Someone else's profile: details are visible but nothing can be changed.
function setProfileEditable(on) {
  for (const el of form.elements) if (el.id !== 'profileClose') el.disabled = !on;
  $('#profileSubmit').hidden = !on;
}
function openProfileView() {
  const p = state.profile;
  $('#profileTitle').textContent = `${p.name || activeProfile().name}'s profile`;
  $('#profileIntro').textContent = `View only. ${p.name || activeProfile().name} changes these on their own phone.`;
  $('#profileName').value = p.name ?? '';
  form.sex.value = p.sex;
  form.age.value = p.age ?? '';
  form.ft.value = p.heightIn ? Math.floor(p.heightIn / 12) : '';
  form.in.value = p.heightIn ? Math.round(p.heightIn % 12) : '';
  form.weight.value = currentWeight();
  form.goalLb.value = p.goalLb ?? '';
  form.activity.value = p.activity;
  form.pace.value = p.pace;
  updatePlanPreview();
  setProfileEditable(false);
  $('#profileClose').hidden = false;
  dialog.showModal();
}
$('#profileClose').onclick = () => dialog.close();

// Partner not set up yet: explain, with a way back and a way to close.
function openPartnerNotice() {
  const name = activeProfile().name;
  const owner = PROFILES.find((p) => p.id === ownerId());
  const has = !!state.profile;
  $('#partnerTitle').textContent = has ? `Linked with ${name}` : `${name}'s day isn't on this phone yet`;
  $('#partnerText').textContent = has
    ? `Both phones should show the same code below. If ${name} can't see your day, enter the code from ${name}'s phone here (or yours on ${name}'s phone).`
    : `${name} sets up and edits ${name}'s profile on ${name}'s own phone. Once your phones are linked, ${name}'s day shows up here to view, and updates every few minutes.`;
  $('#partnerBack').hidden = has;
  $('#partnerBack').textContent = `Back to ${owner?.name || 'my profile'}`;
  renderLinkBox(name);
  $('#partnerDialog').showModal();
}

// Linking: show this phone's household code, or take the other phone's.
function renderLinkBox(name) {
  $('#partnerName2').textContent = name;
  $('#myCode').textContent = sync.settings()?.code || '—';
  const seen = global.get(`seen.${activeProfile().id}`, 0);
  const pushed = global.get('pushedAt', 0);
  $('#joinStatus').textContent = `Last update from ${name}: ${seen ? ago(seen) : 'none yet'} · this phone last uploaded: ${pushed ? ago(pushed) : 'not yet'}.`;
}
$('#sendCode').onclick = async () => {
  const code = sync.settings()?.code;
  if (!code) return;
  const url = `${location.origin}${location.pathname}#link=${encodeURIComponent(code)}`;
  const text = `Tap to link our phones in OurPawmily (open it in the browser you use for OurPawmily): ${url}\nOr enter this code under "Code from my phone": ${code}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(code); $('#joinStatus').textContent = 'Code copied.'; }
  } catch { /* share sheet closed */ }
};
$('#joinBtn').onclick = async () => {
  $('#joinStatus').textContent = 'Linking…';
  try {
    const got = await sync.join($('#joinCode').value);
    $('#joinStatus').textContent = got ? 'Linked! Loading…' : `Linked ✓ This phone now uses ${sync.settings().code}, the same code as the other phone.`;
    $('#myCode').textContent = sync.settings().code;
    if (got) setTimeout(() => location.reload(), 600);
  } catch (err) {
    $('#joinStatus').textContent = err.message;
  }
};
$('#partnerBack').onclick = () => { setActiveProfile(ownerId()); location.reload(); };
$('#partnerClose').onclick = () => $('#partnerDialog').close();

// First launch: whose phone is this?
function openOwnerPicker() {
  $('#ownerChoices').innerHTML = PROFILES.map((p) => `<button type="button" class="owner-btn" data-owner="${p.id}">${esc(p.name)}</button>`).join('');
  $('#ownerChoices').onclick = (e) => {
    const id = e.target.closest('[data-owner]')?.dataset.owner;
    if (!id) return;
    setOwner(id);
    location.reload();
  };
  $('#ownerDialog').showModal();
}
$('#ownerDialog').addEventListener('cancel', (e) => e.preventDefault());

$('#openProfile').onclick = openProfile;
dialog.addEventListener('cancel', (e) => { if (!state.profile && !sync.readOnly()) e.preventDefault(); });

form.addEventListener('submit', () => {
  const weight = parseFloat(form.weight.value);
  const isNew = !state.profile;
  state.profile = {
    name: $('#profileName').value.trim(),
    createdOn: state.profile?.createdOn || isoDate(),
    sex: form.sex.value,
    age: +form.age.value,
    heightIn: +form.ft.value * 12 + +form.in.value,
    weight,
    goalLb: parseFloat(form.goalLb.value),
    activity: form.activity.value,
    pace: form.pace.value,
  };
  store.set('profile', state.profile);
  // Changing the weight here counts as today's weigh-in.
  if (isNew || Math.abs(weight - currentWeight()) > 0.05) {
    const date = isoDate();
    state.weights = state.weights.filter((x) => x.date !== date).concat({ date, weight })
      .sort((a, b) => a.date.localeCompare(b.date));
    store.set('weights', state.weights);
  }
  renderAll();
});

// ---------- tabs & boot ----------
// Five tabs: Home, Dogs, Food, Train, Us. Food has four pages (Meals, Weight, Groceries,
// Scan) switched from the bar at its top; the Food tab stays lit on all four.
const FOOD_PAGES = [['today', '🍽 Meals'], ['weight', '⚖︎ Weight'], ['groceries', '🛒 Groceries'], ['scan', '▦ Scan']];
let currentTab = 'home';
function showTab(name) {
  currentTab = name;
  document.body.dataset.tab = name; // Dogs hides the calorie bar
  const lit = FOOD_PAGES.some(([k]) => k === name) ? 'today' : name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === lit));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  document.querySelectorAll('[data-subnav]').forEach((el) => {
    el.innerHTML = FOOD_PAGES.map(([k, label]) => `<button type="button" data-sub="${k}" class="${k === name ? 'on' : ''}">${label}</button>`).join('');
  });
  if (name !== 'scan') stopScan();
  if (name === 'home') { renderHome(); renderBrief(); }
  if (name === 'lift') { renderLift(); if (state.profile) renderTraining(targets()); renderBrief(); renderClimb(); renderProgress(); }
  if (name === 'brief') renderBrief();
  if (name === 'calendar') { renderRhythm(); renderCal(); }
  if (name === 'notes') {
    openUs();
    renderRhythm();
    renderHousehold();
    if (sync.enabled()) sync.pull().then((changed) => changed && renderNotes()).catch(() => {});
  }
  if (name === 'today' && editingMeal) { editingMeal = null; if (state.profile) renderToday(); } // the Food tab opens on the daily plan
  if (name === 'weight' && state.profile) renderStats();
  if (name === 'privacy') renderHousehold();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((btn) => { btn.onclick = () => showTab(btn.dataset.tab); });
document.querySelector('main').addEventListener('click', (e) => {
  if (e.target.closest('[data-opencheckin]')) { openCheckin(); return; }
  if (e.target.closest('[data-ckremind]')) { checkinReminder(); return; }
  const b = e.target.closest('[data-sub], [data-goto]');
  if (b) showTab(b.dataset.sub || b.dataset.goto);
});

// ---------- HOME: one glance at what needs doing today ----------
// The weekly check-in, always in view: due / overdue stands out; otherwise when the next one is.
function homeCheckin() {
  const start = programStartDay();
  if (!start || !state.profile) return '';
  const today = isoDate();
  const w = checkinWindow(start, today);
  const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);
  if (checkinDue() && w) {
    const late = daysBetween(w.due, today);
    return `<button type="button" class="card home-card home-checkin ${late ? 'late' : ''}" data-opencheckin><span class="home-ico">📋</span><span class="home-main"><b>Week ${w.week} check-in ${late ? `is ${late} day${late === 1 ? '' : 's'} overdue` : 'is today'}</b><small>See how the week went and adjust your macros — 2 minutes.</small></span><span class="home-go">›</span></button>`;
  }
  const next = w ? w.next : (() => { const d = new Date(`${start}T12:00:00`); d.setDate(d.getDate() + 7); return isoDate(d); })();
  const n = daysBetween(today, next);
  return `<div class="card home-next-ck"><span>📋 Next check-in <b>${n === 1 ? 'tomorrow' : fmt(next)}</b>${n > 1 ? ` · in ${n} days` : ''}</span><button type="button" class="linkish small" data-ckremind>🔔 Add to calendar</button></div>`;
}
function updateFoodBadge() {
  const b = $('#foodBadge');
  if (b) { const due = !!state.profile && checkinDue(); b.hidden = !due; b.textContent = '1'; }
}
function renderHome() {
  if (!$('#homeHello')) return;
  const name = firstName();
  $('#homeHello').innerHTML = `<div class="greeting">${name ? `${greetingWord()}, ${esc(name)}` : greetingWord()}</div>
    <div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    ${(() => { const data = personData(ownerId() || activeProfile().id); const d = healthDay(data, isoDate()); const n = strongStreak(data, isoDate()); return d.strong || n ? `<div class="small cheer-home">💪 ${d.strong ? 'Checked in today' : 'Weigh in and log your meals to keep it going'}${n > 1 ? ` · ${n}-day streak` : ''}</div>` : ''; })()}`;
  // Dogs, calendar and notes don't need a diet profile.
  $('#homeDogs').innerHTML = homeDogs();
  $('#homeCal').innerHTML = homeCal();
  updateFoodBadge();
  $('#homeUs').innerHTML = homeUs();
  $('#homeGym').innerHTML = homeGym();
  renderRhythm();
  renderHousehold();
  if (!state.profile) { $('#homeFood').innerHTML = ''; $('#homeTrain').innerHTML = ''; return; }
  // Food: the next meal not yet logged, and how many are done.
  const plan = todayPlan(targets());
  const order = mealOrder(plan);
  const log = todaysLog();
  const done = order.filter((m) => log.meals[m]).length;
  const next = order.find((m) => !log.meals[m]);
  const label = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
  $('#homeFood').innerHTML = homeCheckin() + `<button type="button" class="card home-card" data-goto="today">
      <span class="home-ico">🍽</span>
      <span class="home-main"><b>${next ? `Next: ${label[next]}` : 'All meals logged 🎉'}</b>
        <small class="muted">${next ? `${esc(plan[next].title)} · ${plan[next].totals.kcal} kcal` : 'Nice work today.'}</small>
        <small class="muted">${done} of ${order.length} meals logged</small></span>
      <span class="home-go">›</span></button>`;
  $('#homeUs').innerHTML = homeUs();
  $('#homeCal').innerHTML = homeCal();
  const day = todaysTraining();
  $('#homeTrain').innerHTML = `<button type="button" class="card home-card" data-goto="lift">
      <span class="home-ico">🏋︎</span>
      <span class="home-main"><b>${esc(day.label)}</b><small class="muted">${day.sessions.length ? `${day.sessions.length} activit${day.sessions.length === 1 ? 'y' : 'ies'} today` : 'Log a lift or add an activity'}</small></span>
      <span class="home-go">›</span></button>`;
}

function renderAll() {
  if (!state.profile) return;
  renderToday();
  renderTraining(targets());
  renderWeight();
  renderCheckinHistory();
  renderStats();
  renderGroceries();
}

// ---------- STATS & EXPORT ----------
function renderStats() {
  const n = +$('#statsRange').value;
  const s = summary(exportProfile(activeProfile().id), isoDate(), n);
  const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const tile = (big, label) => `<div class="stat"><b>${big}</b><span>${label}</span></div>`;
  $('#statsGrid').innerHTML = [
    tile(s.mealsLogged, 'meals logged'),
    tile(pctOf(s.mealsOnTarget, s.mealsJudged), `meals on target (${s.mealsOnTarget}/${s.mealsJudged})`),
    tile(`${s.deficitDays}/${s.daysLogged}`, 'days on track (deficit, or steady at goal)'),
    tile(`${s.proteinDays}/${s.daysLogged}`, 'days protein goal hit'),
    tile(s.liftSessions, 'lifting workouts finished'),
    tile(`${s.activities}`, `activities · ${Math.round(s.activityMinutes / 60 * 10) / 10} h`),
  ].join('');
}
$('#statsRange').onchange = renderStats;

const fileSlug = () => `ourpawmily-${(state.profile?.name || activeProfile().name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDate()}`;

// Share sheet on phones (Save to Files, AirDrop, email…), plain download elsewhere.
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return 'Shared.'; } catch (err) { if (err.name === 'AbortError') return 'Cancelled.'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return `Saved ${filename}.`;
}

$('#exportWeek').onclick = async () => { $('#exportStatus').textContent = await exportWeek(); };
$('#copyWeek').onclick = async () => { $('#exportStatus').textContent = await copyWeekForClaude(); };
$('#exportData').onclick = async () => {
  const status = $('#exportStatus');
  status.textContent = 'Preparing…';
  try {
    const tables = buildTables(exportProfile(activeProfile().id));
    const files = Object.entries(tables).filter(([, rows]) => rows.length).map(([name, rows]) => ({ name: `${name}.csv`, text: toCsv(rows) }));
    files.push({ name: 'README.txt', text: [
      'OurPawmily export — open the CSV files in Excel, Numbers or Google Sheets.',
      'meals.csv: every logged meal with its macros, its target and on_target (yes/no).',
      'days.csv: daily calories eaten vs burned, deficit, protein, coins and weight.',
      'activities.csv: activities you added plus imported WHOOP/Garmin workouts.',
      'lifting_sessions.csv / lifting_sets.csv: finished workouts and every set (weight x reps).',
      'weigh_ins.csv, checkins.csv: weigh-ins and weekly check-ins.',
      'dexa_scans.csv: DEXA scans (weight, body fat %, fat, lean and bone mass, visceral fat).',
      'climbing.csv: climbing sessions — attempts and sends per grade (bouldering, top rope, lead).',
    ].join('\n') });
    status.textContent = await deliver(new Blob([makeZip(files)], { type: 'application/zip' }), `${fileSlug()}.zip`);
  } catch (err) {
    status.textContent = err.message;
  }
};

$('#exportBackup').onclick = async () => {
  const blob = new Blob([JSON.stringify({ app: 'lean-plate', version: 1, profile: activeProfile().id, savedAt: new Date().toISOString(), data: exportProfile(activeProfile().id) }, null, 1)], { type: 'application/json' });
  $('#exportStatus').textContent = await deliver(blob, `${fileSlug()}-backup.json`);
};

$('#restoreBackup').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'lean-plate' || !backup.data?.profile) throw new Error('That file isn\'t an OurPawmily backup.');
    if (backup.profile !== ownerId()) throw new Error(`That backup belongs to ${PROFILES.find((p) => p.id === backup.profile)?.name || 'someone else'}. You can only restore your own profile on your phone.`);
    if (!confirm(`Replace everything on this phone for ${state.profile?.name || 'you'} with the backup from ${backup.savedAt.slice(0, 10)}?`)) return;
    importProfile(ownerId(), backup.data);
    location.reload();
  } catch (err) {
    $('#exportStatus').textContent = err.message;
  }
};

// ---------- PEOPLE: switch between Sandman and Amani ----------
function renderWho() {
  const active = activeProfile().id;
  const me = ownerId();
  $('#who').innerHTML = PROFILES.map((p) => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(`lp.p.${p.id}.profile`)); } catch { return null; } })();
    return `<label class="who-opt ${p.id === active ? 'on' : ''}">
      <input type="radio" name="who" value="${p.id}" ${p.id === active ? 'checked' : ''}>
      <span>${esc(saved?.name || p.name)}${me && p.id !== me ? ' <small>view</small>' : ''}</span></label>`;
  }).join('');
  $('#who').onchange = (e) => {
    if (e.target.name !== 'who') return;
    setActiveProfile(e.target.value);
    location.reload();
  };
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

// On a synced phone your partner's profile is view-only; their phone is the source.
function renderViewOnly() {
  const ro = sync.readOnly();
  // Notes are always yours to write, even while viewing the other person's day.
  document.querySelectorAll('main > .tab:not(#tab-notes):not(#tab-brief)').forEach((t) => { t.inert = ro; });
  document.body.classList.toggle('readonly', ro);
  $('#restoreLabel').hidden = ro;
  const name = state.profile?.name || activeProfile().name;
  $('#viewBanner').hidden = !ro;
  if (ro) {
    const seen = global.get(`seen.${activeProfile().id}`, 0);
    $('#viewBanner').innerHTML = seen
      ? `Viewing <b>${esc(name)}</b>'s day · updated ${ago(seen)} · <button class="linkish" id="refreshPartner">Refresh</button> · <button class="linkish" id="linkPartner">Link</button>`
      : sync.enabled()
        ? `<b>${esc(name)}</b>'s day isn't here yet. <button class="linkish" id="linkPartner">Link phones</button> · <button class="linkish" id="refreshPartner">Check now</button>`
        : `<b>${esc(name)}</b>'s profile isn't set up on this phone. ${esc(name)} sets it up on their own phone; link your phones to see each other's day.`;
    if ($('#linkPartner')) $('#linkPartner').onclick = () => openPartnerNotice();
    if ($('#refreshPartner')) $('#refreshPartner').onclick = async () => {
      $('#refreshPartner').textContent = 'Checking…';
      try { if (await sync.pull()) location.reload(); else $('#refreshPartner').textContent = 'Up to date'; } catch (err) { $('#refreshPartner').textContent = err.message; }
    };
  }
}

// ---------- HOUSEHOLD SHARING (in Devices) ----------
function renderSharing() {
  const s = sync.settings() || {};
  $('#shareUrl').value = s.url || devices.get().server || DEFAULT_CONNECTOR;
  $('#shareCode').value = s.code || '';
  $('#shareMe').textContent = PROFILES.find((p) => p.id === ownerId())?.name || '—';
  $('#shareStatus').textContent = sync.enabled()
    ? `Sharing is on. Last upload ${global.get('pushedAt', 0) ? ago(global.get('pushedAt', 0)) : 'not yet'}.`
    : 'Off. Both profiles still work on this phone.';
}
$('#shareNewCode').onclick = () => { $('#shareCode').value = newHouseholdCode(); };
$('#shareSave').onclick = async () => {
  const url = $('#shareUrl').value.trim().replace(/\/+$/, '');
  const code = $('#shareCode').value.trim();
  if (!/^https:\/\//.test(url) || code.length < 12) {
    $('#shareStatus').textContent = 'Add your connector URL and a household code (tap New code on the first phone, then type the same code on the other).';
    return;
  }
  sync.save({ url, code });
  global.set('shareOff', false);
  $('#shareStatus').textContent = 'Syncing…';
  try {
    await sync.push();
    await sync.pull();
    location.reload();
  } catch (err) {
    $('#shareStatus').textContent = `Couldn't reach the connector: ${err.message}`;
  }
};
$('#shareOff').onclick = () => { sync.save(null); global.set('shareOff', true); location.reload(); };

initLift();
initNotes();
initBrief();
initCal(document.querySelector('main'));
initHousehold();
// Folding cards (Recent workouts, Exercise library): closed by default, remembered per phone.
document.querySelectorAll('details[data-fold]').forEach((d) => {
  d.open = !!global.get(`fold.${d.dataset.fold}`, false);
  d.addEventListener('toggle', () => global.set(`fold.${d.dataset.fold}`, d.open));
});
window.addEventListener('lp:opendevices', () => openDevices());
initRhythm(document.querySelector('main'));
initDexa(() => state.weights, () => { if (state.profile) drawChart(); });
// 🧗 A finished climbing session counts as that day's climbing activity (for calories).
initClimb((c) => {
  const minutes = +c.minutes || 60;
  const est = estimateActivity('climbing', minutes, 'moderate', { weightKg: currentWeight() / 2.20462, stats: sportStats(state.history) });
  state.activities = state.activities.filter((a) => a.id !== `climb-${c.date}`)
    .concat({ id: `climb-${c.date}`, date: c.date, sport: 'climbing', intensity: 'moderate', minutes, type: sessionType('climbing', 'moderate'), kcal: est.kcal, climb: climbSummary(c) });
  store.set('activities', state.activities);
  if (state.profile) renderAll();
});
initProgress();
updateCalBadge();
updateNotesBadge();
// Weigh-ins said on the Lift tab ("weigh in 161.4").
window.addEventListener('lp:weighin', (e) => {
  const date = isoDate();
  state.weights = state.weights.filter((x) => x.date !== date).concat({ date, weight: +e.detail }).sort((a, b) => a.date.localeCompare(b.date));
  store.set('weights', state.weights);
  renderAll();
});
// Commands the phone couldn't parse go to Claude through the connector (needs household sharing).
window.addEventListener('lp:assistant', async (e) => {
  const s = sync.settings();
  if (!sync.enabled()) {
    setCommandFeedback(`${e.detail.message}<br><span class="muted">Turn on household sharing in Devices to let Claude handle commands like this.</span>`);
    return;
  }
  setCommandFeedback('<span class="muted">Asking Claude…</span>');
  try {
    const res = await fetch(`${s.url}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: s.code, text: e.detail.text, context: e.detail.context }),
    });
    const out = await res.json().catch(() => ({}));
    // Connector without Claude set up: just show the usual tip.
    if (res.status === 404 || res.status === 501) { setCommandFeedback(e.detail.message); return; }
    if (!res.ok) throw new Error(out.error || `Claude request failed (${res.status})`);
    if (out.actions?.length) applyAssistantActions(out.actions, out.note ? `Claude: ${out.note}` : 'via Claude');
    else setCommandFeedback(`<span class="tone-warn">${esc(out.note || 'Claude didn\'t find anything to log.')}</span>`);
  } catch (err) {
    setCommandFeedback(`<span class="tone-warn">${esc(err.message)}</span> Try “bench 3 sets of 8 at 135”.`);
  }
});
$('#dayBar').onclick = () => { document.querySelector('[data-tab=today]').click(); };
$('#weighDate').value = isoDate();
const justConnected = devices.takeRedirect();
// One-tap linking: opening the app at …#link=<code or phrase> joins that household.
// The part after # never leaves the phone, so the phrase isn't in any server log or the code.
function takeLinkFromUrl() {
  const m = location.hash.match(/^#link=(.+)$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  global.set('pendingLink', decodeURIComponent(m[1]));
  return true;
}
takeLinkFromUrl();
// Link opened while the app is already open in this tab.
window.addEventListener('hashchange', () => { if (takeLinkFromUrl()) applyPendingLink(); });
async function applyPendingLink() {
  const phrase = global.get('pendingLink', null);
  if (!phrase || !ownerId()) return;
  global.set('pendingLink', null);
  try {
    await sync.join(phrase);
    alert(`Linked ✓ This ${navigator.userAgent.includes('CriOS') ? 'Chrome' : 'browser'} now shares with the household code ${sync.settings().code}.`);
    location.reload();
  } catch (err) {
    alert(`Couldn't link: ${err.message}`);
  }
}
sync.ensure(); // household sharing is on by default
renderWho();
renderViewOnly();
if (!ownerId()) openOwnerPicker();
else if (state.profile) renderAll();
else if (sync.readOnly()) openPartnerNotice();
else openProfile();
renderHousehold(); // a changed household code asks for the new one as soon as the app opens
// Pull workouts on open (at most every 10 min) and right after connecting.
if (!sync.readOnly() && (justConnected || Date.now() - store.get('lastSync', 0) > 10 * 60000)) syncDevices();
// Household: upload my latest, then fetch my partner's; reload if I'm looking at fresh data.
applyPendingLink();
if (sync.enabled()) {
  sync.push().catch(() => {});
  sync.pull().then((changed) => { if (changed) registerMyFoods(); updateNotesBadge(); updateCalBadge(); if (changed) renderHome(); if (changed && sync.readOnly()) location.reload(); }).catch(() => {});
  const onNotes = () => document.querySelector('#tab-notes').classList.contains('active');
  const onBrief = () => document.querySelector('#tab-brief').classList.contains('active');
  const refresh = () => sync.pull().then((changed) => {
    if (changed) registerMyFoods();
    updateNotesBadge();
    updateCalBadge();
    renderFeed(); // also colours the 🐕 tab
    if (changed && currentTab === 'calendar') { renderRhythm(); renderCal(); }
    if (changed && currentTab === 'home') renderHome();
    if (onNotes() && changed) renderNotes();
    else if (onNotes()) { const l = document.querySelector('#tab-notes .sync-line'); if (l) l.outerHTML = syncLine(); }
    else if (changed && sync.readOnly()) location.reload();
  }).catch(() => {});
  setInterval(refresh, 5 * 60000);
  // While the Us tab is open, check for new notes and plans often.
  setInterval(() => { if ((onNotes() || onBrief() || currentTab === 'calendar') && document.visibilityState === 'visible') refresh(); }, 10000);
  // A home-screen app resumes without reloading: catch up when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - global.get('pulledAt', 0) > 30000) { sync.push().catch(() => {}); refresh(); }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Tells the loading safety net in index.html that the app started.
window.__leanPlateBooted = true;
document.getElementById('bootFail')?.setAttribute('hidden', '');
