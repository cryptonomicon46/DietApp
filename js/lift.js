import {
  MUSCLES, EXERCISES, DAYS, WEEKS, slotOptions, setsFor, weeklySets, blockPosition, suggestLoad,
  PLATES, plateTotal, platesFor, platesText, extraSlot, mergeSlots, applyOrder, moveSlot,
} from './lifting.js';
import { store } from './storage.js';
import { parseCommand, describe } from './commands.js';

// Lift tab: today's full-body session, set logging, history and the exercise library.
const load = () => store.get('lift', {});
const save = () => store.set('lift', lift);

// extraSets: {slotId: +n/−n} sets you added or removed, remembered for next time.
// kept: {A: [slot, ...]} exercises you added and chose to keep in that day's plan.
// order: {A: [slotId, ...]} your saved exercise order for a day; draft.order overrides it for today.
let lift = { block: 1, choices: {}, extraSets: {}, kept: {}, order: {}, sessions: [], draft: null, ...load() };
lift.extraSets ||= {};
lift.kept ||= {};
lift.order ||= {};

// Today's exercises: the plan + exercises you keep + ones added just for today, in your order.
function sessionSlots(d = lift.draft) {
  return applyOrder(mergeSlots(DAYS[d.day].slots, [...(lift.kept[d.day] || []), ...(d.extra || [])]), d.order || lift.order[d.day]);
}
const planOrder = (d = lift.draft) => mergeSlots(DAYS[d.day].slots, [...(lift.kept[d.day] || []), ...(d.extra || [])]).map((s) => s.id);
const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Tick every set of one exercise; blank reps get the target (top of the range), like tapping ○.
function checkSlot(slotId) {
  const slot = slotById(slotId);
  const sets = lift.draft.entries[slotId].sets;
  sets.forEach((x) => { x.done = true; if (x.r === '') x.r = slot.reps[1]; });
  return sets;
}

// Reorder today's session (e.g. the squat rack is taken).
function moveExercise(id, where) {
  const d = lift.draft;
  d.order = moveSlot(sessionSlots().map((s) => s.id), id, where);
  save();
}
const slotById = (id) => sessionSlots().find((s) => s.id === id);
const slotIndex = (id) => DAYS[lift.draft.day].slots.findIndex((s) => s.id === id); // −1 for added ones
let libraryMuscle = 'quads';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Body weight for bodyweight moves: latest weigh-in, else the profile's weight.
function bodyWeight() {
  const w = store.get('weights', []);
  return w.length ? w[w.length - 1].weight : (+store.get('profile', null)?.weight || null);
}

const blockSessions = () => lift.sessions.filter((s) => s.block === lift.block);

function startDraft(day, week) {
  lift.draft = { day, week, extra: [], entries: {} };
  sessionSlots().forEach((slot, i) => {
    const exercise = lift.choices[slot.id] || slot.default;
    lift.draft.entries[slot.id] = { exercise, sets: newSets(exercise, slot, week, slot.added ? 99 : i) };
  });
  save();
}

export function addExercise(exerciseId, after, keep = false) {
  const d = lift.draft;
  const id = `X${Date.now().toString(36)}`;
  const slot = extraSlot(id, exerciseId, after || sessionSlots().at(-1).id);
  if (keep) (lift.kept[d.day] ||= []).push(slot); else (d.extra ||= []).push(slot);
  d.entries[id] = { exercise: exerciseId, sets: newSets(exerciseId, slot, d.week, 99) };
  save();
  return id;
}

function newSets(exercise, slot, week, index) {
  const s = suggestLoad(exercise, slot, lift.sessions, week);
  const w = EXERCISES[exercise].bw ? bodyWeight() ?? '' : s.weight ?? '';
  return Array.from({ length: setsFor(slot, week, index, lift.extraSets[slot.id] || 0) }, () => ({ w, r: '', done: false }));
}

