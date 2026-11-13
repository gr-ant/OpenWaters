'use strict';
// ====================== REPTILES AND AMPHIBIANS ======================
// crocodilians, lizards, salamanders, snakes, frogs and legged turtles (from the reptile & amphibian studio branch)
// turtle: our sea-turtle plan gains the pond-turtle parts (a definition whose flippers is true/false uses the legged builder)
Object.assign(PLAN_INFO.turtle.parts, { neck: 0.3, tail: 0.15, ridges: 0, legs: 0.55 }); PLAN_INFO.turtle.amax = 0.6;
Object.assign(PLAN_INFO, {   // swim: the vertex shader's body wave (1 = anguilliform: the tail and body ripple)
  crocodilian: { height: 0.1,  width: 0.12, wave: 0.5,  swim: 1, parts: { snout: 0.1, snout_width: 0.8, tail: 0.5, limbs: 0.5, scutes: 1, crest: 0, gills: 0, eye: 0.4, head_width: 1.15, head_height: 0.55 } },
  lizard:      { height: 0.08, width: 0.09, wave: 0.45, swim: 1, parts: { snout: 0.04, snout_width: 0.8, tail: 0.58, limbs: 0.7, scutes: 0.5, crest: 0, gills: 0, eye: 0.5, head_width: 1, head_height: 0.85 } },
  salamander:  { height: 0.08, width: 0.09, wave: 0.8,  swim: 1, parts: { snout: 0.03, snout_width: 0.9, tail: 0.47, limbs: 0.45, scutes: 0, crest: 0.4, gills: 0, eye: 0.5, head_width: 1, head_height: 0.75 } },
  snake:       { height: 0.03, width: 0.033, wave: 0.4, swim: 1, amin: 0.00003, parts: { coils: 1.5, head: 0.04, paddle: 0, taper: 0.6 } },
  frog:        { height: 0.4,  width: 0.5,  wave: 0,    amax: 0.6, parts: { legs: 0.8, eye: 0.6, warts: 0, pose: 'sit', webbing: 0.6 } },
});
// smooth curve through control points (non-uniform Hermite), never below 0.002
function hermite(U, Y) {
  const n = U.length, m = Y.map((y, k) => k === 0 ? (Y[1] - Y[0]) / (U[1] - U[0]) : k === n - 1 ? (Y[n - 1] - Y[n - 2]) / (U[n - 1] - U[n - 2]) : (Y[k + 1] - Y[k - 1]) / (U[k + 1] - U[k - 1]));
  return u => { let k = 0; while (k < n - 2 && u > U[k + 1]) k++; const h = U[k + 1] - U[k] || 1, f = clamp((u - U[k]) / h, 0, 1), f2 = f * f, f3 = f2 * f;
    return Math.max(0.002, (2 * f3 - 3 * f2 + 1) * Y[k] + (f3 - 2 * f2 + f) * h * m[k] + (-2 * f3 + 3 * f2) * Y[k + 1] + (f3 - f2) * h * m[k + 1]); };
}
const dark = (c, k) => V3.mul(c, 1 - k);
// body along a path with frames; R(t, a) -> [radius toward up, sideways radius]
function bodyAlong(M, P, F, R, nt, na, col, mat) {
  surf(M, (t, a) => { const f = F(t), p = P(t), ca = Math.cos(a * TAU), sa = Math.sin(a * TAU), [r1, r2] = R(t, a, ca, sa);
    return [p[0] + f.N[0] * ca * r1 + f.B[0] * sa * r2, p[1] + f.N[1] * ca * r1 + f.B[1] * sa * r2, p[2] + f.N[2] * ca * r1 + f.B[2] * sa * r2]; }, nt, na, col, mat);
}
// a sheet standing on a path (fin crest): height h(t), side = +1 top / -1 bottom
function crestAlong(M, P, F, base, h, t0, t1, side, col) {
  surf(M, (t, a) => { const u = t0 + (t1 - t0) * t, f = F(u), p = P(u), d = side * (base(u) * 0.92 + a * h(u)); return [p[0] + f.N[0] * d, p[1] + f.N[1] * d, p[2] + f.N[2] * d]; },
    Math.max(8, Math.round((t1 - t0) * 80)), 3, (t, a) => col, (t, a) => 30 + 0.5 * a, { wrap: false });
}
function toes(M, base, n, spreadFrom, spreadTo, len, r, col, s, zg) {
  for (let k = 0; k < n; k++) { const ang = spreadFrom + (spreadTo - spreadFrom) * (n === 1 ? 0.5 : k / (n - 1)), d = [Math.cos(ang), s * Math.sin(ang), 0], tip = V3.add(base, V3.mul(d, len * (k === 0 || k === n - 1 ? 0.75 : 1)));
    tip[2] = zg; tube(M, t => V3.lerp(base, tip, t), t => r * (1 - 0.6 * t) + 0.001, null, 4, 5, () => col, () => 20.2); }
}

