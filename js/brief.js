// Daily brief: when to run, ride and walk the dogs today (San Jose weather), and the
// Movement classes you take. Scoring is pure so it can be tested without a network.

export const PLACE = { name: 'San Jose', lat: 37.3382, lon: -121.8863 };

// Estimated asphalt temperature (°F). Sun heats dark pavement far above the air: at 77°F
// air in full sun asphalt reaches ~125°F; wind carries some of that heat away.
export function asphaltF(airF, radiation = 0, windMph = 0) {
  return Math.round(airF + (0.058 * Math.max(radiation, 0)) / (1 + 0.03 * Math.max(windMph, 0)));
}

// Paw safety by pavement temperature (the 7-second test: if it's too hot for the back of
// your hand for 7 seconds, it's too hot for paws).
export function pawRisk(asphalt) {
  if (asphalt >= 125) return { level: 'unsafe', label: 'Too hot for paws' };
  if (asphalt >= 115) return { level: 'caution', label: 'Hot — keep to shade or grass' };
  if (asphalt <= 28) return { level: 'caution', label: 'Very cold pavement' };
  return { level: 'ok', label: 'Paw-safe' };
}

// One hour's conditions → 0–100 for each activity, with the main reasons it lost points.
// h = { time: Date, temp, feels, rain (probability %), wind, gust, uv, radiation, isDay, aqi }
const band = (x, lo, hi, per) => (x < lo ? (lo - x) * per : x > hi ? (x - hi) * per : 0);

export function scoreHour(h, activity) {
  const why = [];
  let s = 100;
  const hit = (pts, reason) => { if (pts > 0.5) { s -= pts; if (pts >= 8) why.push(reason); } };
  const hour = h.time.getHours();
  if (activity === 'run') {
    hit(band(h.feels, 42, 62, 2.2), h.feels > 62 ? `warm (${Math.round(h.feels)}°F)` : `cold (${Math.round(h.feels)}°F)`);
    hit(h.rain * 0.6, `${h.rain}% rain`);
    hit(Math.max(h.wind - 12, 0) * 2, `wind ${Math.round(h.wind)} mph`);
    hit(Math.max((h.aqi ?? 0) - 50, 0) * 0.5, `AQI ${h.aqi}`);
    hit(h.isDay ? Math.max(h.uv - 6, 0) * 4 : 0, `UV ${Math.round(h.uv)}`);
    hit(h.isDay ? 0 : 12, 'dark');
  } else if (activity === 'bike') {
    hit(band(h.feels, 52, 75, 2), h.feels > 75 ? `hot (${Math.round(h.feels)}°F)` : `chilly (${Math.round(h.feels)}°F)`);
    hit(h.rain * 0.8, `${h.rain}% rain`);
    hit(Math.max(h.wind - 8, 0) * 3 + Math.max((h.gust ?? h.wind) - 18, 0) * 1.5, `wind ${Math.round(h.wind)} mph`);
    hit(Math.max((h.aqi ?? 0) - 50, 0) * 0.5, `AQI ${h.aqi}`);
    hit(h.isDay ? Math.max(h.uv - 7, 0) * 3 : 60, h.isDay ? `UV ${Math.round(h.uv)}` : 'dark');
  } else {
    const asphalt = asphaltF(h.temp, h.radiation, h.wind);
    hit(asphalt >= 125 ? 70 : asphalt >= 115 ? 25 : 0, `pavement ~${asphalt}°F`);
    hit(band(h.feels, 35, 78, 2), h.feels > 78 ? `hot (${Math.round(h.feels)}°F)` : `cold (${Math.round(h.feels)}°F)`);
    hit(h.rain * 0.7, `${h.rain}% rain`);
    hit(Math.max((h.aqi ?? 0) - 100, 0) * 0.5, `AQI ${h.aqi}`);
    hit(h.isDay ? 0 : 10, 'dark');
  }
  // Outside waking hours (before 5 AM, after 9:30 PM) isn't a real option.
  if (hour < 5 || hour > 21) s -= 100;
  return { score: Math.max(0, Math.round(s)), why };
}

// Best window of `hours` consecutive hours between `from` and `until` (indexes into hourly).
export function bestWindow(hourly, activity, hours, from = 0, until = hourly.length) {
  let best = null;
  for (let i = from; i + hours <= until; i++) {
    const slice = hourly.slice(i, i + hours);
    const scores = slice.map((h) => scoreHour(h, activity));
    const score = Math.min(...scores.map((x) => x.score)) * 0.6 + (scores.reduce((a, x) => a + x.score, 0) / hours) * 0.4;
    if (!best || score > best.score + 0.5) best = { start: i, hours, score: Math.round(score), why: [...new Set(scores.flatMap((x) => x.why))] };
  }
  return best;
}

