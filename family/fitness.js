// 🏋️ Fitness: strength and circuit training. Add a workout (build it, describe it, a photo, a saved
// one or the lifting program — all the same workout model, js/workout.js) → Today's Workout (the
// plan) → Start Workout → Train (what you actually did, set by set) → Complete → History.
// Loaded only when you open Fitness. Your workouts are locked with the family key and stored as two
// records of yours: Today's Workout (with saved workouts) and the history. A workout in progress is
// also kept on this phone (locked the same way) until it's finished, so leaving or reloading
// never loses a set.
import * as W from '../js/workout.js';
import { matchAll, deviceFacts, candidatesFor, waitingForDevice } from '../js/workoutMatch.js';

const fx = { c: null, today: null, original: null, variant: null, device: [], templates: [], bumps: {}, rest: null, restTick: null, log: [], todayAt: 0, logAt: 0, loaded: false, draft: null, draftFrom: null, legacy: [], others: [], lift: null, timer: null, view: 'main', said: null, unread: [], reading: false, ai: null, pic: null };
export const state = fx;
import * as PG from '../js/programWorkout.js';

// ctx: { api, fid, me, lock, unlock, esc, toast, openSheet, closeSheet, confirm, iso, el: () => #view, show, aiReady: () => Promise<bool> }
export async function load(c) {
  fx.c = c;
  const P = `/families/${c.fid}/members/${c.me}/workouts`;
  const [t, l] = await Promise.all([c.api.get(`${P}/today`), c.api.get(`${P}/log`)]);
  const td = t?.data ? await c.unlock(t.data.enc ?? t.data) : null, ld = l?.data ? await c.unlock(l.data.enc ?? l.data) : null;
  if ((t?.data && !td) || (l?.data && !ld)) throw Object.assign(new Error('🔒 This device needs the family key first — Me › 🔐 Encryption'), { locked: true });
  fx.today = td?.today ? W.normalize(td.today) : null;
  fx.templates = (td?.templates || []).map(W.normalize).slice(0, 30);
  fx.bumps = td?.bumps && typeof td.bumps === 'object' ? td.bumps : {};
  // 🪶 A lighter (or shorter) version applied today keeps the original, for Undo.
  fx.original = td?.original?.workout && fx.today && td.original.workout.id === fx.today.id ? { intent: td.original.intent, workout: W.normalize(td.original.workout) } : null;
  fx.log = (ld?.log || []).map(W.normalize);
  fx.todayAt = t?.savedAt || 0; fx.logAt = l?.savedAt || 0; fx.loaded = true;
  await recover();
}
// ---------- the in-progress copy on this phone ----------
const BK = () => `fam.fx.active.${fx.c.fid}.${fx.c.me}`;
async function backup() {
  try {
    if (fx.today?.status === 'active') localStorage.setItem(BK(), JSON.stringify({ at: Date.now(), data: await fx.c.lock(fx.today) }));
    else localStorage.removeItem(BK());
  } catch { /* storage full or blocked: the saved copy still has it */ }
}
// After a reload or a save that didn't reach the connector: this phone's copy wins only when it's
// newer than what's saved and it's the same workout (or nothing newer was saved in its place).
async function recover() {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(BK()) || 'null'); } catch { /* none */ }
  if (!b?.data) return;
  const w = await fx.c.unlock(b.data.enc ?? b.data).catch(() => null);
  if (!w || b.at <= fx.todayAt || (fx.today && fx.today.id !== w.id && fx.today.status !== 'done')) { if (!w || b.at <= fx.todayAt) localStorage.removeItem(BK()); return; }
  if (fx.log.some((x) => x.id === w.id)) { localStorage.removeItem(BK()); return; } // finished on another phone
  fx.today = W.normalize(w);
  saveToday();
}
// Older workouts (the trackers' lifting sessions and device workouts), read-only in history.
// Device activities that aren't strength or circuit work (climbing, runs, rides…) are listed in
// History too (owner, 2026-10-31), but stay out of strength features ("last time", repeat, templates).
export function setLegacy(data, names = {}) {
  const all = [...(data?.lift?.sessions || []).map((s) => W.fromLiftSession(s, names)), ...(data?.workoutHistory || []).filter((x) => x?.start).slice(-200).map(W.fromDeviceWorkout)];
  fx.legacy = all.filter(W.isStrength);
  fx.others = all.filter((w) => !W.isStrength(w));
  fx.lift = data?.lift || null;
  // Device workouts with their WHOOP numbers, to match with the workouts you logged (js/workoutMatch.js).
  fx.device = (data?.workoutHistory || []).filter((x) => x?.id && x.start).slice(-200);
}
Object.defineProperties(fx, {
  programOn: { get: () => PG.programOn(fx.lift) },
  programNext: { get: () => (PG.programOn(fx.lift) ? PG.programNext(fx.lift, fx.log) : null) },
});
// A device workout matched to one you logged shows on that one (its WHOOP numbers), not twice.
const devId = (x) => `dev${String(x.id || x.start).replace(/[^a-z0-9]/gi, '')}`.slice(0, 16);
const matched = () => matchAll(fx.log, fx.device);
const allDone = (withOthers = false) => { const hide = new Set([...matched().values()].map((m) => devId(m.device))); return [...fx.log, ...[...fx.legacy, ...(withOthers ? fx.others : [])].filter((x) => !fx.log.some((y) => y.id === x.id) && !hide.has(x.id))].filter((w) => w.status === 'done'); };
const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.doneAt || 0) - (a.doneAt || 0);
const history = () => allDone().filter(W.isStrength).sort(byDate);
// What History lists: strength work plus the device's other activities, one copy each, with each
// day's light ones (walks, stretches, short bits) as one "Everyday activity" row.
const listed = () => W.groupLight(allDone(true).sort(byDate));
const open = () => (fx.today && fx.today.status !== 'done' ? fx.today : null);

