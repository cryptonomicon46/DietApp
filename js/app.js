import { FOODS, STORES, FOOD_GROUPS } from './foods.js';
import {
  ACTIVITY, PACE, dailyTargets, goalProjection, planForDay, groceryList,
  weeklyTrend, suggestAdjustment, fitScore,
  FEELINGS, CHECKIN_OPTIONS, deltaKcal, recommendCheckin, weekOverWeek,
} from './plan.js';
import {
  SESSION_TYPES, SPORTS, INTENSITY, trainingDay, applyTraining, parseGarminCsv, parseWhoopCsv,
  sportStats, estimateActivity, sessionType,
} from './activity.js';
import { devices } from './devices.js';
import { RESEARCH } from './research.js';
import { initLift, renderLift } from './lift.js';
import { scoreDay, tally, MILESTONES } from './rewards.js';
import { store, global, PROFILES, activeProfile, setActiveProfile, ownerId, setOwner, exportProfile, importProfile } from './storage.js';
import { sync, newHouseholdCode } from './sync.js';
import { buildTables, toCsv, summary } from './analytics.js';
import { makeZip } from './zip.js';

// ---------- storage ----------
// Each person's data is kept separately (see storage.js); `store` reads/writes the open profile.
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
  const p = Math.max(t.p + a.p, 60), f = Math.max(t.f + a.f, 25), c = Math.max(t.c + a.c, 30);
  return { ...t, p, f, c, kcal: t.kcal + (p - t.p) * 4 + (f - t.f) * 9 + (c - t.c) * 4 };
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

