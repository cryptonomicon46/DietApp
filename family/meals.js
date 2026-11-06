// 🍽 Logging food from Health: one meal sheet, and the quick ways in — ✓ As planned, 📷 Photo,
// 🎙️ Tell me, 🍴 Ate out — with the rest (Same as yesterday, Quick macros, Packaged, Drinks,
// Low-carb) under More. Loaded the first time you tap one. Everything is worked out with
// js/dayPlan.js — the same plan and totals as Today's plan in the trackers — and saved into
// your trackers the way a weigh-in is (editMine): your copy comes down, the change is made,
// it goes back up, sealed with the family key. Estimates (photo, Tell me) are always shown to
// you to check first; nothing is logged until you tap Log. Photos are never kept.
import * as D from '../js/dayPlan.js';
import { FOODS, BREAKFASTS } from '../js/foods.js';
import { fitPortions, fitMacros, perMealProtein } from '../js/mealFit.js';
import { EAT_OUT, EAT_OUT_SIZE, DRINKS, labelKcal } from '../js/plan.js';
import { parseMeal, parsePart, totalOf } from '../js/foodText.js';
import { leftText } from './health.js';
import { healthDay, logCheer } from '../js/habit.js';
import { confetti } from '../js/confetti.js';
import { amountOf, resize, nudge, placeItems, asMealItems, packagedAsk } from '../js/mealEstimate.js';
import { isSick, easyFoods, easyFood, easyEntry, EASY_TAGS } from '../js/sickDay.js';

const ms = { c: null, data: null, sheet: null, ops: [], ai: null, busy: false };
export const state = ms;
export function init(c) { ms.c = c; }
export function setData(d) { ms.data = d || {}; D.registerFoods(ms.data); }

