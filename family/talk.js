// 🗣️ Talk to Pawmily (T1): the Talk sheet. Loaded the first time you tap the Talk bar on Home or the
// gold circle on another tab. You type (or dictate with the keyboard's 🎤 — only words, never audio);
// the phone reads everyday requests itself (js/talkParse.js), and only what it can't goes to Claude
// (/ai/talk), with people swapped for roles first (js/talkActions.js toTokens). Every request becomes
// a small card you approve; nothing changes until you tap. Each card saves through the area that owns
// it — Watch, Read, the chores log — or opens that area's own preview (Tell me for meals, Describe it
// for workouts, Make it lighter). T1 only does things that are yours; T2a answers questions about your
// day (js/talkDay.js — with your OK once) and can add a suggested time to your own calendar only.
// Nothing you said is kept (no history).
import { parseTalk, photoAsk, howAsk } from '../js/talkParse.js';
import { toTokens, fromTokens } from '../js/talkActions.js';
import { isDayQuestion, checkSuggestions } from '../js/talkDay.js';
import { browserVoiceOutput } from './voice.js';
import * as P from '../js/proposal.js';

let c = null;
// Closing Talk stops listening (the microphone goes off) and forgets any card not yet saved.
function closed() { hush(); const v = tk.voice; tk.voice = null; v?.abort(); if (tk.prop?.state === 'draft') tk.prop.state = 'cancelled'; tk.prop = null; }
export function init(ctx) { document.getElementById('sheet')?.addEventListener('close', closed); c = ctx; }
const tk = { tab: 'home', text: '', busy: false, cards: null, say: '', error: '', consent: null, voice: null, prop: null, propMsg: '' };
// v4: food (v2), drive times from where you are (v3), and any day you ask about, not just today and
// tomorrow (v4) — each widened what's sent, so it's asked again.
const DAYOK = () => `fam.talk.dayok4.${c.who()}`;
const E = (s) => c.esc(s);
const SEEN = 'fam.talk.seen';
export const ICON = '<svg class="tk-ic" viewBox="0 0 32 32" aria-hidden="true"><path class="bub" d="M5 7.5A4.5 4.5 0 0 1 9.5 3h13A4.5 4.5 0 0 1 27 7.5v9a4.5 4.5 0 0 1-4.5 4.5H14l-6 5v-5h0A3 3 0 0 1 5 18z"/><rect class="mic" x="13.5" y="6.5" width="5" height="8" rx="2.5"/><path class="mic-s" d="M11 12a5 5 0 0 0 10 0M16 17v2"/></svg>';
// Phrases to start from (they fill the box — you finish or change them), for the tab you're on.
const EXAMPLES = {
  home: ["What's on today?", 'When should I go for a run today?', 'Add Dune to our watchlist', 'Walked the dogs', 'Fed the dogs dinner'],
  us: ["We're watching Severance now", 'Add Project Hail Mary to our reading list', 'I finished reading Piranesi'],
  health: ['Log dinner: salmon and rice', 'Add peanut butter to breakfast', 'Log my weight 160.6', 'Plan dinner: salmon and rice', 'Log a packaged meal for lunch', 'How much protein is left today?', "Make today's workout lighter"],
};
const WATCH = { want: 'Want to Watch', watching: 'Watching', finished: 'Watched', upnext: 'Up Next', dropped: 'Stopped' };
const READ = { want: 'Want to Read', reading: 'Reading', finished: 'Finished', dropped: 'Stopped' };
const HOW_SAY = { meal: 'Here are the ways to log a meal.', workout: 'Here are the ways to log a workout.', weight: 'Here are the ways to log your weight.' };
const MEAL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', extra: 'A snack or extra' };
const MIC_OK = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const voiceOff = () => { try { return c.LS.get('fam.talk.voice') === 'off'; } catch { return false; } };
// 🔊 Answers read aloud (family/voice.js VoiceOutputProvider; the phone's own voice today) — only
// when you asked by voice, and never if you turned it off. Nothing extra leaves the phone.
const out$ = () => c?.voiceOut || browserVoiceOutput;
const SPEAK_OK = () => out$().available();
// Off unless you switch it on (owner, 2026-10-30: no speaking back by default; a richer voice may come later).
const speakOn = () => { try { return c.LS.get('fam.talk.speak') === 'on'; } catch { return false; } };
let heard = false; // this request came from your voice
export function hush() { out$().stop(); }
export function speak(text, { always = false } = {}) {
  if (!SPEAK_OK() || (!always && (!heard || !speakOn()))) return;
  out$().speak(text);
}
const norm = (t) => String(t || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

// `meal`: opened from a meal's "Say what you had" — what you say is logged for that meal unless you name one.
export function open(tab = 'home', { voice = null, meal = null } = {}) {
  tk.tab = EXAMPLES[tab] ? tab : tab === 'watch' || tab === 'read' ? 'us' : tab === 'fitness' ? 'health' : 'home';
  Object.assign(tk, { text: '', busy: false, cards: null, say: '', error: '', consent: null, voice: null, prop: null, propMsg: '', meal: ['breakfast', 'lunch', 'snack', 'dinner', 'extra'].includes(meal) ? meal : null });
  if (voice) return listen(voice);
  draw();
  setTimeout(() => document.getElementById('tkText')?.focus(), 60);
  return null;
}
// 🎤 Listening (started by the tap in app.js): your words show as you speak; when you pause, the
// request is read like a typed one. "Type instead" stops it.
// Once "Don't Allow" is tapped, the phone remembers it (removing and re-adding the Home Screen icon
// doesn't reset it), so say exactly where to turn it back on.
const BLOCKED = /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent || '')
  ? "The microphone or speech recognition is blocked for Pawmily. On iPhone: Settings › Privacy & Security › Speech Recognition and › Microphone — turn on Safari (or OurPawmily); and Settings › Apps › Safari › Microphone › Ask. Then close Pawmily fully and open it again. Or type."
  : "The microphone is blocked for this app — allow it in your browser's or phone's settings, then open the app again. Or type.";
