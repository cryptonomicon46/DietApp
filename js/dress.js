// 👔 Dress for the day: where each of you will be (from the calendar, else home in San Jose)
// and how to layer for that place's weather from leaving in the morning to getting home.
// Pure (no storage, no network), so it's tested.

// Built-in places. `keys` are what a calendar event's title or location can say to mean it.
export const HOME_PLACE = 'sj';
export const PLACES = [
  { id: 'sj', name: 'San Jose', lat: 37.3946, lon: -121.9050, keys: ['san jose', '95131', '95134', '95110', '95112', '95113', 'north first', 'n 1st'] },
  { id: 'sf', name: 'San Francisco', lat: 37.7793, lon: -122.4193, keys: ['san francisco', 'sf', 's.f.', 'soma', 'embarcadero', 'market st', 'financial district'] },
  { id: 'oak', name: 'Oakland', lat: 37.8044, lon: -122.2712, keys: ['oakland', 'jack london', 'lake merritt'] },
];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The place a piece of text names, if any (whole words, so "sf" doesn't match "transfer").
export function matchPlace(text, places = PLACES) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const find = (keysOf) => {
    let best = null;
    for (const p of places) for (const k of keysOf(p)) {
      if (!k) continue;
      const at = t.search(new RegExp(`(^|[^a-z0-9])${escRe(k)}(?=$|[^a-z0-9])`));
      if (at >= 0 && (!best || at < best.at)) best = { place: p, at };
    }
    return best?.place || null;
  };
  // A city's name beats a street or neighbourhood ("Market St, Oakland" is Oakland).
  return find((p) => [p.name.toLowerCase().split(',')[0]]) || find((p) => p.keys || []);
}

// The town in an address, for anywhere that isn't one of the places above: "31655 Chicoine Ave.,
// Hayward CA, United States" → "Hayward"; "Hayward, CA 94544" → "Hayward". '' when there's no
// address-looking text (a title like "Dinner" isn't a place).
export function townOf(address) {
  const parts = String(address || '').split(',').map((x) => x.trim()).filter(Boolean).filter((x) => !/^(united states|usa|us)$/i.test(x));
  if (parts.length < 2) return '';
  for (let i = parts.length - 1; i > 0; i--) {
    const st = parts[i].match(/^(.*?)\s*\b([A-Z]{2})\b(\s+\d{5}(-\d{4})?)?$/);
    if (!st) continue;
    const town = (st[1] || parts[i - 1]).replace(/\d+/g, '').trim();
    return /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(town) ? town : '';
  }
  const last = parts[parts.length - 1].replace(/\d+/g, '').trim();
  return /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(last) && parts.length >= 2 ? last : '';
}

const toH = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h + (m || 0) / 60; };
const mine = (e, person) => e.who === person || e.who === 'both' || (!e.who && e.by === person);
// Where `person` is on `date` and roughly when they leave and get home.
// events: that day's events (already expanded for repeats); pick: a place id chosen by hand.
export function whereOn(events, person, places = PLACES, pick = null) {
  const own = events.filter((e) => mine(e, person));
  const timed = own.filter((e) => !e.allDay && e.start && toH(e.start) >= 5 && toH(e.start) < 22);
  let place = null, from = null;
  for (const e of [...timed, ...own.filter((x) => x.allDay)]) {
    const p = matchPlace(`${e.place || ''} ${e.title || ''}`, places);
    if (p) { place = p; from = e; break; }
  }
  // Something on the calendar, but somewhere we don't know: still the day's plan (home weather).
  if (!from) from = timed.find((e) => String(e.place || "").trim()) || null;
  const byPick = pick && places.find((p) => p.id === pick);
  if (byPick) { place = byPick; from = null; }
  // Leave an hour before the first thing, home an hour after the last (8 AM–6 PM otherwise).
  let leave = 8, back = 18;
  if (timed.length) {
    leave = Math.min(...timed.map((e) => toH(e.start))) - 1;
    back = Math.max(...timed.map((e) => (e.end ? toH(e.end) : toH(e.start) + 1))) + 1;
  }
  leave = Math.round(Math.max(6, Math.min(leave, 10)));
  back = Math.round(Math.max(Math.max(leave + 6, 15), Math.min(back, 21)));
  return { place: place || places.find((p) => p.id === HOME_PLACE) || places[0], event: from, picked: !!byPick, leave, back, fromCalendar: !!from, placeFound: !!place };
}

// How much clothing a "feels like" temperature (°F) calls for, 0 (hot) to 5 (very cold).
export function warmthLevel(feels) {
  return feels >= 78 ? 0 : feels >= 68 ? 1 : feels >= 60 ? 2 : feels >= 50 ? 3 : feels >= 40 ? 4 : 5;
}
const BASE = ['Breathable tee or linen shirt', 'T-shirt or light shirt', 'Long-sleeve shirt or light knit', 'Long-sleeve shirt (merino if you have it)', 'Long-sleeve shirt (merino if you have it)', 'Warm long-sleeve base layer'];
const MID = { 2: 'Light cardigan or overshirt', 3: 'Light sweater or quarter-zip', 4: 'Warm sweater or fleece', 5: 'Warm sweater or fleece' };
const OUTER = { 3: 'Light jacket (denim, bomber or shacket)', 4: 'Insulated jacket or wool coat', 5: 'Warm coat, plus scarf and gloves' };
const clock = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

