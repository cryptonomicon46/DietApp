// 🔎 Web search for public lookups (rescue news, the weekly date scout, the places part of an
// outing): Gemini with Google Search when GEMINI_API_KEY is set — free within Google's daily
// allowance — else, or if it fails, Claude with web search. Only public questions come here
// (places, dates, rescue names); anything with your own words or taste goes to Claude.

import { askClaude } from './scout.js';

const day = () => new Date().toISOString().slice(0, 10);
async function count(db, provider) {
  if (!db) return;
  const key = `searchruns:${day().slice(0, 7)}`;
  const n = (await db.get(key)) || {};
  const d = day();
  n[d] = { ...(n[d] || {}), [provider]: (n[d]?.[provider] || 0) + 1 };
  await db.put(key, n, 62 * 86400);
}

export async function askGemini(env, prompt, { search = true } = {}) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await (env.__fetch || fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], ...(search ? { tools: [{ google_search: {} }] } : {}) }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
  if (!text) throw new Error('gemini: empty answer');
  return { text, usage: { provider: 'gemini', model, input: j.usageMetadata?.promptTokenCount || 0, output: j.usageMetadata?.candidatesTokenCount || 0, searches: search ? 1 : 0 } };
}

// Gemini first (free), Claude as the backup. opts: { city, maxUses, maxTokens, model, search, db, claudeOnly }.
export async function askSearch(env, prompt, opts = {}) {
  if (env.GEMINI_API_KEY && !opts.claudeOnly) {
    try { const r = await askGemini(env, prompt, { search: opts.search !== false }); await count(opts.db, 'gemini').catch(() => {}); return r; } catch (e) { if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) throw e; }
  }
  if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) throw new Error('no search provider (GEMINI_API_KEY or ANTHROPIC_API_KEY)');
  const r = await askClaude(env, prompt, opts);
  await count(opts.db, 'claude').catch(() => {});
  return { ...r, usage: { provider: 'claude', ...r.usage } };
}
export const searchReady = (env) => !!(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY || env.__anthropic);
