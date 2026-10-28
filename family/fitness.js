// 🏋️ Fitness (2.0 Phase 7): Today's Workout, adding a workout (build it, describe it, or from a
// photo — all the same workout model, js/workout.js), logging it round by round, and history.
// Loaded only when you open Fitness. Your workouts are locked with the family key and stored as two
// records of yours: Today's Workout (with saved workouts) and the history.
import * as W from '../js/workout.js';

const fx = { c: null, today: null, templates: [], log: [], todayAt: 0, logAt: 0, loaded: false, draft: null, draftFrom: null, legacy: [], timer: null, view: 'main', said: null, unread: [], reading: false, ai: null, pic: null };
export const state = fx;

// ctx: { api, fid, me, lock, unlock, esc, toast, openSheet, closeSheet, confirm, iso, el: () => #view, show, aiReady: () => Promise<bool> }
export async function load(c) {
  fx.c = c;
  const P = `/families/${c.fid}/members/${c.me}/workouts`;
  const [t, l] = await Promise.all([c.api.get(`${P}/today`), c.api.get(`${P}/log`)]);
  const td = t?.data ? await c.unlock(t.data.enc ?? t.data) : null, ld = l?.data ? await c.unlock(l.data.enc ?? l.data) : null;
  if ((t?.data && !td) || (l?.data && !ld)) throw Object.assign(new Error('🔒 This device needs the family key first — Me › 🔐 Encryption'), { locked: true });
  fx.today = td?.today ? W.normalize(td.today) : null;
  fx.templates = (td?.templates || []).map(W.normalize).slice(0, 30);
  fx.log = (ld?.log || []).map(W.normalize);
  fx.todayAt = t?.savedAt || 0; fx.logAt = l?.savedAt || 0; fx.loaded = true;
}
// Older workouts (the trackers' lifting sessions and device workouts), read-only in history.
export function setLegacy(data, names = {}) {
  fx.legacy = [...(data?.lift?.sessions || []).map((s) => W.fromLiftSession(s, names)), ...(data?.workoutHistory || []).filter((x) => x?.start).slice(-200).map(W.fromDeviceWorkout)];
}
const history = () => [...fx.log, ...fx.legacy.filter((x) => !fx.log.some((y) => y.id === x.id))].filter((w) => w.status === 'done').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.doneAt || 0) - (a.doneAt || 0));

// ---------- saving (batched; never over a newer copy from another phone) ----------
async function put(which, payload, base) {
  const c = fx.c;
  return c.api.put(`/families/${c.fid}/members/${c.me}/workouts/${which}`, { data: await c.lock(payload), base });
}
export function saveToday(now = false) {
  clearTimeout(fx.timer);
  const go = async () => {
    try { const r = await put('today', { today: fx.today, templates: fx.templates }, fx.todayAt); fx.todayAt = r.savedAt; }
    catch (e) {
      if (e.status !== 409) return fx.c.toast(`Couldn't save — ${e.message}`);
      // Saved on another phone meanwhile: theirs wins for the plan; keep going from it.
      await load(fx.c); fx.c.toast('Updated from your other device'); render();
    }
  };
  if (now) return go();
  fx.timer = setTimeout(go, 1200);
  return null;
}
async function appendLog(w) {
  for (let i = 0; i < 2; i++) {
    try { const r = await put('log', { log: [w, ...fx.log.filter((x) => x.id !== w.id)].slice(0, 400) }, fx.logAt); fx.log = [w, ...fx.log.filter((x) => x.id !== w.id)].slice(0, 400); fx.logAt = r.savedAt; return; }
    catch (e) { if (e.status !== 409 || i) throw e; await load(fx.c); }
  }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && fx.timer) saveToday(true); });

