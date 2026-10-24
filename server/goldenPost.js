// ⭐ Golden-day thank-you posts from the dogs. When a day becomes golden (two outings, or one
// plus a treat), the dogs "write" a post thanking whoever took them out. Each post is put
// together from a greeting, a line about what happened, a quirky extra and a sign-off, and the
// last few lines a family saw aren't reused, so it reads a little differently every time.

// A golden day: two outings (walks or dog park), or one outing plus a treat.
export function isGolden(list = []) {
  const n = (k) => list.filter((e) => e.kind === k).length;
  const outings = n('walk') + n('park');
  return outings >= 2 || (outings >= 1 && n('treat') > 0);
}

const and = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs.at(-1)}`);
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

// What the day held, in dog words: "two walks and the dog park, plus a treat".
export function dayHighlights(list = []) {
  const n = (k) => list.filter((e) => e.kind === k).length;
  const parts = [];
  if (n('walk')) parts.push(n('walk') === 1 ? 'a walk' : `${NUM[n('walk')] || n('walk')} walks`);
  if (n('park')) parts.push(n('park') === 1 ? 'the dog park' : `${NUM[n('park')] || n('park')} trips to the dog park`);
  const outings = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || 'an adventure';
  return !n('treat') ? outings : parts.length > 1 ? `${outings}, plus a treat` : `${outings} and a treat`;
}

// {We} {we} {us} {our} {are} {were} {Ours} change for one dog vs several; {people} is who to
// thank ("Dad", "Mom & Dad"); {day} is dayHighlights.
export const GREETINGS = [
  'Dear {people},', 'Hey {people}!', '{people}!!', 'Attention {people}:', 'Breaking news for {people}:',
  'To {people}, the best {humans} in the whole world,', 'Psst… {people}.', 'Hi {people}, it\'s {us} again.',
  'Official memo to {people}:', 'Good evening {people},', 'Bark bark (that means hi, {people}).', '{people}, a word please.',
];
const DAYS = [
  '{We} got {day} today and {we} {are} still wagging about it.',
  '{day} today?! {We} feel like the luckiest {dogs} on the block.',
  'Thank you for {day}. {We} sniffed approximately one million things.',
  '{day} — that\'s a golden day in {our} book. ⭐',
  '{We} would like to formally thank you for {day}. Tail-wags have been issued.',
  'Today was {day}, which is {our} favourite amount of day.',
  'Because of you {we} had {day}, and now {we} {are} the sleepiest, happiest {dogs}.',
  '{day}! {We} told every squirrel about it.',
  'After {day}, {our} paws are tired but {our} hearts are full.',
  '{We} rate today\'s {day} five out of five bones. 🦴🦴🦴🦴🦴',
  'Thank you for {day}. {We} promise to only bark at the mail carrier a little tomorrow.',
  '{day} today — {we} {are} writing this from {our} favourite nap spot.',
];
const EXTRAS = [
  'P.S. {We} may have rolled in something. Worth it.',
  'P.S. The couch is warm if you need it. {We} saved you a corner.',
  'P.S. {We} {were} very good. Mostly. Okay, a little good.',
  'P.S. Same time tomorrow? {We}\'ll be by the door.',
  'P.S. {We} think you deserve a treat too. {We} will supervise.',
  'P.S. Please disregard any sock incidents.',
  'P.S. {We} love you more than squeaky toys. And that\'s a LOT.',
  'P.S. Zoomies will be performed at 9pm in your honour.',
  'P.S. Leash = love. Just saying.',
  'P.S. {We} heard the word "walk" in {our} dreams already.',
  '',
  '',
];
const SIGNOFFS = [
  'Love, {pets} 🐾', 'Wags & kisses, {pets} 🐶', 'Your loyal floofs, {pets}', '— {pets} (good {dogs})',
  'Sleepy hugs, {pets} 💤', 'Forever yours, {pets} 💛', 'Paw-sitively grateful, {pets} 🐾', 'With slobbery love, {pets}',
];

function pick(list, avoid, rnd) {
  const ok = list.map((_, i) => i).filter((i) => !avoid.includes(i));
  const pool = ok.length ? ok : list.map((_, i) => i);
  return pool[Math.floor(rnd() * pool.length)];
}

// → {text, used: {g, d, e, s}}. recent: the `used` of the last few posts (not reused).
export function goldenMessage({ pets, people, day, recent = [], rnd = Math.random }) {
  const one = pets.length === 1;
  const words = one
    ? { We: 'I', we: 'I', us: 'me', our: 'my', are: 'am', were: 'was', dogs: 'dog' }
    : { We: 'We', we: 'we', us: 'us', our: 'our', are: 'are', were: 'were', dogs: 'dogs' };
  const avoid = (k) => recent.map((r) => r?.[k]).filter((x) => x != null);
  const used = { g: pick(GREETINGS, avoid('g'), rnd), d: pick(DAYS, avoid('d'), rnd), e: pick(EXTRAS, avoid('e'), rnd), s: pick(SIGNOFFS, avoid('s'), rnd) };
  const fill = (t) => t
    .replace(/\{people\}/g, and(people))
    .replace(/\{humans\}/g, people.length > 1 ? 'humans' : 'human')
    .replace(/\{pets\}/g, and(pets))
    .replace(/\{day\}/g, day)
    .replace(/\{(We|we|us|our|are|were|dogs)\}/g, (_, k) => words[k])
    .replace(/^([a-z])/, (c) => c.toUpperCase());
  const lines = [fill(GREETINGS[used.g]), fill(DAYS[used.d]), fill(EXTRAS[used.e]), fill(SIGNOFFS[used.s])].filter(Boolean);
  // The opening line can start with {day} ("two walks today?!"): capitalise sentences.
  return { text: lines.map((l) => l.replace(/^([a-z])/, (c) => c.toUpperCase())).join('\n'), used };
}