export function renderLift() {
  const pos = blockPosition(blockSessions().length);
  if (!lift.draft) startDraft(pos.day, pos.week);
  const d = lift.draft;
  const wk = WEEKS[d.week - 1];
  const vol = weeklySets(d.week, lift.extraSets);

  $('#liftPlan').innerHTML = `
    <div class="row between" style="margin-top:0">
      <div><div class="eyebrow">Full body · 3 days a week · Block ${lift.block}</div><h2>${wk.label}</h2></div>
      <span class="pill">RIR ${wk.rir}</span>
    </div>
    <div class="weeks" role="list">
      ${WEEKS.map((w) => `<span role="listitem" class="wk ${w.week === d.week ? 'on' : ''} ${w.week < pos.week ? 'past' : ''} ${w.week === 6 ? 'deload' : ''}">${w.week === 6 ? 'DL' : w.week}</span>`).join('')}
    </div>
    <p class="small">${esc(wk.note)}</p>
    <p class="small muted">Weekly hard sets: Quads ${vol.quads} · Hams/glutes ${vol.hams} · Chest ${vol.chest} · Back ${vol.back + vol.lats} · Shoulders ${vol.shoulders}</p>
    ${pos.done ? `<div class="banner">Block ${lift.block} complete — nice work. <button class="small" id="newBlock">Start block ${lift.block + 1}</button></div>` : ''}
    <div class="row">
      <label class="inline">Day <select id="liftDay">${Object.keys(DAYS).map((k) => `<option value="${k}" ${k === d.day ? 'selected' : ''}>${k}${k === pos.day ? ' (next)' : ''}</option>`).join('')}</select></label>
      <label class="inline">Week <select id="liftWeek">${WEEKS.map((w) => `<option value="${w.week}" ${w.week === d.week ? 'selected' : ''}>${w.week === 6 ? 'Deload' : w.week}</option>`).join('')}</select></label>
    </div>`;

  const day = DAYS[d.day];
  $('#liftSession').innerHTML = `
    <div class="row between" style="margin-top:0"><h2>${day.title}</h2></div>
    <p class="small muted">${esc(day.note)}</p>
    <form class="cmd" id="cmdForm" autocomplete="off">
      <input id="cmdText" type="text" enterkeyhint="send" placeholder="Say or type: squats 3 sets of 5 at 185" aria-label="Log by voice or text">
      ${SpeechRec ? '<button type="button" class="ghost mic" id="cmdMic" aria-label="Dictate">🎤</button>' : ''}
      <button type="submit" class="small">Log</button>
    </form>
    <div class="small cmd-result" id="cmdResult">${cmdFeedback}</div>
    ${orderBar()}
    ${sessionSlots().map((slot, n, all) => {
      const i = slot.added ? 99 : slotIndex(slot.id);
      const e = d.entries[slot.id] ||= { exercise: lift.choices[slot.id] || slot.default, sets: newSets(lift.choices[slot.id] || slot.default, slot, d.week, i) };
      const kept = (lift.kept[d.day] || []).some((k) => k.id === slot.id);
      const ex = EXERCISES[e.exercise];
      const sug = suggestLoad(e.exercise, slot, lift.sessions, d.week);
      const [lo, hi] = slot.reps;
      const barbell = ex.equip === 'Barbell';
      const bw = ex.bw ? bodyWeight() : null;
      if (ex.bw) e.sets.forEach((x) => { x.w = bw ?? ''; });
      // Hints skip 35s unless you've loaded them yourself.
      const load = barbell && sug.weight ? platesFor(sug.weight, lift.bar || 45, lift.use35 ? PLATES : PLATES.filter((x) => x !== 35)) : null;
      return `
      <div class="lift" data-slot="${slot.id}">
        <div class="lift-head">
          <div class="eyebrow">${n + 1}. ${MUSCLES[slot.muscle]} · ${ex.kind}${slot.added ? ` · <span class="added-tag">${kept ? `kept in Day ${d.day}` : 'added today'}</span>` : ''}</div>
          <div class="move-btns">
            <button type="button" class="ghost small" data-move="${slot.id}:up" ${n === 0 ? 'disabled' : ''} aria-label="Move ${esc(ex.name)} earlier">↑</button>
            <button type="button" class="ghost small" data-move="${slot.id}:down" ${n === all.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(ex.name)} later">↓</button>
            <button type="button" class="ghost small" data-move="${slot.id}:end" ${n === all.length - 1 ? 'disabled' : ''} title="Equipment busy? Do it last">Later</button>
          </div>
        </div>
        <select data-ex="${slot.id}" aria-label="Exercise for ${MUSCLES[slot.muscle]}">
          ${slotOptions(slot).map((k) => `<option value="${k}" ${k === e.exercise ? 'selected' : ''}>${esc(EXERCISES[k].name)} · ${EXERCISES[k].equip}</option>`).join('')}
        </select>
        <div class="target"><b>${e.sets.length} × ${lo}–${hi} reps</b> · RIR ${d.week === 5 && ex.kind === 'isolation' ? '0 on last set' : wk.rir} · rest ${slot.rest}</div>
        <div class="small muted">${esc(sug.text)} ${esc(ex.cue)}</div>
        ${load ? `<div class="small plate-hint">Load ${sug.weight} lb: <b>${platesText(load)}</b> per side on a ${lift.bar || 45} lb bar</div>` : ''}
        ${ex.bw && !bw ? `<form class="bw-ask small" data-bwform>Bodyweight exercise: what do you weigh?
          <input type="number" inputmode="decimal" step="any" min="50" max="700" name="bw" placeholder="lb" required aria-label="Your body weight in pounds">
          <button type="submit" class="small">Save</button><span class="muted">Also saved as today's weigh-in.</span></form>` : ''}
        <div class="sets">
          ${e.sets.map((s, j) => `
            <div class="setrow ${s.done ? 'done' : ''} ${barbell ? 'has-plates' : ''}">
              <span class="small muted">Set ${j + 1}</span>
              ${ex.bw ? `<span class="bw-chip" title="Body weight">BW${bw ? ` ${bw}` : ''}</span>` : `<input type="number" inputmode="decimal" step="any" min="0" data-w="${slot.id}:${j}" value="${s.w}" placeholder="lb" aria-label="Set ${j + 1} weight">`}
              ${barbell ? `<button type="button" class="plate-btn" data-plates="${slot.id}:${j}" aria-label="Count plates for set ${j + 1}">⦿</button>` : ''}
              <span class="muted">×</span>
              <input type="number" inputmode="numeric" min="0" max="100" data-r="${slot.id}:${j}" value="${s.r}" placeholder="${hi}" aria-label="Set ${j + 1} reps">
              <button type="button" class="tick" data-done="${slot.id}:${j}" aria-label="Mark set ${j + 1} done">${s.done ? '✓' : '○'}</button>
            </div>`).join('')}
        </div>
        <div class="set-tools">
          <button type="button" class="ghost small" data-addset="${slot.id}">+ Add set</button>
          <button type="button" class="ghost small" data-rmset="${slot.id}" ${e.sets.length <= 1 ? 'disabled' : ''}>− Remove set</button>
          ${e.sets.some((x) => !x.done) ? `<button type="button" class="ghost small" data-checkall="${slot.id}">✓ Check all</button>` : ''}
          ${lift.extraSets[slot.id] ? `<span class="small muted">Plan: ${setsFor(slot, d.week, i)} sets · <button type="button" class="linkish" data-resetsets="${slot.id}">Back to plan</button></span>` : ''}
        </div>
        <div class="set-tools">
          <button type="button" class="ghost small" data-addex="${slot.id}">+ Add exercise after</button>
          ${slot.added ? `${kept ? `<button type="button" class="ghost small" data-unkeep="${slot.id}">Remove from Day ${d.day}</button>` : `<button type="button" class="ghost small" data-keep="${slot.id}">📌 Keep in Day ${d.day}</button>`}
            <button type="button" class="ghost small" data-rmex="${slot.id}">✕ Remove</button>` : ''}
        </div>
        ${addingAfter === slot.id ? addPanel(slot) : ''}
      </div>`;
    }).join('')}
    <div class="row">
      <button id="finishLift">Finish workout</button>
      <button class="ghost" id="resetLift">Reset session</button>
    </div>`;

  renderHistory();
  renderLibrary();
}

