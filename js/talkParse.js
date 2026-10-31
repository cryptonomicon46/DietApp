// 🗣️ Talk to Pawmily, T1: the requests it understands (only things that are yours to change) and
// the phone's own reader for the everyday ones — so "add Dune to our watchlist" or "walked the dog"
// never needs Claude. Whatever this can't read goes to Claude (server/talkAi.js), whose answer is
// cleaned by the same tidySteps, so both paths give the same few step shapes:
//   { do: 'watch.add', title, kind: 'movie' | 'show' | '', status: 'want' | 'watching' | 'finished' }
//   { do: 'watch.status', title, status }
//   { do: 'read.add', title, author, state: 'want' | 'reading' | 'finished', recBy: 'partner' | '' }
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
      const title = clean(s.title, 140);
      if (!title) continue;
      out.push(d === 'read.add' ? { do: d, title, author: clean(s.author, 80), state: pick(s.state, READ_ST, 'want'), recBy: s.recBy === 'partner' ? 'partner' : '' } : { do: d, title, state: pick(s.state, READ_ST, 'reading') });
    } else if (d === 'diet.log' || d === 'fitness.describe') {
      const text = clean(s.text, d === 'diet.log' ? 600 : 1500);
      if (!text) continue;
      out.push(d === 'diet.log' ? { do: d, meal: pick(s.meal === 'snack' ? 'extra' : s.meal, MEALS, 'extra'), text, ...(s.plan === true ? { plan: true } : {}) } : { do: d, text });
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
  [/^(?:please\s+)?add\s+(?:the\s+book\s+)?(.+?)\s+to\s+(?:our|my|the)\s+(?:reading\s+list|read(?:ing)?|books?|to-?read(?:\s+list)?|book\s+list)(?:\s*[,—–-]\s*|\s+)?(\[partner\]\s+recommended\s+it|recommended\s+by\s+\[partner\])?$/i, (m) => ({ do: 'read.add', title: m[1], state: 'want', recBy: m[2] ? 'partner' : '' })],
  [/^i(?:'m|’m| am)\s+(?:starting|reading|listening\s+to)\s+(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'reading' })],
  [/^i\s+(?:started|began)\s+(?:reading\s+)?(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'reading' })],
  [/^i\s+finished\s+(?:reading\s+)?(.+)$/i, (m) => ({ do: 'read.state', title: m[1], state: 'finished' })],
  // Food — planning ahead ("Plan dinner: salmon and rice", "I'll have a burrito bowl for lunch") opens it with Plan it first.
  [/^plan\s+(?:my\s+)?(breakfast|lunch|dinner)\s*[:,—–-]?\s*(?:as\s+)?(.+)$/i, (m) => ({ do: 'diet.log', meal: m[1].toLowerCase(), text: m[2], plan: true })],
  [/^(?:i(?:'ll|’ll| will)\s+have|i(?:'m|’m| am)\s+(?:having|going\s+to\s+have))\s+(.+?)\s+for\s+(breakfast|lunch|dinner)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase(), text: m[1], plan: true })],
  // Food
  [/^(?:log|i\s+had|i\s+ate|for)\s+(?:my\s+)?(breakfast|lunch|dinner|a\s+snack|snack)\s*[:,—–-]?\s*(?:was\s+|of\s+)?(.+)$/i, (m) => ({ do: 'diet.log', meal: /snack/i.test(m[1]) ? 'extra' : m[1].toLowerCase(), text: m[2] })],
  [/^(?:log\s+)?(.+?)\s+for\s+(breakfast|lunch|dinner)$/i, (m) => ({ do: 'diet.log', meal: m[2].toLowerCase(), text: m[1] })],
  // Fitness
  [/^make\s+(?:today'?s\s+|my\s+|the\s+)?workout\s+(?:a\s+bit\s+)?(?:lighter|easier)$/i, () => ({ do: 'fitness.lighter' })],
  // Weight (today's weigh-in): "Log my weight for today 160.6 pounds", "I weigh 72.5 kg", "Weighed in at 160.6 this morning"
  [new RegExp(`^(?:please\\s+)?(?:log|record|save|add|enter|put\\s+in)\\s+(?:my\\s+|today'?s\\s+)?(?:weight|weigh[- ]?in)${WHEN}\\s*(?:as|at|is|of|to|[:=,—–-])?\\s*${NUM}${WHEN}$`, 'i'), (m) => ({ do: 'weight.log', lb: toLb(m[1], m[2]) })],
  [new RegExp(`^(?:(?:my\\s+)?(?:today'?s\\s+)?(?:weight|weigh[- ]?in)${WHEN}\\s*(?:is|was|[:=,—–-])?|i\\s+(?:weigh|weighed)(?:\\s+in)?(?:\\s+at)?${WHEN}|weighed(?:\\s+in)?(?:\\s+at)?${WHEN})\\s*${NUM}${WHEN}$`, 'i'), (m) => ({ do: 'weight.log', lb: toLb(m[1], m[2]) })],
  // Dogs and chores
  [/^(?:i|we)?\s*(?:walked|took)\s+(?:the\s+)?dogs?(?:\s+(?:out|for\s+a\s+walk))?$/i, () => ({ do: 'care.log', chore: 'walk' })],
  [/^(?:i|we)?\s*took\s+(?:the\s+)?dogs?\s+to\s+the\s+(?:dog\s+)?park$/i, () => ({ do: 'care.log', chore: 'park' })],
  [/^(?:i|we)?\s*fed\s+(?:the\s+)?dogs?\s+(breakfast|dinner)$/i, (m) => ({ do: 'care.log', chore: m[1].toLowerCase() })],
  [/^(?:i|we)?\s*gave\s+(?:the\s+)?dogs?\s+(?:a\s+|their\s+)?(treats?|meds|medicine)$/i, (m) => ({ do: 'care.log', chore: /treat/i.test(m[1]) ? 'treat' : 'meds' })],
];
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
