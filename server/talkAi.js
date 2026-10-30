// 🗣️ Talk to Pawmily, T1: Claude reads a request the phone couldn't, and answers only with steps the
// app knows (js/talkParse.js tidySteps) — or nothing, with one short sentence. Only what the gateway
// let through arrives here: the words (people already swapped for [partner] / [member:N] on the
// phone), which tab it came from, and today's date. Never a list, a name, a plan or a key. Nothing
// is kept; the phone shows the steps as a plan and nothing changes until the person taps.
import { tidySteps, DOS } from '../js/talkParse.js';

const STEP = {
  type: 'object', additionalProperties: false, required: ['do'],
  properties: {
    do: { type: 'string', enum: DOS },
    title: { type: 'string' }, kind: { type: 'string', enum: ['movie', 'show', ''] }, status: { type: 'string', enum: ['want', 'watching', 'finished'] },
    author: { type: 'string' }, state: { type: 'string', enum: ['want', 'reading', 'finished'] }, recBy: { type: 'string', enum: ['partner', ''] },
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'extra'] }, text: { type: 'string' }, plan: { type: 'boolean' }, chore: { type: 'string' },
  },
};
export const TALK_SCHEMA = { type: 'object', additionalProperties: false, required: ['steps', 'say'], properties: { steps: { type: 'array', items: STEP }, say: { type: 'string' } } };

export const TALK_INSTRUCTIONS = `You turn one request from a member of a household app into steps the app can show for approval. Answer only as the JSON asked for.
Steps you may use (at most 4):
- watch.add: add a show or movie to their watchlist. title as said (fix obvious typos only), kind "movie", "show" or "" if unclear, status want / watching / finished.
- watch.status: a show or movie they already have moved to want / watching / finished. title as said.
- read.add: add a book. title, author if said, state want / reading / finished, recBy "partner" when [partner] recommended it.
- read.state: a book they have moved to want / reading / finished.
- diet.log: food they ate, or plan to eat. meal breakfast / lunch / dinner / extra (snacks and drinks), text = exactly the foods and amounts they said, plan true only when they're planning ahead ("I'll have…", "plan dinner…").
- fitness.describe: a workout they describe (exercises, sets, reps). text = their words.
- fitness.lighter: make today's planned workout lighter.
- ask.day: a question about their day or the next one — what's on, what [partner] or someone is up to, when they're free, the best time to fit something in, the weather, traffic or how long a drive takes, a place's opening hours — however it's phrased. Use it alone; the app then asks you again with their calendar, the forecast and drive times.
- care.log: a dog or household chore they did. chore = a short name ("walk", "dog park", "breakfast", "dinner", "treat", "meds", or the chore's name).
Rules:
- People appear as [partner] or [member:N]. Keep those tokens exactly; never guess names.
- Never invent titles, foods, amounts or chores they didn't say.
- If the request needs anything else — adding to the calendar, plans or messages involving other people, booking, buying, advice — return no steps and put one short friendly sentence in say about what you can do instead (adding shows, movies and books, logging meals, workouts and chores).
- Otherwise say is "".`;