// Shown when today's order isn't the plan's: keep it for this day, or go back.
function orderBar() {
  const d = lift.draft;
  const now = sessionSlots().map((s) => s.id);
  const plan = planOrder();
  const saved = lift.order[d.day];
  if (sameOrder(now, plan)) return '';
  const savedNow = saved && !d.order;
  return `<div class="order-bar small">
    ${savedNow ? `Your Day ${d.day} order.` : 'Order changed for today.'}
    ${savedNow ? '' : `<button type="button" class="linkish" data-order="keep">📌 Keep this order for Day ${d.day}</button> ·`}
    <button type="button" class="linkish" data-order="reset">Back to plan order</button>
  </div>`;
}

// ---------- voice / text commands ----------
const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
let cmdFeedback = '';
let undoDraft = null;
let lastSlotId = null;

// Apply parsed actions to today's session. Returns lines describing what happened.
export function applyActions(actions) {
  const d = lift.draft;
  const lines = [];
  undoDraft = JSON.stringify({ draft: d, kept: lift.kept, order: lift.order });
  for (const a of actions) {
    if (a.type === 'weight') {
      window.dispatchEvent(new CustomEvent('lp:weighin', { detail: a.lb }));
      lines.push(`✓ ${describe(a)}`);
      continue;
    }
    if (a.type === 'check') {
      const all = sessionSlots();
      const slots = a.all ? all
        : a.index ? [all.at(a.index === -1 ? -1 : a.index - 1)].filter((x) => x && (a.index === -1 || a.index <= all.length))
        : a.muscle ? all.filter((x) => EXERCISES[d.entries[x.id]?.exercise]?.muscle === a.muscle)
        : all.filter((x) => d.entries[x.id]?.exercise === a.exercise);
      if (!slots.length) { lines.push(`• ${describe(a).replace('Checked ', '')} isn't in today's session`); continue; }
      for (const slot of slots) {
        const sets = checkSlot(slot.id);
        const ex = EXERCISES[d.entries[slot.id].exercise];
        const noWeight = !ex.bw && sets.some((x) => x.w === '');
        lines.push(`✓ ${ex.name}: ${sets.length} set${sets.length > 1 ? 's' : ''} × ${sets.map((x) => x.r).join(', ')}${noWeight ? ' (enter the weights)' : ''}`);
        lastSlotId = slot.id;
      }
      continue;
    }
    if (a.type === 'move') {
      const all = sessionSlots();
      // A target is an exercise id, or {exercise} / {muscle} / {index} from the parser.
      const find = (t) => {
        if (typeof t === 'string') t = { exercise: t };
        if (t.index) return t.index === -1 ? all.at(-1) : all[t.index - 1];
        if (t.muscle) return all.find((x) => EXERCISES[d.entries[x.id]?.exercise]?.muscle === t.muscle);
        return all.find((x) => d.entries[x.id]?.exercise === t.exercise);
      };
      const slot = find(a);
      const other = a.after || a.before ? find(a.after || a.before) : null;
      if (!slot || ((a.after || a.before) && !other)) { lines.push(`• Couldn't find ${!slot ? 'that exercise' : 'where to put it'} in today's session`); continue; }
      if (a.to === 'up' || a.to === 'down') for (let k = 0; k < (a.steps || 1); k++) moveExercise(slot.id, { to: a.to });
      else moveExercise(slot.id, a.after ? { after: other.id } : a.before ? { before: other.id } : { to: a.to });
      const pos = sessionSlots().findIndex((x) => x.id === slot.id) + 1;
      lines.push(`✓ ${describe(a)}: ${EXERCISES[d.entries[slot.id].exercise].name} is now #${pos}`);
      lastSlotId = slot.id;
      continue;
    }
    let slot = a.exercise ? sessionSlots().find((s) => d.entries[s.id]?.exercise === a.exercise) : null;
    if (!slot && !a.exercise) {
      // No exercise named: the last one you used, else the first one with sets left.
      slot = (lastSlotId && slotById(lastSlotId)) || sessionSlots().find((s) => d.entries[s.id]?.sets.some((x) => x.r === ''));
    }
    if (!slot && a.exercise) {
      const afterSlot = a.after && sessionSlots().find((s) => d.entries[s.id]?.exercise === a.after);
      const id = addExercise(a.exercise, afterSlot?.id || lastSlotId || undefined, false);
      slot = slotById(id);
      if (a.type === 'add') { lines.push(`✓ ${describe(a)}`); lastSlotId = id; continue; }
    } else if (a.type === 'add') {
      lines.push(`• ${describe(a).replace('Added ', '')} is already in today's session`);
      lastSlotId = slot.id;
      continue;
    }
    if (!slot) { lines.push('• Say which exercise, e.g. "squats 3 sets of 5 at 185"'); continue; }
    const sets = d.entries[slot.id].sets;
    let k = sets.findIndex((x) => x.r === '');
    if (k < 0) k = sets.length;
    for (const st of a.sets) {
      if (!sets[k]) sets.push({ w: '', r: '', done: false });
      const prevW = sets[k].w !== '' ? sets[k].w : [...sets].slice(0, k).reverse().find((x) => x.w !== '')?.w ?? '';
      sets[k].w = EXERCISES[d.entries[slot.id].exercise].bw ? bodyWeight() ?? '' : st.w ?? prevW;
      sets[k].r = st.r;
      sets[k].done = true;
      k++;
    }
    lastSlotId = slot.id;
    lines.push(`✓ ${describe({ ...a, exercise: d.entries[slot.id].exercise })}`);
  }
  save();
  return lines;
}

