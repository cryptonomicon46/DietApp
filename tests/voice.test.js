// 🔊 Pawmily Voice (Phase 1) on the connector: optional (master switch, cost switch, missing key),
// speakable tickets bound to the exact text and checked again when the audio is made, owners'
// consent, the voice owner's consent, and nothing in the logs. ElevenLabs is stubbed (env.__fetch),
// Claude too (env.__anthropic); spec point 33's matrix is marked [33.n].
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION } from '../server/family.js';
import { voiceReady, providerConfigured, makeTicket, textHash, TICKET_TTL } from '../server/voiceTts.js';
import { POLICY_VERSION, CATEGORIES } from '../js/voicePolicy.js';
import { spokenText } from '../family/voice.js';

const KEY = 'k-test-SECRET';
// Fresh accounts per test (the connector's per-minute counters are kept in memory by account).
let run = 0;
async function setup(extra = {}) {
  const n = ++run, mail = (w) => `${w}${n}@example.com`;
  if (extra.ELEVENLABS_VOICE_OWNER_EMAIL === 'sam') extra = { ...extra, ELEVENLABS_VOICE_OWNER_EMAIL: mail('sam') };
  const m = new Map(), eleven = [], claudeAsks = [];
  const S = { spoken: 'It will be 62°F and dry at 2 PM.', fail: null, throwSpoken: false };
  const client = { messages: { create: async (req) => {
    const spoken = !!req.output_config?.format?.schema?.properties?.spoken;
    claudeAsks.push({ spoken, text: JSON.stringify(req.messages) });
    if (spoken && S.throwSpoken) throw new Error('boom');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(spoken ? { spoken: S.spoken } : { answer: 'Book club at 6 PM. 62°F and dry at 2 PM. [partner] has the dentist at 9.', suggestions: [] }) }] };
  } } };
  const env = { DEMO: true, __anthropic: client, ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: 'voice1', HOUSEHOLD: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } },
    __fetch: async (url, init) => { eleven.push({ url: String(url), init }); if (S.fail) return S.fail(); return new Response(new Uint8Array([73, 68, 51]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }); }, ...extra };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path); return { status: r.status, audio: r.audio, ...(r.data || {}) }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const t = { sam: await signIn(mail('sam')), pat: await signIn(mail('pat')), out: await signIn(mail('out')) };
  const { family: f } = await call('/families', t.sam, 'POST', { name: 'Fam' });
  const id = { sam: f.members[0].id };
  const add = await call(`/families/${f.fid}/members`, t.sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: mail('pat') });
  id.pat = add.member.id;
  const inv = await call(`/families/${f.fid}/invites`, t.sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, t.pat, 'POST');
  const F = `/families/${f.fid}`;
  const allow = (tok, ...cats) => call(`${F}/voice/prefs`, tok, 'PUT', { prefs: { cats: Object.fromEntries(cats.map((c) => [c, true])) } });
  const W = { d: 'weather', o: 'public', v: { time: '14:00', f: 62, rain: 0 } };
  const CAL = (o, title = 'Book club') => ({ d: 'calendar', o, v: { date: '2026-11-01', time: '18:00', title } });
  const H = () => ({ d: 'health', o: id.sam, v: { recovery: { score: 63 } } });
  const day = (tok, facts) => call('/ai/talk/day', tok, 'POST', { text: "What's my day like?", today: '2026-11-01', now: '10:00', context: '{"days":[]}', fid: f.fid, voice: { facts } });
  return { m, env, S, eleven, claudeAsks, call, t, id, F, fid: f.fid, allow, W, CAL, H, day };
}
// Everything printed while a test runs (console.*): no text, tickets, audio or keys may reach the logs.
function captureLogs() {
  const out = [], keep = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { keep[k] = console[k]; console[k] = (...a) => { out.push(a.map(String).join(' ')); }; }
  return { out, restore: () => Object.assign(console, keep) };
}

