'use strict';
// The angler seen from behind (third-person view): a very low-detail person, just the silhouette. Each part is its own small
// mesh hanging down -z from its joint (the head sits up +z from the neck), so a pose is only a joint position and a pitch per
// part: every bend is about the shoulders' side-to-side axis, which is what the instanced fish pitch (ipt) already does.
const HUMAN = { foot: 0.08, shin: 0.42, thigh: 0.43, torso: 0.52, neck: 0.08, head: 0.12, upper: 0.3, fore: 0.27, shoulder: 0.19, hip: 0.1 };
// the part meshes, in the frame above: x forward, y to the right, z up, joint at the origin
function humanParts() {
  const H = HUMAN, skin = [0.86, 0.66, 0.52], shirt = [0.22, 0.38, 0.56], pants = [0.27, 0.26, 0.22], boot = [0.2, 0.15, 0.11];
  const part = (mat, f) => { const B = meshBuilder(); B.mat = mat; f(B); return new Float32Array(B.v); };
  return {
    head: part(MT.GEN, B => { B.tube([0, 0, -0.02], [0, 0, H.neck + 0.03], 0.05, 0.045, 6, skin, false); B.blob([0.01, 0, H.neck + H.head], 0.105, 0.09, H.head, 4, 6, skin); }),
    torso: part(MT.CLOTH, B => B.blob([0, 0, -H.torso / 2], 0.12, H.shoulder + 0.02, H.torso / 2 + 0.03, 4, 6, shirt)),
    hips: part(MT.CLOTH, B => B.blob([0, 0, 0], 0.11, H.hip + 0.07, 0.1, 3, 6, pants)),
    upper: part(MT.CLOTH, B => B.tube([0, 0, 0.02], [0, 0, -H.upper], 0.055, 0.045, 5, shirt, true)),
    fore: part(MT.GEN, B => { B.tube([0, 0, 0.02], [0, 0, -H.fore], 0.042, 0.035, 5, skin, false); B.blob([0, 0, -H.fore - 0.04], 0.035, 0.03, 0.05, 3, 5, skin); }),
    thigh: part(MT.CLOTH, B => B.tube([0, 0, 0.03], [0, 0, -H.thigh], 0.075, 0.055, 6, pants, true)),
    shin: part(MT.CLOTH, B => { B.tube([0, 0, 0.02], [0, 0, -H.shin], 0.055, 0.045, 6, pants, false); B.blob([0.05, 0, -H.shin - H.foot + 0.045], 0.12, 0.05, 0.045, 3, 6, boot); }),
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
  if (o.rod && o.mode !== 'swim') { up[1] = b + 0.35; fore[1] = up[1] + 1.15; }   // right forearm out in front, holding the rod
  const hip = [0, hipZ], sh = [hip[0] - d(b, H.torso)[0], hip[1] - d(b, H.torso)[1]], add = (a, q) => [a[0] + q[0], a[1] + q[1]];
  out.push(['hips', hip[0], 0, hip[1], b], ['torso', sh[0], 0, sh[1], b], ['head', sh[0], 0, sh[1], b]);
  let hand = null;
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, knee = add(hip, d(thigh[i], H.thigh)), elbow = add(sh, d(up[i], H.upper));
    out.push(['thigh', hip[0], side * H.hip, hip[1], thigh[i]], ['shin', knee[0], side * H.hip, knee[1], shin[i]], ['upper', sh[0], side * H.shoulder, sh[1], up[i]], ['fore', elbow[0], side * H.shoulder, elbow[1], fore[i]]);
    if (i) { const h = add(elbow, d(fore[i], H.fore + 0.04)); hand = [h[0], side * H.shoulder, h[1]]; } }
  const hc = add(sh, [-Math.sin(b) * (H.neck + H.head), Math.cos(b) * (H.neck + H.head)]);
  return { parts: out, hand, head: [hc[0], 0, hc[1]] };
}
// one part's vertex (x, y, z in its own frame) in the body's frame: the same pitch the lit shader applies, then the joint offset
function humanPlace(q, x, y, z) { const cp = Math.cos(q[4]), sp = Math.sin(q[4]); return [q[1] + x * cp - z * sp, q[2] + y, q[3] + x * sp + z * cp]; }
