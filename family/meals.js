// 🍽 Logging food from Health: one meal sheet, and the quick ways in — ✓ As planned, 📷 Photo,
// 🎙️ Tell me, 🍴 Ate out — with the rest (Same as yesterday, Quick macros, Packaged, Drinks,
// Low-carb) under More. Loaded the first time you tap one. Everything is worked out with
// js/dayPlan.js — the same plan and totals as Today's plan in the trackers — and saved into
// your trackers the way a weigh-in is (editMine): your copy comes down, the change is made,
// it goes back up, sealed with the family key. Estimates (photo, Tell me) are always shown to
// you to check first; nothing is logged until you tap Log. Photos are never kept.
import * as D from '../js/dayPlan.js';
import { FOODS } from '../js/foods.js';
import { EAT_OUT, EAT_OUT_SIZE, DRINKS, labelKcal } from '../js/plan.js';
import { parseMeal, totalOf } from '../js/foodText.js';
import { leftText } from './health.js';
import { healthDay, logCheer } from '../js/habit.js';
import { confetti } from '../js/confetti.js';
import { amountOf, resize, nudge, placeItems, asMealItems, packagedAsk } from '../js/mealEstimate.js';

const ms = { c: null, data: null, sheet: null, ops: [], ai: null, busy: false };
export const state = ms;
export function init(c) { ms.c = c; }
export function setData(d) { ms.data = d || {}; D.registerFoods(ms.data); }

const E = (s) => ms.c.esc(s);
const today = () => ms.c.iso();
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const r0 = (n) => Math.round(n || 0);
const NAME = D.MEAL_NAMES;
// A copy to preview changes on (grams you're nudging, before they're saved).
function mem() { const d = clone(ms.data) || {}; return { d, get: (k, f) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v; } }; }
const OPS = {
  grams: (s, [meal, slot, g]) => D.setGrams(s, today(), meal, slot, g),
  lowcarb: (s, [meal, on]) => { D.rollDay(s, today()); const c = s.get('custom'); c.meals[meal] = { ...(c.meals[meal] || {}), lowCarb: on || undefined }; if (!on) delete c.meals[meal].lowCarb; s.set('custom', c); D.record(s, today()); },
};
function preview() { const s = mem(); for (const [k, ...a] of ms.ops) OPS[k](s, a); return s; }
function planNow(s = preview()) { try { return D.planOf(s.d, today()); } catch { return null; } }
// Save: what you changed in the sheet, then the action — on a fresh copy of your trackers.
async function commit(action, msg) {
  if (ms.busy) return null;
  ms.busy = true;
  const ops = ms.ops.slice();
  try {
    // 🎉 A meal newly logged today gets confetti and a line on how the day is going (js/cheer.js).
    const loggedNow = (s) => { const e = s.get('eaten', {}) || {}; return e.date === today() ? Object.keys(e.meals || {}) : []; };
    let added = [], day = null;
    const out = await ms.c.editMine((s) => {
      const before = loggedNow(s);
      for (const [k, ...a] of ops) OPS[k](s, a);
      const r = action ? action(s) : null;
      added = loggedNow(s).filter((m) => !before.includes(m));
      if (added.length) day = healthDay({ weights: s.get('weights', []) || [], eaten: s.get('eaten', {}) || {}, mealLog: s.get('mealLog', {}) || {} }, today());
      return r;
    });
    ms.ops = [];
    ms.c.closeSheet();
    const cheer = day ? logCheer(day, today(), { meal: added[added.length - 1] }) : null;
    const text = msg ? (typeof msg === 'function' ? msg(out) : msg) : '';
    if (text || cheer) ms.c.toast([text, cheer?.line].filter(Boolean).join(' · '));
    if (cheer) confetti({ big: cheer.big });
    await ms.c.refresh();
    return out;
  } finally { ms.busy = false; }
}
const head = (title, sub = '') => `<div class="row between ml-head"><h2>${title}</h2><span class="row" style="gap:8px">${sub ? `<span class="small muted">${sub}</span>` : ''}<button type="button" class="icon-btn" data-ml="close" aria-label="Close">✕</button></span></div>`;
const totals = (t) => `<p class="ml-tot"><span><b>${r0(t.kcal).toLocaleString()}</b> kcal</span><span class="ml-p"><b>${r0(t.p)}</b> P</span><span class="ml-c"><b>${r0(t.c)}</b> C</span><span class="ml-f"><b>${r0(t.f)}</b> F</span>${t.alc ? `<span class="ml-a">incl. ${r0(t.alc)} kcal alcohol</span>` : ''}</p>`;
const leftLine = (s = preview()) => { try { return leftText(D.dayEntry(s.d, today()).left); } catch { return ''; } };
function open(html) { ms.c.openSheet(`<div class="ml-sheet">${html}</div>`); }

