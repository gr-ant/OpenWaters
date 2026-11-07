'use strict';
// ================= The island and its water system =================
// One island continent in a real ocean. At load the terrain is laid out on a grid and water is routed downhill
// across it: basins fill to their spill points, flow accumulates from cell to cell, and wherever enough water
// gathers a creek forms. Creeks merge into rivers, rivers pass through lakes and run to the sea; small hollows hold
// ponds. At runtime world(x, y) samples that grid and carves the channels and basins at full detail.
const OCEAN = 0, LAKE = 1, POND = 2, RIVER = 3, CREEK = 4;
const WATER = [ // per kind: murk (0 clear .. 1 green-brown), wave height, underwater visibility (m), map colour
  { key: 'sea', murk: 0.05, wave: 1.0, vis: 60, map: [0.05, 0.2, 0.46] },
  { key: 'lake', murk: 0.22, wave: 0.42, vis: 36, map: [0.1, 0.36, 0.56] },
  { key: 'pond', murk: 0.72, wave: 0.1, vis: 10, map: [0.17, 0.35, 0.27] },
  { key: 'river', murk: 0.14, wave: 0.22, vis: 28, map: [0.16, 0.46, 0.66] },
  { key: 'creek', murk: 0.04, wave: 0.14, vis: 32, map: [0.26, 0.56, 0.72] },
];
const LAKE_NAMES = ['Heron', 'Mirror', 'Stillwater', 'Osprey', 'Cedar', 'Loon', 'Tamarack', 'Silver', 'Moonglass', 'Alder', 'Kestrel', 'Whisper', 'Raven', 'Otter', 'Greywater', 'Larkspur'];
const POND_NAMES = ['Willow', 'Frog', 'Lily', 'Mossy', 'Duck', 'Cattail', 'Tadpole', 'Fern', 'Reed', 'Newt', 'Dragonfly', 'Minnow'];
const RIVER_NAMES = ['Amble', 'Wend', 'Coldrun', 'Brannock', 'Ashwater', 'Tumble', 'Elver', 'Thistle', 'Marrow', 'Sedge'];
const CREEK_NAMES = ['Pebble', 'Trout', 'Fox', 'Spring', 'Hollow', 'Mill', 'Cress', 'Bramble', 'Clearrun', 'Wren', 'Birch', 'Stony', 'Otter', 'Mossy', 'Cold', 'Larch'];
const pick = (arr, h) => arr[Math.floor(h * arr.length) % arr.length];

// Carve a channel/basin: bowl-shaped bed inside w, banks rising at `slope` beyond it and rejoining the land,
// plus a low lip just past the shore so the surface S is always contained (lipK scales the lip: 0 where another
// water passes through).
function carveBasin(h, dist, w, S, D, slope, lipK = 1) {
  if (dist < w) { const u = dist / w; return Math.min(h, S - D * (1 - u * u)); }
  const b = dist - w;
  let t = Math.min(h, S + b * slope + Math.max(0, b - 9) ** 2 * 0.18);
  const lip = sstep(0, 1.2, b) * (1 - sstep(6.5, 16, b)) * lipK; // wide enough that bank cells next to the water stay above it, fading out gently on the downhill side
  return lip > 0 ? Math.max(t, S + 0.3 * lip) : t;
}

