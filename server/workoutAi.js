// 💬📷 Reading a workout with Claude: typed words ("Describe it") or one photo/screenshot ("From a
// photo") → the one workout model (js/workout.js), with whatever Claude wasn't sure of marked to
// check. Only what the gateway let through arrives here: the words or the image, and the weight unit.
// Nothing is saved — the phone shows "Review Workout" and the person adds it themselves.
import { normalize } from '../js/workout.js';

const n = { type: ['number', 'null'] };
const UNSURE = { type: 'array', items: { type: 'string', enum: ['reps', 'weight', 'time', 'distance'] } };
const SET = {
  type: 'object', additionalProperties: false,
  required: ['reps', 'weight', 'unit', 'bodyweight', 'seconds', 'distance', 'distance_unit', 'unsure'],
  properties: { reps: n, weight: n, unit: { type: 'string', enum: ['lb', 'kg'] }, bodyweight: { type: 'boolean' }, seconds: n, distance: n, distance_unit: { type: 'string', enum: ['mi', 'km', 'm'] }, unsure: UNSURE },
};
const ITEM = { type: 'object', additionalProperties: false, required: ['name', 'name_unsure', 'sets'], properties: { name: { type: 'string' }, name_unsure: { type: 'boolean' }, sets: { type: 'array', items: SET } } };
const BLOCK = { type: 'object', additionalProperties: false, required: ['kind', 'rounds', 'rounds_unsure', 'items'], properties: { kind: { type: 'string', enum: ['straight', 'superset', 'circuit'] }, rounds: n, rounds_unsure: { type: 'boolean' }, items: { type: 'array', items: ITEM } } };
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'blocks', 'unread'],
  properties: { title: { type: 'string' }, blocks: { type: 'array', items: BLOCK }, unread: { type: 'array', items: { type: 'string' } } },
};

export const INSTRUCTIONS = (unit, photo) => `Read this workout ${photo ? 'from the photo (it may be handwriting, a whiteboard or a screenshot)' : 'from what the person typed'} and write it out as the JSON asked for.
- One block per straight-set exercise, superset (2 exercises done back to back) or circuit (3 or more). "rounds" is how many times the block is done; each exercise has one entry in "sets" per round, in order.
- Copy numbers exactly as written: 12/12/11/11 reps over 4 rounds is four sets with those reps. A weight written once applies to every set it was written for.
- Never invent. If a number wasn't given, leave it null and add the field to "unsure"; if you can't read a number or a name clearly, give your best reading and mark it unsure (name_unsure, rounds_unsure). Bodyweight moves (push-ups, planks…) have bodyweight true and weight null.
- Weights are in ${unit === 'kg' ? 'kg' : 'lb'} unless written otherwise. Times go in "seconds".
- Anything you couldn't place (a note, a word you can't read) goes in "unread", in a few words. Ignore anything that isn't the workout.${photo ? ' Don\'t describe people, places or anything else in the photo.' : ''}`;

// Claude's answer → the workout model, its unsure marks kept.
export function toWorkout(j, { source, today = '' }) {
  const blocks = (Array.isArray(j?.blocks) ? j.blocks : []).map((b) => ({
    kind: b.kind, rounds: b.rounds, uncertain: b.rounds_unsure ? ['rounds'] : [],
    items: (b.items || []).map((it) => ({
      name: it.name, uncertain: it.name_unsure ? ['name'] : [],
      sets: (it.sets || []).map((s) => ({ reps: s.reps, weight: s.bodyweight ? null : s.weight, unit: s.unit, bw: !!s.bodyweight, time: s.seconds, distance: s.distance, distUnit: s.distance_unit, uncertain: s.unsure })),
    })),
  }));
  const w = normalize({ title: String(j?.title || '').trim() || 'Workout', date: today, source, blocks });
  // A null rep count on a lift is something to check even if Claude didn't say so.
  for (const b of w.blocks) for (const it of b.items) for (const s of it.sets) {
    const need = [];
    if (s.reps == null && s.time == null && s.distance == null) need.push('reps');
    if (s.weight == null && !s.bw && s.time == null && s.distance == null) need.push('weight');
    const u = [...new Set([...(s.uncertain || []), ...need])];
    if (u.length) s.uncertain = u;
  }
  return { workout: w, unread: (Array.isArray(j?.unread) ? j.unread : []).map((x) => String(x).slice(0, 120)).filter(Boolean).slice(0, 10) };
}

// One Claude call with only the gateway's payload. `client` is the Anthropic SDK client.
export async function readWorkout(client, payload, { model = 'claude-sonnet-5-5', today = '' } = {}) {
  const photo = !!payload.image;
  const content = photo
    ? [{ type: 'image', source: { type: 'base64', media_type: payload.mime, data: payload.image } }, { type: 'text', text: INSTRUCTIONS(payload.unit, true) }]
    : [{ type: 'text', text: `${INSTRUCTIONS(payload.unit, false)}\n\n<workout>\n${payload.text}\n</workout>` }];
  // Reading a photo gets a little more thought (handwriting); typed words need little.
  const res = await client.messages.create({ model, max_tokens: 12000, output_config: { effort: photo ? 'medium' : 'low', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content }] });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let j;
  try { j = JSON.parse(text); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
  return toWorkout(j, { source: photo ? 'photo' : 'text', today });
}
