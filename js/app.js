import { FOODS, STORES } from './foods.js';
import {
  ACTIVITY, PACE, dailyTargets, goalProjection, planForDay, groceryList,
  weeklyTrend, suggestAdjustment, fitScore,
  FEELINGS, CHECKIN_OPTIONS, deltaKcal, recommendCheckin, weekOverWeek,
} from './plan.js';
import { SESSION_TYPES, trainingDay, applyTraining, parseGarminCsv } from './activity.js';
import { devices } from './devices.js';
import { RESEARCH } from './research.js';
import { initLift, renderLift } from './lift.js';

// ---------- storage ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`lp.${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`lp.${key}`, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
};

const state = {
  profile: store.get('profile', null),
  weights: store.get('weights', []),   // [{date: 'YYYY-MM-DD', weight}]
  adjust: store.get('adjust', 0),      // kcal tweak from check-ins
  custom: store.get('custom', {}),     // today's meal edits: {date, meals: {breakfast: {template, picks, grams}}}
  prefs: store.get('prefs', {}),       // sticky swaps: {oatmeal: {fat: 'almondButter'}, main: {carb: 'quinoa'}}
  macroAdjust: store.get('macroAdjust', { p: 0, f: 0, c: 0 }), // grams, from weekly check-ins
  checkins: store.get('checkins', []), // [{date, feeling, note, change}]
  checked: store.get('checked', {}),   // grocery checkboxes
  workouts: store.get('workouts', []), // synced/imported workouts, last 14 days
  planned: store.get('planned', null), // {date, type, minutes}
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
  const planned = state.planned?.date === today ? state.planned : null;
  return trainingDay(workouts, planned, {
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
  renderCheckin();
  renderAdjustBanner(t);
  renderTraining(t);

  const plan = todayPlan(t);
  $('#meals').innerHTML = ['breakfast', 'lunch', 'dinner'].map((meal) => mealCard(meal, plan[meal])).join('')
    + `<p class="muted small">Pick a food from any menu to swap it. Drag a slider to set that portion yourself (🔒) — the other items re-balance to keep the meal on target. Weigh oats dry; weigh meat, fish, eggs, rice and veggies cooked.</p>`;
}

const MEAL_TEMPLATES = { eggs: 'Switch: eggs', oatmeal: 'Switch: oatmeal' };

function mealCard(meal, m) {
  const edited = !!todaysCustom()[meal];
  return `
    <div class="card meal" data-meal="${meal}">
      <div class="meal-head">
        <div>
          <div class="eyebrow">${meal}</div>
          <h3 data-role="title">${esc(m.title)}</h3>
        </div>
        <div class="row" style="margin-top:0">
          ${meal === 'breakfast' ? `<select class="small-select" data-template aria-label="Breakfast type">
            ${Object.entries(MEAL_TEMPLATES).map(([k, v]) => `<option value="${k}" ${m.template === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>` : ''}
          <button class="ghost small" data-reset ${edited ? '' : 'hidden'}>Reset</button>
        </div>
      </div>
      <div class="meal-macros" data-role="totals">${totalsLine(m)}</div>
      <ul class="portions editable">
        ${m.portions.map((x) => itemRow(x)).join('')}
      </ul>
    </div>`;
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
    editMeal(meal, (c) => { c.template = e.target.value; delete c.picks; delete c.grams; });
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
  const planned = state.planned?.date === today ? state.planned : null;
  const connected = ['whoop', 'strava'].filter((p) => devices.get()[p]);

  const sessions = day.sessions.map((w) => `
    <li><span class="cap">${esc(w.name || SESSION_TYPES[w.type]?.label)}<small class="muted"> · ${esc(w.source === 'planned' ? 'planned' : w.source)}</small></span>
    <span class="amt">${w.minutes} min<small>${w.kcal ? `${w.kcal} kcal` : SESSION_TYPES[w.type]?.label.split(' (')[0] || ''}${w.strain != null ? ` · strain ${w.strain.toFixed(1)}` : ''}</small></span></li>`).join('');

  const extra = day.extraKcal
    ? `<p class="small">+${day.extraKcal} kcal added back as carbs for today's training (75% of the estimated net burn, since calorie estimates tend to run high).</p>`
    : !tracked && day.sessions.length
      ? `<p class="small muted">Your profile's activity level already includes exercise. Choose “Count my workouts” in Profile to adjust calories per day.</p>`
      : '';

  const intra = day.intra && t.intraC ? `
    <div class="banner fuel">
      <b>Intra-workout fuel: ~${t.intraC} g carbs</b> during your ${planned.minutes}-min ${SESSION_TYPES[planned.type].label.split(' (')[0].toLowerCase()}.
      <div class="small muted">${esc(day.intra.note)}${day.intra.mixed ? ' Above 60 g/h, mix glucose + fructose sources (sports drink + fruit) so your gut can absorb it.' : ''}</div>
      <ul class="small fuel-list">${day.intra.options.slice(0, 4).map((o) => `<li>${esc(o.label)}</li>`).join('')}</ul>
      <div class="small muted">These carbs are already taken out of your meals below.</div>
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
      ${sessions ? `<ul class="portions">${sessions}</ul>` : ''}
      ${extra}
      ${intra}
      <form id="planForm" class="row">
        <select id="planType" aria-label="Planned session">
          <option value="">Plan a session…</option>
          ${Object.entries(SESSION_TYPES).map(([k, v]) => `<option value="${k}" ${planned?.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <input id="planMin" type="number" min="10" max="600" step="5" inputmode="numeric" placeholder="min" value="${planned?.minutes ?? ''}" style="flex:0 0 80px">
        <button type="submit" class="small">${planned ? 'Update' : 'Add'}</button>
        ${planned ? '<button type="button" class="ghost small" id="clearPlan">Clear</button>' : ''}
      </form>
      <p class="small muted" id="syncStatus">${connected.length ? `Connected: ${connected.map((c) => (c === 'strava' ? 'Garmin (Strava)' : 'WHOOP')).join(', ')}` : 'Plan today\'s session, or connect WHOOP / Garmin under Devices.'}</p>
    </div>`;

  $('#openDevices').onclick = openDevices;
  if ($('#syncNow')) $('#syncNow').onclick = () => syncDevices(true);
  if ($('#clearPlan')) $('#clearPlan').onclick = () => { state.planned = null; store.set('planned', null); renderAll(); };
  $('#planForm').onsubmit = (e) => {
    e.preventDefault();
    const type = $('#planType').value;
    const minutes = parseInt($('#planMin').value, 10);
    if (!type || !minutes) return;
    state.planned = { date: today, type, minutes };
    store.set('planned', state.planned);
    renderAll();
  };
}

function mergeWorkouts(list) {
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
      <div class="row"><button id="addGrocery" class="ghost">+ Add to grocery list</button></div>
    </div>`;

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

function openProfile() {
  const p = state.profile || { sex: 'male', activity: 'tracked', pace: 'steady' };
  $('#profileName').value = p.name ?? '';
  form.sex.value = p.sex;
  form.age.value = p.age ?? '';
  form.ft.value = p.heightIn ? Math.floor(p.heightIn / 12) : '';
  form.in.value = p.heightIn ? Math.round(p.heightIn % 12) : '';
  // New profiles start from a sample plan: 162 → 156 lb at a steady 0.75%/week.
  form.weight.value = state.profile ? currentWeight() : 162;
  form.goalLb.value = p.goalLb ?? 156;
  form.activity.value = p.activity;
  form.pace.value = p.pace;
  updatePlanPreview();
  dialog.showModal();
}
$('#openProfile').onclick = openProfile;
dialog.addEventListener('cancel', (e) => { if (!state.profile) e.preventDefault(); });

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
    window.scrollTo(0, 0);
  };
});

function renderAll() {
  if (!state.profile) return;
  renderToday();
  renderWeight();
  renderCheckinHistory();
  renderGroceries();
}

initLift();
$('#weighDate').value = isoDate();
const justConnected = devices.takeRedirect();
if (state.profile) renderAll();
else openProfile();
// Pull workouts on open (at most every 10 min) and right after connecting.
if (justConnected || Date.now() - store.get('lastSync', 0) > 10 * 60000) syncDevices();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
