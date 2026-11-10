'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.42, thigh: 0.43, torso: 0.52, neck: 0.08, head: 0.12, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
// How the angler looks is data (README.md, "The angler's look"): src/angler/angler.json gives skin, hair and, for each island
// climate, what's worn and its colours; src/angler/clothes.json gives every garment's shapes. This file only knows the bare body.
const ANGLER_LOOK = { skin: '#dba985', hair: { style: 'short', color: '#573826' }, outfits: {} };
const HUMAN_BUILD = { shoulder: 0.195, hip: 0.1, chest: [0.2, 0.135], waist: [0.175, 0.125], hips: [0.185, 0.13] };   // [half-width, half-depth] of chest, waist and hips
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
  const skin = rgb(K.skin) || [0.86, 0.66, 0.52], hair = rgb(Hr.color) || [0.34, 0.22, 0.15], top = H.neck + H.head, fz = -H.shin - H.foot;
  const worn = (Array.isArray(W.wear) ? W.wear : []).map(id => clothes.find(g => g && g.id === id)).filter(Boolean);
  // an oval ring from height z0 (half-width a0 across the shoulders, half-depth c0 front to back) down to z1 (a1, c1): chests and coats aren't round
  const oval = (B, z0, z1, [a0, c0], [a1, c1], col, cap) => B.tube([0, 0, z0], [0, 0, z1], 1, 1, 10, col, cap, (k, e) => 1 / Math.hypot(Math.cos(k / 10 * 6.2832) / (e ? a1 : a0), Math.sin(k / 10 * 6.2832) / (e ? c1 : c0)));
  const sh = [G.shoulder + 0.01, 0.105], grow = ([a, c], g) => [a + g, c + g], mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
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
  // meshBuilder(true): smooth-shaded blobs, so the figure is soft, not faceted
  const part = (name, body) => { const B = meshBuilder(true); B.mat = MT.GEN; body(B); for (const g of worn) for (const q of (g.parts && g.parts[name]) || []) if (q) shape(B, q); return new Float32Array(B.v); };
  return {
    head: part('head', B => { B.tube([0, 0, -0.02], [0, 0, H.neck + 0.03], 0.055, 0.05, 6, skin, false); B.blob([0.01, 0, top], 0.108, 0.094, H.head, 4, 6, skin);
      for (const y of [-0.093, 0.093]) B.blob([0, y, top - 0.01], 0.02, 0.016, 0.03, 3, 4, skin);   // ears
      if (Hr.style !== 'none') B.blob([-0.02, 0, top + 0.005], 0.106, 0.099, 0.12, 4, 6, hair);   // hair over the crown, back and sides (the face stays clear)
      if (Hr.style === 'long') B.blob([-0.075, 0, top - 0.11], 0.06, 0.1, 0.15, 3, 6, hair);   // down to the shoulders
      if (Hr.style === 'ponytail') B.blob([-0.14, 0, top - 0.07], 0.035, 0.035, 0.11, 3, 5, hair); }),
    torso: part('torso', B => { oval(B, 0.01, -0.04, [0.07, 0.07], [0.145, 0.095], skin); oval(B, -0.04, -0.11, [0.145, 0.095], sh, skin); oval(B, -0.11, -0.24, sh, G.chest, skin); oval(B, -0.24, -H.torso, G.chest, G.waist, skin, true); }),   // shoulders sloping well down from the neck, chest, waist
    hips: part('hips', B => B.blob([0, 0, 0], G.hips[1], G.hips[0], 0.12, 4, 8, skin)),
    upper: part('upper', B => { B.blob([0, 0, 0], 0.074, 0.074, 0.074, 4, 8, skin); B.tube([0, 0, 0], [0, 0, -H.upper], 0.07, 0.056, 8, skin, true); }),   // a round shoulder, the upper arm
    fore: part('fore', B => { B.blob([0, 0, 0], 0.056, 0.056, 0.056, 3, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.056, 0.044, 8, skin, false); B.blob([0, 0, -H.fore - 0.04], 0.044, 0.038, 0.06, 4, 6, skin); }),   // elbow, forearm, hand
    thigh: part('thigh', B => B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.094, 0.072, 8, skin, true)),
    shin: part('shin', B => { B.blob([0, 0, -0.005], 0.076, 0.074, 0.08, 4, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.shin], 0.072, 0.054, 8, skin, false); B.blob([0.055, 0, fz + 0.055], 0.115, 0.058, 0.04, 4, 8, skin); }),   // knee, shin, foot
  };
}
// A pose: o.mode 'stand' (walking and running too: o.swing 0..1 and o.ph, the stride phase), 'swim' (o.body: body pitch, -pi/2 lying
// face down along the heading; o.ph the stroke: breaststroke, or o.tread treading water) or 'sit' (o.hipZ: seat height over the feet; o.paddle; o.helm). o.rod: the right
// hand holds a rod out in front. Returns [part, forward, side, up, pitch] per part, the right hand and the head centre, all
// relative to the feet (standing, sitting) under the body's own heading.
function humanPose(o) {
  const H = HUMAN, d = (p, L) => [Math.sin(p) * L, -Math.cos(p) * L], ph = o.ph || 0, sw = o.swing || 0, out = [];
  let b = 0, hipZ = 0, armOut = 0, legOut = 0, headUp = 0; const thigh = [0, 0], shin = [0, 0], up = [0, 0], fore = [0, 0];
  for (let i = 0; i < 2; i++) { const s = Math.sin(ph + i * Math.PI), c = Math.cos(ph + i * Math.PI);   // i: 0 left, 1 right, half a stride apart
    if (o.mode === 'swim' && o.tread) { b = o.body ?? -Math.PI / 2;   // treading water: a slow flutter kick, the arms sculling
      thigh[i] = b + 0.5 * Math.sin(ph * 2 + i * Math.PI); shin[i] = thigh[i] - 0.25; up[i] = b + 1.1 + 0.35 * s; fore[i] = up[i] + 0.25; }
    else if (o.mode === 'swim') { b = o.body ?? -Math.PI / 2;   // breaststroke: both sides together. Angles from the body's line: 0 trails back to the feet, pi reaches past the head
      const u = ph / 6.2832 % 1, st = (a, z) => { const t = clamp((u - a) / (z - a), 0, 1); return t * t * (3 - 2 * t); }, mix = (x, y, t) => x + (y - x) * t;
      const pull = st(0, 0.35), tuck = st(0.35, 0.6), reach = st(0.6, 0.78);   // pull the water back; hands in under the chin as the knees draw up; shoot the arms forward as the legs kick; glide
      up[i] = b + mix(mix(Math.PI, 1.1, pull), Math.PI, reach); fore[i] = b + mix(mix(Math.PI, 1.1, pull) - 0.45 * Math.sin(Math.PI * pull) + 1.8 * tuck, Math.PI, reach);
      thigh[i] = b + 0.75 * tuck * (1 - reach); shin[i] = thigh[i] - 1.7 * tuck * (1 - reach);   // heels up to the seat, then the kick straightens them
      armOut = 0.07 * Math.sin(Math.PI * pull); legOut = 0.09 * tuck * (1 - reach); headUp = 0.75; }   // hands sweep wide on the pull, knees apart for the frog kick, head up out of the water
    else if (o.mode === 'sit') { b = o.paddle ? -0.12 : 0; hipZ = o.hipZ;
      thigh[i] = Math.PI / 2 - 0.1; shin[i] = Math.acos(clamp((hipZ - H.foot) / H.shin, 0, 1));   // thighs along the seat, shins down to the floor (straight out in a kayak)
      up[i] = o.paddle ? 0.75 + 0.4 * s : 0.45; fore[i] = up[i] + (o.paddle ? 0.5 : 0.9); }
    else { b = -0.12 * sw * sw;   // leaning into a run
      thigh[i] = b + 0.55 * sw * s; shin[i] = thigh[i] - sw * 1.1 * Math.max(0, c);   // the knee folds as the leg comes through
      up[i] = b - 0.6 * sw * s; fore[i] = up[i] + 0.15 + 0.6 * sw; }
  }
  if (o.mode === 'stand') hipZ = Math.max(...[0, 1].flatMap(i => [-0.07, 0.17].map(x => -d(thigh[i], H.thigh)[1] - x * Math.sin(shin[i]) + (H.shin + H.foot) * Math.cos(shin[i]))));   // the lower boot (heel or toe) on the ground
  if (o.rod && o.mode !== 'swim') { up[1] = b + 0.3; fore[1] = up[1] + 1.05; }   // right forearm out in front, holding the rod
  const hip = [0, hipZ], sh = [hip[0] - d(b, H.torso)[0], hip[1] - d(b, H.torso)[1]], add = (a, q) => [a[0] + q[0], a[1] + q[1]], arm = add(sh, d(b, 0.12));   // arm: the shoulder joint, well below the top of the sloping shoulders
  out.push(['hips', hip[0], 0, hip[1], b], ['torso', sh[0], 0, sh[1], b], ['head', sh[0], 0, sh[1], b + headUp]);
  let hand = null;
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, knee = add(hip, d(thigh[i], H.thigh)), elbow = add(arm, d(up[i], H.upper));
    out.push(['thigh', hip[0], side * H.hip, hip[1], thigh[i]], ['shin', knee[0], side * (H.hip + legOut), knee[1], shin[i]], ['upper', arm[0], side * H.shoulder, arm[1], up[i]], ['fore', elbow[0], side * (H.shoulder + armOut), elbow[1], fore[i]]);
    if (i) { const h = add(elbow, d(fore[i], H.fore + 0.04)); hand = [h[0], side * H.shoulder, h[1]]; } }
  const hc = add(sh, [-Math.sin(b) * (H.neck + H.head), Math.cos(b) * (H.neck + H.head)]);
  return { parts: out, hand, head: [hc[0], 0, hc[1]] };
}
// one part's vertex (x, y, z in its own frame) in the body's frame: the same pitch the lit shader applies, then the joint offset
function humanPlace(q, x, y, z) { const cp = Math.cos(q[4]), sp = Math.sin(q[4]); return [q[1] + x * cp - z * sp, q[2] + y, q[3] + x * sp + z * cp]; }
