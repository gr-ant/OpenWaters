'use strict';
// Engine: the third-person view (prototype): a camera behind and above you, the low-detail angler (models/human.js) posed for
// what you're doing, and the rod in that angler's right hand. Off (this.thirdP false), nothing here runs and the view is first person.
Object.assign(Engine, {
  toggleView() {
    this.thirdP = !this.thirdP; this.camD = 0; this.hPose = null;
    const b = document.getElementById('bView'); if (b) b.querySelector('.ic').textContent = this.thirdP ? '3rd' : '1st';
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
    const lx = b ? this.boatLX || 0 : P.x, ly = b ? this.boatLY || 0 : P.y, moved = Math.hypot(lx - (this.hLX ?? lx), ly - (this.hLY ?? ly)); this.hLX = lx; this.hLY = ly;
    const dist = moved < 3 ? moved : 0, spd = dt > 0 ? dist / dt : 0;   // a jump (travel, boarding) isn't a stride
    let o, base = P.z, rot = P.a;
    if (b) { const D = b.def, helm = this.boatMode !== 'deck', sit = helm || this.boatSit, eye = helm ? D.crew.eye_height_m : sit ? (D.hull.cockpit ? D.crew.eye_height_m : 0.95) : 1.62;
      base = P.z + EYE - eye; if (helm) rot = b.a;   // feet on the floor (or deck) under the eye the boat code puts you at; at the helm you face the bow
      this.hAmp = (this.hAmp || 0) + (clamp(spd * 0.5, 0, 0.5) - (this.hAmp || 0)) * Math.min(1, dt * 8); this.hPh = ((this.hPh || 0) + dist * 4.5) % 6.2832;
      o = sit ? { mode: 'sit', hipZ: Math.max(H.foot + 0.05, eye - 0.7), paddle: helm && /paddle|oars/.test(D.propulsion.type) && Math.abs(b.v || 0) > 0.2, rod, ph: this.time * 3 } : { mode: 'stand', swing: this.hAmp, ph: this.hPh, rod }; }
    else if (this.swim) { const go = this.moving; this.hPh = ((this.hPh || 0) + dt * (go ? 3.6 : 1.8)) % 6.2832;   // a breaststroke every 1.75 s
      o = { mode: 'swim', tread: !go, body: go ? -Math.PI / 2 + (this.under ? clamp(P.pitch, -1.2, 1.2) : 0) : -0.25, ph: this.hPh }; }
    else { const run = spd > (CONFIG.walkSpeed + CONFIG.runSpeed) / 2 * Game.speedMultiplier * 0.9;
      this.hAmp = (this.hAmp || 0) + ((spd > 0.3 ? (run ? 1 : 0.55) : 0) - (this.hAmp || 0)) * Math.min(1, dt * 8);
      this.hPh = ((this.hPh || 0) + dist * 6.2832 / (run ? 2.2 : 1.5)) % 6.2832;   // one stride cycle per 1.5 m walking, 2.2 m running
      o = { mode: 'stand', swing: this.hAmp, ph: this.hPh, rod }; }
    const pose = humanPose(o);
    if (o.mode === 'swim') base = P.z + EYE - (o.tread ? 0.12 : 0.3) - pose.head[2];   // head where the first-person eye is (treading water), or lying low in the water swimming
    const c = Math.cos(rot), s = Math.sin(rot), w = q => [P.x + c * q[0] - s * q[1], P.y + s * q[0] + c * q[1], base + q[2]];
    this.hPose = { pose, rot, base, w, hand: w(pose.hand) };
  },
  drawHuman(gl, L) {
    const hp = this.hPose; if (!hp) return;
    const M = this._hParts || (this._hParts = humanParts(BUILTIN.angler[0], CLIMATE.key)), P = this.P; sample(P.x, P.y); const wl = SW, mk = WATER[SK].murk;
    gl.uniform1f(L.u.fsh, 1); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.swm, 0); gl.uniform3fv(L.u.jawP, [0, 0, 0]); gl.uniform1f(L.u.roll, 0);
    for (const q of hp.pose.parts) { const g = this.tackleGpu('human:' + q[0], () => M[q[0]]), p = hp.w([q[1], q[2], q[3]]);
      this.upInst(g, [p[0], p[1], p[2], 1, hp.rot, 0.5, wl, mk, 0, q[4]]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); }
    gl.uniform1f(L.u.fsh, 0);
  },
});
