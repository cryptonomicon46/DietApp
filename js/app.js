import { FOODS, STORES, FOOD_GROUPS, addScannedFoods } from './foods.js';
import {
  ACTIVITY, PACE, PHASES, dailyTargets, goalProjection, planForDay, groceryList,
  weeklyTrend, suggestAdjustment, fitScore,
  FEELINGS, CHECKIN_OPTIONS, deltaKcal, recommendCheckin, weekOverWeek,
  EAT_OUT, EAT_OUT_SIZE, EAT_OUT_ATE,
} from './plan.js';
import {
  SESSION_TYPES, SPORTS, INTENSITY, trainingDay, applyTraining, parseGarminCsv, parseWhoopCsv,
  sportStats, estimateActivity, sessionType,
} from './activity.js';
import { devices } from './devices.js';
import { RESEARCH } from './research.js';
import { initNotes, renderNotes, updateNotesBadge, openUs } from './notes.js';
import { syncLine } from './plans.js';
import { initLift, renderLift, applyAssistantActions, setCommandFeedback } from './lift.js';
import { scoreDay, tally, MILESTONES } from './rewards.js';
import { store, global, PROFILES, activeProfile, setActiveProfile, ownerId, setOwner, exportProfile, importProfile } from './storage.js';
import { sync, newHouseholdCode, DEFAULT_CONNECTOR } from './sync.js';
import { buildTables, toCsv, summary } from './analytics.js';
import { makeZip } from './zip.js';
import { programReview } from './review.js';

// ---------- storage ----------
// Each person's data is kept separately (see storage.js); `store` reads/writes the open profile.
addScannedFoods(store.get('scannedFoods', {}));