function runCommand(text) {
  const ids = sessionSlots().map((s) => lift.draft.entries[s.id]?.exercise).filter(Boolean);
  const { actions, understood } = parseCommand(text, ids);
  if (!understood) {
    cmdFeedback = `<span class="tone-warn">Didn't catch that.</span> Try “bench 3 sets of 8 at 135” or “split squats 40 for 10, 10, 8”.`;
    window.dispatchEvent(new CustomEvent('lp:assistant', { detail: { text, message: cmdFeedback, context: { exercises: ids, day: lift.draft.day } } }));
  } else {
    cmdFeedback = `${applyActions(actions).map(esc).join('<br>')} <button type="button" class="linkish" id="cmdUndo">Undo</button>`;
  }
  renderLift();
}

// Called by the app when Claude turns a request into actions.
export function applyAssistantActions(actions, note = '') {
  cmdFeedback = `${applyActions(actions).map(esc).join('<br>')}${note ? `<br><span class="muted">${esc(note)}</span>` : ''} <button type="button" class="linkish" id="cmdUndo">Undo</button>`;
  renderLift();
}
export function setCommandFeedback(html) { cmdFeedback = html; const el = $('#cmdResult'); if (el) el.innerHTML = html; }

// Picker for a new exercise: muscle group, then exercise.
let addingAfter = null;
let addMuscle = null;
function addPanel(slot) {
  const m = addMuscle || slot.muscle;
  return `<div class="add-panel">
    <div class="small"><b>Add an exercise after this one</b></div>
    <select data-addmuscle aria-label="Muscle group">${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select data-addpick aria-label="Exercise">${Object.entries(EXERCISES).filter(([, e]) => e.muscle === m).map(([k, e]) => `<option value="${k}">${esc(e.name)} · ${e.equip}</option>`).join('')}</select>
    <div class="row" style="margin-top:0">
      <button type="button" class="small" data-addtoday="${slot.id}">Add for today</button>
      <button type="button" class="ghost small" data-addkeep="${slot.id}">Add & keep in Day ${lift.draft.day}</button>
      <button type="button" class="ghost small" data-addcancel>Cancel</button>
    </div>
  </div>`;
}