// crocodilians, lizards and salamanders share one four-legged body
function quadruped(D, B, Pp, M, C, paint, kind) {
  const W = B.width / 2, H = B.height / 2, sn = clamp(Pp.snout, 0.01, 0.3), sw = clamp(Pp.snout_width, 0.1, 1.6), tl = clamp(Pp.tail, 0.1, 0.75);
  const hwF = clamp(Pp.head_width, 0.5, 2), hhF = clamp(Pp.head_height, 0.3, 1.5), cr = clamp(Pp.crest, 0, 1.5), scu = clamp(Pp.scutes, 0, 1.5);
  const hd = sn + 0.05 * hwF + 0.02, ts = 1 - tl, hw = W * hwF;
  const U = [0, sn * 0.5, sn, hd, hd + 0.04, hd + 0.1, (hd + ts) / 2, ts, ts + tl * 0.35, ts + tl * 0.7, 1];
  const rh = hermite(U, [hw * (0.12 + 0.3 * sw), hw * (0.3 + 0.45 * sw), hw * (0.5 + 0.38 * sw), hw, hw * 0.82, W * 0.92, W, W * 0.86, W * 0.42, W * 0.18, 0.003]);
  const rv = hermite(U, [H * 0.16 * hhF, H * 0.34 * hhF, H * 0.48 * hhF, H * 0.7 * hhF, H * 0.64, H * 0.88, H, H * 0.9, H * (0.6 + 0.15 * cr), H * (0.34 + 0.1 * cr), 0.003]);
  const legL = 0.04 + 0.12 * clamp(Pp.limbs, 0, 1.5), zg = -H * 1.05 - legL * 0.22, sway = kind === 'salamander' ? 0.035 : 0.015;
  const P = u => [0.5 - u, sway * Math.sin(u * TAU * 0.9 + 0.3) * smst(0, 0.3, u), (kind === 'lizard' ? 0.25 * H * (1 - smst(0, 0.3, u)) : 0) - H * 0.55 * smst(ts, 1, u)];
  const F = frames(P, 160, [0, 0, 1]);
  const rows = kind === 'crocodilian' ? [0, 0.3, -0.3, 0.62, -0.62] : [0];
  bodyAlong(M, P, F, (t, a, ca, sa) => {
    let r1 = rv(t), r2 = rh(t); if (ca < 0) r1 *= 0.82;
    if (scu > 0 && t > hd) { const ang = Math.atan2(sa, ca); let k = 0; for (const rw of rows) k = Math.max(k, Math.exp(-(((ang - rw) / 0.13) ** 2)));
      r1 *= 1 + scu * (kind === 'crocodilian' ? 0.1 : 0.05) * k * (0.5 + 0.5 * Math.cos(t * (kind === 'crocodilian' ? 170 : 220))) * (t > ts + tl * 0.5 && Math.abs(ang) > 0.2 ? 0.3 : 1); }
    return [r1, r2];
  }, 180, 26, (t, a) => {
    const ca = Math.cos(a * TAU); let c = paint(t, ca, a);
    if (t < hd * 0.95) { const lip = 1 - smst(0.02, 0.07, Math.abs(ca + 0.12)); c = dark(c, 0.5 * lip * smst(0.002, 0.02, t));
      if (kind === 'crocodilian') c = V3.lerp(c, [0.92, 0.9, 0.82], lip * smst(0.55, 0.9, Math.sin(t * 420)) * 0.8 * (1 - smst(0.02, 0.06, Math.abs(ca + 0.2)))); }
    return c;
  }, () => MT.CLOTH);
  { const mt = M.mat; M.blob([0.5 + 0.002, P(0)[1], P(0)[2]], rh(0) * 0.9, rh(0) * 0.9, rv(0) * 0.9, 5, 8, paint(0, 0.5, 0)); M.mat = mt; }
  // eyes: crocodilians on top of the head, the others on the sides
  const ue = hd * (kind === 'crocodilian' ? 0.82 : 0.7), pe = P(ue), er = H * (0.12 + 0.22 * clamp(Pp.eye, 0, 1.5));
  eyePair(M, C, kind === 'crocodilian' ? [pe[0], rh(ue) * 0.5, pe[2] + rv(ue) * 0.95 - er * 0.5] : [pe[0], rh(ue) * 0.78, pe[2] + rv(ue) * 0.5], er, kind !== 'salamander', pe[1]);
  // spiny crest along the back (lizards)
  if (kind === 'lizard' && scu > 0.05) for (let u = hd + 0.02; u < ts + tl * 0.35; u += 0.018) {
    const p = P(u), f = F(u), b0 = V3.add(p, V3.mul(f.N, rv(u) * 0.95)), hgt = scu * H * 0.55 * (1 - smst(ts, ts + tl * 0.35, u)) * (0.6 + 0.4 * smst(hd, hd + 0.1, u));
    tube(M, t => V3.add(b0, V3.add(V3.mul(f.N, hgt * t), V3.mul(f.T, hgt * 0.35 * t))), t => H * 0.07 * (1 - t) + 0.001, null, 3, 5, () => dark(C.back, 0.1), () => MT.CLOTH);
  }
  // soft tail fins (newts, axolotls); axolotls run theirs up the back
  if (cr > 0.02) {
    const t0 = Pp.gills > 0.05 ? hd + 0.1 : ts - 0.04, h = u => cr * H * 0.95 * Math.pow(Math.sin(Math.PI * clamp((u - t0) / (1 - t0), 0, 1)), 0.7);
    const fc = V3.lerp(C.fins, C.flank, 0.2);
    crestAlong(M, P, F, rv, h, t0, 0.995, 1, fc);
    crestAlong(M, P, F, rv, u => h(u) * 0.75 * smst(ts, ts + 0.05, u), ts, 0.995, -1, fc);
  }
  // legs with toes
  const legC = (a) => { const v = Math.cos(a * TAU); return v >= 0 ? V3.lerp(C.flank, C.back, 0.5 * v) : V3.lerp(C.flank, C.belly, -0.5 * v); };
  for (const [uu, front] of [[hd + 0.07, true], [ts - 0.025, false]]) for (const s of [1, -1]) {
    const p0 = P(uu), att = [p0[0], p0[1] + s * rh(uu) * 0.8, p0[2] - rv(uu) * 0.25];
    const elbow = V3.add(att, [front ? 0.015 : -0.02, s * legL * 0.6, legL * 0.14]), wrist = [elbow[0] + (front ? 0.03 : 0.005), elbow[1] + s * legL * 0.45, zg + legL * 0.05];
    limb(M, [att, elbow, wrist], Math.min(rv(uu) * 0.55, legL * 0.24 + W * 0.12), legL * 0.12 + W * 0.05, (t, a) => legC(a), 0.3);
    toes(M, wrist, front ? 4 : 5, front ? -0.1 : 0.8, front ? 1.3 : 2.2, legL * 0.32 + 0.008, legL * 0.06 + 0.0025, legC(0.25), s, zg);
  }
  // external gills behind the head (axolotl)
  const gl = clamp(Pp.gills, 0, 1.5);
  if (gl > 0.05) { const ug = hd * 0.98, pg = P(ug), gc = hexRGB(B.colors.mouth || '#c06070');
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
      const b0 = [pg[0], pg[1] + s * rh(ug) * 0.85, pg[2] + rv(ug) * (0.5 - k * 0.38)], len = (0.05 + 0.04 * gl) * (k === 1 ? 1.1 : 0.9);
      const G = walk(b0, len, 20, u => norm3([-0.7 - 0.3 * u, s * 0.6, 0.55 - k * 0.5 + 0.4 * u]));
      tube(M, G, t => 0.009 * (1 - 0.5 * t) + 0.003, null, 8, 6, () => gc, t => 20 + 0.6 * t);
      for (let j = 1; j <= 5; j++) { const q = G(j / 6), d = norm3([0.2, s * 0.3, 1]); tube(M, t => V3.add(q, V3.mul(V3.add(d, [-t * 0.5, 0, 0]), t * len * 0.28)), t => 0.004 * (1 - 0.7 * t) + 0.0015, null, 3, 4, () => V3.lerp(gc, [1, 1, 1], 0.15), t => 20 + 0.8 * t); }
    } }
}

