// ✂️ Background removal for Closet photos, on the phone — no model to download, nothing sent
// anywhere. It works on the way people photograph clothes: a piece laid on a bed, a floor or a
// table, or hung against a wall. The background is learnt from the photo's edges (up to two
// colours, e.g. floor and wall); everything connected to the edges that looks like it is
// removed, stopping at strong edges; specks are cleaned up and the outline softened. When the
// result doesn't look like one clear piece (a busy background, almost nothing left, almost
// nothing removed) it says so, and the person can keep the original, try again or retake.
//
// Pure: RGBA pixels in (an ImageData-shaped {data, width, height}), an alpha mask out.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// A colour distance that cares more about brightness and less about tiny hue shifts in shadows.
const cdist = (a, b) => {
  const dl = lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]);
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(0.5 * dl * dl + 0.5 * (dr * dr + dg * dg + db * db) / 3);
};

// Border pixels → up to two background colours (a tiny k-means), with how spread out each is.
export function borderModel({ data, width: w, height: h }, margin = 0.03) {
  const m = Math.max(1, Math.round(Math.min(w, h) * margin));
  const px = [];
  const take = (x, y) => { const i = (y * w + x) * 4; px.push([data[i], data[i + 1], data[i + 2]]); };
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (x < m || y < m || x >= w - m || y >= h - m) take(x, y);
  let c = [px[0], px[Math.floor(px.length / 2)]];
  for (let it = 0; it < 8; it++) {
    const sum = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (const p of px) { const k = cdist(p, c[0]) <= cdist(p, c[1]) ? 0 : 1; sum[k][0] += p[0]; sum[k][1] += p[1]; sum[k][2] += p[2]; sum[k][3]++; }
    c = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : c[k]));
  }
  const groups = c.map((col) => ({ col, n: 0, spread: 0 }));
  for (const p of px) { const k = cdist(p, c[0]) <= cdist(p, c[1]) ? 0 : 1; groups[k].n++; groups[k].spread += cdist(p, c[k]); }
  const keep = groups.filter((g) => g.n >= px.length * 0.15).map((g) => ({ col: g.col, spread: g.spread / g.n, share: g.n / px.length }));
  return keep.length ? keep : [{ col: c[0], spread: 30, share: 1 }];
}

// tolerance: 1 normally; Try again uses a different one (0.7 or 1.4).
export function cutout(img, { tolerance = 1 } = {}) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const bg = borderModel(img);
  const spread = Math.max(...bg.map((b) => b.spread));
  const T = Math.max(14, Math.min(70, (22 + spread * 1.6) * tolerance));
  const nearBg = (i) => { const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]; return bg.some((b) => cdist(p, b.col) < T); };
  // Flood from the edges through background-coloured pixels, never across a strong edge.
  const mask = new Uint8Array(n); // 1 = background
  const q = new Int32Array(n);
  let head = 0, tail = 0, borderBg = 0, border = 0;
  const seed = (i) => { border++; if (!mask[i] && nearBg(i)) { mask[i] = 1; q[tail++] = i; borderBg++; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { seed(y * w); seed(y * w + w - 1); }
  const edge = (a, b) => cdist([data[a * 4], data[a * 4 + 1], data[a * 4 + 2]], [data[b * 4], data[b * 4 + 1], data[b * 4 + 2]]);
  while (head < tail) {
    const i = q[head++], x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || mask[j]) continue;
      if (nearBg(j) && edge(i, j) < T * 0.8) { mask[j] = 1; q[tail++] = j; }
    }
  }
  // Keep the piece: the biggest connected foreground region and any others at least 3% of its size.
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  for (let s = 0; s < n; s++) {
    if (mask[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let size = 0; head = 0; tail = 0; q[tail++] = s; label[s] = id;
    while (head < tail) {
      const i = q[head++], x = i % w; size++;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && !mask[j] && label[j] < 0) { label[j] = id; q[tail++] = j; }
    }
    sizes.push(size);
  }
  const big = Math.max(0, ...sizes);
  const keep = sizes.map((s) => s >= big * 0.03 && s > 12);
  const alpha = new Uint8Array(n);
  let fg = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    if (!mask[i] && keep[label[i]]) {
      alpha[i] = 255; fg++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  // Soften the outline by one pixel.
  const soft = new Uint8Array(alpha);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!alpha[i]) continue;
    const around = alpha[i - 1] + alpha[i + 1] + alpha[i - w] + alpha[i + w];
    if (around < 1020) soft[i] = Math.round((255 + around / 4) / 2);
  }
  const ratio = fg / n, bgEdge = border ? borderBg / border : 0;
  // A background that varies a lot (a patterned rug, a cluttered room) can't be cut out reliably.
  const reason = bgEdge < 0.55 || spread > (tolerance > 1 ? 60 : 40) ? 'busy' : ratio < 0.03 ? 'empty' : ratio > 0.92 ? 'nothing-removed' : '';
  const pad = Math.round(Math.max(w, h) * 0.03);
  return {
    ok: !reason, reason, ratio: Math.round(ratio * 1000) / 1000, alpha: soft, width: w, height: h,
    box: fg ? { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(w, x1 + pad + 1) - Math.max(0, x0 - pad), h: Math.min(h, y1 + pad + 1) - Math.max(0, y0 - pad) } : { x: 0, y: 0, w, h },
  };
}
// 8×8 greyscale of the cut-out (for the same-piece fingerprint), from the masked pixels.
export function gray8(img, alpha, box) {
  const { data, width: w } = img;
  const out = [];
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    let s = 0, c = 0;
    const xa = box.x + Math.floor((gx * box.w) / 8), xb = box.x + Math.floor(((gx + 1) * box.w) / 8);
    const ya = box.y + Math.floor((gy * box.h) / 8), yb = box.y + Math.floor(((gy + 1) * box.h) / 8);
    for (let y = ya; y < yb; y += 2) for (let x = xa; x < xb; x += 2) { const i = y * w + x; if (alpha && !alpha[i]) continue; s += lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); c++; }
    out.push(c ? s / c : 255);
  }
  return out;
}
