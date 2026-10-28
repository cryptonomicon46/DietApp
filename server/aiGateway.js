// 🤖 The AI privacy gateway (2.0 Phase 8). Every request to an AI provider goes through here and:
//   1. names its purpose — only purposes listed below exist;
//   2. sends only that purpose's allowed fields, each capped in size (anything else is dropped);
//   3. goes only to that purpose's provider — personal content never goes to a free tier that may
//      train on it (Gemini's free tier), and family keys never leave the phone at all;
//   4. leaves an audit line: purpose, provider, the allowed field names and their sizes, how many
//      other fields were dropped, how long it took and whether it worked — never the values.
// What each purpose may carry is the whole contract; the prompts live with the features.
export const PURPOSES = {
  // 💬 "Describe it": the words someone typed about their workout (and their weight unit).
  'workout.text': { provider: 'anthropic', payload: 'personal-text', fields: { text: 1500, unit: 4 }, perDay: 40 },
  // 📷 "From a photo": one re-encoded image (no location or camera data) and the weight unit.
  'workout.photo': { provider: 'anthropic', payload: 'personal-image', fields: { image: 3_500_000, mime: 16, unit: 4 }, perDay: 20 },
  // 🧭 Plan an outing / ⇄ swap a stop: what was typed, the day, chips and what you've liked — never
  // names or history. (The family's home town is added by the feature; it isn't a person's data.)
  'outing.plan': { provider: 'anthropic', payload: 'personal-text', fields: { text: 400, day: 10, chips: 600, taste: 400 }, perDay: 20 },
  'outing.swap': { provider: 'anthropic', payload: 'personal-text', fields: { area: 200, day: 10, time: 5, kind: 20, cuisine: 40, avoid: 200, taste: 400 }, perDay: 60 },
  // ✍️ Tidy rough notes for a thread (the person pressed the button on their own words).
  'thread.tidy': { provider: 'anthropic', payload: 'personal-text', fields: { text: 8000 }, perDay: 20 },
  // 🤖 A tracker command ("bench 3 sets of 8 at 135") and which exercises are on today's session.
  'tracker.command': { provider: 'anthropic', payload: 'personal-text', fields: { text: 500, context: 2000 }, perDay: 150 },
  // ❓ The help chat: the last few messages in the help window (its own rate limits apply).
  'help.chat': { provider: 'anthropic', payload: 'personal-text', fields: { messages: 32000 }, perDay: 200 },
  // 🎲 Bingo squares for a show: just the show's title.
  'bingo.squares': { provider: 'anthropic', payload: 'public', fields: { show: 80 }, perDay: 10 },
};
// Providers each kind of payload may go to.
const ALLOWED = { 'personal-text': ['anthropic'], 'personal-image': ['anthropic'], public: ['anthropic', 'gemini'] };

export class GatewayError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

// The allowed fields only, each cut to its cap; `dropped` names what was left out.
export function minimize(purpose, input = {}) {
  const p = PURPOSES[purpose];
  if (!p) throw new GatewayError(`unknown AI purpose: ${purpose}`, 500);
  const payload = {}, sizes = {}, dropped = [];
  for (const [k, v] of Object.entries(input || {})) {
    if (!(k in p.fields)) { dropped.push(k); continue; }
    if (v == null || v === '') continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.length > p.fields[k]) throw new GatewayError(`${k} is too long for ${purpose}`, 413);
    payload[k] = v; sizes[k] = s.length;
  }
  return { payload, sizes, dropped };
}

// Audit lines: one record per call (kept 30 days) — no shared list to race on or outgrow.
export async function audit(db, line) {
  if (!db) return;
  const day = new Date(line.at).toISOString().slice(0, 10);
  await db.put(`aiaudit:${day}:${line.at.toString(36)}${Math.random().toString(36).slice(2, 8)}`, line, 30 * 86400);
}

// The one way to call an AI provider. `run(payload, provider)` does the provider call with only
// the minimized payload; whatever it returns comes back. `who` is an account id for the daily cap
// (a count only — it isn't in the audit line).
export async function aiCall({ db, purpose, input, provider, who, underLimit, now = Date.now() }, run) {
  const p = PURPOSES[purpose];
  if (!p) throw new GatewayError(`unknown AI purpose: ${purpose}`, 500);
  const to = provider || p.provider;
  if (to !== p.provider || !ALLOWED[p.payload].includes(to)) throw new GatewayError(`${purpose} can't go to ${to}`, 500);
  const { payload, sizes, dropped } = minimize(purpose, input);
  if (who && underLimit && !(await underLimit(db, `ai:${purpose}:${who}:${new Date(now).toISOString().slice(0, 10)}`, p.perDay, 86400))) throw new GatewayError("that's a lot for one day — try again tomorrow", 429);
  // Dropped fields are only counted: their names come from the caller and could carry text.
  const line = { at: now, purpose, provider: to, payload: p.payload, fields: Object.keys(payload), sizes, ...(dropped.length ? { dropped: dropped.length } : {}) };
  const t0 = Date.now();
  try {
    const out = await run(payload, to);
    await audit(db, { ...line, ok: true, ms: Date.now() - t0 }).catch(() => {});
    return out;
  } catch (e) {
    await audit(db, { ...line, ok: false, ms: Date.now() - t0, error: String(e?.status || e?.name || 'error').slice(0, 40) }).catch(() => {});
    throw e;
  }
}
