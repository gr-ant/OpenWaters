'use strict';
// Tackle meshes: the 3D rod with its guides and line, the reel and its moving parts, hooks, lures, baits, floats and sinkers.
// ---- tackle meshes (model units are metres; x points along the rod / the way the lure faces) ----
// the rod's bent shape in its own plane: points [x, z] from the butt to the tip
const ROD_BEND_STEPS = 32;
const rodBendLevel = bend => Math.round(clamp(bend, 0, 1) * (ROD_BEND_STEPS - 1));
function rodCurve(L, bend, n = 12, action = 'fast') {
  const h = 0.42, pts = [[-0.3, 0]]; let x = -0.3, z = 0, th = 0, s = 0; const ds = L / n;
  for (let i = 1; i <= n; i++) { s = i * ds; const u = clamp((s - h) / (L - h), 0, 1); th = -bend * 1.25 * u ** ({ slow: 0.75, moderate: 1.1, fast: 1.5, extra_fast: 2.1 }[action] || 1.5); x += Math.cos(th) * ds; z += Math.sin(th) * ds; pts.push([x, z]); }
  return pts;
}
// The same bend sample and tip-guide centre are used by the mesh and the line.
function rodLineAnchor(S, bend) {
  const pts = rodCurve(S.rodLen, rodBendLevel(bend) / (ROD_BEND_STEPS - 1), 12, S.rod.action);
  const a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
  const side = S.rod.reel === 'spinning' ? -1 : 1, offset = 0.022 * 0.4 + 0.006 + 0.01 * 0.3 + 0.0028;
  return [b[0] - dz / d * side * offset, b[1] + dx / d * side * offset];
}
function rodMesh(S, bend) {
  const B = meshBuilder(), R = S.rod, RL = S.reel, L = R.length_m, pts = rodCurve(L, bend, 12, R.action), n = pts.length - 1, top = R.reel !== 'spinning';
  const c = k => hexRGB(R.colors[k]), cr = k => hexRGB(RL.colors[k]), P3 = q => [q[0], 0, q[1]];
  const rad = i => 0.0125 * (1 - i / n) ** 0.9 + 0.0018 * (L > 3 ? 1.4 : 1);
  B.mat = MT.CLOTH; B.tube([-0.3, 0, 0], [-0.04, 0, 0], 0.016, 0.014, 7, c('handle'), true);          // rear grip
  B.tube([0.07, 0, 0], [0.24, 0, 0], 0.013, 0.012, 7, c('handle'), true);                           // fore grip
  B.mat = MT.METAL; B.tube([-0.05, 0, 0], [0.08, 0, 0], 0.011, 0.011, 7, [0.25, 0.26, 0.28], false);  // reel seat
  B.mat = MT.GEN;
  for (let i = 0; i < n; i++) B.tube(P3(pts[i]), P3(pts[i + 1]), rad(i), rad(i + 1), 6, c('blank'), i === n - 1);
  B.mat = MT.METAL; const ng = R.guides, sg = top ? 1 : -1;
  for (let g = 0; g < ng; g++) { // guides: rings on little feet, shrinking toward the tip
    const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, fi = t * n, i = Math.min(n - 1, fi | 0), u = fi - i, q = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], dl = Math.hypot(dx, dz), nx = -dz / dl * sg, nz = dx / dl * sg, hgt = 0.022 * (1 - 0.6 * t) + 0.006, rr = 0.01 * (1 - 0.7 * t) + 0.0028;
    B.tube([q[0], 0, q[1]], [q[0] + nx * hgt, 0, q[1] + nz * hgt], 0.0016, 0.0016, 4, [0.7, 0.72, 0.75], false);
    const cx = q[0] + nx * (hgt + rr), cz = q[1] + nz * (hgt + rr);
    for (let k = 0; k < 6; k++) { const a0 = k / 6 * 6.2832, a1 = (k + 1) / 6 * 6.2832; B.tube([cx + nx * Math.cos(a0) * rr, Math.sin(a0) * rr, cz + nz * Math.cos(a0) * rr], [cx + nx * Math.cos(a1) * rr, Math.sin(a1) * rr, cz + nz * Math.cos(a1) * rr], 0.0014, 0.0014, 3, [0.75, 0.77, 0.8], false); }
  }
  B.mat = MT.CLOTH; for (let g = 0; g < ng; g++) { const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, i = Math.min(n - 1, t * n | 0); B.tube(P3(pts[i]), P3(pts[i + 1 > n ? n : i + 1]).map((v, k) => P3(pts[i])[k] + (v - P3(pts[i])[k]) * 0.15), rad(i) * 1.25, rad(i) * 1.25, 6, c('wraps'), false); }
  // the reel's frame; its moving parts (handle, bail, line on the spool, drag) are drawn on their own
  // (reelPartMesh) so they can turn and change as you fish
  B.mat = MT.METAL;
  if (RL.kind === 'spinning') {
    B.tube([0.01, 0, 0], [0.01, 0, -0.07 * 1], 0.006, 0.006, 5, cr('body'), false);                // stem
    B.blob([0.0, 0, -0.085], 0.04, 0.026, 0.026, 5, 8, cr('body'));                                    // gearbox
    B.tube([0.035, 0, -0.085], [0.04, 0, -0.085], 0.031, 0.031, 12, cr('spool'), true);               // spool: back flange,
    B.tube([0.038, 0, -0.085], [0.074, 0, -0.085], 0.015, 0.015, 10, cr('spool'), false);             // arbor,
    B.tube([0.072, 0, -0.085], [0.076, 0, -0.085], 0.031, 0.031, 12, cr('spool'), true);              // front lip
    B.tube([0.0, 0.02, -0.085], [0.0, 0.03, -0.085], 0.009, 0.009, 6, cr('body'), true);              // handle boss
  } else if (RL.kind === 'baitcaster') {
    B.blob([0.0, -0.03, 0.032], 0.035, 0.009, 0.026, 4, 8, cr('body'));                                // side plates
    B.blob([0.0, 0.03, 0.032], 0.035, 0.009, 0.026, 4, 8, cr('body'));
    B.tube([0.0, -0.025, 0.032], [0.0, 0.025, 0.032], 0.006, 0.006, 8, cr('spool'), false);            // arbor
    B.tube([-0.03, -0.024, 0.016], [-0.03, 0.024, 0.016], 0.004, 0.004, 5, cr('body'), false);         // thumb bar rail
  } else { // conventional / lever drag: a drum across the rod
    B.tube([0.0, -0.05, 0.05], [0.0, -0.044, 0.05], 0.05, 0.05, 14, cr('body'), true);                 // side plates
    B.tube([0.0, 0.044, 0.05], [0.0, 0.05, 0.05], 0.05, 0.05, 14, cr('body'), true);
    B.tube([0.0, -0.044, 0.05], [0.0, 0.044, 0.05], 0.018, 0.018, 10, cr('spool'), false);              // arbor
    B.tube([-0.045, -0.044, 0.02], [-0.045, 0.044, 0.02], 0.005, 0.005, 5, cr('body'), false);          // pillars
    B.tube([0.045, -0.044, 0.02], [0.045, 0.044, 0.02], 0.005, 0.005, 5, cr('body'), false);
    B.tube([-0.02, 0, 0.0], [0.02, 0, 0.0], 0.012, 0.012, 6, cr('body'), false);
  }
  // the line from the spool up through the guides to the tip
  if (S.line) { B.mat = MT.CLOTH; const lc = hexRGB(S.line.colors.line), path = rodLinePath(S, bend); path.push([pts[n][0], 0, pts[n][1]]);
    for (let i = 0; i < path.length - 1; i++) B.tube(path[i], path[i + 1], 0.0011, 0.0011, 3, lc, false); }
  const tip = pts[n]; return { mesh: new Float32Array(B.v), tip: [tip[0] + sg * 0.004, tip[1]] };
}
// the line's path along the rod in rod-local metres: out of the reel, through every guide, to the tip (same guide
// placement as rodMesh), so the line can be drawn running up the blank
function rodLinePath(S, bend) {
  const R = S.rod, L = R.length_m, pts = rodCurve(L, bend, 12, R.action), n = pts.length - 1, sg = R.reel !== 'spinning' ? 1 : -1, ng = R.guides, out = [];
  const k = S.reel && S.reel.kind;
  out.push(k === 'baitcaster' ? [0.01, 0, 0.044] : k === 'conventional' ? [0.02, 0, 0.09] : [0.08, 0, -0.085]);   // where the line leaves the spool
  for (let g = 0; g < ng; g++) {
    const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, fi = t * n, i = Math.min(n - 1, fi | 0), u = fi - i, q = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], dl = Math.hypot(dx, dz), nx = -dz / dl * sg, nz = dx / dl * sg, hgt = 0.022 * (1 - 0.6 * t) + 0.006, rr = 0.01 * (1 - 0.7 * t) + 0.0028;
    out.push([q[0] + nx * (hgt + rr), 0, q[1] + nz * (hgt + rr)]);
  }
  return out;
}
// where the reel's moving parts sit on the rod (rod-local metres) and what turns them: the handle turns about its axle
// (across the rod), the spinning bail flips over the spool
const REEL_PARTS = {
  spinning: { handle: [0, 0.03, -0.085], bail: [0.06, 0, -0.085], reel: [0.03, 0, -0.085] },
  baitcaster: { handle: [0, 0.045, 0.032], free: [-0.03, 0, 0.016], reel: [0, 0, 0.032] },
  conventional: { handle: [0, 0.056, 0.05], free: [0.02, -0.056, 0.07], reel: [0, 0, 0.05] },
};
// a moving part of the reel, built around its pivot. part: handle | bail | free | line (q = how full, 0..1) | drag (q = setting 0..1)
function reelPartMesh(S, part, q = 0) {
  const B = meshBuilder(), RL = S.reel, k = REEL_PARTS[RL.kind] ? RL.kind : 'spinning', cr = c => hexRGB(RL.colors[c]), gold = [0.92, 0.72, 0.25], wire = [0.85, 0.87, 0.9];
  B.mat = MT.METAL;
  if (part === 'handle') {   // axle stub, arm across it, a knob sticking out sideways at the end (two on a baitcaster)
    const arm = k === 'conventional' ? 0.065 : k === 'baitcaster' ? 0.035 : 0.05, kn = k === 'conventional' ? 0.013 : 0.009;
    B.tube([0, 0, 0], [0, 0.01, 0], 0.005, 0.005, 6, cr('handle'), false);
    for (const sg of k === 'baitcaster' ? [1, -1] : [1]) { B.tube([0, 0.01, 0], [0, 0.01, sg * arm], 0.004, 0.004, 5, cr('handle'), false);
      B.mat = MT.CLOTH; B.blob([0, 0.022, sg * arm], kn, 0.013, kn, 4, 7, cr('handle')); B.mat = MT.METAL; }
  } else if (part === 'bail') {   // the wire hoop round the front of the spool (closed: hanging below it)
    const r = 0.034, n = 10; for (let i = 0; i < n; i++) { const a0 = Math.PI + i / n * Math.PI, a1 = Math.PI + (i + 1) / n * Math.PI;
      B.tube([0, Math.cos(a0) * r, Math.sin(a0) * r], [0, Math.cos(a1) * r, Math.sin(a1) * r], 0.0022, 0.0022, 4, wire, false); }
    B.tube([-0.025, -r, 0], [0, -r, 0], 0.0025, 0.0025, 4, wire, false); B.tube([-0.025, r, 0], [0, r, 0], 0.0025, 0.0025, 4, wire, false);
    B.blob([0, r, 0], 0.005, 0.005, 0.005, 3, 6, gold);   // line roller
  } else if (part === 'free') {   // baitcaster thumb bar / conventional free-spool lever (pressed / flipped by the pitch it's drawn at)
    if (k === 'baitcaster') B.tube([0, -0.022, 0], [0, 0.022, 0], 0.006, 0.006, 6, [0.9, 0.86, 0.78], true);
    else { B.tube([0, 0, 0], [-0.03, 0, 0.012], 0.004, 0.004, 5, wire, false); B.blob([-0.03, 0, 0.012], 0.006, 0.006, 0.006, 3, 6, [0.2, 0.2, 0.22]); }
  } else if (part === 'line') {   // the line on the spool: thicker the fuller it is
    const lc = S.line.material === 'braid' ? [0.37, 0.54, 0.35] : S.line.material === 'fluoro' ? [0.8, 0.88, 0.9] : [0.92, 0.89, 0.78];
    B.mat = MT.CLOTH;
    if (k === 'spinning') B.tube([0.04, 0, -0.085], [0.072, 0, -0.085], 0.016 + 0.013 * q, 0.016 + 0.013 * q, 12, lc, false);
    else if (k === 'baitcaster') B.tube([0, -0.024, 0.032], [0, 0.024, 0.032], 0.007 + 0.011 * q, 0.007 + 0.011 * q, 10, lc, false);
    else B.tube([0, -0.043, 0.05], [0, 0.043, 0.05], 0.019 + 0.027 * q, 0.019 + 0.027 * q, 12, lc, false);
  } else if (part === 'drag') {   // the drag: front knob with a pointer (spinning), star wheel (baitcaster), red lever (conventional)
    const a = -2.4 + 4.8 * q;
    if (k === 'spinning') { B.tube([0.076, 0, -0.085], [0.086, 0, -0.085], 0.012, 0.011, 8, cr('body'), true);
      B.tube([0.087, 0, -0.085], [0.087, Math.sin(a) * 0.011, -0.085 + Math.cos(a) * 0.011], 0.0022, 0.0022, 3, gold, false); }
    else if (k === 'baitcaster') { const c = [0, 0.04, 0.032]; for (let i = 0; i < 5; i++) { const b = a + i * 1.2566; B.tube(c, [c[0] + Math.cos(b) * 0.02, c[1], c[2] + Math.sin(b) * 0.02], 0.004, 0.002, 4, wire, false); } }
    else { const c = [0, 0.053, 0.05]; B.tube(c, [c[0] + Math.cos(a * 0.5 + 1.2) * 0.04, c[1], c[2] + Math.sin(a * 0.5 + 1.2) * 0.04], 0.004, 0.004, 5, [0.85, 0.2, 0.18], false); }
  }
  return new Float32Array(B.v);
}
// treble or single hook, hanging from (x, 0, z), size in metres
function hookShape(B, x, z, sz, kind) {
  const mc = [0.62, 0.64, 0.68]; B.mat = MT.METAL;
  const one = (a) => { const ca = Math.cos(a), sa = Math.sin(a), p = (u, w) => [x + u * sz * 0.25, w * sz * ca, z + w * sz * sa - u * sz];
    B.tube(p(0, 0), p(0.6, 0.1), sz * 0.05, sz * 0.05, 3, mc, false); B.tube(p(0.6, 0.1), p(1, 0.5), sz * 0.05, sz * 0.05, 3, mc, false); B.tube(p(1, 0.5), p(0.5, 0.8), sz * 0.05, sz * 0.03, 3, mc, false); };
  B.tube([x, 0, z + sz * 0.25], [x, 0, z], sz * 0.05, sz * 0.05, 3, mc, false);
  if (kind === 'treble') for (let k = 0; k < 3; k++) one(k * 2.094 + 1.57); else one(1.57);
}
function lureMesh(d) {
  const B = meshBuilder(true), C = k => hexRGB(d.colors[k]), Lm = d.size_cm / 100, st = d.style;
  if (st === 'spinner') {
    B.mat = MT.METAL; B.tube([-Lm * 0.5, 0, 0], [Lm * 0.5, 0, 0], Lm * 0.012, Lm * 0.012, 4, [0.7, 0.7, 0.72], false);
    B.blob([-Lm * 0.05, 0, 0], Lm * 0.2, Lm * 0.08, Lm * 0.08, 5, 8, C('body'));
    B.blob([Lm * 0.15, 0, 0], Lm * 0.05, Lm * 0.05, Lm * 0.05, 4, 6, C('accent'));
    B.blob([Lm * 0.05, Lm * 0.09, 0], Lm * 0.2, Lm * 0.11, Lm * 0.015, 5, 8, C('blade'));   // the blade, flashing out to the side
    hookShape(B, -Lm * 0.45, 0, Lm * 0.28, 'treble');
  } else if (st === 'crankbait' || st === 'popper') {
    const segs = 10, cb = C('back'), cv = C('body'), cl = C('belly');
    B.mat = MT.GEN; const rx = Lm * 0.5, ry = Lm * 0.12, rz = Lm * (st === 'popper' ? 0.15 : 0.16);
    for (let i = 0; i < 8; i++) for (let j = 0; j < segs; j++) { // body of revolution along x
      const V = (ii, jj) => { const t = ii / 8, xx = (t - 0.5) * 2 * rx, r = Math.sin(t * Math.PI) ** (st === 'popper' ? 0.45 : 0.6) * (1 - (st === 'popper' ? 0 : 0.15 * t)), a = jj / segs * 6.2832; return [xx, Math.cos(a) * ry * r, Math.sin(a) * rz * r]; };
      const col = (jj) => { const s = Math.sin(jj / segs * 6.2832); return s > 0.45 ? cb : s < -0.45 ? cl : cv; };
      const p00 = V(i, j), p01 = V(i, j + 1), p11 = V(i + 1, j + 1), p10 = V(i + 1, j), cc = col(j + 0.5);
      B.quad(p00, p01, p11, p10, cc, [p00[0], 0, 0]);
    }
    B.blob([rx * 0.72, ry * 0.75, rz * 0.25], Lm * 0.035, Lm * 0.02, Lm * 0.035, 3, 6, [0.95, 0.85, 0.2]); B.blob([rx * 0.72, -ry * 0.75, rz * 0.25], Lm * 0.035, Lm * 0.02, Lm * 0.035, 3, 6, [0.95, 0.85, 0.2]);
    if (st === 'crankbait') { B.mat = MT.GLASS; B.quad([rx * 0.92, -ry * 0.7, -rz * 0.1], [rx * 0.92, ry * 0.7, -rz * 0.1], [rx * 1.35, ry * 0.8, -rz * 0.9], [rx * 1.35, -ry * 0.8, -rz * 0.9], [0.85, 0.9, 0.92], [rx, 0, 0]); }
    else { B.mat = MT.GEN; B.blob([rx * 0.98, 0, 0], Lm * 0.02, ry * 0.8, rz * 0.8, 3, 8, C('accent')); }
    hookShape(B, -rx * 0.2, -rz * 0.9, Lm * 0.22, 'treble'); hookShape(B, -rx * 0.95, 0, Lm * 0.22, 'treble');
  } else if (st === 'soft_plastic') {
    B.mat = MT.GEN; const n = 10; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n, x = (0.5 - t) * Lm, y = Math.sin(t * 7) * Lm * 0.05 * t, r = Lm * 0.035 * (1 - 0.75 * t ** 2); const q = [x, y, 0]; if (prev) B.tube(prev[0], q, prev[1], r, 6, i < 2 ? C('accent') : C('body'), i === n); prev = [q, r]; }
    hookShape(B, Lm * 0.3, Lm * 0.03, Lm * 0.16, 'single');
  } else if (st === 'jig' || st === 'skirt') {
    const hd = st === 'jig' ? Lm * 0.14 : Lm * 0.12;
    B.mat = st === 'jig' ? MT.METAL : MT.GLASS; B.blob([Lm * 0.36, 0, 0], hd * (st === 'skirt' ? 1.5 : 1), hd, hd, 5, 8, st === 'jig' ? C('accent') : C('back'));
    B.blob([Lm * 0.36 + hd * 0.4, hd * 0.7, hd * 0.3], hd * 0.22, hd * 0.12, hd * 0.22, 3, 5, [0.95, 0.9, 0.2]); B.blob([Lm * 0.36 + hd * 0.4, -hd * 0.7, hd * 0.3], hd * 0.22, hd * 0.12, hd * 0.22, 3, 5, [0.95, 0.9, 0.2]);
    B.mat = MT.CLOTH; const ns = st === 'jig' ? 14 : 12;
    for (let k = 0; k < ns; k++) { const a = k / ns * 6.2832, r = hd * 0.8, L2 = Lm * (0.62 + 0.12 * Math.sin(k * 2.3)), col = st === 'skirt' && k % 3 === 1 ? C('accent') : st === 'skirt' && k % 3 === 2 ? C('belly') : C('body');
      B.tube([Lm * 0.3, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7], [Lm * 0.3 - L2, Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6], Lm * 0.012, Lm * 0.004, 3, col, false); }
    hookShape(B, -Lm * 0.2, 0, Lm * (st === 'jig' ? 0.3 : 0.18), 'single');
  } else { // spoon: a curved, polished slab
    B.mat = MT.METAL; const n = 7, m = 5, cc = C('body'), ca = C('accent');
    const V = (i, j) => { const t = i / n, u = j / m - 0.5, w = Math.sin(t * Math.PI) ** 0.7 * (0.55 + 0.45 * t), x = (t - 0.5) * Lm, y = u * Lm * 0.36 * w; return [x, y, -(Math.abs(u) ** 2) * Lm * 0.25 * w + Lm * 0.03]; };
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = V(i, j), b = V(i, j + 1), c2 = V(i + 1, j + 1), e = V(i + 1, j); B.quad(a, b, c2, e, i === 0 && j % 2 ? ca : cc, [a[0], 0, Lm]); B.quad(a, e, c2, b, cc, [a[0], 0, -Lm]); }
    hookShape(B, -Lm * 0.5, 0, Lm * 0.3, 'treble');
  }
  return new Float32Array(B.v);
}
function baitMesh(S) {
  const B = meshBuilder(true), d = S.bait, h = S.hook, C = k => hexRGB(d.colors[k]), Lm = d.size_cm / 100, hs = clamp(h.gap_mm / 1000 * 1.6, 0.008, 0.05);
  hookShape(B, 0, 0, hs, h.style === 'treble' ? 'treble' : 'single'); B.mat = MT.GEN;
  if (d.shape === 'worm') { let prev = null; for (let i = 0; i <= 10; i++) { const t = i / 10, q = [Math.sin(t * 5) * Lm * 0.12, Math.cos(t * 4) * Lm * 0.1, -t * Lm * 0.7 + Lm * 0.1], r = Lm * 0.04 * (0.6 + 0.4 * Math.sin(t * 3.1)); if (prev) B.tube(prev[0], q, prev[1], r, 6, i === 3 ? C('accent') : C('body'), i === 10); prev = [q, r]; } }
  else if (d.shape === 'cricket') { B.blob([0, 0, -hs * 0.5], Lm * 0.5, Lm * 0.2, Lm * 0.2, 4, 6, C('body')); for (const s of [-1, 1]) B.tube([-Lm * 0.1, s * Lm * 0.15, -hs * 0.5], [-Lm * 0.45, s * Lm * 0.3, -hs * 0.5 + Lm * 0.3], Lm * 0.04, Lm * 0.02, 3, C('accent'), false); }
  else if (d.shape === 'minnow' || d.shape === 'strip') { const fl = d.shape === 'strip'; B.blob([-Lm * 0.3, 0, -hs * 0.3], Lm * 0.5, fl ? Lm * 0.14 : Lm * 0.08, fl ? Lm * 0.02 : Lm * 0.11, 5, 8, (i) => i < 2 ? C('accent') : C('body')); if (!fl) B.quad([-Lm * 0.75, 0, -hs * 0.3], [-Lm * 0.95, 0, -hs * 0.3 + Lm * 0.12], [-Lm * 0.95, 0, -hs * 0.3 - Lm * 0.12], [-Lm * 0.75, 0, -hs * 0.3], C('accent'), [-Lm, 0.01, 0]); }
  else if (d.shape === 'shrimp') { let prev = null; for (let i = 0; i <= 7; i++) { const a = i / 7 * 2.6, q = [Math.cos(a) * Lm * 0.3, 0, -Math.sin(a) * Lm * 0.3 - hs * 0.2], r = Lm * 0.09 * (1 - 0.6 * i / 7); if (prev) B.tube(prev[0], q, prev[1], r, 6, i > 5 ? C('accent') : C('body'), i === 7); prev = [q, r]; } }
  else for (let k = 0; k < 3; k++) B.blob([0, (k - 1) * Lm * 0.6, -hs * 0.4 - k * 0.002], Lm * 0.5, Lm * 0.45, Lm * 0.4, 3, 6, C('body'));
  return new Float32Array(B.v);
}
function floatMesh(d) {
  const B = meshBuilder(true), r = d.size_mm / 2000, top = hexRGB(d.colors.top), bot = hexRGB(d.colors.bottom); B.mat = MT.GEN;
  if (d.kind === 'fixed') B.blob([0, 0, 0], r, r, r, 6, 10, i => i < 3 ? top : bot);
  else { B.blob([0, 0, -r * 1.6], r, r, r * 3.2, 7, 10, i => i < 2 ? top : bot); B.tube([0, 0, 0], [0, 0, r * 3.5], r * 0.25, r * 0.2, 5, top, true); }
  B.mat = MT.METAL; B.tube([0, 0, d.kind === 'fixed' ? r : r * 3.5], [0, 0, (d.kind === 'fixed' ? r : r * 3.5) + 0.006], 0.0015, 0.0015, 3, [0.7, 0.7, 0.7], false);
  return new Float32Array(B.v);
}
function sinkerMesh(d) { const B = meshBuilder(true), r = clamp(Math.cbrt(d.weight_g / 11.3 / 4.19) / 100, 0.002, 0.04); B.mat = MT.METAL;
  if (d.shape === 'pyramid') { const a = [0, 0, r * 1.2], c = [[r, r, -r], [-r, r, -r], [-r, -r, -r], [r, -r, -r]].map(q => q.map(v => v * 1.1)), g = [0.45, 0.46, 0.48]; for (let k = 0; k < 4; k++) B.tri(a, c[k], c[(k + 1) % 4], g, [0, 0, 0]); B.quad(...c, g, [0, 0, 0]); }
  else B.blob([0, 0, 0], d.shape === 'egg' ? r * 0.8 : r, d.shape === 'egg' ? r * 0.8 : r, d.shape === 'egg' ? r * 1.3 : r, 5, 7, [0.42, 0.43, 0.46]);
  return new Float32Array(B.v); }

