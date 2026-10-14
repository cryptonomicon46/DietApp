import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, toActions, TOOLS, MODEL } from '../server/assistant.js';

test('request: model, fallbacks, strict tools, session context', () => {
  const r = buildRequest('did bulgarians after squats', { exercises: ['backSquat'], day: 'A' });
  assert.equal(r.model, MODEL);
  assert.equal(r.fallbacks, 'default');
  assert.deepEqual(r.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(r.tool_choice, undefined, 'tool use stays automatic');
  assert.ok(TOOLS.every((t) => t.strict && t.input_schema.additionalProperties === false));
  assert.match(r.messages[0].content, /backSquat \(Barbell back squat\)/);
  assert.match(r.system, /splitSquat: Bulgarian split squat/);
});

test('response → app actions', () => {
  const { actions, note } = toActions({
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Logged it.' },
      { type: 'tool_use', name: 'log_sets', input: { exercise_id: 'splitSquat', after_exercise_id: 'backSquat', sets: [{ reps: 10, weight_lb: 40 }, { reps: 8, weight_lb: null }] } },
      { type: 'tool_use', name: 'add_exercise', input: { exercise_id: 'legCurlNope' } },
      { type: 'tool_use', name: 'move_exercise', input: { exercise_id: 'bbRow', position: 'after', other_exercise_id: 'backSquat' } },
      { type: 'tool_use', name: 'log_weight', input: { pounds: 160.84 } },
    ],
  });
  assert.deepEqual(actions, [
    { type: 'sets', exercise: 'splitSquat', sets: [{ r: 10, w: 40 }, { r: 8, w: null }], add: true, after: 'backSquat' },
    { type: 'move', exercise: 'bbRow', after: 'backSquat' },
    { type: 'weight', lb: 160.8 },
  ]);
  assert.equal(note, 'Logged it.');
  assert.deepEqual(toActions({ stop_reason: 'refusal', content: [] }).actions, []);
});
