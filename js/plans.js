// "Feeling like…": suggest a plan to each other (movie, brunch, dinner somewhere, a show
// tonight…) and answer with I'm in / Maybe / Another time. Each person's suggestions and
// replies live in their own profile, so household sync carries them both ways.
import { PROFILES, ownerId, profileStore, global, seenItems } from './storage.js';
import { sync, pushNow } from './sync.js';

export const PLAN_KINDS = {
  movie:   { icon: '🍿', label: 'Movie', what: 'Which movie?', where: 'Theater (optional)' },
  show:    { icon: '📺', label: 'Watch a show', what: 'Which show? e.g. The Bear on Hulu', where: '' },
  brunch:  { icon: '🥞', label: 'Brunch', what: 'Anything special? (optional)', where: 'Where?' },
  lunch:   { icon: '🥗', label: 'Lunch', what: 'Anything special? (optional)', where: 'Where?' },
  dinner:  { icon: '🍽️', label: 'Dinner', what: 'Anything special? (optional)', where: 'Where?' },
  coffee:  { icon: '☕', label: 'Coffee', what: '', where: 'Where?' },
  walk:    { icon: '🚶', label: 'Walk / hike', what: '', where: 'Where?' },
  workout: { icon: '🏋️', label: 'Work out together', what: 'What? e.g. Day B, a run', where: 'Where? (optional)' },
  other:   { icon: '✨', label: 'Something else', what: 'What are you feeling like?', where: 'Where? (optional)' },
};
export const WHEN = { tonight: 'Tonight', today: 'Today', tomorrow: 'Tomorrow', weekend: 'This weekend', date: 'Pick a day' };
export const REPLIES = { in: "🙌 I'm in", maybe: '🤔 Maybe', later: '⏰ Another time' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const me = () => ownerId();
const partner = () => PROFILES.find((p) => p.id !== me());
const nameOf = (id) => profileStore(id).get('profile', null)?.name || PROFILES.find((p) => p.id === id)?.name || id;
const plansOf = (id) => profileStore(id).get('plans', []);

// The day a plan is for: tonight/today = the day it was made; weekend = that Saturday.
export function planDay(p) {
  const d = new Date(`${p.date}T12:00:00`);
  if (p.when === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (p.when === 'weekend') d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  else if (p.when === 'date' && p.day) return p.day;
  return isoDate(d);
}

// A plan stays "upcoming" through its day (weekend plans through Sunday).
export function isUpcoming(p, today = isoDate()) {
  if (p.done) return false;
  const day = planDay(p);
  if (p.when === 'weekend') { const sun = new Date(`${day}T12:00:00`); sun.setDate(sun.getDate() + 1); return isoDate(sun) >= today; }
  return day >= today;
}

export function whenText(p, today = isoDate()) {
  const day = planDay(p);
  const time = p.time ? ` at ${new Date(`2000-01-01T${p.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  if (p.when === 'tonight' && day === today) return `Tonight${time}`;
  if (p.when === 'weekend') return `This weekend${time}`;
  const t = new Date(`${today}T12:00:00`); t.setDate(t.getDate() + 1);
  if (day === today) return `Today${time}`;
  if (day === isoDate(t)) return `Tomorrow${time}`;
  return `${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${time}`;
}

// New from the other person: their upcoming plans and their answers to yours.
function unreadPlanKeys() {
  const p = partner();
  if (!me() || !p) return [];
  const mine = new Set(plansOf(me()).map((x) => x.id));
  const replies = profileStore(p.id).get('planReplies', {});
  return [
    ...plansOf(p.id).filter((x) => isUpcoming(x)).map((x) => `p:${p.id}:${x.id}`),
    ...Object.entries(replies).filter(([id]) => mine.has(id)).map(([id, r]) => `r:${id}:${r.r}:${r.at}`),
  ].filter((k) => !seenItems.has(k));
}
export function unreadPlans() { return unreadPlanKeys().length; }

// Shows whether your last change reached the connector and when this phone last checked.
export function syncLine() {
  if (!sync.enabled()) return '<p class="small muted sync-line">Sharing is off on this phone.</p>';
  const ago = (t) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  const err = global.get('pushError', null);
  return `<p class="small sync-line ${err ? 'tone-warn' : 'muted'}">${err ? `Not sent: ${esc(err)}` : `Sent ${ago(global.get('pushedAt', 0))}`} · checked ${ago(global.get('pulledAt', 0))} · <button type="button" class="linkish" data-syncnow>Refresh</button></p>`;
}

let kind = 'dinner';
let composeOpen = false; // the "I'm feeling like…" form stays open while you fill it in
let when = 'tonight';

export function renderPlans(el) {
  seenItems.add(unreadPlanKeys());
  const p = partner();
  const pName = nameOf(p.id);
  const k = PLAN_KINDS[kind];
  const myReplies = profileStore(me()).get('planReplies', {});
  const theirReplies = profileStore(p.id).get('planReplies', {});
  const all = PROFILES.flatMap((x) => plansOf(x.id).map((pl) => ({ ...pl, from: x.id }))).sort((a, b) => b.at - a.at);
  const upcoming = all.filter((x) => isUpcoming(x)).sort((a, b) => planDay(a).localeCompare(planDay(b)) || (a.time || '').localeCompare(b.time || ''));
  const past = all.filter((x) => !isUpcoming(x)).slice(0, 12);
  const linked = global.get(`seen.${p.id}`, 0) > 0;

  const card = (pl) => {
    const kd = PLAN_KINDS[pl.kind] || PLAN_KINDS.other;
    const own = pl.from === me();
    const reply = own ? theirReplies[pl.id] : myReplies[pl.id];
    const map = pl.where ? ` · <a href="https://maps.apple.com/?q=${encodeURIComponent(pl.where)}" target="_blank" rel="noopener">map</a>` : '';
    return `<div class="plan ${pl.done ? 'done' : ''} ${reply?.r === 'in' ? 'agreed' : ''}">
      <div class="plan-icon" aria-hidden="true">${kd.icon}</div>
      <div class="plan-body">
        <div class="small muted">${own ? 'You are' : `${esc(nameOf(pl.from))} is`} feeling like</div>
        <div class="plan-title">${esc(kd.label)}${pl.what ? `: ${esc(pl.what)}` : ''}</div>
        <div class="small">${esc(whenText(pl))}${pl.where ? ` · 📍 ${esc(pl.where)}` : ''}${map}</div>
        ${pl.note ? `<div class="small plan-note">“${esc(pl.note)}”</div>` : ''}
        ${own
          ? `<div class="small plan-reply">${reply ? `${esc(pName)}: <b>${REPLIES[reply.r]}</b>` : `<span class="muted">Waiting for ${esc(pName)}…</span>`}</div>
             ${isUpcoming(pl) ? `<div class="row" style="margin-top:6px"><button type="button" class="ghost small" data-plandone="${esc(pl.id)}">✓ We did it</button><button type="button" class="ghost small" data-plandel="${esc(pl.id)}">Cancel</button></div>` : ''}`
          : isUpcoming(pl)
            ? `<div class="reply-row" role="group" aria-label="Your answer">${Object.entries(REPLIES).map(([r, t]) => `<button type="button" class="small ${reply?.r === r ? '' : 'ghost'}" data-reply="${esc(pl.id)}:${r}" aria-pressed="${reply?.r === r}">${t}</button>`).join('')}</div>`
            : reply ? `<div class="small plan-reply">You: <b>${REPLIES[reply.r]}</b></div>` : ''}
      </div>
    </div>`;
  };

  el.innerHTML = `
    <div class="row between" style="margin-top:0"><h2 class="us-h">✨ Feeling like</h2></div>
    ${upcoming.length ? upcoming.map(card).join('') : '<p class="muted small">Nothing planned yet.</p>'}
    <details class="plan-compose us-more" ${composeOpen ? 'open' : ''} data-plancompose><summary>＋ I'm feeling like…</summary>
      <div class="kind-row" role="radiogroup" aria-label="What kind of plan">
        ${Object.entries(PLAN_KINDS).map(([key, v]) => `<button type="button" class="kind ${key === kind ? 'on' : ''}" data-kind="${key}" role="radio" aria-checked="${key === kind}"><span>${v.icon}</span>${v.label}</button>`).join('')}
      </div>
      <form id="feelForm">
        ${k.what ? `<input id="feelWhat" maxlength="80" placeholder="${esc(k.what)}" aria-label="What">` : ''}
        ${k.where ? `<input id="feelWhere" maxlength="80" placeholder="${esc(k.where)}" aria-label="Where">` : ''}
        <div class="when-row" role="radiogroup" aria-label="When">
          ${Object.entries(WHEN).map(([key, v]) => `<button type="button" class="small ${key === when ? '' : 'ghost'}" data-when="${key}" role="radio" aria-checked="${key === when}">${v}</button>`).join('')}
        </div>
        <div class="row" style="margin-top:6px">
          ${when === 'date' ? `<input id="feelDay" type="date" min="${isoDate()}" value="${isoDate()}" aria-label="Day">` : ''}
          <label class="small muted" for="feelTime" style="flex:0 0 auto">Time (optional)</label>
          <input id="feelTime" type="time">
        </div>
        <input id="feelNote" maxlength="140" placeholder="Add a note (optional) 😊" aria-label="Note">
        <div class="row end"><button type="submit">Send to ${esc(pName)}</button></div>
      </form>
      ${linked ? '' : `<p class="small muted">${esc(pName)} sees this once your phones are linked (tap ${esc(pName)} at the top → Link).</p>`}
    </details>
    ${past.length ? `<details class="past-plans us-more"><summary>Past plans</summary>${past.map(card).join('')}</details>` : ''}`;
}

export function initPlans(root, rerender) {
  root.addEventListener('toggle', (e) => { if (e.target.dataset?.plancompose != null) composeOpen = e.target.open; }, true);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const s = profileStore(me());
    if (t.dataset.kind) { kind = t.dataset.kind; rerender(); }
    else if (t.dataset.when) {
      when = t.dataset.when;
      // Keep what's typed while switching.
      const keep = ['feelWhat', 'feelWhere', 'feelNote', 'feelTime'].map((id) => [id, $(`#${id}`)?.value]);
      rerender();
      keep.forEach(([id, v]) => { if (v && $(`#${id}`)) $(`#${id}`).value = v; });
    } else if (t.dataset.reply) {
      const [id, r] = t.dataset.reply.split(':');
      const replies = s.get('planReplies', {});
      if (replies[id]?.r === r) delete replies[id]; else replies[id] = { r, at: Date.now() };
      s.set('planReplies', replies);
      rerender();
      pushNow().then(rerender);
    } else if (t.dataset.plandone || t.dataset.plandel) {
      const id = t.dataset.plandone || t.dataset.plandel;
      s.set('plans', s.get('plans', []).flatMap((pl) => (pl.id !== id ? [pl] : t.dataset.plandone ? [{ ...pl, done: true }] : [])));
      rerender();
      pushNow().then(rerender);
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'feelForm') return;
    e.preventDefault();
    const val = (id) => ($(`#${id}`)?.value || '').trim();
    const what = val('feelWhat');
    const where = val('feelWhere');
    if ((kind === 'movie' || kind === 'show' || kind === 'other') && !what) { $('#feelWhat').focus(); return; }
    if (['brunch', 'lunch', 'dinner', 'coffee'].includes(kind) && !where) { $('#feelWhere').focus(); return; }
    const now = Date.now();
    const plan = { id: now.toString(36), kind, what, where, when, time: val('feelTime'), note: val('feelNote'), at: now, date: isoDate() };
    if (when === 'date') plan.day = val('feelDay') || isoDate();
    const s = profileStore(me());
    s.set('plans', [...s.get('plans', []), plan].slice(-100));
    composeOpen = false;
    rerender();
    pushNow().then(rerender);
  });
}
