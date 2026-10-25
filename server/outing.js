// 🧭 Plan an outing: one line ("Hayes Valley Saturday afternoon"), a day and a few chips, and
// Claude (with web search) plans it: getting there from home (trains, the drive, parking), a
// timeline of stops, other options for each, and tips. The connector only sends the place, the
// day, the chips and the family's home town — never names or anything else in the app.

import { askClaude, parseScout, clean, okUrl, okDay, okTime, openTableUrl } from './scout.js';

export const STOP_KINDS = { coffee: '☕', brunch: '🥞', lunch: '🥗', dinner: '🍽', drinks: '🍸', dessert: '🍰', walk: '🚶', view: '🌅', do: '🎟', shop: '🛍', museum: '🖼', music: '🎶', park: '🌳' };
export const MODES = { train: '🚆', bart: '🚇', transit: '🚌', ferry: '⛴', drive: '🚗', walk: '🚶', bike: '🚲' };
export const CUISINES = ['sushi', 'japanese', 'thai', 'indian', 'tapas', 'italian', 'mexican', 'american', 'chinese', 'korean', 'vietnamese', 'mediterranean', 'seafood', 'pizza', 'vegetarian', 'french'];
export const CHIPS = [...CUISINES, 'dinner', 'drinks', 'coffee', 'brunch', 'lunch', 'walk', 'shops', 'museum', 'music', 'views', 'caltrain', 'bart', 'ferry', 'drive', 'dogs', '$', '$$', '$$$', '$$$$', 'no long waits', 'easy walking', 'kid-friendly'];
const EAT = ['coffee', 'brunch', 'lunch', 'dinner', 'drinks', 'dessert'];

export function outingPrompt({ text, day, chips, from }) {
  return `Plan an outing for a couple who live in ${from}, California.
They asked: "${text}" on ${day}${chips.length ? `. They'd like: ${chips.join(', ')}` : ''}.

Search the web for what's good there now: well-reviewed places (new ones are a plus), what's open that day, and how to get there from ${from} (Caltrain, BART, ferry or the drive, with real schedules if you can find them, and where to park). Plan a realistic timeline for that day with travel and walking time between stops; leave room to breathe. Give 2-3 other good options for each meal or drink stop and for things to do.

Answer with only this JSON (times 24-hour HH:MM, at most 6 stops):
{"title":"short name, e.g. Hayes Valley afternoon","area":"neighborhood, city",
 "getting":[{"mode":"train|bart|transit|ferry|drive|walk|bike","text":"e.g. Caltrain 13:08 Santa Clara → 4th & King, then Muni N 15 min","depart":"HH:MM"}],
 "back":"how and when to get home, e.g. last good train 22:30",
 "parking":"where to park if driving, or empty",
 "stops":[{"time":"HH:MM","kind":"coffee|brunch|lunch|dinner|drinks|dessert|walk|view|do|shop|museum|music|park","name":"","why":"one line","where":"street or block","price":"$-$$$$ or empty","note":"walk-in / book ahead / cash only…","url":"https://… official site","opentable":true|false}],
 "options":{"eat":[same fields as stops, without time],"do":[same]},
 "tips":["short practical tips: book ahead, hills, weather, closing days"]}`;
}

const stop = (x, withTime) => {
  const name = clean(x?.name, 60);
  if (!name) return null;
  const kind = STOP_KINDS[x.kind] ? x.kind : 'do';
  return { ...(withTime ? { time: okTime(x.time) } : {}), kind, name, why: clean(x.why, 140), where: clean(x.where, 80), price: /^\${1,4}$/.test(x.price || '') ? x.price : '', note: clean(x.note, 60), url: okUrl(x.url), opentable: EAT.includes(kind) && x.opentable !== false && kind !== 'coffee' };
};
// Claude's answer, checked: plain text, https links only, a real time on every stop, and the links
// (OpenTable for the day and time, Google Maps, directions from home) made here.
export function shapeOuting(j, { day, from, text }) {
  if (!j || typeof j !== 'object') return null;
  const stops = (Array.isArray(j.stops) ? j.stops : []).map((x) => stop(x, true)).filter((x) => x?.time).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 6);
  if (!stops.length) return null;
  const area = clean(j.area, 80) || clean(text, 80);
  const where = (x) => `${x.name}, ${x.where ? `${x.where}, ` : ''}${area}`;
  const links = (x) => ({ ...x, map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where(x))}`, reserve: x.opentable ? openTableUrl(`${x.name} ${area.split(',').pop().trim()}`, day, x.time || '19:30') : '' });
  const opts = (k) => (Array.isArray(j.options?.[k]) ? j.options[k] : []).map((x) => stop(x, false)).filter(Boolean).slice(0, 8).map(links);
  return {
    title: clean(j.title, 60) || area, area, day, from,
    getting: (Array.isArray(j.getting) ? j.getting : []).slice(0, 4).map((g) => ({ mode: MODES[g.mode] ? g.mode : 'transit', text: clean(g.text, 160), depart: okTime(g.depart) })).filter((g) => g.text),
    back: clean(j.back, 140), parking: clean(j.parking, 140),
    directions: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${from}, CA`)}&destination=${encodeURIComponent(area)}&travelmode=transit`,
    stops: stops.map(links), options: { eat: opts('eat'), do: opts('do') },
    tips: (Array.isArray(j.tips) ? j.tips : []).map((t) => clean(t, 140)).filter(Boolean).slice(0, 5),
  };
}

