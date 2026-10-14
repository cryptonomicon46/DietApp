// A shareable picture (and CSV) of a day's meals: breakfast, lunch and dinner with foods,
// amounts and macros. Drawn on a canvas so it works offline and shares as a PNG.

// day = { name, dateLabel, target: {kcal,p,f,c}, meals: [{ label, title, totals: {kcal,p,f,c},
//         items: [{ name, amount, grams, kcal }] }] }
export function planCsvRows(day, combos = []) {
  const rows = [];
  for (const m of day.meals) {
    if (!m.items.length) rows.push({ section: 'plan', date: day.date, meal: m.label, meal_title: m.title, food: m.title, amount: '', grams: '', kcal: m.totals.kcal, protein_g: m.totals.p, fat_g: m.totals.f, carbs_g: m.totals.c });
    for (const it of m.items) rows.push({ section: 'plan', date: day.date, meal: m.label, meal_title: m.title, food: it.name, amount: it.amount || '', grams: it.grams ?? '', kcal: it.kcal ?? '', protein_g: it.p ?? '', fat_g: it.f ?? '', carbs_g: it.c ?? '' });
    rows.push({ section: 'plan', date: day.date, meal: m.label, meal_title: m.title, food: 'MEAL TOTAL', amount: '', grams: '', kcal: m.totals.kcal, protein_g: m.totals.p, fat_g: m.totals.f, carbs_g: m.totals.c });
  }
  if (day.target) rows.push({ section: 'plan', date: day.date, meal: 'day', meal_title: 'Daily target', food: 'DAY TARGET', amount: '', grams: '', kcal: day.target.kcal, protein_g: day.target.p, fat_g: day.target.f, carbs_g: day.target.c });
  for (const c of combos) {
    for (const it of c.items) rows.push({ section: 'saved combo', date: '', meal: c.kind === 'breakfast' ? 'breakfast' : 'lunch/dinner', meal_title: c.name, food: it.name, amount: it.amount || '', grams: it.grams, kcal: it.kcal, protein_g: it.p, fat_g: it.f, carbs_g: it.c });
  }
  return rows;
}

const W = 1080, PAD = 64;
const COLORS = { bg: '#f7f3ea', card: '#ffffff', ink: '#1f2a24', muted: '#6b756f', brand: '#2e7d5b', line: '#e6e0d4', p: '#c2563a', f: '#b8860b', c: '#3c6fb5' };
const ICONS = { breakfast: '☀️', lunch: '🥗', dinner: '🍽️' };
const FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif';

