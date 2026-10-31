// 🗣️ Talk to Pawmily (T1): the Talk sheet. Loaded the first time you tap the Talk bar on Home or the
// gold circle on another tab. You type (or dictate with the keyboard's 🎤 — only words, never audio);
// the phone reads everyday requests itself (js/talkParse.js), and only what it can't goes to Claude
// (/ai/talk), with people swapped for roles first (js/talkActions.js toTokens). Every request becomes
// a small card you approve; nothing changes until you tap. Each card saves through the area that owns
// it — Watch, Read, the chores log — or opens that area's own preview (Tell me for meals, Describe it
// for workouts, Make it lighter). T1 only does things that are yours; T2a answers questions about your
// day (js/talkDay.js — with your OK once) and can add a suggested time to your own calendar only.
// Nothing you said is kept (no history).
import { parseTalk } from '../js/talkParse.js';
import { toTokens, fromTokens } from '../js/talkActions.js';
import { isDayQuestion, checkSuggestions } from '../js/talkDay.js';
import { browserVoiceOutput, routeVoice } from './voice.js';
import { CATEGORIES, CATEGORY_LABELS, PHRASES } from '../js/voicePolicy.js';

let c = null;
export function init(ctx) { document.getElementById('sheet')?.addEventListener('close', hush); c = ctx; }
const tk = { tab: 'home', text: '', busy: false, cards: null, say: '', error: '', consent: null, voice: null, vset: null };
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
  health: ['Log my weight 160.6', 'Log 2 eggs and a slice of sourdough for breakfast', 'Plan dinner: salmon and rice', 'Log a packaged meal for lunch', 'How much protein is left today?', "Make today's workout lighter"],
};
const WATCH = { want: 'Want to Watch', watching: 'Watching', finished: 'Watched', upnext: 'Up Next', dropped: 'Stopped' };
const READ = { want: 'Want to Read', reading: 'Reading', finished: 'Finished', dropped: 'Stopped' };
const MEAL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', extra: 'A snack or extra' };
const MIC_OK = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const voiceOff = () => { try { return c.LS.get('fam.talk.voice') === 'off'; } catch { return false; } };
// 🔊 Answers read aloud — off unless you switch it on (owner, 2026-10-30), and then only when you asked
// by voice (or tap 🔊). Who speaks is decided in ONE place, family/voice.js routeVoice: the Pawmily
// Voice (cloud, optional) only when the family's cloud voice is on, you chose it, and the connector made
// that exact sentence speakable (a ticket or a fixed phrase); otherwise the phone's own voice; any
// cloud failure ends on the phone. The cloud provider is loaded only on that path (c.cloudVoice()).
const SPEAK_OK = () => browserVoiceOutput.available() || !!c?.cloudOn?.();
const speakOn = () => { try { return c.LS.get('fam.talk.speak') === 'on'; } catch { return false; } };
// Your choice of voice: 'cloud' = Pawmily Voice where allowed; anything else = the phone's voice.
const cloudPick = () => { try { return c.LS.get('fam.talk.voiceOut') === 'cloud'; } catch { return false; } };
const cloudLive = () => !!c?.cloudOn?.() && cloudPick();
let heard = false; // this request came from your voice
let cloudP = null; // the cloud provider, once loaded
export function hush() { browserVoiceOutput.stop(); cloudP?.stop(); }
// `cloud`: { text, ticket } from the connector, or { phrase } — what the cloud voice may say instead.
export async function speak(text, { always = false, cloud = null } = {}) {
  if (!always && (!heard || !speakOn())) return 'none';
  const route = routeVoice({ cloudOn: !!c?.cloudOn?.(), mode: cloudPick() ? 'cloud' : 'device', speakable: !!cloud, deviceOk: browserVoiceOutput.available() });
  hush();
  if (route === 'cloud') {
    try { cloudP = await c.cloudVoice(); if (await cloudP.speak(cloud)) return 'cloud'; } catch { /* the phone reads it instead */ }
    if (!browserVoiceOutput.available()) return 'none';
  } else if (route === 'none') return 'none';
  browserVoiceOutput.speak(text);
  return 'device';
}
// A fixed confirmation (the connector's own words): cloud only if you allow simple confirmations.
const sayPhrase = (key) => speak(PHRASES[key], { cloud: cloudLive() && c.vprefs?.()?.cats?.confirmations ? { phrase: key } : null });
const norm = (t) => String(t || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

// `meal`: opened from a meal's "Say what you had" — what you say is logged for that meal unless you name one.
export function open(tab = 'home', { voice = null, meal = null } = {}) {
  tk.tab = EXAMPLES[tab] ? tab : tab === 'watch' || tab === 'read' ? 'us' : tab === 'fitness' ? 'health' : 'home';
  Object.assign(tk, { text: '', busy: false, cards: null, say: '', error: '', consent: null, voice: null, vset: null, meal: ['breakfast', 'lunch', 'snack', 'dinner', 'extra'].includes(meal) ? meal : null });
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
export function listen(voice) {
  hush();
  if (!voice) { tk.error = "Listening isn't available here — type, or tap 🎤 on your keyboard."; return draw(); }
  tk.voice = voice; tk.cards = null; tk.say = ''; tk.error = ''; tk.text = '';
  draw();
  voice.listener = () => {
    if (tk.voice !== voice) return;
    const live = document.getElementById('tkLive');
    if (live) live.textContent = voice.text || 'Listening…';
    if (!voice.ended) return;
    tk.voice = null;
    if (voice.text) { heard = true; return send(voice.text); }
    tk.error = voice.error === 'aborted' ? '' : SPEECH_ERR[voice.error] || (voice.error ? "I couldn't catch that — tap 🎤 to try again, or type." : "I didn't hear anything — tap 🎤 to try again, or type.");
    draw();
    setTimeout(() => document.getElementById('tkText')?.focus(), 60);
  };
  if (voice.ended || voice.text) voice.listener();
  return null;
}
function stopListening(typeInstead = false) {
  const v = tk.voice;
  if (!v) return;
  if (typeInstead) { tk.voice = null; try { v.abort(); } catch { /* already stopped */ } draw(); setTimeout(() => document.getElementById('tkText')?.focus(), 60); return; }
  try { v.stop(); } catch { /* already stopped */ }
}
function draw() {
  let first = false;
  try { first = !c.LS.get(SEEN); } catch { /* private mode */ }
  c.openSheet(`<div class="tk-sheet"><div class="row between tk-top"><h2>${ICON}Talk to Pawmily</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${tk.meal ? `<p class="tk-meal small">🍽 Logging <b>${E(MEAL[tk.meal].toLowerCase())}</b> — say what you had.</p>` : ''}
    ${first ? `<p class="tk-first">Say what you'd like done — add a show or a book, log a meal, a workout or a chore. Your phone reads it first; only what it can't read goes to Claude, with people's names swapped for roles. Nothing changes until you tap. <button type="button" class="linkish small" data-talk="seen">Got it</button></p>` : ''}
    ${tk.vset ? '' : tk.voice ? `<div class="tk-listen" role="status"><span class="tk-pulse" aria-hidden="true">🎤</span><p id="tkLive" class="tk-live">${E(tk.voice.text || 'Listening…')}</p>
      <div class="tk-two"><button type="button" data-talk="stop">Done</button><button type="button" class="ghost" data-talk="type">Type instead</button></div>
      <p class="tiny muted">Your phone's speech service turns your voice into text (Apple's on iPhone, Google's on Android); Pawmily only gets the words.</p></div>`
    : `<form class="tk-form" data-talkform><label for="tkText" class="visually-hidden">What would you like?</label><textarea id="tkText" rows="2" maxlength="500" placeholder="Ask or tell Pawmily…" enterkeyhint="send">${E(tk.text)}</textarea>${MIC_OK() ? '<button type="button" class="ghost tk-mic" data-talk="mic" aria-label="Speak">🎤</button>' : ''}<button ${tk.busy ? 'disabled' : ''} aria-label="Send">${tk.busy ? '…' : '↑'}</button></form>
    <p class="tiny muted tk-hint">${MIC_OK() ? '🎤 Tap to speak, or type.' : '🎤 Tap the microphone on your keyboard to speak — only the words reach Pawmily.'}${MIC_OK() ? ` <button type="button" class="linkish tiny" data-talk="voiceoff">${voiceOff() ? 'Listen when I open Talk' : "Don't listen when I open Talk"}</button>` : ''}${MIC_OK() && SPEAK_OK() ? ` · <button type="button" class="linkish tiny" data-talk="speakoff">${speakOn() ? '🔇 Don\'t read answers aloud' : '🔊 Read answers aloud'}</button>` : ''}${c.voiceOffered?.() ? ` · <button type="button" class="linkish tiny" data-talk="vset">${cloudLive() ? '🎙 Pawmily Voice ✓' : '🎙 Pawmily Voice'}</button>` : ''}</p>`}
    <div id="tkOut" role="status">${out()}</div></div>`);
}
function out() {
  if (tk.voice) return '';
  if (tk.vset) return voiceSettings();
  if (tk.busy) return '<p class="small muted">Reading…</p>';
  if (tk.error) return `<p class="small">${E(tk.error)}</p>`;
  if (tk.consent) return `<div class="tk-card"><b>📅 Answer questions about your day?</b><small>To answer, Pawmily sends Claude the calendar from this app for the days you ask about (today and tomorrow unless you name others, up to about a week) — times, titles, places and whose (names swapped for roles) — your free time, the forecast for your area, and, when you have them, your own WHOOP numbers and your own food today (your meal plan, what you've logged and what's left). Never your weight or notes. When you ask about going somewhere, your location (to about 100 m) and the place go to Google Maps for drive times with traffic and opening hours. Nothing is kept, and nothing changes unless you tap.</small><div class="tk-two"><button type="button" data-talk="dayok">Allow and ask</button><button type="button" class="ghost" data-talk="dayno">Not now</button></div></div>`;
  if (tk.cards) return tk.cards.map(cardHtml).join('') + (tk.cards.length > 1 && tk.cards.filter((x) => x.go && !x.done).length > 1 ? '<button type="button" class="wide" data-talk="all">Do all of these</button>' : '');
  if (tk.say) return `<div class="tk-card"><p class="small" style="margin:0">${E(tk.say)}</p></div>${examples()}`;
  return examples();
}
const examples = () => `<div class="tk-ex">${(EXAMPLES[tk.tab] || EXAMPLES.home).map((x) => `<button type="button" data-talkex="${E(x)}">${E(x)}</button>`).join('')}</div>`;
const redraw = () => { const o = document.getElementById('tkOut'); if (o) o.innerHTML = out(); else draw(); };

// ---------- reading a request ----------
export async function send(text) {
  text = String(text || '').trim();
  if (!text) return;
  tk.text = text; tk.error = ''; tk.say = ''; tk.cards = null; tk.consent = null;
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
  // A meal, a described workout or "make it lighter" on its own: straight to that area's own preview.
  if (steps.length === 1 && ['diet.log', 'fitness.describe', 'fitness.lighter'].includes(steps[0].do)) { c.closeSheet(); return handOff(steps[0]); }
  tk.cards = await Promise.all(steps.map(resolve));
  sayPhrase(tk.cards.length > 1 ? 'confirm.many' : 'confirm.one');
  draw();
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
    // Pawmily Voice chosen and on: each fact's provenance goes too, so the connector can write a short
    // cloud-safe sentence from only what every owner allowed (and sign it). Otherwise nothing extra.
    const cloud = cloudLive();
    const { voiceFacts, ...ctx } = await c.dayContext(t.text, { voice: cloud });
    const r = await c.api.post('/ai/talk/day', { text: t.text, today: ctx.today, now: ctx.now, context: JSON.stringify(ctx), ...(cloud && voiceFacts?.length ? { fid: c.fid(), voice: { facts: voiceFacts } } : {}) });
    const all = toTokens(people.map((p) => p.name).join(', '), people).map;
    const back = (s) => fromTokens(s, all, people).replace(/\byou and ([A-Z][a-z]+)\b/g, 'you and $1');
    const to = /\b(meals?|macros?|calories|protein|carbs|fat|eat|breakfast|lunch|dinner|snacks?|recovery|sleep|strain|whoop|hrv)\b/i.test(t.text) ? 'health' : 'calendar';
    const go = (ctx.travel?.places || []).filter((p) => p.found !== false).map((p) => ({ name: p.place, q: p.address || p.place, min: p.drives?.find((d) => d.leave === 'now')?.minutes }));
    tk.cards = [{ type: 'answer', text: back(r.answer || "I couldn't work that out."), to, go, spoken: r.spoken?.ticket ? r.spoken : null, cloud },
      ...checkSuggestions(r.suggestions, ctx).map((x) => ({ type: 'suggest', s: { ...x, title: back(x.title), why: back(x.why) }, go: true }))];
    const n = tk.cards.length - 1;
    // The Pawmily Voice says only the cloud-safe sentence; the phone's voice reads the whole answer.
    speak(`${tk.cards[0].text}${n ? ` ${PHRASES['day.times']}` : ''}`, { cloud: tk.cards[0].spoken });
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
    const R = await c.read(), f = await R.talkFind(s.title).catch(() => ({ results: [] }));
    if (f.have?.length) return { type: 'readstate', book: f.have[0], state: s.state, go: f.have[0].state !== s.state };
    if (!f.results?.length) return { type: 'nobook', title: s.title };
    return { type: 'readadd', results: f.results, pick: f.results.length === 1 ? 0 : null, state: s.state, recBy: s.recBy === 'partner' && c.partner() ? c.partner().id : '', go: true };
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
  if (x.type === 'nobook') return `<div class="tk-card"><b>📚 ${E(x.title)}</b><small class="muted">Couldn't find that book.</small><button type="button" class="ghost" data-talk="readopen">Add it in Read ›</button></div>`;
  if (x.type === 'readadd') {
    if (x.pick == null) return `<div class="tk-card"><b>Which book?</b><div class="tk-pick">${x.results.map((b, j) => `<button type="button" data-talkpick="${i}:${j}"><b>${E(b.title)}</b> <small class="muted">${E([(b.authors || []).map((a) => a.name || a).join(', '), b.year].filter(Boolean).join(' · '))}</small></button>`).join('')}</div></div>`;
    const b = x.results[x.pick], p = c.partner();
    return `<div class="tk-card"><b>📚 ${E(b.title)}</b><small class="muted">${E([(b.authors || []).map((a) => a.name || a).join(', '), b.year].filter(Boolean).join(' · '))} → ${E(READ[x.state])}</small>
      ${p && !x.done ? `<label class="tk-rec"><input type="checkbox" data-talkrec="${i}" ${x.recBy ? 'checked' : ''}> Recommended by ${E(p.first)}</label>` : ''}${btn('Add to Read')}</div>`;
  }
  if (x.type === 'answer') return `<div class="tk-card tk-answer">${SPEAK_OK() ? '<button type="button" class="icon-btn tk-say" data-talk="speak" aria-label="Read this aloud">🔊</button>' : ''}${E(x.text).replace(/\n/g, '<br>')}${x.cloud ? `<small class="tk-voice muted">${x.spoken ? `🎙 ${E(voiceName())}` : '🔒 Heard privately on this device'}</small>` : ''}${(x.go || []).map((g) => `<a class="tk-go small" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(g.q)}&travelmode=driving" target="_blank" rel="noopener">🚗 ${E(g.name)}${g.min ? ` · ${g.min} min now` : ''} · Directions ›</a>`).join('')}${x.to === 'health' ? '<button type="button" class="linkish small" data-talk="healthopen">Open Health ›</button>' : '<button type="button" class="linkish small" data-talk="calopen">Open Calendar ›</button>'}</div>`;
  if (x.type === 'suggest') { const d = new Date(`${x.s.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }); return `<div class="tk-card"><b>🗓 ${E(x.s.title)} · ${E(d)} ${E(time12(x.s.start))}–${E(time12(x.s.end))}</b>${x.s.why ? `<small class="muted">${E(x.s.why)}</small>` : ''}${btn('Add to my calendar', true)}</div>`; }
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
      const R = await c.read(), b = x.results[x.pick];
      const id = await R.talkAdd(b, x.state, x.recBy);
      x.done = 'Added'; x.undo = () => R.talkUndoAdd(id); x.said = `📚 ${b.title} → ${READ[x.state]}`;
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
  if (d.talkex) { const box = document.getElementById('tkText'); if (box) { box.value = d.talkex; box.focus(); box.setSelectionRange(box.value.length, box.value.length); } return null; }
  if (d.talkgo != null) return go(+d.talkgo);
  if (d.talkundo != null) { const x = tk.cards?.[+d.talkundo]; if (!x?.undo) return null; await x.undo(); Object.assign(x, { done: '', undo: null, said: '' }); c.toast('Undone'); return redraw(); }
  if (d.talkset) { const [i, k, v] = d.talkset.split(':'); tk.cards[+i][k] = v; return redraw(); }
  if (d.talkpick) { const [i, j] = d.talkpick.split(':').map(Number); tk.cards[i].pick = j; return redraw(); }
  if (d.talkpickshow) { const [i, j] = d.talkpickshow.split(':').map(Number); const x = tk.cards[i]; tk.cards[i] = { type: 'watchstatus', show: x.hits[j], status: x.status, go: true }; return redraw(); }
  if (d.talkcare) { const [i, kind] = d.talkcare.split(':'); const k = tk.cards[+i].kinds.find((y) => y.kind === kind); tk.cards[+i] = { type: 'care', care: k, go: true }; return redraw(); }
  if (d.talk === 'all') { for (let i = 0; i < tk.cards.length; i++) if (tk.cards[i].go && !tk.cards[i].done && tk.cards[i].type !== 'handoff') await go(i); return null; }
  if (d.talk === 'stop') return stopListening(false);
  if (d.talk === 'type') return stopListening(true);
  if (d.talk === 'voiceoff') { try { c.LS.set('fam.talk.voice', voiceOff() ? '' : 'off'); } catch { /* private mode */ } c.toast(voiceOff() ? 'Talk opens ready to type' : 'Talk starts listening when you open it'); return draw(); }
  if (d.talk === 'dayok') { try { c.LS.set(DAYOK(), '1'); } catch { /* private mode */ } const q = tk.consent?.text || tk.text; tk.consent = null; return send(q); }
  if (d.talk === 'dayno') { tk.consent = null; tk.say = "OK — I won't look at your calendar. I can still add shows, movies and books, and log meals, your weight, workouts and chores."; return draw(); }
  if (d.talk === 'vset') return openVoiceSettings();
  if (d.talk === 'vback') { tk.vset = null; return draw(); }
  if (d.talk === 'vrevoke') return voiceSave('profile', { enabled: false, purposes: [] }, 'Your voice is switched off for Pawmily');
  if (d.talk === 'vrestore') return voiceSave('profile', { enabled: true, purposes: [] }, 'Your voice is back — choose who may hear it');
  if (d.talk === 'speakoff') { try { c.LS.set('fam.talk.speak', speakOn() ? '' : 'on'); } catch { /* private mode */ } if (!speakOn()) hush(); c.toast(speakOn() ? 'Answers to spoken questions are read aloud' : 'Answers stay on screen'); return draw(); }
  if (d.talk === 'speak') { const a = tk.cards?.find((x) => x.type === 'answer'); return speak(a?.text, { always: true, cloud: a?.spoken }); }
  if (d.talk === 'calopen') { c.closeSheet(); return c.show('calendar'); }
  if (d.talk === 'healthopen') { c.closeSheet(); return c.show('health'); }
  if (d.talk === 'seen') { try { c.LS.set(SEEN, '1'); } catch { /* private mode */ } return draw(); }
  if (d.talk === 'readopen') { c.closeSheet(); return c.show('read'); }
  return null;
}
export function onChange(t) {
  if (t.dataset.talkrec != null) { const x = tk.cards[+t.dataset.talkrec]; x.recBy = t.checked && c.partner() ? c.partner().id : ''; return null; }
  const v = t.dataset.talkv;
  if (!v || !tk.vset?.s) return null;
  const s = tk.vset.s;
  if (v === 'mode') { try { c.LS.set('fam.talk.voiceOut', t.value === 'cloud' ? 'cloud' : 'device'); } catch { /* private mode */ } hush(); return redraw(); }
  if (v.startsWith('cat:')) { const cats = { ...s.prefs.cats, [v.slice(4)]: t.checked }; return voiceSave('prefs', { prefs: { cats } }); }
  if (v === 'admin') return voiceSave('admin', { cloud: t.checked }, t.checked ? 'Cloud voice is on for the family' : 'Cloud voice is off — everyone uses their phone\'s voice');
  if (v.startsWith('purp:')) { const set = new Set(s.voice?.purposes || []); if (t.checked) set.add(v.slice(5)); else set.delete(v.slice(5)); return voiceSave('profile', { enabled: true, purposes: [...set] }); }
  return null;
}

// ---------- 🎙 Pawmily Voice settings (inside Talk) ----------
// Everything here is OFF until switched on. What you allow is stored on the connector (it decides what
// may be spoken); which voice you hear (phone or Pawmily Voice) stays on this phone.
async function openVoiceSettings() {
  tk.vset = { s: null, busy: true }; draw();
  tk.vset = { s: await c.voiceState(true).catch(() => null), busy: false };
  return redraw();
}
async function voiceSave(what, body, msg) {
  try { await c.voiceSave(what, body); tk.vset = { s: await c.voiceState().catch(() => null), busy: false }; if (msg) c.toast(msg); }
  catch (e) { c.toast(e.message || "Couldn't save that just now"); }
  return redraw();
}
const firstOf = (id) => (c.people?.() || []).find((p) => p.id === id)?.name || '';
// Synthetic-voice attribution: a personal voice is always said to be Pawmily using it.
function voiceName() {
  const v = c.vstate?.()?.voice;
  if (!v?.personal) return 'Pawmily Voice';
  return v.mine ? 'Pawmily using your voice' : `Pawmily using ${firstOf(v.owner) || 'a family member'}'s voice`;
}
function voiceSettings() {
  const back = '<button type="button" class="linkish small" data-talk="vback">‹ Back to Talk</button>';
  if (tk.vset.busy) return `${back}<p class="small muted">Loading…</p>`;
  const s = tk.vset.s;
  if (!s) return `${back}<div class="tk-card"><p class="small" style="margin:0">Pawmily Voice isn't available just now. Answers use your phone's own voice.</p></div>`;
  const a = s.admin || {}, v = s.voice, on = !!s.ready, cats = s.prefs?.cats || {};
  const box = (k, label, checked, dis = false, extra = '') => `<label class="tk-chk"><input type="checkbox" data-talkv="${k}" ${checked ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${label}${extra}</span></label>`;
  return `${back}<div class="tk-vset">
    <h3>🎙 Pawmily Voice</h3>
    <p class="small">Pawmily Voice reads answers in a natural voice made by ElevenLabs, a voice service. It hears only the short sentence it reads — written from just the kinds of things you allow below. Everything else is read by your phone's own voice, or stays on screen.</p>
    ${on ? '' : `<p class="small tk-note">${!a.configured ? "Pawmily Voice isn't set up for this family." : a.paused || (a.cloud && a.used >= a.cap) ? 'Using device voice for now.' : 'Cloud voice is off for this family.'} Answers use your phone's voice.</p>`}
    <fieldset class="tk-field"><legend>Read answers with</legend>
      <label class="tk-chk"><input type="radio" name="tkvm" value="device" data-talkv="mode" ${cloudPick() ? '' : 'checked'}><span>My phone's voice <small class="muted">· stays on this phone</small></span></label>
      <label class="tk-chk"><input type="radio" name="tkvm" value="cloud" data-talkv="mode" ${cloudPick() ? 'checked' : ''} ${on ? '' : 'disabled'}><span>${E(voiceName())} where allowed</span></label>
      <small class="muted">Reading aloud is ${speakOn() ? 'on' : 'off'} for spoken questions; 🔊 on an answer always reads it.</small></fieldset>
    <fieldset class="tk-field"><legend>What Pawmily Voice may read for you</legend>
      ${CATEGORIES.map((k) => box(`cat:${k}`, E(CATEGORY_LABELS[k]), cats[k] === true)).join('')}
      ${box('names', "Leave people's names out", true, true, ' <small class="muted">· always, for now</small>')}
      <small class="muted">All off to start. Something about someone else — like your partner's calendar — is read only if they allow it too. Anything that looks like a code, an account number, an email or an address is always read by your phone instead.</small></fieldset>
    ${v?.personal && v.mine ? `<fieldset class="tk-field"><legend>Your voice</legend>
      ${v.enabled ? `${box('purp:talk:self', 'My own answers', (v.purposes || []).includes('talk:self'))}${box('purp:talk:family', 'Answers for others in the family', (v.purposes || []).includes('talk:family'))}
      <small class="muted">It's said as "Pawmily using your voice". Nothing is read in your voice until you tick one.</small>
      <button type="button" class="ghost small" data-talk="vrevoke">Turn my voice off</button>` : '<small class="muted">Your voice is off for Pawmily.</small> <button type="button" class="ghost small" data-talk="vrestore">Turn it back on</button>'}</fieldset>` : ''}
    ${a.canChange ? `<fieldset class="tk-field"><legend>For the family (you set this up)</legend>
      ${box('admin', 'Cloud voice', !!a.cloud, !a.configured, a.configured ? '' : ' <small class="muted">· not set up on the connector</small>')}
      <dl class="tk-dl"><dt>Provider</dt><dd>${E(a.provider || 'ElevenLabs')}</dd><dt>If it's off or fails</dt><dd>${E(a.fallback || 'Device voice')}</dd><dt>Used today</dt><dd>${(+a.used || 0).toLocaleString()} of ${(+a.cap || 0).toLocaleString()} characters${a.paused ? ' · paused for now' : ''}</dd></dl>
      <small class="muted">Off turns it off for everyone at once — Talk keeps working with phones' own voices.</small></fieldset>` : ''}
    <p class="tiny muted">ElevenLabs keeps what it reads for a time under its own terms — see the privacy policy. Pawmily never sends it your family key, your calendar, notes or threads.</p>
  </div>`;
}
export function onSubmit(f) { heard = false; hush(); const v = f.querySelector('textarea')?.value || ''; return send(v); }
