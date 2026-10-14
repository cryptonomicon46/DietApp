// Notes tab: a shared post-it board for little daily notes to each other.
// Each person's notes live in their own profile (so household sync carries them);
// hearts you give the other person's notes live in yours.
import { PROFILES, ownerId, profileStore, global } from './storage.js';

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

export function unreadCount() {
  const p = partner();
  if (!me() || !p) return 0;
  const seen = global.get('notesSeenAt', 0);
  return notesOf(p.id).filter((n) => n.at > seen).length;
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
  global.set('notesSeenAt', Date.now());
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

  const byDay = {};
  for (const n of allNotes().filter((x) => x.date >= isoDate(new Date(Date.now() - 60 * 86400000)))) (byDay[n.date] ||= []).push(n);
  const dayLabel = (d) => {
    if (d === today) return 'Today';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === isoDate(y)) return 'Yesterday';
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  };

  el.innerHTML = `
    <div class="card note-compose">
      <div class="row between" style="margin-top:0">
        <h2 style="margin:0">${wroteToday ? `Another note for ${esc(pName)}` : `Today's note for ${esc(pName)}`}</h2>
        ${streak ? `<span class="pill">💌 ${streak} day${streak > 1 ? 's' : ''}</span>` : ''}
      </div>
      <form id="noteForm">
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
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, notes]) => `
      <h3 class="note-day">${dayLabel(d)}</h3>
      <div class="note-grid">
        ${notes.map((n, i) => {
          const own = n.from === me();
          const heart = own ? theirHearts[n.id] : hearts[n.id];
          return `<figure class="postit note-${NOTE_COLORS[n.color] ? n.color : 'yellow'}" style="--tilt:${((n.at % 7) - 3) * 0.6}deg">
            <blockquote>${esc(n.text)}</blockquote>
            <figcaption>
              <span>${own ? 'You' : esc(nameOf(n.from))} · ${new Date(n.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
              ${own
                ? `${heart ? `<span class="heart-got" title="${esc(pName)} loved this">${heart}</span>` : ''}<button type="button" class="x" data-delnote="${esc(n.id)}" aria-label="Delete note">✕</button>`
                : `<button type="button" class="heart ${heart ? 'on' : ''}" data-heart="${esc(n.id)}" aria-label="${heart ? 'Remove heart' : 'Heart this note'}">${heart || '🤍'}</button>`}
            </figcaption>
          </figure>`;
        }).join('')}
      </div>`).join('') : `<p class="muted small center">No notes yet. Leave the first one 💌</p>`}`;
}

export function initNotes() {
  const root = $('#tab-notes');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
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
    } else if (t.dataset.delnote) {
      const s = profileStore(me());
      s.set('notes', s.get('notes', []).filter((n) => n.id !== t.dataset.delnote));
      renderNotes();
    } else if (t.dataset.heart) {
      const s = profileStore(me());
      const h = s.get('noteHearts', {});
      if (h[t.dataset.heart]) delete h[t.dataset.heart]; else h[t.dataset.heart] = '❤️';
      s.set('noteHearts', h);
      renderNotes();
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
    s.set('notes', [...s.get('notes', []), { id: now.toString(36), text, color, at: now, date: isoDate() }].slice(-200));
    renderNotes();
  });
}
