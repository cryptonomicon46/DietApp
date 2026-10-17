// 🏡 Dogs up for adoption: either of you pastes the link to an ad (Facebook, a shelter,
// Petfinder…) with a few details and, optionally, a screenshot of the ad, and both phones see
// it on a board at the bottom of the Dogs tab. Facebook won't show its posts to other sites,
// so the board keeps what you type plus the screenshot, and "Open ad" takes you to the post.
// Each phone keeps its own copy as {id: dog}; fields carry the time they were changed so
// both partners' edits survive, and each partner's own reaction lives in their own copy.
import { PROFILES, ownerId, profileStore, seenItems } from './storage.js';
import { pushNow } from './sync.js';
import { idb, uploadFile, getFile, fileUrl } from './dogs.js';

export const ADOPT_FIELDS = ['url', 'name', 'age', 'breed', 'sex', 'size', 'where', 'notes', 'status', 'photo', 'deleted'];
export const STATUSES = {
  new: '🆕 Just found',
  interested: '😍 Interested',
  contacted: '💬 Contacted',
  applied: '📝 Applied',
  meet: '🤝 Meet & greet',
  pass: '🙅 Pass',
  gone: '🏠 Adopted by others',
  ours: '🎉 Ours!',
};
export const PAST = new Set(['pass', 'gone', 'ours']);
export const VOTES = { love: '❤️', like: '👍', maybe: '🤔', no: '👎' };