// ---- terrain before water: a main island of overlapping warped blobs, a few islets around it, one long valley ----
// The layout is drawn once per seed: blobs (ellipses) that make the land, and the bearing of a valley that crosses
// the main island so its drainage gathers into a couple of long rivers instead of running straight off a dome.
const LAYOUT = (() => {
  const R = CONFIG.islandSize / 2, rng = mulberry32((SEED ^ 0x15a4d) >>> 0), blobs = [];
  const add = (cx, cy, rx, ry, a, hgt) => blobs.push({ cx, cy, rx, ry, ca: Math.cos(a), sa: Math.sin(a), hgt });
  // two kinds of island, the seed decides: a low shield coast (an oval core with long thin arms reaching out of it,
  // broken slivers of islet carrying an arm's line on past its tip) or an arctic one (two big lumpy masses side by
  // side with large lakes inside, ragged bays and a scatter of islets round them)
  const grain = rng() * 3.1416, twin = rng() < 0.5, arms = [];
  let rough = 1, lakeK = 1.3, riverK = 1;   // lakeK scales the dug lakes (a small core would otherwise get ponds)
  if (twin) {
    rough = 1.6; lakeK = 1.9; riverK = 0.5;   // smaller masses: a stream counts as a river at half the catchment
    add(Math.cos(grain) * 0.42 * R, Math.sin(grain) * 0.42 * R, (0.5 + 0.1 * rng()) * R, (0.36 + 0.1 * rng()) * R, grain + (rng() - 0.5) * 0.6, 1);
    add(-Math.cos(grain) * 0.5 * R, -Math.sin(grain) * 0.5 * R, (0.4 + 0.1 * rng()) * R, (0.3 + 0.1 * rng()) * R, grain + (rng() - 0.5) * 0.8, 0.8);
    for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) { const a = rng() * 6.2832, len = (0.2 + 0.2 * rng()) * R, d = 0.75 * R + len * 0.5;   // a stubby arm or two
      add(Math.cos(a) * d, Math.sin(a) * d, len, (0.08 + 0.08 * rng()) * R, a + (rng() - 0.5) * 0.6, 0.4); }
    for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) { const a = rng() * 6.2832, d = (1.05 + 0.3 * rng()) * R, r = (0.08 + 0.14 * rng()) * R;   // 3-5 islets, roundish
      add(Math.cos(a) * d, Math.sin(a) * d, r, r * (0.5 + 0.4 * rng()), rng() * 3.1416, 0.3 + 0.3 * rng()); }
  } else {
    add(0, 0, (0.6 + 0.1 * rng()) * R, (0.42 + 0.1 * rng()) * R, grain, 1);   // the core: one dome, so its drainage gathers
    const na = 2 + Math.floor(rng() * 3), a0 = rng() * 6.2832;   // 2-4 arms: the first two along the grain, either way, the rest wherever
    for (let k = 0; k < na; k++) {
      const a = k < 2 ? grain + k * 3.1416 + (rng() - 0.5) * 0.7 : a0 + (k + 0.5 * rng()) / na * 6.2832, len = (0.35 + 0.4 * rng()) * R, w = (0.05 + 0.06 * rng()) * R, d = 0.42 * R + len * 0.8;
      add(Math.cos(a) * d, Math.sin(a) * d, len, w, a + (rng() - 0.5) * 0.5, 0.4); arms.push([a, d + len]);
      if (rng() < 0.5) { const t = d + len * 0.85, r = w * (1.4 + 0.8 * rng()); add(Math.cos(a) * t, Math.sin(a) * t, r, r * 0.8, rng() * 3.1416, 0.4); }   // a knob at the tip
    }
    for (const [a, tip] of arms) if (rng() < 0.6) { const gap = (0.08 + 0.12 * rng()) * R, len = (0.12 + 0.2 * rng()) * R, t = tip + gap + len;   // the arm's line carries on as a sliver past a gap
      if (t + len < 1.45 * R) add(Math.cos(a) * t, Math.sin(a) * t, len, len * (0.2 + 0.2 * rng()), a + (rng() - 0.5) * 0.4, 0.3); }
    for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) { const a = rng() * 6.2832, d = (1.0 + 0.3 * rng()) * R, r = (0.1 + 0.12 * rng()) * R;   // 1-2 stray slivers, along the grain
      add(Math.cos(a) * d, Math.sin(a) * d, r, r * (0.25 + 0.2 * rng()), grain + (rng() - 0.5) * 0.5, 0.3 + 0.2 * rng()); }
  }
  const va = grain + (rng() - 0.5) * 0.9, vx = Math.cos(va), vy = Math.sin(va), b0 = blobs[0], voff = -b0.cx * vy + b0.cy * vx + (rng() - 0.5) * 0.2 * R;
  // the valley crosses the main mass the long way (through its middle, a little off); the peak stands on the
  // valley line towards one end of the mass, so the river rises on it and runs the valley to the far coast
  const pk = (rng() < 0.5 ? -1 : 1) * (0.22 + 0.1 * rng()) * R, pc = b0.cx * vx + b0.cy * vy;   // along the valley, from the mass's middle
  return { blobs, twin, rough, lakeK, riverK, vx, vy, voff, vw: (twin ? 400 : 700) + 400 * rng(), side: rng() < 0.5 ? -1 : 1,
    px: -vy * voff + vx * (pc + pk), py: vx * voff + vy * (pc + pk), pr: (0.26 + 0.08 * rng()) * R,
    ps: pc + pk, pdir: pk < 0 ? 1 : -1, plen: Math.abs(pk) + b0.rx * 0.95 };   // the trough: from the summit, down the valley towards the far coast (that far)
})();
function islandBase(x, y) {
  const R = CONFIG.islandSize / 2, L = LAYOUT;
  const m = 150 * L.rough, wx = x + 320 * nE(x / 1300 + 9.3, y / 1300 - 2.7) + m * nE(x / 330 - 4.1, y / 330 + 6.6), wy = y + 320 * nE(x / 1300 - 5.9, y / 1300 + 7.4) + m * nE(x / 330 + 2.8, y / 330 - 8.2);   // warped space: bays and headlands
  let land = 0, dome = 0;   // land: inside any blob (fading at its edge); dome: how far inside, scaled by the blob's height
  for (const b of L.blobs) {
    const dx = wx - b.cx, dy = wy - b.cy, u = (dx * b.ca + dy * b.sa) / b.rx, v = (dy * b.ca - dx * b.sa) / b.ry, d = Math.hypot(u, v);
    land = Math.max(land, 1 - sstep(0.84, 1.05, d)); dome = Math.max(dome, clamp(1 - d, 0, 1) * b.hgt);
  }
  const across = -x * L.vy + y * L.vx - L.voff;   // the valley crosses the main island on the layout's bearing, a little off centre
  const pd = Math.hypot(x - L.px, y - L.py) / L.pr, peak = Math.pow(clamp(1 - pd, 0, 1), 1.4) * (0.75 + 0.25 * (1 - Math.abs(nR(x / 400 + 7.1, y / 400 + 1.3))));   // the island's summit, a little craggy
  const valley = (1 - sstep(0, L.vw, Math.abs(across))) * (1 - peak), sideM = sstep(300, 1300, across * L.side);   // mountains keep to one side of it
  const ridge = 1 - Math.abs(nR(x / 1000 + 2.2, y / 1000 - 5.1)), mt = ridge * ridge * sideM * dome;
  let e = 0.2 + 0.17 * land + 0.24 * land * dome * (1 - 0.6 * valley) + 0.06 * fbm(nE, x / 800, y / 800, 5) * land + 0.035 * fbm(nE, x / 230 + 5.5, y / 230 - 2.5, 3) * land + 0.2 * mt * land + 0.34 * peak * land - (1 - land) * 0.12;
  // the river's trough: a floor that only ever drops from the summit's foot to the far coast, banks rising either side,
  // cut into whatever the land was (so its water gathers into one river instead of running off every which way)
  const s = ((x * L.vx + y * L.vy) - L.ps) * L.pdir;
  if (s > 0 && land > 0.3) { const t = Math.min(1, s / L.plen), floor = 0.37 + 0.3 * Math.pow(1 - t, 1.3) + Math.pow(Math.abs(across), 1.25) * 0.00012 + 0.012 * nE(x / 250, y / 250); if (floor < e) e -= (e - floor) * 0.8 * sstep(0.3, 0.8, land); }   // most of the way down to the floor: the hills still show through
  const hl = hW(clamp(e, 0, 1));
  // the sea floor: past the first stretch of shore the depth follows the climate's real-world profile (seaDepth)
  // against the distance from the coast, measured out along each blob's radius (0.92 of it is about the waterline)
  let off = 1e9;
  for (const b of L.blobs) { const dx = wx - b.cx, dy = wy - b.cy, u = (dx * b.ca + dy * b.sa) / b.rx, v = (dy * b.ca - dx * b.sa) / b.ry, d = Math.hypot(u, v);
    off = Math.min(off, Math.hypot(dx, dy) * (1 - 0.92 / Math.max(d, 1e-3))); }
  if (off <= 20) return hl;
  return hl + (WLW - seaDepth(x, y, off) - hl) * sstep(20, 140, off);
}
// Depth (m) of the open sea `off` metres from the coast. The coast's distance is one influence: it sets the broad profile by
// climate (temperate: a shelf to ~130 m, then the continental slope past 1,500 m; arctic: a broad shallow shelf; tropical: a
// reef flat, a wall, a fore-reef terrace, then the deep). On top of that the floor has its own shape that doesn't follow the
// coastline: the shelf edge wanders in and out and is sometimes a cliff, sometimes a long ramp; broad swells and hollows;
// offshore sandbars; rocky banks and ridges running with the island's grain; channels cut across the shelf; the odd sharp
// drop-off step; canyons down the slope. These are what make one stretch of sea a different place to fish from the next.
function seaDepth(x, y, off) {
  const L = LAYOUT, gx = L.vx, gy = L.vy, u = x * gx + y * gy, v = -x * gy + y * gx;   // along / across the island's grain
  const n1 = fbm(nE, x / 1400 + 31, y / 1400 - 17, 4);                                  // broad relief: shelf width, general depth
  const n2 = fbm(nM, x / 600 - 23, y / 600 + 11, 3);                                    // medium relief, independent of the coast
  const ridge = 1 - Math.abs(nR(u / 1600 - 13, v / 380 + 29));                         // long banks and ridges along the grain
  const chan = Math.pow(Math.max(0, 1 - Math.abs(nM(u / 2200 + 41, v / 520 - 7)) * 5), 2);   // narrow channels across the shelf
  const canyon = Math.pow(Math.max(0, 1 - Math.abs(nM(x / 900 + 41, y / 900 - 7)) * 4), 2);  // submarine canyons on the slope
  const widthK = 0.55 + 0.9 * (0.5 + 0.5 * n1);                                         // the shelf edge: pinched here, far out there
  const steep = sstep(0.15, 0.45, nE(x / 2600 - 57, y / 2600 + 19));                    // the slope beyond it: 0 a long ramp, 1 a drop-off
  let d;
  if (CLIMATE.reefsEverywhere) {
    const flat = (260 + 200 * n1) * widthK, wallW = 30 + 120 * (1 - steep), terrace = 500 + 900 * (1 - steep);
    d = off < flat ? 1.2 + 2.5 * sstep(0, flat, off) + 1.5 * ridge * sstep(0.4 * flat, flat, off) + 2 * Math.max(0, n2) * sstep(0.3 * flat, flat, off)   // the reef flat: patch reefs and sand channels
      : 4 + 26 * sstep(flat, flat + wallW, off) + 50 * sstep(flat + wallW, flat + terrace, off) + 1300 * sstep(flat + terrace, flat + terrace + 2300, off);   // wall, fore-reef terrace, then the deep
  } else if (CLIMATE.key === 'arctic') {
    const brk = (4000 + 1500 * n1) * widthK, slopeW = 800 + 2700 * (1 - steep);
    d = 2 + 56 * Math.pow(Math.min(off, brk) / brk, 0.9) + 650 * sstep(brk, brk + slopeW, off);
  } else {
    const brk = (2500 + 900 * n1) * widthK, slopeW = 250 + 2250 * (1 - steep);
    d = 3 + 125 * Math.pow(Math.min(off, brk) / brk, 1.15) + 1500 * sstep(brk, brk + slopeW, off);
  }
  d *= 1 + 0.35 * n2 + 0.15 * n1;   // swells and hollows in the floor that owe nothing to the coast (about a third either way)
  if (!CLIMATE.reefsEverywhere) {   // offshore sandbars: a shoal a few hundred metres out, roughly parallel to the shore, on some coasts
    const barAt = 180 + 320 * (0.5 + 0.5 * nE(x / 900 + 71, y / 900 - 43)), barW = 45 + 40 * (0.5 + 0.5 * n2), bars = sstep(0.05, 0.45, nE(x / 1500 - 83, y / 1500 + 67));
    d -= 0.7 * d * bars * Math.exp(-(((off - barAt) / barW) ** 2));   // the bar rises to about a third of the depth around it
  }
  const shelf = 1 - sstep(80, 250, d);   // 1 on the shelf, fading out down the slope
  d -= 8 * ridge * ridge * shelf * sstep(6, 25, d);                                      // rocky banks: the structure fish hold on
  d += (10 + 25 * sstep(20, 80, d)) * chan * shelf * sstep(8, 30, d);                     // channels: deeper water cutting across the shelf
  d += 20 * sstep(0.42, 0.48, nE(x / 1100 + 17, y / 1100 - 61)) * shelf * sstep(10, 40, d);   // a sharp drop-off step along a line here and there
  d += 400 * canyon * sstep(100, 400, d);                                                 // canyons cut into the slope
  return Math.max(1, d);
}

