'use strict';
// The world at a point, at runtime: landH (grid plus fine bumps and sea stacks), nearby channels, ponds in hollows, world(x, y).
// terrain before channels and ponds: the grid plus fine bumps kept off the shores, then any sea stack standing on it
function landH(x, y) { const g = landH0(x, y), s = stackS(x, y); return s > 0 ? g + Math.max(0, STK_T - g) * s : g; }
function landH0(x, y) {
  if (!ISL) buildIsland();
  if (!inGrid(x, y)) return islandBase(x, y);
  const h = bil(ISL.H, x, y), wet = bil(ISL.wet, x, y);
  return Math.max(bil(ISL.floor, x, y), h + (nM(x / 45, y / 45) * 0.7 + nM(x / 17 + 3.3, y / 17 - 1.7) * 0.3) * 1.8 * (1 - wet) * sstep(WLW, WLW + 4, h));
}
// nearby channels, one entry per chain (its nearest segment): fills CH_* scratch arrays, returns the count
const CH_D = new Float32Array(12), CH_W = new Float32Array(12), CH_S = new Float32Array(12), CH_P = new Float32Array(12), CH_K = new Uint8Array(12), CH_I = new Int32Array(12), CH_C = new Int32Array(12);
function nearChannels(x, y) {
  const I = ISL, l = I.buckets.get(Math.floor(x / I.B) * 100003 + Math.floor(y / I.B)); if (!l) return 0;
  let n = 0;
  for (const s of l) {
    const o = s * 10, ax = I.SEG[o], ay = I.SEG[o + 1], dx = I.SEG[o + 2] - ax, dy = I.SEG[o + 3] - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, y - ay - dy * t), w = I.SEG[o + 6] + (I.SEG[o + 7] - I.SEG[o + 6]) * t;
    if (d > w + 46) continue;
    const ch = I.segC[s]; let k = 0; while (k < n && CH_C[k] !== ch) k++;
    if (k < n && CH_D[k] <= d) continue;
    if (k === n) { if (n >= 12) continue; n++; }
    CH_C[k] = ch; CH_D[k] = d; CH_W[k] = w; CH_S[k] = I.SEG[o + 4] + (I.SEG[o + 5] - I.SEG[o + 4]) * t; CH_P[k] = I.SEG[o + 8] + (I.SEG[o + 9] - I.SEG[o + 8]) * t; CH_K[k] = I.segK[s]; CH_I[k] = s;
  }
  return n;
}
// ponds in hollows off the network (small round basins with their own level)
const lakeMemo = new Map();
function pondCell(ci, cj) {
  const key = (ci + 50000) * 100000 + (cj + 50000);
  let L = lakeMemo.get(key); if (L !== undefined) return L;
  L = null; const G = 170, s = SEED + 7001;
  if (hash2(ci, cj, s) < CONFIG.pondChance) {
    const cx = (ci + 0.22 + 0.56 * hash2(ci, cj, s + 1)) * G, cy = (cj + 0.22 + 0.56 * hash2(ci, cj, s + 2)) * G, R = 8 + 13 * hash2(ci, cj, s + 3);
    const hc = landH(cx, cy), n = inGrid(cx, cy) ? nearChannels(cx, cy) : 0; let clear = true;
    for (let k = 0; k < n; k++) if (CH_D[k] - CH_W[k] < R + 30) clear = false;
    if (clear && inGrid(cx, cy) && bil(ISL.wet, cx, cy) < 0.15 && hc > WLW + 1.5 && hc < hW(0.6) && moist(cx, cy) > 0.38) {
      let lo = 1e9, hi = -1e9;
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832, hh = landH(cx + Math.cos(a) * R, cy + Math.sin(a) * R); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
      const lev = lo - 0.25, h4 = hash2(ci, cj, s + 4), h5 = hash2(ci, cj, s + 5);
      if (hi - lo < 4 && hc - lev < 4) L = { cx, cy, R, lev, D: 1.3 + 1.3 * h4, pond: true, kind: POND, ph: h5 * 100, id: 'pond' + key, name: pick(POND_NAMES, h5) + ' Pond' };
    }
  }
  if (lakeMemo.size > 30000) lakeMemo.clear();
  lakeMemo.set(key, L); return L;
}
// The world at a point: returns elevation 0..1 (after carving), sets WLEV (water level, world units), WK (water
// kind), WOBJ (the lake or pond, if any) and WSEG (the nearest river/creek segment, if any).
let WLEV = WLW, WK = OCEAN, WOBJ = null, WSEG = -1, WRAP = 0;   // WRAP: rapids 0..1
function world(x, y) {
  if (!ISL) buildIsland();
  let h = landH(x, y); const h0 = h;
  let lev = WLW, kind = OCEAN, obj = null, sg = -1;
  if (inGrid(x, y)) {
    const I = ISL, gi = Math.round((x - I.ox) / I.C), gj = Math.round((y - I.oy) / I.C), id = I.lakeNear[gj * I.N + gi];
    if (id >= 0) { obj = I.lakes[id]; lev = obj.lev; kind = obj.kind; }
    const n = nearChannels(x, y), lk = obj, inLake = id >= 0 && I.lakeId[gj * I.N + gi] >= 0;
    let gap = 1e9;   // how far outside the water of a river or creek running well below this lake (or its shore) we are: see below
    if (lk) for (let k = 0; k < n; k++) if (CH_S[k] < lk.lev - 0.3) gap = Math.min(gap, CH_D[k] - CH_W[k]);   // (an outlet leaving the lake is at its level at first, so not 'below' it)
    const lowerBy = gap < 12;
    let best = 1e9;
    for (let k = 0; k < n; k++) {
      let lipK = (obj ? sstep(lev - 0.5, lev + 0.5, h0) : 1) * sstep(WLW - 0.5, WLW + 0.5, h0);   // no levee inside a lake or the sea
      for (let q = 0; q < n; q++) if (q !== k) lipK *= sstep(CH_W[q] + 0.5, CH_W[q] + 3, CH_D[q]);    // nor across another channel
      h = carveBasin(h, CH_D[k], CH_W[k], CH_S[k], CH_P[k], CH_K[k] === RIVER ? 0.26 : 0.5, lipK);
      if (CH_D[k] < CH_W[k] + 3 && CH_D[k] / CH_W[k] < best) {
        best = CH_D[k] / CH_W[k]; sg = CH_I[k];
        // the channel's own level, unless a lake owns this spot; on a lake's shore the inflowing creek keeps its
        // (higher) level until it reaches the lake, so its last metres aren't left dry
        const lakeLev = obj && obj.kind !== undefined && kind !== RIVER && kind !== CREEK ? obj.lev : null;
        if (h0 > WLW + 0.2 && (lakeLev === null || (CH_S[k] > lakeLev + 0.05 && h0 > lakeLev) || (lowerBy && CH_S[k] < lakeLev - 0.3 && CH_D[k] < CH_W[k] + (inLake ? 0 : 1.5)))) { lev = Math.max(CH_S[k], WLW); kind = CH_K[k]; obj = null; }   // (a lower river past a lake keeps its own level)
      }
    }
    if (lowerBy && obj === lk) h = Math.max(h, gap < 6 ? lk.lev + 0.15 : inLake ? h : Math.min(h0, lk.lev + 0.15));   // and the lake keeps a bank between them: no lake water left hanging over the river
    if (!obj && kind === OCEAN) { const c = cenoteAt(x, y), hb = h;   // a cenote: the pit's wall spans 4 m+ (2+ terrain cells) so its colours don't smear
      if (c) { const floor = c.lev - c.D * (1 - Math.min(1, CEN_D / CEN_R) ** 2), b = sstep(CEN_R - Math.max(4, 0.25 * CEN_R), CEN_R, CEN_D);
        h = Math.min(h, floor + (h - floor) * b); if (CEN_D < CEN_R) { lev = c.lev; kind = LAKE; obj = c; } }
      const r = cenoteRamp(x, y); if (r) { const w = rampW(r, hb); if (w > 0) h += (Math.min(hb, r.z) - h) * w; if (!obj && h < r.c.lev) { lev = r.c.lev; kind = LAKE; obj = r.c; } } }
    if (!obj && kind === OCEAN) { // ponds in hollows
      const G = 170, ci = Math.floor(x / G), cj = Math.floor(y / G);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const L = pondCell(ci + di, cj + dj); if (!L) continue;
        const dx = x - L.cx, dy = y - L.cy; if (Math.abs(dx) > L.R * 1.3 + 50 || Math.abs(dy) > L.R * 1.3 + 50) continue;
        const dist = Math.hypot(dx, dy), Rr = L.R * (1 + 0.28 * nSh(x / (L.R * 0.8) + L.ph, y / (L.R * 0.8) - L.ph));
        let lipK = 1; for (let q = 0; q < n; q++) lipK *= sstep(CH_W[q] + 0.5, CH_W[q] + 3, CH_D[q]);   // a pond's lip never dams a creek
        h = carveBasin(h, dist, Rr, L.lev, L.D, 0.3, lipK);
        if (dist < Rr + 3 && !obj) { lev = L.lev; kind = POND; obj = L; }
      }
    }
  }
  let rap = 0;
  if (sg >= 0 && (kind === RIVER || kind === CREEK)) {
    rap = ISL.segR[sg];
    if (rap > 0.05) { // a rocky bed: humps that shoal the water and break it into whitewater
      const D = ISL.SEG[sg * 10 + 8], bump = Math.max(0, nM(x / 3.3 + 17, y / 3.3 - 5) * 0.7 + nM(x / 1.4 - 3, y / 1.4 + 9) * 0.3 - 0.05) * rap;
      if (h < lev) h = Math.min(lev - 0.06, h + bump * (D + 0.5) * 1.6);
    }
  }
  WLEV = lev; WK = kind; WOBJ = obj; WSEG = sg; WRAP = rap;
  return clamp(Math.sign(h) * Math.sqrt(Math.abs(h) / HS), -4, 1);   // below 0 = sea floor deeper than 16 m (hW keeps the sign)
}
const elev = (x, y) => world(x, y);