test('only the words are spoken: no emoji or arrows, capped; ready needs the key AND a voice; CLOUD_VOICE=off kills it', () => {
  assert.equal(spokenText('🚗 Leave by 4:05 PM › Directions'), 'Leave by 4:05 PM Directions');
  assert.equal(voiceReady({}), false); assert.equal(voiceReady({ ELEVENLABS_API_KEY: 'k' }), false);
  assert.equal(providerConfigured({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }), true);
  assert.equal(providerConfigured({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v', CLOUD_VOICE: 'off' }), false);
});

test('ACCEPTANCE — cloud voice OFF (the default): Talk still answers, no summary, no ticket, no ElevenLabs call', async () => {
  const s = await setup();
  await s.allow(s.t.sam, ...CATEGORIES);
  const st = await s.call(`${s.F}/voice`, s.t.sam);
  assert.equal(st.ready, false); assert.equal(st.admin.cloud, false, 'the family switch starts OFF'); assert.equal(st.admin.configured, true);
  const r = await s.day(s.t.sam, [s.W]);
  assert.equal(r.status, 200); assert.match(r.answer, /Book club/);
  assert.equal(r.spoken, null); assert.equal(r.voicePrivate, 'off');
  assert.equal(s.claudeAsks.filter((x) => x.spoken).length, 0, 'no spoken summary is even written');
  const p = await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' });
  assert.equal(p.status, 503); assert.equal(p.fallback, true); assert.equal(p.error, 'Using device voice for now.');
  assert.equal(s.eleven.length, 0, 'no ElevenLabs network call');
  assert.ok(![...s.m.keys()].some((k) => /ttsn:|ttschars:/.test(k)), 'no ticket used, nothing counted');
});

test('missing key / CLOUD_VOICE=off: safe — Talk answers, /config says no voice, /voice/tts 501, no call', async () => {
  for (const extra of [{ ELEVENLABS_API_KEY: '' }, { CLOUD_VOICE: 'off' }]) {
    const s = await setup(extra);
    assert.equal((await s.call('/config', null)).voice, false);
    assert.equal((await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true })).status, 200);
    await s.allow(s.t.sam, 'weather');
    const r = await s.day(s.t.sam, [s.W]);
    assert.equal(r.status, 200); assert.equal(r.spoken, null); assert.equal(r.voicePrivate, 'off');
    if (extra.ELEVENLABS_API_KEY === '') assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 501);
    else assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 503);
    assert.equal(s.eleven.length, 0);
  }
});

test('the master switch: only the family creator; it wins over member settings; members see it', async () => {
  const s = await setup();
  assert.equal((await s.call(`${s.F}/voice/admin`, s.t.pat, 'PUT', { cloud: true })).status, 403);
  assert.equal((await s.call(`${s.F}/voice/admin`, s.t.out, 'PUT', { cloud: true })).status, 404, 'not in the family');
  assert.equal((await s.call(`${s.F}/voice`, s.t.out)).status, 404);
  assert.equal((await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true })).cloud, true);
  const pat = await s.call(`${s.F}/voice`, s.t.pat);
  assert.equal(pat.ready, true); assert.equal(pat.admin.canChange, false); assert.equal(pat.admin.provider, 'ElevenLabs'); assert.equal(pat.admin.fallback, 'Device voice');
  assert.deepEqual(Object.values(pat.prefs.cats), CATEGORIES.map(() => false), "Pat's categories start OFF");
  await s.allow(s.t.sam, 'weather');
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: false });
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'off');
});

test('[33.1] public-only → a valid ticket, spoken once; ElevenLabs gets only the sentence; [33.9] a replay is refused', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'policy', 'the listener has not allowed weather yet');
  await s.allow(s.t.sam, 'weather');
  const r = await s.day(s.t.sam, [s.W, s.CAL(s.id.sam, 'Therapy with Dr. Lee'), s.H()]);
  assert.equal(r.spoken.text, 'It will be 62°F and dry at 2 PM.'); assert.ok(r.spoken.ticket);
  const sumAsk = s.claudeAsks.find((x) => x.spoken).text;
  assert.ok(sumAsk.includes('62') && !sumAsk.includes('Therapy') && !sumAsk.includes('recovery'), 'the summary is written from the eligible facts only');
  const ok = await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken });
  assert.equal(ok.status, 200); assert.deepEqual([...new Uint8Array(ok.audio)], [73, 68, 51]);
  assert.match(s.eleven[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice1\?output_format=mp3_44100_64$/);
  assert.equal(s.eleven[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(s.eleven[0].init.body), { text: r.spoken.text, model_id: 'eleven_flash_v2_5' }, 'only the sentence and the model — no names, ids or family');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken })).status, 409, 'one-time');
  assert.equal(s.eleven.length, 1);
});

test('[33.2] an allowed confirmation is spoken; not allowed → refused (the phone says it)', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 403);
  await s.allow(s.t.sam, 'confirmations');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 200);
  assert.equal(JSON.parse(s.eleven[0].init.body).text, 'Here it is. Check it and tap to confirm.');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'say anything' })).status, 400, 'only fixed phrases');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text: 'Your PIN is 1234' })).status, 403, 'arbitrary text without a ticket: never');
  assert.equal(s.eleven.length, 1);
});

test("[33.3] Health denied → no cloud speech; [33.4] another member's calendar denied; [33.5] all owners allow → eligible", async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather', 'calendar');
  assert.equal((await s.day(s.t.sam, [s.H()])).voicePrivate, 'policy');
  assert.equal((await s.day(s.t.sam, [s.CAL(s.id.pat, 'Dentist')])).voicePrivate, 'policy', "Pat hasn't allowed calendar");
  assert.equal((await s.day(s.t.sam, [s.CAL('both', 'Lunch')])).voicePrivate, 'policy');
  await s.allow(s.t.pat, 'calendar');
  s.S.spoken = '[partner] has the dentist at 9 AM.';
  const r = await s.day(s.t.sam, [s.CAL(s.id.pat, 'Dentist')]);
  assert.equal(r.spoken.text, 'your partner has the dentist at 9 AM.', 'roles as plain words — never a name');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken })).status, 200);
});

