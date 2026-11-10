'use strict';
// ---- map features defined in src/features/*.json; the "type" picks the shape code, the file sets where, how often and how big ----
// stacks: clusters of sheer rock pillars offshore with a grassy top. Laid out once per seed from the base terrain.
let STACKS = null, STK_T = 0;   // STK_T: top height of the stack found by the last stackS()
function seaStacks() {
  if (STACKS) return STACKS; STACKS = [];
  const R = CONFIG.islandSize / 2, rng = mulberry32((SEED ^ 0x5eac5) >>> 0), pick = ([a, b]) => a + (b - a) * rng();
  for (const F of BUILTIN.feature.filter(f => f.type === 'stacks')) {
    if (rng() >= (F.chance[CLIMATE.key] ?? 0)) continue;
    const nc = Math.round(pick(F.clusters));
    for (let c = 0, tries = 0; c < nc && tries < 40; tries++) {
      const a = rng() * 6.2832, ux = Math.cos(a), uy = Math.sin(a); let d = 0.3 * R;
      while (d < 2 * R && islandBase(ux * d, uy * d) > WLW) d += 20;   // out to the coast on this bearing
      d += pick(F.offshore_m); const cx = ux * d, cy = uy * d;
      if (islandBase(cx, cy) > WLW - F.min_depth_m) continue;   // open water round it
      for (let k = 0, n = Math.round(pick(F.stacks)); k < n; k++) {
        const r = pick(F.radius_m), q = rng() * 6.2832, o = k ? F.spread_m * Math.sqrt(rng()) : 0;
        STACKS.push({ x: cx + Math.cos(q) * o, y: cy + Math.sin(q) * o, r, rin: Math.max(1, 0.8 * r - Math.max(6, 0.3 * r) - 1),   // rin: safely on the flat top
          top: WLW + pick(F.height_m) * (0.6 + 0.4 * r / F.radius_m[1]), ph: rng() * 100 });
      }
      c++;
    }
  }
  return STACKS;
}
// how much a stack stands at (x, y): 1 on its top, 0 off it, the cliff in between (sets STK_T)
function stackS(x, y) {
  let best = 0;
  for (const k of STACKS || seaStacks()) {
    const dx = x - k.x, dy = y - k.y; if (Math.abs(dx) > k.r * 1.4 || Math.abs(dy) > k.r * 1.4) continue;
    const dd = Math.hypot(dx, dy) + 1e-6, rr = k.r * (1 + 0.25 * nM(dx / dd * 1.5 + k.ph, dy / dd * 1.5) + 0.08 * nM(dx / dd * 6 + k.ph, dy / dd * 6) + 0.05 * nM(x / 4, y / 4));   // ragged outline: lobes, buttresses and gullies
    const s0 = 1 - sstep(rr - Math.max(8, 0.35 * rr), rr, dd), t = s0 * 3 + 1.4 * s0 * (1 - s0) * nM(x / 7 + k.ph, y / 7), f = Math.floor(t), s = clamp((f + sstep(0.5, 1, t - f)) / 3, 0, 1);   // the cliff spans 8 m+ (4+ terrain cells; one stretched triangle smears colour and snow), broken by two or three uneven ledges
    if (s > best) { best = s; STK_T = k.top + 1.5 * nM(x / 9 + k.ph, y / 9) - 3 * (dd / rr) ** 2; }   // a gently domed, lumpy top
  }
  return best;
}
// cenotes: round sinkholes inland with sheer rock walls and clear deep water a few metres down (lake water). Laid out once per seed.
let CENOTES = null;
function cenotes() {
  if (CENOTES) return CENOTES; CENOTES = []; if (!ISL) buildIsland();
  const R = CONFIG.islandSize / 2, rng = mulberry32((SEED ^ 0xce707e) >>> 0), pick = ([a, b]) => a + (b - a) * rng();
  for (const F of BUILTIN.feature.filter(f => f.type === 'cenotes')) {
    if (rng() >= (F.chance[CLIMATE.key] ?? 0)) continue;
    for (let n = Math.round(pick(F.count)), tries = 0; n > 0 && tries < 400; tries++) {
      const a = rng() * 6.2832, d = Math.sqrt(rng()) * R, x = Math.cos(a) * d, y = Math.sin(a) * d, r = pick(F.radius_m), drop = pick(F.drop_m);
      if (!inGrid(x, y) || bil(ISL.wet, x, y) > 0.05) continue;   // dry land, clear of lakes and rivers
      let lo = 1e9, hi = -1e9, qlo = 0; for (let k = 0; k < 12; k++) { const q = k / 12 * 6.2832, h = landH(x + Math.cos(q) * (r + 6), y + Math.sin(q) * (r + 6)); if (h < lo) { lo = h; qlo = q; } hi = Math.max(hi, h); }
      if (hi - lo > 4 || lo < WLW + drop + 2 || CENOTES.some(c => Math.hypot(c.cx - x, c.cy - y) < c.R + r + 60)) continue;   // flat ground, well above the sea, apart
      const free = F.names.filter(m => !CENOTES.some(c => c.name === m + ' Cenote')), nm = free.length ? free[Math.floor(rng() * free.length)] : 'Deep';   // no two alike
      const roof = rng() < (F.cave ?? 0), ro = r * pick(F.opening ?? [0.4, 0.4]);   // roof: a cave cenote (models/cenote-caves.js), ro: its opening's radius
      const c = { cx: x, cy: y, R: r, lev: lo - drop, D: pick(F.depth_m), kind: LAKE, cenote: true, roof, ro, ph: rng() * 100, id: 'cenote' + CENOTES.length, name: nm + ' Cenote' };
      // the way in: on its lowest side the wall has slumped into a long gentle slope down into the water (cenoteRamp)
      c.rux = Math.cos(qlo); c.ruy = Math.sin(qlo); c.rw = Math.max(4, 0.3 * r); c.ra0 = 0.5 * r; c.rlen = c.ra0 + (hi + 2 - c.lev + 1.5) / RAMP_K + 10;
      CENOTES.push(c); n--;
    }
  }
  return CENOTES;
}
let CEN_D = 0, CEN_R = 0;   // distance from the centre and the (ragged) radius of the cenote found by the last cenoteAt()
function cenoteAt(x, y) {
  for (const c of CENOTES || cenotes()) {
    const dx = x - c.cx, dy = y - c.cy; if (Math.abs(dx) > c.R * 1.3 + 3 || Math.abs(dy) > c.R * 1.3 + 3) continue;
    const d = Math.hypot(dx, dy) + 1e-6, rr = c.R * (1 + 0.15 * nM(dx / d * 1.4 + c.ph, dy / d * 1.4));
    if (d < rr + 2) { CEN_D = d; CEN_R = rr; return c; }
  }
  return null;
}
// a cenote's ramp near (x, y): a, distance along it from the centre; b, distance off its middle; z, its surface there. Or null
const RAMP_K = 0.25;   // its slope
function cenoteRamp(x, y) {
  for (const c of CENOTES || cenotes()) {
    const dx = x - c.cx, dy = y - c.cy, a = dx * c.rux + dy * c.ruy; if (a < c.ra0 - 6 || a > c.rlen) continue;
    const b = Math.abs(dx * c.ruy - dy * c.rux); if (b > c.rw + 40) continue;
    return { c, a, b, z: c.lev - 1.5 + (a - c.ra0) * RAMP_K };
  }
  return null;
}
// how much (x, y) is the ramp's floor, 0..1 (its flanks fade out wider the deeper the cut); hb: the ground without the ramp
function rampW(r, hb) { const cut = Math.max(0, hb - r.z); return (1 - sstep(r.c.rw, r.c.rw + 3 + cut * 1.6, r.b)) * sstep(r.c.ra0 - 6, r.c.ra0, r.a) * (1 - sstep(r.c.rlen - 8, r.c.rlen, r.a)); }