function recordDay() {
  const t = targets(), base = baseTargets(), ate = consumed();
  state.days[isoDate()] = {
    eaten: Math.round(ate.kcal), burned: burnedToday().kcal, target: t.kcal,
    plannedDeficit: base.tdee - base.kcal, protein: Math.round(ate.p), proteinTarget: t.p,
    floor: state.profile.sex === 'male' ? 1500 : 1200,
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
  const mLeft = (k) => Math.round(t[k] - ate[k]);
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
  const proj = goalProjection(state.profile, currentWeight(), new Date(), baseTargets().lbPerWeek);
  $('#paceNote').textContent = proj.reached
    ? `Goal reached · maintenance`
    : `−${t.lbPerWeek} lb/wk · ${state.profile.goalLb} lb by ${proj.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  $('#todayMacros').innerHTML = [
    ['p', 'Protein', t.p], ['f', 'Fat', t.f], ['c', 'Carbs', t.c],
  ].map(([k, label, g]) => `<div class="macro ${k}"><b>${g} g</b><span>${label}</span></div>`).join('');

  const name = firstName();
  $('#greeting').textContent = name ? `${greetingWord()}, ${name}` : '';
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
          ${m.custom ? '' : '<button class="ghost small" data-customize title="Build this meal yourself">✎ Customize</button>'}
          <button class="ghost small" data-reset ${edited ? '' : 'hidden'}>${m.custom ? 'Back to plan' : 'Reset'}</button>
        </div>
      </div>
      <div class="meal-macros" data-role="totals">${totalsLine(m)}${m.manual ? ' <small class="muted">(your numbers)</small>' : ''}</div>
      ${m.custom ? customBody(meal, m) : `<ul class="portions editable">${m.portions.map((x) => itemRow(x)).join('')}</ul>`}
      ${eatButton(meal)}
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
            <input type="number" class="grams" data-cgrams="${i}" min="0" max="2000" step="1" inputmode="decimal" value="${x.grams}" aria-label="Grams">
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

$('#meals').addEventListener('click', (e) => {
  const card = e.target.closest('.meal');
  if (!card) return;
  const meal = card.dataset.meal;
  if (e.target.closest('[data-customize]')) {
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
  if (e.target.dataset.cfood != null) {
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
  if (e.target.dataset.cgrams != null) {
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
  const s = suggestAdjustment(state.weights, t.lbPerWeek);
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

  const status = !eaten
    ? `Log your meals as you eat. Finish at your target (${t.kcal}) for about a <b>${burned.kcal - t.kcal} kcal</b> deficit and 🪙 ${projected.coins}${projected.cookies ? ' + 🍪' : ''}.`
    : now <= 0
      ? `You're <b>${-now} kcal over</b> what you've burned today. Some extra activity could still flip it to a deficit.`
      : eaten < t.kcal
        ? `${t.kcal - eaten} kcal left in your plan. Finish there for a <b>${burned.kcal - t.kcal} kcal</b> deficit → 🪙 ${projected.coins}${projected.cookies ? ' + 🍪' : ''}.`
        : `Deficit locked in so far: 🪙 ${actual.coins}${actual.cookies ? ' + 🍪' : ''} if you stop here.`;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
    const key = isoDate(dt);
    const s = key === today ? null : scoreDay(state.days[key]);
    const icon = key === today ? '⏳' : s.status === 'deficit' ? '🪙' : s.status === 'too-big' ? '⚠️' : s.status === 'surplus' ? '▲' : '·';
    return `<span class="d7 ${s?.status || 'today'}" title="${key}"><b>${icon}</b><small>${dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></span>`;
  }).join('');

  $('#deficit').innerHTML = `
    <div class="card deficit-card">
      <div class="row between" style="margin-top:0">
        <div><div class="eyebrow">Today's deficit so far</div>
          <div class="big ${now < 0 ? 'neg' : ''}">${now >= 0 ? '' : '+'}${Math.abs(now)} <small>kcal ${now >= 0 ? 'under' : 'over'}</small></div></div>
        <div class="coins-total"><b>🪙 ${g.coins}</b><small>🍪 ${g.cookies} · best 🔥 ${g.best}</small></div>
      </div>
      <div class="def-track"><i style="width:${pct}%"></i></div>
      <div class="def-nums small"><span>Eaten <b>${eaten}</b></span><span>Burned <b>${burned.kcal}</b> <span class="muted">(${esc(burned.source)})</span></span></div>
      <p class="small">${status}</p>
      <label for="whoopTotalInput" class="small">Total calories burned today (from the WHOOP app)</label>
      <form id="whoopTotalForm" class="row" style="margin-top:4px">
        <input id="whoopTotalInput" type="number" inputmode="numeric" min="800" max="8000" placeholder="e.g. 2650 — optional" value="${state.whoopTotal[today] ?? ''}">
        <button class="small" type="submit">Save</button>
        ${state.whoopTotal[today] ? '<button class="ghost small" type="button" id="clearWhoopTotal">Use estimate</button>' : ''}
      </form>
      <p class="kudos">${kudos}</p>
      <div class="d7row" aria-label="Last 7 days">${last7}</div>
      ${g.badges.length ? `<p class="small muted">Badges: ${[...new Set(g.badges.map((b) => b.badge))].map(esc).join(' · ')}</p>` : ''}
      <details class="small"><summary>How scoring works</summary>
        <p>Each day you log meals and finish under the calories you burned earns 🪙 10, plus 🪙 5 if the deficit stays sustainable (under ~${Math.max(750, Math.round((d.plannedDeficit || 500) * 1.5))} kcal and not below ${d.floor} kcal eaten). Hitting 90% of your protein earns a 🍪. Streaks of ${MILESTONES.map((m) => `${m.days}`).join(', ')} days pay ${MILESTONES.map((m) => `+${m.coins}`).join(', ')} 🪙. Today's coins are added after midnight.</p>
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
  const trend = suggestAdjustment(state.weights, base.lbPerWeek);
  const wow = weekOverWeek(state.weights);
  const rec = recommendCheckin(trend, draft.feeling);
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
          <input id="planMin" type="number" min="5" max="600" step="5" inputmode="numeric" placeholder="min" style="flex:0 0 72px" aria-label="Minutes">
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
    <div><b>${(start - now).toFixed(1)}</b><span>lb lost</span></div>
    <div><b>${now.toFixed(1)}</b><span>current</span></div>
    <div><b>${Math.max(now - state.profile.goalLb, 0).toFixed(1)}</b><span>lb to goal</span></div>`;
  drawChart();
}

function drawChart() {
  const svg = $('#chart');
  const w = state.weights.slice(-60);
  if (w.length < 2) {
    svg.innerHTML = `<text x="160" y="80" text-anchor="middle">Log 2+ weigh-ins to see your chart</text>`;
    return;
  }
  const W = 320, H = 160, pad = { l: 34, r: 8, t: 10, b: 20 };
  const t0 = new Date(w[0].date).getTime();
  const t1 = new Date(w[w.length - 1].date).getTime();
  const goal = state.profile.goalLb;
  const ys = w.map((e) => e.weight);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (goal >= lo - 5) lo = Math.min(lo, goal);
  lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
  const x = (d) => pad.l + ((new Date(d).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  // 7-day moving average smooths out water-weight noise.
  const avg = w.map((e) => {
    const t = new Date(e.date).getTime();
    const win = w.filter((o) => { const ot = new Date(o.date).getTime(); return ot <= t && ot > t - 7 * 86400000; });
    return { date: e.date, v: win.reduce((s, o) => s + o.weight, 0) / win.length };
  });

  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  svg.innerHTML = `
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
    ${goal >= lo && goal <= hi ? `<line class="goal" x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}"/>` : ''}
    ${w.map((e) => `<circle class="raw" r="2.5" cx="${x(e.date)}" cy="${y(e.weight)}"/>`).join('')}
    <polyline class="trend" points="${avg.map((a) => `${x(a.date)},${y(a.v)}`).join(' ')}"/>
    <text x="${pad.l}" y="${H - 4}">${new Date(w[0].date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>
    <text x="${W - pad.r}" y="${H - 4}" text-anchor="end">${new Date(w[w.length - 1].date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`;
}

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
      <div class="row">
        ${serving ? '<button id="logServing">+ Log 1 serving to today</button>' : ''}
        <button id="addGrocery" class="ghost">+ Add to grocery list</button>
      </div>
    </div>`;

  if ($('#logServing')) $('#logServing').onclick = () => {
    todaysLog().extras.push({ title: name, kcal: serving.kcal, p: Math.round(serving.p), f: Math.round(serving.f), c: Math.round(serving.c) });
    saveLog();
    renderToday();
    $('#logServing').textContent = '✓ Logged';
    $('#logServing').disabled = true;
  };
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
  $('#partnerTitle').textContent = `${name}'s profile isn't set up yet`;
  $('#partnerText').textContent = `${name} sets up their own profile on their own phone. You can't set it up or change it from here. Once you both turn on sharing (Devices → Share with your household), ${name}'s day shows up here to view.`;
  $('#partnerBack').textContent = `Back to ${owner?.name || 'my profile'}`;
  $('#partnerDialog').showModal();
}
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
    tile(`${s.deficitDays}/${s.daysLogged}`, 'logged days in a deficit'),
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
  $('main').inert = ro;
  document.body.classList.toggle('readonly', ro);
  $('#restoreLabel').hidden = ro;
  const name = state.profile?.name || activeProfile().name;
  $('#viewBanner').hidden = !ro;
  if (ro) {
    const seen = global.get(`seen.${activeProfile().id}`, 0);
    $('#viewBanner').innerHTML = seen
      ? `Viewing <b>${esc(name)}</b>'s day · updated ${ago(seen)} · <button class="linkish" id="refreshPartner">Refresh</button>`
      : sync.enabled()
        ? `<b>${esc(name)}</b> hasn't synced yet. Once ${esc(name)} sets up the app and sharing on their own phone, their day shows up here. <button class="linkish" id="refreshPartner">Check now</button>`
        : `<b>${esc(name)}</b>'s profile isn't set up on this phone. ${esc(name)} sets it up on their own phone; turn on sharing (Devices) on both phones to see each other's day.`;
    if ($('#refreshPartner')) $('#refreshPartner').onclick = async () => {
      $('#refreshPartner').textContent = 'Checking…';
      try { if (await sync.pull()) location.reload(); else $('#refreshPartner').textContent = 'Up to date'; } catch (err) { $('#refreshPartner').textContent = err.message; }
    };
  }
}

// ---------- HOUSEHOLD SHARING (in Devices) ----------
function renderSharing() {
  const s = sync.settings() || {};
  $('#shareUrl').value = s.url || devices.get().server || '';
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
  $('#shareStatus').textContent = 'Syncing…';
  try {
    await sync.push();
    await sync.pull();
    location.reload();
  } catch (err) {
    $('#shareStatus').textContent = `Couldn't reach the connector: ${err.message}`;
  }
};
$('#shareOff').onclick = () => { sync.save(null); location.reload(); };

initLift();
$('#dayBar').onclick = () => { document.querySelector('[data-tab=today]').click(); };
$('#weighDate').value = isoDate();
const justConnected = devices.takeRedirect();
renderWho();
renderViewOnly();
if (!ownerId()) openOwnerPicker();
else if (state.profile) renderAll();
else if (sync.readOnly()) openPartnerNotice();
else openProfile();
// Pull workouts on open (at most every 10 min) and right after connecting.
if (!sync.readOnly() && (justConnected || Date.now() - store.get('lastSync', 0) > 10 * 60000)) syncDevices();
// Household: upload my latest, then fetch my partner's; reload if I'm looking at fresh data.
if (sync.enabled()) {
  sync.push().catch(() => {});
  sync.pull().then((changed) => { if (changed && sync.readOnly()) location.reload(); }).catch(() => {});
  setInterval(() => sync.pull().then((changed) => { if (changed && sync.readOnly()) location.reload(); }).catch(() => {}), 5 * 60000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