const SPEECH_ERR = { 'not-allowed': BLOCKED, 'service-not-allowed': BLOCKED, 'no-speech': "I didn't hear anything — tap 🎤 to try again, or type.", 'audio-capture': "The microphone isn't available — type instead.", network: "Speech recognition needs a connection — type instead." };
export function listen(voice, { onWords = null } = {}) {
  hush();
  if (!voice) { tk.error = "Listening isn't available here — type, or tap 🎤 on your keyboard."; return onWords ? onWords(null) : draw(); }
  tk.voice = voice; tk.say = ''; tk.error = '';
  if (!onWords) { tk.cards = null; tk.text = ''; }
  let shown = voice.state;
  draw();
  voice.listener = () => {
    if (tk.voice !== voice) return;
    if (!voice.ended) {
      // Words in place while you talk; the hint or the held buttons when that changes.
      if (voice.state !== shown) { shown = voice.state; return redrawListen(); }
      const live = document.getElementById('tkLive');
      if (live) live.textContent = voice.text || 'Listening…';
      return null;
    }
    tk.voice = null;
    if (voice.reason === 'cancel') return onWords ? onWords(null) : draw();
    if (voice.text) { heard = true; return onWords ? onWords(voice.text) : send(voice.text); }
    tk.error = SPEECH_ERR[voice.error] || (voice.error && voice.error !== 'no-speech' ? "I couldn't catch that — tap 🎤 to try again, or type." : "I didn't hear anything — tap 🎤 to try again, or type.");
    if (onWords) return onWords(null);
    draw();
    setTimeout(() => document.getElementById('tkText')?.focus(), 60);
    return null;
  };
  if (voice.ended || voice.text) voice.listener();
  return null;
}
function stopListening(typeInstead = false) {
  const v = tk.voice;
  if (!v) return;
  if (typeInstead) { v.abort(); tk.voice = null; draw(); setTimeout(() => document.getElementById('tkText')?.focus(), 60); return; }
  v.stop();
}
// The listening panel: your words as you say them, "Still listening…" in a pause, and when the
// phone stopped on its own and wants a tap, Tap to keep talking.
function listenHtml() {
  const v = tk.voice, held = v.state === 'held', pausing = v.state === 'pausing';
  return `<div class="tk-listen${held ? ' held' : ''}" role="status" id="tkListen"><span class="tk-pulse" aria-hidden="true">🎤</span><p id="tkLive" class="tk-live">${E(v.text || 'Listening…')}</p>
    ${held ? '<p class="small tk-wait">Paused — tap to keep talking, or Done.</p>' : pausing ? '<p class="small tk-wait">Still listening… keep talking to add more<span class="tk-bar" aria-hidden="true" style="animation-duration:${Math.max(0.3, ((v.finishMs || 3500) - (v.hintMs || 2000)) / 1000)}s"></span></p>' : '<p class="small tk-wait muted">Listening — take your time.</p>'}
    <div class="tk-two">${held ? '<button type="button" class="ghost" data-talk="more">🎤 Tap to keep talking</button>' : ''}<button type="button" data-talk="stop">Done</button>${held ? '' : '<button type="button" class="ghost" data-talk="type">Type instead</button>'}</div>
    <p class="tiny muted">Your phone's speech service turns your voice into text (Apple's on iPhone, Google's on Android); Pawmily only gets the words.</p></div>`;
}
function redrawListen() { const el = document.getElementById('tkListen'); if (el && tk.voice) el.outerHTML = listenHtml(); else draw(); }
function draw() {
  let first = false;
  try { first = !c.LS.get(SEEN); } catch { /* private mode */ }
  c.openSheet(`<div class="tk-sheet"><div class="row between tk-top"><h2>${ICON}Talk to Pawmily</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${tk.meal ? `<p class="tk-meal small">🍽 Logging <b>${E(MEAL[tk.meal].toLowerCase())}</b> — say what you had.</p>` : ''}
    ${first ? `<p class="tk-first">Say what you'd like done — add a show or a book, log a meal, a workout or a chore. Your phone reads it first; only what it can't read goes to Claude, with people's names swapped for roles. Nothing changes until you tap. <button type="button" class="linkish small" data-talk="seen">Got it</button></p>` : ''}
    ${tk.voice ? listenHtml()
    : tk.prop ? ''
    : `<form class="tk-form" data-talkform><label for="tkText" class="visually-hidden">What would you like?</label><textarea id="tkText" rows="2" maxlength="500" placeholder="Ask or tell Pawmily…" enterkeyhint="send">${E(tk.text)}</textarea>${MIC_OK() ? '<button type="button" class="ghost tk-mic" data-talk="mic" aria-label="Speak">🎤</button>' : ''}<button ${tk.busy ? 'disabled' : ''} aria-label="Send">${tk.busy ? '…' : '↑'}</button></form>
    <p class="tiny muted tk-hint">${MIC_OK() ? '🎤 Tap to speak, or type.' : '🎤 Tap the microphone on your keyboard to speak — only the words reach Pawmily.'}${MIC_OK() ? ` <button type="button" class="linkish tiny" data-talk="voiceoff">${voiceOff() ? 'Listen when I open Talk' : "Don't listen when I open Talk"}</button>` : ''}${MIC_OK() && SPEAK_OK() ? ` · <button type="button" class="linkish tiny" data-talk="speakoff">${speakOn() ? '🔇 Don\'t read answers aloud' : '🔊 Read answers aloud'}</button>` : ''}</p>`}
    <div id="tkOut" role="status">${out()}</div></div>`);
}
function out() {
  if (tk.voice) return tk.prop ? propHtml() : '';
  if (tk.prop) return propHtml();
  if (tk.busy) return '<p class="small muted">Reading…</p>';
  if (tk.error) return `<p class="small">${E(tk.error)}</p>`;
  if (tk.consent) return `<div class="tk-card"><b>📅 Answer questions about your day?</b><small>To answer, Pawmily sends Claude the calendar from this app for the days you ask about (today and tomorrow unless you name others, up to about a week) — times, titles, places and whose (names swapped for roles) — your free time, the forecast for your area, and, when you have them, your own WHOOP numbers and your own food today (your meal plan, what you've logged and what's left). Never your weight or notes. When you ask about going somewhere, your location (to about 100 m) and the place go to Google Maps for drive times with traffic and opening hours. Nothing is kept, and nothing changes unless you tap.</small><div class="tk-two"><button type="button" data-talk="dayok">Allow and ask</button><button type="button" class="ghost" data-talk="dayno">Not now</button></div></div>`;
  if (tk.cards) return tk.cards.map(cardHtml).join('') + (tk.cards.length > 1 && tk.cards.filter((x) => x.go && !x.done).length > 1 ? '<button type="button" class="wide" data-talk="all">Do all of these</button>' : '');
  if (tk.say) return `<div class="tk-card"><p class="small" style="margin:0">${E(tk.say)}</p></div>${examples()}`;
  return examples();
}
// Under the examples on Home and Health: the two ways to tell it about a meal.
const MEAL_CMDS = '<p class="tiny muted tk-cmds">🍽 <b>Log dinner: …</b> (or breakfast, lunch) replaces that meal · <b>Add … to dinner</b> adds to it</p>';
const examples = () => `<div class="tk-ex">${(EXAMPLES[tk.tab] || EXAMPLES.home).map((x) => `<button type="button" data-talkex="${E(x)}">${E(x)}</button>`).join('')}</div>${tk.tab === 'health' || tk.tab === 'home' ? MEAL_CMDS : ''}`;
const redraw = () => { const o = document.getElementById('tkOut'); if (o) o.innerHTML = out(); else draw(); };

// ---------- reading a request ----------
export async function send(text) {
  text = String(text || '').trim();
  if (!text) return;
  tk.text = text; tk.error = ''; tk.say = ''; tk.cards = null; tk.consent = null;
  // A "yes" with no card on screen confirms nothing.
  if (P.replyKind(text) === 'confirm') { tk.say = "There's nothing waiting to confirm."; speak(tk.say); return draw(); }
  // 📷 "Take a photo of my dinner": eaten out, from a photo — the card has the camera and Photos
  // buttons themselves (the phone only opens its camera for a tap right on them).
  // ❓ "How do I log a meal / a workout?": every way to do it, each one a tap away.
  const how = howAsk(text);
  if (how) { tk.cards = [{ type: 'how', topic: how.topic }]; tk.say = ''; speak(HOW_SAY[how.topic]); return draw(); }
  const photo = photoAsk(text, new Date().getHours());
  if (photo) {
    tk.cards = [photo.kind === 'workout' ? { type: 'photoworkout' } : { type: 'photomeal', meal: tk.meal && !/\b(breakfast|lunch|dinner|snack)\b/i.test(text) ? tk.meal : photo.meal }];
    tk.say = '';
    speak('Take a photo, or pick one from your Photos.');
    return draw();
  }
  // From a meal's "Say what you had": "two eggs and toast" → "Log lunch: two eggs and toast".
  const mealSaid = /\b(breakfast|lunch|dinner|snack)\b/i.test(text), forMeal = tk.meal && !mealSaid && !isDayQuestion(text);
  if (forMeal) text = `Log ${tk.meal === 'extra' || tk.meal === 'snack' ? 'a snack' : tk.meal}: ${text}`;
  const people = c.people(), t = toTokens(text, people);
  let steps = parseTalk(t.text)?.steps;
  // "Weighed in at 160.6 this morning" is a weigh-in, not a question about the morning.
  if (steps?.[0]?.do !== 'weight.log' && isDayQuestion(t.text)) return askDay(text, t);
  if (!steps) {
    const ai = await c.aiReady().catch(() => null);
    if (ai === false) { tk.say = "I couldn't read that on the phone, and Claude isn't set up here. I can add shows, movies and books, and log meals, your weight, workouts and chores — try one of these."; return redraw(); }
    tk.busy = true; draw();
    try {
      const r = await c.api.post('/ai/talk', { text: t.text, tab: tk.tab, today: c.iso() });
      steps = r.steps || [];
      if (!steps.length) tk.say = r.say || "I can't do that yet. I can add shows, movies and books, and log meals, your weight, workouts and chores.";
    } catch (e) { tk.error = e.status === 429 ? "That's all the Talk requests for today." : e.message || "Pawmily couldn't read that just now."; }
    tk.busy = false;
    if (!steps?.length) { speak(tk.say || tk.error); return draw(); }
  }
  if (steps[0]?.do === 'ask.day') return askDay(text, t);
  if (forMeal) steps = steps.map((s) => (s.do === 'diet.log' ? { ...s, meal: tk.meal } : s));
  // Roles back to names, in anything shown to you.
  steps = steps.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'string' && k !== 'do' ? fromTokens(v, t.map, people) : v])));
  // "…to my audiobooks", "the audiobook …", "I'm listening to …": the book goes on as 🎧 Audiobook.
  if (/\baudio\s*books?\b|\blisten/i.test(text)) steps = steps.map((s) => (s.do === 'read.add' || s.do === 'read.state' ? { ...s, f: 'listen' } : s));
  // A meal, a described workout or "make it lighter" on its own: straight to that area's own preview.
  // A meal or a described workout on its own: a review card here (nothing saved until you say so).
  if (steps.length === 1 && steps[0].do === 'diet.log') return proposeMeal(steps[0]);
  if (steps.length === 1 && steps[0].do === 'fitness.describe') return proposeWorkout(steps[0]);
  if (steps.length === 1 && steps[0].do === 'fitness.lighter') { c.closeSheet(); return handOff(steps[0]); }
  tk.cards = await Promise.all(steps.map(resolve));
  speak(tk.cards.length > 1 ? `Here are ${tk.cards.length} things — check them and tap to confirm.` : 'Here it is — check it and tap to confirm.');
  draw();
}

// ---------- ✅ Review before saving (meals and workouts) ----------
// The draft lives only here, in memory: closing Talk forgets it, and nothing is written until ✓ Log
// meal / ✓ Create workout, or "yes" said to 🎤 Change by voice on this card (js/proposal.js).
const MEALNAME = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', extra: 'Snack or extra' };
const r0 = (n) => Math.round(n || 0);
async function proposeMeal(s) {
  tk.busy = true; draw();
  try {
    const M = await c.dietMod();
    // "Log a packaged meal": the label form, as before.
    if (M.talkPackaged(s.meal, s.text)) { tk.busy = false; c.closeSheet(); return handOff(s); }
    const r = await M.talkRead(s.text);
    tk.busy = false;
    if (!r.items.length) { tk.say = r.note || "I couldn't make out the food in that — try naming each thing, like “2 eggs and a slice of toast”."; speak(tk.say); return draw(); }
    tk.M = M;
    tk.prop = P.makeProposal('meal', { meal: s.meal, items: r.items, unread: r.unread || [], plan: !!s.plan, add: !!s.add && s.meal !== 'extra', text: s.text, by: r.by });
    tk.propMsg = r.note || '';
    speak('Here’s what I heard. Does this look right?');
  } catch (e) { tk.busy = false; tk.error = e.message || "Couldn't read that just now."; }
  return draw();
}
async function readWorkout(text) {
  const T = await import('../js/workoutText.js'), local = T.parseWorkout(text, { today: c.iso() });
  if (!T.needsHelp(local)) return { workout: local.workout, unread: [], by: 'phone' };
  const ai = await c.aiReady().catch(() => null);
  if (ai) {
    try { const r = await c.api.post('/ai/workout', { text, unit: 'lb', today: c.iso() }); if (r.workout?.blocks?.length) return { workout: r.workout, unread: r.unread || [], by: 'claude' }; }
    catch (e) { if (e.status === 429) return { ...local, by: 'phone', note: e.message }; }
  }
  return { ...local, by: 'phone' };
}
async function proposeWorkout(s) {
  tk.busy = true; draw();
  try {
    const [r, W] = await Promise.all([readWorkout(s.text), import('../js/workout.js')]);
    tk.busy = false;
    if (!r.workout?.blocks?.length) { tk.say = "I couldn't find a workout in that — try “Squats 3x8 at 185, then bench 3x10 at 135”."; speak(tk.say); return draw(); }
    const w = W.normalize({ ...r.workout, date: c.iso(), source: 'text' });
    if (W.untitled(w.title)) w.title = W.suggestName(w);
    tk.prop = P.makeProposal('workout', { workout: w, unread: r.unread || [], by: r.by });
    tk.propMsg = r.note || '';
    speak('Here’s the workout. Does this look right?');
  } catch (e) { tk.busy = false; tk.error = e.message || "Couldn't read that just now."; }
  return draw();
}
let W$ = null; // js/workout.js, once a workout card has been shown
import('../js/workout.js').then((m) => { W$ = m; }).catch(() => {});
const setText = (st) => [st.reps != null ? String(st.reps) : st.time ? `${st.time}s` : st.distance ? `${st.distance} ${st.distUnit}` : '?', st.weight != null ? `@ ${st.weight} ${st.unit}` : st.bw ? 'bodyweight' : ''].filter(Boolean).join(' ');
function exLine(it, rounds) {
  const same = it.sets.every((x) => setText(x) === setText(it.sets[0] || {}));
  return same ? `${rounds ? '' : `${it.sets.length} × `}${setText(it.sets[0] || {})}` : it.sets.map(setText).join(' · ');
}
function propHtml() {
  const p = tk.prop, live = P.isLive(p), hot = new Set(p.changed);
  const acts = (main) => (tk.voice ? '' : `<div class="tk-acts"><button type="button" data-talk="pyes" ${live && !p.pending ? '' : 'disabled'}>${main}</button>
    <div class="tk-two"><button type="button" class="ghost" data-talk="pedit">✏️ Edit</button>${MIC_OK() ? '<button type="button" class="ghost" data-talk="change">🎤 Change by voice</button>' : ''}</div>
    <form class="tk-fix" data-talkfix><label for="tkFix" class="visually-hidden">Type a change</label><input id="tkFix" maxlength="300" placeholder="Or type a change — “remove the salsa”" enterkeyhint="send"><button class="ghost" aria-label="Change">↵</button></form>
    <button type="button" class="linkish small" data-talk="pno">Cancel</button></div>`);
  const msg = tk.propMsg ? `<p class="small tk-msg" role="status">${E(tk.propMsg)}</p>` : '';
  if (p.kind === 'meal') {
    const d = p.payload, t = totalsOf(d.items);
    const rows = d.items.map((x, i) => `<li class="${hot.has(i) ? 'tk-hot' : ''}"><span><b>${E(x.name)}</b><small class="muted">${E(x.amount || '')}${x.guess ? ' · typical portion — check' : ''}</small></span><span>${r0(x.kcal)} kcal</span></li>`).join('');
    // What's there now: "Add … to dinner" adds to it; "Log dinner: …" replaces it (and says so).
    const ex = d.meal !== 'extra' ? tk.M?.talkExisting(d.meal) : null, mn = (MEALNAME[d.meal] || 'meal').toLowerCase();
    const now = ex ? (d.add ? `<p class="small tk-now">Adds to ${E(mn)}: <b>${E(ex.title)}</b> · ${ex.kcal} kcal${ex.logged ? ' (logged)' : ' (planned)'} → <b>${ex.kcal + r0(t.kcal)} kcal</b></p>`
      : `<p class="small tk-now">Replaces ${ex.logged ? 'the' : 'today\'s planned'} ${E(mn)}${ex.logged ? ' you logged' : ''}: <span class="muted">${E(ex.title)} · ${ex.kcal} kcal</span>. To keep it, say <i>Add … to ${E(mn)}</i>.</p>`) : '';
    return `<div class="tk-card tk-review"><p class="tk-eyebrow">${d.add ? `Add to ${E(mn)} · not ${ex?.logged ? 'saved' : 'logged'} yet` : d.plan ? 'Review plan · not saved yet' : 'Review meal · not logged yet'}</p><b>🍽 ${d.add ? '＋ ' : ''}${E(MEALNAME[d.meal] || 'Meal')}</b>${now}
      <ul class="tk-rows">${rows}</ul>
      ${d.unread?.length ? `<p class="small">Couldn't place: ${d.unread.map((x) => `“${E(x)}”`).join(', ')} — say it with an amount, or ✏️ Edit.</p>` : ''}
      <p class="tk-tot"><b>${r0(t.kcal)}</b> kcal · <b>${r0(t.p)}</b> P · <b>${r0(t.c)}</b> C · <b>${r0(t.f)}</b> F</p>
      ${msg}<p class="small">${live ? 'Does this look right?' : 'This one expired — say it again.'}</p>${acts(d.add ? `✓ Add to ${mn}` : d.plan ? '✓ Plan meal' : '✓ Log meal')}</div>`;
  }
  const w = p.payload.workout, mins = W$?.durationFor(w)?.minutes;
  const blocks = w.blocks.map((b) => (b.items.length > 1
    ? `<li class="${b.items.some((it) => hot.has(it.id)) ? 'tk-hot' : ''}"><span><b>${b.kind === 'circuit' ? 'Circuit' : 'Superset'} · ${b.rounds} rounds</b><small class="muted">${b.items.map((it) => `${E(it.name)} ${E(exLine(it, true))}`).join(' + ')}</small></span></li>`
    : `<li class="${hot.has(b.items[0].id) ? 'tk-hot' : ''}"><span><b>${E(b.items[0].name)}</b><small class="muted">${E(exLine(b.items[0]))}</small></span></li>`)).join('');
  return `<div class="tk-card tk-review"><p class="tk-eyebrow">Review workout · not saved yet</p><b>🏋️ ${E(w.title)}${mins ? ` <small class="muted">· about ${mins} min</small>` : ''}</b>
    <ul class="tk-rows">${blocks}</ul>
    ${p.payload.unread?.length ? `<p class="small">Couldn't place: ${p.payload.unread.map((x) => `“${E(x)}”`).join(', ')} — ✏️ Edit to add it.</p>` : ''}
    ${msg}<p class="small">${live ? 'Does this look right?' : 'This one expired — say it again.'}</p>${acts('✓ Create workout')}</div>`;
}
const totalsOf = (items) => items.reduce((a, x) => ({ kcal: a.kcal + (+x.kcal || 0), p: a.p + (+x.p || 0), c: a.c + (+x.c || 0), f: a.f + (+x.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
// 🎤 Change by voice (started in the tap): listens for this card only.
export function change(voice) {
  if (!tk.prop) return null;
  tk.propMsg = voice ? '' : "Listening isn't available here — type a change instead.";
  if (!voice) return draw();
  return listen(voice, { onWords: (text) => (text ? reply(text) : draw()) });
}
export function onFix(f) { const v = f.querySelector('input')?.value || ''; heard = false; return reply(v); }
// What you said back: yes → save, cancel → drop it, anything else changes the draft.
async function reply(text) {
  const p = tk.prop;
  text = String(text || '').trim();
  if (!text) return draw();
  if (!p || !P.isLive(p)) { tk.prop = null; tk.say = p ? 'This one expired — say it again.' : "There's nothing waiting to confirm."; speak(tk.say); return draw(); }
  const k = P.replyKind(text);
  if (k === 'confirm') return commitProp();
  if (k === 'cancel') return cancelProp();
  if (k === 'unclear') { tk.propMsg = `I heard “${text}”. Say “log it” to save it, or tell me what to change.`; speak(tk.propMsg); return draw(); }
  return correct(text);
}
// A correction changes the current draft: on the phone when it can, else the AI reads the draft
// plus your words (never your first words alone), and the changed rows light up. Nothing saves.
async function correct(text) {
  const p = tk.prop;
  tk.busy = true; tk.propMsg = 'Changing it…'; draw();
  try {
    let next = null, changed = [], did = [];
    if (p.kind === 'meal') {
      const M = await c.dietMod(), d = p.payload;
      const r = P.amendMeal(d, text, M.talkTools);
      if (r.ok) ({ draft: next, changed, did } = r);
      else if (await c.aiReady().catch(() => null)) {
        const got = await M.talkRead(P.mealDraftText(d, text));
        if (got.by === 'claude' && got.items.length) {
          const key = (x) => `${x.name}|${x.amount}|${r0(x.kcal)}`, old = new Set(d.items.map(key));
          const m = /\b(breakfast|lunch|dinner|snack)\b/i.exec(text);
          next = { ...d, items: got.items, unread: [], meal: m ? m[1].toLowerCase() : d.meal };
          changed = got.items.map((x, i) => (old.has(key(x)) ? -1 : i)).filter((i) => i >= 0);
        }
      }
    } else {
      const T = await import('../js/workoutText.js'), w = p.payload.workout;
      const r = P.amendWorkout(w, text, { parseWorkout: T.parseWorkout, needsHelp: T.needsHelp, today: c.iso() });
      if (r.ok) ({ workout: next, changed, did } = r);
      else if (await c.aiReady().catch(() => null)) {
        const got = await c.api.post('/ai/workout', { text: P.workoutDraftText(w, text), unit: 'lb', today: c.iso() }).catch(() => null);
        if (got?.workout?.blocks?.length) {
          const W = await import('../js/workout.js'), nw = W.normalize({ ...got.workout, id: w.id, title: w.title, date: w.date, source: 'text' });
          const sig = (it) => `${it.name}|${it.sets.map((x) => `${x.reps}@${x.weight}`).join(',')}`, old = new Set(w.blocks.flatMap((b) => b.items).map(sig));
          next = nw; changed = nw.blocks.flatMap((b) => b.items).filter((it) => !old.has(sig(it))).map((it) => it.id);
        }
      }
      if (next) next = { ...p.payload, workout: next, unread: [] };
    }
    tk.busy = false;
    if (!next) { tk.propMsg = `I couldn't work out “${text}” — try “remove the salsa”, “make the rice half a cup”, or ✏️ Edit.`; speak(tk.propMsg); return draw(); }
    tk.prop = P.revise(p, next, changed);
    tk.propMsg = did.length ? `Changed: ${did.join(', ')}.` : 'Changed — the new parts are highlighted.';
    speak('Changed. Does this look right?');
  } catch (e) { tk.busy = false; tk.propMsg = e.message || "Couldn't change it just now."; }
  return draw();
}
async function commitProp() {
  const p = tk.prop;
  if (!p) return null;
  try {
    const r = await P.commitOnce(p, p.version, async () => {
      if (p.kind === 'meal') { const M = await c.dietMod(), d = p.payload; await M.talkLog(d.meal, d.items, { plan: d.plan, add: d.add }); return null; }
      return c.workoutCreate(p.payload.workout);
    });
    if (r?.error) { tk.propMsg = r.error === 'expired' ? 'This one expired — say it again.' : r.error === 'stale' ? 'It changed — check it once more.' : ''; return draw(); }
    if (tk.prop !== p) return null;
    tk.prop = null;
    // The meal's own save closed the sheet and said "✓ Lunch logged", with Undo.
    if (p.kind === 'workout') { c.closeSheet(); const undo = r.result; c.toast(`🏋️ ${p.payload.workout.title} is Today's Workout`, undo ? async () => { await undo(); c.toast('Undone'); } : undefined); }
    return null;
  } catch (e) { tk.propMsg = e.message || "Couldn't save that just now — try again."; return draw(); }
}
function cancelProp() { P.cancel(tk.prop); tk.prop = null; tk.propMsg = ''; tk.say = 'OK — nothing was saved.'; speak(tk.say); return draw(); }
async function editProp() {
  const p = tk.prop;
  if (!p || !P.isLive(p)) return null;
  P.cancel(p); tk.prop = null;
  if (p.kind === 'meal') { const M = await c.dietMod(), d = p.payload; return M.talkEdit(d.meal, d.items, { plan: d.plan, text: d.text }); }
  c.closeSheet();
  return c.workoutEdit(p.payload.workout);
}

