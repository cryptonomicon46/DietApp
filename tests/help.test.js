import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION, runMaintenance } from '../server/family.js';
import { toMessages, runHelpAgent, offlineAnswer } from '../server/helpAgent.js';
import { guideMatch } from '../server/helpGuide.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) }; };
// A scripted stand-in for Claude: each call returns the next response, and records what it was sent.
const fakeClaude = (responses) => { const sent = []; return { sent, beta: { messages: { create: async (req) => { sent.push(structuredClone(req)); return responses.shift(); } } } }; };
const toolUse = (name, input, id = `tu_${name}`) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

function setup(extra = {}) {
  const env = { HOUSEHOLD: kv(), DEMO: true, APP_ORIGIN: 'https://example.github.io/DietApp/', ...extra };
  const call = async (path, { token, method = 'GET', body, ip = '1.2.3.4' } = {}) => {
    const req = new Request(`https://x.test${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'cf-connecting-ip': ip }, body: body ? JSON.stringify(body) : undefined });
    const r = await familyApi(req, env, path);
    return { status: r.status, ...r.data };
  };
  const signIn = async (email, name) => {
    const { token } = await call('/auth/demo', { method: 'POST', body: { email, name } });
    await call('/account/consent', { token, method: 'POST', body: { version: TERMS_VERSION, age13: true } });
    return token;
  };
  return { env, call, signIn };
}

test('the guide answers common questions without Claude', () => {
  assert.equal(guideMatch('I forgot my password')[0].id, 'signin');
  assert.equal(guideMatch('my invite expired')[0].id, 'invites');
  assert.equal(guideMatch('how do I enter macros for a factor meal')[0].id, 'diet-meals');
  assert.equal(guideMatch('help me set up my diet plan')[0].id, 'diet-setup');
  assert.equal(guideMatch('how do I add my kid')[0].id, 'members');
  assert.match(offlineAnswer('qwerty zxcv').reply, /I can help with/);
  assert.match(offlineAnswer('forgot password').reply, /accounts\.google\.com\/signin\/recovery/);
});

test('chat history is cleaned into alternating turns that end with the person', () => {
  assert.deepEqual(toMessages([{ role: 'assistant', text: 'hi' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }]), [{ role: 'user', content: 'a\n\nb' }]);
  assert.deepEqual(toMessages([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]), []);
  assert.equal(toMessages(Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }))).length, 11);
});

test('the agent loop runs tools, returns results and stops at the answer', async () => {
  const client = fakeClaude([toolUse('get_my_account', {}), say('You have 2 devices signed in.')]);
  const ran = [];
  const r = await runHelpAgent({ client, system: 'S', messages: [{ role: 'user', content: 'devices?' }], tools: [], run: async (n) => { ran.push(n); return { devices_signed_in: 2 }; } });
  assert.equal(r.reply, 'You have 2 devices signed in.');
  assert.deepEqual(ran, ['get_my_account']);
  const second = client.sent[1];
  assert.equal(second.model, 'claude-opus-5-5');
  assert.equal(second.messages.at(-1).content[0].type, 'tool_result');
  assert.equal(second.messages.at(-1).content[0].tool_use_id, 'tu_get_my_account');
  assert.equal(second.system[0].cache_control.type, 'ephemeral');
  const refused = await runHelpAgent({ client: fakeClaude([{ stop_reason: 'refusal', content: [] }]), system: 'S', messages: [{ role: 'user', content: 'x' }], tools: [], run: async () => ({}) });
  assert.match(refused.reply, /can't help/);
});

test('help chat: offline in the demo, Claude with account tools when signed in, report-only when not', async () => {
  const demo = setup();
  const off = await demo.call('/help/chat', { method: 'POST', body: { messages: [{ role: 'user', text: 'I forgot my password' }] } });
  assert.equal(off.offline, true);
  assert.match(off.reply, /recovery/);

  const client = fakeClaude([]);
  const { env, call, signIn } = setup({ DEMO: false, __anthropic: client });
  env.DEMO = true; const me = await signIn('sam@example.com', 'Sam'); env.DEMO = false;
  const { family } = await call('/families', { token: me, method: 'POST', body: { name: 'Fam' } });
  const pat = await call(`/families/${family.fid}/members`, { token: me, method: 'POST', body: { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' } });

  // Signed in: Claude checks the families, then resends Pat's invite.
  client.sent.length = 0;
  const list = [toolUse('list_my_families', {}), toolUse('resend_invite', { family_id: family.fid, member_id: pat.member.id, email: null }), say('Here is a fresh invite for Pat.')];
  client.beta.messages.create = async (req) => { client.sent.push(structuredClone(req)); return list.shift(); };
  const r = await call('/help/chat', { token: me, method: 'POST', body: { messages: [{ role: 'user', text: "Pat's invite expired" }] } });
  assert.equal(r.reply, 'Here is a fresh invite for Pat.');
  assert.equal(r.invite.email, 'pat@example.com');
  assert.ok(client.sent[0].tools.some((t) => t.name === 'resend_invite'));
  const famResult = JSON.parse(client.sent[1].messages.at(-1).content[0].content);
  assert.equal(famResult.families[0].members.find((x) => x.name === 'Pat').status, 'invited');
  assert.ok(!JSON.stringify(famResult).includes(me) && !/"uid"/.test(JSON.stringify(famResult)), 'no account ids or tokens go to Claude');
  const inv = JSON.parse(client.sent[2].messages.at(-1).content[0].content);
  assert.match(inv.link, /^https:\/\/example\.github\.io\/DietApp\/family\/#invite=[a-z0-9]{16}$/);
  assert.equal((await call(`/invites/${r.invite.code}`, { token: me })).status, 200);

  // Someone else's family can't be touched.
  env.DEMO = true; const other = await signIn('x@example.com', 'X'); env.DEMO = false;
  const steps = [toolUse('resend_invite', { family_id: family.fid, member_id: pat.member.id, email: 'x@example.com' }), say('no')];
  client.beta.messages.create = async (req) => { client.sent.push(structuredClone(req)); return steps.shift(); };
  await call('/help/chat', { token: other, method: 'POST', body: { messages: [{ role: 'user', text: 'resend' }] } });
  assert.match(client.sent.at(-1).messages.at(-1).content[0].content, /not one of your families/);
  assert.equal((await call(`/families/${family.fid}`, { token: me })).family.members.find((x) => x.name === 'Pat').email, 'pat@example.com');

  // Not signed in: only report_problem is offered, and the ticket keeps the contact email.
  const guest = [toolUse('report_problem', { category: 'sign-in', summary: "Can't sign in", details: 'Google says error', contact_email: 'help@example.com' }), say('Sent!')];
  client.beta.messages.create = async (req) => { client.sent.push(structuredClone(req)); return guest.shift(); };
  const g = await call('/help/chat', { method: 'POST', body: { messages: [{ role: 'user', text: "I can't sign in" }] } });
  assert.deepEqual(client.sent.at(-2).tools.map((t) => t.name), ['report_problem']);
  assert.match(client.sent.at(-2).system[0].text, /NOT signed in/);
  assert.ok(g.filed);
  const ticket = JSON.parse(env.HOUSEHOLD.m.get(`v2:ticket:${g.filed}`));
  assert.equal(ticket.from.email, 'help@example.com');
  assert.equal(ticket.transcript[0].text, "I can't sign in");
});

test('sign out other devices only after confirming, and keeps this one', async () => {
  const client = fakeClaude([]);
  const { env, call } = setup({ __anthropic: client });
  const a = (await call('/auth/demo', { method: 'POST', body: { email: 'sam@example.com' } })).token;
  const b = (await call('/auth/demo', { method: 'POST', body: { email: 'sam@example.com' } })).token;
  await call('/account/consent', { token: a, method: 'POST', body: { version: TERMS_VERSION, age13: true } });
  env.DEMO = false;
  const steps = [toolUse('sign_out_other_devices', { confirmed: false }, 't1'), say('Are you sure?'), toolUse('sign_out_other_devices', { confirmed: true }, 't2'), say('Done.')];
  client.beta.messages.create = async (req) => { client.sent.push(structuredClone(req)); return steps.shift(); };
  await call('/help/chat', { token: a, method: 'POST', body: { messages: [{ role: 'user', text: 'I lost my phone' }] } });
  assert.equal((await call('/me', { token: b })).status, 200, 'not without a yes');
  const r = await call('/help/chat', { token: a, method: 'POST', body: { messages: [{ role: 'user', text: 'lost phone' }, { role: 'assistant', text: 'Are you sure?' }, { role: 'user', text: 'yes' }] } });
  assert.equal(r.signedOutOthers, true);
  assert.equal((await call('/me', { token: b })).status, 401);
  assert.equal((await call('/me', { token: a })).status, 200);
});

test('help is rate limited, and the API failing falls back to the guide', async () => {
  const client = { beta: { messages: { create: async () => { throw new Error('overloaded'); } } } };
  const { call } = setup({ DEMO: false, __anthropic: client });
  const r = await call('/help/chat', { method: 'POST', body: { messages: [{ role: 'user', text: 'invite expired' }] } });
  assert.equal(r.offline, true);
  assert.match(r.note, /unavailable/);
  let last;
  for (let i = 0; i < 10; i++) last = await call('/help/chat', { method: 'POST', ip: '9.9.9.9', body: { messages: [{ role: 'user', text: 'hi' }] } });
  assert.equal(last.status, 200);
  assert.equal((await call('/help/chat', { method: 'POST', ip: '9.9.9.9', body: { messages: [{ role: 'user', text: 'hi' }] } })).status, 429);
  assert.equal((await call('/help/chat', { method: 'POST', ip: '8.8.8.8', body: { messages: [{ role: 'user', text: 'hi' }] } })).status, 200);
});

test('maintainer: only ADMIN_EMAILS see tickets and glitches; the nightly check repairs leftovers', async () => {
  const { env, call, signIn } = setup({ ADMIN_EMAILS: 'Boss@Example.com, other@example.com' });
  const boss = await signIn('boss@example.com', 'Boss'), sam = await signIn('sam@example.com', 'Sam');
  assert.equal((await call('/me', { token: boss })).user.isAdmin, true);
  assert.equal((await call('/me', { token: sam })).user.isAdmin, false);
  assert.equal((await call('/admin/overview', { token: sam })).status, 404);

  const t = await call('/help/report', { token: sam, method: 'POST', body: { category: 'bug', summary: 'Feed is blank', details: 'after update', app: { version: '8', device: 'iPhone · Safari' } } });
  await call('/help/glitch', { method: 'POST', body: { message: 'x is undefined', where: '/family/app.js:10', version: '8' } });
  await call('/help/glitch', { method: 'POST', body: { message: 'x is undefined', where: '/family/app.js:10', version: '8' } });
  const o = await call('/admin/overview', { token: boss });
  assert.equal(o.tickets[0].id, t.ticket);
  assert.equal(o.tickets[0].from.email, 'sam@example.com');
  assert.equal(o.glitches[0].n, 2);
  assert.equal((await call(`/admin/tickets/${t.ticket}`, { token: boss, method: 'PATCH', body: { status: 'done' } })).ticket.status, 'done');

  // Leftovers: a family whose creator's account vanished, a member whose account lost the link,
  // a family with nobody in it, and a link to a deleted family.
  const { family } = await call('/families', { token: sam, method: 'POST', body: { name: 'Sams' } });
  const pat = await signIn('pat@example.com', 'Pat');
  const add = await call(`/families/${family.fid}/members`, { token: sam, method: 'POST', body: { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' } });
  const inv = await call(`/families/${family.fid}/invites`, { token: sam, method: 'POST', body: { kind: 'member', memberId: add.member.id } });
  await call(`/invites/${inv.invite.code}/accept`, { token: pat, method: 'POST' });
  const raw = (k) => JSON.parse(env.HOUSEHOLD.m.get(`v2:${k}`));
  const samUid = raw(`family:${family.fid}`).members.find((x) => x.role === 'owner').uid;
  const patUid = raw(`family:${family.fid}`).members.find((x) => x.name === 'Pat').uid;
  env.HOUSEHOLD.m.delete(`v2:user:${samUid}`);
  const patUser = raw(`user:${patUid}`); patUser.families = []; env.HOUSEHOLD.m.set(`v2:user:${patUid}`, JSON.stringify(patUser));
  const famRaw = raw(`family:${family.fid}`); famRaw.connections = ['gone123']; env.HOUSEHOLD.m.set(`v2:family:${family.fid}`, JSON.stringify(famRaw));
  env.HOUSEHOLD.m.set('v2:family:empty1', JSON.stringify({ fid: 'empty1', name: 'Empty', members: [{ id: 'k1', kind: 'person', name: 'Kid', relation: 'child' }], connections: [] }));

  const rep = await runMaintenance(env);
  assert.ok(rep.fixes.some((x) => /removed Sam/.test(x)));
  assert.ok(rep.fixes.some((x) => /relinked Pat/.test(x)));
  assert.ok(rep.fixes.some((x) => /Pat is now in charge/.test(x)));
  assert.ok(rep.fixes.some((x) => /deleted Empty/.test(x)));
  assert.ok(rep.fixes.some((x) => /dropped links/.test(x)));
  assert.ok(!env.HOUSEHOLD.m.has('v2:family:empty1'));
  const after = raw(`family:${family.fid}`);
  assert.equal(after.members.find((x) => x.name === 'Pat').role, 'owner');
  assert.deepEqual(after.connections, []);
  assert.deepEqual(raw(`user:${patUid}`).families, [family.fid]);
  assert.equal((await call(`/families/${family.fid}`, { token: pat })).family.myRole, 'owner');
  // A second run finds nothing to do.
  assert.deepEqual((await runMaintenance(env)).fixes, []);
  assert.equal((await call('/admin/overview', { token: boss })).history.length, 2);
});
