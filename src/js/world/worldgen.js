'use strict';
// ================= World generation =================
const params = new URLSearchParams(location.search);
// TITLE: a plain load opens on the start menu, on a fresh random island. Rolling a new island from the map (N) reloads
// with &map in the address: that keeps its seed and goes straight back into play.
const HASH = location.hash;   // read once: the seed is written back into the address below, and the other options must survive that
const TITLE = !/[#&]map(?=&|$)/.test(HASH);
const hashSeed = TITLE ? undefined : (HASH.match(/seed-?(\d+)/) || [])[1]; // #seed-123 works where query strings don't (e.g. hosted artifacts)
const SEED = (parseInt(params.get('seed') || hashSeed) || (Math.random() * 1e9 | 0)) >>> 0;
const HASH_OPTS = (HASH.match(/(?:climate|season|weather)-\w+/g) || []).join('&');   // #climate-arctic, #season-winter, #weather-rain (kept with the seed)
try { if (!hashSeed) history.replaceState(null, '', '#seed-' + SEED + (HASH_OPTS ? '&' + HASH_OPTS : '')); } catch (e) { /* sandboxed: fine */ }

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
const CLIMATE = (() => {
  const h = (HASH.match(/climate-(temperate|arctic|tropical)/) || [])[1] || (CONFIG.climate !== 'auto' ? CONFIG.climate : null);
  const r = mulberry32((SEED ^ 0xc11a7e) >>> 0)(), k = h && CLIMATES[h] ? h : r < 0.4 ? 'temperate' : r < 0.7 ? 'arctic' : 'tropical';
  return Object.assign({ key: k }, CLIMATES[k]);
})();
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

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
const nE = makeNoise(SEED), nM = makeNoise(SEED ^ 0x9e3779b9), nR = makeNoise(SEED + 7);
const nW = makeNoise((SEED ^ 0x51ed2701) >>> 0), nRv = makeNoise((SEED + 1013) >>> 0), nCk = makeNoise((SEED + 2029) >>> 0), nSh = makeNoise((SEED ^ 0x2545f491) >>> 0);
function fbm(n, x, y, oct) { let s = 0, a = 1, f = 1, t = 0; for (let k = 0; k < oct; k++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function moist(x, y) { return clamp(fbm(nM, x / 900, y / 900, 4) * 1.8 + 0.5, 0, 1); }

const HS = CONFIG.heightScale, WL = CONFIG.waterLevel, WLW = WL * WL * HS;   // height scale, water level (normalized and world)
const hW = e => e * Math.abs(e) * HS;   // signed: negative e is the deep sea floor below height 0

