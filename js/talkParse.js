// 🗣️ Talk to Pawmily, T1: the requests it understands (only things that are yours to change) and
// the phone's own reader for the everyday ones — so "add Dune to our watchlist" or "walked the dog"
// never needs Claude. Whatever this can't read goes to Claude (server/talkAi.js), whose answer is
// cleaned by the same tidySteps, so both paths give the same few step shapes:
//   { do: 'watch.add', title, kind: 'movie' | 'show' | '', status: 'want' | 'watching' | 'finished' }
//   { do: 'watch.status', title, status }
//   { do: 'read.add', title, author, state: 'want' | 'reading' | 'finished', recBy: 'partner' | '', f?: 'listen' (an audiobook) }
//   { do: 'read.state', title, state }
//   { do: 'diet.log', meal: 'breakfast' | 'lunch' | 'dinner' | 'extra', text, plan? (true: planning ahead) }
//   { do: 'fitness.describe', text }      { do: 'fitness.lighter' }      { do: 'care.log', chore }
//   { do: 'weight.log', lb } — today's weigh-in, in pounds (kg are converted; 60–700 lb)
//   { do: 'ask.day' } — a question about today/tomorrow (js/talkDay.js answers it, with your OK)
// Titles stay titles: the phone finds the matching show or book itself, so lists never leave it.
// Pure: text in, steps out.