Object.assign(PLAN_BUILD, {
  crocodilian(D, B, Pp, M, C, paint) { quadruped(D, B, Pp, M, C, paint, 'crocodilian'); },
  lizard(D, B, Pp, M, C, paint) { quadruped(D, B, Pp, M, C, paint, 'lizard'); },
  salamander(D, B, Pp, M, C, paint) { quadruped(D, B, Pp, M, C, paint, 'salamander'); },

  turtle_legs(D, B, Pp, M, C, paint) {   // pond and snapping turtles: domed or ridged shell, four legs, neck and tail
    const W = clamp(B.width, 0.4, 1.2) / 2, Hc = clamp(B.height, 0.08, 0.6), Hb = Hc * 0.32, fl = !!Pp.flippers, rd = clamp(Pp.ridges, 0, 1.5), lg = clamp(Pp.legs, 0, 1.5);
    const rim = ph => { const c = Math.cos(ph), s = Math.sin(ph); return [0.5 * c, W * s * (1 - 0.1 * Math.max(0, c) ** 2)]; };
    const vw = W * 0.24;
    const seam = (x, y, t) => {
      const ay = Math.abs(y); let k = 0;
      if (t < 0.8) { k = Math.max(k, 1 - smst(0.004, 0.012, Math.abs(ay - vw)));
        const f1 = ((x + 0.5) * 5) % 1, f2 = ((x + 0.6) * 4) % 1;
        if (ay < vw) k = Math.max(k, 1 - smst(0.004, 0.012, Math.min(f1, 1 - f1) / 5)); else k = Math.max(k, 1 - smst(0.004, 0.012, Math.min(f2, 1 - f2) / 4)); }
      return Math.max(k, 1 - smst(0.006, 0.02, Math.abs(t - 0.82)));
    };
    surf(M, (t, a) => {
      const ph = a * TAU, r = rim(ph), q = Math.sin(t * Math.PI / 2), y = r[1] * q;
      let z = Hc * Math.pow(Math.cos(t * Math.PI / 2), 0.75);
      if (rd) { z += rd * 0.035 * Math.exp(-((y / 0.03) ** 2)) * (1 - t) * (0.85 + 0.15 * Math.cos(r[0] * q * 40)); for (const s of [1, -1]) z += rd * 0.02 * Math.exp(-(((y - s * W * 0.5 * q) / 0.03) ** 2)) * (1 - t); }
      const rr = 1 + (rd ? 0.035 * Math.max(0, -Math.cos(ph)) * Math.max(0, Math.sin(ph * 16)) * smst(0.85, 1, t) : 0);
      return [r[0] * q * rr, r[1] * q * rr, z];
    }, 22, 64, (t, a, p) => { const c = paint(0.5 - p[0], 1 - 0.65 * t, a); return dark(c, 0.55 * seam(p[0], p[1], t)); }, () => MT.CLOTH);
    surf(M, (t, a) => { const ph = a * TAU, r = rim(ph), q = Math.sin(t * Math.PI / 2); return [r[0] * 0.9 * q, r[1] * 0.9 * q, -Hb * Math.pow(Math.cos(t * Math.PI / 2), 0.35)]; },
      14, 48, (t, a, p) => { const f = ((p[0] + 0.5) * 6) % 1; return dark(C.belly, 0.35 * Math.max(1 - smst(0.003, 0.009, Math.min(f, 1 - f) / 6), 1 - smst(0.003, 0.008, Math.abs(p[1])))); }, () => MT.CLOTH);
    const skin = (t, a) => V3.lerp(C.fins, C.flank, 0.15 + 0.2 * Math.max(0, Math.cos(a * TAU)));
    // neck and head
    const hl = clamp(Pp.head, 0.08, 0.45), nk = clamp(Pp.neck, 0, 1), nb = [0.38, 0, Hc * 0.12], he = [0.5 + nk * 0.22, 0, Hc * 0.2 + nk * 0.03], hc = V3.add(he, [hl * 0.38, 0, hl * 0.02]);
    tube(M, t => V3.lerp(nb, he, t), t => hl * (0.34 - 0.04 * t), t => hl * (0.4 - 0.06 * t), 8, 14, (t, a) => skin(t, a), () => MT.CLOTH);
    ellip(M, hc, null, [hl * 0.55, hl * 0.44, hl * 0.38], 14, 16, (t, a) => { const v = ellV(t, a); let c = V3.lerp(C.fins, C.flank, 0.2 + 0.25 * Math.max(0, v)); if (v < 0) c = V3.lerp(c, C.belly, smst(0, -0.8, v) * 0.6); return dark(c, 0.55 * (1 - smst(0.02, 0.07, Math.abs(v + 0.18))) * smst(0.5, 0.15, t)); },
      () => MT.CLOTH, (t, a) => 1 - 0.28 * smst(0.45, 0, t) * (1 - 0.5 * Math.cos(a * TAU)));
    eyePair(M, C, [hc[0] + hl * 0.2, hl * 0.33, hc[2] + hl * 0.13], hl * 0.09, false);
    // tail
    const tl = clamp(Pp.tail, 0, 0.8);
    if (tl > 0.01) tube(M, t => [-0.44 - t * tl, 0, -Hb * 0.2 - 0.02 * t], t => (0.035 + 0.025 * rd) * (1 - 0.9 * t) * (1 + (rd ? 0.25 * Math.max(0, Math.sin(t * 60)) : 0)) + 0.002, t => (0.035 + 0.02 * rd) * (1 - 0.9 * t) + 0.002, 20, 10, (t, a) => skin(t, a), t => 20 + 0.4 * t);
    // legs or flippers
    for (const s of [1, -1]) {
      if (fl) {
        const front = [[0.24, s * W * 0.82, -0.01], [-0.3, s, -0.08], 0.22 + 0.2 * lg, 0.075], back = [[-0.36, s * W * 0.62, -0.02], [-1, s * 0.6, -0.05], 0.1 + 0.08 * lg, 0.05];
        for (const [b, dd, L, w] of [front, back]) { const d = norm3(dd), ax = axesFrom(d);
          ellip(M, V3.add(b, V3.mul(d, L)), ax, [L, w, 0.014], 12, 14, (t, a) => skin(t, a), (t, a) => 20 + 0.6 * smst(1, 0, t), (t, a) => 1 - 0.35 * smst(0.5, 0, t) * Math.abs(Math.sin(a * TAU))); }
      } else {
        const L = 0.09 + 0.06 * lg;
        for (const [b, out, fwd] of [[[0.28, s * W * 0.72, -Hb * 0.35], 1, 0.07], [[-0.3, s * W * 0.66, -Hb * 0.35], 1, -0.05]]) {
          const knee = V3.add(b, [fwd * 0.4, s * L * 0.75, 0.02]), foot = V3.add(b, [fwd * 1.1, s * L * 1.25, -Hb - 0.02]);
          limb(M, [b, knee, foot], 0.06, 0.042, (t, a) => skin(t, a), 0.3);
          const ax = axesFrom([fwd >= 0 ? 1 : -0.3, s * 0.8, 0]); ellip(M, V3.add(foot, [0, 0, -0.01]), ax, [0.045, 0.035, 0.012], 8, 10, (t, a) => skin(t, a), () => 20.2);
          toes(M, foot, 4, fwd >= 0 ? 0.0 : 1.4, fwd >= 0 ? 1.2 : 2.6, 0.045, 0.006, [0.15, 0.13, 0.1], s, -Hb - 0.045);
        }
      }
    }
  },

  snake(D, B, Pp, M, C, paint) {
    const R = clamp(B.width, 0.005, 0.15) / 2, Rv = clamp(B.height, 0.005, 0.15) / 2, coils = clamp(Pp.coils, 0, 4), hl = clamp(Pp.head, 0.015, 0.12), pad = clamp(Pp.paddle, 0, 1.5), tap = clamp(Pp.taper, 0.1, 1);
    const raw = walk([0, 0, 0], 1, 240, s => { const ps = Math.PI + (coils > 0 ? 0.95 : 0) * Math.sin(TAU * coils * s) * smst(0, 0.12, s); return [Math.cos(ps), Math.sin(ps), 0]; });
    let lo = [1e9, 1e9], hi = [-1e9, -1e9]; for (let i = 0; i <= 100; i++) { const q = raw(i / 100); lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; }
    const ox = (lo[0] + hi[0]) / 2, oy = (lo[1] + hi[1]) / 2;
    const P = t => { const q = raw(t); return [q[0] - ox, q[1] - oy, R * 0.9 + 0.035 * (1 - smst(0, 0.12, t))]; };
    const F = frames(P, 300, [0, 0, 1]), te = 1 - 0.12 - 0.12 * tap;
    const U = [0, hl * 0.15, hl * 0.6, hl, hl * 1.5, 0.25, 0.55, te, 1];
    const rh = hermite(U, [R * 0.3, R * 0.75, R * 1.0, R * 0.85, R * 0.72, R, R, R * 0.75, 0.003]), rv = hermite(U, [Rv * 0.25, Rv * 0.55, Rv * 0.72, Rv * 0.7, Rv * 0.72, Rv, Rv, Rv * 0.75, 0.003]);
    bodyAlong(M, P, F, (t, a, ca) => { let r1 = rv(t), r2 = rh(t); if (ca < 0) r1 *= 0.78;
      if (pad) { const k = smst(0.8, 0.92, t); r1 *= 1 + pad * 2.4 * k * (1 - 0.6 * smst(0.97, 1, t)); r2 *= 1 - 0.55 * pad * k; } return [r1, r2]; },
      300, 16, (t, a) => paint(t, Math.cos(a * TAU), a), (t) => (t > 0.85 && pad ? 30 + 0.4 * (t - 0.85) / 0.15 : MT.CLOTH));
    const pe = P(hl * 0.45); eyePair(M, C, [pe[0], rh(hl * 0.45) * 0.8, pe[2] + rv(hl * 0.45) * 0.45], Math.max(R, Rv) * 0.32, false, pe[1]);
    const tip = P(0), tc = hexRGB(B.colors.mouth || '#c03030');
    tube(M, t => V3.add(tip, [0.004 + t * 0.03, 0, -R * 0.2]), () => R * 0.07 + 0.0008, null, 3, 4, () => tc, t => 20 + 0.5 * t);
    for (const s of [1, -1]) tube(M, t => V3.add(tip, [0.034 + t * 0.014, s * t * 0.008, -R * 0.2 - t * 0.003]), () => R * 0.06 + 0.0007, null, 3, 4, () => tc, t => 20 + 0.6 + 0.3 * t);
  },

  frog(D, B, Pp, M, C, paint) {
    const W = clamp(B.width, 0.2, 1.2) / 2, H = clamp(B.height, 0.15, 0.9) / 2, lg = clamp(Pp.legs, 0, 1.5), wart = clamp(Pp.warts, 0, 1.5), swim = Pp.pose === 'swim', web = clamp(Pp.webbing, 0, 1);
    const nz = makeNoise(91), th = swim ? 0.03 : 0.32, X = [Math.cos(th), 0, Math.sin(th)], Z = [-Math.sin(th), 0, Math.cos(th)];
    const loc = (x, y, z) => [X[0] * x + Z[0] * z, y, X[2] * x + Z[2] * z];
    const bump = (x, y, z) => 1 + wart * 0.045 * Math.max(0, nz(x * 28, y * 28 + z * 19)) * smst(-0.3, 0.2, z / H);
    surf(M, (t, a) => { const ct = Math.cos(Math.PI * t), st = Math.sin(Math.PI * t), ca = Math.cos(a * TAU), sa = Math.sin(a * TAU);
      let x = 0.5 * ct, y = W * st * sa * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6))), z = H * st * ca * (ca < 0 ? 0.75 : 1) * (0.9 + 0.1 * st); const b = bump(x, y, z); return loc(x * (t < 0.5 ? 1 : b), y * b, z * b); },
      28, 32, (t, a) => { const ct = Math.cos(Math.PI * t), st = Math.sin(Math.PI * t), ca = Math.cos(a * TAU), x = 0.5 * ct, v = st * ca;
        let c = paint(0.5 - x, v, a); if (x > 0.12) c = dark(c, 0.55 * (1 - smst(0.02, 0.06, Math.abs(v + 0.08))) * smst(0.12, 0.2, x));
        const ty = W * 0.5, dz = H * 0.35, sa = Math.sin(a * TAU); const dd = Math.hypot(x - 0.16, (Math.abs(sa * st * W) - ty) * 1.2, (st * ca * H) - dz); if (st > 0.5) c = V3.lerp(c, dark(C.fins, 0.25), (1 - smst(0.035, 0.05, dd)) * 0.75);
        return c; }, () => MT.CLOTH);
    const eye = 0.035 + 0.05 * clamp(Pp.eye, 0, 1.5), ep = loc(0.27, W * 0.42, H * 0.72);
    eyePair(M, C, ep, eye, true);
    const zg = swim ? -H - 0.02 : loc(-0.5, 0, 0)[2] - H * 0.55, legC = (a) => paint(0.55, Math.cos(a * TAU) * 0.7, a), k = 0.7 + 0.9 * lg;
    for (const s of [1, -1]) {
      // hind leg: thigh, shin, long foot with webbed toes
      const hip = V3.add(loc(-0.36, s * W * 0.5, -H * 0.25), [0, 0, 0]);
      let knee, ankle, toeDir;
      if (swim) { knee = V3.add(hip, [-0.28 * k, s * 0.12 * k, -0.01]); ankle = V3.add(knee, [-0.3 * k, s * 0.04 * k, 0]); toeDir = [-1, s * 0.25, 0]; }
      else { knee = [hip[0] + 0.3 * k, s * (W * 0.78 + 0.07 * k), zg + 0.07 * k]; ankle = [hip[0] - 0.05, s * (W * 0.98 + 0.08 * k), zg + 0.035]; toeDir = [1, s * 0.3, 0]; }
      limb(M, [hip, knee, ankle], 0.075 * Math.min(1.3, k), 0.032, (t, a) => legC(a), 0.25);
      const fl = 0.24 * k, n = 5, tipsP = [];
      for (let j = 0; j < n; j++) { const ang = Math.atan2(toeDir[1], toeDir[0]) + s * (j / (n - 1) - 0.5) * 0.9, d = [Math.cos(ang), Math.sin(ang), 0], tip = V3.add(ankle, V3.mul(d, fl * (0.65 + 0.35 * Math.sin(Math.PI * (j + 1) / (n + 1)))));
        if (!swim) tip[2] = zg; const T = t => V3.lerp(ankle, tip, t); tipsP.push(T); tube(M, T, t => 0.013 * (1 - 0.6 * t) + 0.002, null, 6, 5, () => legC(0.25), () => 20.25); }
      if (web > 0.02) for (let j = 0; j < n - 1; j++) surf(M, (t, a) => { const q = V3.lerp(tipsP[j](t * (0.35 + 0.6 * web)), tipsP[j + 1](t * (0.35 + 0.6 * web)), a); return q; }, 5, 3, () => V3.lerp(legC(0.25), C.belly, 0.25), () => 20.25, { wrap: false });
      // front leg and fingers
      const sh = loc(0.18, s * W * 0.55, -H * 0.35);
      const el = swim ? [sh[0] - 0.06, s * W * 0.95, sh[2] - 0.04] : [sh[0] - 0.02, s * W * 0.8, zg + 0.12], hd = swim ? [sh[0] - 0.16, s * W * 0.85, sh[2] - 0.08] : [sh[0] + 0.08, s * W * 0.82, zg + 0.01];
      limb(M, [sh, el, hd], 0.035, 0.02, (t, a) => legC(a), 0.25);
      toes(M, hd, 4, swim ? 2.6 : -0.3, swim ? 3.6 : 0.9, 0.05, 0.007, legC(0.25), s, swim ? hd[2] : zg);
    }
  },
});