// hours: [{time: Date, feels, temp, rain, wind, uv}] for the day; leave / back: hours (0–23).
export function dressFor(hours, leave = 8, back = 18) {
  const day = hours.filter((h) => h.time.getHours() >= leave && h.time.getHours() <= back);
  if (day.length < 2) return null;
  const at = (hr) => day.reduce((a, h) => (Math.abs(h.time.getHours() - hr) < Math.abs(a.time.getHours() - hr) ? h : a));
  const f = (h) => Math.round(h.feels ?? h.temp);
  const morning = at(leave), evening = at(back);
  const peakH = day.reduce((a, h) => (f(h) > f(a) ? h : a));
  const low = Math.min(...day.map(f)), peak = f(peakH);
  const rain = Math.max(...day.map((h) => h.rain || 0));
  const wind = Math.max(...day.map((h) => h.wind || 0));
  const uv = Math.max(...day.map((h) => h.uv || 0));
  const lo = warmthLevel(low), hi = warmthLevel(peak);
  const swing = lo - hi >= 2 || peak - low >= 18;
  const coolsAgain = f(evening) < peak - 8;
  const shape = swing ? (coolsAgain ? 'swing' : 'warms') : hi === 0 && lo <= 1 ? 'hot' : lo >= 4 ? 'cold' : 'steady';
  const label = {
    swing: 'Cool start, warm midday, cool again by evening',
    warms: 'Cool start, warm the rest of the day',
    hot: 'Hot all day',
    cold: 'Cold all day',
    steady: lo <= 1 ? 'Warm and steady all day' : lo === 2 ? 'Mild and steady all day' : 'Cool and steady all day',
  }[shape];

  const layers = [{ icon: '👕', text: BASE[hi] }];
  // Each layer is worn while it feels cooler than `below`; on a swing day the jacket stays packable.
  if (MID[lo]) layers.push({ icon: '🧶', name: lo === 2 ? 'light layer' : 'sweater', text: MID[lo], below: 66 });
  // 50–59°F: a light sweater does it; the light jacket only when it dips under 55°F.
  if (OUTER[lo] && (lo >= 4 || low < 55)) layers.push({ icon: '🧥', name: 'jacket', text: swing && lo === 4 ? 'Warm but packable jacket (light puffer or fleece-lined)' : OUTER[lo], below: 58 });
  if (rain >= 40) {
    const o = layers.find((l) => l.icon === '🧥');
    if (o) o.text = `${o.text} — waterproof if you have one`; else layers.push({ icon: '🧥', text: 'Light rain jacket with a hood' });
  } else if (wind >= 15 && lo >= 2 && !layers.some((l) => l.icon === '🧥')) layers.push({ icon: '🧥', text: `Windbreaker (gusty, ${Math.round(wind)} mph)` });
  // Layer-off / layer-on times: when the feels-like crosses what each layer is for.
  const offAt = (below) => day.find((h) => h.time > morning.time && h.time <= peakH.time && f(h) >= below);
  const onAt = (below) => day.find((h) => h.time > peakH.time && f(h) < below);
  const steps = [];
  for (const l of [...layers].reverse()) {
    if (!l.below || f(morning) >= l.below) continue;
    const o = offAt(l.below);
    if (!o) continue;
    l.carry = true;
    const n = onAt(l.below);
    steps.push(`${l.name} off around ${clock(o.time.getHours())}${n ? `, back on by ${clock(n.time.getHours())}` : ''}`);
  }
  const when = steps.length ? `${steps.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '';
  const extras = [];
  if (rain >= 40) extras.push(`☔ Umbrella — ${rain}% chance of rain`);
  else if (rain >= 20) extras.push(`☂️ Compact umbrella just in case (${rain}%)`);
  if (uv >= 6) extras.push(`🕶️ Sunglasses and sunscreen (UV ${Math.round(uv)})`);
  if (shape === 'hot') extras.push('💧 Light, breathable fabrics and a water bottle');
  if (lo >= 4) extras.push('🧦 Closed shoes and warm socks');
  const short = layers.map((l) => l.text.split(/ \(| or |,| —/)[0].toLowerCase()).join(' + ');
  return {
    shape, label, layers, extras, when,
    temps: { leave: { hour: morning.time.getHours(), f: f(morning) }, peak: { hour: peakH.time.getHours(), f: peak }, back: { hour: evening.time.getHours(), f: f(evening) }, low },
    rain, wind: Math.round(wind), uv: Math.round(uv),
    summary: `${short[0].toUpperCase()}${short.slice(1)}${when ? ` · ${when.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}` : ''}`,
  };
}
export { clock as hourLabel };
