'use strict';
// Water plants on the hashed grid (plantAt), cover around a spot and the fit curves for range, current and cover.
// PLANTS: every plant mesh by name, in draw order, from src/plants/*.json (registerPlants at boot). In a plant's file:
//   place: rules for the 2.5 m grid, all plants' rules checked lowest order first; the first that holds plants it there.
//     water (or not): water kinds; depth: [above, below] (null: open); if / unless: climate switches (CLIMATES in worldgen.js);
//     notIn: climates; above: { field: value }; r1Below: a second random below this (to share a chance with the next rule);
//     chance: r0 (0..1) must be: above (> it); or > 1 - top - minusRapids * rapids; or < width (from: between from and from + width).
//     width / top: a number, per water { "lake": 0.3 }, or { "if": switch, "then": a, "else": b }; times: factors it's multiplied
//     by in turn: a field, { plus, of: field }, { sstep: [a, b], of: field } or { if, then, else }. Fields: moist, rapids, rocky,
//     grassy, sandy (the sea bed's patches), reef (tropical reef patches), kelpbed (kelp forest patches).
//   cover: the fish cover it gives; reach: metres past the search radius it still counts. Drawing: stride (instance bytes:
//   24 = 6 floats, 32 = 8 with water level and murk), sway (in the wind), view (m). Size: min + rand * r1 (hash: a separate
//   random, SEED + hash), or by depth: min(depth * (depth[0] + depth[1] * r1), max); creek: [min, rand] in creeks; rapids:
//   bigger in rapids. Height: on the ground (z: 'water': on the surface) + lift - sink * size; downBank: a fallen trunk
//   points into the water. Seasons: grow (its scale in winter, up to 1 in summer), flower (only while flowering), snow
//   (sinks under snow), dry (browns when dormant). mesh: how it looks (models/water-plants.js); meshes: several, the first
//   used while r1 < its split. ground: land cover, placed by Engine.groundGen instead (weights per ground material).
const PLANTS = {}, PLANT_ID = {}, PLANT_GRID = [], PLANT_RULES = [], COVER_PLANT = {};   // PLANT_ID.kelp -> its plantAt number; PLANT_GRID[n] -> the meshes of plantAt number n; COVER_PLANT.rocks -> plantAt numbers giving it
function registerPlants(list) {
  for (const d of list) {
    const grid = d.place ? Math.max(1, PLANT_GRID.length) : 0;
    for (const m of d.meshes || [Object.assign({ id: d.id }, d.mesh)]) {
      if (typeof PLANT_BUILDERS !== 'undefined' && !PLANT_BUILDERS[m.builder]) { console.error(`Plant "${d.id}": no mesh builder "${m.builder}"`); continue; }
      const P = PLANTS[m.id] = Object.assign({}, d, { id: m.id, plant: d.id, grid, split: m.split, mesh: m });
      if (grid) (PLANT_GRID[grid] || (PLANT_GRID[grid] = [])).push(P);
    }
    if (!grid || !PLANT_GRID[grid]) continue;
    PLANT_ID[d.id] = grid;
    for (const r of d.place) { const ok = r.water || WATER.map(w => w.key).filter(k => !(r.not || []).includes(k)); PLANT_RULES.push(Object.assign({}, r, { grid, kinds: WATER.map(w => ok.includes(w.key)) })); }
    for (const c of d.cover || []) (COVER_PLANT[c] || (COVER_PLANT[c] = [])).push(grid);
  }
  PLANT_RULES.sort((a, b) => a.order - b.order);
}
const plantKind = (t, r1) => { const K = PLANT_GRID[t]; return K.length > 1 && r1 >= K[0].split ? K[1] : K[0]; };   // which mesh a plantAt number is drawn with here
const GROUND_KINDS = ['grass', 'flowerA', 'flowerB', 'fern', 'bush', 'heath', 'moss'], GROUND_SET = new Set(GROUND_KINDS), GROUND_TILE = 16;   // groundGen's order; never seen by coverAt (fish cover is plantAt only)
const plantNum = (v, kd) => typeof v === 'number' ? v : v.if ? (CLIMATE[v.if] ? v.then : v.else) : v[WATER[kd].key] || 0;
const plantFactor = (t, F) => typeof t === 'string' ? F(t) : t.if ? (CLIMATE[t.if] ? t.then : t.else) : t.sstep ? sstep(t.sstep[0], t.sstep[1], F(t.of)) : t.plus + F(t.of);
function plantRule(R, kd, dep, r0, r1, F) {
  if (!R.kinds[kd]) return false;
  if (R.depth && ((R.depth[0] != null && !(dep > R.depth[0])) || (R.depth[1] != null && !(dep < R.depth[1])))) return false;
  if ((R.if && R.if.some(f => !CLIMATE[f])) || (R.unless && R.unless.some(f => CLIMATE[f])) || (R.notIn && R.notIn.includes(CLIMATE.key))) return false;
  if (R.above) for (const k in R.above) if (!(F(k) > R.above[k])) return false;
  if (R.r1Below != null && !(r1 < R.r1Below)) return false;
  const C = R.chance;
  if (C.above != null) return r0 > C.above;
  if (C.top) return r0 > 1 - plantNum(C.top, kd) - (C.minusRapids && kd >= RIVER ? C.minusRapids * SR : 0);
  let w = plantNum(C.width, kd); if (C.times) for (const t of C.times) w *= plantFactor(t, F);
  return C.from != null ? r0 > C.from && r0 < C.from + w : r0 < w;
}
const PL = { x: 0, y: 0, h: 0, wl: 0, kd: 0, dep: 0, r1: 0, rap: 0 };
// Fixed-size direct-mapped cache: no growth while travelling. Float64 retains the exact
// placement and interpolated sample outputs; season-dependent cover is still evaluated live.
const plantCache = { x: new Int32Array(16384), y: new Int32Array(16384), type: new Uint8Array(16384), data: new Float64Array(16384 * 10) };
function plantAt(gx, gy) {
  const C = plantCache, slot = (Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) & 16383, o = slot * 10, d = C.data;
  if (C.type[slot] && C.x[slot] === gx && C.y[slot] === gy) {
    PL.x = d[o]; PL.y = d[o + 1]; PL.h = d[o + 2]; PL.wl = SW = d[o + 3]; PL.kd = SK = d[o + 4]; PL.dep = d[o + 5];
    // The original dry-land return leaves r1 untouched; callers may still inspect PL.
    if (PL.dep >= -0.8) PL.r1 = d[o + 6];
    PL.rap = SR = d[o + 7]; SE = d[o + 8]; SM = d[o + 9];
    return C.type[slot] - 1;
  }
  const t = plantAtRaw(gx, gy);
  C.x[slot] = gx; C.y[slot] = gy; C.type[slot] = t + 1;
  d[o] = PL.x; d[o + 1] = PL.y; d[o + 2] = PL.h; d[o + 3] = SW; d[o + 4] = SK; d[o + 5] = PL.dep;
  d[o + 6] = PL.r1; d[o + 7] = SR; d[o + 8] = SE; d[o + 9] = SM;
  return t;
}
function plantAtRaw(gx, gy) {
  const G = 2.5, x = (gx + 0.1 + 0.8 * hash2(gx, gy, SEED + 302)) * G, y = (gy + 0.1 + 0.8 * hash2(gx, gy, SEED + 303)) * G;
  sample(x, y); const h = hW(SE), wl = SW, kd = SK, dep = wl - h;
  PL.x = x; PL.y = y; PL.h = h; PL.wl = wl; PL.kd = kd; PL.dep = dep; PL.rap = SR;
  if (dep < -0.8) return 0;
  const r0 = hash2(gx, gy, SEED + 301), r1 = PL.r1 = hash2(gx, gy, SEED + 304);
  let bed, rocky, grassy, reef, kelpbed;   // worked out only if a rule asks
  const F = n => {
    if (n === 'moist') return SM; if (n === 'rapids') return SR;
    if (n === 'reef') return reef ?? (reef = nM(x / 35 + 7, y / 35 - 3) + 0.3 * nW(x / 9, y / 9) + 0.3);
    if (n === 'kelpbed') return kelpbed ?? (kelpbed = nM(x / 60 - 11, y / 60 + 5) + 0.15);
    // the sea bed comes in patches: rocky ground, seagrass meadows and bare sand, laid out by a slow noise so each runs for tens of metres
    if (bed === undefined) { bed = nM(x / 55 + 17, y / 55 - 23); rocky = sstep(0.12, 0.3, bed); grassy = sstep(0.1, 0.28, -bed); }
    return n === 'rocky' ? rocky : n === 'grassy' ? grassy : 1 - Math.max(rocky, grassy);   // sandy
  };
  for (const R of PLANT_RULES) if (plantRule(R, kd, dep, r0, r1, F)) return R.grid;
  return 0;
}
// how much of each kind of cover is within r metres (0..1 each; open = what's left)
// Lilies and weed beds grow through spring and die back in autumn (live = false: midsummer, for laying out populations).
function coverAt(x, y, r = 4, live = true) {
  const n = { rocks: 0, weeds: 0, reeds: 0, lilies: 0, wood: 0, coral: 0, anemone: 0 };
  for (let gy = Math.floor((y - r) / 2.5); gy <= Math.floor((y + r) / 2.5); gy++) for (let gx = Math.floor((x - r) / 2.5); gx <= Math.floor((x + r) / 2.5); gx++) {
    const t = plantAt(gx, gy); if (!t) continue; const P = PLANT_GRID[t][0];
    if (Math.hypot(PL.x - x, PL.y - y) > r + (P.reach || 0)) continue;   // a log reaches further than its root
    for (const c of P.cover) n[c]++;
  }
  const g = live ? ENV.growth : 1;
  const c = { rocks: Math.min(1, n.rocks / 1.5), weeds: Math.min(1, n.weeds / 3) * (0.3 + 0.7 * g), reeds: Math.min(1, n.reeds / 2) * (live ? 1 - 0.35 * ENV.dormant : 1), lilies: Math.min(1, n.lilies / 2) * g, wood: Math.min(1, n.wood), coral: Math.min(1, n.coral / 4), anemone: Math.min(1, n.anemone) };
  c.open = Math.max(0, 1 - c.rocks - c.weeds - c.reeds - c.lilies - c.wood - c.coral);
  return c;
}
// preference curves (1 at the preferred value, falling off to the limits) and cover fit: src/sim/core.js
const { fitRange, currentFit, COVER_KEYS, coverFit } = OWSim;
