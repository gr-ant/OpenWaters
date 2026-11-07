'use strict';
// Water plants on the hashed grid (plantAt), cover around a spot and the fit curves for range, current and cover.
// The same hashed grid the chunk builder plants on: plantAt(gx, gy) -> 0 none, 1 reeds, 2 lily, 3 flowering lily, 4 weed, 5 kelp,
// 6 rock, 7 fallen log, 8 drowned stump, 9 coral, 10 sea anemone, 11 iceberg (details in PL)
const PL = { x: 0, y: 0, h: 0, wl: 0, kd: 0, dep: 0, r1: 0, rap: 0 };
function plantAt(gx, gy) {
  const G = 2.5, x = (gx + 0.1 + 0.8 * hash2(gx, gy, SEED + 302)) * G, y = (gy + 0.1 + 0.8 * hash2(gx, gy, SEED + 303)) * G;
  sample(x, y); const h = hW(SE), wl = SW, kd = SK, dep = wl - h;
  PL.x = x; PL.y = y; PL.h = h; PL.wl = wl; PL.kd = kd; PL.dep = dep; PL.rap = SR;
  if (dep < -0.8) return 0;
  const r0 = hash2(gx, gy, SEED + 301), r1 = PL.r1 = hash2(gx, gy, SEED + 304);
  if (kd === OCEAN && CLIMATE.bergs && dep > 9 && r0 > 0.99993) return 11;   // icebergs drifting off an arctic coast
  if (kd === OCEAN && dep > -0.5) {
    // the sea bed comes in patches: rocky ground, seagrass meadows and bare sand, laid out by a slow noise so each runs for tens of metres
    const bed = nM(x / 55 + 17, y / 55 - 23), rocky = sstep(0.12, 0.3, bed), grassy = sstep(0.1, 0.28, -bed), sandy = 1 - Math.max(rocky, grassy);
    if (dep > -0.5 && dep < 1.2 && r0 < 0.3 * rocky) return 19;   // rockweed on the tide-line rocks
    if (dep > 0.3 && dep < 30 && r0 > 0.62 && r0 < 0.62 + 0.09 * rocky) return r1 < 0.5 ? 20 : 21;   // slabs and rubble on rocky ground
    if (dep > 0.5 && dep < 20 && r0 > 0.74 && r0 < 0.74 + 0.05 * rocky) return 15;   // urchins graze the rock
    if (dep > 3 && dep < 40 && r0 > 0.8 && r0 < 0.8 + (CLIMATE.reefsEverywhere ? 0.05 : 0.03) * rocky) return 13;   // sponges on rock
    if (dep > 0.5 && dep < 30 && r0 > 0.86 && r0 < 0.86 + 0.02 * (0.4 + rocky)) return 16;   // starfish
    if (dep > 0.3 && dep < 10 && r0 > 0.89 && r0 < 0.89 + 0.04 * sandy) return 22;   // shells on the sand
    if (dep > 0.5 && dep < 7 && (CLIMATE.key !== 'arctic') && r0 < 0.34 * grassy * (CLIMATE.reefsEverywhere ? 0.7 : 1)) return 17;   // seagrass meadows
    if (dep > 5 && dep < 22 && !CLIMATE.reefsEverywhere && r0 > 0.5 && r0 < 0.5 + 0.1 * rocky) return 18;   // bull kelp off rocky points
    if (dep > 0.6 && dep < 15 && CLIMATE.reefsEverywhere) { // coral reefs (tropical islands), in patches, with anemones, sea fans and plate coral among them
      const w = 1;
      const reef = nM(x / 35 + 7, y / 35 - 3) + 0.3 * nW(x / 9, y / 9) + 0.3;
      if (dep < 9 && reef > 0 && r0 > 0.9 && r0 < 0.9 + 0.06 * sstep(0.45, 0.7, w)) return 10;
      if (dep > 2 && reef > -0.1 && r0 > 0.96 && r0 < 0.96 + 0.025 * sstep(-0.1, 0.2, reef)) return 12;   // sea fans
      if (r0 < 0.24 * sstep(0.45, 0.75, w) * sstep(-0.1, 0.2, reef)) return r1 < 0.3 ? 14 : 9;   // plate / brain among the staghorn
    }
  }
  if (kd !== OCEAN && dep > -0.25 && dep < 1.1 && r0 > 0.5 && r0 < 0.5 + 0.035 * sstep(0.35, 0.65, SM)) return 7;   // trees fallen from wooded banks
  if ((kd === POND || kd === LAKE) && dep > 0.5 && dep < 3.2 && r0 > 0.45 && r0 < 0.45 + (kd === POND ? 0.016 : 0.005) * (0.4 + SM)) return 8;   // drowned timber
  if (kd !== OCEAN && dep > -0.12 && dep < 0.55 && r0 < [0, 0.3, 0.55, 0.2, 0.18][kd] * (0.5 + SM)) return 1;   // reeds: the wet margin only, not the dry bank
  if ((kd === POND || kd === LAKE) && dep > 0.35 && dep < 2.3 && r0 < (kd === POND ? 0.32 : 0.05)) return r1 < 0.15 ? 3 : 2;
  if (kd === OCEAN && !CLIMATE.reefsEverywhere && dep > 2 && dep < 14 && r0 > 0.7 && r0 < 0.7 + 0.22 * sstep(0, 0.3, nM(x / 60 - 11, y / 60 + 5) + 0.15)) return 5;   // kelp forests
  if (dep > 0.8 && r0 < [0.08, 0.16, 0.3, 0.12, 0.08][kd]) return kd === OCEAN && dep > 2.5 ? 5 : 4;
  if (dep > -0.8 && dep < 2 && r0 > 1 - [0.012, 0.02, 0, 0.05, 0.09][kd] - (kd >= RIVER ? 0.2 * SR : 0)) return 6;   // boulders crowd the rapids
  return 0;
}
// how much of each kind of cover is within r metres (0..1 each; open = what's left)
// Lilies and weed beds grow through spring and die back in autumn (live = false: midsummer, for laying out populations).
function coverAt(x, y, r = 4, live = true) {
  let rk = 0, wd = 0, rd = 0, li = 0, wo = 0, co = 0, an = 0;
  for (let gy = Math.floor((y - r) / 2.5); gy <= Math.floor((y + r) / 2.5); gy++) for (let gx = Math.floor((x - r) / 2.5); gx <= Math.floor((x + r) / 2.5); gx++) {
    const t = plantAt(gx, gy); if (!t || Math.hypot(PL.x - x, PL.y - y) > (t >= 7 ? r + 2.5 : r)) continue;   // a log reaches further than its root
    if (t === 1) rd++; else if (t < 4) li++; else if (t < 6) wd++; else if (t === 6) rk++; else if (t < 9) wo++; else if (t === 9) co++; else if (t === 10) { an++; co++; }
    else if (t === 12 || t === 13 || t === 14) co++; else if (t === 15 || t === 20 || t === 21) rk++; else if (t === 17 || t === 18 || t === 19) wd++;   // the newer kinds (starfish, shells, bergs give no cover)
  }
  const g = live ? ENV.growth : 1;
  const c = { rocks: Math.min(1, rk / 1.5), weeds: Math.min(1, wd / 3) * (0.3 + 0.7 * g), reeds: Math.min(1, rd / 2) * (live ? 1 - 0.35 * ENV.dormant : 1), lilies: Math.min(1, li / 2) * g, wood: Math.min(1, wo), coral: Math.min(1, co / 4), anemone: Math.min(1, an) };
  c.open = Math.max(0, 1 - c.rocks - c.weeds - c.reeds - c.lilies - c.wood - c.coral);
  return c;
}
// preference curves: 1 at the preferred value, falling off to the limits (0 beyond them)
const fitRange = (v, lo, opt, hi) => v < lo || v > hi ? 0 : 1 - 0.88 * ((v - opt) / Math.max(1e-3, v < opt ? opt - lo : hi - opt)) ** 2;
function currentFit(c, H) { const p = H.current_ms.preferred, m = H.current_ms.max; return c > m ? 0 : c < p ? 1 - 0.6 * ((p - c) / Math.max(p, 0.3)) ** 2 : 1 - 0.85 * ((c - p) / Math.max(1e-3, m - p)) ** 2; }
const COVER_KEYS = ['rocks', 'weeds', 'reeds', 'lilies', 'wood', 'coral', 'anemone', 'open'];
const COVER_PLANT = { reeds: [1], lilies: [2, 3], weeds: [4, 5, 17, 18, 19], rocks: [6, 15, 20, 21], wood: [7, 8], coral: [9, 10, 12, 13, 14], anemone: [10] };   // plantAt types for each cover (sponges count as coral-like structure)
function coverFit(c, H) { const P = H.cover; let s = 0, m = 0; for (const k of COVER_KEYS) { s += (P[k] || 0) * (c[k] || 0); m = Math.max(m, P[k] || 0); }
  const fl = 0.25 * (1 - clamp(H.cover_required || 0, 0, 1)); return fl + (1 - fl) * Math.min(1, s / (m || 1)); }