// ---------- the Health card ----------
export function card(esc) {
  const t = fx.today && fx.today.status !== 'done' ? fx.today : null, s = t ? W.summary(t) : null;
  const last = history()[0];
  return `${t ? `<button type="button" class="fx-today" data-fx="open"><span class="grow"><b>Today's Workout · ${esc(t.title)}</b><small class="muted">${s.done} of ${s.sets} sets${t.status === 'active' ? ' · in progress' : ''}</small></span><span class="go">${t.status === 'active' ? 'Continue' : 'Start'} ›</span></button>` : ''}
    <button type="button" class="${t ? 'ghost ' : ''}wide" data-fx="add">＋ Add Workout</button>
    ${last ? `<p class="tiny muted">Last: ${esc(last.title)} · ${esc(last.date || '')}</p>` : ''}
    <button type="button" class="linkish small" data-fx="main">All workouts and history ›</button>`;
}

// ---------- screens ----------
const E = (s) => fx.c.esc(s);
export function render() {
  const el = fx.c?.el();
  if (!el) return;
  if (fx.view === 'edit' && fx.draft) el.innerHTML = editorHtml();
  else if (fx.view === 'describe') el.innerHTML = describeHtml();
  else if (fx.view === 'photo') el.innerHTML = photoHtml();
  else if (fx.view === 'log' && fx.today) el.innerHTML = loggerHtml();
  else { fx.view = 'main'; el.innerHTML = mainHtml(); }
}
function mainHtml() {
  const t = fx.today && fx.today.status !== 'done' ? fx.today : null;
  const h = history().slice(0, 25);
  return `<section class="fx-head"><h2><button type="button" class="linkish" data-view="health" aria-label="Back to Health">‹</button> 🏋️ Fitness</h2></section>
    ${t ? `<section class="card fx-todaycard"><div class="eyebrow">Today's Workout</div><h3>${E(t.title)}</h3>${W.describe(t).map((l) => `<p class="small">${E(l)}</p>`).join('')}
      <div class="row"><button type="button" class="grow" data-fx="open">${t.status === 'active' ? 'Continue' : 'Start'} ›</button><button type="button" class="ghost" data-fx="edittoday">Edit</button></div></section>` : ''}
    <section class="card"><h3 class="card-h">＋ Add Workout</h3>
      <div class="fx-paths"><button type="button" data-fx="build"><b>✍️</b>Build it</button><button type="button" data-fx="describe"><b>💬</b>Describe it</button>${fx.ai !== false ? '<button type="button" data-fx="photo"><b>📷</b>Photo</button>' : ''}</div>
      ${fx.templates.length ? `<p class="small muted">Saved: ${fx.templates.slice(0, 6).map((w, i) => `<button type="button" class="linkish small" data-fx="tpl:${i}">${E(w.title)}</button>`).join(' · ')}</p>` : ''}</section>
    <h3 class="wl-h">History</h3>
    ${h.length ? h.map((w) => { const s = W.summary(w); return `<button type="button" class="card fx-hist" data-fx="hist:${E(w.id)}"><span class="grow"><b>${E(w.title)}</b><small class="muted">${E(w.date || '')}${w.source === 'device' ? ` · ${w.activity?.minutes ?? '?'} min` : ` · ${s.exercises} exercise${s.exercises === 1 ? '' : 's'} · ${s.done || s.sets} sets`}</small></span><span class="go">›</span></button>`; }).join('') : '<p class="small muted pad">Finished workouts show here.</p>'}`;
}
// 💬 Describe it: type it the way you'd text it. Your phone reads it first; only if it can't place
// something does it offer Claude — and only when you tap, with only the words you typed.
function describeHtml() {
  const d = fx.said || { text: '' };
  const got = d.local ? W.summary(d.local.workout).exercises : 0;
  return `<section class="fx-head"><h2><button type="button" class="linkish" data-fx="main" aria-label="Back to Fitness">‹</button> 💬 Describe it</h2></section>
    <section class="card"><label for="fxSaid" class="small">Your workout, the way you'd text it</label>
      <textarea id="fxSaid" rows="6" maxlength="1500" placeholder="Bench 3x10 @ 135, then pull-ups 3x8\n4 rounds: overhead press 12/12/11/11, row 12/13/14/13">${E(d.text)}</textarea>
      <button type="button" class="wide" data-fx="read">Read it</button></section>
    ${d.local ? `<section class="card" role="status"><p class="small">${got ? `Read ${got} exercise${got === 1 ? '' : 's'}.` : 'Couldn\'t read a workout in that yet.'}${d.local.unread.length ? ` Couldn't place: ${d.local.unread.map((x) => `“${E(x)}”`).join(', ')}.` : ''}</p>
      <div class="row wrap">${got ? '<button type="button" class="grow" data-fx="reviewlocal">Review it</button>' : ''}${fx.ai !== false ? `<button type="button" class="${got ? 'ghost ' : ''}grow" data-fx="readai" ${fx.reading ? 'disabled' : ''}>${fx.reading ? 'Reading…' : 'Read it with Claude'}</button>` : ''}</div>
      ${fx.ai !== false ? '<p class="tiny muted">Sends only the words above to Claude (Anthropic) to read them — nothing else goes with them. We don\'t keep them; Anthropic doesn\'t train on them and deletes them after a short safety check period.</p>' : '<p class="tiny muted">Fix what wasn\'t placed in the review, or say it another way.</p>'}</section>` : ''}`;
}
async function readSaid() {
  const text = (document.getElementById('fxSaid')?.value || '').trim();
  if (!text) return fx.c.toast('Type your workout first');
  const T = await import('../js/workoutText.js');
  const local = T.parseWorkout(text, { today: fx.c.iso() });
  if (!T.needsHelp(local)) { fx.said = null; fx.unread = []; return edit(local.workout); }
  fx.said = { text, local };
  if (fx.ai == null) fx.ai = await fx.c.aiReady().catch(() => false);
  return render();
}
async function readWithClaude() {
  const c = fx.c, text = fx.said?.text;
  if (!text || fx.reading) return;
  fx.reading = true; render();
  try {
    const r = await c.api.post('/ai/workout', { text, unit: 'lb', today: c.iso() });
    fx.said = null; fx.unread = r.unread || [];
    return edit(r.workout);
  } catch (e) {
    if (e.status === 501) fx.ai = false;
    c.toast(e.status === 501 ? 'Reading with Claude isn\'t set up here — review what your phone read' : e.message);
    return render();
  } finally { fx.reading = false; }
}

// 📷 From a photo: a handwritten plan, a whiteboard or a screenshot. Nothing leaves the phone until
// you tap Read it; then only this one picture goes — redrawn first, so it carries no location or
// camera details — and it isn't kept anywhere: not on the connector, not in your workouts.
function photoHtml() {
  const p = fx.pic;
  if (fx.ai === false) return `<section class="fx-head"><h2><button type="button" class="linkish" data-fx="main" aria-label="Back to Fitness">‹</button> 📷 From a photo</h2></section>
    <section class="card"><p class="small">Reading photos isn't set up here yet. 💬 Describe it or ✍️ Build it work the same way.</p><div class="row"><button type="button" class="grow" data-fx="describe">💬 Describe it</button><button type="button" class="ghost grow" data-fx="build">✍️ Build it</button></div></section>`;
  return `<section class="fx-head"><h2><button type="button" class="linkish" data-fx="main" aria-label="Back to Fitness">‹</button> 📷 From a photo</h2></section>
    <section class="card">
      ${p?.url ? `<img class="fx-pic" src="${p.url}" alt="The photo you chose">` : '<p class="small">A photo or screenshot of a workout — handwritten, on a whiteboard, or from an app or a message.</p>'}
      <input type="file" accept="image/*" data-fxpick hidden><button type="button" class="wide ${p?.url ? 'ghost' : ''}" data-fx="pickpic">${p?.url ? 'Choose another' : 'Choose a photo or screenshot'}</button>
      ${p?.url ? `<button type="button" class="wide" data-fx="readpic" ${fx.reading ? 'disabled' : ''}>${fx.reading ? 'Reading… usually 5–20 seconds' : 'Read it'}</button>` : ''}
      ${p?.error ? `<p class="small" role="alert">${E(p.error)}</p>` : ''}
      <p class="tiny muted">Read it sends only this picture — redrawn on your phone first, so no location or camera details — to Claude (Anthropic) to read the workout. It isn't kept: not by us, not in your workouts. Anthropic doesn't train on it and deletes it after a short safety check period.</p></section>`;
}
// Redraw the picture (drops location/camera data and shrinks it to what's needed to read text).
async function redraw(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('no picture');
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  return { blob, b64 };
}
export async function onPick(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (fx.pic?.url) URL.revokeObjectURL(fx.pic.url);
  try {
    const { blob, b64 } = await redraw(file);
    fx.pic = { url: URL.createObjectURL(blob), b64 };
  } catch { fx.pic = { error: "Couldn't open that picture — try a screenshot, or a JPEG or PNG." }; }
  input.value = '';
  render();
}
function dropPic() { if (fx.pic?.url) URL.revokeObjectURL(fx.pic.url); fx.pic = null; }
async function readPic() {
  const c = fx.c, p = fx.pic;
  if (!p?.b64 || fx.reading) return;
  fx.reading = true; render();
  const asked = p;
  try {
    const r = await c.api.post('/ai/workout', { image: p.b64, mime: 'image/jpeg', unit: 'lb', today: c.iso() });
    if (fx.pic !== asked || fx.view !== 'photo') return null; // left or chose another meanwhile
    dropPic(); fx.unread = r.unread || [];
    if (!r.workout?.blocks?.length) { fx.pic = null; fx.said = { text: '' }; c.toast("Couldn't find a workout in that picture"); return null; }
    return edit(r.workout);
  } catch (e) {
    if (e.status === 501) fx.ai = false;
    if (fx.pic === asked) asked.error = e.status === 501 ? '' : e.status === 429 ? e.message : !navigator.onLine ? "You're offline — try again when you're connected." : e.message || "Couldn't read that photo — try a clearer one, or type it.";
    return render();
  } finally { fx.reading = false; if (fx.view === 'photo') render(); }
}

// The editor — for building a workout, and for reviewing one read from words or a photo.
const measureOf = (it) => (it.sets.some((s) => s.time != null) ? 'time' : it.sets.some((s) => s.distance != null) ? 'distance' : it.sets.every((s) => s.bw) ? 'bw' : 'reps');
const unsure = (o, f) => (o?.uncertain || []).includes(f);
function setCell(bi, ii, si, s, m) {
  const inp = (f, ph, val, extra = '') => `<input class="${unsure(s, f) ? 'unsure' : ''}" inputmode="decimal" data-fxe="${f}:${bi}:${ii}:${si}" value="${val ?? ''}" placeholder="${ph}" aria-label="${ph}, round ${si + 1}${unsure(s, f) ? ' — check this' : ''}" ${extra}>`;
  return `<div class="fx-set"><small>${si + 1}</small>${m === 'time' ? inp('time', 'sec', s.time) : m === 'distance' ? inp('distance', s.distUnit, s.distance) : inp('reps', 'reps', s.reps)}${m === 'reps' ? inp('weight', s.unit, s.weight) : ''}</div>`;
}
function editorHtml() {
  const w = fx.draft, u = W.uncertain(w), p = W.problems(w);
  const fromAi = w.source === 'text' || w.source === 'photo';
  return `<section class="fx-head"><h2><button type="button" class="linkish" data-fx="cancel" aria-label="Back">‹</button> ${fromAi ? 'Review Workout' : fx.draftFrom === 'today' ? 'Edit workout' : 'Build a workout'}</h2></section>
    ${fromAi ? `<p class="small muted pad">${w.source === 'photo' ? 'Read from your photo' : 'Read from what you wrote'}. Check it before adding — nothing is saved until you tap Add.</p>` : ''}
    ${fromAi && fx.unread.length ? `<p class="small pad">Not placed: ${fx.unread.map((x) => `“${E(x)}”`).join(', ')}</p>` : ''}
    ${u.length ? `<div class="note warn" role="status">⚠️ ${u.length} thing${u.length === 1 ? '' : 's'} to check — highlighted below.</div>` : ''}
    <label class="fx-title">Name<input data-fxe="title" value="${E(w.title)}" maxlength="80"></label>
    ${w.blocks.map((b, bi) => `<section class="card fx-block">
      <div class="row between"><b class="${unsure(b, 'kind') ? 'unsure-t' : ''}">${b.items.length > 1 ? (b.kind === 'circuit' ? '🔁 Circuit' : '🔗 Superset') : '🏋️ Straight sets'}</b>
        <span class="fx-rounds ${unsure(b, 'rounds') ? 'unsure-t' : ''}"><button type="button" class="icon-btn" data-fx="rounds:${bi}:-1" aria-label="One ${b.items.length > 1 ? 'round' : 'set'} fewer">−</button><span>${b.rounds} ${b.items.length > 1 ? 'round' : 'set'}${b.rounds === 1 ? '' : 's'}</span><button type="button" class="icon-btn" data-fx="rounds:${bi}:1" aria-label="One more">＋</button></span>
        <button type="button" class="icon-btn" data-fx="delblock:${bi}" aria-label="Remove this part">✕</button></div>
      ${b.items.map((it, ii) => { const m = measureOf(it); return `<div class="fx-item">
        <div class="row"><input class="fx-name ${unsure(it, 'name') ? 'unsure' : ''}" data-fxe="name:${bi}:${ii}" value="${E(it.name)}" placeholder="Exercise" aria-label="Exercise name${unsure(it, 'name') ? ' — check this' : ''}">
          ${b.items.length > 1 || w.blocks.length > 1 ? `<button type="button" class="icon-btn" data-fx="delitem:${bi}:${ii}" aria-label="Remove ${E(it.name || 'exercise')}">✕</button>` : ''}</div>
        <select class="fx-measure" data-fxe="measure:${bi}:${ii}" aria-label="Measured in">${[['reps', 'Reps × weight'], ['bw', 'Reps (bodyweight)'], ['time', 'Time'], ['distance', 'Distance']].map(([k, l]) => `<option value="${k}" ${m === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="fx-sets"><div class="fx-set fx-lab" aria-hidden="true"><small>${b.items.length > 1 ? 'round' : 'set'}</small>${m === 'time' ? '<span>sec</span>' : m === 'distance' ? `<span>${E(it.sets[0]?.distUnit || 'mi')}</span>` : '<span>reps</span>'}${m === 'reps' ? `<span>${E(it.sets[0]?.unit || 'lb')}</span>` : ''}</div>${it.sets.map((s, si) => setCell(bi, ii, si, s, m)).join('')}</div></div>`; }).join('')}
      <button type="button" class="linkish small" data-fx="additem:${bi}">＋ Add an exercise to this ${b.items.length > 1 ? (b.kind === 'circuit' ? 'circuit' : 'superset') : 'part (makes a superset)'}</button></section>`).join('')}
    <div class="row wrap fx-add"><button type="button" class="ghost small" data-fx="addblock:1">＋ Exercise</button><button type="button" class="ghost small" data-fx="addblock:2">＋ Superset</button><button type="button" class="ghost small" data-fx="addblock:3">＋ Circuit</button></div>
    <p class="small muted pad" id="fxProblems">${p.map(E).join(' ')}</p>
    <div class="fx-foot"><button type="button" class="ghost" data-fx="cancel">Cancel</button><button type="button" data-fx="savedraft" ${p.length ? 'disabled' : ''}>${fx.draftFrom === 'today' ? 'Save' : "Add to Today's Workout"}</button></div>`;
}
// Logging: round by round; a done round folds away. ✓ logs it as planned, or with what you typed.
function loggerHtml() {
  const w = fx.today, s = W.summary(w);
  const target = (x) => [x.reps != null ? `${x.reps}${x.bw ? '' : ''} reps` : '', x.time != null ? W.setText({ time: x.time }) : '', x.distance != null ? `${x.distance} ${x.distUnit}` : '', x.bw ? 'bodyweight' : x.weight != null ? `${x.weight} ${x.unit}` : ''].filter(Boolean).join(' · ');
  return `<section class="fx-head"><h2><button type="button" class="linkish" data-fx="main" aria-label="Back to Fitness">‹</button> ${E(w.title)}</h2><span class="small muted">${s.done} of ${s.sets} sets</span></section>
    <div class="fx-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.sets}" aria-valuenow="${s.done}"><i style="width:${s.sets ? Math.round((s.done / s.sets) * 100) : 0}%"></i></div>
    ${w.blocks.map((b, bi) => `<section class="card fx-block"><b>${b.items.length > 1 ? `${b.kind === 'circuit' ? '🔁 Circuit' : '🔗 Superset'} · ${b.rounds} rounds` : `🏋️ ${E(b.items[0]?.name || '')}`}</b>
      ${[...Array(b.rounds).keys()].map((r) => { const all = b.items.every((it) => it.sets[r]?.done);
        return all ? `<p class="small muted fx-rdone">✓ ${b.items.length > 1 ? `Round ${r + 1}` : `Set ${r + 1}`} — ${b.items.map((it) => E(W.setText({ ...it.sets[r], ...it.sets[r].got }))).join(' · ')} <button type="button" class="linkish tiny" data-fx="undo:${bi}:${r}">undo</button></p>`
          : `<div class="fx-round">${b.items.length > 1 ? `<div class="small"><b>Round ${r + 1}</b></div>` : ''}${b.items.map((it, ii) => { const x = it.sets[r], g = x.got || {}, m = measureOf(it); return `<div class="fx-logrow ${x.done ? 'done' : ''}">
            <span class="grow"><b>${b.items.length > 1 ? E(it.name) : `Set ${r + 1}`}</b><small class="muted">${E(target(x)) || 'as you like'}</small></span>
            ${x.done ? `<span class="small">✓ ${E(W.setText({ ...x, ...g }))}</span>` : `<span class="fx-in">${m === 'time' ? `<input inputmode="numeric" data-fxl="time:${bi}:${ii}:${r}" value="${x.time ?? ''}" aria-label="Seconds" placeholder="sec">` : m === 'distance' ? `<input inputmode="decimal" data-fxl="distance:${bi}:${ii}:${r}" value="${x.distance ?? ''}" aria-label="Distance" placeholder="${x.distUnit}">` : `<input inputmode="numeric" data-fxl="reps:${bi}:${ii}:${r}" value="${x.reps ?? ''}" aria-label="Reps" placeholder="reps">${m === 'reps' ? `<input inputmode="decimal" data-fxl="weight:${bi}:${ii}:${r}" value="${x.weight ?? ''}" aria-label="Weight (${x.unit})" placeholder="${x.unit}">` : ''}`}</span>
              <button type="button" class="fx-check" data-fx="log:${bi}:${ii}:${r}" aria-label="Done: ${E(it.name)}, ${b.items.length > 1 ? 'round' : 'set'} ${r + 1}">✓</button>`}</div>`; }).join('')}</div>`; }).join('')}
    </section>`).join('')}
    <div class="fx-foot"><button type="button" class="ghost" data-fx="edittoday">Edit</button><button type="button" data-fx="finish">Finish workout</button></div>`;
}

// ---------- actions ----------
function setToday(w) { fx.today = w; saveToday(); }
async function startWith(w, source) {
  const fresh = W.normalize({ ...w, date: fx.c.iso(), status: 'planned', source: source || w.source });
  if (fx.today && fx.today.status !== 'done' && W.summary(fx.today).done && !fx.c.confirm(`Replace "${fx.today.title}"? What you've logged in it is kept only if you finish it first.`)) return;
  fx.today = fresh; await saveToday(true);
  fx.view = 'log'; render(); fx.c.toast(`🏋️ ${fresh.title} is Today's Workout`);
}
export function edit(w, from = 'new') { fx.draft = W.normalize(w); fx.draftFrom = from; fx.view = 'edit'; render(); }
const blank = (n) => ({ items: Array.from({ length: n }, () => ({ name: '', sets: [{}, {}, {}] })), rounds: 3 });
function histSheet(id) {
  const w = history().find((x) => x.id === id);
  if (!w) return;
  const s = W.summary(w);
  fx.c.openSheet(`<div class="row between"><h2>${E(w.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${E(w.date || '')}${s.minutes ? ` · ${s.minutes} min` : ''}${s.volume ? ` · ${s.volume.toLocaleString()} lb lifted` : ''}${w.source === 'device' ? ' · from your device' : w.source === 'lift' ? ' · lifting program' : ''}</p>
    ${W.describe(w).map((l) => `<p class="small">${E(l)}</p>`).join('') || (w.activity ? `<p class="small">${E(w.activity.kind)}${w.activity.minutes ? ` · ${w.activity.minutes} min` : ''}${w.activity.kcal ? ` · ${w.activity.kcal} kcal` : ''}</p>` : '')}
    ${w.blocks.length ? `<div class="row"><button type="button" class="grow" data-fx="repeat:${E(w.id)}">🔁 Do it again today</button><button type="button" class="ghost" data-fx="savetpl:${E(w.id)}">Save it</button></div>` : ''}`);
}
const num = (v) => (v === '' || v == null ? null : +v);
export async function onClick(t) {
  const [a, ...r] = t.dataset.fx.split(':'), n = r.map(Number);
  const c = fx.c;
  switch (a) {
    case 'main': dropPic(); fx.view = 'main'; return c.show();
    case 'open': fx.view = 'log'; return c.show();
    case 'add': fx.view = 'main'; return c.show();
    case 'build': return edit({ title: 'Workout', blocks: [blank(1)] });
    case 'describe': fx.said = null; fx.view = 'describe'; render(); return document.getElementById('fxSaid')?.focus();
    case 'read': return readSaid();
    case 'reviewlocal': { const w = fx.said?.local?.workout; fx.unread = fx.said?.local?.unread || []; fx.said = null; return w && edit(w); }
    case 'readai': return readWithClaude();
    case 'photo': dropPic(); fx.view = 'photo'; render(); if (fx.ai == null) { fx.ai = await c.aiReady().catch(() => false); render(); } return null;
    case 'readpic': return readPic();
    case 'pickpic': return document.querySelector('[data-fxpick]')?.click();
    case 'tpl': return startWith(fx.templates[n[0]], 'repeat');
    case 'hist': return histSheet(r.join(':'));
    case 'repeat': { const w = history().find((x) => x.id === r.join(':')); c.closeSheet(); return w && startWith(W.repeatOf(w, c.iso()), 'repeat'); }
    case 'savetpl': { const w = history().find((x) => x.id === r.join(':')); if (!w) return; fx.templates = [W.repeatOf(w, ''), ...fx.templates.filter((x) => x.title !== w.title)].slice(0, 30); await saveToday(true); c.closeSheet(); return c.toast(`Saved "${w.title}" — find it under Add Workout`); }
    case 'edittoday': return edit(fx.today, 'today');
    case 'cancel': fx.draft = null; fx.unread = []; fx.view = fx.draftFrom === 'today' ? 'log' : 'main'; return render();
    case 'rounds': fx.draft = W.setRounds(fx.draft, n[0], fx.draft.blocks[n[0]].rounds + n[1]); return render();
    case 'delblock': fx.draft.blocks.splice(n[0], 1); return render();
    case 'delitem': { const b = fx.draft.blocks[n[0]]; b.items.splice(n[1], 1); if (!b.items.length) fx.draft.blocks.splice(n[0], 1); else b.kind = W.kindFor(b.items.length); return render(); }
    case 'additem': { const b = fx.draft.blocks[n[0]]; b.items.push(W.makeItem({ name: '', sets: b.items[0]?.sets.map(() => ({})) || [{}] }, b.rounds)); b.items.at(-1).uncertain = undefined; delete b.items.at(-1).uncertain; b.kind = b.items.length > 2 && b.kind !== 'circuit' ? 'circuit' : W.kindFor(b.items.length); return render(); }
    case 'addblock': { const blk = W.makeBlock({ ...blank(n[0]), kind: n[0] >= 3 ? 'circuit' : undefined }); delete blk.uncertain; for (const it of blk.items) delete it.uncertain; fx.draft.blocks.push(blk); return render(); }
    case 'savedraft': {
      const w = W.normalize(fx.draft);
      if (W.problems(w).length) return render();
      if (fx.draftFrom === 'today') { fx.today = { ...w, status: fx.today?.status || 'planned', startedAt: fx.today?.startedAt }; fx.draft = null; await saveToday(true); fx.view = 'log'; return render(); }
      fx.draft = null; fx.unread = [];
      return startWith(w, w.source === 'text' || w.source === 'photo' ? w.source : 'manual');
    }
    case 'log': {
      const [bi, ii, si] = n, row = t.closest('.fx-logrow');
      const got = {}; for (const inp of row.querySelectorAll('[data-fxl]')) got[inp.dataset.fxl.split(':')[0]] = num(inp.value);
      setToday(W.logSet(fx.today, bi, ii, si, got)); return render();
    }
    case 'undo': { let w = fx.today; for (let ii = 0; ii < w.blocks[n[0]].items.length; ii++) w = W.unlogSet(w, n[0], ii, n[1]); setToday(w); return render(); }
    case 'finish': {
      const s = W.summary(fx.today);
      if (!s.done && !c.confirm('Nothing is ticked yet. Finish anyway?')) return;
      const done = W.complete(fx.today);
      await appendLog(done);
      fx.today = null; await saveToday(true);
      fx.view = 'main'; render(); return c.toast(`💪 ${done.title} — ${s.done} sets. Nice work.`);
    }
    default: return null;
  }
}
// The Add / Save button and the problem line follow the draft as you type.
function refreshFoot() {
  const p = W.problems(fx.draft), btn = document.querySelector('[data-fx=savedraft]'), line = document.getElementById('fxProblems');
  if (btn) btn.disabled = p.length > 0;
  if (line) line.textContent = p.join(' ');
}
// Editor inputs: the draft follows what you type (no re-render while typing).
export function onInput(t) {
  const [f, ...r] = t.dataset.fxe.split(':'), [bi, ii, si] = r.map(Number);
  if (f === 'title') { fx.draft.title = t.value; return; }
  if (f === 'name') { fx.draft = W.renameItem(fx.draft, bi, ii, t.value); t.classList.toggle('unsure', !t.value.trim()); return refreshFoot(); }
  if (f === 'measure') {
    const it = fx.draft.blocks[bi].items[ii];
    it.sets = it.sets.map((s) => W.makeSet({ ...s, bw: t.value === 'bw', weight: t.value === 'reps' ? s.weight : null, time: t.value === 'time' ? s.time ?? null : null, distance: t.value === 'distance' ? s.distance ?? null : null, reps: t.value === 'time' || t.value === 'distance' ? null : s.reps }));
    return render();
  }
  fx.draft = W.editSet(fx.draft, bi, ii, si, { [f]: num(t.value) });
  t.classList.remove('unsure');
}
