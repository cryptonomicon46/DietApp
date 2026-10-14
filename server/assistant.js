// "Ask Claude" for workout commands the phone's own parser couldn't understand.
// The app sends the sentence plus today's exercises; Claude answers by calling
// tools, and we hand those calls back to the app as the same actions the local
// parser produces ({type:'sets'|'add'|'weight'}). Nothing is stored.
//
// Needs the ANTHROPIC_API_KEY secret (npx wrangler secret put ANTHROPIC_API_KEY).
import { EXERCISES, MUSCLES } from '../js/lifting.js';

export const MODEL = 'claude-opus-5-5';
const IDS = Object.keys(EXERCISES);

export const TOOLS = [
  {
    name: 'log_sets',
    description: 'Log completed sets for one exercise in today\'s lifting session. Adds the exercise to the session if it is not there yet.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        exercise_id: { type: 'string', enum: IDS, description: 'Exercise id from the catalog.' },
        after_exercise_id: { type: ['string', 'null'], enum: [...IDS, null], description: 'If the exercise is new to today, the session exercise it should come after (e.g. "after squats"). null to put it after the last one used.' },
        sets: {
          type: 'array',
          description: 'One entry per set, in order.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reps: { type: 'integer', description: 'Reps completed.' },
              weight_lb: { type: ['number', 'null'], description: 'Load in pounds (total bar weight for barbell lifts, per dumbbell for dumbbells). null for bodyweight or when not said.' },
            },
            required: ['reps', 'weight_lb'],
          },
        },
      },
      required: ['exercise_id', 'after_exercise_id', 'sets'],
    },
  },
  {
    name: 'add_exercise',
    description: 'Add an exercise to today\'s session without logging any sets yet.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        exercise_id: { type: 'string', enum: IDS },
        after_exercise_id: { type: ['string', 'null'], enum: [...IDS, null], description: 'If the exercise is new to today, the session exercise it should come after (e.g. "after squats"). null to put it after the last one used.' },
      },
      required: ['exercise_id', 'after_exercise_id'],
    },
  },
  {
    name: 'check_sets',
    description: 'Mark sets as done (blank reps get the target). Set exactly one way of choosing: all, an exercise, a muscle group, or the exercise\'s number in today\'s list (-1 for the last one); leave the others null/false.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        all: { type: 'boolean' },
        exercise_id: { type: ['string', 'null'], enum: [...IDS, null] },
        muscle: { type: ['string', 'null'], enum: [...Object.keys(MUSCLES), null] },
        exercise_number: { type: ['integer', 'null'] },
      },
      required: ['all', 'exercise_id', 'muscle', 'exercise_number'],
    },
  },
  {
    name: 'move_exercise',
    description: 'Reorder today\'s session, e.g. when equipment is busy. Give exactly one of: another exercise to go after or before, or start/end.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        exercise_id: { type: 'string', enum: IDS, description: 'Exercise to move (must be in today\'s session).' },
        position: { type: 'string', enum: ['after', 'before', 'start', 'end', 'up', 'down'], description: 'up/down move one place.' },
        other_exercise_id: { type: ['string', 'null'], enum: [...IDS, null], description: 'For after/before: the session exercise it moves next to. null for start/end.' },
      },
      required: ['exercise_id', 'position', 'other_exercise_id'],
    },
  },
  {
    name: 'log_weight',
    description: 'Record today\'s body-weight weigh-in.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { pounds: { type: 'number', description: 'Body weight in pounds.' } },
      required: ['pounds'],
    },
  },
];

export function buildRequest(text, context = {}) {
  const catalog = Object.entries(EXERCISES).map(([id, e]) => `${id}: ${e.name} (${e.equip})`).join('\n');
  const today = (context.exercises || []).filter((id) => EXERCISES[id]);
  return {
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `You turn a lifter's spoken or typed note into entries in the Lean Plate workout log.
Use the tools for everything the note asks to record; call several tools if it mentions several things. Pounds are the unit. "3x8 at 135" means 3 sets of 8 reps at 135 lb. When the note names an exercise loosely, pick the closest catalog entry, preferring one already in today's session.
If the note asks for something these tools can't do (questions about progress, nutrition, editing past days), don't call a tool; reply in one short sentence saying what you can log instead.

Exercise catalog (id: name):
${catalog}`,
    messages: [{
      role: 'user',
      content: `Today's session (Day ${context.day || '?'}): ${today.length ? today.map((id) => `${id} (${EXERCISES[id].name})`).join(', ') : 'nothing yet'}\n\nNote: ${text}`,
    }],
    tools: TOOLS,
  };
}

const afterOf = (input) => (EXERCISES[input.after_exercise_id] ? { after: input.after_exercise_id } : {});

// Claude's response → { actions, note } in the app's action format.
export function toActions(response) {
  if (response.stop_reason === 'refusal') return { actions: [], note: 'Claude couldn\'t help with that one.' };
  const actions = [];
  const notes = [];
  for (const block of response.content || []) {
    if (block.type === 'text' && block.text.trim()) notes.push(block.text.trim());
    if (block.type !== 'tool_use') continue;
    const input = block.input || {};
    if (block.name === 'log_weight' && input.pounds > 50 && input.pounds < 700) {
      actions.push({ type: 'weight', lb: Math.round(input.pounds * 10) / 10 });
    } else if (block.name === 'check_sets') {
      if (input.all) actions.push({ type: 'check', all: true });
      else if (EXERCISES[input.exercise_id]) actions.push({ type: 'check', exercise: input.exercise_id });
      else if (MUSCLES[input.muscle]) actions.push({ type: 'check', muscle: input.muscle });
      else if (Number.isInteger(input.exercise_number) && input.exercise_number !== 0) actions.push({ type: 'check', index: input.exercise_number });
    } else if (block.name === 'move_exercise' && EXERCISES[input.exercise_id]) {
      const rel = input.position === 'after' || input.position === 'before';
      if (rel && EXERCISES[input.other_exercise_id]) actions.push({ type: 'move', exercise: input.exercise_id, [input.position]: input.other_exercise_id });
      else if (!rel) actions.push({ type: 'move', exercise: input.exercise_id, to: input.position });
    } else if (block.name === 'add_exercise' && EXERCISES[input.exercise_id]) {
      actions.push({ type: 'add', exercise: input.exercise_id, ...afterOf(input) });
    } else if (block.name === 'log_sets' && EXERCISES[input.exercise_id] && Array.isArray(input.sets)) {
      const sets = input.sets.slice(0, 12)
        .filter((s) => Number.isInteger(s.reps) && s.reps > 0 && s.reps <= 100)
        .map((s) => ({ r: s.reps, w: typeof s.weight_lb === 'number' && s.weight_lb >= 0 ? s.weight_lb : null }));
      if (sets.length) actions.push({ type: 'sets', exercise: input.exercise_id, sets, add: true, ...afterOf(input) });
    }
  }
  return { actions, note: notes.join(' ') };
}

export async function assist(env, { text, context }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create(buildRequest(text, context));
  return toActions(response);
}
