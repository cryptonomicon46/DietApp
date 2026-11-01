// 🎁 Wishlist in 💞 Us (loaded when Us is opened): yours and your partner's, one card, two tabs.
// Add something with a link (a shop page you open later) or a screenshot and a short caption. On
// your partner's list, 🎁 I'm getting this is yours alone — they never see it. Lists live in each
// person's trackers (js/wishlist.js says where), sealed with the family key; nothing new goes to
// OurPawmily's server, and a link is never opened by it.
import * as W from '../js/wishlist.js';

const wl = { c: null, tab: 'mine', mine: [], theirs: null, claims: {}, partner: '', loaded: false, draft: null, busy: false };
export function init(c) { wl.c = c; }
const E = (s) => wl.c.esc(s);
const picHtml = (x, big = false) => (x.pic ? `<img src="${x.pic}" alt="" loading="lazy" decoding="async">` : `<span aria-hidden="true">${x.link ? '🔗' : '🎁'}</span>`);
const sub = (x) => [x.love === 'really' ? `<span class="wl-love">${W.LOVE.really}</span>` : '', x.details && E(x.details), x.pic && !x.details && x.caption && x.caption !== x.name ? '📷 Screenshot' : ''].filter(Boolean).join(' · ');

// Read both lists (yours from your copy, theirs from what they share with you as your partner).
export async function load() {
  const c = wl.c, p = c.partner();
  wl.partner = p?.first || 'Your partner';
  const [mine, theirs] = await Promise.all([c.myData().catch(() => null), p ? c.theirUs(p.id).catch(() => null) : null]);
  wl.mine = mine?.wishlist || [];
  wl.claims = mine?.wishClaims || {};
  wl.theirs = theirs ? theirs.wishlist || [] : null;
  wl.loaded = true;
}
export async function render(el, { reload = false } = {}) {
  if (!el) return;
  if (!wl.loaded || reload) { try { await load(); } catch { /* shown below */ } }
  const list = wl.tab === 'mine' ? W.shown(wl.mine) : W.theirsWithClaims(wl.theirs || [], wl.claims);
  const row = (x, i) => `<button type="button" class="wl-row${x.got ? ' got' : ''}" data-wl="open:${wl.tab}:${E(x.id)}"><span class="wl-pic">${picHtml(x)}</span><span class="wl-txt"><span class="wl-name">${E(x.name)}</span><span class="wl-sub">${sub(x)}${x.got ? ' · 🎉 got it' : ''}</span>${x.mine ? '<span class="wl-claim">🎁 You\'re getting this · only you see this</span>' : ''}</span><span class="wl-price">${E(W.priceText(x.price))}</span></button>`;
  const empty = wl.tab === 'mine' ? '<p class="small muted">Nothing yet. Add a link from any shop, or a screenshot with a few words.</p>'
    : wl.theirs == null ? `<p class="small muted">${E(wl.partner)}'s list shows here once they add something.</p>` : `<p class="small muted">${E(wl.partner)} hasn't added anything yet.</p>`;
  el.innerHTML = `<div class="row between"><h2 class="card-h">🎁 Wishlist</h2><span class="tiny muted">🔒 just you two</span></div>
    <div class="wl-tabs" role="tablist"><button type="button" role="tab" aria-selected="${wl.tab === 'mine'}" class="${wl.tab === 'mine' ? 'on' : ''}" data-wl="tab:mine">Mine · ${W.shown(wl.mine).filter((x) => !x.got).length}</button><button type="button" role="tab" aria-selected="${wl.tab === 'theirs'}" class="${wl.tab === 'theirs' ? 'on' : ''}" data-wl="tab:theirs">${E(wl.partner)}'s · ${(wl.theirs || []).filter((x) => !x.got).length}</button></div>
    ${list.length ? `<div class="wl-list">${list.map(row).join('')}</div>` : empty}
    ${wl.tab === 'mine' ? '<button type="button" class="ghost wl-add" data-wl="add">＋ Add to my wishlist</button>' : ''}`;
}