test('[33.6] mixed facts → a summary from the allowed ones only; nothing allowed → the device reads it', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather');
  const r = await s.day(s.t.sam, [s.W, s.H(), s.CAL(s.id.pat, 'Dentist')]);
  assert.ok(r.spoken?.ticket);
  const sent = s.claudeAsks.filter((x) => x.spoken).at(-1).text;
  assert.ok(!sent.includes('Dentist') && !sent.includes('63'), 'no denied fact reaches the summary');
  s.S.spoken = '';
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'nothing', "the model says these facts can't answer → device");
});

test('[33.7] changed text, [33.8] expired, tampered or someone else’s ticket → refused', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather'); await s.allow(s.t.pat, 'weather');
  const r = await s.day(s.t.sam, [s.W]);
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text: `${r.spoken.text} Your PIN is 1234.`, ticket: r.spoken.ticket })).status, 403, 'changed text');
  const [body, sig] = r.spoken.ticket.split('.');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text: r.spoken.text, ticket: `${body}.${sig.slice(0, -2)}AA` })).status, 403, 'bad signature');
  assert.equal((await s.call('/voice/tts', s.t.pat, 'POST', { fid: s.fid, ...r.spoken })).status, 403, "Pat can't use Sam's ticket");
  assert.equal((await s.call('/voice/tts', s.t.out, 'POST', { fid: s.fid, ...r.spoken })).status, 404, 'not in the family');
  const prof = (await s.call(`${s.F}/voice`, s.t.sam)).voice;
  assert.ok(prof && prof.enabled);
  const text = 'It will be dry.';
  const base = { v: 1, h: await textHash(text), u: (await s.call('/account', s.t.sam)).user?.uid, f: s.fid, m: s.id.sam, p: 'pawmily', vh: await textHash('voice1'), pv: POLICY_VERSION, g: [[s.id.sam, 'weather']], pu: 'talk:family', n: 'n1' };
  if (!base.u) base.u = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))).u;
  const expired = await makeTicket(s.env, { ...base, exp: Date.now() - 1 });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text, ticket: expired })).status, 403, 'expired');
  const fresh = await makeTicket(s.env, { ...base, exp: Date.now() + TICKET_TTL });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text, ticket: fresh })).status, 200, 'the same ticket, unexpired, is fine');
  const oldPolicy = await makeTicket(s.env, { ...base, n: 'n2', pv: POLICY_VERSION - 1, exp: Date.now() + TICKET_TTL });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text, ticket: oldPolicy })).status, 403, 'an older policy version');
  const otherKey = await makeTicket({ ELEVENLABS_API_KEY: 'another-key' }, { ...base, n: 'n3', exp: Date.now() + TICKET_TTL });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, text, ticket: otherKey })).status, 403, 'signed with another key');
});

test('[33.10] changed voice id → refused; [33.11] voice revoked after issuance → refused; the owner decides', async () => {
  const s = await setup({ ELEVENLABS_VOICE_OWNER_EMAIL: 'sam' });
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather'); await s.allow(s.t.pat, 'weather');
  const v = (await s.call(`${s.F}/voice`, s.t.sam)).voice;
  assert.deepEqual([v.personal, v.mine, v.owner, v.purposes], [true, true, s.id.sam, []], "a personal voice: no purposes until its owner allows");
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'voice-owner');
  assert.equal((await s.call(`${s.F}/voice/profile`, s.t.pat, 'PUT', { purposes: ['talk:family'] })).status, 403, "only the voice's owner");
  await s.call(`${s.F}/voice/profile`, s.t.sam, 'PUT', { purposes: ['talk:self', 'bogus'] });
  assert.deepEqual((await s.call(`${s.F}/voice`, s.t.sam)).voice.purposes, ['talk:self']);
  assert.equal((await s.day(s.t.pat, [s.W])).voicePrivate, 'voice-owner', "Sam's voice isn't for Pat's answers yet");
  const r = await s.day(s.t.sam, [s.W]);
  assert.ok(r.spoken?.ticket);
  s.env.ELEVENLABS_VOICE_ID = 'voice2';
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken })).status, 403, 'another voice: the owner decides again');
  assert.deepEqual((await s.call(`${s.F}/voice`, s.t.sam)).voice.purposes, [], 'a new voice id starts with no purposes');
  s.env.ELEVENLABS_VOICE_ID = 'voice1';
  const r2 = await s.day(s.t.sam, [s.W]);
  await s.call(`${s.F}/voice/profile`, s.t.sam, 'PUT', { enabled: false });
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r2.spoken })).status, 403, 'revoked');
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'voice');
  assert.equal(s.eleven.length, 0);
});