// Two dog walks: the best morning (5–11) and evening (16–21) hours.
export function dogWalks(hourly, from = 0) {
  const pick = (lo, hi) => {
    let best = null;
    hourly.forEach((h, i) => {
      if (i < from) return;
      const hr = h.time.getHours();
      if (hr < lo || hr > hi || h.time.getDate() !== hourly[from].time.getDate()) return;
      const s = scoreHour(h, 'dog').score;
      if (!best || s > best.score) best = { index: i, score: s };
    });
    return best;
  };
  return { morning: pick(5, 11), evening: pick(16, 21) };
}

// The hottest pavement hour today, for a heads-up.
export function hottestPavement(hourly, from = 0) {
  let worst = null;
  for (let i = from; i < hourly.length; i++) {
    const h = hourly[i];
    if (h.time.getDate() !== hourly[from].time.getDate()) break;
    const a = asphaltF(h.temp, h.radiation, h.wind);
    if (!worst || a > worst.asphalt) worst = { index: i, asphalt: a };
  }
  return worst;
}

// Open-Meteo forecast + air quality JSON → hourly records. Missing radiation falls back to
// a rough estimate from daylight and cloud cover.
export function parseWeather(forecast, air) {
  const H = forecast.hourly;
  const aqiAt = new Map((air?.hourly?.time || []).map((t, i) => [t, air.hourly.us_aqi?.[i]]));
  return H.time.map((t, i) => ({
    time: new Date(t),
    temp: H.temperature_2m[i],
    feels: H.apparent_temperature?.[i] ?? H.temperature_2m[i],
    rain: H.precipitation_probability?.[i] ?? 0,
    wind: H.wind_speed_10m?.[i] ?? 0,
    gust: H.wind_gusts_10m?.[i] ?? null,
    uv: H.uv_index?.[i] ?? 0,
    isDay: H.is_day ? !!H.is_day[i] : new Date(t).getHours() >= 7 && new Date(t).getHours() < 19,
    radiation: H.shortwave_radiation?.[i] ?? ((H.is_day?.[i] ? 700 : 0) * (1 - (H.cloud_cover?.[i] ?? 0) / 100)),
    aqi: aqiAt.get(t) ?? null,
  }));
}

export function weatherUrls(place = PLACE) {
  const common = `latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=2`;
  return {
    forecast: `https://api.open-meteo.com/v1/forecast?${common}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,wind_gusts_10m,uv_index,shortwave_radiation,cloud_cover,is_day&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph`,
    air: `https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=us_aqi`,
  };
}

// Movement gyms: your usual classes (you add them once) + links to the live schedule.
export const GYMS = {
  santaClara: { name: 'Movement Santa Clara', short: 'Santa Clara', url: 'https://movementgyms.com/santa-clara/calendar/#activity=fitness&location=santa-clara', address: '801 Martin Ave, Santa Clara' },
  sunnyvale: { name: 'Movement Sunnyvale', short: 'Sunnyvale', url: 'https://movementgyms.com/sunnyvale/calendar/#activity=fitness&location=sunnyvale', address: '815 Stewart Dr, Sunnyvale' },
};
export const CLASS_TYPES = { yoga: '🧘 Yoga', fitness: '🏋️ Fitness', climbing: '🧗 Climbing' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function classesOn(classes, date) {
  const d = date.getDay();
  return classes.filter((c) => c.days.includes(d)).sort((a, b) => a.time.localeCompare(b.time));
}

// ---------- feeding the dogs ----------
// Two feedings a day on Pacific time: breakfast from 4 AM, dinner from 4 PM (until 4 AM).
export function ptParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour };
}
export const DINNER_HOUR = 16;
export function feedingSlot(date = new Date()) {
  const { date: d, hour } = ptParts(date);
  if (hour >= 4 && hour < DINNER_HOUR) return { key: `${d}:breakfast`, meal: 'breakfast', resets: 'at 4 PM' };
  if (hour >= DINNER_HOUR) return { key: `${d}:dinner`, meal: 'dinner', resets: 'at 4 AM' };
  const prev = ptParts(new Date(date.getTime() - 5 * 3600000)).date; // before 4 AM: still last night's dinner
  return { key: `${prev}:dinner`, meal: 'dinner', resets: 'at 4 AM' };
}
// One walk a day: the walking day starts at 6 AM Pacific and runs until 6 AM the next day.
export const WALK_HOUR = 6;
export function walkDay(date = new Date()) {
  return ptParts(new Date(date.getTime() - (ptParts(date).hour < WALK_HOUR ? (WALK_HOUR + 1) * 3600000 : 0))).date;
}
// records: [{ person, name, fed: {slotKey: {at}} }] → who fed for this slot (earliest), if anyone.
export function whoFed(records, key) {
  const hits = records.flatMap((r) => (r.fed?.[key] ? [{ person: r.person, name: r.name, at: r.fed[key].at }] : []));
  return hits.sort((a, b) => a.at - b.at)[0] || null;
}