// ---------- the meal sheet ----------
function mealSheet(meal) {
  ms.sheet = { kind: 'meal', meal };
  const s = preview(), plan = planNow(s), m = plan?.[meal];
  const logged = D.logOf(s.d, today()).meals?.[meal];
  if (!m) return open(`${head(NAME[meal])}<p class="small">Your phone can't work this meal out yet — open Today's plan once, then try again.</p><a class="btn wide" href="../#today">Today's plan ›</a>`);
  const rows = (m.portions || []).filter((x) => FOODS[x.food]).map((x) => {
    const step = x.range?.[2] || 5;
    return `<div class="ml-food"><span><b>${E(FOODS[x.food].name)}</b>${x.locked ? ' <small class="muted">🔒</small>' : ''}</span>
      <span class="ml-step"><button type="button" class="ghost" data-ml="g:${meal}:${x.slot}:${-step}" aria-label="Less ${E(FOODS[x.food].name)}">−</button><input inputmode="decimal" data-mle="g:${meal}:${x.slot}" value="${r0(x.grams)}" aria-label="${E(FOODS[x.food].name)}, grams"><span class="small muted">g</span><button type="button" class="ghost" data-ml="g:${meal}:${x.slot}:${step}" aria-label="More ${E(FOODS[x.food].name)}">＋</button></span>
      <input type="range" class="ml-slide" data-mle="gs:${meal}:${x.slot}" min="0" max="${Math.max(x.range?.[1] || 400, r0(x.grams) * 2)}" step="${step}" value="${r0(x.grams)}" aria-label="${E(FOODS[x.food].name)}, grams" aria-valuetext="${r0(x.grams)} grams${unitHint(x)}"><small class="muted ml-unit" id="mlU-${x.slot}">${E(unitHint(x).replace(/^, /, ''))}</small></div>`;
  }).join('');
  const yest = yesterdays(meal);
  open(`${head(NAME[meal], logged ? `✓ logged ${E(logged.at || '')}` : 'planned')}
    <p class="small ml-title">${E(m.title)}</p><div id="mlMealTot">${totals(m.totals)}<p class="tiny muted">${leftLine(s)}</p></div>
    ${rows ? `<div class="ml-foods">${rows}</div><p class="tiny muted">Changes save when you log${logged ? ' or close' : ''}. ${m.balanced ? 'Sized to balance the rest of your day.' : ''}</p>` : ''}
    <div class="ml-primary">${logged ? `<button type="button" data-ml="save:${meal}" ${ms.ops.length ? '' : 'disabled'}>Save changes</button>` : `<button type="button" data-ml="plan:${meal}">✓ Log as planned</button>`}
      <button type="button" class="ghost" data-ml="other:${meal}">＋ Something else</button></div>
    <details class="ml-more"><summary>More</summary><div class="ml-grid">
      ${yest ? `<button type="button" class="ghost" data-ml="again:${meal}">🔁 Same as yesterday<small>${E(yest.title)} · ${r0(yest.kcal)} kcal</small></button>` : ''}
      <button type="button" class="ghost" data-ml="quick:${meal}">✏️ Quick macros<small>Just protein, carbs, fat</small></button>
      <button type="button" class="ghost" data-ml="pack:${meal}">📦 Packaged<small>Type or snap the label</small></button>
      <button type="button" class="ghost" data-ml="drinks:${meal}">🍷 Drinks<small>Wine, beer, cocktails</small></button>
      ${meal !== 'snack' && !m.eatout && !m.prepared ? `<button type="button" class="ghost" data-ml="lowcarb:${meal}">🥑 Low-carb ${customOf(s, meal).lowCarb ? 'off' : 'today'}<small>${customOf(s, meal).lowCarb ? 'Back to the usual carbs' : 'Rest-day carbs'}</small></button>` : ''}
      ${logged ? `<button type="button" class="ghost" data-ml="unlog:${meal}">↩︎ Unlog<small>Logged by mistake</small></button>` : ''}
    </div><a class="ml-link" href="../#today">Swap foods, combos and more in Today's plan ›</a></details>`);
}
// "2 eggs", "½ avocado": the food's own unit next to its grams, when it has one.
function unitHint(x) { const f = FOODS[x.food]; if (!f?.unit?.grams) return ''; const a = amountOf({ food: x.food, grams: x.grams }, FOODS); return `, ${a.text}`; }
const customOf = (s, meal) => D.customOf(s.d, today())[meal] || {};
function yesterdays(meal) {
  const d = new Date(`${today()}T12:00:00`); d.setDate(d.getDate() - 1);
  const y = d.toISOString().slice(0, 10), data = ms.data || {};
  const log = data.eaten?.date === y ? data.eaten : (data.mealLog || {})[y];
  const e = log?.meals?.[meal];
  return e && e.kcal > 0 && e.title ? e : null;
}
// "Brunch at Pat's" → the meal kept as what it was (no icon twice).
const strip = (t) => String(t || '').replace(/^\p{Extended_Pictographic}️?\s*/u, '');

// ---------- ✏️ Quick macros / 📦 Packaged ----------
function quickSheet(target, pre = {}) {
  ms.sheet = { kind: 'quick', target, q: { p: pre.p ?? '', c: pre.c ?? '', f: pre.f ?? '', kcal: pre.kcal ?? '', name: pre.name ?? '' } };
  drawQuick();
}
function drawQuick() {
  const { q, target } = ms.sheet;
  const auto = labelKcal(q.p, q.c, q.f), kcal = +q.kcal > 0 ? +q.kcal : auto;
  const row = (k, label, cls) => `<div class="ml-macro"><label class="${cls}" for="mlq${k}">${label}</label><span class="ml-step"><button type="button" class="ghost" data-ml="q:${k}:-5" aria-label="5 g less ${label}">−</button><input id="mlq${k}" inputmode="decimal" data-mle="q:${k}" value="${q[k]}" placeholder="0"><span class="small muted">g</span><button type="button" class="ghost" data-ml="q:${k}:5" aria-label="5 g more ${label}">＋</button></span></div>`;
  open(`${head('✏️ Quick macros', target === 'extra' ? 'a snack or extra' : NAME[target])}
    <p class="small muted">Type a number or tap ± (5 g steps).</p>
    ${row('p', 'Protein', 'ml-p')}${row('c', 'Carbs', 'ml-c')}${row('f', 'Fat', 'ml-f')}
    <label class="ml-field small">Calories <input inputmode="decimal" data-mle="q:kcal" value="${q.kcal}" placeholder="from the macros"></label>
    <label class="ml-field small">Name <input data-mle="q:name" value="${E(q.name)}" maxlength="60" placeholder="e.g. Protein oats (optional)"></label>
    <div class="ml-primary"><button type="button" data-ml="qlog" ${kcal > 0 ? '' : 'disabled'} id="mlqLog">Log ${kcal > 0 ? `${kcal} kcal` : ''}</button></div>`);
}
function packSheet(meal, pre = null) {
  ms.sheet = { kind: 'pack', meal, k: pre || { name: '', p: '', c: '', f: '', kcal: '', servings: 1, save: true } };
  drawPack();
}
function drawPack() {
  const { k, meal } = ms.sheet;
  const t = { kcal: (+k.kcal > 0 ? +k.kcal : labelKcal(k.p, k.c, k.f)) * k.servings, p: (+k.p || 0) * k.servings, c: (+k.c || 0) * k.servings, f: (+k.f || 0) * k.servings };
  const saved = (ms.data?.preparedMeals || []).slice(-6).reverse();
  open(`${head('📦 Packaged meal', NAME[meal])}
    ${k.serving ? `<p class="ml-note">Read from the label · per serving: <b>${E(k.serving)}</b> — check the numbers.</p>` : `<button type="button" class="wide ghost" data-ml="photo:${meal}:label">📷 Snap the label</button>`}
    ${saved.length && !k.serving ? `<p class="small muted">Yours: ${saved.map((x, i) => `<button type="button" class="linkish small" data-ml="packuse:${i}">${E(x.name)}</button>`).join(' · ')}</p>` : ''}
    <label class="ml-field small">Name <input data-mle="k:name" value="${E(k.name)}" maxlength="60" placeholder="e.g. Chicken burrito bowl"></label>
    <div class="ml-4">${[['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['kcal', 'Calories']].map(([f, l]) => `<label class="small">${l}<input inputmode="decimal" data-mle="k:${f}" value="${k[f]}"></label>`).join('')}</div>
    <div class="ml-label small">Servings</div><div class="seg">${[0.5, 1, 1.5, 2].map((n) => `<button type="button" class="${k.servings === n ? 'on' : ''}" data-ml="kserv:${n}">${{ 0.5: '½', 1: '1', 1.5: '1½', 2: '2' }[n]}</button>`).join('')}</div>
    <label class="ml-check"><input type="checkbox" data-mle="k:save" ${k.save ? 'checked' : ''}> Save it for next time</label>
    ${totals(t)}<div class="ml-primary"><button type="button" data-ml="klog" ${t.kcal > 0 ? '' : 'disabled'}>✓ Log ${r0(t.kcal)} kcal</button></div>`);
}

