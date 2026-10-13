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
  if (minutes < 75) perHour = hard ? 30 : type === 'moderate' ? 20 : 0;
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

// Combine logged/synced workouts (or a planned session) into today's adjustments.
// Extra calories go to carbohydrate: protein and fat stay put and carbs follow
// training load (carb periodization, Thomas et al. 2016).
export function trainingDay(workouts, planned, { bmr, weightKg, tracked }) {
  const sessions = workouts.length
    ? workouts.map((w) => ({ ...w, type: w.type || classify(w, weightKg), source: w.source }))
    : planned ? [{ ...planned, source: 'planned' }] : [];

  const extraKcal = tracked ? Math.round(sessions.reduce((s, w) => s + netWorkoutKcal(w, { bmr, weightKg }), 0) / 10) * 10 : 0;

  // Fuel the planned cardio session, unless a synced cardio workout shows it's done.
  const done = planned && sessions.some((s) => s.source !== 'planned' && SESSION_TYPES[s.type]?.cardio && s.minutes >= planned.minutes * 0.6);
  const fuelSession = planned && !done && SESSION_TYPES[planned.type]?.cardio ? planned : null;
  const intra = fuelSession ? intraWorkoutCarbs(fuelSession.type, fuelSession.minutes) : null;

  const cardioMin = sessions.filter((s) => SESSION_TYPES[s.type]?.cardio).reduce((a, s) => a + s.minutes, 0);
  const hardCardio = sessions.some((s) => s.type === 'hard') || cardioMin >= 90;
  const label = !sessions.length ? 'Rest day' : hardCardio ? 'Heavy cardio day' : cardioMin ? 'Cardio day' : 'Training day';
  return { sessions, extraKcal, intra, label, hardCardio };
}

// Apply training adjustments to base daily targets.
export function applyTraining(base, day) {
  const kcal = base.kcal + day.extraKcal;
  const c = base.c + Math.round(day.extraKcal / 4);
  const intraC = day.intra ? Math.min(day.intra.grams, Math.max(c - 50, 0)) : 0;
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
