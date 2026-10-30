// 🗣️ Talk to Pawmily, T2a — "Ask about my day": what's on today, what your partner is up to, when
// you're free, the best time for a run. Pure, so it's tested.
//
// The phone puts together what the Calendar tab already shows you for today and tomorrow (events
// and linked calendars, the dogs' appointments, plans), works out your free time itself, and adds
// today's weather and your own WHOOP summary when it has them. Only after you've allowed it once
// does that go to Claude — with people as roles ([partner], [member:N]) — and only for a question.
// Claude answers in words and may suggest up to 3 times; a suggestion is kept only if it falls in a
// free gap the phone worked out (never trusted from the answer), and adding one puts it on your
// own calendar only.
import { toTokens } from './talkActions.js';

// A question about the day (else the request goes the usual way).
export function isDayQuestion(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(agenda|schedule|calendar|free time|am i free|are we free|busy|plan my day|my day|up to (today|tonight|tomorrow)|up to\??$|what('s| is) on\b|what do (i|we) have|when (should|can|could) (i|we)|best time|what time should|fit in|squeeze in|this (morning|afternoon|evening)|tonight|tomorrow)\b/.test(t)) return true;
  const asks = /^(what|when|who|where|which|is|are|do|does|did|can|could|should|how)\b/.test(t);
  // Questions about today's food or WHOOP numbers go the same way (the facts carry them).
  if (asks && /\b(meal plan|meals?|macros?|calories|protein|carbs|fat|eat|breakfast|lunch|dinner|snacks?|recovery|sleep|strain|whoop|hrv)\b/.test(t)) return true;
  return asks && /\b(today|tomorrow|tonight|morning|afternoon|evening|free|time|day)\b/.test(t);
}

const mins = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
// Does this item take your time? Yours, both of you, or the family's.
const mine = (who, meId) => who === meId || who === 'both' || who === 'family' || !who || (Array.isArray(who) && who.includes(meId));

// Your free gaps of at least `min` minutes between `from` and `to` (today: from now on).
export function freeTime(items, { meId, from = '07:00', to = '22:00', now = null, min = 30 } = {}) {
  const start = Math.max(mins(from), now != null ? Math.ceil((mins(now) ?? 0) / 15) * 15 : 0), end = mins(to);
  const busy = items.filter((x) => !x.allDay && mins(x.time) != null && mine(x.who, meId))
    .map((x) => { const a = mins(x.time), b = mins(x.end); return [a, b != null && b > a ? b : a + 60]; }).sort((p, q) => p[0] - q[0]);
  const out = [];
  let at = start;
  for (const [a, b] of busy) { if (a - at >= min) out.push({ from: hhmm(at), to: hhmm(Math.min(a, end)) }); at = Math.max(at, b); if (at >= end) break; }
  if (end - at >= min) out.push({ from: hhmm(at), to: hhmm(end) });
  return out.filter((w) => mins(w.to) - mins(w.from) >= min);
}

// The weather for a day question: every 2 hours from 6 AM to 8 PM on each day asked about (today:
// from about now on), and sunrise and sunset. It's the forecast for the family's area that Home
// already fetches for dog walks (nothing about you goes with that request).
const p2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export function dayWeather(hourly, { dates = [], now = null, daily = null } = {}) {
  const today = now ? isoOf(now) : null, nowH = now ? now.getHours() : 0;
  const hours = (hourly || []).filter((h) => {
    const d = isoOf(h.time), hr = h.time.getHours();
    return dates.includes(d) && hr >= 6 && hr <= 20 && hr % 2 === 0 && !(d === today && hr < nowH - 1);
  }).map((h) => ({ date: isoOf(h.time), at: `${p2(h.time.getHours())}:00`, tempF: Math.round(h.temp), rainChance: Math.round(h.rain || 0), windMph: Math.round(h.wind || 0) }));
  const at = (list, d) => (list || []).find((s) => String(s).startsWith(d))?.slice(11, 16) || null;
  const sun = dates.map((d) => ({ date: d, sunrise: at(daily?.sunrise, d), sunset: at(daily?.sunset, d) })).filter((s) => s.sunrise || s.sunset);
  return { hours, sun };
}

// Your own food today, for a day question: the day's targets, what you've eaten, what's left, and
// each main meal — logged (what you had) or still planned (title, calories, macros and its foods).
// Built from the same numbers Health shows (js/dayPlan.js). Never weights, notes or other days.
export function foodFacts({ entry = null, planned = {}, logged = {}, extras = 0 } = {}) {
  if (!entry || !(entry.target > 0)) return null;
  const R = Math.round, meal = (x) => ({ title: String(x.title || '').replace(/\s+/g, ' ').trim().slice(0, 80), kcal: R(x.kcal || 0), protein: R(x.p || 0), carbs: R(x.c || 0), fat: R(x.f || 0), ...(x.foods ? { foods: String(x.foods).slice(0, 200) } : {}) });
  const meals = ['breakfast', 'lunch', 'snack', 'dinner'].map((m) => (logged[m] ? { meal: m, status: 'logged', ...meal(logged[m]) } : planned[m] ? { meal: m, status: 'planned', ...meal(planned[m]) } : null)).filter(Boolean);
  return {
    target: { kcal: entry.target, protein: entry.proteinTarget }, eaten: { kcal: entry.eaten, protein: entry.protein },
    left: entry.left, meals, ...(extras ? { extrasLogged: extras } : {}), ...(entry.complete ? { doneLogging: true } : {}),
  };
}

// What goes to Claude for a day question: each day's items (time, end, title, place, whose, kind),
// your free gaps, and — when the phone has them — the weather, your WHOOP numbers and your own food
// today. Names become roles everywhere (titles too). Nothing else: no notes, no other lists, no history.
export const CONTEXT_MAX = 11800; // the gateway takes up to 12,000 characters
export function dayContext({ days = [], meId, people = [], now = null, today, weather = null, sun = null, health = null, food = null } = {}) {
  const role = (who) => {
    if (who === 'both') return 'you and [partner]';
    if (!who || who === 'family') return 'the family';
    if (who === meId) return 'you';
    const p = people.find((x) => x.id === who);
    return p ? toTokens(p.name, people).text : 'someone in the family';
  };
  const out = {
    today, now,
    days: days.map((d) => ({
      date: d.date,
      items: d.items.slice(0, 30).map((x) => ({
        ...(x.allDay ? { allDay: true } : { time: x.time || '', ...(x.end ? { end: x.end } : {}) }),
        title: toTokens(String(x.title || '').slice(0, 90), people).text,
        ...(x.place ? { place: toTokens(String(x.place).slice(0, 80), people).text } : {}),
        who: role(x.who), kind: x.kind || 'event',
      })),
      yourFreeTime: freeTime(d.items, { meId, now: d.date === today ? now : null }),
    })),
  };
  if (weather?.length) out.weather = weather.slice(0, 16);
  if (sun?.length) out.daylight = sun;
  if (health) out.yourHealth = health;
  if (food) out.yourFood = { ...food, meals: food.meals.map((m) => ({ ...m, title: toTokens(m.title, people).text, ...(m.foods ? { foods: toTokens(m.foods, people).text } : {}) })) };
  // A very full calendar: tomorrow's weather goes first, then the last items of the fullest day.
  while (JSON.stringify(out).length > CONTEXT_MAX) {
    if (out.weather?.some((w) => w.date && w.date !== today)) { out.weather = out.weather.filter((w) => !w.date || w.date === today); continue; }
    const d = [...out.days].sort((a, b) => b.items.length - a.items.length)[0];
    if (!d || d.items.length <= 3) break;
    d.items.pop();
  }
  return out;
}

// Claude's suggestions → only the ones that fit a free gap the phone found (and look sane).
export function checkSuggestions(list, ctx) {
  const free = Object.fromEntries((ctx?.days || []).map((d) => [d.date, d.yourFreeTime || []]));
  return (Array.isArray(list) ? list : []).slice(0, 3).filter((s) => {
    const a = mins(s?.start), b = mins(s?.end);
    if (!free[s?.date] || a == null || b == null || b <= a || b - a > 8 * 60) return false;
    return free[s.date].some((w) => a >= mins(w.from) && b <= mins(w.to));
  }).map((s) => ({ date: s.date, start: s.start, end: s.end, title: String(s.title || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Plan', why: String(s.why || '').replace(/\s+/g, ' ').trim().slice(0, 140) }));
}