// ---------- 🍴 Ate out ----------
function outSheet(meal) {
  ms.sheet = { kind: 'out', meal, o: { place: '', dish: 'grilled', size: 'regular', ate: 1, menu: null } };
  drawOut();
}
const outTotals = (o) => { const d = EAT_OUT[o.dish] || EAT_OUT.plate, x = (EAT_OUT_SIZE[o.size] || EAT_OUT_SIZE.regular).x * o.ate; return { kcal: d.kcal * x, p: d.p * x, c: d.c * x, f: d.f * x }; };
function drawOut() {
  const { o, meal } = ms.sheet;
  const menu = o.menu;
  const t = menu ? { kcal: +menu.kcal || 0, p: menu.p !== '' ? +menu.p : (+menu.kcal || 0) * 0.25 / 4, c: menu.c !== '' ? +menu.c : (+menu.kcal || 0) * 0.35 / 4, f: menu.f !== '' ? +menu.f : (+menu.kcal || 0) * 0.4 / 9 } : outTotals(o);
  open(`${head('🍴 Ate out', NAME[meal])}
    <label class="ml-field small">Where <input data-mle="o:place" value="${E(o.place)}" maxlength="40" placeholder="optional"></label>
    ${menu ? `<div class="ml-label small">From the menu</div><label class="ml-field small">Dish <input data-mle="m:name" value="${E(menu.name || '')}" maxlength="60"></label><div class="ml-4">${[['kcal', 'Calories'], ['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g']].map(([f, l]) => `<label class="small">${l}<input inputmode="decimal" data-mle="m:${f}" value="${menu[f]}"></label>`).join('')}</div>
      <p class="tiny muted">Only calories? Protein, carbs and fat are filled in with a typical restaurant split.</p>`
    : `<div class="ml-label small">Or pick what's closest</div><div class="chips">${Object.entries(EAT_OUT).map(([k, d]) => `<button type="button" class="chip ${o.dish === k ? 'on' : ''}" data-ml="odish:${k}">${E(d.label)}</button>`).join('')}</div>
      <div class="ml-label small">Portion</div><div class="seg">${Object.entries(EAT_OUT_SIZE).map(([k, v]) => `<button type="button" class="${o.size === k ? 'on' : ''}" data-ml="osize:${k}">${v.label}</button>`).join('')}</div>
      <div class="ml-label small">How much you ate</div><div class="seg">${[[1, 'All'], [0.75, 'Most'], [0.5, 'Half']].map(([v, l]) => `<button type="button" class="${o.ate === v ? 'on' : ''}" data-ml="oate:${v}">${l}</button>`).join('')}</div>`}
    ${totals(t)}
    <div class="ml-primary"><button type="button" data-ml="olog" ${t.kcal > 0 ? '' : 'disabled'}>✓ Log it</button></div>
    <div class="ml-minis center"><button type="button" class="ghost" data-ml="photo:${meal}:restaurant">📷 Have a photo?</button><button type="button" class="ghost" data-ml="omenu">${menu ? '🍴 Pick a dish instead' : '🧾 Menu shows calories'}</button><button type="button" class="ghost" data-ml="drinks:${meal}">🍷 Drinks</button></div>`);
}

// ---------- 🍷 Drinks ----------
const DRINK_ROWS = ['redWine', 'whiteWine', 'beer'];
const COCKTAILS = Object.keys(DRINKS).filter((k) => !['redWine', 'whiteWine', 'rose', 'bubbly', 'beer', 'lightBeer'].includes(k));
function drinksSheet(withMeal) {
  const pour = +(localStorage.getItem('fam.ml.pour') || 5);
  ms.sheet = { kind: 'drinks', withMeal: withMeal && withMeal !== 'extra' ? withMeal : null, n: {}, pour: [5, 6, 9].includes(pour) ? pour : 5, cocktail: 'margarita', custom: null };
  drawDrinks();
}
function drinkList() {
  const { n, pour, custom } = ms.sheet;
  const out = Object.entries(n).filter(([, v]) => v > 0).map(([k, v]) => D.drinkEntry(k, v, pour)).filter(Boolean);
  if (custom && custom.n > 0 && +custom.kcal > 0) out.push(D.drinkEntry(null, custom.n, pour, custom));
  return out;
}
function drawDrinks() {
  const { n, pour, cocktail, custom, withMeal } = ms.sheet;
  const row = (k, label, sub) => `<div class="ml-drink"><span><b>${label}</b><small class="muted">${sub}</small></span><span class="ml-step"><button type="button" class="ghost" data-ml="dn:${k}:-1" aria-label="One less ${E(label)}">−</button><output aria-live="polite">${n[k] || 0}</output><button type="button" class="ghost" data-ml="dn:${k}:1" aria-label="One more ${E(label)}">＋</button></span></div>`;
  const list = drinkList(), t = totalOf(list), alc = list.reduce((a, x) => a + x.alc, 0), count = list.reduce((a, x) => a + (+x.title.match(/(\d+(?:\.\d+)?) ×/)?.[1] || 0), 0);
  open(`${head('🍷 Drinks', withMeal ? `with ${NAME[withMeal].toLowerCase()}` : 'on their own')}
    ${DRINK_ROWS.map((k) => row(k, `${DRINKS[k].icon} ${DRINKS[k].label}`, `${DRINKS[k].kcal} kcal · ${DRINKS[k].serving}`)).join('')}
    ${row(cocktail, `🍸 ${DRINKS[cocktail].label}`, `${DRINKS[cocktail].kcal} kcal`)}
    <label class="ml-field small">Cocktail <select data-mle="dcock">${COCKTAILS.map((k) => `<option value="${k}" ${k === cocktail ? 'selected' : ''}>${E(DRINKS[k].label)} · ${DRINKS[k].kcal} kcal</option>`).join('')}</select></label>
    <div class="ml-label small">Wine pour</div><div class="seg">${[5, 6, 9].map((p) => `<button type="button" class="${pour === p ? 'on' : ''}" data-ml="dpour:${p}">${p} oz</button>`).join('')}</div>
    ${custom ? `<div class="ml-4 ml-3"><label class="small">Drink<input data-mle="dc:name" value="${E(custom.name)}" maxlength="40" placeholder="e.g. Paloma"></label><label class="small">kcal each<input inputmode="decimal" data-mle="dc:kcal" value="${custom.kcal}"></label><label class="small">How many<input inputmode="decimal" data-mle="dc:n" value="${custom.n}"></label></div>`
      : '<button type="button" class="linkish small" data-ml="dcustom">＋ Something else (name + calories)</button>'}
    ${list.length ? `<p class="ml-note"><b>${r0(t.kcal)} kcal</b> · <span class="ml-a">alcohol ~${r0(alc)} kcal</span> · carbs ${r0(t.c)} g — alcohol is counted apart from protein, carbs and fat.</p>` : ''}
    <div class="ml-primary"><button type="button" data-ml="dlog" ${list.length ? '' : 'disabled'}>Add ${count || ''} drink${count === 1 ? '' : 's'}</button></div>`);
}

