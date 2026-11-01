// 🧭 Sending a date plan to your partner (Us › plan › 💞 Send). The plan goes to the connector
// sealed with the family key, and the connector keeps a sealed plan only up to MAX characters
// (server/family.js, `/us/plans`: sealed(v, 8000)). A full plan (five stops with notes, links,
// tips and the other options) can be bigger than that, and was refused — so the phone sends the
// fullest version that fits: the other options go first, then long descriptions are shortened.
// Pure: no network, no key. The planner's own copy on this phone is never changed.
export const MAX = 8000;
const PREFIX = 'e1:'.length, IV_TAG = 12 + 16;
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
// Exactly how long seal() (family/crypto.js: AES-GCM, 12-byte IV, 16-byte tag, base64url without
// padding, "e1:" in front) makes this value.
export const sealedLength = (v) => PREFIX + Math.ceil(((IV_TAG + bytes(v)) * 4) / 3);

const cut = (s, n) => { const t = String(s ?? ''); return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`; };
const opts = (o, eat, dos) => ({ eat: (o.options?.eat || []).slice(0, eat), do: (o.options?.do || []).slice(0, dos) });
// Each level drops a little more; level 0 is what was always sent.
const LEVELS = [
  (o) => ({ ...o, options: opts(o, 3, 2) }),
  (o) => ({ ...o, options: opts(o, 0, 0) }),
  (o) => ({ ...LEVELS[1](o), tips: (o.tips || []).slice(0, 4).map((t) => cut(t, 160)), back: cut(o.back, 160), parking: cut(o.parking, 160),
    getting: (o.getting || []).map((g) => ({ ...g, text: cut(g.text, 200) })), stops: (o.stops || []).map((x) => ({ ...x, why: cut(x.why, 160), note: cut(x.note, 100) })) }),
  (o) => ({ ...LEVELS[2](o), tips: (o.tips || []).slice(0, 2).map((t) => cut(t, 100)), parking: '', stops: (o.stops || []).map((x) => ({ ...x, why: cut(x.why, 80), note: cut(x.note, 60) })) }),
  (o) => ({ ...LEVELS[3](o), tips: [], back: cut(o.back, 80), getting: (o.getting || []).slice(0, 2).map((g) => ({ ...g, text: cut(g.text, 100) })), stops: (o.stops || []).map((x) => ({ ...x, why: '', note: cut(x.note, 40) })) }),
];
// `wrap(outing)` → the whole value that will be sealed (the plan's other fields around it).
// → { value, level } for the fullest version that fits, or null when even the shortest doesn't.
export function shareable(outing, wrap = (o) => o, max = MAX) {
  for (let level = 0; level < LEVELS.length; level++) {
    const value = wrap(LEVELS[level](outing));
    if (sealedLength(value) <= max) return { value, level };
  }
  return null;
}

// 🧵 Save to a thread: the plan as a thread's title and body (Threads' plain-text markdown: "## " and
// "### " headings, "- " lists), opened in Write it up for any last edits before it's posted. Every stop
// keeps its time, place, note and links. → { title, body } (body ≤ `max` characters).
const clock = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
const dayLong = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
export function outingThread(o, max = 11000) {
  const title = `🧭 ${o.title}${o.day ? ` · ${dayLong(o.day)}` : ''}`.slice(0, 120);
  const line = (x) => {
    const links = [x.reserve ? `OpenTable: ${x.reserve}` : '', x.url ? `Website: ${x.url}` : '', x.map ? `Map: ${x.map}` : ''].filter(Boolean);
    // Threads' markdown (family/app.js mdBlocks): "### " a heading, the lines under it one paragraph.
    return [`### ${clock(x.time) ? `${clock(x.time)} · ` : ''}${x.name}${x.price ? ` (${x.price})` : ''}`, x.note, [x.why, x.where].filter(Boolean).join(' · '), links.join(' · ')].filter(Boolean).join('\n');
  };
  const parts = [
    `${o.area || ''}${o.day ? ` · ${dayLong(o.day)}` : ''}`.replace(/^ · /, ''),
    (o.getting || []).length || o.back || o.parking ? `## Getting there\n${[...(o.getting || []).map((g) => `- ${clock(g.depart) ? `Leave ${clock(g.depart)} · ` : ''}${g.text}`), o.parking ? `- 🅿️ ${o.parking}` : '', o.back ? `- ↩︎ ${o.back}` : '', o.directions ? `- Directions: ${o.directions}` : ''].filter(Boolean).join('\n')}` : '',
    (o.stops || []).length ? `## The plan\n\n${o.stops.map(line).join('\n\n')}` : '',
    (o.tips || []).length ? `## Tips\n${o.tips.map((t) => `- ${t}`).join('\n')}` : '',
  ].filter(Boolean);
  let body = parts.join('\n\n');
  if (body.length > max) body = `${body.slice(0, max - 1).trimEnd()}…`;
  return { title, body };
}
