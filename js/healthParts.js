// 💪 One person's trackers, in parts the family can be given separately (2.0 Phase 5/6):
//   diet    — goal, targets, meals, weights, check-ins, body scans
//   fitness — workouts, lifting, activities, gym classes, device totals
//   us      — what only your partner needs: the 2-2-2-2 rhythm, date ratings, older notes,
//             plans and shows, the dogs' log from before the family app
// Everything else (linked calendar addresses, device sign-ins, per-phone bookkeeping) stays in
// your own full copy, which only you read. Each part is locked with the family key like the rest.
export const PARTS = {
  diet: ['profile', 'weights', 'weighModes', 'days', 'eaten', 'mealLog', 'dailyMeals', 'planned', 'combos', 'custom', 'customGrocery', 'scannedFoods', 'preparedMeals', 'myFoods', 'macroAdjust', 'adjust', 'adjustAppliedOn', 'checkins', 'checkinSnooze', 'checked', 'prefs', 'dexa'],
  fitness: ['workouts', 'workoutHistory', 'lift', 'activities', 'whoopTotal', 'gymClasses', 'training'],
  us: ['rhythm', 'taste', 'plans', 'planReplies', 'notes', 'noteHearts', 'noteDays', 'shows', 'showStatus', 'showRatings', 'showNights', 'dogTreats', 'dogFed', 'dogProfiles', 'dogWalked', 'dogToys', 'dogPark', 'adoptDogs'],
};
export const PART_NAMES = Object.keys(PARTS);
const partOf = Object.fromEntries(Object.entries(PARTS).flatMap(([p, keys]) => keys.map((k) => [k, p])));

export function splitHealth(data = {}) {
  const out = { diet: {}, fitness: {}, us: {} };
  for (const [k, v] of Object.entries(data || {})) if (partOf[k]) out[partOf[k]][k] = v;
  return out;
}
// Parts back into one object (what a reader was allowed to see).
export const joinParts = (...parts) => Object.assign({}, ...parts.filter(Boolean));
// A short fingerprint, to send a part only when it changed.
export function sigOf(v) { const s = JSON.stringify(v); let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + s.length.toString(36); }
