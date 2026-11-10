'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.39, thigh: 0.4, torso: 0.52, neck: 0.08, head: 0.12, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
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
  const oval = (B, z0, z1, [a0, c0], [a1, c1], col, cap) => B.tube([0, 0, z0], [0, 0, z1], 1, 1, 10, col, cap, (k, e) => 1 / Math.hypot(Math.cos(k / 10 * 6.2832) / (e ? a1 : a0), Math.sin(k / 10 * 6.2832) / (e ? c1 : c0)));
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
    upper: part('upper', B => { B.blob([0, 0, -0.02], 0.074, 0.074, 0.092, 4, 8, skin); B.tube([0, 0, -0.04], [0, 0, -H.upper], 0.07, 0.056, 8, skin, true); }),   // a tall soft cap for the shoulder (no flat top), the upper arm below it
    fore: part('fore', B => { B.blob([0, 0, 0], 0.056, 0.056, 0.056, 3, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.056, 0.044, 8, skin, false); B.blob([0, 0, -H.fore - 0.04], 0.044, 0.038, 0.06, 4, 6, skin); }),   // elbow, forearm, hand
    thigh: part('thigh', B => B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.094, 0.072, 8, skin, true)),
    shin: part('shin', B => { B.blob([0, 0, -0.005], 0.076, 0.074, 0.08, 4, 8, skin); B.tube([0, 0, 0.02], [0, 0, -H.shin], 0.072, 0.054, 8, skin, false); }),   // knee, shin
    foot: part('foot', B => { B.blob([0, 0, 0], 0.056, 0.054, 0.05, 3, 6, skin); B.blob([0.055, 0, -H.foot + 0.055], 0.115, 0.058, 0.04, 4, 8, skin); }),   // ankle, foot (the sole is H.foot below the ankle)
  };
}
// A pose: o.mode 'stand' (walking and running too: o.swing 0..1 and o.ph, the stride phase), 'swim' (o.body: body pitch, -pi/2 lying
// face down along the heading; o.ph the stroke: breaststroke, or o.tread treading water) or 'sit' (o.hipZ: seat height over the feet;
// o.paddle; o.helm). o.rod: the right hand holds a rod out in front. Returns the parts as [part, forward, side, up, pitch, roll, yaw],
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
    else { b = -(0.05 * sw + 0.09 * sw * sw); headP = b * 0.4;   // leaning into it, more at a run; the head stays more level than the chest
      const bump = (at, k) => ((1 + Math.cos(p - at)) / 2) ** k;   // a smooth rise and fall centred on a point of the stride
      thigh[i] = b + sw * (0.5 * s + 0.1); thR[i] = side * 0.03;   // the thigh swings a little further forward than back
      shin[i] = thigh[i] - sw * (1.25 * bump(-0.55, 2) + 0.22 * bump(2.3, 4));   // the knee folds as the leg comes through, and gives a little as the foot takes the weight
      foot[i] = 0.6 * (shin[i] - b) * bump(-0.55, 1) - 0.5 * sw * bump(-PI / 2 - 0.25, 4) + 0.3 * sw * bump(PI / 2 - 0.15, 6);   // the ankle: toes hang through the swing, push off at the back, come up for the heel to land
      up[i] = b - 0.55 * sw * s; fore[i] = up[i] + 0.15 + sw * (0.55 + 0.3 * (0.5 - 0.5 * s)); upR[i] = side * (0.08 + 0.04 * sw); foR[i] = -side * 0.04;   // arms swing against the legs, a little out from the body, the elbow closing on the way forward
      if (i) { twist = 0.14 * sw * s; turn = -0.07 * sw * s; sway = -0.02 * sw * (1 - 0.4 * sw) * Math.cos(p); } }   // right leg forward: right shoulder back, right hip forward; the weight shifts over the foot on the ground
  }
  if (o.rod && o.mode !== 'swim') { up[1] = b + 0.45; fore[1] = up[1] + 1.25; upR[1] = 0.06; foR[1] = -0.16; }   // right forearm out in front, the hand in toward the middle, holding the rod
  const leg = i => { const side = i ? 1 : -1, hipJ = [-side * H.hip * Math.sin(turn), sway + side * H.hip * Math.cos(turn), 0], knee = end(hipJ, H.thigh, thigh[i], thR[i], turn), ankle = end(knee, H.shin, shin[i], shR[i], turn); return { hipJ, knee, ankle }; };
  if (o.mode === 'stand') hipZ = -Math.min(...[0, 1].flatMap(i => [-0.07, 0.17].map(x => leg(i).ankle[2] + x * Math.sin(foot[i]) - H.foot * Math.cos(foot[i]))));   // the lowest heel or toe on the ground
  const hip = [0, sway, hipZ], sh = [-Math.sin(b) * H.torso, sway, hipZ + Math.cos(b) * H.torso], arm2 = end(sh, 0.15, b);   // the shoulders: up the (leaning) spine from the hips; arm2: the shoulder joints' height, well below the top of the sloping shoulders
  out.push(['hips', hip[0], hip[1], hip[2], b, 0, turn], ['torso', sh[0], sh[1], sh[2], b, 0, twist], ['head', sh[0], sh[1], sh[2], headP, 0, twist * 0.3]);
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