// The request, checked; then Claude, with a monthly cap per family (OUTING_MAX_RUNS, 20).
export async function planOuting(env, db, fam, body, from, now = new Date()) {
  const text = clean(body.text, 120);
  if (text.length < 3) return { error: 'where to?' };
  const day = okDay(body.day);
  if (!day) return { error: 'which day?' };
  const chips = (Array.isArray(body.chips) ? body.chips : []).map((c) => clean(c, 20).toLowerCase()).filter((c) => CHIPS.includes(c)).slice(0, 12);
  if (env.DEMO && !env.__anthropic) return { outing: shapeOuting(DEMO_ANSWER(text), { day, from, text }), demo: true };
  if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) return { error: 'outings need the Anthropic key on the connector (ANTHROPIC_API_KEY)' };
  const month = now.toISOString().slice(0, 7), key = `outingruns:${fam.fid}:${month}`;
  const runs = (await db.get(key)) || [];
  const cap = Math.max(1, +env.OUTING_MAX_RUNS || 20);
  if (runs.filter((x) => !x.swap).length >= cap) return { error: `that's ${cap} outings planned this month — more next month` };
  const { text: answer, usage } = await askClaude(env, outingPrompt({ text, day, chips, from }), { city: from, maxUses: 8 });
  await db.put(key, [...runs, { at: Date.now(), ...usage }], 62 * 86400);
  const outing = shapeOuting(parseScout(answer), { day, from, text });
  if (!outing) return { error: "Claude couldn't put that one together — try saying it another way" };
  return { outing, left: cap - runs.filter((x) => !x.swap).length - 1 };
}

// ⇄ Swap one stop: 2-3 other places of a cuisine (or kind) near the same spot, for the same time.
export function swapPrompt({ area, day, time, kind, cuisine, avoid }) {
  return `A couple is spending ${day} in ${area}, California. For their ${kind} around ${time}, they'd like ${cuisine ? `${cuisine} food` : `something different from ${avoid}`} instead${avoid ? ` of ${avoid}` : ''}.
Search the web and suggest 3 well-reviewed places within a short walk of ${area} that are open then.
Answer with only this JSON: {"options":[{"kind":"${kind}","name":"","why":"one line","where":"street or block","price":"$-$$$$","note":"walk-in / book ahead…","url":"https://… official site","opentable":true|false}]}`;
}
export async function swapStop(env, db, fam, body, from, now = new Date()) {
  const area = clean(body.area, 80), day = okDay(body.day), time = okTime(body.time) || '19:00';
  const kind = STOP_KINDS[body.kind] ? body.kind : 'dinner';
  const cuisine = CUISINES.includes(body.cuisine) ? body.cuisine : '';
  if (!area || !day) return { error: 'which outing?' };
  const avoid = clean(body.avoid, 60);
  const shape = (j) => shapeOuting({ area, stops: [{ time, kind, name: '_' }], options: { eat: (j?.options || []).map((x) => ({ ...x, kind })) } }, { day, from, text: area })?.options.eat.map((x) => ({ ...x, reserve: x.opentable ? openTableUrl(`${x.name} ${area.split(',').pop().trim()}`, day, time) : '' })) || [];
  if (env.DEMO && !env.__anthropic) return { options: shape({ options: [{ name: `${cuisine ? cuisine[0].toUpperCase() + cuisine.slice(1) : 'Another'} spot (example)`, why: 'A made-up example', price: '$$', note: 'walk-in' }, { name: `${cuisine ? cuisine[0].toUpperCase() + cuisine.slice(1) : 'Second'} kitchen (example)`, why: 'Another example', price: '$$$', note: 'book ahead', opentable: true }] }) };
  if (!(env.ANTHROPIC_API_KEY || env.__anthropic)) return { error: 'outings need the Anthropic key on the connector (ANTHROPIC_API_KEY)' };
  const month = now.toISOString().slice(0, 7), key = `outingruns:${fam.fid}:${month}`;
  const runs = (await db.get(key)) || [];
  const cap = Math.max(1, +env.OUTING_MAX_RUNS || 20) * 3; // swaps are small: three per outing on average
  if (runs.length >= cap) return { error: 'that\'s a lot of planning this month — more next month' };
  const { text, usage } = await askClaude(env, swapPrompt({ area, day, time, kind, cuisine, avoid }), { city: from, maxUses: 3, maxTokens: 3000 });
  await db.put(key, [...runs, { at: Date.now(), swap: true, ...usage }], 62 * 86400);
  const options = shape(parseScout(text));
  return options.length ? { options } : { error: "Couldn't find any — try another cuisine" };
}

// The on-phone demo has no Claude: a made-up example so the screens can be tried.
const DEMO_ANSWER = (text) => ({
  title: `${text.split(/[,.]/)[0]} (example)`, area: text,
  getting: [{ mode: 'train', text: 'Example: train 13:08, then a 15-minute local connection', depart: '13:08' }],
  back: 'Example: last good train home around 22:30', parking: 'Example: a garage two blocks from the first stop',
  stops: [
    { time: '14:45', kind: 'coffee', name: 'Corner café', why: 'An example stop', where: 'Main St', price: '$', note: 'walk-in' },
    { time: '15:15', kind: 'walk', name: 'Neighborhood walk', why: 'Shops and murals', where: 'Main St to the park' },
    { time: '17:30', kind: 'drinks', name: 'Garden bar', why: 'A patio for golden hour', price: '$$', note: 'walk-in' },
    { time: '19:30', kind: 'dinner', name: 'Neighborhood bistro', why: 'Seasonal menu', price: '$$$', note: 'book ahead' },
  ],
  options: { eat: [{ kind: 'dinner', name: 'Dumpling house', why: 'Quick and great', price: '$$', note: '20-min wait on weekends' }, { kind: 'drinks', name: 'Wine bar', why: 'Small and cozy', price: '$$' }], do: [{ kind: 'museum', name: 'Small gallery', why: 'Free on Saturdays' }] },
  tips: ['This is a made-up example — the live app plans it for real with Claude and web search.'],
});
