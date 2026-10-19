// Training-day adjustments: workout calories, carb periodization and
// intra-workout fueling. References are listed in js/research.js.

// Wrist wearables mis-estimate energy expenditure by 20–90% (Shcherbina 2017),
// so only "eat back" a conservative share of the net workout calories.
export const WEARABLE_EAT_BACK = 0.75;

// Planned sessions use Compendium of Physical Activities MET values (Ainsworth 2011).
export const SESSION_TYPES = {
  strength: { label: 'Strength training', met: 5.0, cardio: false },
  easy:     { label: 'Easy cardio (walk, zone 2)', met: 4.5, cardio: true },
  moderate: { label: 'Moderate cardio (steady run / ride / swim)', met: 8.0, cardio: true },
  hard:     { label: 'Hard cardio (intervals, tempo, long ride)', met: 10.0, cardio: true },
};

// Activities you can add. MET at a moderate effort from the 2011 Compendium of Physical
// Activities (Ainsworth et al.); `fuel` = endurance work that can need intra-workout carbs.
// `match` maps WHOOP / Garmin activity names to the sport.
export const SPORTS = {
  running:       { name: 'Running',          met: 9.8, fuel: true,  match: /run|jog|track/i },
  cycling:       { name: 'Cycling',          met: 8.0, fuel: true,  match: /cycl|bike|biking|spin|peloton|ride/i },
  // A gym session (bouldering, top rope, lead) is mostly rest between climbs, so lower than steady climbing (7.5).
  climbing:      { name: 'Rock climbing',    met: 5.8, fuel: false, match: /climb|boulder/i },
  weightlifting: { name: 'Weight lifting',   met: 5.0, fuel: false, match: /weight|strength|lift|powerlift|bodybuild|functional/i },
  hiit:          { name: 'HIIT / circuits',  met: 8.0, fuel: false, match: /hiit|circuit|crossfit|interval|bootcamp/i },
  swimming:      { name: 'Swimming',         met: 5.8, fuel: true,  match: /swim/i },
  rowing:        { name: 'Rowing',           met: 7.0, fuel: true,  match: /row(ing|er)?\b/i },
  hiking:        { name: 'Hiking',           met: 6.0, fuel: true,  match: /hik|rucking|ruck/i },
  walking:       { name: 'Walking',          met: 3.5, fuel: false, match: /walk/i },
  elliptical:    { name: 'Elliptical',       met: 5.0, fuel: true,  match: /ellip|stair|stepper/i },
  tennis:        { name: 'Tennis',           met: 7.3, fuel: false, match: /tennis|pickleball|squash|padel|racquet/i },
  basketball:    { name: 'Basketball',       met: 6.5, fuel: false, match: /basketball/i },
  soccer:        { name: 'Soccer',           met: 7.0, fuel: true,  match: /soccer|football/i },
  skiing:        { name: 'Skiing / snowboarding', met: 5.3, fuel: false, match: /ski|snowboard/i },
  // Hot / Bikram yoga runs higher than regular yoga (heat raises heart rate; Pate & Buono 2014).
  hotYoga:       { name: 'Hot yoga',         met: 5.0, fuel: false, match: /hot yoga|bikram|power yoga/i },
  yoga:          { name: 'Yoga',             met: 2.5, fuel: false, match: /yoga|stretch|mobility/i },
  pilates:       { name: 'Pilates',          met: 3.0, fuel: false, match: /pilates|barre/i },
};

export const INTENSITY = { easy: { label: 'Easy', factor: 0.8 }, moderate: { label: 'Moderate', factor: 1 }, hard: { label: 'Hard', factor: 1.2 } };

export function sportOf(name = '') {
  return Object.keys(SPORTS).find((k) => SPORTS[k].match.test(name)) || null;
}

