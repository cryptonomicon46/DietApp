// 🎲💑 A show's games: its bingo card set, a bingo game being played, and its couples-picks season,
// found by the show's name. Tags like "- US", "(UK)", "- Season 3" or a year are ignored, so
// "Love Is Blind" picks belong to "Love Is Blind - US" and a "The Gentleman" card set to
// "The Gentleman - Season 3". Pure.
const TAG = /\s*(?:[-–—:|(]\s*)?(?:\(?\s*(?:us|usa|uk|au|australia|canada|brazil|japan|germany|france|mexico|sweden|italy|spain|south africa|argentina|habibi|season\s*\d+|series\s*\d+|part\s*\d+|vol(?:ume)?\.?\s*\d+|s\d{1,2}|(?:19|20)\d{2})\s*\)?)\s*$/i;
export function showKey(title) {
  let t = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
  for (let i = 0; i < 4 && TAG.test(t); i++) t = t.replace(TAG, '').trim();
  return t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
}
export const sameShow = (a, b) => !!showKey(a) && showKey(a) === showKey(b);
// → { live: a bingo game being played, pack: its card set, picks: its couples-picks season (one
//   being played first, else the latest) } — any of them may be null.
export function gamesFor(title, { packs = [], games = [], seasons = [] } = {}) {
  const live = games.filter((g) => g.status === 'live' && sameShow(g.title, title)).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
  const pack = packs.find((p) => sameShow(p.title, title)) || null;
  const mine = seasons.filter((s) => sameShow(s.title, title));
  const picks = mine.find((s) => s.status === 'live') || mine.sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
  return { live, pack, picks };
}
