'use strict';
// ====================== JELLIES: jellyfish, the man o' war, comb jellies ======================
// body.plan "jelly". The model: the bell is 1 across (x -0.5..0.5) with its rim at z = 0 and the dome above; tentacles and
// oral arms hang below. They're drawn see-through in their own blended pass (parts.clear), the bell pulses (swim mode
// "pulse", in lit.js) and the tentacles sway and trail. parts.sting: how much brushing past one hurts (engine/update.js).
// Colours: back (top of the bell), flank (its rim), belly (underneath), fins (tentacles), mouth (oral arms), eye (accents:
// stripes, the moon jelly's rings, a man o' war's crest, a comb jelly's glowing rows).
PLAN_INFO.jelly = { height: 0.5, width: 1, wave: 1, swim: SWIM_MODES.pulse,
  parts: { shape: 'dome', bell: 0.45, lobes: 0, tentacles: 16, tentacle_len: 1.2, arms: 0.5, arm_count: 4, frill: 0.4, stripes: 0, rings: 0, clear: 0.6, sting: 0.3, bottom: 0 } };
const JELLY_SHAPES = ['dome', 'cube', 'float', 'comb'];
const hueRGB = h => [0, 1, 2].map(i => 0.55 + 0.45 * Math.cos(TAU * (h + i / 3)));

