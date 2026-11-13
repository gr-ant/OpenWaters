'use strict';
// Engine: item icons rendered from 3D models, and gem icons.
Object.assign(Engine, {
  // Item icon = a small render of the item's own 3D model (cached per item). Uses the world's lit shader with a studio light.
  itemIcon(id) {
    this.icons = this.icons || {};
    if (this.icons[id]) return this.icons[id];
    const it = ITEMS[id], gl = this.gl, N = 192, m = this.itemMesh(id); if (!m) return null;
    if (!this.iconFb) {
      const fb = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, N, N);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      this.iconFb = fb;
    }
    const v = it.icon3d || (it.icon3d = this.autoIconView(it)), cp = Math.cos(v.pitch), F = [Math.cos(v.yaw) * cp, Math.sin(v.yaw) * cp, Math.sin(v.pitch)], R = [-Math.sin(v.yaw), Math.cos(v.yaw), 0];
    const E = v.target.map((t, i) => t - F[i] * v.dist);
    const U2 = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    const t = Math.tan(v.fov * Math.PI / 360);
    const L = this.lit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.iconFb); gl.viewport(0, 0, N, N);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.useProgram(L.p);
    gl.uniformMatrix4fv(L.u.vp, false, camVP(R, U2, F, E, t, t, 0.1, 50)); gl.uniform3fv(L.u.cam, E); gl.uniform3fv(L.u.sun, norm3([-F[0] + 0.4, -F[1] + 0.3, 0.9]));
    gl.uniform3fv(L.u.fogc, [0, 0, 0]); gl.uniform1f(L.u.far, 1e5); gl.uniform3fv(L.u.lcol, [0.85, 0.85, 0.85]); gl.uniform3fv(L.u.amb, [0.45, 0.45, 0.5]);
    gl.uniform1f(L.u.night, 0); gl.uniform1f(L.u.emk, 0.5); gl.uniform1i(L.u.nfl, 0);
    gl.uniform1f(L.u.inst, 1); gl.uniform1f(L.u.sway, 0);
    gl.uniform1f(L.u.uwf, 0); gl.uniform4f(L.u.seasA, 1, 0, 0, 0); gl.uniform4f(L.u.seasB, 0, 0, 0, 0);   // a summer, dry, above-water look: the icon is kept
    this.upInst(m, [0, 0, 0, 1, 0, 0.5]);   // (not bufferData: that would shrink the buffer the pickups draw from)
    gl.bindVertexArray(m.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, 1); gl.bindVertexArray(null);
    const px = new Uint8Array(N * N * 4); gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.uniform1f(L.u.emk, 1);
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const cx = cv.getContext('2d'), img = cx.createImageData(N, N);
    for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4); // flip rows
    cx.putImageData(img, 0, 0);
    return (this.icons[id] = cv);
  },
  // crystal gem as a shape: elongated hexagonal crystal with a lit and a shaded facet, glowing in its colour
  gemIcon(c, x, y, r, css) {
    c.save(); c.translate(x, y); c.scale(r / 14, r / 14);
    const P = [[0, -15], [7, -7], [6, 10], [0, 15], [-6, 10], [-7, -7]];
    c.shadowColor = css; c.shadowBlur = 14; c.fillStyle = css; c.beginPath(); P.forEach(([a, b], k) => k ? c.lineTo(a, b) : c.moveTo(a, b)); c.closePath(); c.fill();
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, -15); c.lineTo(-7, -7); c.lineTo(-6, 10); c.lineTo(-1.5, 4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.moveTo(0, -15); c.lineTo(7, -7); c.lineTo(6, 10); c.lineTo(1.5, 4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -15); c.lineTo(0, 15); c.stroke();
    c.restore();
  },
});