const state = {
  profile: store.get('profile', null),
  weights: store.get('weights', []),   // [{date: 'YYYY-MM-DD', weight}]
  adjust: store.get('adjust', 0),      // kcal tweak from check-ins
  custom: store.get('custom', {}),     // today's meal edits: {date, meals: {breakfast: {template, picks, grams}}}
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

// Today's meal edits (reset each day).
function todaysCustom() {
  if (state.custom.date !== isoDate()) state.custom = { date: isoDate(), meals: {} };
  return state.custom.meals;
}
function todayPlan(t = targets()) {
  return planForDay(t, new Date(), todaysCustom(), state.prefs);
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
function amountLabel(food, grams) {
  const d = FOODS[food];
  if (!grams) return { main: 'none', sub: '0 g' };
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
  return { main, sub: `${Math.round(grams)} g` };
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
function renderToday() {
  const t = targets();
  const today = isoDate();
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
  $('#meals').innerHTML = ['breakfast', 'lunch', 'dinner'].map((meal) => mealCard(meal, plan[meal])).join('')
    + extrasCard()
    + `<p class="muted small">Pick a food from any menu to swap it. Drag a slider to set that portion yourself (🔒) — the other items re-balance to keep the meal on target. Weigh oats dry; weigh meat, fish, eggs, rice and veggies cooked.</p>`;
}

function extrasCard() {
  const extras = todaysLog().extras;
  if (!extras.length) return '';
  return `<div class="card"><div class="eyebrow">Snacks & extras</div>
    <ul class="list">${extras.map((x, i) => `<li><span>${esc(x.title)}<small class="muted"> · ${x.p}P ${x.f}F ${x.c}C</small></span>
      <span>${x.kcal} kcal <button class="x" data-unextra="${i}" aria-label="Remove">✕</button></span></li>`).join('')}</ul></div>`;
}
$('#meals').addEventListener('click', (e) => {
  const i = e.target.closest('[data-unextra]')?.dataset.unextra;
  if (i == null) return;
  todaysLog().extras.splice(+i, 1);
  saveLog();
  renderToday();
});

const MEAL_TEMPLATES = { eggs: 'Switch: eggs', oatmeal: 'Switch: oatmeal' };

function mealCard(meal, m) {
  const edited = !!todaysCustom()[meal];
  return `
    <div class="card meal ${todaysLog().meals[meal] ? 'eaten' : ''}" data-meal="${meal}">
      <div class="meal-head">
        <div>
          <div class="eyebrow">${meal}</div>
          <h3 data-role="title">${esc(m.title)}</h3>
        </div>
        <div class="row" style="margin-top:0">
          ${meal === 'breakfast' ? `<select class="small-select" data-template aria-label="Breakfast type">
            ${Object.entries(MEAL_TEMPLATES).map(([k, v]) => `<option value="${k}" ${m.template === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>` : ''}
          ${m.custom ? '' : '<button class="ghost small" data-customize title="Build this meal yourself">✎ Customize</button><button class="ghost small" data-eatout title="Log a restaurant meal">🍴 Ate out</button>'}
          <button class="ghost small" data-reset ${edited ? '' : 'hidden'}>${m.custom ? 'Back to plan' : 'Reset'}</button>
        </div>
      </div>
      <div class="meal-macros" data-role="totals">${totalsLine(m)}${m.manual ? ' <small class="muted">(your numbers)</small>' : ''}</div>
      ${m.eatout ? eatOutBody(meal, m) : m.custom ? customBody(meal, m) : `<ul class="portions editable">${m.portions.map((x) => itemRow(x)).join('')}</ul>`}
      ${eatButton(meal)}
    </div>`;
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
      ${over > 100 ? `<p class="small">That's about <b>${over} kcal</b> over this meal's target. No stress: one meal doesn't make or break a week. Keep the rest of today light and protein-first.</p>` : ''}
    </div>`;
}

// ---- meals you build yourself ----
function foodOptions(selected, placeholder) {
  return (placeholder ? `<option value="">${placeholder}</option>` : '')
    + Object.entries(FOOD_GROUPS).map(([g, keys]) => `<optgroup label="${g}">${keys.map((k) =>
      `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(FOODS[k].name)}</option>`).join('')}</optgroup>`).join('');
}

function customBody(meal, m) {
  const man = todaysCustom()[meal]?.manual || {};
  return `
    <ul class="portions editable custom">
      ${m.portions.map((x, i) => {
        const a = amountLabel(x.food, x.grams);
        return `<li data-ci="${i}">
          <div class="item-top">
            <select data-cfood="${i}" aria-label="Food">${foodOptions(x.food)}</select>
            <button class="x" data-cremove="${i}" aria-label="Remove ${esc(FOODS[x.food].name)}">✕</button>
          </div>
          <div class="item-slider">
            <input type="number" class="grams" data-cgrams="${i}" min="0" max="2000" step="any" inputmode="decimal" value="${x.grams}" aria-label="Grams">
            <span class="small muted">g</span>
            <span class="amt" data-role="amt">${a.main}</span>
          </div>
        </li>`;
      }).join('')}
    </ul>
    <select data-cadd aria-label="Add a food">${foodOptions('', '+ Add a food…')}</select>
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
  card.querySelector('[data-role="totals"]').innerHTML = totalsLine(m) + (m.manual ? ' <small class="muted">(your numbers)</small>' : '');
  m.portions.forEach((x, i) => {
    const el = card.querySelector(`li[data-ci="${i}"] [data-role="amt"]`);
    if (el) el.textContent = amountLabel(x.food, x.grams).main;
  });
  const log = todaysLog();
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
  if (e.target.closest('[data-eatout]')) {
    editMeal(meal, (c) => { delete c.items; delete c.manual; c.eatout = { mode: 'estimate', dish: meal === 'breakfast' ? 'brunch' : 'plate', size: 'regular', ate: 1 }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-eoset]')) {
    const [field, value] = e.target.closest('[data-eoset]').dataset.eoset.split(':');
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, [field]: field === 'ate' ? +value : value }; });
    resnap(meal);
    renderToday();
  } else if (e.target.closest('[data-customize]')) {
    const m = todayPlan()[meal];
    editMeal(meal, (c) => {
      if (meal === 'breakfast') c.template = m.template;
      c.items = m.portions.filter((x) => x.grams > 0).map((x) => ({ food: x.food, grams: x.grams }));
    });
    renderToday();
  } else if (e.target.closest('[data-cremove]')) {
    const i = +e.target.closest('[data-cremove]').dataset.cremove;
    editCustom(meal, (c) => c.items.splice(i, 1));
    resnap(meal);
    renderToday();
  }
});

$('#meals').addEventListener('change', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.dataset.eo === 'dish') {
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, dish: e.target.value }; });
  } else if (e.target.dataset.cfood != null) {
    const i = +e.target.dataset.cfood;
    editCustom(meal, (c) => { c.items[i].food = e.target.value; });
  } else if (e.target.dataset.cadd != null) {
    const food = e.target.value;
    if (!food) return;
    editCustom(meal, (c) => c.items.push({ food, grams: FOODS[food].unit?.grams || 100 }));
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
  } else if (e.target.dataset.eomenu) {
    const k = e.target.dataset.eomenu;
    editMeal(meal, (c) => { c.eatout = { ...c.eatout, menu: { ...c.eatout.menu, [k]: e.target.value === '' ? '' : +e.target.value } }; });
  } else if (e.target.dataset.cgrams != null) {
    const i = +e.target.dataset.cgrams;
    editCustom(meal, (c) => { c.items[i].grams = Math.max(0, +e.target.value || 0); });
  } else if (e.target.dataset.manual) {
    const k = e.target.dataset.manual;
    editCustom(meal, (c) => { c.manual = { ...c.manual, [k]: e.target.value === '' ? '' : +e.target.value }; });
  } else return;
  refreshCustom(meal);
});

