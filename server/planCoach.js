// 💬 "Ask about my plan" with Claude. Only what the gateway let through arrives here: the plan's
// numbers (js/planCoach.js cleanFacts), the person's question and earlier turns of the same chat.
// Claude explains and suggests; it can't change anything. A suggested change to calories, macros
// or the phase is flagged so the phone offers the weekly check-in, where the person approves (or
// not) — nothing here writes anything, and nothing is kept.
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'suggests_target_change'],
  properties: { answer: { type: 'string' }, suggests_target_change: { type: 'boolean' } },
};

export const SYSTEM = `You answer questions about one person's diet plan inside a household app. You get only their plan's numbers and their question.
- Explain and suggest. You cannot change anything: not calorie targets, macros, the plan's phase, weight, meals, workouts or logs. Never say you changed or saved something.
- If a change to calories, macros or the phase would help, say what you'd consider and that their weekly check-in is where they can approve a change (set suggests_target_change to true). Otherwise false.
- Weight trends are estimates: day-to-day weight moves with water, salt and food. When the data is thin (few weigh-ins, under about two weeks, status too-early), say it's too early to tell rather than projecting. Word any projection as an estimate.
- trendLbPerWeek and plannedLbPerWeek are positive when losing and negative when gaining. Null means unknown — don't guess it.
- Be calm and encouraging, never shaming. No medical diagnosis; for medical questions (medications, pregnancy, eating disorders, health conditions) suggest asking a doctor or dietitian.
- Plain sentences, under 120 words, no headings or tables.`;

const turnText = (t) => `<earlier_question>\n${t.q}\n</earlier_question>\n<earlier_answer>\n${t.a}\n</earlier_answer>`;

// One Claude call with only the gateway's payload. `client` is the Anthropic SDK client.
export async function askPlan(client, payload, { model = 'claude-sonnet-5-5' } = {}) {
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  const text = `<plan>\n${JSON.stringify(payload.facts)}\n</plan>\n${turns.map(turnText).join('\n')}\n<question>\n${payload.question}\n</question>`;
  const res = await client.messages.create({
    model, max_tokens: 2000, system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  let j;
  try { j = JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
  const answer = String(j?.answer || '').trim().slice(0, 1500);
  if (!answer) throw Object.assign(new Error('empty answer'), { status: 502 });
  return { answer, checkin: !!j.suggests_target_change };
}
