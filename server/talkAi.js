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
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'extra'] }, text: { type: 'string' }, chore: { type: 'string' },
  },
};
export const TALK_SCHEMA = { type: 'object', additionalProperties: false, required: ['steps', 'say'], properties: { steps: { type: 'array', items: STEP }, say: { type: 'string' } } };

export const TALK_INSTRUCTIONS = `You turn one request from a member of a household app into steps the app can show for approval. Answer only as the JSON asked for.
Steps you may use (at most 4):
- watch.add: add a show or movie to their watchlist. title as said (fix obvious typos only), kind "movie", "show" or "" if unclear, status want / watching / finished.
- watch.status: a show or movie they already have moved to want / watching / finished. title as said.
- read.add: add a book. title, author if said, state want / reading / finished, recBy "partner" when [partner] recommended it.
- read.state: a book they have moved to want / reading / finished.
- diet.log: food they ate. meal breakfast / lunch / dinner / extra (snacks and drinks), text = exactly the foods and amounts they said.
- fitness.describe: a workout they describe (exercises, sets, reps). text = their words.
- fitness.lighter: make today's planned workout lighter.
- care.log: a dog or household chore they did. chore = a short name ("walk", "dog park", "breakfast", "dinner", "treat", "meds", or the chore's name).
Rules:
- People appear as [partner] or [member:N]. Keep those tokens exactly; never guess names.
- Never invent titles, foods, amounts or chores they didn't say.
- If the request needs anything else — the calendar, plans or messages involving other people, booking, buying, places, questions, advice — return no steps and put one short friendly sentence in say about what you can do instead (adding shows, movies and books, logging meals, workouts and chores).
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