async function ask(client, content, model) {
  const res = await client.messages.create({ model, max_tokens: 1200, output_config: { effort: 'low', format: { type: 'json_schema', schema: TALK_SCHEMA } }, messages: [{ role: 'user', content }] });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  try { return JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
}
export async function routeTalk(client, payload, { model } = {}) {
  const j = await ask(client, [{ type: 'text', text: `${TALK_INSTRUCTIONS}\n\nToday is ${payload.today || 'unknown'}; they were on the ${payload.tab || 'home'} tab.\nWhat they said:\n${payload.text}` }], model);
  const steps = tidySteps(j.steps);
  return { steps, say: steps.length ? '' : String(j.say || '').replace(/\s+/g, ' ').trim().slice(0, 240) };
}

// ---------- "Ask about my day" (T2a): a question + the day as the phone put it together ----------
const SUGGESTION = { type: 'object', additionalProperties: false, required: ['date', 'start', 'end', 'title', 'why'], properties: { date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } } };
export const DAY_SCHEMA = { type: 'object', additionalProperties: false, required: ['answer', 'suggestions'], properties: { answer: { type: 'string' }, suggestions: { type: 'array', items: SUGGESTION } } };
export const DAY_INSTRUCTIONS = `A member of a household app asked a question about their day. Answer from the facts below only, as the JSON asked for.
- answer: short and warm, plain text, at most 5 short lines. Times like "4:30 PM". Lead with what they asked.
- The facts list each day's items with whose they are ("you", "you and [partner]", "[partner]", "[member:N]", "the family"), and "yourFreeTime" — the only gaps they have. Never invent events, places, travel times or weather; if something isn't in the facts, say you don't know it.
- People appear as [partner] or [member:N]. Keep those tokens exactly; never guess names.
- "weather" is the forecast for their area every 2 hours (°F, chance of rain in %, wind in mph) and "daylight" has sunrise and sunset. When they're planning anything outdoors, say what the weather will be at the times you suggest, in a few words ("62°F and dry at 2 PM"), and keep outdoor plans before sunset. If there is no weather in the facts, say you don't have the forecast.
- "yourHealth" is their own WHOOP data for today: recovery score (%), sleep performance (%), hours slept and needed, strain so far (0–21). When they ask about sleep, recovery or WHOOP, give WHOOP's numbers in one line in WHOOP's order, like "Sleep 76% · Recovery 63% · Strain 5.1", then at most one short line on what it means for today (compared with their usual when given). Use WHOOP's names; don't invent scores.
- "yourFood" is their own food today: targets, what they've eaten, what's left (kcal, protein, carbs, fat in grams), and each meal as logged or still planned, with its foods. When they ask about meals, food or macros, list the meals still planned for the rest of today (name, kcal and protein, foods in brief), then one line with what's left after them. If yourFood is missing, say their meal plan isn't on this phone.
- Answer what they asked first; don't bring up their calendar, free time, weather or WHOOP unless the question is about them or a plan that needs them.
- "travel", when given, has drive times by car from where they are now (Google Maps, with traffic: "now" is live, later departures are predicted) and each place's opening hours today. Use them: say when to leave ("leave by 4:05 PM — about 18 min with traffic"), make the drive fit inside their free time before and after, and don't plan a visit outside the opening hours. If travel says a place wasn't found or drive times are unavailable, say so in a few words.
- Without travel facts, you don't know travel times; don't estimate them. When a plan involves going somewhere, leave room for the trip and say so briefly.
- When they ask when to do something (a run, a climb, an errand), suggest up to 3 options in suggestions: date (YYYY-MM-DD), start and end ("HH:MM", 24-hour) INSIDE one of yourFreeTime's gaps for that date, a short title, and why (one short line: the gap, the weather or how they slept when given). Prefer daylight and dry hours for outdoor activities, and lighter options when yourHealth says recovery is lower than usual. Otherwise suggestions is empty.
- Don't give medical advice.`;
export async function answerDay(client, payload, { model } = {}) {
  const res = await client.messages.create({ model, max_tokens: 1500, output_config: { effort: 'low', format: { type: 'json_schema', schema: DAY_SCHEMA } }, messages: [{ role: 'user', content: [{ type: 'text', text: `${DAY_INSTRUCTIONS}\n\nToday is ${payload.today}; it's ${payload.now || 'unknown'} now.\nFacts:\n${payload.context}\n\nTheir question:\n${payload.text}` }] }] });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  let j;
  try { j = JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
  const sugs = (Array.isArray(j.suggestions) ? j.suggestions : []).slice(0, 3).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x?.date) && /^\d{2}:\d{2}$/.test(x?.start) && /^\d{2}:\d{2}$/.test(x?.end));
  return { answer: String(j.answer || '').trim().slice(0, 900), suggestions: sugs.map((x) => ({ date: x.date, start: x.start, end: x.end, title: String(x.title || '').slice(0, 60), why: String(x.why || '').slice(0, 140) })) };
}
