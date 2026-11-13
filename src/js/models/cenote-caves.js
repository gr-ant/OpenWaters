'use strict';
// Cave cenotes: a rock roof over most of the pit, flush with the ground, with a ragged opening the light falls through.
// The ceiling arches down towards the walls and drips stalactites. The terrain stays a heightfield (the pit is carved
// in world()); the roof is its own mesh, and the lit and water shaders darken what lies under it (CAVE_GLSL in lit.js).
// the roof over (x, y): { c, top, under } or null. top: the walkable surface; under: the ceiling
function caveRoofAt(x, y) {
  for (const c of CENOTES || cenotes()) {
    if (!c.roof) continue; const dx = x - c.cx, dy = y - c.cy, d = Math.hypot(dx, dy) + 1e-6; if (d > c.R + 1.5) continue;
    const ro = c.ro * (1 + 0.22 * nM(dx / d * 1.3 + c.ph + 5, dy / d * 1.3)); if (d < ro) return null;   // the opening
    if (caveGap(c, dx, dy)) return null;   // the roof has fallen in over the ramp
    const a = dx * c.rux + dy * c.ruy, gb = Math.abs(dx * c.ruy - dy * c.rux) - (c.rw + 2), gap = a > 0 ? gb : Math.hypot(a, Math.max(0, gb));   // distance to the gap's edge
    const top = landH(x, y) + 0.04, lip = top - 1.2, u = clamp(Math.min(d - ro, gap) / (c.R - ro), 0, 1);   // the ceiling arches up to a thin lip at the opening and along the gap
    return { c, top, under: lip + (c.lev + 1 - lip) * u ** 1.7 };
  }
  return null;
}
// over the ramp (cenoteRamp) the roof is gone: a gap as wide as the ramp's floor plus a little, from the opening out
const caveGap = (c, dx, dy) => dx * c.rux + dy * c.ruy > 0 && Math.abs(dx * c.ruy - dy * c.rux) < c.rw + 2;
// the roof mesh, in the cenote's own frame (centre at 0, 0)
function caveMesh(c) {
  const B = meshBuilder(), A = 72, K = 9, rnd = mulberry32((c.ph * 1e4) | 0), rockC = [0.44, 0.41, 0.37];
  const ground = (() => { const x = c.cx + c.R * 1.3 + 6, y = c.cy; return MATS[material(world(x, y), moist(x, y), x, y)].col; })();   // the ground round it, for the roof's top
  const P = [], T = [], U = [], S = [];   // per ring and angle: xy, top z, ceiling z, open (the gap over the ramp)
  for (let k = 0; k < K; k++) { P.push([]); T.push([]); U.push([]); S.push([]);
    for (let a = 0; a < A; a++) { const q = a / A * 6.2832, ux = Math.cos(q), uy = Math.sin(q), ro = c.ro * (1 + 0.22 * nM(ux * 1.3 + c.ph + 5, uy * 1.3)) + 0.02;
      const r = ro + (c.R + 1.5 - ro) * k / (K - 1), x = c.cx + ux * r, y = c.cy + uy * r, R = caveRoofAt(x, y) || { top: landH(x, y) + 0.04, under: c.lev + 1 };
      S[k].push(caveGap(c, x - c.cx, y - c.cy)); P[k].push([ux * r, uy * r]); T[k].push(R.top); U[k].push(R.under - (k && k < K - 1 ? 0.5 * nM(x / 2.2, y / 2.2) : 0)); } }   // a lumpy ceiling
  const v = (k, a, z) => [P[k][a % A][0], P[k][a % A][1], z];
  const open = (k, a) => k < 0 || k >= K - 1 ? false : S[k][a % A] || S[k + 1][a % A] || S[k][(a + 1) % A] || S[k + 1][(a + 1) % A];   // a quad touching the gap is left out
  for (let k = 0; k < K - 1; k++) for (let a = 0; a < A; a++) {
    if (open(k, a)) continue;
    { const wall = (k1, a1, k2, a2) => { B.mat = MT.ROCK; B.quad(v(k1, a1, T[k1][a1 % A]), v(k2, a2, T[k2][a2 % A]), v(k2, a2, U[k2][a2 % A]), v(k1, a1, U[k1][a1 % A]), rockC, mid); };   // the gap's sides, facing into it
      const mid = [(P[k][a][0] + P[k + 1][(a + 1) % A][0]) / 2, (P[k][a][1] + P[k + 1][(a + 1) % A][1]) / 2, (T[k][a] + U[k][a]) / 2];
      if (open(k, a + A - 1)) wall(k, a, k + 1, a); if (open(k, a + 1)) wall(k, a + 1, k + 1, a + 1);
      if (open(k - 1, a)) wall(k, a, k, a + 1); if (open(k + 1, a)) wall(k + 1, a, k + 1, a + 1); }
    const t = (kk, aa) => v(kk, aa, T[kk][aa % A]), u = (kk, aa) => v(kk, aa, U[kk][aa % A]), lipK = k === 0 ? 0.6 : 0;   // the top's inner ring is bare rock
    B.mat = MT.GEN; const tc = ground.map((g, i) => g + (rockC[i] - g) * lipK);
    B.quad(t(k, a), t(k + 1, a), t(k + 1, a + 1), t(k, a + 1), tc, [0, 0, T[k][a] - 50]);   // the top: faces up
    B.mat = MT.ROCK; const sh = 0.8 + 0.25 * rnd();
    B.quad(u(k, a), u(k + 1, a), u(k + 1, a + 1), u(k, a + 1), rockC.map(g => g * sh), [0, 0, T[k][a] + 50]);   // the ceiling: faces down
  }
  B.mat = MT.ROCK;
  for (let a = 0; a < A; a++) { const o = [P[0][a][0] * 3, P[0][a][1] * 3, T[0][a]];   // the opening's rim: faces into the hole
    B.quad(v(0, a, T[0][a]), v(0, a + 1, T[0][(a + 1) % A]), v(0, a + 1, U[0][(a + 1) % A]), v(0, a, U[0][a]), rockC, o); }
  for (let n = 0; n < 26 + c.R * 1.5; n++) {   // stalactites, longer where the ceiling is high
    const k = 1 + Math.floor(rnd() * (K - 3)), a = Math.floor(rnd() * A), z = U[k][a] + 0.1, room = z - c.lev, len = Math.min(room - 0.4, 0.4 + rnd() * 2.2 * Math.min(1, room / 5));
    if (len > 0.25) B.tube([P[k][a][0], P[k][a][1], z], [P[k][a][0] + (rnd() - 0.5) * 0.1, P[k][a][1] + (rnd() - 0.5) * 0.1, z - len], 0.1 + 0.08 * len, 0.02, 5, rockC.map(g => g * (1 + 0.15 * rnd())), false);
  }
  return new Float32Array(B.v);
}
Object.assign(Engine, {
  // roofed cenotes near the camera, nearest first (the shaders take four)
  cavesNear(E, R = 600) {   // remembered per radius until the camera moves (asked several times a frame)
    const m = this.caveMemo || (this.caveMemo = {}), o = m[R]; if (o && o.x === E[0] && o.y === E[1]) return o.near;
    return (m[R] = { x: E[0], y: E[1], near: (CENOTES || cenotes()).filter(c => c.roof && Math.abs(c.cx - E[0]) < R && Math.abs(c.cy - E[1]) < R).sort((a, b) => Math.hypot(a.cx - E[0], a.cy - E[1]) - Math.hypot(b.cx - E[0], b.cy - E[1])).slice(0, 4) }).near; },
  // CAVE_GLSL's uniforms for a program: centre, opening and roof radius; roof height
  caveUniforms(gl, prog, E) {
    const near = this.cavesNear(E), a = this.caveUni || (this.caveUni = new Float32Array(16)), z = this.caveZ || (this.caveZ = new Float32Array(4));
    const g = this.caveGapU || (this.caveGapU = new Float32Array(12));
    if (near !== this.caveFor) { this.caveFor = near; a.fill(0); z.fill(0); g.fill(0);   // refill only when the list changes
      near.forEach((c, i) => { a.set([c.cx, c.cy, c.ro, c.R], i * 4); z[i] = c.roofZ ??= landH(c.cx + c.R * 0.6, c.cy) + 0.04; g.set([c.rux, c.ruy, c.rw + 2], i * 3); }); }
    if (prog.u['cav[0]']) gl.uniform4fv(prog.u['cav[0]'], a); if (prog.u['cavz[0]']) gl.uniform1fv(prog.u['cavz[0]'], z); if (prog.u['cavg[0]']) gl.uniform3fv(prog.u['cavg[0]'], g);
  },
  drawCaves(gl, drawInst, E) {
    const near = this.cavesNear(E, 500); if (!near.length) return; const cull = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
    for (const c of near) { if (!c.gpu) c.gpu = this.instMesh(caveMesh(c));
      drawInst(c.gpu, [c.cx, c.cy, 0, 1, 0, 0.5]); }
    if (cull) gl.enable(gl.CULL_FACE);
  },
});