// ---------- adding and editing your own ----------
function drawForm() {
  const d = wl.draft, shot = d.mode === 'shot';
  wl.c.openSheet(`<div class="stack wl-form"><div class="row between"><h2>🎁 ${d.id ? 'Edit' : 'Add to my wishlist'}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="seg"><button type="button" class="${shot ? '' : 'on'}" data-wl="mode:link">🔗 Link it</button><button type="button" class="${shot ? 'on' : ''}" data-wl="mode:shot">📷 Screenshot + caption</button></div>
    ${shot ? `<div class="wl-shot">${d.pic ? `<img src="${d.pic}" alt="Your screenshot">` : '<span aria-hidden="true">📷</span>'}<label class="btn ghost small">${d.pic ? 'Choose another' : 'Choose a screenshot or photo'}<input type="file" accept="image/*" data-wlpick hidden></label></div>
      <label class="wl-field">Caption <textarea rows="2" maxlength="160" data-wle="caption" placeholder="A few words — what it is, the size or colour…">${E(d.caption)}</textarea></label>
      <label class="wl-field">Name <span class="muted">(optional)</span><input data-wle="name" maxlength="80" value="${E(d.name)}" placeholder="Rolex Submariner"></label>`
    : `<label class="wl-field">Link <input data-wle="link" inputmode="url" value="${E(d.link)}" placeholder="Paste a link from any shop"></label>
      <label class="wl-field">What is it? <input data-wle="name" maxlength="80" value="${E(d.name)}" placeholder="Rolex Submariner"></label>
      <label class="wl-field">Details <span class="muted">(optional)</span><input data-wle="details" maxlength="140" value="${E(d.details)}" placeholder="Size, colour, model…"></label>`}
    <div class="row wl-two"><label class="wl-field">Price <span class="muted">(optional)</span><input data-wle="price" inputmode="decimal" value="${E(d.price ?? '')}" placeholder="$"></label>${shot ? `<label class="wl-field">Link <span class="muted">(optional)</span><input data-wle="link" inputmode="url" value="${E(d.link)}" placeholder="If you have one"></label>` : ''}</div>
    <div class="wl-field">How much?</div>
    <div class="seg">${Object.entries(W.LOVE).map(([k, l]) => `<button type="button" class="${d.love === k ? 'on' : ''}" data-wl="love:${k}">${l}</button>`).join('')}</div>
    <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button type="button" data-wl="save" ${wl.busy ? 'disabled' : ''}>${d.id ? 'Save' : 'Add to my wishlist'}</button></div>
    <p class="tiny muted">🔒 Only ${E(wl.partner)} can see your wishlist — it's locked on your phone like your photos. A link isn't opened by OurPawmily; it's there for ${E(wl.partner)} to tap.</p></div>`);
}
// A screenshot, made small on the phone (≤ 720 px, JPEG) before it's kept.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 720 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  for (const q of [0.72, 0.6, 0.48, 0.36]) { const u = cv.toDataURL('image/jpeg', q); if (u.length <= W.MAX_PIC) return u; }
  return '';
}
export async function onPick(input) {
  const f = input.files?.[0];
  if (!f || !wl.draft) return;
  try { wl.draft.pic = await shrink(f); if (!wl.draft.pic) wl.c.toast("That picture is too big — try a screenshot"); } catch { wl.c.toast("Couldn't open that picture — try a screenshot"); }
  input.value = '';
  drawForm();
}
export function onInput(t) { if (wl.draft) wl.draft[t.dataset.wle] = t.value; }
async function save() {
  const d = wl.draft;
  const item = W.itemOf({ ...d, link: d.link, id: d.id || undefined, at: d.at });
  if (!item) return wl.c.toast(d.mode === 'shot' ? 'Add a screenshot or a caption first' : 'Say what it is first');
  if (d.link && !item.link) return wl.c.toast('That link needs to start with https://');
  wl.busy = true; drawForm();
  try {
    await wl.c.editMine((s) => s.set('wishlist', W.upsert(s.get('wishlist', []) || [], item)));
    wl.mine = W.upsert(wl.mine, item);
    wl.c.closeSheet(); wl.draft = null;
    wl.c.toast(d.id ? 'Saved' : `🎁 Added — ${wl.partner} can see it`);
    wl.tab = 'mine'; render(wl.c.card());
  } catch (e) { wl.c.toast(e.message || "Couldn't save just now"); }
  finally { wl.busy = false; }
}
async function changeMine(id, fn, msg) {
  try {
    await wl.c.editMine((s) => s.set('wishlist', fn(s.get('wishlist', []) || [])));
    wl.mine = fn(wl.mine);
    wl.c.closeSheet(); wl.c.toast(msg); render(wl.c.card());
  } catch (e) { wl.c.toast(e.message || "Couldn't save just now"); }
}

