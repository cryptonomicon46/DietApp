// 💑 Couples picks: a prediction game for dating shows (Love Is Blind and the like). A season has
// couples and a list of things that might happen to them; everyone privately ticks what they
// think each couple will do, and how it ends. Picks for a couple lock (and are revealed) once
// anything is marked for that couple. Scoring: +2 for each pick that happens, +5 for calling the
// ending, and −1 for each pick that never happened once the couple's ending is in.

export const EVENTS = [
  { id: 'fight', label: '💥 They fight' },
  { id: 'cry', label: '😭 Someone cries' },
  { id: 'cheat', label: '💔 Someone cheats' },
  { id: 'drunk', label: '🍷 Gets drunk & passes out' },
  { id: 'ily', label: '❤️ Says "I love you"' },
  { id: 'family', label: '👪 Family disapproves' },
  { id: 'ex', label: '🔥 An ex comes up' },
  { id: 'money', label: '💸 Fights about money' },
];
export const OUTCOMES = { ido: '💍 Both say "I do"', altar: '🙅 A "no" at the altar', before: '💔 Split before the wedding' };
export const POINTS = { hit: 2, outcome: 5, miss: -1 };

// A couple is locked once something is marked for it (or its ending is in).
export const locked = (season, cid) => (season.happened?.[cid] || []).length > 0 || !!season.outcome?.[cid];

// One player's points. picks: {coupleId: {events: [ids], outcome}} → {points, hits, endings}
export function score(season, picks = {}) {
  let points = 0, hits = 0, endings = 0;
  for (const c of season.couples) {
    const mine = picks[c.id];
    if (!mine) continue;
    const happened = new Set(season.happened?.[c.id] || []);
    const ending = season.outcome?.[c.id];
    for (const e of mine.events || []) {
      if (happened.has(e)) { points += POINTS.hit; hits++; } else if (ending) points += POINTS.miss;
    }
    if (ending && mine.outcome === ending) { points += POINTS.outcome; endings++; }
  }
  return { points, hits, endings };
}

// "Sam & Pat", "Sam and Pat", "Sam + Pat", "Sam/Pat" → {a, b}
export function parseCouples(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
    .map((l) => { const [a, b = ''] = l.split(/\s*(?:&|\+|\/|,|\band\b)\s*/i); return { a: a.slice(0, 30), b: b.slice(0, 30) }; })
    .filter((c) => c.a).slice(0, 16);
}
