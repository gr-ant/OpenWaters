'use strict';
// Engine: the third-person view (prototype): a camera behind and above you, the low-detail angler (models/human.js) posed for
// what you're doing, and the rod in that angler's right hand. Off (this.thirdP false), nothing here runs and the view is first person.
Object.assign(Engine, {
  toggleView() {
    this.thirdP = !this.thirdP; this.camD = 0; this.hPose = null;
    const b = document.getElementById('bView'); if (b) b.querySelector('.ic').innerHTML = uiIcon(this.thirdP ? 'dock.view3' : 'dock.view1');   // the picture shows the view you're in
    this.say(this.thirdP ? 'Third-person view' : 'First-person view', 1.2);
  },
  // the camera: 3.2 m back along the view from just over your head, pulled in so it stays above the ground and on your side of
  // the water surface (above it while you're above, under it while you dive).
  // shortcut: ground and water only, not trees, rocks, boat cabins or cave roofs; upgrade to a sphere cast against those
  camPos(F) {
    const P = this.P, o = [P.x, P.y, P.z + EYE + 0.35]; sample(o[0], o[1]);
    const under = o[2] < SW && hW(SE) < SW, D = 3.2; let d = D;
    for (let s = 0.25; s <= D; s += 0.25) { const x = o[0] - F[0] * s, y = o[1] - F[1] * s, z = o[2] - F[2] * s; sample(x, y); const g = hW(SE), wet = g < SW;
      if (z < g + 0.3 || (wet && (under ? z > SW - 0.2 : z < SW + 0.2))) { d = s - 0.25; break; } }
    this.camD = d < (this.camD || 0) ? d : (this.camD || 0) + (d - (this.camD || 0)) * 0.08;   // in at once when something's in the way, back out gently
    return [o[0] - F[0] * this.camD, o[1] - F[1] * this.camD, o[2] - F[2] * this.camD];
  },
  // per frame, before the rod: what you're doing picks the pose; the stride follows how far you've actually moved
  humanStep(dt) {
    const P = this.P, b = this.boat, A = this.ang, rod = !!(A && A.out), H = HUMAN;
    const lx = b ? this.boatLX || 0 : P.x, ly = b ? this.boatLY || 0 : P.y, mx = lx - (this.hLX ?? lx), my = ly - (this.hLY ?? ly), moved = Math.hypot(mx, my); this.hLX = lx; this.hLY = ly;
    const dist = moved < 3 ? moved : 0, spd = dt > 0 ? dist / dt : 0;   // a jump (travel, boarding) isn't a stride
    // he faces the way he's going (sideways and backwards too: he turns, he doesn't shuffle), turning smoothly; with the rod out, the way you're looking
    const going = dist > 0 && spd > 0.3 && !rod, to = going ? Math.atan2(my, mx) + (b ? b.a : 0) : rod || this.hFace === undefined ? P.a : this.hFace, was = this.hFace ?? P.a;
    this.hFace = was + Math.atan2(Math.sin(to - was), Math.cos(to - was)) * Math.min(1, dt * 10);
    let o, base = P.z, rot = this.hFace;
    if (b) { const D = b.def, helm = this.boatMode !== 'deck', sit = helm || this.boatSit, eye = helm ? D.crew.eye_height_m : sit ? (D.hull.cockpit ? D.crew.eye_height_m : 0.95) : 1.62;
      base = P.z + EYE - eye; if (helm) rot = this.hFace = b.a; else if (sit) rot = this.hFace = P.a;   // feet on the floor (or deck) under the eye the boat code puts you at; at the helm you face the bow
      this.hAmp = (this.hAmp || 0) + (clamp(spd, 0, 1) - (this.hAmp || 0)) * Math.min(1, dt * 8); const L = spd > 0.05 ? spd / (0.9 + 0.32 * Math.min(spd, 2.6)) : 0;   // on deck you walk
      this.hStride = (this.hStride || 0) + (L - (this.hStride || 0)) * Math.min(1, dt * 10); if (this.hStride > 0.02) this.hPh = ((this.hPh || 0) + dist * 6.2832 / this.hStride) % 6.2832;
      o = sit ? { mode: 'sit', hipZ: Math.max(H.foot + 0.05, eye - 0.7), paddle: helm && /paddle|oars/.test(D.propulsion.type) && Math.abs(b.v || 0) > 0.2, rod, ph: this.time * 3 } : { mode: 'stand', swing: this.hAmp, stride: this.hStride, ph: this.hPh, rod }; }
    else if (this.swim) { const go = this.moving; this.hPh = ((this.hPh || 0) + dt * (go ? 3.6 : 1.8)) % 6.2832;   // a breaststroke every 1.75 s
      o = { mode: 'swim', tread: !go, body: go ? -Math.PI / 2 + (this.under ? clamp(P.pitch, -1.2, 1.2) : 0) : -0.25, ph: this.hPh }; }
    else if (this.airH > 0.15 || (this.airH > 0.05 && P.vz > 1)) { this.hAir = P.vz; o = { mode: 'jump', rise: P.vz / CONFIG.jumpSpeed, rod }; }   // off the ground (not just a step down a bank): going up, over the top, coming down
    else { if (this.hAir !== undefined) { this.hCrouch = clamp(-this.hAir / 6, 0.35, 1); this.hAir = undefined; } this.hCrouch = Math.max(0, (this.hCrouch || 0) - dt * 3);   // landed: the knees take it, deeper the harder you came down
      const M = Game.speedMultiplier, gait = clamp((spd / M - 2.6) / 0.8, 0, 1) + clamp((spd / M - 4.2) / 1, 0, 1);   // by how fast you're really going: walk, jog (about 3.4 to 4.2 m/s), run
      this.hGait = (this.hGait || 0) + (gait - (this.hGait || 0)) * Math.min(1, dt * 5); this.hAmp = (this.hAmp || 0) + ((spd > 0.3 ? 1 : 0) - (this.hAmp || 0)) * Math.min(1, dt * 8);
      const g = this.hGait, v = spd / M, rate = g < 1 ? (0.9 + 0.32 * Math.min(v, 2.6)) * (1 - g) + 1.6 * g : 1.6 + 0.15 * (g - 1), L = spd > 0.05 ? v / rate : 0;   // strides a second for this pace, so the ground one stride covers
      this.hStride = (this.hStride || 0) + (L - (this.hStride || 0)) * Math.min(1, dt * 10); if (this.hStride > 0.02) this.hPh = ((this.hPh || 0) + dist / M * 6.2832 / this.hStride) % 6.2832;   // the stride moves on by exactly the ground covered: planted feet don't slide
      o = { mode: 'stand', swing: this.hAmp, gait: g, stride: this.hStride, ph: this.hPh, rod, crouch: this.hCrouch }; }
    if (rod && A.phase === 'charge') { const u = A.stroke == null ? 0 : clamp(A.stroke / 0.26, 0, 1); o.castW = (0.3 + 0.7 * A.charge) * (1 - u); o.castF = u; }   // the cast: wound back as you hold, then the throw
    else if (rod && A.phase === 'flight') o.castF = Math.exp(-(A.t - A.castAt) * 3.2);   // and the follow-through easing off
    if (rod && !A.holder && (A.phase === 'charge' || A.phase === 'fight' || (A.phase === 'flight' && A.t - A.castAt < 0.6) || (A.reelS || 0) > 0.05)) { o.hands2 = true; if (A.reeling || A.phase === 'fight') o.crank = A.crank || 0; }   // both hands to cast; the left one winds
    const pose = humanPose(o), sm = this.hSm;
    if (sm && sm.parts.length === pose.parts.length && dt < 0.2) {   // ease every joint toward where the pose wants it: no snapping when the rod comes up, you speed up or you stop
      const k = Math.min(1, dt * 24), ease = (a, b) => a + (b - a) * k, turn = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
      pose.parts.forEach((q, n) => { const w = sm.parts[n]; for (let j = 1; j < 3; j++) q[j] = ease(w[j], q[j]); q[3] = w[3] + (q[3] - w[3]) * Math.min(1, dt * 60); for (let j = 4; j < 7; j++) q[j] = turn(w[j], q[j]); });   // (height follows faster: the rise and fall of each step should show)
      pose.hand = pose.hand.map((v, j) => ease(sm.hand[j], v)); }
    this.hSm = { mode: o.mode, parts: pose.parts.map(q => q.slice()), hand: pose.hand.slice() };
    if (o.mode === 'swim') base = P.z + EYE - (o.tread ? 0.12 : 0.3) - pose.head[2];   // head where the first-person eye is (treading water), or lying low in the water swimming
    const c = Math.cos(rot), s = Math.sin(rot), w = q => [P.x + c * q[0] - s * q[1], P.y + s * q[0] + c * q[1], base + q[2]];
    this.hPose = { pose, rot, base, w, hand: w(pose.hand) };
  },
  drawHuman(gl, L) {
    const hp = this.hPose; if (!hp) return;
    const M = this._hParts || (this._hParts = humanParts(BUILTIN.angler[0], CLIMATE.key, (BUILTIN.clothes[0] || {}).clothes)), P = this.P; sample(P.x, P.y); const wl = SW, mk = WATER[SK].murk;
    gl.uniform1f(L.u.fsh, 1); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.swm, 0); gl.uniform3fv(L.u.jawP, [0, 0, 0]); gl.uniform1f(L.u.roll, 0);
    for (const q of hp.pose.parts) { const g = this.tackleGpu('human:' + q[0], () => M[q[0]]), p = hp.w([q[1], q[2], q[3]]);
      gl.uniform1f(L.u.roll, q[5]); this.upInst(g, [p[0], p[1], p[2], 1, hp.rot + q[6], 0.5, wl, mk, 0, q[4]]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); }   // roll (a limb out to the side), pitch, then the part's own turn on top of your heading
    gl.uniform1f(L.u.fsh, 0); gl.uniform1f(L.u.roll, 0);
  },
});