// ---------- pure (tested) ----------
// Shared links lose the tracking bits so the same ad from both phones is one dog.
export function cleanUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i) || String(text || '').match(/\b(?:www\.|m\.)?(?:facebook|fb|petfinder|adoptapet)\.[a-z.]+\/[^\s<>"']*/i);
  if (!m) return '';
  let url;
  try { url = new URL(/^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`); } catch { return ''; }
  for (const k of [...url.searchParams.keys()]) if (/^(fbclid|mibextid|rdid|share_url|utm_.*|ref|__cft__.*|__tn__|_rdr|sfnsn|s|igshid)$/i.test(k)) url.searchParams.delete(k);
  url.hash = '';
  if (/^(m|mbasic|web|www)\.facebook\.com$/i.test(url.hostname) || /^fb\.(com|me)$/i.test(url.hostname)) url.hostname = url.hostname.replace(/^(m|mbasic|web)\./i, 'www.');
  return url.toString().replace(/\/(\?|$)/, '$1');
}
export function sourceOf(url) {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
  if (/(^|\.)petfinder\.com$/.test(h)) return 'Petfinder';
  if (/(^|\.)adoptapet\.com$/.test(h)) return 'Adopt-a-Pet';
  if (/(^|\.)nextdoor\.com$/.test(h)) return 'Nextdoor';
  return h;
}
export function mergeAdopt(records) {
  const versions = {};
  for (const r of records) for (const [id, d] of Object.entries(r.dogs || {})) (versions[id] ||= []).push({ ...d, person: r.person });
  return Object.entries(versions).map(([id, vs]) => {
    const first = [...vs].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))[0];
    const dog = { id, addedAt: first.addedAt, addedBy: first.addedBy || first.person };
    // A copy that never had a field (and no time for it) doesn't clear it.
    const when = (v, f) => v.times?.[f] ?? (v[f] !== undefined ? v.updatedAt ?? 0 : 0);
    dog.times = {};
    for (const f of ADOPT_FIELDS) {
      const best = [...vs].sort((a, b) => when(b, f) - when(a, f))[0];
      dog.times[f] = when(best, f);
      if (best[f] !== undefined && best[f] !== '') dog[f] = best[f];
    }
    dog.status ||= 'new';
    dog.updatedAt = Math.max(...vs.map((v) => v.updatedAt || 0));
    // Reactions: each partner's comes from their own copy only.
    dog.votes = Object.fromEntries(vs.filter((v) => v.vote).map((v) => [v.person, v.vote]));
    return dog;
  }).filter((d) => !d.deleted)
    .sort((a, b) => (PAST.has(a.status) - PAST.has(b.status)) || (b.addedAt || 0) - (a.addedAt || 0));
}

// ---------- data ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const seenKey = (d) => `adopt:${d.id}`;
const MAX_SIDE = 1200;

export const allAdopt = () => mergeAdopt(PROFILES.map((p) => ({ person: p.id, dogs: profileStore(p.id).get('adoptDogs', {}) })));
function saveAdopt(dog, vote) {
  const now = Date.now();
  const prev = allAdopt().find((d) => d.id === dog.id);
  const s = profileStore(ownerId());
  const mine = s.get('adoptDogs', {});
  const times = { ...(prev?.times || {}) };
  const rec = { ...(mine[dog.id] || {}), addedAt: dog.addedAt, addedBy: dog.addedBy };
  for (const f of ADOPT_FIELDS) {
    if (JSON.stringify(dog[f] ?? null) !== JSON.stringify(prev?.[f] ?? null)) times[f] = now;
    if (dog[f] !== undefined) rec[f] = dog[f]; else delete rec[f];
  }
  if (vote !== undefined) rec.vote = vote;
  s.set('adoptDogs', { ...mine, [dog.id]: { ...rec, times, updatedAt: now } });
  pushNow().catch(() => {});
}
export const unseenAdopt = () => (ownerId() ? allAdopt().filter((d) => d.addedBy !== ownerId() && !PAST.has(d.status) && !seenItems.has(seenKey(d))) : []);

// A phone screenshot is several MB; a 1200px JPEG of it is plenty for the board.
async function shrink(file) {
  if (!/^image\//.test(file.type) || /gif|svg/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}
const thumbs = new Map(); // photo id → object URL
async function fillPhotos(el) {
  for (const img of el.querySelectorAll('img[data-photo]')) {
    const id = img.dataset.photo;
    if (!thumbs.has(id)) {
      const blob = await getFile(id).catch(() => null);
      if (!blob) { img.closest('.adopt-photo')?.classList.add('missing'); continue; }
      thumbs.set(id, URL.createObjectURL(blob));
    }
    img.src = thumbs.get(id);
  }
}
// Screenshots added while the connector couldn't take them get another try later.
export async function retryAdoptUploads() {
  for (const d of allAdopt()) {
    if (!d.photo || d.photo.shared || d.photo.by !== ownerId()) continue;
    const blob = await idb('readonly', (st) => st.get(d.photo.id)).catch(() => null);
    if (blob && await uploadFile(d.photo.id, blob).catch(() => false)) saveAdopt({ ...d, photo: { ...d.photo, shared: true } });
  }
}

// ---------- UI ----------
let draft = null;      // dog being added or edited
let showPast = false;
let fresh = null;      // partner's finds marked New during this visit
let note = '';

function form() {
  const d = draft;
  return `<form id="adoptForm" class="adopt-form">
    <div class="eyebrow">${d.addedAt ? 'Edit' : '＋ A dog up for adoption'}</div>
    <label>Link to the ad
      <div class="row" style="margin-top:4px"><input data-a="url" type="url" inputmode="url" value="${esc(d.url || '')}" placeholder="https://www.facebook.com/…" style="flex:1">
      <button type="button" class="ghost small" data-adoptpaste>📋 Paste</button></div></label>
    <p class="small muted">In Facebook: tap <b>Share</b> (or ••• ) › <b>Copy link</b>, then Paste here. A screenshot of the ad lets you both see the dog at a glance.</p>
    <div class="adopt-grid2">
      <label>Name<input data-a="name" value="${esc(d.name || '')}" placeholder="e.g. Biscuit"></label>
      <label>Age<input data-a="age" value="${esc(d.age || '')}" placeholder="e.g. 2 yrs"></label>
      <label>Breed / mix<input data-a="breed" value="${esc(d.breed || '')}" placeholder="e.g. Shepherd mix"></label>
      <label>Sex<select data-a="sex"><option value="">—</option>${['Male', 'Female'].map((x) => `<option ${d.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Size<select data-a="size"><option value="">—</option>${['Small', 'Medium', 'Large', 'X-large'].map((x) => `<option ${d.size === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Where<input data-a="where" value="${esc(d.where || '')}" placeholder="Rescue / shelter, city"></label>
    </div>
    <label>Notes<textarea data-a="notes" rows="2" placeholder="Good with dogs? Fee, contact, deadline…">${esc(d.notes || '')}</textarea></label>
    <label class="adopt-upload">📸 ${d.photo ? 'Replace the screenshot' : 'Add a screenshot or photo of the ad'}<input type="file" accept="image/*" data-adoptfile hidden></label>
    ${draft.pendingFile ? `<p class="small">✓ ${esc(draft.pendingFile.name || 'Photo')} ready</p>` : ''}
    ${note ? `<p class="small muted">${esc(note)}</p>` : ''}
    <div class="row between">${d.addedAt ? `<button type="button" class="ghost small danger" data-adoptdel="${d.id}">Remove</button>` : '<span></span>'}
      <div class="row" style="margin-top:0"><button type="button" class="ghost" data-adoptcancel>Cancel</button><button type="submit">Save</button></div></div>
  </form>`;
}

function card(d, me, fresh) {
  const partner = PROFILES.find((p) => p.id !== me)?.id;
  const facts = [d.age, d.sex, d.size, d.breed].filter(Boolean).map(esc).join(' · ');
  const src = d.url ? sourceOf(d.url) : '';
  const added = new Date(d.addedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<article class="adopt-card s-${d.status}">
    ${d.photo ? `<button type="button" class="adopt-photo" data-adoptphoto="${d.photo.id}" aria-label="Open the screenshot"><img data-photo="${d.photo.id}" alt="${esc(d.name || 'Dog')}"></button>` : '<div class="adopt-photo none">🐕</div>'}
    <div class="adopt-body">
      <div class="row between" style="margin-top:0;align-items:flex-start"><b class="adopt-name">${esc(d.name || 'Unnamed pup')}</b>${fresh ? '<span class="adopt-new">New</span>' : ''}</div>
      ${facts ? `<small>${facts}</small>` : ''}
      ${d.where ? `<small class="muted">📍 ${esc(d.where)}</small>` : ''}
      ${d.notes ? `<p class="small adopt-notes">${esc(d.notes)}</p>` : ''}
      <small class="muted">Found by ${esc(d.addedBy === me ? 'you' : nameOf(d.addedBy))} · ${added}</small>
      <div class="adopt-votes">${Object.entries(VOTES).map(([k, e]) => `<button type="button" class="vote ${d.votes[me] === k ? 'on' : ''}" data-adoptvote="${d.id}:${k}" aria-label="${k}">${e}</button>`).join('')}
        <small class="muted">${partner ? (d.votes[partner] ? `${esc(nameOf(partner))}: ${VOTES[d.votes[partner]]}` : `${esc(nameOf(partner))}: —`) : ''}</small></div>
      <select class="adopt-status" data-adoptstatus="${d.id}" aria-label="Status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="row" style="margin-top:6px">
        ${d.url ? `<a class="btn-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open ad${src ? ` on ${esc(src)}` : ''} ↗</a>` : ''}
        <button type="button" class="ghost small" data-adoptedit="${d.id}">Edit</button>
      </div>
    </div>
  </article>`;
}

// force: redraw an open form; the minute timer leaves it alone so typing isn't lost.
export function renderAdopt(force = false) {
  const el = $('#dogAdopt');
  if (!el || !ownerId()) return;
  if (draft) { if (force || !el.querySelector('#adoptForm')) el.innerHTML = `<div class="card adopt-card-wrap">${form()}</div>`; return; }
  const me = ownerId();
  const dogs = allAdopt();
  const active = dogs.filter((d) => !PAST.has(d.status));
  const past = dogs.filter((d) => PAST.has(d.status));
  const shown = showPast ? past : active;
  // "New" stays on your partner's finds for this visit to the Dogs tab, then they count as seen.
  const onTab = !!document.querySelector('#tab-brief.active');
  if (!onTab) fresh = null;
  else if (!fresh) { fresh = new Set(unseenAdopt().map((d) => d.id)); seenItems.add([...fresh].map((id) => `adopt:${id}`)); }
  const unseen = fresh || new Set();
  el.innerHTML = `<div class="card adopt-card-wrap">
    <div class="row between" style="margin-top:0"><div class="eyebrow">🏡 Dogs up for adoption</div><button type="button" class="ghost small" data-adoptadd>＋ Add a link</button></div>
    ${dogs.length ? `<div class="chips"><button type="button" class="chip ${showPast ? '' : 'on'}" data-adoptview="now">Looking · ${active.length}</button><button type="button" class="chip ${showPast ? 'on' : ''}" data-adoptview="past">Past · ${past.length}</button></div>` : ''}
    ${note ? `<p class="small muted">${esc(note)}</p>` : ''}
    ${shown.length ? `<div class="adopt-grid">${shown.map((d) => card(d, me, unseen.has(d.id))).join('')}</div>`
      : `<p class="small muted">${dogs.length ? (showPast ? 'Dogs you passed on or that found homes show up here.' : 'No dogs on the board right now.') : 'Spot a dog up for adoption on Facebook or a shelter site? Paste the link here with a screenshot, and it shows up on both phones. React with ❤️ 👍 🤔 👎 and track it from Interested to Applied.'}</p>`}
  </div>`;
  fillPhotos(el);
}

function readForm() {
  document.querySelectorAll('#adoptForm [data-a]').forEach((inp) => { draft[inp.dataset.a] = inp.value.trim(); });
}

export function initAdopt(root) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('#dogAdopt')) return;
    const ds = t.dataset;
    if (ds.adoptadd != null) { draft = { id: newId() }; note = ''; renderAdopt(); $('#adoptForm [data-a="url"]')?.focus(); }
    else if (ds.adoptcancel != null) { draft = null; note = ''; renderAdopt(); }
    else if (ds.adoptview) { showPast = ds.adoptview === 'past'; renderAdopt(); }
    else if (ds.adoptedit) { draft = { ...allAdopt().find((d) => d.id === ds.adoptedit) }; note = ''; renderAdopt(); }
    else if (ds.adoptpaste != null) {
      readForm();
      const text = await navigator.clipboard?.readText?.().catch(() => '') || '';
      const url = cleanUrl(text);
      note = url ? '' : 'Nothing to paste — copy the ad\'s link first (Share › Copy link), or type it in.';
      if (url) {
        draft.url = url;
        // Shared Facebook text often comes with the post's first line; keep it as a note.
        const rest = text.replace(/https?:\/\/\S+/g, '').trim();
        if (rest && !draft.notes) draft.notes = rest.slice(0, 300);
      }
      renderAdopt(true);
    } else if (ds.adoptdel) {
      if (!confirm(`Remove ${draft?.name || 'this dog'} from the board?`)) return;
      saveAdopt({ ...draft, deleted: true });
      if (draft.photo) { idb('readwrite', (st) => st.delete(draft.photo.id)).catch(() => {}); const u = fileUrl(draft.photo.id); if (u) fetch(u, { method: 'DELETE' }).catch(() => {}); }
      draft = null; renderAdopt();
    } else if (ds.adoptvote) {
      const [id, v] = ds.adoptvote.split(':');
      const d = allAdopt().find((x) => x.id === id);
      saveAdopt(d, d.votes[ownerId()] === v ? null : v);
      renderAdopt();
    } else if (ds.adoptphoto) {
      const blob = await getFile(ds.adoptphoto).catch(() => null);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank') || (location.href = url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset?.adoptstatus) {
      const d = allAdopt().find((x) => x.id === t.dataset.adoptstatus);
      saveAdopt({ ...d, status: t.value });
      if (PAST.has(t.value) && !showPast) note = `${d.name || 'That dog'} moved to Past.`;
      renderAdopt();
    } else if (t.dataset?.adoptfile != null) {
      const file = t.files?.[0];
      if (!file) return;
      readForm();
      draft.pendingFile = file;
      renderAdopt(true);
    }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'adoptForm') return;
    e.preventDefault();
    readForm();
    if (draft.url) draft.url = cleanUrl(draft.url) || draft.url;
    if (!draft.url && !draft.name && !draft.pendingFile) { note = 'Add the link, a name or a screenshot.'; renderAdopt(true); return; }
    const same = draft.url && allAdopt().find((d) => d.url === draft.url && d.id !== draft.id);
    if (same && !draft.addedAt) { note = `${same.name || 'That dog'} is already on the board${same.addedBy === ownerId() ? '' : ` — ${nameOf(same.addedBy)} added it`}.`; draft = null; renderAdopt(); return; }
    const { pendingFile, votes, ...dog } = draft;
    if (pendingFile) {
      note = 'Saving the screenshot…'; renderAdopt(true);
      const blob = await shrink(pendingFile);
      const id = newId();
      await idb('readwrite', (st) => st.put(blob, id)).catch(() => {});
      const shared = await uploadFile(id, blob).catch(() => false);
      if (dog.photo) idb('readwrite', (st) => st.delete(dog.photo.id)).catch(() => {});
      dog.photo = { id, by: ownerId(), shared };
      note = shared ? '' : 'Screenshot saved on this phone; it will reach your partner once the connector stores files (see README).';
    } else note = '';
    saveAdopt({ ...dog, addedAt: dog.addedAt || Date.now(), addedBy: dog.addedBy || ownerId(), status: dog.status || 'new' });
    draft = null; showPast = false;
    renderAdopt();
  });
}
