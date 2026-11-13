'use strict';
// Questions about the water at a point: flowAt (current), waterInfo (name, kind, depth, murk...), findWater (a bank spot), standZ.
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
    oxygen: depth > 0 ? oxygen(kind, temp, Math.min(depth, 0.5), rapids) : 0, flow: { x: f[0], y: f[1], speed: f[2] }, id: obj ? obj.id : kind === OCEAN ? 'sea' : sg >= 0 ? `${name}#${ISL.chains[ISL.segC[sg]].sys}` : name };   // (creek names repeat: the drainage system tells two apart)
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