// ---------- dog duty scoreboard ----------
// A person's log of one chore: {day: [timestamps]}. Older walk check-ins were {day: {at}}.
export function choreTimes(log) {
  return Object.fromEntries(Object.entries(log || {}).map(([day, v]) => [day, Array.isArray(v) ? v : v?.at ? [v.at] : []]));
}
// records: [{ person, name, fed: {slotKey: {at}}, walks: {day: [at]}, park: {day: [at]} }]
// → { person: { feed, walk, park, total } } for keys starting with `prefix` ('2026', '2026-10', '2026-10-16').
// A feeding counts once, for whoever did it first.
export function choreTally(records, prefix) {
  const t = Object.fromEntries(records.map((r) => [r.person, { feed: 0, walk: 0, park: 0, total: 0 }]));
  const slots = new Set(records.flatMap((r) => Object.keys(r.fed || {})).filter((k) => k.startsWith(prefix)));
  for (const k of slots) { const w = whoFed(records, k); if (w) t[w.person].feed++; }
  for (const r of records) {
    for (const [kind, key] of [['walk', 'walks'], ['park', 'park']]) {
      for (const [day, times] of Object.entries(choreTimes(r[key]))) if (day.startsWith(prefix)) t[r.person][kind] += times.length;
    }
  }
  for (const p in t) t[p].total = t[p].feed + t[p].walk + t[p].park;
  return t;
}
// The month's winner: most feedings + walks + park trips. A tie (or an empty month) has no winner.
export function monthWinner(records, month) {
  const t = choreTally(records, month);
  const ranked = Object.entries(t).sort((a, b) => b[1].total - a[1].total);
  const [first, second] = ranked;
  const winner = first && first[1].total > 0 && (!second || first[1].total > second[1].total) ? first[0] : null;
  return { month, winner, tie: !winner && !!first && first[1].total > 0, tally: t };
}
// Finished months of `year` before `currentMonth` ('YYYY-MM'), each with its winner; a gold coin each.
export function coinsForYear(records, year, currentMonth) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (key >= currentMonth) break;
    months.push(monthWinner(records, key));
  }
  const coins = Object.fromEntries(records.map((r) => [r.person, 0]));
  for (const m of months) if (m.winner) coins[m.winner]++;
  return { months, coins };
}

// ---------- happy dog days ----------
// Both people's walks and park trips per day → { day: { walks, park, outings, best } }.
// A best day ⭐ has two or more outings: two walks, or a walk and the dog park.
export function dogDays(records) {
  const days = {};
  for (const r of records) {
    for (const [kind, key] of [['walks', 'walks'], ['park', 'park']]) {
      for (const [day, times] of Object.entries(choreTimes(r[key]))) {
        if (!times.length) continue;
        days[day] ||= { walks: 0, park: 0 };
        days[day][kind] += times.length;
      }
    }
  }
  for (const d of Object.values(days)) { d.outings = d.walks + d.park; d.best = d.outings >= 2; }
  return days;
}
// Days out and best days for keys starting with `prefix`; the best-day streak runs back from `today`.
export function happyStats(days, prefix, today) {
  const keys = Object.keys(days).filter((d) => d.startsWith(prefix));
  let streak = 0;
  const d = new Date(`${today}T12:00:00`);
  if (!days[today]?.best) d.setDate(d.getDate() - 1); // today isn't over yet
  for (;;) {
    const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (!days[k]?.best) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { out: keys.filter((k) => days[k].outings > 0).length, best: keys.filter((k) => days[k].best).length, streak };
}
// Best days per month of `year` (up to `month`), and the happiest month.
export function happyMonths(days, year, month) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (key > month) break;
    months.push({ month: key, ...happyStats(days, key, `${key}-01`) });
  }
  const top = Math.max(0, ...months.map((m) => m.best));
  return { months, happiest: top ? months.find((m) => m.best === top).month : null };
}