{ const seaTurtle = PLAN_BUILD.turtle;   // flippers as a number (size): the sea turtle; true / false: the legged builder
  PLAN_BUILD.turtle = function (D, B, Pp, M, C, paint) { if (typeof Pp.flippers === 'boolean') { PLAN_BUILD.turtle_legs(D, B, Pp, M, C, paint); D._wave = 0; D._swim = 0; } else seaTurtle.call(this, D, B, Pp, M, C, paint); }; }

function planMesh(D) {
  const B = D.body, M = meshBuilder(true), { C, paint } = makePainter(B);
  D._jaw = [0, 0, 0]; D._wave = PLAN_INFO[B.plan].wave; D._swim = PLAN_INFO[B.plan].swim || 0; M.mat = MT.CLOTH;
  PLAN_BUILD[B.plan](D, B, B.parts, M, C, paint);
  if (SWIM_MODES[B.swim] >= 0) D._swim = SWIM_MODES[B.swim];   // a plan can be told how to swim (a manatee: cetacean)
  return new Float32Array(M.v);
}


// ---- registry ----
const HERP_PLANS = ['turtle', 'crocodilian', 'lizard', 'salamander', 'snake', 'frog'];
const FishDB = {
  list: [], byId: {}, gpu: [], revision: 0,
  register(raw, { save = false, quiet = false } = {}) {
    const r = validateFish(raw);
    if (!r.def) { if (!quiet) console.warn('Fish rejected:', raw && raw.id, r.errors); return r; }
    const d = r.def;
    d._act = typeof d.activity.pattern === 'string' ? ACTIVITY_PRESETS[d.activity.pattern] : d.activity.pattern.map(v => clamp(v, 0, 1));
    // the mesh (and its lowest point) is built the first time something needs it: a species nobody meets costs nothing
    Object.defineProperty(d, '_mesh', { configurable: true, get: () => FishDB.mesh(d).m });
    Object.defineProperty(d, '_zmin', { configurable: true, get: () => FishDB.mesh(d).zmin });   // lowest point (model units): rests on the bed
    d._herp = HERP_PLANS.includes(d.body.plan);   // reptiles and amphibians
    d._shell = !!d.body.plan && !['fish', 'ray', 'pinniped'].includes(d.body.plan) && !d._herp;   // rays and mammals count with fishAbundance, herps with herpAbundance
    d._air = d.behavior.breath_hold_s > 0;   // breathes air: surfaces to blow, may leap, may haul out
    d._hid = [...d.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;   // stable per-species seed (all 32 bits: 16 gave two species the same one)
    d._needCover = (d.habitat.cover_required || 0) >= 0.5 ? Object.keys(d.habitat.cover).filter(k => k !== 'open').sort((a, b) => d.habitat.cover[b] - d.habitat.cover[a])[0] : null;   // e.g. a clownfish's anemone
    d._jelly = d.body.plan === 'jelly';   // drawn see-through in their own pass; may sting
    d._benthic = ['bivalve', 'snail', 'crab', 'lobster', 'octopus'].includes(d.body.plan) || (['ray', 'jelly'].includes(d.body.plan) && d.body.parts.bottom >= 0.5);   // crawlers, sessile animals and stingrays live on the bed
    const L = d.size.length_cm; d._mu = Math.log(L.typical); d._sig = L.spread;
    const old = this.byId[d.id];
    if (old) { const i = this.list.indexOf(old); this.list[i] = d; if (this.gpu[i]) this.gpu[i].stale = true; } else this.list.push(d);
    this.byId[d.id] = d; this.revision++;
    if (save) { const s = FishDB.saved(); s[d.id] = raw; try { localStorage.setItem('embercrown-fish-defs', JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
    if (r.warnings.length && !quiet) console.info(`Fish "${d.id}" notes:`, r.warnings);
    return r;
  },
  mesh(d) { // build and cache a species' mesh on first use (also sets _jaw, _wave, _swim, which drawing reads)
    let c = d.__mesh; if (c) return c;
    const m = fishMesh(d); let zmin = 0; for (let k = 2; k < m.length; k += VS) zmin = Math.min(zmin, m[k]);
    return (d.__mesh = { m, zmin });
  },
  // species that can live in each kind of water on this island's climate, in list order (so cells come out the same as scoring every species)
  byKind(kind) {
    if (this._kindRev !== this.revision) { this._kindRev = this.revision; this._kind = WATER_KEYS.map(W => this.list.map((D, si) => [D, si]).filter(([D]) => (D.habitat.waters[W] || 0) > 0 && (!D.habitat.climates || D.habitat.climates.includes(CLIMATE.key))).sort((a, b) => (a[0]._shell ? 2 : a[0]._herp ? 1 : 0) - (b[0]._shell ? 2 : b[0]._herp ? 1 : 0))); }   // fish first: a cell fills in this order
    return this._kind[kind] || [];
  },
  saved() { try { const s = JSON.parse(localStorage.getItem('embercrown-fish-defs') || '{}'); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; } catch (e) { return {}; } },
  forget(id) { const s = this.saved(); delete s[id]; try { localStorage.setItem('embercrown-fish-defs', JSON.stringify(s)); } catch (e) { /* */ } },
};

// ---- the water environment fish respond to ----
// water temperature (°C) by kind, altitude, time of day and depth below the surface (lakes and the sea stratify)
