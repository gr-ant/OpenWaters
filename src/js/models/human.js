'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.42, thigh: 0.43, torso: 0.52, neck: 0.08, head: 0.12, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
// How the angler looks: src/angler/angler.json (README.md, "The angler's look") laid over these defaults. Colours are "#rrggbb";
// a null cap or vest leaves it off. build picks the proportions below: [half-width, half-depth] of chest, waist and hips.
const ANGLER_LOOK = { build: 'male', skin: '#dba985', hair: { style: 'short', color: '#573826' },
  outfit: { cap: '#80946a', shirt: '#80946a', vest: '#4a5c33', trim: '#cc9433', trousers: '#333330', patches: '#242421', boots: '#3d4733', boot_band: '#80946a' } };
const HUMAN_BUILD = { male: { shoulder: 0.205, hip: 0.1, chest: [0.2, 0.135], waist: [0.175, 0.125], hips: [0.185, 0.13], limb: 1 },
  female: { shoulder: 0.18, hip: 0.105, chest: [0.175, 0.13], waist: [0.145, 0.11], hips: [0.195, 0.135], limb: 0.88 } };
// the part meshes, in the frame above: x forward, y to the right, z up, joint at the origin
function humanParts(look) {
  const K = Object.assign({}, ANGLER_LOOK, look), O = Object.assign({}, ANGLER_LOOK.outfit, K.outfit), Hr = Object.assign({}, ANGLER_LOOK.hair, K.hair), G = HUMAN_BUILD[K.build] || HUMAN_BUILD.male, H = HUMAN, l = G.limb;
  H.shoulder = G.shoulder; H.hip = G.hip;   // the pose hangs the arms and legs at this build's widths
  const rgb = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : null;
  const skin = rgb(K.skin) || [0.86, 0.66, 0.52], hair = rgb(Hr.color) || [0.34, 0.22, 0.15], shirt = rgb(O.shirt) || [0.5, 0.58, 0.4], trim = rgb(O.trim) || [0.8, 0.58, 0.2], cap = rgb(O.cap), vest = rgb(O.vest);
  const pants = rgb(O.trousers) || [0.2, 0.2, 0.19], patch = rgb(O.patches) || pants, boot = rgb(O.boots) || [0.24, 0.28, 0.2], band = rgb(O.boot_band) || boot;
  const part = (mat, f) => { const B = meshBuilder(); B.mat = mat; f(B); return new Float32Array(B.v); }, top = H.neck + H.head;
  // an oval ring from height z0 (half-width a0 across the shoulders, half-depth c0 front to back) down to z1 (a1, c1): chests and coats aren't round
  const oval = (B, z0, z1, [a0, c0], [a1, c1], col, cap) => B.tube([0, 0, z0], [0, 0, z1], 1, 1, 10, col, cap, (k, e) => 1 / Math.hypot(Math.cos(k / 10 * 6.2832) / (e ? a1 : a0), Math.sin(k / 10 * 6.2832) / (e ? c1 : c0)));
  const sh = [G.shoulder + 0.01, 0.105], grow = ([a, c], g) => [a + g, c + g], g = 0.024;   // g: how far the vest stands off the shirt
  return {
    head: part(MT.GEN, B => { B.tube([0, 0, -0.02], [0, 0, H.neck + 0.03], 0.055, 0.05, 6, skin, false); B.blob([0.01, 0, top], 0.108, 0.094, H.head, 4, 6, skin);
      for (const y of [-0.093, 0.093]) B.blob([0, y, top - 0.01], 0.02, 0.016, 0.03, 3, 4, skin);   // ears
      if (Hr.style !== 'none') B.blob([-0.02, 0, top + 0.005], 0.106, 0.099, 0.12, 4, 6, hair);   // hair over the crown, back and sides (the face stays clear)
      if (Hr.style === 'long') B.blob([-0.075, 0, top - 0.11], 0.06, 0.1, 0.15, 3, 6, hair);   // down to the shoulders
      if (Hr.style === 'ponytail') B.blob([-0.14, 0, top - 0.07], 0.035, 0.035, 0.11, 3, 5, hair);
      if (cap) { B.mat = MT.CLOTH; B.blob([0, 0, top + 0.045], 0.12, 0.106, 0.088, 4, 8, cap); B.blob([0.125, 0, top + 0.04], 0.095, 0.085, 0.013, 3, 6, cap);   // cap and its peak
        B.blob([0, 0, top + 0.133], 0.018, 0.018, 0.01, 3, 5, trim); B.blob([-0.117, 0, top + 0.005], 0.012, 0.04, 0.013, 3, 5, trim); } }),   // the button on top, the strap at the back
    torso: part(MT.CLOTH, B => { oval(B, 0.01, -0.06, [0.075, 0.07], sh, shirt); oval(B, -0.06, -0.24, sh, G.chest, shirt); oval(B, -0.24, -H.torso, G.chest, G.waist, shirt, true);   // the shirt: sloping shoulders, chest, waist
      oval(B, 0.04, -0.012, [0.07, 0.075], [0.1, 0.1], shirt); B.blob([-0.115, 0, -0.065], 0.075, 0.125, 0.11, 3, 6, shirt);   // collar, and the hood lying down the back
      if (vest) { const mid = [(G.chest[0] + G.waist[0]) / 2, (G.chest[1] + G.waist[1]) / 2], dark = vest.map(v => v * 0.82);
        oval(B, -0.012, -0.068, [0.1, 0.088], grow(sh, g), trim); oval(B, -0.068, -0.19, grow(sh, g), grow(G.chest, g), trim);   // the vest stands off the shirt: trim across the shoulders…
        oval(B, -0.19, -0.46, grow(G.chest, g), grow(mid, g), vest); oval(B, -0.46, -0.478, grow(mid, g), mid, vest);   // …the body, and the hem turned in
        for (const y of [-0.095, 0.095]) { B.blob([G.chest[1] + g - 0.004, y, -0.35], 0.022, 0.058, 0.055, 3, 5, dark); B.blob([G.chest[1] + g + 0.012, y, -0.305], 0.01, 0.06, 0.014, 3, 5, trim);   // chest pockets and their flaps
          B.blob([-G.chest[1] - g + 0.002, y, -0.22], 0.012, 0.017, 0.03, 3, 4, trim); } } }),   // two tabs on the back
    hips: part(MT.CLOTH, B => B.blob([0, 0, 0], G.hips[1], G.hips[0], 0.12, 3, 8, pants)),
    upper: part(MT.CLOTH, B => { B.blob([0, 0, 0], 0.072 * l, 0.072 * l, 0.072 * l, 3, 6, shirt); B.tube([0, 0, 0], [0, 0, -H.upper], 0.068 * l, 0.056 * l, 6, shirt, true); }),   // a round shoulder, then the sleeve
    fore: part(MT.CLOTH, B => { B.tube([0, 0, 0.02], [0, 0, -H.fore + 0.03], 0.056 * l, 0.047 * l, 6, shirt, false); B.tube([0, 0, -H.fore + 0.075], [0, 0, -H.fore + 0.02], 0.058 * l, 0.058 * l, 6, trim, true);   // sleeve, rolled cuff
      B.mat = MT.GEN; B.blob([0, 0, -H.fore - 0.04], 0.04 * l, 0.034 * l, 0.055, 3, 5, skin); }),
    thigh: part(MT.CLOTH, B => B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.092 * l, 0.07 * l, 6, pants, true)),
    shin: part(MT.CLOTH, B => { B.tube([0, 0, 0.02], [0, 0, -0.2], 0.07 * l, 0.062 * l, 6, pants, false); B.blob([0, 0, -0.01], 0.077 * l, 0.075 * l, 0.085, 3, 6, patch);   // trouser leg, knee patch
      B.mat = MT.GEN; B.tube([0, 0, -0.15], [0, 0, -H.shin], 0.075 * l, 0.066 * l, 6, boot, false); B.blob([0.055, 0, -H.shin - H.foot + 0.05], 0.13, 0.064, 0.05, 3, 6, boot);   // wellingtons
      B.tube([0, 0, -0.14], [0, 0, -0.215], 0.081 * l, 0.08 * l, 6, band, false); B.tube([0, 0, -0.168], [0, 0, -0.19], 0.085 * l, 0.085 * l, 6, trim, false); }),   // the boot top and its stripe
  };
}
// A pose: o.mode 'stand' (walking and running too: o.swing 0..1 and o.ph, the stride phase), 'swim' (o.body: body pitch, -pi/2 lying
// face down along the heading; o.ph the stroke) or 'sit' (o.hipZ: seat height over the feet; o.paddle; o.helm). o.rod: the right
// hand holds a rod out in front. Returns [part, forward, side, up, pitch] per part, the right hand and the head centre, all
// relative to the feet (standing, sitting) under the body's own heading.
function humanPose(o) {
  const H = HUMAN, d = (p, L) => [Math.sin(p) * L, -Math.cos(p) * L], ph = o.ph || 0, sw = o.swing || 0, out = [];
  let b = 0, hipZ = 0; const thigh = [0, 0], shin = [0, 0], up = [0, 0], fore = [0, 0];
  for (let i = 0; i < 2; i++) { const s = Math.sin(ph + i * Math.PI), c = Math.cos(ph + i * Math.PI);   // i: 0 left, 1 right, half a stride apart
    if (o.mode === 'swim') { b = o.body ?? -Math.PI / 2; const k = o.tread ? 0.5 : 0.25;
      thigh[i] = b + k * Math.sin(ph * 2 + i * Math.PI); shin[i] = thigh[i] - 0.25;   // a flutter kick
      up[i] = o.tread ? b + 1.1 + 0.35 * s : b + ph + i * Math.PI; fore[i] = up[i] + 0.25; }   // treading water, or a crawl: the arms windmill
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
  out.push(['hips', hip[0], 0, hip[1], b], ['torso', sh[0], 0, sh[1], b], ['head', sh[0], 0, sh[1], b]);
  let hand = null;
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, knee = add(hip, d(thigh[i], H.thigh)), elbow = add(arm, d(up[i], H.upper));
    out.push(['thigh', hip[0], side * H.hip, hip[1], thigh[i]], ['shin', knee[0], side * H.hip, knee[1], shin[i]], ['upper', arm[0], side * H.shoulder, arm[1], up[i]], ['fore', elbow[0], side * H.shoulder, elbow[1], fore[i]]);
    if (i) { const h = add(elbow, d(fore[i], H.fore + 0.04)); hand = [h[0], side * H.shoulder, h[1]]; } }
  const hc = add(sh, [-Math.sin(b) * (H.neck + H.head), Math.cos(b) * (H.neck + H.head)]);
  return { parts: out, hand, head: [hc[0], 0, hc[1]] };
}
// one part's vertex (x, y, z in its own frame) in the body's frame: the same pitch the lit shader applies, then the joint offset
function humanPlace(q, x, y, z) { const cp = Math.cos(q[4]), sp = Math.sin(q[4]); return [q[1] + x * cp - z * sp, q[2] + y, q[3] + x * sp + z * cp]; }
