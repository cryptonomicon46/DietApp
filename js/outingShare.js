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
