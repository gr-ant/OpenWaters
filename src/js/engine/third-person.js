'use strict';
// Engine: the third-person view (prototype): a camera behind and above you, the low-detail angler (models/human.js) posed for
// what you're doing, and the rod in that angler's right hand. Off (this.thirdP false), nothing here runs and the view is first person.
Object.assign(Engine, {
  toggleView() {
    this.thirdP = !this.thirdP; this.camD = 0; this.hPose = null;
    for (const sel of ['#bView .ic', '#hView span']) { const el = document.querySelector(sel); if (el) el.innerHTML = uiIcon(this.thirdP ? 'dock.view3' : 'dock.view1'); }   // the picture (touch rail, desktop dock) shows the view you're in
    this.say(this.thirdP ? 'Third-person view' : 'First-person view', 1.2);
  },
  // how far back the camera sits: the wheel or PgUp / PgDn, 1.2 to 9 m (f < 1 brings it in)
  camZoom(f) { this.camBack = clamp((this.camBack || 3.2) * f, 1.2, 9); },
  // the camera: 3.2 m back (or as zoomed) along the view from just over your head, pulled in so it stays above the ground and on your side of
  // the water surface (above it while you're above, under it while you dive).
  // shortcut: ground and water only, not trees, rocks, boat cabins or cave roofs; upgrade to a sphere cast against those
  camPos(F) {
    const P = this.P, o = [P.x, P.y, P.z + EYE + 0.35]; sample(o[0], o[1]);
    const under = o[2] < SW && hW(SE) < SW, D = this.camBack || 3.2; let d = D;
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
      o = sit ? { mode: 'sit', hipZ: Math.max(H.foot + 0.05, eye - 0.7), paddle: helm && /paddle|oars/.test(D.propulsion.type) && Math.abs(b.v || 0) > 0.2, rod, ph: this.time * 3 } : { mode: 'stand', swing: this.hAmp, stride: this.hStride, ph: this.hPh, rod };
      if (helm && ['outboard', 'inboard'].includes(D.propulsion.type)) {   // driving: both hands on the wheel (or one on the tiller); the right goes to the throttle while the speed is changing
        const S = D._shape, F = D.features, st = clamp(D.crew.seat_at, 0, 1), sx = S.x(st), sy = -(D.crew.seat_side || 0) * S.hb(st), up = b.z - base, hip = o.hipZ, v = b.speed || 0;
        if (Math.abs(v - (this.hBoatV ?? v)) > 0.25 * dt) this.hThr = 0.7; this.hBoatV = v; this.hThr = Math.max(0, (this.hThr || 0) - dt);
        if (F.console) { const cs = F.console, t = cs.at ?? 0.45, x = S.x(t), oy = -(cs.side ?? 0) * S.hb(t), w = Math.min(0.35, S.hb(t) * (cs.side ? 0.25 : 0.45)), top = D.hull.floor_m + (cs.height ?? 0.95), turn = 0.5 * Math.sin(this.time * 0.7) * Math.min(1, Math.abs(v) / 3);   // (the wheel: boat-detail.js)
          o.reachL = [x - 0.23 - sx, oy - 0.13 * Math.cos(turn) - sy, up + top - 0.1 - 0.13 * Math.sin(turn)]; o.reachR = this.hThr > 0 ? [x - 0.125 - sx, oy + w * 0.75 - sy, up + top + 0.165] : [x - 0.23 - sx, oy + 0.13 * Math.cos(turn) - sy, up + top - 0.1 + 0.13 * Math.sin(turn)]; }
        else if (F.cabin) { o.reachL = [0.42, -0.15, hip + 0.32]; o.reachR = this.hThr > 0 ? [0.4, 0.34, hip + 0.4] : [0.42, 0.15, hip + 0.32]; }   // a wheel in the wheelhouse, a throttle beside it
        else o.reachR = [-0.05, 0.3, hip + 0.22 + (this.hThr > 0 ? 0.03 : 0)];   // a tiller beside you, its grip twisted for more or less
      }
      const O = D._oars; if (b.oarOn && O) {   // rowing or paddling: hands on the grips, wherever the stroke has the oars or paddle this frame (oarPose, boats.js)
        const S = D._shape, st = clamp(D.crew.seat_at, 0, 1), sx = S.x(st), sy = -(D.crew.seat_side || 0) * S.hb(st), up = b.z - base, m = this.hOarM || (this.hOarM = new Float32Array(12));
        const at = (sd, q) => { oarPose(D, O, b.oarPh ? b.oarPh[sd > 0 ? 0 : 1] : 0, b.oarK || 0, sd, true, m); return [m[0] * q[0] + m[3] * q[1] + m[6] * q[2] + m[9] - sx, m[1] * q[0] + m[4] * q[1] + m[7] * q[2] + m[10] - sy, m[2] * q[0] + m[5] * q[1] + m[8] * q[2] + m[11] + up]; };   // a point on the oar, boat frame -> the figure's
        if (O.kind === 'oars') { o.reachR = at(1, [0, -0.5, 0]); o.reachL = at(-1, [0, -0.5, 0]); }   // each hand on its oar's handle (the inboard end)
        else if (O.kind === 'double') { o.reachR = at(1, [0, 0.35, 0]); o.reachL = at(1, [0, -0.35, 0]); }   // either side of the middle of the shaft
        else { o.reachR = at(1, [0, 0, 0.15]); o.reachL = at(1, [0, 0, 0.45]); o.twist = 0.4; o.lean = 0.25; }   // single blade: the right hand low on the shaft, the left up it, turned and leaning toward the paddle side
      } }
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
    if (!rod && this.traps && this.traps.act) Object.assign(o, this.traps.act);   // throwing or hauling a net or a pot (fishing/nets-traps.js)
    if (rod && !A.holder && (A.phase === 'charge' || A.phase === 'fight' || (A.phase === 'flight' && A.t - A.castAt < 0.6) || (A.reelS || 0) > 0.05)) { o.hands2 = true; if (A.reeling || A.phase === 'fight') o.crank = A.crank || 0; }   // both hands to cast; the left one winds
    if (rod && !A.holder && A.setT !== undefined && A.t - A.setT < 0.9) { const su = A.t - A.setT; o.castW = Math.max(o.castW || 0, 0.75 * (1 - Math.exp(-su * 30)) * Math.exp(-su * 3.5)); o.hands2 = true; }   // setting the hook: both hands, the rod swept up and back
    const pose = humanPose(o), sm = this.hSm;
    if (sm && sm.parts.length === pose.parts.length && dt < 0.2) {   // ease every joint toward where the pose wants it: no snapping when the rod comes up, you speed up or you stop (rowing: quickly, so the hands keep up with the oars)
      const k = Math.min(1, dt * (this.boat && this.boat.oarOn ? 80 : 24)), ease = (a, b) => a + (b - a) * k, turn = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
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
