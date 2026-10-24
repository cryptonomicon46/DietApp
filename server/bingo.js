// 🎲 Show bingo: card sets are just lists of squares ("someone cries in the pods"), so a new show
// never needs an app update. Paste them in (from Claude, ChatGPT or your own head), load a file,
// or have Claude write them. Every player gets their own shuffled 5×5 card from the set, with a
// free square in the middle.

export const SIZE = 5, FREE = 12, NEED = 24;

// Squares from whatever was pasted or uploaded: a JSON list (or {squares: [...]}), or one per
// line with bullets, numbers or checkboxes stripped. Duplicates and blanks go.
export function parseSquares(text) {
  let items = null;
  try {
    const j = JSON.parse(text);
    items = Array.isArray(j) ? j : Array.isArray(j?.squares) ? j.squares : null;
  } catch { /* not JSON */ }
  if (!items) {
    items = String(text || '').split(/\r?\n/);
    // One long line of comma-separated squares.
    if (items.filter((x) => x.trim()).length === 1 && items[0].split(',').length >= NEED) items = items[0].split(',');
  }
  const seen = new Set(), out = [];
  for (const raw of items) {
    const s = String(typeof raw === 'object' && raw ? raw.text || raw.square || '' : raw)
      .replace(/^\s*(?:[-*•·]|\d+[.)]|\[[ x]?\]|☐|✅)\s*/i, '')
      .replace(/^["“](.*)["”],?$/, '$1') // a whole square in quotes (JSON-ish lists)
      .replace(/\s+/g, ' ').trim().slice(0, 70);
    if (s.length < 2 || /^(squares?|bingo|free( space)?)\s*:?$/i.test(s) || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase()); out.push(s);
  }
  return out.slice(0, 120);
}

// A card: 24 different squares from the set, in a random order, around the free middle.
// → 25 entries, each an index into the set (FREE is -1).
export function makeCard(count, rnd = Math.random) {
  if (count < NEED) throw new Error(`a card needs at least ${NEED} squares`);
  const idx = Array.from({ length: count }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const pick = idx.slice(0, NEED);
  return [...pick.slice(0, FREE), -1, ...pick.slice(FREE)];
}

// The lines that are complete (rows, columns, diagonals), the free middle counting as marked.
export function bingoLines(marks) {
  const on = (i) => i === FREE || !!marks[i];
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines.filter((l) => l.every(on));
}

// For making a set with any chatbot, offline.
export const bingoPrompt = (show) => `Make a bingo card set for watching "${show || 'our show'}" together.
Give me 30 short squares (under 8 words each) — funny, specific moments and clichés that are likely to happen in an episode, a mix of easy and rare.
Reply with just the squares, one per line, no numbers or bullets.`;
