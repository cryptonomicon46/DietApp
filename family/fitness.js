// 🏋️ Fitness: strength and circuit training. Add a workout (build it, describe it, a photo, a saved
// one or the lifting program — all the same workout model, js/workout.js) → Today's Workout (the
// plan) → Start Workout → Train (what you actually did, set by set) → Complete → History.
// Loaded only when you open Fitness. Your workouts are locked with the family key and stored as two
// records of yours: Today's Workout (with saved workouts) and the history. A workout in progress is
// also kept on this phone (locked the same way) until it's finished, so leaving or reloading
// never loses a set.
import * as W from '../js/workout.js';

const fx = { c: null, today: null, templates: [], log: [], todayAt: 0, logAt: 0, loaded: false, draft: null, draftFrom: null, legacy: [], others: [], lift: null, timer: null, view: 'main', said: null, unread: [], reading: false, ai: null, pic: null };
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
// Device workouts that aren't strength or circuit work stay out of the history (one quiet line
// instead); they're still synced and still count in your Diet calories.
export function setLegacy(data, names = {}) {
  const all = [...(data?.lift?.sessions || []).map((s) => W.fromLiftSession(s, names)), ...(data?.workoutHistory || []).filter((x) => x?.start).slice(-200).map(W.fromDeviceWorkout)];
  fx.legacy = all.filter(W.isStrength);
  fx.others = all.filter((w) => !W.isStrength(w));
  fx.lift = data?.lift || null;
}
Object.defineProperties(fx, {
  programOn: { get: () => PG.programOn(fx.lift) },
  programNext: { get: () => (PG.programOn(fx.lift) ? PG.programNext(fx.lift, fx.log) : null) },
});
const allDone = () => [...fx.log, ...fx.legacy.filter((x) => !fx.log.some((y) => y.id === x.id))].filter((w) => w.status === 'done');
const history = () => allDone().filter(W.isStrength).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.doneAt || 0) - (a.doneAt || 0));
const open = () => (fx.today && fx.today.status !== 'done' ? fx.today : null);

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
    return { state: 'active', title: t.title, html: (hot) => row(hot, '🏋️', `<button type="button" class="hl-what" data-fx="train"><b>${esc(t.title)} · in progress</b><small>${esc(doneText(t))}${t.startedAt ? ` · ${Math.max(1, Math.round((Date.now() - t.startedAt) / 60000))} min` : ''}</small></button><span class="hl-bar hl-prog" aria-hidden="true"><i style="width:${s.sets ? Math.round((s.done / s.sets) * 100) : 0}%"></i></span>`, `<button type="button" class="grow" data-fx="train">▶ Resume ${esc(t.title)}</button>`) };
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
function othersLine() {
  const since = new Date(Date.parse(`${fx.c.iso()}T12:00:00Z`) - 30 * 864e5).toISOString().slice(0, 10);
  const o = fx.others.filter((w) => (w.date || '') >= since);
  if (!o.length) return '';
  const kinds = [...new Set(o.map((w) => w.activity?.kind || w.title))].slice(0, 3).map((k) => k.toLowerCase()).join(', ');
  return `<p class="tiny muted pad">Also ${o.length} other activit${o.length === 1 ? 'y' : 'ies'} from your device in the last 30 days (${E(kinds)}) — not listed here, still counted in your Diet calories.</p>`;
}
function programLine() {
  if (!fx.programOn) return '<p class="small center"><button type="button" class="linkish small" data-fx="program">Set up a lifting program</button></p>';
  const n = fx.programNext;
  return `<button type="button" class="card fx-hist" data-fx="fromprogram"><span class="grow"><b>📋 From my program</b><small class="muted">${E(n ? `${n.title} · ${n.weekLabel}` : 'The next day of your program')}</small></span><span class="go">›</span></button>`;
}
function mainHtml() {
  const t = open();
  const h = history().slice(0, 25);
  return `${head('data-view="health"', 'Health', '🏋️ Fitness')}
    ${t ? `<section class="card fx-todaycard"><div class="eyebrow">Today's Workout</div><h3>${E(t.title)}</h3><p class="small muted">${t.status === 'active' ? `${E(doneText(t))} · in progress` : E(meta(t))}</p>
      <div class="row"><button type="button" class="grow" data-fx="${t.status === 'active' ? 'train' : 'start'}">${t.status === 'active' ? 'Resume Workout' : 'Start Workout'} →</button><button type="button" class="ghost" data-fx="today">View</button></div></section>` : ''}
    <section class="card"><h3 class="card-h">＋ Add Workout</h3>
      <div class="fx-paths">${TILES.filter(([k]) => k !== 'photo' || fx.ai !== false).map(([k, i, l, d]) => `<button type="button" data-fx="${k}"><b aria-hidden="true">${i}</b><span>${l}</span><small>${d}</small></button>`).join('')}</div>
      ${fx.templates.length ? `<p class="small muted">Saved: ${fx.templates.slice(0, 6).map((w, i) => `<button type="button" class="linkish small" data-fx="tpl:${i}">${E(w.title)}</button>`).join(' · ')}</p>` : ''}
      ${programLine()}</section>
    <h3 class="wl-h">History</h3>
    ${h.length ? h.map((w) => { const s = W.summary(w); return `<button type="button" class="card fx-hist" data-fx="hist:${E(w.id)}"><span class="grow"><b>${E(w.title)}</b><small class="muted">${E(w.date || '')}${w.source === 'device' ? ` · ${w.activity?.minutes ?? '?'} min · from your device` : ` · ${s.exercises} exercise${s.exercises === 1 ? '' : 's'} · ${s.done || s.sets} sets`}</small></span><span class="go">›</span></button>`; }).join('') : '<p class="small muted pad">Finished workouts show here.</p>'}
    ${othersLine()}`;
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
    ${fromAi ? `<p class="small muted pad">${w.source === 'photo' ? 'Read from your photo' : 'Read from what you wrote'}. Check it before adding — nothing is saved until you tap Add.</p>` : ''}
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
      <button type="button" class="linkish small" data-fx="additem:${bi}">＋ Add an exercise to this ${b.items.length > 1 ? (b.kind === 'circuit' ? 'circuit' : 'superset') : 'part (makes a superset)'}</button></section>`).join('')}
    <div class="row wrap fx-add"><button type="button" class="ghost small" data-fx="addblock:1">＋ Exercise</button><button type="button" class="ghost small" data-fx="addblock:2">＋ Superset</button><button type="button" class="ghost small" data-fx="addblock:3">＋ Circuit</button></div>
    <p class="small muted pad" id="fxProblems">${p.map(E).join(' ')}</p>
    <div class="fx-foot"><button type="button" class="ghost" data-fx="cancel">Cancel</button><button type="button" data-fx="savedraft" ${p.length ? 'disabled' : ''}>${fx.draftFrom === 'today' ? 'Save' : "Add to Today's Workout"}</button></div>`;
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
    ${w.blocks.map((b, bi) => `<section class="card fx-block"><b>${b.items.length > 1 ? blockLabel(b) : `🏋️ ${E(b.items[0]?.name || '')}${b.items[0]?.perSide ? ' <small class="muted">each side</small>' : ''}`}</b>${b.note ? `<small class="muted">${E(b.note)}</small>` : ''}
      ${[...Array(b.rounds).keys()].map((r) => { const all = b.items.every((it) => it.sets[r]?.done);
        const lab = b.items.length > 1 ? `Round ${r + 1}` : `Set ${r + 1}`;
        return all ? `<p class="small fx-rdone">${lab} — ${b.items.map((it) => `${b.items.length > 1 ? `${E(it.name)} ` : ''}${E(didText(it.sets[r]))}${changed(it.sets[r]) ? ` <small class="muted">(plan ${E(planText(it.sets[r]))})</small>` : ''}`).join(' · ')} ✓ <button type="button" class="linkish tiny" data-fx="undo:${bi}:${r}" aria-label="Undo ${lab}">undo</button></p>`
          : `<div class="fx-round ${nx && nx.bi === bi && nx.si === r ? 'next' : ''}">${b.items.length > 1 ? `<div class="small"><b>${lab}</b></div>` : ''}${b.items.map((it, ii) => { const x = it.sets[r], m = measureOf(it); return `<div class="fx-logrow ${x.done ? 'done' : ''}">
            <span class="grow"><b>${b.items.length > 1 ? `${E(it.name)}${it.perSide ? ' <small class="muted">each side</small>' : ''}` : lab}</b><small class="muted">${E(planText(x)) || 'as you like'}</small></span>
            ${x.done ? `<span class="small">${E(didText(x))} ✓</span>` : `<span class="fx-in">${m === 'time' ? `<input inputmode="numeric" data-fxl="time:${bi}:${ii}:${r}" value="${x.time ?? ''}" aria-label="Seconds, ${E(it.name)} ${lab}" placeholder="sec">` : m === 'distance' ? `<input inputmode="decimal" data-fxl="distance:${bi}:${ii}:${r}" value="${x.distance ?? ''}" aria-label="Distance, ${E(it.name)} ${lab}" placeholder="${x.distUnit}">` : `<input inputmode="numeric" data-fxl="reps:${bi}:${ii}:${r}" value="${x.reps ?? ''}" aria-label="Reps, ${E(it.name)} ${lab}" placeholder="reps">${m === 'reps' ? `<input inputmode="decimal" data-fxl="weight:${bi}:${ii}:${r}" value="${x.weight ?? ''}" aria-label="Weight (${x.unit}), ${E(it.name)} ${lab}" placeholder="${x.unit}">` : ''}`}</span>
              <button type="button" class="fx-check" data-fx="log:${bi}:${ii}:${r}" aria-label="Done: ${E(it.name)}, ${b.items.length > 1 ? 'round' : 'set'} ${r + 1}">✓</button>`}</div>`; }).join('')}</div>`; }).join('')}
    </section>`).join('')}
    <div class="fx-foot"><button type="button" class="ghost" data-fx="edittoday">Edit</button><button type="button" data-fx="finish">Complete Workout</button></div>`;
}

// ---------- actions ----------
function setToday(w) { fx.today = w; saveToday(); }
// A new Today's Workout (from any of the ways in): shown as the plan first; Start Workout begins it.
async function startWith(w, source) {
  const fresh = W.normalize({ ...w, date: fx.c.iso(), status: 'planned', source: source || w.source });
  if (W.untitled(fresh.title)) fresh.title = W.suggestName(fresh);
  if (open() && W.summary(fx.today).done && !fx.c.confirm(`Replace "${fx.today.title}"? What you've logged in it is kept only if you complete it first.`)) return;
  fx.today = fresh; await saveToday(true);
  fx.view = 'today'; render(); fx.c.toast(`🏋️ ${fresh.title} is Today's Workout`);
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
function histSheet(id) {
  const w = history().find((x) => x.id === id);
  if (!w) return;
  const s = W.summary(w);
  const lines = w.blocks.flatMap((b) => b.items.map((it) => `<p class="small"><b>${E(it.name || '?')}</b>${it.perSide ? ' <small class="muted">each side</small>' : ''} ${it.sets.map((x) => (x.done ? `${E(didText(x))}${changed(x) ? ` <small class="muted">(plan ${E(planText(x))})</small>` : ''}` : `<s class="muted" title="Not done">${E(planText(x)) || '—'}</s>`)).join(' · ')}</p>`));
  fx.c.openSheet(`<div class="row between"><h2>${E(w.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${E(w.date || '')}${s.minutes ? ` · ${s.minutes} min` : ''}${s.volume ? ` · ${s.volume.toLocaleString()} lb lifted` : ''}${w.source === 'device' ? ' · from your device' : w.source === 'lift' || w.program ? ' · lifting program' : ''}</p>
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
      const id = r.join(':'), w = history().find((x) => x.id === id), name = document.getElementById('fxRename')?.value.trim();
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
      setToday(W.logSet(fx.today, bi, ii, si, got)); render();
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
      fx.view = 'main'; render(); histSheet(done.id);
      return c.toast(`💪 ${done.title} — ${s.done} sets. Nice work.`);
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