// Your personal burn rate per sport, from every workout you've imported (WHOOP export,
// Garmin CSV or sync). Median kcal/min resists the odd mis-tracked session.
export function sportStats(history) {
  const by = {};
  for (const w of history) {
    const k = sportOf(w.name);
    if (!k || !w.kcal || !w.minutes || w.minutes < 5) continue;
    (by[k] ||= []).push(w);
  }
  const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return Object.fromEntries(Object.entries(by).map(([k, ws]) => [k, {
    sessions: ws.length,
    kcalPerMin: +median(ws.map((w) => w.kcal / w.minutes)).toFixed(2),
    typicalMin: Math.round(median(ws.map((w) => w.minutes)) / 5) * 5,
    strain: ws.some((w) => w.strain != null) ? +median(ws.filter((w) => w.strain != null).map((w) => w.strain)).toFixed(1) : null,
  }]));
}

// Estimated calories for an activity you add: your own history when there are at least
// 3 sessions of that sport, otherwise the Compendium MET value.
export function estimateActivity(sport, minutes, intensity, { weightKg, stats = {} }) {
  const f = INTENSITY[intensity]?.factor ?? 1;
  const mine = stats[sport];
  if (mine && mine.sessions >= 3) {
    return { kcal: Math.round(mine.kcalPerMin * minutes * f), basis: `your ${mine.sessions} ${SPORTS[sport].name.toLowerCase()} sessions`, personal: true };
  }
  return { kcal: Math.round(SPORTS[sport].met * f * weightKg * (minutes / 60)), basis: 'typical values for your weight', personal: false };
}

// Session type used for fuel and day labels.
export function sessionType(sport, intensity) {
  if (!SPORTS[sport]?.fuel) return 'strength';
  return intensity === 'hard' ? 'hard' : intensity === 'easy' ? 'easy' : 'moderate';
}

const STRENGTH_WORDS = /weight|strength|lift|functional|crossfit|powerlift|bodybuild|hiit strength|pilates|yoga|core/i;

// Intensity of a workout from what the wearable gives us.
export function classify(w, weightKg) {
  if (w.kind === 'strength' || (!w.kind && STRENGTH_WORDS.test(w.name || ''))) return 'strength';
  if (w.strain != null) return w.strain >= 14 ? 'hard' : w.strain >= 10 ? 'moderate' : 'easy';
  if (w.kcal && w.minutes) {
    const met = w.kcal / (weightKg * (w.minutes / 60));
    return met >= 9 ? 'hard' : met >= 6 ? 'moderate' : 'easy';
  }
  return 'moderate';
}

// Net (above resting) calories for one workout.
export function netWorkoutKcal(w, { bmr, weightKg }) {
  const restingDuring = (bmr / 1440) * w.minutes;
  if (w.kcal) return Math.max(w.kcal - restingDuring, 0) * WEARABLE_EAT_BACK;
  const met = SESSION_TYPES[w.type]?.met ?? 6;
  return Math.max(met - 1, 0) * weightKg * (w.minutes / 60) * WEARABLE_EAT_BACK;
}

// Intra-workout carbs by duration (Jeukendrup 2014, Thomas et al. 2016):
//   < 45 min: none needed; 45–75 min: small amounts / mouth rinse;
//   1–2.5 h: 30–60 g/h; > 2.5 h: up to 90 g/h from glucose + fructose.
// While cutting we stay at the lower end unless the session is hard.
export function intraWorkoutCarbs(type, minutes) {
  if (!SESSION_TYPES[type]?.cardio || minutes < 45) return null;
  const hard = type === 'hard';
  let perHour;
  // Under 75 min only hard sessions get a little (a mouth rinse works too); on a cut, skip it otherwise.
  if (minutes < 75) perHour = hard ? 30 : 0;
  else if (minutes <= 150) perHour = hard ? 60 : type === 'moderate' ? 40 : 30;
  else perHour = hard ? 90 : 60;
  if (!perHour) return null;
  const grams = Math.round((perHour * minutes) / 60 / 5) * 5;
  return {
    grams,
    perHour,
    mixed: perHour > 60, // >60 g/h needs glucose + fructose sources
    note: minutes < 75
      ? 'Optional for a session this length — helps if you are training fasted or want to push the pace.'
      : `Aim for ~${perHour} g/hour, starting 15–20 min in and sipping/eating every 15–20 min.`,
    options: fuelOptions(grams, perHour > 60),
  };
}