function wrap(ctx, text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Lay out (measure = true) or draw the poster; returns the height used.
function layout(ctx, day, draw) {
  let y = 0;
  const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  // Header band
  const headH = 250;
  if (draw) {
    ctx.fillStyle = COLORS.brand; ctx.fillRect(0, 0, W, headH);
    ctx.fillStyle = '#fff'; font(30, 600); ctx.fillText(day.dateLabel.toUpperCase(), PAD, 82);
    font(64, 800); ctx.fillText(day.heading, PAD, 156);
    font(34, 500);
    ctx.fillText(day.subtitle ?? `${day.target.kcal} kcal  ·  ${day.target.p}g protein  ·  ${day.target.f}g fat  ·  ${day.target.c}g carbs`, PAD, 212);
  }
  y = headH + 40;
  const cardW = W - PAD * 2, inner = cardW - 72;
  for (const m of day.meals) {
    const top = y;
    let cy = top + 64;
    font(26, 700);
    if (draw) { ctx.fillStyle = COLORS.muted; ctx.fillText(`${ICONS[m.key] || '•'}  ${m.label.toUpperCase()}`, PAD + 36, cy); }
    if (draw && m.tag) { ctx.fillStyle = COLORS.brand; const tw = ctx.measureText(m.tag).width; ctx.fillText(m.tag, PAD + cardW - 36 - tw, cy); }
    cy += 52;
    font(42, 800);
    const titleLines = wrap(ctx, m.title, inner);
    for (const l of titleLines) { if (draw) { ctx.fillStyle = COLORS.ink; ctx.fillText(l, PAD + 36, cy); } cy += 52; }
    // Macro line
    font(30, 700);
    if (draw) {
      let x = PAD + 36;
      for (const [txt, col] of [[`${m.totals.kcal} kcal`, COLORS.ink], [`${m.totals.p}P`, COLORS.p], [`${m.totals.f}F`, COLORS.f], [`${m.totals.c}C`, COLORS.c]]) {
        ctx.fillStyle = col; ctx.fillText(txt, x, cy); x += ctx.measureText(txt).width + 28;
      }
    }
    cy += 26;
    // Foods
    for (const it of m.items) {
      cy += 56;
      font(30, 600);
      const left = it.name;
      const right = [it.amount, it.grams != null ? `${it.grams} g` : ''].filter(Boolean).join(' · ');
      font(28, 500);
      const rw = ctx.measureText(right).width;
      font(30, 600);
      const lines = wrap(ctx, left, inner - rw - 30);
      if (draw) {
        ctx.fillStyle = COLORS.line; ctx.fillRect(PAD + 36, cy - 40, inner, 2);
        ctx.fillStyle = COLORS.ink; ctx.fillText(lines[0], PAD + 36, cy);
        font(28, 500); ctx.fillStyle = COLORS.muted; ctx.fillText(right, PAD + 36 + inner - rw, cy);
      }
      for (const l of lines.slice(1)) { cy += 38; font(30, 600); if (draw) { ctx.fillStyle = COLORS.ink; ctx.fillText(l, PAD + 36, cy); } }
    }
    cy += 44;
    m._box = [PAD, top, cardW, cy - top];
    y = cy + 32;
  }
  // Footer
  y += 10;
  if (draw) {
    font(30, 700); ctx.fillStyle = COLORS.ink;
    const t = day.total;
    if (t) ctx.fillText(`Day total: ${t.kcal} kcal · ${t.p}P · ${t.f}F · ${t.c}C`, PAD, y + 20);
    font(24, 500); ctx.fillStyle = COLORS.muted;
    ctx.fillText('Oats weighed dry; meat, fish, eggs, rice and veggies cooked.  ·  Lean Plate', PAD, y + 62);
  }
  return y + 110;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function drawPoster(day) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = 10;
  const H = layout(ctx, day, false);
  canvas.width = W; canvas.height = Math.ceil(H);
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
  // Cards first, then everything on top.
  for (const m of day.meals) {
    const [x, y, w, h] = m._box;
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; roundRect(ctx, x, y + 6, w, h, 28); ctx.fill();
    ctx.fillStyle = COLORS.card; roundRect(ctx, x, y, w, h, 28); ctx.fill();
  }
  ctx.textBaseline = 'alphabetic';
  layout(ctx, day, true);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ---------- progress report poster ----------
// Weight colors match the app's weight chart (validated for contrast): weigh-ins blue, trend green.
const WEIGHT = { raw: '#4a7fd0', avg: '#14875a' };

function weightChart(ctx, x, y, w, h, points) {
  const font = (size, weight = 500) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  if (points.length < 2) {
    font(28); ctx.fillStyle = COLORS.muted;
    ctx.fillText(points.length ? `One weigh-in: ${points[0].weight} lb` : 'No weigh-ins in this stretch', x, y + 50);
    return;
  }
  const t = (d) => new Date(`${d}T12:00:00`).getTime();
  const t0 = t(points[0].date), t1 = Math.max(t(points[points.length - 1].date), t0 + 86400000);
  const vals = points.map((p) => p.weight);
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const L = x + 70, R = x + w - 20, T = y + 10, B = y + h - 40;
  const X = (d) => L + ((t(d) - t0) / (t1 - t0)) * (R - L);
  const Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
  // Grid + labels
  font(22); ctx.fillStyle = COLORS.muted; ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2;
  const step = hi - lo > 12 ? 5 : hi - lo > 5 ? 2 : 1;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke();
    ctx.fillText(String(v), x, Y(v) + 8);
  }
  const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  ctx.fillText(short(points[0].date), L, B + 34);
  const endLabel = short(points[points.length - 1].date);
  ctx.fillText(endLabel, R - ctx.measureText(endLabel).width, B + 34);
  // 7-day average trend
  const avg = points.map((p) => {
    const win = points.filter((o) => t(o.date) <= t(p.date) && t(o.date) > t(p.date) - 7 * 86400000);
    return { date: p.date, v: win.reduce((a, o) => a + o.weight, 0) / win.length };
  });
  ctx.strokeStyle = WEIGHT.raw; ctx.globalAlpha = 0.45; ctx.lineWidth = 3;
  ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(X(p.date), Y(p.weight)) : ctx.moveTo(X(p.date), Y(p.weight)))); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = WEIGHT.avg; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  ctx.beginPath(); avg.forEach((p, i) => (i ? ctx.lineTo(X(p.date), Y(p.v)) : ctx.moveTo(X(p.date), Y(p.v)))); ctx.stroke();
  for (const p of points) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(p.date), Y(p.weight), 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WEIGHT.raw; ctx.beginPath(); ctx.arc(X(p.date), Y(p.weight), 6, 0, Math.PI * 2); ctx.fill();
  }
}