function renderHistory() {
  const list = [...lift.sessions].reverse().slice(0, 12);
  $('#liftHistory').innerHTML = list.length ? list.map((s) => {
    const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
    const best = s.entries.filter((e) => e.sets.length).slice(0, 2).map((e) => {
      const top = e.sets.reduce((m, x) => (x.w > m.w ? x : m), e.sets[0]);
      return `${EXERCISES[e.exercise].name} ${top.w}×${top.r}`;
    }).join(' · ');
    return `<li><span>${new Date(s.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Day ${s.day}, wk ${s.week === 6 ? 'DL' : s.week}
      <small class="muted">${esc(best)}</small></span><span class="small">${sets} sets</span></li>`;
  }).join('') : '<li class="muted">Finished workouts show up here.</li>';
}

function renderLibrary() {
  $('#libraryChips').innerHTML = Object.entries(MUSCLES).map(([k, v]) => `<button type="button" class="chip ${k === libraryMuscle ? 'on' : ''}" data-muscle="${k}">${v}</button>`).join('');
  $('#libraryList').innerHTML = Object.entries(EXERCISES).filter(([, e]) => e.muscle === libraryMuscle).map(([, e]) => `
    <li><span>${esc(e.name)}<small class="muted">${esc(e.cue)}</small></span><span class="small">${e.equip}<br><span class="muted">${e.kind}</span></span></li>`).join('');
}