const FUELS = [
  { carbs: 27, one: 'banana', many: 'bananas' },
  { carbs: 34, one: '20 oz sports drink', many: '20 oz sports drinks' },
  { carbs: 22, one: 'energy gel', many: 'energy gels' },
  { carbs: 18, one: 'Medjool date', many: 'Medjool dates' },
  { carbs: 17, one: 'tbsp honey', many: 'tbsp honey' },
];

const half = (n) => (n % 1 ? `${Math.floor(n) || ''}½` : `${n}`);

function fuelOptions(grams, mixed) {
  const opts = FUELS.map((f) => {
    const n = Math.max(1, Math.round((grams / f.carbs) * 2) / 2);
    return { label: `${half(n)} ${n > 1 ? f.many : f.one}`, carbs: f.carbs };
  });
  if (mixed) {
    // Sports drinks + fruit give a glucose:fructose mix for rates above 60 g/h.
    const drinks = Math.max(1, Math.round((grams * 0.6) / 34));
    const bananas = Math.max(1, Math.round((grams - drinks * 34) / 27));
    opts.unshift({ label: `${drinks} sports drink${drinks > 1 ? 's' : ''} + ${bananas} banana${bananas > 1 ? 's' : ''} (glucose + fructose mix)`, carbs: null });
  }
  return opts;
}

// Combine synced/imported workouts with activities you add yourself (any number per day).
// An added activity is skipped when a synced workout already covers it (same kind —
// cardio vs strength — and at least 60% of the minutes), so WHOOP / Garmin calories
// aren't double counted. Extra calories go to carbohydrate: protein and fat stay put
// and carbs follow training load (carb periodization, Thomas et al. 2016).
export function trainingDay(workouts, manual = [], { bmr, weightKg, tracked }) {
  const synced = workouts.map((w) => ({ ...w, type: w.type || classify(w, weightKg) }));
  const isCardio = (s) => !!SESSION_TYPES[s.type]?.cardio;
  const used = new Set();
  const added = manual.filter((m) => {
    const i = synced.findIndex((s, k) => !used.has(k) && isCardio(s) === isCardio(m) && s.minutes >= m.minutes * 0.6);
    if (i >= 0) { used.add(i); return false; }
    return true;
  }).map((m) => ({ ...m, source: 'added' }));
  const sessions = [...synced, ...added];

  const extraKcal = tracked ? Math.round(sessions.reduce((s, w) => s + netWorkoutKcal(w, { bmr, weightKg }), 0) / 10) * 10 : 0;

  // Fuel each added cardio session that hasn't shown up from a device yet.
  const fuel = added.filter(isCardio).map((m) => ({ session: m, ...intraWorkoutCarbs(m.type, m.minutes) })).filter((f) => f.grams);
  const intraGrams = fuel.reduce((a, f) => a + f.grams, 0);

  const cardioMin = sessions.filter(isCardio).reduce((a, s) => a + s.minutes, 0);
  const hardCardio = sessions.some((s) => s.type === 'hard') || cardioMin >= 90;
  const label = !sessions.length ? 'Rest day' : hardCardio ? 'Heavy cardio day' : cardioMin ? 'Cardio day' : 'Training day';
  return { sessions, extraKcal, fuel, intraGrams, label, hardCardio };
}

// Apply training adjustments to base daily targets.
export function applyTraining(base, day) {
  const kcal = base.kcal + day.extraKcal;
  const c = base.c + Math.round(day.extraKcal / 4);
  const intraC = Math.min(day.intraGrams || 0, Math.max(c - 50, 0));
  return { ...base, kcal, c, intraC };
}

// ---------- device data normalization ----------

// WHOOP v2 workout record → our workout shape.
export function fromWhoop(r) {
  if (r.score_state && r.score_state !== 'SCORED') return null;
  const minutes = Math.round((new Date(r.end) - new Date(r.start)) / 60000);
  return {
    id: `whoop:${r.id}`,
    source: 'Whoop',
    name: r.sport_name || 'Workout',
    start: r.start,
    minutes,
    kcal: r.score?.kilojoule ? Math.round(r.score.kilojoule / 4.184) : null,
    strain: r.score?.strain ?? null,
    avgHr: r.score?.average_heart_rate ?? null,
  };
}

