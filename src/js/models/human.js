'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.39, thigh: 0.4, torso: 0.52, neck: 0.045, head: 0.135, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
// How the angler looks is data (README.md, "The angler's look"): src/angler/angler.json gives skin, hair and, for each island
// climate, what's worn and its colours; src/angler/clothes.json gives every garment's shapes. This file only knows the bare body.
const ANGLER_LOOK = { skin: '#dba985', hair: { style: 'short', color: '#573826' }, outfits: {} };
const HUMAN_BUILD = { shoulder: 0.185, hip: 0.1, chest: [0.2, 0.135], waist: [0.175, 0.125], hips: [0.185, 0.13] };   // [half-width, half-depth] of chest, waist and hips
// The part meshes, in the frame above (x forward, y to the right, z up, joint at the origin): the bare body, then each garment
// worn in this climate drawn over it. A garment lists shapes per body part (all numbers in metres, in that part's frame):
//   { blob: [x, y, z, rx, ry, rz], detail?: [rings, segments], mirror?: true (again at -y) }    an ellipsoid
//   { tube: [z0, r0, z1, r1], at?: [x, y], sides?, cap? }                                         a tapered tube down the part
//   { oval: [z0, halfWidth0, halfDepth0, z1, halfWidth1, halfDepth1], cap? }                      an oval ring (torso)
//   { wrap: [z0, z1, off0, off1?], cap? }                                                         a ring following the torso, off0 / off1 out from the skin
// each with color: a key of the outfit's colors, "skin", "hair" or "#rrggbb"; shade?: a darkening factor; mat?: "plain" (not cloth).
function humanParts(look, climate = 'temperate', clothes = []) {
  const K = Object.assign({}, ANGLER_LOOK, look), Hr = Object.assign({}, ANGLER_LOOK.hair, K.hair), W = (K.outfits || {})[climate] || {}, C = W.colors || {}, G = HUMAN_BUILD, H = HUMAN;
  H.shoulder = G.shoulder; H.hip = G.hip;   // the pose hangs the arms and legs at these widths
  const rgb = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : null;
  const skin = rgb(K.skin) || [0.86, 0.66, 0.52], hair = rgb(Hr.color) || [0.34, 0.22, 0.15], top = H.neck + H.head;
  const worn = (Array.isArray(W.wear) ? W.wear : []).map(id => clothes.find(g => g && g.id === id)).filter(Boolean);
  // an oval ring from height z0 (half-width a0 across the shoulders, half-depth c0 front to back) down to z1 (a1, c1): chests and coats aren't round
  const oval = (B, z0, z1, [a0, c0], [a1, c1], col, cap) => B.tube([0, 0, z0], [0, 0, z1], 1, 1, 32, col, cap, (k, e) => 1 / Math.hypot(Math.cos(k / 32 * 6.2832) / (e ? a1 : a0), Math.sin(k / 32 * 6.2832) / (e ? c1 : c0)));
  const sh = [G.shoulder + 0.02, 0.105], grow = ([a, c], g) => [a + g, c + g], mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const sec = z => z > -0.24 ? mix(sh, G.chest, clamp((z + 0.11) / -0.13, 0, 1)) : mix(G.chest, G.waist, clamp((z + 0.24) / (0.24 - H.torso), 0, 1));   // the torso's cross-section z below the shoulders
  const nums = (v, n) => Array.isArray(v) && v.length >= n && v.every(Number.isFinite);
  const shape = (B, q) => {   // one garment shape; anything malformed is skipped
    const base = q.color === 'skin' ? skin : q.color === 'hair' ? hair : rgb(C[q.color]) || rgb(q.color) || [0.5, 0.5, 0.5], col = base.map(v => v * (Number.isFinite(q.shade) ? q.shade : 1)), d = nums(q.detail, 2) ? q.detail : [4, 8];
    B.mat = q.mat === 'plain' ? MT.GEN : MT.CLOTH;
    if (nums(q.blob, 6)) for (const s of q.mirror ? [1, -1] : [1]) B.blob([q.blob[0], s * q.blob[1], q.blob[2]], q.blob[3], q.blob[4], q.blob[5], d[0], d[1], col);
    else if (nums(q.tube, 4)) { const at = nums(q.at, 2) ? q.at : [0, 0]; B.tube([at[0], at[1], q.tube[0]], [at[0], at[1], q.tube[2]], q.tube[1], q.tube[3], q.sides > 2 ? q.sides : 8, col, !!q.cap); }
    else if (nums(q.oval, 6)) oval(B, q.oval[0], q.oval[3], [q.oval[1], q.oval[2]], [q.oval[4], q.oval[5]], col, !!q.cap);
    else if (nums(q.wrap, 3)) oval(B, q.wrap[0], q.wrap[1], grow(sec(q.wrap[0]), q.wrap[2]), grow(sec(q.wrap[1]), q.wrap[3] ?? q.wrap[2]), col, !!q.cap);
  };
  // meshBuilder(true) and smoothTube: smooth-shaded blobs and tubes, at twice the detail the shapes ask for, so the figure is soft, not faceted
  const part = (name, body, keep = () => true) => { const B = meshBuilder(true), tb = B.tube, bl = B.blob; B.smoothTube = true; B.mat = MT.GEN;
    B.tube = (p0, p1, r0, r1, n, col, cap, jit) => tb(p0, p1, r0, r1, jit ? n : n * 3, col, cap, jit);   // (an oval's jit counts its own sides)
    B.blob = (c, rx, ry, rz, rings, segs, ...a) => bl(c, rx, ry, rz, rings * 2, segs * 3, ...a); body(B); for (const g of worn) for (const q of (g.parts && g.parts[name]) || []) if (q && keep(q)) shape(B, q);
    return clothShade(name, new Float32Array(B.v)); };
  // soft shading baked into the clothes' colours (skin, hair and plain boots are left alone): lighter toward the top of each part, darker on
  // faces turned down (under a hem, a cuff, the brim) and in the armpits, and a faint unevenness, so a garment reads as cloth, not one flat colour
  const clothShade = (name, m) => { if (name === 'head') return m; let lo = 1e9, hi = -1e9; for (let i = 2; i < m.length; i += VS) { lo = Math.min(lo, m[i]); hi = Math.max(hi, m[i]); }
    for (let i = 0; i < m.length; i += VS) { if (m[i + 9] !== MT.CLOTH) continue; const x = m[i], y = m[i + 1], z = m[i + 2], nz = m[i + 5];
      let f = (0.9 + 0.1 * (z - lo) / (hi - lo || 1)) * (1 - 0.14 * Math.max(0, -nz)) * (1 + 0.03 * Math.sin(x * 41 + z * 23) * Math.sin(y * 37 - z * 17));
      if (name === 'torso') f *= 1 - 0.12 * clamp((Math.abs(y) - G.chest[0] * 0.8) / 0.05, 0, 1) * clamp(1 - Math.abs(z + 0.15) / 0.1, 0, 1);   // the armpits
      for (let k = 6; k < 9; k++) m[i + k] *= f; }
    return m; };
  return {
    head: part('head', B => { B.tube([0, 0, -0.02], [0, 0, H.neck + 0.03], 0.058, 0.055, 8, skin, false); B.blob([0.01, 0, top], 0.122, 0.108, H.head, 4, 8, skin);   // a short neck, a good-sized head
      for (const y of [-0.106, 0.106]) B.blob([0, y, top - 0.01], 0.022, 0.017, 0.034, 3, 4, skin);   // ears
      if (Hr.style !== 'none') B.blob([-0.022, 0, top + 0.005], 0.12, 0.113, 0.135, 4, 8, hair);   // hair over the crown, back and sides (the face stays clear)
      if (Hr.style === 'long') B.blob([-0.085, 0, top - 0.12], 0.068, 0.113, 0.165, 3, 6, hair);   // down to the shoulders
      if (Hr.style === 'ponytail') B.blob([-0.158, 0, top - 0.08], 0.04, 0.04, 0.12, 3, 5, hair); }),
    torso: part('torso', B => { oval(B, 0.01, -0.04, [0.07, 0.07], [0.145, 0.095], skin); oval(B, -0.04, -0.11, [0.145, 0.095], sh, skin); oval(B, -0.11, -0.24, sh, G.chest, skin); oval(B, -0.24, -H.torso, G.chest, G.waist, skin, true); }),   // shoulders sloping well down from the neck, chest, waist
    hips: part('hips', B => B.blob([0, 0, 0], G.hips[1] - 0.008, G.hips[0] - 0.007, 0.112, 4, 8, skin)),
    upper: part('upper', B => { B.blob([0, 0, -0.02], 0.074, 0.074, 0.092, 4, 8, skin); B.tube([0, 0, -0.04], [0, 0, -H.upper], 0.07, 0.056, 8, skin, true); }),   // a tall soft cap for the shoulder (no flat top), the upper arm below it
    fore: part('fore', B => { B.blob([0, 0, 0], 0.056, 0.056, 0.056, 3, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.056, 0.028, 8, skin, false); B.blob([0, 0, -H.fore - 0.035], 0.019, 0.034, 0.044, 3, 8, skin);
      for (let i = 0; i < 4; i++) {
        const y = (i - 1.5) * 0.016, len = [0.05, 0.056, 0.052, 0.041][i], r = i === 3 ? 0.008 : 0.009;
        const a = [0, y, -H.fore - 0.06], b = [0.008, y, a[2] - len * 0.6], c = [0.02, y, a[2] - len];
        B.tube(a, b, r, r * 0.9, 6, skin, true); B.blob(b, r, r, r, 2, 6, skin); B.tube(b, c, r * 0.9, r * 0.7, 6, skin, true);
      }
      B.tube([0.008, -0.027, -H.fore - 0.015], [0.025, -0.04, -H.fore - 0.045], 0.012, 0.009, 6, skin, true); }),   // elbow, forearm, hand
    // the forearm alone (sleeve and all, no hand, no glove): drawn with the first-person hand on its end, curled for what it holds (third-person.js)
    foreArm: part('fore', B => { B.blob([0, 0, 0], 0.056, 0.056, 0.056, 3, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.056, 0.028, 8, skin, false); }, q => q.color !== 'gloves'),
    thigh: part('thigh', B => { B.blob([0, 0, 0], 0.094, 0.094, 0.094, 4, 8, skin); B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.094, 0.072, 8, skin, true); }),   // a ball at the hip, so the leg stays whole when it swings out
    shin: part('shin', B => { B.blob([0, 0, -0.005], 0.076, 0.074, 0.08, 4, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.shin], 0.072, 0.054, 8, skin, false); }),   // knee, shin
    foot: part('foot', B => { B.blob([0, 0, 0], 0.056, 0.054, 0.05, 3, 6, skin); B.blob([0.055, 0, -H.foot + 0.055], 0.115, 0.058, 0.04, 4, 8, skin); }),   // ankle, foot (the sole is H.foot below the ankle)
  };
}
// A pose: o.mode 'jump' (in the air: o.rise), 'stand' (o.crouch after a landing; moving too: o.swing 0..1 how much, o.gait 0 walk .. 1 jog .. 2 run, o.ph the stride phase, o.stride the metres a whole cycle covers), 'swim' (o.body: body pitch, -pi/2 lying
// face down along the heading; o.ph the stroke: breaststroke, or o.tread treading water) or 'sit' (o.hipZ: seat height over the feet;
// o.paddle; o.helm). o.rod: the right hand holds a rod out in front (o.castW, o.castF: casting; o.hands2: the left hand on it too, o.crank: winding). o.toss 0..1: throwing a net or pot; o.pull: hauling one in (radians). o.reachL / o.reachR: a point [forward, right, up] for that hand to hold. Returns the parts as [part, forward, side, up, pitch, roll, yaw],
// the right hand and the head centre, all relative to the feet (standing, sitting) under the body's own heading. Every part hangs
// down from its joint, is rolled out to the side (roll, + to the right), pitched forward (pitch), then turned (yaw): the order the
// lit shader applies them, so a limb can swing sideways and the shoulders can turn against the hips.
function humanPose(o) {
  const H = HUMAN, ph = o.ph || 0, sw = o.swing || 0, out = [], PI = Math.PI;
  const end = (J, L, pitch, roll = 0, yaw = 0) => { const x = L * Math.cos(roll) * Math.sin(pitch), y = L * Math.sin(roll), z = -L * Math.cos(roll) * Math.cos(pitch), c = Math.cos(yaw), q = Math.sin(yaw); return [J[0] + c * x - q * y, J[1] + q * x + c * y, J[2] + z]; };   // a limb's far end
  let b = 0, hipZ = 0, headP = 0, twist = 0, turn = 0, sway = 0;   // body pitch; head pitch; shoulders' and hips' yaw; a shift over the standing foot
  const thigh = [0, 0], shin = [0, 0], foot = [0, 0], up = [0, 0], fore = [0, 0], thR = [0, 0], shR = [0, 0], upR = [0, 0], foR = [0, 0];
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, p = ph + i * PI, s = Math.sin(p);   // i: 0 left, 1 right, half a stride apart
    if (o.mode === 'swim' && o.tread) { b = o.body ?? -PI / 2; headP = b;   // treading water: a slow flutter kick, the arms out to the sides, sculling
      thigh[i] = b + 0.5 * Math.sin(ph * 2 + i * PI); shin[i] = thigh[i] - 0.25; foot[i] = shin[i] - 0.7; thR[i] = side * 0.15;
      up[i] = b + 1.1 + 0.35 * s; fore[i] = up[i] + 0.25; upR[i] = side * 0.55; foR[i] = side * 0.35; }
    else if (o.mode === 'swim') { b = o.body ?? -PI / 2; headP = b + 0.75;   // breaststroke, head up: both sides together. Angles from the body's line: 0 trails back to the feet, pi reaches past the head
      const u = ph / 6.2832 % 1, st = (a, z) => { const t = clamp((u - a) / (z - a), 0, 1); return t * t * (3 - 2 * t); }, mix = (x, y, t) => x + (y - x) * t;
      const pull = st(0, 0.35), tuck = st(0.35, 0.6), reach = st(0.6, 0.78), frog = tuck * (1 - reach);   // pull the water back; hands in under the chin as the knees draw up; shoot the arms forward as the legs kick; glide
      up[i] = b + mix(mix(PI, 1.1, pull), PI, reach); fore[i] = b + mix(mix(PI, 1.1, pull) - 0.45 * Math.sin(PI * pull) + 1.8 * tuck, PI, reach);
      upR[i] = side * (0.08 + 0.8 * Math.sin(PI * pull) * (1 - tuck)); foR[i] = upR[i] * 0.6;   // the hands sweep out wide and round on the pull
      thigh[i] = b + 0.75 * frog; shin[i] = thigh[i] - 1.7 * frog; thR[i] = side * 0.6 * frog; shR[i] = side * 0.25 * frog; foot[i] = shin[i] - 0.9 * (1 - frog); }   // heels up to the seat, knees apart, then the kick; toes pointed on the glide
    else if (o.mode === 'sit') { b = o.paddle ? -0.12 : 0; hipZ = o.hipZ; headP = b * 0.4;
      thigh[i] = PI / 2 - 0.1; shin[i] = Math.acos(clamp((hipZ - H.foot) / H.shin, 0, 1)); foot[i] = shin[i]; thR[i] = side * 0.14;   // thighs along the seat, knees a little apart, shins down to the floor (straight out in a kayak)
      up[i] = o.paddle ? 0.75 + 0.4 * s : 0.45; fore[i] = up[i] + (o.paddle ? 0.5 : 0.9); upR[i] = side * 0.1; foR[i] = -side * 0.12; }
    else if (o.mode === 'jump') { const r = clamp(o.rise ?? 0, -1, 1), tuck = 1 - Math.abs(r), upw = Math.max(r, 0), dn = Math.max(-r, 0);   // in the air. o.rise: 1 just off the ground .. 0 at the top .. -1 coming down
      b = -0.12 * upw + 0.06 * dn; headP = b * 0.4;   // thrown forward going up, a touch back coming down
      thigh[i] = b + 0.15 + 0.85 * tuck + 0.25 * dn + side * 0.12; shin[i] = thigh[i] - 0.15 - 1.35 * tuck - 0.3 * dn; thR[i] = side * (0.04 + 0.08 * dn);   // legs straight off the ground, knees up at the top (one a little ahead), reaching down to land
      foot[i] = shin[i] - 0.7 * upw - 0.6 * shin[i] * dn;   // toes pointed on the way up, feet levelling for the ground
      up[i] = b + 0.5 + 1.5 * upw + 0.5 * tuck + 0.3 * dn; fore[i] = up[i] + 0.5 + 0.4 * tuck; upR[i] = side * (0.15 + 0.2 * tuck + 0.5 * dn); foR[i] = upR[i] * 0.5; }   // arms thrown up, then out wide for balance
    else { const g = clamp(o.gait || 0, 0, 2), G3 = (w, j, r) => g < 1 ? w + (j - w) * g : j + (r - j) * (g - 1), sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };   // o.gait 0 walk .. 1 jog .. 2 run: G3(walk, jog, run) blends a setting between them
      // The legs are driven by the feet. o.stride is the ground one whole cycle (two steps) covers, and the caller advances o.ph by exactly
      // that, so a foot on the ground goes back under the body just as fast as the body goes forward: it stays where it was put down.
      const L = o.stride ?? sw * G3(1.3, 2.4, 3.1), T = H.thigh, S2 = H.shin, duty = G3(0.58, 0.36, 0.28), S = duty * L, xF = 0.38 * S, big = Math.min(1, S / 0.3);   // duty: the part of the cycle a foot is down; S: how far it travels under you meanwhile; big: 0 for a shuffle .. 1 a real step
      const c = Math.cos(p), u = ((p / 6.2832) % 1 + 1) % 1, u0 = ((ph / 6.2832) % 1 + 1) % 1, high = duty / 2 + 0.25 * sm((0.56 - duty) / 0.12), A = big * G3(0.026, 0.045, 0.07);   // the body rises and falls twice a stride: highest over the standing leg walking, in mid-air running
      const cr = clamp(o.crouch || 0, 0, 1);   // o.crouch: 1 = knees taking a landing, easing back to 0
      hipZ = H.foot + Math.sqrt(Math.max(0.01, ((T + S2) * 0.985) ** 2 - xF * xF)) - A + A * Math.cos(12.5664 * (u0 - high)) - 0.2 * cr;
      b = -sw * G3(0.03, 0.1, 0.2) + big * G3(0.02, 0.03, 0.04) * Math.cos(12.5664 * (u0 - high) + 0.9) - 0.3 * cr; headP = -sw * G3(0.03, 0.1, 0.2) * 0.4;   // upright walking, leaning into a jog, well forward at a run, and the chest nods a little as each foot lands; the head stays level
      const fOn = big * G3(0.3, 0.12, 0), fOff = -big * G3(0.55, 0.75, 0.9); let x, z = H.foot, f;   // the foot's tilt as the heel lands (toes up, walking) and as the toes push off
      if (u < duty) { const t = u / duty, on = Math.max(0, 1 - t / 0.25); f = fOn * on * on + fOff * sm((t - 0.65) / 0.35); x = xF - t * S;   // on the ground: straight back under the hips, rolling from heel to toe
        if (f > 0) { x -= 0.07 * (1 - Math.cos(f)); z += 0.07 * Math.sin(f); } else { x += 0.17 * (1 - Math.cos(f)); z -= 0.17 * Math.sin(f); } }   // (the ankle rides up over the heel, then over the toes, which stay put)
      else { const t = (u - duty) / (1 - duty), e = sm(t), xo = xF - S + 0.17 * (1 - Math.cos(fOff)), zo = -0.17 * Math.sin(fOff), xi = xF - 0.07 * (1 - Math.cos(fOn)), zi = 0.07 * Math.sin(fOn);   // in the air: from where it pushed off to where it lands
        x = xo + (xi - xo) * e; z += zo + (zi - zo) * e + big * Math.sin(PI * t) * (G3(0.06, 0.12, 0.2) + G3(0, 0.1, 0.25) * (1 - t)); f = fOff + (fOn - fOff) * e - 0.25 * big * Math.sin(PI * t); }   // lifted through, the heel kicked up behind at a run
      const dz = hipZ - z, D = Math.min(Math.hypot(x, dz), T + S2 - 0.001), ac = v => Math.acos(clamp(v, -1, 1));   // hip to ankle: the knee (always forward) takes up the slack
      thigh[i] = Math.atan2(x, dz) + ac((T * T + D * D - S2 * S2) / (2 * T * D)); shin[i] = thigh[i] - (PI - ac((T * T + S2 * S2 - D * D) / (2 * T * S2))); foot[i] = f; thR[i] = side * 0.03;
      const ca = Math.cos(p - 0.3); up[i] = b - sw * G3(0.35, 0.5, 0.85) * ca - 0.35 * cr; fore[i] = up[i] + 0.15 + sw * (G3(0.1, 1.2, 1.45) + G3(0.25, 0.2, 0.3) * (0.5 - 0.5 * ca));   // (the arms trail the legs a touch)   // arms against the legs: long and loose walking, elbows bent to a right angle jogging, pumping at a run
      upR[i] = side * (0.08 + 0.02 * sw * g); foR[i] = -side * G3(0.04, 0.14, 0.1);
      if (i) { twist = G3(0.1, 0.14, 0.2) * sw * c; turn = -G3(0.03, 0.04, 0.05) * sw * c; sway = G3(0.02, 0.012, 0.005) * big * Math.sin(6.2832 * (u - duty / 2) + PI / 2); } }   // right leg forward: right shoulder back, right hip forward; a walker's weight shifts over the standing foot
  }
  if (!o.rod && o.mode !== 'swim' && o.toss !== undefined) { const u = clamp(o.toss, 0, 1), sm = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); }, wind = u < 0.4 ? sm(u / 0.4) : 1 - sm((u - 0.4) / 0.2), fling = u > 0.4 ? Math.sin(Math.PI * (u - 0.4) / 0.6) : 0;   // throwing a net or a pot: both arms swung back to the right, then flung out in front
    for (let i = 0; i < 2; i++) { up[i] = b + 0.2 - 0.5 * wind + 1.5 * fling; fore[i] = up[i] + 0.6 - 0.3 * fling; upR[i] = (i ? 1 : -1) * 0.15 + 0.35 * wind; foR[i] = 0; }
    twist += 0.45 * wind - 0.35 * fling; }
  else if (!o.rod && o.mode !== 'swim' && o.pull !== undefined) { if (o.mode === 'stand') b += 0.06;   // hauling: hand over hand, leaning back on it
    for (let i = 0; i < 2; i++) { const q = Math.sin(o.pull + i * PI); up[i] = b + 0.75 + 0.35 * q; fore[i] = up[i] + 0.95 - 0.35 * q; upR[i] = (i ? 1 : -1) * 0.1; foR[i] = (i ? -1 : 1) * 0.12; } }
  if (o.rod && o.mode !== 'swim') { const w = clamp(o.castW || 0, 0, 1), f = clamp(o.castF || 0, 0, 1);   // right forearm out in front, the hand in toward the middle, holding the rod
    up[1] = b + 0.45 + 0.75 * w + 0.45 * f; fore[1] = up[1] + 1.25 + 0.9 * w - 0.75 * f; upR[1] = 0.06 + 0.5 * w + 0.12 * f; foR[1] = -0.16 + 0.35 * w;   // casting (o.castW wound back 0..1, o.castF following through 0..1): the arm lifts back and out to the right, then reaches forward
    twist += 0.32 * w - 0.22 * f; if (o.mode === 'stand') b -= 0.08 * f; }   // the shoulders turn with it, and he leans into the throw
  twist += o.twist || 0; sway += o.lean || 0; b -= o.stoop || 0;   // o.twist: the shoulders turned (+ the left one forward); o.lean: the body shifted toward the right (+), e.g. over a paddle; o.stoop: leaning forward (radians), e.g. to a wheel
  const leg = i => { const side = i ? 1 : -1, hipJ = [-side * H.hip * Math.sin(turn), sway + side * H.hip * Math.cos(turn), 0], knee = end(hipJ, H.thigh, thigh[i], thR[i], turn), ankle = end(knee, H.shin, shin[i], shR[i], turn); return { hipJ, knee, ankle }; };
  if (o.mode === 'jump') hipZ = -Math.min(...[0, 1].flatMap(i => [-0.07, 0.17].map(x => leg(i).ankle[2] + x * Math.sin(foot[i]) - H.foot * Math.cos(foot[i]))));   // in the air the lowest heel or toe is where your feet are
  const hip = [0, sway, hipZ], sh = [-Math.sin(b) * H.torso, sway, hipZ + Math.cos(b) * H.torso], arm2 = end(sh, 0.15, b);   // the shoulders: up the (leaning) spine from the hips; arm2: the shoulder joints' height, well below the top of the sloping shoulders
  // an arm reaching for a point (in the pose's own frame): the shoulder, elbow and hand line up on it, the elbow dropped down and outward
  const ct = Math.cos(twist), st = Math.sin(twist), shoulderJ = i => { const sd = i ? 1 : -1; return [arm2[0] - sd * H.shoulder * st, arm2[1] + sd * H.shoulder * ct, arm2[2]]; };
  const reach = (i, T) => { const J = shoulderJ(i), a = H.upper, bl = H.fore + 0.04, v = [T[0] - J[0], T[1] - J[1], T[2] - J[2]], far = Math.hypot(...v) || 1, n = v.map(x => x / far), dd = clamp(far, Math.abs(a - bl) + 0.02, a + bl - 0.01);   // as far as the arm goes
    const along = (a * a + dd * dd - bl * bl) / (2 * dd), rise = Math.sqrt(Math.max(0, a * a - along * along)), py = (i ? 0.6 : -0.6), pd = py * n[1] - n[2], pole = [-pd * n[0], py - pd * n[1], -1 - pd * n[2]], pl = Math.hypot(...pole) || 1;
    const El = J.map((x, k) => x + n[k] * along + pole[k] / pl * rise), Tc = J.map((x, k) => x + n[k] * dd);
    const aim = (p, q) => { const w = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(...w) || 1; return [Math.atan2((w[0] * ct + w[1] * st) / l, -w[2] / l), Math.asin(clamp((-w[0] * st + w[1] * ct) / l, -1, 1))]; };   // the pitch and roll that point a limb from p to q
    [up[i], upR[i]] = aim(J, El); [fore[i], foR[i]] = aim(El, Tc); };
  if (o.rod && o.hands2 && o.mode !== 'swim') { const hR = end(end(shoulderJ(1), H.upper, up[1], upR[1], twist), H.fore + 0.04, fore[1], foR[1], twist), ck = o.crank;   // both hands on the rod (casting, reeling): the left comes across to it
    reach(0, ck !== undefined ? [hR[0] + 0.03 + 0.035 * Math.cos(ck), hR[1] - 0.1, hR[2] - 0.05 + 0.035 * Math.sin(ck)] : [hR[0] - 0.07, hR[1] - 0.05, hR[2] - 0.1]); }   // on the reel handle, going round (o.crank); or on the butt below the other hand
  if (o.mode !== 'swim') { if (o.reachL) reach(0, o.reachL); if (o.reachR) reach(1, o.reachR); }   // hands put on something: a wheel, a throttle, a tiller
  out.push(['hips', hip[0], hip[1], hip[2], b, sway * 2, turn], ['torso', sh[0], sh[1], sh[2], b, -sway * 1.5, twist],   // the hips tip and the chest leans a little over the standing foot
    ['head', sh[0], sh[1], sh[2], headP, 0, twist * 0.3]);
  let hand = null;
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, L = leg(i), up3 = v => [v[0], v[1], v[2] + hipZ];
    const J = [arm2[0] - side * H.shoulder * Math.sin(twist), arm2[1] + side * H.shoulder * Math.cos(twist), arm2[2]], elbow = end(J, H.upper, up[i], upR[i], twist);
    out.push(['thigh', ...up3(L.hipJ), thigh[i], thR[i], turn], ['shin', ...up3(L.knee), shin[i], shR[i], turn], ['foot', ...up3(L.ankle), foot[i], 0, turn],
      ['upper', ...J, up[i], upR[i], twist], ['fore', ...elbow, fore[i], foR[i], twist]);
    if (i) hand = end(elbow, H.fore + 0.04, fore[i], foR[i], twist); }
  const hc = [sh[0] - Math.sin(b) * (H.neck + H.head), sway, sh[2] + Math.cos(b) * (H.neck + H.head)];
  return { parts: out, hand, head: hc };
}
// one part's vertex (x, y, z in its own frame) in the body's frame: the same roll, pitch and yaw the lit shader applies, then the joint offset
function humanPlace(q, x, y, z) { const cr = Math.cos(q[5] || 0), sr = Math.sin(q[5] || 0), cp = Math.cos(q[4]), sp = Math.sin(q[4]), cy = Math.cos(q[6] || 0), sy = Math.sin(q[6] || 0);
  const y1 = y * cr - z * sr, z1 = y * sr + z * cr, x2 = x * cp - z1 * sp, z2 = x * sp + z1 * cp; return [q[1] + cy * x2 - sy * y1, q[2] + sy * x2 + cy * y1, q[3] + z2]; }