const E = (s) => ms.c.esc(s);
const today = () => ms.c.iso();
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const r0 = (n) => Math.round(n || 0);
const NAME = D.MEAL_NAMES;
// 🔒 / 🔓 drawn (the emoji look alike at this size): a closed padlock when locked, an open one when not.
const LOCK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
const UNLOCK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.8"/></svg>';
const SLOT_NAME = { protein: 'Protein', carb: 'Carbs', fat: 'Fat', veggies: 'Veggies', fruit: 'Fruit', eggs: 'Eggs', liquid: 'Liquid' };
const lockWhere = (meal) => (meal === 'breakfast' ? 'whenever you have this breakfast' : 'at lunch and dinner');
// A copy to preview changes on (grams you're nudging, before they're saved).
function mem() { const d = clone(ms.data) || {}; return { d, get: (k, f) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v; } }; }
const dataOf = (s) => new Proxy({}, { get: (_, k) => s.get(k, undefined) });
const OPS = {
  grams: (s, [meal, slot, g]) => D.setGrams(s, today(), meal, slot, g),
  // 🔁 Another food in that slot (its own options: proteins for the protein, carbs for the carb…).
  pick: (s, [meal, slot, food]) => D.setPick(s, today(), meal, slot, food),
  // A different source for the meal (the plan, another breakfast, a combo, a bar or shake…).
  use: (s, [meal, c]) => D.planAs(s, today(), meal, clone(c)),
  // ⚖️ Fit to N kcal: protein in grams, carbs and fat in the plan's ratio (js/mealFit.js).
  fit: (s, [meal, kcal, left]) => {
    const m = D.planOf(dataOf(s), today())[meal];
    if (!m) return;
    const r = runFit(s, m, meal, kcal, left);
    // Every food's grams are pinned (not just the ones that changed): otherwise the plan's
    // auto-sizing would add protein back to make up for what the carbs and fat lost.
    for (const x of (m.portions || []).filter((y) => FOODS[y.food])) D.setGrams(s, today(), meal, x.slot, r.grams[x.slot] ?? x.grams);
    const cu = s.get('custom');
    cu.meals[meal] = { ...cu.meals[meal], fitKcal: kcal };
    s.set('custom', cu);
  },
  // The Fit-to number you chose, remembered per meal while the plan's own target stays the same.
  fitpref: (s, [meal, kcal, base]) => s.set('mealFit', { ...(s.get('mealFit', {}) || {}), [meal]: { kcal, base } }),
  lowcarb: (s, [meal, on]) => { D.rollDay(s, today()); const c = s.get('custom'); c.meals[meal] = { ...(c.meals[meal] || {}), lowCarb: on || undefined }; if (!on) delete c.meals[meal].lowCarb; s.set('custom', c); D.record(s, today()); },
};
function preview() { const s = mem(); for (const [k, ...a] of ms.ops) OPS[k](s, a); return s; }
function planNow(s = preview()) { try { return D.planOf(s.d, today()); } catch { return null; } }
// ⚡ Saving a meal: the change is made on this screen's copy first (sheet closed, Health redrawn,
// confetti) and saved to your trackers right after (ms.c.editMine, in order). If that save fails,
// the screen goes back to how it was and says so.
// Changes made on this screen's copy, then saved behind it. `apply(s)` runs twice: on a copy now,
// and on your trackers once they're up to date — so it must only change the store it's given.
// (editMine then keeps your saved record for Health to redraw from.)
function replaceData(d) { if (!ms.data) return; for (const k of Object.keys(ms.data)) if (!(k in d)) delete ms.data[k]; Object.assign(ms.data, d); }
function saveSoon(apply, { redraw = () => ms.c.refresh() } = {}) {
  const before = ms.data ? clone(ms.data) : null;
  const s = mem(), out = apply(s);
  if (ms.data) { replaceData(s.d); ms.c.seedMine?.(ms.data); }
  const saved = ms.c.editMine((real) => apply(real)).catch(async (e) => {
    if (before) { replaceData(before); ms.c.seedMine?.(ms.data); }
    ms.c.toast(`Not saved — ${e.message || 'try again'}`);
    await redraw();
  });
  return { out, saved };
}
async function commit(action, msg, undo = null) {
  if (ms.busy) return null;
  ms.busy = true;
  const ops = ms.ops.slice();
  try {
    // 🎉 A meal newly logged today gets confetti and a line on how the day is going (js/cheer.js).
    const loggedNow = (s) => { const e = s.get('eaten', {}) || {}; return e.date === today() ? Object.keys(e.meals || {}) : []; };
    let added = [], day = null;
    const { out } = saveSoon((s) => {
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
    if (text || cheer) ms.c.toast([text, cheer?.line].filter(Boolean).join(' · '), undo || undefined);
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
// The meal as it stands, with a picker for where it comes from (today's plan, another breakfast, a
// 🥤 smoothie, your combos and your partner's, a bar or shake, same as yesterday), ⚖️ Fit to N
// kcal, every food's grams on a slider, then ✓ Log. 📦 Packaged and 🍴 Ate out are the other two
// ways in. Nothing is saved until you log (or, for a meal already logged, Update it).
const comboKcal = (c) => (c.manual?.kcal ? +c.manual.kcal : (c.items || []).reduce((a, x) => a + ((FOODS[x.food]?.kcal || 0) * x.grams) / 100, 0));
const comboP = (c) => (c.manual?.p != null && c.manual.p !== '' ? +c.manual.p : (c.items || []).reduce((a, x) => a + ((FOODS[x.food]?.p || 0) * x.grams) / 100, 0));
const comboMeal = (c) => c.meal || (c.kind === 'breakfast' || c.kind === 'snack' ? c.kind : 'lunch');
const QUICK = () => Object.keys(FOODS).filter((k) => FOODS[k].quick);
// What the picker shows as the meal's source now.
function sourceLabel(c, m) {
  if (c.eatout || m.eatout) return 'ate out';
  if (c.prepared) return c.prepared.icon === '🔁' ? 'same as yesterday' : c.prepared.icon === '🥣' ? 'easy to eat' : c.prepared.icon === '📦' || !c.prepared.icon ? 'packaged' : 'logged';
  if (c.combo) return 'combo';
  if (c.items && c.items.length === 1 && FOODS[c.items[0].food]?.quick) return 'bar or shake';
  if (c.items) return 'your own';
  if (c.picked) return 'picked';
  return 'planned';
}
const fitDefault = (meal, m) => { const pf = ms.data?.mealFit?.[meal]; return pf && pf.base === m.target?.kcal ? pf.kcal : r0(m.target?.kcal); };
function mealSheet(meal) {
  const was = ms.sheet?.kind === 'meal' && ms.sheet.meal === meal ? ms.sheet : {};
  // 🤒 On a sick day the picker opens with 🥣 Easy to eat first.
  ms.sheet = { kind: 'meal', meal, pick: 'pick' in was ? !!was.pick : isSick(ms.data, today()), fit: was.fit, fitNote: was.fitNote || '', partner: was.partner, easy: was.easy ?? null };
  const sh = ms.sheet, s = preview(), plan = planNow(s), m = plan?.[meal];
  const logged = D.logOf(s.d, today()).meals?.[meal];
  if (!m) return open(`${head(NAME[meal])}<p class="small">Your phone can't work this meal out yet — open Today's plan once, then try again.</p><a class="btn wide" href="../#today">Today's plan ›</a>`);
  const c = customOf(s, meal);
  const rows = (m.portions || []).filter((x) => FOODS[x.food]).map((x) => {
    const step = x.range?.[2] || 5;
    // 🔒 / 🔓: lock this amount for the coming days, or let the plan size it (the plan's own meals).
    const lockable = !m.custom && !m.prepared && !m.eatout && D.prefKeyOf(m, meal), on = lockable && D.isLockedFor(s.d, m, meal, x.slot);
    const lockBtn = lockable ? `<button type="button" class="ml-lock${on ? ' on' : ''}" data-ml="lock:${meal}:${x.slot}:${on ? 0 : 1}" aria-pressed="${!!on}" aria-label="${on ? `Unlock ${E(FOODS[x.food].name)} — let the plan size it` : `Lock ${E(FOODS[x.food].name)} at this amount ${lockWhere(meal)}`}" title="${on ? `Locked ${lockWhere(meal)} — tap to unlock` : 'Tap to keep this amount on the coming days'}">${on ? `${LOCK_SVG}<span>Locked</span>` : UNLOCK_SVG}</button>` : x.locked ? ` <span class="ml-lockmark" title="Set by you">${LOCK_SVG}</span>` : '';
    // 🔁 Unlocked plan foods are a menu of that slot's own options (a locked one stays as it is).
    const opts = lockable && !on ? (x.options || []).filter((f) => FOODS[f]) : [];
    const name = opts.length > 1 ? `<select class="ml-swap" data-mle="pick:${meal}:${x.slot}" aria-label="${E(SLOT_NAME[x.slot] || 'Food')}: swap ${E(FOODS[x.food].name)}">${opts.map((f) => `<option value="${f}"${f === x.food ? ' selected' : ''}>${E(FOODS[f].name)}</option>`).join('')}</select>` : `<b>${E(FOODS[x.food].name)}</b>`;
    return `<div class="ml-food"><span>${name}${lockBtn}</span>
      <span class="ml-step"><button type="button" class="ghost" data-ml="g:${meal}:${x.slot}:${-step}" aria-label="Less ${E(FOODS[x.food].name)}">−</button><input inputmode="decimal" data-mle="g:${meal}:${x.slot}" value="${r0(x.grams)}" aria-label="${E(FOODS[x.food].name)}, grams"><span class="small muted">g</span><button type="button" class="ghost" data-ml="g:${meal}:${x.slot}:${step}" aria-label="More ${E(FOODS[x.food].name)}">＋</button></span>
      <input type="range" class="ml-slide" data-mle="gs:${meal}:${x.slot}" min="0" max="${Math.max(x.range?.[1] || 400, r0(x.grams) * 2)}" step="${step}" value="${r0(x.grams)}" aria-label="${E(FOODS[x.food].name)}, grams" aria-valuetext="${r0(x.grams)} grams${unitHint(x)}"><small class="muted ml-unit" id="mlU-${x.slot}">${E(unitHint(x).replace(/^, /, ''))}</small></div>`;
  }).join('');
  const canFit = rows && !m.prepared && !m.eatout && !m.manual;
  const fitVal = sh.fit ?? fitDefault(meal, m);
  const fit = canFit ? `<div class="ml-fit"><label for="mlFit" class="small"><b>Fit to</b></label><span class="ml-step"><button type="button" class="ghost" data-ml="fitstep:${meal}:-25" aria-label="25 kcal less">−</button><input id="mlFit" inputmode="numeric" data-mle="fit:${meal}" value="${fitVal}" aria-label="Fit this meal to how many calories"><span class="small muted">kcal</span><button type="button" class="ghost" data-ml="fitstep:${meal}:25" aria-label="25 kcal more">＋</button></span><button type="button" class="ghost small" data-ml="fitgo:${meal}">⚖️ Fit</button></div>
    <div class="row wrap ml-fitq">${fitLeft(meal) >= 150 ? `<button type="button" class="ghost small" data-ml="fitto:${meal}:${fitLeft(meal)}:left">What's left · ${fitLeft(meal)} kcal</button>` : ''}<button type="button" class="ghost small" data-ml="fitto:${meal}:400">400 kcal</button><button type="button" class="ghost small" data-ml="fitto:${meal}:500">500 kcal</button></div>
    <p class="tiny muted ml-fitnote" role="status">${sh.fitNote ? E(sh.fitNote) : `Planned ${r0(m.target?.kcal)} kcal · protein first, carbs and fat in your plan's ratio`}</p>` : '';
  const lowcarb = meal !== 'snack' && !m.eatout && !m.prepared && !c.items ? `<button type="button" class="ghost" data-ml="lowcarb:${meal}">🥑 Low-carb ${c.lowCarb ? 'off' : 'today'}</button>` : '';
  const save = rows && !m.prepared && !m.eatout ? `<button type="button" class="ghost" data-ml="savecombo:${meal}">☆ Save as combo</button>` : '';
  open(`${head(NAME[meal], logged ? `✓ logged ${E(logged.at || '')}` : '')}
    <button type="button" class="ml-src" data-ml="srcopen:${meal}" aria-expanded="${sh.pick}"><span><b>${E(m.title)}</b><small>${E(sourceLabel(c, m))} · tap to change</small></span><span aria-hidden="true">${sh.pick ? '▴' : '▾'}</span></button>
    ${sh.pick ? pickerHtml(meal, s, m, c) : ''}
    <div id="mlMealTot">${totals(m.totals)}<p class="tiny muted">${leftLine(s)}</p></div>
    ${fit}
    ${rows ? `<div class="ml-foods">${rows}</div><p class="tiny muted">${logged ? 'Changes save when you tap Update meal.' : 'Nothing is saved until you log.'} ${m.balanced ? 'Sized to balance the rest of your day.' : ''}</p>` : ''}
    <div class="ml-primary">${logged ? `<button type="button" data-ml="relog:${meal}" ${ms.ops.length ? '' : 'disabled'}>✓ Update meal · ${r0(m.totals.kcal)} kcal</button>` : `<button type="button" data-ml="plan:${meal}">✓ Log ${NAME[meal].toLowerCase()} · ${r0(m.totals.kcal)} kcal</button>`}</div>
    <div class="ml-two ml-big"><button type="button" class="ghost" data-ml="pack:${meal}">📦 Packaged</button><button type="button" class="ghost" data-ml="out:${meal}">🍴 Ate out</button></div>
    ${lowcarb || save || logged ? `<div class="ml-minis">${lowcarb}${save}${logged ? `<button type="button" class="ghost" data-ml="unlog:${meal}">↩︎ Unlog</button>` : ''}</div>` : ''}`);
  if (sh.pick && sh.partner === undefined && ms.c.partnerCombos) { sh.partner = null; ms.c.partnerCombos().then((p) => { if (ms.sheet === sh) { sh.partner = p || false; mealSheet(meal); } }).catch(() => { sh.partner = false; }); }
}
// The picker: where this meal comes from. Picking only changes the sheet; ✓ Log saves it.
function pickerHtml(meal, s, m, c) {
  const kc = (k, p) => `${r0(k)} kcal · ${r0(p)} g protein`;
  const row = (src, name, sub, on = false) => `<button type="button" class="ml-opt${on ? ' on' : ''}" data-ml="src:${meal}:${src}" ${on ? 'aria-current="true"' : ''}><span>${E(name)}<small>${E(sub)}</small></span>${on ? '<span aria-hidden="true">✓</span>' : ''}</button>`;
  const group = (title, body) => (body ? `<div class="ml-optg"><div class="ml-label small">${title}</div>${body}</div>` : '');
  const label = sourceLabel(c, m);
  // Today's plan: the planned meal, and for breakfast every breakfast (sized to this meal's target).
  let planRows = '';
  if (meal === 'breakfast') {
    const rotation = D.planOf(Object.assign(clone(s.d), { custom: { date: today(), meals: {} } }), today()).breakfast?.template;
    for (const k of Object.keys(BREAKFASTS)) {
      const t = previewWith(meal, k === rotation ? {} : { template: k, picked: true })?.[meal];
      if (!t) continue;
      const on = (k === m.template && (label === 'planned' || label === 'picked'));
      planRows += row(k === rotation ? 'plan' : `t_${k}`, `${k === rotation ? '🗓 ' : k === 'smoothie' ? '🥤 ' : ''}${t.title}${k === rotation ? ' (planned)' : ''}`, kc(t.totals.kcal, t.totals.p), on);
    }
  } else {
    const t = previewWith(meal, {})?.[meal];
    if (t) planRows = row('plan', `🗓 ${t.title} (planned)`, kc(t.totals.kcal, t.totals.p), label === 'planned');
  }
  const mine = [...(ms.data?.combos || [])].sort((a, b) => (comboMeal(b) === meal) - (comboMeal(a) === meal));
  const mineRows = mine.map((x) => row(`c_${x.id}`, `⭐ ${x.name}`, `${kc(comboKcal(x), comboP(x))}${comboMeal(x) !== meal ? ` · ${NAME[comboMeal(x)]?.toLowerCase() || ''} combo` : ''}`, c.combo === x.id)).join('');
  const partner = s && ms.sheet.partner;
  const theirRows = partner?.combos?.length ? partner.combos.map((x) => row(`p_${x.id}`, `⭐ ${x.name}`, kc(comboKcal(x), comboP(x)), c.combo === `p:${x.id}`)).join('') : '';
  const bars = QUICK().map((k) => { const f = FOODS[k], g = f.unit?.grams || 100; return row(`b_${k}`, f.name, `1 ${f.unit?.label || '100 g'} · ${kc((f.kcal * g) / 100, (f.p * g) / 100)}`, c.items?.length === 1 && c.items[0].food === k); }).join('');
  const y = yesterdays(meal);
  // 🥣 Easy to eat (js/sickDay.js): soft, warm or bland foods, filtered by what's bothering you.
  const tag = ms.sheet.easy, sick = isSick(s.d, today());
  const chip = (id, label) => `<button type="button" class="chip ${tag === id ? 'on' : ''}" aria-pressed="${tag === id}" data-ml="easyf:${meal}:${id || 'all'}">${E(label)}</button>`;
  const easyRows = `<div class="chips ml-easyf" role="group" aria-label="What's bothering you?">${chip(null, 'All')}${Object.entries(EASY_TAGS).map(([k, v]) => chip(k, v)).join('')}</div>`
    + easyFoods(tag).map((f) => row(`e_${f.id}`, `🥣 ${f.name}`, `${f.portion} · ${kc(f.kcal, f.p)} · ${f.why}`, c.prepared?.icon === '🥣' && c.prepared.name === f.name)).join('');
  const easy = group(sick ? '🥣 Easy to eat' : '🥣 Easy to eat (when you’re unwell)', easyRows);
  return `<div class="ml-picker" role="group" aria-label="Where this ${NAME[meal].toLowerCase()} comes from">
    ${sick ? easy : ''}
    ${group("Today's plan", planRows)}
    ${group('Your combos', mineRows || '<p class="tiny muted">None yet — ☆ Save as combo keeps a meal you like.</p>')}
    ${partner === null ? '<p class="tiny muted">Looking for shared combos…</p>' : group(`${E(partner?.name || '')}'s combos`, theirRows)}
    ${group('Bars &amp; shakes', bars)}
    ${y ? group('Again', row('again', `🔁 Same as yesterday · ${strip(y.title)}`, kc(y.kcal, y.p))) : ''}
    ${sick ? '' : easy}
  </div>`;
}
// The plan with one meal swapped to `c`, on a copy (to show each choice's calories).
function previewWith(meal, c) { try { const p = preview(); OPS.use(p, [meal, c]); return D.planOf(p.d, today()); } catch { return null; } }
// The choice → the meal's new source.
function sourceFor(meal, src) {
  const [kind, ...rest] = src.split('_'), id = rest.join('_');
  if (src === 'plan') return {};
  if (kind === 't' && BREAKFASTS[id]) return { template: id, picked: true };
  if (kind === 'c' || kind === 'p') {
    const list = kind === 'c' ? ms.data?.combos || [] : ms.sheet.partner?.combos || [];
    const x = list.find((y) => y.id === id);
    if (!x) return null;
    return { items: (x.items || []).map((i) => ({ food: i.food, grams: i.grams })), title: x.name, combo: kind === 'c' ? x.id : `p:${x.id}`, ...(x.manual ? { manual: { ...x.manual } } : {}) };
  }
  if (kind === 'e' && easyFood(id)) return easyEntry(easyFood(id));
  if (kind === 'b' && FOODS[id]) return { items: [{ food: id, grams: FOODS[id].unit?.grams || 100 }], title: FOODS[id].name };
  if (src === 'again') { const y = yesterdays(meal); return y ? { prepared: { name: strip(y.title), kcal: y.kcal, p: y.p, c: y.c, f: y.f, servings: 1, icon: '🔁' } } : null; }
  return null;
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
const savedPacks = () => [...(ms.data?.preparedMeals || [])].reverse(); // newest first
function drawPack() {
  const { k, meal } = ms.sheet;
  const t = { kcal: (+k.kcal > 0 ? +k.kcal : labelKcal(k.p, k.c, k.f)) * k.servings, p: (+k.p || 0) * k.servings, c: (+k.c || 0) * k.servings, f: (+k.f || 0) * k.servings };
  // Your saved packaged foods first (the ones you use most are one tap), then the label, then typing.
  const all = savedPacks(), shown = ms.sheet.all ? all : all.slice(0, 6);
  const picked = k.name && all.some((x) => x.name === k.name);
  open(`${head('📦 Packaged meal', NAME[meal])}
    ${all.length && !k.serving ? `<div class="ml-label small">Yours</div><div class="ml-packs">${shown.map((x, i) => `<button type="button" class="ml-opt${picked && x.name === k.name ? ' on' : ''}" data-ml="packuse:${i}"><span>${E(x.name)}<small>${r0(x.kcal || labelKcal(x.p, x.c, x.f))} kcal · ${r0(x.p)} g protein</small></span>${picked && x.name === k.name ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>
      ${all.length > shown.length ? `<button type="button" class="linkish small" data-ml="packall">All ${all.length} saved ›</button>` : ''}` : ''}
    ${k.serving ? `<p class="ml-note">Read from the label · per serving: <b>${E(k.serving)}</b> — check the numbers.</p>` : `<button type="button" class="wide ghost" data-ml="photo:${meal}:label">📷 Snap the label</button>`}
    <div class="ml-label small">${picked ? 'Check it' : 'Or type it in'}</div>
    <label class="ml-field small">Name <input data-mle="k:name" value="${E(k.name)}" maxlength="60" placeholder="e.g. Chicken burrito bowl"></label>
    <div class="ml-4">${[['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['kcal', 'Calories']].map(([f, l]) => `<label class="small">${l}<input inputmode="decimal" data-mle="k:${f}" value="${k[f]}"></label>`).join('')}</div>
    <div class="ml-label small">Servings</div><div class="seg">${[0.5, 1, 1.5, 2].map((n) => `<button type="button" class="${k.servings === n ? 'on' : ''}" data-ml="kserv:${n}">${{ 0.5: '½', 1: '1', 1.5: '1½', 2: '2' }[n]}</button>`).join('')}</div>
    <label class="ml-check"><input type="checkbox" data-mle="k:save" ${k.save ? 'checked' : ''}> Save it for next time</label>
    ${totals(t)}<div class="ml-primary"><button type="button" data-ml="klog" ${t.kcal > 0 ? '' : 'disabled'}>✓ Log ${r0(t.kcal)} kcal</button></div>`);
}

// ---------- 🍴 Ate out ----------
function outSheet(meal) {
  ms.sheet = { kind: 'out', meal, o: { place: '', how: null, dish: 'grilled', size: 'regular', ate: 1, menu: null, drinks: {}, cocktail: 'margarita' } };
  drawOut();
}
const outTotals = (o) => { const d = EAT_OUT[o.dish] || EAT_OUT.plate, x = (EAT_OUT_SIZE[o.size] || EAT_OUT_SIZE.regular).x * o.ate; return { kcal: d.kcal * x, p: d.p * x, c: d.c * x, f: d.f * x }; };
// 🍷 Drinks with the meal (one standard serving each; alcohol counts in calories, not P/C/F).
const outDrinks = (o) => Object.entries(o.drinks || {}).filter(([, n]) => n > 0).map(([k, n]) => D.drinkEntry(k, n, 5)).filter(Boolean);
const drinksBlock = (o) => {
  const list = outDrinks(o), n = list.length ? list.reduce((a, x) => a + (+x.title.match(/(\d+(?:\.\d+)?) ×/)?.[1] || 0), 0) : 0;
  const row = (k) => { const d = DRINKS[k], c = o.drinks[k] || 0; return `<div class="ml-drink"><span><b>${d.icon} ${E(d.label)}</b><small class="muted">${d.kcal} kcal · ${E(d.serving)}</small></span><span class="ml-step"><button type="button" class="ghost" data-ml="odr:${k}:-1" aria-label="One less ${E(d.label)}">−</button><output aria-live="polite">${c}</output><button type="button" class="ghost" data-ml="odr:${k}:1" aria-label="One more ${E(d.label)}">＋</button></span></div>`; };
  return `<details class="ml-more ml-outdrinks" ${n ? 'open' : ''}><summary>🍷 Drinks${n ? ` · ${n} · ${r0(list.reduce((a, x) => a + x.kcal, 0))} kcal` : ''}</summary>
    ${DRINK_ROWS.map(row).join('')}${row(o.cocktail)}
    <label class="ml-field small">Cocktail <select data-mle="ocock">${COCKTAILS.map((k) => `<option value="${k}" ${k === o.cocktail ? 'selected' : ''}>${E(DRINKS[k].label)} · ${DRINKS[k].kcal} kcal</option>`).join('')}</select></label>
    <p class="tiny muted">Alcohol counts in your calories, apart from protein, carbs and fat.</p></details>`;
};
function drawOut() {
  const { o, meal } = ms.sheet;
  const menu = o.menu;
  const way = (attrs, ic, t, sub, on = false) => `<button type="button" class="ml-way${on ? ' on' : ''}" ${attrs}><span class="ic" aria-hidden="true">${ic}</span><span>${t}<small>${sub}</small></span><span aria-hidden="true">${on ? '✓' : '›'}</span></button>`;
  const food = !o.how ? null : menu ? { kcal: +menu.kcal || 0, p: menu.p !== '' ? +menu.p : (+menu.kcal || 0) * 0.25 / 4, c: menu.c !== '' ? +menu.c : (+menu.kcal || 0) * 0.35 / 4, f: menu.f !== '' ? +menu.f : (+menu.kcal || 0) * 0.4 / 9 } : outTotals(o);
  const dr = outDrinks(o), dt = totalOf(dr);
  const t = food ? { kcal: food.kcal + dt.kcal, p: food.p, c: food.c + dt.c, f: food.f, alc: dr.reduce((a, x) => a + x.alc, 0) } : null;
  open(`${head('🍴 Ate out', NAME[meal])}
    <div class="ml-label small">What did you have?</div>
    <div class="ml-ways">
      ${way(`data-ml="photo:${meal}:restaurant"`, '📷', 'Photo of the dish', 'Take one or pick from Photos — it estimates the dish')}
      ${way(`data-ml="odesc:${meal}"`, '🎙️', 'Describe it', '“Salmon, rice and a side salad” — type or use the keyboard mic')}
      ${way('data-ml="ohow:pick"', '🍽', 'Pick the closest', 'A typical restaurant plate, then the size', o.how === 'pick' && !menu)}
    </div>
    ${o.how ? (menu ? `<div class="ml-label small">From the menu</div><label class="ml-field small">Dish <input data-mle="m:name" value="${E(menu.name || '')}" maxlength="60"></label><div class="ml-4">${[['kcal', 'Calories'], ['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g']].map(([f, l]) => `<label class="small">${l}<input inputmode="decimal" data-mle="m:${f}" value="${E(menu[f])}"></label>`).join('')}</div>
      <p class="tiny muted">Only calories? Protein, carbs and fat are filled in with a typical restaurant split.</p>`
      : `<div class="chips">${Object.entries(EAT_OUT).map(([k, d]) => `<button type="button" class="chip ${o.dish === k ? 'on' : ''}" data-ml="odish:${k}">${E(d.label)}</button>`).join('')}</div>
      <div class="ml-label small">Portion</div><div class="seg">${Object.entries(EAT_OUT_SIZE).map(([k, v]) => `<button type="button" class="${o.size === k ? 'on' : ''}" data-ml="osize:${k}">${v.label}</button>`).join('')}</div>
      <div class="ml-label small">How much you ate</div><div class="seg">${[[1, 'All'], [0.75, 'Most'], [0.5, 'Half']].map(([v, l]) => `<button type="button" class="${o.ate === v ? 'on' : ''}" data-ml="oate:${v}">${l}</button>`).join('')}</div>`) : ''}
    <button type="button" class="linkish small" data-ml="omenu">${menu ? '🍽 Pick a dish instead' : '🧾 The menu shows calories?'}</button>
    ${drinksBlock(o)}
    <label class="ml-field small ml-where">Where <span class="muted">(optional)</span> <input data-mle="o:place" value="${E(o.place)}" maxlength="40" placeholder="e.g. the Thai place on Castro"></label>
    ${t ? totals(t) : ''}
    <div class="ml-primary"><button type="button" data-ml="olog" ${t && t.kcal > 0 ? '' : 'disabled'}>${t ? `✓ Log ${NAME[meal].toLowerCase()} · ${r0(t.kcal)} kcal` : 'Choose how above'}</button></div>`);
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
// 📷 From Talk ("take a photo of my dinner"): the photo already taken or picked there, read as a
// restaurant dish for that meal — the same sheet, estimate and review as 🍴 Ate out › Photo.
export async function talkPhoto(meal, file) {
  photoSheet(meal, 'restaurant');
  const sh = ms.sheet;
  try { const { blob, b64 } = await redraw(file); sh.pic = { url: URL.createObjectURL(blob), b64 }; sh.error = ''; }
  catch { sh.error = "Couldn't open that picture — try a JPEG or PNG."; return drawPhoto(); }
  await aiCheck();
  if (ms.sheet !== sh) return null;
  if (ms.ai !== false) return readPhoto();
  return drawPhoto();
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

// ---------- ✅ From Talk: read it, then log, plan or edit it (Talk shows the review card) ----------
// The same reading as Tell me (the phone first, Claude only for what it can't place), but nothing
// opens and nothing is saved: Talk holds the draft until you say yes or tap ✓ Log meal.
export const talkTools = { parseMeal, parsePart, resize, FOODS };
export const talkTotals = (items) => totalOf(items);
export const talkPackaged = (target, text) => (target !== 'extra' ? packagedAsk(text) : null);
export async function talkRead(text) {
  const local = parseMeal(text, FOODS);
  if (!local.unread.length && local.items.length) return { items: local.items, unread: [], by: 'phone' };
  if ((await aiCheck()) === false) return { items: local.items, unread: local.unread, by: 'phone' };
  try {
    const r = await ms.c.api.post('/ai/diet/text', { text });
    if (!r.items?.length) return { items: local.items, unread: local.unread, by: 'phone', note: "Couldn't make out the food in that — try naming each thing." };
    return { items: placeItems(r.items.map((x) => ({ ...x })), FOODS, parseMeal), unread: [], by: 'claude' };
  } catch (e) {
    if (e.status === 501) ms.ai = false;
    return { items: local.items, unread: local.unread, by: 'phone', note: e.status === 429 ? e.message : "Claude couldn't read it just now — here's what your phone could." };
  }
}
// ✓ Log meal (or Plan it), through the meal's own save — with Undo, which puts the meal back as it was.
export function talkLog(target, items, { plan = false, add = false } = {}) {
  ms.sheet = { kind: 'est', target, est: { size: 1, ate: 1, from: 'tell', name: '', items, plan } };
  const { c, t, name, icon } = estMeal(), kc = `${r0(t.kcal)} kcal`;
  let snap = null;
  // ＋ Add to the meal (not a new one): undo puts the meal and the extras back as they were.
  if (add && target !== 'extra') {
    const undo = () => commit((s) => D.restoreMeal(s, today(), target, snap), `Undone — ${NAME[target].toLowerCase()} is back as it was`);
    const foods = asMealItems(items);
    return commit((s) => { snap = D.mealSnapshot(s, today(), target); return D.addToMeal(s, today(), target, foods ? { items: foods } : { entry: { title: `${icon} ${name}`, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) } }); },
      (r) => `＋ Added to ${NAME[target].toLowerCase()} · +${kc}${r?.meal ? ` · ${NAME[target].toLowerCase()} is ${r0(r.meal.totals.kcal)} kcal now` : ''}`, undo);
  }
  if (target === 'extra') {
    const undo = () => commit((s) => D.removeExtra(s, today(), snap.extras), 'Undone');
    return commit((s) => { snap = D.mealSnapshot(s, today(), 'snack'); return D.addExtras(s, today(), [{ title: `${icon} ${name}`, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) }]); }, `✓ ${name} logged · ${kc}`, undo);
  }
  const undo = () => commit((s) => D.restoreMeal(s, today(), target, snap), `Undone — ${NAME[target].toLowerCase()} is back as it was`);
  return commit((s) => { snap = D.mealSnapshot(s, today(), target); if (!plan) return D.logAs(s, today(), target, c); const x = D.planAs(s, today(), target, c); D.unlog(s, today(), target); return x; }, `✓ ${NAME[target]} ${plan ? 'planned' : 'logged'} · ${kc}`, undo);
}
// What a meal is now (for Talk's card): its name, calories, foods and whether it's logged.
export function talkExisting(target) {
  if (target === 'extra') return null;
  const s = preview(), m = planNow(s)?.[target];
  if (!m) return null;
  return { title: m.title, kcal: r0(m.totals?.kcal), logged: !!D.logOf(s.d, today()).meals?.[target], foods: (m.portions || []).filter((x) => x.grams > 0).length };
}
// ⚖️ What's left of today's calories for this meal (its own logged calories count as left, since
// fitting replaces them).
function fitLeft(meal) {
  try { const s = preview(); return r0(D.dayEntry(s.d, today()).left.kcal + (D.logOf(s.d, today()).meals?.[meal]?.kcal || 0)); } catch { return 0; }
}
// ✏️ Edit: the meal's own estimate sheet with the draft (its amounts, ✓ Plan & log, Plan it).
export function talkEdit(target, items, { plan = false, text = '' } = {}) {
  ms.sheet = null;
  return estimateSheet(target, { from: 'tell', name: '', items, plan, text });
}

// ---------- 🎙️ Tell me ----------
// 🗣️ From Talk to Pawmily: the same Tell me, already filled in and read — its preview is the check.
// From Talk (or Tell me): "plan" when you said you'll have it; a packaged meal goes to the label form.
export function tellWith(target, text, { plan = false } = {}) {
  const pk = target !== 'extra' && packagedAsk(text);
  if (pk) return packSheet(target, { name: pk.name, p: pk.p, c: pk.c, f: pk.f, kcal: pk.kcal, servings: 1, save: true });
  ms.sheet = { kind: 'tell', target, text, est: null, error: '', plan }; drawTell(); return readTell();
}
function tellSheet(target, { out = false } = {}) {
  ms.sheet = { kind: 'tell', target, text: '', est: null, error: '', out };
  drawTell();
  setTimeout(() => document.getElementById('mlTell')?.focus(), 50);
}
function drawTell() {
  const { target, text, error, out } = ms.sheet;
  open(`${head(out ? '🍴 Describe it' : '🎙️ Tell me', target === 'extra' ? 'a snack or extra' : out ? `${NAME[target]}, eaten out` : NAME[target])}
    <label for="mlTell" class="visually-hidden">What did you have?</label>
    <textarea id="mlTell" class="ml-tell" rows="3" maxlength="600" data-mle="tell" placeholder="Two eggs, two slices of sourdough, half an avocado and coffee">${E(text)}</textarea>
    <p class="tiny muted">Type, or tap the 🎤 on your keyboard to speak. OurPawmily only gets the text, never audio.</p>
    ${error ? `<p class="small" role="alert">${E(error)}</p>` : ''}
    <div class="ml-primary"><button type="button" data-ml="tread" ${ms.busy ? 'disabled' : ''}>${ms.busy ? 'Reading…' : 'Read it'}</button></div>`);
}
async function readTell({ claude = false } = {}) {
  const sh = ms.sheet, text = (document.getElementById('mlTell')?.value ?? sh.text).trim();
  sh.text = text;
  if (!text) { sh.error = 'Say or type what you had first.'; return drawTell(); }
  const local = parseMeal(text, FOODS);
  // Plain foods the phone knows are read on the phone (instant, nothing sent); a dish it doesn't
  // know (or ✨ Ask Claude instead) goes to Claude.
  if (!claude && !local.unread.length && local.items.length) return estimateSheet(sh.target, { from: 'tell', name: '', items: local.items, text, plan: sh.plan, askable: (await aiCheck()) !== false });
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
  // 🍴 From Ate out (Describe it): a restaurant meal, logged as eaten out.
  const out = ms.sheet?.kind === 'tell' && ms.sheet.out;
  ms.sheet = { kind: 'est', target, est: { size: 1, ate: 1, editing: false, ...est, restaurant: !!(est.restaurant || out), items: placeItems(est.items.map((x) => ({ ...x })), FOODS, parseMeal) } };
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
    <p class="ml-note">${e.from === 'photo' ? 'A rough estimate — adjust anything that looks off.' : e.claude ? 'Read by Claude from your words — check it.' : 'Read on your phone — check it.'}${e.from === 'tell' && !e.claude && e.askable ? ' <button type="button" class="linkish small" data-ml="eclaude">✨ Not right? Ask Claude instead</button>' : ''}${e.restaurant ? ' Restaurant food usually has more oil than it looks.' : ''} Change how much of each food with ✏️ Edit amounts — the numbers follow.</p>
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
  const how = e.from === 'photo' ? 'photo' : 'said';
  const c = items ? { items, how } : e.restaurant ? { eatout: { mode: 'menu', place: (ms.carry?.place || '').trim().slice(0, 40), dishName: name, menu: { kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) } }, how, ctx: 'eatout' }
    : { prepared: { name, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f), servings: 1, icon } };
  return { c, t, name, icon };
}
function logEstimate() {
  const { target, est } = ms.sheet, { c, t, name, icon } = estMeal();
  if (target === 'extra') return commit((s) => D.addExtras(s, today(), [{ title: `${icon} ${name}`, kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) }]), `✓ ${name} logged · ${r0(t.kcal)} kcal`);
  // Drinks chosen on 🍴 Ate out before the photo or the description come along with the meal.
  const drinks = est.restaurant ? (ms.carry?.drinks || []).map((x) => ({ ...x, title: `${x.title} · with ${NAME[target].toLowerCase()}` })) : [];
  ms.carry = null;
  return commit((s) => { const x = D.logAs(s, today(), target, c); if (drinks.length) D.addExtras(s, today(), drinks); return x; }, `✓ ${NAME[target]} ${est.restaurant ? 'logged' : 'planned and logged'} · ${r0(t.kcal)} kcal${drinks.length ? ` + ${r0(drinks.reduce((a, d) => a + d.kcal, 0))} kcal of drinks` : ''}${est.restaurant ? '' : ' — tap it on Health to change amounts'}`);
}
function planEstimate() {
  const { target } = ms.sheet, { c, t } = estMeal();
  return commit((s) => { const x = D.planAs(s, today(), target, c); D.unlog(s, today(), target); return x; }, `🗓 ${NAME[target]} planned · ${r0(t.kcal)} kcal — log it from Health when you eat it`);
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
// ⚖️ Fit the meal to sh.fit kcal (on top of the source you picked; the grams you'd nudged go).
// The macros a fit aims for and the grams that get there. The meal's planned protein stays (up to
// half its calories, never under 0.4 g/kg); carbs and fat keep the plan's ratio. What's left aims
// for the day's remaining macros instead. A food you've 🔒 locked for the coming days stays put; a
// food you've only set today may be re-fitted (that's what Fit is for).
function runFit(s, m, meal, kcal, left) {
  const data = dataOf(s), minP = perMealProtein(D.currentWeightOf(data));
  let aim;
  if (left) {
    const l = D.dayEntry(data, today()).left, had = D.logOf(data, today()).meals?.[meal] || {};
    const rest = { p: Math.max(0, l.p + (+had.p || 0)), c: Math.max(0, l.c + (+had.c || 0)), f: Math.max(0, l.f + (+had.f || 0)) };
    aim = fitMacros(kcal, { p: rest.p, c: rest.c || m.target?.c, f: rest.f || m.target?.f }, { minP, maxShare: 0.6 });
  }
  const portions = (m.portions || []).map((x) => ({ ...x, locked: !!(x.grams > 0 && D.isLockedFor(data, m, meal, x.slot)) }));
  return fitPortions(portions, kcal, FOODS, { plan: m.target, minP, aim });
}
function applyFit(meal, left = false) {
  const sh = ms.sheet, m = planNow()?.[meal];
  if (!m) return null;
  ms.ops = ms.ops.filter((o) => !(['grams', 'fit', 'fitpref'].includes(o[0]) && o[1] === meal));
  const before = preview(), m0 = D.planOf(before.d, today())[meal];
  const r = runFit(before, m0, meal, sh.fit, left);
  ms.ops.push(['fit', meal, sh.fit, left], ['fitpref', meal, sh.fit, r0(m.target?.kcal)]);
  // What it really comes to (the plan's own totals), so the note never says more than is true.
  const t = planNow()?.[meal]?.totals || { kcal: r.kcal, ...r.macros }, got = r0(t.kcal), near = Math.abs(got - sh.fit) <= Math.max(25, sh.fit * 0.05);
  const mac = `${r0(t.p)} P · ${r0(t.c)} C · ${r0(t.f)} F`, aim = r.aim ? ` (aim ${r.aim.p} · ${r.aim.c} · ${r.aim.f})` : '';
  sh.fitNote = near ? `Fitted to ${sh.fit} kcal (${got}) · ${mac}${Math.abs(r0(t.p) - (r.aim?.p ?? t.p)) > 4 || Math.abs(r0(t.f) - (r.aim?.f ?? t.f)) > 5 ? aim : ''}`
    : `Closest: ${got} kcal · ${mac} — the foods' smallest and largest amounts limit it`;
  return mealSheet(meal);
}
// ☆ Save as combo: this meal's foods and grams, to load into any meal later (yours only).
async function saveCombo(meal) {
  const m = planNow()?.[meal];
  const items = (m?.portions || []).filter((x) => x.grams > 0 && FOODS[x.food]).map((x) => ({ food: x.food, grams: r0(x.grams) }));
  if (!items.length) return ms.c.toast('Add some foods to this meal first');
  const name = (globalThis.prompt?.(`Name this ${NAME[meal].toLowerCase()} combo`, m.title) || '').trim().slice(0, 60);
  if (!name) return null;
  const kind = meal === 'breakfast' || meal === 'snack' ? meal : 'main';
  return commit((s) => {
    const list = s.get('combos', []) || [];
    const same = list.find((x) => comboMeal(x) === meal && x.name.toLowerCase() === name.toLowerCase());
    const combo = { id: same?.id || `c${Date.now().toString(36)}`, name, kind, meal, items };
    s.set('combos', [...list.filter((x) => x.id !== combo.id), combo]);
  }, `☆ Saved “${name}” — pick it from the meal's list any time`);
}
export async function onClick(t) {
  const [a, ...r] = t.dataset.ml.split(':');
  const sh = ms.sheet;
  switch (a) {
    // Closing never saves: a logged meal changes only with ✓ Update meal (it used to save on close).
    case 'close': dropPic(); ms.ops = []; ms.sheet = null; return ms.c.closeSheet();
    case 'plan': return commit((s) => D.logPlanned(s, today(), r[0]), (e) => (e ? `✓ ${NAME[r[0]]} logged · ${e.kcal} kcal` : 'Logged'));
    case 'save': return commit(null, 'Saved');
    case 'srcopen': sh.pick = !sh.pick; return mealSheet(r[0]);
    case 'easyf': sh.easy = r[1] === 'all' ? null : r[1]; return mealSheet(r[0]);
    case 'src': {
      const [meal, ...rest] = r, c = sourceFor(meal, rest.join(':'));
      if (!c) return null;
      // A new source replaces what you'd changed on the old one.
      ms.ops = ms.ops.filter((o) => !(['grams', 'pick', 'use', 'fit', 'fitpref'].includes(o[0]) && o[1] === meal));
      ms.ops.push(['use', meal, c]);
      sh.pick = false; sh.fit = undefined; sh.fitNote = '';
      return mealSheet(meal);
    }
    case 'lock': {
      // Saved right away (it's about the coming days, not this log): the meal's other changes stay as they are.
      const [meal, slot, on] = r, shown = planNow()?.[meal]?.portions?.find((p) => p.slot === slot), name = FOODS[shown?.food]?.name || 'It';
      // ⚡ Shown at once; saved right behind (and put back, with a note, if that fails).
      const grams = shown ? shown.grams : null, reopen = () => (document.querySelector('#sheet')?.open && document.querySelector('.ml-sheet') && ms.sheet?.meal === meal ? mealSheet(meal) : ms.c.refresh());
      saveSoon((s) => D.lockAmount(s, today(), meal, slot, on === '1', grams), { redraw: reopen });
      ms.c.toast(on === '1' ? `🔒 ${name} stays at this amount ${lockWhere(meal)} — tap Locked to unlock` : `🔓 ${name} is sized by your plan again`);
      return mealSheet(meal);
    }
    case 'fitto': { const [meal, n, left] = r; sh.fit = Math.max(50, +n || 0); return applyFit(meal, left === 'left'); }
    case 'fitstep': { const [meal, d] = r, m = planNow()?.[meal]; if (!m) return null; sh.fit = Math.max(50, (sh.fit ?? fitDefault(meal, m)) + +d); return applyFit(meal); }
    case 'fitgo': { const m = planNow()?.[r[0]]; if (!m) return null; sh.fit = sh.fit ?? fitDefault(r[0], m); return applyFit(r[0]); }
    case 'relog': { const meal = r[0], at = D.logOf(ms.data, today()).meals?.[meal]?.at; return commit((x) => D.logPlanned(x, today(), meal, at), (e) => (e ? `✓ ${NAME[meal]} updated · ${e.kcal} kcal` : 'Updated')); }
    case 'savecombo': return saveCombo(r[0]);
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
    case 'packuse': { const x = savedPacks()[+r[0]]; if (!x) return null; sh.k = { name: x.name, p: x.p, c: x.c, f: x.f, kcal: x.kcal || '', servings: 1, save: false }; return drawPack(); }
    case 'packall': sh.all = true; return drawPack();
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
    case 'omenu': sh.o.menu = sh.o.menu ? null : { name: '', kcal: '', p: '', c: '', f: '' }; sh.o.how = 'pick'; return drawOut();
    case 'ohow': sh.o.how = r[0]; return drawOut();
    case 'odr': { const [k, d] = r; sh.o.drinks[k] = Math.max(0, (sh.o.drinks[k] || 0) + +d); return drawOut(); }
    case 'odesc': ms.carry = { drinks: outDrinks(sh.o), place: sh.o.place }; return tellSheet(r[0], { out: true });
    case 'olog': {
      const o = sh.o, place = o.place.trim().slice(0, 40);
      const e = o.menu ? { place, mode: 'menu', dishName: o.menu.name.trim() || '', menu: { kcal: +o.menu.kcal || 0, p: o.menu.p, c: o.menu.c, f: o.menu.f } } : { place, mode: 'estimate', dish: o.dish, size: o.size, ate: o.ate };
      const drinks = outDrinks(o).map((x) => ({ ...x, title: `${x.title} · with ${NAME[sh.meal].toLowerCase()}` }));
      return commit((s) => { const x = D.logAs(s, today(), sh.meal, { eatout: e }); if (drinks.length) D.addExtras(s, today(), drinks); return x; }, (x) => `✓ ${NAME[sh.meal]} logged · ${x?.kcal ?? ''} kcal${drinks.length ? ` + ${r0(drinks.reduce((a, d) => a + d.kcal, 0))} kcal of drinks` : ''}`);
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
    case 'photo': dropPic(); if (sh?.kind === 'out') ms.carry = { drinks: outDrinks(sh.o), place: sh.o.place }; else ms.carry = null; return photoSheet(r[0], r[1] || '');
    case 'pick': return document.getElementById(r[0] === 'cam' ? 'mlCam' : 'mlLib')?.click();
    case 'pmeal': sh.meal = r[0]; return drawPhoto();
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
    // ✨ Read on the phone but not right: the same words go to Claude.
    case 'eclaude': { const e = sh.est; ms.sheet = { kind: 'tell', target: sh.target, text: e.text || '', est: null, error: '', plan: !!e.plan, out: !!e.restaurant }; return readTell({ claude: true }); }
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
  if (a === 'pick') {
    const [, meal, slot] = t.dataset.mle.split(':');
    // Like the grams: shown now, saved when you log (or Update meal). The slot's grams go back to the plan's.
    ms.ops = ms.ops.filter((o) => !((o[0] === 'pick' || o[0] === 'grams') && o[1] === meal && o[2] === slot));
    ms.ops.push(['pick', meal, slot, t.value]);
    return mealSheet(meal);
  }
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
  if (a === 'fit' && sh.kind === 'meal') {
    const v = Math.round(+t.value);
    if (!(v >= 50 && v <= 3000)) return;
    sh.fit = v;
    clearTimeout(onInput.fitT);
    onInput.fitT = setTimeout(() => { if (ms.sheet === sh) { applyFit(k); setTimeout(() => { const el = document.getElementById('mlFit'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); } }, 700);
    return;
  }
  if (a === 'ocock') { const prev = sh.o.cocktail; sh.o.cocktail = t.value; if (sh.o.drinks[prev]) { sh.o.drinks[t.value] = sh.o.drinks[prev]; delete sh.o.drinks[prev]; } return drawOut(); }
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