// Permanent ice is spatial terrain, independent of seasonal snow. The summit cap
// feeds the forward gullies; a separate tongue descends the back slope to the coast.
const GLACIERS = (() => {
  if (CLIMATE.key !== 'arctic') return null;
  const L = LAYOUT, ux = -L.vx * L.pdir, uy = -L.vy * L.pdir;
  let length = L.pr;
  for (let d = L.pr * 0.3; d < CONFIG.islandSize; d += 24) {
    length = d;
    if (islandBase(L.px + ux * d, L.py + uy * d) < WLW) break;
  }
  return { ux, uy, length };
})();
function glacierAt(x, y) {
  if (!GLACIERS || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const L = LAYOUT, G = GLACIERS, dx = x - L.px, dy = y - L.py;
  const along = dx * G.ux + dy * G.uy, across = -dx * G.uy + dy * G.ux;
  const edge = nR(x / 110, y / 110) * 0.08;
  const cap = 1 - sstep(0.23, 0.39, Math.hypot(dx, dy) / L.pr + edge);
  const width = L.pr * (0.14 + 0.08 * clamp(along / G.length, 0, 1));
  const tongue = sstep(-L.pr * 0.1, L.pr * 0.2, along) * (1 - sstep(G.length - 24, G.length + 24, along)) *
    (1 - sstep(0.65, 1, Math.abs(across + 35 * Math.sin(along / 250)) / width + edge));
  return Math.max(cap, tongue);
}

let ISL = null;
function buildIsland(diagnostics = false) {
  const t0 = performance.now(), C = 12, half = Math.ceil(CONFIG.islandSize * 0.75 / C) * C, N = Math.round(half * 2 / C) + 1, NN = N * N, ox = -half, oy = -half;
  const H = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ox + i * C, y = oy + j * C, base = islandBase(x, y);
    H[j * N + i] = base + glacierAt(x, y) * (base > WLW - 2 ? 6 : 0);
  }
  const D8 = [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1];
  // priority flood from the map edge (the open sea): fills every basin to its spill point and records, for each
  // cell, the cell it drains into. Then flow accumulation in reverse order: how much land drains through each cell.
  const drain = () => {
    const F = new Float32Array(NN), rec = new Int32Array(NN).fill(-1), order = new Int32Array(NN), done = new Uint8Array(NN), heap = new Int32Array(NN);
    let hn = 0, n = 0;
    const push = c => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (F[heap[p]] <= F[c]) break; heap[k] = heap[p]; k = p; } heap[k] = c; };
    const pop = () => { const top = heap[0], last = heap[--hn]; let k = 0; for (;;) { let l = 2 * k + 1; if (l >= hn) break; if (l + 1 < hn && F[heap[l + 1]] < F[heap[l]]) l++; if (F[heap[l]] >= F[last]) break; heap[k] = heap[l]; k = l; } if (hn) heap[k] = last; return top; };
    for (let i = 0; i < N; i++) for (const c of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!done[c]) { done[c] = 1; F[c] = H[c]; push(c); }
    while (hn) {
      const c = pop(), ci = c % N; order[n++] = c;
      for (const d of D8) { const m = c + d; if (m < 0 || m >= NN || done[m] || Math.abs(m % N - ci) > 1) continue; done[m] = 1; F[m] = Math.max(H[m], F[c] + 1e-4); rec[m] = c; push(m); }
    }
    // Flooding establishes spill elevations; route actual runoff down the steepest
    // slope, rather than along whichever neighbour the heap happened to visit first.
    for (let c = 0; c < NN; c++) {
      const ci = c % N; let slope = 0;
      for (let k = 0; k < D8.length; k++) {
        const m = c + D8[k];
        if (m < 0 || m >= NN || Math.abs(m % N - ci) > 1) continue;
        const drop = (F[c] - F[m]) / (k < 4 ? 1 : Math.SQRT2);
        if (drop > slope) { slope = drop; rec[c] = m; }
      }
    }
    const acc = new Float32Array(NN);
    for (let c = 0; c < NN; c++) acc[c] = H[c] > WLW ? 1 : 0;
    for (let k = n - 1; k > 0; k--) { const c = order[k]; if (rec[c] >= 0) acc[rec[c]] += acc[c]; }
    return { F, rec, acc };
  };
  const cellKm2 = C * C / 1e6, Ac = CONFIG.creekAreaKm2 / cellKm2, Ar = CONFIG.riverAreaKm2 * LAYOUT.riverK / cellKm2, rng = mulberry32((SEED ^ 0x1a4e5) >>> 0);
  // Choose springs in a real summit catchment. Their routes already follow the
  // terrain and merge downstream; never draw straight cuts towards invented joins.
  const L = LAYOUT;
  let R = drain(), summit = 0;
  for (let c = 0; c < NN; c++) if (H[c] > H[summit]) summit = c;
  const px = ox + summit % N * C, py = oy + Math.floor(summit / N) * C;
  const headwaterCount = 3 + Math.floor(rng() * 4);
  const headwaters = drainage => {
    const groups = new Map(), { rec, F } = drainage;
    const radius = Math.ceil(L.pr * 0.8 / C), sx = summit % N, sy = Math.floor(summit / N);
    for (let y = Math.max(1, sy - radius); y < Math.min(N - 1, sy + radius); y += 4) {
      for (let x = Math.max(1, sx - radius); x < Math.min(N - 1, sx + radius); x += 4) {
        const c = y * N + x, d = Math.hypot(x - sx, y - sy) * C;
        if (d < L.pr * 0.14 || d > L.pr * 0.8 || H[c] < WLW + (H[summit] - WLW) * 0.38 || F[c] - H[c] > 0.3) continue;
        const path = []; let m = c;
        while (m >= 0 && F[m] > WLW + 0.05) { path.push(m); m = rec[m]; }
        if (path.length < 20) continue;
        const outlet = path[path.length - 1];
        if (!groups.has(outlet)) groups.set(outlet, []);
        groups.get(outlet).push({ c, path, score: H[c] + 5 * hash2(x, y, SEED + 831) });
      }
    }
    let best = [], bestScore = -Infinity;
    for (const candidates of groups.values()) {
      candidates.sort((a, b) => b.score - a.score);
      const chosen = [], occupied = new Set();
      for (const candidate of candidates) {
        if (chosen.length >= headwaterCount) break;
        if (chosen.some(p => Math.hypot(p.c % N - candidate.c % N, Math.floor(p.c / N) - Math.floor(candidate.c / N)) * C < 130)) continue;
        // Leave a meaningful independent reach before each tributary joins.
        const join = candidate.path.findIndex(c => occupied.has(c));
        if (join >= 0 && join * C < 120 || chosen.some(p => candidate.path.includes(p.c))) continue;
        chosen.push(candidate); for (const c of candidate.path) occupied.add(c);
      }
      const score = (chosen.length >= 3 ? 1000 : 0) + (chosen[0]?.score ?? 0) + chosen.length * 4;
      if (score > bestScore) { best = chosen; bestScore = score; }
    }
    return best;
  };
  const initialHeads = headwaters(R);
  // Spread lake basins across inland lowlands, including hollows off the main river.
  const cand = [];
  for (let c = 0; c < NN; c++) if (H[c] > WLW + 8 && H[c] < hW(0.62) && R.acc[c] < Ar * 2) {
    const x = c % N, y = (c / N) | 0, reach = Math.ceil(300 * LAYOUT.lakeK / C);
    if (x < reach || y < reach || x >= N - reach || y >= N - reach) continue;
    // A lake needs a broad, gentle site, not a dam cut across a steep hillside.
    let lo = H[c], hi = H[c];
    for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
      const h = H[c + dy * N + dx]; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (lo > WLW + 3 && hi - lo < 14 && Math.hypot(ox + x * C - px, oy + y * C - py) > L.pr * 1.3) cand.push(c);
  }
  for (let k = cand.length - 1; k > 0; k--) { const j = rng() * (k + 1) | 0; [cand[k], cand[j]] = [cand[j], cand[k]]; }
  const glacialSites = CLIMATE.key === 'arctic' ? initialHeads.filter((_, i) => i === 0 || i === initialHeads.length - 1).map(({ path }) => path[Math.min(path.length - 1, Math.floor(L.pr * 0.3 / C))]) : [];
  const sites = [];
  for (const c of [...glacialSites, ...cand]) {
    if (sites.length >= CONFIG.lakes) break;
    const glacial = glacialSites.includes(c);
    const x = c % N, y = (c / N) | 0; if (sites.some(s => Math.hypot(s[0] - x, s[1] - y) * C < (glacial ? 240 : 950))) continue;
    sites.push([x, y]);
    const r = (glacial ? 85 + 25 * rng() : (55 + 95 * rng()) * LAYOUT.lakeK) / C, depth = 5 + 5 * rng(), hc = H[c], reach = Math.ceil(r * 1.5);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const m = yy * N + xx, d = Math.hypot(dx, dy) * (1 + 0.3 * nW(xx * 1.6 / r + c % 977, yy * 1.6 / r));   // irregular shore: a few lobes, whatever the size
      H[m] += (hc - H[m]) * sstep(r * 1.45, r * 0.6, d);              // a level valley floor (with a natural dam downstream)
      const u = Math.max(0, 1 - (d / r) ** 2); H[m] -= depth * u * u;   // and the bowl
    }
  }
  R = drain();
  const { F, rec, acc } = R;
  const heads = headwaters(R), sources = heads.map(h => h.c);
  // Perennial springs (meltwater on arctic maps) need no large catchment at the summit.
  for (const source of sources) for (let c = source; c >= 0 && F[c] > WLW; c = rec[c]) acc[c] += Ac;

  // lakes and ponds: every basin the flood filled, if big and deep enough; beds are deepened a little
  const lakeId = new Int16Array(NN).fill(-1), lakes = [], seen = new Uint8Array(NN);
  for (let c0 = 0; c0 < NN; c0++) {
    if (seen[c0] || F[c0] - H[c0] < 0.35 || F[c0] < WLW + 0.3) continue;
    const comp = [c0]; seen[c0] = 1;
    for (let q = 0; q < comp.length; q++) { const c = comp[q], ci = c % N; for (const d of [-1, 1, -N, N]) { const m = c + d; if (m < 0 || m >= NN || seen[m] || Math.abs(m % N - ci) > 1 || F[m] - H[m] < 0.35 || Math.abs(F[m] - F[c0]) > 0.08) continue; seen[m] = 1; comp.push(m); } }
    let lev = 0, maxD = 0, sx = 0, sy = 0; for (const c of comp) { lev = Math.max(lev, F[c]); maxD = Math.max(maxD, F[c] - H[c]); sx += c % N; sy += (c / N) | 0; }
    if (comp.length < 5 || maxD < 0.8) continue;
    // big accidental basins (not dug as lakes) silt up instead: a flat valley floor the river runs across
    if (comp.length * C * C > CONFIG.maxNaturalLakeM2 && !comp.some(c => sites.some(s => Math.abs(s[0] - c % N) + Math.abs(s[1] - ((c / N) | 0)) < 3))) { for (const c of comp) H[c] = F[c] - 0.05; continue; }
    const id = lakes.length, pond = comp.length * C * C < CONFIG.pondMaxM2, hh = hash2(id, comp.length, SEED + 41);
    const glacial = CLIMATE.key === 'arctic' && comp.some(c => glacialSites.includes(c));
    const L = { glacial, id: 'lake' + id, idx: id, kind: pond ? POND : LAKE, pond, lev, area: comp.length * C * C, cx: ox + sx / comp.length * C, cy: oy + sy / comp.length * C,
      name: pond ? pick(POND_NAMES, hh) + ' Pond' : hh < 0.5 ? 'Lake ' + pick(LAKE_NAMES, hash2(id, 7, SEED)) : pick(LAKE_NAMES, hash2(id, 7, SEED)) + ' Lake' };
    if (glacial) L.name = pick(LAKE_NAMES, hh) + ' Glacier Lake';
    lakes.push(L);
    for (const c of comp) { lakeId[c] = id; H[c] = lev - clamp((lev - H[c]) * (pond ? 1.2 : 1.45), 0.6, pond ? 3 : 12); }   // deepen beds a little, to at most 12 m (ponds 3 m)
  }
  const lakeNear = new Int16Array(NN).fill(-1);   // lakes grown by one cell: the whole shore belongs to the lake
  for (let c = 0; c < NN; c++) if (lakeId[c] >= 0) { const ci = c % N; lakeNear[c] = lakeId[c]; for (const d of D8) { const m = c + d; if (m >= 0 && m < NN && Math.abs(m % N - ci) <= 1 && lakeNear[m] < 0) lakeNear[m] = lakeId[c]; } }
  // channels: wherever enough land drains through a cell (outside lakes and the sea)
  const chan = new Uint8Array(NN), isSea = c => F[c] < WLW + 0.05;
  // hollows that didn't become lakes silt up to just above their flood level: otherwise water standing a few centimetres
  // deep outside a lake's one-cell shore ring has no level of its own, and the lake's surface stops at a hard grid edge
  for (let c = 0; c < NN; c++) if (lakeId[c] < 0 && !isSea(c) && H[c] < F[c] + 0.05) H[c] = F[c] + 0.05;
  const floor = new Float32Array(NN); for (let c = 0; c < NN; c++) floor[c] = lakeId[c] >= 0 || isSea(c) ? H[c] : F[c] + 0.05;   // and the fine bumps may not dig below it either (landH)
  for (let c = 0; c < NN; c++) if (acc[c] >= Ac && lakeId[c] < 0 && !isSea(c) && CONFIG.creeks || (acc[c] >= Ar && lakeId[c] < 0 && !isSea(c) && CONFIG.rivers)) chan[c] = 1;
  const nDon = new Int32Array(NN + 1);
  for (let c = 0; c < NN; c++) if (rec[c] >= 0 && (chan[c] || lakeId[c] >= 0)) nDon[rec[c] + 1]++;
  for (let c = 0; c < NN; c++) nDon[c + 1] += nDon[c];
  const don = new Int32Array(nDon[NN]), fill = nDon.slice(0, NN);
  for (let c = 0; c < NN; c++) if (rec[c] >= 0 && (chan[c] || lakeId[c] >= 0)) don[fill[rec[c]]++] = c;
  // chains: from each outlet walk upstream along the biggest branch (the main stem); side branches become their own
  // chains that end where they join. Each chain is a list of cells, head first.
  const chains = [], work = [];
  // every cell's biggest upstream neighbour, for running a creek's head back up to its spring
  const upBest = new Int32Array(NN).fill(-1);
  for (let c = 0; c < NN; c++) { const r = rec[c]; if (r >= 0 && (upBest[r] < 0 || acc[c] > acc[upBest[r]])) upBest[r] = c; }
  const springWet = [];
  for (let c = 0; c < NN; c++) if (chan[c] && (rec[c] < 0 || !chan[rec[c]])) work.push({ c, end: rec[c], parent: -1, sys: c });
  while (work.length) {
    const wk = work.pop(), cells = [wk.c], id = chains.length; let cur = wk.c, src = -1;
    for (;;) {
      let best = -1, ba = -1;
      for (let k = nDon[cur]; k < nDon[cur + 1]; k++) { const m = don[k]; if (chan[m] && acc[m] > ba) { ba = acc[m]; best = m; } else if (!chan[m] && lakeId[m] >= 0) src = m; }
      for (let k = nDon[cur]; k < nDon[cur + 1]; k++) { const m = don[k]; if (chan[m] && m !== best) work.push({ c: m, end: cur, parent: id, sys: wk.sys }); }
      if (best < 0) break; cells.push(best); cur = best; src = -1;
    }
    // a creek doesn't start full-size: follow the head up its gully, narrowing, to a spring (lake outlets excepted)
    let ext = 0;
    if (src < 0) for (let m = upBest[cur]; m >= 0 && ext < 14 && acc[m] >= Ac * 0.15 && lakeId[m] < 0 && !chan[m]; m = upBest[m]) { cells.push(m); springWet.push(m); ext++; }
    cells.reverse(); if (src >= 0) cells.unshift(src); if (wk.end >= 0) cells.push(wk.end);   // starts in a lake (outlet) or a spring, ends at a junction, lake or the sea
    chains.push({ id, cells, parent: wk.parent, sys: wk.sys, ext });
  }
  // chain geometry: smoothed polylines carrying water level (never rising downstream), half-width and depth
  const seg = [], segK = [], segC = [], segR = [], chainName = [], sysRiver = new Set(), cellLev = new Float32Array(NN).fill(NaN), springs = [];
  const junctions = new Set(chains.filter(ch => ch.parent >= 0).map(ch => ch.cells[ch.cells.length - 1]));
  for (const ch of chains) if (ch.cells.some(c => acc[c] >= Ar)) sysRiver.add(ch.sys);
  for (const ch of chains) {
    let P = ch.cells.map(c => {
      const km2 = acc[c] * cellKm2, inLake = lakeId[c] >= 0, sea = isSea(c);
      const rk = sstep(Ar, Ar * 2.5, acc[c]), cw = clamp(1.2 + 3.8 * Math.sqrt(km2), 1.2, 15), rw = clamp(5 + 6 * Math.sqrt(km2), 5, 24);   // half-widths: a creek's, a river's (a kayak needs room)
      return [ox + (c % N) * C, oy + ((c / N) | 0) * C, inLake ? lakes[lakeId[c]].lev : sea ? WLW : F[c] - 0.35, cw + (rw - cw) * rk, acc[c] >= Ar ? Math.min(4.5, 2 + 1.3 * Math.sqrt(km2)) : 0.45 + 0.6 * Math.sqrt(km2), acc[c] >= Ar ? 1 : 0];
    });
    // the spring end: a small seep pool, then a trickle widening to where the creek proper begins
    const ext = ch.ext || (sources.includes(ch.cells[0]) ? Math.min(8, P.length - 1) : 0), hd = P[ext] || P[0];
    for (let i = 0; i < ext; i++) { const t = (i + 1) / (ext + 1); P[i][2] = F[ch.cells[i]] - 0.08 - 0.27 * t; P[i][3] = 0.7 + (hd[3] - 0.7) * t * t; P[i][4] = 0.16 + (hd[4] - 0.16) * t; P[i][5] = 0; }
    if (ext) { P[0][3] = 2.6; P[0][4] = 0.95; P[1][3] = Math.max(P[1][3], 2.1); P[1][4] = Math.max(P[1][4], 0.7); }
    const last = ch.cells[ch.cells.length - 1]; if (!isNaN(cellLev[last]) && lakeId[last] < 0) P[P.length - 1][2] = cellLev[last];   // meet the (stepped) parent stream at its own level
    for (let i = 1; i < P.length; i++) { P[i][2] = Math.max(WLW, Math.min(P[i][2], P[i - 1][2])); if (lakeId[ch.cells[i]] >= 0 || isSea(ch.cells[i])) { P[i][3] = P[i - 1][3]; P[i][4] = P[i - 1][4]; P[i][5] = P[i - 1][5]; } }
    // pools and riffles: on a falling stretch the surface holds level through a pool, then drops all at once in a
    // short rapid (levels only ever go down, so the water stays inside its carved banks)
    { const n = P.length, i0 = lakeId[ch.cells[0]] >= 0 ? 1 : 0, i1 = n - 1;
      let a = i0;
      while (a < i1) {
        const Lc = clamp(P[a][3] * 16, 48, 130); let e = a, d = 0;
        while (e + 1 < i1 && d < Lc && P[a][2] - P[e + 1][2] < 2.2) { d += Math.hypot(P[e + 1][0] - P[e][0], P[e + 1][1] - P[e][1]); e++; }
        if (P[a][2] - P[e][2] > 0.3) for (let i = a; i <= e; i++) P[i][2] = P[e][2];
        a = e + 1;
      }
      for (let i = 0; i < n; i++) if (lakeId[ch.cells[i]] < 0 && !isSea(ch.cells[i])) cellLev[ch.cells[i]] = P[i][2];
    }
    const anchors = P.filter((p, i) => i === 0 || i === P.length - 1 || junctions.has(ch.cells[i]));
    const fixed = new Set(anchors);
    for (let it = 0; it < 3; it++) { // Preserve confluences as well as the ends.
      const Q = [P[0]];
      for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push(a.map((v, k) => v * 0.75 + b[k] * 0.25), a.map((v, k) => v * 0.25 + b[k] * 0.75));
        if (i + 1 < P.length - 1 && fixed.has(b)) Q.push(b); }
      Q.push(P[P.length - 1]); P = Q;
    }
    const smooth = P.map(p => p.slice());
    for (let i = 1; i < P.length - 1; i++) { // a meander, and a width that narrows and widens along the way (both in step with the stream's size)
      const a = smooth[i - 1], b = smooth[i + 1], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, w = P[i][3], o = nW(P[i][0] / (60 + w * 6), P[i][1] / (60 + w * 6)) * (C * 0.45 + w * 1.2);
      let taper = 1;
      for (const anchor of anchors) taper = Math.min(taper, sstep(0, 80, Math.hypot(smooth[i][0] - anchor[0], smooth[i][1] - anchor[1])));
      P[i][0] += -ty / l * o * taper; P[i][1] += tx / l * o * taper; P[i][3] = w * (0.85 + 0.45 * (nW(P[i][0] / (40 + w * 5) + 3.3, P[i][1] / (40 + w * 5) - 1.1) + 0.5));
    }
    // rapids: where the surface drops steeply; whitewater carries on a little way below the drop
    const raw = [], R = [];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; raw.push(sstep(0.06, 0.18, (a[2] - b[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3))); }
    for (let i = 0; i < raw.length; i++) { let m = 0; for (let j = Math.max(0, i - 7); j <= Math.min(raw.length - 1, i + 2); j++) m = Math.max(m, raw[j] * (j > i ? 0.7 : 1 - (i - j) * 0.07)); R.push(m); }
    for (let i = 1; i < P.length - 1; i++) P[i][4] *= 1 - 0.35 * Math.max(R[i - 1], R[i]);   // rapids run shallow over a rocky bed
    if (ext) { const dx = P[0][0] - P[1][0], dy = P[0][1] - P[1][1], l = Math.hypot(dx, dy) || 1; springs.push({ x: P[0][0], y: P[0][1], ux: dx / l, uy: dy / l, h: hash2(ch.id, 17, SEED), chain: ch.id }); }
    const river = P.some(p => p[5] > 0.5);
    chainName[ch.id] = river ? 'River ' + pick(RIVER_NAMES, hash2(ch.sys % 9973, (ch.sys / 9973) | 0, SEED + 5)) : pick(CREEK_NAMES, hash2(ch.id, 3, SEED + 6)) + ' Creek';
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; seg.push(a[0], a[1], b[0], b[1], a[2], b[2], a[3], b[3], a[4], b[4]); segK.push(b[5] > 0.5 ? RIVER : CREEK); segC.push(ch.id); segR.push(R[i]); }
  }
  const SEG = new Float32Array(seg), NS = segK.length, B = 48, buckets = new Map();
  for (let s = 0; s < NS; s++) {
    const o = s * 10, reach = Math.max(SEG[o + 6], SEG[o + 7]) + 46;
    for (let by = Math.floor((Math.min(SEG[o + 1], SEG[o + 3]) - reach) / B); by <= Math.floor((Math.max(SEG[o + 1], SEG[o + 3]) + reach) / B); by++)
      for (let bx = Math.floor((Math.min(SEG[o], SEG[o + 2]) - reach) / B); bx <= Math.floor((Math.max(SEG[o], SEG[o + 2]) + reach) / B); bx++) {
        const k = bx * 100003 + by; let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(s);
      }
  }
  // "wetness": 1 on water, fading over ~40 m — keeps small terrain bumps off the shores
  const wet = new Float32Array(NN);
  for (let c = 0; c < NN; c++) if (lakeId[c] >= 0 || chan[c]) wet[c] = 1;
  for (const c of springWet) wet[c] = 1;
  for (let pass = 0; pass < 4; pass++) for (let c = 0; c < NN; c++) { const ci = c % N; let m = wet[c]; for (const d of [-1, 1, -N, N]) { const q = c + d; if (q >= 0 && q < NN && Math.abs(q % N - ci) <= 1) m = Math.max(m, wet[q] * 0.65); } wet[c] = m; }
  ISL = { N, C, ox, oy, H, floor, lakeId, lakeNear, lakes, wet, SEG, segK: Uint8Array.from(segK), segC: Int32Array.from(segC), segR: Float32Array.from(segR), springs, chains, chainName, buckets, B, sources, summit,
    stats: { ms: Math.round(performance.now() - t0), lakes: lakes.filter(l => !l.pond).length, ponds: lakes.filter(l => l.pond).length, chains: chains.length,
      rivers: new Set(chains.filter((c, i) => chainName[i].startsWith('River')).map(c => c.sys)).size, creeks: chainName.filter(n => n.endsWith('Creek')).length, segments: NS, rapidsM: Math.round(segR.reduce((a, r, s) => a + (r > 0.4 ? Math.hypot(SEG[s * 10 + 2] - SEG[s * 10], SEG[s * 10 + 3] - SEG[s * 10 + 1]) : 0), 0)) } };
  if (diagnostics) ISL.drainage = { F, rec, acc, sites, sourcePaths: heads.map(h => h.path) };
  return ISL;
}
const bil = (A, x, y) => { const I = ISL, gx = (x - I.ox) / I.C, gy = (y - I.oy) / I.C, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, k = j * I.N + i;
  return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + I.N] * (1 - fx) + A[k + I.N + 1] * fx) * fy; };
