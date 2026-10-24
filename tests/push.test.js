// 🔔 Notifications: messages encrypted to the phone (RFC 8291), sent on the right events to the
// right people, and the 15-minute reminders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyApi, TERMS_VERSION, runFamilyReminders } from '../server/family.js';
import { encryptPayload, okEndpoint, localToUtc, dueFor, vapidKeys } from '../server/push.js';
import { newKey, makeCheck, seal } from '../family/crypto.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

// What the phone does with a message: the receiving half of RFC 8291.
async function phoneOpens(ua, auth, body) {
  const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const as = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, ua.privateKey, 256));
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.equal(pt.at(-1), 2, 'last record');
  return new TextDecoder().decode(pt.slice(0, -1));
}

test('a message only the phone can open', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { p256dh: b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u(auth) };
  const body = await encryptPayload(sub, '{"title":"💌 Sam left you a note"}');
  assert.equal(new DataView(body.buffer).getUint32(16), 4096);
  assert.equal(await phoneOpens(ua, auth, body), '{"title":"💌 Sam left you a note"}');
  assert.ok(okEndpoint('https://web.push.apple.com/abc'));
  assert.ok(okEndpoint('https://fcm.googleapis.com/fcm/send/x'));
  assert.ok(!okEndpoint('https://evil.example.com/push.apple.com'));
  assert.ok(!okEndpoint('http://fcm.googleapis.com/x'));
  const m = new Map(), db = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const k1 = await vapidKeys(db), k2 = await vapidKeys(db);
  assert.equal(k1.publicKey, k2.publicKey, 'made once');
  assert.equal(Buffer.from(k1.publicKey, 'base64url').length, 65);
});

test('wall-clock times in a time zone', () => {
  assert.equal(new Date(localToUtc('2026-10-24T09:00', 'America/Los_Angeles')).toISOString(), '2026-10-24T16:00:00.000Z');
  assert.equal(new Date(localToUtc('2026-12-24T09:00', 'America/Los_Angeles')).toISOString(), '2026-12-24T17:00:00.000Z');
  assert.equal(new Date(localToUtc('2026-10-24T09:00', 'Europe/London')).toISOString(), '2026-10-24T08:00:00.000Z');
});

test('reminders: appointments, calendar events and vaccines, in their quarter hour', () => {
  const fam = { members: [{ id: 's', kind: 'person', name: 'Sam' }, { id: 'p', kind: 'person', name: 'Pat' }, { id: 'd', kind: 'pet', name: 'Pip' }] };
  const tz = 'America/Los_Angeles';
  const appts = [{ id: 'a1', type: 'groom', pets: ['d'], dropAt: '2026-10-25T10:00', dropBy: 'p', status: 'upcoming', remind: ['day', 'hour'] }];
  const events = [{ id: 'e1', date: '2026-10-24', start: '18:30', remind: 30, who: [] }, { id: 'e2', date: '2026-10-01', start: '18:30', remind: 30, who: ['p'], repeat: { kind: 'daily' } }];
  const vax = [{ pet: 'd', due: '2026-10-31' }];
  const q = (local) => { const from = localToUtc(local, tz); return [from, from + 9e5]; };
  const day = dueFor({ fam, memberId: 's', tz, appts, events, vax }, ...q('2026-10-24T10:00'));
  assert.equal(day.length, 1);
  assert.match(day[0].msg.title, /Grooming for Pip/);
  assert.equal(day[0].msg.body, 'Tomorrow at 10 AM — Pat is dropping off');
  assert.equal(dueFor({ fam, memberId: 'p', tz, appts, events, vax }, ...q('2026-10-25T09:00'))[0].msg.body, 'In an hour at 10 AM — you are dropping off');
  const ev = dueFor({ fam, memberId: 's', tz, appts: [], events, vax: [] }, ...q('2026-10-24T18:00'));
  assert.deepEqual(ev.map((x) => x.msg.tag), ['ev-e1-2026-10-24'], "Pat's own repeating event isn't Sam's");
  assert.equal(ev[0].msg.body, 'Today at 6:30 PM — open the calendar to see what');
  assert.equal(dueFor({ fam, memberId: 'p', tz, appts: [], events, vax: [] }, ...q('2026-10-24T18:00')).length, 2);
  const shots = dueFor({ fam, memberId: 's', tz, appts: [], events: [], vax }, ...q('2026-10-24T09:00'));
  assert.equal(shots[0].msg.title, "💉 Pip's vaccine is due next week");
  assert.equal(dueFor({ fam, memberId: 's', tz, appts: [], events: [], vax }, ...q('2026-10-24T09:15')).length, 0, 'once');
});

