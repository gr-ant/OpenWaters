'use strict';
// ================= World generation =================
// the seeded random numbers, noise, climates and small maths are the shared simulation's (src/sim/core.js)
const { mulberry32, makeNoise, clamp, sstep, CLIMATES, pickClimate } = OWSim;
const params = new URLSearchParams(location.search);
// TITLE: a plain load opens on the start menu, on a fresh random island. Rolling a new island from the map (N) reloads
// with &map in the address: that keeps its seed and goes straight back into play.
const HASH = location.hash;   // read once: the seed is written back into the address below, and the other options must survive that
const RESUME = /[#&]go(?=&|$)/.test(HASH);   // Continue (the start menu) and the reload after a lost graphics context: straight into play, where the save left you
const TITLE = !/[#&](?:map|go)(?=&|$)/.test(HASH);
const hashSeed = TITLE && !/[#&]pick(?=&|$)/.test(HASH) ? undefined : (HASH.match(/seed-?(\d+)/) || [])[1];   // the menu rolls a fresh island, unless one was picked by number (&pick: New island) // #seed-123 works where query strings don't (e.g. hosted artifacts)
const SEED = (parseInt(params.get('seed') || hashSeed) || (Math.random() * 1e9 | 0)) >>> 0;
const HASH_OPTS = (HASH.match(/(?:climate|season|weather)-\w+/g) || []).join('&');   // #climate-arctic, #season-winter, #weather-rain (kept with the seed)
try { if (!hashSeed) history.replaceState(null, '', '#seed-' + SEED + (HASH_OPTS ? '&' + HASH_OPTS : '')); } catch (e) { /* sandboxed: fine */ }

// ---- climate: the seed decides where in the world the island lies (CLIMATES and pickClimate: src/sim/core.js) ----
const CLIMATE = pickClimate(SEED, (HASH.match(/climate-(temperate|arctic|tropical)/) || [])[1] || (CONFIG.climate !== 'auto' ? CONFIG.climate : null));

const nE = makeNoise(SEED), nM = makeNoise(SEED ^ 0x9e3779b9), nR = makeNoise(SEED + 7);
const nW = makeNoise((SEED ^ 0x51ed2701) >>> 0), nRv = makeNoise((SEED + 1013) >>> 0), nCk = makeNoise((SEED + 2029) >>> 0), nSh = makeNoise((SEED ^ 0x2545f491) >>> 0);
function fbm(n, x, y, oct) { let s = 0, a = 1, f = 1, t = 0; for (let k = 0; k < oct; k++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; }
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];   // between two points or colours
function moist(x, y) { return clamp(fbm(nM, x / 900, y / 900, 4) * 1.8 + 0.5, 0, 1); }

const HS = CONFIG.heightScale, WL = CONFIG.waterLevel, WLW = WL * WL * HS;   // height scale, water level (normalized and world)
const hW = e => e * Math.abs(e) * HS;   // signed: negative e is the deep sea floor below height 0