// ---------- "Ask about my day" (T2a) ----------
const time12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
async function askDay(text, t) {
  let ok = false;
  try { ok = !!c.LS.get(DAYOK()); } catch { /* private mode */ }
  if (!ok) { tk.consent = { text }; return draw(); }
  const ai = await c.aiReady().catch(() => null);
  if (ai === false) { tk.say = "Answering questions about your day needs Claude, which isn't set up here."; return draw(); }
  tk.busy = true; draw();
  const people = c.people();
  try {
    const ctx = await c.dayContext(t.text);
    const r = await c.api.post('/ai/talk/day', { text: t.text, today: ctx.today, now: ctx.now, context: JSON.stringify(ctx) });
    const all = toTokens(people.map((p) => p.name).join(', '), people).map;
    const back = (s) => fromTokens(s, all, people).replace(/\byou and ([A-Z][a-z]+)\b/g, 'you and $1');
    const to = /\b(meals?|macros?|calories|protein|carbs|fat|eat|breakfast|lunch|dinner|snacks?|recovery|sleep|strain|whoop|hrv)\b/i.test(t.text) ? 'health' : 'calendar';
    const go = (ctx.travel?.places || []).filter((p) => p.found !== false).map((p) => ({ name: p.place, q: p.address || p.place, min: p.drives?.find((d) => d.leave === 'now')?.minutes }));
    tk.cards = [{ type: 'answer', text: back(r.answer || "I couldn't work that out."), to, go },
      ...checkSuggestions(r.suggestions, ctx).map((x) => ({ type: 'suggest', s: { ...x, title: back(x.title), why: back(x.why) }, go: true }))];
    const n = tk.cards.length - 1;
    speak(`${tk.cards[0].text}${n ? ` I found ${n === 1 ? 'a time' : `${n} times`} you could add to your calendar.` : ''}`);
  } catch (e) { tk.error = e.status === 429 ? "That's all the day questions for today." : e.message || "Pawmily couldn't answer that just now."; }
  if (tk.error) speak(tk.error);
  tk.busy = false;
  return draw();
}

