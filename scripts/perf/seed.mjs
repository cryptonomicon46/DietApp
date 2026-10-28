// A synthetic family on the local Worker (wrangler dev with DEMO sign-in): posts, threads, events,
// Us notes, a week of chores, shared trackers and chats. No real data. Writes .seeded.json.
import { writeFileSync } from 'node:fs';
import { seal, sealBytes, newKey, makeCheck } from '../../family/crypto.js';

const B = process.env.API || 'http://localhost:8787/v2';
const OUT = new URL('.seeded.json', import.meta.url).pathname;
const PHOTO = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAB4AKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC/RRRXecQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFOVWb7qk/QU8W8pGdn61EqsI/E0ilCUtkRUVL9nl/ufqKYUZRllIHuKI1actIyT+YOnKO6G0UUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRUkMXmvjoB1NTOahFylshxi5OyEjieQ/KOPU9KuJbxr1G4+pqRVCqAowBS14OIx1Sq7R0R6tLCwgrvVgBgYHSiiiuI6QooooAieCNv4cH24qrLC8fXkeoq/QRkYPSuuhjalJ6u6OerhoTWmjMuipriHy2yv3T+lQ179OpGpFSjseVODhLlYUUUVZIUUUUAFFFFABRRRQAVoW6hIVx35NZ9aleXmk2oxj3O7AxTk2FFFFeMeiFFFFABRRRQAUUUUANkUOhU96za1Kzpf9a/+8a9bK5v3onBjorSQyiiivXPPCiiigAooooAKKKKACtGFt8SnOTjBrOqa3l8tsNnaf0rjx1B1afu7o6cLVVOeuzL1FAORkdKK+ePWCiiigAooooAKKKKAEZgilj0FZpOTk9anuZt52IflHX3qvXvZfQdODlLdnlYuqpystkFFFFd5yhRRRQAUUUUAFFFFABRRRQBLFO0fHVfSriSo/3WGfTvWdRXHiMDTrO+zOiliZ09N0alFZ6zSKMK5x7808XUmOin8K86WW1Vs0zsjjab3LtFU/tcnov5VGZ5WGC5/DiiOW1nvZA8ZTWxeeRE+8wFVJbhn4X5V/nUFFehQwFOk+Z6s5KuKnNWWiCiiiu05gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k='), (c) => c.charCodeAt(0));
const call = async (path, token, method = 'GET', body, raw) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (r.status >= 400) throw new Error(`${method} ${path}: ${r.status} ${j.error}`);
  return j;
};
const rnd = Math.random().toString(36).slice(2, 7);
const terms = (await call('/config')).termsVersion;
const signIn = async (who) => { const { token } = await call('/auth/demo', null, 'POST', { email: `${who}${rnd}@example.com`, name: who }); await call('/account/consent', token, 'POST', { version: terms, age13: true }); return token; };
const sam = await signIn('Sam'), pat = await signIn('Pat'), mom = await signIn('Mom'), kid = await signIn('Kid');
const { family } = await call('/families', sam, 'POST', { name: 'The Pack', myName: 'Sam' });
const fid = family.fid, k = newKey(), L = (v) => seal(k, v);
await call(`/families/${fid}`, sam, 'PATCH', { e2ee: true, keyCheck: await makeCheck(k), modules: ['dogs', 'chores', 'feed', 'health', 'calendar'] });
const ids = {};
for (const [t, name, relation] of [[pat, 'Pat', 'spouse'], [mom, 'Mom', 'parent'], [kid, 'Kid', 'child']]) {
  const add = await call(`/families/${fid}/members`, sam, 'POST', { kind: 'person', name, relation, email: `${name}${rnd}@example.com` });
  ids[name] = add.member.id;
  const inv = await call(`/families/${fid}/invites`, sam, 'POST', { kind: 'member', memberId: add.member.id });
  await call(`/invites/${inv.invite.code}/accept`, t, 'POST');
}
for (const n of ['Rex', 'Luna']) await call(`/families/${fid}/members`, sam, 'POST', { kind: 'pet', name: n, species: 'dog', breed: 'Doodle' });
const me = (await call('/me', sam)).families[0].me;
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
// Spread over three people: the connector allows 120 changes a minute per person.
const who = (i) => [sam, pat, mom][i % 3];
for (let i = 0; i < 18; i++) {
  let photo = {};
  if (i % 4 === 0) {
    const pid = `ph${rnd}${i}`.replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 20);
    for (const size of ['full', 'thumb']) await call(`/families/${fid}/photos/${pid}?size=${size}`, who(i), 'PUT', null, await sealBytes(k, PHOTO));
    photo = { photoId: pid, aspect: 1.333 };
  }
  const r = await call(`/families/${fid}/posts`, who(i), 'POST', { text: await L(`Synthetic post ${i}: the dogs had a great walk. `.repeat(1 + (i % 3))), audience: 'family', ...photo });
  if (i % 3 === 0) await call(`/posts/${fid}/${r.post.id}/comments`, who(i + 1), 'POST', { text: await L('Lovely! 🐶') });
}
for (let i = 0; i < 9; i++) {
  const t = (await call(`/families/${fid}/threads`, i % 2 ? pat : sam, 'POST', { aud: i % 4 === 0 ? 'us' : 'family', board: ['family', 'dogs', 'house'][i % 3], cat: 'talk', title: await L(`Synthetic thread ${i}`), body: await L('## Notes\n- one\n- two\n'.repeat(6)) })).thread;
  for (let r = 0; r < 3; r++) await call(`/families/${fid}/threads/${t.id}/replies`, [pat, sam][r % 2], 'POST', { text: await L(`Reply ${r}.`) });
}
for (let i = 0; i < 14; i++) await call(`/families/${fid}/events`, who(i), 'POST', { date: iso(-i), start: '18:00', end: '19:00', who: [me], body: await L({ title: `Synthetic event ${i}`, where: 'Somewhere' }) });
for (let i = 0; i < 4; i++) await call(`/families/${fid}/us/notes`, [sam, pat][i % 2], 'POST', { body: await L({ text: `Synthetic note ${i}` }) });
for (let d = 0; d < 7; d++) for (const kind of ['breakfast', 'walk', 'dinner']) await call(`/families/${fid}/care`, [mom, pat][(d + kind.length) % 2], 'POST', { kind, date: iso(d), pets: [] });
const trk = (miss) => { const days = [...Array(60).keys()].filter((n) => n % miss); return { profile: { name: 'x', goalLb: 168, weight: 182 }, weights: days.map((n) => ({ date: iso(n), weight: 180 - n / 20 })), mealLog: Object.fromEntries(days.map((n) => [iso(n), { extras: [], meals: { breakfast: true, lunch: n % 3 > 0, dinner: true } }])), eaten: {} }; };
await call(`/families/${fid}/members/${me}/data`, sam, 'PUT', { data: { enc: await L(trk(7)) } });
await call(`/families/${fid}/members/${ids.Pat}/data`, pat, 'PUT', { data: { enc: await L(trk(5)) } });
await call(`/families/${fid}/members/${me}`, sam, 'PATCH', { shareWith: [ids.Pat] });
await call(`/families/${fid}/members/${ids.Pat}`, pat, 'PATCH', { shareWith: [me] });
const dm = `d_${[me, ids.Pat].sort().join('_')}`;
for (let i = 0; i < 12; i++) await call(`/families/${fid}/chats/${i % 3 ? dm : 'g'}`, i % 3 ? [sam, pat][i % 2] : who(i), 'POST', { t: await L(`Synthetic chat ${i} 🙂`) });
// 🙋 A request from Pat and a few groceries, as a household would have.
await call(`/families/${fid}/requests`, pat, 'POST', { kind: 'ride', box: await L('A ride to the airport on Friday') });
await call(`/families/${fid}/groceries`, sam, 'POST', { items: await Promise.all(['Milk', 'Eggs', 'Bread', 'Dog food'].map(L)) });
writeFileSync(OUT, JSON.stringify({ fid, k, sam, pat }));
console.log('seeded', fid);
