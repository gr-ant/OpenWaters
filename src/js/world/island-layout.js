'use strict';
// ================= The island and its water system =================
// One island continent in a real ocean. At load the terrain is laid out on a grid and water is routed downhill
// across it: basins fill to their spill points, flow accumulates from cell to cell, and wherever enough water
// gathers a creek forms. Creeks merge into rivers, rivers pass through lakes and run to the sea; small hollows hold
// ponds. At runtime world(x, y) samples that grid and carves the channels and basins at full detail.
// The stages live in world/island-*.js, loaded in this order: layout (this file: water kinds and names, carveBasin, the land
// layout and islandBase), sea-depth, glaciers, water (buildIsland), features (sea stacks, cenotes), sample (world(x, y)),
// water-queries, materials, cache (the lattice cache behind sample()).
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
  // outlying islands, out in the open sea beyond the main island's water grid (so they cost nothing at load: plain terrain, no rivers or lakes).
  // Drawn from their own random stream, after everything else, so the main island of a seed is exactly what it was without them.
  { const [n0, n1] = CONFIG.outerIslands || [0, 0], og = mulberry32((SEED ^ 0x0f7e2a) >>> 0), n = n0 + Math.floor(og() * (n1 - n0 + 1)), a0 = og() * 6.2832, grid = Math.ceil(CONFIG.islandSize * 0.75 / 12) * 12;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k + 0.15 + 0.7 * og()) / n * 6.2832, r = (0.085 + 0.13 * og()) * R, arm = og() < 0.65, ext = (arm ? 1.6 : 1) * r * 1.05 + 600;   // ext: as far as its shore can reach from its middle, warping included
      const lo = grid + ext + 100, hi = CONFIG.worldEdge - ext - 250, m = lo + Math.max(0, hi - lo) * og(), d = m / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d, tilt = og() * 3.1416, i0 = blobs.length;
      add(cx, cy, r, r * (0.55 + 0.35 * og()), tilt, 0.35 + 0.3 * og());
      if (arm) { const b = tilt + (og() - 0.5) * 1.2 + (og() < 0.5 ? 3.1416 : 0), len = r * (0.5 + 0.4 * og()); add(cx + Math.cos(b) * r * 0.7, cy + Math.sin(b) * r * 0.7, len, r * (0.2 + 0.2 * og()), b + (og() - 0.5) * 0.5, 0.3); }
      for (let i = i0; i < blobs.length; i++) blobs[i].out = true;
      if (hi < lo) blobs.length = i0;   // no room for it in this sea
    } }
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
  let land = 0, dome = 0, main = 0;   // main: land of the main island and its islets (the river's trough is cut only there); land: inside any blob (fading at its edge); dome: how far inside, scaled by the blob's height
  for (const b of L.blobs) {
    const dx = wx - b.cx, dy = wy - b.cy, u = (dx * b.ca + dy * b.sa) / b.rx, v = (dy * b.ca - dx * b.sa) / b.ry, d = Math.hypot(u, v);
    const ld = 1 - sstep(0.84, 1.05, d); if (ld > land) land = ld; if (!b.out && ld > main) main = ld; dome = Math.max(dome, clamp(1 - d, 0, 1) * b.hgt);
  }
  const across = -x * L.vy + y * L.vx - L.voff;   // the valley crosses the main island on the layout's bearing, a little off centre
  const pd = Math.hypot(x - L.px, y - L.py) / L.pr, peak = Math.pow(clamp(1 - pd, 0, 1), 1.4) * (0.75 + 0.25 * (1 - Math.abs(nR(x / 400 + 7.1, y / 400 + 1.3))));   // the island's summit, a little craggy
  const valley = (1 - sstep(0, L.vw, Math.abs(across))) * (1 - peak), sideM = sstep(300, 1300, across * L.side);   // mountains keep to one side of it
  const ridge = 1 - Math.abs(nR(x / 1000 + 2.2, y / 1000 - 5.1)), mt = ridge * ridge * sideM * dome;
  let e = 0.2 + 0.17 * land + 0.24 * land * dome * (1 - 0.6 * valley) + 0.06 * fbm(nE, x / 800, y / 800, 5) * land + 0.035 * fbm(nE, x / 230 + 5.5, y / 230 - 2.5, 3) * land + 0.2 * mt * land + 0.34 * peak * land - (1 - land) * 0.12;
  // the river's trough: a floor that only ever drops from the summit's foot to the far coast, banks rising either side,
  // cut into whatever the land was (so its water gathers into one river instead of running off every which way)
  const s = ((x * L.vx + y * L.vy) - L.ps) * L.pdir;
  if (s > 0 && main > 0.3) { const t = Math.min(1, s / L.plen), floor = 0.37 + 0.3 * Math.pow(1 - t, 1.3) + Math.pow(Math.abs(across), 1.25) * 0.00012 + 0.012 * nE(x / 250, y / 250); if (floor < e) e -= (e - floor) * 0.8 * sstep(0.3, 0.8, land); }   // most of the way down to the floor: the hills still show through
  const hl = hW(clamp(e, 0, 1));
  // the sea floor: past the first stretch of shore the depth follows the climate's real-world profile (seaDepth)
  // against the distance from the coast, measured out along each blob's radius (0.92 of it is about the waterline)
  let off = 1e9;
  for (const b of L.blobs) { const dx = wx - b.cx, dy = wy - b.cy, u = (dx * b.ca + dy * b.sa) / b.rx, v = (dy * b.ca - dx * b.sa) / b.ry, d = Math.hypot(u, v);
    off = Math.min(off, Math.hypot(dx, dy) * (1 - 0.92 / Math.max(d, 1e-3))); }
  if (off <= 20) return hl;
  return hl + (WLW - seaDepth(x, y, off) - hl) * sstep(20, 140, off);
}