// ---------- each step → a card (looked up on the phone: your lists never leave it) ----------
async function resolve(s) {
  if (s.do === 'watch.add' || s.do === 'watch.status') {
    const shows = await c.watchShows(), q = norm(s.title);
    const hits = shows.filter((x) => norm(x.title) === q || (q.length > 3 && norm(x.title).startsWith(q)));
    if (s.do === 'watch.status' && hits.length > 1) return { type: 'pickshow', title: s.title, status: s.status, hits };
    if (hits.length) { const status = s.do === 'watch.add' && s.status === 'want' ? hits[0].status : s.status; return { type: 'watchstatus', show: hits[0], status, go: hits[0].status !== status }; }
    return { type: 'watchadd', title: s.title, kind: s.kind || 'show', status: s.status, go: true, note: s.do === 'watch.status' ? 'Not on your list yet' : '' };
  }
  if (s.do === 'read.add' || s.do === 'read.state') {
    const R = await c.read(), f = await R.talkFind(s.title, s.author || '').catch(() => ({ results: [] }));
    if (f.have?.length) return { type: 'readstate', book: f.have[0], state: s.state, go: f.have[0].state !== s.state };
    // The book as you said it, for when the catalogue doesn't have it (or not by that author).
    const typed = { title: s.title, authors: s.author ? [s.author] : [], typed: true };
    const results = f.results || [], sure = results.length === 1 && (!s.author || f.byAuthor);
    return { type: 'readadd', results, typed, byAuthor: f.byAuthor, pick: !results.length ? 'typed' : sure ? 0 : null, state: s.state, f: s.f === 'listen' ? 'listen' : 'read', recBy: s.recBy === 'partner' && c.partner() ? c.partner().id : '', go: true };
  }
  if (s.do === 'weight.log') return { type: 'weight', lb: s.lb, go: true };
  if (s.do === 'care.log') {
    const kinds = c.careKinds(), q = norm(s.chore).replace(/^dog\s+/, '');
    const k = kinds.find((x) => x.kind === q || norm(x.label) === q) || kinds.find((x) => norm(x.label).includes(q) || (q.length > 3 && q.includes(norm(x.label))));
    return k ? { type: 'care', care: k, go: true } : { type: 'pickcare', chore: s.chore, kinds };
  }
  return { type: 'handoff', step: s, go: true };
}
function cardHtml(x, i) {
  const btn = (label, ghost = false) => (x.done ? `<span class="tk-done">✓ ${E(x.done)}${x.undo ? ` · <button type="button" class="linkish small" data-talkundo="${i}">Undo</button>` : ''}</span>` : `<button type="button"${ghost ? ' class="ghost"' : ''} data-talkgo="${i}">${E(label)}</button>`);
  if (x.type === 'watchadd') return `<div class="tk-card"><b>${x.kind === 'movie' ? '🍿' : '📺'} ${E(x.title)}</b><small class="muted">${x.note ? `${E(x.note)} · ` : ''}→ ${E(WATCH[x.status] || 'Want to Watch')} · on your list${c.partner() ? ` with ${E(c.partner().first)}` : ''}</small>
    ${x.done ? '' : `<div class="seg tk-seg"><button type="button" class="${x.kind === 'show' ? 'on' : ''}" data-talkset="${i}:kind:show">📺 Show</button><button type="button" class="${x.kind === 'movie' ? 'on' : ''}" data-talkset="${i}:kind:movie">🍿 Movie</button></div>`}${btn('Add to Watch')}</div>`;
  if (x.type === 'watchstatus') return `<div class="tk-card"><b>📺 ${E(x.show.title)}</b><small class="muted">${x.go ? `${E(WATCH[x.show.status] || 'On your list')} → <b>${E(WATCH[x.status])}</b>` : `Already on your list · ${E(WATCH[x.show.status] || '')}`}</small>${x.go ? btn(`Move to ${WATCH[x.status]}`) : ''}</div>`;
  if (x.type === 'pickshow') return `<div class="tk-card"><b>Which one?</b><div class="tk-pick">${x.hits.map((h, j) => `<button type="button" data-talkpickshow="${i}:${j}">${E(h.title)} <small class="muted">· ${E(WATCH[h.status] || '')}</small></button>`).join('')}</div></div>`;
  if (x.type === 'readstate') return `<div class="tk-card"><b>📚 ${E(x.book.title)}</b><small class="muted">${x.go ? `${E(READ[x.book.state] || 'Not on your list')} → <b>${E(READ[x.state])}</b>` : `Already ${E(READ[x.book.state] || '')}`}</small>${x.go ? btn(`Move to ${READ[x.state]}`) : ''}</div>`;
  if (x.type === 'readadd') {
    const by = (b) => [(b.authors || []).map((a) => a.name || a).join(', '), b.year].filter(Boolean).join(' · ');
    const t = x.typed, asSaid = `<button type="button" data-talkpick="${i}:typed"><b>＋ ${E(t.title)}</b> <small class="muted">${t.authors.length ? `${E(t.authors.join(', '))} · ` : ''}add it as you said it</small></button>`;
    const list = x.results.map((b, j) => `<button type="button" data-talkpick="${i}:${j}"><b>${E(b.title)}</b> <small class="muted">${E(by(b))}</small></button>`).join('');
    // No book by that author in the catalogue: yours comes first, the near matches after.
    if (x.pick == null) return `<div class="tk-card"><b>Which book?</b>${t.authors.length && !x.byAuthor ? `<small class="muted">The book catalogue has nothing by ${E(t.authors[0])} called that.</small>` : ''}<div class="tk-pick">${t.authors.length && !x.byAuthor ? asSaid + list : list + asSaid}</div></div>`;
    const b = x.pick === 'typed' ? t : x.results[x.pick], p = c.partner();
    const fmt = `<div class="seg tk-seg"><button type="button" class="${x.f !== 'listen' ? 'on' : ''}" aria-pressed="${x.f !== 'listen'}" data-talkset="${i}:f:read">📖 Book</button><button type="button" class="${x.f === 'listen' ? 'on' : ''}" aria-pressed="${x.f === 'listen'}" data-talkset="${i}:f:listen">🎧 Audiobook</button></div>`;
    return `<div class="tk-card"><b>${x.f === 'listen' ? '🎧' : '📚'} ${E(b.title)}</b><small class="muted">${E(by(b))}${b.typed ? `${by(b) ? ' · ' : ''}as you said it${x.results.length ? '' : ' (not in the book catalogue)'}` : ''} → ${E(READ[x.state])}</small>${x.done ? '' : fmt}
      ${p && !x.done ? `<label class="tk-rec"><input type="checkbox" data-talkrec="${i}" ${x.recBy ? 'checked' : ''}> Recommended by ${E(p.first)}</label>` : ''}${btn('Add to Read')}</div>`;
  }
  if (x.type === 'answer') return `<div class="tk-card tk-answer">${SPEAK_OK() ? '<button type="button" class="icon-btn tk-say" data-talk="speak" aria-label="Read this aloud">🔊</button>' : ''}${E(x.text).replace(/\n/g, '<br>')}${(x.go || []).map((g) => `<a class="tk-go small" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(g.q)}&travelmode=driving" target="_blank" rel="noopener">🚗 ${E(g.name)}${g.min ? ` · ${g.min} min now` : ''} · Directions ›</a>`).join('')}${x.to === 'health' ? '<button type="button" class="linkish small" data-talk="healthopen">Open Health ›</button>' : '<button type="button" class="linkish small" data-talk="calopen">Open Calendar ›</button>'}</div>`;
  if (x.type === 'suggest') { const d = new Date(`${x.s.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }); return `<div class="tk-card"><b>🗓 ${E(x.s.title)} · ${E(d)} ${E(time12(x.s.start))}–${E(time12(x.s.end))}</b>${x.s.why ? `<small class="muted">${E(x.s.why)}</small>` : ''}${btn('Add to my calendar', true)}</div>`; }
  if (x.type === 'photomeal') {
    const meals = ['breakfast', 'lunch', 'dinner', 'extra'];
    return `<div class="tk-card"><b>📷 ${E(MEAL[x.meal] || 'Your meal')} · eaten out</b><small class="muted">A photo of the dish — it estimates it, and you check it before it's logged.</small>
      <div class="seg tk-seg">${meals.map((m) => `<button type="button" class="${x.meal === m ? 'on' : ''}" aria-pressed="${x.meal === m}" data-talkset="${i}:meal:${m}">${m === 'extra' ? 'Snack' : MEAL[m]}</button>`).join('')}</div>
      <div class="tk-photo"><label class="btn">📷 Take a photo<input type="file" accept="image/*" capture="environment" data-talkphoto="${i}" hidden></label><label class="btn ghost">🖼 From Photos<input type="file" accept="image/*" data-talkphoto="${i}" hidden></label></div>
      <small class="tiny muted">The photo goes to Claude to estimate the dish (redrawn on your phone first, with no location); it isn't kept.</small></div>`;
  }
  if (x.type === 'how') {
    // Each way: what it is, then a tap — say it (fills the box to change first), send it, or open the screen.
    const way = (ic, title, sub, act) => `<div class="tk-way"><span class="ic" aria-hidden="true">${ic}</span><span><b>${E(title)}</b><small>${E(sub)}</small>${act}</span></div>`;
    const ex = (t) => `<button type="button" class="linkish small" data-talkex="${E(t)}">“${E(t)}” ›</button>`;
    const go = (t, label) => `<button type="button" class="linkish small" data-talksay="${E(t)}">${E(label)} ›</button>`;
    const ways = {
      meal: [
        way('✓', 'As planned — one tap', 'Your plan has every meal ready: 💪 Health › ✓ As planned logs the next one.', '<button type="button" class="linkish small" data-talk="healthopen">Open Health ›</button>'),
        way('🗣️', 'Say what you had', 'Here in Talk. "Log dinner: …" replaces that meal; "Add … to dinner" adds to it. You check a card before it saves.', ex('Log lunch: chicken, rice and broccoli') + ' ' + ex('Add a coffee to breakfast')),
        way('📷', 'A photo of the dish', 'Eaten out? Take a photo or pick one — it estimates the dish for you to check.', go('Take a photo of my dinner', '📷 Take a photo')),
        way('🍽', 'Change the plan meal', 'Tap a meal on Health: swap a food (🔁), slide the grams, ⚖️ Fit to N kcal, 🔒 lock an amount, 📦 Packaged or 🍴 Ate out.', '<button type="button" class="linkish small" data-talk="healthopen">Open Health ›</button>'),
      ],
      workout: [
        way('🗣️', 'Say it', 'Here in Talk — exercises with sets, reps and weight. You check a card before it saves.', ex('Log a workout: squats 3x8 at 185, bench 3x10 at 135') + ' ' + ex('I did 3x10 squats at 135')),
        way('📷', 'A photo of the WOD', 'The whiteboard, a screenshot or a written plan — it reads the sets and reps into today\'s workout.', go('Take a photo of the WOD', '📷 Take a photo')),
        way('✍️', 'Build or describe it in Fitness', 'Pick exercises and sets yourself, describe it in words, or use your lifting program; then Start it and tick sets as you go.', '<button type="button" class="linkish small" data-talk="fitopen">Open Fitness ›</button>'),
        way('⌚', 'From WHOOP', 'With WHOOP connected (Health › Devices), its workouts come in by themselves.', ''),
      ],
      weight: [
        way('⚖️', 'On Health', 'Type it under Today\'s weight and Save — you check it first, and can add front, side and back photos.', '<button type="button" class="linkish small" data-talk="healthopen">Open Health ›</button>'),
        way('🗣️', 'Say it', 'Here in Talk.', ex('Log my weight 160.6')),
      ],
    }[x.topic] || [];
    return `<div class="tk-card"><b>${{ meal: '🍽 Ways to log a meal', workout: '🏋️ Ways to log a workout', weight: '⚖️ Ways to log your weight' }[x.topic]}</b><div class="tk-ways">${ways.join('')}</div></div>`;
  }
  if (x.type === 'photoworkout') {
    return `<div class="tk-card"><b>📷 Today's workout from a photo</b><small class="muted">The WOD on the whiteboard, a screenshot or a written plan — it reads the exercises, sets and reps into today's workout, and you check it before it's saved.</small>
      <div class="tk-photo"><label class="btn">📷 Take a photo<input type="file" accept="image/*" capture="environment" data-talkphoto="${i}" hidden></label><label class="btn ghost">🖼 From Photos<input type="file" accept="image/*" data-talkphoto="${i}" hidden></label></div>
      <small class="tiny muted">The photo goes to Claude to read the workout (redrawn on your phone first, with no location); it isn't kept.</small></div>`;
  }
  if (x.type === 'weight') return `<div class="tk-card"><b>⚖️ Today's weight · ${E(x.lb.toFixed(1))} lb</b><small class="muted">Saved to Health, Meals and Weight${x.done ? '' : " — replaces today's weigh-in if you already logged one"}</small>${btn('Log it')}</div>`;
  if (x.type === 'care') return `<div class="tk-card"><b>${E(x.care.icon)} ${E(x.care.label)}</b><small class="muted">Today · logged for you</small>${btn('Log it')}</div>`;
  if (x.type === 'pickcare') return `<div class="tk-card"><b>Which one?</b><small class="muted">I don't know "${E(x.chore)}" — pick it:</small><div class="tk-ex">${x.kinds.map((k) => `<button type="button" data-talkcare="${i}:${E(k.kind)}">${E(k.icon)} ${E(k.label)}</button>`).join('')}</div></div>`;
  const s = x.step;
  const what = s.do === 'diet.log' ? `🍽 ${MEAL[s.meal]}: ${s.text}` : s.do === 'fitness.describe' ? `🏋️ Workout: ${s.text}` : "🪶 Make today's workout lighter";
  return `<div class="tk-card"><b>${E(what)}</b><small class="muted">Opens its preview to check first</small>${btn('Open', true)}</div>`;
}

