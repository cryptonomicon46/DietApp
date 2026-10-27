// 🛒 Market matching, on the phone (listings are end-to-end encrypted, so the connector can't):
// someone else's listing that shares a real word with one of your open "wanted" listings.

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'some', 'have', 'need', 'want', 'wanted', 'looking', 'anyone', 'please', 'used', 'good', 'great', 'like', 'free', 'sale', 'lend', 'borrow', 'small', 'large', 'size']);
export const words = (s) => [...new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).filter((w) => w.length >= 3 && !STOP.has(w)))];

// items: [{id, mine, kind, status, d: {title, body}}] → {itemId: the wanted title it matches}.
export function matchWanted(items) {
  const wants = items.filter((x) => x.mine && x.kind === 'wanted' && x.status !== 'done').map((x) => ({ title: x.d?.title || '', w: words(`${x.d?.title} ${x.d?.body}`) })).filter((x) => x.w.length);
  const out = {};
  for (const x of items) {
    if (x.mine || x.kind === 'wanted' || x.status === 'done') continue;
    const have = new Set(words(`${x.d?.title} ${x.d?.body}`));
    const hit = wants.find((w) => w.w.some((t) => have.has(t)));
    if (hit) out[x.id] = hit.title;
  }
  return out;
}