const inGrid = (x, y) => { const I = ISL, gx = (x - I.ox) / I.C, gy = (y - I.oy) / I.C; return gx >= 0 && gy >= 0 && gx < I.N - 1 && gy < I.N - 1; };
// terrain before channels and ponds: the grid plus fine bumps kept off the shores
function landH(x, y) {
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
    const n = nearChannels(x, y);
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
        if (h0 > WLW + 0.2 && (lakeLev === null || (CH_S[k] > lakeLev + 0.05 && h0 > lakeLev))) { lev = Math.max(CH_S[k], WLW); kind = CH_K[k]; obj = null; }
      }
    }
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
// current at a point: [vx, vy, speed] in m/s — down the channel, faster where it drops
function flowAt(x, y, kind) {
  if (kind === LAKE) { const wa = ENV.windDir ?? 0.8, s = 0.02 + 0.06 * ENV.wind; return [Math.cos(wa) * s, Math.sin(wa) * s, s]; }   // gentle wind drift
  if (kind !== RIVER && kind !== CREEK) return [0, 0, 0];
  if (!ISL || !inGrid(x, y)) return [0, 0, 0];
  const n = nearChannels(x, y); let k = -1;
  for (let q = 0; q < n; q++) if (k < 0 || CH_D[q] / CH_W[q] < CH_D[k] / CH_W[k]) k = q;
  if (k < 0) return [0, 0, 0];
  const o = CH_I[k] * 10, S = ISL.SEG, dx = S[o + 2] - S[o], dy = S[o + 3] - S[o + 1], l = Math.hypot(dx, dy) || 1;
  const sp = (CH_K[k] === RIVER ? 0.5 : 0.7) + Math.min(1.5, Math.max(0, S[o + 4] - S[o + 5]) / l * 40) + 1.3 * ISL.segR[CH_I[k]];
  return [dx / l * sp, dy / l * sp, sp];
}
// what water is at a point (exact, not cached): name, kind, level, depth, murk, current
function waterInfo(x, y) {
  const h = hW(world(x, y)), kind = WK, lev = WLEV, obj = WOBJ, sg = WSEG, rapids = WRAP, depth = lev - h;
  const name = obj ? obj.name : (kind === RIVER || kind === CREEK) && sg >= 0 ? ISL.chainName[ISL.segC[sg]] : 'The Sea';
  const spring = kind === CREEK && ISL.springs.some(sp => Math.hypot(x - sp.x, y - sp.y) < 4.5);
  const f = depth > 0 ? flowAt(x, y, kind) : [0, 0, 0];
  const temp = waterTemp(kind, lev, 0.3, x, y);
  return { kind: WATER[kind].key, kindId: kind, name, level: lev, ground: h, depth, wet: depth > 0, murk: WATER[kind].murk, rapids: depth > 0 ? rapids : 0, spring, temp, iced: ENV.iced(kind, depth, x, y),
    oxygen: depth > 0 ? oxygen(kind, temp, Math.min(depth, 0.5), rapids) : 0, flow: { x: f[0], y: f[1], speed: f[2] }, id: obj ? obj.id : kind === OCEAN ? 'sea' : name };
}
// A dry spot on the bank of the nearest water of a kind (-1 = any), spiralling out from (x0, y0).
// Returns { x, y, a (heading that faces the water), wx, wy (the water point) } or null.
function findWater(kind, x0, y0, maxR = 4000) {
  for (let r = 0, s = 12; r < maxR; r += s, s = 12 + r * 0.012) {
    const n = Math.max(1, Math.ceil(6.2832 * r / s)), a0 = hash2(r | 0, 3, SEED) * 6.2832;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * 6.2832, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r, h = hW(world(x, y));
      if ((kind >= 0 && WK !== kind) || h > WLEV - (WK === CREEK ? 0.35 : 0.9)) continue;
      for (let d = 2; d <= 90; d += 2) for (let k = 0; k < 16; k++) {
        const b = k / 16 * 6.2832, sx = x + Math.cos(b) * d, sy = y + Math.sin(b) * d;
        if (hW(world(sx, sy)) > WLEV + 0.25) { const ax = x - sx, ay = y - sy, l = Math.hypot(ax, ay); return { x: sx - ax / l * 1.5, y: sy - ay / l * 1.5, a: Math.atan2(ay, ax), wx: x, wy: y }; }
      }
    }
  }
  return null;
}
// where a player stands at (x, y): on the ground, or floating with their head above deep water
function standZ(x, y) { sample(x, y); const g = hW(SE), fz = SW - CONFIG.eyeHeight + 0.28; return g < fz ? fz : g; }

