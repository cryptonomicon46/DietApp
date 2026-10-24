// 🐶 Dog profiles: food, supplements, medications, vaccines, vet, and documents (vaccine
// certificates as PDFs or photos). Each phone keeps its own edits as {dogId: dog} in its
// profile; household sync carries them over and the newest edit of each dog wins.
// Documents are files, too big for sync: they live in this phone's IndexedDB and go to the
// household connector's file store (when it has one), so the other phone can open them too.
import { PROFILES, ownerId, profileStore, global } from './storage.js';
import { sync, pushNow } from './sync.js';

export const VACCINES = ['Rabies', 'DHPP', 'Bordetella', 'Leptospirosis', 'Canine influenza', 'Lyme'];
export const FOOD_TYPES = { dry: 'Dry kibble', wet: 'Wet / canned', fresh: 'Fresh / cooked', raw: 'Raw', mixed: 'Mixed' };
const SOON_DAYS = 30;
const MAX_FILE = 10 * 1024 * 1024;

// ---------- pure (tested) ----------
// Shared by both partners: each field keeps the time it was last changed, so if one of you
// updates the vaccines while the other updates the food, both changes survive. Documents
// from either phone are combined; a removed document stays removed.
export const DOG_FIELDS = ['name', 'emoji', 'photo', 'breed', 'sex', 'birthday', 'weightLb', 'food', 'supplements', 'meds', 'vaccines', 'vet', 'microchip', 'notes', 'deleted'];
export function mergeDogs(records) {
  const versions = {};
  for (const r of records) for (const [id, d] of Object.entries(r.dogs || {})) (versions[id] ||= []).push({ ...d, person: r.person });
  return Object.entries(versions).map(([id, vs]) => {
    const newest = [...vs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    const dog = { ...newest, id };
    const when = (v, f) => v.times?.[f] ?? v.updatedAt ?? 0;
    for (const f of DOG_FIELDS) {
      // A field a newer version doesn't have (e.g. no "deleted") counts as cleared then.
      const best = [...vs].sort((a, b) => when(b, f) - when(a, f))[0];
      if (best[f] !== undefined) dog[f] = best[f]; else delete dog[f];
    }
    const removed = new Set(vs.flatMap((v) => v.removedDocs || []));
    const docs = new Map();
    for (const v of vs) for (const doc of v.docs || []) if (!removed.has(doc.id)) docs.set(doc.id, { ...docs.get(doc.id), ...doc, shared: doc.shared || docs.get(doc.id)?.shared || false });
    dog.docs = [...docs.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    dog.removedDocs = [...removed];
    dog.editedBy = newest.by || newest.person;
    return dog;
  }).filter((d) => !d.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);
// One vaccine → { level: 'ok' | 'soon' | 'overdue' | 'unknown', days } (days until due; negative = overdue).
export function vaccineStatus(v, today) {
  if (!v?.due) return { level: 'unknown', days: null };
  const days = daysBetween(today, v.due);
  return { level: days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'ok', days };
}
// Everything that needs attention soon, across all dogs, most urgent first.
export function dogAlerts(dogs, today) {
  const out = [];
  for (const d of dogs) {
    for (const v of d.vaccines || []) {
      const s = vaccineStatus(v, today);
      if (s.level === 'overdue') out.push({ dog: d.name, kind: 'vaccine', what: v.name, days: s.days, text: `${v.name} overdue ${-s.days} day${s.days === -1 ? '' : 's'}` });
      else if (s.level === 'soon') out.push({ dog: d.name, kind: 'vaccine', what: v.name, days: s.days, text: s.days === 0 ? `${v.name} due today` : `${v.name} due in ${s.days} day${s.days === 1 ? '' : 's'}` });
    }
    for (const m of d.meds || []) {
      if (!m.refill) continue;
      const days = daysBetween(today, m.refill);
      if (days <= 7) out.push({ dog: d.name, kind: 'refill', what: m.name, days, text: days < 0 ? `${m.name} refill ${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? `${m.name} refill today` : `${m.name} refill in ${days} day${days === 1 ? '' : 's'}` });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
export function ageText(birthday, today) {
  if (!birthday) return '';
  const months = Math.floor(daysBetween(birthday, today) / 30.44);
  if (months < 0) return '';
  return months < 24 ? `${months} mo` : `${Math.floor(months / 12)} yr`;
}

// ---------- this phone ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shortDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Both of you, plus the family app's copy of each dog (account.js), newest edit of each field wins.
const records = () => [...PROFILES.map((p) => ({ person: p.id, dogs: profileStore(p.id).get('dogProfiles', {}) })), { person: 'family', dogs: global.get('famDogs', {}) }];
export const allDogs = () => mergeDogs(records());
// The dog's picture: the photo from the family app, else its emoji.
const face = (d, cls = '') => (d.photo ? `<img class="dog-photo ${cls}" src="${esc(d.photo)}" alt="">` : esc(d.emoji || '🐕'));
// Saves what changed, stamping each changed field so the partner's edits to other fields survive.
function saveDog(dog) {
  const now = Date.now();
  const prev = mergeDogs(records()).find((d) => d.id === dog.id);
  const times = { ...(prev?.times || {}) };
  for (const f of DOG_FIELDS) if (JSON.stringify(dog[f] ?? null) !== JSON.stringify(prev?.[f] ?? null)) times[f] = now;
  const { person, editedBy, ...clean } = dog;
  const s = profileStore(ownerId());
  s.set('dogProfiles', { ...s.get('dogProfiles', {}), [dog.id]: { ...clean, times, updatedAt: now, by: ownerId() } });
  pushNow().catch(() => {});
}

// Files: IndexedDB on the phone + the connector's household file store.
let dbp = null;
const db = () => (dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('pawmily-files', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
export const idb = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('files', mode); const q = fn(tx.objectStore('files')); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); }); };
export const fileUrl = (id) => { const s = sync.settings(); return s?.url && s?.code ? `${s.url}/household/${encodeURIComponent(s.code)}/file/${id}` : null; };
export async function uploadFile(id, blob) {
  const url = fileUrl(id);
  if (!url) return false;
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
  return res.ok;
}
export async function getFile(id) {
  const local = await idb('readonly', (st) => st.get(id)).catch(() => null);
  if (local) return local;
  const url = fileUrl(id);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  await idb('readwrite', (st) => st.put(blob, id)).catch(() => {});
  return blob;
}
// Files added while the connector couldn't take them get another try later.
export async function retryUploads() {
  for (const d of allDogs()) {
    const pending = (d.docs || []).filter((f) => !f.shared && f.by === ownerId());
    if (!pending.length) continue;
    let changed = false;
    for (const f of pending) {
      const blob = await idb('readonly', (st) => st.get(f.id)).catch(() => null);
      if (blob && await uploadFile(f.id, blob).catch(() => false)) { f.shared = true; changed = true; }
    }
    if (changed) saveDog(d);
  }
}

// ---------- UI ----------
let openDog = null;   // dog id shown in full
let draft = null;     // dog being edited (a copy)
let note = '';

const levelLabel = { ok: 'Current', soon: 'Due soon', overdue: 'Overdue', unknown: 'No due date' };
function badge(dog, today) {
  const levels = (dog.vaccines || []).map((v) => vaccineStatus(v, today).level);
  const worst = levels.includes('overdue') ? 'overdue' : levels.includes('soon') ? 'soon' : levels.length ? 'ok' : null;
  return worst ? `<span class="vax ${worst}">💉 ${worst === 'ok' ? 'Vaccines current' : worst === 'soon' ? 'Vaccine due soon' : 'Vaccine overdue'}</span>` : '<span class="vax unknown">💉 No vaccines yet</span>';
}

function dogView(d, today) {
  const age = ageText(d.birthday, today);
  const meds = (d.meds || []).filter((m) => m.active !== false);
  return `<div class="dog-full">
    <div class="row between" style="margin-top:0"><div><div class="dog-name">${face(d)} ${esc(d.name)}</div>
      <div class="small muted">${[d.breed, age, d.weightLb ? `${d.weightLb} lb` : '', d.sex].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="row" style="margin-top:0"><button type="button" class="ghost small" data-dogedit="${d.id}">Edit</button><button type="button" class="ghost small" data-dogclose>Done</button></div></div>
    ${badge(d, today)}
    <p class="small muted">Shared — either of you can edit or add documents.${d.updatedAt ? ` Last change by ${d.editedBy === ownerId() ? 'you' : esc(nameOf(d.editedBy))}, ${new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.` : ''}</p>
    <h4>🍖 Food</h4>
    <p class="small">${d.food?.brand ? `<b>${esc(d.food.brand)}</b>` : '<span class="muted">Not set</span>'}${d.food?.type ? ` · ${esc(FOOD_TYPES[d.food.type] || d.food.type)}` : ''}${d.food?.amount ? ` · ${esc(d.food.amount)} per meal` : ''}</p>
    <h4>🌿 Supplements</h4>
    ${(d.supplements || []).length ? `<ul class="list dog-list">${d.supplements.map((x) => `<li><span>${esc(x.name)}</span><small class="muted">${esc(x.dose || '')}</small></li>`).join('')}</ul>` : '<p class="small muted">None</p>'}
    <h4>💊 Medications & prescriptions</h4>
    ${meds.length ? `<ul class="list dog-list">${meds.map((m) => {
      const r = m.refill ? daysBetween(today, m.refill) : null;
      return `<li><span><b>${esc(m.name)}</b>${m.dose ? ` · ${esc(m.dose)}` : ''}<small class="muted">${m.schedule ? ` · ${esc(m.schedule)}` : ''}${m.vet ? ` · Rx ${esc(m.vet)}` : ''}</small></span>${m.refill ? `<small class="${r <= 7 ? 'tone-warn' : 'muted'}">refill ${shortDate(m.refill)}</small>` : ''}</li>`;
    }).join('')}</ul>` : '<p class="small muted">None</p>'}
    <h4>💉 Vaccines</h4>
    ${(d.vaccines || []).length ? `<ul class="list dog-list">${d.vaccines.map((v) => {
      const st = vaccineStatus(v, today);
      return `<li><span><b>${esc(v.name)}</b><small class="muted"> · given ${shortDate(v.given)}</small></span><span class="vax ${st.level}">${st.level === 'unknown' ? 'No due date' : `${levelLabel[st.level]} · ${shortDate(v.due)}`}</span></li>`;
    }).join('')}</ul>` : '<p class="small muted">None recorded</p>'}
    <h4>📄 Documents</h4>
    ${(d.docs || []).length ? `<ul class="list dog-list">${d.docs.map((f) => `<li><button type="button" class="linkish" data-dogdoc="${f.id}">${f.type === 'application/pdf' ? '📄' : '🖼️'} ${esc(f.name)}</button><span class="small muted">${shortDate(f.date)}${f.shared ? '' : ' · this phone only'} <button type="button" class="x" data-dogdocdel="${d.id}:${f.id}" aria-label="Remove ${esc(f.name)}">✕</button></span></li>`).join('')}</ul>` : '<p class="small muted">Add vaccine certificates and vet records (PDF or photo) for quick lookup.</p>'}
    <label class="filebtn ghost">＋ Add PDF or photo<input type="file" accept="application/pdf,image/*" data-dogupload="${d.id}" hidden></label>
    ${note ? `<p class="small">${esc(note)}</p>` : ''}
    <h4>🩺 Vet</h4>
    <p class="small">${d.vet?.name ? esc(d.vet.name) : '<span class="muted">Not set</span>'}${d.vet?.phone ? ` · <a href="tel:${esc(d.vet.phone.replace(/[^0-9+]/g, ''))}">${esc(d.vet.phone)}</a>` : ''}${d.microchip ? `<br><span class="muted">Microchip ${esc(d.microchip)}</span>` : ''}</p>
    ${d.notes ? `<h4>📝 Notes</h4><p class="small">${esc(d.notes)}</p>` : ''}
  </div>`;
}

const rowsOf = (key, cols) => (draft[key] || []).map((x, i) => `<div class="edit-row" data-row="${key}:${i}">${cols.map(([f, ph, type]) => (type === 'date'
  ? `<label class="small date-lbl">${ph}<input type="date" data-f="${key}:${i}:${f}" value="${esc(x[f] || '')}"></label>`
  : `<input data-f="${key}:${i}:${f}" value="${esc(x[f] || '')}" placeholder="${ph}" aria-label="${ph}">`)).join('')}<button type="button" class="x" data-rowdel="${key}:${i}" aria-label="Remove">✕</button></div>`).join('');
function dogForm() {
  const d = draft;
  return `<form id="dogForm" class="dog-form">
    <div class="eyebrow">${d.createdAt ? `Edit ${esc(d.name || 'dog')}` : 'Add a dog'}</div>
    <div class="row"><input data-f="emoji" value="${esc(d.emoji || '🐕')}" maxlength="4" style="flex:0 0 52px;text-align:center" aria-label="Emoji"><input data-f="name" value="${esc(d.name || '')}" placeholder="Name" required></div>
    <div class="row"><input data-f="breed" value="${esc(d.breed || '')}" placeholder="Breed"><select data-f="sex" aria-label="Sex"><option value="">Sex</option>${['Male', 'Female', 'Male (neutered)', 'Female (spayed)'].map((x) => `<option ${d.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="row"><label class="small">Birthday <input type="date" data-f="birthday" value="${esc(d.birthday || '')}"></label><label class="small">Weight (lb) <input type="number" inputmode="decimal" step="any" data-f="weightLb" value="${esc(d.weightLb || '')}"></label></div>
    <h4>🍖 Food</h4>
    <div class="row"><input data-f="food.brand" value="${esc(d.food?.brand || '')}" placeholder="Brand / recipe"><select data-f="food.type" aria-label="Food type"><option value="">Type</option>${Object.entries(FOOD_TYPES).map(([k, v]) => `<option value="${k}" ${d.food?.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <input data-f="food.amount" value="${esc(d.food?.amount || '')}" placeholder="Amount per meal, e.g. 1½ cups">
    <h4>🌿 Supplements</h4>${rowsOf('supplements', [['name', 'Supplement'], ['dose', 'Dose']])}
    <button type="button" class="ghost small" data-rowadd="supplements">＋ Supplement</button>
    <h4>💊 Medications & prescriptions</h4>${rowsOf('meds', [['name', 'Medicine'], ['dose', 'Dose'], ['schedule', 'When, e.g. daily'], ['vet', 'Prescribed by'], ['refill', 'Refill date', 'date']])}
    <button type="button" class="ghost small" data-rowadd="meds">＋ Medication</button>
    <h4>💉 Vaccines</h4>${rowsOf('vaccines', [['name', 'Vaccine'], ['given', 'Given', 'date'], ['due', 'Next due', 'date']])}
    <div class="row wrap"><button type="button" class="ghost small" data-rowadd="vaccines">＋ Vaccine</button>${VACCINES.filter((v) => !(d.vaccines || []).some((x) => x.name === v)).map((v) => `<button type="button" class="chip small" data-vaxadd="${v}">${v}</button>`).join('')}</div>
    <h4>🩺 Vet</h4>
    <div class="row"><input data-f="vet.name" value="${esc(d.vet?.name || '')}" placeholder="Vet clinic"><input type="tel" data-f="vet.phone" value="${esc(d.vet?.phone || '')}" placeholder="Phone"></div>
    <input data-f="microchip" value="${esc(d.microchip || '')}" placeholder="Microchip number">
    <textarea data-f="notes" rows="2" placeholder="Notes: allergies, behavior, insurance…">${esc(d.notes || '')}</textarea>
    <div class="row between">${d.createdAt ? `<button type="button" class="ghost small danger" data-dogdel="${d.id}">Remove dog</button>` : '<span></span>'}
      <div class="row" style="margin-top:0"><button type="button" class="ghost" data-dogcancel>Cancel</button><button type="submit">Save</button></div></div>
  </form>`;
}

// force: redraw an open form (after adding a row); the minute timer leaves it alone so typing isn't lost.
export function renderDogs(force = false) {
  const el = $('#dogProfiles');
  if (!el || !ownerId()) return;
  const today = isoDate();
  const dogs = allDogs();
  if (draft) { if (force || !el.querySelector('#dogForm')) el.innerHTML = `<div class="card">${dogForm()}</div>`; return; }
  const open = dogs.find((d) => d.id === openDog);
  if (open) { el.innerHTML = `<div class="card">${dogView(open, today)}</div>`; return; }
  const alerts = dogAlerts(dogs, today);
  el.innerHTML = `<div class="card">
    <div class="row between" style="margin-top:0"><div class="eyebrow">🐶 Our dogs</div><button type="button" class="ghost small" data-dogadd>＋ Add a dog</button></div>
    ${alerts.length ? `<ul class="dog-alerts">${alerts.slice(0, 4).map((a) => `<li class="${a.days < 0 ? 'overdue' : 'soon'}">⚠ <b>${esc(a.dog)}</b>: ${esc(a.text)}</li>`).join('')}</ul>` : ''}
    ${dogs.length ? `<div class="dog-grid">${dogs.map((d) => `<button type="button" class="dog-tile" data-dogopen="${d.id}">
        <span class="dog-emoji">${face(d)}</span><b>${esc(d.name)}</b>
        <small class="muted">${[d.breed, ageText(d.birthday, today)].filter(Boolean).map(esc).join(' · ') || 'Tap to fill in'}</small>
        ${badge(d, today)}
        <small class="muted">${(d.meds || []).filter((m) => m.active !== false).length} meds · ${(d.supplements || []).length} supplements · ${(d.docs || []).length} docs</small>
      </button>`).join('')}</div>` : '<p class="small muted">Add each dog: food, supplements, medications, vaccines, vet and documents in one place.</p>'}
    <p class="small muted">Shared between both phones — either of you can add a dog, update vaccines or food, or upload documents.</p>
  </div>`;
}

function readDraft() {
  document.querySelectorAll('#dogForm [data-f]').forEach((inp) => {
    const path = inp.dataset.f.split(':');
    if (path.length === 3) { const [key, i, f] = path; draft[key][+i][f] = inp.value.trim(); return; }
    const [a, b] = inp.dataset.f.split('.');
    if (b) draft[a] = { ...(draft[a] || {}), [b]: inp.value.trim() };
    else draft[a] = a === 'weightLb' ? (inp.value === '' ? '' : +inp.value) : inp.value.trim();
  });
}

export function initDogs(root) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('#dogProfiles')) return;
    if (t.dataset.dogadd != null) { draft = { id: newId(), supplements: [], meds: [], vaccines: [], docs: [] }; renderDogs(); $('#dogForm [data-f="name"]')?.focus(); }
    else if (t.dataset.dogopen) { openDog = t.dataset.dogopen; note = ''; renderDogs(); }
    else if (t.dataset.dogclose != null) { openDog = null; renderDogs(); }
    else if (t.dataset.dogedit) { draft = structuredClone(allDogs().find((d) => d.id === t.dataset.dogedit)); for (const k of ['supplements', 'meds', 'vaccines']) draft[k] ||= []; renderDogs(); }
    else if (t.dataset.dogcancel != null) { draft = null; renderDogs(); }
    else if (t.dataset.rowadd) { readDraft(); draft[t.dataset.rowadd].push({}); renderDogs(true); }
    else if (t.dataset.vaxadd) { readDraft(); draft.vaccines.push({ name: t.dataset.vaxadd }); renderDogs(true); }
    else if (t.dataset.rowdel) { readDraft(); const [k, i] = t.dataset.rowdel.split(':'); draft[k].splice(+i, 1); renderDogs(true); }
    else if (t.dataset.dogdel) {
      if (!confirm(`Remove ${draft?.name || 'this dog'} and its records?`)) return;
      saveDog({ ...draft, deleted: true }); draft = null; openDog = null; renderDogs();
    } else if (t.dataset.dogdoc) {
      const blob = await getFile(t.dataset.dogdoc).catch(() => null);
      if (!blob) { note = 'That file is only on the other phone. It will open here once the connector can store files (see README).'; renderDogs(); return; }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank') || (location.href = url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (t.dataset.dogdocdel) {
      const [dogId, fid] = t.dataset.dogdocdel.split(':');
      if (!confirm('Remove this document?')) return;
      const d = allDogs().find((x) => x.id === dogId);
      saveDog({ ...d, docs: (d.docs || []).filter((f) => f.id !== fid), removedDocs: [...(d.removedDocs || []), fid] });
      idb('readwrite', (st) => st.delete(fid)).catch(() => {});
      const url = fileUrl(fid);
      if (url) fetch(url, { method: 'DELETE' }).catch(() => {});
      renderDogs();
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'dogForm') return;
    e.preventDefault();
    readDraft();
    if (!draft.name) return;
    for (const k of ['supplements', 'meds', 'vaccines']) draft[k] = draft[k].filter((x) => x.name);
    const dog = { ...draft, createdAt: draft.createdAt || Date.now() };
    saveDog(dog);
    openDog = dog.id; draft = null;
    renderDogs();
  });
  root.addEventListener('change', async (e) => {
    const dogId = e.target.dataset?.dogupload;
    if (!dogId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE) { note = 'That file is over 10 MB — try a smaller scan or a photo.'; renderDogs(); return; }
    const id = newId();
    note = 'Saving…'; renderDogs();
    await idb('readwrite', (st) => st.put(file, id));
    const shared = await uploadFile(id, file).catch(() => false);
    const d = allDogs().find((x) => x.id === dogId);
    saveDog({ ...d, docs: [...(d.docs || []), { id, name: file.name, type: file.type, size: file.size, date: isoDate(), by: ownerId(), shared }] });
    note = shared ? 'Saved — your partner can open it too.' : 'Saved on this phone. It will be shared once the connector is updated to store files (see README).';
    renderDogs();
  });
}