// ---------- plate calculator ----------
let plateRef = null;
let plateCounts = {};

function openPlates(ref) {
  plateRef = ref;
  const [slotId, j] = ref.split(':');
  const set = lift.draft.entries[slotId].sets[+j];
  // Start from the plates you loaded for this set, else split the weight in the box.
  plateCounts = set.plates && plateTotal(lift.bar || 45, set.plates) === +set.w
    ? { ...set.plates }
    : (set.w && platesFor(+set.w, lift.bar || 45, lift.use35 ? PLATES : PLATES.filter((x) => x !== 35))) || {};
  const ex = EXERCISES[lift.draft.entries[slotId].exercise];
  $('#plateTitle').textContent = `${ex.name} · set ${+j + 1}`;
  $('#plateBar').value = String(lift.bar || 45);
  renderPlates();
  $('#plateDialog').showModal();
}

function renderPlates() {
  const bar = +$('#plateBar').value;
  $('#plateRows').innerHTML = PLATES.map((p) => `
    <div class="plate-row">
      <span class="plate-chip p${String(p).replace('.', '_')}">${p}</span>
      <button type="button" class="ghost small" data-pminus="${p}" aria-label="One less ${p}">−</button>
      <b>${plateCounts[p] || 0}</b>
      <button type="button" class="ghost small" data-pplus="${p}" aria-label="One more ${p}">+</button>
    </div>`).join('');
  const total = plateTotal(bar, plateCounts);
  $('#plateTotal').innerHTML = `<b>${total} lb</b><span class="small muted">${bar} bar + 2 × ${total / 2 - bar / 2} (${platesText(plateCounts)} per side)</span>`;
  $('#plateUse').textContent = `Use ${total} lb`;
}

