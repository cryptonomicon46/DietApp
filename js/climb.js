// 🧗 Climbing sessions (bouldering, top rope, lead: attempts and sends per grade) and the
// 📈 Progress view for lifting, cardio and climbing, both on the Train tab.
import { profileStore, activeProfile } from './storage.js';
import { sportOf } from './activity.js';
import {
  DISCIPLINES, DEFAULT_GRADES, gradeRank, periodOf, liftStats, bestBefore, prCount, KEY_LIFTS,
  cardioStats, paceText, climbStats, climbHighlights,
} from './progress.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const store = () => profileStore(activeProfile().id);
const GYMS = ['Movement Santa Clara', 'Movement Sunnyvale'];

// ---------- climbing ----------
let climbOpen = false;
let disc = 'boulder';
let moreGrades = false;
let onSaved = () => {};

const climbs = () => store().get('climbs', []);
const todays = () => climbs().find((c) => c.date === isoDate());
function saveToday(fn) {
  const today = isoDate();
  const list = climbs();
  const cur = list.find((c) => c.date === today) || { id: `c${Date.now()}`, date: today, gym: GYMS[0], minutes: 90, grades: {} };
  fn(cur);
  store().set('climbs', [...list.filter((c) => c.date !== today), cur].sort((a, b) => a.date.localeCompare(b.date)).slice(-500));
  return cur;
}
const totals = (c) => {
  let a = 0, s = 0;
  for (const gs of Object.values(c?.grades || {})) for (const v of Object.values(gs)) { s += +v.s || 0; a += Math.max(+v.a || 0, +v.s || 0); }
  return { a, s };
};
export const climbSummary = (c) => {
  const t = totals(c);
  const tops = Object.entries(c?.grades || {}).map(([d, gs]) => Object.entries(gs).filter(([, v]) => v.s > 0).map(([g]) => g).sort((x, y) => gradeRank(d, y) - gradeRank(d, x))[0]).filter(Boolean);
  return `${t.a} attempt${t.a === 1 ? '' : 's'} · ${t.s} send${t.s === 1 ? '' : 's'}${tops.length ? ` · top ${tops.join(', ')}` : ''}`;
};