// ---------- doing one (after your tap) ----------
async function handOff(s) {
  if (s.do === 'diet.log') return c.dietTell(s.meal, s.text, { plan: !!s.plan });
  if (s.do === 'fitness.describe') return c.fitDescribe(s.text);
  return c.fitLighter();
}
async function go(i) {
  const x = tk.cards?.[i];
  if (!x || x.done || x.busy) return null;
  x.busy = true;
  try {
    if (x.type === 'watchadd') {
      const id = await c.watchAdd({ title: x.title, kind: x.kind, status: x.status });
      x.done = 'Added'; x.undo = () => c.watchDelete(id); x.said = `${x.kind === 'movie' ? '🍿' : '📺'} ${x.title} → ${WATCH[x.status]}`;
    } else if (x.type === 'watchstatus') {
      const before = x.show.status;
      await c.watchStatus(x.show.id, x.status);
      x.done = WATCH[x.status]; x.undo = () => c.watchStatus(x.show.id, before || 'want'); x.said = `📺 ${x.show.title} → ${WATCH[x.status]}`;
    } else if (x.type === 'readadd') {
      const R = await c.read(), b = x.pick === 'typed' ? x.typed : x.results[x.pick];
      const id = await R.talkAdd(b, x.state, x.recBy, x.f);
      x.done = 'Added'; x.undo = () => R.talkUndoAdd(id); x.said = `${x.f === 'listen' ? '🎧' : '📚'} ${b.title} → ${READ[x.state]}${x.f === 'listen' ? ' · Audiobook' : ''}`;
    } else if (x.type === 'readstate') {
      const R = await c.read(), before = await R.talkSetState(x.book.id, x.state);
      x.done = READ[x.state]; x.undo = () => R.talkSetState(x.book.id, before || 'want'); x.said = `📚 ${x.book.title} → ${READ[x.state]}`;
    } else if (x.type === 'weight') {
      const r = await c.weighLog(x.lb);
      x.done = 'Logged'; x.undo = () => c.weighUndo(r.prev); x.said = `⚖️ ${x.lb.toFixed(1)} lb logged${r.line ? ` · ${r.line}` : ''}`;
    } else if (x.type === 'care') {
      const id = await c.careLog(x.care.kind);
      x.done = 'Logged'; x.undo = () => c.careUndo(id); x.said = `${x.care.icon} ${x.care.label} logged`;
    } else if (x.type === 'suggest') {
      const id = await c.calendarAdd(x.s);
      x.done = 'On your calendar'; x.undo = () => c.calendarDelete(id); x.said = `🗓 ${x.s.title} added to your calendar`;
    } else if (x.type === 'handoff') { x.done = 'Opened'; c.closeSheet(); await handOff(x.step); return null; }
  } catch (e) { x.busy = false; c.toast(e.message || "Couldn't do that just now"); return redraw(); }
  x.busy = false;
  // All done: the sheet closes, you stay where you were, with Undo.
  if (tk.cards.every((y) => y.done || !y.go) && !tk.cards.some((y) => y.type === 'answer')) {
    c.closeSheet();
    const done = tk.cards.filter((y) => y.said);
    c.toast(done.length === 1 ? done[0].said : `✓ ${done.length} done`, async () => { for (const y of done) await y.undo?.(); c.toast('Undone'); });
    return null;
  }
  return redraw();
}