// Keep an already-logged meal in step with edits.
function resnap(meal) {
  const log = todaysLog();
  if (log.meals[meal]) { log.meals[meal] = { ...snapshot(todayPlan()[meal]), at: log.meals[meal].at }; saveLog(); }
}

function eatButton(meal) {
  const e = todaysLog().meals[meal];
  return e
    ? `<div class="eat-row"><span class="tone-good">✓ Eaten at ${e.at} · ${e.kcal} kcal</span><button class="ghost small" data-uneat>Undo</button></div>`
    : `<div class="eat-row"><button class="eat" data-eat>✓ I ate this</button></div>`;
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

function itemRow(x) {
  const a = amountLabel(x.food, x.grams);
  const [lo, hi, step] = x.range;
  const name = x.options.length > 1
    ? `<select data-pick="${x.slot}" aria-label="Swap ${esc(FOODS[x.food].name)}">${x.options.map((o) => `<option value="${o}" ${o === x.food ? 'selected' : ''}>${esc(FOODS[o].name)}</option>`).join('')}</select>`
    : `<span>${esc(FOODS[x.food].name)}</span>`;
  return `
    <li data-slot="${x.slot}" class="${x.locked ? 'locked' : ''}">
      <div class="item-top">${name}<span class="amt" data-role="amt">${a.main}<small>${a.sub}</small></span></div>
      <div class="item-slider">
        <input type="range" id="r-${x.slot}" data-slide="${x.slot}" min="${lo}" max="${hi}" step="${step}" value="${x.grams}" aria-label="${esc(FOODS[x.food].name)} grams">
        <button class="lock" data-unlock="${x.slot}" title="${x.locked ? 'Locked — tap to let the app size this' : 'Auto-sized'}">${x.locked ? '🔒' : 'auto'}</button>
      </div>
    </li>`;
}

// Live-update one meal card while a slider moves, without re-rendering the slider being dragged.
function refreshMeal(meal, active) {
  const m = todayPlan()[meal];
  const card = document.querySelector(`.meal[data-meal="${meal}"]`);
  // Editing a meal you already logged corrects what you ate.
  const log = todaysLog();
  if (log.meals[meal]) {
    log.meals[meal] = { ...snapshot(m), at: log.meals[meal].at };
    saveLog();
    card.querySelector('.eat-row').outerHTML = eatButton(meal);
    renderDayBar();
  }
  card.querySelector('[data-role="title"]').textContent = m.title;
  card.querySelector('[data-role="totals"]').innerHTML = totalsLine(m);
  card.querySelector('[data-reset]').hidden = !todaysCustom()[meal];
  for (const x of m.portions) {
    const li = card.querySelector(`li[data-slot="${x.slot}"]`);
    const a = amountLabel(x.food, x.grams);
    li.querySelector('[data-role="amt"]').innerHTML = `${a.main}<small>${a.sub}</small>`;
    li.classList.toggle('locked', x.locked);
    const lock = li.querySelector('.lock');
    lock.textContent = x.locked ? '🔒' : 'auto';
    const r = li.querySelector('input[type=range]');
    if (r !== active) r.value = x.grams;
  }
}

function editMeal(meal, fn) {
  const meals = todaysCustom();
  meals[meal] = meals[meal] || {};
  fn(meals[meal]);
  store.set('custom', state.custom);
}

$('#meals').addEventListener('input', (e) => {
  const slot = e.target.dataset.slide;
  if (!slot) return;
  const meal = e.target.closest('.meal').dataset.meal;
  const plan = todayPlan()[meal];
  editMeal(meal, (c) => {
    if (meal === 'breakfast') c.template = plan.template;
    c.grams = { ...c.grams, [slot]: +e.target.value };
  });
  refreshMeal(meal, e.target);
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
  const log = todaysLog();
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
    delete todaysCustom()[meal];
    store.set('custom', state.custom);
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
function checkinDue() {
  const last = state.checkins[state.checkins.length - 1]?.date || state.profile.createdOn || state.weights[0]?.date;
  if (!last) return false;
  if (store.get('checkinSnooze', null) === isoDate()) return false;
  return Date.now() - new Date(last + 'T00:00').getTime() >= 7 * DAY;
}

let draft = null; // in-progress check-in: {feeling, note, choice, custom: {p, f, c}, open}

function renderCheckin() {
  const el = $('#checkin');
  if (!draft && !checkinDue()) { el.innerHTML = ''; return; }
  draft = draft || { feeling: null, note: '', choice: null, custom: { p: 0, f: 0, c: 0 } };
  const name = firstName();
  const base = baseTargets();
  const trend = suggestAdjustment(phaseWeights(), base.lbPerWeek);
  const wow = weekOverWeek(state.weights);
  const rec = recommendCheckin(trend, draft.feeling, base.atFloor);
  const choice = draft.choice || rec.id;
  const options = [...CHECKIN_OPTIONS].sort((a, b) => (a.id === rec.id ? -1 : b.id === rec.id ? 1 : 0));
  const delta = choice === 'custom' ? draft.custom : CHECKIN_OPTIONS.find((o) => o.id === choice).delta;
  const after = { p: base.p + (delta.p || 0), f: base.f + (delta.f || 0), c: base.c + (delta.c || 0) };
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

  el.innerHTML = `
    <div class="card checkin">
      <div class="eyebrow">Weekly check-in</div>
      <h3>${name ? `Hi ${esc(name)}, how` : 'How'} did this week go?</h3>
      ${wow ? `<p class="small">7-day average: <b>${wow.before.toFixed(1)} → ${wow.now.toFixed(1)} lb</b> (${wow.change <= 0 ? '−' : '+'}${Math.abs(wow.change).toFixed(1)}). Goal pace: −${base.lbPerWeek} lb/week.</p>`
        : '<p class="small muted">Log weigh-ins most mornings and next week I can compare week over week.</p>'}
      <div class="chips" role="group" aria-label="How the week felt">
        ${Object.entries(FEELINGS).map(([k, v]) => `<button type="button" class="chip ${draft.feeling === k ? 'on' : ''}" data-feel="${k}">${v}</button>`).join('')}
      </div>
      <textarea id="checkinNote" rows="2" placeholder="Anything else? (optional — sleep, stress, travel…)">${esc(draft.note)}</textarea>

      <h3 class="q">${name ? `${esc(name)}, would` : 'Would'} you like to change your macros?</h3>
      <p class="small muted">Suggested: ${esc(rec.why)}</p>
      <div class="options">
        ${options.map((o) => `
          <label class="opt ${choice === o.id ? 'on' : ''}">
            <input type="radio" name="checkinChoice" value="${o.id}" ${choice === o.id ? 'checked' : ''}>
            <span><b>${o.label}</b>${o.id === rec.id ? ' <em class="badge">Suggested</em>' : ''}<small>${o.detail}</small></span>
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
      <p class="small">New daily targets: <b>${base.kcal + deltaKcal(delta)} kcal</b> · ${after.p}P · ${after.f}F · ${after.c}C</p>
      <div class="row">
        <button type="button" id="saveCheckin">Save check-in</button>
        <button type="button" class="ghost" id="snoozeCheckin">Not now</button>
      </div>
    </div>`;

  el.querySelectorAll('[data-feel]').forEach((b) => b.onclick = () => { draft.feeling = b.dataset.feel; draft.choice = null; renderCheckin(); });
  $('#checkinNote').oninput = (e) => { draft.note = e.target.value; };
  el.querySelectorAll('input[name=checkinChoice]').forEach((r) => r.onchange = () => { draft.choice = r.value; renderCheckin(); });
  el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { draft.custom[b.dataset.step] += +b.dataset.by; renderCheckin(); });
  $('#snoozeCheckin').onclick = () => { store.set('checkinSnooze', isoDate()); draft = null; renderCheckin(); };
  $('#saveCheckin').onclick = () => {
    for (const k of ['p', 'f', 'c']) state.macroAdjust[k] += delta[k] || 0;
    store.set('macroAdjust', state.macroAdjust);
    state.checkins.push({ date: isoDate(), feeling: draft.feeling, note: draft.note.trim(), change: choice, delta, kcal: deltaKcal(delta) });
    store.set('checkins', state.checkins);
    store.set('adjustAppliedOn', isoDate());
    draft = null;
    renderAll();
    $('#checkin').innerHTML = `<div class="banner">Saved${name ? `, ${esc(name)}` : ''}. ${deltaKcal(delta) || delta.p ? 'Your new targets start now.' : 'Same targets — keep it up.'} Next check-in in a week.</div>`;
  };
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
    <li><span class="cap">${esc(w.source === 'added' ? (SPORTS[w.sport]?.name || short(w.type)) : w.name)}<small class="muted"> · ${esc(w.source === 'added' ? `${INTENSITY[w.intensity]?.label.toLowerCase() || 'added'} · added by you` : w.source)}</small></span>
    <span class="amt">${w.minutes} min<small>${w.kcal ? `${w.source === 'added' && !w.kcalFromYou ? '≈ ' : ''}${w.kcal} kcal` : 'estimated'}${w.strain != null ? ` · strain ${w.strain.toFixed(1)}` : ''}</small></span>
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
          ${connected.length ? '<button class="ghost small" id="syncNow">⟳ Sync</button>' : ''}
          <button class="ghost small" id="openDevices">Devices</button>
        </div>
      </div>
      ${sessions ? `<ul class="portions activities">${sessions}</ul>` : ''}
      ${hidden > 0 ? `<p class="small muted">${hidden} activit${hidden === 1 ? 'y you added was' : 'ies you added were'} matched to synced workouts, so ${hidden === 1 ? 'it isn\'t' : 'they aren\'t'} counted twice.</p>` : ''}
      ${extra}
      ${intra}
      <form id="planForm" class="add-activity">
        <select id="planSport" aria-label="Activity">
          <option value="">Add an activity…</option>
          ${mySports.length ? `<optgroup label="Your sports (from WHOOP / Garmin)">${mySports.map(([k, st]) => `<option value="${k}">${SPORTS[k].name} · ${st.sessions} sessions</option>`).join('')}</optgroup>` : ''}
          <optgroup label="${mySports.length ? 'Other activities' : 'Activities'}">${Object.keys(SPORTS).filter((k) => !stats[k]).map((k) => `<option value="${k}">${SPORTS[k].name}</option>`).join('')}</optgroup>
        </select>
        <div class="row" style="margin-top:0">
          <select id="planIntensity" aria-label="Intensity">${Object.entries(INTENSITY).map(([k, v]) => `<option value="${k}" ${k === 'moderate' ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          <input id="planMin" type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="min" style="flex:0 0 72px" aria-label="Minutes">
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
      .concat({ id: `a${Date.now()}`, date: today, sport, intensity, minutes, type: sessionType(sport, intensity), kcal: est.kcal, kcalFromYou: typed > 0 });
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
  $('#weighForm').classList.toggle('done', !!t);
}
const fmtShort = (d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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

  $('#groceryList').innerHTML = ['Costco', 'Sprouts', 'Safeway', 'Scanned items'].filter((k) => byStore[k]).map((name) => `
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
  const text = `Tap to link our Lean Plate apps (open it in the browser you use for Lean Plate): ${url}\nOr enter this code under "Code from my phone": ${code}`;
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
document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab !== 'scan') stopScan();
    if (btn.dataset.tab === 'lift') renderLift();
    if (btn.dataset.tab === 'notes') {
      openUs();
      if (sync.enabled()) sync.pull().then((changed) => changed && renderNotes()).catch(() => {});
    }
    if (btn.dataset.tab === 'weight' && state.profile) renderStats();
    window.scrollTo(0, 0);
  };
});

function renderAll() {
  if (!state.profile) return;
  renderToday();
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

const fileSlug = () => `lean-plate-${(state.profile?.name || activeProfile().name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDate()}`;

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

$('#exportData').onclick = async () => {
  const status = $('#exportStatus');
  status.textContent = 'Preparing…';
  try {
    const tables = buildTables(exportProfile(activeProfile().id));
    const files = Object.entries(tables).filter(([, rows]) => rows.length).map(([name, rows]) => ({ name: `${name}.csv`, text: toCsv(rows) }));
    files.push({ name: 'README.txt', text: [
      'Lean Plate export — open the CSV files in Excel, Numbers or Google Sheets.',
      'meals.csv: every logged meal with its macros, its target and on_target (yes/no).',
      'days.csv: daily calories eaten vs burned, deficit, protein, coins and weight.',
      'activities.csv: activities you added plus imported WHOOP/Garmin workouts.',
      'lifting_sessions.csv / lifting_sets.csv: finished workouts and every set (weight x reps).',
      'weigh_ins.csv, checkins.csv: weigh-ins and weekly check-ins.',
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
    if (backup.app !== 'lean-plate' || !backup.data?.profile) throw new Error('That file isn\'t a Lean Plate backup.');
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
  document.querySelectorAll('main > .tab:not(#tab-notes)').forEach((t) => { t.inert = ro; });
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
// Pull workouts on open (at most every 10 min) and right after connecting.
if (!sync.readOnly() && (justConnected || Date.now() - store.get('lastSync', 0) > 10 * 60000)) syncDevices();
// Household: upload my latest, then fetch my partner's; reload if I'm looking at fresh data.
applyPendingLink();
if (sync.enabled()) {
  sync.push().catch(() => {});
  sync.pull().then((changed) => { updateNotesBadge(); if (changed && sync.readOnly()) location.reload(); }).catch(() => {});
  const onNotes = () => document.querySelector('#tab-notes').classList.contains('active');
  const refresh = () => sync.pull().then((changed) => {
    updateNotesBadge();
    if (onNotes() && changed) renderNotes();
    else if (onNotes()) { const l = document.querySelector('#tab-notes .sync-line'); if (l) l.outerHTML = syncLine(); }
    else if (changed && sync.readOnly()) location.reload();
  }).catch(() => {});
  setInterval(refresh, 5 * 60000);
  // While the Us tab is open, check for new notes and plans often.
  setInterval(() => { if (onNotes() && document.visibilityState === 'visible') refresh(); }, 20000);
  // A home-screen app resumes without reloading: catch up when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - global.get('pulledAt', 0) > 30000) { sync.push().catch(() => {}); refresh(); }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
