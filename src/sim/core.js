'use strict';
// Shared simulation, part 1: seeded random numbers and small maths. The same file runs as a plain <script> in the game
// (it adds to the OWSim namespace) and as a CommonJS module in Node (require('./core.js')). No browser globals and no
// Math.random here: everything random is drawn from a seeded stream passed in or made from the seed.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({});
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function () {
  // mulberry32: a seeded 32-bit stream, 0..1
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // a fixed hash of a grid point and a seed, 0..1
  const hash2 = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + s | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  // a stream seeded from a grid point (the per-cell populations use this)
  const cellRng = (x, y, s) => mulberry32((hash2(x, y, s) * 4294967296) >>> 0);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // statistics: a normal draw (Box-Muller), and a Poisson count (normal approximation past 30)
  function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(6.2832 * rng()); }
  function poisson(lam, rng) { if (lam <= 0) return 0; if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(rng))); let k = 0, p = 1; const L = Math.exp(-lam); do { k++; p *= rng(); } while (p > L); return k - 1; }
  // individual length (log-normal around the typical size, truncated) and weight (W = a·L^b, with condition noise)
  function sampleFishSize(D, rng) {
    const L = D.size.length_cm; let cm = L.typical;
    for (let k = 0; k < 6; k++) { cm = Math.exp(D._mu + D._sig * gauss(rng)); if (cm >= L.min && cm <= L.max) break; }
    cm = clamp(cm, L.min, L.max);
    return { cm, kg: D.size.weight.a * cm ** D.size.weight.b * Math.exp(D.size.condition_sd * gauss(rng)) / 1000 };
  }
  // Seeded 2D Perlin noise, output roughly [-0.7, 0.7]
  function makeNoise(seed) {
    const r = mulberry32(seed), p = new Uint8Array(512), P = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = r() * (i + 1) | 0; [P[i], P[j]] = [P[j], P[i]]; }
    for (let i = 0; i < 512; i++) p[i] = P[i & 255];
    const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
    return (x, y) => {
      const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
      const aa = p[p[xi] + yi] & 7, ab = p[p[xi] + yi + 1] & 7, ba = p[p[xi + 1] + yi] & 7, bb = p[p[xi + 1] + yi + 1] & 7;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const g00 = GX[aa] * xf + GY[aa] * yf, g10 = GX[ba] * (xf - 1) + GY[ba] * yf;
      const g01 = GX[ab] * xf + GY[ab] * (yf - 1), g11 = GX[bb] * (xf - 1) + GY[bb] * (yf - 1);
      const x1 = g00 + u * (g10 - g00), x2 = g01 + u * (g11 - g01);
      return x1 + v * (x2 - x1);
    };
  }
  // preference curves: 1 at the preferred value, falling off to the limits (0 beyond them)
  const fitRange = (v, lo, opt, hi) => v < lo || v > hi ? 0 : 1 - 0.88 * ((v - opt) / Math.max(1e-3, v < opt ? opt - lo : hi - opt)) ** 2;
  function currentFit(c, H) { const p = H.current_ms.preferred, m = H.current_ms.max; return c > m ? 0 : c < p ? 1 - 0.6 * ((p - c) / Math.max(p, 0.3)) ** 2 : 1 - 0.85 * ((c - p) / Math.max(1e-3, m - p)) ** 2; }
  const COVER_KEYS = ['rocks', 'weeds', 'reeds', 'lilies', 'wood', 'coral', 'anemone', 'open'];
  function coverFit(c, H) { const P = H.cover; let s = 0, m = 0; for (const k of COVER_KEYS) { s += (P[k] || 0) * (c[k] || 0); m = Math.max(m, P[k] || 0); }
    const fl = 0.25 * (1 - clamp(H.cover_required || 0, 0, 1)); return fl + (1 - fl) * Math.min(1, s / (m || 1)); }
  // the kinds of water, by id (the terrain reports one of these for every point)
  const OCEAN = 0, LAKE = 1, POND = 2, RIVER = 3, CREEK = 4;
  const WATER_KEYS = ['sea', 'lake', 'pond', 'river', 'creek'];
  const WATER_MURK = [0.05, 0.22, 0.72, 0.14, 0.04];   // 0 clear .. 1 green-brown (the game's WATER table in world/island-layout.js)

  // ---- climate: the seed decides where in the world the island lies ----
  // air: [mean, swing] of the seasonal air temperature; water: °C added to each water's temperature (sea, lake, pond, river,
  // creek), amp: how much the water's temperature swings over the year; the rest switch biome features on and off.
  const CLIMATES = {
    temperate: { name: 'Temperate', air: [9, 12], water: [0, 0, 0, 0, 0], amp: 1, seaCurrent: true, trees: 1, broad: 1 },
    arctic: { name: 'Arctic', air: [-5, 13], water: [-10, -9.5, -9, -8, -6], amp: 0.8, seaIce: true, bergs: true, trees: 0.3, broad: 0.15,
      mats: { 2: [0.55, 0.53, 0.5], 3: [0.5, 0.52, 0.32], 4: [0.2, 0.32, 0.22], 6: [0.42, 0.45, 0.33] } },   // grey shingle, tundra, taiga, moss
    tropical: { name: 'Tropical', air: [27, 1.5], water: [15, 13, 12, 12, 10], amp: 0.2, reefsEverywhere: true, palms: true, evergreen: true, trees: 1.1, broad: 1,
      mats: { 2: [0.96, 0.92, 0.78], 3: [0.36, 0.66, 0.2], 4: [0.1, 0.38, 0.12] } },   // white coral sand, lush grass, jungle
  };
  // the island's climate: one asked for (#climate-arctic, CONFIG.climate), or the seed's
  function pickClimate(seed, want) {
    const r = mulberry32((seed ^ 0xc11a7e) >>> 0)(), k = want && CLIMATES[want] ? want : r < 0.4 ? 'temperate' : r < 0.7 ? 'arctic' : 'tropical';
    return Object.assign({ key: k }, CLIMATES[k]);
  }

  return { mulberry32, hash2, cellRng, clamp, sstep, gauss, poisson, sampleFishSize, makeNoise, fitRange, currentFit, coverFit, COVER_KEYS,
    OCEAN, LAKE, POND, RIVER, CREEK, WATER_KEYS, WATER_MURK, CLIMATES, pickClimate };
});
