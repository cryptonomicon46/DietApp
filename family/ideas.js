// 💡 Date ideas on the phone: a starter list that's always there, the week's scouted ideas, your
// own past dates, and the private pick tokens. A token is an HMAC of the idea with the family key
// (or a plain hash in a family without encryption), so the connector can see that you both picked
// the same thing without learning what it was.

export const STARTERS = [
  ['picnic', 'out', '🧺', 'Sunset picnic', 'Grab takeout, a blanket and a view'],
  ['hike', 'active', '🥾', 'Morning hike and brunch', 'Earn the pancakes'],
  ['farmers', 'out', '🥕', 'Farmers market', 'Pick something new and cook it together'],
  ['cookoff', 'home', '👩‍🍳', 'Cook a new recipe together', 'One of you picks, the other is sous-chef'],
  ['pizza', 'home', '🍕', 'Homemade pizza night', 'Dough from scratch, toppings from the fridge'],
  ['tasting', 'food', '🍷', 'Wine or beer tasting', 'A winery in the hills or a brewery flight'],
  ['dessert', 'food', '🍰', 'Dessert crawl', 'Three spots, one bite each'],
  ['ramen', 'food', '🍜', 'Try a new ramen spot', 'Somewhere neither of you has been'],
  ['brunch', 'food', '🥞', 'Long, lazy brunch', 'No phones until coffee number two'],
  ['rooftop', 'food', '🍸', 'Rooftop drinks', 'Dress up a little'],
  ['karaoke', 'out', '🎤', 'Karaoke', 'A private room — duets mandatory'],
  ['bowling', 'active', '🎳', 'Bowling or mini golf', 'Loser buys the milkshakes'],
  ['climb', 'active', '🧗', 'Bouldering session', 'Spot each other'],
  ['bikes', 'active', '🚲', 'Bike ride to somewhere new', 'Coffee stop halfway'],
  ['beach', 'out', '🌊', 'Day at the coast', 'Santa Cruz, Half Moon Bay or Pacifica'],
  ['museum', 'out', '🖼️', 'Museum afternoon', 'Pick one piece each to show the other'],
  ['stars', 'out', '🔭', 'Stargazing', 'Blankets, cocoa and a dark sky'],
  ['bookstore', 'out', '📚', 'Bookstore date', 'Pick a book for each other'],
  ['class', 'active', '🏺', 'Take a class together', 'Pottery, cooking or dancing'],
  ['spa', 'home', '🛁', 'Spa night at home', 'Face masks, candles, a playlist'],
  ['games', 'home', '🎲', 'Board game night', 'Something new, or an old favourite'],
  ['fort', 'home', '🏕️', 'Blanket fort movie night', 'Popcorn and a film from when you met'],
  ['photos', 'home', '📸', 'Look through old photos', 'Your first trip, your first year'],
  ['letters', 'home', '💌', 'Write each other letters', 'Read them over dinner'],
  ['dogs', 'out', '🐕', 'Dog-friendly patio dinner', 'Bring the dogs'],
  ['sunrise', 'active', '🌅', 'Sunrise walk', 'Then back to bed'],
  ['drivein', 'out', '🚗', 'Scenic drive', 'Skyline Blvd and a playlist you both love'],
  ['comedy', 'out', '😂', 'Comedy show', 'A club night or an open mic'],
  ['jazz', 'out', '🎷', 'Live music at a small bar', 'Jazz, a cover band, anything live'],
  ['market', 'food', '🌮', 'Night market or food trucks', 'Share everything'],
].map(([id, kind, icon, title, why]) => ({ id: `st${id}`, kind: 'starter', sub: kind, icon, title, why, tags: [kind] }));

export const TABS = { all: '✨ All', movie: '🎬 Movies', food: '🍸 Eat & drink', event: '🎟 Events', starter: '🏡 Ideas' };
export const KIND_ICON = { movie: '🎬', food: '🍸', event: '🎟', starter: '💡', again: '🔁' };

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const keyBytes = (k) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)), (c) => c.charCodeAt(0));
export async function ideaToken(familyKey, fid, ideaId) {
  if (familyKey) {
    const k = await crypto.subtle.importKey('raw', keyBytes(familyKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`idea:${ideaId}`))).slice(0, 32);
  }
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`${fid}:idea:${ideaId}`))).slice(0, 32);
}

// "Again?": the places from your own logged dates.
export function againIdeas(rhythm = []) {
  const seen = new Set(), out = [];
  for (const e of rhythm.slice().reverse()) {
    if (e.kind !== 'date' || !e.place) continue;
    const k = e.place.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: `ag${k.replace(/[^a-z0-9]+/g, '').slice(0, 30)}`, kind: 'again', icon: '🔁', title: `Back to ${e.place}`, why: `You went${e.what ? ` for ${e.what.toLowerCase()}` : ''} on ${e.date}`, tags: ['again'] });
    if (out.length >= 5) break;
  }
  return out;
}

// The deck: past days and passed ideas out; dated things soonest first; then the tabs taking
// turns so "All" isn't ten concerts in a row.
export function deck({ week, rhythm, passed = {}, tab = 'all', today, now = Date.now() }) {
  const live = (x) => !(passed[x.id] > now) && (!x.day || x.day >= today);
  const scouted = (week?.ideas || []).filter(live);
  const byKind = (k) => scouted.filter((x) => x.kind === k).sort((a, b) => (k === 'movie' ? (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (b.rank || 0) - (a.rank || 0) : (a.day || '9').localeCompare(b.day || '9')));
  const starters = [...againIdeas(rhythm), ...STARTERS].filter(live);
  if (tab === 'starter') return starters;
  if (tab !== 'all') return byKind(tab);
  const lanes = [byKind('movie'), byKind('event'), byKind('food'), starters];
  const out = [];
  for (let i = 0; lanes.some((l) => l.length); i++) { const l = lanes[i % lanes.length]; if (l.length) out.push(l.shift()); }
  return out;
}

// What a pick carries (locked before it's sent): enough to show the match on both phones.
export const pickBox = (x) => ({ id: x.id, kind: x.kind, icon: x.icon || '', title: x.title, day: x.day || '', time: x.time || '', where: x.where || '', url: x.url || '', reserve: x.reserve || '', img: x.img || '' });
