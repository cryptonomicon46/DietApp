// Notes tab: a shared post-it board for little daily notes to each other.
// Each person's notes live in their own profile (so household sync carries them);
// hearts you give the other person's notes live in yours.
import { PROFILES, ownerId, profileStore, global, seenItems } from './storage.js';
import { sync, pushNow } from './sync.js';
import { renderPlans, initPlans, unreadPlans, syncLine } from './plans.js';
import { renderShows, initShows } from './shows.js';

export const NOTE_EMOJI = ['❤️', '😘', '🥰', '😍', '💕', '🤗', '💪', '🔥', '🌟', '🎉', '☀️', '🌙', '🌸', '🍳', '🥗', '🍓', '☕', '😂', '🙏', '👏'];
export const NOTE_COLORS = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green' };
const MAX = 280;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const me = () => ownerId();
const partner = () => PROFILES.find((p) => p.id !== me());
const nameOf = (id) => profileStore(id).get('profile', null)?.name || PROFILES.find((p) => p.id === id)?.name || id;
const notesOf = (id) => profileStore(id).get('notes', []);

let color = 'yellow';
let replyTo = null; // the note you're answering, if any
const carried = new Set(); // unread notes from before this morning, kept on the board until you leave the tab

// The board starts fresh every morning at 5 AM (late-night notes stay up until then).
export const MORNING_HOUR = 5;
export function boardStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(MORNING_HOUR, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}
const key = (n) => `${n.from}:${n.id}`;

// All notes from both people, newest first.
export function allNotes() {
  return PROFILES.flatMap((p) => notesOf(p.id).map((n) => ({ ...n, from: p.id }))).sort((a, b) => b.at - a.at);
}

