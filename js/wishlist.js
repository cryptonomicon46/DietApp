// 🎁 Wishlist (💞 Us): each person's own list, kept in their trackers under `wishlist` — the "us"
// part (js/healthParts.js), so only their partner can read it, sealed with the family key like
// the rest. "I'm getting this" for your partner's item is kept in your own full copy under
// `wishClaims` (in no part), so they never see it. Pure: no storage, no network.
export const LOVE = { really: '❤️ Really want', nice: '🙂 Nice to have', someday: '💭 Someday' };
export const MAX_ITEMS = 60;
export const MAX_PIC = 160_000; // a screenshot, made small on the phone (a data: URL)
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// Only https links, and only the address (no scripts, no data: links).
export function safeLink(s) {
  const t = String(s || '').trim();
  try { const u = new URL(t); return u.protocol === 'https:' ? u.href.slice(0, 500) : ''; } catch { return ''; }
}
// "$10,250" / "10250" / "10,250.00" → 10250 (null when there's no number).
export function priceOf(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
  return m ? Math.round(+m[0] * 100) / 100 : null;
}
export const priceText = (n) => (n == null ? '' : `$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 })}`);
const PIC_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// One item, cleaned: what you typed (or the link / screenshot and its caption).
export function itemOf(x = {}, now = Date.now()) {
  const pic = typeof x.pic === 'string' && x.pic.length <= MAX_PIC && PIC_RE.test(x.pic) ? x.pic : '';
  const name = clean(x.name, 80) || clean(x.caption, 80);
  if (!name && !pic) return null;
  return {
    id: /^[a-z0-9]{6,20}$/.test(x.id || '') ? x.id : `w${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name || 'Something I liked',
    details: clean(x.details, 140),
    caption: clean(x.caption, 160),
    price: priceOf(x.price),
    link: safeLink(x.link),
    pic,
    love: LOVE[x.love] ? x.love : 'nice',
    at: Number.isFinite(x.at) ? x.at : now,
    ...(x.got ? { got: clean(x.got, 10) } : {}),
  };
}
// Newest list after adding or changing one item (by id).
export function upsert(list = [], item) {
  if (!item) return list;
  const rest = (list || []).filter((x) => x.id !== item.id);
  return [item, ...rest].slice(0, MAX_ITEMS);
}
export const remove = (list = [], id) => (list || []).filter((x) => x.id !== id);
// What a list shows: what's still wanted, ❤️ first, then newest. Got ones go last.
const RANK = { really: 0, nice: 1, someday: 2 };
export function shown(list = []) {
  return (list || []).filter(Boolean).slice().sort((a, b) => !!a.got - !!b.got || (RANK[a.love] ?? 1) - (RANK[b.love] ?? 1) || (b.at || 0) - (a.at || 0));
}
// Your partner's list as you see it: with your own secret "I'm getting this" marks (never theirs).
export function theirsWithClaims(list = [], claims = {}) {
  return shown(list).map((x) => ({ ...x, mine: !!claims?.[x.id] }));
}
export function toggleClaim(claims = {}, id, now = Date.now()) {
  const out = { ...(claims || {}) };
  if (out[id]) delete out[id]; else out[id] = now;
  return out;
}
