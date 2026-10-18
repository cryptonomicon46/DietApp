// 🩻 DEXA scans: body fat %, fat mass and lean mass from each (quarterly) scan, shown with
// your weight so the journey is more than the scale. Kept in the profile as `dexa`, so it
// syncs, backs up and exports like the rest of your data.
import { profileStore, activeProfile } from './storage.js';
import { sync } from './sync.js';
import { normalizeScan, sortScans, scanChange, num } from './bodycomp.js';

// ---------- UI ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtDate = (d, year = true) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const store = () => profileStore(activeProfile().id);
export const allScans = () => sortScans(store().get('dexa', []));
const signed = (v, unit = '') => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}${unit}`);

let form = null;   // scan being added / edited
let msg = '';

const monthYr = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
// One small chart per measure (never two scales on one chart). Single series: the title names it.
function mini({ title, unit, pts, line = null, color, t0, t1, fmt = (v) => v }) {
  const W = 160, H = 96, pad = { l: 30, r: 34, t: 8, b: 16 };
  const vals = [...pts.map((p) => p.v), ...(line || []).map((p) => p.v)];
  if (!vals.length) return '';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, unit === '%' ? 2 : 4);
  lo = Math.floor(lo - span * 0.15); hi = Math.ceil(hi + span * 0.15);
  const day = (d) => Date.parse(`${d}T12:00`);
  const x = (d) => pad.l + (t1 > t0 ? (day(d) - t0) / (t1 - t0) : 0.5) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = (ps) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<figure class="dx-mini" style="--c:${color}">
    <figcaption><b>${title}</b>${last ? ` <span class="muted">${fmt(last.v)}${unit === '%' ? '%' : ' lb'}</span>` : ''}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} by scan">
      ${[lo, hi].map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
      ${line && line.length > 1 ? `<path class="dx-weight" d="${path(line)}"/>` : ''}
      ${pts.length > 1 ? `<path class="dx-line" d="${path(pts)}"/>` : ''}
      ${pts.map((p) => `<circle class="dx-dot" r="4" cx="${x(p.date)}" cy="${y(p.v)}"/><circle class="dx-hit" r="11" cx="${x(p.date)}" cy="${y(p.v)}" data-tip="${esc(`${fmtDate(p.date)} · ${fmt(p.v)}${unit === '%' ? '%' : ' lb'}`)}"/>`).join('')}
      ${last ? `<text class="dx-end" x="${x(last.date) + 6}" y="${y(last.v) + 3}">${fmt(last.v)}</text>` : ''}
      <text class="tick" x="${pad.l}" y="${H - 3}">${monthYr(t0)}</text><text class="tick" x="${W - pad.r}" y="${H - 3}" text-anchor="end">${monthYr(t1)}</text>
    </svg>
  </figure>`;
}

function chartsHtml(scans, weights) {
  const t0 = Date.parse(`${scans[0].date}T12:00`);
  const end = [scans[scans.length - 1].date, weights.length ? weights[weights.length - 1].date : ''].sort().pop();
  const t1 = Math.max(Date.parse(`${end}T12:00`), t0 + 864e5);
  const pick = (k) => scans.filter((s) => s[k] != null).map((s) => ({ date: s.date, v: s[k] }));
  // Your 7-day average weight across the same months, behind the scan weights.
  const inRange = weights.filter((w) => w.date >= scans[0].date);
  const avg = inRange.map((w, i) => {
    const t = Date.parse(`${w.date}T12:00`);
    const win = weights.filter((o) => { const u = Date.parse(`${o.date}T12:00`); return u <= t && u > t - 7 * 864e5; });
    return { date: w.date, v: win.reduce((a, o) => a + o.weight, 0) / win.length, i };
  }).filter((p, i, a) => i % Math.max(1, Math.floor(a.length / 60)) === 0 || i === a.length - 1);
  const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
  return `<div class="dx-grid">
    ${mini({ title: 'Weight', unit: 'lb', pts: pick('weight'), line: avg, color: 'var(--chart-avg)', t0, t1, fmt: one })}
    ${mini({ title: 'Body fat', unit: '%', pts: pick('bf'), color: 'var(--dx-fat)', t0, t1, fmt: one })}
    ${mini({ title: 'Fat mass', unit: 'lb', pts: pick('fat'), color: 'var(--dx-fat)', t0, t1, fmt: one })}
    ${mini({ title: 'Lean mass', unit: 'lb', pts: pick('lean'), color: 'var(--dx-lean)', t0, t1, fmt: one })}
  </div>
  <p class="small muted dx-key">Dots = scans${avg.length > 1 ? ' · thin line on Weight = your 7-day average weigh-ins' : ''}. Tap a dot for its value.</p>`;
}