function initPlates() {
  $('#plateRows').onclick = (e) => {
    const plus = e.target.closest('[data-pplus]')?.dataset.pplus;
    const minus = e.target.closest('[data-pminus]')?.dataset.pminus;
    if (plus) plateCounts[plus] = (plateCounts[plus] || 0) + 1;
    if (minus && plateCounts[minus]) plateCounts[minus] -= 1;
    renderPlates();
  };
  $('#plateBar').onchange = () => { lift.bar = +$('#plateBar').value; save(); renderPlates(); };
  $('#plateClear').onclick = () => { plateCounts = {}; renderPlates(); };
  $('#plateClose').onclick = () => $('#plateDialog').close();
  $('#plateUse').onclick = () => {
    const [slotId, j] = plateRef.split(':');
    const total = plateTotal(+$('#plateBar').value, plateCounts);
    const sets = lift.draft.entries[slotId].sets;
    // Fill this set and any later sets that are still empty or had the old weight.
    const old = sets[+j].w;
    if (plateCounts[35]) lift.use35 = true;
    sets.forEach((x, k) => {
      if (k === +j || (k > +j && !x.done && (x.w === '' || x.w === old))) { x.w = total; x.plates = { ...plateCounts }; }
    });
    save();
    $('#plateDialog').close();
    renderLift();
  };
}