// ---------- ＋ Something else: every other way to log a meal, Talk first ----------
// (Saying it goes to 🗣️ Talk — the one place to say or type a meal; app.js starts listening in the tap.)
function otherSheet(meal) {
  ms.sheet = { kind: 'other', meal };
  const s = preview(), m = planNow(s)?.[meal], yest = yesterdays(meal), name = NAME[meal].toLowerCase();
  const way = (attrs, ic, t, sub, cls = '') => `<button type="button" class="ml-way ${cls}" ${attrs}><span class="ic" aria-hidden="true">${ic}</span><span>${t}<small>${sub}</small></span><span aria-hidden="true">›</span></button>`;
  open(`${head(`Log ${name}`, NAME[meal])}<div class="ml-ways">
    ${way(`data-act="talk" data-talkmeal="${meal}"`, '🎙️', 'Say what you had', '“Two eggs and a slice of sourdough” — Talk to Pawmily', 'talk')}
    ${way(`data-ml="photo:${meal}"`, '📷', 'From a photo', 'Choose one from Photos, or take one now')}
    ${way(`data-ml="out:${meal}"`, '🍴', 'Ate out', 'Pick the closest dish and how much')}
    ${way(`data-ml="pack:${meal}"`, '📦', 'Packaged', 'The numbers from the label')}</div>
    <div class="ml-minis">${yest ? `<button type="button" class="ghost" data-ml="again:${meal}">🔁 Same as yesterday</button>` : ''}<button type="button" class="ghost" data-ml="drinks:${meal}">🍷 Drinks</button>${meal !== 'snack' && m && !m.eatout && !m.prepared ? `<button type="button" class="ghost" data-ml="lowcarb:${meal}">🥑 Low-carb ${customOf(s, meal).lowCarb ? 'off' : 'today'}</button>` : ''}</div>`);
}

// ---------- 📷 Photo (plate, restaurant dish, label, menu) ----------
function photoSheet(meal, hint = '') {
  ms.sheet = { kind: 'photo', meal, hint, pic: null, error: '' };
  drawPhoto();
  aiCheck().then(() => ms.sheet?.kind === 'photo' && drawPhoto());
}
function drawPhoto() {
  const { meal, hint, pic, error } = ms.sheet;
  if (ms.ai === false) return open(`${head('📷 Photo', NAME[meal] || '')}<p class="small">Reading photos isn't set up here yet. Saying it in Talk, 🍴 Ate out and 📦 Packaged work without it.</p><div class="ml-two"><button type="button" data-act="talk" data-talkmeal="${meal}">🎙️ Say it</button><button type="button" class="ghost" data-ml="out:${meal}">🍴 Ate out</button></div>`);
  open(`${head(hint === 'label' ? '📷 Snap the label' : '📷 Photo', NAME[meal] || '')}
    ${pic?.url ? `<img class="ml-pic" src="${pic.url}" alt="The photo you chose">` : `<p class="small">${hint === 'label' ? 'A clear photo of the nutrition facts.' : 'Your plate, a restaurant dish, a nutrition label or a menu with calories. A fork or your hand in the photo helps judge the portion.'}</p>`}
    <input type="file" accept="image/*" data-mlpick id="mlLib" hidden><input type="file" accept="image/*" capture="environment" data-mlpick id="mlCam" hidden>
    ${ms.busy ? '<p class="small" role="status">Estimating… usually 5–15 seconds</p>' : `<div class="ml-primary"><button type="button" class="${pic?.url ? 'ghost' : ''}" data-ml="pick:lib">🖼 ${pic?.url ? 'Choose another' : 'Choose from Photos'}</button><button type="button" class="ghost" data-ml="pick:cam">📷 Take a photo now</button></div>`}
    ${hint === 'label' || !NAME[meal] || meal === 'extra' ? '' : `<div class="ml-label small">Which meal? <span class="muted">(logged for today — a photo from any day is fine)</span></div><div class="chips">${['breakfast', 'lunch', 'snack', 'dinner'].map((x) => `<button type="button" class="chip ${x === meal ? 'on' : ''}" data-ml="pmeal:${x}" aria-pressed="${x === meal}">${NAME[x]}</button>`).join('')}</div>`}
    ${pic?.url && !ms.busy ? '<button type="button" class="wide" data-ml="pread">Estimate it</button>' : ''}
    ${error ? `<p class="small" role="alert">${E(error)}</p>` : ''}
    <p class="tiny muted">The photo you choose is sent to Claude (Anthropic) to estimate it — only that picture, redrawn on your phone first so it has no location or camera details. It isn't kept: not by us, not in your log. Anthropic doesn't train on it and deletes it after a short safety check period.</p>`);
}
async function aiCheck() { if (ms.ai == null) ms.ai = await ms.c.aiReady().catch(() => null); return ms.ai; }
async function redraw(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('no picture');
  const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { blob, b64 };
}
export async function onPick(input) {
  const file = input.files?.[0];
  if (!file || ms.sheet?.kind !== 'photo') return;
  if (ms.sheet.pic?.url) URL.revokeObjectURL(ms.sheet.pic.url);
  try { const { blob, b64 } = await redraw(file); ms.sheet.pic = { url: URL.createObjectURL(blob), b64 }; ms.sheet.error = ''; }
  catch { ms.sheet.error = "Couldn't open that picture — try a JPEG or PNG."; }
  input.value = '';
  // Choosing it is the go-ahead (the sheet said so first): straight to the estimate.
  if (ms.sheet.pic?.b64 && ms.ai !== false) return readPhoto();
  drawPhoto();
}
function dropPic() { if (ms.sheet?.pic?.url) URL.revokeObjectURL(ms.sheet.pic.url); }
async function readPhoto() {
  const sh = ms.sheet;
  if (!sh?.pic?.b64 || ms.busy) return;
  ms.busy = true; drawPhoto();
  try {
    const r = await ms.c.api.post('/ai/diet/photo', { image: sh.pic.b64, mime: 'image/jpeg', hint: sh.hint || undefined });
    ms.busy = false;
    if (ms.sheet !== sh) return;
    dropPic();
    if (!r.found) { sh.pic = null; sh.error = "Couldn't find food or a label in that photo — try another, or use Tell me."; return drawPhoto(); }
    if (r.kind === 'label') { const it = r.items[0]; return packSheet(sh.meal, { name: r.name || it.name, p: it.p, c: it.c, f: it.f, kcal: it.kcal, servings: 1, save: true, serving: r.serving || '1 serving' }); }
    return estimateSheet(sh.meal, { from: 'photo', name: r.name, items: r.items, restaurant: sh.hint === 'restaurant' || r.kind === 'menu' });
  } catch (e) {
    ms.busy = false;
    if (e.status === 501) ms.ai = false;
    if (ms.sheet === sh) { sh.error = e.status === 501 ? '' : e.status === 429 ? e.message : !navigator.onLine ? "You're offline — try again when you're connected." : e.message || "Couldn't read that photo — try a clearer one."; drawPhoto(); }
  }
}

