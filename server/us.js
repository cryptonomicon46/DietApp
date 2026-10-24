// 💞 Just us: "I'm feeling like…" plans and post-it notes between the two of you (or, for a plan,
// the whole family). Each item lists who it's for; only its author and those people see it.
// What it says (and, for a plan, the kind, place, time and note) is end-to-end encrypted in
// `body`; the server only keeps who it's from, who it's for, the day, and the answers.

export const PLAN_KINDS = ['movie', 'show', 'brunch', 'lunch', 'dinner', 'coffee', 'walk', 'workout', 'other'];
export const WHEN = ['tonight', 'today', 'tomorrow', 'weekend', 'date'];
export const REPLIES = ['in', 'maybe', 'later'];
export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'peach'];
export const NOTE_DAYS = 7; // notes clear after a week unless someone ❤️ them

// Your other half in the family: the creator's spouse or partner, or (for them) the creator.
export function partnerOf(fam, me) {
  const people = fam.members.filter((x) => x.kind === 'person' && x.id !== me.id && x.relation !== 'child');
  if (me.relation === 'spouse' || me.relation === 'partner') return people.find((x) => x.relation === 'self') || people[0] || null;
  return people.find((x) => x.relation === 'spouse' || x.relation === 'partner') || null;
}
export const visibleTo = (item, memberId) => item.by === memberId || (item.to || []).includes(memberId);

// The day a plan is for, from when it was made ("tonight", "this weekend" = that Saturday…).
export function planDay(when, made, day) {
  if (when === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(day || '')) return day;
  const d = new Date(`${made}T12:00:00Z`);
  if (when === 'tomorrow') d.setUTCDate(d.getUTCDate() + 1);
  if (when === 'weekend') d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}
// Still ahead (weekend plans through Sunday), and not done.
export function upcoming(plan, today) {
  if (plan.done) return false;
  if (plan.when === 'weekend') { const sun = new Date(`${plan.day}T12:00:00Z`); sun.setUTCDate(sun.getUTCDate() + 1); return sun.toISOString().slice(0, 10) >= today; }
  return plan.day >= today;
}
// Everyone it's for said 🙌.
export const agreed = (plan) => (plan.to || []).length > 0 && plan.to.every((id) => plan.replies?.[id]?.r === 'in');

// Days in a row (ending today or yesterday) with a note from this person.
export function streak(days, today) {
  const set = new Set(days);
  const d = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}
