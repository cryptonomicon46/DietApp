// Turns spoken or typed workout notes into actions, entirely on the phone.
//   "squats 3 sets of 5 at 185"          → 3 sets × 5 reps @ 185
//   "bench 135 for 8, 8, 7"              → 3 sets: 8, 8, 7 reps @ 135
//   "add bulgarian split squats 3x10 at 40"
//   "curls 30 pounds 12 reps"            → 1 set
//   "weigh in 161.4"                      → today's weigh-in
//   "move rows after squats", "do RDLs last", "bench first" → reorder today's session
//   "check all sets for calves", "check exercise 3", "done with squats", "check everything" → tick sets
// Several commands can be joined with "and", "then", commas before a new exercise, or periods.
import { EXERCISES, MUSCLES } from './lifting.js';

const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, a: 1, single: 1, double: 2, triple: 3,
};

// "one hundred eighty five" → 185, "twenty five" → 25
function wordsToNumbers(text) {
  return text.replace(/\b((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\s-]+(?:and\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*)\b/g, (m) => {
    let total = 0, cur = 0;
    for (const w of m.split(/[\s-]+/)) {
      if (w === 'and') continue;
      const v = WORDS[w];
      if (v === 100) cur = (cur || 1) * 100; else cur += v;
    }
    total += cur;
    return String(total);
  });
}

// Common names → exercise ids. Longer phrases are matched first.
const ALIASES = [
  ['bulgarian split squat', 'splitSquat'], ['split squat', 'splitSquat'], ['bulgarian', 'splitSquat'],
  ['front squat', 'frontSquat'], ['hack squat', 'hackSquat'], ['goblet squat', 'gobletSquat'], ['back squat', 'backSquat'], ['squat', 'backSquat'],
  ['leg press calf', 'legPressCalf'], ['leg press', 'legPress'], ['leg extension', 'legExtension'], ['lunge', 'walkingLunge'],
  ['romanian deadlift', 'rdl'], ['dumbbell rdl', 'dbRdl'], ['rdl', 'rdl'], ['trap bar', 'trapBar'], ['hex bar', 'trapBar'], ['deadlift', 'deadlift'],
  ['hip thrust', 'hipThrust'], ['seated leg curl', 'seatedCurl'], ['seated curl', 'seatedCurl'], ['leg curl', 'lyingCurl'], ['hamstring curl', 'lyingCurl'], ['back extension', 'backExtension'],
  ['incline dumbbell', 'inclineDb'], ['incline barbell', 'inclineBb'], ['incline bench', 'inclineBb'], ['incline press', 'inclineDb'],
  ['dumbbell bench', 'dbBench'], ['close grip bench', 'closeGrip'], ['close grip', 'closeGrip'], ['bench', 'bench'], ['chest press', 'machinePress'],
  ['dip', 'dips'], ['push up', 'pushUp'], ['pushup', 'pushUp'], ['cable fly', 'cableFly'], ['fly', 'cableFly'], ['pec deck', 'pecDeck'],
  ['barbell row', 'bbRow'], ['dumbbell row', 'dbRow'], ['one arm row', 'dbRow'], ['chest supported row', 'chestRow'], ['cable row', 'cableRow'], ['seated row', 'cableRow'], ['t bar row', 'tBarRow'], ['row', 'bbRow'],
  ['pull up', 'pullUp'], ['pullup', 'pullUp'], ['chin up', 'chinUp'], ['chinup', 'chinUp'], ['lat pulldown', 'latPulldown'], ['pulldown', 'latPulldown'], ['pull down', 'latPulldown'], ['straight arm', 'straightArm'],
  ['overhead press', 'ohp'], ['ohp', 'ohp'], ['military press', 'ohp'], ['shoulder press', 'dbShoulder'], ['dumbbell press', 'dbShoulder'],
  ['cable lateral', 'cableLateral'], ['lateral raise', 'lateralRaise'], ['side raise', 'lateralRaise'], ['lateral', 'lateralRaise'], ['rear delt', 'rearDelt'], ['face pull', 'facePull'],
  ['hammer curl', 'hammerCurl'], ['preacher curl', 'preacherCurl'], ['incline curl', 'inclineCurl'], ['cable curl', 'cableCurl'], ['barbell curl', 'bbCurl'], ['bicep curl', 'dbCurl'], ['biceps curl', 'dbCurl'], ['curl', 'dbCurl'],
  ['pushdown', 'pushdown'], ['push down', 'pushdown'], ['tricep extension', 'overheadExt'], ['overhead extension', 'overheadExt'], ['skull crusher', 'skullcrusher'], ['skullcrusher', 'skullcrusher'],
  ['heel raise', 'heelRaise'], ['bodyweight calf', 'heelRaise'], ['seated calf', 'seatedCalf'], ['calf raise', 'standingCalf'], ['calf', 'standingCalf'],
  ['cable crunch', 'cableCrunch'], ['crunch', 'cableCrunch'], ['leg raise', 'hangingRaise'], ['ab wheel', 'abWheel'], ['rollout', 'abWheel'],
].sort((a, b) => b[0].length - a[0].length);

const singular = (t) => t.replace(/\b(\w+?)(e?s)\b/g, (m, w) => (/(ss|us)$/.test(m) ? m : w)).replace(/\bpresse\b/g, 'press');

// Find the exercise named in a phrase; prefer one already in today's session.
export function matchExercise(phrase, sessionIds = []) {
  const t = singular(` ${phrase.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ')} `);
  for (const [alias, id] of ALIASES) {
    if (t.includes(` ${alias} `) || t.includes(` ${alias}`)) {
      // "squat" while today's plan has a different squat: use the one in the session.
      if (alias.split(' ').length === 1) {
        const same = sessionIds.find((sid) => EXERCISES[sid]?.muscle === EXERCISES[id].muscle && EXERCISES[sid].name.toLowerCase().includes(alias));
        if (same) return same;
      }
      return id;
    }
  }
  // Fall back to word overlap with exercise names.
  let best = null, score = 0;
  for (const [id, ex] of Object.entries(EXERCISES)) {
    const words = singular(ex.name.toLowerCase()).split(/\W+/).filter((w) => w.length > 2);
    const hits = words.filter((w) => t.includes(` ${w}`)).length;
    if (hits > score) { best = id; score = hits; }
  }
  return score ? best : null;
}

// One clause → sets. Returns null if no numbers make sense.
function parseSets(text) {
  const n = '(\\d+(?:\\.\\d+)?)';
  let m;
  // 3 sets of 5 (reps) at 185 / 1 more set of 8
  if ((m = text.match(new RegExp(`${n}\\s*(?:more\\s*|extra\\s*)?sets?\\s*(?:of|x|by)?\\s*${n}\\s*(?:reps?)?(?:\\s*(?:at|with|@|of)\\s*${n})?`)))) {
    return Array.from({ length: Math.min(+m[1], 12) }, () => ({ r: +m[2], w: m[3] != null ? +m[3] : null }));
  }
  // 3x5 at 185 / 3 by 5 at 185 / 3 x 5 185
  if ((m = text.match(new RegExp(`\\b${n}\\s*(?:x|by|times)\\s*${n}(?:\\s*(?:at|with|@)?\\s*${n})?`)))) {
    return Array.from({ length: Math.min(+m[1], 12) }, () => ({ r: +m[2], w: m[3] != null ? +m[3] : null }));
  }
  // 185 for 5, 5, 4  /  185 for 5
  if ((m = text.match(new RegExp(`${n}\\s*(?:for|x)\\s*((?:\\d+\\s*(?:,|and)?\\s*)+)(?:reps?)?`)))) {
    const reps = m[2].match(/\d+/g).map(Number).slice(0, 12);
    return reps.map((r) => ({ r, w: +m[1] }));
  }
  // 5 reps at 185 / 10 reps with 40
  if ((m = text.match(new RegExp(`${n}\\s*reps?\\s*(?:at|with|@|of)\\s*${n}`)))) return [{ r: +m[1], w: +m[2] }];
  // 185 (pounds) 5 reps
  if ((m = text.match(new RegExp(`\\b${n}\\s*(?:pounds?|lbs?)?\\s+${n}\\s*reps?`)))) return [{ r: +m[2], w: +m[1] }];
  // 8, 7, 6 reps (bodyweight / same weight)
  if ((m = text.match(/((?:\d+\s*,\s*)+\d+)\s*reps?\b/))) return m[1].match(/\d+/g).map(Number).slice(0, 12).map((r) => ({ r, w: null }));
  // 12 reps (bodyweight / same weight)
  if ((m = text.match(new RegExp(`${n}\\s*reps?\\b`)))) return [{ r: +m[1], w: null }];
  return null;
}

export function parseCommand(input, sessionIds = []) {
  let text = wordsToNumbers(` ${input.toLowerCase().replace(/\banother\b/g, 'one more')} `)
    .replace(/(\d)\s*(?:lbs?|pounds?)\b/g, '$1')
    .replace(/(\d+)\s*x\s*(\d+)/g, '$1 x $2')
    .replace(/[–—]/g, '-');
  const actions = [];
  // Weigh-in: "weigh in 161.4", "weight 161", "I weighed 160.8"
  const wm = text.match(/\b(?:weigh(?:ed)?(?:\s*in)?|weight|body ?weight|scale)\b[^\d]*(\d{2,3}(?:\.\d)?)/);
  if (wm) {
    actions.push({ type: 'weight', lb: +wm[1] });
    text = text.replace(wm[0], ' ');
  }
  // Split into clauses at "and/then/;/." or a comma followed by a new exercise name.
  const clauses = text.split(/\s(?:and then|then|and|also|next)\s|[;.\n]+|,(?=\s*[a-z])/).map((c) => c.trim()).filter(Boolean);
  let lastExercise = null;
  for (const clause of clauses) {
    const check = parseCheck(clause, sessionIds);
    if (check) { actions.push(check); if (check.exercise) lastExercise = check.exercise; continue; }
    const move = parseMove(clause, sessionIds);
    if (move) { actions.push(move); lastExercise = move.exercise; continue; }
    const adding = /\b(add|include|throw in)\b/.test(clause);
    const exercise = matchExercise(clause, sessionIds) || null;
    const sets = parseSets(clause);
    if (exercise) lastExercise = exercise;
    if (sets) actions.push({ type: 'sets', exercise: exercise || lastExercise, sets, add: adding });
    else if (exercise && adding) actions.push({ type: 'add', exercise });
  }
  return { actions, understood: actions.length > 0 };
}

// Muscle words people say → muscle keys.
const MUSCLE_WORDS = [
  [/\b(quads?|quadriceps|legs?)\b/, 'quads'], [/\b(hamstrings?|hams|glutes?)\b/, 'hams'], [/\b(chest|pecs?)\b/, 'chest'],
  [/\b(lats?)\b/, 'lats'], [/\b(back|rows?)\b/, 'back'], [/\b(shoulders?|delts?)\b/, 'shoulders'],
  [/\b(biceps?|bis)\b/, 'biceps'], [/\b(triceps?|tris)\b/, 'triceps'], [/\b(calf|calves)\b/, 'calves'], [/\b(abs|core)\b/, 'abs'],
];
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };

