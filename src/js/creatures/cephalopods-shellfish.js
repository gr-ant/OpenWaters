'use strict';
// ====================== OTHER BODY PLANS: cephalopods and shellfish ======================
// body.plan picks the builder; body.parts holds that plan's shape settings (defaults below).
// All models: +x is the front, z is up, and the main body spans x = -0.5 .. 0.5 (1 unit = typical length).
const PLAN_INFO = {
  fish:       { wave: 1, parts: {} },
  squid:      { height: 0.11, width: 0.11, wave: 0.25, parts: { mantle: 0.62, fins: 0.45, fin_width: 0.16, fin_shape: 'rhomboid', tentacles: 0.3, eye: 0.6 } },
  cuttlefish: { height: 0.22, width: 0.36,  wave: 0.1,  parts: { mantle: 0.68, fin_width: 0.035, tentacles: 0, eye: 0.6 } },
  octopus:    { height: 0.2,  width: 0.18, wave: 0,    parts: { mantle: 0.3, web: 0.2, curl: 0.6, eye: 0.5 } },
  crab:       { height: 0.2,  width: 0.68, wave: 0,    parts: { claws: 0.5, legs: 0.7, spines: 0, paddles: false, eyestalks: 0.5 } },
  lobster:    { height: 0.21, width: 0.21, wave: 0.12, parts: { carapace: 0.42, rostrum: 0.05, claws: 0.7, antennae: 1, curl: 0, fan: 0.14, legs: 0.5 } },
  shrimp:     { height: 0.15, width: 0.1,  wave: 0.3,  parts: { carapace: 0.38, rostrum: 0.1, claws: 0, antennae: 1.5, curl: 0.3, fan: 0.16, legs: 0.5 } },
  bivalve:    { height: 0.8,  width: 0.45, wave: 0,    parts: { shell: 'clam', ribs: 0, gape: 0.5 } },
  snail:      { height: 0.6,  width: 0.6,  wave: 0,    parts: { spire: 0.5, whorls: 4, aperture: 0.5, foot: 0.6, knobs: 0 } },
  pinniped:   { height: 0.2,  width: 0.22, wave: 0.6,  parts: { snout: 0.5, neck: 0.15, fore: 0.5, rear: 'flippers', tail: 0.3, whiskers: 1, ears: 0, eye: 0.6, tusks: 0 } },
  turtle:     { height: 0.18, width: 0.4,  wave: 1,    parts: { shell: 0.72, dome: 0.5, flippers: 1, head: 0.5, scutes: 1, eye: 0.5 } },
  ray:        { height: 0.09, width: 1,    wave: 1,    parts: { shape: 'manta', disc: 0.55, span: 1.2, tip: 0.5, sweep: 0.3, horns: 0.6, sting: 0, eye: 0.5, mouth: 'front', bottom: 0 } },
};
const SHELL_SHAPES = { clam: { height: 0.82, width: 0.5 }, oyster: { height: 0.62, width: 0.3 }, mussel: { height: 0.48, width: 0.36 }, scallop: { height: 0.95, width: 0.28 } };
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const smst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = 6.283185;

// Colours: same pattern layers as fish. t = 0 front .. 1 rear (or along a shell), v = -1 underside .. 1 top, u = around.
function makePainter(B) {
  const C = {}; for (const k in FISH_DEFAULTS.body.colors) C[k] = hexRGB(B.colors[k] || FISH_DEFAULTS.body.colors[k]);
  const pats = (B.pattern || []).map(p => Object.assign({ alpha: 1, region: 'upper_flank' }, p, { rgb: hexRGB(p.color || '#000000') }));
  const NR = 18, NS = 16, sm = smst;
  const soft = (r, v) => r === 'upper' ? sm(0.08, 0.22, v) : r === 'flank' ? sm(-0.47, -0.33, v) * (1 - sm(0.68, 0.82, v)) : r === 'lower' ? 1 - sm(-0.27, -0.13, v) : r === 'all' ? 1 : sm(-0.47, -0.33, v);
  const spotCell = (p, pi, ci, cj) => { if (ci < 0 || ci >= NR) return false; cj = ((cj % NS) + NS) % NS; const s = Math.max(1, Math.round(p.size || 1)), side = Math.min(cj, NS - 1 - cj); return hash2(Math.floor(ci / s), Math.floor(side / s) + (cj < NS / 2 ? 0 : 50), 31 + pi) < (p.density ?? 0.3); };
  const paint = (t, v, u) => {
    t = clamp(t, 0, 1); v = clamp(v, -1, 1); u = ((u % 1) + 1) % 1;
    const fi = t * NR, fj = u * NS, sideC = Math.min(fj, NS - fj) - 0.5;
    let c = v >= 0 ? V3.lerp(C.flank, C.back, sm(0.1, 0.8, v)) : V3.lerp(C.flank, C.belly, sm(-0.05, -0.6, v));
    pats.forEach((p, pi) => {
      const from = p.from ?? 0, to = p.to ?? 1, w = soft(p.region, v) * (from <= 0 ? 1 : sm(from - 0.015, from + 0.015, t)) * (to >= 1 ? 1 : 1 - sm(to - 0.015, to + 0.015, t));
      if (w <= 0) return;
      let k = 0;
      if (p.type === 'spots') { for (let ci = Math.floor(fi) - 1; ci <= Math.floor(fi) + 1; ci++) for (let cj = Math.floor(fj) - 1; cj <= Math.floor(fj) + 1; cj++) if (spotCell(p, pi, ci, cj)) k = Math.max(k, 1 - sm(0.47, 0.67, Math.hypot(fi - ci - 0.5, fj - cj - 0.5))); }
      else if (p.type === 'bars') { const bw = p.width ?? 0.4, f = (t + (p.wavy || 0) * 0.04 * Math.sin(v * 9 + u * 20)) * (p.count || 6), dd = Math.abs(((f - bw / 2) % 1 + 1.5) % 1 - 0.5); k = bw >= 1 ? 1 : 1 - sm(bw / 2 - 0.06, bw / 2 + 0.06, dd); }
      else if (p.type === 'stripe') { const sw = p.width ?? 0.15; k = 1 - sm(sw - 0.05, sw + 0.05, Math.abs(v - (p.v ?? 0))); }
      else if (p.type === 'mottled') { const th0 = 0.3 - (p.amount ?? 0.4) * 0.6; k = sm(th0 - 0.05, th0 + 0.05, nPat(t * (p.scale || 6), sideC / NS * (p.scale || 6) * 0.7 + pi * 3)); }
      else if (p.type === 'lateral_line') k = 1 - sm(0.06, 0.1, Math.abs(v - (p.v ?? 0)));
      else if (p.type === 'spot') { const sz = p.size ?? 0.06; k = 1 - sm(sz * 0.75, sz * 1.1, Math.hypot(t - (p.at ?? 0.25), (v - (p.v ?? 0.3)) * 0.5)); }
      else if (p.type === 'scales') k = 0.5 * (0.5 + 0.5 * Math.sin(Math.PI * fi) * Math.sin(Math.PI * fj));
      if (k > 0) c = V3.lerp(c, p.rgb, k * w * p.alpha);
    });
    return c;
  };
  return { C, paint };
}