// delta: the number (for good / not-so-good colour); text: how it reads.
function tile(label, value, delta, text, goodWhen) {
  const tone = delta == null || delta === 0 ? '' : (delta < 0) === (goodWhen === 'down') ? 'tone-good' : 'tone-warn';
  return `<div class="dx-tile"><small class="muted">${label}</small><b>${value}</b>${text ? `<small class="${tone}">${text}</small>` : ''}</div>`;
}

function formHtml() {
  const f = form;
  const field = (k, label, ph, step = '0.1') => `<label>${label}<input type="number" inputmode="decimal" step="${step}" data-dx="${k}" value="${esc(f[k] ?? '')}" placeholder="${ph}"></label>`;
  return `<form id="dexaForm" class="dx-form">
    <div class="eyebrow">${f.id ? 'Edit scan' : '＋ DEXA scan'}</div>
    <div class="dx-fields">
      <label>Scan date<input type="date" data-dx="date" value="${esc(f.date || isoDate())}" max="${isoDate()}" required></label>
      <label>Where (optional)<input data-dx="where" value="${esc(f.where || '')}" placeholder="e.g. BodySpec"></label>
      ${field('weight', 'Total weight (lb)', 'e.g. 182.4')}
      ${field('bf', 'Body fat %', 'e.g. 21.3')}
      ${field('fat', 'Fat mass (lb)', 'e.g. 38.9')}
      ${field('lean', 'Lean mass (lb)', 'e.g. 136.0')}
      ${field('bone', 'Bone mass, BMC (lb)', 'optional')}
      ${field('vat', 'Visceral fat, VAT (lb)', 'optional', '0.01')}
    </div>
    <label>Notes<input data-dx="notes" value="${esc(f.notes || '')}" placeholder="optional"></label>
    <p class="small muted">Enter what your report shows; with weight and body fat % the app works out fat and lean mass (lean = lean tissue, without bone).</p>
    <div class="row between">${f.id ? `<button type="button" class="ghost small danger" data-dxdel="${f.id}">Remove scan</button>` : '<span></span>'}
      <div class="row" style="margin-top:0"><button type="button" class="ghost" data-dxcancel>Cancel</button><button type="submit">Save</button></div></div>
  </form>`;
}

export function renderDexa(weights = []) {
  const el = $('#dexaCard');
  if (!el) return;
  if (form) { if (!el.querySelector('#dexaForm')) el.innerHTML = formHtml(); return; }
  const scans = allScans();
  const ro = sync.readOnly();
  const add = ro ? '' : '<button type="button" class="ghost small" data-dxadd>＋ Add a scan</button>';
  if (!scans.length) {
    el.innerHTML = `<div class="row between" style="margin-top:0"><h2 style="margin:0">🩻 Body composition</h2>${add}</div>
      <p class="small muted">Add your DEXA scans — past ones too — to see body fat, fat mass and lean mass alongside your weight. Scanning every 3 months shows whether the weight you lose is fat (the goal) while lean mass holds.</p>${msg ? `<p class="small">${esc(msg)}</p>` : ''}`;
    return;
  }
  const first = scans[0], last = scans[scans.length - 1], prev = scans[scans.length - 2];
  const all = scanChange(first, last), recent = scanChange(prev, last);
  const since = scans.length > 1 ? `since ${fmtDate(first.date, false)}` : '';
  const sum = scans.length > 1 && all.fat != null && all.lean != null
    ? `<p class="small dx-sum">Since your first scan (${fmtDate(first.date)}): <b>${signed(all.fat, ' lb')} fat</b>, <b>${signed(all.lean, ' lb')} lean</b>${all.bf != null ? `, body fat ${signed(all.bf, ' pts')}` : ''}.${all.fat < 0 && all.lean >= -1 ? ' Fat down with lean mass held — exactly what a good cut looks like. 💪' : ''}</p>` : '';
  el.innerHTML = `<div class="row between" style="margin-top:0"><h2 style="margin:0">🩻 Body composition</h2>${add}</div>
    <p class="small muted">${scans.length} DEXA scan${scans.length > 1 ? 's' : ''} · latest ${fmtDate(last.date)}${last.where ? ` · ${esc(last.where)}` : ''}</p>
    <div class="dx-tiles">
      ${tile('Body fat', last.bf != null ? `${last.bf}%` : '—', scans.length > 1 ? all.bf : null, scans.length > 1 && all.bf != null ? `${signed(all.bf, ' pts')} ${since}` : '', 'down')}
      ${tile('Fat mass', last.fat != null ? `${last.fat} lb` : '—', scans.length > 1 ? all.fat : null, scans.length > 1 && all.fat != null ? `${signed(all.fat, ' lb')} ${since}` : '', 'down')}
      ${tile('Lean mass', last.lean != null ? `${last.lean} lb` : '—', scans.length > 1 ? all.lean : null, scans.length > 1 && all.lean != null ? `${signed(all.lean, ' lb')} ${since}` : '', 'up')}
    </div>
    ${sum}
    ${scans.length > 1 ? chartsHtml(scans, weights) : '<p class="small muted">Add another scan (or an earlier one) to see the trend.</p>'}
    <div class="dx-tip" hidden></div>
    <details class="dx-table"><summary class="small">All scans${prev ? ` · last change ${signed(recent.fat, ' lb')} fat, ${signed(recent.lean, ' lb')} lean in ${Math.round(recent.days / 7)} weeks` : ''}</summary>
      <div class="table-scroll"><table>
        <thead><tr><th>Date</th><th>Weight</th><th>BF %</th><th>Fat</th><th>Lean</th><th>Δ fat</th><th>Δ lean</th>${ro ? '' : '<th></th>'}</tr></thead>
        <tbody>${[...scans].reverse().map((s, i, arr) => { const c = scanChange(arr[i + 1], s); return `<tr>
          <td>${fmtDate(s.date)}</td><td>${s.weight ?? '—'}</td><td>${s.bf ?? '—'}</td><td>${s.fat ?? '—'}</td><td>${s.lean ?? '—'}</td>
          <td>${arr[i + 1] ? signed(c.fat) : ''}</td><td>${arr[i + 1] ? signed(c.lean) : ''}</td>${ro ? '' : `<td><button type="button" class="linkish small" data-dxedit="${s.id}">Edit</button></td>`}</tr>`; }).join('')}</tbody>
      </table></div>
      ${scans.some((s) => s.vat != null) ? `<p class="small muted">Visceral fat (VAT): ${scans.filter((s) => s.vat != null).map((s) => `${fmtDate(s.date, false)} ${s.vat} lb`).join(' → ')}</p>` : ''}
    </details>
    ${msg ? `<p class="small">${esc(msg)}</p>` : ''}`;
}