// report: from share.js buildReport; rows: day or week rows already formatted for the table.
export async function drawReportPoster({ heading, period, report, rows, weekly }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  const rowH = 84;
  const H = 250 + 40 + 190 + 40 + 470 + 40 + 90 + rows.length * rowH + 140;
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
  // Header
  ctx.fillStyle = COLORS.brand; ctx.fillRect(0, 0, W, 250);
  ctx.fillStyle = '#fff'; font(30, 600); ctx.fillText(period.toUpperCase(), PAD, 82);
  font(60, 800); ctx.fillText(heading, PAD, 156);
  font(32, 500); ctx.fillText(`${report.loggedDays} of ${report.totalDays} day${report.totalDays > 1 ? 's' : ''} logged${report.avgTarget ? `  ·  target ~${report.avgTarget} kcal/day` : ''}`, PAD, 212);
  let y = 290;
  // Average tiles
  const tiles = [['kcal', `${report.avg.kcal}`, 'avg kcal', COLORS.ink], ['p', `${report.avg.p}g`, 'protein', COLORS.p], ['f', `${report.avg.f}g`, 'fat', COLORS.f], ['c', `${report.avg.c}g`, 'carbs', COLORS.c]];
  const tw = (W - PAD * 2 - 3 * 20) / 4;
  tiles.forEach(([, v, label, col], i) => {
    const x = PAD + i * (tw + 20);
    ctx.fillStyle = COLORS.card; roundRect(ctx, x, y, tw, 170, 24); ctx.fill();
    ctx.fillStyle = col; font(52, 800); ctx.fillText(v, x + 26, y + 84);
    ctx.fillStyle = COLORS.muted; font(26, 600); ctx.fillText(label, x + 26, y + 130);
  });
  y += 210;
  // Weight card
  ctx.fillStyle = COLORS.card; roundRect(ctx, PAD, y, W - PAD * 2, 470, 28); ctx.fill();
  ctx.fillStyle = COLORS.muted; font(26, 700); ctx.fillText('⚖️  WEIGHT', PAD + 36, y + 60);
  const wt = report.weight;
  if (wt.start != null && wt.end != null) {
    ctx.fillStyle = COLORS.ink; font(40, 800);
    const change = wt.change > 0 ? `+${wt.change}` : wt.change < 0 ? `−${-wt.change}` : '±0';
    ctx.fillText(`${wt.start} → ${wt.end} lb  (${change} lb)`, PAD + 36, y + 112);
  }
  weightChart(ctx, PAD + 36, y + 140, W - PAD * 2 - 72, 300, wt.points);
  y += 510;
  // Table
  ctx.fillStyle = COLORS.ink; font(34, 800); ctx.fillText(weekly ? 'Week by week (daily averages)' : 'Day by day', PAD, y + 40);
  y += 70;
  for (const row of rows) {
    ctx.fillStyle = COLORS.line; ctx.fillRect(PAD, y, W - PAD * 2, 2);
    ctx.fillStyle = COLORS.ink; font(30, 700); ctx.fillText(row.label, PAD, y + 44);
    font(28, 600);
    if (row.kcal == null) { ctx.fillStyle = COLORS.muted; ctx.fillText('not logged', PAD + 330, y + 44); }
    else {
      let x = PAD + 330;
      for (const [txt, col] of [[`${row.kcal} kcal`, COLORS.ink], [`${row.p}P`, COLORS.p], [`${row.f}F`, COLORS.f], [`${row.c}C`, COLORS.c]]) {
        ctx.fillStyle = col; ctx.fillText(txt, x, y + 44); x += ctx.measureText(txt).width + 22;
      }
    }
    if (row.note) {
      font(22, 500); ctx.fillStyle = COLORS.muted;
      let note = row.note;
      while (ctx.measureText(note).width > W - PAD * 2 && note.length > 4) note = `${note.slice(0, -2)}…`;
      ctx.fillText(note, PAD, y + 68);
    }
    y += rowH;
  }
  font(24, 500); ctx.fillStyle = COLORS.muted;
  ctx.fillText('Blue dots: weigh-ins · green line: 7-day average  ·  Lean Plate', PAD, y + 60);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