// ---------- 🎙️ Tell me ----------
// 🗣️ From Talk to Pawmily: the same Tell me, already filled in and read — its preview is the check.
// From Talk (or Tell me): "plan" when you said you'll have it; a packaged meal goes to the label form.
export function tellWith(target, text, { plan = false } = {}) {
  const pk = target !== 'extra' && packagedAsk(text);
  if (pk) return packSheet(target, { name: pk.name, p: pk.p, c: pk.c, f: pk.f, kcal: pk.kcal, servings: 1, save: true });
  ms.sheet = { kind: 'tell', target, text, est: null, error: '', plan }; drawTell(); return readTell();
}
function tellSheet(target) {
  ms.sheet = { kind: 'tell', target, text: '', est: null, error: '' };
  drawTell();
  setTimeout(() => document.getElementById('mlTell')?.focus(), 50);
}
function drawTell() {
  const { target, text, error } = ms.sheet;
  open(`${head('🎙️ Tell me', target === 'extra' ? 'a snack or extra' : NAME[target])}
    <label for="mlTell" class="visually-hidden">What did you have?</label>
    <textarea id="mlTell" class="ml-tell" rows="3" maxlength="600" data-mle="tell" placeholder="Two eggs, two slices of sourdough, half an avocado and coffee">${E(text)}</textarea>
    <p class="tiny muted">Type, or tap the 🎤 on your keyboard to speak. OurPawmily only gets the text, never audio.</p>
    ${error ? `<p class="small" role="alert">${E(error)}</p>` : ''}
    <div class="ml-primary"><button type="button" data-ml="tread" ${ms.busy ? 'disabled' : ''}>${ms.busy ? 'Reading…' : 'Read it'}</button></div>`);
}
async function readTell() {
  const sh = ms.sheet, text = (document.getElementById('mlTell')?.value ?? sh.text).trim();
  sh.text = text;
  if (!text) { sh.error = 'Say or type what you had first.'; return drawTell(); }
  const local = parseMeal(text, FOODS);
  if (!local.unread.length && local.items.length) return estimateSheet(sh.target, { from: 'tell', name: '', items: local.items, text, plan: sh.plan });
  if ((await aiCheck()) === false) return estimateSheet(sh.target, { from: 'tell', name: '', items: local.items, unread: local.unread, text, plan: sh.plan });
  ms.busy = true; drawTell();
  try {
    const r = await ms.c.api.post('/ai/diet/text', { text });
    ms.busy = false;
    if (ms.sheet !== sh) return null;
    if (!r.items?.length) { sh.error = "Couldn't make out the food in that — try naming each thing."; return drawTell(); }
    return estimateSheet(sh.target, { from: 'tell', name: '', items: r.items, text, claude: true, plan: sh.plan });
  } catch (e) {
    ms.busy = false;
    if (e.status === 501) ms.ai = false;
    if (ms.sheet !== sh) return null;
    // Claude isn't there right now: what the phone could read, with what it couldn't.
    return estimateSheet(sh.target, { from: 'tell', name: '', items: local.items, unread: local.unread, text, plan: sh.plan, note: e.status === 429 ? e.message : "Claude couldn't read it just now — here's what your phone could." });
  }
}

