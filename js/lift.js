import {
  MUSCLES, EXERCISES, DAYS, WEEKS, slotOptions, setsFor, weeklySets, blockPosition, suggestLoad,
} from './lifting.js';

// Lift tab: today's full-body session, set logging, history and the exercise library.
const KEY = 'lp.lift';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lift)); } catch { /* blocked */ } };

let lift = { block: 1, choices: {}, sessions: [], draft: null, ...load() };
let libraryMuscle = 'quads';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const blockSessions = () => lift.sessions.filter((s) => s.block === lift.block);

function startDraft(day, week) {
  const slots = DAYS[day].slots;
  lift.draft = {
    day, week,
    entries: Object.fromEntries(slots.map((slot, i) => {
      const exercise = lift.choices[slot.id] || slot.default;
      return [slot.id, { exercise, sets: newSets(exercise, slot, week, i) }];
    })),
  };
  save();
}

function newSets(exercise, slot, week, index) {
  const s = suggestLoad(exercise, slot, lift.sessions, week);
  return Array.from({ length: setsFor(slot, week, index) }, () => ({ w: s.weight ?? '', r: '', done: false }));
}

export function renderLift() {
  const pos = blockPosition(blockSessions().length);
  if (!lift.draft) startDraft(pos.day, pos.week);
  const d = lift.draft;
  const wk = WEEKS[d.week - 1];
  const vol = weeklySets(d.week);

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
    ${day.slots.map((slot, i) => {
      const e = d.entries[slot.id];
      const ex = EXERCISES[e.exercise];
      const sug = suggestLoad(e.exercise, slot, lift.sessions, d.week);
      const [lo, hi] = slot.reps;
      return `
      <div class="lift" data-slot="${slot.id}">
        <div class="eyebrow">${MUSCLES[slot.muscle]} · ${ex.kind}</div>
        <select data-ex="${slot.id}" aria-label="Exercise for ${MUSCLES[slot.muscle]}">
          ${slotOptions(slot).map((k) => `<option value="${k}" ${k === e.exercise ? 'selected' : ''}>${esc(EXERCISES[k].name)} · ${EXERCISES[k].equip}</option>`).join('')}
        </select>
        <div class="target"><b>${e.sets.length} × ${lo}–${hi} reps</b> · RIR ${d.week === 5 && ex.kind === 'isolation' ? '0 on last set' : wk.rir} · rest ${slot.rest}</div>
        <div class="small muted">${esc(sug.text)} ${esc(ex.cue)}</div>
        <div class="sets">
          ${e.sets.map((s, j) => `
            <div class="setrow ${s.done ? 'done' : ''}">
              <span class="small muted">Set ${j + 1}</span>
              <input type="number" inputmode="decimal" step="2.5" min="0" data-w="${slot.id}:${j}" value="${s.w}" placeholder="lb" aria-label="Set ${j + 1} weight">
              <span class="muted">×</span>
              <input type="number" inputmode="numeric" min="0" max="100" data-r="${slot.id}:${j}" value="${s.r}" placeholder="${hi}" aria-label="Set ${j + 1} reps">
              <button type="button" class="tick" data-done="${slot.id}:${j}" aria-label="Mark set ${j + 1} done">${s.done ? '✓' : '○'}</button>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('')}
    <div class="row">
      <button id="finishLift">Finish workout</button>
      <button class="ghost" id="resetLift">Reset session</button>
    </div>`;

  renderHistory();
  renderLibrary();
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

export function initLift() {
  const root = $('#tab-lift');
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'liftDay' || t.id === 'liftWeek') {
      startDraft($('#liftDay').value, +$('#liftWeek').value);
      renderLift();
    } else if (t.dataset.ex) {
      const slotId = t.dataset.ex;
      const day = DAYS[lift.draft.day];
      const i = day.slots.findIndex((s) => s.id === slotId);
      lift.choices[slotId] = t.value;
      lift.draft.entries[slotId] = { exercise: t.value, sets: newSets(t.value, day.slots[i], lift.draft.week, i) };
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
      if (set.done && set.r === '') set.r = DAYS[lift.draft.day].slots.find((s) => s.id === slotId).reps[1];
      save();
      renderLift();
    } else if (t.dataset.muscle) {
      libraryMuscle = t.dataset.muscle;
      renderLibrary();
    } else if (t.id === 'finishLift') {
      const d = lift.draft;
      const entries = Object.entries(d.entries).map(([slot, e]) => ({
        slot, exercise: e.exercise, sets: e.sets.filter((s) => +s.r > 0).map((s) => ({ w: +s.w || 0, r: +s.r })),
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