export function renderClimb() {
  const el = $('#climbCard');
  if (!el) return;
  const c = todays();
  if (!climbOpen) {
    el.innerHTML = c ? `<div class="card climb-card"><div class="row between" style="margin-top:0"><div><div class="eyebrow">🧗 Climbing today</div><b>${esc(climbSummary(c))}</b></div><button type="button" class="ghost small" data-climbopen>Edit</button></div></div>` : '';
    return;
  }
  const cur = c || { gym: GYMS[0], minutes: 90, grades: {} };
  const D = DISCIPLINES[disc];
  const counts = cur.grades[disc] || {};
  const shown = D.grades.filter((g) => moreGrades || DEFAULT_GRADES[disc].includes(g) || counts[g]?.a || counts[g]?.s);
  const t = totals(cur);
  el.innerHTML = `<div class="card climb-card">
    <div class="row between" style="margin-top:0"><div class="eyebrow">🧗 Climbing session · today</div><button type="button" class="linkish small" data-climbclose>Close</button></div>
    <div class="climb-meta">
      <select data-climbgym aria-label="Gym">${[...GYMS, 'Other gym', 'Outdoors'].map((g) => `<option ${g === cur.gym ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <label class="small muted">⏱ <input type="number" min="0" max="600" step="5" inputmode="numeric" data-climbmin value="${cur.minutes ?? 90}" aria-label="Minutes"> min</label>
    </div>
    <div class="seg full climb-seg">${Object.entries(DISCIPLINES).map(([k, v]) => `<button type="button" class="${k === disc ? 'on' : ''}" data-climbdisc="${k}">${v.icon} ${v.label}${totals({ grades: { x: cur.grades[k] || {} } }).a ? '<i class="dot-on"></i>' : ''}</button>`).join('')}</div>
    <ul class="grade-rows">
      <li class="hdr"><span>Grade</span><span>Attempts</span><span>Sends ✓</span></li>
      ${shown.map((g) => { const v = counts[g] || {}; return `<li><span class="g">${g}</span>
        <span class="cnt"><button type="button" data-climb="${g}:a:-1" aria-label="One less ${g} attempt">−</button><b>${v.a || 0}</b><button type="button" data-climb="${g}:a:1" aria-label="One more ${g} attempt">+</button></span>
        <span class="cnt send"><button type="button" data-climb="${g}:s:-1" aria-label="One less ${g} send">−</button><b>${v.s || 0}</b><button type="button" data-climb="${g}:s:1" aria-label="One more ${g} send">+</button></span></li>`; }).join('')}
    </ul>
    <button type="button" class="linkish small" data-climbmore>${moreGrades ? 'Fewer grades' : `＋ Other grades (${disc === 'boulder' ? 'V0–V3, V7+' : '5.8–5.9, 5.11b+'})`}</button>
    <div class="row between"><span class="small muted">${t.a ? `Today: ${esc(climbSummary(cur))}` : 'Count every attempt; a send counts as an attempt too.'}</span><button type="button" class="small" data-climbsave>Done</button></div>
  </div>`;
}

export function openClimb() { climbOpen = true; renderClimb(); $('#climbCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// saved(session): the app adds / updates the day's climbing activity for calories.
export function initClimb(saved) {
  onSaved = saved;
  const root = $('#tab-lift');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('.climb-card')) return;
    const d = t.dataset;
    if (d.climbopen != null) climbOpen = true;
    else if (d.climbclose != null) climbOpen = false;
    else if (d.climbdisc) { disc = d.climbdisc; moreGrades = false; }
    else if (d.climbmore != null) moreGrades = !moreGrades;
    else if (d.climb) {
      const [g, k, step] = d.climb.split(':');
      saveToday((c) => {
        const row = ((c.grades[disc] ||= {})[g] ||= { a: 0, s: 0 });
        row[k] = Math.max(0, (row[k] || 0) + +step);
        // A send is an attempt too, so attempts never drop below sends.
        if (k === 's' && step > 0 && row.a < row.s) row.a = row.s;
        if (k === 'a' && row.a < row.s) row.s = row.a;
      });
    } else if (d.climbsave != null) {
      const c = todays();
      climbOpen = false;
      if (c && totals(c).a) onSaved(c);
    } else return;
    renderClimb();
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.climbgym != null) saveToday((c) => { c.gym = e.target.value; });
    else if (e.target.dataset.climbmin != null) saveToday((c) => { c.minutes = Math.max(0, +e.target.value || 0); });
  });
}

// ---------- 📈 progress ----------
let progressOpen = false;
let period = 'week';
const fmtK = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());
const delta = (a, b, unit = '') => { const d = Math.round((a - b) * 10) / 10; return d > 0 ? `<small class="up">+${d}${unit}</small>` : d < 0 ? `<small class="down">${d}${unit}</small>` : '<small class="muted">±0</small>'; };
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '');

export function renderProgress() {
  const el = $('#progressCard');
  if (!el) return;
  if (!progressOpen) { el.innerHTML = ''; return; }
  const s = store();
  const today = isoDate();
  const P = periodOf(period, today);
  const sessions = s.get('lift', {}).sessions || [];
  const L = liftStats(sessions, P.from, P.to), Lp = liftStats(sessions, P.prevFrom, P.prevTo);
  const prs = prCount(L, bestBefore(sessions, P.from));
  const acts = s.get('activities', []), hist = s.get('workoutHistory', []);
  const C = cardioStats(acts, hist, sportOf, P.from, P.to), Cp = cardioStats(acts, hist, sportOf, P.prevFrom, P.prevTo);
  const cl = climbs();
  const K = climbStats(cl, P.from, P.to), Kp = climbStats(cl, P.prevFrom, P.prevTo);
  const highs = climbHighlights(K, Kp);
  const tile = (label, big, sub) => `<div class="tile"><small>${label}</small><b>${big}</b>${sub || ''}</div>`;
  const grades = (d) => {
    const rows = Object.entries(K.by[d].grades).sort((a, b) => gradeRank(d, a[0]) - gradeRank(d, b[0]));
    if (!rows.length) return '';
    return `<div class="small muted gb-h">${DISCIPLINES[d].icon} ${DISCIPLINES[d].label}${K.by[d].top ? ` · top send <b>${K.by[d].top}</b>` : ''}</div>
      <ul class="gbars">${rows.map(([g, r]) => `<li><b>${g}</b><span class="gbar" role="img" aria-label="${g}: ${r.s} sends of ${r.a} attempts"><i style="width:${r.a ? Math.round((r.s / r.a) * 100) : 0}%"></i></span><span class="n">${r.s} / ${r.a}</span></li>`).join('')}</ul>`;
  };
  const anyClimb = K.sessions || Kp.sessions;
  el.innerHTML = `<div class="card progress-card">
    <div class="row between" style="margin-top:0"><h2 class="us-h">📈 Progress</h2><button type="button" class="linkish small" data-progclose>Close</button></div>
    <div class="row between" style="margin-top:0"><div class="seg"><button type="button" class="${period === 'week' ? 'on' : ''}" data-period="week">This week</button><button type="button" class="${period === 'month' ? 'on' : ''}" data-period="month">${esc(periodOf('month', today).label)}</button></div><span class="small muted">vs ${esc(P.prevLabel)}</span></div>

    <div class="sec-h"><b>🏋️ Lifting</b><span class="small muted">${L.sessions} session${L.sessions === 1 ? '' : 's'}</span></div>
    <div class="tiles">
      ${tile('Sets', L.sets, delta(L.sets, Lp.sets))}
      ${tile('Volume', `${fmtK(L.volume)} lb`, Lp.volume ? `<small class="${L.volume >= Lp.volume ? 'up' : 'down'}">${pct(L.volume, Lp.volume)}</small>` : '')}
      ${tile('PRs', prs, '<small>est. 1RM</small>')}
    </div>
    <ul class="lifts">${Object.entries(KEY_LIFTS).filter(([ex]) => L.best[ex] || Lp.best[ex]).map(([ex, name]) => `<li><span>${name} · est. 1RM</span><span>${L.best[ex] ? `<b>${Math.round(L.best[ex])}</b> ${Lp.best[ex] ? delta(Math.round(L.best[ex]), Math.round(Lp.best[ex])) : ''}` : '<span class="muted">—</span>'}</span></li>`).join('')}</ul>

    <div class="sec-h"><b>🏃 Cardio</b><span class="small muted">${C.sessions} session${C.sessions === 1 ? '' : 's'}</span></div>
    <div class="tiles">
      ${tile('Run', C.running.miles ? `${C.running.miles} mi` : C.running.n ? `${C.running.n}×` : '—', C.running.pace ? `<small>${paceText(C.running.pace)} avg</small>` : `<small>${C.running.minutes} min</small>`)}
      ${tile('Bike', C.cycling.miles ? `${C.cycling.miles} mi` : C.cycling.n ? `${C.cycling.n}×` : '—', `<small>${C.cycling.n} ride${C.cycling.n === 1 ? '' : 's'}</small>`)}
      ${tile('Hot yoga', C.hotYoga.n, `<small>class${C.hotYoga.n === 1 ? '' : 'es'} · ${Math.round(C.hotYoga.minutes / 6) / 10} h</small>`)}
    </div>
    ${Cp.sessions ? `<p class="small muted" style="margin:6px 0 0">${esc(P.prevLabel[0].toUpperCase() + P.prevLabel.slice(1))}: ${Cp.running.miles} mi run · ${Cp.cycling.miles} mi ride · ${Cp.hotYoga.n} hot yoga</p>` : ''}

    ${anyClimb ? `<div class="sec-h"><b>🧗 Climbing</b><span class="small muted">${K.sessions} session${K.sessions === 1 ? '' : 's'}${Kp.sessions ? ` · ${Kp.sessions} ${esc(P.prevLabel)}` : ''}</span></div>
      ${K.sessions ? `${['boulder', 'lead', 'toprope'].map(grades).join('')}
        <div class="gkey"><span><i class="k-sent"></i>Sent</span><span><i class="k-att"></i>Attempted</span></div>` : '<p class="small muted">No climbing yet this period.</p>'}
      ${highs.length ? highs.map((h) => `<p class="small" style="margin:8px 0 0">💪 ${esc(h)}</p>`).join('') : ''}` : ''}
  </div>`;
}
export function openProgress() { progressOpen = !progressOpen; renderProgress(); if (progressOpen) $('#progressCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
export function initProgress() {
  $('#tab-lift').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !t.closest('.progress-card')) return;
    if (t.dataset.period) { period = t.dataset.period; renderProgress(); }
    else if (t.dataset.progclose != null) { progressOpen = false; renderProgress(); }
  });
}
