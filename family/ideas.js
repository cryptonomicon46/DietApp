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
export function deck({ week, rhythm, passed = {}, tab = 'all', today, now = Date.now(), taste = null }) {
  const live = (x) => !(passed[x.id] > now) && (!x.day || x.day >= today) && !(taste && fit(x, taste).hide);
  // Your taste nudges the order inside each kind (a stable sort keeps the scout's order on ties).
  const byFit = (l) => (taste?.n ? l.map((x, i) => [x, fit(x, taste).score, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([x]) => x) : l);
  const scouted = (week?.ideas || []).filter(live);
  const byKind = (k) => byFit(scouted.filter((x) => x.kind === k).sort((a, b) => (k === 'movie' ? (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (b.rank || 0) - (a.rank || 0) : (a.day || '9').localeCompare(b.day || '9'))));
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

// ---------- ⭐ ratings → your taste ----------
// A rating: { id, at, date, plan, what, overall: 1 😕 | 2 🙂 | 3 😍, stops: [{ name, kind, tags, price, r: -1 👎 | 1 👍 | 2 ❤️ }], tags: [...] }.
export const CUISINE_WORDS = { sushi: ['sushi', 'japanese', 'omakase', 'izakaya'], thai: ['thai'], indian: ['indian', 'curry'], tapas: ['tapas', 'spanish', 'basque'], italian: ['italian', 'pasta', 'trattoria'], mexican: ['mexican', 'taco', 'taqueria'], american: ['american', 'burger', 'bbq', 'steak', 'diner'], chinese: ['chinese', 'dim sum', 'dumpling', 'sichuan'], korean: ['korean'], vietnamese: ['vietnamese', 'pho'], mediterranean: ['mediterranean', 'greek', 'middle eastern'], seafood: ['seafood', 'oyster', 'fish'], pizza: ['pizza'], french: ['french', 'bistro'], vegetarian: ['vegetarian', 'vegan'] };
export const RATE_TAGS = { food: '😋 Great food', cozy: '🕯 Cozy', fun: '🎉 Fun', again: '🔁 Would go again', loud: '🔊 Too loud', pricey: '💸 Pricey', wait: '⏳ Long wait', far: '🚗 Too far' };
const text = (x) => `${x.name || x.title || ''} ${(x.tags || []).join(' ')} ${x.why || ''} ${x.kind || ''}`.toLowerCase();
export const cuisinesOf = (x) => Object.keys(CUISINE_WORDS).filter((c) => CUISINE_WORDS[c].some((w) => text(x).includes(w)));
const genresOf = (x) => (x.kind === 'movie' ? (x.tags || []).filter((t) => t !== 'movie') : []);
const placeKey = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export function tasteOf(ratings = []) {
  const t = { cuisines: {}, genres: {}, price: {}, places: {}, names: {}, tags: {}, n: 0 };
  const add = (o, k, v) => { if (k) o[k] = (o[k] || 0) + v; };
  for (const r of ratings) {
    if (!r || r.skip) continue;
    t.n++;
    const base = r.overall === 3 ? 2 : r.overall === 1 ? -2 : r.overall === 2 ? 1 : 0;
    for (const tag of r.tags || []) add(t.tags, tag, 1);
    const stops = r.stops?.length ? r.stops : [];
    for (const s of stops) {
      const v = s.r === 2 ? 2 : s.r === 1 ? 1 : s.r === -1 ? -2 : base;
      for (const c of cuisinesOf(s)) add(t.cuisines, c, v);
      for (const g of genresOf(s)) add(t.genres, g, v);
      if (s.price) add(t.price, s.price, v > 0 ? 1 : -1);
      add(t.places, placeKey(s.name), v); t.names[placeKey(s.name)] = s.name;
    }
  }
  return t;
}
// How much an idea fits your taste, and why (for the "Because you ❤️'d sushi" line).
export function fit(x, t) {
  if (!t?.n) return { score: 0, why: '' };
  const place = t.places[placeKey(x.title || x.name)] || 0;
  if (place <= -2) return { score: -99, why: '', hide: true };
  let score = place * 1.5, why = place >= 2 ? 'You loved it' : '';
  for (const c of cuisinesOf(x)) { score += t.cuisines[c] || 0; if (!why && (t.cuisines[c] || 0) >= 2) why = `Because you ❤️ ${c}`; }
  for (const g of genresOf(x)) { score += (t.genres[g] || 0) * 0.7; if (!why && (t.genres[g] || 0) >= 2) why = `You like ${g}`; }
  if (x.price && t.price[x.price]) score += t.price[x.price] * 0.5;
  if (x.price === '$$$$' && (t.tags.pricey || 0) >= 2) score -= 2;
  return { score, why };
}
// The line an outing request can carry (you can switch it off): likes, dislikes, no names of people.
export function tasteLine(t) {
  if (!t?.n) return '';
  const top = (o, sign) => Object.entries(o).filter(([, v]) => (sign > 0 ? v >= 2 : v <= -2)).sort((a, b) => sign * (b[1] - a[1])).slice(0, 3).map(([k]) => k);
  const loved = top(t.places, 1), skip = top(t.places, -1), like = top(t.cuisines, 1), nope = top(t.cuisines, -1);
  const price = Object.entries(t.price).filter(([, v]) => v > 0).map(([k]) => k).sort();
  const avoid = [['loud', 'loud places'], ['wait', 'long waits'], ['far', 'long drives'], ['pricey', 'very expensive places']].filter(([k]) => (t.tags[k] || 0) >= 2).map(([, l]) => l);
  return [like.length && `They love ${like.join(' and ')}`, nope.length && `not keen on ${nope.join(' or ')}`, price.length && `usually ${price[0]}${price.length > 1 ? `–${price[price.length - 1]}` : ''}`,
    avoid.length && `avoid ${avoid.join(', ')}`, loved.length && `they loved ${loved.map((k) => t.names[k]).join(', ')}`, skip.length && `skip ${skip.map((k) => t.names[k]).join(', ')}`].filter(Boolean).join('; ').slice(0, 300);
}
