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
// Options: `seen`, `saved` (id → when) and `skip` (ids: picked, booked) leave the deck too; `all`
// keeps them (▦ Browse all shows everything still to come, with its badges).
export function deck({ week, rhythm, passed = {}, tab = 'all', today, now = Date.now(), taste = null, seen = {}, saved = {}, skip = new Set(), all = false }) {
  const live = (x) => (all || (!(passed[x.id] > now) && !seen[x.id] && !saved[x.id] && !skip.has(x.id))) && (!x.day || x.day >= today) && !(taste && fit(x, taste).hide) && !forKids(x);
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

// 🧸 Kids' and family shows aren't date ideas (the scout's own tags, or the title says so).
const KIDS = /\b(kids?|children'?s|toddlers?|family fun|storytime|bluey|paw patrol|peppa|sesame street|disney junior|cocomelon|baby shark)\b/i;
export const forKids = (x) => x.kind === 'event' && ((x.tags || []).some((t) => /^(family|children'?s theatre|children'?s|kids)$/i.test(t)) || KIDS.test(x.title || ''));

// ---------- what you've answered: kept in your own trackers (in no shared part) ----------
// { pass: { id: until }, seen: { id: when }, saved: { id: when } } — "Not for us" hides an idea for
// 90 days, "Seen it" for good, "Save" keeps it in ⏭ Saved (out of the deck) until you take it out.
export const emptyState = () => ({ pass: {}, seen: {}, saved: {} });
export function answer(st, id, what, now = Date.now()) {
  const out = { pass: { ...st.pass }, seen: { ...st.seen }, saved: { ...st.saved } };
  for (const k of ['pass', 'seen', 'saved']) delete out[k][id];
  if (what === 'pass') out.pass[id] = now + 90 * 864e5;
  if (what === 'seen') out.seen[id] = now;
  if (what === 'save') out.saved[id] = now;
  // 'clear': back in the deck.
  return out;
}
// Two copies (this phone and your trackers) → one: the later answer for each idea wins; old
// "Not for us" ones drop off.
export function mergeState(a = emptyState(), b = emptyState(), now = Date.now()) {
  const out = emptyState(), when = (st, k, id) => (k === 'pass' ? (st.pass?.[id] || 0) - 90 * 864e5 : st[k]?.[id] || 0);
  const ids = new Set([a, b].flatMap((st) => ['pass', 'seen', 'saved'].flatMap((k) => Object.keys(st?.[k] || {}))));
  for (const id of ids) {
    let best = null;
    for (const st of [a, b]) for (const k of ['pass', 'seen', 'saved']) if (st?.[k]?.[id] && (!best || when(st, k, id) > best.t)) best = { k, v: st[k][id], t: when(st, k, id) };
    if (best && !(best.k === 'pass' && best.v < now)) out[best.k][id] = best.v;
  }
  return out;
}
// The words for "seen it" on each kind of idea.
export const SEEN_LABEL = { movie: ['👁', 'Seen it'], food: ['✓', 'Been there'], event: ['✓', 'Going / went'], starter: ['✓', 'Done it'], again: ['✓', 'Done it'] };

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

// ---------- the screens: the Us card, the 💡 Date ideas sheet, ❤️ date-night rows ----------
// Drawn here (this module loads with Us) from what family/app.js passes in.
export function views(v) {
  const { esc, ideas, dn, calm, isoLocal, dayText, scoreLine, ideaMeta, taste, partnerName, picked, ideaSt, ideaById, ideaAll, ideaDeck, ideaIcon, ideasEmpty, openSheet, fam, member, dnDay, dnTitle } = v;
  const ideaThumb = (x, cls = '') => (x.img ? `<img class="${cls}" src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="di-ico ${cls}">${ideaIcon(x)}</span>`);
  function ideasCard() {
    if (!ideas.loaded) return '';
    const st = calm.R ? calm.R.rhythmStatus(calm.rhythm || [], isoLocal()).date : null;
    const due = st && (!st.last || st.level === 'due' || st.level === 'soon') && !dn.bookedNext;
    const top = ideaDeck('all').slice(0, 10), n = ideaDeck('all').length;
    const m = (ideas.matches || [])[0];
    return `<div class="row between"><h2 class="card-h">✨ Ideas for Us</h2><button type="button" class="linkish small" data-act="ideaset" aria-label="Date idea settings">⚙︎</button></div>
      ${m ? `<div class="di-match"><b>💞 It's a match: ${esc(m.idea.title)}</b>${m.idea.day ? `<small>${esc(dayText(m.idea.day, m.idea.time))}</small>` : ''}<div class="row wrap"><button type="button" class="small" data-match="${esc(m.t)}">📅 Make it a plan</button><button type="button" class="ghost small" data-discuss="i:${esc(m.t)}" data-dtitle="${esc(`💡 ${m.idea.title}`)}">💬 Discuss</button></div></div>` : ''}
      ${due ? `<p class="small muted">${st.last ? 'Time for a date? It\'s been a while.' : 'Time for a date? Your first on the 2-2-2-2 is waiting.'} 💗 what you'd like — when you both pick the same one, it's a match.</p>` : ''}
      ${top.length ? `<div class="di-row" role="list">${top.map((x) => `<button type="button" class="di-tile" role="listitem" data-ideaopen="${esc(x.id)}"><span class="di-pst">${ideaThumb(x)}</span><b>${esc(x.title)}</b><small>${scoreLine(x) || (x.day ? esc(dayText(x.day, x.time)) : esc(x.why || ideas.I.TABS[x.kind]?.replace(/^\S+ /, '') || ''))}</small></button>`).join('')}</div>`
        : '<p class="small muted">You\'ve been through them all — new ones come every Wednesday.</p>'}
      <button type="button" class="wide" data-act="ideas">💡 Find a date idea${n ? ` · ${n} to look at` : ''}</button>
      <p class="tiny muted">🔒 Your 💗 stay private until you both pick the same one.${ideas.week ? ` · This week around ${esc(ideas.week.area?.label || ideas.settings?.label || 'you')}` : ''}</p>`;
  }
  // The sheet: 🃏 one at a time (decide) or ▦ browse all (scroll and compare), the kinds as tabs, and
  // your three lists — 💗 My picks, 💞 Matches, ⏭ Saved.
  const SEEN = (x) => ideas.I.SEEN_LABEL[x.kind] || ideas.I.SEEN_LABEL.starter;
  function ideaBadge(x) {
    const t = ideas.tok[x.id];
    if ((ideas.matches || []).some((m) => m.t === t)) return '💞 Match';
    if (dn.booked?.[x.id]) return `📅 Booked ${new Date(`${dn.booked[x.id]}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}`;
    if (picked(x)) return '💗 Picked';
    if (ideaSt().seen[x.id]) return `${SEEN(x)[0]} ${SEEN(x)[1]}`;
    if (ideaSt().saved[x.id]) return '⏭ Saved';
    return '';
  }
  function ideaCardHtml(x, { pos = '', nav = true } = {}) {
    const links = [x.reserve ? `<a class="btn small" href="${esc(x.reserve)}" target="_blank" rel="noopener">🍽️ Reserve on OpenTable</a>` : '', x.url ? `<a class="btn ghost small" href="${esc(x.url)}" target="_blank" rel="noopener">${x.kind === 'event' ? '🎟 Tickets' : x.kind === 'movie' ? '🎟 Showtimes' : '🔗 More'}</a>` : ''].join('');
    const times = x.theatres?.length ? `<div class="stack tight">${x.theatres.map((t) => `<div class="small"><b>${esc(t.name)}</b><div class="rchips">${t.times.slice(0, 8).map((s2) => `<span class="rchip">${esc(dayText(s2.day, s2.time))}${s2.format ? ` · ${esc(s2.format)}` : ''}</span>`).join('')}</div></div>`).join('')}</div>`
      : x.kind === 'movie' ? `<p class="tiny muted">Showtimes: ${(ideas.settings?.theatres || []).map(esc).join(' · ') || 'your theatres'}</p>` : '';
    const badge = ideaBadge(x);
    return `<article class="ideacard">
      <div class="di-top" data-swipe="${esc(x.id)}">${x.img ? `<img class="poster" src="${esc(x.img)}" alt="" draggable="false">` : `<div class="ideabig">${ideaIcon(x)}</div>`}
        ${nav ? '<button type="button" class="di-nav l" data-ideanav="-1" aria-label="Back">‹</button><button type="button" class="di-nav r" data-ideanav="1" aria-label="Next">›</button>' : ''}${badge ? `<span class="di-badge">${esc(badge)}</span>` : ''}</div>
      <h3>${esc(x.title)}${x.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}</h3>
      ${ideaMeta(x) ? `<p class="small">${ideaMeta(x)}</p>` : ''}${scoreLine(x) ? `<p class="small"><b>${scoreLine(x)}</b> <span class="tiny muted">critics · audiences</span></p>` : ''}
      ${x.genre || x.runtime ? `<p class="small muted">${esc([x.genre, x.runtime, x.rated].filter(Boolean).join(' · '))}</p>` : ''}
      ${x.why ? `<p class="small muted">${esc(x.why)}</p>` : ''}${taste() && ideas.I.fit(x, taste()).why ? `<p class="fitwhy small">${esc(ideas.I.fit(x, taste()).why)}</p>` : ''}${times}
      ${links ? `<div class="row wrap">${links}</div>` : ''}
      <div class="row wrap"><button type="button" class="linkish small" data-ideasuggest="${esc(x.id)}">✨ Suggest it to ${esc(partnerName())} now</button>${ideas.tok[x.id] ? `<button type="button" class="linkish small" data-discuss="i:${ideas.tok[x.id]}" data-dtitle="${esc(`💡 ${x.title}`)}" data-dbody="${esc([x.why || '', x.url || ''].filter(Boolean).join('\n'))}">💬 Discuss</button>` : ''}</div>
      ${pos}</article>`;
  }
  function ideaActs(x) {
    const p = picked(x), sv = ideaSt().saved[x.id], sn = ideaSt().seen[x.id], [si, sl] = SEEN(x);
    return `<div class="di-acts">
      <button type="button" class="di-act" data-idea="${esc(x.id)}:pass"><span>✕</span>Not for us</button>
      <button type="button" class="di-act${sn ? ' on' : ''}" data-idea="${esc(x.id)}:${sn ? 'clear' : 'seen'}"><span>${si}</span>${esc(sl)}</button>
      <button type="button" class="di-act${sv ? ' on' : ''}" data-idea="${esc(x.id)}:${sv ? 'clear' : 'save'}"><span>⏭</span>${sv ? 'Saved' : 'Save'}</button>
      ${p ? `<button type="button" class="di-act want" data-idea="${esc(x.id)}:unpick"><span>💗</span>Picked</button>` : `<button type="button" class="di-act want" data-idea="${esc(x.id)}:pick"><span>💗</span>Want to</button>`}</div>`;
  }
  const flashHtml = () => (ideas.flash ? `<div class="di-flash" role="status"><span>${esc(ideas.flash.text)}</span><span>${ideas.flash.rate ? `<button type="button" data-idearate="${esc(ideas.flash.id)}">★ Rate it</button>` : ''}<button type="button" data-act="ideaundo">Undo</button></span></div>` : '');
  function ideasSheet() {
    const I = ideas.I, n = (k) => ({ picks: ideaAll().filter((x) => picked(x)).length, matches: (ideas.matches || []).length, saved: Object.keys(ideaSt().saved).filter((id) => ideaById(id)).length })[k];
    const tabs = Object.entries(I.TABS).map(([k, l]) => `<button type="button" class="chip ${k === ideas.tab ? 'on' : ''}" data-ideatab="${k}">${l}</button>`).join('');
    const lists = `<div class="di-lists">${[['picks', '💗 My picks'], ['matches', '💞 Matches'], ['saved', '⏭ Saved']].map(([k, l]) => `<button type="button" class="${ideas.view === 'list' && ideas.list === k ? 'on' : ''}" data-ideaview="list:${k}">${l}${n(k) ? ` <b>${n(k)}</b>` : ''}</button>`).join('')}</div>`;
    const seg = `<div class="di-seg" role="tablist"><button type="button" role="tab" aria-selected="${ideas.view === 'deck'}" class="${ideas.view === 'deck' ? 'on' : ''}" data-ideaview="deck">🃏 One at a time</button><button type="button" role="tab" aria-selected="${ideas.view === 'browse'}" class="${ideas.view === 'browse' ? 'on' : ''}" data-ideaview="browse">▦ Browse all</button></div>`;
    let body = '';
    if (ideas.focus) {
      // One idea opened from Browse or a list: the same card and answers, and back to where you were.
      const x = ideaById(ideas.focus);
      body = x ? `<button type="button" class="linkish small" data-ideaview="${esc(ideas.back || 'browse')}">‹ Back</button>${ideaCardHtml(x, { nav: false })}${flashHtml()}${ideaActs(x)}` : '';
    } else if (ideas.view === 'list') body = ideaListHtml();
    else if (ideas.view === 'browse') {
      const all = ideaDeck(ideas.tab, true).filter((x) => !ideas.hideSeen || !ideaSt().seen[x.id]), shown = all.slice(0, ideas.page * 12);
      body = `<div class="rchips ideatabs">${tabs}</div><div class="row between small di-brow"><span class="muted">${all.length} ${esc(I.TABS[ideas.tab].replace(/^\S+ /, '').toLowerCase())} · best first</span><button type="button" class="linkish small" data-act="ideahideseen">${ideas.hideSeen ? 'Show seen' : 'Hide seen'}</button></div>
        ${shown.length ? `<div class="di-grid">${shown.map((x) => { const b = ideaBadge(x); return `<div class="di-gt"><div class="di-pw"><button type="button" class="di-pst" data-ideaopen="${esc(x.id)}" aria-label="${esc(x.title)}">${ideaThumb(x)}${b ? `<span class="di-badge">${esc(b)}</span>` : ''}</button>
          <button type="button" class="di-heart" data-idea="${esc(x.id)}:${picked(x) ? 'unpick' : 'pick'}" aria-label="${picked(x) ? 'Unpick' : 'Pick'} ${esc(x.title)}" aria-pressed="${picked(x)}">${picked(x) ? '💗' : '🤍'}</button></div>
          <b>${esc(x.title)}</b><small>${scoreLine(x) || (x.day ? esc(dayText(x.day, x.time)) : esc(x.where || x.why || ''))}</small></div>`; }).join('')}</div>
          ${all.length > shown.length ? `<button type="button" class="ghost wide di-more" data-act="ideamore">Show ${Math.min(12, all.length - shown.length)} more</button>` : ''}` : ideasEmpty()}`;
    } else {
      const list = ideaDeck();
      ideas.i = Math.min(Math.max(0, ideas.i), Math.max(0, list.length - 1));
      const x = list[ideas.i];
      body = `<div class="rchips ideatabs">${tabs}</div>${x ? `${ideaCardHtml(x, { pos: `<div class="di-prog" aria-hidden="true"><i style="width:${Math.round(((ideas.i + 1) / list.length) * 100)}%"></i></div>` })}${flashHtml()}${ideaActs(x)}
        <p class="di-hint">${ideas.i + 1} of ${list.length}${x.src ? ` · ${esc(x.src)}` : ''} · swipe the picture: → want to · ← not for us</p>` : `${flashHtml()}${ideasEmpty()}`}`;
    }
    openSheet(`<div class="row between"><h2>💡 Date ideas</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
      ${ideas.focus ? '' : seg + lists}${body}
      <p class="tiny muted">🔒 ${esc(partnerName())} can't see what you 💗, save or mark seen — only a match, when you've both picked it.</p>`);
  }
  function ideaListHtml() {
    const row = (x, btn) => `<div class="di-pl"><button type="button" class="di-pst" data-ideaopen="${esc(x.id)}" data-ideaback="list:${ideas.list}" aria-label="${esc(x.title)}">${ideaThumb(x)}</button><div><b>${esc(x.title)}</b><small>${scoreLine(x) || (x.day ? esc(dayText(x.day, x.time)) : esc(x.where || x.why || ''))}</small></div>${btn}</div>`;
    if (ideas.list === 'matches') {
      const ms = ideas.matches || [];
      return ms.length ? ms.map((m) => `<div class="di-match"><b>💞 You both want ${esc(m.idea.title)}</b>${m.idea.day ? `<small>${esc(dayText(m.idea.day, m.idea.time))}${m.idea.where ? ` · ${esc(m.idea.where)}` : ''}</small>` : ''}<div class="row wrap"><button type="button" class="small" data-match="${esc(m.t)}">📅 Make it a plan</button>${m.idea.url ? `<a class="btn ghost small" href="${esc(m.idea.url)}" target="_blank" rel="noopener">${m.idea.kind === 'movie' ? '🎟 Showtimes' : '🔗 More'}</a>` : ''}<button type="button" class="ghost small" data-discuss="i:${esc(m.t)}" data-dtitle="${esc(`💡 ${m.idea.title}`)}">💬 Discuss</button></div></div>`).join('')
        : `<p class="small muted">No matches yet. When you and ${esc(partnerName())} both 💗 the same idea, it shows here, ready to make a plan.</p>`;
    }
    if (ideas.list === 'saved') {
      const xs = Object.entries(ideaSt().saved).sort((a, b) => b[1] - a[1]).map(([id]) => ideaById(id)).filter(Boolean);
      return xs.length ? `<p class="tiny muted">Saved for later — out of the deck until you take them out.</p>${xs.map((x) => row(x, `<span class="row"><button type="button" class="ghost small" data-idea="${esc(x.id)}:pick" aria-label="Pick ${esc(x.title)}">💗</button><button type="button" class="ghost small" data-idea="${esc(x.id)}:clear">Back in deck</button></span>`)).join('')}`
        : '<p class="small muted">Nothing saved. ⏭ Save keeps an idea here for later.</p>';
    }
    const xs = ideaAll().filter((x) => picked(x));
    return xs.length ? `<p class="tiny muted">💗 Only you see these — waiting for ${esc(partnerName())} to pick the same.</p>${xs.map((x) => row(x, `<button type="button" class="ghost small" data-idea="${esc(x.id)}:unpick">Unpick</button>`)).join('')}`
      : '<p class="small muted">Nothing picked yet. 💗 Want to on an idea puts it here (only you see it).</p>';
  }
  const dnTime = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  function dnRow(x) {
    const whose = x.who === 'both' ? 'On your calendars · both of you' : x.who === fam().me ? 'On your calendar' : `On ${member(x.who)?.name || 'a'}'s calendar`;
    const idea = x.idea;
    const links = [idea?.url ? `<a href="${esc(idea.url)}" target="_blank" rel="noopener">🎟 ${idea.kind === 'movie' ? 'Showtimes' : 'Tickets'}</a>` : '', x.place ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.place)}" target="_blank" rel="noopener">🚗 Directions</a>` : '',
      x.verdict === 'yes' ? `<button type="button" class="linkish small" data-datemark="${esc(x.key)}" data-dmv="no">Not a date?</button>` : ''].filter(Boolean).join('');
    return `<div class="dn-up">${dnDay(x.date)}<div><b>${x.icon} ${esc(dnTitle(x.title))}</b><small class="muted">${[dnTime(x.time), x.place].filter(Boolean).map(esc).join(' · ')}</small><span class="dn-src">📅 ${esc(whose)}</span>
      ${links ? `<span class="dn-links">${links}</span>` : ''}
      ${x.verdict === 'ask' ? `<div class="dn-ask">Is this a date night for you two?<div class="row wrap"><button type="button" class="small" data-datemark="${esc(x.key)}" data-dmv="yes">❤️ Yes, date night</button><button type="button" class="ghost small" data-datemark="${esc(x.key)}" data-dmv="no">Not a date</button></div></div>` : ''}</div></div>`;
  }
  return { ideaThumb, ideasCard, SEEN, ideaBadge, ideasSheet, dnRow };
}