test('who gets told what, and the reminders cron', async () => {
  const m = new Map();
  const sent = [];
  const kv = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
  const env = { DEMO: true, HOUSEHOLD: kv, __push: async (sub, msg) => { sent.push({ to: sub.device, ...msg }); return sub.device === 'gone' ? 410 : 201; } };
  const call = async (path, token, method = 'GET', body) => { const r = await familyApi(new Request(`https://x.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]); return { status: r.status, ...r.data }; };
  const signIn = async (email) => { const { token } = await call('/auth/demo', null, 'POST', { email }); await call('/account/consent', token, 'POST', { version: TERMS_VERSION, age13: true }); return token; };
  const sam = await signIn('sam@example.com'), pat = await signIn('pat@example.com');
  const { family } = await call('/families', sam, 'POST', { name: 'Fam', myName: 'Sam' });
  const FK = newKey();
  await call(`/families/${family.fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(FK) });
  const add = await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'person', name: 'Pat', relation: 'spouse', email: 'pat@example.com' });
  const inv = await call(`/families/${family.fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, pat, 'POST');
  const pip = (await call(`/families/${family.fid}/members`, sam, 'POST', { kind: 'pet', name: 'Pip', species: 'dog' })).member;
  const sub = (device) => ({ endpoint: `https://web.push.apple.com/${device}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }, device, tz: 'America/Los_Angeles' });
  assert.equal((await call('/push/subscribe', pat, 'POST', { ...sub('x'), endpoint: 'https://evil.example.com/x' })).status, 400);
  await call('/push/subscribe', pat, 'POST', sub('pat-phone'));
  await call('/push/subscribe', pat, 'POST', sub('gone'));
  await call('/push/subscribe', sam, 'POST', sub('sam-phone'));
  assert.equal((await call('/push', pat)).devices.length, 2);

  const U = `/families/${family.fid}/us`;
  await call(`${U}/plans`, sam, 'POST', { day: '2026-10-24', audience: 'couple', body: await seal(FK, { kind: 'movie', what: 'Wicked' }) });
  assert.equal(sent.length, 2, "Pat's two phones, not Sam's");
  assert.equal(sent[0].title, '💞 Sam is feeling like something');
  assert.ok(!JSON.stringify(sent).includes('Wicked'), 'never what it says');
  assert.equal((await call('/push', pat)).devices.length, 1, 'a phone that unsubscribed is forgotten');
  sent.length = 0;
  await call(`/push/prefs`, pat, 'PUT', { us: false });
  await call(`${U}/notes`, sam, 'POST', { body: await seal(FK, { text: 'hi' }) });
  assert.equal(sent.length, 0, 'Pat turned plans and notes off');
  await call('/push/prefs', pat, 'PUT', {});
  await call(`${U}/notes`, sam, 'POST', { body: await seal(FK, { text: 'hi' }) });
  assert.deepEqual(sent.map((x) => [x.to, x.title]), [['pat-phone', '💌 Sam left you a note']]);

  // An appointment tells the other grown-up; the 15-minute reminder the day before.
  sent.length = 0;
  const appt = (await call(`/families/${family.fid}/appts`, pat, 'POST', { type: 'vet', pets: [pip.id], dropAt: '2026-10-25T10:00', remind: ['day'], place: await seal(FK, 'Dr Lee') })).appt;
  assert.deepEqual(sent.map((x) => [x.to, x.title, x.body]), [['sam-phone', '🩺 Pat booked vet visit for Pip', 'Sun, Oct 25 — can you drive?']]);
  sent.length = 0;
  await call(`/families/${family.fid}/appts/${appt.id}`, sam, 'PATCH', { claim: 'drop' });
  assert.equal(sent[0].title, '🚗 Sam will do the drop-off');
  sent.length = 0;
  await call(`/families/${family.fid}/vaxdue`, sam, 'PUT', { due: [{ pet: pip.id, due: '2026-10-31' }, { pet: 'nope', due: '2026-10-31' }] });
  await runFamilyReminders(env, localToUtc('2026-10-24T10:05', 'America/Los_Angeles'));
  assert.deepEqual(sent.map((x) => [x.to, x.body]).sort(), [['pat-phone', 'Tomorrow at 10 AM — Sam is dropping off'], ['sam-phone', 'Tomorrow at 10 AM — you are dropping off']]);
  sent.length = 0;
  await runFamilyReminders(env, localToUtc('2026-10-24T09:00', 'America/Los_Angeles'));
  assert.equal(sent.filter((x) => x.title === "💉 Pip's vaccine is due next week").length, 2);
  // Deleting the account forgets its phones.
  assert.ok(m.has('v2:pushsub:dpatexamplecom'));
  await call('/account/delete', pat, 'POST', { confirm: 'DELETE' });
  assert.equal(m.has('v2:pushsub:dpatexamplecom'), false);
});
