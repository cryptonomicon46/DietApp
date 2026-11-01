// ⌚ The WHOOP card and its sheets — one copy, rendered by both 💪 Health and 🏠 Home (and anything
// else that shows WHOOP), so a change here shows everywhere. Pure: (model, esc) → HTML. The model is
// js/whoopDay.js recoveryContext() plus { dailyMissing, lighter } (family/app.js whoopModel()).
// Numbers are WHOOP's, under WHOOP's names and in WHOOP's colours; "your usual" is worked out on
// the phone. Moved verbatim from family/health.js (2026-11-01); Health re-exports it.
export const WHOOP_COLORS = { sleep: '#7BA1BB', strain: '#0093E7', green: '#16EC06', yellow: '#FFDE00', red: '#FF0026' };
const BY = '<div class="wh-by">Data by <img src="whoop-logo-white.svg" alt="WHOOP" width="100" height="16"></div>';
// A ring that fills clockwise from 12 o'clock (null: an empty track).
function ring(frac, color, inner, { big = false } = {}) {
  const r = 42, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac ?? 0));
  return `<span class="wh-ring${big ? ' big' : ''}"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="wh-trk" cx="50" cy="50" r="${r}" fill="none" stroke-width="${big ? 6 : 7}"/>${frac == null ? '' : `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="${big ? 6 : 7}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}"/>`}</svg><span class="wh-val${frac == null ? ' none' : ''}">${inner}</span></span>`;
}
const pct = (n) => `${Math.round(n)}<small>%</small>`;
const close = '<button type="button" class="wh-x" data-act="close" aria-label="Close">✕</button>';
export function whoopHtml(w, esc) {
  if (!w) return '';
  const head = `<div class="hl-sec"><h2 class="hl-sech">WHOOP</h2>${w.dailyMissing ? '' : '<button type="button" class="linkish small" data-act="whoopdays">Last 7 days ›</button>'}</div>`;
  if (w.dailyMissing) return `${head}<section class="hl-whoop" aria-label="WHOOP">${BY}<p class="wh-line">Reconnect WHOOP to see your Sleep, Recovery and Strain here. Your workouts keep syncing either way.</p><button type="button" class="wh-btn" data-act="devconnect">Reconnect WHOOP</button></section>`;
  const r = w.recovery, sl = w.sleep, st = w.strain;
  // In WHOOP's own order: Sleep (its sleep performance %), Recovery (its band colour), Strain (0–21).
  const tile = (which, label, frac, color, inner, sub, aria) => `<button type="button" class="wh-tile" data-act="whoopdetail" data-wd="${which}" aria-label="${esc(aria)}">${ring(frac, color, inner)}<span class="wh-lab">${label}<i aria-hidden="true">›</i></span>${sub ? `<span class="wh-sub">${esc(sub)}</span>` : ''}</button>`;
  const hrs = sl.hours != null ? `${sl.hours} h${sl.neededHours ? ` of ${sl.neededHours} h` : ''}` : '';
  const sleep = sl.performance != null ? tile('sleep', 'Sleep', sl.performance / 100, WHOOP_COLORS.sleep, pct(sl.performance), hrs, `Sleep ${Math.round(sl.performance)}%${hrs ? `, ${hrs}` : ''}`)
    : sl.hours != null ? tile('sleep', 'Sleep', null, '', `${sl.hours}<small>h</small>`, sl.neededHours ? `of ${sl.neededHours} h` : '', `Sleep ${sl.hours} hours`)
      : tile('sleep', 'Sleep', null, '', '—', sl.state === 'none' ? 'no sleep yet' : 'not scored yet', 'Sleep not scored yet');
  const scored = r.state === 'scored' && r.score != null;
  const relText = r.relative ? (r.relative === 'usual' ? 'your usual' : `${r.relative} than usual`) : '';
  const rec = scored ? tile('recovery', 'Recovery', r.score / 100, WHOOP_COLORS[r.band], pct(r.score), relText, `Recovery ${r.score}%${relText ? `, ${relText}` : ''}`)
    : tile('recovery', 'Recovery', null, '', '—', r.state === 'unscorable' ? 'not scored' : 'not scored yet', 'Recovery not scored yet');
  const ys = st.yesterday != null ? `yesterday ${st.yesterday.toFixed(1)}` : '';
  const strain = tile('strain', 'Strain', st.today != null ? st.today / 21 : null, WHOOP_COLORS.strain, st.today != null ? st.today.toFixed(1) : '—', st.today != null ? ys || 'so far today' : ys || 'none yet', `Strain ${st.today != null ? st.today.toFixed(1) : 'none yet'}${ys ? `, ${ys}` : ''}`);
  const lt = w.lighter || {};
  const lighter = lt.applied ? '<p class="wh-applied">🪶 Today\'s workout is lighter · <button type="button" class="wh-link" data-fx="lighterundo">Undo</button></p>'
    : w.lighterHint && lt.can ? '<button type="button" class="wh-btn" data-fx="lighter">🪶 Make today\'s workout lighter</button>' : '';
  return `${head}<section class="hl-whoop" aria-label="WHOOP today">${BY}
    <div class="wh-rings">${sleep}${rec}${strain}</div>
    <p class="wh-line">${esc(w.line)}</p>${lighter}</section>`;
}
// The last 7 days, WHOOP's numbers only, and your usual range once there's enough.
export function whoopDaysHtml(days, range, esc) {
  const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bar = (n, band) => `<span class="wh-bar" aria-hidden="true"><i style="width:${Math.round(n)}%;background:${WHOOP_COLORS[band]}"></i></span>`;
  return `<div class="whd"><div class="wh-top"><h2>Last 7 days</h2>${close}</div>
    <table class="wh-days"><thead><tr><th scope="col">Day</th><th scope="col">Sleep</th><th scope="col">Recovery</th><th scope="col">Strain</th></tr></thead><tbody>
    ${days.map((x) => `<tr><th scope="row">${esc(day(x.date))}</th><td>${x.sleepPerf != null ? `${x.sleepPerf}%` : x.sleepHours != null ? `${x.sleepHours} h` : '<span class="wh-dim">—</span>'}</td><td>${x.recovery != null ? `${bar(x.recovery, x.band)}${x.recovery}%` : `<span class="wh-dim">${x.state === 'unscorable' ? 'not scored' : '—'}</span>`}</td><td>${x.strain != null ? x.strain.toFixed(1) : '<span class="wh-dim">—</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p class="wh-say">${range.ready ? `Your usual Recovery: ${range.low}–${range.high}% (the middle half of your last 30 days).` : `Building your usual range — ${range.have} of ${range.need} scored days so far. Until then, WHOOP's own colour is all that's shown.`}</p>
    <p class="wh-fine">🔒 Your Recovery and Sleep are yours alone — not shared with your family, whatever your Fitness sharing. Numbers are WHOOP's; "usual" and the sleep gap are worked out on your phone.</p>${BY}</div>`;
}
// The three detail sheets (tap a ring). Numbers are WHOOP's, under WHOOP's names; "your usual" is ours.
const stat = (esc, label, value, unit, note) => `<div class="wh-stat"><span class="k">${esc(label)}</span><span class="v">${value}${unit ? `<small>${esc(unit)}</small>` : ''}</span>${note ? `<span class="u">${esc(note)}</span>` : ''}</div>`;
const dec = (unit) => unit === 'rpm' || unit === '°C';
const num = (v, unit) => (dec(unit) ? Number(v).toFixed(1) : v);
const usualText = (u, unit) => (u ? `Your usual ${u.low === u.high ? num(u.low, unit) : `${num(u.low, unit)}–${num(u.high, unit)}`}${unit === '%' ? '%' : ` ${unit}`}` : '');
const notYet = (esc, title, text) => `<div class="whd"><div class="wh-top"><h2>${esc(title)}</h2>${close}</div><p class="wh-say">${esc(text)}</p>${BY}</div>`;
export function recoveryDetailHtml(d, esc, when = '') {
  if (d.state !== 'scored' || d.score == null) return notYet(esc, 'Recovery', d.state === 'unscorable' ? 'WHOOP couldn\'t score last night.' : 'Recovery isn\'t scored yet — it comes after you wake and WHOOP has scored your sleep.');
  const sl = d.sleep;
  return `<div class="whd"><div class="wh-top"><h2>Recovery</h2>${close}</div>
    ${ring(d.score / 100, WHOOP_COLORS[d.band], pct(d.score), { big: true })}<p class="wh-when">${esc(when)}${when ? ' · ' : ''}from last night's sleep</p>
    <p class="wh-say">${esc(d.line)}</p>
    ${d.rows.map((x) => stat(esc, x.label, num(x.value, x.unit), x.unit, x.key === 'sleep' ? (sl?.neededHours ? `${sl.hours} h of the ${sl.neededHours} h you needed` : '') : usualText(x.usual, x.unit))).join('')}
    <p class="wh-fine">Numbers are WHOOP's. "Your usual" is the middle half of your last 30 days, worked out on your phone once there are 14.</p>${BY}</div>`;
}
const SLEEP_TONES = ['#E8EDF0', '#B9CAD5', '#7BA1BB', '#4D7A99'];
export function sleepDetailHtml(d, esc) {
  if (d.state !== 'scored') return notYet(esc, 'Sleep', d.state === 'unscorable' ? 'WHOOP couldn\'t score last night\'s sleep.' : d.state === 'none' ? 'No sleep from WHOOP for last night yet.' : 'Sleep isn\'t scored yet.');
  const total = d.stages.reduce((a, [, h]) => a + h, 0) || 1, n = d.need;
  const why = [n.baseline ? `${n.baseline} baseline` : '', n.debt ? `${n.debt} sleep debt` : '', n.strain ? `${n.strain} from strain` : '', n.nap ? `${n.nap > 0 ? '+' : '−'}${Math.abs(n.nap)} nap` : ''].filter(Boolean).join(' + ').replace('+ −', '− ');
  return `<div class="whd"><div class="wh-top"><h2>Sleep</h2>${close}</div>
    ${d.performance != null ? ring(d.performance / 100, WHOOP_COLORS.sleep, pct(d.performance), { big: true }) : ''}<p class="wh-when">${esc(d.from)} – ${esc(d.to)} · ${d.hours} h asleep</p>
    <p class="wh-k">Stages</p>
    <div class="wh-stages" role="img" aria-label="${esc(d.stages.map(([k, h]) => `${k} ${h} hours`).join(', '))}">${d.stages.map(([, h], i) => (h ? `<i style="flex:${h / total};background:${SLEEP_TONES[i]}"></i>` : '')).join('')}</div>
    <div class="wh-legend">${d.stages.map(([k, h], i) => `<span style="--c:${SLEEP_TONES[i]}">${esc(k)} · ${h} h</span>`).join('')}</div>
    ${d.neededHours ? stat(esc, 'Hours vs. needed', d.hours, 'h', `You needed ${d.neededHours} h${why ? `: ${why}` : ''}`) : ''}
    ${d.consistency != null ? stat(esc, 'Sleep consistency', d.consistency, '%', 'How close to your usual bed and wake times') : ''}
    ${d.efficiency != null ? stat(esc, 'Sleep efficiency', d.efficiency, '%', 'Time asleep of time in bed') : ''}
    ${d.respiratory != null ? stat(esc, 'Respiratory rate', num(d.respiratory, 'rpm'), 'rpm', usualText(d.respiratoryUsual, 'rpm')) : ''}
    ${d.disturbances != null ? stat(esc, 'Disturbances', d.disturbances, '', d.cycles != null ? `${d.cycles} sleep cycle${d.cycles === 1 ? '' : 's'}` : '') : ''}${BY}</div>`;
}
const ZONE_TONES = ['#AEB9C0', '#67AEE6', '#16EC06', '#FFDE00', '#FF8A00', '#FF0026'];
export function strainDetailHtml(d, esc, { updated = '', logged = () => '' } = {}) {
  const zmax = d.zones ? Math.max(...d.zones) || 1 : 1;
  return `<div class="whd"><div class="wh-top"><h2>Strain</h2>${close}</div>
    ${ring(d.strain != null ? d.strain / 21 : null, WHOOP_COLORS.strain, d.strain != null ? d.strain.toFixed(1) : '—', { big: true })}<p class="wh-when">Today so far${updated ? ` · updated ${esc(updated)}` : ''}${d.yesterday != null ? ` · yesterday ${d.yesterday.toFixed(1)}` : ''}</p>
    ${d.kcal != null ? stat(esc, 'Calories', d.kcal.toLocaleString(), 'kcal', 'Today so far') : ''}
    ${d.avgHr != null ? stat(esc, 'Average heart rate', d.avgHr, 'bpm', d.maxHr ? `Max ${d.maxHr} bpm` : '') : ''}
    ${d.steps != null ? stat(esc, 'Steps', d.steps.toLocaleString(), '', 'Today so far') : ''}
    ${d.zones ? `<p class="wh-k">Heart-rate zones · today's workouts</p>${d.zones.map((m, i) => `<div class="wh-zone"><span>Zone ${i}</span><span class="t"><i style="width:${Math.round((m / zmax) * 100)}%;background:${ZONE_TONES[i]}"></i></span><span class="m">${m} min</span></div>`).join('')}` : ''}
    ${d.workouts.map((x) => { const l = logged(x.id); return `<div class="wh-wk"><div class="h"><span>${esc(x.name ? x.name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Workout')} · ${esc(x.at)}</span>${x.strain != null ? `<b>${x.strain.toFixed(1)}</b>` : ''}</div><div class="s">${[x.minutes ? `${x.minutes} min` : '', x.kcal ? `${x.kcal} kcal` : '', x.avgHr ? `avg ${x.avgHr}${x.maxHr ? ` / max ${x.maxHr}` : ''} bpm` : '', l ? `✓ ${l} in Fitness` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`; }).join('') || '<p class="wh-say">No WHOOP workouts today yet.</p>'}
    ${d.zones ? '<p class="wh-fine">WHOOP gives heart-rate zones for each workout, so the zones are for your workouts today, not the whole day.</p>' : ''}${BY}</div>`;
}

// ⟳ SYNC WHOOP, straight under the card on Home (family/whoopSync.js runs it). `s`: { busy, done
// (just synced: the button says so for a moment), msg: { text, tone: 'ok' | 'warn' | '' },
// reconnect, lastSync (ms), sleepEnd ("6:41 AM", WHOOP's own sleep record) }.
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function syncedText(ms, now = Date.now()) {
  if (!ms) return '';
  const d = new Date(ms), n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  return sameDay ? clock(ms) : `${d.toLocaleDateString([], { weekday: 'short' })} ${clock(ms)}`;
}
// Stale: last synced before today's midnight, or more than 6 hours ago.
export function isStale(ms, now = Date.now()) {
  if (!ms) return true;
  const mid = new Date(now); mid.setHours(0, 0, 0, 0);
  return ms < mid.getTime() || now - ms > 6 * 3600e3;
}
export function whoopSyncHtml(s = {}, esc, now = Date.now()) {
  const when = [s.lastSync ? `Last synced ${syncedText(s.lastSync, now)}` : 'Not synced yet', s.sleepEnd ? `Sleep ended ${s.sleepEnd}` : ''].filter(Boolean);
  const btn = s.reconnect
    ? '<button type="button" class="wh-sync danger" data-act="devconnect">Reconnect WHOOP</button>'
    : s.busy ? '<button type="button" class="wh-sync" disabled aria-busy="true"><span class="wh-spin" aria-hidden="true"></span>Syncing WHOOP…</button>'
      : `<button type="button" class="wh-sync" data-act="whoopsync"><span class="ic" aria-hidden="true">${s.done ? '✓' : '⟳'}</span>${s.done ? 'WHOOP synced' : 'Sync WHOOP'}</button>`;
  const msg = s.reconnect ? { text: 'WHOOP needs to reconnect', tone: 'warn' } : s.msg;
  return `<div class="wh-syncbox">${btn}${msg?.text ? `<p class="wh-res ${msg.tone || ''}" role="${msg.tone === 'warn' ? 'alert' : 'status'}">${esc(msg.text)}</p>` : ''}<p class="wh-synced">${when.map((x) => `<span>${esc(x)}</span>`).join('')}</p></div>`;
}
// "WHOOP data may be out of date · Last synced 6:42 AM", above the card when it's stale.
export const staleHtml = (ms, esc, now = Date.now()) => `<p class="wh-stale" role="status">WHOOP data may be out of date${ms ? ` · Last synced ${esc(syncedText(ms, now))}` : ''}</p>`;
