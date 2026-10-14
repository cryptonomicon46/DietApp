// Full-body 3×/week hypertrophy + strength program with a 5-week build and a deload week.
// Sources are in js/research.js (area: 'training').
//
// Design choices and the evidence behind them:
// - Each muscle trained ~3×/week: ≥2×/week beats 1× for hypertrophy (Schoenfeld, Ogborn & Krieger 2016).
// - ~10+ hard sets per muscle per week, rising across the block (Schoenfeld, Ogborn & Krieger 2017).
// - Heavy (4–6), moderate (6–12) and light (10–20) days: hypertrophy is similar across loads when
//   sets are hard; heavier loads build more strength (Schoenfeld et al. 2017, JSCR).
// - Effort set by reps in reserve (Helms et al. 2016), mostly short of failure (Refalo et al. 2023).
// - Load goes up once every set hits the top of the rep range (ACSM 2009 progression models).
// - 2–3 min rest on compounds (Schoenfeld et al. 2016); 1–2 min on isolations.
// - Week 6 deload: fewer sets and easier effort (Bell et al. 2023 Delphi consensus).

export const MUSCLES = {
  quads: 'Quads', hams: 'Hamstrings & glutes', chest: 'Chest', back: 'Back (rows)', lats: 'Back (lats)',
  shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', calves: 'Calves', abs: 'Abs',
};

