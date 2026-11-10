'use strict';
// Permanent ice is spatial terrain, independent of seasonal snow (src/features/glaciers.json: how many of each kind, per climate).
// Laid out once per seed, lazily (after the JSON is read). ice cap: on the summit · valley: a tongue from the summit down a slope ·
// tidewater: a valley glacier that pushes out past the coast and ends in an ice cliff · piedmont: one that spreads into a broad
// lobe on the lowland · cirque: a small glacier in a high hollow on the mountain's flank.
let GLACIERS = null, GLAC_TIDE = 0;   // GLAC_TIDE: ice-front height above the sea of the tidewater glacier found by the last glacierAt()
function glaciers() {
  if (GLACIERS) return GLACIERS; GLACIERS = [];
  const F = BUILTIN.feature.find(f => f.type === 'glaciers'), C = F && F.climates[CLIMATE.key]; if (!C) return GLACIERS;
  const L = LAYOUT, rng = mulberry32((SEED ^ 0x61ac1) >>> 0), pick = ([a, b]) => a + (b - a) * rng();
  const toCoast = (ux, uy) => { let d = L.pr * 0.3; for (; d < CONFIG.islandSize; d += 24) if (islandBase(L.px + ux * d, L.py + uy * d) < WLW) break; return d; };
  if (rng() < C.cap) GLACIERS.push({ kind: 'cap', x: L.px, y: L.py, R: L.pr * 0.45 });
  const main = Math.atan2(-L.vy * L.pdir, -L.vx * L.pdir);   // the first runs down the back slope, away from the river
  for (let k = 0, n = Math.round(pick(C.valleys)); k < n; k++) {
    const a = k ? main + (rng() < 0.5 ? -1 : 1) * (1 + 1.6 * rng()) : main, ux = Math.cos(a), uy = Math.sin(a), coast = toCoast(ux, uy);
    const tide = rng() < C.tidewater, pied = !tide && rng() < C.piedmont;
    GLACIERS.push({ kind: tide ? 'tidewater' : pied ? 'piedmont' : 'valley', x: L.px, y: L.py, ux, uy, w: L.pr * (0.12 + 0.06 * rng()), ph: k ? rng() * 6.28 : 0,
      length: tide ? coast + pick(F.tidewater_reach_m) : pied ? coast * (0.6 + 0.2 * rng()) : k ? coast * (0.55 + 0.45 * rng()) : coast,
      front: tide ? pick(F.tidewater_front_m) : 0, lobe: pied ? L.pr * (0.35 + 0.15 * rng()) : 0 });
  }
  const top = islandBase(L.px, L.py);
  for (let k = 0, n = Math.round(pick(C.cirques)), tries = 0; k < n && tries < 80; tries++) {   // cirques: high on the flanks, nudged downhill
    const a = rng() * 6.2832, d = L.pr * (0.35 + 0.6 * rng()), x = L.px + Math.cos(a) * d, y = L.py + Math.sin(a) * d;
    if (islandBase(x, y) < WLW + (top - WLW) * 0.45) continue;
    const gx = islandBase(x + 20, y) - islandBase(x - 20, y), gy = islandBase(x, y + 20) - islandBase(x, y - 20), g = Math.hypot(gx, gy) || 1;
    GLACIERS.push({ kind: 'cirque', x: x - gx / g * 30, y: y - gy / g * 30, r: pick(F.cirque_radius_m), dx: -gx / g, dy: -gy / g }); k++;
  }
  return GLACIERS;
}
function glacierAt(x, y) {
  GLAC_TIDE = 0; if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const Gs = GLACIERS || glaciers(); if (!Gs.length) return 0;
  const L = LAYOUT, edge = nR(x / 110, y / 110) * 0.08; let best = 0;
  for (const G of Gs) {
    const dx = x - G.x, dy = y - G.y; let v = 0;
    if (G.kind === 'cap') { if (Math.abs(dx) > G.R || Math.abs(dy) > G.R) continue; v = 1 - sstep(0.23, 0.39, Math.hypot(dx, dy) / L.pr + edge); }
    else if (G.kind === 'cirque') { if (Math.abs(dx) > G.r * 1.6 || Math.abs(dy) > G.r * 1.6) continue;
      const u = (dx * G.dx + dy * G.dy) / (G.r * 1.3), w = (dy * G.dx - dx * G.dy) / G.r; v = 1 - sstep(0.7, 1, Math.hypot(u, w) + edge * 2); }   // a little longer downhill
    else {
      const along = dx * G.ux + dy * G.uy; if (along < -L.pr * 0.2 || along > G.length + G.lobe + 60) continue;
      const across = dy * G.ux - dx * G.uy, width = G.w * (1 + 0.6 * clamp(along / G.length, 0, 1)), sharp = G.front ? 6 : 24;   // a tidewater front ends abruptly
      v = sstep(-L.pr * 0.1, L.pr * 0.2, along) * (1 - sstep(G.length - sharp, G.length + sharp, along)) * (1 - sstep(0.65, 1, Math.abs(across + 35 * Math.sin(along / 250 + G.ph)) / width + edge));
      if (G.lobe) v = Math.max(v, 1 - sstep(0.75, 1, Math.hypot((along - G.length) * 0.8, across) / G.lobe + edge));   // the piedmont lobe
    }
    if (v > best) { best = v; GLAC_TIDE = G.front || 0; }
  }
  return best;
}