export function initLift() {
  initPlates();
  $('#tab-lift').addEventListener('submit', (e) => {
    if (e.target.dataset.bwform != null) {
      e.preventDefault();
      const lb = +e.target.elements.bw.value;
      if (lb >= 50 && lb <= 700) window.dispatchEvent(new CustomEvent('lp:weighin', { detail: lb }));
      renderLift();
      return;
    }
    if (e.target.id !== 'cmdForm') return;
    e.preventDefault();
    const text = $('#cmdText').value.trim();
    if (text) runCommand(text);
  });
  const root = $('#tab-lift');
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.addmuscle != null) {
      addMuscle = t.value;
      renderLift();
      return;
    }
    if (t.dataset.addpick != null) return;
    if (t.id === 'liftDay' || t.id === 'liftWeek') {
      startDraft($('#liftDay').value, +$('#liftWeek').value);
      renderLift();
    } else if (t.dataset.ex) {
      const slotId = t.dataset.ex;
      const slot = slotById(slotId);
      const i = slot.added ? 99 : slotIndex(slotId);
      if (!slot.added) lift.choices[slotId] = t.value;
      else slot.default = t.value;
      lift.draft.entries[slotId] = { exercise: t.value, sets: newSets(t.value, slot, lift.draft.week, i) };
      save();
      renderLift();
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    const ref = t.dataset.w || t.dataset.r;
    if (!ref) return;
    const [slotId, j] = ref.split(':');
    lift.draft.entries[slotId].sets[+j][t.dataset.w ? 'w' : 'r'] = t.value === '' ? '' : +t.value;
    save();
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.done) {
      const [slotId, j] = t.dataset.done.split(':');
      const set = lift.draft.entries[slotId].sets[+j];
      set.done = !set.done;
      if (set.done && set.r === '') set.r = slotById(slotId).reps[1];
      save();
      renderLift();
    } else if (t.id === 'cmdUndo' && undoDraft) {
      const u = JSON.parse(undoDraft);
      lift.draft = u.draft; lift.kept = u.kept; lift.order = u.order || {}; undoDraft = null;
      cmdFeedback = 'Undone.';
      save();
      renderLift();
    } else if (t.id === 'cmdMic') {
      const rec = new SpeechRec();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      t.classList.add('listening');
      setCommandFeedback('Listening… say e.g. “squats three sets of five at one eighty-five”.');
      rec.onresult = (ev) => { const said = ev.results[0][0].transcript; $('#cmdText').value = said; runCommand(said); };
      rec.onerror = (ev) => setCommandFeedback(ev.error === 'not-allowed' ? 'Microphone access is off. Use the 🎤 on your keyboard instead.' : 'Didn\'t hear anything — try again or type it.');
      rec.onend = () => t.classList.remove('listening');
      rec.start();
    } else if (t.dataset.checkall) {
      checkSlot(t.dataset.checkall);
      save();
      renderLift();
    } else if (t.dataset.move) {
      const [id, to] = t.dataset.move.split(':');
      moveExercise(id, { to });
      renderLift();
      document.querySelector(`.lift[data-slot="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (t.dataset.order) {
      const d = lift.draft;
      if (t.dataset.order === 'keep') lift.order[d.day] = sessionSlots().map((s) => s.id);
      else delete lift.order[d.day];
      delete d.order;
      save();
      renderLift();
    } else if (t.dataset.addex) {
      addingAfter = addingAfter === t.dataset.addex ? null : t.dataset.addex;
      addMuscle = null;
      renderLift();
    } else if (t.dataset.addcancel != null) {
      addingAfter = null;
      renderLift();
    } else if (t.dataset.addtoday || t.dataset.addkeep) {
      const pick = t.closest('.add-panel').querySelector('[data-addpick]').value;
      addExercise(pick, t.dataset.addtoday || t.dataset.addkeep, !!t.dataset.addkeep);
      addingAfter = null;
      renderLift();
    } else if (t.dataset.keep || t.dataset.unkeep || t.dataset.rmex) {
      const id = t.dataset.keep || t.dataset.unkeep || t.dataset.rmex;
      const d = lift.draft;
      const kept = (lift.kept[d.day] ||= []);
      const slot = slotById(id);
      if (t.dataset.keep) { d.extra = d.extra.filter((x) => x.id !== id); kept.push(slot); }
      if (t.dataset.unkeep) { lift.kept[d.day] = kept.filter((x) => x.id !== id); (d.extra ||= []).push(slot); }
      if (t.dataset.rmex) {
        d.extra = (d.extra || []).filter((x) => x.id !== id);
        lift.kept[d.day] = kept.filter((x) => x.id !== id);
        delete d.entries[id];
      }
      save();
      renderLift();
    } else if (t.dataset.plates) {
      openPlates(t.dataset.plates);
    } else if (t.dataset.addset || t.dataset.rmset || t.dataset.resetsets) {
      const slotId = t.dataset.addset || t.dataset.rmset || t.dataset.resetsets;
      const slot = slotById(slotId);
      const plan = setsFor(slot, lift.draft.week, slot.added ? 99 : slotIndex(slotId));
      const sets = lift.draft.entries[slotId].sets;
      const lastW = [...sets].reverse().find((x) => x.w !== '')?.w ?? '';
      if (t.dataset.addset) {
        // A new set starts at the last weight you entered.
        sets.push({ w: lastW, r: '', done: false });
      } else if (t.dataset.rmset) {
        if (sets.length > 1) sets.pop();
      } else {
        while (sets.length > plan) sets.pop();
        while (sets.length < plan) sets.push({ w: lastW, r: '', done: false });
      }
      // Remember the change for this exercise slot in future sessions.
      const delta = sets.length - plan;
      if (delta) lift.extraSets[slotId] = delta; else delete lift.extraSets[slotId];
      save();
      renderLift();
    } else if (t.dataset.muscle) {
      libraryMuscle = t.dataset.muscle;
      renderLibrary();
    } else if (t.id === 'finishLift') {
      const d = lift.draft;
      const entries = sessionSlots().filter((s) => d.entries[s.id]).map((s) => [s.id, d.entries[s.id]]).map(([slot, e]) => ({
        slot, exercise: e.exercise, sets: e.sets.filter((s) => +s.r > 0).map((s) => ({ w: +s.w || 0, r: +s.r, ...(EXERCISES[e.exercise].bw ? { bw: true } : {}) })),
      }));
      if (!entries.some((e) => e.sets.length)) { t.textContent = 'Log at least one set first'; return; }
      lift.sessions.push({ date: isoDate(), block: lift.block, week: d.week, day: d.day, entries });
      lift.draft = null;
      save();
      renderLift();
      $('#liftDone').textContent = `Saved Day ${d.day}. Next up: Day ${blockPosition(blockSessions().length).day}.`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (t.id === 'resetLift') {
      startDraft(lift.draft.day, lift.draft.week);
      renderLift();
    } else if (t.id === 'newBlock') {
      lift.block += 1;
      lift.draft = null;
      save();
      renderLift();
    }
  });
}