// ---------- one item ----------
function itemSheet(tab, id) {
  const list = tab === 'mine' ? wl.mine : W.theirsWithClaims(wl.theirs || [], wl.claims);
  const x = list.find((y) => y.id === id);
  if (!x) return null;
  const meta = [['Details', E(x.details)], ['Caption', x.caption && x.caption !== x.name ? `“${E(x.caption)}”` : ''], ['Price', E(W.priceText(x.price))], ['How much', `<span class="wl-love">${E(W.LOVE[x.love])}</span>`], [tab === 'mine' ? 'Added' : 'On the list', new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })]].filter(([, v]) => v);
  const acts = tab === 'mine'
    ? `<div class="wl-acts"><div class="row wl-two"><button type="button" class="ghost" data-wl="edit:${E(x.id)}">✎ Edit</button><button type="button" class="ghost" data-wl="got:${E(x.id)}">${x.got ? '↩︎ Still want it' : '🎉 I got it'}</button></div><button type="button" class="ghost" data-wl="del:${E(x.id)}">Remove from my list</button></div><p class="tiny muted center">You won't see if ${E(wl.partner)} is getting it for you.</p>`
    : `<div class="wl-acts"><button type="button" class="${x.mine ? 'ghost' : ''}" data-wl="claim:${E(x.id)}">${x.mine ? '↩︎ I\'m not getting this after all' : '🎁 I\'m getting this'}</button></div><p class="tiny muted center">🤫 ${E(wl.partner)} won't see this.</p>`;
  wl.c.openSheet(`<div class="stack"><div class="row between"><h2>${E(x.name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${x.pic ? `<img class="wl-hero" src="${x.pic}" alt="${E(x.caption || x.name)}">` : ''}
    <dl class="wl-meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${x.link ? `<a class="btn ghost" href="${E(x.link)}" target="_blank" rel="noopener noreferrer">🔗 Open the shop page</a>` : ''}
    ${acts}</div>`);
  return null;
}

export async function onClick(t) {
  const [a, ...r] = t.dataset.wl.split(':'), v = r.join(':');
  if (a === 'tab') { wl.tab = v === 'theirs' ? 'theirs' : 'mine'; return render(wl.c.card()); }
  if (a === 'add') { wl.draft = { mode: 'link', name: '', details: '', caption: '', price: '', link: '', pic: '', love: 'nice' }; return drawForm(); }
  if (a === 'mode') { wl.draft.mode = v; return drawForm(); }
  if (a === 'love') { wl.draft.love = v; return drawForm(); }
  if (a === 'save') return save();
  if (a === 'open') { const [tab, id] = r; return itemSheet(tab, id); }
  if (a === 'edit') { const x = wl.mine.find((y) => y.id === v); if (!x) return null; wl.draft = { ...x, price: x.price ?? '', mode: x.pic ? 'shot' : 'link' }; return drawForm(); }
  if (a === 'got') return changeMine(v, (l) => l.map((x) => (x.id === v ? (x.got ? (({ got, ...y }) => y)(x) : { ...x, got: new Date().toISOString().slice(0, 10) }) : x)), '🎉 Marked as got');
  if (a === 'del') { if (!wl.c.confirm('Remove this from your wishlist?')) return null; return changeMine(v, (l) => W.remove(l, v), 'Removed'); }
  if (a === 'claim') {
    try {
      const next = W.toggleClaim(wl.claims, v);
      await wl.c.editMine((s) => s.set('wishClaims', W.toggleClaim(s.get('wishClaims', {}) || {}, v)));
      wl.claims = next;
      wl.c.closeSheet(); wl.c.toast(next[v] ? `🎁 Noted — ${wl.partner} won't see it` : 'Okay — not marked any more'); render(wl.c.card());
    } catch (e) { wl.c.toast(e.message || "Couldn't save just now"); }
  }
  return null;
}