export const DOS = ['watch.add', 'watch.status', 'read.add', 'read.state', 'diet.log', 'fitness.describe', 'fitness.lighter', 'care.log', 'weight.log', 'ask.day'];
// A weight in pounds (one decimal), from a number and its unit; null unless 60–700 lb.
export const toLb = (n, unit = '') => { const v = Number(n) * (/^(kg|kilo)/i.test(String(unit)) ? 2.20462 : 1); return Number.isFinite(v) && v >= 60 && v <= 700 ? Math.round(v * 10) / 10 : null; };
const WATCH_ST = ['want', 'watching', 'finished'], READ_ST = ['want', 'reading', 'finished'], MEALS = ['breakfast', 'lunch', 'dinner', 'extra'];
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/^["“'‘]|["”'’.!?]$/g, '').trim().slice(0, n);
const pick = (v, list, d) => (list.includes(v) ? v : d);

// 📚 "Fruit Fly by Josh Silver" → the title and the author (only when what follows "by" looks like
// a name: two to four words, so "Stand by Me" stays a title).
export function splitByAuthor(t) {
  const m = String(t || '').match(/^(.+?)\s+by\s+(?:the\s+author\s+)?((?:[\p{L}.'’-]+\s+){1,3}[\p{L}.'’-]+)$/iu);
  return m && !/\b(?:the|a|an|my|our|me|you|him|her|them|us)$/i.test(m[2]) ? { title: m[1], author: m[2] } : { title: String(t || ''), author: '' };
}
// What was said about a book after the list's name: "this title by the author Josh Silver called
// fruit fly", "the audiobook Fruit Fly by Josh Silver", "called Fruit Fly".
export function bookPhrase(rest) {
  const r = String(rest || '').trim().replace(/^(?:this|that|the|a|an)\s+(?:title|book|audio\s*book|novel)\s*/i, '').replace(/^(?:called|titled|named)\s+/i, (x) => x);
  let m = r.match(/^by\s+(?:the\s+author\s+)?(.+?)\s*,?\s+(?:called|titled|named)\s+(.+)$/i);
  if (m) return { title: m[2], author: m[1] };
  m = r.match(/^(?:called|titled|named)\s+(.+?)(?:\s*,?\s+by\s+(?:the\s+author\s+)?(.+))?$/i);
  if (m) return { title: m[1], author: m[2] || '' };
  return splitByAuthor(r);
}
// "fruit fly" said all in lower case → "Fruit Fly" (a title someone typed with capitals stays).
const titleCase = (t) => (t === t.toLowerCase() ? t.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : t);
const BOOK_LIST = '(reading\\s+list|read(?:ing)?|books?|to-?read(?:\\s+list)?|book\\s+list|audio\\s*books?(?:\\s+list)?|listening\\s+list|listen\\s+list)';
const isAudio = (s) => /audio|listen/i.test(s || '');

// Steps from anywhere (this file or Claude) → only the allowed shapes, cleaned; at most 4.
export function tidySteps(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const d = s?.do;
    if (!DOS.includes(d)) continue;
    if (d === 'watch.add' || d === 'watch.status') {
      const title = clean(s.title, 100);
      if (!title) continue;
      out.push(d === 'watch.add' ? { do: d, title, kind: pick(s.kind, ['movie', 'show'], ''), status: pick(s.status, WATCH_ST, 'want') } : { do: d, title, status: pick(s.status, WATCH_ST, 'watching') });
    } else if (d === 'read.add' || d === 'read.state') {
      // "Fruit Fly by Josh Silver" said as the title: the author is split off for the search.
      const sp = s.author ? { title: s.title, author: s.author } : splitByAuthor(clean(s.title, 220));
      const title = titleCase(clean(sp.title, 140)), author = clean(sp.author, 80), f = s.f === 'listen' ? { f: 'listen' } : {};
      if (!title) continue;
      out.push(d === 'read.add' ? { do: d, title, author, state: pick(s.state, READ_ST, 'want'), recBy: s.recBy === 'partner' ? 'partner' : '', ...f } : { do: d, title, state: pick(s.state, READ_ST, 'reading'), ...(author ? { author } : {}), ...f });
    } else if (d === 'diet.log' || d === 'fitness.describe') {
      const text = clean(s.text, d === 'diet.log' ? 600 : 1500);
      if (!text) continue;
      out.push(d === 'diet.log' ? { do: d, meal: pick(s.meal === 'snack' ? 'extra' : s.meal, MEALS, 'extra'), text, ...(s.plan === true ? { plan: true } : {}), ...(s.add === true ? { add: true } : {}) } : { do: d, text });
    } else if (d === 'fitness.lighter') out.push({ do: d });
    else if (d === 'care.log') { const chore = clean(s.chore, 40); if (chore) out.push({ do: d, chore }); }
    else if (d === 'weight.log') { const lb = toLb(s.lb); if (lb) out.push({ do: d, lb }); }
    else if (d === 'ask.day') { out.length = 0; out.push({ do: d }); break; } // a question about the day: answered on its own
    if (out.length === 4) break;
  }
  return out;
}

// ---------- the phone's own reader ----------
const NUM = '(\\d{2,3}(?:\\.\\d{1,2})?)\\s*(lbs?|pounds?|kgs?|kilos?|kilograms?)?';
const WHEN = '(?:\\s+(?:for\\s+)?(?:today|this\\s+morning|now))?';
const RULES = [
  // Watch
  [/^(?:please\s+)?add\s+(?:the\s+(movie|film|show|series)\s+)?(.+?)\s+to\s+(?:our|my|the)\s+(?:watch\s*list|watch|list to watch|want to watch)$/i, (m) => ({ do: 'watch.add', title: m[2], kind: /movie|film/i.test(m[1] || '') ? 'movie' : m[1] ? 'show' : '', status: 'want' })],
  [/^(?:we(?:'re|’re| are)|i(?:'m|’m| am))\s+(?:now\s+)?watching\s+(.+?)(?:\s+(?:right\s+)?now)?$/i, (m) => ({ do: 'watch.status', title: m[1], status: 'watching' })],
  [/^(?:we|i)\s+(?:started|began)\s+watching\s+(.+)$/i, (m) => ({ do: 'watch.status', title: m[1], status: 'watching' })],
  // "We finished X" is a show you watch together; "I finished X" could be a book — only with "watching".
  [/^(?:we\s+(?:finished|watched)(?:\s+watching)?|i\s+(?:finished\s+watching|watched))\s+(?!reading\b)(.+)$/i, (m) => ({ do: 'watch.status', title: m[1], status: 'finished' })],
  [/^mark\s+(.+?)\s+(?:as\s+)?(?:watched|finished)$/i, (m) => ({ do: 'watch.status', title: m[1], status: 'finished' })],
  // Read
  [new RegExp(`^(?:please\\s+)?add\\s+(.+?)\\s+to\\s+(?:our|my|the)\\s+${BOOK_LIST}(?:\\s*[,—–-]\\s*|\\s+)?(\\[partner\\]\\s+recommended\\s+it|recommended\\s+by\\s+\\[partner\\])?$`, 'i'), (m) => ({ do: 'read.add', ...bookPhrase(m[1]), state: 'want', recBy: m[3] ? 'partner' : '', ...(isAudio(m[2]) || isAudio(m[1].split(/\s+/).slice(0, 2).join(' ')) ? { f: 'listen' } : {}) })],
  // "To my audiobooks add this title by the author Josh Silver called Fruit Fly"
  [new RegExp(`^(?:please\\s+)?(?:to|on|in)\\s+(?:our|my|the)\\s+${BOOK_LIST}\\s*[,:]?\\s+(?:please\\s+)?add\\s+(.+)$`, 'i'), (m) => ({ do: 'read.add', ...bookPhrase(m[2]), state: 'want', recBy: '', ...(isAudio(m[1]) || isAudio(m[2].split(/\s+/).slice(0, 2).join(' ')) ? { f: 'listen' } : {}) })],
  [/^i(?:'m|’m| am)\s+listening\s+to\s+(?:the\s+audio\s*book\s+)?(.+)$/i, (m) => ({ do: 'read.state', ...bookPhrase(m[1]), state: 'reading', f: 'listen' })],
  [/^i(?:'m|’m| am)\s+(?:starting|reading)\s+(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'reading' })],
  [/^i\s+(?:started|began)\s+(?:reading\s+)?(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'reading' })],
  [/^i\s+finished\s+(?:reading\s+)?(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'finished' })],
  // Food — planning ahead ("Plan dinner: salmon and rice", "I'll have a burrito bowl for lunch") opens it with Plan it first.
  [/^plan\s+(?:my\s+)?(breakfast|lunch|dinner)\s*[:,—–-]?\s*(?:as\s+)?(.+)$/i, (m) => ({ do: 'diet.log', meal: m[1].toLowerCase(), text: m[2], plan: true })],
  [/^(?:i(?:'ll|’ll| will)\s+have|i(?:'m|’m| am)\s+(?:having|going\s+to\s+have))\s+(.+?)\s+for\s+(breakfast|lunch|dinner)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase(), text: m[1], plan: true })],
  // Food — "Add … to dinner" adds to the meal; "Log dinner: …" replaces it.
  [/^(?:please\s+)?(?:add|also\s+add|plus)\s+(.+?)\s+(?:to|into|in)\s+(?:my\s+|the\s+|today'?s\s+)?(breakfast|lunch|dinner|snack)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase() === 'snack' ? 'extra' : m[2].toLowerCase(), text: m[1], add: true })],
  [/^(?:please\s+)?add\s+to\s+(?:my\s+|the\s+|today'?s\s+)?(breakfast|lunch|dinner|snack)\s*[:,—–-]?\s*(.+)$/i, (m) => ({ do: 'diet.log', meal: m[1].toLowerCase() === 'snack' ? 'extra' : m[1].toLowerCase(), text: m[2], add: true })],
  [/^i\s+also\s+had\s+(.+?)\s+(?:for|with)\s+(breakfast|lunch|dinner)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase(), text: m[1], add: true })],
  // Food
  [/^(?:log|i\s+had|i\s+ate|for)\s+(?:my\s+)?(breakfast|lunch|dinner|a\s+snack|snack)\s*[:,—–-]?\s*(?:was\s+|of\s+)?(.+)$/i, (m) => ({ do: 'diet.log', meal: /snack/i.test(m[1]) ? 'extra' : m[1].toLowerCase(), text: m[2] })],
  [/^(?:log\s+)?(.+?)\s+for\s+(breakfast|lunch|dinner)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase(), text: m[1] })],
  // Fitness
  [/^make\s+(?:today'?s\s+|my\s+|the\s+)?workout\s+(?:a\s+bit\s+)?(?:lighter|easier)$/i, () => ({ do: 'fitness.lighter' })],
  // A workout in words ("Log a workout: squats 3x8 at 185", "I did 3x10 squats at 135"): read on the
  // phone into a review card. "I did …" counts only with sets, reps or rounds in it.
  [/^(?:log|create|plan|add|save|make)\s+(?:a\s+|my\s+|today'?s\s+)?workout\s*[:,—–-]?\s*(?:of\s+)?(.+)$/i, (m) => ({ do: 'fitness.describe', text: m[1] })],
  [/^(?:today'?s\s+)?workout\s*[:—–-]\s*(.+)$/i, (m) => ({ do: 'fitness.describe', text: m[1] })],
  [/^i\s+(?:just\s+)?(?:did|finished)\s+(?=.*(?:\d\s*[x×]\s*\d|\bsets?\b|\breps?\b|\brounds?\b))(.+)$/i, (m) => ({ do: 'fitness.describe', text: m[1] })],
  // Weight (today's weigh-in): "Log my weight for today 160.6 pounds", "I weigh 72.5 kg", "Weighed in at 160.6 this morning"
  [new RegExp(`^(?:please\\s+)?(?:log|record|save|add|enter|put\\s+in)\\s+(?:my\\s+|today'?s\\s+)?(?:weight|weigh[- ]?in)${WHEN}\\s*(?:as|at|is|of|to|[:=,—–-])?\\s*${NUM}${WHEN}$`, 'i'), (m) => ({ do: 'weight.log', lb: toLb(m[1], m[2]) })],
  [new RegExp(`^(?:(?:my\\s+)?(?:today'?s\\s+)?(?:weight|weigh[- ]?in)${WHEN}\\s*(?:is|was|[:=,—–-])?|i\\s+(?:weigh|weighed)(?:\\s+in)?(?:\\s+at)?${WHEN}|weighed(?:\\s+in)?(?:\\s+at)?${WHEN})\\s*${NUM}${WHEN}$`, 'i'), (m) => ({ do: 'weight.log', lb: toLb(m[1], m[2]) })],
  // Dogs and chores
  [/^(?:i|we)?\s*(?:walked|took)\s+(?:the\s+)?dogs?(?:\s+(?:out|for\s+a\s+walk))?$/i, () => ({ do: 'care.log', chore: 'walk' })],
  [/^(?:i|we)?\s*took\s+(?:the\s+)?dogs?\s+to\s+the\s+(?:dog\s+)?park$/i, () => ({ do: 'care.log', chore: 'park' })],
  [/^(?:i|we)?\s*fed\s+(?:the\s+)?dogs?\s+(breakfast|dinner)$/i, (m) => ({ do: 'care.log', chore: m[1].toLowerCase() })],
  [/^(?:i|we)?\s*gave\s+(?:the\s+)?dogs?\s+(?:a\s+|their\s+)?(treats?|meds|medicine)$/i, (m) => ({ do: 'care.log', chore: /treat/i.test(m[1]) ? 'treat' : 'meds' })],
];
// 📷 "Take a photo of my dinner", "snap my lunch", "photo of my lunch — I ate out": a meal from a
// photo, eaten out. "Take a photo of my workout / the WOD / the whiteboard": today's workout from a
// photo. Read on the phone only (no step for Claude): Talk shows 📷 Take a photo / 🖼 From Photos
// straight away. → { kind: 'meal', meal } | { kind: 'workout' } | null. No meal named: the one for
// the time of day.
const PHOTO_WORD = /\b(photo|picture|pic|snap|snapshot|screenshot|camera)\b/i;
const MEAL_WORD = /\b(breakfast|lunch|dinner|snack|meal|food|plate|dish)\b/i;
const WORKOUT_WORD = /\b(workout|work out|wod|whiteboard|white board|training|exercises?|sets and reps|lifting|crossfit|class programming)\b/i;
const NOT_THIS_PHOTO = /\b(label|nutrition facts|receipt|menu board|wardrobe|outfit|look|dog|pup|book|cover)\b/i;
export function photoAsk(text, hour = 12) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!t || t.length > 160 || /\?$/.test(t) || !PHOTO_WORD.test(t) || NOT_THIS_PHOTO.test(t)) return null;
  const workout = WORKOUT_WORD.test(t);
  if (!workout && !MEAL_WORD.test(t)) return null;
  // A request: "take / snap / capture / log … a photo", "photo of …", "from a photo", "I ate out …".
  if (!/^(?:please\s+|can you\s+|let(?:'s| me)\s+|i(?:'d like to|'ll| want to| will)\s+)?(?:take|snap|capture|log|add|upload|use|grab|scan|read|open the camera|photo|picture|pic|screenshot|i\s+ate\s+out|ate\s+out)\b/i.test(t) && !/\bfrom (?:a|my) (?:photo|picture)\b/i.test(t)) return null;
  if (workout) return { kind: 'workout' };
  const said = t.match(/\b(breakfast|lunch|dinner|snack)\b/i)?.[1]?.toLowerCase();
  const meal = said === 'snack' ? 'extra' : said || (hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : 'dinner');
  return { kind: 'meal', meal };
}
// ❓ "How do I log a meal?", "how can I add a workout", "ways to track my weight": the ways to do
// it, as a card (Talk shows them, each one tappable). → { topic: 'meal' | 'workout' | 'weight' } or null.
export function howAsk(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(?:(?:hi|hey|ok|okay)[,!]?\s+)?(?:how\s+(?:do|can|should|would|could)\s+(?:i|we)|how\s+to|what(?:'s| is| are)\s+the\s+(?:best\s+|easiest\s+)?ways?\s+to|(?:the\s+)?ways\s+to|show\s+me\s+how\s+to|teach\s+me\s+(?:how\s+)?to|help\s+me|where\s+do\s+i|can\s+(?:i|you\s+help\s+me))\s+(?:log|add|track|record|enter|put\s+in|save|keep\s+track\s+of)\s+(?:a\s+|an\s+|my\s+|the\s+|today'?s\s+|what\s+i\s+(?:ate|eat|did))?\s*(.{0,60}?)\s*[?.!]*$/i);
  if (!m) return null;
  const what = m[1] || '';
  if (/\b(meals?|food|breakfast|lunch|dinner|snacks?|eat|ate|calories|macros|drinks?)\b/i.test(what) || /what i (?:ate|eat)/i.test(t)) return { topic: 'meal' };
  if (/\b(workouts?|exercises?|training|lifts?|lifting|wod|runs?|gym|sets|reps)\b/i.test(what) || /what i did/i.test(t)) return { topic: 'workout' };
  if (/\b(weight|weigh[- ]?ins?)\b/i.test(what)) return { topic: 'weight' };
  return null;
}
// 🤒 "I'm sick today", "I've got a cold", "not feeling well", "make today a sick day" → { on: true };
// "I'm feeling better", "end my sick day" → { on: false }. Only about you (never "Pat is sick"), and
// not "sick of…" or a cold brew. Read on the phone; nothing is sent anywhere.
export function sickAsk(text) {
  const t = String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (!t || t.length > 160 || /\bsick (?:of|and tired)\b/.test(t)) return null;
  const me = "(?:i'?m|i am|i feel|i'm feeling|i am feeling|feeling|i've been|i have been|been)";
  if (new RegExp(`^(?:(?:hi|hey|ok|okay)[,!]?\\s+)?(?:${me}\\s+(?:much\\s+|a lot\\s+|a bit\\s+)?better|i'?m not sick any ?more|i'?m no longer sick|(?:end|stop|turn off|cancel|finish)\\s+(?:the\\s+|my\\s+|today'?s\\s+)?sick ?day)\\b`).test(t)) return { on: false };
  if (/\b(?:make|start|turn on|set|it'?s|today is)\b.{0,20}\bsick ?day\b/.test(t) || /^sick ?day\b/.test(t)) return { on: true };
  if (new RegExp(`(?:^|\\b)${me}\\s+(?:a (?:bit|little)\\s+|really\\s+|so\\s+|pretty\\s+|kind of\\s+|very\\s+)?(?:sick|ill|unwell|under the weather|poorly)\\b`).test(t)) return { on: true };
  if (/\bnot feeling (?:so |too |very )?(?:well|good|great)\b/.test(t)) return { on: true };
  if (/\bi(?:'ve| have)?(?: got| caught| come down with)? (?:a |the |some )?(?:cold|flu|fever|sore throat|stomach bug|tummy bug|bug|virus|covid|cough|stomach flu|chest infection)\b(?! ?(?:brew|coffee|plunge|shower|drink|one|brew))/.test(t)) return { on: true };
  return null;
}
// → { steps } when the phone could read it all, else null (ask Claude, if it's on).
export function parseTalk(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (!t || t.length > 500) return null;
  for (const [re, make] of RULES) {
    const m = t.match(re);
    if (m) { const steps = tidySteps([make(m)]); if (steps.length) return { steps }; }
  }
  return null;
}
