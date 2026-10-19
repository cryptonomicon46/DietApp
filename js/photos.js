// 📸 Progress photos. Kept ONLY on this phone (IndexedDB): never synced, never sent to the
// connector, not in backups — body photos are private. Shown on Food › Weight and in the
// weekly check-in, with a side-by-side of the first, middle and latest (or the ones you pick).
// 📤 Share progress sends a summary with or without them — photos leave the phone only then.
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const POSES = { front: 'Front', side: 'Side', back: 'Back' };

// ---------- pure (tested) ----------
// The photos to compare: the ones you starred (oldest → newest), else the first, the middle
// and the latest within [from, to] for one pose (the most common one if not given).
export function pickCompare(photos, from = '', to = '9999', pose = null) {
  const inRange = photos.filter((p) => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
  const starred = inRange.filter((p) => p.star);
  if (starred.length >= 2) return starred.slice(-3);
  const counts = {};
  for (const p of inRange) counts[p.pose] = (counts[p.pose] || 0) + 1;
  const use = pose || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const list = inRange.filter((p) => p.pose === use);
  if (list.length <= 3) return list;
  return [list[0], list[Math.floor((list.length - 1) / 2)], list[list.length - 1]];
}
// Photos to go with a shared progress summary for [from, to]: that period's, or — when it has
// fewer than two — the program's / all of them (outside: true, so the summary can say so).
export function photosFor(photos, from, to, programStart = '') {
  const inPeriod = pickCompare(photos, from, to);
  if (inPeriod.length >= 2) return { list: inPeriod, outside: false };
  let list = pickCompare(photos, programStart, to);
  if (list.length < 2) list = pickCompare(photos);
  return { list, outside: list.some((p) => p.date < from || p.date > to) };
}

// ---------- storage (this phone only) ----------
let dbp = null;
const db = () => (dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('ourpawmily-photos', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('photos', mode); const q = fn(t.objectStore('photos')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
let cache = null; // [{id, owner, date, pose, star, at, blob}]
export async function allPhotos(owner) {
  if (!owner) return [];
  cache ||= (await tx('readonly', (s) => s.getAll()).catch(() => [])) || [];
  return cache.filter((p) => p.owner === owner);
}
async function put(p) { await tx('readwrite', (s) => s.put(p)); cache = null; }
async function remove(id) { await tx('readwrite', (s) => s.delete(id)); cache = null; }
// Phone photos are big: keep a 1080px JPEG.
async function shrink(file, side = 1080) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
  } catch { return file; }
}
const urls = new Map();
const urlOf = (p) => { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob)); return urls.get(p.id); };

// One image with the photos side by side, each with its date and weight.
export async function compareImage(list, weightOn, title) {
  const W = 360, H = 480, pad = 16, top = 56, bottom = 64;
  const c = document.createElement('canvas');
  c.width = pad + list.length * (W + pad); c.height = top + H + bottom;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f4ef'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1d2420'; g.font = '700 26px system-ui, sans-serif'; g.fillText(title, pad, 38);
  for (const [i, p] of list.entries()) {
    const bmp = await createImageBitmap(p.blob);
    const x = pad + i * (W + pad);
    const k = Math.max(W / bmp.width, H / bmp.height); // cover
    const sw = W / k, sh = H / k;
    g.save(); g.beginPath(); g.roundRect?.(x, top, W, H, 14); g.clip();
    g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, top, W, H);
    g.restore();
    g.fillStyle = '#1d2420'; g.font = '700 22px system-ui, sans-serif';
    g.fillText(fmt(p.date), x, top + H + 30);
    const w = weightOn(p.date);
    g.fillStyle = '#2f7d5b'; g.font = '600 20px system-ui, sans-serif';
    if (w) g.fillText(`${w.toFixed(1)} lb`, x, top + H + 56);
  }
  g.fillStyle = '#6b736e'; g.font = '16px system-ui, sans-serif'; g.textAlign = 'right';
  g.fillText('OurPawmily', c.width - pad, 38);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}

// Images stacked top to bottom at one width (a progress poster with the photos under it).
export async function stackImages(blobs, width = 1080) {
  const bmps = await Promise.all(blobs.filter(Boolean).map((b) => createImageBitmap(b)));
  const hs = bmps.map((b) => Math.round(b.height * (width / b.width)));
  const c = document.createElement('canvas');
  c.width = width; c.height = hs.reduce((a, h) => a + h, 0);
  const g = c.getContext('2d');
  let y = 0;
  bmps.forEach((b, i) => { g.drawImage(b, 0, y, width, hs[i]); y += hs[i]; });
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}
export const photoTitle = (list) => `${fmt(list[0].date)} → ${fmt(list[list.length - 1].date)}`;

// ---------- UI ----------
let ctx = { owner: () => null, weightOn: () => null, programStart: () => '' };
let pose = 'front';
let phDate = isoDate(); // older photos can be added with their own date
let showAll = false;
let msg = '';

