// 🐾 Dog appointments (grooming, vet, vaccines, dental, boarding): who's going, where, a drop-off
// and a pick-up each with a driver, repeats, and — once done — the cost and, for a vaccine, the
// next due date on the dog's record. Times are the family's local "YYYY-MM-DDTHH:MM".

export const APPT_TYPES = {
  groom: { icon: '✂️', label: 'Grooming' },
  vet: { icon: '🩺', label: 'Vet visit' },
  vaccine: { icon: '💉', label: 'Vaccination' },
  dental: { icon: '🦷', label: 'Dental' },
  boarding: { icon: '🏨', label: 'Boarding / daycare' },
  other: { icon: '📌', label: 'Other' },
};
// Years until the next shot, after this one (what most vets use for adult dogs).
export const VACCINE_YEARS = { rabies: 3, dhpp: 3, bordetella: 1, leptospirosis: 1, 'canine influenza': 1, lyme: 1 };

const when = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s) ? s : '');
const day = (s) => String(s || '').slice(0, 10);

// The date a vaccine given on `given` is next due ("YYYY-MM-DD").
export function nextDue(name, given) {
  const years = VACCINE_YEARS[String(name || '').trim().toLowerCase()] ?? 1;
  const d = new Date(`${given}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// The next one of a repeating appointment: same times, `weeks` later.
export function shiftWeeks(at, weeks) {
  if (!at) return '';
  const d = new Date(`${at.length === 10 ? `${at}T12:00` : at}:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return at.length === 10 ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16);
}

// A clean appointment from what the phone sent. petIds/memberIds: who may be named.
export function cleanAppt(body, { petIds, memberIds, clean, text = clean }) {
  const pets = (Array.isArray(body.pets) ? body.pets : []).filter((id) => petIds.includes(id));
  const who = (id) => (memberIds.includes(id) ? id : '');
  return {
    type: APPT_TYPES[body.type] ? body.type : 'other',
    pets,
    place: text(body.place, 80),
    dropAt: when(body.dropAt), dropBy: who(body.dropBy),
    pickAt: when(body.pickAt), pickBy: who(body.pickBy),
    repeatWeeks: [0, 4, 6, 8, 12].includes(Number(body.repeatWeeks)) ? Number(body.repeatWeeks) : 0,
    // Which vaccine: sealed in an encrypted family (audit S3); plain only in families not yet encrypted.
    vaccine: body.type === 'vaccine' ? text(body.vaccine, 40) : '',
    notes: text(body.notes, 300),
    remind: (Array.isArray(body.remind) ? body.remind : []).filter((x) => ['day', 'hour'].includes(x)),
  };
}

// When it starts (for sorting and "coming up").
export const startOf = (a) => a.dropAt || a.pickAt || '';

// This year's spending from done appointments, by kind.
export function spending(appts, year) {
  const out = { total: 0, byType: {} };
  for (const a of appts) {
    if (a.status !== 'done' || !(a.cost > 0) || !day(a.doneAt || startOf(a)).startsWith(String(year))) continue;
    out.total += a.cost;
    out.byType[a.type] = (out.byType[a.type] || 0) + a.cost;
  }
  out.total = Math.round(out.total * 100) / 100;
  return out;
}
