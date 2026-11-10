'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.42, thigh: 0.43, torso: 0.52, neck: 0.08, head: 0.12, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
// How the angler looks: src/angler/angler.json (README.md, "The angler's look") laid over these defaults: skin, hair, and an
// outfit per island climate. Each outfit names what's worn (below) and its colours, "#rrggbb"; a colour left out gets a plain default.
const ANGLER_LOOK = { skin: '#dba985', hair: { style: 'short', color: '#573826' }, outfits: {} };
const ANGLER_WEAR = {   // hat: cap | beanie | sun_hat | null · top: flannel | jacket | tank · bottom: trousers | shorts · feet: boots | sandals
  temperate: { hat: 'cap', top: 'flannel', bottom: 'trousers', feet: 'boots' }, arctic: { hat: 'beanie', top: 'jacket', bottom: 'trousers', feet: 'boots' }, tropical: { hat: 'sun_hat', top: 'tank', bottom: 'shorts', feet: 'sandals' } };
const HUMAN_BUILD = { shoulder: 0.205, hip: 0.1, chest: [0.2, 0.135], waist: [0.175, 0.125], hips: [0.185, 0.13], limb: 1 };   // [half-width, half-depth] of chest, waist and hips
// the part meshes, in the frame above: x forward, y to the right, z up, joint at the origin; dressed for the island's climate
function humanParts(look, climate = 'temperate') {
  const K = Object.assign({}, ANGLER_LOOK, look), Hr = Object.assign({}, ANGLER_LOOK.hair, K.hair), W = Object.assign({}, ANGLER_WEAR[climate] || ANGLER_WEAR.temperate, (K.outfits || {})[climate]), C = W.colors || {}, G = HUMAN_BUILD, H = HUMAN, l = G.limb;
  H.shoulder = G.shoulder; H.hip = G.hip;   // the pose hangs the arms and legs at these widths
  const rgb = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : null;
  const skin = rgb(K.skin) || [0.86, 0.66, 0.52], hair = rgb(Hr.color) || [0.34, 0.22, 0.15], hatC = rgb(C.hat) || [0.5, 0.58, 0.4], topC = rgb(C.top) || [0.5, 0.58, 0.4], acc = rgb(C.accent) || topC.map(v => v * 0.6), vest = rgb(C.vest);
  const trim = rgb(C.trim) || [0.8, 0.58, 0.2], pants = rgb(C.bottom) || [0.2, 0.2, 0.19], patch = rgb(C.patches) || pants, feetC = rgb(C.feet) || [0.24, 0.28, 0.2], band = rgb(C.band) || feetC, glove = rgb(C.gloves) || trim;
  const flannel = W.top === 'flannel', jacket = W.top === 'jacket', tank = W.top === 'tank', shorts = W.bottom === 'shorts', sandals = W.feet === 'sandals';
  const part = (mat, f) => { const B = meshBuilder(); B.mat = mat; f(B); return new Float32Array(B.v); }, top = H.neck + H.head;
  // an oval ring from height z0 (half-width a0 across the shoulders, half-depth c0 front to back) down to z1 (a1, c1): chests and coats aren't round
  const oval = (B, z0, z1, [a0, c0], [a1, c1], col, cap) => B.tube([0, 0, z0], [0, 0, z1], 1, 1, 10, col, cap, (k, e) => 1 / Math.hypot(Math.cos(k / 10 * 6.2832) / (e ? a1 : a0), Math.sin(k / 10 * 6.2832) / (e ? c1 : c0)));
  const sh = [G.shoulder + 0.01, 0.105], grow = ([a, c], g) => [a + g, c + g], g = 0.024, puff = jacket ? 0.035 : tank ? 0.006 : 0;   // g: how far the vest stands off the shirt; puff: how far the top stands off the body
  const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], sec = z => z > -0.24 ? mix(sh, G.chest, clamp((z + 0.06) / -0.18, 0, 1)) : mix(G.chest, G.waist, clamp((z + 0.24) / (0.24 - H.torso), 0, 1));   // the body's cross-section z below the shoulders
  return {
    head: part(MT.GEN, B => { B.tube([0, 0, -0.02], [0, 0, H.neck + 0.03], 0.055, 0.05, 6, skin, false); B.blob([0.01, 0, top], 0.108, 0.094, H.head, 4, 6, skin);
      for (const y of [-0.093, 0.093]) B.blob([0, y, top - 0.01], 0.02, 0.016, 0.03, 3, 4, skin);   // ears
      if (Hr.style !== 'none') B.blob([-0.02, 0, top + 0.005], 0.106, 0.099, 0.12, 4, 6, hair);   // hair over the crown, back and sides (the face stays clear)
      if (Hr.style === 'long') B.blob([-0.075, 0, top - 0.11], 0.06, 0.1, 0.15, 3, 6, hair);   // down to the shoulders
      if (Hr.style === 'ponytail') B.blob([-0.14, 0, top - 0.07], 0.035, 0.035, 0.11, 3, 5, hair);
      B.mat = MT.CLOTH;
      if (W.hat === 'cap') { B.blob([0, 0, top + 0.045], 0.12, 0.106, 0.088, 4, 8, hatC); B.blob([0.125, 0, top + 0.04], 0.095, 0.085, 0.013, 3, 6, hatC);   // ball cap and its peak
        B.blob([0, 0, top + 0.133], 0.018, 0.018, 0.01, 3, 5, trim); B.blob([-0.117, 0, top + 0.005], 0.012, 0.04, 0.013, 3, 5, trim); }   // the button on top, the strap at the back
      else if (W.hat === 'beanie') { B.blob([-0.005, 0, top + 0.04], 0.122, 0.112, 0.105, 4, 8, hatC); B.tube([-0.005, 0, top + 0.035], [-0.005, 0, top - 0.02], 0.124, 0.12, 8, trim, false);   // beanie pulled over the ears, its turned-up cuff
        B.blob([-0.005, 0, top + 0.16], 0.032, 0.032, 0.03, 3, 5, acc); }   // bobble
      else if (W.hat === 'sun_hat') { B.blob([0, 0, top + 0.05], 0.114, 0.104, 0.085, 4, 8, hatC); B.blob([0, 0, top + 0.022], 0.25, 0.25, 0.012, 3, 10, hatC);   // sun hat: crown and a wide brim
        B.tube([0, 0, top + 0.06], [0, 0, top + 0.03], 0.113, 0.117, 8, trim, false); } }),   // its band
    torso: part(MT.CLOTH, B => { const n = jacket ? 6 : 7, z0 = -0.06, z1 = jacket ? -H.torso - 0.09 : -H.torso;   // a jacket comes down over the hips
      if (tank) { B.mat = MT.GEN; oval(B, 0.01, z0, [0.075, 0.07], sh, skin); B.mat = MT.CLOTH; for (const y of [-0.105, 0.105]) B.blob([0, y, -0.035], 0.1, 0.03, 0.034, 3, 6, topC); }   // bare shoulders, the tank top's straps
      else oval(B, 0.01, z0, [0.075, 0.07], grow(sh, puff), topC);
      for (let k = 0; k < n; k++) { const a = z0 + (z1 - z0) * k / n, b = z0 + (z1 - z0) * (k + 1) / n, col = flannel && k % 2 ? acc : topC, m = (a + b) / 2;   // flannel: banded in its two colours
        if (jacket) { oval(B, a, m, grow(sec(a), puff - 0.012), grow(sec(m), puff + 0.006), col); oval(B, m, b, grow(sec(m), puff + 0.006), grow(sec(b), puff - 0.012), col, k === n - 1); }   // quilted: every band bulges
        else oval(B, a, b, grow(sec(a), puff), grow(sec(b), puff), col, k === n - 1); }
      if (jacket) { oval(B, 0.06, 0, [0.085, 0.09], [0.125, 0.125], acc); B.blob([-0.13, 0, -0.06], 0.085, 0.14, 0.12, 3, 6, topC); }   // fur round the collar, the hood down the back
      else if (!tank) oval(B, 0.04, -0.012, [0.07, 0.075], [0.1, 0.1], topC);   // collar
      if (vest && flannel) { const mid = mix(G.chest, G.waist, 0.5), dark = vest.map(v => v * 0.82);
        oval(B, -0.012, -0.068, [0.1, 0.088], grow(sh, g), trim); oval(B, -0.068, -0.19, grow(sh, g), grow(G.chest, g), trim);   // the vest stands off the shirt: trim across the shoulders…
        oval(B, -0.19, -0.46, grow(G.chest, g), grow(mid, g), vest); oval(B, -0.46, -0.478, grow(mid, g), mid, vest);   // …the body, and the hem turned in
        for (const y of [-0.095, 0.095]) { B.blob([G.chest[1] + g - 0.004, y, -0.35], 0.022, 0.058, 0.055, 3, 5, dark); B.blob([G.chest[1] + g + 0.012, y, -0.305], 0.01, 0.06, 0.014, 3, 5, trim);   // chest pockets and their flaps
          B.blob([-G.chest[1] - g + 0.002, y, -0.22], 0.012, 0.017, 0.03, 3, 4, trim); } } }),   // two tabs on the back
    hips: part(MT.CLOTH, B => B.blob([0, 0, 0], G.hips[1], G.hips[0], 0.12, 3, 8, pants)),
    upper: part(tank ? MT.GEN : MT.CLOTH, B => { const r = (jacket ? 0.088 : 0.068) * l, c = tank ? skin : topC; B.blob([0, 0, 0], r + 0.004, r + 0.004, r + 0.004, 3, 6, c);   // a round shoulder, then the sleeve (or a bare arm)
      if (flannel) { B.tube([0, 0, 0], [0, 0, -H.upper / 2], r, r * 0.91, 6, topC, false); B.tube([0, 0, -H.upper / 2], [0, 0, -H.upper], r * 0.91, r * 0.82, 6, acc, true); }
      else B.tube([0, 0, 0], [0, 0, -H.upper], r, r * 0.82, 6, c, true); }),
    fore: part(tank ? MT.GEN : MT.CLOTH, B => { const r = (jacket ? 0.074 : 0.056) * l, big = jacket ? 1.25 : 1;
      if (tank) B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.05 * l, 0.04 * l, 6, skin, false);
      else { B.tube([0, 0, 0.02], [0, 0, -H.fore + 0.03], r, r * 0.84, 6, topC, false); B.tube([0, 0, -H.fore + 0.075], [0, 0, -H.fore + 0.02], r * 0.84 + 0.011, r * 0.84 + 0.011, 6, flannel ? acc : trim, true); }   // sleeve, cuff
      B.mat = jacket ? MT.CLOTH : MT.GEN; B.blob([0, 0, -H.fore - 0.04], 0.04 * l * big, 0.034 * l * big, 0.055 * big, 3, 5, jacket ? glove : skin); }),   // a hand, gloved with the jacket
    thigh: part(MT.CLOTH, B => { if (!shorts) return B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.092 * l, 0.07 * l, 6, pants, true);
      B.tube([0, 0, 0.03], [0, 0, -0.25], 0.1 * l, 0.095 * l, 6, pants, false); B.mat = MT.GEN; B.tube([0, 0, -0.1], [0, 0, -H.thigh], 0.086 * l, 0.068 * l, 6, skin, true); }),   // shorts to above the knee
    shin: part(shorts ? MT.GEN : MT.CLOTH, B => {
      if (shorts) { B.blob([0, 0, -0.005], 0.07 * l, 0.068 * l, 0.075, 3, 6, skin); B.tube([0, 0, 0.02], [0, 0, -H.shin], 0.066 * l, 0.048 * l, 6, skin, false); }   // knee and bare shin
      else { B.tube([0, 0, 0.02], [0, 0, sandals ? -H.shin : -0.2], 0.07 * l, sandals ? 0.055 * l : 0.062 * l, 6, pants, false); B.blob([0, 0, -0.01], 0.077 * l, 0.075 * l, 0.085, 3, 6, patch); }   // trouser leg, knee patch
      B.mat = MT.GEN; const fz = -H.shin - H.foot;
      if (sandals) { B.blob([0.055, 0, fz + 0.055], 0.115, 0.055, 0.04, 3, 6, skin); B.blob([0.055, 0, fz + 0.012], 0.135, 0.066, 0.012, 3, 6, feetC); B.blob([0.08, 0, fz + 0.07], 0.02, 0.06, 0.03, 3, 5, feetC); }   // foot, sole, strap
      else { B.tube([0, 0, -0.15], [0, 0, -H.shin], 0.075 * l, 0.066 * l, 6, feetC, false); B.blob([0.055, 0, fz + 0.05], 0.13, 0.064, 0.05, 3, 6, feetC);   // wellingtons
        B.tube([0, 0, -0.14], [0, 0, -0.215], 0.081 * l, 0.08 * l, 6, band, false); B.tube([0, 0, -0.168], [0, 0, -0.19], 0.085 * l, 0.085 * l, 6, trim, false); } }),   // the boot top and its stripe
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
  const hip = [0, hipZ], sh = [hip[0] - d(b, H.torso)[0], hip[1] - d(b, H.torso)[1]], add = (a, q) => [a[0] + q[0], a[1] + q[1]], arm = add(sh, d(b, 0.07));   // arm: the shoulder joint, a little below the top of the shoulders
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
