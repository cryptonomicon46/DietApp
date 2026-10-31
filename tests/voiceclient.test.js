// 🔊 Pawmily Voice on the phone: the provider can be replaced or switched off and Talk still reads the
// answer — disabled, error, quota, missing key, revoked voice, family switch off → the phone's voice.
// The cloud provider sends only { fid, text, ticket } or { fid, phrase }, and replays without re-asking.
import test from 'node:test';
import assert from 'node:assert/strict';

// A pretend browser: an on-device voice that records what it says, an audio player, no DOM.
const said = [];
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.speechSynthesis = { speak: (u) => said.push(u.text), cancel() {}, getVoices: () => [{ lang: 'en-US', name: 'Online', localService: false }, { lang: 'en-US', name: 'Samantha', localService: true }] };
const played = [];
globalThis.Audio = class { play() { played.push(this.src); return Promise.resolve(); } pause() {} };
let n = 0;
URL.createObjectURL = () => `blob:${++n}`; URL.revokeObjectURL = () => {};

const T = await import('../family/talk.js');
const { cloudVoiceOutput } = await import('../family/voiceCloud.js');
const { browserVoiceOutput } = await import('../family/voice.js');

function ctx({ cloudOn = true, choice = 'cloud', speakOn = 'on', provider = null } = {}) {
  const store = { 'fam.talk.voiceOut': choice, 'fam.talk.speak': speakOn };
  const c = { LS: { get: (k) => store[k] ?? null, set: (k, v) => { store[k] = v; } }, cloudOn: () => cloudOn, loads: 0,
    cloudVoice: async () => { c.loads++; return provider; }, vprefs: () => ({ cats: { confirmations: true } }) };
  T.init(c);
  return c;
}
const fake = (ok) => ({ calls: [], stop() {}, async speak(item) { this.calls.push(item); return ok; } });
const ANSWER = 'You have book club at 6 PM. [It is also 62°F.]';
const TICKET = { text: 'It will be 62°F at 2 PM.', ticket: 'abc.def' };

test('the on-device voice prefers voices that run on the phone', () => {
  said.length = 0;
  browserVoiceOutput.speak('Hello');
  assert.deepEqual(said, ['Hello']);
});

test('cloud on, chosen, speakable → the cloud provider speaks the ticketed sentence (not the full answer)', async () => {
  const p = fake(true), c = ctx({ provider: p }); said.length = 0;
  assert.equal(await T.speak(ANSWER, { always: true, cloud: TICKET }), 'cloud');
  assert.deepEqual(p.calls, [TICKET]); assert.equal(said.length, 0); assert.equal(c.loads, 1);
});

for (const [name, opts, why] of [
  ['family switch off (cloudVoiceEnabled=false)', { cloudOn: false }, 'global disabled'],
  ['missing key (the connector reports no voice)', { cloudOn: false }, 'missing key'],
  ['you chose the phone voice', { choice: 'device' }, 'device chosen'],
]) {
  test(`provider replaced: ${name} → the phone reads the whole answer; the cloud provider is never loaded`, async () => {
    const p = fake(true), c = ctx({ ...opts, provider: p }); said.length = 0;
    assert.equal(await T.speak(ANSWER, { always: true, cloud: TICKET }), 'device', why);
    assert.deepEqual(said, [ANSWER]); assert.equal(c.loads, 0); assert.equal(p.calls.length, 0);
  });
}

for (const name of ['an ElevenLabs error', 'quota or budget exhausted', 'the cloned voice revoked', 'the ticket refused']) {
  test(`provider fails (${name}) → the phone reads the answer instead; nothing lost`, async () => {
    const p = fake(false); ctx({ provider: p }); said.length = 0;
    assert.equal(await T.speak(ANSWER, { always: true, cloud: TICKET }), 'device');
    assert.equal(p.calls.length, 1); assert.deepEqual(said, [ANSWER]);
  });
}

test('no ticket (private answer) → the phone; reading aloud off and not asked → nobody speaks', async () => {
  const p = fake(true), c = ctx({ provider: p }); said.length = 0;
  assert.equal(await T.speak(ANSWER, { always: true, cloud: null }), 'device');
  assert.equal(c.loads, 0);
  ctx({ speakOn: '', provider: p }); said.length = 0;
  assert.equal(await T.speak(ANSWER), 'none'); assert.equal(said.length, 0);
});

test('the cloud provider: POST only, only the ticketed sentence or a phrase, fallback message passed on, replay without a new request', async () => {
  const sent = [], fallbacks = [];
  let reply = () => new Response(new Uint8Array([1, 2]), { status: 200 });
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return reply(); };
  const v = cloudVoiceOutput({ base: () => 'https://c.test', token: () => 'tok', fid: () => 'fam1', onFallback: (m) => fallbacks.push(m) });
  assert.equal(await v.speak({ text: 'only text' }), false, 'no ticket, no request');
  assert.equal(sent.length, 0);
  assert.equal(await v.speak(TICKET), true);
  assert.equal(sent[0].url, 'https://c.test/v2/voice/tts'); assert.equal(sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(sent[0].init.body), { fid: 'fam1', ...TICKET });
  assert.equal(await v.speak(TICKET), true, 'replayed from memory');
  assert.equal(sent.length, 1, 'a one-time ticket is never sent twice');
  await v.speak({ phrase: 'confirm.one' });
  assert.deepEqual(JSON.parse(sent[1].init.body), { fid: 'fam1', phrase: 'confirm.one' });
  reply = () => Response.json({ error: 'Using device voice for now.', fallback: true }, { status: 503 });
  assert.equal(await v.speak({ text: 'x', ticket: 'y.z' }), false);
  assert.deepEqual(fallbacks, ['Using device voice for now.']);
  reply = () => { throw new Error('offline'); };
  assert.equal(await v.speak({ text: 'x2', ticket: 'y.z2' }), false, 'offline → the phone');
});
