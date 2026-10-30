// 🚗 Drive times with live traffic for "Ask about my day" (T3): where a place is, whether it's open,
// and how long the drive is from where you are now — Google Maps Platform (Places API (New) Text
// Search + Routes API route matrix). The phone sends your position (rounded to ~100 m), up to 3
// place names or addresses, and up to 4 departure times; nothing else, and nothing is kept. The
// answer goes back to the phone, which adds it to the day's facts for Claude. The family key never
// comes here and Google never sees names (the phone leaves out places that mention a person).
// Needs the GOOGLE_MAPS_KEY secret (Places API (New) and Routes API enabled); 501 without it.
const PLACES = 'https://places.googleapis.com/v1/places:searchText';
const MATRIX = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
export const TRAVEL_PER_DAY = 30;

const round3 = (n) => Math.round(n * 1000) / 1000;
const err = (message, status) => Object.assign(new Error(message), { status });

// What the phone may send, cleaned: position, places, departures (now, or within the next 36 hours).
export function cleanTravel(body = {}, now = Date.now()) {
  const lat = +body.from?.lat, lng = +body.from?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw err('where are you starting from?', 400);
  const places = [...new Set((Array.isArray(body.places) ? body.places : []).map((q) => String(q || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter((q) => q.length >= 3))].slice(0, 3);
  if (!places.length) throw err('which place?', 400);
  const leaves = (Array.isArray(body.leaves) ? body.leaves : [null]).slice(0, 4).map((x) => {
    if (x == null || x === 'now') return null;
    const t = Date.parse(x);
    return Number.isFinite(t) && t > now + 60_000 && t < now + 36 * 3600e3 ? new Date(t).toISOString() : undefined;
  }).filter((x) => x !== undefined);
  const dow = Number.isInteger(body.dow) && body.dow >= 0 && body.dow <= 6 ? body.dow : new Date(now).getUTCDay();
  return { from: { lat: round3(lat), lng: round3(lng) }, places, leaves: leaves.length ? [...new Set(leaves)] : [null], dow };
}

async function google(env, url, mask, payload) {
  const r = await (env.__fetch || fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': mask }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw err(`Google Maps: ${String(j?.error?.message || j?.[0]?.error?.message || r.status).slice(0, 160)}`, r.status === 403 || r.status === 400 ? 502 : 503);
  return j;
}

// One place: the best match near you, with today's hours (Google lists Monday first).
async function findPlace(env, q, from, dow) {
  const j = await google(env, PLACES, 'places.displayName,places.formattedAddress,places.location,places.currentOpeningHours.openNow,places.currentOpeningHours.weekdayDescriptions',
    { textQuery: q, locationBias: { circle: { center: { latitude: from.lat, longitude: from.lng }, radius: 50000 } } });
  const p = j?.places?.[0];
  if (!p?.location) return { q, found: false };
  const hours = p.currentOpeningHours?.weekdayDescriptions?.[(dow + 6) % 7];
  return {
    q, found: true, name: String(p.displayName?.text || q).slice(0, 80), address: String(p.formattedAddress || '').slice(0, 140), at: p.location,
    ...(typeof p.currentOpeningHours?.openNow === 'boolean' ? { openNow: p.currentOpeningHours.openNow } : {}),
    ...(hours ? { hoursToday: String(hours).replace(/^[A-Za-z]+:\s*/, '').replace(/ | /g, ' ').slice(0, 80) } : {}),
  };
}

// Drive minutes from you to each found place, leaving at each time (now = live traffic; later =
// Google's traffic prediction for that time).
async function driveTimes(env, from, found, leave) {
  const j = await google(env, MATRIX, 'originIndex,destinationIndex,duration,distanceMeters,condition,status', {
    origins: [{ waypoint: { location: { latLng: { latitude: from.lat, longitude: from.lng } } } }],
    destinations: found.map((p) => ({ waypoint: { location: { latLng: { latitude: p.at.latitude, longitude: p.at.longitude } } } })),
    travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', ...(leave ? { departureTime: leave } : {}),
  });
  const out = new Map();
  for (const e of Array.isArray(j) ? j : []) {
    const s = /^(\d+(?:\.\d+)?)s$/.exec(e?.duration || '');
    if (s && (!e.condition || e.condition === 'ROUTE_EXISTS')) out.set(e.destinationIndex ?? 0, { minutes: Math.max(1, Math.round(+s[1] / 60)), miles: e.distanceMeters ? Math.round(e.distanceMeters / 160.9) / 10 : null });
  }
  return out;
}

export async function travel(env, input) {
  const places = [];
  for (const q of input.places) places.push(await findPlace(env, q, input.from, input.dow));
  const found = places.filter((p) => p.found);
  for (const p of found) p.drives = [];
  for (const leave of input.leaves) {
    if (!found.length) break;
    const m = await driveTimes(env, input.from, found, leave);
    found.forEach((p, i) => { const d = m.get(i); if (d) p.drives.push({ leave: leave || 'now', ...d }); });
  }
  return { places: places.map(({ at, ...p }) => p) };
}

// POST /travel — signed in; 30 a day each; nothing stored but the rate counter.
export async function travelRoutes({ path, method, env, json, body, user, underLimit, db }) {
  if (path !== '/travel' || method !== 'POST') return null;
  if (!env.GOOGLE_MAPS_KEY) return json({ error: "drive times aren't set up on the connector", off: true }, 501);
  let input;
  try { input = cleanTravel(body); } catch (e) { return json({ error: e.message }, e.status || 400); }
  if (!(await underLimit(db, `rate:${user.uid}:travel:${new Date().toISOString().slice(0, 10)}`, TRAVEL_PER_DAY, 86400 * 2))) return json({ error: "that's all the drive times for today" }, 429);
  try { return json(await travel(env, input)); } catch (e) { return json({ error: e.message || "Couldn't reach Google Maps" }, e.status || 502); }
}