// ---------- the estimate: check it, then log ----------
function estimateSheet(target, est) {
  // Foods the phone knows stay foods (resized by weight or unit); the rest are resized in servings.
  ms.sheet = { kind: 'est', target, est: { size: 1, ate: 1, editing: false, ...est, items: placeItems(est.items.map((x) => ({ ...x })), FOODS, parseMeal) } };
  drawEst();
}
function estTotals(e) { const t = totalOf(e.items), x = e.size * e.ate; return { kcal: t.kcal * x, p: t.p * x, c: t.c * x, f: t.f * x }; }
const amountLine = (x) => { const a = amountOf(x, FOODS); return `${a.text}${a.sub ? ` · ${a.sub}` : ''}`; };
const itemSmall = (x) => `${E(amountLine(x))}${x.guess ? ' · typical portion — check' : ''} · ${r0(x.p)}P ${r0(x.c)}C ${r0(x.f)}F`;
function drawEst() {
  const { est: e, target } = ms.sheet, t = estTotals(e), extra = target === 'extra';
  const rows = e.items.map((x, i) => {
    const a = amountOf(x, FOODS);
    const ctl = e.editing ? `<div class="ml-amt"><button type="button" class="ghost" data-ml="enudge:${i}:-1" aria-label="Less ${E(x.name)}">−</button><input type="range" data-mle="ea:${i}" min="${a.min}" max="${a.max}" step="${a.step}" value="${a.value}" aria-label="${E(x.name)}, how much" aria-valuetext="${E(amountLine(x))}, ${r0(x.kcal)} calories"><button type="button" class="ghost" data-ml="enudge:${i}:1" aria-label="More ${E(x.name)}">+</button></div>` : '';
    return `<div class="ml-ei${e.editing ? ' edit' : ''}"><span><b>${E(x.name)}</b><small class="muted" id="mlA${i}">${itemSmall(x)}</small></span><span><span id="mlK${i}">${r0(x.kcal)} kcal</span> <button type="button" class="icon-btn" data-ml="edel:${i}" aria-label="Remove ${E(x.name)}">✕</button></span>${ctl}</div>`;
  }).join('');
  const kc = `${r0(t.kcal)} kcal`;
  const main = extra ? `<button type="button" id="mlLog" data-ml="elog" ${t.kcal > 0 ? '' : 'disabled'}>✓ Log ${kc}</button>`
    : e.plan ? `<button type="button" id="mlLog" data-ml="eplan" ${t.kcal > 0 ? '' : 'disabled'}>Plan it · ${kc}</button>` : `<button type="button" id="mlLog" data-ml="elog" ${t.kcal > 0 ? '' : 'disabled'}>✓ Plan & log · ${kc}</button>`;
  const second = extra ? '' : e.plan ? '<button type="button" class="ghost" data-ml="elog">✓ Plan & log</button>' : '<button type="button" class="ghost" data-ml="eplan">Plan it</button>';
  open(`${head(e.from === 'photo' ? '📷 Estimate' : '🎙️ Here\'s what I got', extra ? 'a snack or extra' : NAME[target])}
    ${e.note ? `<p class="small" role="status">${E(e.note)}</p>` : ''}
    <p class="ml-note">${e.from === 'photo' ? 'A rough estimate — adjust anything that looks off.' : e.claude ? 'Read by Claude from your words — check it.' : 'Read on your phone — check it.'}${e.restaurant ? ' Restaurant food usually has more oil than it looks.' : ''} Change how much of each food with ✏️ Edit amounts — the numbers follow.</p>
    <div class="ml-est">${rows || '<p class="small muted">Nothing left — add it another way.</p>'}</div>
    ${e.unread?.length ? `<p class="small">Couldn't place: ${e.unread.map((x) => `“${E(x)}”`).join(', ')} — say it again with an amount, or add ${e.unread.length === 1 ? 'it' : 'them'} after logging.</p>` : ''}
    ${e.from === 'photo' ? `<div class="ml-label small">Portion</div><div class="seg">${[[0.75, 'Light'], [1, 'Regular'], [1.3, 'Large']].map(([v, l]) => `<button type="button" class="${e.size === v ? 'on' : ''}" data-ml="esize:${v}">${l}</button>`).join('')}</div>
      <div class="ml-label small">How much you ate</div><div class="seg">${[[1, 'All'], [0.75, 'Most'], [0.5, 'Half']].map(([v, l]) => `<button type="button" class="${e.ate === v ? 'on' : ''}" data-ml="eate:${v}">${l}</button>`).join('')}</div>` : ''}
    <div id="mlTot">${totals(t)}</div>
    <div class="ml-primary">${main}<div class="ml-two">${second}<button type="button" class="ghost" data-ml="eamt">${e.editing ? 'Done editing' : '✏️ Edit amounts'}</button></div>
      <div class="ml-two"><button type="button" class="ghost" ${e.from === 'photo' ? `data-ml="photo:${target}"` : `data-act="talk" data-talkmeal="${target}"`}>${e.from === 'photo' ? 'Retake' : 'Say it again'}</button>${extra ? '' : `<button type="button" class="ghost" data-ml="epack">📦 It's packaged</button>`}</div></div>`);
}
// While a slider moves: only the numbers change (redrawing would stop the drag).
function refreshEst(i) {
  const { est: e, target } = ms.sheet, t = estTotals(e), x = e.items[i];
  const a = document.getElementById(`mlA${i}`), k = document.getElementById(`mlK${i}`), tot = document.getElementById('mlTot'), b = document.getElementById('mlLog');
  if (a) a.innerHTML = itemSmall(x);
  if (k) k.textContent = `${r0(x.kcal)} kcal`;
  if (tot) tot.innerHTML = totals(t);
  if (b) { b.disabled = !(t.kcal > 0); b.textContent = target === 'extra' ? `✓ Log ${r0(t.kcal)} kcal` : e.plan ? `Plan it · ${r0(t.kcal)} kcal` : `✓ Plan & log · ${r0(t.kcal)} kcal`; }
}
// The meal to keep: its foods and grams when every item is a food the app knows (so it can be
// resized later from Health), else one entry with its numbers.
function estMeal() {
  const { est: e } = ms.sheet, t = estTotals(e);
  const name = (e.name || e.items.map((x) => x.name.replace(/\s*\(.*?\)/g, '')).slice(0, 3).join(', ')).slice(0, 60) || 'Meal';
  const icon = e.from === 'photo' ? '📷' : '🎙️';
  const items = !e.restaurant && asMealItems(e.items, e.size * e.ate);
  const c = items ? { items } : e.restaurant ? { eatout: { mode: 'menu', dishName: name, menu: { kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) } } }
    : { prepared: { name, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f), servings: 1, icon } };
  return { c, t, name, icon };
}
function logEstimate() {
  const { target } = ms.sheet, { c, t, name, icon } = estMeal();
  if (target === 'extra') return commit((s) => D.addExtras(s, today(), [{ title: `${icon} ${name}`, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) }]), `✓ ${name} logged · ${r0(t.kcal)} kcal`);
  return commit((s) => D.logAs(s, today(), target, c), `✓ ${NAME[target]} planned and logged · ${r0(t.kcal)} kcal — tap it on Health to change amounts`);
}
function planEstimate() {
  const { target } = ms.sheet, { c, t } = estMeal();
  return commit((s) => D.planAs(s, today(), target, c), `🗓 ${NAME[target]} planned · ${r0(t.kcal)} kcal — log it from Health when you eat it`);
}

// ---------- 🔎 What fits? / Adjust the rest of today ----------
function fitsSheet(adjust = false) {
  const s = preview(), data = s.d, next = D.nextMeal(data, today());
  let left = null, plan = null;
  try { left = D.dayEntry(data, today()).left; plan = D.planOf(data, today()); } catch { /* unknown food */ }
  if (!left) return open(`${head(adjust ? 'The rest of today' : 'What fits?')}<p class="small">Open Today's plan once on this phone, then try again.</p>`);
  const fits = D.whatFits(data, today(), { remaining: left, plan });
  ms.sheet = { kind: 'fits', next, fits };
  const rest = D.MAIN_MEALS.filter((m) => !D.logOf(data, today()).meals?.[m]);
  open(`${head(adjust ? 'The rest of today' : 'What fits?', next ? `for ${NAME[next].toLowerCase()}` : '')}
    <p class="ml-note">${leftText(left)}${adjust ? ' Your targets stay the same.' : ''}</p>
    ${adjust && rest.length ? `<div class="ml-label small">Your plan, re-fitted to what's left</div>${rest.map((m) => `<div class="ml-opt"><span><b>${NAME[m]}: ${E(strip(plan[m].title))}</b><small class="muted">${r0(plan[m].totals.kcal)} kcal · ${r0(plan[m].totals.p)} g P${plan[m].balanced ? ' · re-fitted' : ''}</small></span><button type="button" class="ghost" data-ml="open:${m}">View</button></div>`).join('')}` : ''}
    ${fits.length ? `<div class="ml-label small">${adjust ? 'Or instead' : 'Fits what\'s left'}</div>${fits.map((o, i) => `<div class="ml-opt"><span><b>${E(strip(o.name))}</b><small class="muted">${o.kcal} kcal · ${o.p} g P · ${E(o.from)}</small></span>${next && o.use.kind !== 'planned' ? `<button type="button" class="ghost" data-ml="fuse:${i}">Use for ${NAME[next].toLowerCase()}</button>` : ''}</div>`).join('')}`
      : `<p class="small muted">${left.kcal < 80 && left.p < 20 ? 'Nothing more needed today.' : 'Save a few combos or packaged meals and they show up here.'}</p>`}
    <p class="tiny muted">Worked out on your phone from your plan, saved meals and recent meals. Nothing changes until you pick one.</p>
    <div class="ml-primary"><button type="button" class="ghost" data-ml="close">${adjust ? 'Keep the plan' : 'Close'}</button></div>`);
}
function useFit(i) {
  const o = ms.sheet.fits[i], meal = ms.sheet.next;
  if (!o || !meal) return null;
  const combo = o.use.kind === 'combo' ? (ms.data.combos || []).find((c) => c.id === o.use.id) : null;
  const pm = o.use.kind === 'prepared' ? (ms.data.preparedMeals || []).find((x) => x.name === o.use.name) : null;
  const c = combo ? { items: clone(combo.items), ...(combo.manual ? { manual: clone(combo.manual) } : {}), title: combo.name }
    : pm ? { prepared: { ...clone(pm), servings: 1 } }
      : { prepared: { name: strip(o.name), kcal: o.kcal, p: o.p, c: o.c, f: o.f, servings: 1, icon: '🔁' } };
  return commit((s) => { D.rollDay(s, today()); const cu = s.get('custom'); cu.meals[meal] = c; s.set('custom', cu); D.record(s, today()); }, `${NAME[meal]} is now ${strip(o.name)} — log it when you eat`);
}

// ---------- clicks and typing ----------
export async function onClick(t) {
  const [a, ...r] = t.dataset.ml.split(':');
  const sh = ms.sheet;
  switch (a) {
    case 'close': dropPic(); if (sh?.kind === 'meal' && ms.ops.length && D.logOf(ms.data, today()).meals?.[sh.meal]) return commit(null, 'Saved'); ms.ops = []; ms.sheet = null; return ms.c.closeSheet();
    case 'plan': return commit((s) => D.logPlanned(s, today(), r[0]), (e) => (e ? `✓ ${NAME[r[0]]} logged · ${e.kcal} kcal` : 'Logged'));
    case 'save': return commit(null, 'Saved');
    case 'open': ms.ops = []; return mealSheet(r[0]);
    case 'g': { const [meal, slot, step] = r; const m = planNow()?.[meal]; const x = m?.portions.find((p) => p.slot === slot); if (!x) return null; ms.ops.push(['grams', meal, slot, Math.max(0, r0(x.grams + +step))]); return mealSheet(meal); }
    case 'lowcarb': { const on = !customOf(preview(), r[0]).lowCarb; ms.ops.push(['lowcarb', r[0], on]); return mealSheet(r[0]); }
    case 'unlog': return commit((s) => D.unlog(s, today(), r[0]), `${NAME[r[0]]} unlogged`);
    case 'again': { const y = yesterdays(r[0]); if (!y) return null; return commit((s) => D.logAs(s, today(), r[0], { prepared: { name: strip(y.title), kcal: y.kcal, p: y.p, c: y.c, f: y.f, servings: 1, icon: '🔁' } }), `✓ ${NAME[r[0]]} logged · ${y.kcal} kcal`); }
    case 'quick': return quickSheet(r[0]);
    case 'q': { const [k, step] = r; const q = sh.q; q[k] = Math.max(0, (+q[k] || 0) + +step); return drawQuick(); }
    case 'qlog': {
      const q = sh.q, kcal = +q.kcal > 0 ? +q.kcal : labelKcal(q.p, q.c, q.f);
      const name = q.name.trim() || 'Quick macros';
      if (sh.target === 'extra') return commit((s) => D.addExtras(s, today(), [{ title: `✏️ ${name}`, kcal: r0(kcal), p: +q.p || 0, c: +q.c || 0, f: +q.f || 0 }]), `✓ ${name} logged · ${r0(kcal)} kcal`);
      return commit((s) => D.logAs(s, today(), sh.target, { prepared: { name, kcal: r0(kcal), p: +q.p || 0, c: +q.c || 0, f: +q.f || 0, servings: 1, icon: '✏️' } }), `✓ ${NAME[sh.target]} logged · ${r0(kcal)} kcal`);
    }
    case 'pack': return packSheet(r[0]);
    case 'packuse': { const x = (ms.data?.preparedMeals || []).slice(-6).reverse()[+r[0]]; if (!x) return null; sh.k = { name: x.name, p: x.p, c: x.c, f: x.f, kcal: x.kcal || '', servings: 1, save: false }; return drawPack(); }
    case 'kserv': sh.k.servings = +r[0]; return drawPack();
    case 'klog': {
      const k = sh.k, n = k.servings, kc = +k.kcal > 0 ? +k.kcal : labelKcal(k.p, k.c, k.f);
      const entry = { name: k.name.trim() || 'Packaged meal', p: +k.p || 0, c: +k.c || 0, f: +k.f || 0, kcal: r0(kc) };
      return commit((s) => {
        if (k.save) s.set('preparedMeals', [...(s.get('preparedMeals', []) || []).filter((x) => x.name.trim().toLowerCase() !== entry.name.toLowerCase()), entry].slice(-40));
        return D.logAs(s, today(), sh.meal, { prepared: { ...entry, servings: n } });
      }, `✓ ${NAME[sh.meal]} logged · ${r0(kc * n)} kcal`);
    }
    case 'out': return outSheet(r[0]);
    case 'odish': sh.o.dish = r[0]; return drawOut();
    case 'osize': sh.o.size = r[0]; return drawOut();
    case 'oate': sh.o.ate = +r[0]; return drawOut();
    case 'omenu': sh.o.menu = sh.o.menu ? null : { name: '', kcal: '', p: '', c: '', f: '' }; return drawOut();
    case 'olog': {
      const o = sh.o, place = o.place.trim().slice(0, 40);
      const e = o.menu ? { place, mode: 'menu', dishName: o.menu.name.trim() || '', menu: { kcal: +o.menu.kcal || 0, p: o.menu.p, c: o.menu.c, f: o.menu.f } } : { place, mode: 'estimate', dish: o.dish, size: o.size, ate: o.ate };
      return commit((s) => D.logAs(s, today(), sh.meal, { eatout: e }), (x) => `✓ ${NAME[sh.meal]} logged · ${x?.kcal ?? ''} kcal`);
    }
    case 'drinks': return drinksSheet(r[0]);
    case 'dn': { const [k, d] = r; sh.n[k] = Math.max(0, (sh.n[k] || 0) + +d); return drawDrinks(); }
    case 'dpour': sh.pour = +r[0]; try { localStorage.setItem('fam.ml.pour', r[0]); } catch { /* private mode */ } return drawDrinks();
    case 'dcustom': sh.custom = { name: '', kcal: '', n: 1 }; return drawDrinks();
    case 'dlog': {
      const list = drinkList().map((x) => (sh.withMeal ? { ...x, title: `${x.title} · with ${NAME[sh.withMeal].toLowerCase()}` } : x));
      const k = list.reduce((a, x) => a + x.kcal, 0);
      return commit((s) => D.addExtras(s, today(), list), `🍷 Added · ${r0(k)} kcal`);
    }
    case 'photo': dropPic(); return photoSheet(r[0], r[1] || '');
    case 'pick': return document.getElementById(r[0] === 'cam' ? 'mlCam' : 'mlLib')?.click();
    case 'pmeal': sh.meal = r[0]; return drawPhoto();
    case 'other': return otherSheet(r[0]);
    case 'pread': return readPhoto();
    case 'tell': return tellSheet(r[0]);
    case 'tread': return readTell();
    case 'edel': sh.est.items.splice(+r[0], 1); return drawEst();
    case 'esize': sh.est.size = +r[0]; return drawEst();
    case 'eate': sh.est.ate = +r[0]; return drawEst();
    case 'eamt': sh.est.editing = !sh.est.editing; return drawEst();
    case 'enudge': sh.est.items[+r[0]] = nudge(sh.est.items[+r[0]], +r[1], FOODS); return drawEst();
    case 'epack': { const t = estTotals(sh.est); return packSheet(sh.target, { name: (sh.est.name || sh.est.text || '').slice(0, 60), p: '', c: '', f: '', kcal: '', servings: 1, save: true, was: r0(t.kcal) }); }
    case 'eplan': return planEstimate();
    case 'elog': return logEstimate();
    case 'adjust': return fitsSheet(true);
    case 'fits': return fitsSheet(false);
    case 'fuse': return useFit(+r[0]);
    case 'done': return commit((s) => D.setDone(s, today(), true), '✓ Done for today — this day counts as complete in your weekly check-in');
    case 'undone': return commit((s) => D.setDone(s, today(), false), 'Okay — today stays open');
    case 'extra': return open(`${head('＋ Add', 'a snack or extra')}<div class="ml-grid"><button type="button" class="ghost" data-act="talk" data-talkmeal="extra">🎙️ Say it<small>Talk to Pawmily</small></button><button type="button" class="ghost" data-ml="drinks:extra">🍷 Drinks<small>Wine, beer, cocktails</small></button><button type="button" class="ghost" data-ml="quick:extra">✏️ Quick macros<small>Just P, C, F</small></button></div>`);
    default: return null;
  }
}
export function onInput(t) {
  const [a, k] = t.dataset.mle.split(':'), sh = ms.sheet;
  if (!sh) return;
  if (a === 'g') {
    const [, meal, slot] = t.dataset.mle.split(':');
    if (t.value === '') return;
    ms.ops = ms.ops.filter((o) => !(o[0] === 'grams' && o[1] === meal && o[2] === slot));
    ms.ops.push(['grams', meal, slot, Math.max(0, +t.value || 0)]);
    const btn = document.querySelector('[data-ml^="save:"]'); if (btn) btn.disabled = false;
    return;
  }
  if (a === 'q') { sh.q[k] = t.value; const q = sh.q, kc = +q.kcal > 0 ? +q.kcal : labelKcal(q.p, q.c, q.f), b = document.getElementById('mlqLog'); if (b) { b.disabled = !(kc > 0); b.textContent = `Log ${kc > 0 ? `${r0(kc)} kcal` : ''}`; } return; }
  if (a === 'k') {
    sh.k[k] = t.type === 'checkbox' ? t.checked : t.value;
    const x = sh.k, kc = (+x.kcal > 0 ? +x.kcal : labelKcal(x.p, x.c, x.f)) * x.servings, b = document.querySelector('[data-ml="klog"]');
    if (b) { b.disabled = !(kc > 0); b.textContent = `✓ Log ${r0(kc)} kcal`; }
    return;
  }
  if (a === 'o') { sh.o[k] = t.value; return; }
  if (a === 'm') { sh.o.menu[k] = t.value; return; }
  if (a === 'dc') { sh.custom[k] = t.value; const b = document.querySelector('[data-ml="dlog"]'); if (b) b.disabled = !drinkList().length; return; }
  if (a === 'dcock') { const prev = sh.cocktail; sh.cocktail = t.value; if (sh.n[prev]) { sh.n[t.value] = sh.n[prev]; delete sh.n[prev]; } return drawDrinks(); }
  if (a === 'tell') { sh.text = t.value; }
  // A food's slider in the meal sheet: the grams box, the unit and the totals follow as you slide.
  if (a === 'gs' && sh.kind === 'meal') {
    const [, meal, slot] = t.dataset.mle.split(':'), g = Math.max(0, +t.value || 0);
    ms.ops = ms.ops.filter((o) => !(o[0] === 'grams' && o[1] === meal && o[2] === slot));
    ms.ops.push(['grams', meal, slot, g]);
    const box = document.querySelector(`[data-mle="g:${meal}:${slot}"]`); if (box) box.value = r0(g);
    const pv = preview(), m = planNow(pv)?.[meal], u = document.getElementById(`mlU-${slot}`), tot = document.getElementById('mlMealTot');
    const x = m?.portions.find((p) => p.slot === slot);
    if (u && x) u.textContent = unitHint(x).replace(/^, /, '');
    t.setAttribute('aria-valuetext', `${r0(g)} grams${x ? unitHint(x) : ''}`);
    if (tot && m) tot.innerHTML = `${totals(m.totals)}<p class="tiny muted">${leftLine(pv)}</p>`;
    const btn = document.querySelector('[data-ml^="save:"]'); if (btn) btn.disabled = false;
    return;
  }
  if (a === 'ea' && sh.kind === 'est') { const i = +k; sh.est.items[i] = resize(sh.est.items[i], t.value, FOODS); t.setAttribute('aria-valuetext', `${amountLine(sh.est.items[i])}, ${r0(sh.est.items[i].kcal)} calories`); refreshEst(i); }
}