test('[33.12] a privacy permission revoked after issuance → refused (yours or another owner’s)', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather', 'calendar'); await s.allow(s.t.pat, 'calendar');
  const a = await s.day(s.t.sam, [s.W]);
  s.S.spoken = '[partner] has the dentist at 9 AM.';
  const b = await s.day(s.t.sam, [s.CAL(s.id.pat, 'Dentist')]);
  await s.allow(s.t.pat);
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...b.spoken })).status, 403, 'Pat took calendar back');
  await s.allow(s.t.sam, 'calendar');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...a.spoken })).status, 403, 'Sam took weather back');
  assert.equal(s.eleven.length, 0);
});

test('[33.13] a secret- or code-like sentence → no ticket (device); the summary failing leaves the answer as it is', async () => {
  const s = await setup();
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather');
  for (const bad of ['Your code is 482913.', 'Email sam@example.com about it.', 'Your bank PIN is 1234.']) {
    s.S.spoken = bad;
    const r = await s.day(s.t.sam, [s.W]);
    assert.equal(r.spoken, null, bad); assert.equal(r.voicePrivate, 'sensitive');
  }
  s.S.throwSpoken = true;
  const r = await s.day(s.t.sam, [s.W]);
  assert.equal(r.status, 200); assert.match(r.answer, /Book club/); assert.equal(r.spoken, null);
});

test('[33.14] ElevenLabs failure → device fallback (and a pause after billing/auth/quota errors); [33.15] quota exhausted → device', async () => {
  const s = await setup({ ELEVENLABS_FAMILY_DAILY_CHARS: '80' });
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'weather', 'confirmations');
  s.S.fail = () => new Response(JSON.stringify({ detail: { message: 'server hiccup' } }), { status: 500 });
  const r = await s.day(s.t.sam, [s.W]);
  const e1 = await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken });
  assert.equal(e1.status, 502); assert.deepEqual([e1.fallback, e1.private, e1.error], [true, true, 'Using device voice for now.'], 'no provider detail reaches the phone');
  assert.equal((await s.call(`${s.F}/voice`, s.t.sam)).admin.paused, false, 'one server error does not pause');
  s.S.fail = () => new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' } }), { status: 401 });
  const e2 = await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' });
  assert.equal(e2.status, 502); assert.equal(e2.fallback, true);
  const st = await s.call(`${s.F}/voice`, s.t.sam);
  assert.deepEqual([st.ready, st.admin.paused], [false, true], 'paused: the phones use their own voice');
  const before = s.eleven.length;
  assert.equal((await s.day(s.t.sam, [s.W])).voicePrivate, 'off', 'no tickets while paused');
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 503);
  assert.equal(s.eleven.length, before, 'no retry storm');
  // The household's daily budget.
  s.m.delete('v2:voicepause'); s.S.fail = null;
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.many' })).status, 200);
  const q = await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'day.times' });
  assert.deepEqual([q.status, q.fallback], [503, true], 'over the budget → device');
});

test('the per-member daily limit; prefs are each person’s own', async () => {
  const s = await setup({ ELEVENLABS_PER_DAY: '2' });
  await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
  await s.allow(s.t.sam, 'confirmations');
  assert.equal((await s.call(`${s.F}/voice`, s.t.pat)).prefs.cats.confirmations, false, "Sam's choice is not Pat's");
  for (let i = 0; i < 2; i++) assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 200);
  assert.equal((await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, phrase: 'confirm.one' })).status, 429);
});

test('[33.16] no speech text, private context, tickets, audio or keys in the logs', async () => {
  const logs = captureLogs();
  try {
    const s = await setup();
    await s.call(`${s.F}/voice/admin`, s.t.sam, 'PUT', { cloud: true });
    await s.allow(s.t.sam, 'weather');
    const r = await s.day(s.t.sam, [s.W, s.CAL(s.id.sam, 'Therapy with Dr. Lee')]);
    await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken });
    await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r.spoken });
    s.S.fail = () => new Response('{"detail":{"message":"quota"}}', { status: 429 });
    const r2 = await s.day(s.t.sam, [s.W]);
    await s.call('/voice/tts', s.t.sam, 'POST', { fid: s.fid, ...r2.spoken });
    const all = logs.out.join('\n');
    for (const secret of [r.spoken.text, r.spoken.ticket, KEY, 'Therapy', 'Dr. Lee', '62°F']) assert.ok(!all.includes(secret), `not in the logs: ${secret.slice(0, 20)}`);
  } finally { logs.restore(); }
});
