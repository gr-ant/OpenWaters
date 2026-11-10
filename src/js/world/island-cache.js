'use strict';
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
// Sampling an unseen area needs four lattice points, not a synchronous 4,225-point build.
// Only complete lattices enter cache: mesh normals and ground generation can keep reading it directly.
const partialLattices = new Map();
function partialLattice(cx, cy, key) {
  let p = partialLattices.get(key);
  if (!p) {
    if (partialLattices.size >= 64) partialLattices.delete(partialLattices.keys().next().value);
    p = { data: new Float32Array((CHK + 1) * (CHK + 1) * LS), ready: new Uint8Array((CHK + 1) * (CHK + 1)) };
    partialLattices.set(key, p);
  }
  return p;
}
function latticePoint(p, i, cx, cy) {
  if (p.ready[i]) return;
  fillPoint(p.data, i * LS, (cx * CHK + i % (CHK + 1)) * SP, (cy * CHK + Math.floor(i / (CHK + 1))) * SP);
  p.ready[i] = 1;
}
function finishLattice(cx, cy, key, p) {
  if (cache.size > 900) evictFar(cx, cy);
  cache.set(key, p.data); partialLattices.delete(key);
}
function* latticeGen(cx, cy) {
  const key = (cx + 1e6) * 2e6 + (cy + 1e6);
  if (cache.has(key)) return;
  const p = partialLattice(cx, cy, key);
  for (let j = 0; j <= CHK; j++) {
    for (let i = 0; i <= CHK; i++) latticePoint(p, j * (CHK + 1) + i, cx, cy);
    if (j % 4 === 3) { yield; if (cache.has(key)) return; }
  }
  finishLattice(cx, cy, key, p);
}
function getChunk(cx, cy) {
  const key = (cx + 1e6) * 2e6 + (cy + 1e6);
  if (key === lastKey) return lastChunk;
  let c = cache.get(key);
  if (!c) {
    const p = partialLattice(cx, cy, key);
    for (let i = 0; i < p.ready.length; i++) latticePoint(p, i, cx, cy);
    finishLattice(cx, cy, key, p); c = p.data;
  }
  lastKey = key; lastChunk = c; return c;
}
function sampleChunk(cx, cy, i) {
  const key = (cx + 1e6) * 2e6 + (cy + 1e6);
  if (key === lastKey) return lastChunk;
  const c = cache.get(key);
  if (c) { lastKey = key; lastChunk = c; return c; }
  const p = partialLattice(cx, cy, key);
  latticePoint(p, i, cx, cy); latticePoint(p, i + 1, cx, cy);
  latticePoint(p, i + CHK + 1, cx, cy); latticePoint(p, i + CHK + 2, cx, cy);
  return p.data;
}
let SE = 0, SM = 0, SW = WLW, SK = 0, SR = 0; // sample() outputs (no allocation): elevation, moisture, water level, water kind, rapids
function sample(x, y) {
  const gx = x / SP, gy = y / SP, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const cx = Math.floor(ix / CHK), cy = Math.floor(iy / CHK), lx = ix - cx * CHK, ly = iy - cy * CHK;
  const i = ly * (CHK + 1) + lx, c = sampleChunk(cx, cy, i), k = i * LS, k2 = k + (CHK + 1) * LS;
  let a = c[k] + (c[k + LS] - c[k]) * fx, b = c[k2] + (c[k2 + LS] - c[k2]) * fx; SE = a + (b - a) * fy;
  a = c[k + 1] + (c[k + LS + 1] - c[k + 1]) * fx; b = c[k2 + 1] + (c[k2 + LS + 1] - c[k2 + 1]) * fx; SM = a + (b - a) * fy;
  a = c[k + 2] + (c[k + LS + 2] - c[k + 2]) * fx; b = c[k2 + 2] + (c[k2 + LS + 2] - c[k2 + 2]) * fx; SW = a + (b - a) * fy;
  const kn = (fy < 0.5 ? k : k2) + (fx < 0.5 ? 0 : LS); SK = c[kn + 3]; SR = c[kn + 4];
}
function surfAt(x, y) { sample(x, y); const h = hW(SE); return h < SW ? SW : h; }   // ground, or the water surface over it
function groundAt(x, y) { sample(x, y); return hW(SE); }