// Materials: chars ordered dark -> bright
const DEEP = 0, SHALLOW = 1, SAND = 2, PLAIN = 3, FOREST = 4, ROCK = 5, ALPINE = 6, SNOW = 7, GLACIER = 8, BRIDGE = 9;
const MATS = [
  { ch: '.,~~', col: [0.05, 0.16, 0.45], map: '~' },
  { ch: '.~~=', col: [0.10, 0.42, 0.62], map: '~' },
  { ch: '.:;;', col: [0.86, 0.78, 0.50], map: '.' },
  { ch: '.,"i', col: [0.45, 0.70, 0.25], map: '"' },
  { ch: '.,;"', col: [0.16, 0.42, 0.16], map: 'T' },
  { ch: '.nM#', col: [0.52, 0.47, 0.42], map: 'n' },
  { ch: '.,;"', col: [0.26, 0.42, 0.32], map: '^' },
  { ch: '.-^A', col: [0.95, 0.95, 1.00], map: 'A' },
  { ch: ':=^A', col: [0.70, 0.86, 1.00], map: 'A' },
  { ch: '=##', col: [0.60, 0.38, 0.20], map: '#' },
];
if (CLIMATE.mats) for (const k in CLIMATE.mats) MATS[k].col = CLIMATE.mats[k];   // the climate recolours the land
function material(e, m, x, y) {
  if (e >= WL && glacierAt(x, y) > 0.3) return GLACIER;
  if (e < 0.2) return DEEP;
  if (e < WL) return SHALLOW;
  if (e < 0.6) return e < 0.32 ? SAND : m < 0.18 ? SAND : m < 0.52 ? PLAIN : FOREST;
  if (e < 0.85) return m < 0.5 ? ROCK : ALPINE;
  return m < 0.5 ? SNOW : GLACIER;
}