// Smooth surface S(t,a), t and a in 0..1 (a wraps unless opt.wrap === false). col(t,a,p) -> rgb, mat(t,a) -> material.
function surf(M, S, nt, na, col, mat, opt = {}) { nt = Math.max(3, Math.round(nt * PLAN_Q)); na = Math.max(4, Math.round(na * PLAN_Q));
  const wrap = opt.wrap !== false, e = 1e-3, W = na + 1, G = new Array((nt + 1) * W);
  for (let i = 0; i <= nt; i++) for (let j = 0; j <= na; j++) {
    const t = i / nt, a = j / na, p = S(t, a), tc = clamp(t, 0.004, 0.996);
    const st = V3.sub(S(Math.min(1, tc + e), a), S(Math.max(0, tc - e), a));
    const sa = V3.sub(S(tc, wrap ? a + e : Math.min(1, a + e)), S(tc, wrap ? a - e : Math.max(0, a - e)));
    let n = cross3(st, sa); const l = Math.hypot(n[0], n[1], n[2]); n = l > 1e-14 ? V3.mul(n, 1 / l) : [0, 0, 1];
    G[i * W + j] = [p, n, col(t, a, p), mat ? mat(t, a) : M.mat];
  }
  const v = M.v, put = g => v.push(g[0][0], g[0][1], g[0][2], g[1][0], g[1][1], g[1][2], g[2][0], g[2][1], g[2][2], g[3]);
  for (let i = 0; i < nt; i++) for (let j = 0; j < na; j++) { const A = G[i * W + j], Bq = G[i * W + j + 1], Cq = G[(i + 1) * W + j + 1], Dq = G[(i + 1) * W + j]; put(A); put(Bq); put(Cq); put(A); put(Cq); put(Dq); }
}
const polyline = pts => { const n = pts.length - 1; return t => { const f = clamp(t, 0, 1) * n, k = Math.min(n - 1, Math.floor(f)); return V3.lerp(pts[k], pts[k + 1], f - k); }; };
// a path built by walking: heading(s) -> unit direction, z(s) -> height offset added
function walk(start, len, steps, dir) { const pts = [start]; let p = start; for (let i = 1; i <= steps; i++) { const s = (i - 0.5) / steps, d = dir(s); p = V3.add(p, V3.mul(d, len / steps)); pts.push(p); } return polyline(pts); }
function frames(P, K, up) {
  const pts = [], T = [], N = [];
  for (let k = 0; k <= K; k++) pts.push(P(k / K));
  for (let k = 0; k <= K; k++) T.push(norm3(V3.sub(pts[Math.min(K, k + 1)], pts[Math.max(0, k - 1)])));
  let n0 = V3.sub(up, V3.mul(T[0], V3.dot(up, T[0]))); if (Math.hypot(...n0) < 1e-5) { const alt = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; n0 = V3.sub(alt, V3.mul(T[0], V3.dot(alt, T[0]))); }
  N.push(norm3(n0));
  for (let k = 1; k <= K; k++) { const n = V3.sub(N[k - 1], V3.mul(T[k], V3.dot(N[k - 1], T[k]))); N.push(Math.hypot(...n) < 1e-6 ? N[k - 1] : norm3(n)); }
  return t => { const f = clamp(t, 0, 1) * K, k = Math.min(K - 1, Math.floor(f)), u = f - k, Tn = norm3(V3.lerp(T[k], T[k + 1], u)), N0 = V3.lerp(N[k], N[k + 1], u), Nn = norm3(V3.sub(N0, V3.mul(Tn, V3.dot(N0, Tn)))); return { T: Tn, N: Nn, B: cross3(Tn, Nn) }; };
}
// tube along path P(t); rv = radius toward the 'up' side, rh = sideways radius. a = 0 is the top.
function tube(M, P, rv, rh, nt, na, col, mat, up = [0, 0, 1]) { nt = Math.max(3, Math.round(nt * PLAN_Q)); na = Math.max(4, Math.round(na * PLAN_Q));
  const F = frames(P, Math.max(32, nt * 3), up);
  surf(M, (t, a) => { const f = F(t), p = P(t), c = Math.cos(a * TAU), s = Math.sin(a * TAU), r1 = rv(t), r2 = rh ? rh(t) : r1;
    return [p[0] + f.N[0] * c * r1 + f.B[0] * s * r2, p[1] + f.N[1] * c * r1 + f.B[1] * s * r2, p[2] + f.N[2] * c * r1 + f.B[2] * s * r2]; }, nt, na, col, mat);
}
// ellipsoid with axes X (length, t runs +X..-X), Y, Z (a = 0 is +Z)
function ellip(M, c, ax, r, nt, na, col, mat, bump) { nt = Math.max(3, Math.round(nt * PLAN_Q)); na = Math.max(4, Math.round(na * PLAN_Q));
  const [X, Y, Z] = ax || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  surf(M, (t, a) => { const ct = Math.cos(Math.PI * t), s = Math.sin(Math.PI * t), ca = Math.cos(a * TAU), sa = Math.sin(a * TAU), b = bump ? bump(t, a) : 1;
    const x = r[0] * ct * b, y = r[1] * s * sa * b, z = r[2] * s * ca * b; return [c[0] + X[0] * x + Y[0] * y + Z[0] * z, c[1] + X[1] * x + Y[1] * y + Z[1] * z, c[2] + X[2] * x + Y[2] * y + Z[2] * z]; }, nt, na, col, mat);
}
const ellV = (t, a) => Math.sin(Math.PI * t) * Math.cos(a * TAU);   // 'up-ness' of an ellipsoid point, for colouring
const axesFrom = d => { const X = norm3(d), Z0 = Math.abs(X[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1], Y = norm3(cross3(Z0, X)); return [X, Y, cross3(X, Y)]; };
// eyes are sunk 40% of a radius into the head so they don't bulge out
function eyePair(M, C, c, r, slit, yc = 0) {
  const mt = M.mat; M.mat = MT.GEN;
  for (const s of [1, -1]) { const ce = [c[0], yc + s * (c[1] - r * 0.4), c[2]]; M.blob(ce, r, r, r, 8, 14, C.eye); M.blob([ce[0] + r * 0.05, ce[1] + s * r * 0.7, ce[2]], slit ? r * 0.55 : r * 0.5, r * 0.36, slit ? r * 0.16 : r * 0.5, 6, 10, [0.03, 0.03, 0.04]); }
  M.mat = mt;
}
// claw: palm + two fingers pointing along d from p (for crabs and lobsters)
function claw(M, p, d, side, size, colBody, colTip) {
  const [X, Y, Z] = axesFrom(d), pl = 0.1 * size, cc = V3.add(p, V3.mul(X, pl * 0.8));
  ellip(M, cc, [X, Y, Z], [pl, pl * 0.48, pl * 0.38], 10, 12, (t, a) => V3.lerp(colBody, V3.mul(colBody, 0.75), smst(0, -0.8, ellV(t, a))), () => MT.CLOTH);
  const base = V3.add(cc, V3.mul(X, pl * 0.75));
  for (const [dz, len, rr] of [[-0.35, 1, 0.24], [0.4, 0.95, 0.2]]) {
    const tip = V3.add(V3.add(base, V3.mul(X, pl * len)), V3.mul(Z, pl * dz * 0.2)), b0 = V3.add(base, V3.mul(Z, pl * dz * 0.45));
    tube(M, t => { const q = V3.lerp(b0, tip, t); return V3.add(q, V3.mul(Z, -dz * pl * 0.25 * Math.sin(Math.PI * t))); }, t => pl * rr * (1 - 0.85 * t) + 0.002, null, 8, 6, t => V3.lerp(colBody, colTip, smst(0.35, 0.9, t)), () => MT.CLOTH, Z);
  }
}
// jointed leg / arm segment chain through points, radius shrinking from r0 to r1
function limb(M, pts, r0, r1, col, wig) {
  const P = (() => { const n = pts.length - 1; return t => { const f = clamp(t, 0, 1) * n, k = Math.min(n - 1, Math.floor(f)), u = f - k, s = u * u * (3 - 2 * u) * 0.25 + u * 0.75; return V3.lerp(pts[k], pts[k + 1], s); }; })();
  const n = pts.length - 1;
  tube(M, P, t => { const j = Math.abs((t * n) % 1 - 0.5); return (r0 + (r1 - r0) * t) * (0.82 + 0.18 * smst(0.5, 0.3, j)); }, null, n * 6, 6, col, t => (wig ? 20 + wig * t : MT.CLOTH));
}

const PLAN_BUILD = {
  squid(D, B, Pp, M, C, paint) {
    const R = B.height / 2, Rw = B.width / 2, ml = clamp(Pp.mantle, 0.3, 0.85), hl = 0.07, xm0 = -0.5 + ml, xa0 = xm0 + hl, al = 0.5 - xa0;
    const mr = t => Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4))) * (1 + 0.05 * (1 - smst(0, 0.12, t)));
    const sk = (p, v, u) => paint(0.5 - p[0], v, u);
    surf(M, (t, a) => { const r = mr(t); return [xm0 - t * ml, Math.sin(a * TAU) * Rw * r, Math.cos(a * TAU) * R * r]; }, 36, 22, (t, a, p) => sk(p, Math.cos(a * TAU), a));
    const tf0 = 1 - clamp(Pp.fins, 0.1, 0.9), fw = clamp(Pp.fin_width, 0.02, 0.4), round = Pp.fin_shape === 'round';
    for (const s of [1, -1]) surf(M, (t, a) => { const tt = tf0 + (1 - tf0) * t, sp = round ? Math.sin(Math.PI * t) : (t < 0.6 ? t / 0.6 : (1 - t) / 0.4); return [xm0 - tt * ml, s * (mr(tt) * Rw * 0.8 + a * fw * Math.max(0, sp)), 0]; },
      14, 3, (t, a, p) => V3.lerp(sk(p, 0.7, a * 0.2), C.fins, 0.35), (t, a) => 30 + 0.6 * a, { wrap: false });
    ellip(M, [xm0 + hl * 0.35, 0, 0], null, [hl * 0.8, Rw * 0.82, R * 0.72], 12, 18, (t, a, p) => sk(p, ellV(t, a), a));
    eyePair(M, C, [xm0 + hl * 0.4, Rw * 0.72, R * 0.18], R * (0.2 + 0.22 * Pp.eye));
    const arm = (th, len, r0, club) => { const cy = Math.cos(th), cz = Math.sin(th);
      tube(M, t => [xa0 - 0.02 + t * len, cy * Rw * 0.5 * (1 - 0.55 * t), cz * R * 0.5 * (1 - 0.55 * t) - 0.02 * t * t],
        t => r0 * (club ? (1 - 0.3 * t) * (1 + 1.2 * smst(0.72, 0.84, t) * (1 - smst(0.93, 1, t))) : 1 - 0.85 * t) + 0.0015, null, club ? 24 : 12, 6,
        (t, a, p) => sk(p, Math.cos(a * TAU) * 0.6, a), t => 20 + 0.95 * t); };
    for (let k = 0; k < 8; k++) arm((k + 0.5) / 8 * TAU, al, R * 0.2, false);
    if (Pp.tentacles > 0.01) for (const s of [1, -1]) arm(-Math.PI / 2 + s * 0.45, al + Pp.tentacles, R * 0.08, true);
  },
  cuttlefish(D, B, Pp, M, C, paint) {
    const R = B.height / 2, Rw = B.width / 2, ml = clamp(Pp.mantle, 0.4, 0.85), hl = 0.07, xm0 = -0.5 + ml, xa0 = xm0 + hl, al = 0.5 - xa0;
    const mr = t => { const q = (t - 0.35) / (t < 0.35 ? 0.6 : 0.65); return Math.sqrt(Math.max(0, 1 - q * q)); };
    const sk = (p, v, u) => paint(0.5 - p[0], v, u);
    surf(M, (t, a) => { const r = mr(t), c = Math.cos(a * TAU); return [xm0 - t * ml, Math.sin(a * TAU) * Rw * r, (c > 0 ? c : c * 0.7) * R * r]; }, 36, 26, (t, a, p) => sk(p, Math.cos(a * TAU), a));
    const fw = clamp(Pp.fin_width, 0.01, 0.15);
    for (const s of [1, -1]) surf(M, (t, a) => { const tt = 0.04 + 0.96 * t; return [xm0 - tt * ml + a * fw * 0.3 * smst(0.85, 1, t) * 0, s * (mr(tt) * Rw * 0.96 + a * fw * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.1)))), -R * 0.12]; },
      30, 3, (t, a) => V3.lerp(C.fins, C.flank, 0.3 * (1 - a)), (t, a) => 30 + 0.98 * a, { wrap: false });
    ellip(M, [xm0 + hl * 0.35, 0, -R * 0.05], null, [hl * 0.85, Rw * 0.6, R * 0.75], 12, 18, (t, a, p) => sk(p, ellV(t, a), a));
    eyePair(M, C, [xm0 + hl * 0.45, Rw * 0.5, R * 0.32], R * (0.2 + 0.2 * Pp.eye), true);
    for (let k = 0; k < 8; k++) { const th = (k + 0.5) / 8 * TAU, cy = Math.cos(th), cz = Math.sin(th);
      tube(M, t => [xa0 - 0.02 + t * al, cy * Rw * 0.28 * (1 - 0.75 * t), cz * R * 0.4 * (1 - 0.7 * t) - 0.03 * t], t => R * 0.26 * (1 - 0.88 * t) + 0.0015, null, 10, 6, (t, a, p) => sk(p, Math.cos(a * TAU) * 0.6, a), t => 20 + 0.95 * t); }
    if (Pp.tentacles > 0.01) for (const s of [1, -1]) tube(M, t => [xa0 + t * (al + Pp.tentacles), s * Rw * 0.12, -R * 0.3 - 0.03 * t], t => R * 0.07 * (1 + smst(0.75, 0.85, t) * (1 - smst(0.93, 1, t))), null, 20, 6, (t, a, p) => sk(p, 0, a), t => 20 + 0.95 * t);
  },
  // rays: a flat disc of body and wings (manta: pointed swept wings, horn-like head fins; diamond / round: skates and
  // stingrays), a whip tail and the eyes on the sides (manta) or on top (bottom dwellers). Swims by flapping (SWIM_MODES.ray).
  ray(D, B, Pp, M, C, paint) {
    const dl = clamp(Pp.disc, 0.3, 0.9), sp = clamp(Pp.span, 0.3, 2.5) / 2, th = B.height / 2, x0 = 0.5, xr = 0.5 - dl, tip = clamp(Pp.tip, 0.2, 0.8), shape = Pp.shape;
    D._swim = 3;
    const W = u => { // half-width of the disc, u = 0 at the snout .. 1 at the back of the disc
      if (shape === 'round') return sp * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u * 0.94 + 0.04, 0, 1))), 0.7);
      const front = shape === 'manta' ? 0.2 : 0.04, a = u < tip ? front + (1 - front) * Math.pow(u / tip, shape === 'manta' ? 0.75 : 1) : Math.pow(Math.max(0, 1 - (u - tip) / (1 - tip)), shape === 'manta' ? 1.6 : 1.1);
      return sp * a; };
    const thick = (u, s) => th * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u * 0.92 + 0.06, 0, 1))), 0.6) * Math.pow(Math.max(0, 1 - s * s), 0.7) * (1 + 0.4 * (1 - smst(0, 0.35, Math.abs(s))));
    // disc: a wraps around the edge, top surface a 0..0.5 (s 1..-1), underside 0.5..1 (s -1..1)
    surf(M, (t, a) => { const top = a < 0.5, s_ = top ? 1 - 4 * a : -3 + 4 * a, u = t, w = W(u);
      const sw = clamp(Pp.sweep ?? 0, 0, 0.8) * Math.pow(Math.abs(s_), 1.6) * w;   // wings swept back toward pointed tips
      return [x0 - u * dl - sw, s_ * w, (top ? 1 : -0.6) * thick(u, s_)]; }, 26, 36,
      (t, a) => { const top = a < 0.5, s_ = top ? 1 - 4 * a : -3 + 4 * a; return paint(t * 0.9, top ? 1 - 0.55 * Math.abs(s_) : -1, (s_ + 1) / 4 + (top ? 0 : 0.5)); }, null);
    // tail: a long tapering whip, with a sting near its base on stingrays
    tube(M, t => [xr + 0.03 - t * (xr + 0.53), 0, th * 0.1 * (1 - t)], t => th * 0.45 * (1 - 0.92 * t) + 0.0015, null, 16, 6, (t, a) => paint(0.95, Math.cos(a * TAU), a), null);
    if (Pp.sting > 0) { const sx = xr - 0.12; M.mat = MT.GEN; M.tube([sx, 0, th * 0.12], [sx - 0.08 * Pp.sting, 0, th * 0.25], 0.006, 0.001, 4, [0.85, 0.82, 0.75]); M.mat = MT.CLOTH; }
    // small pelvic lobes at the back of the disc; a little dorsal fin on mantas
    for (const s of [1, -1]) ellip(M, [xr + 0.015, s * sp * 0.08, -th * 0.15], null, [0.05, sp * 0.06, th * 0.25], 8, 10, (t, a) => paint(0.85, ellV(t, a), a));
    if (shape === 'manta') { M.mat = MT.GEN; M.tri([xr + 0.02, 0, th * 0.3], [xr - 0.03, 0, th * 0.3], [xr - 0.025, 0, th * 1.4], C.fins, [xr, 1, 0]); M.mat = MT.CLOTH; }
    // head: mantas have two rolled horn fins either side of a wide front mouth; bottom rays a small mouth underneath
    const hw = W(0.02);
    if (Pp.horns > 0) for (const s of [1, -1]) ellip(M, [x0 + 0.02 * Pp.horns, s * hw * 0.88, -th * 0.15], null, [0.07 * Pp.horns, 0.018, 0.032], 10, 10, (t, a) => V3.lerp(C.back, C.belly, smst(0.2, -0.6, ellV(t, a)) * 0.6));
    const Cm = hexRGB(B.colors.mouth || '#401818');
    if (Pp.mouth === 'front') ellip(M, [x0 + 0.003, 0, -th * 0.25], null, [0.012, hw * 0.7, th * 0.32], 8, 12, () => Cm);
    else ellip(M, [x0 - dl * 0.22, 0, -th * 0.52], null, [0.012, sp * 0.06, 0.004], 6, 10, () => Cm);
    const er = 0.008 + 0.012 * Pp.eye;
    if (Pp.mouth === 'front') { M.mat = MT.GEN; for (const s of [1, -1]) M.blob([x0 - 0.02, s * hw * 0.98, th * 0.05], er, er * 0.7, er, 6, 10, C.eye); M.mat = MT.CLOTH; }
    else { M.mat = MT.GEN; for (const s of [1, -1]) { M.blob([x0 - dl * 0.2, s * sp * 0.1, thick(0.2, 0.2) * 0.95], er, er, er * 0.7, 6, 10, C.eye); M.blob([x0 - dl * 0.27, s * sp * 0.1, thick(0.27, 0.2) * 0.9], er * 0.7, er * 0.6, er * 0.4, 5, 8, [0.05, 0.05, 0.05]); } M.mat = MT.CLOTH; }
  },
  // seals, sea lions, manatees and otters: a sleek furred body with a whiskered snout, front flippers, and at the back
  // flippers (seals, sea lions), a round paddle (manatees) or a tail with webbed feet (otters). Belly down, nose at +x.
  pinniped(D, B, Pp, M, C, paint) {
    const R = B.height / 2, Rw = B.width / 2, sn = clamp(Pp.snout, 0, 1), neck = clamp(Pp.neck, 0, 0.6), rear = Pp.rear;
    const tailL = rear === 'tail' ? clamp(Pp.tail, 0.1, 0.45) : rear === 'paddle' ? 0.17 : 0.13, x0 = 0.5, x1 = -0.5 + tailL, bl = x0 - x1, X = t => x0 - t * bl;
    const hd = 0.42 + 0.12 * (1 - sn), pts = [0.16, hd, (hd + 0.82) / 2 - 0.45 * neck, 0.82, 1, 0.94, 0.7, 0.42, 0.22];   // snout, head, neck (none = smooth spindle), shoulders, barrel, hips, rump
    const prof = t => { const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i, w = (1 - Math.cos(Math.PI * u)) / 2; return (pts[i] + (pts[i + 1] - pts[i]) * w) * Math.sqrt(smst(0, 0.05, t)) * Math.sqrt(smst(1, 0.96, t)); };
    const sk = (t, v, u) => paint(t, v, u);
    surf(M, (t, a) => { const r = prof(t), c = Math.cos(a * TAU); return [X(t), Math.sin(a * TAU) * Rw * r, (c > 0 ? c : c * 0.82) * R * r + R * 0.06 * (1 - smst(0, 0.15, t))]; }, 34, 22, (t, a) => sk(t, Math.cos(a * TAU), a));
    // face: dark nose, big dark eyes, whiskers, little ears on sea lions
    const tn = 0.015; ellip(M, [X(tn) + 0.004, 0, R * 0.1], null, [0.012, Rw * 0.18, R * 0.12], 6, 8, () => [0.08, 0.07, 0.07]);
    const te = 0.07 + 0.03 * sn; eyePair(M, C, [X(te), Rw * prof(te) * 0.78, R * prof(te) * 0.42], R * (0.1 + 0.1 * Pp.eye));
    if (Pp.whiskers > 0) for (const sd of [1, -1]) for (let k = 0; k < 4; k++) { const b = [X(0.03), sd * Rw * 0.2, R * (0.02 - 0.03 * k)]; M.mat = MT.GEN; M.tube(b, [b[0] - 0.04 * Pp.whiskers, sd * (Rw * 0.2 + 0.06 * Pp.whiskers), b[2] - 0.01 * k], 0.0016, 0.0006, 3, [0.85, 0.82, 0.72]); M.mat = MT.CLOTH; }
    if (Pp.tusks > 0) for (const sd of [1, -1]) tube(M, t => [X(0.035) - 0.03 * Pp.tusks * t, sd * Rw * (0.16 - 0.04 * t), -R * 0.12 - 0.17 * Pp.tusks * t], t => 0.008 * (1 - 0.7 * t) + 0.0015, null, 6, 6, () => [0.92, 0.88, 0.76]);   // walrus tusks
    if (Pp.ears > 0) for (const sd of [1, -1]) tube(M, t => [X(0.11) - 0.012 * t, sd * (Rw * prof(0.11) * 0.7 + 0.008 * t), R * prof(0.11) * 0.55 + 0.012 * t * Pp.ears], t => 0.004 * (1 - 0.6 * t), null, 4, 5, () => C.back);
    // front flippers: flat paddles angled back and out under the shoulders (big on sea lions, small on seals)
    const fs = 0.06 + 0.16 * clamp(Pp.fore, 0, 1), tf = 0.3;
    for (const sd of [1, -1]) { const base = [X(tf), sd * Rw * prof(tf) * 0.75, -R * prof(tf) * 0.55], dir = norm3([-0.75, sd * 0.55, -0.35]), [Ax, Ay] = axesFrom(dir);
      ellip(M, V3.add(base, V3.mul(dir, fs * 0.55)), [Ax, Ay, cross3(Ax, Ay)], [fs * 0.6, fs * 0.28, 0.008 + fs * 0.05], 10, 10, (t, a) => V3.lerp(C.fins, C.back, 0.2)); }
    // the back end
    const xr = X(0.985);
    if (rear === 'paddle') ellip(M, [xr - tailL * 0.48, 0, 0], null, [tailL * 0.55, Rw * 1.25, 0.012 + R * 0.08], 12, 14, () => V3.lerp(C.fins, C.back, 0.3));
    else if (rear === 'tail') { tube(M, t => [xr - t * tailL, 0, R * 0.05 * (1 - t)], t => R * 0.17 * (1 - 0.55 * t) + 0.004, null, 10, 8, (t, a) => sk(1, Math.cos(a * TAU), a));
      for (const sd of [1, -1]) ellip(M, [X(0.9) - 0.03, sd * Rw * 0.55, -R * 0.25], null, [0.05, 0.028, 0.008], 8, 8, () => C.fins); }
    else for (const sd of [1, -1]) ellip(M, [xr - tailL * 0.5, sd * Rw * 0.22, -R * 0.05], [norm3([1, sd * 0.25, 0]), norm3([-sd * 0.25, 1, 0]), [0, 0, 1]], [tailL * 0.55, Rw * 0.42, 0.008 + R * 0.05], 10, 10, () => C.fins);
  },
  // sea turtles: a domed shell (patterned with scutes), a pale flat plastron, a head on a short neck, long front
  // flippers and small rear ones. The flippers beat (SWIM_MODES.turtle moves everything wider than the shell).
  turtle(D, B, Pp, M, C, paint) {
    const sl = clamp(Pp.shell, 0.5, 0.85), R = B.height / 2, Rw = Math.min(0.2, B.width / 2), xs0 = 0.5 - (1 - sl) * 0.6, xc = xs0 - sl / 2;
    D._swim = 6;
    const sc = (t, a) => { const v = Math.cos(a * TAU), g = Pp.scutes > 0 ? 0.8 + 0.2 * smst(0.35, 0.05, Math.min(Math.abs(Math.sin(t * 5 * Math.PI)), Math.abs(Math.sin(a * 8 * Math.PI)))) : 1; return V3.mul(paint(t, v, a), g); };
    ellip(M, [xc, 0, 0], null, [sl / 2, Rw, R * (0.6 + 0.6 * Pp.dome)], 16, 22, (t, a) => sc(t, a), null, (t, a) => Math.cos(a * TAU) < 0 ? 1 : 1);
    ellip(M, [xc, 0, -R * 0.12], null, [sl / 2 * 0.94, Rw * 0.92, R * 0.42], 10, 16, () => C.belly);
    // head and neck
    const hr = 0.045 + 0.04 * Pp.head, hx = xs0 + hr * 1.2;
    tube(M, t => [xs0 - 0.02 + t * hr * 1.4, 0, -R * 0.05], t => hr * 0.7, null, 6, 10, () => V3.lerp(C.flank, C.back, 0.3));
    ellip(M, [hx, 0, -R * 0.02], null, [hr * 1.1, hr * 0.85, hr * 0.75], 10, 12, (t, a) => paint(0.02, Math.cos(a * TAU), a));
    eyePair(M, C, [hx + hr * 0.35, hr * 0.62, hr * 0.15], hr * (0.18 + 0.12 * Pp.eye));
    // flippers: long swept paddles at the front, short rounded ones at the back
    const fl = 0.18 + 0.2 * clamp(Pp.flippers, 0, 1.5);
    for (const sd of [1, -1]) {
      const base = [xs0 - sl * 0.18, sd * Rw * 0.8, -R * 0.2], dir = norm3([-0.35, sd * 1, -0.05]), [Ax, Ay] = axesFrom(dir);
      ellip(M, V3.add(base, V3.mul(dir, fl * 0.5)), [Ax, Ay, cross3(Ax, Ay)], [fl * 0.55, fl * 0.16, 0.012], 10, 10, () => V3.lerp(C.fins, C.back, 0.2));
      const rb = [xs0 - sl * 0.92, sd * Rw * 0.6, -R * 0.2], rd = norm3([-0.8, sd * 0.6, 0]), [Bx, By] = axesFrom(rd);
      ellip(M, V3.add(rb, V3.mul(rd, fl * 0.2)), [Bx, By, cross3(Bx, By)], [fl * 0.24, fl * 0.12, 0.01], 8, 8, () => C.fins);
    }
    tube(M, t => [xs0 - sl - t * 0.05, 0, -R * 0.1], t => 0.018 * (1 - 0.8 * t), null, 4, 6, () => C.fins);
  },
  octopus(D, B, Pp, M, C, paint) {
    const R = B.height / 2, Rw = B.width / 2, ml = clamp(Pp.mantle, 0.12, 0.45), hl = 0.09, sk = (p, v, u) => paint(0.5 - p[0], v, u);
    const zg = -R * 1.05;                                       // ground level under the arms
    const tilt = 0.45, X = [Math.cos(tilt), 0, -Math.sin(tilt)], Z = [Math.sin(tilt), 0, Math.cos(tilt)];
    ellip(M, [-0.5 + ml * 0.55, 0, R * 0.55], [X, [0, 1, 0], Z], [ml * 0.58, Rw, R], 18, 22, (t, a, p) => sk(p, ellV(t, a), a),
      null, (t, a) => 1 + 0.03 * Math.sin(t * 9 + a * 7));
    const hx = -0.5 + ml + hl * 0.25;
    ellip(M, [hx, 0, 0], null, [hl * 0.7, Rw * 0.85, R * 0.72], 12, 18, (t, a, p) => sk(p, ellV(t, a), a));
    eyePair(M, C, [hx + hl * 0.1, Rw * 0.62, R * 0.52], R * (0.14 + 0.18 * Pp.eye), true);
    const c0 = [hx + hl * 0.2, 0, -R * 0.4], alen = 0.5 - c0[0], curl = clamp(Pp.curl, 0, 1.5), paths = [];
    for (let k = 0; k < 8; k++) {
      const phi = (k - 3.5) / 3.5 * 2.15, sg = k % 2 ? 1 : -1, b = V3.add(c0, [Math.cos(phi) * R * 0.4, Math.sin(phi) * Rw * 0.45, 0]);
      const P = walk(b, alen, 60, s => { const ps = phi + curl * sg * s * s * 2.4 + 0.35 * curl * Math.sin(s * 7 + k * 1.3) * s, dz = (zg - c0[2]) * 4 * (s < 0.25 ? 1 : 0) + curl * 0.35 * smst(0.75, 1, s) * (k % 3 === 0 ? 1 : 0.3); return norm3([Math.cos(ps), Math.sin(ps), dz]); });
      paths.push(P);
      tube(M, P, t => R * 0.42 * (1 - 0.93 * t) + 0.0015, null, 30, 8, (t, a, p) => { const v = Math.cos(a * TAU); let c = sk(p, v * 0.7, a);
        if (v < -0.15) c = V3.lerp(c, C.belly, smst(-0.15, -0.6, v) * (0.55 + 0.45 * Math.sin(t * 110))); return c; }, t => 20 + 0.95 * t);
    }
    const web = clamp(Pp.web, 0, 0.6);
    if (web > 0.02) for (let k = 0; k < 7; k++) surf(M, (t, a) => { const q = V3.lerp(paths[k](t * web), paths[k + 1](t * web), a); return [q[0], q[1], q[2] - Math.sin(Math.PI * a) * 0.01 * t]; },
      8, 6, (t, a, p) => sk(p, 0.2, a), (t, a) => 20 + 0.3 * t * web, { wrap: false });
  },
  crab(D, B, Pp, M, C, paint) {
    const Rx = 0.5, Ry = 0.5 * clamp(B.width, 0.3, 1.2), H = clamp(B.height, 0.06, 0.6), Hu = H * 0.62, Hd = H * 0.38, sp = clamp(Pp.spines, 0, 1.5);
    const sk = (p, v, u) => paint(0.5 - p[0], v, u);
    surf(M, (t, a) => {
      const th = Math.PI * t, ph = a * TAU, sx = Math.cos(ph), sy = Math.sin(ph), ad = Math.min(Math.abs(Math.atan2(sy, sx)), Math.PI - Math.abs(Math.atan2(sy, sx)));
      const spike = 1 + sp * 0.28 * Math.exp(-((ad / 0.09) ** 2)), teeth = sy > 0 ? 1 + 0.025 * Math.max(0, Math.sin(ph * 18)) * smst(0.1, 0.5, sy) : 1;
      const front = sy > 0 ? 1 - 0.12 * sy ** 6 : 1, hs = Math.pow(Math.sin(th), 0.55), cz = Math.cos(th), vz = Math.sign(cz) * Math.pow(Math.abs(cz), 1.15);
      return [sx * hs * Rx * spike * teeth, sy * hs * Ry * front * teeth, vz * (cz > 0 ? Hu : Hd)];
    }, 22, 48, (t, a, p) => sk(p, Math.cos(Math.PI * t) * 1.2, a));
    const legC = C.fins, tipC = hexRGB(B.colors.mouth || '#3a2a20');
    const es = 0.02 + 0.06 * clamp(Pp.eyestalks, 0, 1.5);
    for (const s of [1, -1]) {
      const eb = [s * 0.07, Ry * 0.88, Hu * 0.35], et = V3.add(eb, [s * 0.01, es * 0.5, es]);
      tube(M, t => V3.lerp(eb, et, t), t => 0.009, null, 4, 6, () => legC, () => MT.CLOTH);
      const mt = M.mat; M.mat = MT.GEN; M.blob(et, 0.016, 0.016, 0.018, 6, 10, [0.04, 0.04, 0.05]); M.mat = mt;
      // claws
      const cs = 0.35 + 0.75 * clamp(Pp.claws, 0, 1.5), b = [s * 0.3, Ry * 0.72, -Hd * 0.3], e = [s * (0.42 + 0.04 * cs), Ry * 0.85 + 0.08 * cs, -Hd * 0.1], w = [s * (0.3 - 0.03 * cs), Ry * 0.95 + 0.16 * cs, 0.0];
      limb(M, [b, e, w], 0.03 * cs + 0.01, 0.04 * cs + 0.008, () => legC, 0);
      claw(M, w, [-s * 0.55, 0.85, 0.05], s, cs * 1.45, V3.lerp(legC, C.back, 0.2), tipC);
      // walking legs
      const ll = 0.2 + 0.25 * clamp(Pp.legs, 0, 1.5);
      for (let k = 0; k < 4; k++) {
        const a0 = [s * Rx * 0.8, Ry * (0.4 - k * 0.32), -Hd * 0.35], dv = norm3([s, 0.5 - k * 0.38, 0]), pad = Pp.paddles && k === 3;
        const knee = V3.add(a0, V3.add(V3.mul(dv, ll * 0.42), [0, 0, ll * 0.22])), foot = pad ? V3.add(a0, V3.add(V3.mul(dv, ll * 0.85), [0, -0.06, ll * 0.08])) : V3.add(a0, V3.add(V3.mul(dv, ll * 0.82), [0, 0, -Hd - ll * 0.2]));
        const mid = pad ? V3.lerp(knee, foot, 0.5) : V3.add(V3.lerp(knee, foot, 0.5), V3.mul(dv, ll * 0.06));
        limb(M, [a0, knee, mid, foot], 0.042, 0.014, () => legC, 0.25);   // sturdy, jointed walking legs
        if (pad) { const d = V3.sub(foot, mid); ellip(M, V3.add(foot, V3.mul(norm3(d), 0.04)), axesFrom(d), [0.055, 0.035, 0.006], 8, 12, () => legC, () => 20.3); }
      }
    }
  },
  lobster(D, B, Pp, M, C, paint) { decapod(D, B, Pp, M, C, paint); },
  shrimp(D, B, Pp, M, C, paint) { decapod(D, B, Pp, M, C, paint); },
  bivalve(D, B, Pp, M, C, paint) {
    const kind = SHELL_SHAPES[Pp.shell] ? Pp.shell : 'clam', H = clamp(B.height, 0.2, 1.3), Ry = clamp(B.width, 0.05, 1) / 2, ribs = Math.round(clamp(Pp.ribs, 0, 40));
    const nz = makeNoise(77);
    // margin outline m(phi) in the x-z plane, umbo U at the top
    const outline = {
      clam: ph => { const s = Math.sin(ph), c = Math.cos(ph); return [0.5 * c * (1 - 0.18 * Math.max(0, s) ** 3) + 0.04 * Math.max(0, s) ** 3, H / 2 * s]; },
      oyster: ph => { const s = Math.sin(ph), c = Math.cos(ph), n1 = nz(c * 1.7 + 3, s * 1.7), n2 = nz(c * 2.3, s * 2.3 + 5); return [0.5 * c * (1 + 0.1 * n1), H / 2 * s * (0.85 + 0.15 * c) * (1 + 0.16 * n2)]; },
      mussel: ph => { const s = Math.sin(ph), c = Math.cos(ph), w = Math.pow(0.3 + 0.7 * (1 - c) / 2, 0.85); return [0.5 * c, H / 2 * s * w - 0.1 * H * Math.max(0, c) ** 2]; },
      scallop: ph => { const s = Math.sin(ph), c = Math.cos(ph), top = Math.max(0, s); return [0.5 * c * (1 - 0.6 * top ** 2.5), H / 2 * s - 0.03]; },
    }[kind];
    const U = { clam: [0.06, H * 0.5], oyster: [0.38, H * 0.3], mussel: [0.47, -0.02 * H], scallop: [0, H / 2 - 0.02] }[kind];
    let hz = -1; for (let i = 0; i < 64; i++) hz = Math.max(hz, outline(i / 64 * TAU)[1]); hz = Math.max(hz, U[1]);
    D._jaw = [0, hz, 0.12 + 0.55 * clamp(Pp.gape, 0, 1.5)];
    const valve = (sg, inner) => surf(M, (t, a) => {
      const ph = a * TAU, m = outline(ph), rib = ribs ? Math.cos(ph * ribs) : 0;
      const ex = 1 + (ribs ? 0.012 * rib * t : 0), x = U[0] + t * (m[0] - U[0]) * ex, z = U[1] + t * (m[1] - U[1]) * ex;
      let y = Ry * Math.sqrt(Math.max(0, 1 - t * t)) * (kind === 'oyster' ? (sg > 0 ? 0.45 : 1.55) : 1);
      if (ribs) y += Ry * 0.07 * rib * t; if (kind === 'oyster') y *= 1 + 0.12 * nz(x * 9, z * 9);
      if (kind === 'clam') y *= 1 + 0.012 * Math.sin(t * 42);
      return [x, sg * (inner ? y * 0.9 - 0.002 : y), z];
    }, 18, 48, (t, a) => {
      if (inner) return V3.lerp(hexRGB(B.colors.mouth || '#e8e0e0'), C.flank, 0.15 * t);
      const ring = kind === 'mussel' || kind === 'oyster' ? 0.06 : 0.1;
      return V3.mul(paint(t, Math.max(0.02, 1 - t), a), 1 - ring * smst(0.6, 1, Math.sin(t * 34)));
    }, () => (sg > 0 ? 15 : 16), { wrap: true });
    valve(1, false); valve(-1, false); valve(1, true); valve(-1, true);
    if (kind === 'scallop') for (const s of [1, -1]) for (const sg of [1, -1]) {   // ears beside the hinge
      surf(M, (t, a) => { const x0 = U[0] + s * 0.02, x1 = U[0] + s * 0.3, xe = x0 + (x1 - x0) * t; return [xe, sg * 0.004, hz - a * (0.13 - 0.07 * t)]; }, 6, 2, () => C.fins, () => (sg > 0 ? 15 : 16), { wrap: false });
    }
    ellip(M, [U[0] * 0.3, 0, (hz + Math.min(...[0, 0.25, 0.5, 0.75].map(f => outline(f * TAU)[1]))) / 2 - 0.02], null, [0.36, Ry * 0.55, H * 0.3], 10, 14, () => C.belly, () => MT.CLOTH);
  },
  snail(D, B, Pp, M, C, paint) {
    const spire = clamp(Pp.spire, 0, 1.5), nw = clamp(Pp.whorls, 1.5, 9), Th = nw * TAU, Wg = 1.9, k = Math.log(Wg) / TAU, ap = clamp(Pp.aperture, 0, 1.5), kn = clamp(Pp.knobs, 0, 1.5);
    const tr = 0.5;
    const raw = (t, a) => {
      const th = 0.15 + t * (Th - 0.15), R = Math.exp(k * th), al = a * TAU;
      let r = R * tr * (1 + ap * 0.35 * smst(0.93, 1, t));
      r *= 1 + kn * 0.28 * Math.pow(Math.max(0, Math.cos(al - 0.5)), 6) * Math.max(0, Math.cos(th * 9)) * smst(Th - 3 * Math.PI, Th, th);
      const x = spire * 3.2 * R + r * Math.sin(al) * (1 + 0.5 * spire), rr = R + r * Math.cos(al);
      return [x, rr * Math.cos(th), rr * Math.sin(th)];
    };
    // fit: aperture (end of the tube) turned to face down, apex toward the rear and a little up, longest side = 1
    const rho = -Math.PI / 2 - Th, cr = Math.cos(rho), sr = Math.sin(rho), beta = -0.35, cb = Math.cos(beta), sb = Math.sin(beta);
    const rot = p => { const y = p[1] * cr - p[2] * sr, z = p[1] * sr + p[2] * cr; return [p[0] * cb - z * sb, y, p[0] * sb + z * cb]; };
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i <= 60; i++) for (let j = 0; j < 16; j++) { const q = rot(raw(i / 60, j / 16)); for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], q[d]); hi[d] = Math.max(hi[d], q[d]); } }
    const sc = 1 / Math.max(hi[0] - lo[0], hi[1] - lo[1], (hi[2] - lo[2]) * 0.9), cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
    const fit = p => { const q = rot(p); return [(q[0] - cx) * sc, (q[1] - cy) * sc, (q[2] - cz) * sc]; };
    surf(M, (t, a) => fit(raw(t, a)), 120, 18, (t, a) => {
      const c = paint(t, Math.cos(a * TAU), a);
      return t > 0.985 ? V3.lerp(c, hexRGB(B.colors.mouth || '#e0b080'), smst(0.985, 1, t)) : c;
    }, () => MT.CLOTH);
    const ft = clamp(Pp.foot, 0, 1.5);
    if (ft > 0.03) {
      let ac = [0, 0, 0]; for (let j = 0; j < 12; j++) ac = V3.add(ac, V3.mul(fit(raw(1, j / 12)), 1 / 12));
      const zb = (lo[2] - cz) * sc, fl = 0.28 + 0.2 * ft, fc = [ac[0] + 0.1 * ft, ac[1], zb - 0.01];
      ellip(M, fc, null, [fl, 0.2, 0.075], 14, 16, (t, a) => V3.lerp(C.belly, V3.mul(C.belly, 0.8), smst(0, 0.9, ellV(t, a))), () => MT.CLOTH);
      for (const s of [1, -1]) {
        const b0 = [fc[0] + fl * 0.85, s * 0.035, fc[2] + 0.02], tip = V3.add(b0, [0.05 * ft + 0.03, s * 0.04, 0.07 * ft + 0.03]);
        tube(M, t => V3.lerp(b0, tip, t), t => 0.012 * (1 - 0.6 * t) + 0.003, null, 6, 6, () => C.belly, t => 20 + 0.6 * t);
        const mt = M.mat; M.mat = MT.GEN; M.blob(tip, 0.01, 0.01, 0.01, 5, 8, [0.04, 0.04, 0.05]); M.mat = mt;
      }
    }
  },
};
function decapod(D, B, Pp, M, C, paint) {
  const R = B.height / 2, Rw = B.width / 2, rl = clamp(Pp.rostrum, 0, 0.3), cl = clamp(Pp.carapace, 0.2, 0.6), fan = clamp(Pp.fan, 0.04, 0.3), curl = clamp(Pp.curl, 0, 1.2);
  const xc0 = 0.5 - rl, xc1 = xc0 - cl, abl = xc1 + 0.5 - fan * 0.8, sk = (p, v, u) => paint(0.5 - p[0], v, u);
  const shellZ = c => (c > 0 ? c : c * 0.75);
  // cephalothorax
  surf(M, (t, a) => { const r = 0.5 + 0.5 * smst(0, 0.4, t) - 0.08 * smst(0.85, 1, t), c = Math.cos(a * TAU); return [xc0 - t * (cl + 0.02), Math.sin(a * TAU) * Rw * r, shellZ(c) * R * r + R * 0.08 * Math.sin(Math.PI * t) * Math.max(0, c)]; },
    24, 22, (t, a, p) => sk(p, Math.cos(a * TAU), a));
  ellip(M, [xc0 + 0.005, 0, 0], null, [0.03, Rw * 0.5, R * 0.48], 8, 14, (t, a, p) => sk(p, ellV(t, a), a));
  tube(M, t => [xc0 + t * (rl + 0.01), 0, R * (0.35 + 0.1 * t)], t => R * 0.18 * (1 - 0.92 * t) + 0.0012, t => R * 0.12 * (1 - 0.92 * t) + 0.0012, 8, 6, (t, a, p) => sk(p, 0.8, a), () => MT.CLOTH);
  // abdomen: one tube with dips and darker bands at the six segment joints, curling down with 'curl'
  const P = walk([xc1 + 0.015, 0, R * 0.05], abl, 50, s => { const ps = curl * 1.9 * s; return [-Math.cos(ps), 0, -Math.sin(ps)]; });
  const joint = t => Math.exp(-(((t * 6 + 0.5) % 1 - 0.5) ** 2) / 0.006);
  const endCap = t => 1 - 0.9 * smst(0.95, 1, t) ** 0.5;
  tube(M, P, t => R * (0.9 - 0.45 * t) * (1 - 0.07 * joint(t)) * endCap(t), t => Rw * (0.92 - 0.42 * t) * (1 - 0.07 * joint(t)) * endCap(t), 48, 20, (t, a, p) => V3.mul(sk(p, Math.cos(a * TAU), a), 1 - 0.22 * joint(t) * Math.max(0, Math.cos(a * TAU))), () => MT.CLOTH);
  // tail fan
  const pe = P(1), Fr = frames(P, 50, [0, 0, 1]), f1 = Fr(1), T = f1.T, Ys = f1.B;
  for (const bta of [-0.75, -0.38, 0, 0.38, 0.75]) {
    const dir = norm3(V3.add(V3.mul(T, Math.cos(bta)), V3.mul(Ys, Math.sin(bta)))), side = norm3(cross3(f1.N, dir)), len = fan * (bta === 0 ? 1 : 0.92), w = fan * 0.3;
    surf(M, (t, a) => { const wd = w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95))) * (a * 2 - 1); return V3.add(V3.add(pe, V3.mul(dir, t * len)), V3.mul(side, wd)); }, 8, 2,
      () => V3.lerp(C.fins, C.back, 0.3), () => 20.15, { wrap: false });
  }
  // eyes on short stalks
  for (const s of [1, -1]) { const e0 = [xc0 - 0.005, s * Rw * 0.35, R * 0.25], e1 = [xc0 + 0.02, s * Rw * 0.7, R * 0.35]; tube(M, t => V3.lerp(e0, e1, t), () => R * 0.08, null, 3, 6, () => C.fins, () => MT.CLOTH); const mt = M.mat; M.mat = MT.GEN; M.blob(e1, R * 0.15, R * 0.15, R * 0.15, 6, 10, [0.04, 0.04, 0.05]); M.mat = mt; }
  // antennae (long whips sweeping back) and antennules (short, forked)
  const an = clamp(Pp.antennae, 0, 3);
  if (an > 0.02) for (const s of [1, -1]) {
    tube(M, walk([xc0, s * Rw * 0.3, R * 0.1], an, 40, u => { const ps = s * (0.3 + 2.1 * u * u); return norm3([Math.cos(ps), Math.sin(ps), 0.25 * (1 - u)]); }), t => R * 0.09 * (1 - 0.85 * t) + 0.0012, null, 30, 5, () => V3.lerp(C.fins, C.back, 0.4), t => 20 + 0.98 * t);
    for (const f of [0.15, 0.45]) tube(M, t => [xc0 + 0.01 + t * 0.09 * (0.6 + an * 0.25), s * (Rw * 0.12 + t * 0.03 * f * 3), R * 0.2 + t * 0.03], t => R * 0.05 * (1 - 0.7 * t) + 0.001, null, 6, 4, () => C.fins, t => 20 + 0.5 * t);
  }
  // claws
  const cs = clamp(Pp.claws, 0, 1.5), legC = C.fins, tipC = hexRGB(B.colors.mouth || '#3a2a20'), clawC = V3.lerp(C.back, C.flank, 0.3);
  for (const s of [1, -1]) {
    if (cs > 0.05) {
      const k = s > 0 ? 1 : 0.85, c = cs * k, b = [xc0 - cl * 0.2, s * Rw * 0.8, -R * 0.45], e = V3.add(b, [0.06 * c, s * (0.08 * c + 0.02), -0.01]), w = V3.add(e, [0.09 * c, s * 0.01, 0.012]);
      limb(M, [b, e, w], R * 0.18 + 0.004, R * 0.2 * (0.5 + c * 0.5) + 0.004, () => clawC, 0);
      claw(M, w, [1, s * 0.12, 0.02], s, c * 1.6, clawC, tipC);
    } else {   // shrimp: small first legs held forward
      limb(M, [[xc0 - cl * 0.25, s * Rw * 0.6, -R * 0.5], [xc0 - cl * 0.05, s * Rw * 1.1, -R * 0.9], [xc0 + 0.04, s * Rw * 0.9, -R * 0.75]], R * 0.17 + 0.004, 0.004, () => legC, 0.4);
    }
    // walking legs
    const ll = (0.09 + 0.08 * clamp(Pp.legs, 0, 1.5)) * (cs > 0.05 ? 1 : 0.85);
    for (let k = 0; k < 4; k++) {
      const a0 = [xc0 - cl * (0.38 + k * 0.16), s * Rw * 0.7, -R * 0.55], knee = V3.add(a0, [0.01 - k * 0.012, s * ll * 0.55, ll * 0.18]), foot = V3.add(a0, [0.02 - k * 0.03, s * ll * 0.95, -R * 0.75 - ll * 0.35]);
      limb(M, [a0, knee, foot], R * 0.16 + 0.004, 0.004, () => legC, 0.35);
    }
  }
  // swimmerets under the abdomen (shrimp)
  if (cs <= 0.05) for (let k = 0; k < 5; k++) { const t = 0.08 + k * 0.16, p0 = P(t), f = Fr(t); for (const s of [1, -1]) { const b = V3.add(p0, V3.add(V3.mul(f.N, -R * 0.6 * (1 - 0.4 * t)), V3.mul(f.B, s * Rw * 0.4))); limb(M, [b, V3.add(b, V3.add(V3.mul(f.N, -R * 0.5), V3.mul(f.T, 0.01)))], R * 0.06, 0.0012, () => legC, 0.6); } }
}