// ---------- saving (batched; never over a newer copy from another phone) ----------
async function put(which, payload, base) {
  const c = fx.c;
  return c.api.put(`/families/${c.fid}/members/${c.me}/workouts/${which}`, { data: await c.lock(payload), base });
}
export function saveToday(now = false) {
  clearTimeout(fx.timer);
  const go = async () => {
    if (fx.original && fx.original.workout.id !== fx.today?.id) fx.original = null;
    try { const r = await put('today', { today: fx.today, templates: fx.templates, bumps: fx.bumps, ...(fx.original ? { original: fx.original } : {}) }, fx.todayAt); fx.todayAt = r.savedAt; }
    catch (e) {
      if (e.status !== 409) return fx.c.toast(`Couldn't save — ${e.message}`);
      // Saved on another phone meanwhile: theirs wins for the plan; keep going from it.
      await load(fx.c); fx.c.toast('Updated from your other device'); render();
    }
  };
  backup();
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

// ---------- the Health card: status and the next action ----------
// "4 of 7 exercises · 12 of 21 sets" (sets too: a circuit finishes its exercises only at the end).
const doneText = (w) => { const p = W.progress(w), s = W.summary(w); return `${p.exDone} of ${p.exercises} exercises · ${s.done} of ${s.sets} sets`; };
const meta = (w) => { const n = W.progress(w).exercises, m = W.estMinutes(w); return `${n} exercise${n === 1 ? '' : 's'}${m ? ` · ~${m} min` : ''}`; };
// The Workout anchor on Health: planned → Start, in progress → Resume, done today → View summary
// (kept for the rest of the day), or nothing planned → Add.
export function doneToday() { return fx.log.find((w) => w.status === 'done' && w.date === fx.c.iso()) || null; }
export function healthRow(esc) {
  const t = open(), d = doneToday(), last = history()[0];
  const row = (hot, ic, body, acts) => `<div class="hl-row2${hot ? ' hot' : ''}"><span class="hl-ic" aria-hidden="true">${ic}</span>${body}<div class="hl-acts">${acts}</div></div>`;
  if (t?.status === 'active') {
    const s = W.summary(t);
    return { state: 'active', title: t.title, html: (hot) => row(hot, '🏋️', `<button type="button" class="hl-what" data-fx="train"><b>${esc(t.title)} · in progress</b><small>${esc(doneText(t))}${t.startedAt ? ` · ${Math.max(1, Math.round((Date.now() - t.startedAt) / 60000))} min` : ''}</small></button><span class="hl-bar hl-prog" aria-hidden="true"><i style="width:${s.sets ? Math.round((s.done / s.sets) * 100) : 0}%"></i></span>`, `<button type="button" class="grow" data-fx="train">▶ Resume ${t.title.length <= 18 ? esc(t.title) : 'workout'}</button>`) };
  }
  if (t) return { state: 'planned', title: t.title, html: (hot) => row(hot, '🏋️', `<button type="button" class="hl-what" data-fx="today"><b>${esc(t.title)} today</b><small>${esc(meta(t))} ›</small></button>`, `<button type="button" class="grow${hot ? '' : ' ghost'}" data-fx="start">Start workout</button>`) };
  if (d) {
    const s = W.summary(d);
    return { state: 'done', title: d.title, html: () => row(false, '✅', `<button type="button" class="hl-what" data-fx="summary:${esc(d.id)}"><b>${esc(d.title)} · done</b><small>${[s.minutes ? `${s.minutes} min` : '', `${s.done} sets`, s.volume ? `${s.volume.toLocaleString()} lb` : ''].filter(Boolean).join(' · ')}</small></button>`, `<button type="button" class="ghost grow" data-fx="summary:${esc(d.id)}">View summary</button>`) };
  }
  return { state: 'none', title: '', html: () => row(false, '🏋️', `<div><b>No workout planned</b><small>${last ? `Last: ${esc(last.title)} · ${esc(last.date || '')}` : 'Build one, describe it or snap a photo'}</small></div>`, '<button type="button" class="ghost grow" data-fx="add">＋ Add workout</button>') };
}

// ---------- screens ----------
const E = (s) => fx.c.esc(s);
export function render() {
  const el = fx.c?.el();
  if (!el) return;
  if (fx.view === 'edit' && fx.draft) el.innerHTML = editorHtml();
  else if (fx.view === 'describe') el.innerHTML = describeHtml();
  else if (fx.view === 'photo') el.innerHTML = photoHtml();
  else if ((fx.view === 'train' || fx.view === 'log') && open()) { fx.view = 'train'; el.innerHTML = trainHtml(); }
  else if (fx.view === 'today' && open()) el.innerHTML = todayHtml();
  else { fx.view = 'main'; el.innerHTML = mainHtml(); }
}
// Every screen says where it sits: "‹ Fitness" above "Today's Workout", so the way back is always
// on the screen (never only the browser's Back).
const head = (back, label, title, extra = '') => `<section class="fx-head"><button type="button" class="fx-back linkish" ${back}>‹ ${E(label)}</button><div class="row between"><h2>${title}</h2>${extra}</div></section>`;
const TILES = [
  ['build', '✍️', 'Build it', 'Pick the exercises, sets, reps and weights yourself.'],
  ['describe', '💬', 'Describe it', "Type or paste it the way you'd text it — a WOD, a coach's plan."],
  ['photo', '📷', 'Photo', 'A photo or screenshot of a WOD, a whiteboard or a workout app.'],
];
function programLine() {
  if (!fx.programOn) return '<p class="small center"><button type="button" class="linkish small" data-fx="program">Set up a lifting program</button></p>';
  const n = fx.programNext;
  return `<button type="button" class="card fx-hist" data-fx="fromprogram"><span class="grow"><b>📋 From my program</b><small class="muted">${E(n ? `${n.title} · ${n.weekLabel}` : 'The next day of your program')}</small></span><span class="go">›</span></button>`;
}
function mainHtml() {
  const t = open();
  const h = listed().slice(0, 25);
  return `${head('data-view="health"', 'Health', '🏋️ Fitness')}
    ${t ? `<section class="card fx-todaycard"><div class="eyebrow">Today's Workout</div><h3>${E(t.title)}</h3><p class="small muted">${t.status === 'active' ? `${E(doneText(t))} · in progress` : E(meta(t))}</p>
      <div class="row"><button type="button" class="grow" data-fx="${t.status === 'active' ? 'train' : 'start'}">${t.status === 'active' ? 'Resume Workout' : 'Start Workout'} →</button><button type="button" class="ghost" data-fx="today">View</button></div></section>` : ''}
    <section class="card"><h3 class="card-h">＋ Add Workout</h3>
      <div class="fx-paths">${TILES.filter(([k]) => k !== 'photo' || fx.ai !== false).map(([k, i, l, d]) => `<button type="button" data-fx="${k}"><b aria-hidden="true">${i}</b><span>${l}</span><small>${d}</small></button>`).join('')}</div>
      ${fx.templates.length ? `<p class="small muted">Saved: ${fx.templates.slice(0, 6).map((w, i) => `<button type="button" class="linkish small" data-fx="tpl:${i}">${E(w.title)}</button>`).join(' · ')}</p>` : ''}
      ${programLine()}</section>
    <h3 class="wl-h">History</h3>
    ${h.length ? h.map((w) => { const s = W.summary(w); return `<button type="button" class="card fx-hist" data-fx="hist:${E(w.id)}"><span class="grow"><b>${E(w.title)}</b><small class="muted">${E(w.date || '')}${w.source === 'device' ? `${w.group ? ` · ${E(w.activity.kind)}` : ''} · ${w.activity?.minutes ?? '?'} min${w.activity?.kcal ? ` · ${w.activity.kcal} kcal` : ''} · from your device` : ` · ${s.exercises} exercise${s.exercises === 1 ? '' : 's'} · ${s.done || s.sets} sets`}</small></span><span class="go">›</span></button>`; }).join('') : '<p class="small muted pad">Finished workouts show here.</p>'}`;
}
// Today's Workout: the plan, before and between training.
const blockLabel = (b) => (b.items.length > 1 ? `${b.kind === 'circuit' ? '🔁 Circuit' : '🔗 Superset'} · ${b.rounds} round${b.rounds === 1 ? '' : 's'}` : '');
function todayHtml() {
  const t = open(), going = t.status === 'active', p = W.progress(t);
  const pg = t.program ? `From your program · week ${t.program.week}` : t.source === 'photo' ? 'Read from a photo' : t.source === 'text' ? 'Read from what you wrote' : '';
  return `${head('data-fx="main"', 'Fitness', "Today's Workout")}
    <section class="card"><h3>${E(t.title)}</h3><p class="small muted">${going ? E(doneText(t)) : E(meta(t))}${pg ? ` · ${E(pg)}` : ''}</p>
      ${t.notes ? `<p class="tiny muted">${E(t.notes)}</p>` : ''}
      ${t.blocks.map((b) => `<div class="fx-plan">${blockLabel(b) ? `<b class="small">${blockLabel(b)}</b>` : ''}${b.items.map((it) => `<p class="small">${E(W.itemText(it))}</p>${it.note ? `<p class="tiny muted">${E(it.note)}</p>` : ''}`).join('')}${b.note ? `<p class="tiny muted">${E(b.note)}</p>` : ''}</div>`).join('')}
    </section>
    <div class="fx-foot"><button type="button" class="ghost" data-fx="edittoday">Edit</button><button type="button" data-fx="${going ? 'train' : 'start'}">${going ? 'Resume Workout' : 'Start Workout'} →</button></div>
    <p class="small center"><button type="button" class="linkish small" data-fx="droptoday">Remove from today</button></p>`;
}
// 💬 Describe it: type it the way you'd text it. ✨ Read it with Claude is the main way (only the
// words you typed are sent, and only when you tap); your phone can read it instead, and does
// whenever Claude isn't set up, you're offline or it can't answer.
const PRIVACY_LINE = '<p class="tiny muted">Sends only the words above to Claude (Anthropic) to read them — nothing else goes with them. We don\'t keep them; Anthropic doesn\'t train on them and deletes them after a short safety check period.</p>';
function readButtons() {
  if (fx.ai === false) return '<button type="button" class="wide" data-fx="read">Read it</button>';
  return `<button type="button" class="wide" data-fx="readai" ${fx.reading ? 'disabled' : ''}>${fx.reading ? 'Reading… a few seconds' : '✨ Read it with Claude'}</button>
    <p class="small center"><button type="button" class="linkish small" data-fx="read" ${fx.reading ? 'disabled' : ''}>Read on this phone instead</button></p>${PRIVACY_LINE}`;
}
function describeHtml() {
  const d = fx.said || { text: '' };
  const got = d.local ? W.summary(d.local.workout).exercises : 0;
  return `${head('data-fx="main"', 'Fitness', '💬 Describe it')}
    <section class="card"><label for="fxSaid" class="small">Your workout, the way you'd text it</label>
      <textarea id="fxSaid" rows="6" maxlength="1500" placeholder="Bench 3x10 @ 135, then pull-ups 3x8\n4 rounds: overhead press 12/12/11/11, row 12/13/14/13">${E(d.text)}</textarea>
      <div id="fxReadBtns">${readButtons()}</div></section>
    ${d.local ? `<section class="card" role="status"><p class="small">${d.note ? `${E(d.note)} ` : ''}${got ? `Your phone read ${got} exercise${got === 1 ? '' : 's'}.` : 'Your phone couldn\'t read a workout in that yet.'}${d.local.unread.length ? ` Couldn't place: ${d.local.unread.map((x) => `“${E(x)}”`).join(', ')}.` : ''}</p>
      ${got ? '<button type="button" class="wide" data-fx="reviewlocal">Review it</button>' : '<p class="tiny muted">Say it another way, or build it by hand.</p>'}</section>` : ''}`;
}
// Once the phone knows whether Claude is set up, only the buttons change (what you typed stays).
async function checkClaude() {
  if (fx.ai != null) return;
  fx.ai = await fx.c.aiReady().catch(() => null);
  const box = document.getElementById('fxReadBtns');
  if (box && fx.view === 'describe') box.innerHTML = readButtons();
}
// 🗣️ From Talk to Pawmily: Describe it, filled in and read (with Claude when it's on) — then the
// usual review before anything becomes Today's Workout.
export async function describeWith(text) {
  fx.said = { text }; fx.view = 'describe'; fx.c.show();
  if (fx.ai == null) fx.ai = await fx.c.aiReady().catch(() => null);
  return fx.ai ? readWithClaude() : readSaid();
}
async function readSaid(note = '') {
  const text = (document.getElementById('fxSaid')?.value ?? fx.said?.text ?? '').trim();
  if (!text) return fx.c.toast('Type your workout first');
  const T = await import('../js/workoutText.js');
  const local = T.parseWorkout(text, { today: fx.c.iso() });
  if (!note && !T.needsHelp(local)) { fx.said = null; fx.unread = []; return edit(local.workout); }
  fx.said = { text, local, note };
  return render();
}
async function readWithClaude() {
  const c = fx.c;
  const text = (document.getElementById('fxSaid')?.value ?? fx.said?.text ?? '').trim();
  if (!text) return c.toast('Type your workout first');
  if (fx.reading) return null;
  fx.said = { text };
  fx.reading = true; render();
  const asked = fx.said;
  try {
    const r = await c.api.post('/ai/workout', { text, unit: 'lb', today: c.iso() });
    fx.reading = false;
    if (fx.view !== 'describe' || fx.said !== asked) return null; // left meanwhile: don't replace anything
    if (!r.workout?.blocks?.length) return readSaid("Claude couldn't find a workout in that.");
    fx.said = null; fx.unread = r.unread || [];
    return edit(r.workout);
  } catch (e) {
    fx.reading = false;
    if (e.status === 501) fx.ai = false;
    if (fx.view !== 'describe' || fx.said !== asked) return null;
    // Claude isn't there right now: your phone reads it instead, and says why.
    return readSaid(e.status === 501 ? 'Reading with Claude isn\'t set up here.' : e.status === 429 ? e.message : !navigator.onLine ? 'You\'re offline, so your phone read it.' : 'Claude couldn\'t read it just now, so your phone did.');
  } finally { fx.reading = false; }
}

// 📷 From a photo: a handwritten plan, a whiteboard or a screenshot. Nothing leaves the phone until
// you tap Read it; then only this one picture goes — redrawn first, so it carries no location or
// camera details — and it isn't kept anywhere: not on the connector, not in your workouts.
function photoHtml() {
  const p = fx.pic;
  if (fx.ai === false) return `${head('data-fx="main"', 'Fitness', '📷 From a photo')}
    <section class="card"><p class="small">Reading photos isn't set up here yet. 💬 Describe it or ✍️ Build it work the same way.</p><div class="row"><button type="button" class="grow" data-fx="describe">💬 Describe it</button><button type="button" class="ghost grow" data-fx="build">✍️ Build it</button></div></section>`;
  return `${head('data-fx="main"', 'Fitness', '📷 From a photo')}
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
  return `${head('data-fx="cancel"', fx.draftFrom === 'today' ? "Today's Workout" : 'Fitness', fromAi ? 'Review Workout' : fx.draftFrom === 'today' ? 'Edit workout' : 'Build a workout')}
    ${fromAi ? `<p class="small muted pad">${w.source === 'photo' ? 'Read from your photo' : 'Read from what you wrote'}. Check it first — nothing is saved until you choose below.</p>` : ''}
    ${fx.draftFrom === 'today' ? '' : '<p class="fx-banner">This becomes <b>Today\'s Workout</b>. Start it now and tick sets as you go — or, if you\'ve already done it, <b>Log as done</b>.</p>'}
    ${fromAi && fx.unread.length ? `<p class="small pad">Not placed: ${fx.unread.map((x) => `“${E(x)}”`).join(', ')}</p>` : ''}
    ${u.length ? `<div class="note warn" role="status">⚠️ ${u.length} thing${u.length === 1 ? '' : 's'} to check — highlighted below.</div>` : ''}
    <label class="fx-title">Name<input data-fxe="title" value="${W.untitled(w.title) ? '' : E(w.title)}" placeholder="${E(W.suggestName(w))}" maxlength="80"><small class="tiny muted">Leave it blank to use the suggested name, or type your own.</small></label>
    ${w.blocks.map((b, bi) => `<section class="card fx-block">
      <div class="row between"><b class="${unsure(b, 'kind') ? 'unsure-t' : ''}">${b.items.length > 1 ? (b.kind === 'circuit' ? '🔁 Circuit' : '🔗 Superset') : '🏋️ Straight sets'}</b>
        <span class="fx-rounds ${unsure(b, 'rounds') ? 'unsure-t' : ''}"><button type="button" class="icon-btn" data-fx="rounds:${bi}:-1" aria-label="One ${b.items.length > 1 ? 'round' : 'set'} fewer">−</button><span>${b.rounds} ${b.items.length > 1 ? 'round' : 'set'}${b.rounds === 1 ? '' : 's'}</span><button type="button" class="icon-btn" data-fx="rounds:${bi}:1" aria-label="One more">＋</button></span>
        <button type="button" class="icon-btn" data-fx="delblock:${bi}" aria-label="Remove this part">✕</button></div>
      ${b.items.map((it, ii) => { const m = measureOf(it); return `<div class="fx-item">
        <div class="row"><input class="fx-name ${unsure(it, 'name') ? 'unsure' : ''}" data-fxe="name:${bi}:${ii}" value="${E(it.name)}" placeholder="Exercise" aria-label="Exercise name${unsure(it, 'name') ? ' — check this' : ''}">
          ${b.items.length > 1 || w.blocks.length > 1 ? `<button type="button" class="icon-btn" data-fx="delitem:${bi}:${ii}" aria-label="Remove ${E(it.name || 'exercise')}">✕</button>` : ''}</div>
        <div class="row wrap"><select class="fx-measure" data-fxe="measure:${bi}:${ii}" aria-label="Measured in">${[['reps', 'Reps × weight'], ['bw', 'Reps (bodyweight)'], ['time', 'Time'], ['distance', 'Distance']].map(([k, l]) => `<option value="${k}" ${m === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label class="fx-side small"><input type="checkbox" data-fxe="perside:${bi}:${ii}" ${it.perSide ? 'checked' : ''}> Each side</label></div>
        <div class="fx-sets"><div class="fx-set fx-lab" aria-hidden="true"><small>${b.items.length > 1 ? 'round' : 'set'}</small>${m === 'time' ? '<span>sec</span>' : m === 'distance' ? `<span>${E(it.sets[0]?.distUnit || 'mi')}</span>` : '<span>reps</span>'}${m === 'reps' ? `<span>${E(it.sets[0]?.unit || 'lb')}</span>` : ''}</div>${it.sets.map((s, si) => setCell(bi, ii, si, s, m)).join('')}</div></div>`; }).join('')}
      <button type="button" class="linkish small" data-fx="additem:${bi}">${b.items.length > 1 ? `＋ Add an exercise to this ${b.kind === 'circuit' ? 'circuit' : 'superset'}` : '🔗 Pair it with another exercise (superset)'}</button></section>`).join('')}
    <div class="row wrap fx-add"><button type="button" class="ghost small" data-fx="addblock:1">＋ Exercise</button><button type="button" class="ghost small" data-fx="addblock:2">＋ Superset</button><button type="button" class="ghost small" data-fx="addblock:3">＋ Circuit</button></div>
    <p class="small muted pad" id="fxProblems">${p.map(E).join(' ')}</p>
    ${fx.draftFrom === 'today' ? `<div class="fx-foot"><button type="button" class="ghost" data-fx="cancel">Cancel</button><button type="button" data-fx="savedraft" ${p.length ? 'disabled' : ''}>Save</button></div>`
      : `<div class="fx-foot fx-foot3"><button type="button" data-fx="startnow" ${p.length ? 'disabled' : ''}>▶ Start now</button><div class="fx-two"><button type="button" class="ghost" data-fx="savedraft" ${p.length ? 'disabled' : ''}>Save for later today</button><button type="button" class="ghost" data-fx="logdone" ${p.length ? 'disabled' : ''}>✓ Log as done</button></div></div>`}`;
}
// Train: doing Today's Workout. Each set shows the plan; ✓ records it as planned or with what you
// typed (the plan is kept beside it). A done round folds to one line, e.g. "Set 3 — 8 × 135 ✓".
const planText = (x) => [x.reps != null ? `${x.reps} reps` : '', x.time != null ? W.setText({ time: x.time }) : '', x.distance != null ? `${x.distance} ${x.distUnit}` : '', x.bw ? 'bodyweight' : x.weight != null ? `${x.weight} ${x.unit}` : ''].filter(Boolean).join(' · ');
export function didText(x) {
  const g = { ...x, ...(x.got || {}) };
  const reps = g.reps != null ? String(g.reps) : '';
  const load = x.bw ? 'bodyweight' : g.weight != null ? `${g.weight}${x.unit === 'kg' ? ' kg' : ''}` : '';
  return [reps && load ? (x.bw ? `${reps} reps · bodyweight` : `${reps} × ${load}`) : reps ? `${reps} reps` : load, g.time != null ? W.setText({ time: g.time }) : '', g.distance != null ? `${g.distance} ${x.distUnit}` : ''].filter(Boolean).join(' · ') || 'done';
}
const changed = (x) => x.got && ((x.got.reps != null && x.got.reps !== x.reps) || (x.got.weight != null && x.got.weight !== x.weight) || (x.got.time != null && x.got.time !== x.time) || (x.got.distance != null && x.got.distance !== x.distance));
function trainHtml() {
  const w = fx.today, s = W.summary(w), p = W.progress(w), nx = p.next;
  return `${head('data-fx="today"', "Today's Workout", `Train · ${E(w.title)}`)}
    <p class="small pad" role="status"><b>${p.exDone} of ${p.exercises} exercises</b> · ${s.done} of ${s.sets} sets${nx ? ` · next: ${E(w.blocks[nx.bi].items[nx.ii].name || 'exercise')}` : ' · all done'}</p>
    <div class="fx-progress" role="progressbar" aria-label="Sets done" aria-valuemin="0" aria-valuemax="${s.sets}" aria-valuenow="${s.done}"><i style="width:${s.sets ? Math.round((s.done / s.sets) * 100) : 0}%"></i></div>
    <p class="small pad"><button type="button" class="linkish small" data-fx="resttoggle">⏱ Rest timer: ${restOn() ? 'on' : 'off'}</button></p>
    ${w.blocks.map((b, bi) => { const open1 = b.items.some((it) => it.sets.some((x) => !x.done)); return `<section class="card fx-block"><div class="fx-bh"><b>${b.items.length > 1 ? blockLabel(b) : `🏋️ ${E(b.items[0]?.name || '')}${b.items[0]?.perSide ? ' <small class="muted">each side</small>' : ''}`}</b>${open1 ? `<button type="button" class="ghost small fx-all" data-fx="${b.items.length > 1 ? `allblock:${bi}` : `all:${bi}:0`}">✓ All ${b.items.length > 1 ? 'rounds' : 'sets'}</button>` : '<span class="small good">✓ done</span>'}</div>${b.note ? `<small class="muted">${E(b.note)}</small>` : ''}
      ${b.items.map((it) => { const l = W.lastText(W.lastTime(history(), it.name, w.id)); return `<p class="fx-last">${b.items.length > 1 ? `<b>${E(it.name)}</b> · ` : ''}Plan ${E(planShort(it))}${l ? ` · Last time <b>${E(l)}</b>` : ''}</p>`; }).join('')}
      ${[...Array(b.rounds).keys()].map((r) => { const all = b.items.every((it) => it.sets[r]?.done);
        const lab = b.items.length > 1 ? `Round ${r + 1}` : `Set ${r + 1}`;
        return all ? `<p class="small fx-rdone">${lab} — ${b.items.map((it) => `${b.items.length > 1 ? `${E(it.name)} ` : ''}${E(didText(it.sets[r]))}${changed(it.sets[r]) ? ` <small class="muted">(plan ${E(planText(it.sets[r]))})</small>` : ''}`).join(' · ')} ✓ <button type="button" class="linkish tiny" data-fx="undo:${bi}:${r}" aria-label="Undo ${lab}">undo</button></p>`
          : `<div class="fx-round ${nx && nx.bi === bi && nx.si === r ? 'next' : ''}">${b.items.length > 1 ? `<div class="small"><b>${lab}</b></div>` : ''}${b.items.map((it, ii) => { const x = it.sets[r], m = measureOf(it); return `<div class="fx-logrow ${x.done ? 'done' : ''}">
            <span class="grow"><b>${b.items.length > 1 ? `${E(it.name)}${it.perSide ? ' <small class="muted">each side</small>' : ''}` : lab}</b><small class="muted">${E(planText(x)) || 'as you like'}</small></span>
            ${x.done ? `<span class="small">${E(didText(x))} ✓</span>` : `<span class="fx-in">${m === 'time' ? `<input inputmode="numeric" data-fxl="time:${bi}:${ii}:${r}" value="${x.time ?? ''}" aria-label="Seconds, ${E(it.name)} ${lab}" placeholder="sec">` : m === 'distance' ? `<input inputmode="decimal" data-fxl="distance:${bi}:${ii}:${r}" value="${x.distance ?? ''}" aria-label="Distance, ${E(it.name)} ${lab}" placeholder="${x.distUnit}">` : `<input inputmode="numeric" data-fxl="reps:${bi}:${ii}:${r}" value="${x.reps ?? ''}" aria-label="Reps, ${E(it.name)} ${lab}" placeholder="reps">${m === 'reps' ? `<input inputmode="decimal" data-fxl="weight:${bi}:${ii}:${r}" value="${x.weight ?? ''}" aria-label="Weight (${x.unit}), ${E(it.name)} ${lab}" placeholder="${x.unit}">` : ''}`}</span>
              <button type="button" class="fx-check" data-fx="log:${bi}:${ii}:${r}" aria-label="Done: ${E(it.name)}, ${b.items.length > 1 ? 'round' : 'set'} ${r + 1}">✓</button>`}</div>`; }).join('')}</div>`; }).join('')}
      ${fx.rest?.bi === bi ? restHtml() : ''}
    </section>`; }).join('')}
    ${W.remaining(w).length ? '<button type="button" class="ghost wide fx-rest-all" data-fx="logrest">✓ Log remaining sets as planned</button>' : ''}
    <div class="fx-foot"><button type="button" class="ghost" data-fx="edittoday">Edit</button><button type="button" data-fx="finish">Complete workout</button></div>`;
}
// "3 × 8 @ 40 lb" when every set is the same, else the sets one by one.
function planShort(it) {
  const s0 = it.sets[0] || {}, same = it.sets.every((x) => x.reps === s0.reps && x.weight === s0.weight && x.time === s0.time && x.bw === s0.bw);
  if (same && s0.reps != null) return `${it.sets.length} × ${s0.reps}${s0.bw ? ' · bodyweight' : s0.weight != null ? ` @ ${s0.weight} ${s0.unit}` : ''}`;
  return W.itemText(it).slice((it.name || '?').length + 1);
}
// ⏱ The optional rest timer (off unless you turn it on; remembered on this phone). Shown from a
// timestamp, so it's right when you come back to the screen; no notifications.
const REST_KEY = () => `fam.fx.rest.${fx.c.fid}.${fx.c.me}`;
function restOn() { try { return localStorage.getItem(REST_KEY()) === '1'; } catch { return false; } }
const HEAVY = /squat|deadlift|\brdl\b|press|bench|row|pull.?up|chin.?up|lunge|clean|thrust|dip/i;
function startRest(bi, si) {
  if (!restOn()) return;
  const b = fx.today.blocks[bi];
  if (b.items.length > 1 && !b.items.every((it) => it.sets[si]?.done)) return; // a superset or circuit rests after the round
  const secs = b.rest ?? (b.items.length > 1 ? 60 : HEAVY.test(b.items[0]?.name || '') ? 90 : 60);
  fx.rest = { bi, until: Date.now() + secs * 1000, buzzed: false };
  tickRest();
}
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function restHtml() {
  const left = fx.rest.until - Date.now();
  return `<div class="fx-rest" role="timer" aria-live="off"><span>${left > 0 ? `Rest <b data-restleft>${mmss(left)}</b>` : '<b>Rest over</b> — next set when you\'re ready'}</span><span><button type="button" class="linkish small" data-fx="restplus">+30 s</button> · <button type="button" class="linkish small" data-fx="restskip">${left > 0 ? 'Skip' : 'Hide'}</button></span></div>`;
}
function tickRest() {
  clearInterval(fx.restTick);
  fx.restTick = setInterval(() => {
    const el = document.querySelector('[data-restleft]');
    if (!fx.rest || fx.view !== 'train') { clearInterval(fx.restTick); return; }
    const left = fx.rest.until - Date.now();
    if (left <= 0) { if (!fx.rest.buzzed) { fx.rest.buzzed = true; navigator.vibrate?.(200); } clearInterval(fx.restTick); return render(); }
    if (el) el.textContent = mmss(left);
  }, 500);
}

// ---------- actions ----------
function setToday(w) { fx.today = w; saveToday(); }
// A new Today's Workout (from any of the ways in): shown as the plan first; Start Workout begins it.
// Weights you accepted after your last session (📈) go into the next workout with that exercise.
function applyBumps(w) {
  if (!Object.keys(fx.bumps || {}).length || w.program || source0(w) === 'program') return w;
  const c = W.normalize(w);
  for (const b of c.blocks) for (const it of b.items) {
    const k = (it.name || '').trim().toLowerCase(), u = fx.bumps[k];
    if (!u) continue;
    for (const st of it.sets) if (st.weight != null && st.weight <= u.from && st.unit === u.unit) st.weight = u.to;
    delete fx.bumps[k];
  }
  return c;
}
const source0 = (w) => w.source;
async function startWith(w, source, { start = false } = {}) {
  const fresh = W.normalize({ ...applyBumps(w), date: fx.c.iso(), status: 'planned', source: source || w.source });
  if (W.untitled(fresh.title)) fresh.title = W.suggestName(fresh);
  if (open() && W.summary(fx.today).done && !fx.c.confirm(`Replace "${fx.today.title}"? What you've logged in it is kept only if you complete it first.`)) return;
  fx.today = fresh; fx.original = null; await saveToday(true);
  if (start) { begin(); render(); return fx.c.toast(`▶ ${fresh.title} — tick each set as you go`); }
  fx.view = 'today'; render(); fx.c.toast(`🏋️ ${fresh.title} is Today's Workout`);
}
// ✅ After a workout: the numbers, any new best, and (only from sets you actually logged) an
// optional next step. Opens from Complete workout and from Health's "View summary".
const nm = (x) => (x || '').trim().toLowerCase();
function bestBefore(name, notId) {
  let best = 0;
  for (const w of history()) { if (w.id === notId) continue; for (const b of w.blocks || []) for (const it of b.items) if (nm(it.name) === nm(name)) for (const x of it.sets) if (x.done && !x.bw) best = Math.max(best, (x.got?.weight ?? x.weight) || 0); }
  return best;
}
export function summarySheet(id) {
  const w = [...fx.log, ...history()].find((x) => x.id === id);
  if (!w) return;
  const s = W.summary(w), bests = [];
  for (const b of w.blocks) for (const it of b.items) {
    const top = Math.max(0, ...it.sets.filter((x) => x.done && !x.bw).map((x) => (x.got?.weight ?? x.weight) || 0));
    const before = bestBefore(it.name, w.id);
    if (top && before && top > before && !bests.some((x) => nm(x.name) === nm(it.name))) bests.push({ name: it.name, top, unit: it.sets[0]?.unit || 'lb' });
  }
  fx.sug = w.date === fx.c.iso() ? W.progression(w).filter((p) => !fx.bumps[nm(p.name)]) : [];
  fx.sumId = id;
  const lines = w.blocks.flatMap((b) => b.items.map((it) => `${E(it.name || '?')} ${E(it.sets.filter((x) => x.done).map((x) => didText(x)).join(', ') || '—')}`));
  fx.c.openSheet(`<div class="row between"><h2>✅ ${E(w.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${E(w.date || '')}${w.doneAt ? ` · ${new Date(w.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
    <div class="fx-stats"><div><b>${s.minutes ? `${s.minutes} min` : '—'}</b><span>time</span></div><div><b>${s.done} sets</b><span>${s.exercises} exercise${s.exercises === 1 ? '' : 's'}</span></div><div><b>${s.volume ? s.volume.toLocaleString() : '—'}</b><span>lb lifted</span></div></div>
    ${deviceHtml(w)}
    ${bests.map((x) => `<p class="ml-note">🏆 New best: ${E(x.name)} ${x.top} ${E(x.unit)}</p>`).join('')}
    ${fx.sug.map((p, i) => `<div class="ml-note fx-sug"><span>You did every planned set of ${E(p.name)} at ${p.from} ${E(p.unit)}. <b>Try ${p.to} ${E(p.unit)} next time?</b></span><div class="fx-two"><button type="button" data-fx="bump:${i}">Accept</button><button type="button" class="ghost" data-fx="nobump:${i}">Keep ${p.from}</button></div></div>`).join('')}
    <p class="small">${lines.join('<br>')}</p>
    <div class="fx-two"><button type="button" class="ghost" data-fx="savetpl:${E(w.id)}">⭐ Save as a template</button><button type="button" data-act="close">Done</button></div>`);
}
// Start Workout: the clock starts and Train opens (Health's button calls this too).
export function begin() {
  if (!open()) return;
  if (fx.today.status === 'planned') { fx.today = { ...fx.today, status: 'active', startedAt: Date.now() }; saveToday(); }
  fx.view = 'train';
}
export function edit(w, from = 'new') { fx.draft = W.normalize(w); fx.draftFrom = from; fx.view = 'edit'; render(); }
const blank = (n) => ({ items: Array.from({ length: n }, () => ({ name: '', sets: [{}, {}, {}] })), rounds: 3 });
// One finished workout: what you planned and did, its name (yours to change), do it again, save it.
// ⌚ The WHOOP workout that goes with one you logged: its strain, calories, heart rate and zones
// (shown here only — Diet counts the calories once, from WHOOP), or "Waiting for WHOOP…".
const ZONES = ['Zone 0', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];
function zonesBar(z) {
  const total = (z || []).reduce((a, b) => a + b, 0);
  if (!total) return '';
  return `<div class="fx-zones" role="img" aria-label="Heart-rate zones: ${z.map((m, i) => `${ZONES[i]} ${m} min`).join(', ')}">${z.map((m, i) => (m ? `<i class="z${i}" style="flex:${m}"></i>` : '')).join('')}</div>`;
}
function deviceHtml(w) {
  if (!fx.log.some((x) => x.id === w.id)) return '';
  const f = deviceFacts(matched().get(w.id)), on = !!fx.c.whoopOn?.();
  if (f) {
    const nums = [f.strain != null ? `strain ${f.strain.toFixed(1)}` : '', f.kcal ? `${f.kcal} kcal` : '', f.avgHr ? `avg ${f.avgHr}${f.maxHr ? ` / max ${f.maxHr}` : ''} bpm` : ''].filter(Boolean).join(' · ');
    const how = f.method === 'manual' ? 'You matched this' : f.method === 'overlap' ? 'Matched by time' : 'Matched to the nearest WHOOP workout that day';
    return `<div class="fx-dev"><p class="small"><b>⌚ ${/^whoop:/.test(f.id) ? 'WHOOP' : 'Device'}</b>${nums ? ` · ${E(nums)}` : ''}</p>${zonesBar(f.zones)}<p class="tiny muted">${how} · counted once in your Diet · <button type="button" class="linkish tiny" data-fx="wpicker:${E(w.id)}">Not this one?</button></p></div>`;
  }
  if (waitingForDevice(w, null, { connected: on, today: fx.c.iso() })) return '<p class="small muted fx-dev">⌚ Waiting for WHOOP… it adds a workout once it has scored it.</p>';
  if (candidatesFor(w, fx.device).length) return `<p class="tiny muted fx-dev">⌚ <button type="button" class="linkish tiny" data-fx="wpicker:${E(w.id)}">Match a WHOOP workout</button></p>`;
  return '';
}
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function pickerSheet(id) {
  const w = fx.log.find((x) => x.id === id);
  if (!w) return;
  const cur = deviceFacts(matched().get(id))?.id, list = candidatesFor(w, fx.device);
  fx.c.openSheet(`<div class="row between"><h2>⌚ Which WHOOP workout?</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${E(w.title)} · ${E(w.date)}. Only workouts from the same day.</p>
    ${list.map((x) => `<button type="button" class="card fx-hist${x.id === cur ? ' on' : ''}" data-fx="wpick:${E(w.id)}:${E(x.id)}" aria-pressed="${x.id === cur}"><span class="grow"><b>${E(x.name || 'Workout')} · ${E(clock(x.start))}</b><small class="muted">${x.minutes ?? '?'} min${x.strain != null ? ` · strain ${x.strain.toFixed(1)}` : ''}${x.kcal ? ` · ${x.kcal} kcal` : ''}</small></span>${x.id === cur ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('') || '<p class="small muted">No WHOOP workouts that day.</p>'}
    <div class="fx-two"><button type="button" class="ghost" data-fx="wnone:${E(w.id)}">None of these</button><button type="button" data-fx="summary:${E(w.id)}">Back</button></div>`);
}
async function setMatch(id, match) {
  const w = fx.log.find((x) => x.id === id);
  if (!w) return;
  await appendLog(W.normalize({ ...w, match }));
  summarySheet(id);
  fx.c.toast(match.none ? 'Unlinked — no WHOOP workout for this one' : '⌚ Matched');
}
// The logged workout a device workout went with ("✓ Upper Body in Fitness" on Health's Strain sheet).
export function loggedFor(deviceId) {
  for (const [id, m] of matched()) if (m.device.id === deviceId) return fx.log.find((w) => w.id === id)?.title || '';
  return '';
}
// 🪶 Make it lighter (from Health's WHOOP section): a preview first, today only, Undo after.
export function lighterState() {
  const t = open();
  return { can: !!(t && W.proposeVariant(t, 'lighter')), applied: t && fx.original?.workout.id === t.id ? fx.original.intent : null };
}
function lighterSheet() {
  const t = open(), v = t && W.proposeVariant(t, 'lighter');
  if (!v) return fx.c.toast('Nothing left to make lighter');
  fx.variant = v;
  fx.c.openSheet(`<div class="row between"><h2>🪶 Make today's workout lighter?</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small"><b>${E(t.title)}</b></p>
    <ul class="fx-changes">${v.changes.map((ch) => `<li>${E(W.changeText(ch))}</li>`).join('')}</ul>
    ${v.minutes.from && v.minutes.to ? `<p class="small muted">About ${v.minutes.from} → ${v.minutes.to} min. Same weights and reps.</p>` : ''}
    <p class="tiny muted">Today only — your saved workouts don't change, and you can undo it.</p>
    <div class="fx-two"><button type="button" data-fx="lighterok">Apply</button><button type="button" class="ghost" data-act="close">Keep original</button></div>`);
  return null;
}
function undoLighter() {
  const t = open(), o = fx.original;
  if (!t || !o || o.workout.id !== t.id) return;
  fx.today = W.undoVariant(o.workout, t); fx.original = null; saveToday(true);
  fx.c.toast('Back to the original workout'); fx.c.refresh?.(); render();
}
function histSheet(id) {
  const w = listed().find((x) => x.id === id);
  if (!w) return;
  if (w.group) {
    fx.c.openSheet(`<div class="row between"><h2>${E(w.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
      <p class="small muted">${E(w.date || '')} · ${w.activity.minutes} min${w.activity.kcal ? ` · ${w.activity.kcal} kcal` : ''} · from your device</p>
      ${w.group.map((x) => `<p class="small"><b>${E(x.title)}</b> · ${x.activity?.minutes ?? '?'} min${x.activity?.kcal ? ` · ${x.activity.kcal} kcal` : ''}</p>`).join('')}
      <p class="tiny muted">Walks, stretches and short activities are grouped here. They all count in your Diet calories.</p>`);
    return;
  }
  const s = W.summary(w);
  const lines = w.blocks.flatMap((b) => b.items.map((it) => `<p class="small"><b>${E(it.name || '?')}</b>${it.perSide ? ' <small class="muted">each side</small>' : ''} ${it.sets.map((x) => (x.done ? `${E(didText(x))}${changed(x) ? ` <small class="muted">(plan ${E(planText(x))})</small>` : ''}` : `<s class="muted" title="Not done">${E(planText(x)) || '—'}</s>`)).join(' · ')}</p>`));
  fx.c.openSheet(`<div class="row between"><h2>${E(w.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${E(w.date || '')}${s.minutes ? ` · ${s.minutes} min` : ''}${s.volume ? ` · ${s.volume.toLocaleString()} lb lifted` : ''}${w.source === 'device' ? ' · from your device' : w.source === 'lift' || w.program ? ' · lifting program' : ''}</p>
    ${deviceHtml(w)}
    ${lines.join('') || (w.activity ? `<p class="small">${E(w.activity.kind)}${w.activity.minutes ? ` · ${w.activity.minutes} min` : ''}${w.activity.kcal ? ` · ${w.activity.kcal} kcal` : ''}</p>` : '')}
    <div class="row fx-rename"><label class="grow"><span class="visually-hidden">Name</span><input id="fxRename" value="${E(w.title)}" maxlength="80" aria-label="Workout name"></label><button type="button" class="ghost" data-fx="rename:${E(w.id)}">Rename</button></div>
    ${w.blocks.length ? `<div class="row"><button type="button" class="grow" data-fx="repeat:${E(w.id)}">🔁 Do it again today</button><button type="button" class="ghost" data-fx="savetpl:${E(w.id)}">Save it</button></div>` : ''}`);
}
// 📋 The lifting program is optional: until you choose it, Fitness only offers to set it up.
function programSheet() {
  fx.c.openSheet(`<div class="row between"><h2>📋 Lifting program</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small"><b>Full body, 3 days a week, in 6-week blocks.</b> Day A is heavy, Day B moderate, Day C light. Weights go up once you reach the top of each rep range; week 6 is an easier deload week.</p>
    <p class="small muted">Optional — your own workouts work without it. Once it's on, ＋ Add Workout offers the next program day as Today's Workout, with weights from what you last lifted.</p>
    <button type="button" class="wide" data-fx="programon">Use this program</button>`);
}
const num = (v) => (v === '' || v == null ? null : +v);
export async function onClick(t) {
  const [a, ...r] = t.dataset.fx.split(':'), n = r.map(Number);
  const c = fx.c;
  switch (a) {
    case 'main': case 'add': dropPic(); fx.view = 'main'; return c.show();
    case 'open': case 'today': fx.view = open() ? 'today' : 'main'; return c.show();
    case 'start': begin(); return c.show();
    case 'train': fx.view = open() ? 'train' : 'main'; return c.show();
    case 'build': return edit({ title: '', blocks: [blank(1)] });
    case 'describe': fx.said = null; fx.view = 'describe'; render(); document.getElementById('fxSaid')?.focus(); return checkClaude();
    case 'read': return readSaid();
    case 'reviewlocal': { const w = fx.said?.local?.workout; fx.unread = fx.said?.local?.unread || []; fx.said = null; return w && edit(w); }
    case 'readai': return readWithClaude();
    case 'photo': dropPic(); fx.view = 'photo'; render(); if (fx.ai == null) { fx.ai = await c.aiReady().catch(() => null); render(); } return null;
    case 'readpic': return readPic();
    case 'pickpic': return document.querySelector('[data-fxpick]')?.click();
    case 'tpl': return startWith(fx.templates[n[0]], 'repeat');
    case 'program': return programSheet();
    case 'programon': {
      await c.editMine((s) => { const l = s.get('lift', {}) || {}; s.set('lift', { ...l, on: true, block: l.block || 1 }); return s.get('lift', {}); }).then((lift) => { fx.lift = lift; });
      c.closeSheet(); render(); return c.toast('📋 Program on — find the next day under ＋ Add Workout');
    }
    case 'fromprogram': return startWith(PG.programWorkout(fx.lift || {}, fx.log, { date: c.iso() }), 'program');
    case 'hist': return histSheet(r.join(':'));
    case 'rename': {
      const id = r.join(':'), w = listed().find((x) => x.id === id), name = document.getElementById('fxRename')?.value.trim();
      if (!w || !name || name === w.title) return null;
      // An older workout (the trackers' program, a device) gets a renamed copy in your history.
      await appendLog(W.normalize({ ...w, title: name }));
      c.closeSheet(); render(); return c.toast('Renamed');
    }
    case 'repeat': { const w = history().find((x) => x.id === r.join(':')); c.closeSheet(); return w && startWith(W.repeatOf(w, c.iso()), 'repeat'); }
    case 'savetpl': { const w = history().find((x) => x.id === r.join(':')); if (!w) return; fx.templates = [W.repeatOf(w, ''), ...fx.templates.filter((x) => x.title !== w.title)].slice(0, 30); await saveToday(true); c.closeSheet(); return c.toast(`Saved "${w.title}" — find it under Add Workout`); }
    case 'edittoday': return edit(fx.today, 'today');
    case 'droptoday': {
      if (W.summary(fx.today).done && !c.confirm(`Remove "${fx.today.title}"? The sets you've logged in it go too.`)) return null;
      fx.today = null; await saveToday(true); fx.view = 'main'; return render();
    }
    case 'cancel': fx.draft = null; fx.unread = []; fx.view = fx.draftFrom === 'today' && open() ? (fx.today.status === 'active' ? 'train' : 'today') : 'main'; return render();
    case 'rounds': fx.draft = W.setRounds(fx.draft, n[0], fx.draft.blocks[n[0]].rounds + n[1]); return render();
    case 'delblock': fx.draft.blocks.splice(n[0], 1); return render();
    case 'delitem': { const b = fx.draft.blocks[n[0]]; b.items.splice(n[1], 1); if (!b.items.length) fx.draft.blocks.splice(n[0], 1); else b.kind = W.kindFor(b.items.length); return render(); }
    case 'additem': { const b = fx.draft.blocks[n[0]]; b.items.push(W.makeItem({ name: '', sets: b.items[0]?.sets.map(() => ({})) || [{}] }, b.rounds)); b.items.at(-1).uncertain = undefined; delete b.items.at(-1).uncertain; b.kind = b.items.length > 2 && b.kind !== 'circuit' ? 'circuit' : W.kindFor(b.items.length); return render(); }
    case 'addblock': { const blk = W.makeBlock({ ...blank(n[0]), kind: n[0] >= 3 ? 'circuit' : undefined }); delete blk.uncertain; for (const it of blk.items) delete it.uncertain; fx.draft.blocks.push(blk); return render(); }
    case 'startnow': case 'logdone': {
      const w = W.normalize(fx.draft);
      if (W.problems(w).length) return render();
      if (W.untitled(w.title)) w.title = W.suggestName(w);
      fx.draft = null; fx.unread = [];
      const src = w.source === 'text' || w.source === 'photo' ? w.source : 'manual';
      if (a === 'startnow') return startWith(w, src, { start: true });
      // ✓ Log as done: you already did it — every set recorded as planned (change any in history).
      const at = Date.now();
      const done = W.complete(W.logRemaining(W.normalize({ ...applyBumps(w), date: c.iso(), status: 'active', source: src })), at);
      await appendLog(done); await saveToday(true);
      fx.view = 'main'; render(); summarySheet(done.id);
      return c.toast(`💪 ${done.title} logged`);
    }
    case 'all': case 'allblock': {
      const prev = fx.today, [bi, ii] = n;
      let w = fx.today;
      const before = W.remaining(w).length;
      if (a === 'all') w = W.logAll(w, bi, ii); else w.blocks[bi].items.forEach((_, j) => { w = W.logAll(w, bi, j); });
      setToday(w); fx.rest = null; render();
      return c.toast(`✓ ${before - W.remaining(w).length} sets logged as planned`, () => { setToday(prev); render(); });
    }
    case 'logrest': {
      const rem = W.remaining(fx.today), by = new Map();
      for (const x of rem) { const k = `${x.bi}:${x.ii}`; if (!by.has(k)) by.set(k, { name: x.name, sets: [] }); by.get(k).sets.push(x.set); }
      const line = (g) => { const s0 = g.sets[0]; const same = g.sets.every((x) => x.reps === s0.reps && x.weight === s0.weight); return `${E(g.name || '?')} — ${g.sets.length} set${g.sets.length === 1 ? '' : 's'}${same && s0.reps != null ? ` × ${s0.reps}${s0.bw ? ' (bodyweight)' : s0.weight != null ? ` @ ${s0.weight} ${E(s0.unit)}` : ''}` : ''}`; };
      return c.openSheet(`<h2 style="margin:0 0 6px">Log the ${rem.length} remaining set${rem.length === 1 ? '' : 's'} as planned?</h2>
        <p class="small">They'll be recorded as <b>done with the planned reps and weights</b>:</p><ul class="small">${[...by.values()].map((g) => `<li>${line(g)}</li>`).join('')}</ul>
        <p class="tiny muted">Did something differently? Cancel and change that set first. You can undo this.</p>
        <div class="fx-two"><button type="button" data-fx="logrestok">✓ Log ${rem.length} set${rem.length === 1 ? '' : 's'} as planned</button><button type="button" class="ghost" data-act="close">Cancel</button></div>`);
    }
    case 'logrestok': {
      const prev = fx.today, k = W.remaining(prev).length;
      setToday(W.logRemaining(prev)); fx.rest = null; c.closeSheet(); render();
      return c.toast(`✓ ${k} sets logged as planned`, () => { setToday(prev); render(); });
    }
    case 'summary': return summarySheet(r.join(':'));
    case 'wpicker': return pickerSheet(r[0]);
    case 'wpick': return setMatch(r[0], { id: r.slice(1).join(':') });
    case 'wnone': return setMatch(r[0], { none: true });
    case 'lighter': return lighterSheet();
    case 'lighterok': {
      const v = fx.variant, t = open();
      fx.variant = null; c.closeSheet();
      if (!v || !t || v.workout.id !== t.id) return null;
      fx.original = { intent: v.intent, workout: t };
      fx.today = W.normalize({ ...v.workout, status: t.status, startedAt: t.startedAt });
      await saveToday(true);
      c.toast('🪶 Lighter for today', () => undoLighter());
      c.refresh?.(); return render();
    }
    case 'lighterundo': return undoLighter();
    case 'bump': {
      const p = fx.sug?.[n[0]];
      if (!p) return null;
      fx.bumps = { ...fx.bumps, [nm(p.name)]: { from: p.from, to: p.to, unit: p.unit } };
      for (const t0 of fx.templates) for (const b of t0.blocks) for (const it of b.items) if (nm(it.name) === nm(p.name)) for (const st of it.sets) if (st.weight === p.from && st.unit === p.unit) st.weight = p.to;
      await saveToday(true); summarySheet(fx.sumId);
      return c.toast(`📈 Next time: ${p.name} at ${p.to} ${p.unit}`);
    }
    case 'nobump': fx.sug.splice(n[0], 1); return summarySheet(fx.sumId);
    case 'resttoggle': { const on = !restOn(); try { localStorage.setItem(REST_KEY(), on ? '1' : '0'); } catch { /* private mode */ } if (!on) fx.rest = null; render(); return c.toast(on ? '⏱ Rest timer on — it starts when you tick a set' : 'Rest timer off'); }
    case 'restplus': if (fx.rest) { fx.rest.until = Math.max(Date.now(), fx.rest.until) + 30000; fx.rest.buzzed = false; render(); tickRest(); } return null;
    case 'restskip': fx.rest = null; return render();
    case 'savedraft': {
      const w = W.normalize(fx.draft);
      if (W.problems(w).length) return render();
      if (W.untitled(w.title)) w.title = W.suggestName(w);
      if (fx.draftFrom === 'today' && open()) {
        fx.today = { ...w, id: fx.today.id, status: fx.today.status, startedAt: fx.today.startedAt, program: fx.today.program };
        if (!fx.today.program) delete fx.today.program;
        if (!fx.today.startedAt) delete fx.today.startedAt;
        fx.draft = null; await saveToday(true); fx.view = fx.today.status === 'active' ? 'train' : 'today'; return render();
      }
      fx.draft = null; fx.unread = [];
      return startWith(w, w.source === 'text' || w.source === 'photo' ? w.source : 'manual');
    }
    case 'log': {
      const [bi, ii, si] = n, row = t.closest('.fx-logrow');
      const got = {}; for (const inp of row.querySelectorAll('[data-fxl]')) got[inp.dataset.fxl.split(':')[0]] = num(inp.value);
      setToday(W.logSet(fx.today, bi, ii, si, got)); startRest(bi, si); render();
      document.querySelector('.fx-round.next')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return null;
    }
    case 'undo': { let w = fx.today; for (let ii = 0; ii < w.blocks[n[0]].items.length; ii++) w = W.unlogSet(w, n[0], ii, n[1]); setToday(w); return render(); }
    case 'finish': {
      const s = W.summary(fx.today);
      if (!s.done && !c.confirm('Nothing is ticked yet. Complete it anyway?')) return;
      const done = W.complete(fx.today);
      await appendLog(done);
      fx.today = null; await saveToday(true);
      fx.rest = null; fx.view = 'main'; render(); summarySheet(done.id);
      return c.toast(`💪 ${done.title} — ${s.done} sets. Nice work.`);
    }
    default: return null;
  }
}
// The Add / Save button and the problem line follow the draft as you type.
function refreshFoot() {
  const p = W.problems(fx.draft), line = document.getElementById('fxProblems');
  for (const b of document.querySelectorAll('[data-fx=savedraft],[data-fx=startnow],[data-fx=logdone]')) b.disabled = p.length > 0;
  if (line) line.textContent = p.join(' ');
}
// Editor inputs: the draft follows what you type (no re-render while typing).
export function onInput(t) {
  const [f, ...r] = t.dataset.fxe.split(':'), [bi, ii, si] = r.map(Number);
  if (f === 'title') { fx.draft.title = t.value; return; }
  if (f === 'perside') { const it = fx.draft.blocks[bi].items[ii]; if (t.checked) it.perSide = true; else delete it.perSide; return; }
  if (f === 'name') {
    fx.draft = W.renameItem(fx.draft, bi, ii, t.value); t.classList.toggle('unsure', !t.value.trim());
    const title = document.querySelector('[data-fxe=title]'); if (title) title.placeholder = W.suggestName(fx.draft);
    return refreshFoot();
  }
  if (f === 'measure') {
    const it = fx.draft.blocks[bi].items[ii];
    it.sets = it.sets.map((s) => W.makeSet({ ...s, bw: t.value === 'bw', weight: t.value === 'reps' ? s.weight : null, time: t.value === 'time' ? s.time ?? null : null, distance: t.value === 'distance' ? s.distance ?? null : null, reps: t.value === 'time' || t.value === 'distance' ? null : s.reps }));
    return render();
  }
  fx.draft = W.editSet(fx.draft, bi, ii, si, { [f]: num(t.value) });
  t.classList.remove('unsure');
}