PLAN_BUILD.jelly = function (D, B, Pp, M, C) {
  const R = 0.5, H = clamp(Pp.bell, 0.08, 1.2), shape = Pp.shape, acc = C.eye, rnd = mulberry32((D._hid || 7) * 977 + 13), cube = shape === 'cube';
  M.mat = MT.GLASS;   // plain colour, no texture
  // the bell's radius at t (0 the crown .. 1 the rim) and a (around); a box jelly's is squared off, a lion's mane's scalloped
  const rad = (t, a) => { const q = a * TAU, box = cube ? 0.86 / Math.pow(Math.cos(q) ** 4 + Math.sin(q) ** 4, 0.25) : 1;
    const lob = Pp.lobes > 0 ? 1 + 0.08 * Math.abs(Math.cos(q * Pp.lobes / 2)) * smst(0.6, 1, t) : 1;
    return R * Math.sin(t * Math.PI / 2) * box * lob; };
  const bellCol = (t, a) => {
    let c = V3.lerp(C.back, C.flank, smst(0.15, 1, t));
    if (Pp.stripes > 0) c = V3.lerp(c, acc, smst(0.4, 0.8, Math.cos(a * TAU * Pp.stripes)) * smst(0.08, 0.35, t) * 0.85);   // radial stripes
    if (Pp.rings > 0) { const k = Math.round(Pp.rings), da = Math.abs(((a * k) % 1 + 1) % 1 - 0.5) / k * TAU * 0.5, d = Math.hypot(t - 0.36, da);   // gonad rings round the crown
      c = V3.lerp(c, acc, (1 - smst(0.015, 0.03, Math.abs(d - 0.09))) * 0.9); }
    return c;
  };
  const hang = (start, L, out, steps, wob) => walk(start, L, steps, s => norm3([out[0] * 0.3 * (1 - s) + wob * Math.sin(s * 6 + start[0] * 40), out[1] * 0.3 * (1 - s) + wob * Math.cos(s * 5 + start[1] * 40), -1]));

  if (shape === 'dome' || cube) {
    surf(M, (t, a) => { const r = rad(t, a), q = a * TAU, fl = smst(0.85, 1, t) * 0.035; return [Math.cos(q) * (r + fl), Math.sin(q) * (r + fl), H * Math.cos(t * Math.PI / 2) - fl]; }, 14, 28, bellCol);
    surf(M, (t, a) => { const r = rad(t, a) * 0.93, q = a * TAU; return [Math.cos(q) * r, Math.sin(q) * r, H * 0.65 * Math.cos(t * Math.PI / 2) - 0.012]; }, 8, 24, () => C.belly);   // the underside
  } else if (shape === 'float') {   // a man o' war: a gas float lying along the surface with a ruffled crest
    ellip(M, [0, 0, 0.1], null, [0.5, 0.19, 0.15], 14, 20, (t, a) => V3.lerp(C.flank, C.back, smst(-0.2, 0.8, ellV(t, a))), null, (t, a) => 1 + 0.06 * Math.sin(t * Math.PI) * Math.cos(a * TAU) ** 2);
    surf(M, (t, a) => [0.38 - 0.72 * t, 0.025 * Math.sin(t * 34) * a, 0.22 + 0.15 * Math.sin(Math.PI * t) * a * (1 + 0.15 * Math.sin(t * 17))], 18, 4, (t, a) => V3.lerp(C.back, acc, a), null, { wrap: false });
  } else {   // a comb jelly: a clear oval with eight rows of glowing, rainbow-flickering combs
    ellip(M, [0, 0, 0.18], null, [0.5, 0.3, 0.32], 16, 24, (t, a) => V3.lerp(C.belly, C.back, 0.5 + 0.5 * ellV(t, a)), null, (t, a) => 1 - 0.12 * smst(0.75, 1, t) * Math.abs(Math.sin(a * TAU)));
    M.mat = MT.GLOW;
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8, ca = Math.cos(a * TAU), sa = Math.sin(a * TAU);
      tube(M, t => { const tt = 0.12 + 0.7 * t, s = Math.sin(Math.PI * tt) * 1.04; return [0.5 * Math.cos(Math.PI * tt) * 1.04, 0.3 * s * sa, 0.18 + 0.32 * s * ca]; }, () => 0.014, null, 14, 4, t => hueRGB(t * 2.5 + k / 8)); }
    M.mat = MT.GLASS;
  }

  // tentacles: round the rim (a box jelly's in four corner bundles; a man o' war's from under the float, long ones trailing)
  const nT = Math.round(Pp.tentacles), TL = Pp.tentacle_len;
  for (let k = 0; k < nT; k++) {
    let p0, out;
    if (shape === 'float') { p0 = [-0.05 - 0.4 * rnd(), (rnd() - 0.5) * 0.16, 0.0]; out = [-0.4, (rnd() - 0.5) * 0.6]; }
    else { const q = cube ? (Math.floor(k * 4 / nT) + 0.5) * TAU / 4 + (rnd() - 0.5) * 0.12 : (k + 0.5) / nT * TAU, r0 = rad(1, q / TAU) * 0.97;
      out = [Math.cos(q), Math.sin(q)]; p0 = [out[0] * r0, out[1] * r0, -0.02]; }
    const L = TL * (shape === 'float' && rnd() < 0.7 ? 0.25 + 0.3 * rnd() : 0.7 + 0.6 * rnd());
    tube(M, hang(p0, L, out, 24, 0.12), t => 0.007 * (1 - 0.6 * t) + 0.0025, null, 16, 4, t => V3.lerp(C.fins, C.flank, 0.3 * t), t => 20 + 0.95 * t);
  }
  // oral arms: frilly ribbons from the middle of the underside (a man o' war's are its blue feeding polyps)
  const nA = shape === 'comb' ? 0 : Math.round(Pp.arm_count), AL = Pp.arms;
  if (AL > 0.02) for (let k = 0; k < nA; k++) {
    const q = (k + 0.25) / nA * TAU, out = [Math.cos(q) * 0.5, Math.sin(q) * 0.5], p0 = shape === 'float' ? [-0.1 - 0.25 * rnd(), (rnd() - 0.5) * 0.1, 0.02] : [out[0] * 0.08, out[1] * 0.08, -0.02];
    tube(M, hang(p0, AL * (0.8 + 0.4 * rnd()), out, 20, 0.15), t => (0.045 * (1 - 0.7 * t) + 0.006) * (1 + Pp.frill * 0.7 * Math.sin(t * 55 + k * 2)), t => 0.016 + 0.01 * (1 - t), 20, 6,
      t => V3.lerp(C.mouth, C.belly, 0.35 * t), t => 20 + 0.7 * t);
  }
  // an upside-down jelly lies bell-down on the sand with its arms up to the light
  if (Pp.bottom >= 0.5) for (let i = 0; i < M.v.length; i += VS) { M.v[i + 2] = -M.v[i + 2]; M.v[i + 5] = -M.v[i + 5]; }
};
