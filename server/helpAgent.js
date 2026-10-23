// The in-app help assistant: answers questions about OurPawmily from the guide and, for someone
// who's signed in, can look at their own account, resend an invite, sign out their other devices
// and file a problem for the maintainer. Every tool acts only on the person asking — the route in
// family.js decides what `run` can touch.
//
// Needs the ANTHROPIC_API_KEY secret; without it (and in the on-phone demo) offlineAnswer() answers
// from the guide instead.
import { GUIDE, GUIDE_TEXT, guideMatch } from './helpGuide.js';

export const HELP_MODEL = 'claude-opus-5-5';
const MAX_STEPS = 6;

const REPORT = {
  name: 'report_problem',
  description: 'File a problem for the app\'s maintainer: a bug or glitch, a sign-in problem you couldn\'t solve, data that looks wrong or missing, or a feature request. Only after the troubleshooting steps didn\'t help, or when the person asks to report it. Summarize in your own words; never include passwords or codes.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: { type: 'string', enum: ['sign-in', 'invite', 'data', 'bug', 'feature', 'other'] },
      summary: { type: 'string', description: 'One line, under 100 characters.' },
      details: { type: 'string', description: 'What they were doing, what they expected, what happened, what was already tried.' },
      contact_email: { type: ['string', 'null'], description: 'For someone who isn\'t signed in: an email the maintainer can reply to, if they gave one. null otherwise.' },
    },
    required: ['category', 'summary', 'details', 'contact_email'],
  },
};
const NONE = { type: 'object', additionalProperties: false, properties: {}, required: [] };

export const ACCOUNT_TOOLS = [
  { name: 'get_my_account', description: 'The signed-in person\'s account: name, Google email, how many devices are signed in, whether they accepted the terms, how many families and blocked people.', strict: true, input_schema: NONE },
  { name: 'list_my_families', description: 'The families the signed-in person is in: their role, which sections are on, and each member\'s name, kind, relation and status (active = joined, invited = invite sent but not accepted, managed = no account, e.g. a young child). Member ids are for resend_invite.', strict: true, input_schema: NONE },
  {
    name: 'resend_invite',
    description: 'Make a fresh invite link for someone in one of the person\'s families who hasn\'t joined yet (status invited). Use when their invite expired, was lost, or went to the wrong address. Give the link back to the person to share.',
    strict: true,
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        family_id: { type: 'string' },
        member_id: { type: 'string' },
        email: { type: ['string', 'null'], description: 'A corrected Google email for them, if the person gave one. null to keep the one on file.' },
      },
      required: ['family_id', 'member_id', 'email'],
    },
  },
  {
    name: 'sign_out_other_devices',
    description: 'Sign the person out everywhere except this device — for a lost phone or a sign-in they don\'t recognise. Ask them first; call with confirmed true only after they said yes in this conversation.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, properties: { confirmed: { type: 'boolean' } }, required: ['confirmed'] },
  },
  REPORT,
];
export const GUEST_TOOLS = [REPORT];

export function helpSystem({ signedIn, name = '', supportEmail = '' }) {
  return `You are the help desk inside OurPawmily, a private family app (families, people, kids and pets, a family feed, chores with a monthly Gold Card, asking for help) that sits alongside the OurPawmily diet & fitness trackers. You help people use it and fix account problems.

How to answer:
- Short, warm and practical: a sentence or two, or a few numbered steps naming the exact tabs and buttons from the guide. Phone screen, so no long essays or tables.
- Answer only from the guide below and what your tools return. If the guide doesn't cover it, say so and offer to pass it to the maintainer.
- There are no app passwords: sign-in is with Google. For a forgotten password or a locked Google account, point to Google's account recovery link. Never ask for passwords, sign-in codes, invite codes or household codes.
- You can't see or change anyone else's account, read someone's posts or diet data, or delete anything. For deleting an account or a family, explain where the button is.
- For a glitch: suggest the guide's quick fixes first; if they don't help, file it with report_problem and tell them it was sent.
${signedIn ? `- ${name ? `You're talking with ${name}, who is` : 'The person is'} signed in. Use the tools to check their account or families before guessing, e.g. when an invite isn't working.`
    : `- The person is NOT signed in, so you can't look anything up. You can still file a problem${supportEmail ? `, and they can email ${supportEmail}` : ''}; ask for an email the maintainer can reply to before filing.`}

# Guide
${GUIDE_TEXT}`;
}

// Turns the chat the phone sends ([{role, text}]) into API messages: user first, roles alternating,
// the last 12 turns, each capped.
export function toMessages(history) {
  const out = [];
  for (const m of (Array.isArray(history) ? history : []).slice(-12)) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m?.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 2000);
    if (!text) continue;
    if (!out.length && role === 'assistant') continue;
    if (out.length && out.at(-1).role === role) out.at(-1).content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  return out.at(-1)?.role === 'user' ? out : [];
}

const textOf = (res) => (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

// The agent loop: ask Claude, run the tools it calls, hand back the results, until it answers.
// run(name, input) does the work and returns a JSON-able result ({error} for a failure).
export async function runHelpAgent({ client, system, messages, tools, run, maxSteps = MAX_STEPS }) {
  const convo = [...messages];
  const used = [];
  let last = '';
  for (let step = 0; step < maxSteps; step++) {
    const res = await client.beta.messages.create({
      model: HELP_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: convo,
    });
    if (res.stop_reason === 'refusal') return { reply: 'Sorry — I can\'t help with that one. Ask me about families, invites, the feed, chores or the diet app.', used };
    last = textOf(res) || last;
    convo.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use') return { reply: last || 'Sorry, I lost my train of thought — could you ask that again?', used };
    const results = [];
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue;
      let out;
      try { out = await run(b.name, b.input || {}); } catch (err) { out = { error: err.message }; }
      used.push(b.name);
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out ?? {}), ...(out?.error ? { is_error: true } : {}) });
    }
    convo.push({ role: 'user', content: results });
  }
  return { reply: last || 'That took more steps than I can manage here — I can file it for the maintainer if you like.', used };
}

// Without Claude: the closest guide sections.
export function offlineAnswer(question, { supportEmail = '' } = {}) {
  const hits = guideMatch(question, 2);
  if (!hits.length) {
    return { reply: `I can help with: ${GUIDE.map((s) => s.title).join(' · ')}. Try asking about one of those${supportEmail ? `, or email ${supportEmail}` : ''} — or tap 📮 Report a problem.`, offline: true };
  }
  return { reply: hits.map((s) => `**${s.title}**\n${s.text}`).join('\n\n'), topics: hits.map((s) => s.id), offline: true };
}
