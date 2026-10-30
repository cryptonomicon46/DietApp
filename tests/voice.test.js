// 🔊 The Pawmily voice (ElevenLabs pilot): the connector turns the words being read aloud into audio
// with the household's voice; off (501) without the key; a daily limit; nothing kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { TTS_MAX, voiceReady } from '../server/voiceTts.js';
import { spokenText } from '../family/voice.js';

test('only the words are spoken: no emoji or arrows, capped', () => {
  assert.equal(spokenText('🚗 Leave by 4:05 PM › Directions'), 'Leave by 4:05 PM Directions');
  assert.equal(spokenText('x'.repeat(2000)).length, 900);
  assert.equal(voiceReady({}), false); assert.equal(voiceReady({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }), true);
});

test('/voice/tts: signed in, 501 without the key, the words only to ElevenLabs, audio back, a daily limit, errors passed on', async () => {
  const m = new Map(), sent = [];
  const env = { DEMO: true, HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } },
    __fetch: async (url, init) => { sent.push({ url, init }); return new Response(new Uint8Array([73, 68, 51]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }); } };
  const call = async (path, token, method = 'GET', body) => familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path);
  assert.equal((await call('/voice/tts', null, 'POST', { text: 'hi' })).status, 401);
  const { data: { token } } = await call('/auth/demo', null, 'POST', { email: 'sam@example.com' });
  await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true });
  assert.equal((await call('/voice/tts', token, 'POST', { text: 'hello there' })).status, 501, 'not set up');
  assert.equal((await call('/config', null)).data.voice, false);
  Object.assign(env, { ELEVENLABS_API_KEY: 'k-test', ELEVENLABS_VOICE_ID: 'voice1', ELEVENLABS_PER_DAY: '3' });
  assert.equal((await call('/config', null)).data.voice, true);
  const before = new Set(m.keys());
  const r = await call('/voice/tts', token, 'POST', { text: '  You have book club at 6 PM.  ', name: 'Sam', calendar: ['x'] });
  assert.equal(r.status, 200); assert.deepEqual([...new Uint8Array(r.audio)], [73, 68, 51]);
  assert.match(sent[0].url, /\/v1\/text-to-speech\/voice1\?output_format=mp3_44100_64$/);
  assert.equal(sent[0].init.headers['xi-api-key'], 'k-test');
  assert.deepEqual(JSON.parse(sent[0].init.body), { text: 'You have book club at 6 PM.', model_id: 'eleven_flash_v2_5' }, 'only the words (and the model)');
  assert.ok([...m.keys()].filter((k) => !before.has(k)).every((k) => /^v2:rate:/.test(k)), 'nothing kept but the counter');
  assert.equal((await call('/voice/tts', token, 'POST', { text: ' ' })).status, 400);
  assert.equal(JSON.parse((await call('/voice/tts', token, 'POST', { text: 'y'.repeat(TTS_MAX + 50) })) && sent.at(-1).init.body).text.length, TTS_MAX);
  await call('/voice/tts', token, 'POST', { text: 'three' });
  assert.equal((await call('/voice/tts', token, 'POST', { text: 'four' })).status, 429, 'the daily limit');
  env.__fetch = async () => new Response(JSON.stringify({ detail: { status: 'voice_not_found', message: 'A voice with that id was not found.' } }), { status: 404 });
  m.clear();
  const { data: { token: t2 } } = await call('/auth/demo', null, 'POST', { email: 'pat@example.com' });
  await call('/account/consent', t2, 'POST', { version: TERMS_VERSION, age13: true });
  const bad = await call('/voice/tts', t2, 'POST', { text: 'hello' });
  assert.equal(bad.status, 502); assert.match(bad.data.error, /ElevenLabs: A voice with that id was not found/);
});