// ---- Procedural evaluation cache: lattice chunks around the player, bilinear sampled ----
// Per lattice point: elevation, moisture, water level, water kind
const SP = 2, CHK = 64, LS = 5, cache = new Map();   // per point: elevation, moisture, water level, kind, rapids
let lastKey = -1, lastChunk = null;
function evictFar(cx, cy) { // drop cached lattices far from (cx, cy) instead of clearing everything
  for (const k of cache.keys()) { const kx = Math.floor(k / 2e6) - 1e6, ky = k - (kx + 1e6) * 2e6 - 1e6; if (Math.max(Math.abs(kx - cx), Math.abs(ky - cy)) > 14) cache.delete(k); }
  if (cache.size > 900) cache.clear();
  lastKey = -1;
}
function fillPoint(c, k, x, y) { c[k] = world(x, y); c[k + 2] = WLEV; c[k + 3] = WK; c[k + 4] = WRAP; c[k + 1] = Math.min(1, moist(x, y) + (ISL && inGrid(x, y) ? 0.35 * bil(ISL.wet, x, y) : 0)); }   // wetter by the water
function* latticeGen(cx, cy) { // same as getChunk's fill, but yields every few rows
  const key = (cx + 1e6) * 2e6 + (cy + 1e6);
  if (cache.has(key)) return;
  const c = new Float32Array((CHK + 1) * (CHK + 1) * LS), x0 = cx * CHK * SP, y0 = cy * CHK * SP;
  for (let j = 0; j <= CHK; j++) {
    for (let i = 0; i <= CHK; i++) fillPoint(c, (j * (CHK + 1) + i) * LS, x0 + i * SP, y0 + j * SP);
    if (j % 4 === 3) { yield; if (cache.has(key)) return; }   // someone else (getChunk) finished it meanwhile
  }
  if (cache.size > 900) evictFar(cx, cy);
  if (!cache.has(key)) cache.set(key, c);
}
function getChunk(cx, cy) {
  const key = (cx + 1e6) * 2e6 + (cy + 1e6);
  if (key === lastKey) return lastChunk;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 900) evictFar(cx, cy);
    c = new Float32Array((CHK + 1) * (CHK + 1) * LS);
    const x0 = cx * CHK * SP, y0 = cy * CHK * SP;
    for (let j = 0; j <= CHK; j++) for (let i = 0; i <= CHK; i++) fillPoint(c, (j * (CHK + 1) + i) * LS, x0 + i * SP, y0 + j * SP);
    cache.set(key, c);
  }
  lastKey = key; lastChunk = c; return c;
}
let SE = 0, SM = 0, SW = WLW, SK = 0, SR = 0; // sample() outputs (no allocation): elevation, moisture, water level, water kind, rapids
function sample(x, y) {
  const gx = x / SP, gy = y / SP, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const cx = Math.floor(ix / CHK), cy = Math.floor(iy / CHK), lx = ix - cx * CHK, ly = iy - cy * CHK;
  const c = getChunk(cx, cy), k = (ly * (CHK + 1) + lx) * LS, k2 = k + (CHK + 1) * LS;
  let a = c[k] + (c[k + LS] - c[k]) * fx, b = c[k2] + (c[k2 + LS] - c[k2]) * fx; SE = a + (b - a) * fy;
  a = c[k + 1] + (c[k + LS + 1] - c[k + 1]) * fx; b = c[k2 + 1] + (c[k2 + LS + 1] - c[k2 + 1]) * fx; SM = a + (b - a) * fy;
  a = c[k + 2] + (c[k + LS + 2] - c[k + 2]) * fx; b = c[k2 + 2] + (c[k2 + LS + 2] - c[k2 + 2]) * fx; SW = a + (b - a) * fy;
  const kn = (fy < 0.5 ? k : k2) + (fx < 0.5 ? 0 : LS); SK = c[kn + 3]; SR = c[kn + 4];
}
function surfAt(x, y) { sample(x, y); const h = hW(SE); return h < SW ? SW : h; }   // ground, or the water surface over it
function groundAt(x, y) { sample(x, y); return hW(SE); }