export async function onClick(t) {
  const d = t.dataset;
  if (d.talksay) return send(d.talksay);
  if (d.talkex) { const box = document.getElementById('tkText'); if (box) { box.value = d.talkex; box.focus(); box.setSelectionRange(box.value.length, box.value.length); } return null; }
  if (d.talkgo != null) return go(+d.talkgo);
  if (d.talkundo != null) { const x = tk.cards?.[+d.talkundo]; if (!x?.undo) return null; await x.undo(); Object.assign(x, { done: '', undo: null, said: '' }); c.toast('Undone'); return redraw(); }
  if (d.talkset) { const [i, k, v] = d.talkset.split(':'); tk.cards[+i][k] = v; return redraw(); }
  if (d.talkpick) { const [i, j] = d.talkpick.split(':'); tk.cards[+i].pick = j === 'typed' ? 'typed' : +j; return redraw(); }
  if (d.talkpickshow) { const [i, j] = d.talkpickshow.split(':').map(Number); const x = tk.cards[i]; tk.cards[i] = { type: 'watchstatus', show: x.hits[j], status: x.status, go: true }; return redraw(); }
  if (d.talkcare) { const [i, kind] = d.talkcare.split(':'); const k = tk.cards[+i].kinds.find((y) => y.kind === kind); tk.cards[+i] = { type: 'care', care: k, go: true }; return redraw(); }
  if (d.talk === 'all') { for (let i = 0; i < tk.cards.length; i++) if (tk.cards[i].go && !tk.cards[i].done && tk.cards[i].type !== 'handoff') await go(i); return null; }
  if (d.talk === 'pyes') return commitProp();
  if (d.talk === 'pno') return cancelProp();
  if (d.talk === 'pedit') return editProp();
  if (d.talk === 'stop') return stopListening(false);
  if (d.talk === 'type') return stopListening(true);
  if (d.talk === 'voiceoff') { try { c.LS.set('fam.talk.voice', voiceOff() ? '' : 'off'); } catch { /* private mode */ } c.toast(voiceOff() ? 'Talk opens ready to type' : 'Talk starts listening when you open it'); return draw(); }
  if (d.talk === 'dayok') { try { c.LS.set(DAYOK(), '1'); } catch { /* private mode */ } const q = tk.consent?.text || tk.text; tk.consent = null; return send(q); }
  if (d.talk === 'dayno') { tk.consent = null; tk.say = "OK — I won't look at your calendar. I can still add shows, movies and books, and log meals, your weight, workouts and chores."; return draw(); }
  if (d.talk === 'speakoff') { try { c.LS.set('fam.talk.speak', speakOn() ? '' : 'on'); } catch { /* private mode */ } if (!speakOn()) hush(); c.toast(speakOn() ? 'Answers to spoken questions are read aloud' : 'Answers stay on screen'); return draw(); }
  if (d.talk === 'speak') { const a = tk.cards?.find((x) => x.type === 'answer'); return speak(a?.text, { always: true }); }
  if (d.talk === 'calopen') { c.closeSheet(); return c.show('calendar'); }
  if (d.talk === 'healthopen') { c.closeSheet(); return c.show('health'); }
  if (d.talk === 'fitopen') { c.closeSheet(); return c.show('fitness'); }
  if (d.talk === 'seen') { try { c.LS.set(SEEN, '1'); } catch { /* private mode */ } return draw(); }
  return null;
}
export function onChange(t) {
  if (t.dataset.talkphoto != null) {
    const x = tk.cards?.[+t.dataset.talkphoto], file = t.files?.[0];
    if (!x || !file) return null;
    c.closeSheet();
    return (x.type === 'photoworkout' ? c.workoutPhoto(file) : c.mealPhoto(x.meal, file)).catch((e) => c.toast(e.message || "Couldn't open that photo"));
  }
  if (t.dataset.talkrec != null) { const x = tk.cards[+t.dataset.talkrec]; x.recBy = t.checked && c.partner() ? c.partner().id : ''; } }
export function onSubmit(f) { heard = false; hush(); const v = f.querySelector('textarea')?.value || ''; return send(v); }
