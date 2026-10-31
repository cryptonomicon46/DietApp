// 🔊 Cloud-voice privacy policy (Phase 1, used by the phone and the connector alike). Pure, so it's tested.
//
// Principle: Pawmily knows the family's life; the cloud voice (ElevenLabs) should usually know only
// the sentence it is asked to speak. Whether a sentence may be spoken by the cloud voice is decided
// from where its facts came from and who owns them — never from what a model says it used, and only
// secondarily from what the text looks like (looksSensitive is defence in depth).
//
// A fact is { d: domain, o: owner, v: value }:
//   d  weather | daylight | travel | calendar | health | food | watch | read | confirmation
//   o  'public' (no one's private data) · a member id · 'both' (you and your partner) · 'family'
//   v  the fact itself, with people already as roles ([partner], [member:N]) — never names or ids
// Every category is OFF until its owner turns it on. Data about someone else is eligible only if
// THAT person allows the category too (a member can't waive someone else's privacy).

export const POLICY_VERSION = 1;
export const CATEGORIES = ['confirmations', 'watchread', 'weather', 'travel', 'calendar', 'health'];
export const CATEGORY_LABELS = {
  confirmations: 'Simple confirmations', watchread: 'Watch & Read', weather: 'Weather', travel: 'Travel / drive times', calendar: 'Calendar', health: 'Health & food',
};
const DOMAIN_CATEGORY = { confirmation: 'confirmations', watch: 'watchread', read: 'watchread', weather: 'weather', daylight: 'weather', travel: 'travel', calendar: 'calendar', health: 'health', food: 'health' };
export const categoryOf = (domain) => DOMAIN_CATEGORY[domain] || null; // unknown domain → never eligible

export const defaultPrefs = () => ({ v: POLICY_VERSION, cats: Object.fromEntries(CATEGORIES.map((c) => [c, false])), namesOut: true });
export function cleanPrefs(p) {
  const d = defaultPrefs();
  for (const c of CATEGORIES) d.cats[c] = p?.cats?.[c] === true;
  d.namesOut = true; // Phase 1: names never go to the cloud voice (roles are spoken instead)
  return d;
}

// Whose consent a fact needs: the listener always (they choose what they hear in the cloud voice),
// plus each owner of private data. 'both' = the listener and their partner; 'family' = every grown-up.
const PUBLIC_DOMAINS = ['weather', 'daylight']; // only these can be no one's data
export function ownersOf(fact, { me, partner = null, adults = [] } = {}) {
  const o = fact?.o;
  if (o === 'public') return PUBLIC_DOMAINS.includes(fact?.d) ? [] : null; // e.g. a calendar item is never public
  if (o === 'both') return [...new Set([me, partner].filter(Boolean))];
  if (o === 'family') return [...new Set(adults)];
  return typeof o === 'string' && o ? [o] : null; // unknown owner → unresolved
}

// The facts the cloud voice may use, and the (owner, category) pairs that allowed them — the pairs go
// into the speakable ticket and are checked again when the audio is made.
export function eligibleFacts(facts, { me, partner = null, adults = [], prefsOf }) {
  const ok = [], denied = [], grants = new Set();
  for (const f of Array.isArray(facts) ? facts : []) {
    const cat = categoryOf(f?.d), owners = ownersOf(f, { me, partner, adults });
    const need = cat && owners ? [...new Set([me, ...owners])] : null;
    const pass = !!need && need.every((m) => prefsOf(m)?.cats?.[cat] === true);
    if (pass) { ok.push(f); for (const m of need) grants.add(`${m}|${cat}`); } else denied.push(f);
  }
  return { ok, denied, grants: [...grants].map((g) => g.split('|')) };
}
// Still allowed? (the same pairs, against today's preferences — revoking after a ticket was issued counts)
export const grantsHold = (grants, prefsOf) => (grants || []).every(([m, cat]) => CATEGORIES.includes(cat) && prefsOf(m)?.cats?.[cat] === true);

// Roles become plain words for speech: never a name, never an id.
export const rolesForSpeech = (text) => String(text || '').replace(/\[partner\]/g, 'your partner').replace(/\[member:\d+\]/g, 'a family member').replace(/\s+/g, ' ').trim();

// Defence in depth (not the privacy system): text that looks like a secret, a code, an account or
// card number, an email, a phone number or a street address stays on the device.
const SENSITIVE = [
  /\b\d{6,}\b/, /\b(?:\d[ -]?){12,19}\b/, /\b\d{3}-\d{2}-\d{4}\b/, // long numbers, cards, SSN
  /\b(password|passcode|pin|otp|one[- ]time|verification code|security code|2fa|cvv|ssn|social security|routing|account (?:number|no)|iban|swift|sort code|login|username|api key|secret|token)\b/i,
  /\b(bank|credit card|debit card|checking|savings|wire transfer)\b.*\d/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/, /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, // email, phone
  /\b\d{1,5}\s+\w+(?:\s\w+)?\s(?:st|street|ave|avenue|rd|road|dr|drive|blvd|lane|ln|way|ct|court|pl|place|terrace|ter)\b/i, // street address
];
export const looksSensitive = (text) => SENSITIVE.some((re) => re.test(String(text || '')));

// The fixed sentences the connector itself may speak for anyone who allows simple confirmations
// (it chooses the words, so nothing private can be in them).
export const PHRASES = {
  'confirm.one': 'Here it is. Check it and tap to confirm.',
  'confirm.many': 'Here they are. Check them and tap to confirm.',
  'day.times': 'I found some times you could add to your calendar.',
};