// kind: compound | isolation; lower: lower-body (bigger load jumps); equip for filtering.
export const EXERCISES = {
  // Quads
  backSquat:      { name: 'Barbell back squat',         muscle: 'quads', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Brace, sit between your hips, knees track over toes.' },
  frontSquat:     { name: 'Front squat',                muscle: 'quads', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Elbows high, stay upright.' },
  hackSquat:      { name: 'Hack squat',                 muscle: 'quads', kind: 'compound', equip: 'Machine', lower: true, cue: 'Full depth, controlled lowering.' },
  legPress:       { name: 'Leg press',                  muscle: 'quads', kind: 'compound', equip: 'Machine', lower: true, cue: 'Lower until hips start to tuck, then drive.' },
  gobletSquat:    { name: 'Goblet squat',               muscle: 'quads', kind: 'compound', equip: 'Dumbbell', lower: true, cue: 'Hold the bell at your chest, sit tall.' },
  splitSquat:     { name: 'Bulgarian split squat',      muscle: 'quads', kind: 'compound', equip: 'Dumbbell', lower: true, cue: 'Rear foot on bench, front knee travels forward.' },
  walkingLunge:   { name: 'Walking lunge',              muscle: 'quads', kind: 'compound', equip: 'Dumbbell', lower: true, cue: 'Long steps, back knee kisses the floor.' },
  legExtension:   { name: 'Leg extension',              muscle: 'quads', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Pause at the top, slow down.' },
  // Hamstrings & glutes
  deadlift:       { name: 'Deadlift',                   muscle: 'hams', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Bar over mid-foot, push the floor away.' },
  trapBar:        { name: 'Trap-bar deadlift',          muscle: 'hams', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Hips and chest rise together.' },
  rdl:            { name: 'Romanian deadlift',          muscle: 'hams', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Soft knees, push hips back until hamstrings stretch.' },
  dbRdl:          { name: 'Dumbbell Romanian deadlift', muscle: 'hams', kind: 'compound', equip: 'Dumbbell', lower: true, cue: 'Dumbbells slide down the thighs.' },
  hipThrust:      { name: 'Barbell hip thrust',         muscle: 'hams', kind: 'compound', equip: 'Barbell', lower: true, cue: 'Chin tucked, squeeze glutes at the top.' },
  lyingCurl:      { name: 'Lying leg curl',             muscle: 'hams', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Hips pinned, slow lowering.' },
  seatedCurl:     { name: 'Seated leg curl',            muscle: 'hams', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Lean forward slightly for a bigger stretch.' },
  backExtension:  { name: '45° back extension',         muscle: 'hams', kind: 'isolation', equip: 'Bodyweight', lower: true, cue: 'Hinge at the hips, round slightly for glutes.' },
  // Chest
  bench:          { name: 'Barbell bench press',        muscle: 'chest', kind: 'compound', equip: 'Barbell', cue: 'Shoulder blades pinned, bar to lower chest.' },
  dbBench:        { name: 'Dumbbell bench press',       muscle: 'chest', kind: 'compound', equip: 'Dumbbell', cue: 'Deep stretch at the bottom.' },
  inclineDb:      { name: 'Incline dumbbell press',     muscle: 'chest', kind: 'compound', equip: 'Dumbbell', cue: 'Bench at 30°, elbows ~45°.' },
  inclineBb:      { name: 'Incline barbell press',      muscle: 'chest', kind: 'compound', equip: 'Barbell', cue: 'Bar to upper chest.' },
  machinePress:   { name: 'Machine chest press',        muscle: 'chest', kind: 'compound', equip: 'Machine', cue: 'Handles at mid-chest.' },
  dips:           { name: 'Dips',                       muscle: 'chest', kind: 'compound', equip: 'Bodyweight', cue: 'Lean forward for chest, add weight when easy.' },
  pushUp:         { name: 'Push-up',                    muscle: 'chest', kind: 'compound', equip: 'Bodyweight', cue: 'Body in one line; elevate feet to progress.' },
  cableFly:       { name: 'Cable fly',                  muscle: 'chest', kind: 'isolation', equip: 'Cable', cue: 'Slight elbow bend, hug a tree.' },
  pecDeck:        { name: 'Pec deck',                   muscle: 'chest', kind: 'isolation', equip: 'Machine', cue: 'Stretch wide, squeeze together.' },
  // Back — rows
  bbRow:          { name: 'Barbell row',                muscle: 'back', kind: 'compound', equip: 'Barbell', cue: 'Torso ~45°, pull to belly button.' },
  dbRow:          { name: 'One-arm dumbbell row',       muscle: 'back', kind: 'compound', equip: 'Dumbbell', cue: 'Pull the elbow toward your hip.' },
  chestRow:       { name: 'Chest-supported row',        muscle: 'back', kind: 'compound', equip: 'Machine', cue: 'Chest stays on the pad.' },
  cableRow:       { name: 'Seated cable row',           muscle: 'back', kind: 'compound', equip: 'Cable', cue: 'Tall chest, squeeze shoulder blades.' },
  tBarRow:        { name: 'T-bar row',                  muscle: 'back', kind: 'compound', equip: 'Barbell', cue: 'Neutral spine, drive elbows back.' },
  // Back — lats
  pullUp:         { name: 'Pull-up',                    muscle: 'lats', kind: 'compound', equip: 'Bodyweight', cue: 'Full hang to chin over bar; add weight when easy.' },
  chinUp:         { name: 'Chin-up',                    muscle: 'lats', kind: 'compound', equip: 'Bodyweight', cue: 'Palms facing you, chest to bar.' },
  latPulldown:    { name: 'Lat pulldown',               muscle: 'lats', kind: 'compound', equip: 'Cable', cue: 'Pull to upper chest, elbows down and in.' },
  neutralPulldown:{ name: 'Neutral-grip pulldown',      muscle: 'lats', kind: 'compound', equip: 'Cable', cue: 'Palms facing, full stretch at top.' },
  straightArm:    { name: 'Straight-arm pulldown',      muscle: 'lats', kind: 'isolation', equip: 'Cable', cue: 'Arms long, sweep to thighs.' },
  // Shoulders
  ohp:            { name: 'Overhead press',             muscle: 'shoulders', kind: 'compound', equip: 'Barbell', cue: 'Squeeze glutes, head through at the top.' },
  dbShoulder:     { name: 'Seated dumbbell press',      muscle: 'shoulders', kind: 'compound', equip: 'Dumbbell', cue: 'Elbows slightly forward.' },
  machineShoulder:{ name: 'Machine shoulder press',     muscle: 'shoulders', kind: 'compound', equip: 'Machine', cue: 'Handles at chin height to start.' },
  lateralRaise:   { name: 'Dumbbell lateral raise',     muscle: 'shoulders', kind: 'isolation', equip: 'Dumbbell', cue: 'Lead with elbows, stop at shoulder height.' },
  cableLateral:   { name: 'Cable lateral raise',        muscle: 'shoulders', kind: 'isolation', equip: 'Cable', cue: 'Cable behind you, constant tension.' },
  rearDelt:       { name: 'Rear-delt fly',              muscle: 'shoulders', kind: 'isolation', equip: 'Dumbbell', cue: 'Hinge over, sweep arms wide.' },
  facePull:       { name: 'Face pull',                  muscle: 'shoulders', kind: 'isolation', equip: 'Cable', cue: 'Pull to forehead, thumbs back.' },
  // Biceps
  bbCurl:         { name: 'Barbell curl',               muscle: 'biceps', kind: 'isolation', equip: 'Barbell', cue: 'Elbows still, no swinging.' },
  dbCurl:         { name: 'Dumbbell curl',              muscle: 'biceps', kind: 'isolation', equip: 'Dumbbell', cue: 'Turn the pinky up at the top.' },
  inclineCurl:    { name: 'Incline dumbbell curl',      muscle: 'biceps', kind: 'isolation', equip: 'Dumbbell', cue: 'Arms hang behind you for a long stretch.' },
  hammerCurl:     { name: 'Hammer curl',                muscle: 'biceps', kind: 'isolation', equip: 'Dumbbell', cue: 'Thumbs up the whole way.' },
  cableCurl:      { name: 'Cable curl',                 muscle: 'biceps', kind: 'isolation', equip: 'Cable', cue: 'Constant tension, slow lowering.' },
  preacherCurl:   { name: 'Preacher curl',              muscle: 'biceps', kind: 'isolation', equip: 'Machine', cue: 'Full stretch at the bottom.' },
  // Triceps
  pushdown:       { name: 'Cable pushdown',             muscle: 'triceps', kind: 'isolation', equip: 'Cable', cue: 'Elbows pinned to your sides.' },
  overheadExt:    { name: 'Overhead cable extension',   muscle: 'triceps', kind: 'isolation', equip: 'Cable', cue: 'Long stretch behind the head.' },
  skullcrusher:   { name: 'EZ-bar skull crusher',       muscle: 'triceps', kind: 'isolation', equip: 'Barbell', cue: 'Lower behind the forehead.' },
  closeGrip:      { name: 'Close-grip bench press',     muscle: 'triceps', kind: 'compound', equip: 'Barbell', cue: 'Hands shoulder-width, elbows tucked.' },
  // Calves
  standingCalf:   { name: 'Standing calf raise',        muscle: 'calves', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Pause 2 s in the deep stretch.' },
  seatedCalf:     { name: 'Seated calf raise',          muscle: 'calves', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Full range, no bouncing.' },
  legPressCalf:   { name: 'Calf press on leg press',    muscle: 'calves', kind: 'isolation', equip: 'Machine', lower: true, cue: 'Balls of feet on the platform edge.' },
  // Abs
  cableCrunch:    { name: 'Cable crunch',               muscle: 'abs', kind: 'isolation', equip: 'Cable', cue: 'Curl ribs to hips.' },
  hangingRaise:   { name: 'Hanging leg raise',          muscle: 'abs', kind: 'isolation', equip: 'Bodyweight', cue: 'Tilt the pelvis up, no swinging.' },
  abWheel:        { name: 'Ab wheel rollout',           muscle: 'abs', kind: 'isolation', equip: 'Bodyweight', cue: 'Ribs down, roll only as far as you control.' },
};

const byMuscle = (m, ...extra) => [...Object.keys(EXERCISES).filter((k) => EXERCISES[k].muscle === m), ...extra];

// Day A heavy · Day B moderate · Day C light (daily undulating periodization).
export const DAYS = {
  A: { title: 'Day A · Heavy', note: 'Strength focus — heavy compounds, longer rest.', slots: [
    { id: 'A1', muscle: 'quads',     default: 'backSquat',   reps: [4, 6],   sets: 3, rest: '3 min' },
    { id: 'A2', muscle: 'chest',     default: 'bench',       reps: [4, 6],   sets: 3, rest: '3 min' },
    { id: 'A3', muscle: 'back',      default: 'bbRow',       reps: [6, 8],   sets: 3, rest: '2–3 min' },
    { id: 'A4', muscle: 'hams',      default: 'rdl',         reps: [6, 8],   sets: 2, rest: '2–3 min' },
    { id: 'A5', muscle: 'shoulders', default: 'lateralRaise', reps: [10, 15], sets: 2, rest: '1–2 min' },
    { id: 'A6', muscle: 'biceps',    default: 'dbCurl',      reps: [8, 12],  sets: 2, rest: '1–2 min' },
  ] },
  B: { title: 'Day B · Moderate', note: 'Hypertrophy focus — moderate loads, 6–12 reps.', slots: [
    { id: 'B1', muscle: 'hams',      default: 'trapBar',     reps: [5, 8],   sets: 2, rest: '3 min' },
    { id: 'B2', muscle: 'shoulders', default: 'ohp',         reps: [6, 10],  sets: 3, rest: '2–3 min' },
    { id: 'B3', muscle: 'lats',      default: 'pullUp',      reps: [6, 10],  sets: 3, rest: '2–3 min' },
    { id: 'B4', muscle: 'quads',     default: 'splitSquat',  reps: [8, 12],  sets: 3, rest: '2 min' },
    { id: 'B5', muscle: 'chest',     default: 'inclineDb',   reps: [8, 12],  sets: 2, rest: '2 min' },
    { id: 'B6', muscle: 'triceps',   default: 'overheadExt', reps: [10, 15], sets: 2, rest: '1–2 min' },
  ] },
  C: { title: 'Day C · Light', note: 'Volume & pump — lighter loads, 10–20 reps, push close to failure.', slots: [
    { id: 'C1', muscle: 'quads',     default: 'legPress',    reps: [10, 15], sets: 3, rest: '2 min' },
    { id: 'C2', muscle: 'hams',      default: 'lyingCurl',   reps: [10, 15], sets: 3, rest: '1–2 min' },
    { id: 'C3', muscle: 'chest',     default: 'machinePress', reps: [10, 15], sets: 3, rest: '2 min' },
    { id: 'C4', muscle: 'back',      default: 'cableRow',    reps: [10, 15], sets: 3, rest: '2 min' },
    { id: 'C5', muscle: 'shoulders', default: 'cableLateral', reps: [12, 20], sets: 3, rest: '1 min' },
    { id: 'C6', muscle: 'calves',    default: 'standingCalf', reps: [10, 15], sets: 3, rest: '1 min' },
    { id: 'C7', muscle: 'abs',       default: 'cableCrunch', reps: [10, 15], sets: 2, rest: '1 min' },
  ] },
};

export const slotOptions = (slot) => byMuscle(slot.muscle);

// 5-week build + deload. RIR = reps in reserve (how many more reps you could do).
export const WEEKS = [
  { week: 1, label: 'Week 1 · Base',      rir: '3',     note: 'Find your working weights. Stop every set with ~3 reps left.' },
  { week: 2, label: 'Week 2 · Build',     rir: '2–3',   note: 'Same sets, push slightly harder. Add weight wherever you hit the top of the range.' },
  { week: 3, label: 'Week 3 · Build',     rir: '2',     note: '+1 set on your first two lifts each day.' },
  { week: 4, label: 'Week 4 · Overload',  rir: '1–2',   note: '+1 set on your first two lifts. Sets get hard.' },
  { week: 5, label: 'Week 5 · Peak',      rir: '0–1',   note: '+1 set on every lift. Take the last set of isolation moves to failure.' },
  { week: 6, label: 'Week 6 · Deload',    rir: '4+',    note: 'Half the sets at ~85% of last week\'s weights. Recover, then start a new block.' },
];

export function setsFor(slot, week, index) {
  const base = slot.sets;
  if (week >= 6) return Math.max(1, Math.ceil(base / 2));
  if (week === 5) return base + 1;
  if (week >= 3 && index < 2) return base + 1;
  return base;
}

export function weeklySets(week) {
  const totals = {};
  for (const day of Object.values(DAYS)) {
    day.slots.forEach((s, i) => { totals[s.muscle] = (totals[s.muscle] || 0) + setsFor(s, week, i); });
  }
  return totals;
}

// Where you are in the block: 3 sessions per week, 6 weeks.
export function blockPosition(sessionsInBlock) {
  const n = sessionsInBlock;
  return { week: Math.min(Math.floor(n / 3) + 1, 6), day: ['A', 'B', 'C'][n % 3], done: n >= 18 };
}

const roundTo = (x, step) => Math.round(x / step) * step;

// Double progression: work up through the rep range, then add load.
// ACSM (2009): add ~2–10% once you beat the target reps.
export function suggestLoad(exerciseId, slot, history, week) {
  const ex = EXERCISES[exerciseId];
  const has = (s) => s.entries.some((e) => e.exercise === exerciseId && e.sets.some((x) => x.w > 0 && x.r > 0));
  const done = history.filter(has);
  const lastAny = done[done.length - 1];
  // Progress from real working sessions, never from a deload's lighter sets.
  const last = [...done].reverse().find((s) => s.week < 6);
  if (!last) {
    if (lastAny) {
      const top = Math.max(...lastAny.entries.find((e) => e.exercise === exerciseId).sets.map((x) => x.w));
      return { weight: top, text: `Last time: ${top} lb (deload).` };
    }
    return { weight: null, text: 'First time: pick a weight you could lift for a few more reps than the target.' };
  }
  const sets = last.entries.find((e) => e.exercise === exerciseId).sets.filter((x) => x.w > 0 && x.r > 0);
  const top = Math.max(...sets.map((x) => x.w));
  const work = sets.filter((x) => x.w === top);
  const [lo, hi] = slot.reps;
  const step = ex.lower && ex.kind === 'compound' ? 10 : 5;
  const lastText = `Last working session: ${top} lb × ${work.map((x) => x.r).join(', ')}`;
  if (week >= 6) return { weight: roundTo(top * 0.85, 5), text: `${lastText}. Deload: ~85% for easy sets.` };
  if (lastAny !== last && lastAny.week >= 6) return { weight: top, text: `${lastText}. Back to your pre-deload weights.` };
  if (work.every((x) => x.r >= hi)) return { weight: top + step, text: `${lastText} — every set hit ${hi}. Add ${step} lb.` };
  if (work.some((x) => x.r < lo)) return { weight: top, text: `${lastText} — below ${lo} reps. Stay at ${top} lb and build reps.` };
  return { weight: top, text: `${lastText}. Stay at ${top} lb and beat at least one set by a rep.` };
}
