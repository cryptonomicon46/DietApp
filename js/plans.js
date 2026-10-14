// "Feeling like…": suggest a plan to each other (movie, brunch, dinner somewhere, a show
// tonight…) and answer with I'm in / Maybe / Another time. Each person's suggestions and
// replies live in their own profile, so household sync carries them both ways.
import { PROFILES, ownerId, profileStore, global } from './storage.js';

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

export function unreadPlans() {
  const p = partner();
  if (!me() || !p) return 0;
  const seen = global.get('plansSeenAt', 0);
  const replies = profileStore(p.id).get('planReplies', {});
  const newPlans = plansOf(p.id).filter((x) => x.at > seen && isUpcoming(x)).length;
  const newReplies = Object.values(replies).filter((r) => r.at > seen).length;
  return newPlans + newReplies;
}

let kind = 'dinner';
let when = 'tonight';

export function renderPlans(el) {
  global.set('plansSeenAt', Date.now());
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
    <div class="card plan-compose">
      <h2 style="margin-top:0">I'm feeling like…</h2>
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
    </div>
    <h3 class="note-day">Coming up</h3>
    ${upcoming.length ? upcoming.map(card).join('') : '<p class="muted small center">Nothing planned yet. Suggest something ✨</p>'}
    ${past.length ? `<details class="past-plans"><summary class="note-day">Past plans</summary>${past.map(card).join('')}</details>` : ''}`;
}

export function initPlans(root, rerender) {
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
    } else if (t.dataset.plandone || t.dataset.plandel) {
      const id = t.dataset.plandone || t.dataset.plandel;
      s.set('plans', s.get('plans', []).flatMap((pl) => (pl.id !== id ? [pl] : t.dataset.plandone ? [{ ...pl, done: true }] : [])));
      rerender();
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
    rerender();
  });
}
