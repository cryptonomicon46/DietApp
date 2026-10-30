#!/usr/bin/env node
// 🔊 Can Pawmily speak with this ElevenLabs voice through the API, on the account as it is today?
// Read-only except one short test sentence (about 40 characters of your quota). It never buys,
// upgrades or changes anything, and never prints your key.
//
//   ELEVENLABS_API_KEY=… node scripts/elevenlabs-check.mjs              # lists your voices (find the clone's id)
//   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… node scripts/elevenlabs-check.mjs
//
// Tip: `read -s ELEVENLABS_API_KEY && export ELEVENLABS_API_KEY` keeps the key out of your shell history.
// Paste back everything it prints (it has no key in it). With a voice id it also saves
// elevenlabs-test.mp3 here so you can hear it.
import { writeFileSync } from 'node:fs';

const KEY = process.env.ELEVENLABS_API_KEY, VOICE = process.env.ELEVENLABS_VOICE_ID;
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io/v1'; // the base can be swapped only for testing
const MODELS = ['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2'];
if (!KEY) { console.error('Set ELEVENLABS_API_KEY first (see the top of this file).'); process.exit(2); }

const H = { 'xi-api-key': KEY, Accept: 'application/json' };
const say = (label, v) => console.log(`${label.padEnd(26)} ${v}`);
// What an error said, without anything that could echo a key.
const detail = async (r) => { const t = await r.text().catch(() => ''); try { const j = JSON.parse(t); return JSON.stringify(j.detail ?? j).slice(0, 400); } catch { return t.slice(0, 400); } };
const get = async (path) => { const r = await fetch(`${API}${path}`, { headers: H }); return { r, j: r.ok ? await r.json() : null, why: r.ok ? '' : await detail(r) }; };

console.log('— ElevenLabs API check (no key is printed) —');
const sub = await get('/user/subscription');
if (sub.r.ok) {
  const s = sub.j;
  say('plan (tier)', s.tier); say('status', s.status ?? '—');
  say('characters used / limit', `${s.character_count} / ${s.character_limit}`);
  say('instant cloning allowed', s.can_use_instant_voice_cloning); say('professional cloning', s.can_use_professional_voice_cloning);
} else say('subscription', `HTTP ${sub.r.status} ${sub.why}  (a key limited to some endpoints can't read this — fine if TTS below works)`);

if (!VOICE) {
  const v = await get('/voices');
  if (!v.r.ok) { say('voices', `HTTP ${v.r.status} ${v.why}`); process.exit(1); }
  console.log('\nYour voices (cloned ones first) — set ELEVENLABS_VOICE_ID to the clone you want and run again:');
  for (const x of [...v.j.voices].sort((a, b) => (a.category === 'cloned' ? -1 : 0) - (b.category === 'cloned' ? -1 : 0))) console.log(`  ${x.voice_id}  ${x.category?.padEnd(13) || ''} ${x.name}`);
  process.exit(0);
}

const v = await get(`/voices/${encodeURIComponent(VOICE)}`);
if (v.r.ok) { say('voice', `${v.j.name} · ${v.j.category}`); if (v.j.fine_tuning?.state) say('fine-tuning', JSON.stringify(v.j.fine_tuning.state)); }
else say('voice lookup', `HTTP ${v.r.status} ${v.why}`);

// One short sentence, trying the low-latency model first.
let verdict = '';
for (const model of MODELS) {
  const t0 = Date.now();
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: 'Hi, this is a quick test from Pawmily.', model_id: model }),
  });
  if (r.ok) {
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync('elevenlabs-test.mp3', buf);
    say(`speech (${model})`, `OK · ${buf.length} bytes in ${Date.now() - t0} ms → elevenlabs-test.mp3`);
    verdict = `API_OK (model ${model})`;
    break;
  }
  const why = await detail(r);
  say(`speech (${model})`, `HTTP ${r.status} ${why}`);
  if (!/model/i.test(why)) { verdict = r.status === 401 ? `KEY_REJECTED_OR_NO_TTS_PERMISSION: ${why}` : r.status === 404 ? `VOICE_NOT_AVAILABLE_TO_THIS_KEY: ${why}` : `REJECTED (HTTP ${r.status}): ${why}`; break; }
}
console.log(`\nVERDICT: ${verdict || 'REJECTED for every model tried'}`);
