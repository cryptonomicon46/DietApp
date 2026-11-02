// ⚖️ Today's weigh-in from Health: the number is checked before it's saved (with the change since
// your last weigh-in, so a typo stands out), and progress photos can go with it — front, side and
// back picked in one go, labelled in the order you picked them (tap a label to change it). Photos
// stay on this phone only (js/photos.js: IndexedDB, never synced, uploaded or sent to AI).
// Loaded the first time you tap Save on Health's weight row (or 📸 Photos once you've weighed in).
let c = null; // { esc, openSheet, closeSheet, toast, saveWeight, owner, VERSION }
const st = { lb: null, last: null, files: [], mode: 'weigh', busy: false };
let P = null;
const photos = () => (P ||= import(`../js/photos.js?v=${c.VERSION}`).catch((e) => { P = null; throw e; }));

export const POSES = ['front', 'side', 'back'];
const LABEL = { front: 'Front', side: 'Side', back: 'Back' };
// Pure: poses for photos picked in one go, in order (front, side, back; more than 3 wrap round).
export const posesFor = (n) => Array.from({ length: n }, (_, i) => POSES[i % 3]);
export const nextPose = (p) => POSES[(POSES.indexOf(p) + 1) % 3];
// Pure: the line under the number — the change since your last weigh-in, and a check when it's a
// big jump (more than 5 lb, or 3 % of your weight) so a mistyped number isn't saved by accident.
export function changeLine(lb, last, fmtDate = (d) => d) {
  if (!last || !(last.weight > 0)) return { text: 'Your first weigh-in here', warn: false };
  const d = Math.round((lb - last.weight) * 10) / 10;
  const warn = Math.abs(d) > Math.max(5, last.weight * 0.03);
  const what = d === 0 ? 'Same as' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} lb since`;
  return { text: `${what} ${fmtDate(last.date)} (${last.weight.toFixed(1)} lb)`, warn };
}

export function init(ctx) { c = ctx; }
const E = (s) => c.esc(s);
const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const urls = new Map();
const urlOf = (f) => { if (!urls.has(f)) urls.set(f, URL.createObjectURL(f)); return urls.get(f); };
function dropUrls() { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }

function photosHtml() {
  const tiles = st.files.map((x, i) => `<figure class="wi-tile"><img src="${urlOf(x.file)}" alt="${LABEL[x.pose]} photo">
      <button type="button" class="ghost wi-pose" data-wi="pose:${i}" aria-label="${LABEL[x.pose]} — tap to change">${LABEL[x.pose]} ↻</button>
      <button type="button" class="wi-x" data-wi="drop:${i}" aria-label="Remove the ${LABEL[x.pose].toLowerCase()} photo">✕</button></figure>`).join('');
  return `<div class="wi-photos">
      ${tiles ? `<div class="wi-tiles">${tiles}</div>` : ''}
      <label class="filebtn wi-add">📸 ${st.files.length ? 'Choose again' : 'Add progress photos'}<small>Pick front, side and back together — labelled in that order</small><input type="file" accept="image/*" multiple data-wiphotos hidden></label>
      <p class="tiny muted">Only on this phone — never synced or uploaded. They're on Food › Weight too.</p>
    </div>`;
}
function render() {
  if (st.mode === 'photos') {
    return c.openSheet(`<div class="wi-sheet"><div class="row between"><h2>📸 Progress photos</h2><button type="button" class="icon-btn" data-wi="close" aria-label="Close">✕</button></div>
      <p class="small muted">Same spot, same light, same pose each time makes the comparison honest.</p>
      ${photosHtml()}
      <div class="wi-acts"><button type="button" data-wi="savephotos" ${st.files.length && !st.busy ? '' : 'disabled'}>${st.busy ? 'Saving…' : `✓ Save ${st.files.length || ''} photo${st.files.length === 1 ? '' : 's'}`}</button></div></div>`);
  }
  const ch = changeLine(st.lb, st.last, fmt), n = st.files.length;
  c.openSheet(`<div class="wi-sheet"><div class="row between"><h2>⚖️ Save today's weight?</h2><button type="button" class="icon-btn" data-wi="close" aria-label="Close">✕</button></div>
    <p class="wi-big"><b>${st.lb.toFixed(1)}</b> lb</p>
    <p class="small ${ch.warn ? 'wi-warn' : 'muted'}" role="${ch.warn ? 'alert' : 'status'}">${ch.warn ? '⚠️ ' : ''}${E(ch.text)}${ch.warn ? ' — is that right?' : ''}</p>
    ${photosHtml()}
    <div class="wi-acts"><button type="button" data-wi="save" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Saving…' : `✓ Save ${st.lb.toFixed(1)} lb${n ? ` + ${n} photo${n === 1 ? '' : 's'}` : ''}`}</button><button type="button" class="ghost" data-wi="close">Edit</button></div></div>`);
}

// Save on Health's weight row: check it first.
export function confirm(lb, last) {
  dropUrls();
  Object.assign(st, { lb, last, files: [], mode: 'weigh', busy: false });
  render();
}
// 📸 Photos on Health once you've weighed in.
export function photosOnly() {
  dropUrls();
  Object.assign(st, { lb: null, last: null, files: [], mode: 'photos', busy: false });
  render();
}
export function onPick(input) {
  const files = [...(input.files || [])].filter((f) => /^image\//.test(f.type) || !f.type).slice(0, 3);
  if (!files.length) return;
  dropUrls();
  const poses = posesFor(files.length);
  st.files = files.map((file, i) => ({ file, pose: poses[i] }));
  if ((input.files?.length || 0) > 3) c.toast('The first 3 are used — front, side and back');
  render();
}
async function savePics() {
  if (!st.files.length) return 0;
  const PH = await photos();
  return PH.savePhotos(c.owner(), st.files);
}
export async function onClick(t) {
  const [k, i] = String(t.dataset.wi || '').split(':');
  if (k === 'close') { dropUrls(); return c.closeSheet(); }
  if (k === 'pose') { const x = st.files[+i]; if (x) x.pose = nextPose(x.pose); return render(); }
  if (k === 'drop') { st.files.splice(+i, 1); return render(); }
  if (k === 'photos') return photosOnly();
  if (st.busy) return null;
  if (k === 'savephotos') {
    st.busy = true; render();
    try { const n = await savePics(); dropUrls(); c.closeSheet(); c.toast(`📸 ${n} photo${n === 1 ? '' : 's'} saved on this phone`); c.refresh(); } catch (e) { st.busy = false; render(); c.toast(e.message); }
    return null;
  }
  if (k === 'save') {
    st.busy = true; render();
    let r;
    try { r = await c.saveWeight(st.lb, { from: t }); } catch (e) { st.busy = false; render(); return c.toast(e.message); }
    let n = 0, photoErr = '';
    try { n = await savePics(); } catch (e) { photoErr = e.message; }
    const lb = st.lb.toFixed(1);
    dropUrls(); c.closeSheet();
    c.toast(`⚖️ ${lb} lb saved${n ? ` · 📸 ${n} photo${n === 1 ? '' : 's'} on this phone` : ''} · ${r.line}${photoErr ? ` — photos not saved: ${photoErr}` : ''}`);
    return null;
  }
  return null;
}