// onChange: redraw the weight chart (it marks scan days).
export function initDexa(getWeights, onChange = () => {}) {
  const root = $('#dexaCard');
  if (!root) return;
  const redraw = () => renderDexa(getWeights());
  root.addEventListener('click', (e) => {
    const hit = e.target.closest('.dx-hit');
    const tip = root.querySelector('.dx-tip');
    if (hit && tip) {
      const r = hit.getBoundingClientRect(), box = root.getBoundingClientRect();
      tip.textContent = hit.dataset.tip;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(8, r.left - box.left - 60), box.width - 150)}px`;
      tip.style.top = `${r.top - box.top - 34}px`;
      return;
    }
    if (tip) tip.hidden = true;
    const t = e.target.closest('button');
    if (!t) return;
    const ds = t.dataset;
    if (ds.dxadd != null) { form = { date: isoDate() }; msg = ''; redraw(); }
    else if (ds.dxcancel != null) { form = null; redraw(); }
    else if (ds.dxedit) { form = { ...store().get('dexa', []).find((s) => s.id === ds.dxedit) }; redraw(); }
    else if (ds.dxdel) {
      if (!confirm('Remove this scan?')) return;
      store().set('dexa', store().get('dexa', []).filter((s) => s.id !== ds.dxdel));
      form = null; redraw(); onChange();
    }
  });
  root.addEventListener('mouseover', (e) => {
    const hit = e.target.closest('.dx-hit');
    if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'dexaForm') return;
    e.preventDefault();
    const f = { ...form };
    root.querySelectorAll('[data-dx]').forEach((inp) => { f[inp.dataset.dx] = inp.value.trim(); });
    if (!f.date) return;
    const n = normalizeScan(f);
    if (n.bf == null && n.fat == null && n.lean == null) { msg = 'Add at least body fat %, or fat and lean mass.'; form = f; root.innerHTML = formHtml() + `<p class="small tone-warn">${esc(msg)}</p>`; return; }
    const scan = { id: f.id || Date.now().toString(36), date: f.date, where: f.where || '', notes: f.notes || '' };
    for (const k of ['weight', 'bf', 'fat', 'lean', 'bone', 'vat']) if (num(f[k]) != null) scan[k] = num(f[k]);
    const list = store().get('dexa', []).filter((s) => s.id !== scan.id);
    store().set('dexa', [...list, scan].sort((a, b) => a.date.localeCompare(b.date)));
    form = null; msg = '';
    redraw();
    onChange();
  });
}
