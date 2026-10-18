// DEXA scan math, kept free of storage so it can be tested and used in exports.
export const num = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
// Fill in what the report didn't list: fat mass from weight × body fat %, body fat % from
// fat ÷ weight, lean from weight − fat − bone (lean here = lean tissue, without bone).
export function normalizeScan(s) {
  const weight = num(s.weight), bf = num(s.bf), bone = num(s.bone);
  let fat = num(s.fat), lean = num(s.lean);
  let w = weight;
  if (fat == null && w != null && bf != null) fat = w * bf / 100;
  if (w == null && fat != null && lean != null) w = fat + lean + (bone || 0);
  const pct = bf != null ? bf : fat != null && w ? fat / w * 100 : null;
  if (lean == null && w != null && fat != null) lean = w - fat - (bone || 0);
  return { ...s, weight: r1(w), bf: r1(pct), fat: r1(fat), lean: r1(lean), bone: r1(bone), vat: num(s.vat) };
}
export const sortScans = (scans) => scans.map(normalizeScan).sort((a, b) => a.date.localeCompare(b.date));
// Change from one scan to another (later − earlier) for each measure.
export function scanChange(a, b) {
  const d = (k) => (a?.[k] != null && b?.[k] != null ? r1(b[k] - a[k]) : null);
  return { days: a && b ? Math.round((Date.parse(b.date) - Date.parse(a.date)) / 864e5) : 0, weight: d('weight'), bf: d('bf'), fat: d('fat'), lean: d('lean') };
}

