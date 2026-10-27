// 🐾 Spotting dog appointments in linked calendars (an iPhone calendar's "Grooming – Layla"),
// so they can become dog appointments with drivers and reminders. Runs on the phone.

const TYPES = [
  ['vaccine', /\b(vaccin\w*|rabies|bordetella|dhpp|lepto\w*|booster)\b/i],
  ['groom', /\b(groom\w*|haircut|bath|nail trim|nails|spa day)\b/i],
  ['dental', /\b(dental|teeth cleaning)\b/i],
  ['boarding', /\b(boarding|daycare|day care|kennel|dog ?sitter|pet ?sitter)\b/i],
  ['vet', /\b(vet|veterinar\w*|animal hospital|check-?up|vca|banfield)\b/i],
];
// Words that only mean a dog (or a dog place) — "dental" alone is probably people.
const DOGGY = /\b(dog|dogs|pup|puppy|puppies|doodle|pet|pets|k9|canine|vet|veterinar\w*|animal hospital|vca|banfield|petco|petsmart|wag|groomer|dog park|kennel)\b/i;
const words = (s) => String(s || '').toLowerCase();
const has = (text, name) => name && new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(text);

// event: {title, place, notes}; dogs: [{id, name}]; places: the dogs' vet / groomer names.
export function dogEvent(event, dogs = [], places = []) {
  const text = words(`${event.title} ${event.place || ''} ${event.notes || ''}`);
  const pets = dogs.filter((d) => has(text, d.name)).map((d) => d.id);
  const atPlace = places.some((p) => p && p.length > 2 && text.includes(p.toLowerCase()));
  const type = TYPES.find(([, re]) => re.test(text))?.[0] || null;
  if (!pets.length && !atPlace && !DOGGY.test(text)) return null;
  if (!type && !pets.length) return null;
  return { type: type || 'other', pets };
}
