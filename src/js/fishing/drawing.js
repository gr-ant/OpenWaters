'use strict';
// FISHING: drawing the rod and end tackle in 3D, the line on the overlay, and the fishing HUD hooks.
// One forearm and hand, +x from the elbow to the knuckles, the origin in the palm where the grip is; the back of the hand
// is up (+z), the fingers curl under, the thumb is on the inside (side: 1 right arm, -1 left).
const HAND_SCALE = 0.84, HAND_GRIP = [0.03 * HAND_SCALE, 0, -0.026 * HAND_SCALE];   // where a gripped bar lies in the hand: across the palm, inside the curled fingers
const ARM_UP = 0.33, ARM_FORE = 0.33;   // shoulder to elbow, elbow to the middle of the palm (m)
function armMesh(side) {
  // smooth-shaded throughout (rounded normals, plain skin with no grain): a sleeve, a wrist, a flat palm, four fingers
  // curled round whatever is held and a thumb closing over from the inside
  const B = meshBuilder(true); B.smoothTube = true;
  const skin = hexRGB(CONFIG.skinColor), sl = hexRGB(CONFIG.sleeveColor), cuff = sl.map(v => v * 0.78), under = skin.map(v => v * 0.95), nail = skin.map((v, k) => Math.min(1, v * 1.06 + 0.03));
  const limb = (pts, rs, col) => { for (let i = 0; i < pts.length - 1; i++) B.tube(pts[i], pts[i + 1], rs[i], rs[i + 1], 10, col, false); for (let i = 0; i < pts.length; i++) B.blob(pts[i], rs[i], rs[i], rs[i], 5, 10, col); };   // capsules: rounded at every joint and at the tip
  B.mat = MT.CLOTH; B.tube([-0.7, 0, 0], [-0.13, 0, 0], 0.046, 0.036, 14, sl, false); B.tube([-0.132, 0, 0], [-0.1, 0, 0], 0.038, 0.027, 14, cuff, true);   // a slim sleeve, long enough to leave the view; its cuff closes in on the wrist, so there is no open end to see into
  B.mat = MT.GEN; const v0 = B.v.length;
  B.tube([-0.27, 0, 0], [-0.068, 0, 0.002], 0.033, 0.028, 14, skin, false);                                  // the forearm, running on up inside the sleeve
  B.blob([-0.06, 0, 0.003], 0.034, 0.034, 0.023, 6, 12, skin);                                               // the heel of the hand: where the round wrist flattens into the palm
  B.blob([-0.012, 0, 0.004], 0.052, 0.041, 0.018, 7, 14, skin);                                            // palm and back of the hand
  B.blob([-0.028, -side * 0.024, -0.003], 0.027, 0.018, 0.014, 5, 10, skin);                               // the ball of the thumb
  for (let i = 0; i < 4; i++) { const y = (i - 1.5) * 0.0195 * side, k = i === 0 || i === 3 ? (i === 3 ? 0.84 : 0.95) : 1, r = 0.0096 * (i === 3 ? 0.88 : 1);   // index .. little finger, the little one shorter and finer
    limb([[0.03, y, 0.006], [0.03 + 0.036 * k, y, -0.012], [0.03 + 0.03 * k, y, -0.012 - 0.03 * k], [0.03 + 0.008 * k, y, -0.012 - 0.036 * k]], [r * 1.08, r, r * 0.93, r * 0.86], i % 2 ? skin : under); }
  limb([[-0.03, -side * 0.034, 0.0], [0.004, -side * 0.05, -0.014], [0.03, -side * 0.04, -0.03]], [0.0125, 0.0112, 0.0098], skin);   // thumb
  B.blob([0.034, -side * 0.038, -0.027], 0.006, 0.006, 0.004, 3, 6, nail);
  for (let i = v0; i < B.v.length; i += VS) { B.v[i] *= HAND_SCALE; B.v[i + 1] *= HAND_SCALE; B.v[i + 2] *= HAND_SCALE; }   // the hand, modelled a little large, brought down to size about the palm
  return new Float32Array(B.v);
}
Object.assign(Engine, {
  // ---- your arms, in first person ----
  // Each hand is the same small model (armMesh) put where it grips and aimed back at an elbow off the bottom of the
  // view: left hand on the rod above the reel, right on the reel's handle (it goes round with it), or reaching to the
  // fish's mouth to unhook it; under or on a fish in your hands; either side of a pot; on the gathered cast net.
  drawArms(gl, Lp) {
    if (!CONFIG.showArms || this.thirdP || this.showMap || this.titleOpen || this.swim) return;
    const P = this.P, A = this.ang, T = this.traps, eo = this.eyeOff || ZERO3, eye = [P.x + eo[0], P.y + eo[1], P.z + EYE + eo[2]];
    const cp = Math.cos(P.pitch), F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)], R = [-Math.sin(P.a), Math.cos(P.a), 0], U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    const at = (d, r, u) => [0, 1, 2].map(k => eye[k] + F[k] * d + R[k] * r + U[k] * u);
    const jobs = [];   // [1 right / -1 left, where the hand is, roll about the forearm]
    const land = A && A.out && A.phase === 'card' && A.land && A.fish ? A.land : null, f = land && A.fish;
    const bent = land && land.st === 'unhook' && !land.big, grab = this.grab, cy = this.carry;
    const rod = !!(A && A.out && A.S && A.hand && !A.holder && !(this.boat && this.boatMode !== 'deck')) && !bent && !grab;
    // both hands down onto a fish on the ground: from where they hang, the hand at its tail end pins it, the other goes to its head (to the hook, or to lift it)
    const onFish = (q, u1, u2, work) => { const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }, mixp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u), half = this.fishLie(q).half, m = this.fishMouth(q);
      const ca = Math.cos(q.a), sa = Math.sin(q.a), hs = ca * R[0] + sa * R[1] >= 0 ? 1 : -1, pin = [q.x - ca * q.len * 0.14, q.y - sa * q.len * 0.14, q.z + half + 0.012], head = work === null ? [q.x + ca * q.len * 0.2, q.y + sa * q.len * 0.2, q.z + half + 0.012] : [m[0], m[1], m[2] + 0.02 + work];
      jobs.push([-hs, mixp(at(0.3, -hs * 0.24, -0.34), pin, sm(u1)), 0.15], [hs, mixp(at(0.3, hs * 0.24, -0.34), head, sm(u2)), work === null ? 0.15 : 0.4]); };
    let pot = null, deck = false;
    if (bent) onFish(f, (land.t - 0.65) / 0.35, (land.t - 0.8) / 0.35, land.t > 1.2 && land.t < 1.95 ? 0.012 * Math.sin(this.time * 24) : 0);   // down first (0.7 s), then the hands
    else if (grab && grab.l) onFish(grab.l.f, (grab.t - 0.42) / 0.28, (grab.t - 0.5) / 0.28, null);
    else if (rod) {
      deck = !!this.boat; const r0 = this.rodPoint(A, [0, 0, 0]), r1 = this.rodPoint(A, [1, 0, 0]), rodDir = [r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]], cyw = Math.cos(A.yaw || 0), syw = Math.sin(A.yaw || 0);
      { const r2 = this.rodPoint(A, [0, 0, 1]); jobs.push([-1, this.rodPoint(A, [-0.13, 0, 0]), 0.3, rodDir, [r2[0] - r0[0], r2[1] - r0[1], r2[2] - r0[2]]]); }   // the rod lies in your left hand: under the handle below the reel, palm up, fingers closed up round it
      { const k = REEL_PARTS[A.S.reel.kind] ? A.S.reel.kind : 'spinning', Pp = REEL_PARTS[k], arm = k === 'conventional' ? 0.065 : k === 'baitcaster' ? 0.035 : 0.05;
        const pv = this.rodPoint(A, Pp.handle), pc = (A.pitch || 0) + (A.reelW ? A.reelW.crank : 0), xr = -arm * Math.sin(pc), zr = arm * Math.cos(pc), cy = cyw, sy = syw, oy = 0.024;
        jobs.push([1, [pv[0] + cy * xr - sy * oy, pv[1] + sy * xr + cy * oy, pv[2] + zr], 0.3, [-sy, cy, 0]]); }   // your right hand closed on the handle's knob, going round with it
    } else if (cy) { const land = cy, f = cy.f;
      if (land.grip === 'lip') { const m = this.fishMouth(f); jobs.push([1, [m[0] + R[0] * 0.02 - F[0] * 0.01, m[1] + R[1] * 0.02 - F[1] * 0.01, m[2] + 0.02], 0.2]); }
      else { const pc = Math.cos(f.pitch || 0), ax = [Math.cos(f.a) * pc, Math.sin(f.a) * pc, Math.sin(f.pitch || 0)], drop = f.len * f.def.body.height * (f.def.body.lie ? 0.13 : 0.46) + 0.028;   // under the belly (a flatfish lies flat: under its thin side): the fingers curl up to it, not into it
        const under = k => [f.x + ax[0] * f.len * k, f.y + ax[1] * f.len * k, f.z + ax[2] * f.len * k - drop], sr = ax[0] * R[0] + ax[1] * R[1] >= 0 ? 1 : -1;
        if (land.grip === 'hand') jobs.push([1, under(0.03 * sr), Math.PI]); else jobs.push([1, under(0.2 * sr), Math.PI], [-1, under(-0.2 * sr), Math.PI]); } }
    else if (T && T.hand && !(A && A.out) && !(T.fly && T.fly.length)) {
      if (T.hand === 'cast_net') jobs.push([1, [P.x + Math.cos(P.a) * 0.6 + R[0] * 0.22, P.y + Math.sin(P.a) * 0.6 + R[1] * 0.22, P.z + 1.37], 0.2]);   // the hub of the gathered net (traps.js: hands())
      else { const data = this.meshData && this.meshData['trap_' + T.hand];   // a pot: held out in front by its two long sides, its top below your eyeline
        if (data) { const Bx = (this._potBox || (this._potBox = {}))[T.hand] || (this._potBox[T.hand] = meshBox(data)), ex = (Bx.hi[0] - Bx.lo[0]) / 2, ey = (Bx.hi[1] - Bx.lo[1]) / 2, turn = ey > ex;   // long axis away from you
            const hx = turn ? ey : ex, hy = turn ? ex : ey, d = 0.34 + hx, top = -0.2, C = at(d, 0, top - (Bx.hi[2] - Bx.lo[2]));
            const rot = P.a + (turn ? Math.PI / 2 : 0), cx = (Bx.lo[0] + Bx.hi[0]) / 2, cyy = (Bx.lo[1] + Bx.hi[1]) / 2, cr = Math.cos(rot), sr = Math.sin(rot);
            pot = { key: 'held:' + T.hand, data, x: C[0] - (cr * cx - sr * cyy), y: C[1] - (sr * cx + cr * cyy), z: C[2] - Bx.lo[2], rot };
            for (const sg of [1, -1]) jobs.push([sg, at(d - hx * 0.35, sg * (hy + 0.012), top - (Bx.hi[2] - Bx.lo[2]) * 0.5), 0]); } }   // by the middle of each side
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
    for (const [sg, G0, roll, bar, under] of jobs) { const S = at(-0.05, sg * 0.21, -0.21), v = [G0[0] - S[0], G0[1] - S[1], G0[2] - S[2]], d0 = Math.hypot(v[0], v[1], v[2]) || 1e-3, d = Math.min(d0, (ARM_UP + ARM_FORE) * 0.985);
      const n = v.map(x => x / d0), G = S.map((x, k) => x + n[k] * d), h = (ARM_UP * ARM_UP - ARM_FORE * ARM_FORE + d * d) / (2 * d), r = Math.sqrt(Math.max(0, ARM_UP * ARM_UP - h * h));
      let q = [0, 1, 2].map(k => -U[k] * 0.8 + R[k] * sg * 0.55 - F[k] * 0.25); const qn = q[0] * n[0] + q[1] * n[1] + q[2] * n[2]; q = q.map((x, k) => x - n[k] * qn); const ql = Math.hypot(q[0], q[1], q[2]) || 1;
      const Eb = S.map((x, k) => x + n[k] * h + q[k] / ql * r), key = sg + ':' + CONFIG.skinColor + CONFIG.sleeveColor, g = this.tackleGpu('arm:' + key, () => armMesh(sg));
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
