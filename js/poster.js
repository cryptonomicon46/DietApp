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
    ctx.fillText(`${day.target.kcal} kcal  ·  ${day.target.p}g protein  ·  ${day.target.f}g fat  ·  ${day.target.c}g carbs`, PAD, 212);
  }
  y = headH + 40;
  const cardW = W - PAD * 2, inner = cardW - 72;
  for (const m of day.meals) {
    const top = y;
    let cy = top + 64;
    font(26, 700);
    if (draw) { ctx.fillStyle = COLORS.muted; ctx.fillText(`${ICONS[m.key] || '•'}  ${m.label.toUpperCase()}`, PAD + 36, cy); }
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
    ctx.fillText(`Day total: ${t.kcal} kcal · ${t.p}P · ${t.f}F · ${t.c}C`, PAD, y + 20);
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