// Strava detailed activity (Garmin auto-syncs to Strava) → our workout shape.
export function fromStrava(a) {
  return {
    id: `strava:${a.id}`,
    source: 'Garmin via Strava',
    name: a.sport_type || a.type || a.name || 'Workout',
    start: a.start_date_local || a.start_date,
    minutes: Math.round((a.moving_time || a.elapsed_time || 0) / 60),
    kcal: a.calories ? Math.round(a.calories) : a.kilojoules ? Math.round(a.kilojoules) : null,
    avgHr: a.average_heartrate ?? null,
  };
}

// Garmin Connect → Activities → "Export CSV".
export function parseGarminCsv(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iType = col('activity type'), iDate = col('date', 'start time'), iTitle = col('title');
  const iCal = col('calories', 'active calories'), iTime = col('time', 'moving time', 'elapsed time'), iHr = col('avg hr', 'average heart rate');
  if (iDate < 0 || iTime < 0) throw new Error('This doesn\'t look like a Garmin Connect activities export (need Date and Time columns).');
  return rows.slice(1).filter((r) => r[iDate]).map((r, n) => {
    const start = r[iDate].trim().replace(' ', 'T');
    return {
      id: `garmin:${start}:${n}`,
      source: 'Garmin',
      name: (iType >= 0 && r[iType]) || (iTitle >= 0 && r[iTitle]) || 'Workout',
      start,
      minutes: Math.round(durationToMin(r[iTime])),
      kcal: iCal >= 0 ? Math.round(parseFloat(String(r[iCal]).replace(/,/g, ''))) || null : null,
      avgHr: iHr >= 0 ? parseFloat(r[iHr]) || null : null,
    };
  }).filter((w) => w.minutes > 0);
}

// WHOOP app → Data Export → workouts.csv. Column names are matched loosely so small
// wording changes in WHOOP's export don't break the import.
export function parseWhoopCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (test) => head.findIndex(test);
  const iStart = find((h) => h.includes('workout start')) >= 0 ? find((h) => h.includes('workout start')) : find((h) => h.includes('start') && !h.includes('cycle'));
  const iEnd = find((h) => h.includes('workout end')) >= 0 ? find((h) => h.includes('workout end')) : find((h) => h.includes('end') && !h.includes('cycle'));
  const iDur = find((h) => h.includes('duration'));
  const iName = find((h) => h.includes('activity name') || h.includes('sport') || h === 'activity');
  const iStrain = find((h) => h.includes('strain'));
  const iEnergy = find((h) => h.includes('energy') || h.includes('calor') || h.includes('kilojoule'));
  const kj = iEnergy >= 0 && /kj|kilojoule/.test(head[iEnergy]);
  const iHr = find((h) => /(average|avg)\s*(hr|heart)/.test(h));
  if (iStart < 0 || (iDur < 0 && iEnd < 0)) throw new Error('This doesn\'t look like a WHOOP workouts export (need workout start time and duration).');
  return rows.slice(1).filter((r) => r[iStart]).map((r) => {
    const start = r[iStart].trim().replace(' ', 'T');
    const minutes = iDur >= 0 ? parseFloat(r[iDur]) : (new Date(r[iEnd].trim().replace(' ', 'T')) - new Date(start)) / 60000;
    const energy = iEnergy >= 0 ? parseFloat(String(r[iEnergy]).replace(/,/g, '')) : NaN;
    return {
      id: `whoopcsv:${start}`,
      source: 'Whoop',
      name: (iName >= 0 && r[iName]) || 'Workout',
      start,
      minutes: Math.round(minutes),
      kcal: Number.isFinite(energy) ? Math.round(kj ? energy / 4.184 : energy) : null,
      strain: iStrain >= 0 && r[iStrain] !== '' ? parseFloat(r[iStrain]) : null,
      avgHr: iHr >= 0 ? parseFloat(r[iHr]) || null : null,
    };
  }).filter((w) => w.minutes > 0);
}

// "1:02:03" (h:m:s) or "45:12" (m:s) → minutes.
function durationToMin(s) {
  const parts = String(s || '').trim().split(':').map(parseFloat);
  if (parts.some(Number.isNaN)) return 0;
  const [h, m, sec] = parts.length === 3 ? parts : [0, parts[0], parts[1] ?? 0];
  return h * 60 + m + sec / 60;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