const compareStrip = (list, weightOn) => (list.length >= 2
  ? `<div class="ph-compare">${list.map((p, i) => `<figure><img src="${urlOf(p)}" alt="Progress photo ${fmt(p.date)}"><figcaption><b>${i === 0 ? 'First' : i === list.length - 1 ? 'Latest' : 'Middle'}</b> · ${fmt(p.date)}${weightOn(p.date) ? ` · ${weightOn(p.date).toFixed(1)} lb` : ''}</figcaption></figure>`).join('')}</div>`
  : '<p class="small muted">Add a photo each week (same spot, same light, same pose) and the first, middle and latest show side by side here.</p>');
const addRow = () => `<div class="row wrap ph-add">
    <div class="seg">${Object.entries(POSES).map(([k, v]) => `<button type="button" class="${k === pose ? 'on' : ''}" data-phpose="${k}">${v}</button>`).join('')}</div>
    <input type="date" data-phdate value="${phDate}" max="${isoDate()}" aria-label="Photo date">
    <label class="filebtn small">📸 Add a photo<input type="file" accept="image/*" data-phadd hidden></label>
  </div>`;

export async function renderPhotos() {
  const owner = ctx.owner();
  const full = $('#photosCard'), mini = $('#ckPhotos');
  if (!owner || (!full && !mini)) return;
  const photos = await allPhotos(owner);
  const from = ctx.programStart() || '';
  // This program's photos; all of them if the program has fewer than two.
  let cmp = pickCompare(photos, from, isoDate());
  if (cmp.length < 2) cmp = pickCompare(photos);
  if (full) {
    const list = [...photos].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
    full.innerHTML = `<div class="row between" style="margin-top:0"><h2 style="margin:0">📸 Progress photos</h2><button type="button" class="ghost small" data-shareprogress>📤 Share progress</button></div>
      <p class="small muted">Only on this phone — never synced or uploaded; they leave it only if you share them. ${photos.length ? 'Tap ☆ to pick which ones to compare (up to 3).' : ''}</p>
      ${compareStrip(cmp, ctx.weightOn)}
      ${addRow()}
      ${list.length ? `<div class="ph-grid">${list.slice(0, showAll ? 200 : 9).map((p) => `<figure class="${p.star ? 'star' : ''}"><img src="${urlOf(p)}" alt="${esc(POSES[p.pose] || '')} ${fmt(p.date)}"><figcaption>${fmt(p.date)} · ${esc(POSES[p.pose] || '')}</figcaption>
        <button type="button" class="ph-star" data-phstar="${p.id}" aria-label="${p.star ? 'Remove from comparison' : 'Compare this one'}">${p.star ? '★' : '☆'}</button><button type="button" class="ph-del" data-phdel="${p.id}" aria-label="Delete photo">✕</button></figure>`).join('')}</div>
        ${list.length > 9 && !showAll ? '<button type="button" class="linkish small" data-phall>Show all</button>' : ''}` : ''}
      ${msg ? `<p class="small">${esc(msg)}</p>` : ''}`;
  }
  if (mini) {
    const week = photos.filter((p) => p.date > isoDate(new Date(Date.now() - 7 * 864e5)));
    mini.innerHTML = `<div class="ph-mini"><div class="row between" style="margin-top:0"><b class="small">📸 Progress photos</b><span class="small muted">${week.length ? `✓ ${week.length} this week` : 'none this week yet'}</span></div>
      ${cmp.length >= 2 ? compareStrip(cmp, ctx.weightOn) : ''}
      ${addRow()}</div>`;
  }
}

export function initPhotos(opts) {
  ctx = { ...ctx, ...opts };
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('#photosCard, #ckPhotos')) return;
    const d = t.dataset;
    if (d.phpose) pose = d.phpose;
    else if (d.phall != null) showAll = true;
    else if (d.phstar) {
      const p = (await allPhotos(ctx.owner())).find((x) => x.id === d.phstar);
      const starred = (await allPhotos(ctx.owner())).filter((x) => x.star && x.id !== p.id);
      if (!p.star && starred.length >= 3) { msg = 'Pick up to 3 — un-star one first.'; }
      else { msg = ''; await put({ ...p, star: !p.star }); }
    } else if (d.phdel) {
      if (!confirm('Delete this photo from this phone?')) return;
      await remove(d.phdel);
      if (urls.has(d.phdel)) { URL.revokeObjectURL(urls.get(d.phdel)); urls.delete(d.phdel); }
    } else return;
    renderPhotos();
  });
  document.addEventListener('change', async (e) => {
    if (e.target.dataset?.phdate != null) { phDate = e.target.value || isoDate(); return; }
    if (e.target.dataset?.phadd == null) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await shrink(file);
    const picked = e.target.closest('.ph-add')?.querySelector('[data-phdate]')?.value;
    const date = picked && picked <= isoDate() ? picked : isoDate();
    await put({ id: `ph${Date.now().toString(36)}`, owner: ctx.owner(), date, pose, star: false, at: Date.now(), blob });
    msg = 'Saved on this phone. 💪';
    renderPhotos();
  });
}
