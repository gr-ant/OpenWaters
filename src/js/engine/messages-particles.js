'use strict';
// Engine: the message line (say), particle spawning and drawing.
Object.assign(Engine, {
  say(t, secs = 2.5) { this.msg = t; this.msgT = Math.max(0.8, Math.min(secs * 0.5, 0.7 + String(t).length * 0.03, 2.5)); },   // on screen briefly: half the time asked for, no longer than it takes to read, 2.5 s at most
  spawn(k, x, y, z, vx, vy, vz, life, sz, extra) {
    if (this.parts.length >= 6000) return;
    const q = { k, x, y, z, vx, vy, vz, life, max: life, s: sz, seed: Math.random() * 100 };
    if (extra) Object.assign(q, extra);
    this.parts.push(q);
  },
  emitN(rate, dt, fn) { const n = rate * dt; for (let k = 0, m = (n | 0) + (Math.random() < n % 1 ? 1 : 0); k < m; k++) fn(); },
  rnd(a, b) { return a + Math.random() * (b - a); },
  // Particles: smoke/dust (alpha) then glows (additive); depth-tested, no depth writes. Pass 0 draws the ones on the
  // far side of the water surface from the camera (before the water), pass 1 the rest (after it).
  drawParticles(vp, Hh, ty, E, pass) {
    const gl = this.gl, T = this.time, uw = this.uw;
    const mk = () => { // each blend group has its own buffer + VAO (pos3 colour4 size1)
      const ib = gl.createBuffer(), vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28); gl.bindVertexArray(null); return { ib, vao, data: null, cap: 0, a: [] };
    };
    const A = this._pAlp || (this._pAlp = mk()), B = this._pAdd || (this._pAdd = mk()); A.a.length = 0; B.a.length = 0;
    for (const q of this.parts) {
      // The two water passes share the same classification and appearance for this simulation frame. Distant particles need no work.
      const dx = q.x - E[0], dy = q.y - E[1], dz = q.z - E[2];
      if (dx * dx + dy * dy + dz * dz > Math.min(FAR, uw ? 80 : 250) ** 2) continue;
      if (q.renderTime !== T) {
        sample(q.x, q.y); q.renderWet = q.z < SW && hW(SE) < SW;
        q.renderLook = partLook(q, 1 - q.life / q.max, T, q.renderLook); q.renderTime = T;
        if (q.grow) q.renderLook[4] *= Math.min(1, 0.05 + 3 * (1 - q.life / q.max));
      }
      if (q.renderWet !== uw ? pass !== 0 : pass !== 1) continue;
      const c = q.renderLook;
      const near = q.h ? 1 : clamp((Math.hypot(q.x - E[0], q.y - E[1], q.z - E[2]) - 0.4) / 3, 0.04, 1); // stay small right in front of the camera
      (PADD[q.k] ? B : A).a.push(q.x, q.y, q.z, c[0], c[1], c[2], c[3], c[4] * near);
    }
    if (!A.a.length && !B.a.length) return;
    const Pp = this.partP; gl.useProgram(Pp.p); gl.uniformMatrix4fv(Pp.u.vp, false, vp); gl.uniform1f(Pp.u.ph, Hh / (2 * ty)); gl.uniform1f(Pp.u.maxPx, this.maxPx);
    for (const [P_, mode] of [[A, gl.ONE_MINUS_SRC_ALPHA], [B, gl.ONE]]) if (P_.a.length) {
      gl.blendFunc(gl.SRC_ALPHA, mode); this.upInst(P_, P_.a); gl.bindVertexArray(P_.vao); gl.drawArrays(gl.POINTS, 0, P_.a.length / 8);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  },
});