// "check all my sets for calves" / "done with exercise 3" / "tick squats" / "check everything"
function parseCheck(clause, sessionIds) {
  if (!/\b(check|tick|mark|complete|completed|done|finished|finish)\b/.test(clause)) return null;
  if (/\b(sets? of|reps?\b.*\d|\d+\s*x\s*\d)/.test(clause) && !/\ball\b/.test(clause)) return null;
  const num = clause.match(/(?:exercise|number|no\.?|#)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+exercise|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+(?:exercise|one)/);
  if (num) return { type: 'check', index: num[3] ? ORDINALS[num[3]] : +(num[1] || num[2]) };
  const muscle = MUSCLE_WORDS.find(([re]) => re.test(clause));
  const rest = clause.replace(/\b(check|tick|mark|complete|completed|done|finished|finish|all|my|sets?|the|for|with|off|as|of|i|did|am|i'm)\b/g, ' ');
  const exercise = matchExercise(rest, sessionIds);
  // "calves" alone ticks every calf exercise; "calf raises" or "back squats" names one exercise.
  const extra = muscle ? rest.replace(muscle[0], ' ').trim() : 'x';
  if (exercise && extra) return { type: 'check', exercise };
  if (muscle) return { type: 'check', muscle: muscle[1] };
  if (/\b(all|everything|every set|whole workout)\b/.test(clause)) return { type: 'check', all: true };
  return null;
}

// "move rows after squats" / "do lunges before bench" / "RDLs last" / "move curls to the end"
function parseMove(clause, sessionIds) {
  const rel = clause.match(/^(?:move|do|put|switch)?\s*(.+?)\s+(after|before)\s+(?:the\s+)?(.+)$/);
  if (rel && /^(move|do|put|switch)\b/.test(clause) && !/\d/.test(clause)) {
    const exercise = matchExercise(rel[1], sessionIds);
    const other = matchExercise(rel[3], sessionIds);
    if (exercise && other && exercise !== other) return { type: 'move', exercise, [rel[2]]: other };
  }
  const end = clause.match(/^(?:move|do|put|save)?\s*(.+?)\s+(?:to the end|to the bottom|last|at the end|later)$/);
  const start = clause.match(/^(?:move|do|put)?\s*(.+?)\s+(?:to the top|to the start|first|next|now)$/);
  const m = end || start;
  if (m && !/\d/.test(clause)) {
    const exercise = matchExercise(m[1], sessionIds);
    if (exercise) return { type: 'move', exercise, to: end ? 'end' : 'start' };
  }
  return null;
}

export function describe(a) {
  if (a.type === 'weight') return `Weigh-in ${a.lb} lb`;
  const name = a.exercise ? EXERCISES[a.exercise].name : 'Current exercise';
  if (a.type === 'add') return `Added ${name}`;
  if (a.type === 'check') {
    const what = a.all ? 'every exercise' : a.index ? `exercise ${a.index === -1 ? '(last)' : a.index}` : a.muscle ? MUSCLES[a.muscle] : name;
    return `Checked ${what}`;
  }
  if (a.type === 'move') {
    if (a.after || a.before) return `Moved ${name} ${a.after ? 'after' : 'before'} ${EXERCISES[a.after || a.before].name}`;
    return `Moved ${name} to the ${a.to === 'end' ? 'end' : 'start'}`;
  }
  const ws = [...new Set(a.sets.map((s) => s.w))];
  const reps = a.sets.map((s) => s.r).join(', ');
  const load = a.exercise && EXERCISES[a.exercise].bw ? ' (bodyweight)' : ws.length === 1 && ws[0] != null ? ` @ ${ws[0]} lb` : '';
  return `${name}: ${a.sets.length} set${a.sets.length > 1 ? 's' : ''} × ${reps}${load}`;
}
