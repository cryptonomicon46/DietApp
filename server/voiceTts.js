// 🔊 The Pawmily voice (pilot): Talk's answer text → speech in the household's chosen ElevenLabs voice.
// The connector holds the key (ELEVENLABS_API_KEY) and the voice (ELEVENLABS_VOICE_ID); the phone
// sends only the words it's about to read aloud, and gets audio back. Nothing is kept here but a
// daily counter. Without the key the route answers 501 and the phone uses its own voice instead
// (family/voice.js). The voice provider never decides anything — it only speaks text Talk already has.
export const TTS_MAX = 600;
export const TTS_PER_DAY = 30;
export const voiceReady = (env) => !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID);

export async function ttsRoutes({ path, method, env, json, body, user, underLimit, db }) {
  if (path !== '/voice/tts' || method !== 'POST') return null;
  if (!voiceReady(env)) return json({ error: "the Pawmily voice isn't set up on the connector", off: true }, 501);
  const text = String(body?.text || '').replace(/\s+/g, ' ').trim().slice(0, TTS_MAX);
  if (text.length < 2) return json({ error: 'nothing to say' }, 400);
  const perDay = Math.max(1, Math.min(500, +env.ELEVENLABS_PER_DAY || TTS_PER_DAY));
  if (!(await underLimit(db, `rate:${user.uid}:tts:${new Date().toISOString().slice(0, 10)}`, perDay, 86400 * 2))) return json({ error: "that's all the spoken answers for today" }, 429);
  const r = await (env.__fetch || fetch)(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let why = t.slice(0, 160);
    try { const j = JSON.parse(t); why = String(j.detail?.message || j.detail?.status || j.message || why).slice(0, 160); } catch { /* plain text */ }
    return json({ error: `ElevenLabs: ${why || r.status}` }, 502);
  }
  return { status: 200, audio: await r.arrayBuffer() };
}