// Days in a row (ending today or yesterday) that this person left a note.
export function noteStreak(notes, today = isoDate()) {
  const days = new Set(notes.map((n) => n.date));
  const d = new Date(`${today}T12:00:00`);
  if (!days.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(isoDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const noteKey = (n) => `n:${n.from}:${n.id}`;
const unreadNoteList = () => {
  const p = partner();
  if (!me() || !p) return [];
  const week = Date.now() - 7 * 86400000;
  return notesOf(p.id).map((n) => ({ ...n, from: p.id })).filter((n) => n.at > week && !seenItems.has(noteKey(n)));
};
function unreadNotes() { return unreadNoteList().length; }
export const unreadCount = () => unreadNotes() + unreadPlans();

// The tab has two pages: notes and "feeling like" plans.
let page = 'notes';

// Opening the tab: jump to whichever page has something new.
export function openUs() {
  if (unreadPlans() && !unreadNotes()) page = 'plans';
  else if (unreadNotes()) page = 'notes';
  renderNotes();
}

export function updateNotesBadge() {
  const b = $('#notesBadge');
  if (!b) return;
  const n = unreadCount();
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : String(n);
}

export function renderNotes() {
  const el = $('#notesBoard');
  if (!el || !me()) return;
  // Keep a half-written note when the board refreshes.
  const draft = $('#noteText')?.value || '';
  const focused = document.activeElement?.id === 'noteText';
  queueMicrotask(() => { const ta = $('#noteText'); if (ta && draft && !ta.value) { ta.value = draft; $('#noteCount').textContent = `${[...draft].length}/${MAX}`; if (focused) ta.focus(); } });
  const n = unreadNotes(), pl = unreadPlans();
  $('#usPages').innerHTML = [['notes', '💌 Notes', n], ['plans', '✨ Feeling like', pl], ['shows', '📺 Watching', 0]].map(([k, label, c]) =>
    `<button type="button" class="${k === page ? 'on' : ''}" data-page="${k}" aria-pressed="${k === page}">${label}${c && k !== page ? ` <b class="dot">${c}</b>` : ''}</button>`).join('');
  if (page === 'plans') { renderPlans(el); updateNotesBadge(); return; }
  if (page === 'shows') { el.innerHTML = syncLine() + '<div id="showsBoard"></div>'; renderShows($('#showsBoard')); updateNotesBadge(); return; }
  const start = boardStart();
  const fresh = unreadNoteList();
  for (const x of fresh) if (x.at < start) carried.add(key(x));
  seenItems.add(fresh.map(noteKey));
  updateNotesBadge();
  const p = partner();
  const pName = nameOf(p.id);
  const mine = notesOf(me());
  const hearts = profileStore(me()).get('noteHearts', {});
  const theirHearts = profileStore(p.id).get('noteHearts', {});
  const today = isoDate();
  const streak = noteStreak(mine);
  const linked = global.get(`seen.${p.id}`, 0) > 0;
  const wroteToday = mine.some((n) => n.date === today);

  const recent = allNotes().filter((x) => x.at >= Date.now() - 60 * 86400000);
  const board = recent.filter((x) => x.at >= start || carried.has(key(x)));
  const earlier = recent.filter((x) => !board.includes(x));
  const byDay = {};
  for (const x of earlier) (byDay[x.date] ||= []).push(x);
  const dayLabel = (d) => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === isoDate(y)) return 'Yesterday';
    if (d === today) return 'Earlier today';
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  };

  el.innerHTML = `
    ${syncLine()}
    <div class="card note-compose">
      <div class="row between" style="margin-top:0">
        <h2 style="margin:0">${wroteToday ? `Another note for ${esc(pName)}` : `Today's note for ${esc(pName)}`}</h2>
        ${streak ? `<span class="pill">💌 ${streak} day${streak > 1 ? 's' : ''}</span>` : ''}
      </div>
      <form id="noteForm">
        ${replyTo ? `<div class="reply-to small">↩ Replying to ${esc(nameOf(replyTo.from))}: “${esc(replyTo.text.slice(0, 60))}${replyTo.text.length > 60 ? '…' : ''}” <button type="button" class="linkish" data-cancelreply>Cancel</button></div>` : ''}
        <textarea id="noteText" maxlength="${MAX}" rows="3" placeholder="Proud of you for hitting your protein today 💪" aria-label="Your note"></textarea>
        <div class="emoji-row" role="group" aria-label="Add an emoji">
          ${NOTE_EMOJI.map((e) => `<button type="button" class="emoji" data-emoji="${e}" aria-label="Add ${e}">${e}</button>`).join('')}
        </div>
        <div class="row between">
          <div class="note-colors" role="radiogroup" aria-label="Note color">
            ${Object.entries(NOTE_COLORS).map(([k, v]) => `<button type="button" class="swatch note-${k} ${k === color ? 'on' : ''}" data-color="${k}" role="radio" aria-checked="${k === color}" aria-label="${v}"></button>`).join('')}
          </div>
          <span class="small muted" id="noteCount">0/${MAX}</span>
          <button type="submit">Post it</button>
        </div>
      </form>
      ${linked ? '' : `<p class="small muted">${esc(pName)} sees your notes once your phones are linked (tap ${esc(pName)} at the top → Link).</p>`}
    </div>
    <h3 class="note-day">Today's board · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
    ${board.length ? `<div class="note-grid">${board.map((x) => postit(x, { pName, hearts, theirHearts })).join('')}</div>`
      : `<p class="muted small center">A fresh board for today. Leave the first note 💌</p>`}
    ${earlier.length ? `<details class="past-notes"><summary class="note-day">Earlier notes</summary>
      ${Object.entries(byDay).map(([d, notes]) => `<h4 class="note-day small">${dayLabel(d)}</h4>
        <div class="note-grid">${notes.map((x) => postit(x, { pName, hearts, theirHearts })).join('')}</div>`).join('')}
    </details>` : ''}`;
}

function postit(n, { pName, hearts, theirHearts }) {
  const own = n.from === me();
  const heart = own ? theirHearts[n.id] : hearts[n.id];
  const re = n.replyTo && allNotes().find((x) => x.id === n.replyTo.id && x.from === n.replyTo.from);
  return `<figure class="postit note-${NOTE_COLORS[n.color] ? n.color : 'yellow'}" style="--tilt:${((n.at % 7) - 3) * 0.6}deg">
    ${re ? `<div class="postit-quote">↩ “${esc(re.text.slice(0, 50))}${re.text.length > 50 ? '…' : ''}”</div>` : ''}
    <blockquote>${esc(n.text)}</blockquote>
    <figcaption>
      <span>${own ? 'You' : esc(nameOf(n.from))} · ${new Date(n.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
      ${own
        ? `${heart ? `<span class="heart-got" title="${esc(pName)} loved this">${heart}</span>` : ''}<button type="button" class="x" data-delnote="${esc(n.id)}" aria-label="Delete note">✕</button>`
        : `<button type="button" class="reply" data-reply-note="${esc(n.id)}" aria-label="Reply">↩</button><button type="button" class="heart ${heart ? 'on' : ''}" data-heart="${esc(n.id)}" aria-label="${heart ? 'Remove heart' : 'Heart this note'}">${heart || '🤍'}</button>`}
    </figcaption>
  </figure>`;
}

export function initNotes() {
  const root = $('#tab-notes');
  initPlans(root, () => renderNotes());
  initShows(root, () => renderNotes());
  $('#usPages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (b) { page = b.dataset.page; renderNotes(); }
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.syncnow != null) {
      t.textContent = 'Checking…';
      pushNow().then(() => sync.pull()).catch((err) => global.set('pushError', err.message)).finally(() => { renderNotes(); });
      return;
    }
    if (t.dataset.emoji) {
      const ta = $('#noteText');
      const at = ta.selectionStart ?? ta.value.length;
      ta.value = (ta.value.slice(0, at) + t.dataset.emoji + ta.value.slice(ta.selectionEnd ?? at)).slice(0, MAX);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = at + t.dataset.emoji.length;
      $('#noteCount').textContent = `${[...ta.value].length}/${MAX}`;
    } else if (t.dataset.color) {
      color = t.dataset.color;
      root.querySelectorAll('[data-color]').forEach((b) => { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', b === t); });
    } else if (t.dataset.replyNote) {
      const n = allNotes().find((x) => x.id === t.dataset.replyNote && x.from !== me());
      replyTo = n ? { id: n.id, from: n.from, text: n.text } : null;
      renderNotes();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('#noteText')?.focus();
    } else if (t.dataset.cancelreply != null) {
      replyTo = null;
      renderNotes();
    } else if (t.dataset.delnote) {
      const s = profileStore(me());
      s.set('notes', s.get('notes', []).filter((n) => n.id !== t.dataset.delnote));
      renderNotes();
      pushNow().then(renderNotes);
    } else if (t.dataset.heart) {
      const s = profileStore(me());
      const h = s.get('noteHearts', {});
      if (h[t.dataset.heart]) delete h[t.dataset.heart]; else h[t.dataset.heart] = '❤️';
      s.set('noteHearts', h);
      renderNotes();
      pushNow().then(renderNotes);
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'noteText') $('#noteCount').textContent = `${[...e.target.value].length}/${MAX}`;
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'noteForm') return;
    e.preventDefault();
    const text = $('#noteText').value.trim().slice(0, MAX);
    if (!text) { $('#noteText').focus(); return; }
    const s = profileStore(me());
    const now = Date.now();
    // Keep the last ~200 notes so synced data stays small.
    s.set('notes', [...s.get('notes', []), { id: now.toString(36), text, color, at: now, date: isoDate(), ...(replyTo ? { replyTo: { id: replyTo.id, from: replyTo.from } } : {}) }].slice(-200));
    replyTo = null;
    $('#noteText').value = '';
    renderNotes();
    pushNow().then(renderNotes);
  });
}
