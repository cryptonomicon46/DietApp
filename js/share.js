// Shareable summaries: a stretch of logged days (macros eaten + how weight moved) and
// saved meal combos, as plain text or CSV rows. Posters are drawn in poster.js.

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const fmtDay = (day, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, opts);
const r = (x) => Math.round(x || 0);

export const RANGES = { day: { label: '1 day', days: 1 }, week: { label: '1 week', days: 7 }, twoWeeks: { label: '2 weeks', days: 14 }, program: { label: 'Full program', days: null } };
export const PHASE_NAMES = { cut: 'Cut', break: 'Diet break', maintain: 'Maintenance', gain: 'Lean gain' };

// data = { today, mealLog: {date: {meals, extras, fuel}}, todayLog?: {meals, extras, fuel}, days: {date: {target, proteinTarget, burned}},
//          weights: [{date, weight}], programStart, phase }
export function buildReport(data, range) {
  const today = data.today;
  const n = RANGES[range]?.days;
  let from = n ? shift(today, -(n - 1)) : (data.programStart || today);
  if (from > today) from = today;
  const days = [];
  for (let d = from; d <= today; d = shift(d, 1)) {
    const log = d === today ? data.todayLog : data.mealLog[d];
    const meals = Object.entries(log?.meals || {});
    const items = [...meals.map(([, m]) => m), ...(log?.fuel ? [log.fuel] : []), ...(log?.extras || [])];
    const ate = { kcal: 0, p: 0, f: 0, c: 0 };
    for (const it of items) for (const k in ate) ate[k] += it[k] || 0;
    const rec = data.days[d];
    days.push({
      date: d, logged: items.length > 0,
      kcal: r(ate.kcal), p: r(ate.p), f: r(ate.f), c: r(ate.c),
      target: rec?.target ?? null, proteinTarget: rec?.proteinTarget ?? null, burned: rec?.burned ?? null,
      meals: ['breakfast', 'lunch', 'snack', 'dinner'].filter((k) => log?.meals?.[k]).map((k) => ({ meal: k, title: log.meals[k].title, kcal: r(log.meals[k].kcal) })),
      extras: (log?.extras || []).map((x) => x.title),
    });
  }
  const logged = days.filter((d) => d.logged);
  const avg = (k) => (logged.length ? r(logged.reduce((a, d) => a + d[k], 0) / logged.length) : 0);
  const withTarget = logged.filter((d) => d.target);
  const weights = data.weights.filter((w) => w.date >= from && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  // The last weigh-in before the range anchors the start, so a one-week report still shows change.
  const before = data.weights.filter((w) => w.date < from).sort((a, b) => b.date.localeCompare(a.date))[0];
  const startW = weights[0] || before || null;
  const endW = weights[weights.length - 1] || null;
  return {
    range, from, to: today, phase: data.phase || 'cut', days,
    loggedDays: logged.length, totalDays: days.length,
    avg: { kcal: avg('kcal'), p: avg('p'), f: avg('f'), c: avg('c') },
    avgTarget: withTarget.length ? r(withTarget.reduce((a, d) => a + d.target, 0) / withTarget.length) : null,
    onTarget: withTarget.filter((d) => Math.abs(d.kcal - d.target) <= d.target * 0.1).length,
    proteinHit: logged.filter((d) => d.proteinTarget && d.p >= d.proteinTarget * 0.9).length,
    weight: {
      points: [...(before && !weights.find((w) => w.date === before.date) ? [before] : []), ...weights],
      start: startW?.weight ?? null, end: endW?.weight ?? null,
      change: startW && endW ? Math.round((endW.weight - startW.weight) * 10) / 10 : null,
    },
  };
}

// Group a long report into 7-day blocks from its first day, for the poster/text.
export function weeklyRows(report) {
  const weeks = [];
  for (let i = 0; i < report.days.length; i += 7) {
    const chunk = report.days.slice(i, i + 7);
    const logged = chunk.filter((d) => d.logged);
    const a = (k) => (logged.length ? r(logged.reduce((s, d) => s + d[k], 0) / logged.length) : 0);
    weeks.push({ label: `${fmtDay(chunk[0].date, { month: 'short', day: 'numeric' })}–${fmtDay(chunk[chunk.length - 1].date, { month: 'short', day: 'numeric' })}`, logged: logged.length, of: chunk.length, kcal: a('kcal'), p: a('p'), f: a('f'), c: a('c') });
  }
  return weeks;
}

export function rangeTitle(report) {
  return report.from === report.to ? fmtDay(report.to, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${fmtDay(report.from, { month: 'short', day: 'numeric' })} – ${fmtDay(report.to, { month: 'short', day: 'numeric' })}`;
}

const signed = (x) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '±0');

export function reportText(report, name) {
  const phase = PHASE_NAMES[report.phase] || 'Cut';
  const lines = [`📊 ${name ? `${name}'s ` : ''}${phase.toLowerCase()} · ${rangeTitle(report)}`, ''];
  if (!report.loggedDays) lines.push('No meals logged in this stretch yet.');
  else {
    lines.push(`Average per day (${report.loggedDays} of ${report.totalDays} days logged):`);
    lines.push(`${report.avg.kcal} kcal · ${report.avg.p}g protein · ${report.avg.f}g fat · ${report.avg.c}g carbs${report.avgTarget ? ` (target ~${report.avgTarget} kcal)` : ''}`);
    if (report.avgTarget) lines.push(`On target (±10%): ${report.onTarget} of ${report.loggedDays} days · protein goal hit: ${report.proteinHit} days`);
  }
  if (report.weight.start != null && report.weight.end != null) {
    lines.push('', `⚖️ Weight: ${report.weight.start} → ${report.weight.end} lb (${signed(report.weight.change)} lb)`);
  }
  lines.push('');
  if (report.totalDays > 14) {
    for (const w of weeklyRows(report)) lines.push(`${w.label}: ${w.logged ? `${w.kcal} kcal · ${w.p}P ${w.f}F ${w.c}C avg` : 'not logged'}${w.logged && w.logged < w.of ? ` (${w.logged}/${w.of} days)` : ''}`);
  } else {
    for (const d of report.days) {
      if (!d.logged) { lines.push(`${fmtDay(d.date)}: not logged`); continue; }
      lines.push(`${fmtDay(d.date)}: ${d.kcal} kcal · ${d.p}P ${d.f}F ${d.c}C`);
      for (const m of d.meals) lines.push(`  ${{ breakfast: '☀️', lunch: '🥗', snack: '🍎', dinner: '🍽️' }[m.meal]} ${m.title} (${m.kcal})`);
      for (const x of d.extras) lines.push(`  ➕ ${x}`);
    }
  }
  lines.push('', '— OurPawMili');
  return lines.join('\n');
}

export function reportCsvRows(report) {
  return report.days.map((d) => ({
    date: d.date, logged: d.logged ? 'yes' : 'no', kcal: d.kcal, protein_g: d.p, fat_g: d.f, carbs_g: d.c,
    target_kcal: d.target ?? '', protein_target_g: d.proteinTarget ?? '', burned_kcal: d.burned ?? '',
    weight_lb: report.weight.points.find((w) => w.date === d.date)?.weight ?? '',
    breakfast: d.meals.find((m) => m.meal === 'breakfast')?.title || '', lunch: d.meals.find((m) => m.meal === 'lunch')?.title || '',
    dinner: d.meals.find((m) => m.meal === 'dinner')?.title || '', extras: d.extras.join('; '),
  }));
}

// groups = [{ meal: 'breakfast'|'lunch'|'dinner', combos: [{ name, totals, items: [{name, amount, grams, kcal, p, f, c}] }] }]
const MEAL_ICON = { breakfast: '☀️', lunch: '🥗', snack: '🍎', dinner: '🍽️' };
export function combosText(groups, name) {
  const lines = [`🍳 ${name ? `${name}'s ` : 'My '}meal combos`];
  for (const g of groups) {
    if (!g.combos.length) continue;
    lines.push('', `${MEAL_ICON[g.meal]} ${g.meal.toUpperCase()}`);
    for (const c of g.combos) {
      lines.push(`• ${c.name} (${c.totals.kcal} kcal · ${c.totals.p}P ${c.totals.f}F ${c.totals.c}C)`);
      for (const it of c.items) lines.push(`  – ${it.name}: ${it.amount} (${it.grams} g)`);
    }
  }
  lines.push('', 'Oats weighed dry; meat, fish, rice and veggies cooked.', '— OurPawMili');
  return lines.join('\n');
}

export function combosCsvRows(groups) {
  const rows = [];
  for (const g of groups) for (const c of g.combos) {
    for (const it of c.items) rows.push({ meal: g.meal, combo: c.name, food: it.name, amount: it.amount, grams: it.grams, kcal: it.kcal, protein_g: it.p, fat_g: it.f, carbs_g: it.c });
    rows.push({ meal: g.meal, combo: c.name, food: 'TOTAL', amount: '', grams: '', kcal: c.totals.kcal, protein_g: c.totals.p, fat_g: c.totals.f, carbs_g: c.totals.c });
  }
  return rows;
}
