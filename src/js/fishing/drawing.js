'use strict';
// FISHING: drawing the rod and end tackle in 3D, the line on the overlay, and the fishing HUD hooks.
// One forearm and hand, +x from the elbow to the knuckles, the origin in the palm where the grip is; the back of the hand
// is up (+z), the fingers curl under, the thumb is on the inside (side: 1 right arm, -1 left).
const mm5 = v => Math.round(v / 0.005) * 0.005;   // fit the one-hand grip to 5 mm so similar fish share one cached hand mesh (each new one costs ~50 ms to build)
const HAND_SCALE = 0.84, HAND_GRIP = [0.03 * HAND_SCALE, 0, -0.026 * HAND_SCALE];   // where a gripped bar lies in the hand: across the palm, inside the curled fingers
const ARM_UP = 0.33, ARM_FORE = 0.33;   // shoulder to elbow, elbow to the middle of the palm (m)
function armMesh(side, curl = 1, grip = 'bar', part = 'all', bodyFit = null, skinHex = null) {   // skinHex: another colour for the hand (the angler's gloves, third person)
  // smooth-shaded throughout (rounded normals, plain skin with no grain): a sleeve, a wrist, a flat palm, four fingers
  // curled round whatever is held and a thumb closing over from the inside
  const B = meshBuilder(true); B.smoothTube = true;
  const skin = hexRGB(skinHex || CONFIG.skinColor), sl = hexRGB(CONFIG.sleeveColor), cuff = sl.map(v => v * 0.78), nail = skin.map((v, k) => Math.min(1, v * 1.06 + 0.03));
  // One continuous skin surface per digit. Shared tangent frames across bends avoid
  // the dark caps and overlapping joint balls that made the old fingers look segmented.
  const limb = (pts, rs, col) => {
    const centers = [], radii = [], count = (pts.length - 1) * 4;
    for (let n = 0; n <= count; n++) {
      const f = n / 4, i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, P = j => pts[clamp(j, 0, pts.length - 1)];
      centers.push([0, 1, 2].map(k => {
        const a = P(i - 1)[k], b = P(i)[k], c = P(i + 1)[k], d = P(i + 2)[k];
        return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
      }));
      radii.push(rs[i] + (rs[i + 1] - rs[i]) * t);
    }
    const tip = centers.at(-1), tangent = norm3(tip.map((v, k) => v - centers.at(-2)[k])), radius = radii.at(-1);
    for (const [along, r] of [[0.65, 0.72], [0.95, 0.3], [1, 0.001]]) {
      centers.push(tip.map((v, k) => v + tangent[k] * radius * along)); radii.push(radius * r);
    }
    const rings = centers.map((c, i) => {
      const a = centers[Math.max(0, i - 1)], b = centers[Math.min(centers.length - 1, i + 1)], X = norm3(b.map((v, k) => v - a[k]));
      const Z = norm3(cross3(X, [0, 1, 0])), Y = cross3(Z, X), slope = (radii[Math.max(0, i - 1)] - radii[Math.min(radii.length - 1, i + 1)]) / (Math.hypot(...b.map((v, k) => v - a[k])) || 1);
      return Array.from({ length: 10 }, (_, j) => {
        const angle = j * Math.PI / 5, radial = Y.map((v, k) => v * Math.cos(angle) + Z[k] * Math.sin(angle));
        return { p: c.map((v, k) => v + radial[k] * radii[i]), n: norm3(radial.map((v, k) => v + X[k] * slope)) };
      });
    });
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 10; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % 10], c = rings[i + 1][(j + 1) % 10], d = rings[i + 1][j];
      B.triN(a.p, b.p, c.p, a.n, b.n, c.n, col, col, col); B.triN(a.p, c.p, d.p, a.n, c.n, d.n, col, col, col);
    }
  };
  B.mat = MT.CLOTH; B.tube([-0.7, 0, 0], [-0.13, 0, 0], 0.046, 0.036, 14, sl, false); B.tube([-0.132, 0, 0], [-0.082, 0, 0], 0.038, 0.031, 14, cuff, true);   // a slim sleeve, long enough to leave the view; its cuff closes in on the wrist, so there is no open end to see into
  B.mat = MT.GEN; const v0 = B.v.length;
  B.tube([-0.27, 0, 0], [-0.068, 0, 0.002], 0.033, 0.028, 14, skin, false);                                  // the forearm, running on up inside the sleeve
  const handStart = B.v.length;
  // A single flattened wrist-to-palm loft, rather than stacked ellipsoids.
  const sections = [[-0.095, 0.024, 0.018], [-0.065, 0.028, 0.015], [-0.035, 0.034, 0.013],
    [0, 0.036, 0.012], [0.026, 0.033, 0.011], [0.044, 0.027, 0.008]];
  const palm = sections.map(([x, ry, rz], i) => {
    const a = sections[Math.max(0, i - 1)], b = sections[Math.min(sections.length - 1, i + 1)], dy = (b[1] - a[1]) / (b[0] - a[0]), dz = (b[2] - a[2]) / (b[0] - a[0]);
    return Array.from({ length: 16 }, (_, j) => {
      const t = j * Math.PI / 8, c = Math.cos(t), q = Math.sin(t);
      return { p: [x, c * ry, q * rz], n: norm3([-dy / ry * c * c - dz / rz * q * q, c / ry, q / rz]) };
    });
  });
  for (let i = 0; i < palm.length - 1; i++) for (let j = 0; j < 16; j++) {
    const a = palm[i][j], b = palm[i][(j + 1) % 16], c = palm[i + 1][(j + 1) % 16], d = palm[i + 1][j];
    B.triN(a.p, b.p, c.p, a.n, b.n, c.n, skin, skin, skin); B.triN(a.p, c.p, d.p, a.n, c.n, d.n, skin, skin, skin);
  }
  for (let j = 0; j < 16; j++) { const a = palm.at(-1)[j], b = palm.at(-1)[(j + 1) % 16]; B.tri([0.044, 0, 0], a.p, b.p, skin, [0, 0, 0]); }
  // Three phalanges rotate in sequence, preserving finger length as the hand closes.
  // Closely packed finger roots overlap the palm; small variations in length give a relaxed outline.
  const bend = clamp(curl, 0, 1);
  for (let i = 0; i < 4; i++) {
    const k = [0.94, 1, 0.95, 0.76][i], y = (i - 1.5) * 0.0165 * side, r = i === 3 ? 0.0083 : 0.0093;
    const pts = [[0.029 - (i === 3 ? 0.007 : 0), y, 0.003]];
    for (let j = 0; j < 3; j++) {
      const angle = [0.12 + bend * 0.48, 0.22 + bend * 1.4, 0.3 + bend * 2.35][j], len = [0.037, 0.028, 0.020][j] * k, q = pts[j];
      pts.push([q[0] + Math.cos(angle) * len, q[1], q[2] - Math.sin(angle) * len]);
    }
    if (grip === 'lip') {
      // All four fingers fold back below the thumb, not into loops above the lip.
      const retreat = i * 0.008, hooked = [[0.029, y, 0.003], [0.049 - retreat, y, -0.014],
        [0.047 - retreat, y, -0.037], [0.023 - retreat, y, -0.043]];
      for (let j = 1; j < 4; j++) pts[j] = handMix(pts[j], hooked[j], bend);
    }
    if (grip === 'body' && bodyFit) {
      const [height, width] = bodyFit.radii[i], cx = bodyFit.center[0], cz = bodyFit.center[2];
      // Close along the cross-section, stopping short of a full wrap on a thick fish.
      // Finger reach stays bounded instead of stretching the hand to match fish length.
      const arc = clamp(0.074 * k / Math.max(0.012, (height + width) * 0.5 + r), 0.7, 2.9);
      for (let j = 1; j < 4; j++) {
        const angle = arc * j / 3, target = [cx + (height + r) * Math.sin(angle), y, cz + (width + r) * Math.cos(angle)];
        pts[j] = handMix(pts[j], target, bend);
      }
    }
    limb(pts, [r * 1.06, r, r * 0.96, r * 0.88], skin);
    const tip = pts[3]; B.blob([tip[0] - 0.003, tip[1], tip[2] + 0.004], 0.006, r * 0.65, 0.002, 2, 6, nail);
  }
  const thumb = [[-0.03, -side * 0.034, 0], [-0.002, -side * (0.058 - bend * 0.012), -0.008],
    [0.028, -side * (0.060 - bend * 0.024), -0.008 - bend * 0.022]];
  if (grip === 'lip') {
    thumb[0] = handMix(thumb[0], [0, -side * 0.028, 0], bend);
    thumb[1] = handMix(thumb[1], [0.042, -side * 0.034, -0.014], bend);
    thumb[2] = handMix(thumb[2], [0.075, -side * 0.025, -0.026], bend);
  }
  if (grip === 'body' && bodyFit) {
    // Thumb opposes the fingers on the camera-facing flank, rather than sticking up.
    thumb[1] = handMix(thumb[1], [0.006, -side * 0.037, -0.002], bend);
    thumb[2] = handMix(thumb[2], [bodyFit.center[0], -side * 0.022, -0.0035], bend);
  }
  limb(thumb, [0.012, 0.0105, 0.009], skin);
  for (let i = v0; i < B.v.length; i += VS) { B.v[i] *= HAND_SCALE; B.v[i + 1] *= HAND_SCALE; B.v[i + 2] *= HAND_SCALE; }   // the hand, modelled a little large, brought down to size about the palm
  const data = part === 'hand' ? B.v.slice(handStart) : part === 'fore' ? B.v.slice(0, handStart) : B.v;
  // Split at the wrist only for fish grips: the palm can lie flat while the forearm slopes down.
  if (part === 'fore') for (let i = 0; i < data.length; i += VS) data[i] += 0.06 * HAND_SCALE;
  return new Float32Array(data);
}
// Shared easing for contact phases; clamping also handles interrupted actions.
function handEase(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function handMix(a, b, t) { return a.map((v, k) => v + (b[k] - v) * t); }
// Fish-space contact targets. Match the body's Catmull-Rom profile and the lit shader's jaw shear.
function fishHandFrame(f) {
  const ca = Math.cos(f.a), sa = Math.sin(f.a), cp = Math.cos(f.pitch || 0), sp = Math.sin(f.pitch || 0), cr = Math.cos(f.roll || 0), sr = Math.sin(f.roll || 0);
  return [[ca * cp, sa * cp, sp], [-sa * cr - ca * sp * sr, ca * cr - sa * sp * sr, cp * sr], [sa * sr - ca * sp * cr, -ca * sr - sa * sp * cr, cp * cr]];
}
function fishHandProfile(body, x) {
  const p = body.profile || [1, 1, 1], t = clamp((0.5 - x) / (1 - clamp(body.tail?.size ?? 0.2, 0.05, 0.35) * 0.85), 0, 1);
  const f = t * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), u = f - i, P = k => p[clamp(k, 0, p.length - 1)];
  const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
  return Math.max(0.03, b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a))));
}
function fishHandPose(f, grip, side, right) {
  const B = f.def.body, axes = fishHandFrame(f), [A, Bside, Up] = axes;
  const world = q => [f.x, f.y, f.z].map((v, k) => v + axes.reduce((n, axis, i) => n + axis[k] * q[i] * f.len, 0));
  let basis, contact, anchor, curl;
  if (grip === 'lip') {
    const head = B.head || {}, hinge = f.def._jaw || [0.3, 0, 0.26 + 0.42 * (head.mouth || 0.5)], angle = (f.open || 0) * hinge[2];
    const x = 0.49, dx = Math.max(0, x - hinge[0]);
    const tipZ = (head.jaw === 'superior' ? 0.35 : head.jaw === 'inferior' ? -0.4 : 0) * B.height * (B.profile?.[0] || 0.5) * (0.2 + 0.5 * (head.snout ?? 0.5));
    contact = world([hinge[0] + dx * Math.cos(angle), 0, tipZ - dx * Math.sin(angle)]);
    // Back of hand faces the player (fish's near flank), wrist below-right.
    // Insert the thumb behind the lip; the curled digits sit lower and farther away,
    // allowing the jaw to occlude their tips instead of outlining a fist above it.
    contact = contact.map((v, k) => v + Up[k] * 0.006 - A[k] * 0.012);
    const X = norm3(A.map((v, k) => v * 0.95 + Up[k] * 0.31)), Z = Bside;
    basis = [X, norm3(cross3(Z, X)), Z];
    anchor = [0.075, -side * 0.025, -0.026].map(v => v * HAND_SCALE); curl = 1;
  } else if (grip === 'hand') {
    // One hand closes behind the head. Back toward the near flank/player, palm inward;
    // the elbow stays below-right. This must not reuse the open cradle pose.
    const x = Math.min(0.2, 0.34 - 0.025 / f.len), profile = fishHandProfile(B, x);
    const width = f.len * (B.width || 0.11) * Math.pow(profile, 0.9) * 0.5;
    contact = world([x, width / f.len, 0]);
    basis = [Up, A, Bside]; anchor = [0.03, 0, -0.0115].map(v => v * HAND_SCALE); curl = 1;
    const radii = [0, 1, 2, 3].map(i => {
      const along = x + (i - 1.5) * 0.0165 * side * HAND_SCALE / f.len, p = fishHandProfile(B, along);
      return [mm5(f.len * B.height * p * 0.5 / HAND_SCALE), mm5(f.len * (B.width || 0.11) * Math.pow(p, 0.9) * 0.5 / HAND_SCALE)];
    });
    const bodyFit = { center: [0.03, 0, mm5(-width / HAND_SCALE - 0.0115)], radii };
    bodyFit.key = JSON.stringify([bodyFit.center, radii]);
    const origin = contact.map((v, k) => v - basis.reduce((n, axis, i) => n + axis[k] * anchor[i], 0));
    return { origin, basis, contact, anchor, curl, grip: 'body', lip: 0, bodyFit };
  } else {
    const sign = A.reduce((n, v, k) => n + v * right[k], 0) >= 0 ? 1 : -1;
    const x = side * 0.18 * sign;
    const belly = B.height * fishHandProfile(B, x) * (B.lie ? 0.13 : 0.5);
    contact = world([x, 0, -belly]);
    // Back down, fingers across the belly: palm and proximal pads share the load.
    const X = Bside.map(v => -v), Z = Up.map(v => -v), Y = cross3(Z, X);
    basis = [X, Y, Z]; anchor = [0.018, 0, -0.0115].map(v => v * HAND_SCALE); curl = 0.18;
  }
  const origin = contact.map((v, k) => v - basis.reduce((n, axis, i) => n + axis[k] * anchor[i], 0));
  return { origin, basis, contact, anchor, curl, grip: 'fish', lip: grip === 'lip' ? 1 : 0 };
}
function handAngles(basis) {
  const [X, Y] = basis, yaw = Math.atan2(X[1], X[0]), pitch = Math.atan2(X[2], Math.hypot(X[0], X[1]));
  const y0 = [-Math.sin(yaw), Math.cos(yaw), 0], z0 = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];
  return [yaw, pitch, Math.atan2(Y.reduce((n, v, k) => n + v * z0[k], 0), Y.reduce((n, v, k) => n + v * y0[k], 0))];
}
// Conservative palm clearance around the carried body, in the fish's pitched/rolled frame.
// The mouth is beyond this envelope so a lip grip can still reach the jaw.
function handOutsideFish(f, point) {
  const ca = Math.cos(f.a), sa = Math.sin(f.a), cp = Math.cos(f.pitch || 0), sp = Math.sin(f.pitch || 0), cr = Math.cos(f.roll || 0), sr = Math.sin(f.roll || 0);
  const X = [ca * cp, sa * cp, sp], Y = [-sa * cr - ca * sp * sr, ca * cr - sa * sp * sr, cp * sr], Z = [sa * sr - ca * sp * cr, -ca * sr - sa * sp * cr, cp * cr];
  const origin = [f.x, f.y, f.z], axes = [X, Y, Z], radii = [f.len * 0.43, f.len * (f.def.body.width || 0.11) * 0.5 + 0.025, f.len * f.def.body.height * 0.5 + 0.025];
  const local = axes.map(axis => axis.reduce((n, v, k) => n + v * (point[k] - origin[k]), 0));
  const d = Math.hypot(...local.map((x, k) => x / radii[k]));
  if (d >= 1) return point;
  if (d < 1e-5) { local[2] = -radii[2]; return origin.map((v, k) => v + Z[k] * local[2]); }
  return origin.map((v, k) => v + axes.reduce((n, axis, i) => n + axis[k] * local[i] / d, 0));
}
function posedArm(engine, side, curl, grip = 'bar', part = 'all', lipWeight = 0, bodyFit = null) {
  const key = 'arm:' + side + ':' + grip + ':' + part + ':' + CONFIG.skinColor + CONFIG.sleeveColor + (bodyFit ? ':' + bodyFit.key : '');
  const g = engine.tackleGpu(key, () => armMesh(side, 1, grip, part, bodyFit));
  if (!g.handFrames) { g.handFrames = [0, 0.25, 0.5, 0.75, 1].map(c => armMesh(side, c, grip, part, bodyFit)); g.handData = g.handFrames[4].slice();
    if (grip === 'fish') g.lipFrames = [0, 0.25, 0.5, 0.75, 1].map(c => armMesh(side, c, 'lip', part)); }
  if (Math.abs((g.curl ?? -1) - curl) > 0.001 || Math.abs((g.lipWeight ?? -1) - lipWeight) > 0.001) {
    const phase = clamp(curl, 0, 1) * 4, frame = Math.min(3, Math.floor(phase)), u = phase - frame, a = g.handFrames[frame], b = g.handFrames[frame + 1];
    for (let i = 0; i < g.handData.length; i += VS) {
      for (let k = 0; k < 6; k++) {
        const base = a[i + k] + (b[i + k] - a[i + k]) * u;
        const lip = g.lipFrames ? g.lipFrames[frame][i + k] + (g.lipFrames[frame + 1][i + k] - g.lipFrames[frame][i + k]) * u : base;
        g.handData[i + k] = base + (lip - base) * lipWeight;
      }
      const n = Math.hypot(...g.handData.subarray(i + 3, i + 6)) || 1;
      for (let k = 3; k < 6; k++) g.handData[i + k] /= n;
    }
    engine.gl.bindBuffer(engine.gl.ARRAY_BUFFER, g.vb); engine.gl.bufferSubData(engine.gl.ARRAY_BUFFER, 0, g.handData); g.curl = curl; g.lipWeight = lipWeight;
  }
  return g;
}
Object.assign(Engine, {
  // ---- your arms, in first person ----
  // Each hand is the same small model (armMesh) put where it grips and aimed back at an elbow off the bottom of the
  // view: left hand on the rod above the reel, right on the reel's handle (it goes round with it), or reaching to the
  // fish's mouth to unhook it; under or on a fish in your hands; either side of a pot; on the gathered cast net.
  drawArms(gl, Lp) {
    if (!CONFIG.showArms || this.thirdP || this.showMap || this.titleOpen || this.swim) { this._handPoses = null; return; }
    const P = this.P, A = this.ang, T = this.traps, eo = this.eyeOff || ZERO3, eye = [P.x + eo[0], P.y + eo[1], P.z + EYE + eo[2]];
    const cp = Math.cos(P.pitch), F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)], R = [-Math.sin(P.a), Math.cos(P.a), 0], U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    const at = (d, r, u) => [0, 1, 2].map(k => eye[k] + F[k] * d + R[k] * r + U[k] * u);
    const jobs = [];   // [side, palm position, roll, optional bar axis, optional underside axis, curl 0..1]
    const land = A && A.out && A.phase === 'card' && A.land && A.fish ? A.land : null, f = land && A.fish;
    const bent = land && land.st === 'unhook' && !land.big, grab = this.grab, cy = this.carry;
    const rod = !!(A && A.out && A.S && A.hand && !A.holder && !(this.boat && this.boatMode !== 'deck')) && !bent && !grab;
    // both hands down onto a fish on the ground: from where they hang, the hand at its tail end pins it, the other goes to its head (to the hook, or to lift it)
    const onFish = (q, u1, u2, work) => { const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }, mixp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u), half = this.fishLie(q).half, m = this.fishMouth(q);
      const ca = Math.cos(q.a), sa = Math.sin(q.a), hs = ca * R[0] + sa * R[1] >= 0 ? 1 : -1, pin = [q.x - ca * q.len * 0.14, q.y - sa * q.len * 0.14, q.z + half + 0.012], head = work === null ? [q.x + ca * q.len * 0.2, q.y + sa * q.len * 0.2, q.z + half + 0.012] : [m[0], m[1], m[2] + 0.02 + work];
      jobs.push([-hs, mixp(at(0.3, -hs * 0.24, -0.34), pin, sm(u1)), 0.15], [hs, mixp(at(0.3, hs * 0.24, -0.34), head, sm(u2)), work === null ? 0.15 : 0.4]);
      jobs[jobs.length - 2][5] = handEase((u1 - 0.75) / 0.25); jobs[jobs.length - 1][5] = handEase((u2 - 0.75) / 0.25); };
    let pot = null, deck = false;
    if (bent) onFish(f, (land.t - 0.36) / 0.3, (land.t - 0.48) / 0.3, land.t > 0.85 && land.t < 1.35 ? 0.008 * Math.sin((land.t - 0.85) * 24) * Math.sin(Math.PI * (land.t - 0.85) / 0.5) : 0.035 * handEase((land.t - 1.35) / 0.2));   // support, pinch and turn, then withdraw the hook
    else if (grab && grab.l) onFish(grab.l.f, (grab.t - 0.12) / 0.34, (grab.t - 0.2) / 0.34, null);
    else if (A && A.holder && A.holder.reachT !== undefined) {
      const t = A.holder.reachT, target = this.holderHand(A.holder);
      jobs.push([-1, handMix(at(0.26, -0.24, -0.35), target, handEase((t - 0.04) / 0.24)), 0.3, null, null, handEase((t - 0.22) / 0.1)]);
    } else if (rod) {
      deck = !!this.boat; const r0 = this.rodPoint(A, [0, 0, 0]), r1 = this.rodPoint(A, [1, 0, 0]), rodDir = [r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]], cyw = Math.cos(A.yaw || 0), syw = Math.sin(A.yaw || 0);
      { const r2 = this.rodPoint(A, [0, 0, 1]); jobs.push([-1, this.rodPoint(A, [-0.13, 0, 0]), 0.3, rodDir, [r2[0] - r0[0], r2[1] - r0[1], r2[2] - r0[2]]]); }   // the rod lies in your left hand: under the handle below the reel, palm up, fingers closed up round it
      { const k = REEL_PARTS[A.S.reel.kind] ? A.S.reel.kind : 'spinning', Pp = REEL_PARTS[k], arm = k === 'conventional' ? 0.065 : k === 'baitcaster' ? 0.035 : 0.05;
        const pv = this.rodPoint(A, Pp.handle), pc = (A.pitch || 0) + (A.reelW ? A.reelW.crank : 0), xr = -arm * Math.sin(pc), zr = arm * Math.cos(pc), cy = cyw, sy = syw, oy = 0.024;
        jobs.push([1, [pv[0] + cy * xr - sy * oy, pv[1] + sy * xr + cy * oy, pv[2] + zr], 0.3, [-sy, cy, 0]]); }   // your right hand closed on the handle's knob, going round with it
    } else if (cy && cy.reachTime && cy.t < cy.reachTime) {
      onFish(cy.f, cy.t / 0.22, (cy.t - 0.04) / 0.22, null);
    } else if (cy) {
      const f = cy.f;
      const support = (sg, grip) => {
        const pose = fishHandPose(f, grip === 'lip' && sg === -1 ? 'cradle' : grip, sg, R);
        return [sg, pose.origin, handAngles(pose.basis)[2] / sg, null, null, pose.curl, pose];
      };
      const changing = !!cy.previousGrip, u = handEase(cy.t / cy.liftTime);
      for (const sg of [1, -1]) {
        if (sg === -1 && cy.grip !== 'cradle' && !changing) continue;
        const job = support(sg, cy.grip);
        if (changing && sg === 1) {
          const old = support(sg, cy.previousGrip);
          job[1] = handMix(old[1], job[1], u);
          // Go around the near side of the fish while the other hand supports its belly.
          const arc = Math.sin(Math.PI * u) * (f.len * f.def.body.height * 0.6 + 0.07);
          job[1] = job[1].map((v, k) => v - F[k] * arc);
          const X = norm3(handMix(old[6].basis[0], job[6].basis[0], u)), Z = norm3(handMix(old[6].basis[2], job[6].basis[2], u));
          const Y = norm3(cross3(Z, X)); job[6].basis = [X, Y, cross3(X, Y)]; job[6].lip = old[6].lip + (job[6].lip - old[6].lip) * u;
          job[2] = old[2] + (job[2] - old[2]) * u;
          job[5] = (old[5] + (job[5] - old[5]) * u) * (1 - 0.7 * Math.sin(Math.PI * u));
        }
        if (!changing && !cy.reachTime && cy.t < 0.2) {
          // Show the reaching palms at the lower edge before the rising fish reaches them.
          const delta = job[1].map((v, k) => v - eye[k]), depth = delta.reduce((n, v, k) => n + v * F[k], 0);
          const height = delta.reduce((n, v, k) => n + v * U[k], 0), floor = -Math.max(0.3, depth) * (this.tanY || 0.35) * 0.7;
          const rise = Math.max(0, floor - height) * (1 - handEase((cy.t - 0.1) / 0.1));
          job[1] = job[1].map((v, k) => v + U[k] * rise);
        }
        if (cy.action) job[5] *= 1 - handEase((cy.action.t - 0.22) / 0.1);
        jobs.push(job);
      }
    }
    else if (T && T.hand && !(A && A.out) && !(T.fly && T.fly.length)) {
      if (T.hand === 'cast_net') jobs.push([1, [P.x + Math.cos(P.a) * 0.6 + R[0] * 0.22, P.y + Math.sin(P.a) * 0.6 + R[1] * 0.22, P.z + 1.37], 0.2]);   // the hub of the gathered net (traps.js: hands())
      else { const data = this.meshData && this.meshData['trap_' + T.hand];   // a pot: held out in front by its two long sides, its top below your eyeline
        if (data) { const Bx = (this._potBox || (this._potBox = {}))[T.hand] || (this._potBox[T.hand] = meshBox(data)), ex = (Bx.hi[0] - Bx.lo[0]) / 2, ey = (Bx.hi[1] - Bx.lo[1]) / 2, turn = ey > ex;   // long axis away from you
            const hx = turn ? ey : ex, hy = turn ? ex : ey, d = 0.34 + hx, top = -0.2, C = at(d, 0, top - (Bx.hi[2] - Bx.lo[2]));
            const rot = P.a + (turn ? Math.PI / 2 : 0), cx = (Bx.lo[0] + Bx.hi[0]) / 2, cyy = (Bx.lo[1] + Bx.hi[1]) / 2, cr = Math.cos(rot), sr = Math.sin(rot);
            pot = { key: 'held:' + T.hand, data, x: C[0] - (cr * cx - sr * cyy), y: C[1] - (sr * cx + cr * cyy), z: C[2] - Bx.lo[2], rot };
            for (const sg of [1, -1]) jobs.push([sg, at(d - hx * 0.35, sg * (hy + 0.012), top - (Bx.hi[2] - Bx.lo[2]) * 0.5), 0]); } }   // by the middle of each side
    }
    // Retain the last pose through transfers and withdraw unused hands below view.
    const poses = this._handPoses || (this._handPoses = {}), now = this.time || 0;
    for (const sg of [-1, 1]) {
      let job = jobs.find(j => j[0] === sg), prev = poses[sg];
      if (!job && prev && now - prev.seen < 0.22) { job = [sg, at(0.22, sg * 0.28, -0.65), prev.roll, null, null, 0, prev.pose]; jobs.push(job); }
      else if (!job) { delete poses[sg]; continue; }
      else if (prev) prev.seen = now;
      const dt = prev ? clamp(now - prev.time, 0, 0.05) : 1 / 60, k = 1 - Math.exp(-dt * 24);
      const curl = job[5] ?? (cy && cy.action ? 1 - handEase((cy.action.t - 0.2) / 0.12) : 1);
      if (!prev) prev = { p: at(0.38, sg * 0.18, -0.18), roll: job[2], curl: 0, seen: now };
      // Bar grips remain exact; free hands ease into contact and take an outside arc during a swap.
      if (!job[3]) {
        // A held fish and its contact hands must move together; filtering them separately creates a gap.
        if (!job[6]) job[1] = handMix(prev.p, job[1], k);
        if (cy && !job[6]) job[1] = handOutsideFish(cy.f, job[1]);
        const depth = job[1].reduce((v, x, i) => v + (x - eye[i]) * F[i], 0);
        if (depth < 0.18) job[1] = job[1].map((x, i) => x + F[i] * (0.18 - depth));
        job[2] = prev.roll + Math.atan2(Math.sin(job[2] - prev.roll), Math.cos(job[2] - prev.roll)) * k;
      }
      job[5] = prev.curl + (curl - prev.curl) * k;
      poses[sg] = { p: job[1].slice(), roll: job[2], curl: job[5], time: now, seen: prev.seen, pose: job[6] };
    }
    if (!jobs.length) return;
    gl.uniform1f(Lp.u.fsh, 1); gl.uniform1f(Lp.u.wig, 0); gl.uniform1f(Lp.u.swm, 0); gl.uniform3fv(Lp.u.jawP, [0, 0, 0]); gl.uniform1f(Lp.u.roll, 0);
    const one = (g, x, y, z, rot, pitch) => { this.upInst(g, [x, y, z, 1, rot, 0.5, -1e4, 0, 0, pitch]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); };
    if (deck) gl.depthRange(0, 0.1);   // like the rod on deck: over the boat, never through the hull
    if (pot) one(this.tackleGpu(pot.key, () => pot.data), pot.x, pot.y, pot.z, pot.rot, 0);
    // each arm is worked out as shoulder (beside and below the eye) -> elbow -> hand, with an upper arm and forearm of fixed length
    // (ARM_UP, ARM_FORE), so a hand asked to go further than that stops at full stretch and the forearm comes in from where an
    // elbow would hang. Only the forearm and hand are drawn: one slim sleeve running back out of view.
    const aim = (g, from, to, roll) => { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; gl.uniform1f(Lp.u.roll, roll); return [Math.atan2(dy, dx), Math.atan2(dz, Math.hypot(dx, dy))]; };
    for (const [sg, G0, roll, bar, under, curl, pose] of jobs) { const S = at(-0.05, sg * 0.21, -0.21), v = [G0[0] - S[0], G0[1] - S[1], G0[2] - S[2]], d0 = Math.hypot(v[0], v[1], v[2]) || 1e-3, d = Math.min(d0, (ARM_UP + ARM_FORE) * 0.985);
      const n = v.map(x => x / d0), G = S.map((x, k) => x + n[k] * d), h = (ARM_UP * ARM_UP - ARM_FORE * ARM_FORE + d * d) / (2 * d), r = Math.sqrt(Math.max(0, ARM_UP * ARM_UP - h * h));
      let q = [0, 1, 2].map(k => -U[k] * 0.8 + R[k] * sg * 0.55 - F[k] * 0.25); const qn = q[0] * n[0] + q[1] * n[1] + q[2] * n[2]; q = q.map((x, k) => x - n[k] * qn); const ql = Math.hypot(q[0], q[1], q[2]) || 1;
      const Eb = S.map((x, k) => x + n[k] * h + q[k] / ql * r), g = posedArm(this, sg, curl, pose ? pose.grip : 'bar', pose ? 'hand' : 'all', pose ? pose.lip : 0, pose ? pose.bodyFit : null);
      if (pose) {
        const a = handAngles(pose.basis), wrist = G0.map((v, k) => v - pose.basis[0][k] * 0.06 * HAND_SCALE);
        const fore = this.tackleGpu('fore:' + sg + ':' + CONFIG.skinColor + CONFIG.sleeveColor, () => armMesh(sg, 0, 'bar', 'fore'));
        const fa = aim(null, Eb, wrist, a[2]); one(fore, ...wrist, ...fa);
        gl.uniform1f(Lp.u.roll, a[2]); one(g, ...G0, a[0], a[1]); continue;
      }
      if (bar) {   // gripping a bar (the rod's handle, the reel's knob) that runs along `bar` through G0: the hand is turned about the forearm
        // until the bar lies across the palm, back of the hand up, and set so the bar sits inside the curled fingers
        const e = [G0[0] - Eb[0], G0[1] - Eb[1], G0[2] - Eb[2]], el = Math.hypot(e[0], e[1], e[2]) || 1, X = e.map(x => x / el), xb = X[0] * bar[0] + X[1] * bar[1] + X[2] * bar[2];   // the forearm keeps its own line, from the elbow
        let Y = [bar[0] - X[0] * xb, bar[1] - X[1] * xb, bar[2] - X[2] * xb]; const yl = Math.hypot(Y[0], Y[1], Y[2]);   // ... and the bar crosses the palm as squarely as that allows
        if (yl > 0.2) { Y = Y.map(x => x / yl); let Z = cross3(X, Y); const ref = Array.isArray(under) ? under : U; if ((Z[0] * ref[0] + Z[1] * ref[1] + Z[2] * ref[2]) * (under ? -1 : 1) < 0) { Y = Y.map(x => -x); Z = Z.map(x => -x); }   // back of the hand up; or down, for a hand under the bar, palm up
          const yaw = Math.atan2(X[1], X[0]), pit = Math.atan2(X[2], Math.hypot(X[0], X[1])), y0 = [-Math.sin(yaw), Math.cos(yaw), 0], z0 = [-Math.sin(pit) * Math.cos(yaw), -Math.sin(pit) * Math.sin(yaw), Math.cos(pit)];
          const rl = Math.atan2(Y[0] * z0[0] + Y[1] * z0[1] + Y[2] * z0[2], Y[0] * y0[0] + Y[1] * y0[1] + Y[2] * y0[2]), O = [0, 1, 2].map(k => G0[k] - X[k] * HAND_GRIP[0] - Z[k] * HAND_GRIP[2]);
          gl.uniform1f(Lp.u.roll, rl); one(g, O[0], O[1], O[2], yaw, pit); continue; } }
      const a = aim(null, Eb, G, roll * sg); one(g, G[0], G[1], G[2], a[0], a[1]);
      }
    gl.uniform1f(Lp.u.roll, 0); if (deck) gl.depthRange(0, 1);
  },
  // ---- drawing: the rod and the end tackle in 3D, the line on the overlay ----
  tackleGpu(key, build) {
    const gl = this.gl, M = this._tgpu || (this._tgpu = new Map()); let g = M.get(key);
    if (!g) { const m = build(), ib = gl.createBuffer(), vb = this.vbo(m); g = { vao: this.litVao(vb, VB, ib, 40), ib, vb, n: m.length / VS }; M.set(key, g);
      if (M.size > 80) { const [k0, g0] = M.entries().next().value; gl.deleteVertexArray(g0.vao); gl.deleteBuffer(g0.ib); gl.deleteBuffer(g0.vb); M.delete(k0); } }
    return g;
  },
  drawTackle(gl, Lp, E) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap) return;
    const S = A.S, rv = TackleDB.revision;
    gl.uniform1f(Lp.u.fsh, 1); gl.uniform1f(Lp.u.wig, 0); gl.uniform1f(Lp.u.swm, 0); gl.uniform3fv(Lp.u.jawP, [0, 0, 0]); gl.uniform1f(Lp.u.roll, 0);
    const one = (g, x, y, z, s, rot, wl, mk, pitch) => { this.upInst(g, [x, y, z, s, rot, 0.5, wl, mk, 0, pitch]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); };
    const lvl = rodBendLevel(A.bend), rk = `rod:${A.rigId}:${rv}:${lvl}`;
    const held = !this.thirdP && this.boat && this.boatMode === 'deck' && !A.holder;   // in your hands on deck: drawn over the boat, so it can't poke through the hull
    if (held) gl.depthRange(0, 0.1);
    const down = A.phase === 'card' && A.land && A.land.st === 'unhook' && !A.land.big;   // laid aside while both hands are on the fish
    if (!down) { one(this.tackleGpu(rk, () => rodMesh(S, lvl / (ROD_BEND_STEPS - 1)).mesh), A.hand[0], A.hand[1], A.hand[2], 1, A.yaw, -1e4, 0, A.pitch); this.drawReelParts(one, rv); }
    if (A.holder) { const H = A.holder; gl.uniform1f(Lp.u.roll, H.roll || 0); one(this.tackleGpu('holder:' + !!H.boat, () => holderMesh(H.up + (H.boat ? 0 : 0.3))), A.hand[0], A.hand[1], A.hand[2], 1, H.yaw, -1e4, 0, H.tilt || 0); gl.uniform1f(Lp.u.roll, 0); }   // the spike or gunwale holder the rod stands in
    if (held) gl.depthRange(0, 1);
    const endKey = S.lure ? `lure:${S.lure.id}:${rv}` : `bait:${S.bait.id}:${S.hook.id}:${rv}`, endMesh = () => S.lure ? lureMesh(S.lure) : baitMesh(S);
    if (A.phase === 'card') { if (A.land && A.land.hooked && A.fish) { const m = this.fishMouth(A.fish); one(this.tackleGpu(endKey, endMesh), m[0], m[1], m[2], 1, A.fish.a + Math.PI, -1e4, 0, 0); } return; }   // still in its mouth
    const sc = (x, y, z, k = 6) => clamp(Math.hypot(x - E[0], y - E[1], z - E[2]) / k, 1, 9);   // a touch bigger far away, so you can follow it
    const L = A.lure, T = A.tip;
    if (!L) { // dangling under the rod tip, swinging
      const D = A.dangle || { x: T[0], y: T[1], z: T[2] - 0.3 }, u = k => [T[0] + (D.x - T[0]) * k, T[1] + (D.y - T[1]) * k, T[2] + (D.z - T[2]) * k];
      if (S.float) { const q = u(0.45); one(this.tackleGpu(`float:${S.float.id}:${rv}`, () => floatMesh(S.float)), q[0], q[1], q[2], 1, A.yaw, -1e4, 0, 0); }
      if (S.sinker) { const q = u(0.75); one(this.tackleGpu(`sinker:${S.sinker.id}:${rv}`, () => sinkerMesh(S.sinker)), q[0], q[1], q[2], 1, A.yaw, -1e4, 0, 0); }
      one(this.tackleGpu(endKey, endMesh), D.x, D.y, D.z, 1, A.yaw + Math.PI / 2, -1e4, 0, 0);
      return;
    }
    const mk = L.kd >= 0 ? WATER[L.kd].murk : 0, wl = L.kd >= 0 ? L.wl : -1e4;
    const s = sc(L.x, L.y, L.z), rot = A.phase === 'fight' || A.phase === 'bite' ? (A.fish ? A.fish.a + Math.PI : L.dir) : L.dir + Math.PI;
    one(this.tackleGpu(endKey, endMesh), L.x, L.y, L.z, s, rot, wl, mk, S.lure && S.lure.style === 'skirt' ? 0 : 0);
    if (S.sinker) { const F = A.float, d = Math.hypot(T[0] - L.x, T[1] - L.y, T[2] - L.z) || 1;   // a split shot just above the bait, or the sinker a hand up the line
      const q = F ? [L.x + (F.x - L.x) * 0.3, L.y + (F.y - L.y) * 0.3, L.z + (F.z - L.z) * 0.3] : [L.x + (T[0] - L.x) / d * 0.12, L.y + (T[1] - L.y) / d * 0.12, L.z + (T[2] - L.z) / d * 0.12];
      one(this.tackleGpu(`sinker:${S.sinker.id}:${rv}`, () => sinkerMesh(S.sinker)), q[0], q[1], q[2], s, 0, wl, mk, 0); }
    if (A.float) { const F = A.float, fs = A.phase === 'fight' ? 0.4 : F.spd || 0;   // towed along, it leans back and turns to face the pull
      one(this.tackleGpu(`float:${S.float.id}:${rv}`, () => floatMesh(S.float)), F.x, F.y, F.z, sc(F.x, F.y, F.z, 4.5), F.rot || 0, wl, mk, -clamp(fs * 1.2, 0, 0.45)); }
  },
  // the fishing line: rod tip → (float) → lure, sagging when slack; dimmer under water
  drawLine(c) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap || (A.phase === 'card' && !(A.land && A.land.hooked && A.fish))) return;
    const T = A.tip, L = A.lure, col = A.S.line.colors.line, rgb = hexRGB(col).map(v => v * 255 | 0);
    const seg = (a, b, sag, alpha, w) => {
      const pa = this.project(...a), pb = this.project(...b); if (!pa || !pb) return;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - sag], pm = this.project(...m);
      c.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`; c.lineWidth = w; c.beginPath(); c.moveTo(pa[0], pa[1]);
      if (pm && sag > 0.01) c.quadraticCurveTo(2 * pm[0] - (pa[0] + pb[0]) / 2, 2 * pm[1] - (pa[1] + pb[1]) / 2, pb[0], pb[1]); else c.lineTo(pb[0], pb[1]); c.stroke();
    };
    const w = A.S.line.material === 'braid' ? 1.5 : 1.1, P = this.P, E = this.thirdP && this.camE ? this.camE : [P.x, P.y, P.z + EYE];
    const px = (x, y, z) => clamp(w * 0.9 / Math.max(0.3, Math.hypot(x - E[0], y - E[1], z - E[2])), 0.5, w);   // thinner with distance
    c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
    if (A.phase === 'card') { if (A.land.st === 'unhook' && !A.land.big) { c.restore(); return; } const m = this.fishMouth(A.fish); seg(T, m, 0.02 + 0.04 * Math.hypot(T[0] - m[0], T[1] - m[1]), 0.9, px(m[0], m[1], m[2])); c.restore(); return; }   // rod tip to the hook in its mouth
    const R = A.rope; if (!R) { c.restore(); return; }
    // the simulated line as one smooth curve (midpoint to midpoint through each point): a faint dark edge, then the line itself
    const n = R.p.length / 3, Q = [], wet = [];
    for (let k = 0; k < n; k++) { Q.push(this.project(R.p[k * 3], R.p[k * 3 + 1], R.p[k * 3 + 2])); wet.push(R.p[k * 3 + 2] < R.wl[k] - 0.01); }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // aboard: the same curve in short straight bits, leaving out those the hull hides
    const bt = this.boat, be = bt && this.boatLocal(bt, ...E);
    const bz = this.lineBz || (this.lineBz = [0, 0, 0]), bits = bt && (this.lineBits || (this.lineBits = []));   // scratch, reused every frame
    const bez = (k, u) => { const a = Math.max(k - 1, 0) * 3, q = k * 3, b = Math.min(k + 1, n - 1) * 3, w0 = (1 - u) * (1 - u) / 2, w2 = u * u / 2, w1 = 1 - w0 - w2; for (let i = 0; i < 3; i++) bz[i] = R.p[a + i] * w0 + R.p[q + i] * w1 + R.p[b + i] * w2; return bz; };
    if (bits) for (let k = 0; k < n; k++) { const out = bits[k] || (bits[k] = []); out.length = 0; let a = this.project(...bez(k, 0));
      for (let i = 1; i <= 4; i++) { const b = this.project(...bez(k, i / 4)); if (a && b && !this.boatHides(bt, be, ...bez(k, (i - 0.5) / 4))) out.push(a, b); a = b; } }
    for (const pass of [0, 1]) for (let k = 0; k < n; k++) {   // piece k: from halfway to the previous point, bending through point k, to halfway to the next
      const q = Q[k], qa = k > 0 ? Q[k - 1] : q, qb = k < n - 1 ? Q[k + 1] : q; if (!q || !qa || !qb) continue;
      const from = mid(qa, q), to = mid(q, qb), under = wet[k], lw = under ? 0.5 : px(R.p[k * 3], R.p[k * 3 + 1], R.p[k * 3 + 2]);
      c.strokeStyle = pass ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${under ? 0.025 : 0.7})` : `rgba(0,0,0,${under ? 0 : 0.18})`;
      c.lineWidth = pass ? lw : lw + 1.2; c.beginPath();
      if (bits) for (let i = 0; i < bits[k].length; i += 2) { c.moveTo(bits[k][i][0], bits[k][i][1]); c.lineTo(bits[k][i + 1][0], bits[k][i + 1][1]); }
      else { c.moveTo(from[0], from[1]); c.quadraticCurveTo(q[0], q[1], to[0], to[1]); }
      c.stroke();
    }
    if (!L && A.dangle) {   // hanging under the tip: float → sinker → bait, straight because the weight pulls it tight
      const D = A.dangle, T0 = R.p.slice((n - 1) * 3), b = [D.x, D.y, D.z + 0.02];
      if (Math.hypot(b[0] - T0[0], b[1] - T0[1], b[2] - T0[2]) > 0.03) seg(T0, b, 0, 0.55, px(...b));
    }
    if (L && A.float) seg([A.float.x, A.float.y, A.float.z], [L.x, L.y, L.z], 0, 0.025, 0.5);   // barely visible leader from float down to bait
    c.restore();
  },
  drawFishingHud(c, Wd, Ht) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap) return;
    this.drawLine(c);
    if (A.phase === 'card' || this.hudClearNow) return;
    const S = A.S, k = this.touchUI ? 0.92 : 1;   // the status panel itself is HTML now (fishingStatus in js/hud/status-keys.js)
    if (A.phase === 'bite' && A.took && S.hookKind !== 'circle' && !A.holder) { const a = 0.6 + 0.4 * Math.sin(this.time * 20); c.font = `bold ${30 * k}px Georgia, serif`; c.textAlign = 'center'; c.fillStyle = `rgba(255,208,64,${a})`; c.fillText('STRIKE!', Wd / 2, Ht / 2 - 60); c.textAlign = 'left'; }
  },
});
